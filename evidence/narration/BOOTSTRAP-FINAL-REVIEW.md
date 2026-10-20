# Independent final narration bootstrap review

Date: 2026-10-20. Reviewer: `/root/planner_contract_design/historical_graph_inventory`. Reviewed actual frozen application source at **c5b45ff1f422e9b461957356847d826db730d635**, comparing the three-file delta with the previously reviewed `1eaf706a842d7e7e33bb8444d8064776176b7cd4`.

**No confirmed remaining source finding in this bounded bootstrap/null-clear delta.** This is an independent source review. This pass did not run JVM/TSX suites, Gradle, APK commands or phone actions.

## Concrete checks

- `NarrationPlaybackService.onCreate` synchronously calls the real passive foreground acknowledgement immediately after `super.onCreate`, before owner registration, permit consumption or an early stop. The notification uses the existing channel/ID, a valid fixed icon, low-importance channel, private visibility and a neutral preparing message. It creates no MediaSession, player, focus, wake lock, narration ref or transport actions. API29+ passes the declared mediaPlayback type; earlier APIs use the two-argument call.
- A successful OS acknowledgement grants no playback permission. Service captures only `NarrationHost.existing()`; it cannot install an owner. `bootstrapReady` and actual owner registration gate `onStartCommand`, and the unchanged coordinator still requires the one-use RAM permit and actual Service identity before creating runtime. Service remains START_NOT_STICKY with no binder.
- Failed acknowledgement cannot proceed to consume. For its registered identity, `onServiceBootstrapFailed` revokes pending authority through `closeCurrent` and publishes the fixed `FOREGROUND_BOOTSTRAP_FAILED` error. A foreign/old instance only requests stopping itself and cannot revoke another owner's state. A late direct consume after failure preserves that fixed error instead of replacing it with an incidental rejection. Added public regressions cover revocation before cleanup, foreign identity, reentrant observers, late consume and preservation through destruction.
- Duplicate/null/malformed commands to an admitted live Service still pass through the existing consume rejection that preserves its active owner; bootstrap is not rerun in onStartCommand and those rejections do not remove the real runtime notification.
- `onDestroy` attempts owner teardown, then independently clears local ownership flags and calls this Service's `stopForeground(STOP_FOREGROUND_REMOVE)` in finally; `super.onDestroy` is also in finally. This covers no-owner and unadmitted passive bootstrap cleanup. There is no Service-level global NotificationManager cancellation of the shared notification ID. Runtime cleanup remains owned by the actual runtime.
- `AndroidNarrationEffects.createSession` now calls only the deprecated nullable PendingIntent `setMediaButtonReceiver(null)` on every API. The API31 ComponentName broadcast-receiver overload was removed. No replacement receiver/restart intent, auto-resume or extra permissions were added.
- The three current source files contain no temporary AstanaNarrationProbe / DEBUG-narration startup logging. Failure state remains a bounded fixed code; no exception message, ref or location is logged by this delta.

## Primary-source correspondence

The earlier official Android12 ActiveServices check established that `startForeground` clears fgRequired/fgWaiting and the pending timeout, while bringing a service down with fgRequired still set queues a foreground-service crash. The passive acknowledgement addresses that exact early-stop branch: [AOSP android-12.0.0_r1 ActiveServices.java, lines 1730-1738 and 4191-4215](https://android.googlesource.com/platform/frameworks/base/+/android-12.0.0_r1/services/core/java/com/android/server/am/ActiveServices.java). Source SHA-256 `e6a05f702cb7ab594545b2d8a9a228346b9845756e8245a0465d1139c1f3020d`.

This pass independently fetched the official [AOSP Android12 MediaButtonReceiverHolder.java](https://android.googlesource.com/platform/frameworks/base/+/android-12.0.0_r1/services/core/java/com/android/server/media/MediaButtonReceiverHolder.java): the PendingIntent create overload returns null explicitly at lines 114-115, whereas the ComponentName overload constructs a holder at lines 131-133. Source SHA-256 `7ff9b97c2595530033cb850110be851961149854fc71049ecb7c2d29a1ca740a`. This supports the selected legacy null-clear path and preserves disabled process-death media restart.

## Frozen byte pins

Independently read disk bytes and compared all four files to `git show c5b45ff:<path>`: **4/4 exact matches**.

| File under apps/mobile/modules/astana-active-walk | Bytes | SHA-256 |
|---|---:|---|
| android/src/main/java/kz/astanaai/activewalk/narration/NarrationPlaybackService.kt | 8404 | `fb6e369ca272fb12bdaf0e3c1e084760a920b9da7051aed82267f805e39e7251` |
| android/src/main/java/kz/astanaai/activewalk/narration/NarrationCoordinator.kt | 16171 | `43932ba1ad957694aaa7f4fa83d3152e6872b30d7267327a0db33478ea7af80c` |
| android/src/main/java/kz/astanaai/activewalk/narration/AndroidNarrationEffects.kt | 17539 | `aef4754b795175f33e318c630d8c499d6cb42974636d17fcfebb25454db57cd5` |
| narration-tests/NarrationCoordinatorTest.kt | 27458 | `0e59856fb64464f7dc2b7b435ed8acd55cbe9114775f192f760ff620ddb7790a` |

## Evidence boundary

Author/Root separately report **46 host/Facade/media groups**, standalone Android compilation, Root's direct JAR checks and a real Android12 0.6.1 reproduction sequence including Play/wait/Pause/Resume/Stop. Those are their execution evidence, not tests or phone actions performed by this reviewer. Earlier independent review results remain tied to their original source freezes.

The review found no source reason to block this delta. A bootstrap promotion failure is still a genuine failure: no automatic retry, fake grant or playback fallback is justified. This code does not guarantee successful promotion under every system restriction, permission condition or vendor failure. Broader Android14+, battery, Bluetooth and field acceptance are unchanged by this source review.

Only this report was written. No application/test source, APK, phone, friend-control tool, account, key, purchase or paid API was touched. Public primary AOSP sources were read with verified HTTPS.
