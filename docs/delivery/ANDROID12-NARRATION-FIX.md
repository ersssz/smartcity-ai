# Android 12 narration startup failure

The first installed 0.6.0/code13 APK (`1eaf706`, SHA256 `105242b2c59499da60309e4af77e4966a4ce189dfad99c211fa688551712eeca`) passed source tests and static inspection but crashed on the actual Xiaomi API31 when Listen started the media service. It is retained as `AstanaAI-0.6.0-failed-device-test.apk`, not a ready delivery.

## Reproduction and diagnosis

The own-app Instrumentation sequence opens Bayterek, resumes the saved walk and presses Listen. The original run crashed in PID32739; the same warm-start sequence with bounded temporary diagnostics crashed in PID7781. A separate cold launcher-admission refusal did not reach playback and is not counted as a reproduction.

The recorded exception is `ForegroundServiceDidNotStartInTimeException`. The diagnostic trace confirms that the native start permit was accepted, then foreground promotion encountered `NullPointerException` during MediaSession setup. No location, narration text, permit value or exception message was logged.

Two Android12 platform paths explain the chain:

- The nullable `setMediaButtonBroadcastReceiver(null)` call reaches a server-side constructor that dereferences the missing ComponentName. The older nullable PendingIntent overload explicitly handles null. See [MediaSessionRecord](https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/android12-release/services/core/java/com/android/server/media/MediaSessionRecord.java) and [MediaButtonReceiverHolder](https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/android12-release/services/core/java/com/android/server/media/MediaButtonReceiverHolder.java).
- Android12 can crash an FGS-started process when its service is stopped before acknowledging `startForeground`, including an immediate cancellation. See [ActiveServices](https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/android12-release/services/core/java/com/android/server/am/ActiveServices.java).

## Source correction

Commit `c5b45ff1f422e9b461957356847d826db730d635` uses the documented nullable PendingIntent clearing path. The service first acknowledges Android with a passive preparation notification, without granting playback authority or creating a player, MediaSession, audio focus, wake lock or controls. Only an admitted native permit creates the real runtime. Rejected and cancelled starts still do not play anything.

Bootstrap failure is reported as `FOREGROUND_BOOTSTRAP_FAILED`; its late delivery retains that error. Service cleanup uses its own `stopForeground`, without cancelling a potentially shared notification ID. All temporary diagnostic statements were removed. The bootstrap notification follows the device language; selected narration follows the app language.

Three added native regressions cover failure/revocation, late delivery and isolation from another service owner. Final native host/Facade/media tests total46; the unchanged reducer/runtime tests total36. JVM and static APK checks do not substitute for the repeated Android reproduction. The final installed APK evidence is recorded separately in the release delivery report.
