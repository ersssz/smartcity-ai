# Android 12 observations: independent evidence review

2026-10-20. The root agent operates the phone; this reviewer performs no ADB/device actions. All statements distinguish saved evidence personally read from operator-reported observations.

## Initial launch

- Root reports installed APK hash `f1a7bf073e4a21266f0dbaf75932136556adec55095c1014eb4c1b37a90edf90`, package `kz.astanaai.diagnostics`, version 0.1.1/code 2, Android 12/API 31, app focused.
- Independently viewed `work/native-device/first-launch-stopped.png`: T01.1 UI, rendered online Astana map with attribution, stopped status, no location permission, OS subscription off, zero samples and no last-fix data.
- Root reports target-package ActivityManager service observation shows no own service. This is separate from the screenshot and has not been independently repeated by this reviewer.
- These establish installed/launch and initial stopped UI/absence of an own foreground service as observed. They do not establish delivery of GPS fixes or absence of every possible OS listener.

## Explicit Start and provider delivery

Independently read the saved `evidence/t01/android12-runtime-20261020.json`. It identifies the same APK hash and contains the root operator's device observations; this reviewer did not repeat the device operations.

- At 08:36:04 UTC, explicit user Start and permission grant led to native `ActiveWalkService`, OS foreground status, notification ID 7011 with one action, and at least three foreground provider callbacks.
- At 08:37:48 UTC, the app reported running, subscription on, nine native samples, last fix six seconds old, reported accuracy 100 m, fine permission and one manual progress step. The own foreground service remained present.
- **PASS, bounded:** explicit Start, native foreground registration and real foreground provider delivery. Fine permission is not evidence of precise GNSS measurements; reported 100 m accuracy does not clear outdoor navigation/arrival accuracy.
- The latest evidence has removed the stale pending Start item and explicitly retains `field_accuracy_accepted: false` and `full_t01_accepted: false`.

## First attempted screen-off interval

Independently read both `work/native-device/screen-off-monitor.json` and the saved `evidence/t01/android12-first-power-probe.json`.

- All ten sampled observations from 08:37:25 to 08:38:57 UTC (elapsed 0.3–91.9 seconds) say `mWakefulness=Awake`; display state is null.
- The own service is present and foreground at all sampled times.
- **Screen-off acceptance: NOT EXECUTED / PENDING.** This evidence supports sampled service continuity while awake. It does not establish a lock interval, screen-off location delivery or a product failure.
- Do not reuse the nine-sample foreground observation as the post-lock result. A new lock case needs a confirmed sleeping interval and independently recorded before/after metadata. If another test interrupts the waiting period, label that intervention and keep the lock case pending.

## Second probe: noninteractive Dozing observed

Read the completed six-observation `work/native-device/screen-off-confirmed-monitor.json` and the added runtime cases.

- The first four observations (08:41:20–08:41:51 UTC) say `mWakefulness=Dozing`, with unchanged `mLastSleepTime=3580186`; elapsed time since sleep increases from 49.3 to 79.9 seconds.
- The last two observations are Awake with `mLastWakeTime=3661197`. The OS sleep-to-wake interval is therefore **81,011 ms**. Own service presence and OS foreground status remain true in all six observations.
- **PASS, bounded service lifetime:** native foreground service survives the observed noninteractive Dozing/AOD period. Complete display OFF, long background reliability and battery behavior are not established.
- Runtime evidence records native count 24 after return (previously nine), last fix 15 seconds old and reported accuracy 100 m. The root operator observed that the phone had already been awake about 18.5 seconds at the related power read. These observations do not isolate callbacks specifically during sleep; the recorded `NOT_ISOLATED` limitation is correct.

## Native notification Stop while backgrounded

The saved runtime cases record Home backgrounding, a visible AstanaAI ongoing notification and the user's explicit native Stop action. Root separately reports checking own-service absence **before** issuing any force-stop.

- After the notification action, the own service is absent.
- Reopening without Start shows paused, subscription off, native sample count zero and no last fix.
- **PASS, bounded:** the actual notification action stopped the backgrounded active service, and app return did not resume it. The subsequent force-stop did not produce this result because own-service absence was observed first.
- The earlier visibility-only case's `WAITING_FOR_USER` describes that earlier point in the sequence; the later Stop case supplies the completed action.
- This is not a test of stalled JS, SQLite failure or independent enumeration of every OS location listener. Those limitations remain explicit in evidence.

## Force-stop of the already paused process, then relaunch

The saved runtime case records `am force-stop` after notification Stop, PID absence, a new activity on relaunch, paused state, subscription off, zero native samples and no own foreground service.

- **PASS, narrowly:** the previously stopped session does not restart after an actual process termination and relaunch.
- The active walk had already stopped. This is not active-session process-death, task-removal, notification-Stop or Android 13 Active apps Stop acceptance.
- **PASS, manual progress durability:** independently viewed `evidence/t01/android12-progress-after-restart.png` and read the final runtime JSON. The screenshot visibly shows “1 ручных тестовых шагов”, 21 persisted foreground metadata samples, zero current-session samples and no last fix. The JSON records subscription off and own service absent. The manual counter is therefore still one after the recorded process termination/relaunch, without clearing user data.
- The screenshot's fixed instructional sentence “На устройстве это ещё не проверено” predates this device series. It is not a dynamic test result and does not invalidate the newly captured runtime evidence; refresh that copy in a later build.

## Issue found from actual UI

**P2 wording:** the UI shows “GPS: выключен” when permission is absent. Native `providerEnabled` actually means an enabled provider compatible with current app permission; it is false when permission is denied even if the phone's global location switch is on. Do not use that label as evidence of the global provider switch. Root was notified; fix copy after this fixed-APK test series, without invalidating current artifact identity.

ADB touch injection was denied by Xiaomi's `INJECT_EVENTS` policy. This is a device-control limitation, not an application failure. Root requested manual Start/While Using and preserved security settings.

## Remaining bounded work today

The bounded device series is complete, including the visible manual counter after restart. No new critical contradiction was found in the bounded claims. Start, observed Dozing service survival, native notification Stop, paused-process restart and manual progress durability can be reported with the limits above. The final runtime JSON records the app location service stopped and keeps `full_t01_accepted: false`.

Active-session process death and task removal remain pending; adding them now is not required to accurately report the completed series. Permission variants, channel blocking and field checks belong to a later device series rather than repeatedly changing personal-device settings now.

Home/backgrounding does not establish stalled JS. No standalone-release mechanism currently isolates Hermes from the same-process receiver/main looper; leave JS-stall plus storage failure on the phone unexecuted. Android 13 Active apps Stop, Android 14 notification dismissal, legacy upgrade payload cleanup, reboot and long field/battery gates remain separate and unexecuted unless actual new evidence is collected.

No precise coordinates, general personal logs, unrelated app screenshots or unfiltered location dumps belong in saved evidence.
