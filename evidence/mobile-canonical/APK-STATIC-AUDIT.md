# Статический аудит APK AstanaAI

Проверено: 2026-10-20T15:29:46.706988+00:00. Статус: **PASS_STATIC**.

Этап сборки: `final-incremental`. Это аудит конкретного APK; после финальной пересборки его нужно повторить.

Исходный commit, назначенный владельцем сборки: `18378ffe71e36aea4e932e63fa9c9f4670c7f62c`. Статический аудит не доказывает воспроизводимость сборки из исходников.

APK: `C:\Users\era\Documents\Codex\2026-10-20\x20\outputs\AstanaAI\apps\mobile\android\app\build\outputs\apk\release\app-release.apk`
Размер: **52,530,907 байт**. SHA-256: `3ae8d9092531d746f65ff5bb96be60f735dea34d1531057497fee8ba38fa65a2`.

Пакет `kz.astanaai.diagnostics`, версия **0.4.0 / 10**, min SDK 24, target SDK 36.

Встроенные native ABI: `arm64-v8a`; совместимость других архитектур не заявляется.

Проверок: 84; PASS 84; FAIL 0.

## Фактические результаты

- Внутри APK проверены все **54/54 MP3**, **9,793,210 байт**, locale: `{'ru': 18, 'kk': 18, 'en': 18}`. Для каждого сверены реальные потоковые SHA-256, байты, точный путь и ZIP_STORED (0). Список MP3 совпадает с реестром.
- Реестр SHA-256: `959e466442bbe090a8523f0d88607454706ce67d2e7e763e6b4798587ab71925`; manifest: `f4f0e5c4d5ec40316c01fcad554942f561c563c133ad1d72d1ca053e15ba58c6`.
- Подпись проверена локальным apksigner; точные схемы и публичные отпечатки ниже. Debug certificate не является производственной подписью.
- В DEX проверены class_def и методы с code offset для Module, Verifier, Player и Owner. Это сильнее поиска строк, но не доказательство выполнения методов.
- Hermes bundle: **2,174,268 байт**, версия bytecode `99`, SHA-256 `5ef418fbb2faa1a5fcbd72df58ade158e2ab540fa281f31482e1a69c4777870f`. Совпадений audio hash 54/54, text hash 54/54.
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
- `android.permission.INTERNET`
- `android.permission.POST_NOTIFICATIONS`
- `android.permission.VIBRATE`
- `android.permission.ACCESS_NETWORK_STATE`
- `android.permission.ACCESS_WIFI_STATE`
- `kz.astanaai.diagnostics.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`

## Определения классов

| Класс | DEX | Методы с кодом |
| --- | --- | --- |
| `ActiveWalkModule` | `classes3.dex` | `<init>, access$audio, access$getDisposed$p, access$getMain$p, access$getObserver$p, access$getPreparedPlayer$p, access$resumed, access$setDisposed$p, access$setPreparedPlayer$p, audio, audio$lambda$1, definition, resumed` |
| `PreparedAssetVerifier` | `classes3.dex` | `<clinit>, <init>, hashUtf8, hex, hex$lambda$1, verify` |
| `PreparedAudioOwner` | `classes3.dex` | `<clinit>, <init>, detach, detach$lambda$5, register, register$lambda$0, stop, stop$lambda$9` |
| `PreparedAudioPlayer` | `classes3.dex` | `<init>, abandonFocus, access$getDisposed$p, canPlay, capturePosition, checkMain, clearResources, current, fail, getState, pause, play, play$lambda$5, play$lambda$5$lambda$3, play$lambda$5$lambda$4, prepare, prepare$lambda$6, prepare$lambda$7, prepare$lambda$8, publish, registerNoisy, release, releasedState, requestFocus, requestFocus$lambda$11, requestFocus$lambda$11$lambda$10, setForeground, snapshot, stop, unregisterNoisy, worker$lambda$1` |

## Границы результата

- Static archive/manifest/signature/class definition evidence, not Android execution.
- DEX method bodies were not decompiled or executed; class existence does not prove lifecycle semantics.
- Hermes string/hash presence does not prove code reachability or React rendering.
- Audio hashes validate bytes, not pronunciation or human quality.
- Android Debug certificate is for development; production signing/distribution is not accepted.
- Any rebuild changes artifact identity and requires this audit again.
- Полная offline-карта, GPS, Android SQLite restore, audio focus/noisy/background/recreation, полевые и языковые проверки этим аудитом не принимаются.

## Воспроизводимость

Полная квитанция с 54 строками аудио, командами, stdout и hash инструментов: `evidence\mobile-canonical\APK-STATIC-AUDIT.json`.
SHA-256 скрипта: `dc851fcde97db6270487434dff9b7ecc38dbf1e772ed31d24e3d176710418238`. Использованы только уже установленные Python/JDK/Android SDK.

Независимый повтор граничных тестов скрипта: `python -X utf8 -m unittest discover -s tools/apk -p test_audit_canonical_apk.py -v` — **7 PASS, 0 skipped**, 0.027 s. Проверяются typed manifest attrs, реальные DEX class_def/методы вместо совпадений строк, повреждение/checksum/table bounds, отказ hardlink и сохранение sentinel при записи отчёта.

Дополнительный REA inventory этого же финального SHA выполнен без распаковки: 1211 ZIP entries (+корневое occurrence в графе), 0 integrity contradictions. Inventory Evidence `ev_93467fb56019a577fcc85ae2a478fa9127fe2cfa573a468bbfe4b5c3615a36fd`; inspection `ev_640b1135f99bce8a9558543f8b7c42f61062d883b99b84780719a34b8eeba9ac`; summary `ev_6fc13f5812a527f9bd009de123fe24f590fbdb9e08584e5c9f20e610721beb2c`. REA session закрыта без snapshot. Case-fold collisions в resource names отмечены inventory, извлечения на case-insensitive filesystem не было; signing block проверен отдельным apksigner, не ZIP inventory.
