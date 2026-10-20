# AstanaAI T01 · native diagnostic

This is the Android capability diagnostic for T01, not an accepted product beta or completed T01 gate. The current source replaces the legacy Expo location/task-manager collection path with the local Kotlin module [`astana-active-walk`](modules/astana-active-walk/README.md). The replacement compiled and its standalone APK 0.1.1 passed package/signature/class inspection. The connected Xiaomi Android 12/API 31 rejected the installation with `INSTALL_FAILED_USER_RESTRICTED`; the user chose manual installation later. It has not been launched or physically tested. Exact results: [`T01-EVIDENCE.md`](T01-EVIDENCE.md) and [`IMPLEMENTATION-STATUS.md`](../../docs/IMPLEMENTATION-STATUS.md).

The screen uses the real MapLibre Android module and public [OpenFreeMap](https://openfreemap.org/) Liberty style. Visible attribution links OpenFreeMap, OpenMapTiles and OpenStreetMap. It does not fabricate a walking route. The actual device marker exists only during an explicitly started diagnostic and expires after 30 seconds without a fresh observation. Map tile requests reveal the visible area to the tile provider; no separate GPS upload or generator API exists here.

`Start` first displays the diagnostic explanation, then requests While Using location access and, on Android 13+, notification permission. It calls the native adapter only after those checks. The native controller independently checks a resumed Activity, a compatible enabled provider and visible-notification eligibility. Always/background-location permission is not requested. `Pause` and `Stop` call the same native Stop before speech or SQLite work. Stop stays available when SQLite fails. SQLite stores a manual diagnostic counter, phase, foreground-observed sample count, accuracy and sample timestamp, without coordinates or a track. A manual test step is never a GPS visit or achievement.

System TTS voices are queried at runtime. RU/KK/EN play buttons are disabled with `unavailable` when a matching voice is absent. A voice's presence does not establish offline availability or permission to save recordings. No licensed audio package is included, no paid speech service is used, and background audio acceptance is open.

## Native lifecycle and open privacy gate

The local module exposes `start`, `stop`, `getState`, `onStateChanged` and `onLocation`. A successful Start requires foreground-service promotion and a real LocationManager listener registration. `running` describes that subscription, not a GPS fix or arrival. Fix age, accuracy, sample count, notification availability and permission precision are separately observable. Startup/resume reconciles local progress with native state; it does not start tracking. An interrupted durable active session becomes paused and needs another explicit Start.

The service is nonexported, uses `START_NOT_STICKY` and `stopWithTask=true`, and accepts only a one-use ten-second permit created by explicit Start in the current process. Generation checks reject late intents and callbacks after Stop. The notification's Stop action and dismissal action invoke a nonexported native receiver, without JavaScript or SQLite. If removal of a native subscription fails, the adapter reports `STOP_CLEANUP_FAILED` rather than reporting a clean stop. Provider, permission and notification revocation are checked during callbacks and every five seconds while running; detection is not instantaneous.

LocationManager uses a process-bound callback rather than a location PendingIntent. The module has no coordinate files, preferences, saved registration, job, alarm, boot restart or persisted coordinate queue. One current point is retained in RAM while the Activity is visible; backgrounding and Stop clear it, and foregrounding does not replay it. The asynchronous Expo event contains only a generation signal. The TypeScript wrapper synchronously pulls the current point after checking AppState; native code checks current generation, main-observed Activity visibility and monotonic fix age from an atomic snapshot. This avoids queued coordinate events when JS stalls. The UI additionally rejects a different generation or inactive AppState. These properties do not describe Android/system-provider internal retention; runtime checks remain open.

`package.json` excludes `expo-location` and `expo-task-manager` from Android autolinking. Their pinned packages remain in the lockfile initially, but current JS does not use them for collection. The native manifest removes background-location and boot permissions. Verify the generated module provider, merged manifest and APK to prove that no legacy TaskManager receiver/job service or Expo location service is included. An updated JS bundle alone cannot replace the old native binary.

**Historical defect:** the earlier T01 APK used Expo TaskManager registration/restore and an Expo Location adapter that serialized coordinates into persistent Android jobs before JS cleanup could reliably run. Its SQLite policy did not close that path. The findings and separate migration requirements remain in [`T01-NATIVE-PRIVACY-FOLLOWUP.md`](../../docs/T01-NATIVE-PRIVACY-FOLLOWUP.md). A clean install of the replacement cannot prove deletion of old jobs or payloads on a legacy installation; do not silently clear user data or patch private Expo preferences. Do not distribute any candidate as a privacy-accepted beta until its required gates pass.

## Reproduce without paid services

Use Node 22.22.2 (the pinned Expo/RN package engines permit it), npm and Git. Install only free official Android SDK tooling. No Expo account, EAS cloud, Google billing, paid model call or Play publishing is required for a local APK. `eas build --local` is not the Windows route.

```powershell
npm ci --no-audit --no-fund
npm run typecheck
npm run test:diagnostic
node .\node_modules\expo-modules-autolinking\bin\expo-modules-autolinking.js resolve --platform android --json
.\node_modules\.bin\expo.cmd export --platform android --max-workers 2 --output-dir dist-diagnostic
```

Run these commands from `apps/mobile`. The autolinking output must include `kz.astanaai.activewalk.ActiveWalkModule` and exclude the two legacy location/task-manager modules; it is one integration check, not final APK evidence. The native module also has seven dependency-free JVM tests for the process-local authorization seam:

```powershell
.\modules\astana-active-walk\scripts\test-session.ps1 `
  -JdkRoot 'ABSOLUTE_EXISTING_JDK_PATH' `
  -GradleCache 'ABSOLUTE_EXISTING_GRADLE_CACHE_PATH'
```

The tests use already cached Kotlin compiler/runtime JARs and simulated monotonic time, with no downloads. They cover pending Start cancellation, consumed/expired permits, duplicate Start, stale callbacks, fresh processes/unknown intents and failure states. They do not substitute for Android permission, service, notification, process-death or hardware checks.

The checked native project currently pins Gradle 9.4.1 with its official distribution SHA-256. Expo/RN resolve compile SDK 37, Build Tools 37.0.0, target SDK 36, NDK 27.1.12297006, min SDK 24 and New Architecture. Google lists the SDK platform as `platforms/android-37.0` in its current CLI. The generated project's actual values take precedence over generic setup guides that still list older platform versions.

The SDK's Ninja 1.10.2 fails on long React Native header paths in this Windows checkout. Use the separate official [Ninja 1.13.2 Windows ZIP](https://github.com/ninja-build/ninja/releases/download/v1.13.2/ninja-win.zip), leaving the SDK untouched. Its [official asset digest](https://api.github.com/repos/ninja-build/ninja/releases/tags/v1.13.2) is SHA-256 `07fc8261b42b20e71d1720b39068c2e14ffcee6396b76fb7a795fb460b78dc65` (291,570 bytes). Verify the archive before extracting. The script verifies the extracted executable's SHA-256 `e52a7ad9538d9618c67a0bd777964e2eec8a30f68b810a2f6adce1f2daf847b8`. Windows long-path policy must already be enabled; it is enabled on the measured host and the script never changes it. This is a host capability gate, not a promise that installing Ninja enables system policy.

```powershell
.\scripts\build-android.ps1 `
  -SdkRoot 'ABSOLUTE_TASK_SDK_PATH' `
  -JdkRoot 'ABSOLUTE_FREE_JDK_PATH' `
  -CacheRoot 'ABSOLUTE_TASK_GRADLE_CACHE_PATH' `
  -NativeStagingRoot 'ABSOLUTE_SHORT_TASK_CXX_PATH' `
  -NinjaPath 'ABSOLUTE_NINJA_1_13_2_EXE_PATH'
```

The script uses process-scoped environment changes, restores them on exit, checks 8 GiB free, builds `arm64-v8a` by default (`-Abi x86_64` is also supported), limits Gradle workers/heap and creates a local Android debug key if absent. That key uses public Android debug credentials and is ignored by Git. `NativeStagingRoot` must be a dedicated short task directory, outside source/SDK/JDK/Ninja/Gradle cache, for example this task's `work/n`. The script resolves the final absolute destination, rejects overlapping roots and uses an owner marker to reject a directory belonging to a different checkout. It never deletes another build root. The script does not download or launch an emulator, delete files or install on a phone. Build output is `android/app/build/outputs/apk/debug/app-debug.apk`.

Use `-BuildAction ConfigureNative -Variant Release` with the same path arguments for just the app/Expo CMake configuration gate. Both modules receive explicit `CMAKE_MAKE_PROGRAM` through supported Gradle CMake arguments; PATH alone is insufficient. A different Ninja selection must use a new staging directory because CMake does not define changing an initialized make-program variable. Confirm the generated CMake caches and AGP build/clean metadata point to the requested executable before accepting the override.

Debug APK uses the development client and Metro. An Android JS export validates bundling but does not turn that APK into a standalone app. Add `-Variant Release` to build a separate diagnostic release APK with embedded JavaScript in `android/app/build/outputs/apk/release/app-release.apk`. The diagnostic build disables R8/resource shrinking and caps Metro at two workers. Both variants use the local public debug signing identity: **NOT production signing**. A physical offline launch is a separate verification, and this diagnostic does not yet provide an offline map or a complete saved walk package.

The **previous, legacy-adapter Release APK** built on 20 October 2026 in 9 minutes 51 seconds. Root verified its embedded JavaScript, 18 ARM64 libraries, four DEX files and APK v2 signature. That 42,616,440-byte artifact has SHA-256 `23ea3f2a4cb44afa5c4eb18dffe54ed2aa9e42310c01112e459df52a16b5837d`; its historical evidence is [`release-apk.json`](../../evidence/t01/release-apk.json). It does not verify this new module or authorize reuse of the old APK for the replacement's acceptance. Record a new artifact identity and results after rebuilding the current source.

Native sources are kept intentionally so a clean clone can build the reviewed Android configuration directly. Windows native C++ compilation uses `CMAKE_OBJECT_PATH_MAX=200` to hash long object paths; the first Debug build failed without that setting and the incremental retry passed with it. The longer Release directory required the additional short `buildStagingDirectory` parameter: the app uses the supplied root, Expo Modules Core its separate `e` child. This also avoids Ninja incorrectly treating an existing long Prefab input as missing and endlessly regenerating the manifest. `npm run prebuild:android` is only for intentional native regeneration after plugin/configuration changes. It may overwrite native edits such as these CMake settings or the Gradle distribution checksum; review the diff and restore them before building. Generated exports, caches, SDK, `local.properties`, keys and APK files stay out of source commits.

## Physical acceptance

The connected Android 12/API 31 phone enables an initial **clean-install** check. Build and inspect the new APK first, record its SHA-256/device/OS, and confirm no legacy package data is being treated as a migration test. Check no collection before explicit Start, denial/coarse access/provider off, the visible native notification, Start/Stop/Pause, foreground/background behavior, task removal, forced process death/reopen, and no automatic restart.

Still separate and pending unless explicitly evidenced: native notification Stop with stalled/unavailable JS and broken SQLite; notification disabling/dismissal; Android 14+ while-in-use service restrictions and notification behavior; reboot/package replacement; and preservation/cleanup of an actual legacy installation without clearing data. The Android 12 device cannot pass the Android 14+ matrix.

Screen-off GPS delivery, OEM battery policy and a field walk also remain physical acceptance. Run at least 30 minutes with 20 minutes screen off, then record sample timing, accuracy and battery without raw coordinates in logs. Test RU/KK/EN offline playback and permitted map packaging separately. No build, TypeScript test or simulated JVM lifecycle test establishes these results.
