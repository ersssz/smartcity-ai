package kz.astanaai.activewalk.narration

private const val HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
private val REF = NarrationRef("walk-a", HASH, "chapter:place:ru", "ru", "astana-audio/$HASH.mp3", HASH)
private var passed = 0
private fun test(name: String, block: () -> Unit) {
  try { block(); passed++; println("PASS $name") }
  catch (failure: Throwable) { throw AssertionError("FAIL $name", failure) }
}
private fun expect(value: Boolean, reason: String = "expectation failed") { check(value) { reason } }
private class Scenario(val process: String = "process-a") {
  var now = 1_000L
  val machine = BackgroundAudioMachine(process) { now }
  val effects = mutableListOf<AudioEffect>()
  fun send(input: AudioInput): AudioTransition = machine.dispatch(input).also { effects.addAll(it.effects) }
  fun play(ref: NarrationRef = REF, client: String = "bridge-a") =
    send(AudioInput.Play(ref, machine.snapshot().scope, true, client))
  fun playing() {
    play(); val scope = machine.snapshot().scope
    send(AudioInput.ForegroundResult(scope, true))
    send(AudioInput.Verified(scope, 1000))
    send(AudioInput.Prepared(scope, 20_000))
    send(AudioInput.FocusResult(scope, true))
    send(AudioInput.Started(scope))
    expect(machine.snapshot().status == AudioStatus.PLAYING)
  }
  fun hasStart() = effects.any { it is AudioEffect.StartPlayer }
}

fun main() {
  test("fresh play promotes before verify and starts only after every acknowledgement") {
    val x = Scenario(); x.play(); val s = x.machine.snapshot().scope
    expect(x.effects.any { it is AudioEffect.PromoteForeground }); expect(!x.hasStart())
    x.send(AudioInput.Verified(s, 1000)); expect(!x.hasStart())
    x.send(AudioInput.ForegroundResult(s, true)); expect(x.effects.any { it is AudioEffect.VerifyAsset })
    x.send(AudioInput.Verified(s, 1000)); expect(x.effects.any { it is AudioEffect.PreparePlayer })
    x.send(AudioInput.Prepared(s, 20_000)); expect(!x.hasStart())
    x.send(AudioInput.FocusResult(s, true)); expect(x.hasStart())
    expect(x.machine.snapshot().status == AudioStatus.LOADING)
    x.send(AudioInput.Started(s)); expect(x.machine.snapshot().status == AudioStatus.PLAYING)
  }
  test("fresh background play has no service or player effects") {
    val x = Scenario(); val r = x.send(AudioInput.Play(REF, x.machine.snapshot().scope, false, "bridge-a"))
    expect(r.rejected == "NOT_FOREGROUND"); expect(r.effects.isEmpty()); expect(!x.hasStart())
  }
  test("invalid paths hash locale and metadata rejected before effects") {
    val refs = listOf(REF.copy(assetPath = "../outside.mp3"), REF.copy(assetPath = "https://x/a.mp3"),
      REF.copy(assetSha256 = "b".repeat(64)), REF.copy(locale = "de"), REF.copy(walkSessionId = ""), REF.copy(bundleSha256 = "bad"))
    refs.forEach { ref -> val x = Scenario(); val r = x.play(ref); expect(r.rejected != null); expect(r.effects.isEmpty()) }
  }
  test("stop revokes RAM epoch before a consumer runs cleanup") {
    val x = Scenario(); x.play(); val old = x.machine.snapshot().scope
    val stop = x.send(AudioInput.Stop)
    expect(stop.effects.contains(AudioEffect.StopPlayer)); expect(x.machine.snapshot().scope != old)
    expect(x.machine.snapshot().status == AudioStatus.STOPPED)
  }
  test("late verify prepared focus and started after stop never start") {
    val x = Scenario(); x.play(); val old = x.machine.snapshot().scope; x.send(AudioInput.Stop); x.effects.clear()
    x.send(AudioInput.ForegroundResult(old, true)); x.send(AudioInput.Verified(old, 1000))
    x.send(AudioInput.Prepared(old, 20_000)); x.send(AudioInput.FocusResult(old, true)); x.send(AudioInput.Started(old))
    expect(!x.hasStart()); expect(x.machine.snapshot().status == AudioStatus.STOPPED)
  }
  test("late Expo play captured before Stop rejected without retry") {
    val x = Scenario(); val captured = x.machine.snapshot().scope; x.send(AudioInput.Stop); x.effects.clear()
    val r = x.send(AudioInput.Play(REF, captured, true, "bridge-a"))
    expect(r.rejected == "STALE_AUDIO_SCOPE"); expect(r.effects.isEmpty()); expect(!x.hasStart())
  }
  test("replacement ignores completion and error from previous asset") {
    val x = Scenario(); x.play(); val old = x.machine.snapshot().scope
    val next = REF.copy(narrationId = "chapter:second:ru"); x.play(next); val s = x.machine.snapshot()
    x.send(AudioInput.Completed(old)); x.send(AudioInput.Failure(old, "MEDIA_ERROR"))
    expect(x.machine.snapshot() == s); expect(x.machine.snapshot().ref == next)
  }
  test("loading pause cancels pending work and can only resume explicitly") {
    val x = Scenario(); x.play(); val old = x.machine.snapshot().scope
    x.send(AudioInput.Pause(old)); x.effects.clear()
    x.send(AudioInput.Verified(old, 1000)); x.send(AudioInput.Prepared(old, 20_000))
    expect(x.machine.snapshot().status == AudioStatus.PAUSED); expect(!x.hasStart())
    val r = x.send(AudioInput.Resume(x.machine.snapshot().scope, ResumeOrigin.MEDIA_SESSION, false))
    expect(r.rejected == null); expect(r.effects.any { it is AudioEffect.PromoteForeground })
  }
  test("screen off and ordinary background preserve the explicitly playing asset") {
    val x = Scenario(); x.playing(); val before = x.machine.snapshot(); x.effects.clear()
    x.send(AudioInput.Visibility(false)); expect(x.machine.snapshot() == before); expect(x.effects.isEmpty())
  }
  test("noisy pauses preserves position and releases focus wake and foreground") {
    val x = Scenario(); x.playing(); val s = x.machine.snapshot().scope
    x.send(AudioInput.Position(s, 6500)); x.effects.clear(); x.send(AudioInput.Noisy(s))
    val state = x.machine.snapshot(); expect(state.status == AudioStatus.PAUSED); expect(state.positionMs == 6500)
    expect(!state.serviceForeground); expect(state.canResume)
    expect(x.effects.contains(AudioEffect.ReleaseFocus)); expect(x.effects.contains(AudioEffect.ReleaseWake))
    expect(x.effects.any { it is AudioEffect.DemoteForeground })
  }
  test("every focus loss pauses speech and gain never resumes") {
    FocusLoss.entries.forEach { kind ->
      val x = Scenario(); x.playing(); x.send(AudioInput.LostFocus(x.machine.snapshot().scope, kind)); x.effects.clear()
      x.send(AudioInput.GainedFocus); expect(!x.hasStart()); expect(x.machine.snapshot().status == AudioStatus.PAUSED)
    }
  }
  test("focus denied cleans up and late gain does not bypass it") {
    val x = Scenario(); x.play(); val s = x.machine.snapshot().scope
    x.send(AudioInput.ForegroundResult(s, true)); x.send(AudioInput.Verified(s, 1000)); x.send(AudioInput.Prepared(s, 20_000))
    x.send(AudioInput.FocusResult(s, false)); x.effects.clear(); x.send(AudioInput.GainedFocus)
    expect(x.machine.snapshot().status == AudioStatus.ERROR); expect(!x.hasStart()); expect(!x.machine.snapshot().canResume)
  }
  test("lockscreen resume re-verifies same asset at retained position after promotion") {
    val x = Scenario(); x.playing(); x.send(AudioInput.Position(x.machine.snapshot().scope, 7000))
    x.send(AudioInput.Pause(x.machine.snapshot().scope)); val paused = x.machine.snapshot(); x.effects.clear()
    x.send(AudioInput.Resume(paused.scope, ResumeOrigin.MEDIA_SESSION, false)); val s = x.machine.snapshot().scope
    expect(x.machine.snapshot().ref == REF); expect(!x.hasStart())
    x.send(AudioInput.ForegroundResult(s, true)); x.send(AudioInput.Verified(s, 1000))
    val prepare = x.effects.filterIsInstance<AudioEffect.PreparePlayer>().single()
    expect(prepare.positionMs == 7000); expect(prepare.ref == REF)
  }
  test("UI resume in background rejected but notification resume can request FGS") {
    val x = Scenario(); x.playing(); x.send(AudioInput.Pause(x.machine.snapshot().scope)); val s = x.machine.snapshot().scope
    expect(x.send(AudioInput.Resume(s, ResumeOrigin.UI, false)).rejected == "NOT_FOREGROUND")
    expect(x.send(AudioInput.Resume(s, ResumeOrigin.NOTIFICATION, false)).effects.any { it is AudioEffect.PromoteForeground })
  }
  test("process recreation has no resumable asset and rejects old scope") {
    val x = Scenario(); x.playing(); x.send(AudioInput.Pause(x.machine.snapshot().scope)); val old = x.machine.snapshot().scope
    val fresh = Scenario("process-b"); val r = fresh.send(AudioInput.Resume(old, ResumeOrigin.MEDIA_SESSION, false))
    expect(r.rejected != null); expect(fresh.machine.snapshot().ref == null); expect(!fresh.hasStart())
  }
  test("FGS denial fails without verifying or starting") {
    val x = Scenario(); x.play(); val s = x.machine.snapshot().scope; x.effects.clear()
    x.send(AudioInput.ForegroundResult(s, false))
    expect(x.machine.snapshot().errorCode == "FOREGROUND_START_DENIED")
    expect(x.effects.none { it is AudioEffect.VerifyAsset || it is AudioEffect.StartPlayer })
  }
  test("bad verified byte counts and invalid duration safely error") {
    listOf(0L, 100_000_001L).forEach { bytes ->
      val x = Scenario(); x.play(); val s = x.machine.snapshot().scope; x.send(AudioInput.ForegroundResult(s, true))
      x.send(AudioInput.Verified(s, bytes)); expect(x.machine.snapshot().status == AudioStatus.ERROR)
    }
    val x = Scenario(); x.play(); val s = x.machine.snapshot().scope; x.send(AudioInput.ForegroundResult(s, true))
    x.send(AudioInput.Verified(s, 1000)); x.send(AudioInput.Prepared(s, 0)); expect(x.machine.snapshot().status == AudioStatus.ERROR)
  }
  test("bridge reload stops only its current audio owner") {
    val x = Scenario(); x.play(client = "old"); x.play(client = "new"); val before = x.machine.snapshot()
    x.send(AudioInput.BridgeDestroyed("old")); expect(x.machine.snapshot() == before)
    x.send(AudioInput.BridgeDestroyed("new")); expect(x.machine.snapshot().status == AudioStatus.STOPPED)
  }
  test("task dismissal and live service destruction release asset") {
    val x = Scenario(); x.playing(); x.send(AudioInput.TaskRemoved)
    expect(x.machine.snapshot().status == AudioStatus.STOPPED); expect(x.machine.snapshot().ref == null)
    x.play(); x.send(AudioInput.ServiceDestroyed(x.machine.snapshot().scope)); expect(x.machine.snapshot().status == AudioStatus.STOPPED)
  }
  test("old service destruction cannot stop a newer epoch") {
    val x = Scenario(); x.play(); val old = x.machine.snapshot().scope; x.send(AudioInput.Stop); x.play()
    val before = x.machine.snapshot(); x.send(AudioInput.ServiceDestroyed(old)); expect(x.machine.snapshot() == before)
  }
  test("completion has no queue and cannot resume from system controls") {
    val x = Scenario(); x.playing(); x.effects.clear(); x.send(AudioInput.Completed(x.machine.snapshot().scope))
    expect(!x.hasStart()); expect(x.machine.snapshot().status == AudioStatus.STOPPED)
    expect(x.send(AudioInput.Resume(x.machine.snapshot().scope, ResumeOrigin.MEDIA_SESSION, false)).rejected == "OPEN_APP_REQUIRED")
  }
  test("new language invalidates old scope without changing walk progress") {
    val x = Scenario(); x.playing(); val old = x.machine.snapshot().scope
    x.play(REF.copy(locale = "kk", narrationId = "chapter:place:kk")); val next = x.machine.snapshot()
    expect(next.scope != old); expect(next.ref?.locale == "kk")
    expect(x.send(AudioInput.Resume(old, ResumeOrigin.MEDIA_SESSION, false)).rejected == "STALE_AUDIO_SCOPE")
  }
  test("paused deadline is ten minutes and expiry clears RAM-only asset") {
    val x = Scenario(); x.playing(); x.send(AudioInput.Pause(x.machine.snapshot().scope)); val state = x.machine.snapshot()
    expect(state.pausedDeadlineMs == x.now + 600_000L)
    x.now += 599_999; x.send(AudioInput.IdleDeadline(state.scope)); expect(x.machine.snapshot().status == AudioStatus.PAUSED)
    x.now++; x.send(AudioInput.IdleDeadline(state.scope)); expect(x.machine.snapshot().status == AudioStatus.STOPPED)
    expect(x.machine.snapshot().ref == null)
  }
  test("old idle deadline does not stop a resumed newer epoch") {
    val x = Scenario(); x.playing(); x.send(AudioInput.Pause(x.machine.snapshot().scope)); val paused = x.machine.snapshot().scope
    x.send(AudioInput.Resume(paused, ResumeOrigin.MEDIA_SESSION, false)); val current = x.machine.snapshot()
    x.now += 700_000; x.send(AudioInput.IdleDeadline(paused)); expect(x.machine.snapshot() == current)
  }
  test("snapshot sequence and position updates do not change playback epoch") {
    val x = Scenario(); x.playing(); val old = x.machine.snapshot()
    x.send(AudioInput.Position(old.scope, 2000)); val next = x.machine.snapshot()
    expect(next.snapshotSeq > old.snapshotSeq); expect(next.scope == old.scope)
    expect(x.machine.snapshot() == next)
  }
  test("repeated lifecycle cycles never issue implicit playback") {
    val x = Scenario()
    repeat(1000) {
      x.play(); x.send(AudioInput.Stop); x.effects.clear()
      x.send(AudioInput.Visibility(true)); x.send(AudioInput.Visibility(false)); x.send(AudioInput.GainedFocus)
      expect(x.effects.isEmpty()); expect(x.machine.snapshot().status == AudioStatus.STOPPED)
    }
  }
  test("cleanup failure is visible without a recursive cleanup loop") {
    val x = Scenario(); x.playing(); x.send(AudioInput.Stop); x.effects.clear()
    val r = x.send(AudioInput.CleanupFailure(x.machine.snapshot().scope))
    expect(r.snapshot.status == AudioStatus.ERROR); expect(r.snapshot.errorCode == "AUDIO_CLEANUP_FAILED")
    expect(r.effects.isEmpty()); expect(!r.snapshot.canResume)
  }
  test("service release cannot be revived even with its freshly observed scope") {
    val x = Scenario(); x.playing(); x.send(AudioInput.Release); x.effects.clear()
    val released = x.machine.snapshot()
    expect(released.status == AudioStatus.STOPPED); expect(released.ref == null)
    val r = x.send(AudioInput.Play(REF, released.scope, true, "bridge-a"))
    expect(r.rejected == "NARRATION_RUNTIME_RELEASED"); expect(r.effects.isEmpty())
    expect(x.machine.snapshot() == released)
  }
  println("$passed PUBLIC MACHINE TESTS PASS; no Android runtime/SQL/phone acceptance")
  runRuntimeCoreTests()
}
