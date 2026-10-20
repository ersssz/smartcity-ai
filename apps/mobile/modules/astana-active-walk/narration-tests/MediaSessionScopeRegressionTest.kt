package kz.astanaai.activewalk.narration

import kz.astanaai.activewalk.narration.*

/** Actual shared guard + actual reducer; Android MediaSession delivery itself remains a device gate. */
fun runMediaSessionScopeRegressions() {
  val sha = "a".repeat(64)
  val ref = NarrationRef("walk-1", sha, "chapter:one:ru", "ru", "astana-audio/$sha.mp3", sha)
  fun started(id: String): BackgroundAudioMachine = BackgroundAudioMachine(id, { 1000L }).also {
    it.dispatch(AudioInput.Play(ref, it.snapshot().scope, true, "client-1"))
  }
  var count = 0
  fun test(name: String, task: () -> Unit) { task(); count++; println("PASS MEDIA_SCOPE $name") }
  test("a queued old Stop cannot stop the paused chapter's newer epoch") {
    val machine = started("runtime-1"); val captured = machine.snapshot()
    machine.dispatch(AudioInput.Pause(captured.scope)); val paused = machine.snapshot()
    if (mediaSessionCallbackAuthorized(captured.scope, ref, machine.snapshot(), true, false)) machine.dispatch(AudioInput.Stop)
    check(machine.snapshot() == paused) { "Old MediaSession Stop borrowed a newer scope" }
  }
  test("fresh paused controls can resume but become stale immediately after Resume") {
    val machine = started("runtime-1"); machine.dispatch(AudioInput.Pause(machine.snapshot().scope)); val paused = machine.snapshot()
    check(mediaSessionCallbackAuthorized(paused.scope, ref, machine.snapshot(), true, false))
    machine.dispatch(AudioInput.Resume(paused.scope, ResumeOrigin.MEDIA_SESSION, false)); val resumed = machine.snapshot()
    check(resumed.status == AudioStatus.LOADING)
    if (mediaSessionCallbackAuthorized(paused.scope, ref, machine.snapshot(), true, false)) machine.dispatch(AudioInput.Stop)
    check(machine.snapshot() == resumed)
  }
  test("old Service callbacks cannot control a new runtime with the same local epoch") {
    val old = started("runtime-old").snapshot(); val current = started("runtime-new"); val before = current.snapshot()
    check(old.scope.playbackEpoch == before.scope.playbackEpoch)
    if (mediaSessionCallbackAuthorized(old.scope, ref, current.snapshot(), true, false)) current.dispatch(AudioInput.Stop)
    check(current.snapshot() == before)
  }
  test("only a current live same-session callback may perform audio-only Stop") {
    val machine = started("runtime-1"); val captured = machine.snapshot()
    check(!mediaSessionCallbackAuthorized(captured.scope, ref, machine.snapshot(), false, false))
    check(!mediaSessionCallbackAuthorized(captured.scope, ref, machine.snapshot(), true, true))
    check(!mediaSessionCallbackAuthorized(captured.scope, ref.copy(narrationId = "other:ru"), machine.snapshot(), true, false))
    check(mediaSessionCallbackAuthorized(captured.scope, ref, machine.snapshot(), true, false))
    machine.dispatch(AudioInput.Stop)
    check(machine.snapshot().status == AudioStatus.STOPPED && machine.snapshot().ref == null)
  }
  println("$count MEDIA SESSION CAPTURED-SCOPE REGRESSIONS PASS; no Android execution")
}
