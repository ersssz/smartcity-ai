# AstanaAI — проверенные технические основания

Проверено 20 октября 2026 по primary sources. Это исследование для плана, а не результат установки, сборки, расходования API-кредитов или полевой проверки. Документы/API registry были прочитаны; аккаунты не создавались, ключи и секреты не читались, платные model calls не выполнялись. Конкретные решения/fallback находятся в `ARCHITECTURE.md`; источники ниже необходимо перепроверить при T01/T02 и перед выпуском, поскольку условия меняются.

## 1. Текущие пакеты: кандидаты, не доказанная совместимость

Read-only запросы npm registry вернули:

| Артефакт | Версия / сведения | Первичный источник |
|---|---|---|
| Expo blank TypeScript template | 58.0.25; Expo ~58.0.16, React 19.3.0, RN 0.88.0, TypeScript ~6.0.3; template 0BSD | [versioned registry](https://registry.npmjs.org/expo-template-blank-typescript/58.0.25) |
| Expo | 58.0.16, MIT; Node ^22.13 / ^24.3 / ^26 / >=27 | [registry](https://registry.npmjs.org/expo/58.0.16) |
| MapLibre React Native | 11.5.0, MIT; peer Expo >=54, React >=19.1, RN >=0.80 | [registry](https://registry.npmjs.org/@maplibre/maplibre-react-native/11.5.0) |
| Expo native modules | SQLite 58.0.13, Audio 58.0.9, Location 58.0.18, TaskManager 58.0.12, SecureStore 58.0.2; MIT | [SQLite](https://registry.npmjs.org/expo-sqlite/58.0.13), [Audio](https://registry.npmjs.org/expo-audio/58.0.9), [Location](https://registry.npmjs.org/expo-location/58.0.18), [TaskManager](https://registry.npmjs.org/expo-task-manager/58.0.12), [SecureStore](https://registry.npmjs.org/expo-secure-store/58.0.2) |
| Backend | Supabase JS 2.118.0 (Node >=22), Hono 4.13.13, Zod 4.6.7; MIT | [Supabase JS](https://registry.npmjs.org/@supabase/supabase-js/2.118.0), [Hono](https://registry.npmjs.org/hono/4.13.13), [Zod](https://registry.npmjs.org/zod/4.6.7) |
| Расписания | `opening_hours` 3.15.0 — LGPL-3.0-only; поэтому библиотека не добавлена незаметно в mobile dependency tree | [registry](https://registry.npmjs.org/opening_hours/3.15.0) |

Наличие удовлетворённых peer ranges не доказывает native compilation, правильный lifecycle или offline map integration. Решение: использовать единый Expo template и закрепить lock после успешного совместного native spike; не выбирать RN отдельно по `latest`. Лицензии registry требуют проверки NOTICE/transitive dependencies в выпускном SBOM. Открытая лицензия SDK не даёт права копировать данные провайдера или голосовые файлы.

## 2. Android, Windows и фон

- Expo поддерживает локальный `expo run:android` через Android SDK/Android Studio; development build включает custom native modules. Production APK требует собственной подписи; debug build с Metro и standalone release — отдельные проверки. [Local development](https://docs.expo.dev/guides/local-app-development/), [local production](https://docs.expo.dev/guides/local-app-production/).
- `eas build --local` и локальная Expo/Gradle сборка — разные пути. EAS local официально не поддерживает Windows; план использует Android Studio/Gradle, не зависимость от WSL/EAS cloud credits. [EAS local limitations](https://docs.expo.dev/build-reference/local-builds/).
- MapLibre RN требует Android API >=23, RN >=0.80; с v11 только New Architecture. Expo Go не поддерживается, после добавления native package нужна пересборка. [Requirements](https://maplibre.org/maplibre-react-native/docs/setup/getting-started/), [Expo setup](https://maplibre.org/maplibre-react-native/docs/setup/expo/).
- Android foreground location service удерживает доступ к location при погашенном экране и показывает постоянное уведомление. Минимальные разрешения зависят от способа запуска/lifecycle. Expo отдельно описывает background task/permissions и остановку после termination, включая отличия производителей. [Android location](https://developer.android.com/develop/sensors-and-location/location/permissions), [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/).
- Локальная read-only проверка: обнаружен Node 22.22.2 и npm/git. java/javac/adb/sdkmanager не найдены в PATH; стандартные `Program Files/Android/Android Studio` и `AppData/Local/Android/Sdk` отсутствуют. Это не исчерпывающий поиск всех нестандартных установок; toolchain readiness не подтверждена.
- SQLite сохраняется между перезапусками, но журнал/идемпотентность/миграции и защита active assets должны быть реализованы и испытаны. [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/).
- Android Auto Backup включён по умолчанию для подходящих приложений; на Android 12+ у некоторых производителей `allowBackup=false` не отключает device-to-device transfer. Требуется проверка extraction rules, не обещание абсолютной защиты одним флагом. [Android backup](https://developer.android.com/identity/data/autobackup).

## 3. Карта и offline — OpenFreeMap + MapLibre

OpenFreeMap public instance заявляет бесплатное коммерческое использование без регистрации, API-ключей, лимитов views/requests; это не SLA. Атрибуция обязательна (`© OpenMapTiles`, данные OpenStreetMap); OpenFreeMap attribution необязательна. Публичный сервис может быть прекращён. [Описание и attribution](https://openfreemap.org/), [Terms, обновлены 14.10.2026](https://openfreemap.org/tos/).

Текущие условия разрешают offline-download до 3000 tiles или 50 MB, максимум 4 параллельных запроса, уникальный идентифицирующий User-Agent. План намеренно соблюдает **оба** количественных потолка и не дробит массовую загрузку ради обхода ограничений. Взрослый интегратор обязателен; возраст конечного зрителя embedded map этим условием не ограничен. [Quick start/mobile](https://openfreemap.org/quick_start/), [Terms](https://openfreemap.org/tos/).

MapLibre RN имеет OfflineManager packs и tile limit. Это свидетельство возможности, не доказательство сохранения всех glyph/style/audio ресурсов и не гарантия контроля 50 MB/4 connections. Android native API допускает собственный OkHttp Call.Factory; это выбранный seam для bounded downloads. [OfflineManager](https://maplibre.org/maplibre-react-native/docs/modules/offline-manager/), [native HTTP adapter](https://maplibre.org/maplibre-native/android/api/-map-libre%20-native%20-android/org.maplibre.android.module.http/-http-request-util/set-ok-http-client.html).

Стандартный `tile.openstreetmap.org` не выбран: у него собственная политика, offline/prefetch запрещены. Бесплатные OSM-данные и бесплатный публичный tile server — разные условия. [OSMF tiles policy](https://operations.osmfoundation.org/policies/tiles/).

## 4. Пешая сеть, источник POI и право хранения

HeiGIT public API предлагает free Standard key. Official plans web frontend на дату содержит Directions quota 2000/day и rate 40/min; это прочитано из кода самой страницы, не из вторичной таблицы. Фактическую quota необходимо подтвердить в своём кабинете T02; приложение использует меньшие внутренние пределы. Foot profile и лимиты directions описаны отдельно. [API entry](https://api.heigit.org/), [plans](https://account.heigit.org/info/plans), [API restrictions](https://openrouteservice.org/restrictions/).

В текущих HeiGIT Terms: route results имеют CC BY-SA 4.0, нужны credit HeiGIT/OSM; correctness/performance не гарантируются; в prohibited conduct есть передача personal data. Документ не разрешает нам самостоятельно заключить, что любая координата является персональной или что любой GPS use запрещён. Консервативное проектное решение: пока T02 не подтвердил допустимость точного origin, ORS получает только общественные anchors. Это **не решает** путь от текущей точки к ним: недоказанный connector нельзя пририсовать. Geometry/license refs хранятся отдельно от авторских глав. [Official Terms](https://account.heigit.org/info/tos) (Angular frontend; опубликованный JS прочитан без исполнения).

Supabase официально предлагает pgRouting extension с pathfinding algorithms и инструкцией включения. Это позволяет проверить alternative adapter в managed DB на собственном OSM foot graph без своего always-on сервера. Документация не доказывает, что наш граф уже существует, что топология/доступ к входам корректны, что exact endpoint connector допустим или что workload помещается в Free. T02 проверяет всё это и ресурсные пределы; до PASS arbitrary GPS start/return остаётся открытым deployment gate. Не использовать Euclidean TSP пример документации как пеший routing. [Supabase pgRouting](https://supabase.com/docs/guides/database/extensions/pgrouting), [extensions](https://supabase.com/docs/guides/database/extensions).

ORS hosted endpoint — кандидат ограниченной беты после coverage/quota/privacy tests; постоянная production доступность не доказана. Собственный ORS требует RAM/диска/постоянного compute, поэтому не выбран как бесплатный deployment fallback. Публичные demo Valhalla/OSRM также не приняты в качестве production инфраструктуры. [ORS официальный deployment example с memory settings](https://github.com/GIScience/openrouteservice/blob/main/docker-compose.yml).

Geofabrik публикует Kazakhstan `.osm.pbf` extract с датой и ODbL 1.0; на дату около 214 MB. Можно воспроизводимо скачать и локально отфильтровать Astana без bulk-запросов к geocoder. Это источник POI/путей, не обещание completeness расписаний, entrances или accessibility. OSM-derived данные требуют attribution/share-alike согласно применимым условиям; editorial originals имеют отдельные права. [Extract](https://download.geofabrik.de/asia/kazakhstan.html), [OSM licence](https://www.openstreetmap.org/copyright).

Public Nominatim не используется для выгрузки всех POI/автодополнения: официальная политика запрещает эти сценарии и ограничивает нагрузку. [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/).

## 5. Погода — MET Norway

Выбран Locationforecast 2.0 `compact`: глобальные координатные прогнозы; основной глобальный источник ECMWF с пространственным разрешением около 9 km. Это автоматический прогноз, не локальное наблюдение/гарантия гололёда/ветра между зданиями. [Endpoint docs](https://api.met.no/weatherapi/locationforecast/2.0/documentation), [data model](https://docs.api.met.no/doc/locationforecast/datamodel.html).

MET публикует данные по NLOD 2.0/CC BY 4.0 с credit MET Norway, поддерживает свободное повторное использование и не предлагает SLA. Запросы требуют узнаваемого UA/contact; кеш Expires/Last-Modified, не больше необходимого traffic, координаты max 4 decimals; >20 requests/s на приложение требует отдельного соглашения. Предпочтителен backend proxy, чтобы пользовательский IP не уходил к провайдеру. План использует public zone centroids и кеш, не поток GPS. [Licensing](https://docs.api.met.no/doc/License), [Terms](https://docs.api.met.no/doc/TermsOfService), [FAQ](https://docs.api.met.no/doc/FAQ).

Open-Meteo не основной fallback будущего коммерческого продукта: Free API только non-commercial, <10000/day, без uptime guarantee; коммерческий продукт/реклама прямо указаны как другой режим. Для некоммерческого исследования допустим по условиям; автоматическое платное включение исключено. [Terms](https://open-meteo.com/en/terms), [pricing](https://open-meteo.com/en/pricing).

## 6. Сервер и БД без constantly-on ноутбука

| Выбранный ресурс | Подтверждённые free границы | Следствие |
|---|---|---|
| Cloudflare Workers Free | 100000 requests/day, 10 ms CPU/request, 128 MB; сетевое ожидание не считается CPU | Маленькая HTTP orchestration, SQL-вычисления, bounded parsing; ingestion/routing engine не внутри Worker. [Limits](https://developers.cloudflare.com/workers/platform/limits/), [pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Supabase Free | 500 MB DB, 1 GB file storage, 5 GB egress; проект может pausing при низкой активности за 7 дней | Ограниченная бета, immutable core audio в APK; операционный export/restore и честный outage. [Pricing](https://supabase.com/pricing), [pausing](https://supabase.com/docs/guides/platform/free-project-pausing) |

Cloudflare официально показывает `supabase-js` внутри Worker. Supabase клиент обращается через PostgREST; PostGIS/pgvector запросы можно заключить в SQL-функции и вызвать `rpc()`. Raw TCP/Hyperdrive или FastAPI для выбранного пути не требуются. Hybrid FTS+vectors/RRF — документированная возможность, но embeddings, качество и миграция требуют собственных измерений. [Workers integration](https://developers.cloudflare.com/workers/databases/third-party-integrations/supabase/), [PostGIS RPC](https://supabase.com/docs/guides/database/extensions/postgis), [vector RPC](https://supabase.com/docs/guides/ai/vector-columns), [hybrid search](https://supabase.com/docs/guides/ai/hybrid-search).

Render Free не выбран: сон web service через 15 min, пробуждение около минуты, free Postgres истекает через 30 дней. Neon — возможная другая БД, но отдельный запасной стек не вводится без провала выбранного gate: дополнительные providers усложнили бы настройку/операции двух человек. [Render](https://render.com/docs/free).

## 7. Generation, ключи и нулевые новые расходы

Официальная pricing Gemini на дату содержит `gemini-3.5-flash-lite`: free input/output; `gemini-3.1-flash-lite` также имеет free tier. Это проверяет существование тарифа, **не** рабочую quota/доступность конкретного ключа. В AI Studio нужно отдельно проверить модель/проект/активный free plan и rate limits. Google Maps/другой Google API key не доказывает Gemini entitlement. [Pricing, разделы этих моделей](https://ai.google.dev/gemini-api/docs/pricing), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [API keys](https://ai.google.dev/gemini-api/docs/api-key), [billing](https://ai.google.dev/gemini-api/docs/billing).

Gemini доступен в Казахстане. Unpaid Services используют input/output для улучшения продуктов, включая human review; personal/sensitive/confidential ввод запрещён. Terms требуют взрослого разработчика и исключают clients для/вероятно доступных несовершеннолетним; EEA/UK/Swiss end users имеют отдельное paid-service ограничение. Поэтому free adapter допускается только после проверки допустимости закрытой взрослой беты, с whitelist public facts/preferences, без пользовательского текста/GPS/identifiers. [Regions](https://ai.google.dev/gemini-api/docs/available-regions), [Terms](https://ai.google.dev/gemini-api/terms).

OpenAI API key — bearer credential, а не бесплатный баланс. Он должен оставаться server-only. Current official docs описывают hard organization/project spend limits, но допускают задержку enforcement и небольшой overshoot; alerts сами по себе трафик не останавливают. `credit_balance_exhausted` отдельное состояние. OpenAI adapter выключен до проверки существующих кредитов и разрешения их расходовать. Конкретный API model ID фиксируется только после models/access/cost/quality gate T02; название модели в приложении Codex не является таким доказательством. Новые покупки/автопополнение не входят в план. [Authentication](https://developers.openai.com/api/reference/overview), [spend limits](https://developers.openai.com/api/docs/guides/spend-limits), [error codes](https://developers.openai.com/api/docs/guides/error-codes), [Models API](https://developers.openai.com/api/reference/resources/models/methods/list), [актуальные цены](https://platform.openai.com/pricing).

Без работающего model generation готовый набор шаблонов не проходит требование RAG. Если разрешённый free adapter и имеющийся оплаченный ресурс недоступны/не проходят качество, deployment gate RAG закрывается; независимые модули продолжают разрабатываться. Локальный inference нельзя считать deployable, если для него нужен постоянно включённый ноутбук команды.

## 8. RU/KK/EN и файлы озвучки

Android `TextToSpeech` позволяет перечислить voices/проверить язык и синтезировать текст в файл. `Voice.isNetworkConnectionRequired()` отделяет network voice. Эти platform API не требуют отдельного Google Cloud speech key, но не гарантируют наличие/качество RU/KK/EN голоса на каждом устройстве или лицензию на серверное распространение voice output. Движки отличаются; необходим runtime capability check. [Android TTS](https://developer.android.com/reference/android/speech/tts/TextToSpeech), [Voice](https://developer.android.com/reference/android/speech/tts/Voice), [engine choices](https://support.google.com/accessibility/android/answer/6006983?hl=en).

Expo Speech перечисляет доступные голоса, зависящие от устройства; его публичный JS interface не предоставляет нужный file synthesis и Android pause/resume. Поэтому для динамических файлов выбран маленький native adapter, а не предположение о возможностях `speak()`. [Expo Speech](https://docs.expo.dev/versions/latest/sdk/speech/).

`expo-audio` документирует sustained background playback с media foreground service и lockscreen controls. Оно отдельно управляет записью: Android RECORD_AUDIO по умолчанию может быть добавлен; в проекте запись явно отключается. Core audio может быть записан авторами/добровольцами с разрешением и metadata о правах; доступность этих файлов пока не проверена. [Audio/background/configuration](https://docs.expo.dev/versions/latest/sdk/audio/).

## 9. Что проверено, что ещё проверить

**Проверено чтением:** наличие перечисленных пакетов/версий и опубликованных условий; выбранные API capabilities; ограничения free tiers/лицензий; частичная локальная инвентаризация toolchain. Никакой source doc не доказывает наш будущий APK, права конкретной организации/ключа, перевод, качество kk-голоса или реальную улицу.

**Pending experiments:** совместная Windows-сборка/подпись/upgrade; foreground GPS и звук на двух устройствах; MapLibre network budget/пакет glyphs; revision-scoped checksum/atomic offline preparation; тексты/записи трёх языков; реальные quota/credits; ORS lawful exact-origin и/или managed pgRouting topology/ресурсы; actual start→first/last→same-start geometry, барьеры/входы/закрытия; праздники; 30-case grounded-generation evaluation и общий deadline; DB restore/provider pause/egress; revoke/expiry race tests и never-revive after restore.

**Основание release:** mechanical gates из ARCHITECTURE плюс продуктовые/полевые критерии. Записать результат каждого эксперимента с датой, commit SHA, моделью устройства, build/content revision, измерениями и явной меткой `real device`, `field`, `emulator` или `replay`. Проверка на карте/эмуляторе не заменяет полевую проходимость и точность GPS.
