# Статический аудит APK AstanaAI

Проверено: 2026-10-20T17:42:55.408977+00:00. Статус: **PASS_STATIC**.

Этап сборки: `final-0.6.1-narration-bootstrap`. Это аудит конкретного APK; после финальной пересборки его нужно повторить.

Исходный commit, назначенный владельцем сборки: `c5b45ff1f422e9b461957356847d826db730d635`. Статический аудит не доказывает воспроизводимость сборки из исходников.

Обязательный статический контроль background narration: **включён**. При включении проверены merged mediaPlayback service/receiver/permissions и определения шести narration-классов с кодом. Работа на Android этим не подтверждается.

APK: `C:\Users\era\Documents\Codex\2026-10-20\x20\outputs\AstanaAI\apps\mobile\android\app\build\outputs\apk\release\app-release.apk`
Размер: **54,046,595 байт**. SHA-256: `ac550e02efa855c5c8b2c9209b110d511495ca5818ba5101f791e7c9722b0712`.

Пакет `kz.astanaai.diagnostics`, версия **0.6.1 / 14**, min SDK 24, target SDK 36.

Встроенные native ABI: `arm64-v8a`; совместимость других архитектур не заявляется.

Проверок: 94; PASS 94; FAIL 0.

## Фактические результаты

- Внутри APK проверены все **54/54 MP3**, **9,793,210 байт**, locale: `{'ru': 18, 'kk': 18, 'en': 18}`. Для каждого сверены реальные потоковые SHA-256, байты, точный путь и ZIP_STORED (0). Список MP3 совпадает с реестром.
- Реестр SHA-256: `959e466442bbe090a8523f0d88607454706ce67d2e7e763e6b4798587ab71925`; manifest: `f4f0e5c4d5ec40316c01fcad554942f561c563c133ad1d72d1ca053e15ba58c6`.
- Подпись проверена локальным apksigner; точные схемы и публичные отпечатки ниже. Debug certificate не является производственной подписью.
- В DEX проверены class_def и методы с code offset для Module, Verifier, Player и Owner. Это сильнее поиска строк, но не доказательство выполнения методов.
- Hermes bundle: **2,259,740 байт**, версия bytecode `99`, SHA-256 `02cba061691fcdde7ffc9e1786f28dcc7a1cf5c6b18970c5084893bbf57c2a0f`. Совпадений audio hash 54/54, text hash 54/54.
- Проверены allowBackup=false, отсутствие debuggable=true, запрещённых background/boot/storage/overlay permissions, экспорт сервиса и StopReceiver, location FGS type, stopWithTask и отключение Expo Updates.
- В APK есть соответствующие реестру credits RU/KK/EN и полный GPL-текст.
- APK и реестр не изменились между началом и концом аудита. Полной распаковки, установки и запуска APK не было.

## Подпись

```text
Verifies
Verified using v1 scheme (JAR signing): false
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): false
Verified using v3.1 scheme (APK Signature Scheme v3.1): false
Verified using v3.2 scheme (APK Signature Scheme v3.2): false
Verified using v4 scheme (APK Signature Scheme v4): false
Verified for SourceStamp: false
Number of signers: 1
V2 Signer: certificate DN: CN=Android Debug, OU=Android, O=Unknown, L=Unknown, ST=Unknown, C=US
V2 Signer: certificate SHA-256 digest: fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c
V2 Signer: certificate SHA-1 digest: 5e8f16062ea3cd2c4a0d547876baa6f38cabf625
V2 Signer: certificate MD5 digest: 20f46148b72d8e5e5ca23d37a4f41490
V2 Signer: key algorithm: RSA
V2 Signer: key size (bits): 2048
V2 Signer: public key SHA-256 digest: 06104aa0b28fac286bae06b08313ac69c37c35a6462853db32d2ec5fa7b1ed0e
V2 Signer: public key SHA-1 digest: 88325602a013a12d5ac13516c609aa57ce9e2234
V2 Signer: public key MD5 digest: 49921988ad9941656cd9b95203196f17
```

## Объявленные permissions

- `android.permission.ACCESS_COARSE_LOCATION`
- `android.permission.ACCESS_FINE_LOCATION`
- `android.permission.FOREGROUND_SERVICE`
- `android.permission.FOREGROUND_SERVICE_LOCATION`
- `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK`
- `android.permission.WAKE_LOCK`
- `android.permission.INTERNET`
- `android.permission.POST_NOTIFICATIONS`
- `android.permission.VIBRATE`
- `android.permission.ACCESS_NETWORK_STATE`
- `android.permission.ACCESS_WIFI_STATE`
- `kz.astanaai.diagnostics.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`

## Определения классов

| Класс | DEX | Методы с кодом |
| --- | --- | --- |
| `ActiveWalkModule` | `classes3.dex` | `<init>, access$audio, access$getDisposed$p, access$getMain$p, access$getNarrationBridge$p, access$getObserver$p, access$getPreparedPlayer$p, access$narration, access$resumed, access$setDisposed$p, access$setNarrationBridge$p, access$setPreparedPlayer$p, audio, audio$lambda$2, definition, narration, resumed` |
| `PreparedAssetVerifier` | `classes3.dex` | `<clinit>, <init>, hashUtf8, hex, hex$lambda$1, verify` |
| `PreparedAudioOwner` | `classes3.dex` | `<clinit>, <init>, detach, detach$lambda$5, register, register$lambda$0, stop, stop$lambda$10` |
| `PreparedAudioPlayer` | `classes3.dex` | `<init>, abandonFocus, access$getDisposed$p, canPlay, capturePosition, checkMain, clearResources, current, fail, getState, pause, play, play$lambda$5, play$lambda$5$lambda$3, play$lambda$5$lambda$4, prepare, prepare$lambda$6, prepare$lambda$7, prepare$lambda$8, publish, registerNoisy, release, releasedState, requestFocus, requestFocus$lambda$11, requestFocus$lambda$11$lambda$10, setForeground, snapshot, stop, unregisterNoisy, worker$lambda$1` |
| `narration/AndroidNarrationEffects` | `classes3.dex` | `<clinit>, <init>, access$cancelJobs, access$getCurrent$p, access$getDispatch$p, access$getReleased$p, access$releaseFocus, access$releasePlayer, access$unregisterNoisy, access$updateSession$authorized, alive, apply, apply$lambda$5, cancelJobs, capturePosition, checkMain, createSession, executor$lambda$1, notification, positionMs, post, post$lambda$32, prepare, prepare$lambda$20, prepare$lambda$20$lambda$19, prepare$lambda$21, prepare$lambda$22, promote, promote$lambda$16, registerNoisy, release, release$clean, release$lambda$11, release$lambda$12, release$lambda$13, releaseFocus, releasePlayer, requestFocus, requestFocus$lambda$26, requestFocus$lambda$26$lambda$25, start, unregisterNoisy, updateSession, updateSession$authorized, validPlayer, verify, verify$lambda$18` |
| `narration/NarrationBridgeFacade` | `classes3.dex` | `<init>, _init_$lambda$0, audioDto, captureScopeDto, close, control, getState, hostDto, pause, play, receipt, refused, resume, stateDto, stop, unsubscribe$lambda$1` |
| `narration/NarrationCoordinator` | `classes3.dex` | `<clinit>, <init>, _init_$lambda$0, access$visibleId, closeCurrent, closeCurrent$default, commandError, consumeStart, consumeStart$lambda$6, control, detachClient, detachClient$lambda$7, observe, onAudio, onServiceBootstrapFailed, onServiceCreated, onServiceDestroyed, pause, play, publish, registerClient, reject, releaseUnowned, resume, snapshot, stopAudio, subscribe, subscribe$lambda$9, taskRemoved, valid, visible, visibleId` |
| `narration/NarrationHost` | `classes3.dex` | `<clinit>, <init>, access$checkMain, checkMain, createBridge, createBridge$default, existing, install, install$default, install$lambda$0, stopIfInstalled` |
| `narration/NarrationMediaActionReceiver` | `classes3.dex` | `<init>, onReceive` |
| `narration/NarrationPlaybackService` | `classes3.dex` | `<clinit>, <init>, acknowledgeForeground, onBind, onCreate, onDestroy, onStartCommand, onTaskRemoved` |

## Границы результата

- Static archive/manifest/signature/class definition evidence, not Android execution.
- DEX method bodies were not decompiled or executed; class existence does not prove lifecycle semantics.
- Hermes string/hash presence does not prove code reachability or React rendering.
- Audio hashes validate bytes, not pronunciation or human quality.
- Android Debug certificate is for development; production signing/distribution is not accepted.
- Any rebuild changes artifact identity and requires this audit again.
- Полная offline-карта, GPS, Android SQLite restore, audio focus/noisy/background/recreation, полевые и языковые проверки этим аудитом не принимаются.

## Воспроизводимость

Полная квитанция с 54 строками аудио, командами, stdout и hash инструментов: `evidence\narration\APK-STATIC-AUDIT-0.6.1.json`.
SHA-256 скрипта: `2b388e1b66261aae7b814549643d299b54bc0b9fa27e2dbca77a5bf7b101c380`. Использованы только уже установленные Python/JDK/Android SDK.
