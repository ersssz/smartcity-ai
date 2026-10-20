package kz.astanaai.activewalk.narration

import android.app.PendingIntent
import android.app.Service
import android.os.Looper
import android.os.SystemClock
import java.util.UUID

/**
 * Construct once for admitted playback in the real media Service, never in an Activity.
 * Core orchestration is the same Module exercised by public JVM tests.
 * Root supplies native lifecycle visibility, bootstrap/permits/Manifest/GlobalStop.
 * Neither this wrapper nor its core starts GPS or edits canonical SQL.
 */
class NarrationRuntime(
  service: Service,
  visibleClient: (String) -> Boolean,
  smallIcon: Int,
  actionIntents: ScopedMediaIntents,
  sessionActivity: PendingIntent? = null,
  processId: String = UUID.randomUUID().toString(),
) {
  init { checkMain() }
  private val core = AudioRuntimeCore(processId, SystemClock::elapsedRealtime, visibleClient) { current, emit ->
    AndroidNarrationEffects(service, current, emit, smallIcon, actionIntents, sessionActivity)
  }
  fun snapshot(): AudioSnapshot { checkMain(); return core.snapshot() }
  fun play(ref: NarrationRef, capturedScope: AudioScope, clientId: String): AudioTransition {
    checkMain(); return core.play(ref, capturedScope, clientId)
  }
  fun resume(capturedScope: AudioScope, clientId: String): AudioTransition {
    checkMain(); return core.resume(capturedScope, clientId)
  }
  fun pause(capturedScope: AudioScope): AudioTransition { checkMain(); return core.pause(capturedScope) }
  internal fun resumeFromNotification(capturedScope: AudioScope): AudioTransition {
    checkMain(); return core.resumeFromNotification(capturedScope)
  }
  fun stopAudio(): AudioTransition { checkMain(); return core.stopAudio() }
  fun bridgeDestroyed(clientId: String): AudioTransition { checkMain(); return core.bridgeDestroyed(clientId) }
  /** Root's real globalStopAll remains separate; this method is deliberately audio-only. */
  fun taskRemovedAudioOnly(): AudioTransition { checkMain(); return core.taskRemovedAudioOnly() }
  fun subscribe(listener: (AudioSnapshot) -> Unit): () -> Unit {
    checkMain(); val remove = core.subscribe(listener)
    return { checkMain(); remove() }
  }
  fun release(): AudioSnapshot { checkMain(); return core.release() }
  private fun checkMain() { check(Looper.myLooper() == Looper.getMainLooper()) { "Narration runtime requires MAIN" } }
}
