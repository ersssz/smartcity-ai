# Independent final APK audit

2026-10-20. **Static artifact audit PASS; no device/runtime verdict.** No ADB, installation, source edits or build performed by this reviewer.

Artifact: `outputs/AstanaAI-T01-apks/AstanaAI-T01-native-location-arm64.apk`

| Check | Independently observed result |
|---|---|
| SHA-256 | `f1a7bf073e4a21266f0dbaf75932136556adec55095c1014eb4c1b37a90edf90` |
| Size | 42,020,664 bytes |
| Frozen source | All 20 current source-file hashes match `work/native-device/frozen-source.json`; no mismatch. |
| Signature | `apksigner verify --verbose --print-certs` exits 0; v2 verified, one Android Debug signer; certificate SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. Diagnostic signing identity, not production distribution identity. |
| Embedded application | `assets/index.android.bundle`, 1,483,816 bytes; four DEX files; ARM64 native libraries. |
| Defined DEX classes | Reviewed the header/string/type/class-definition parser, then reran it against the deliverable. 18,019 class definitions; zero classes in the Expo location/taskmanager legacy namespaces; 38 new active-walk classes; required module/controller/service/receiver all present. |
| Packaged manifest | Independently decoded directly from this APK with SDK `aapt2 dump xmltree`; output SHA-256 `87c6a889a44a1bdba052997bcda6c49b2d3bb126de8a1227cc8554aab67df22f`, identical to root's inspected report. |
| Package/version | `kz.astanaai.diagnostics`, versionCode 2, versionName 0.1.1; minSdk 24, targetSdk 36. |
| Native control components | ActiveWalkService nonexported, `stopWithTask=true`, foreground-service type `0x8` (location); StopReceiver nonexported without an intent filter. |
| Removed path | No Expo Location/TaskManager service/receiver; no background-location permission, boot permission, boot/package-replaced restore action. |
| Other manifest facts | `allowBackup=false`; only unrelated exported ProfileInstallReceiver is protected by `android.permission.DUMP`. |

Evidence in this folder:

- `final-class-inspection-independent.json`
- `final-packaged-manifest-independent.txt`
- `final-signature-independent.txt`
- Earlier reviewed resolver/generated-provider/merged-manifest evidence: `intermediate-artifact-review.json`.

Source findings from previous passes are closed in reviewed source: Android 14 notification dismissal now invokes native Stop; lifecycle admission uses actual AndroidX RESUMED on main; JS synchronous fix pull uses an immutable atomic observation only; destroyed-module callbacks are guarded; marker freshness and stale reconcile/Pause-Stop write races were fixed. Runtime behavior is not inferred from these source/artifact checks.

Physical Android 12 tests, JS-stall/SQLite-failure on the physical release, other Android versions, reboot/package-upgrade behavior, field/battery reliability and legacy coordinate-payload migration retain their separately recorded statuses. Clean-install success cannot establish legacy data deletion.
