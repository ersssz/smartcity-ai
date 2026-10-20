# Native active-walk adapter

Android-only local Expo module for an explicitly started diagnostic walk. The application imports
`nativeActiveWalk`, `NativeWalkState` and `NativeWalkLocation` from `src/index.ts`. Expo autolinking
registers `kz.astanaai.activewalk.ActiveWalkModule`; no manual ReactPackage registration is needed.

The public boundary is `start()`, `stop()`, `getState()`, `onStateChanged` and `onLocation`.
Start resolves a state with `running` only after foreground promotion and a LocationManager callback
subscription succeed. A typed `errorCode` accompanies native admission/start failures. Running is
not evidence of a fresh or accurate position: `fixStatus`, age and accuracy are separate observations.
`foreground` describes the service's successful promotion, not Activity visibility.

The application requests While Using and notification permissions before calling Start. The native
adapter never prompts, requests background-location permission, enables device settings, or restarts
tracking itself. Coarse permission selects only a compatible enabled network provider; missing
providers are an explicit failure, not a manufactured fix. Fine permission may use GPS and network.
The diagnostic checks permission, provider and notification availability during callbacks and every
five seconds while running. Detection is not promised to be instantaneous.

## Lifetime and privacy boundary

- All lifecycle mutations and LocationManager callbacks execute on the main looper. Expo lifecycle
  attach/detach operations marshal there explicitly. The synchronous read is nonblocking and reads
  one immutable atomic observation.
- Explicit Start creates a random, one-use, ten-second permit in process memory. The service intent
  carries only that permit. Stop invalidates the generation before cleanup, so late service intents
  and callbacks cannot revive the old session. Duplicate Start shares the existing operation.
- The nonexported service returns `START_NOT_STICKY` on every branch and uses `stopWithTask=true`.
  No boot receiver, binding with auto-create, job, alarm, retry scheduler, location PendingIntent,
  saved registration or coordinate persistence exists in this module.
- The nonexported notification Stop receiver uses the same native controller as UI Stop. It needs
  neither JavaScript nor SQLite. Notification dismissal uses the same receiver, including platforms
  that allow users to dismiss ongoing notifications. No coordinates appear in notification/intents.
- LocationManager uses a process-bound listener. Only one current point is retained in RAM while
  the Activity is visible. Backgrounding and Stop clear it; foregrounding does not replay it.
  Metadata (sample count, fix age and accuracy) contains no coordinates.
- The internal asynchronous Expo `onLocation` event contains **only generation**, never coordinates.
  The TypeScript wrapper checks `AppState`, then synchronously pulls the current point. Native code
  checks the atomic generation/running/main-observed Activity visibility and monotonic age (30s).
  The real AndroidX `RESUMED` check occurs only on the main thread; the synchronous JS-thread
  getter never touches LifecycleRegistry or Activity/context APIs.
  Thus stalled JavaScript does not accumulate a coordinate payload queue. The application must
  additionally discard callbacks when its session generation or AppState changes and clear the map.
- Unexpected `removeUpdates` failure reports `STOP_CLEANUP_FAILED` and retains `subscribed=true`
  conservatively until cleanup can be retried; it does not assert a clean stop. No further fixes are
  accepted. A destroyed JS bridge cannot prevent native cleanup.

This boundary concerns this module and the included app code; it makes no assertion about Android
or a location provider's internal retention. Excluding the old Expo location/task-manager path and
inspecting the final APK are separate integration requirements. This module does not migrate or
delete historical coordinate payloads from a previously installed legacy version.

## Authorization tests

`WalkSession` is the public process-authorization seam used by the Android controller. Its
dependency-free JVM executable tests use explicit simulated monotonic times, not a fake Android
device. From a PowerShell checkout with the already cached compiler:

```powershell
& apps/mobile/modules/astana-active-walk/scripts/test-session.ps1 `
  -JdkRoot '<existing JDK 21 directory>' `
  -GradleCache '<existing Gradle cache directory>'
```

The script requires cached Kotlin 2.2.10 compiler/runtime artifacts and downloads nothing. It writes
only ignored `android/build/session-tests/`. Seven checks cover Stop before service delivery,
single-use permits, expiry, duplicate Start, stale callbacks/late completion, a fresh process/unknown
intent, and failures that cannot report running. The first six cases were observed failing before
their corresponding implementation; the failure case also verifies an explicit Stop clears error.

These tests do not exercise Android permission dialogs, notification UI, service creation,
LocationManager, screen-off delivery, process death, OEM battery behavior, or Expo event dispatch.
Native compilation, final APK component inspection, and clean-install physical-device acceptance
must be recorded by the integrator. Android 14+ admission/dismissal, legacy upgrade, reboot,
package replacement and field accuracy remain distinct gates if not actually tested.
