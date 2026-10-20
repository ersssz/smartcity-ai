# Native narration: Root integration contract

Новый production package для текущего продолжения T09. Последний запрос пользователя возобновляет реализацию плана; focused discovery/reading UX сохраняется, public profiles/rewards/download packs не добавляются. Этот пакет сам не меняет Manifest, Expo module, JS, GPS, SQLite или прежний foreground player. Root выполняет adoption и device acceptance отдельно.

Исходная основа:14 source pins из `work/background-audio-host-stage/VERIFICATION.json` независимо сверены перед переносом. Классы/package/action/channel переименованы из stage в `kz.astanaai.activewalk.narration`; latest approved captured MediaSession scope fix включён. Дополнения: pure Expo-facing Facade DTO и MAIN `NarrationCoordinator.observe()` для фактической позиции. Прежние stage receipts и файлы не меняются.

## Точный Interface

```kotlin
NarrationHost.createBridge(
  context: Context,
  smallIcon: Int,
  nativeVisible: () -> Boolean,
  onState: (Map<String, Any?>) -> Unit,
  sessionActivity: PendingIntent? = null,
): NarrationBridgeFacade

NarrationHost.stopIfInstalled(): Boolean // MAIN, no install/client/service allocation, audio-only

facade.captureScopeDto(): Map<String, Any?> // sync, immutable publication only, JS-thread safe
facade.getState(): Map<String, Any?>       // MAIN, current player position + DTO
facade.play(captured: Map<String, Any?>, ref: Map<String, Any?>): Map<String, Any?>
facade.pause(captured: Map<String, Any?>): Map<String, Any?>
facade.resume(captured: Map<String, Any?>): Map<String, Any?>
facade.stop(): Map<String, Any?>
facade.close(): Map<String, Any?>
```

Factory/commands/close/lifecycle — MAIN. На Root Expo module property использовать `@Volatile var narrationBridge: NarrationBridgeFacade?`, поскольку sync capture читается с JS thread, а registration/close происходят на MAIN. Перед готовностью Facade binding бросает typed `CodedException("NARRATION_UNAVAILABLE", ..., null)`, а не создаёт Facade с JS thread. Visibility closure использует настоящий native resumed Activity на MAIN; JS не передаёт boolean visibility.

Root bindings:

| Expo name | Native call | Return |
| --- | --- | --- |
| sync `narrationCaptureScope` | `captureScopeDto()` | captured scope |
| MAIN async `narrationPlay(captured,ref)` | `play` | command receipt |
| MAIN async `narrationPause(captured)` | `pause` | command receipt |
| MAIN async `narrationResume(captured)` | `resume` | command receipt |
| MAIN async `narrationStop` | `stop` | command receipt |
| MAIN async `narrationGetState` | `getState` | state DTO |
| `onNarrationState` event | factory `onState` callback | state DTO |

```ts
type CapturedScope = {
  host: { processNonce: string; requestEpoch: number };
  audio: { processId: string; playbackEpoch: number } | null;
};
type NarrationRef = {
  walkSessionId: string; bundleSha256: string;
  narrationId: string; locale: 'ru'|'kk'|'en';
  assetPath: `astana-audio/${string}.mp3`; assetSha256: string;
};
type CommandReceipt = { accepted: boolean; rejected: string|null; state: NarrationState };
type NarrationState = {
  status: 'stopped'|'loading'|'playing'|'paused'|'error';
  assetId: string|null; positionMs: number; durationMs: number;
  errorCode: string|null; generation: number; // process observer sequence, NOT CAS
  hostScope: CapturedScope['host']; audioScope: CapturedScope['audio'];
  hostPhase: 'ABSENT'|'STARTING'|'RUNNING'|'STOPPING'|'ERROR';
  canResume: boolean; pausedReason: string|null; serviceForeground: boolean;
  ref: NarrationRef|null;
};
```

Cold `accepted=true` means only a start request: actual Core absent, status=stopped, ref/assetId/audioScope=null, serviceForeground=false, hostPhase=STARTING. UI uses hostPhase for its loading indicator. Loading/playing states after actual Core admission carry its exact ref. `assetId` is derived from ref SHA. Two narration IDs may share an MP3: Resume must compare all six ref fields, not only assetId.

During STOPPING before cleanup has finished, an event can still expose previous playing/ref/foreground with audioScope=null: RAM admission is already revoked while hardware cleanup is being attempted. Final receipt describes actual cleanup; failures remain error. A repeated Stop never relabels unknown cleanup as confirmed stopped.

## JS callsite and lifecycle

At the explicit click, synchronously capture scope **before operate()/await**. Build the exact ref from the verified canonical bundle; if paused current state has the identical full ref, call Resume(captured), otherwise Play(captured,ref). Do not Stop before Play, refresh the scope inside Play, or retry a rejected stale command. An actual concurrent Stop wins.

The native coordinator increments requestEpoch before every admitted Play and before any Android effect. Host scope, AudioScope and eventSequence are separate. A fresh UUID runtime identity per Service instance prevents an epoch0 collision during same-process recreation. Client handles and permits use actual object identity, not strings supplied by JS.

Root Activity background updates visibility and cancels stale JS operations but **does not stop the selected new narration**. Explicit walk Stop/unmount/navigation/locale or chapter changes use the agreed Stop/Play behavior. Bridge OnDestroy first closes its native admission on MAIN, then releases its own client; an old bridge cannot stop a new current owner. Runtime release is terminal.

Root native `PreparedAudioOwner.stop()` must attempt old foreground cleanup and `NarrationHost.stopIfInstalled()` independently/in finally, including errors. The latter revokes pending Start before hardware cleanup and does not install a bridge. This is audio-only: any tracking lease/SQL progress remains a different Root-owned seam. No MediaSession/notification Resume starts GPS or changes progress.

## Service and Manifest adoption (Root only)

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<!-- Existing FOREGROUND_SERVICE remains; add no location/mic/storage/boot permission. -->
<service android:name="kz.astanaai.activewalk.narration.NarrationPlaybackService"
  android:exported="false" android:foregroundServiceType="mediaPlayback" />
<receiver android:name="kz.astanaai.activewalk.narration.NarrationMediaActionReceiver"
  android:exported="false" />
```

Use a real nonzero small notification icon, e.g. `android.R.drawable.ic_media_play`, and optionally an immutable explicit Activity PendingIntent owned by Root. Service has no binder/browser/exported action. Intent only contains fixed action and RAM nonce; ref and visibility authorization never come from Intent. Max one permit, TTL10seconds, conservative MAIN visibility recheck at consume. Hiding/locking before cold consume refuses start, without retry. Already-playing selected asset can continue when the screen locks.

Null/unknown/expired/duplicate starts stopSelf without creating runtime when no admitted live owner exists; they are ignored by an actual legitimate live owner. START_NOT_STICKY, no boot/WorkManager/alarm/remote URI/TTS/playlist/autoplay. MediaSession Stop and notification Stop are scoped audio-only. Old callbacks, including Stop, cannot borrow the latest scope. Pause releases player/focus/wake/FGS immediately, retains ref/position only in RAM for at most10minutes; gaining focus never resumes. Process death loses resumable audio. Completion does not start another chapter.

## Primary Android sources checked

[FGS types](https://developer.android.com/develop/background-work/services/fgs/service-types#media): mediaPlayback needs its type/normal permission for API34+ and has no runtime prerequisite. [Background-start limits](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start): API31+ visible-user start is the normal admitted path; denial is not bypassed. [Audio focus](https://developer.android.com/media/optimize/audio-focus): target35+ requires top app or FGS; this interpreter promotes FGS before focus, including explicit media Resume. [Notification permission](https://developer.android.com/develop/ui/views/notifications/notification-permission#exemptions): media-session notification exemption is not treated as proof that controls/channel are actually available. No permission prompt is issued by this package.

Source compile uses cached SDK37 stub while Root's app target is36; actual API31 behavior and API34+/target36 restrictions require separate device/emulator evidence. SDK compilation is not runtime acceptance.

## Checks

From workspace, `narration-tests/test-host.ps1` covers31host+7Facade+4MediaScope public scenarios. `test-machine.ps1 -JdkRoot ... -GradleCache ...` covers28machine+8runtime-core scenarios. The recording Android effects boundary is labeled; the actual reducer/runtime/coordinator/Facade execute in JVM tests. `compile-android.ps1` compiles all nine production Kotlin files plus existing APK verifier with cached Kotlin2.2.10/JDK17/SDK37, maxheap384MiB. No new/global dependencies or network/paid operations.

Root still must independently review/wire bindings, manifest, JS full-ref checks and global Stop, build/audit the APK and verify actual UI+audible offlineRU/KK/EN, locked screen, Pause/Resume/Stop, focus/noisy, no-GPS side effects, task dismissal, denied FGS and process/bridge recreation. No such phone check is claimed by this source package.
