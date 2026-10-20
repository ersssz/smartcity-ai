package kz.astanaai.activewalk.narration

data class AudioScope(val processId: String, val playbackEpoch: Long)
data class NarrationRef(val walkSessionId: String, val bundleSha256: String, val narrationId: String,
  val locale: String, val assetPath: String, val assetSha256: String)
enum class AudioStatus { STOPPED, LOADING, PLAYING, PAUSED, ERROR }
enum class LoadStep { FOREGROUND, VERIFY, PREPARE, FOCUS, START }
enum class ResumeOrigin { UI, MEDIA_SESSION, NOTIFICATION }
enum class FocusLoss { TRANSIENT, DUCK, PERMANENT }
data class AudioSnapshot(val scope: AudioScope, val snapshotSeq: Long = 0, val status: AudioStatus = AudioStatus.STOPPED,
  val ref: NarrationRef? = null, val ownerClientId: String? = null, val positionMs: Int = 0,
  val durationMs: Int = 0, val step: LoadStep? = null, val pausedReason: String? = null,
  val pausedDeadlineMs: Long? = null, val serviceForeground: Boolean = false, val canResume: Boolean = false,
  val errorCode: String? = null)
sealed interface AudioInput {
  data class Play(val ref: NarrationRef, val expectedScope: AudioScope, val visible: Boolean, val clientId: String) : AudioInput
  data class Resume(val expectedScope: AudioScope, val origin: ResumeOrigin, val visible: Boolean) : AudioInput
  data class Pause(val expectedScope: AudioScope) : AudioInput
  data object Stop : AudioInput
  data object Release : AudioInput
  data class ForegroundResult(val scope: AudioScope, val granted: Boolean) : AudioInput
  data class Verified(val scope: AudioScope, val bytes: Long) : AudioInput
  data class Prepared(val scope: AudioScope, val durationMs: Int) : AudioInput
  data class FocusResult(val scope: AudioScope, val granted: Boolean) : AudioInput
  data class Started(val scope: AudioScope) : AudioInput
  data class Position(val scope: AudioScope, val positionMs: Int) : AudioInput
  data class Failure(val scope: AudioScope, val code: String) : AudioInput
  data class CleanupFailure(val scope: AudioScope) : AudioInput
  data class Completed(val scope: AudioScope) : AudioInput
  data class Noisy(val scope: AudioScope) : AudioInput
  data class LostFocus(val scope: AudioScope, val kind: FocusLoss) : AudioInput
  data object GainedFocus : AudioInput
  data class Visibility(val visible: Boolean) : AudioInput
  data class BridgeDestroyed(val clientId: String) : AudioInput
  data object TaskRemoved : AudioInput
  data class ServiceDestroyed(val scope: AudioScope) : AudioInput
  data class IdleDeadline(val scope: AudioScope) : AudioInput
}
sealed interface AudioEffect {
  data object CancelJobs : AudioEffect
  data object StopPlayer : AudioEffect
  data object ReleaseFocus : AudioEffect
  data object ReleaseWake : AudioEffect
  data object ReleaseSession : AudioEffect
  data object RemoveNotification : AudioEffect
  data object CancelIdle : AudioEffect
  data class DemoteForeground(val keepNotification: Boolean) : AudioEffect
  data class PromoteForeground(val scope: AudioScope, val ref: NarrationRef) : AudioEffect
  data class VerifyAsset(val scope: AudioScope, val ref: NarrationRef) : AudioEffect
  data class PreparePlayer(val scope: AudioScope, val ref: NarrationRef, val bytes: Long, val positionMs: Int) : AudioEffect
  data class RequestFocus(val scope: AudioScope) : AudioEffect
  data class StartPlayer(val scope: AudioScope) : AudioEffect
  data class UpdateSession(val snapshot: AudioSnapshot) : AudioEffect
  data class ScheduleIdle(val scope: AudioScope, val deadlineMs: Long) : AudioEffect
}
data class AudioTransition(val snapshot: AudioSnapshot, val effects: List<AudioEffect> = emptyList(), val rejected: String? = null)

/** Staging only. Public reducer seam; Android effects are interpreted by one native owner. */
class BackgroundAudioMachine(processId: String, private val now: () -> Long) {
  private var state = AudioSnapshot(AudioScope(processId, 0))
  private var released = false
  fun snapshot(): AudioSnapshot = state
  fun dispatch(input: AudioInput): AudioTransition {
    if (released && input !is AudioInput.CleanupFailure) return reject("NARRATION_RUNTIME_RELEASED")
    return when (input) {
    is AudioInput.Play -> when {
      input.expectedScope != state.scope -> reject("STALE_AUDIO_SCOPE")
      !input.visible -> reject("NOT_FOREGROUND")
      !valid(input.ref) || input.clientId.isBlank() || input.clientId.length > 128 -> reject("INVALID_NARRATION_REF")
      else -> begin(input.ref, input.clientId, 0, 0)
    }
    is AudioInput.Resume -> when {
      input.expectedScope != state.scope -> reject("STALE_AUDIO_SCOPE")
      state.status != AudioStatus.PAUSED || !state.canResume || state.ref == null -> reject("OPEN_APP_REQUIRED")
      input.origin == ResumeOrigin.UI && !input.visible -> reject("NOT_FOREGROUND")
      state.pausedDeadlineMs == null || now() >= state.pausedDeadlineMs!! -> stop()
      else -> begin(state.ref!!, state.ownerClientId!!, state.positionMs, state.durationMs)
    }
    is AudioInput.Pause -> if (input.expectedScope != state.scope) reject("STALE_AUDIO_SCOPE") else pause("USER")
    AudioInput.Stop -> stop()
    AudioInput.Release -> { released = true; stop() }
    is AudioInput.ForegroundResult -> if (!current(input.scope, LoadStep.FOREGROUND)) unchanged()
      else if (!input.granted) fail("FOREGROUND_START_DENIED")
      else commit(state.copy(step = LoadStep.VERIFY, serviceForeground = true),
        listOf(AudioEffect.VerifyAsset(state.scope, state.ref!!)))
    is AudioInput.Verified -> if (!current(input.scope, LoadStep.VERIFY)) unchanged()
      else if (input.bytes !in 1..100_000_000L) fail("ASSET_SIZE_INVALID")
      else commit(state.copy(step = LoadStep.PREPARE),
        listOf(AudioEffect.PreparePlayer(state.scope, state.ref!!, input.bytes, state.positionMs)))
    is AudioInput.Prepared -> if (!current(input.scope, LoadStep.PREPARE)) unchanged()
      else if (input.durationMs <= 0) fail("AUDIO_DURATION_INVALID")
      else commit(state.copy(step = LoadStep.FOCUS, durationMs = input.durationMs,
        positionMs = state.positionMs.coerceIn(0, input.durationMs)), listOf(AudioEffect.RequestFocus(state.scope)))
    is AudioInput.FocusResult -> if (!current(input.scope, LoadStep.FOCUS)) unchanged()
      else if (!input.granted) fail("AUDIO_FOCUS_DENIED")
      else commit(state.copy(step = LoadStep.START), listOf(AudioEffect.StartPlayer(state.scope)))
    is AudioInput.Started -> if (!current(input.scope, LoadStep.START)) unchanged()
      else commit(state.copy(status = AudioStatus.PLAYING, step = null), listOf(AudioEffect.CancelJobs))
    is AudioInput.Position -> if (input.scope != state.scope || state.status !in listOf(AudioStatus.PLAYING, AudioStatus.PAUSED)) unchanged()
      else {
        val position = input.positionMs.coerceIn(0, state.durationMs.coerceAtLeast(0))
        if (position == state.positionMs) unchanged() else commit(state.copy(positionMs = position), updateSession = false)
      }
    is AudioInput.Failure -> if (input.scope != state.scope) unchanged()
      else fail(if (Regex("^[A-Z0-9_]{1,100}$").matches(input.code)) input.code else "MEDIA_ERROR")
    is AudioInput.CleanupFailure -> if (input.scope != state.scope) unchanged() else commit(state.copy(
      status = AudioStatus.ERROR, canResume = false, errorCode = "AUDIO_CLEANUP_FAILED"), updateSession = false)
    is AudioInput.Completed -> if (input.scope != state.scope || state.status != AudioStatus.PLAYING) unchanged() else stop()
    is AudioInput.Noisy -> if (input.scope == state.scope) pause("NOISY") else unchanged()
    is AudioInput.LostFocus -> if (input.scope == state.scope) pause("FOCUS_${input.kind.name}") else unchanged()
    AudioInput.GainedFocus -> unchanged() // Explicit Resume is the only path back to sound.
    is AudioInput.Visibility -> unchanged() // A foreground-owned service continues the selected asset.
    is AudioInput.BridgeDestroyed -> if (input.clientId == state.ownerClientId) stop() else unchanged()
    AudioInput.TaskRemoved -> stop()
    is AudioInput.ServiceDestroyed -> if (input.scope == state.scope) stop() else unchanged()
    is AudioInput.IdleDeadline -> if (input.scope == state.scope && state.status == AudioStatus.PAUSED &&
      state.pausedDeadlineMs != null && now() >= state.pausedDeadlineMs!!) stop() else unchanged()
    }
  }

  private fun begin(ref: NarrationRef, clientId: String, positionMs: Int, durationMs: Int): AudioTransition {
    val next = AudioSnapshot(nextScope(), state.snapshotSeq, AudioStatus.LOADING, ref, clientId,
      positionMs, durationMs, LoadStep.FOREGROUND)
    return commit(next, cleanup() + AudioEffect.PromoteForeground(next.scope, ref))
  }

  private fun pause(reason: String): AudioTransition {
    if (state.status !in listOf(AudioStatus.PLAYING, AudioStatus.LOADING) || state.ref == null) return unchanged()
    val next = state.copy(scope = nextScope(), status = AudioStatus.PAUSED, step = null,
      pausedReason = reason, pausedDeadlineMs = Math.addExact(now(), 600_000L),
      serviceForeground = false, canResume = true, errorCode = null)
    return commit(next, listOf(AudioEffect.CancelJobs, AudioEffect.CancelIdle, AudioEffect.StopPlayer,
      AudioEffect.ReleaseFocus, AudioEffect.ReleaseWake, AudioEffect.DemoteForeground(true),
      AudioEffect.ScheduleIdle(next.scope, next.pausedDeadlineMs!!)))
  }

  private fun stop(): AudioTransition = commit(AudioSnapshot(nextScope(), state.snapshotSeq), cleanup(), updateSession = false)
  private fun fail(code: String): AudioTransition = commit(state.copy(scope = nextScope(),
    status = AudioStatus.ERROR, step = null, pausedReason = null, pausedDeadlineMs = null,
    canResume = false, serviceForeground = false, errorCode = code), cleanup(), updateSession = false)
  private fun nextScope() = AudioScope(state.scope.processId, Math.addExact(state.scope.playbackEpoch, 1))
  private fun current(scope: AudioScope, step: LoadStep) = scope == state.scope && state.status == AudioStatus.LOADING && state.step == step
  private fun unchanged() = AudioTransition(state)
  private fun reject(code: String) = AudioTransition(state, rejected = code)
  private fun cleanup() = listOf(AudioEffect.CancelJobs, AudioEffect.CancelIdle, AudioEffect.StopPlayer,
    AudioEffect.ReleaseFocus, AudioEffect.ReleaseWake, AudioEffect.DemoteForeground(false),
    AudioEffect.RemoveNotification, AudioEffect.ReleaseSession)
  private fun commit(next: AudioSnapshot, effects: List<AudioEffect> = emptyList(), updateSession: Boolean = true): AudioTransition {
    // Commit RAM before exposing any effect. Stop can therefore invalidate already queued work.
    state = next.copy(snapshotSeq = Math.addExact(state.snapshotSeq, 1))
    return AudioTransition(state, if (updateSession) effects + AudioEffect.UpdateSession(state) else effects)
  }
  private fun valid(ref: NarrationRef): Boolean {
    val hash = Regex("^[a-f0-9]{64}$")
    return ref.walkSessionId.isNotBlank() && ref.walkSessionId.length <= 128 &&
      hash.matches(ref.bundleSha256) && ref.narrationId.length in 1..160 &&
      Regex("^[a-zA-Z0-9:_-]+$").matches(ref.narrationId) && ref.locale in listOf("ru", "kk", "en") &&
      ref.narrationId.endsWith(":${ref.locale}") && hash.matches(ref.assetSha256) &&
      ref.assetPath == "astana-audio/${ref.assetSha256}.mp3"
  }
}
