package kz.astanaai.activewalk.narration

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import kz.astanaai.activewalk.narration.*
import java.util.UUID

/**
 * Process owner installed on MAIN by the native bridge before explicit user playback.
 * A cold Service/restart/receiver NEVER installs it. No persisted permit, boot receiver or automatic retry.
 */
object NarrationHost {
  @Volatile private var current: NarrationCoordinator? = null
  fun existing(): NarrationCoordinator? = current
  fun createBridge(context: Context, smallIcon: Int, nativeVisible: () -> Boolean,
    onState: (Map<String, Any?>) -> Unit, sessionActivity: PendingIntent? = null): NarrationBridgeFacade {
    checkMain()
    return NarrationBridgeFacade(install(context, smallIcon, sessionActivity), nativeVisible, onState, ::checkMain)
  }
  /** Native global audio-only Stop, including pending Start, without allocating a new owner or touching GPS/SQL. */
  fun stopIfInstalled(): Boolean {
    checkMain(); return current?.stopAudio()?.accepted ?: true
  }
  fun install(context: Context, smallIcon: Int, sessionActivity: PendingIntent? = null): NarrationCoordinator {
    checkMain(); require(smallIcon != 0)
    return current ?: NarrationCoordinator(AndroidHostPlatform(context.applicationContext, smallIcon, sessionActivity),
      SystemClock::elapsedRealtime, { UUID.randomUUID().toString() }, ::checkMain).also { current = it }
  }
  private fun checkMain() { check(Looper.myLooper() == Looper.getMainLooper()) { "Narration host requires MAIN" } }
}

private class AndroidHostPlatform(private val application: Context, private val smallIcon: Int,
  private val sessionActivity: PendingIntent?) : NarrationHostPlatform {
  override fun startService(nonce: String) {
    val intent = Intent(application, NarrationPlaybackService::class.java)
      .setAction(NarrationCoordinator.START_ACTION).putExtra(NarrationPlaybackService.NONCE, nonce)
    if (Build.VERSION.SDK_INT >= 26) application.startForegroundService(intent)
    else application.startService(intent) // API24/25 have no foreground-service start method; no retry fallback.
  }
  override fun stopService(service: Any, startId: Int?) {
    val actual = service as NarrationPlaybackService
    if (startId == null) actual.stopSelf() else actual.stopSelf(startId)
  }
  override fun createRuntime(service: Any, runtimeId: String, visibleClient: (String) -> Boolean): HostedNarrationRuntime =
    AndroidHostedRuntime(service as NarrationPlaybackService, runtimeId, visibleClient, smallIcon, sessionActivity)
}

/** Actual Service owns real frozen runtime; this adapter adds no simulated media/SQL/GPS effects. */
private class AndroidHostedRuntime(service: Service, runtimeId: String, visibleClient: (String) -> Boolean,
  smallIcon: Int, sessionActivity: PendingIntent?) : HostedNarrationRuntime {
  private val intents = NarrationMediaCommands.Intents(service)
  private val delegate = NarrationRuntime(service, visibleClient, smallIcon, intents, sessionActivity, runtimeId)
  private var detach: (() -> Unit)? = null
  private var released = false
  init {
    try { detach = NarrationMediaCommands.attach(delegate) }
    catch (failure: Exception) { runCatching { delegate.release() }; runCatching { intents.close() }; throw failure }
  }
  override fun snapshot() = delegate.snapshot()
  override fun play(ref: NarrationRef, scope: AudioScope, clientId: String) = delegate.play(ref, scope, clientId)
  override fun pause(scope: AudioScope) = delegate.pause(scope)
  override fun resume(scope: AudioScope, clientId: String) = delegate.resume(scope, clientId)
  override fun stopAudio() = delegate.stopAudio()
  override fun bridgeDestroyed(clientId: String) = delegate.bridgeDestroyed(clientId)
  override fun subscribe(listener: (AudioSnapshot) -> Unit) = delegate.subscribe(listener)
  override fun release(): AudioSnapshot {
    if (released) return delegate.snapshot()
    released = true
    var failure = false
    // Close routing first; each independent cleanup is still attempted if another fails.
    if (runCatching { detach?.invoke(); detach = null }.isFailure) failure = true
    val state = runCatching { delegate.release() }.getOrElse { failure = true; delegate.snapshot() }
    if (runCatching { intents.close() }.isFailure) failure = true
    return if (failure) state.copy(status = AudioStatus.ERROR, errorCode = "AUDIO_CLEANUP_FAILED", canResume = false) else state
  }
}

/**
 * Root adoption must declare exported=false, foregroundServiceType=mediaPlayback and actual permissions.
 * START_NOT_STICKY, no binder/browser API. Invalid starts never autoplay; an admitted live owner ignores them.
 */
class NarrationPlaybackService : Service() {
  companion object { const val NONCE = "nativeStartNonce" }
  private var owner: NarrationCoordinator? = null
  private var ownerRegistered = false
  private var bootstrapReady = false
  override fun onCreate() {
    super.onCreate()
    // Android 12 can crash even an immediately stopped FGS-started service if it
    // never acknowledged startForeground. This passive OS acknowledgment is not
    // a Play permit: no runtime, MediaSession, actions, player, focus or wake lock.
    bootstrapReady = runCatching { acknowledgeForeground() }.isSuccess
    owner = NarrationHost.existing()
    ownerRegistered = owner?.onServiceCreated(this) == true
    if (!bootstrapReady) {
      if (ownerRegistered) owner?.onServiceBootstrapFailed(this) else stopSelf()
      return
    }
    if (!ownerRegistered) stopSelf()
  }
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val existing = owner
    if (!bootstrapReady || !ownerRegistered || existing == null) { stopSelf(startId); return START_NOT_STICKY }
    val parsed = runCatching {
      val extras = intent?.extras
      val valid = intent?.component?.className == javaClass.name && intent.action == NarrationCoordinator.START_ACTION &&
        extras?.keySet() == setOf(NONCE) && intent.data == null && intent.categories == null
      if (valid) intent!!.getStringExtra(NONCE)?.takeIf { it.length in 1..128 } else null
    }.getOrNull()
    existing.consumeStart(this, startId, intent?.action, parsed)
    return START_NOT_STICKY
  }
  override fun onTaskRemoved(rootIntent: Intent?) {
    owner?.taskRemoved(this) // Deliberately audio-only; Root owns any real global Walk Stop/SQL coordinator.
    super.onTaskRemoved(rootIntent)
  }
  override fun onDestroy() {
    try { owner?.onServiceDestroyed(this) }
    finally {
      owner = null; ownerRegistered = false; bootstrapReady = false
      // Scoped to this Service; never cancel a potentially shared notification ID.
      try { stopForeground(STOP_FOREGROUND_REMOVE) }
      finally { super.onDestroy() }
    }
  }
  private fun acknowledgeForeground() {
    val notifications = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26) notifications.createNotificationChannel(NotificationChannel(
      AndroidNarrationEffects.CHANNEL_ID, "AstGeo narration", NotificationManager.IMPORTANCE_LOW))
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, AndroidNarrationEffects.CHANNEL_ID)
      else Notification.Builder(this)
    val preparing = when (resources.configuration.locales.get(0)?.language) {
      "kk" -> "Дыбыстау дайындалуда…"; "en" -> "Preparing narration…"; else -> "Подготовка озвучки…"
    }
    val notification = builder.setSmallIcon(android.R.drawable.ic_media_play).setContentTitle("AstGeo")
      .setContentText(preparing).setCategory(Notification.CATEGORY_SERVICE)
      .setOnlyAlertOnce(true).setOngoing(true).setVisibility(Notification.VISIBILITY_PRIVATE).build()
    if (Build.VERSION.SDK_INT >= 29) startForeground(AndroidNarrationEffects.NOTIFICATION_ID, notification,
      ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    else startForeground(AndroidNarrationEffects.NOTIFICATION_ID, notification)
  }
}
