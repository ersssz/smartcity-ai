package kz.astanaai.activewalk.narration

import kz.astanaai.activewalk.narration.*
import java.math.BigDecimal

private val HASH = "a".repeat(64)
private val REF = NarrationRef("walk-1", HASH, "chapter:one:ru", "ru", "astana-audio/$HASH.mp3", HASH)
private class RecordingPlatform : NarrationHostPlatform {
  val starts = mutableListOf<String>()
  val stopped = mutableListOf<Any>()
  val runtimes = mutableListOf<RecordingRuntime>()
  var onStart: () -> Unit = {}
  var onStop: () -> Unit = {}
  var onCreateRuntime: () -> Unit = {}
  override fun startService(nonce: String) { starts.add(nonce); onStart() }
  override fun stopService(service: Any, startId: Int?) { stopped.add(service); onStop() }
  override fun createRuntime(service: Any, runtimeId: String, visibleClient: (String) -> Boolean): HostedNarrationRuntime =
    RecordingRuntime(runtimeId, visibleClient).also { runtimes.add(it); onCreateRuntime() }
}
private class RecordingRuntime(runtimeId: String, visibleClient: (String) -> Boolean) : HostedNarrationRuntime {
  val effects = mutableListOf<AudioEffect>()
  var emit: (AudioInput) -> Unit = {}
  var releaseFails = false
  var position: Int? = null
  private val core = AudioRuntimeCore(runtimeId, { 1000L }, visibleClient) { _, send ->
    emit = send
    object : NarrationEffects {
      override fun apply(effect: AudioEffect) { effects.add(effect) }
      override fun positionMs(): Int? = position
      override fun release() = if (releaseFails) listOf("RECORDED_CLEANUP_FAILED") else emptyList<String>()
    }
  }
  override fun snapshot() = core.snapshot()
  override fun play(ref: NarrationRef, scope: AudioScope, clientId: String) = core.play(ref, scope, clientId)
  override fun pause(scope: AudioScope) = core.pause(scope)
  override fun resume(scope: AudioScope, clientId: String) = core.resume(scope, clientId)
  override fun stopAudio() = core.stopAudio()
  override fun bridgeDestroyed(clientId: String) = core.bridgeDestroyed(clientId)
  override fun subscribe(listener: (AudioSnapshot) -> Unit) = core.subscribe(listener)
  override fun release() = core.release()
  fun playing() {
    val scope = snapshot().scope
    emit(AudioInput.ForegroundResult(scope, true)); emit(AudioInput.Verified(scope, 1000))
    emit(AudioInput.Prepared(scope, 20_000)); emit(AudioInput.FocusResult(scope, true)); emit(AudioInput.Started(scope))
  }
}
private class Scenario {
  val platform = RecordingPlatform(); var time = 1000L; var id = 0; var visible = true; var visibilityReads = 0
  val host = NarrationCoordinator(platform, { time }, { "host-${++id}" })
  val client = host.registerClient { visibilityReads++; visible }
  fun play() = host.play(client, host.snapshot().hostScope,
    host.snapshot().audio?.takeIf { host.snapshot().phase == HostPhase.RUNNING }?.scope, REF)
  fun start(): Any {
    check(play().accepted); val service = Any(); check(host.onServiceCreated(service))
    check(host.consumeStart(service, 1, NarrationCoordinator.START_ACTION, platform.starts.last()).admitted)
    return service
  }
}

fun main() {
  val platform = RecordingPlatform(); var sequence = 0
  val host = NarrationCoordinator(platform, { 1000L }, { "id-${++sequence}" })
  val client = host.registerClient { true }; val captured = host.snapshot().hostScope
  val first = host.play(client, captured, null, REF)
  check(first.accepted) { "A visible explicit Play must issue a cold one-use start" }
  check(first.state.phase == HostPhase.STARTING && first.state.audio == null)
  check(first.state.hostScope.requestEpoch == 1L)
  check(platform.starts.size == 1)
  check(!host.play(client, captured, null, REF).accepted) { "A second old capture must be stale immediately" }
  check(platform.starts.size == 1)
  val stop = host.stopAudio()
  check(stop.accepted && stop.state.hostScope.requestEpoch == 2L && stop.state.pendingRequestId == null) { "Stop must revoke the permit before Service exists" }
  val lateService = Any(); host.onServiceCreated(lateService)
  val late = host.consumeStart(lateService, 1, "kz.astanaai.narration.START", platform.starts.single())
  check(!late.admitted && late.state.audio == null)
  check(platform.stopped.contains(lateService))
  val secondPlatform = RecordingPlatform()
  val second = NarrationCoordinator(secondPlatform, { 1000L }, { "id-${++sequence}" })
  val owner = second.registerClient { true }; val service = Any()
  second.play(owner, second.snapshot().hostScope, null, REF); second.onServiceCreated(service)
  val admitted = second.consumeStart(service, 1, "kz.astanaai.narration.START", secondPlatform.starts.single())
  check(admitted.admitted && admitted.state.phase == HostPhase.RUNNING) { "A current one-use native permit must create exactly one runtime" }
  check(admitted.state.audio?.status == AudioStatus.LOADING)
  check(secondPlatform.runtimes.size == 1)
  var count = 3
  fun test(name: String, body: () -> Unit) { body(); count++; println("PASS HOST $name") }
  test("snapshot never consults visibility or starts Android work") {
    val x = Scenario(); repeat(10) { x.host.snapshot() }; check(x.visibilityReads == 0 && x.platform.starts.isEmpty())
  }
  test("hidden or forged client cannot issue a permit") {
    val x = Scenario(); x.visible = false; check(x.play().rejected == "NOT_FOREGROUND")
    val stranger = NativeClientHandle(x.client.id)
    check(x.host.play(stranger, x.host.snapshot().hostScope, null, REF).rejected == "CLIENT_CLOSED")
    check(x.platform.starts.isEmpty() && x.host.snapshot().hostScope.requestEpoch == 0L)
  }
  test("visible at gesture but background before consume never autoplays") {
    val x = Scenario(); x.play(); x.visible = false; val service = Any(); x.host.onServiceCreated(service)
    check(x.host.consumeStart(service, 1, NarrationCoordinator.START_ACTION, x.platform.starts.single()).rejected == "NOT_FOREGROUND")
    check(x.platform.runtimes.isEmpty() && x.platform.stopped.contains(service))
  }
  test("expired native permit stops an unadmitted Service without runtime") {
    val x = Scenario(); x.play(); x.time = 11_000; val service = Any(); x.host.onServiceCreated(service)
    check(x.host.consumeStart(service, 1, NarrationCoordinator.START_ACTION, x.platform.starts.single()).rejected == "START_EXPIRED")
    check(x.platform.runtimes.isEmpty())
  }
  test("null restart and malformed action have no runtime") {
    for (action in listOf(null, "other")) {
      val x = Scenario(); val service = Any(); x.host.onServiceCreated(service)
      check(!x.host.consumeStart(service, 1, action, null).admitted)
      check(x.platform.runtimes.isEmpty() && x.platform.stopped.contains(service))
    }
  }
  test("single-use duplicate or null intent cannot replace or stop a legitimate live owner") {
    val x = Scenario(); val service = x.start(); val nonce = x.platform.starts.single()
    val old = x.platform.runtimes.single(); old.playing()
    val before = x.host.snapshot()
    check(!x.host.consumeStart(service, 2, NarrationCoordinator.START_ACTION, nonce).admitted)
    check(!x.host.consumeStart(service, 3, null, null).admitted)
    check(old.snapshot().status == AudioStatus.PLAYING && x.platform.runtimes.size == 1)
    check(x.host.snapshot() == before && x.platform.stopped.isEmpty())
  }
  test("warm admitted Play immediately invalidates two old captures") {
    val x = Scenario(); x.start(); val captured = x.host.snapshot()
    check(x.host.play(x.client, captured.hostScope, captured.audio!!.scope, REF).accepted)
    check(x.host.snapshot().hostScope.requestEpoch == 2L)
    check(x.host.play(x.client, captured.hostScope, captured.audio.scope, REF).rejected == "STALE_HOST_SCOPE")
    check(x.platform.starts.size == 1)
  }
  test("Stop rejects fresh reentrant listener and permits a later explicit gesture") {
    val x = Scenario(); var nested: HostCommandReceipt? = null
    x.host.subscribe(x.client) { state -> if (state.hostScope.requestEpoch == 2L) nested = x.host.play(x.client, state.hostScope, null, REF) }
    x.play(); x.host.stopAudio()
    check(nested?.rejected == "SERVICE_CLOSING")
    check(x.platform.starts.size == 1)
    check(x.play().accepted && x.platform.starts.size == 2)
  }
  test("Stop during runtime factory cancels before any sound effects") {
    val x = Scenario(); x.play(); val service = Any(); x.host.onServiceCreated(service)
    x.platform.onCreateRuntime = { x.host.stopAudio() }
    check(!x.host.consumeStart(service, 1, NarrationCoordinator.START_ACTION, x.platform.starts.single()).admitted)
    check(x.platform.runtimes.single().effects.none { it is AudioEffect.PromoteForeground || it is AudioEffect.StartPlayer })
  }
  test("Service destruction uses new opaque runtime lifetime even in same process") {
    val x = Scenario(); val service = x.start(); val first = x.host.snapshot(); val old = x.platform.runtimes.single()
    x.host.onServiceDestroyed(service); val nextService = x.start(); val secondState = x.host.snapshot()
    check(first.hostScope.processNonce == secondState.hostScope.processNonce)
    check(first.audio!!.scope.processId != secondState.audio!!.scope.processId)
    check(first.audio.scope.playbackEpoch == 1L && secondState.audio.scope.playbackEpoch == 1L)
    val stable = x.host.snapshot(); x.host.onServiceDestroyed(service)
    check(x.host.snapshot() == stable && old.snapshot().status == AudioStatus.STOPPED)
    check(x.host.play(x.client, stable.hostScope, first.audio.scope, REF).rejected == "STALE_AUDIO_SCOPE")
    check(!x.platform.stopped.contains(nextService))
  }
  test("old bridge destruction cannot cancel new client pending or current audio") {
    val x = Scenario(); x.play(); val newer = x.host.registerClient { true }
    check(x.host.play(newer, x.host.snapshot().hostScope, null, REF).accepted)
    x.host.detachClient(x.client); check(x.host.snapshot().phase == HostPhase.STARTING)
    val service = Any(); x.host.onServiceCreated(service)
    check(x.host.consumeStart(service, 1, NarrationCoordinator.START_ACTION, x.platform.starts.last()).admitted)
    val before = x.host.snapshot(); x.host.detachClient(x.client); check(x.host.snapshot() == before)
    x.host.detachClient(newer); check(x.host.snapshot().phase == HostPhase.STOPPING)
  }
  test("pending owner destruction cancels before Service and no restart is invented") {
    val x = Scenario(); x.play(); val nonce = x.platform.starts.single(); x.host.detachClient(x.client)
    val service = Any(); x.host.onServiceCreated(service)
    check(!x.host.consumeStart(service, 1, NarrationCoordinator.START_ACTION, nonce).admitted)
    check(x.platform.runtimes.isEmpty() && x.platform.starts.size == 1)
  }
  test("same-process old service cannot steal newer pending permit") {
    val x = Scenario(); val current = x.start(); val stranger = Any()
    check(!x.host.onServiceCreated(stranger))
    val before = x.host.snapshot()
    check(x.host.consumeStart(stranger, 2, NarrationCoordinator.START_ACTION, x.platform.starts.single()).rejected == "STALE_SERVICE")
    check(x.host.snapshot() == before && !x.platform.stopped.contains(current))
  }
  test("Stop is unconditional while old scoped pause and resume are refused") {
    val x = Scenario(); x.start(); val old = x.host.snapshot(); x.play()
    check(x.host.pause(x.client, old.hostScope, old.audio!!.scope).rejected == "STALE_HOST_SCOPE")
    check(x.host.resume(x.client, x.host.snapshot().hostScope, old.audio.scope).rejected == "STALE_AUDIO_SCOPE")
    check(x.host.stopAudio().accepted && x.host.snapshot().audio?.status == AudioStatus.STOPPED)
  }
  test("pause retains selected chapter in RAM and bridge destruction releases it") {
    val x = Scenario(); x.start(); x.platform.runtimes.single().playing(); val playing = x.host.snapshot()
    check(x.host.pause(x.client, playing.hostScope, playing.audio!!.scope).accepted)
    check(x.host.snapshot().audio?.status == AudioStatus.PAUSED)
    check(x.host.snapshot().audio?.serviceForeground == false)
    x.host.detachClient(x.client); check(x.host.snapshot().audio?.ref == null)
  }
  test("asynchronous completion closes Service instead of starting another chapter") {
    val x = Scenario(); val service = x.start(); val runtime = x.platform.runtimes.single(); runtime.playing()
    runtime.emit(AudioInput.Completed(runtime.snapshot().scope))
    check(x.host.snapshot().phase == HostPhase.STOPPING && x.platform.stopped.contains(service))
    check(x.platform.starts.size == 1 && x.host.snapshot().audio?.ref == null)
  }
  test("start failure clears permit with no fallback or retry") {
    val x = Scenario(); x.platform.onStart = { error("recorded platform denied") }
    check(x.play().rejected == "SERVICE_START_FAILED")
    check(x.host.snapshot().pendingRequestId == null && x.platform.runtimes.isEmpty() && x.platform.starts.size == 1)
  }
  test("foreground bootstrap failure revokes pending Start before cleanup without creating a runtime or retry") {
    val x = Scenario(); check(x.play().accepted); val service = Any(); val nonce = x.platform.starts.single()
    check(x.host.onServiceCreated(service)); val before = x.host.snapshot().hostScope
    x.platform.onStop = {
      check(x.host.snapshot().pendingRequestId == null)
      check(x.host.snapshot().hostScope != before)
      check(x.host.snapshot().errorCode == "FOREGROUND_BOOTSTRAP_FAILED")
    }
    check(x.host.onServiceBootstrapFailed(service))
    check(x.platform.runtimes.isEmpty() && x.platform.starts.size == 1 && x.platform.stopped.contains(service))
    check(x.host.snapshot().phase == HostPhase.STOPPING && x.host.snapshot().audio == null)
    check(x.host.consumeStart(service, 1, NarrationCoordinator.START_ACTION, nonce).rejected == "SERVICE_CLOSING")
    check(x.platform.runtimes.isEmpty() && x.platform.starts.size == 1)
    check(x.host.snapshot().errorCode == "FOREGROUND_BOOTSTRAP_FAILED")
  }
  test("foreign bootstrap failure cannot revoke a legitimate live owner or its scoped playback") {
    val x = Scenario(); val service = x.start(); x.platform.runtimes.single().playing()
    val before = x.host.snapshot(); val stranger = Any()
    check(!x.host.onServiceBootstrapFailed(stranger))
    check(x.host.snapshot() == before && !x.platform.stopped.contains(service))
    check(x.platform.stopped.contains(stranger) && x.platform.runtimes.single().snapshot().status == AudioStatus.PLAYING)
  }
  test("bootstrap failure publishes revoked authority before reentrant observers and survives destruction as a fixed error") {
    val x = Scenario(); check(x.play().accepted); val service = Any(); check(x.host.onServiceCreated(service))
    var attempted = false
    x.host.subscribe(x.client) { state -> if (state.errorCode == "FOREGROUND_BOOTSTRAP_FAILED") {
      attempted = true; check(x.host.play(x.client, state.hostScope, null, REF).rejected == "SERVICE_CLOSING")
    } }
    check(x.host.onServiceBootstrapFailed(service)); check(attempted && x.platform.runtimes.isEmpty())
    x.host.onServiceDestroyed(service)
    check(x.host.snapshot().phase == HostPhase.ERROR && x.host.snapshot().errorCode == "FOREGROUND_BOOTSTRAP_FAILED")
    check(x.host.snapshot().pendingRequestId == null && x.platform.starts.size == 1)
  }
  test("cleanup failure is visible and prevents unsafe new admission") {
    val x = Scenario(); val service = x.start(); x.platform.runtimes.single().releaseFails = true
    check(!x.host.stopAudio().accepted)
    check(x.host.snapshot().errorCode == "HOST_CLEANUP_FAILED" && x.platform.stopped.contains(service))
    x.host.onServiceDestroyed(service)
    check(x.play().rejected == "HOST_CLEANUP_REQUIRED")
  }
  test("host publication rejects recursive Play without infinite no-op publication") {
    val x = Scenario(); var attempts = 0
    x.host.subscribe(x.client) { state -> attempts++; check(!x.host.play(x.client, state.hostScope, null, REF).accepted) }
    check(x.play().accepted); check(attempts == 1 && x.platform.starts.size == 1)
  }
  test("a rejected warm handover preserves the actual old owner") {
    val x = Scenario(); x.start(); x.platform.runtimes.single().playing()
    var checks = 0; val newer = x.host.registerClient { ++checks == 1 }
    val captured = x.host.snapshot()
    check(x.host.play(newer, captured.hostScope, captured.audio!!.scope, REF).rejected == "NOT_FOREGROUND")
    x.host.detachClient(x.client)
    check(x.host.snapshot().phase == HostPhase.STOPPING && x.platform.runtimes.single().snapshot().ref == null) {
      "The real owner's destroyed bridge must stop its audio even after another client's rejected Play"
    }
  }
  test("reentrant Service destruction during Stop cannot leave a permanent closing owner") {
    val x = Scenario(); val service = x.start()
    x.platform.onStop = { x.host.onServiceDestroyed(service) }
    x.host.stopAudio()
    check(x.host.snapshot().phase == HostPhase.ABSENT) { "An acknowledged destruction must clear the exact Service lease" }
    check(x.play().accepted)
  }
  test("cancelled runtime factory still reports a failed independent cleanup") {
    val x = Scenario(); x.play(); val service = Any(); x.host.onServiceCreated(service)
    x.platform.onCreateRuntime = { x.platform.runtimes.last().releaseFails = true; x.host.stopAudio() }
    check(!x.host.consumeStart(service, 1, NarrationCoordinator.START_ACTION, x.platform.starts.single()).admitted)
    check(x.host.snapshot().errorCode == "HOST_CLEANUP_FAILED") { "Cancellation must not hide the candidate's failed cleanup" }
  }
  test("bridge Play uses the captured gesture scope and never refreshes after Stop") {
    val x = Scenario(); val bridge = NarrationBridgeHelper(x.host) { true }
    val captured = bridge.capture(); bridge.stopAudio()
    check(bridge.play(captured, REF).rejected == "STALE_HOST_SCOPE")
    check(x.platform.starts.isEmpty())
    check(bridge.play(bridge.capture(), REF).accepted)
    bridge.close(); check(x.host.snapshot().pendingRequestId == null)
    check(bridge.play(bridge.capture(), REF).rejected == "CLIENT_CLOSED")
  }
  test("capture on a non-MAIN reader touches no lifecycle and cannot start service") {
    val p = RecordingPlatform(); var onMain = true; var n = 0; var visibleReads = 0
    val host = NarrationCoordinator(p, { 1000L }, { "thread-${++n}" }, { check(onMain) { "MAIN required" } })
    val bridge = NarrationBridgeHelper(host) { visibleReads++; true }
    onMain = false; val captured = bridge.capture(); bridge.snapshot()
    check(visibleReads == 0 && p.starts.isEmpty())
    check(runCatching { bridge.play(captured, REF) }.isFailure)
    check(visibleReads == 0 && p.starts.isEmpty())
  }
  test("strict bridge rejects unknown DTO fields paths and mismatched content hash") {
    val x = Scenario(); val bridge = NarrationBridgeHelper(x.host) { true }; val captured = bridge.capture()
    val scope = mapOf<String, Any?>("host" to mapOf("processNonce" to captured.host.processNonce, "requestEpoch" to 0.0), "audio" to null)
    val ref = mapOf<String, Any?>("walkSessionId" to REF.walkSessionId, "bundleSha256" to HASH,
      "narrationId" to REF.narrationId, "locale" to "ru", "assetPath" to REF.assetPath, "assetSha256" to HASH)
    check(bridge.play(scope + ("visible" to true), ref).rejected == "INVALID_CAPTURED_SCOPE")
    for (path in listOf("https://example.invalid/a.mp3", "../a.mp3", "astana-audio/${"b".repeat(64)}.mp3"))
      check(bridge.play(scope, ref + ("assetPath" to path)).rejected == "INVALID_NARRATION_REF")
    check(bridge.play(scope, ref + ("fallbackTts" to true)).rejected == "INVALID_NARRATION_REF")
    check(x.platform.starts.isEmpty())
    check(bridge.play(scope, ref).accepted)
  }
  test("serialized scopes reject NaN infinity fraction unsafe integers and arbitrary Number types") {
    for (number in listOf(Double.NaN, Double.POSITIVE_INFINITY, -1.0, 1.5, 9_007_199_254_740_992.0, BigDecimal("1.00000000000000000000001"))) {
      val source = mapOf<String, Any?>("host" to mapOf("processNonce" to "id-1", "requestEpoch" to number), "audio" to null)
      check(NarrationBridgeParser.scope(source) == null) { "Invalid epoch accepted: $number" }
    }
  }
  test("another Stop never relabels uncertain cleanup as successful stopped") {
    val x = Scenario(); val service = x.start(); x.platform.runtimes.single().releaseFails = true
    x.host.stopAudio(); x.host.onServiceDestroyed(service)
    check(!x.host.stopAudio().accepted)
    check(x.host.snapshot().phase == HostPhase.ERROR && x.host.snapshot().errorCode == "HOST_CLEANUP_FAILED")
    check(x.play().rejected == "HOST_CLEANUP_REQUIRED")
  }
  test("an admitted Play revokes the old capture before the Android start boundary") {
    val x = Scenario(); val old = x.host.snapshot().hostScope; var observed = false
    x.platform.onStart = {
      observed = true
      check(x.host.snapshot().hostScope.requestEpoch == 1L)
      check(!x.host.play(x.client, old, null, REF).accepted)
      x.host.stopAudio()
    }
    check(x.host.play(x.client, old, null, REF).rejected == "START_CANCELLED")
    check(observed && x.host.snapshot().pendingRequestId == null && x.platform.runtimes.isEmpty())
  }
  println("$count PUBLIC HOST TESTS PASS; recording Android boundary only")
  val facadeScenario = Scenario(); val events = mutableListOf<Map<String, Any?>>()
  val facade = NarrationBridgeFacade(facadeScenario.host, { true }, events::add)
  val capture = facade.captureScopeDto()
  check((capture["host"] as? Map<*, *>)?.get("requestEpoch") == 0L) { "Facade capture must expose the pre-await host scope" }
  check(capture.containsKey("audio") && capture["audio"] == null)
  val refDto = mapOf<String, Any?>("walkSessionId" to REF.walkSessionId, "bundleSha256" to HASH, "narrationId" to REF.narrationId,
    "locale" to "ru", "assetPath" to REF.assetPath, "assetSha256" to HASH)
  check(facade.play(capture, refDto)["accepted"] == true)
  check(facade.getState()["status"] == "stopped" && facade.getState()["assetId"] == null)
  check(facade.getState()["hostPhase"] == "STARTING" && facade.getState()["ref"] == null)
  check(events.isNotEmpty())
  var facadeCount = 1
  fun facadeTest(name: String, task: () -> Unit) { task(); facadeCount++; println("PASS FACADE $name") }
  facadeTest("active identity survives pause without conflating shared asset IDs") {
    val service = Any(); facadeScenario.host.onServiceCreated(service)
    check(facadeScenario.host.consumeStart(service, 1, NarrationCoordinator.START_ACTION, facadeScenario.platform.starts.last()).admitted)
    facadeScenario.platform.runtimes.single().playing()
    check(facade.getState()["ref"] == refDto)
    check(facade.pause(facade.captureScopeDto())["accepted"] == true)
    val paused = facade.getState(); check(paused["status"] == "paused" && paused["canResume"] == true && paused["ref"] == refDto)
    val nextRef = refDto + ("narrationId" to "cue:another:ru") // Same MP3, distinct narration identity.
    check(facade.play(facade.captureScopeDto(), nextRef)["accepted"] == true)
    check(facade.getState()["assetId"] == paused["assetId"] && facade.getState()["ref"] == nextRef)
  }
  facadeTest("Stop never refreshes an old capture or quietly retries Play") {
    val old = facade.captureScopeDto(); val before = facadeScenario.platform.starts.size
    facade.stop(); check(facade.play(old, refDto)["accepted"] == false)
    check(facadeScenario.platform.starts.size == before)
    check(facade.getState()["status"] == "stopped" && facade.getState()["ref"] == null)
  }
  facadeTest("old bridge close neither controls nor observes another current owner") {
    val x = Scenario(); var oldEvents = 0
    val old = NarrationBridgeFacade(x.host, { true }, { oldEvents++ })
    val newer = NarrationBridgeFacade(x.host, { true }, {})
    check(newer.play(newer.captureScopeDto(), refDto)["accepted"] == true)
    old.close(); val stable = oldEvents
    val service = Any(); x.host.onServiceCreated(service)
    check(x.host.consumeStart(service, 1, NarrationCoordinator.START_ACTION, x.platform.starts.last()).admitted)
    check(oldEvents == stable && x.host.snapshot().phase == HostPhase.RUNNING)
    check(old.play(newer.captureScopeDto(), refDto)["rejected"] == "CLIENT_CLOSED")
    check(runCatching { old.captureScopeDto() }.isFailure)
    newer.close()
  }
  facadeTest("MAIN observation captures actual player position but sync scope capture does not") {
    val x = Scenario(); val f = NarrationBridgeFacade(x.host, { true }, {})
    f.play(f.captureScopeDto(), refDto); val service = Any(); x.host.onServiceCreated(service)
    x.host.consumeStart(service, 1, NarrationCoordinator.START_ACTION, x.platform.starts.last())
    val runtime = x.platform.runtimes.single(); runtime.playing(); runtime.position = 3400
    val before = x.host.snapshot(); val captured = f.captureScopeDto()
    check(x.host.snapshot() == before && x.host.snapshot().audio!!.positionMs == 0)
    check(f.getState()["positionMs"] == 3400)
    check(f.captureScopeDto() == captured && x.host.snapshot().hostScope == before.hostScope)
    f.close()
  }
  facadeTest("Service destruction publishes revoked STOPPING before cleanup and final ABSENT only after release") {
    val x = Scenario(); val observed = mutableListOf<Map<String, Any?>>()
    val f = NarrationBridgeFacade(x.host, { true }, observed::add)
    f.play(f.captureScopeDto(), refDto); val service = Any(); x.host.onServiceCreated(service)
    check(x.host.consumeStart(service, 1, NarrationCoordinator.START_ACTION, x.platform.starts.last()).admitted)
    x.platform.runtimes.single().playing(); observed.clear()
    x.host.onServiceDestroyed(service)
    val revoking = observed.first { it["status"] == "playing" }
    check(revoking["hostPhase"] == "STOPPING" && revoking["audioScope"] == null) {
      "Destruction must revoke the audio scope while retaining truthful STOPPING until cleanup"
    }
    check(revoking["ref"] == refDto && revoking["serviceForeground"] == true)
    val final = f.getState()
    check(final["hostPhase"] == "ABSENT" && final["status"] == "stopped" && final["ref"] == null)
    check(final["audioScope"] == null && final["serviceForeground"] == false)
    f.close()
  }
  facadeTest("cleanup errors remain error DTOs and a repeated Stop cannot conceal them") {
    val x = Scenario(); val f = NarrationBridgeFacade(x.host, { true }, {})
    f.play(f.captureScopeDto(), refDto); val service = Any(); x.host.onServiceCreated(service)
    x.host.consumeStart(service, 1, NarrationCoordinator.START_ACTION, x.platform.starts.last())
    x.platform.runtimes.single().releaseFails = true
    check(f.stop()["accepted"] == false)
    check(f.getState()["status"] == "error" && f.getState()["errorCode"] == "HOST_CLEANUP_FAILED")
    check(f.stop()["accepted"] == false)
    f.close()
  }
  facadeTest("capture is JS-thread safe while commands enforce the MAIN adapter") {
    val platform = RecordingPlatform(); var main = true; var id = 0; var visibilityReads = 0
    val host = NarrationCoordinator(platform, { 1000L }, { "facade-${++id}" }, { check(main) })
    val f = NarrationBridgeFacade(host, { visibilityReads++; true }, {}, { check(main) })
    main = false; val captured = f.captureScopeDto(); check(visibilityReads == 0)
    check(runCatching { f.play(captured, refDto) }.isFailure)
    check(runCatching { f.getState() }.isFailure)
    check(platform.starts.isEmpty() && visibilityReads == 0)
    main = true; f.close()
  }
  println("$facadeCount PUBLIC FACADE TESTS PASS; no Expo/native renderer")
  runMediaSessionScopeRegressions()
}
