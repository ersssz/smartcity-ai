package kz.astanaai.activewalk.narration

private const val CORE_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
private val CORE_REF = NarrationRef("walk-a", CORE_HASH, "chapter:place:ru", "ru", "astana-audio/$CORE_HASH.mp3", CORE_HASH)
private class RecordingEffects : NarrationEffects {
  val seen = mutableListOf<AudioEffect>()
  var emit: (AudioInput) -> Unit = {}
  var onApply: (AudioEffect) -> Unit = {}
  var position: Int? = null
  var releaseFailures = emptyList<String>()
  override fun apply(effect: AudioEffect) { seen.add(effect); onApply(effect) }
  override fun positionMs() = position
  override fun release() = releaseFailures
}
private class RuntimeScenario {
  val port = RecordingEffects()
  val core = AudioRuntimeCore("core-process", { 1000L }, { true }) { _, emit -> port.emit = emit; port }
  fun play() = core.play(CORE_REF, core.snapshot().scope, "client-a")
  fun playing() {
    play(); val s = core.snapshot().scope
    port.emit(AudioInput.ForegroundResult(s, true)); port.emit(AudioInput.Verified(s, 1000))
    port.emit(AudioInput.Prepared(s, 20_000)); port.emit(AudioInput.FocusResult(s, true)); port.emit(AudioInput.Started(s))
  }
}

fun runRuntimeCoreTests() {
  var count = 0
  fun test(name: String, task: () -> Unit) { task(); count++; println("PASS CORE $name") }
  test("release rejects a listener's fresh Play before cleanup and notification") {
    val x = RuntimeScenario(); x.playing(); var attempted = false; var reply: AudioTransition? = null
    x.core.subscribe { state -> if (!attempted && state.status == AudioStatus.STOPPED) {
      attempted = true; reply = x.core.play(CORE_REF, state.scope, "client-a")
    } }
    x.port.seen.clear(); val closed = x.core.release()
    check(attempted); check(reply?.rejected == "NARRATION_RUNTIME_RELEASED")
    check(closed.status == AudioStatus.STOPPED); check(closed.ref == null)
    check(x.port.seen.none { it is AudioEffect.PromoteForeground })
  }
  test("rejected and no-op input does not republish a state or recurse") {
    val x = RuntimeScenario(); val captured = x.core.snapshot().scope; x.core.stopAudio()
    var notifications = 0; x.core.subscribe { notifications++ }
    val r = x.core.play(CORE_REF, captured, "client-a")
    check(r.rejected == "STALE_AUDIO_SCOPE"); check(notifications == 0)
    x.port.emit(AudioInput.GainedFocus); check(notifications == 0)
  }
  test("Stop nested inside an effect invalidates remaining startup and old notification effects") {
    val x = RuntimeScenario(); var once = false
    x.port.onApply = { effect -> if (!once && effect == AudioEffect.CancelJobs) { once = true; x.core.stopAudio() } }
    x.play()
    check(x.core.snapshot().status == AudioStatus.STOPPED)
    check(x.port.seen.none { it is AudioEffect.PromoteForeground || it is AudioEffect.UpdateSession })
  }
  test("cleanup failure attempts remaining cleanup but skips a fresh startup") {
    val x = RuntimeScenario(); x.port.onApply = { if (it == AudioEffect.StopPlayer) error("synthetic release failure") }
    val r = x.play()
    check(r.snapshot.status == AudioStatus.ERROR); check(r.snapshot.errorCode == "AUDIO_CLEANUP_FAILED")
    check(x.port.seen.contains(AudioEffect.ReleaseFocus)); check(x.port.seen.contains(AudioEffect.ReleaseSession))
    check(x.port.seen.none { it is AudioEffect.PromoteForeground })
  }
  test("actual port position is retained on pause") {
    val x = RuntimeScenario(); x.playing(); x.port.position = 6100
    x.core.pause(x.core.snapshot().scope)
    check(x.core.snapshot().positionMs == 6100); check(x.core.snapshot().status == AudioStatus.PAUSED)
  }
  test("native events after release are harmless and cannot start playback") {
    val x = RuntimeScenario(); x.play(); val old = x.core.snapshot().scope; x.core.release(); x.port.seen.clear()
    x.port.emit(AudioInput.ForegroundResult(old, true)); x.port.emit(AudioInput.Prepared(old, 20_000))
    check(x.port.seen.isEmpty()); check(x.core.snapshot().status == AudioStatus.STOPPED)
  }
  test("listener failure never prevents native stop or another listener") {
    val x = RuntimeScenario(); x.playing(); var observed = false
    x.core.subscribe { error("synthetic listener failure") }
    x.core.subscribe { if (it.status == AudioStatus.STOPPED) observed = true }
    x.core.stopAudio(); check(observed); check(x.port.seen.contains(AudioEffect.StopPlayer))
  }
  test("port close failure stays visible without resurrecting a released runtime") {
    val x = RuntimeScenario(); x.playing(); x.port.releaseFailures = listOf("CLOSE_FAILED")
    val state = x.core.release(); check(state.status == AudioStatus.ERROR)
    check(x.core.play(CORE_REF, state.scope, "client-a").rejected == "NARRATION_RUNTIME_RELEASED")
  }
  println("$count PUBLIC RUNTIME CORE TESTS PASS; recording port is not Android execution")
}
