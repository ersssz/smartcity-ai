# Native replacement review, 2026-10-20

Baseline: `9859ba9aecc9622d12eb7ec2e3bd6421c447d475`. Changes belong to
`codex/t01-native-location`. This review does not accept the full T01/product gate.

The root implemented the screen/integration; `/root/native_location_adapter` owned the
local Kotlin module, `/root/native_js_regressions` owned the simulated lifecycle tests,
and `/root/native_acceptance_review` independently inspected source and generated
artifacts. The authorized second Codex reviewed the baseline ticket with its
`/root/provider_evidence` and `/root/hours_evidence` agents; it did not inspect the new
Kotlin source during that baseline review.

Confirmed defects corrected before final artifact acceptance:

- Android 14 permits dismissal of an ongoing notification: its delete action now
  calls the same native Stop receiver. Android 14 runtime execution remains pending.
- Stale reconciliation after an awaited SQLite read could pause a newly started
  session. Revision checks and mutation ownership preserve the newer action.
- A delayed Pause write could overwrite a later Stop. Suspended-state writes now
  settle against the latest Stop revision.
- An already-rendered marker could outlive its freshness after a backwards wall-clock
  change. Native monotonic freshness and nonnegative timestamp age are both required.
- Expo events are asynchronous: raw coordinates were replaced with coordinate-free
  signals and a synchronous read from one atomic current observation.
- Actual Activity `RESUMED` is checked on the main thread using existing AndroidX.
  The synchronous JS getter does not read the main-thread-confined lifecycle registry.
  Disposed modules cannot attach, emit or start from delayed callbacks.

The first targeted Kotlin compile exposed an incorrect assumption about React Native
types exposed through Expo. The fix uses already available AndroidX dependencies.
No runtime dependency was added and no SDK or node_modules source was patched.

The new acquisition path uses a process-bound LocationManager listener, not a
location PendingIntent or persisted scheduler. Native Stop invalidates permits and
generation before cleanup, does not require JavaScript/SQLite, and reports cleanup
failure conservatively. Only metadata reaches the diagnostic SQLite table.

Root repeated 25 data tests, 22 spending-policy tests, 10 simulated lifecycle tests,
7 JVM authorization tests and two strict TypeScript checks. These 64 tests are not
Android service, privacy migration or physical GPS acceptance.

Final package/signature/class inspection and physical-device observations are
recorded separately. Home/lock does not prove stalled JavaScript; the stalled-JS
and broken-SQLite physical-release case remains unexecuted. Clean installation
does not prove deletion of historical Expo payloads. Android 14+, legacy upgrade,
reboot/package replacement, battery and outdoor field performance remain separate gates.
