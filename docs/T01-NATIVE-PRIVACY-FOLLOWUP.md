# Non-persistent Android location adapter: bounded next ticket

Status: research and proposed implementation, 2026-10-20. No application code was changed, no builds or installs were run for this note. **No hardware, privacy, battery or field PASS.** This note does not change the approved product plan.

## Verified defect and scope

The current diagnostic uses Expo 58.0.16, expo-location 58.0.18 and expo-task-manager 58.0.12. Its README now correctly leaves the privacy gate open. Discarding coordinates in JavaScript/SQLite does not make this adapter memory-only.

All local source references below are relative to `apps/mobile/` in this repository and describe the installed files, not a tested APK:

| Evidence | Consequence |
|---|---|
| `node_modules/expo-task-manager/android/src/main/java/expo/modules/taskmanager/TaskService.java:83–90,550–590` restores persisted tasks in its native constructor; `TaskManagerPackage.java:15–41` supplies that service before JS is necessarily loaded. | JS cold-start cleanup cannot close the pre-JS window. |
| `node_modules/expo-location/android/src/main/java/expo/modules/location/taskConsumers/LocationTaskConsumer.kt:60–64,146–175` starts PendingIntent location updates during registration. | Restoring the consumer can register updates before the later foreground-service check. |
| `node_modules/expo-location/android/src/main/java/expo/modules/location/services/LocationTaskService.kt:34–40` returns `START_REDELIVER_INTENT`. | A new service with `START_NOT_STICKY` alone would leave this separate legacy path intact. |
| `LocationTaskConsumer.kt:351–375` serializes locations for scheduled jobs; `records/LocationResults.kt:125–127,164–170` includes latitude/longitude; `node_modules/expo-task-manager/android/src/main/java/expo/modules/taskmanager/TaskManagerUtils.java:202–205` uses `JobInfo.setPersisted(true)`. The first two paths have the same location package prefix as above. | Included application libraries hand precise coordinates to a durable OS job queue. Current SQLite schema does not prevent that. |
| TaskManager's Android manifest declares a boot/package-replaced receiver and `TaskJobService`; Location's manifest declares both legacy `LocationTaskService` and next `LocationForegroundService`. | Check all native components after replacement, not only the JS import. |
| `src/walkDiagnostic.ts:11,26–34,38–46,80` uses TaskManager registration as its observation; `App.tsx:83–93` also owns an Expo foreground location watcher. | Replace both collectors. Registration is not proof of live service health. |

**Proposed invariant:** our application and its included libraries do not write precise coordinates to files, SQLite, preferences, logs, crash payloads, persisted jobs, or Intent extras used as a durable location queue. No claim is made about the internal implementation or retention of Android/system location providers. Native acquisition uses a process-bound callback, with no app-owned persistent scheduler, saved tracking registration or coordinate backlog.

## Exact seam and removal of the legacy path

Use one Android-only **local Expo module**, `apps/mobile/modules/astana-active-walk/`. No manual ReactPackage/MainApplication patch and no node_modules edits. Existing `android/settings.gradle:24–37` already applies `expo-autolinking-settings` and `expoAutolinking.useExpoModules()`. Installed autolinking defaults `nativeModulesDir` to `./modules` (`node_modules/expo-modules-autolinking/src/commands/autolinkingOptions.ts:272–281`). Module discovery requires a local package with `expo-module.config.json`; its `android.modules` names the Kotlin class extending Expo `Module`. The TS boundary uses `requireNativeModule`. This matches [Expo's linking configuration](https://docs.expo.dev/modules/autolinking/), [module config](https://docs.expo.dev/modules/module-config/) and [Kotlin/JS module registration](https://docs.expo.dev/modules/existing-library/).

Future app configuration: set `expo.autolinking.android.exclude` in the mobile `package.json` to `["expo-location", "expo-task-manager"]`; remove their Android JS usages and the expo-location config plugin. Retain dependency versions/lockfile initially; exclusion is sufficient only after verification. Move While Using permission requests to existing RN `PermissionsAndroid`, and services/permission observations to the new native adapter. Remove app-owned `ACCESS_BACKGROUND_LOCATION` and `RECEIVE_BOOT_COMPLETED` declarations when no other required feature uses them. Do not request Always permission for this adapter.

**First implementation gate, before claiming a fix:** run the installed autolinking resolver and inspect its generated module provider, merged manifest and built APK. They must show the new module and no TaskManager native package/receiver/job service, nor either Expo location service. Preserve reviewed checked-native Gradle settings. A native rebuild is required; Metro reload cannot remove the old binary. Unexpected linkage is a blocker to investigate, not a reason to patch private Expo preferences.

## Small native contract

Expose `start()`, idempotent `stop()`, `getState()`, `onStateChanged`, and foreground-only `onLocation`. Keep all transitions on the main looper; installed Expo core supports `AsyncFunction(...).runOnQueue(Queues.MAIN)` (`BaseAsyncFunctionComponent.kt:8–24`), `appContext.currentActivity` and Activity foreground/background hooks (`ModuleDefinitionBuilder.kt:129–150`). These hooks observe visibility; none starts tracking.

State reports `stopped | starting | running | error`, actual foreground-promotion/subscription flags, permission precision, provider enabled state, and last-fix age/accuracy or `no-fix`. `running` means native subscription accepted, **not** a fresh/accurate GPS fix. No SQLite phase or TaskManager registration is treated as service health. `getState()` never creates/binds with auto-create to a service. The map consumes this adapter's memory events; no parallel watcher.

1. **Start admission:** only the explicit Start handler requests permissions. After dialogs finish, native code rechecks a currently resumed, non-destroyed Activity and enabled provider. It creates a short-lived, one-use permit and generation in process memory, then sends an explicit service start containing only the permit ID. Service consumes a matching unexpired permit; reject null/unknown/retry/redelivery without one. A fresh process has none. Start/Stop races invalidate permits and late callbacks. A JS import, Activity resume, notification content tap or restored SQLite phase never calls Start.
2. **Service:** nonexported, same process, manifest `foregroundServiceType="location"`, `stopWithTask="true"`. Promote immediately to foreground, then request `LocationManager` updates using a `LocationListener`/looper, **not** a location PendingIntent. Use enabled permission-compatible providers; coarse remains explicitly coarse. No new Play Services dependency or API key. [LocationManager](https://developer.android.com/reference/android/location/LocationManager) provides listener registration/removal. Resolve Start only after promotion/subscription succeeds; otherwise clean up and return a typed failure. Every `onStartCommand` branch returns `START_NOT_STICKY`; no retry scheduler.
3. **Native Stop:** notification action is an immutable, explicit `PendingIntent.getBroadcast` to a nonexported `StopReceiver` with no intent filter. It revokes permits, invalidates the generation, removes the live listener, clears current fix/events, removes the notification and calls `stopService`/`stopSelf`. It never starts a location service. UI Stop invokes the same controller before optional speech/SQLite work. It works with absent/stalled JS and broken SQLite; Stop with no service is harmless. No coordinates enter notification/intent payloads.
4. **Visibility and lifetime:** screen lock/Activity backgrounding preserves an explicitly started FGS, but stops forwarding coordinates to an inactive JS view; no replay buffer. Module/bridge recreation only reattaches state observers and never resumes. Task removal stops the service. Ordinary destruction removes subscriptions; process death safety does not depend on a callback: permits/state/listeners have no durable app-owned representation. Next launch reports stopped and requires a new Start; durable interrupted progress becomes paused after native observation.

`START_NOT_STICKY` prevents automatic recreation only when no new start intents are pending; the permit/no-scheduler rules are therefore also required. With `stopWithTask`, Android stops the service rather than calling `onTaskRemoved`. These are [Service API semantics](https://developer.android.com/reference/android/app/Service). Android 13's Active apps Stop kills the whole app without callbacks, while scheduled jobs/alarms may still run; this adapter creates neither. Test that action independently of notification Stop. [Android user-stop documentation](https://developer.android.com/develop/background-work/services/fgs/handle-user-stopping).

## Android 14+ prerequisites

Declare `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, coarse/fine and notification permissions, plus the service type. Start while the Activity is visible after While Using permission is granted; recheck after permission dialogs, and catch background-start/SecurityException races. A permission getter returning granted does not establish current while-in-use eligibility. Do not depend on a background-start exemption. [FGS location prerequisites](https://developer.android.com/develop/background-work/services/fgs/service-types#location), [while-in-use restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start).

Policy choice for this diagnostic: require enabled notifications and its tracking channel before Start, including Android 13+ runtime permission. Android itself allows FGS launch without `POST_NOTIFICATIONS`, but then its drawer notification can be hidden. Our requirement is a visible native Stop, so denial/channel blocking is a truthful blocked state, not a platform impossibility. If notifications/provider/permission are revoked mid-session, fail safely when observed; do not promise instantaneous detection. [Android notification permission](https://developer.android.com/develop/ui/compose/notifications/notification-permission).

## Bounded files and order

Future new files, rooted at `apps/mobile/modules/astana-active-walk/`:

- `package.json`, `expo-module.config.json`, `android/build.gradle` — existing Expo core/plugin only; no new runtime dependency.
- `android/src/main/AndroidManifest.xml`, `android/src/main/res/drawable/ic_walk.xml`.
- `android/src/main/java/kz/astanaai/activewalk/{ActiveWalkModule,ActiveWalkService,ActiveWalkController,StopReceiver}.kt`.
- `src/index.ts` — contract/wrapper; native transition tests under `android/src/test/`, lifecycle/device tests under `android/src/androidTest/` only with available test tooling.

Existing files to change in that future ticket: mobile `package.json` (autolinking), `app.json`/checked manifest (remove old background path), `src/walkDiagnostic.ts` and `App.tsx` (one collector and native truth), focused diagnostic tests and README. No unrelated plan/product/provider refactor. Implement in order: module-linkage spike → tested in-memory state/admission/Stop → callback service → JS integration → artifact inspection → device gate. Avoid installing test libraries merely to satisfy a checklist; document any execution gap.

## Required evidence and remaining risk

| Gate | Acceptance evidence |
|---|---|
| Native state tests | Stop defeats pending Start; duplicate Start creates one subscription; stale callbacks discarded; fresh controller rejects old/null/retried intents; permission/provider/start failures never report running. Stop requires no JS/store. |
| Build/static artifact | Installed resolver + generated provider + merged manifest/APK prove the expected module set. No legacy restore components, persisted scheduler/queue or coordinate persistence call in the new path; no app-owned background location permission. Compilation/JS tests pass. This is technical evidence only. |
| Clean-install device | No acquisition before explicit Start; Android 14+ While Using start; coarse/deny/provider-off/notifications-off; Start then Home/lock; notification Stop with JS unavailable and storage failing; no sample after Stop; swipe task; forced process death/reopen; Active apps Stop; reboot and package replacement. Record exact APK/device/OS. Validate native state against service/location observations without logging raw coordinates. |
| Legacy upgrade — separate blocker | First create a known old registration/job on an authorized test device, then update with data preserved. Prove no old component starts, old subscriptions/jobs no longer execute and pending coordinate payloads are cancelled through a reviewed migration. Public unregister/Stop before upgrade may help, but launching the old build can itself restore before JS. Clean install, excluded components or inaccessible jobs do **not** prove historical payload deletion. No private preference surgery or silent user-data clearing. |
| Field continuation | Screen-off delivery, precision, provider availability, battery and OEM process policy remain real-device/field gates. Framework LocationManager may differ from Expo's fused provider. Failure means stopped/stale and explicit restart, never an automatic recovery loop. |

There is no implementation or migration PASS from this note. The immediate deliverable is one scoped ticket: eliminate the persistent native route and expose truthful nonpersistent lifecycle controls; keep the privacy gate open until artifact and device evidence support it.
