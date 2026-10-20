# AstanaAI T01 · native diagnostic

This is the Android capability diagnostic for T01, not an accepted product beta or completed T01 gate. No phone is available on the implementation night. Actual device installation, foreground notification, locked-screen GPS, battery, process death, offline map and offline RU/KK/EN audio remain pending.

The screen uses the real MapLibre Android module and public [OpenFreeMap](https://openfreemap.org/) Liberty style. Visible attribution links OpenFreeMap, OpenMapTiles and OpenStreetMap. It does not fabricate a walking route. The actual device marker exists only during an explicitly started diagnostic and expires after 30 seconds without a fresh observation. Map tile requests reveal the visible area to the tile provider; no separate GPS upload or generator API exists here.

`Start` requests foreground location and notification access, then calls the installed Expo SDK's user-initiated foreground service. It first tests While Using permission. Always permission is a separately explained optional diagnostic. `Pause` and `Stop` remove the screen observer and unregister the location task. Stop remains available when SQLite fails. Our SQLite stores a diagnostic manual counter, phase, sample count, accuracy and sample timestamp, without precise coordinates or a track. This does not cover Expo/Android's own persisted location job queue, described below. A manual test step is never a GPS visit or achievement.

System TTS voices are queried at runtime. RU/KK/EN play buttons are disabled with `unavailable` when a matching voice is absent. A voice's presence does not establish offline availability or permission to save recordings. No licensed audio package is included, no paid speech service is used, and background audio acceptance is open.

## Open privacy gate

Expo TaskManager persists registrations and may restore a location consumer natively before JavaScript runs. `hasStartedLocationUpdatesAsync` means registration, not live foreground service health. This diagnostic stops registered location at cold JS startup before reading SQLite and changes an interrupted durable active state to paused. That cleanup does **not** prove the absence of a pre-JS restore window. Do not distribute this diagnostic as a privacy-accepted beta.

The installed Expo Location adapter also puts complete location bundles into Android jobs, and TaskManager creates those jobs with `setPersisted(true)`. The framework/OS queue may therefore persist precise coordinates even though our SQLite discards them. A mandatory explanation before Start identifies this as a laboratory test, warns about persistence/restore, and requires the user to choose whether to launch the test. The same limitation is visible in the status card; no claim that precise position exists only in memory is valid for this candidate adapter. Queue cleanup/retention and a replacement without app-owned coordinate persistence are unresolved parts of the privacy gate.

The next native scope is a small non-persistent Kotlin foreground adapter: in-process Start consent, `START_NOT_STICKY`, no saved tracking registration, cleanup on process/task termination, a native notification Stop action independent of JS/SQLite, and an observable service state. It must be compiled and checked on real Android hardware before replacing this gate with PASS. Do not patch private Expo preferences as a shortcut.

## Reproduce without paid services

Use Node 22.22.2 (the pinned Expo/RN package engines permit it), npm and Git. Install only free official Android SDK tooling. No Expo account, EAS cloud, Google billing, paid model call or Play publishing is required for a local APK. `eas build --local` is not the Windows route.

```powershell
npm ci --no-audit --no-fund
npm run typecheck
npm run test:diagnostic
npx expo export --platform android --max-workers 2 --output-dir dist-diagnostic
```

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

The script uses process-scoped environment changes, restores them on exit, checks 8 GiB free, builds only `arm64-v8a`, limits Gradle workers/heap and creates a local Android debug key if absent. That key uses public Android debug credentials and is ignored by Git. `NativeStagingRoot` must be a dedicated short task directory, outside source/SDK/JDK/Ninja/Gradle cache, for example this task's `work/n`. The script resolves the final absolute destination, rejects overlapping roots and uses an owner marker to reject a directory belonging to a different checkout. It never deletes another build root. The script does not download or launch an emulator, delete files or install on a phone. Build output is `android/app/build/outputs/apk/debug/app-debug.apk`.

Use `-BuildAction ConfigureNative -Variant Release` with the same path arguments for just the app/Expo CMake configuration gate. Both modules receive explicit `CMAKE_MAKE_PROGRAM` through supported Gradle CMake arguments; PATH alone is insufficient. A different Ninja selection must use a new staging directory because CMake does not define changing an initialized make-program variable. Confirm the generated CMake caches and AGP build/clean metadata point to the requested executable before accepting the override.

Debug APK uses the development client and Metro. An Android JS export validates bundling but does not turn that APK into a standalone app. Add `-Variant Release` to build a separate diagnostic release APK with embedded JavaScript in `android/app/build/outputs/apk/release/app-release.apk`. The diagnostic build disables R8/resource shrinking and caps Metro at two workers. Both variants use the local public debug signing identity: **NOT production signing**. A physical offline launch remains a distinct verification; no phone is available today.

The complete Release build passed on 20 October 2026 in 9 minutes 51 seconds. Root verified the standalone diagnostic APK's embedded JavaScript, 18 ARM64 libraries, four DEX files and APK v2 signature. The 42,616,440-byte delivery has SHA-256 `23ea3f2a4cb44afa5c4eb18dffe54ed2aa9e42310c01112e459df52a16b5837d`. See `../../evidence/t01/release-apk.json` for the measured artifact. This confirms the build and package contents; Android runtime and the privacy gate remain open.

Native sources are kept intentionally so a clean clone can build the reviewed Android configuration directly. Windows native C++ compilation uses `CMAKE_OBJECT_PATH_MAX=200` to hash long object paths; the first Debug build failed without that setting and the incremental retry passed with it. The longer Release directory required the additional short `buildStagingDirectory` parameter: the app uses the supplied root, Expo Modules Core its separate `e` child. This also avoids Ninja incorrectly treating an existing long Prefab input as missing and endlessly regenerating the manifest. `npm run prebuild:android` is only for intentional native regeneration after plugin/configuration changes. It may overwrite native edits such as these CMake settings or the Gradle distribution checksum; review the diff and restore them before building. Generated exports, caches, SDK, `local.properties`, keys and APK files stay out of source commits.

## Phone checklist for later

Connect and authorize a physical Android, install the exact APK and record device/app versions. Verify permission denial/coarse permission/GPS off, foreground notification, Stop with storage failure, forced process death/reopen, and the no-auto-resume privacy gate. Test at least 30 minutes with 20 minutes screen off, then record actual timestamps/accuracy/battery. Test RU/KK/EN while offline and permitted map packaging separately. None of those results can be inferred from a successful build.
