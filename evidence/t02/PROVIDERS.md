# T02: источники, offline-права и доступность провайдеров

Проверено 2026-10-20 по официальным публичным документам и опубликованному коду страниц. Это исследование условий, не подтверждение аккаунта, квоты, развёртывания или полевой проходимости. Использован установленный skill `research`; scope соответствует `AGENTS.md`, T02 и разделам 3–7 `docs/plan/ARCHITECTURE.md`/`RESEARCH.md`.

Ни аккаунт, ни подтверждённый бесплатный API-доступ для этого задания не предоставлены. Аккаунты, ключи и секреты в пользовательских файлах не искались. Запросы к model API, платным API и кабинетам не выполнялись; покупки, trials, billing, deployment и облачные builds не запускались. Публичные HTTP GET документации не являются проверкой живого routing/generator adapter.

## Offline-карта

OpenFreeMap разрешает offline-download приложения: до 3000 tiles **или** 50 MB на скачивание, до четырёх параллельных запросов, с уникальным User-Agent приложения. Текущая редакция Terms датирована **2026-10-14**. В соответствии с архитектурой AstanaAI реализация обязана соблюдать **оба** количественных потолка, считать все скачанные ресурсы и не дробить область для обхода ограничения. Для интегратора требуется совершеннолетие; возраст зрителей embedded map этим требованием не ограничен. Услуга предоставляется без гарантий и может быть прекращена. Это разрешение ограниченной функции скачивания пользователем, а не отдельное доказательство любых способов повторного хостинга/распространения готового архива. [OpenFreeMap Terms](https://openfreemap.org/tos/).

Публичная подложка доступна без регистрации/API key; проект заявляет бесплатное коммерческое использование. Сохранять attribution `© OpenMapTiles` и `Data from OpenStreetMap` вместе с offline-материалами; credit OpenFreeMap необязателен. MIT проекта не заменяет лицензию картографических данных. [OpenFreeMap: usage, attribution, license](https://openfreemap.org/). OSM-данные распространяются по ODbL: для производной базы сохранять attribution, ссылку на лицензию и применимые требования share-alike; авторские главы держать отдельно от OSM-derived dataset. [OSM copyright](https://www.openstreetmap.org/copyright).

MapLibre Native Android документирует создание offline regions с ресурсами области и merge из вторичной базы. Tile-count limit и размер **ambient cache** — разные параметры; один tile-count limit не доказывает byte budget offline pack. [OfflineManager API](https://maplibre.org/maplibre-native/android/api/-map-libre%20-native%20-android/org.maplibre.android.offline/-offline-manager/index.html). Существует seam `HttpRequestUtil.setOkHttpClient(Call.Factory)` для запросов map resources, сохраняющийся между MapView. Это возможность в текущей документации SDK 13.7.1, не доказательство реализации/проверки в выбранной сборке Android. [Native HTTP adapter](https://maplibre.org/maplibre-native/android/api/-map-libre%20-native%20-android/org.maplibre.android.module.http/-http-request-util/set-ok-http-client.html).

Для приёмки ещё нужны измеренный размер и время упаковки конкретной области; manifest style/sprites/glyphs/tiles/license/checksums; сетевой trace, показывающий стабильный UA, <=4 in-flight, abort на обоих пределах; загрузка и отображение без сети в целевом приложении. Уменьшать область/zoom при превышении лимитов. Исследование документации эти проверки не закрывает.

`tile.openstreetmap.org` не использовать для pack: стандартный raster service запрещает offline/prefetch и сборку архивов для дальнейшего распространения. Наличие ODbL у исходных данных не отменяет policy конкретного tile service. [OSMF tile policy, раздел 4](https://operations.osmfoundation.org/policies/tiles/).

## Пеший routing и точные endpoints

HeiGIT предлагает бесплатный Standard key после регистрации. Наличие тарифа не подтверждает возможность наших ключей, оставшуюся quota или условия отдельного аккаунта. [Public API entry](https://api.heigit.org/). В опубликованном frontend plans для `DirectionsForPublic_v2` присутствуют `quota_max:2e3`, `quota_renewal_rate:86400`, `rate:40`, `per:60`: номинально 2000/day, 40/min. Это публичная конфигурация страницы, а не dashboard нашего аккаунта. [Plans](https://account.heigit.org/info/plans), [официальный JS страницы](https://account.heigit.org/chunk-7SF2PHKW.js).

ORS Directions поддерживает profile-запросы и GeoJSON LineString, расстояние в метрах, duration в секундах; профиль должен быть именно пешим, не driving. [Directions request/response](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/requests-and-return-types). У public directions есть отдельные ограничения: максимум 50 waypoints, максимум три альтернативы; это пределы сервиса, а не наши более низкие runtime budgets. [API restrictions](https://openrouteservice.org/restrictions/).

Актуальные HeiGIT Terms запрещают передачу персональных данных за исключением данных управления аккаунтом. Результаты ORS лицензированы CC-BY-SA 4.0 с credit HeiGIT/OSM. Angular-страница проверена чтением опубликованного JS без исполнения. [Terms](https://account.heigit.org/info/tos), [официальный Terms JS](https://account.heigit.org/chunk-TC2R7MR4.js). Privacy policy описывает обработку IP/online identifiers и общие основания/сроки хранения, но не даёт в прочитанном тексте достаточной специфической гарантии retention точного GPS request body. [HeiGIT privacy policy](https://heigit.org/privacy-policy/).

**Решение T02:** lawful exact-origin gate ORS не доказан. Это консервативное решение проекта, не заключение, что любая lat/lng автоматически запрещена. Согласие на геолокацию не расширяет договорные условия провайдера. До дополнительного подтверждения ORS допускается только для общественных anchors, причём даже этот adapter пока не вызван: нет проверенного бесплатного аккаунта. Нельзя отправить пользовательский GPS через proxy и объявить задачу решённой.

Замена GPS-старта на public anchor допустима только после явного изменения запроса пользователем. Расстояние до ближайшего edge/node, линия по прямой и малый snap distance не доказывают подход. Для current-origin/start/end/return нужны непрерывная геометрия по разрешённым пешим данным, подтверждённые connectors и полное время пути. При разрыве — clarification/честный отказ, а не готовый маршрут. Возврат должен вести к исходному endpoint, а не к ближайшему POI.

### Альтернатива: собственный граф в managed PostgreSQL

Supabase документирует extension pgRouting, pathfinding algorithms и включение extension. Euclidean TSP из примера документации **не** является пешим графом. [Supabase pgRouting](https://supabase.com/docs/guides/database/extensions/pgrouting). Следовательно, managed fallback технически возможен как направление проверки; готового графа, RPC или deployment этот документ не доказывает.

Для приёмки нужны OSM ingestion с foot/access/barrier/crossing/bridge/tunnel/levels; соединения только по реальной топологии; параметризованный RPC; точные endpoints только в памяти запроса; проверка инфраструктурных logs/retention; доказанные access connectors. Затем измерить normative 10 foot pairs, first/last connector и return, graph+indexes <=300 MB, total DB <=400 MB, SQL leg p95 <=2 s и timeout 3 s (это **внутренние** пороги ARCHITECTURE, не гарантии Supabase). Локальный graph probe на публичных координатах не заменяет managed SQL measurement или реальный GPS-кейс. На момент этого исследования managed fallback **не развёрнут и не принят**.

## Матрица нулевого бюджета

| Ресурс | Что подтверждено публично | Что подтверждено у команды | Решение сейчас |
|---|---|---|---|
| OpenFreeMap | Бесплатная public instance, ограниченное offline-разрешение выше | Аккаунт не нужен; сам pack/Android trace здесь не проверены | Условия документированы; offline acceptance pending |
| ORS/HeiGIT | Standard free key; публичная nominal quota выше | Аккаунт, remaining quota, real foot coverage и exact-GPS policy не подтверждены | Live adapter disabled; routing gate pending |
| Cloudflare Workers | Free: 100000 requests/day, 10 ms CPU/request, 128 MB; ожидание сети не CPU | Нет проверенного аккаунта/free plan/deployment/load trace | Backend availability pending |
| Supabase | Free: 500 MB DB, 1 GB file storage, 5 GB egress и 5 GB cached egress; до двух active projects; pause после недели inactivity | Нет проверенной организации/project/quota/DB size/restore/RPC | Managed graph и непрерывная доступность pending |
| Gemini generator | В pricing `gemini-3.5-flash-lite` Standard имеет free input/output | Нет проверенного free project/model access/rate limits, взрослой beta policy и runtime probe | Generator disabled; RAG pending |
| Любой paid API, включая ранее оплаченные ключи/кредиты | Платный доступ не разрешён текущим заданием | Проверки существующих секретов/балансов не делались | Запрещён; автоматического fallback нет |

Источники строк матрицы: [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/), [Supabase Free pricing](https://supabase.com/pricing), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing). Квоты — свойства опубликованного тарифа, **не** зарезервированный ресурс команды. Free tiers не предоставляют обещания непрерывной работы; нельзя обходить Supabase pause фиктивным traffic.

Gemini rate limits зависят от проекта и проверяются в AI Studio; опубликованная цена не доказывает remaining capacity. Не включать billing ради проверки. [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits). Unpaid Services используют input/output для улучшения продуктов, возможен human review; sensitive/confidential/personal data туда не передавать. Применимость возрастных/региональных требований к beta должна быть проверена до активации. [Gemini API Terms](https://ai.google.dev/gemini-api/terms). Точные GPS, пользовательский свободный текст, идентификаторы и tracks остаются вне generator prompt.

RAG gate остаётся **PENDING / NOT RUN**: нет реальных 30 generator-запросов (10 RU/10 KK/10 EN), model/API ID выполненного прогона, запросов/ответов, качества и latency. Будущий probe должен получать факты именно из импортированных POI; шаблоны и mock не засчитываются. Отдельно измеряются generator latency и полный end-to-end probe; пороги: >=90% valid supported answers, 0 invented POI/critical unsupported facts, p95 generation <=10 s и end-to-end p95 <=15 s согласно архитектуре.

## Воспроизводимость проверки динамических Terms/Plans

На 2026-10-20 GET `https://account.heigit.org/info/tos` содержит `main-6P4A6DNM.js`; маршрут `info/tos` загружает `chunk-TC2R7MR4.js`, `info/plans` — `chunk-7SF2PHKW.js`. Эти публичные файлы прочитаны PowerShell `Invoke-WebRequest -UseBasicParsing`, JS не исполнялся. SHA-256 UTF-8 decoded text:

- main: `657c6601c1805f6c81f5e41fb1d0f70dcc2f350334f168dbac91a6467fd5be9d`;
- Terms: `45d589c32d38ac9cec223ea15942b557dc21a488f0fd7e4d10161a6b0a7aaf2e`;
- Plans: `dd67f24720874d29dd40384dcdc8aa850e311d1f0259f77388f5caf7562465e2`.

Имена chunks могут измениться. Повторно найти их в HTML/main перед сверкой; не принимать исчезнувший URL за отмену условий. В доказательства не добавлялись API keys, private coordinates или данные кабинетов.
