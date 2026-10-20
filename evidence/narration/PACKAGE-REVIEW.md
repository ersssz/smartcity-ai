# Independent narration production adoption review

Date: 2026-10-20. Reviewer: `/root/planner_contract_design/historical_graph_inventory`, independent of source author `/root/audio_offline_feasibility`.

Result: **0 confirmed scoped source blockers.** Final independent cached JVM rerun: **31 host + 7 Facade + 4 MediaSession scope groups = 42 PASS**, exit 0. This reviews the production package's source/lifetime logic; Android playback and Root integration remain unaccepted.

## Scope and frozen authority

Read `outputs/AstanaAI/AGENTS.md`, `docs/FOCUSED-RELEASE.md`, both audio stages and all nine files under `apps/mobile/modules/astana-active-walk/android/src/main/java/kz/astanaai/activewalk/narration/`. Root explicitly requested this adoption review; moving Expo bindings, JS and Manifest were excluded. No application source was edited.

The latest host receipt, `work/background-audio-host-stage/VERIFICATION.json`, has SHA-256 `5963a23dce49a88c8b8cee9e25292e4bd31bcc35f4076f4303e1619d5bde9044`. Independently compared all **14/14** source/frozen-dependency entries with disk: exact matches. Its Core `337bb18e...` and Effects `f606b951...` include the approved captured-scope MediaSession correction. The earlier `background-audio-stage/VERIFICATION.json` remains preserved at SHA `6a574ece450420d1d8162e9d59f64158da234db7323e1bcf069d595604ae93f6`; its older Core/Effects hashes are historical, not the current freeze authority.

The final production sources were pinned again after the JVM run:

| File | SHA-256 |
|---|---|
| AndroidNarrationEffects.kt | `63926f45857a13e1055ef43c0365b48a6a656d9a1a9b317175a88f22844f6f8d` |
| AudioRuntimeCore.kt | `c53f10955782f856f2482efa5e89b9d38af6bf21a35b2e208496130d24cc5edb` |
| BackgroundAudioMachine.kt | `872f278171320e3a4f95fb0c310ca2616b894ce8ad39cecabf75967371bf3d30` |
| NarrationBridgeFacade.kt | `bed2c2a5cebdaa64ddb5e9069528d301d2994d763aa16ca41b2c9d7e7cd2a0f7` |
| NarrationBridgeHelper.kt | `cdae52ea60374e4469022abd2e2ca0c4241b0dc5f60ab01bba1f618fd2ba81d5` |
| NarrationCoordinator.kt | `3497e2487122cf71726bd56e775c96550b38d737cf52196ac065873fb9e424e8` |
| NarrationMediaCommands.kt | `bc2c24f7102817eca3ea20766fad4c720e3076dd8ac1e6bdf0f53ddf2d258f90` |
| NarrationPlaybackService.kt | `f34ca3c657f0306d13c48b25aae7d83a05d75eca69ee29180cd83c8b408143b1` |
| NarrationRuntime.kt | `fab46dff7942a8ce6fa574e3484721ac596845fdd9acc61a14b493c586e48406` |

Package/type/action/channel renames account for the eight staged-file transfers apart from `NarrationCoordinator.observe()` and `NarrationHost.createBridge/stopIfInstalled`. The added Facade translates immutable publication state into Root's DTO. The final contract correction exposes uppercase `hostPhase`; cold `STARTING` without an actual runtime exposes `status=stopped`, null ref/asset/audio scope and false serviceForeground. The earlier 42-pass run preceded that correction; the final 42-pass rerun below includes it.

## Standards

**0 confirmed documented-standard violations or actionable source smells within scope.** The package reuses the existing asset verifier and dependencies. No network, account, key, paid API, purchase, GPS start, canonical SQL write or persisted start permit was introduced in these nine files. Public JVM tests exercise the actual Core/reducer/coordinator/Facade through a recording platform; they explicitly do not claim Android execution. Production sources and frozen stages were read only by this reviewer; the test script regenerated its existing build JAR.

## Spec

**0 confirmed implementation defects in the assigned lifetime seams.** Directly checked:

- **Captured MediaSession scope:** `AndroidNarrationEffects.kt:251-261` captures both ref and AudioScope when controls are published. The shared guard in `AudioRuntimeCore.kt:10-13` also requires the same actual MediaSession and a live adapter. Old queued Stop/Pause/Play cannot borrow a newer scope. Pause refreshes controls through UpdateSession.
- **PendingIntent lifetime:** `NarrationMediaCommands.kt:25-44` uses explicit receiver, immutable intents and scope-specific URI identity; changing scope cancels old handles. Receiver dispatch at lines 47-65 uses only the attached existing runtime and exact scope. An old notification or a cold process cannot create a Service/runtime.
- **Cold/null versus admitted/live dispatch:** `NarrationPlaybackService.kt:91-107` obtains only an already installed RAM owner, validates the fixed start envelope and always returns START_NOT_STICKY. `NarrationCoordinator.kt:70-110` consumes one-use permit before runtime creation; checks expiry, native visibility, actual Service identity and epoch. Null/duplicate/invalid starts leave an admitted live owner intact; an unadmitted instance stops without autoplay.
- **Service recreation:** `NarrationCoordinator.kt:97` allocates a fresh opaque runtime lifetime even though a reducer starts at local epoch 0. Old Service destruction is identity checked at lines 117-120; STOPPING blocks admission until destruction. Media attachment detaches only its selected runtime.
- **Reentrant Stop:** `NarrationCoordinator.kt:224-245` clears pending/runtime/owner before callbacks and cleanup, advances host scope and maintains a closing fence. Core release also closes admission before observer code. A Stop during runtime creation releases the unowned candidate; a late factory result cannot start sound. No automatic retry is inserted.
- **Cleanup honesty:** separate cleanup attempts continue after a failure. `cleanupFault`, AUDIO_CLEANUP_FAILED and HOST_CLEANUP_FAILED remain visible; a repeated Stop cannot turn an unknown cleanup outcome into successful stopped or grant a new Play. Facade prioritizes error status. These checks do not prove real hardware cleanup.
- **Facade lifetime/thread contract:** sync capture reads only the volatile immutable publication; commands/current-position observation require MAIN through the actual Host adapter. Exact six-field ref preserves narration identity when two cues reuse one MP3. Closing a bridge removes its listeners and cancels only its pending/current ownership. No DTO caller can supply native visibility or acquire a fresh scope after a stale rejection.

## Independent verification

Executed twice; the second run used the author's final Facade/test freeze:

```powershell
& './outputs/AstanaAI/apps/mobile/modules/astana-active-walk/narration-tests/test-host.ps1' `
  -JdkRoot 'C:/Users/era/Documents/Codex/2026-10-20/x20/work/android-toolchain/gradle-cache/jdks/eclipse_adoptium-17-amd64-windows.2' `
  -GradleCache 'C:/Users/era/Documents/Codex/2026-10-20/x20/work/android-toolchain/gradle-cache'
```

Cached Kotlin 2.2.10, JVM target 17, compiler heap 384 MiB / runner 128 MiB. No Gradle, downloads, global install or Android execution. Exact output: `31 PUBLIC HOST TESTS PASS`, `7 PUBLIC FACADE TESTS PASS`, `4 MEDIA SESSION CAPTURED-SCOPE REGRESSIONS PASS`; exit **0**. Final `NarrationCoordinatorTest.kt` SHA `21b5d6c091543757cc32ddaec688d33945238f63121b6f47ae0ebda286176a39`; runner SHA `3fb9f7d1b1faa3336b5d1600c3cf0177adcee0d1160c5416f303e21483157923`.

Independent direct Android compilation was not performed in this review. The author separately reported production 28 machine + 8 Core groups passing; these are author evidence, not this reviewer's rerun.

## Acceptance limits for Root

Root still owns adoption into native lifecycle/Expo dispatch, Manifest service/receiver export and permission declarations, the JS pre-await gesture capture, real global Walk Stop, installed APK and audio-session integration. Those moving files were deliberately excluded rather than reported as defects in the source author's package.

Device FGS startup/denial, audible playback, background/locked screen, notification and Bluetooth controls, focus/noisy delivery, process death/reload/task removal, battery, human pronunciation and physical cleanup are **NOT TESTED by this reviewer**. TrackingLease and real SQL pause remain separate Root work; audio Stop is not a durable walking-session pause. No phone, friend computer, network, credentials or paid service was accessed.

Source review totals: **Standards 0; Spec 0 confirmed scoped blockers.** Root can proceed with integration review, retaining the Android/device gates above.
