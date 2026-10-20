# Independent Root narration integration review

Date: 2026-10-20. Reviewer: `/root/planner_contract_design/historical_graph_inventory`. Scope: Root's first integration freeze in ActiveWalkModule, PreparedAudioOwner, module/app manifests, app.json, TypeScript narration bridge and CanonicalApp. The nine-file narration package already had a separate independent review; this pass checks its integration boundaries.

Result: **1 confirmed P2 found and corrected during review; 0 confirmed findings remain in the reviewed source.** Independent checks after correction: **43 JVM groups + 12 JS tests PASS**. Android runtime/installed-APK acceptance remains open.

## Confirmed finding, now closed

**P2: service destruction emitted a legitimate native transient rejected by the JS bridge.** `NarrationCoordinator.onServiceDestroyed` calls `closeCurrent(destroying=true)`. Before Root's correction, its first publication set `hostPhase=ABSENT` while retaining the previous actual `playing` audio/ref/foreground until cleanup. Facade revoked `audioScope` immediately. `modules/astana-active-walk/src/narration.ts:80-83` permits a playing state only under RUNNING/STOPPING, so `addListener` threw INVALID_NARRATION_STATE for this service-destruction event.

A read-only in-memory loader executed the real TypeScript bridge: the destruction DTO with ABSENT threw INVALID_NARRATION_STATE; the same DTO with STOPPING was accepted. This was a concrete producer/consumer mismatch, not a device reproduction.

Root changed only the coordinator's initial cleanup phase to `if (service == null && selected == null) ABSENT else STOPPING` at `narration/NarrationCoordinator.kt:234`. Final phase publication remains after release. JS validation was not broadened. With Root's explicit authorization, this reviewer added one public Facade regression at `narration-tests/NarrationCoordinatorTest.kt:344`. It checks an observed pre-cleanup playing/ref/foreground state with STOPPING and null audioScope, followed by final ABSENT/stopped/null ref/false foreground after release. Root's patch was already applied before the JVM run; **no JVM behavioral RED run is claimed**. Production sources were not edited by this reviewer.

## Standards

No remaining confirmed documented-standard violation within scope. The integration reuses the existing local module, dependencies and asset verifier. Native visibility comes from the real resumed Activity closure; no JS visibility boolean, network provider, account, billing, paid API, key lookup, persisted bootstrap or boot receiver was added. Test/platform results remain distinguished from Android runtime acceptance.

## Spec and boundary checks

- **Capture timing and thread:** CanonicalApp captures the immutable scope synchronously at the start of the actual click (`CanonicalApp.tsx:113-131`), before its first await. No Stop/capture/retry is inserted inside Play. The exact six-field session/bundle/narration/locale/asset ref governs resume. `ActiveWalkModule.kt:117-122` exposes sync capture separately and dispatches every command/observation on Queues.MAIN. The Facade's actual Host adapter checks MAIN; the volatile bridge/publication permits the sync JS read without Activity or player access.
- **Concurrent Stop:** `urgentStop` sets its stopping flag and invalidates JS generation before running native/audio cleanup. Existing `runPriorityStop` starts both cleanup promises before waiting on a pending operation; native host epochs reject a queued pre-Stop Play without refreshing its scope. The native global Stop path reaches PreparedAudioOwner in ActiveWalkController.stop's finally branch. PreparedAudioOwner independently attempts every legacy player and `NarrationHost.stopIfInstalled`; a legacy cleanup failure does not suppress the narration attempt or install a new host.
- **Cleanup and lifecycle:** module destruction marks disposed before detaching, closes its Facade, and performs legacy-player cleanup in finally. The old bridge's native client ownership prevents teardown from cancelling a newer client. Cleanup failures retain their host/native error path rather than becoming accepted Stop receipts.
- **Background:** CanonicalApp's non-active AppState handler invalidates pending JS work without stopping the selected native chapter. Native background hooks only update visibility/legacy-player state; ActiveWalkController.setVisible does not call the new audio Stop. Warm UI Resume still rechecks native visibility; pending cold admission also rechecks it. Screen unmount, explicit navigation, language changes and explicit Stop stop audio. This is source behavior only; actual Android background playback was not tested here.
- **Binding/declarations:** the Kotlin module name and TypeScript requireNativeModule are both AstanaActiveWalk; all six narration function names and onNarrationState match. expo-module.config.json names the actual ActiveWalkModule. The module manifest names actual fully qualified service/receiver classes, both non-exported; service type is mediaPlayback with stopWithTask=true. FOREGROUND_SERVICE_MEDIA_PLAYBACK and WAKE_LOCK appear in both module/app permissions and app.json. No cold media/boot resurrection intent filter was added. Manifest merge and installed declarations still require Root's build/APK checks.
- **DTOs and UI:** strict TypeScript parsing retains exact ref identity, uppercase hostPhase, safe epoch/generation values and immutable scope. Canonical state publication compares generations; stale events cannot overwrite newer observed state. STARTING is shown as pending by hostPhase while native audio remains stopped until a Core exists. The corrected destruction publication is compatible with the retained strict playing-state validator.

## Independently executed checks

From `C:/Users/era/Documents/Codex/2026-10-20/x20`:

```powershell
& './outputs/AstanaAI/apps/mobile/modules/astana-active-walk/narration-tests/test-host.ps1' `
  -JdkRoot 'C:/Users/era/Documents/Codex/2026-10-20/x20/work/android-toolchain/gradle-cache/jdks/eclipse_adoptium-17-amd64-windows.2' `
  -GradleCache 'C:/Users/era/Documents/Codex/2026-10-20/x20/work/android-toolchain/gradle-cache'
```

Exit 0: **31 host + 8 Facade + 4 MediaSession captured-scope groups = 43 PASS**. Actual production Core/reducer/coordinator/Facade, recording Android platform. Cached Kotlin 2.2.10/JVM target 17, bounded 384 MiB compiler / 128 MiB test heap. No Gradle, install, network or device used.

From `outputs/AstanaAI/apps/mobile`:

```powershell
& 'C:/Program Files/nodejs/node.exe' --test modules/astana-active-walk/src/narration.test.cjs tests/priorityStop.test.cjs
```

Exit 0: **12 tests PASS** (8 actual TypeScript bridge tests through a simulated native boundary; 4 priority Stop scheduling tests). No native Expo renderer or hardware execution.

## Reviewed byte pins

Paths below are relative to `outputs/AstanaAI`.

| File | SHA-256 |
|---|---|
| apps/mobile/modules/astana-active-walk/android/src/main/java/kz/astanaai/activewalk/ActiveWalkModule.kt | `b9e5447fc8fafb9d56f7c206ebe919c71c93f6706c2717c49fc7f88b58bffb66` |
| apps/mobile/modules/astana-active-walk/android/src/main/java/kz/astanaai/activewalk/PreparedAudioOwner.kt | `e099e4e4b1c2f4b79488e9a5ddb7503b58b8105bc4138946e3a4f30f66fa40c5` |
| apps/mobile/modules/astana-active-walk/android/src/main/AndroidManifest.xml | `c22cdf2a485a10c1edc76a9d6289e0ae566e72a4279194accc2ec3f37976de71` |
| apps/mobile/android/app/src/main/AndroidManifest.xml | `05008626b7ca2eb3a951a28ec67ebe3c2f09af468eea86b55b148567fd79354f` |
| apps/mobile/app.json | `c1f1c636d2de0509facf7794bf2f53f2c078bc371adb3e50934bca2beece8c80` |
| apps/mobile/modules/astana-active-walk/src/narration.ts | `ef8bdf70f8a801c8984b4d2060f61d37d3a9066b53c436f86ec25e2cd8b000ce` |
| apps/mobile/src/canonical/CanonicalApp.tsx | `853329582755cc7e2cb24629b8122b8ca62e20041dd88c9ffbf9e7ff2c967b81` |
| apps/mobile/modules/astana-active-walk/android/src/main/java/kz/astanaai/activewalk/narration/NarrationCoordinator.kt | `0a08efba993902b3f7ebda93f89ec2e1d7c3a4ca15361a8d6e33dc98d09c9cf7` |
| apps/mobile/modules/astana-active-walk/narration-tests/NarrationCoordinatorTest.kt | `93c1c3bada5e0a4093472bf6c5881159c3e1cacb5dd1534b967d0087fb502763` |

The previous independent package report remains evidence for its earlier freeze; this report records Root's later Coordinator correction and the additional test. No other existing package source was changed by the reviewer.

## Remaining acceptance

Root retains full Kotlin/Expo compilation, merged manifest/APK inspection and installed-version/hash verification. Audible playback, permission/FGS denial, lock screen, background duration, notification/Bluetooth delivery, noisy/focus changes, task removal, process death/reload, battery and real cleanup remain untested by this reviewer. SQL pause/TrackingLease and physical arrival are separate from audio Stop. No phone, friend-control tool, network, key, purchase or paid API was used.

Review totals: **Standards 0 remaining; Spec 1 confirmed P2 corrected, 0 remaining confirmed source findings.**

## Post-review addendum: cold Pause and release metadata

Read-only delta review at commit `1eaf706a842d7e7e33bb8444d8064776176b7cd4` (2026-10-20): **no new confirmed finding**. These pins supersede the earlier table for files listed here; earlier test results remain evidence for their original freeze.

`CanonicalApp.tsx:134-140` still captures synchronously and invalidates the JS generation. When `captured.audio === null`, its audio-only Pause gesture now calls unconditional `narration.stop()` instead of submitting a scoped Pause with no admitted runtime. This cancels a cold STARTING permit before a late Service can begin playing. With a live audio scope it continues to call `narration.pause(captured)`. There is no await before capture, fresh recapture, retry, tracking Stop or progress dispatch in this handler.

Read the actual TSX lifecycle regression at `tests/canonicalNarrationLifecycle.test.cjs:318-329`: it holds Play, injects STARTING with null scope, invokes Pause, checks one capture/one audio Stop/no Pause/no tracking Stop/no progress dispatch, then checks the late rejected Play cannot revive UI playback. The audio agent reports **18 actual-TSX harness tests PASS**, including this case. This reviewer inspected the regression but did **not** rerun that suite or the broader 79-check set for this addendum.

Release metadata is consistent at **0.6.0 / Android code 13** across app.json, package.json, the mobile package-lock's top-level/root-package version, and Android app build.gradle. Native Effects/Service header edits describe production ownership; the separately reviewed media scope and lifetime seams remain the applicable source review. Root reports native compilation and Metro PASS with final packaging in progress; this addendum does not independently verify those build results or the installed APK/device.

| Updated/rechecked file (relative to outputs/AstanaAI) | SHA-256 |
|---|---|
| apps/mobile/src/canonical/CanonicalApp.tsx | `711b40cd2132b333db2fe274a56d5c0f70341536b39ba739114370cb7caeb01a` |
| apps/mobile/app.json | `c1f1c636d2de0509facf7794bf2f53f2c078bc371adb3e50934bca2beece8c80` |
| apps/mobile/package.json | `17e002288393e324ee56a848dd8440f518a6851ad42113a2030d68de5549a757` |
| apps/mobile/package-lock.json | `1a4b1b892f54c6374fb7d2bf800170529e0e6f0d7afd91e4bdcb01b9714bf57e` |
| apps/mobile/android/app/build.gradle | `8f901819da86f1f8b6d4b5e1d6feedf3428afc5a47f4d0afd6a6c49e5ccac89c` |
| apps/mobile/modules/astana-active-walk/android/src/main/java/kz/astanaai/activewalk/narration/AndroidNarrationEffects.kt | `3d8ca8fc752e6f1d40deedacbeb371ce73e52c990c33596be3cd5d5f84dca241` |
| apps/mobile/modules/astana-active-walk/android/src/main/java/kz/astanaai/activewalk/narration/NarrationPlaybackService.kt | `7c65c39ef8d4de5b9842b6145c9e2665e5d2f1a1742ee65ac6f576e1d6301f60` |
| apps/mobile/tests/canonicalNarrationLifecycle.test.cjs | `beb6c70022daec16b143761cd588d7e107099813ee11a179817cb11ff0458640` |

Only this review report was changed by the reviewer in the addendum pass. No application/test source, phone, network, Gradle, key or paid service was touched.
