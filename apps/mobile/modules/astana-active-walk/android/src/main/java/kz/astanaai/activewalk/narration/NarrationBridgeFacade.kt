package kz.astanaai.activewalk.narration

/** Root's Expo bridge adapter. Capture is a pure publication read; all commands run on MAIN. */
class NarrationBridgeFacade internal constructor(
  private val coordinator: NarrationCoordinator,
  nativeVisible: () -> Boolean,
  onState: (Map<String, Any?>) -> Unit,
  private val checkMain: () -> Unit = {},
) {
  init { checkMain() }
  @Volatile private var closed = false
  private val helper = NarrationBridgeHelper(coordinator, nativeVisible)
  private val unsubscribe = helper.subscribe { state -> if (!closed) onState(stateDto(state)) }

  /** Sync JS-thread-safe. No player/lifecycle/Activity read and no fresh permission minted here. */
  fun captureScopeDto(): Map<String, Any?> {
    check(!closed) { "NARRATION_BRIDGE_CLOSED" }
    val capture = helper.capture()
    return mapOf("host" to hostDto(capture.host), "audio" to capture.audio?.let(::audioDto))
  }
  fun getState(): Map<String, Any?> { checkMain(); return stateDto(if (closed) coordinator.snapshot() else coordinator.observe()) }
  fun play(captured: Map<String, Any?>, ref: Map<String, Any?>): Map<String, Any?> {
    checkMain(); return receipt(if (closed) refused() else helper.play(captured, ref))
  }
  fun pause(captured: Map<String, Any?>): Map<String, Any?> = control(captured, false)
  fun resume(captured: Map<String, Any?>): Map<String, Any?> = control(captured, true)
  fun stop(): Map<String, Any?> { checkMain(); return receipt(if (closed) refused() else helper.stopAudio()) }
  fun close(): Map<String, Any?> {
    checkMain(); if (closed) return receipt(refused())
    closed = true // Revoke own event/command admission before cleanup and any reentrant observers.
    unsubscribe()
    return receipt(helper.close())
  }
  private fun control(captured: Map<String, Any?>, resume: Boolean): Map<String, Any?> {
    checkMain(); if (closed) return receipt(refused())
    val scope = NarrationBridgeParser.scope(captured) ?: return receipt(HostCommandReceipt(false, coordinator.snapshot(), "INVALID_CAPTURED_SCOPE"))
    return receipt(if (resume) helper.resume(scope) else helper.pause(scope))
  }
  private fun refused() = HostCommandReceipt(false, coordinator.snapshot(), "CLIENT_CLOSED")
  private fun receipt(value: HostCommandReceipt): Map<String, Any?> =
    mapOf("accepted" to value.accepted, "rejected" to value.rejected, "state" to stateDto(value.state))
  private fun hostDto(scope: HostScope) = mapOf("processNonce" to scope.processNonce, "requestEpoch" to scope.requestEpoch)
  private fun audioDto(scope: AudioScope) = mapOf("processId" to scope.processId, "playbackEpoch" to scope.playbackEpoch)
  private fun stateDto(state: HostSnapshot): Map<String, Any?> {
    val audio = state.audio
    val error = state.errorCode ?: audio?.errorCode
    val status = when {
      error != null -> "error"
      else -> audio?.status?.name?.lowercase() ?: "stopped"
    }
    return mapOf("status" to status, "assetId" to audio?.ref?.let { "audio-${it.assetSha256}" },
      "positionMs" to (audio?.positionMs ?: 0), "durationMs" to (audio?.durationMs ?: 0), "errorCode" to error,
      "generation" to state.eventSequence, "hostScope" to hostDto(state.hostScope),
      "audioScope" to audio?.takeIf { state.phase == HostPhase.RUNNING }?.scope?.let(::audioDto),
      "hostPhase" to state.phase.name, "canResume" to (state.phase == HostPhase.RUNNING && audio?.canResume == true),
      "pausedReason" to audio?.pausedReason, "serviceForeground" to (audio?.serviceForeground == true),
      "ref" to audio?.ref?.let { mapOf("walkSessionId" to it.walkSessionId, "bundleSha256" to it.bundleSha256,
        "narrationId" to it.narrationId, "locale" to it.locale, "assetPath" to it.assetPath, "assetSha256" to it.assetSha256) })
  }
}
