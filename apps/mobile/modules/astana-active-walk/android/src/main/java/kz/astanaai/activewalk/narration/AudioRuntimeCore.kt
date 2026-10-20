package kz.astanaai.activewalk.narration

/** Actual Android interpreter and recording JVM interpreter cross this same seam. */
interface NarrationEffects {
  fun apply(effect: AudioEffect)
  fun positionMs(): Int?
  fun release(): List<String>
}

/** Shared authorization seam for actual MediaSession callbacks and public machine-backed regressions. */
fun mediaSessionCallbackAuthorized(capturedScope: AudioScope, capturedRef: NarrationRef,
  current: AudioSnapshot, sameSession: Boolean, released: Boolean): Boolean =
  !released && sameSession && current.scope == capturedScope && current.ref == capturedRef

/** Single-thread-confined runtime, independent of Android/Expo; no tracking or SQL methods. */
class AudioRuntimeCore(
  processId: String,
  now: () -> Long,
  private val visibleClient: (String) -> Boolean,
  effectsFactory: (() -> AudioSnapshot, (AudioInput) -> Unit) -> NarrationEffects,
) {
  private val machine = BackgroundAudioMachine(processId, now)
  private var disposed = false
  private var closing = false
  private var publishing = false
  private val listeners = mutableMapOf<Long, (AudioSnapshot) -> Unit>()
  private var listenerId = 0L
  private val effects = effectsFactory(machine::snapshot) { accept(it) }
  fun snapshot(): AudioSnapshot {
    if (!disposed && !closing) capturePosition()
    return machine.snapshot()
  }
  fun play(ref: NarrationRef, scope: AudioScope, clientId: String) = accept(AudioInput.Play(ref, scope, visibleClient(clientId), clientId))
  fun resume(scope: AudioScope, clientId: String) = accept(AudioInput.Resume(scope, ResumeOrigin.UI, visibleClient(clientId)))
  fun pause(scope: AudioScope) = accept(AudioInput.Pause(scope))
  fun resumeFromNotification(scope: AudioScope) = accept(AudioInput.Resume(scope, ResumeOrigin.NOTIFICATION, false))
  fun stopAudio() = accept(AudioInput.Stop)
  fun bridgeDestroyed(clientId: String) = accept(AudioInput.BridgeDestroyed(clientId))
  fun taskRemovedAudioOnly() = accept(AudioInput.TaskRemoved)
  fun subscribe(listener: (AudioSnapshot) -> Unit): () -> Unit {
    check(!disposed && !closing); check(listeners.size < 32)
    val id = ++listenerId; listeners[id] = listener
    return { listeners.remove(id); Unit }
  }
  fun release(): AudioSnapshot {
    if (disposed || closing) return machine.snapshot()
    closing = true // Revoke admission BEFORE cleanup or observer code.
    try {
      accept(AudioInput.Release, closingOwner = true)
      val failures = try { effects.release() } catch (_: Exception) { listOf("CLOSE_FAILED") }
      if (failures.isNotEmpty()) machine.dispatch(AudioInput.CleanupFailure(machine.snapshot().scope))
    } finally { disposed = true; listeners.clear() }
    return machine.snapshot()
  }
  private fun accept(input: AudioInput, closingOwner: Boolean = false): AudioTransition {
    if (disposed || closing && !closingOwner) return AudioTransition(machine.snapshot(), rejected = "NARRATION_RUNTIME_RELEASED")
    if (publishing && (input is AudioInput.Play || input is AudioInput.Resume))
      return AudioTransition(machine.snapshot(), rejected = "AUDIO_COMMAND_BUSY")
    if (input is AudioInput.Pause) capturePosition()
    val beforeSequence = machine.snapshot().snapshotSeq
    val result = machine.dispatch(input)
    var cleanupFailed = false
    var platformFailed = false
    for (effect in result.effects) {
      val scope = scope(effect)
      if (scope != null && scope != machine.snapshot().scope) continue
      if (effect is AudioEffect.UpdateSession && effect.snapshot.snapshotSeq != machine.snapshot().snapshotSeq) continue
      if (cleanupFailed && launches(effect)) continue
      try { effects.apply(effect) }
      catch (_: Exception) { if (cleanup(effect)) cleanupFailed = true else platformFailed = true }
    }
    if (cleanupFailed) machine.dispatch(AudioInput.CleanupFailure(machine.snapshot().scope))
    else if (platformFailed) {
      val failed = machine.dispatch(AudioInput.Failure(machine.snapshot().scope, "ANDROID_EFFECT_FAILED"))
      var failedCleanup = false
      failed.effects.forEach { if (runCatching { effects.apply(it) }.isFailure) failedCleanup = true }
      if (failedCleanup) machine.dispatch(AudioInput.CleanupFailure(machine.snapshot().scope))
    }
    if (machine.snapshot().snapshotSeq != beforeSequence && !publishing) {
      publishing = true
      try { listeners.values.toList().forEach { listener -> runCatching { listener(machine.snapshot()) } } }
      finally { publishing = false }
    }
    return AudioTransition(machine.snapshot(), result.effects, result.rejected)
  }
  private fun capturePosition() {
    val state = machine.snapshot()
    if (state.status == AudioStatus.PLAYING) effects.positionMs()?.let { machine.dispatch(AudioInput.Position(state.scope, it)) }
  }
  private fun scope(effect: AudioEffect): AudioScope? = when (effect) {
    is AudioEffect.PromoteForeground -> effect.scope
    is AudioEffect.VerifyAsset -> effect.scope
    is AudioEffect.PreparePlayer -> effect.scope
    is AudioEffect.RequestFocus -> effect.scope
    is AudioEffect.StartPlayer -> effect.scope
    is AudioEffect.UpdateSession -> effect.snapshot.scope
    is AudioEffect.ScheduleIdle -> effect.scope
    else -> null
  }
  private fun launches(effect: AudioEffect) = effect is AudioEffect.PromoteForeground || effect is AudioEffect.VerifyAsset ||
    effect is AudioEffect.PreparePlayer || effect is AudioEffect.RequestFocus || effect is AudioEffect.StartPlayer
  private fun cleanup(effect: AudioEffect) = effect == AudioEffect.CancelJobs || effect == AudioEffect.CancelIdle ||
    effect == AudioEffect.StopPlayer || effect == AudioEffect.ReleaseFocus || effect == AudioEffect.ReleaseWake ||
    effect == AudioEffect.ReleaseSession || effect == AudioEffect.RemoveNotification || effect is AudioEffect.DemoteForeground
}
