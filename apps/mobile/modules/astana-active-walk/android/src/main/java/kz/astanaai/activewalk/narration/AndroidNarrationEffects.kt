package kz.astanaai.activewalk.narration

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.MediaPlayer
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import java.util.concurrent.Executors
import java.util.concurrent.Future
import kz.astanaai.activewalk.PreparedAudioAssetVerifier

enum class AudioTransportAction { RESUME, PAUSE, STOP_AUDIO }
fun interface ScopedMediaIntents {
  /** Root host supplies explicit immutable intents to a non-exported, scope-validating receiver. */
  fun create(action: AudioTransportAction, scope: AudioScope): PendingIntent
}

/**
 * Real Android effect interpreter owned by the narration Service.
 * The host must serialize dispatch on MAIN, commit RAM first, then apply effects.
 * Service bootstrap/permit, native bridge and canonical SQL pause are separate Root seams.
 */
class AndroidNarrationEffects(
  private val service: Service,
  private val current: () -> AudioSnapshot,
  private val dispatch: (AudioInput) -> Unit,
  private val smallIcon: Int,
  private val actionIntents: ScopedMediaIntents,
  private val sessionActivity: PendingIntent? = null,
) : NarrationEffects {
  private val main = Handler(Looper.getMainLooper())
  private val executor = Executors.newSingleThreadExecutor { task -> Thread(task, "NarrationVerify").apply { isDaemon = true } }
  private val manager = service.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val notifications = service.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  private val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
  private var verification: Future<*>? = null
  private var media: MediaPlayer? = null
  private var session: MediaSession? = null
  private var focus: AudioFocusRequest? = null
  private var focusListener: AudioManager.OnAudioFocusChangeListener? = null
  private var idle: Runnable? = null
  private var loadDeadline: Runnable? = null
  private var noisyRegistered = false
  private var released = false
  private val noisy = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY && !released) {
        capturePosition(); dispatch(AudioInput.Noisy(current().scope))
      }
    }
  }

  companion object {
    const val NOTIFICATION_ID = 73092
    const val CHANNEL_ID = "astana-narration"
    const val LOAD_DEADLINE_MS = 20_000L
  }

  /** Never run this on a raw JS thread. Exceptions are explicit failures, not fallback. */
  override fun apply(effect: AudioEffect) {
    checkMain(); check(!released) { "NARRATION_ADAPTER_RELEASED" }
    when (effect) {
      AudioEffect.CancelJobs -> cancelJobs()
      AudioEffect.StopPlayer -> releasePlayer()
      AudioEffect.ReleaseFocus -> releaseFocus()
      AudioEffect.ReleaseWake -> check(media == null) { "WAKE_RELEASE_NOT_CONFIRMED" }
      AudioEffect.ReleaseSession -> { session?.release(); session = null; unregisterNoisy() }
      AudioEffect.RemoveNotification -> notifications.cancel(NOTIFICATION_ID)
      AudioEffect.CancelIdle -> { idle?.let(main::removeCallbacks); idle = null }
      is AudioEffect.DemoteForeground -> service.stopForeground(if (effect.keepNotification) Service.STOP_FOREGROUND_DETACH else Service.STOP_FOREGROUND_REMOVE)
      is AudioEffect.PromoteForeground -> promote(effect)
      is AudioEffect.VerifyAsset -> verify(effect)
      is AudioEffect.PreparePlayer -> prepare(effect)
      is AudioEffect.RequestFocus -> requestFocus(effect.scope)
      is AudioEffect.StartPlayer -> start(effect.scope)
      is AudioEffect.UpdateSession -> updateSession(effect.snapshot)
      is AudioEffect.ScheduleIdle -> {
        idle?.let(main::removeCallbacks)
        val task = Runnable { if (!released) dispatch(AudioInput.IdleDeadline(effect.scope)) }
        idle = task; main.postDelayed(task, (effect.deadlineMs - SystemClock.elapsedRealtime()).coerceAtLeast(0))
      }
    }
  }

  /** The host calls this before pause/focus/noisy/stop to capture actual player position. */
  fun capturePosition() {
    checkMain()
    val state = current()
    if (state.status == AudioStatus.PLAYING) media?.let { player ->
      runCatching { player.currentPosition }.getOrNull()?.let { dispatch(AudioInput.Position(state.scope, it)) }
    }
  }

  override fun positionMs(): Int? {
    checkMain()
    return media?.let { player -> runCatching { player.currentPosition }.getOrNull() }
  }

  /** Host onDestroy must call this, including when JS no longer exists. */
  override fun release(): List<String> {
    checkMain(); if (released) return emptyList()
    released = true // Revoke callbacks before cleanup can fail.
    val failures = mutableListOf<String>()
    fun clean(code: String, task: () -> Unit) { if (runCatching(task).isFailure) failures.add(code) }
    clean("VERIFY_CLEANUP_FAILED", ::cancelJobs)
    clean("PLAYER_CLEANUP_FAILED", ::releasePlayer)
    clean("FOCUS_CLEANUP_FAILED", ::releaseFocus)
    clean("NOISY_CLEANUP_FAILED", ::unregisterNoisy)
    clean("SESSION_CLEANUP_FAILED") { session?.release(); session = null }
    clean("FOREGROUND_CLEANUP_FAILED") { service.stopForeground(Service.STOP_FOREGROUND_REMOVE) }
    clean("NOTIFICATION_CLEANUP_FAILED") { notifications.cancel(NOTIFICATION_ID) }
    main.removeCallbacksAndMessages(null); executor.shutdownNow()
    return failures
  }

  private fun promote(effect: AudioEffect.PromoteForeground) {
    if (!alive(effect.scope)) return
    try {
      check(smallIcon != 0) { "A media notification needs a real application icon" }
      if (Build.VERSION.SDK_INT >= 26) notifications.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "AstanaAI narration", NotificationManager.IMPORTANCE_LOW))
      createSession(effect.scope, effect.ref)
      val notification = notification(current())
      if (Build.VERSION.SDK_INT >= 29) service.startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      else service.startForeground(NOTIFICATION_ID, notification)
      registerNoisy()
      loadDeadline?.let(main::removeCallbacks)
      val deadline = Runnable { if (alive(effect.scope)) dispatch(AudioInput.Failure(effect.scope, "PREPARE_TIMEOUT")) }
      loadDeadline = deadline; main.postDelayed(deadline, LOAD_DEADLINE_MS)
      post(AudioInput.ForegroundResult(effect.scope, true))
    } catch (_: Exception) { post(AudioInput.ForegroundResult(effect.scope, false)) }
  }

  private fun verify(effect: AudioEffect.VerifyAsset) {
    if (!alive(effect.scope)) return
    verification = executor.submit {
      try {
        // Reuse the frozen 0.4 policy, including exact path/hash and actual byte limits.
        PreparedAudioAssetVerifier.validate(effect.ref.assetPath, effect.ref.assetSha256)
        val checked = service.assets.open(effect.ref.assetPath).use {
          PreparedAudioAssetVerifier.verify(it, effect.ref.assetSha256)
        }
        post(AudioInput.Verified(effect.scope, checked.bytes))
      } catch (_: Exception) { post(AudioInput.Failure(effect.scope, "ASSET_VERIFY_FAILED")) }
    }
  }

  private fun prepare(effect: AudioEffect.PreparePlayer) {
    if (!alive(effect.scope)) return
    try {
      val player = MediaPlayer(); media = player
      player.setAudioAttributes(attributes)
      player.setWakeMode(service.applicationContext, PowerManager.PARTIAL_WAKE_LOCK)
      player.isLooping = false
      player.setOnPreparedListener {
        if (!validPlayer(player, effect.scope)) return@setOnPreparedListener
        val duration = player.duration
        if (duration <= 0) { post(AudioInput.Failure(effect.scope, "AUDIO_DURATION_INVALID")); return@setOnPreparedListener }
        val retainedPosition = effect.positionMs.coerceIn(0, duration)
        if (retainedPosition > 0) {
          player.setOnSeekCompleteListener {
            if (validPlayer(player, effect.scope)) {
              player.setOnSeekCompleteListener(null)
              post(AudioInput.Prepared(effect.scope, duration))
            }
          }
          @Suppress("DEPRECATION")
          player.seekTo(retainedPosition)
        } else post(AudioInput.Prepared(effect.scope, duration))
      }
      player.setOnCompletionListener { if (validPlayer(player, effect.scope)) post(AudioInput.Completed(effect.scope)) }
      player.setOnErrorListener { _, _, _ ->
        if (validPlayer(player, effect.scope)) post(AudioInput.Failure(effect.scope, "MEDIA_ERROR"))
        true
      }
      service.assets.openFd(effect.ref.assetPath).use { descriptor ->
        check(descriptor.length == effect.bytes && descriptor.length > 0) { "ASSET_FD_MISMATCH" }
        player.setDataSource(descriptor.fileDescriptor, descriptor.startOffset, descriptor.length)
      }
      player.prepareAsync()
    } catch (_: Exception) { post(AudioInput.Failure(effect.scope, "ASSET_PREPARE_FAILED")) }
  }

  private fun requestFocus(scope: AudioScope) {
    if (!alive(scope)) return
    lateinit var listener: AudioManager.OnAudioFocusChangeListener
    listener = AudioManager.OnAudioFocusChangeListener { change -> main.post {
      if (!alive(scope) || focusListener !== listener) return@post
      capturePosition()
      when (change) {
        AudioManager.AUDIOFOCUS_LOSS -> dispatch(AudioInput.LostFocus(scope, FocusLoss.PERMANENT))
        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> dispatch(AudioInput.LostFocus(scope, FocusLoss.TRANSIENT))
        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> dispatch(AudioInput.LostFocus(scope, FocusLoss.DUCK))
        AudioManager.AUDIOFOCUS_GAIN -> dispatch(AudioInput.GainedFocus)
      }
    } }
    focusListener = listener
    val granted = try {
      val result = if (Build.VERSION.SDK_INT >= 26) {
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attributes)
          .setWillPauseWhenDucked(true).setAcceptsDelayedFocusGain(false).setOnAudioFocusChangeListener(listener, main).build()
        focus = request; manager.requestAudioFocus(request)
      } else {
        @Suppress("DEPRECATION")
        manager.requestAudioFocus(listener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
      }
      result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    } catch (_: Exception) { false }
    post(AudioInput.FocusResult(scope, granted))
  }

  private fun start(scope: AudioScope) {
    if (!alive(scope)) return
    try { checkNotNull(media).start(); post(AudioInput.Started(scope)) }
    catch (_: Exception) { post(AudioInput.Failure(scope, "PLAYBACK_START_FAILED")) }
  }

  private fun createSession(scope: AudioScope, ref: NarrationRef) {
    session?.release()
    val selected = MediaSession(service, "AstanaNarration")
    session = selected
    // Android 12's broadcast-receiver overload dereferences a null ComponentName in
    // system_server despite its nullable annotation. The PendingIntent overload has
    // an explicit null-clear path and keeps process-death playback restart disabled.
    @Suppress("DEPRECATION")
    selected.setMediaButtonReceiver(null)
    selected.setPlaybackToLocal(attributes)
    sessionActivity?.let(selected::setSessionActivity)
    selected.isActive = true
    updateSession(current())
  }

  private fun updateSession(state: AudioSnapshot) {
    val selected = session ?: return
    val capturedRef = state.ref ?: return
    val capturedScope = state.scope
    fun authorized() = mediaSessionCallbackAuthorized(capturedScope, capturedRef, current(), session === selected, released)
    // New controls follow the current epoch; a queued old callback never borrows current().scope.
    selected.setCallback(object : MediaSession.Callback() {
      override fun onPlay() { if (authorized()) dispatch(AudioInput.Resume(capturedScope, ResumeOrigin.MEDIA_SESSION, false)) }
      override fun onPause() { if (authorized()) { capturePosition(); dispatch(AudioInput.Pause(capturedScope)) } }
      override fun onStop() { if (authorized()) dispatch(AudioInput.Stop) } // Audio-only, never TrackingLease.
    }, main)
    val status = when (state.status) {
      AudioStatus.PLAYING -> PlaybackState.STATE_PLAYING
      AudioStatus.PAUSED -> PlaybackState.STATE_PAUSED
      AudioStatus.LOADING -> PlaybackState.STATE_BUFFERING
      AudioStatus.ERROR -> PlaybackState.STATE_ERROR
      AudioStatus.STOPPED -> PlaybackState.STATE_STOPPED
    }
    val actions = PlaybackState.ACTION_STOP or when (state.status) {
      AudioStatus.PAUSED -> PlaybackState.ACTION_PLAY
      AudioStatus.PLAYING -> PlaybackState.ACTION_PAUSE
      else -> 0L
    }
    selected.setPlaybackState(PlaybackState.Builder().setState(status, state.positionMs.toLong(),
      if (state.status == AudioStatus.PLAYING) 1f else 0f, SystemClock.elapsedRealtime()).setActions(actions).build())
    selected.setMetadata(MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, "AstanaAI")
      .putString(MediaMetadata.METADATA_KEY_ARTIST, when (state.ref?.locale) { "ru" -> "Озвучка прогулки"; "kk" -> "Серуен дыбыстауы"; else -> "Walk narration" })
      .putLong(MediaMetadata.METADATA_KEY_DURATION, state.durationMs.toLong()).build())
    notifications.notify(NOTIFICATION_ID, notification(state))
  }

  private fun notification(state: AudioSnapshot): Notification {
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(service, CHANNEL_ID) else Notification.Builder(service)
    builder.setSmallIcon(smallIcon).setContentTitle("AstanaAI").setContentText(when (state.ref?.locale) {
      "ru" -> "Озвучка прогулки"; "kk" -> "Серуен дыбыстауы"; else -> "Walk narration"
    }).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE)
      .setOngoing(state.status == AudioStatus.LOADING || state.status == AudioStatus.PLAYING)
    val paused = state.status == AudioStatus.PAUSED
    val primaryAction = if (paused) AudioTransportAction.RESUME else AudioTransportAction.PAUSE
    val primary = actionIntents.create(primaryAction, state.scope)
    val stop = actionIntents.create(AudioTransportAction.STOP_AUDIO, state.scope)
    if (Build.VERSION.SDK_INT >= 31) check(primary.isImmutable && stop.isImmutable) { "MUTABLE_MEDIA_INTENT" }
    val primaryLabel = when (state.ref?.locale) {
      "ru" -> if (paused) "Продолжить звук" else "Пауза"
      "kk" -> if (paused) "Дыбысты жалғастыру" else "Кідірту"
      else -> if (paused) "Resume audio" else "Pause"
    }
    val stopLabel = when (state.ref?.locale) { "ru" -> "Остановить звук"; "kk" -> "Дыбысты тоқтату"; else -> "Stop audio" }
    @Suppress("DEPRECATION")
    builder.addAction(if (paused) android.R.drawable.ic_media_play else android.R.drawable.ic_media_pause, primaryLabel, primary)
    @Suppress("DEPRECATION")
    builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, stopLabel, stop)
    // Standard media Stop is audio-only. Root's explicit Walk Stop is a separate action.
    session?.sessionToken?.let { builder.setStyle(Notification.MediaStyle().setMediaSession(it).setShowActionsInCompactView(0, 1)) }
    sessionActivity?.let(builder::setContentIntent)
    return builder.build()
  }

  private fun cancelJobs() {
    verification?.cancel(true); verification = null
    loadDeadline?.let(main::removeCallbacks); loadDeadline = null
  }
  private fun releasePlayer() {
    val player = media; media = null
    player?.release() // MediaPlayer's own wake lock is released with the player.
  }
  private fun releaseFocus() {
    val oldRequest = focus; val oldListener = focusListener
    focus = null; focusListener = null
    if (Build.VERSION.SDK_INT >= 26 && oldRequest != null) manager.abandonAudioFocusRequest(oldRequest)
    else if (oldListener != null) {
      @Suppress("DEPRECATION")
      manager.abandonAudioFocus(oldListener)
    }
  }
  private fun registerNoisy() {
    if (noisyRegistered) return
    val filter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
    if (Build.VERSION.SDK_INT >= 33) service.registerReceiver(noisy, filter, Context.RECEIVER_NOT_EXPORTED)
    else {
      @Suppress("DEPRECATION")
      service.registerReceiver(noisy, filter)
    }
    noisyRegistered = true
  }
  private fun unregisterNoisy() {
    if (!noisyRegistered) return
    noisyRegistered = false; service.unregisterReceiver(noisy)
  }
  private fun alive(scope: AudioScope) = !released && current().scope == scope
  private fun validPlayer(player: MediaPlayer, scope: AudioScope) = alive(scope) && media === player
  private fun post(input: AudioInput) { main.post { if (!released) dispatch(input) } }
  private fun checkMain() { check(Looper.myLooper() == Looper.getMainLooper()) { "Narration effects require MAIN" } }
}
