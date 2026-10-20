package kz.astanaai.activewalk

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import java.io.InputStream
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.Future

internal class PreparedAudioFailure(val code: String) : Exception(code)

/** Pure JVM integrity seam. These checks alone do not establish a playable codec. */
internal object PreparedAudioAssetVerifier {
  const val MAX_BYTES = 100_000_000L
  private val pathPattern = Regex("^astana-audio/([a-f0-9]{64})\\.mp3$")
  private val hashPattern = Regex("^[a-f0-9]{64}$")
  data class Verified(val bytes: Long)

  fun validate(path: String, expectedSha256: String): String {
    val match = pathPattern.matchEntire(path) ?: throw PreparedAudioFailure("INVALID_ASSET_PATH")
    if (!hashPattern.matches(expectedSha256) || match.groupValues[1] != expectedSha256) throw PreparedAudioFailure("SHA256_MISMATCH")
    return "audio-$expectedSha256"
  }

  fun verify(input: InputStream, expectedSha256: String, byteLimit: Long = MAX_BYTES,
             cancelled: () -> Boolean = { Thread.currentThread().isInterrupted }): Verified {
    if (!hashPattern.matches(expectedSha256)) throw PreparedAudioFailure("SHA256_MISMATCH")
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(64 * 1024)
    var bytes = 0L
    while (true) {
      if (cancelled()) throw PreparedAudioFailure("CANCELLED")
      val count = input.read(buffer)
      if (count < 0) break
      if (count == 0) throw PreparedAudioFailure("ASSET_READ_FAILED")
      bytes += count
      if (bytes > byteLimit) throw PreparedAudioFailure("ASSET_TOO_LARGE")
      digest.update(buffer, 0, count)
    }
    if (bytes == 0L) throw PreparedAudioFailure("ASSET_EMPTY")
    val actual = digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
    if (actual != expectedSha256) throw PreparedAudioFailure("ASSET_SHA_MISMATCH")
    return Verified(bytes)
  }
}

/**
 * Main-looper Interface. Only explicit foreground play can start/resume sound.
 * SHA runs off-main over APK asset bytes; no URI, file, network or speech fallback.
 */
class PreparedAudioPlayer(context: Context, private val onState: (Map<String, Any?>) -> Unit) {
  private val application = context.applicationContext
  private val main = Handler(Looper.getMainLooper())
  private val worker = Executors.newSingleThreadExecutor { task -> Thread(task, "PreparedAudioVerify").apply { isDaemon = true } }
  private val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
  private val manager = application.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
  private var player: MediaPlayer? = null
  private var verification: Future<*>? = null
  private var focusRequest: AudioFocusRequest? = null
  private var focusListener: AudioManager.OnAudioFocusChangeListener? = null
  private var receiverRegistered = false
  private var foreground = false
  private var disposed = false
  private var token = 0L
  private var generation = 0L
  private var status = "stopped"
  private var assetId: String? = null
  private var assetPath: String? = null
  private var verifiedHash: String? = null
  private var positionMs = 0
  private var durationMs = 0
  private var errorCode: String? = null
  private val noisy = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY || intent?.action == Intent.ACTION_SCREEN_OFF) {
        if (!disposed) stop()
      }
    }
  }

  init { checkMain() }

  fun play(path: String, expectedSha256: String): Map<String, Any?> {
    checkMain()
    if (disposed) return releasedState()
    val requestedId = try { PreparedAudioAssetVerifier.validate(path, expectedSha256) }
      catch (failure: PreparedAudioFailure) { return fail(failure.code, null) }
    if (!canPlay()) return fail("NOT_FOREGROUND", requestedId)
    if (status == "paused" && assetPath == path && verifiedHash == expectedSha256 && player != null) {
      if (!registerNoisy()) return fail("RECEIVER_UNAVAILABLE", requestedId)
      if (!requestFocus(token)) return fail("AUDIO_FOCUS_DENIED", requestedId)
      try { player!!.start(); status = "playing"; errorCode = null; publish() }
      catch (_: Exception) { return fail("PLAYBACK_START_FAILED", requestedId) }
      return snapshot()
    }
    clearResources()
    assetId = requestedId; assetPath = path; positionMs = 0; durationMs = 0; errorCode = null
    status = "loading"; publish()
    if (!registerNoisy()) return fail("RECEIVER_UNAVAILABLE", requestedId)
    val pendingToken = token
    verification = worker.submit {
      try {
        val checked = application.assets.open(path).use { PreparedAudioAssetVerifier.verify(it, expectedSha256) }
        main.post {
          if (disposed || pendingToken != token) return@post
          if (!canPlay()) { stop(); return@post }
          verifiedHash = expectedSha256
          prepare(path, checked.bytes, pendingToken)
        }
      } catch (failure: Exception) {
        val code = (failure as? PreparedAudioFailure)?.code ?: "ASSET_READ_FAILED"
        main.post { if (!disposed && pendingToken == token) fail(code, requestedId) }
      }
    }
    return snapshot()
  }

  fun pause(): Map<String, Any?> {
    checkMain()
    if (disposed) return snapshot()
    if (status == "loading") {
      clearResources(); status = "paused"; errorCode = null; publish()
    } else if (status == "playing") {
      try { player?.pause(); capturePosition() }
      catch (_: Exception) { return fail("PLAYBACK_PAUSE_FAILED", assetId) }
      abandonFocus(); unregisterNoisy(); status = "paused"; publish()
    }
    return snapshot()
  }

  fun stop(): Map<String, Any?> {
    checkMain()
    clearResources()
    status = "stopped"; assetId = null; assetPath = null; positionMs = 0; durationMs = 0; errorCode = null
    publish()
    return snapshot()
  }

  fun getState(): Map<String, Any?> { checkMain(); return snapshot() }

  fun setForeground(visible: Boolean) {
    checkMain()
    if (disposed) return
    foreground = visible
    if (!visible && status != "stopped") stop()
  }

  fun release() {
    checkMain()
    if (disposed) return
    stop(); disposed = true; foreground = false
    main.removeCallbacksAndMessages(null); worker.shutdownNow()
  }

  private fun prepare(path: String, expectedBytes: Long, pendingToken: Long) {
    checkMain()
    try {
      val media = MediaPlayer(); player = media
      media.setAudioAttributes(attributes)
      media.isLooping = false
      media.setOnPreparedListener {
        if (!current(media, pendingToken)) return@setOnPreparedListener
        if (!canPlay()) { stop(); return@setOnPreparedListener }
        durationMs = media.duration
        if (durationMs <= 0) { fail("AUDIO_DURATION_INVALID", assetId); return@setOnPreparedListener }
        if (!requestFocus(pendingToken)) { fail("AUDIO_FOCUS_DENIED", assetId); return@setOnPreparedListener }
        try { media.start(); status = "playing"; errorCode = null; publish() }
        catch (_: Exception) { fail("PLAYBACK_START_FAILED", assetId) }
      }
      media.setOnCompletionListener {
        if (current(media, pendingToken)) {
          val completedId = assetId; val completedDuration = durationMs
          clearResources(); assetId = completedId; positionMs = completedDuration; durationMs = completedDuration
          status = "stopped"; errorCode = null; publish()
        }
      }
      media.setOnErrorListener { _, _, _ ->
        if (current(media, pendingToken)) fail("MEDIA_ERROR", assetId)
        true
      }
      application.assets.openFd(path).use { descriptor ->
        if (descriptor.length != expectedBytes || descriptor.length <= 0) throw PreparedAudioFailure("ASSET_FD_MISMATCH")
        media.setDataSource(descriptor.fileDescriptor, descriptor.startOffset, descriptor.length)
      }
      media.prepareAsync()
    } catch (failure: Exception) {
      fail((failure as? PreparedAudioFailure)?.code ?: "ASSET_PREPARE_FAILED", assetId)
    }
  }

  private fun current(media: MediaPlayer, pendingToken: Long) = !disposed && pendingToken == token && player === media

  private fun canPlay(): Boolean {
    val power = application.getSystemService(Context.POWER_SERVICE) as? PowerManager
    val keyguard = application.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
    return foreground && !disposed && power?.isInteractive == true && keyguard != null && !keyguard.isKeyguardLocked
  }

  private fun requestFocus(pendingToken: Long): Boolean {
    val audio = manager ?: return false
    lateinit var listener: AudioManager.OnAudioFocusChangeListener
    listener = AudioManager.OnAudioFocusChangeListener { change ->
      main.post {
        if (disposed || token != pendingToken || focusListener !== listener) return@post
        when (change) {
          AudioManager.AUDIOFOCUS_LOSS -> stop()
          AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> pause()
          // GAIN never resumes: speech continues only after explicit Play.
        }
      }
    }
    focusListener = listener
    return try {
      val result = if (Build.VERSION.SDK_INT >= 26) {
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attributes)
          .setWillPauseWhenDucked(true).setAcceptsDelayedFocusGain(false).setOnAudioFocusChangeListener(listener, main).build()
        focusRequest = request; audio.requestAudioFocus(request)
      } else {
        @Suppress("DEPRECATION")
        audio.requestAudioFocus(listener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
      }
      result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    } catch (_: Exception) { false }
  }

  private fun abandonFocus() {
    val request = focusRequest; val listener = focusListener
    focusRequest = null; focusListener = null
    runCatching {
      if (Build.VERSION.SDK_INT >= 26 && request != null) manager?.abandonAudioFocusRequest(request)
      else if (listener != null) {
        @Suppress("DEPRECATION")
        manager?.abandonAudioFocus(listener)
      }
    }
  }

  private fun registerNoisy(): Boolean {
    if (receiverRegistered) return true
    return try {
      val filter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY).apply { addAction(Intent.ACTION_SCREEN_OFF) }
      if (Build.VERSION.SDK_INT >= 33) application.registerReceiver(noisy, filter, Context.RECEIVER_NOT_EXPORTED)
      else {
        @Suppress("DEPRECATION")
        application.registerReceiver(noisy, filter)
      }
      receiverRegistered = true; true
    } catch (_: Exception) { false }
  }

  private fun unregisterNoisy() {
    if (!receiverRegistered) return
    receiverRegistered = false; runCatching { application.unregisterReceiver(noisy) }
  }

  private fun clearResources() {
    token++
    verification?.cancel(true); verification = null
    val media = player; player = null; verifiedHash = null
    runCatching { media?.release() }
    abandonFocus(); unregisterNoisy()
  }

  private fun fail(code: String, failedAssetId: String?): Map<String, Any?> {
    clearResources()
    status = "error"; assetId = failedAssetId; positionMs = 0; durationMs = 0; errorCode = code
    publish(); return snapshot()
  }

  private fun capturePosition() {
    if (status == "playing" || status == "paused") {
      player?.let { media -> runCatching { positionMs = media.currentPosition.coerceIn(0, durationMs.coerceAtLeast(0)) } }
    }
  }

  private fun snapshot(): Map<String, Any?> {
    capturePosition()
    return mapOf("status" to status, "assetId" to assetId, "positionMs" to positionMs, "durationMs" to durationMs,
      "errorCode" to errorCode, "generation" to generation)
  }

  private fun publish() { generation++; if (!disposed) runCatching { onState(snapshot()) } }
  private fun releasedState(): Map<String, Any?> = mapOf("status" to "error", "assetId" to null, "positionMs" to 0,
    "durationMs" to 0, "errorCode" to "PLAYER_RELEASED", "generation" to generation)
  private fun checkMain() { check(Looper.myLooper() == Looper.getMainLooper()) { "PreparedAudioPlayer requires the main looper" } }
}
