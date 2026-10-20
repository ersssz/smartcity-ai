# Проверка готового APK без установки

`audit_canonical_apk.py` читает APK напрямую: не распаковывает его на диск и не запускает приложение. Нужны уже имеющиеся Python 3.12, JDK и Android build-tools. Скрипт не устанавливает зависимости и не обращается в сеть. Записываются только два явно указанных отчёта. Для замены обычного собственного отчёта нужно добавить `--overwrite`; ссылки и hardlinks отклоняются.

Из корня AstanaAI в PowerShell:

```powershell
python -X utf8 tools/apk/audit_canonical_apk.py `
  --apk apps/mobile/android/app/build/outputs/apk/release/app-release.apk `
  --registry apps/mobile/src/canonical/preparedAudioRegistry.generated.json `
  --build-tools ../../work/android-toolchain/sdk/build-tools/37.0.0 `
  --java-home ../../work/android-toolchain/gradle-cache/jdks/eclipse_adoptium-17-amd64-windows.2 `
  --js-reference apps/mobile/android/app/build/generated/assets/react/release/index.android.bundle `
  --build-stage final-incremental `
  --source-commit 18378ffe71e36aea4e932e63fa9c9f4670c7f62c `
  --json evidence/mobile-canonical/APK-STATIC-AUDIT.json `
  --markdown evidence/mobile-canonical/APK-STATIC-AUDIT.md
```

Ожидаемая версия по умолчанию — `kz.astanaai.diagnostics`, `0.4.0`, code `10`. Для другой версии задать `--package`, `--version-name`, `--version-code`. Аргумент `--build-stage` — подпись проверяющего, а не автоматически определённое состояние сборки.

Проверяются подпись apksigner, manifest через aapt2, alignment, все 54 MP3 по фактическим потоковым hash/байтам и ZIP_STORED, соответствие credits, определения и методы нужных классов в DEX, встроенный Hermes bundle и его совпадение с локальным выходом сборки. Исходные APK и registry повторно хешируются в конце, чтобы обнаружить пересборку во время чтения. Члены ZIP читаются с ограничением 32 MiB; полных распакованных копий нет.

```powershell
python -X utf8 -m unittest discover -s tools/apk -p test_audit_canonical_apk.py -v
```

Это статические доказательства состава и целостности. Наличие class_def/метода и строк Hermes не доказывает вызов кода. Проигрывание, lifecycle, геолокация, SQLite на Android и качество произношения проверяются отдельно. Debug certificate не является приёмкой производственной подписи. После каждой пересборки аудит выполняется заново, с новым точным SHA-256 APK.
