# Полная бета: требования, доказательства и следующий путь

Дата аудита: 2026-10-20. Проверенный baseline: `2be738f1c815b746334dfb9125148d897cbfc85b`, Android 0.3.4/code9. Аудит относится к исходникам и сохранённым свидетельствам этого baseline; изменения следующих исполнителей требуют отдельного дополнения. Ничего не объявляется завершённым по одному статусному документу.

## Вывод и граница готовности

Сейчас существует работающая Android-вертикаль знакомства с городом и одной подготовленной прогулки. Автоматическое motion-вступление и сохранение карты после перехода имеют свидетельство на одном Xiaomi Android12. Ручной сюжетный путь, сохранение выбранной редакции и идемпотентная ручная коллекция реализованы; 23 целевых теста повторены этим аудитом на текущем baseline и прошли. Полная согласованная бета ещё не существует: нет production WalkBundle, runtime CityEvidence/WalkPlanner, настоящего RAG, автоматических Arrival, полного offline pack, подготовленного трёхъязычного аудио, PublicCollection и обязательного корпуса трёх зон.

Поэтому весь первоначальный scope сохраняется. Называть один подготовленный маршрут полной бетой, шесть административных полигонов — покрытием сопровождения, а системный Speech — offline audio нельзя. Все 38 US, AT-01–20, 22 билета, M2-TECH, FIELD-PASS и материалы трека остаются в программе работы.

Нулевые расходы из [AGENTS](../../AGENTS.md) выше архивных разрешений использовать оплачиваемые кредиты. Наличие OpenAI/Google API не разрешает платный вызов. Этот аудит не выполнял network-запросы, не искал ключи, не управлял телефоном/другим ноутбуком и не менял существующие исходники.

## Как читать статус

- **Доказано**: наблюдение/проверка действительно покрывает сформулированную узкую возможность; среда и предел указаны.
- **Неполно**: полезная часть реализована, но весь критерий ещё не выполнен.
- **Слабо**: реализация или косвенное свидетельство есть, однако требуемый runtime/матрица/факт не проверены.
- **Отсутствует**: нужного поведения или доказательства в baseline нет.

Исторические JSON и отчёты подтверждают только описанные версии. Они не заменяют повторную проверку нового release candidate. Отдельные документы содержат историческое `pending` после более позднего PASS: при конфликте ниже используется конкретное более позднее runtime-свидетельство, а не общий флаг.

## Проверенные первичные артефакты

| Код | Источник и что реально проверено | Предел |
|---|---|---|
| S1 | [PRODUCT-SPEC](../plan/PRODUCT-SPEC.md), [DECISIONS](../plan/DECISIONS.md), [ARCHITECTURE](../plan/ARCHITECTURE.md), [EXECUTION](../plan/EXECUTION.md), все 22 файла `docs/plan/tasks` | Нормативный план; сам не доказывает код или эксплуатацию |
| S2 | [model.ts](../../apps/mobile/src/walk/model.ts), [engine.ts](../../apps/mobile/src/walk/engine.ts), [repository.ts](../../apps/mobile/src/walk/repository.ts), [migration.ts](../../apps/mobile/src/walk/migration.ts) | EditorialWalk намеренно отличен от server WalkBundle; только manual progress/discovery |
| S3 | [WalkApp.tsx](../../apps/mobile/WalkApp.tsx), [WalkExperience.tsx](../../apps/mobile/src/features/walk/WalkExperience.tsx), [catalog.ts](../../apps/mobile/src/walk/catalog.ts) | Один статически импортированный пакет; поиск только по его остановкам; online style; expo-speech, без plan/revise/publication вызовов |
| S4 | [preparedWalk.json](../../apps/mobile/src/walk/preparedWalk.json), [content draft](../../content/first-walk/content-draft.json), [права и редактура](../../evidence/first-walk/content-rights-and-review.md) | `astana-three-forms` revision2: 3 остановки, 3 главы/вопроса в одной цепочке, 4 факта, 3 источника, 3 пеших leg. Audio unavailable, human review pending |
| S5 | [native controller](../../apps/mobile/modules/astana-active-walk/android/src/main/java/kz/astanaai/activewalk/ActiveWalkController.kt), [service](../../apps/mobile/modules/astana-active-walk/android/src/main/java/kz/astanaai/activewalk/ActiveWalkService.kt), [module](../../apps/mobile/modules/astana-active-walk/android/src/main/java/kz/astanaai/activewalk/ActiveWalkModule.kt), [diagnostic start](../../apps/mobile/src/walkDiagnostic.ts) | Process-bound FGS и независимый Stop; fresh fix выдаётся UI только foreground; нет POI/dwell/Arrival/achievement pipeline |
| S6 | [фактический Android12 runtime 0.1.1](../../evidence/t01/android12-runtime-20261020.json) | Реальные callbacks, сервис пережил 81с Dozing, Stop из уведомления, 1 ручной diagnostic step сохранён. Не 30мин/20мин экран-off, не active process death, не поле и не новый полный walkthrough |
| S7 | [0.3.4 runtime](../../evidence/city-opening/android12-runtime-code9.json), [кадры](../../evidence/city-opening/android12-code9-frame-check.json), [visual review](../../evidence/city-opening/android12-code9-visual-review.md) | Установленный hash совпал; cold launch открывает motion без ↻; прежний flash не наблюдался в записанном переходе; HOME-return не повторил intro. Один аппарат, не display-FPS/доступность/полная прогулка |
| S8 | [0.3.1 runtime](../../evidence/city-sheet/android12-runtime.json), [visual review](../../evidence/city-sheet/android12-visual-review.md) | Крупнее городской обзор и компактная CTA; человек подтвердил Nura map tap, раскрытие и scroll. Эти жесты не повторялись в code9 |
| S9 | [T02 report](../../evidence/t02/REPORT.md), [20 bounded POI cards](../../data/curated/poi-bayterek.json), [recorded graph slice](../../data/curated/walking-probe-replay.json), [root route check](../../evidence/first-walk/root-catalog-review.json) | 20 импортных карточек одного bbox; 10 технических пар = 6 путей + 4 ожидаемых отказа. Не 10 завершённых прогулок. Первый маршрут 216 directed traversals по witness; полного PBF на главном ноутбуке нет |
| S10 | [spend-policy Implementation](../../packages/spend-policy/src/index.ts), [исторический verification](../../evidence/spend-policy-validation.json) | Default deny, freshness/quota/request checks; нет реального provider executor/atomic global reservation, не подтверждает entitlement сам по себе |
| S11 | Повторённая команда ниже: 23/23 PASS, exit0, Node22.22.2, Windows | 11 engine + 6 actual Node SQLite + 4 priority Stop + 2 actual catalog; не Android, не live provider и не поле |
| S12 | [first-walk verification](../../evidence/first-walk/local-verification.json), [code9 verification](../../evidence/city-opening/local-verification-code9.json), [APK code9](../../evidence/city-opening/apk-code9.json) | Исторические scoped source/build evidence. В code9 source report `native_cold_launch_accepted:false` предшествует S7; более позднее S7 доказывает только новый запуск |

Команда S11 из `apps/mobile`:

```powershell
& 'C:/Program Files/nodejs/node.exe' --experimental-sqlite --test tests/walkEngine.test.cjs tests/walkRepository.test.cjs tests/priorityStop.test.cjs tests/preparedWalk.test.cjs
```

## Матрица 38 пользовательских историй

Статус относится ко всему тексту истории в S1. Последняя колонка задаёт следующий наблюдаемый результат, а не переопределяет исходное требование.

| US | Текущее доказательство | Статус | Что ещё должно стать истинным |
|---|---|---|---|
| 01 время/настроение | S3 загружает один готовый 80-минутный пакет, формы WalkRequest нет | Отсутствует | Ввод времени/интересов → реальный planner request |
| 02 RU/KK/EN до рекомендаций | S3 локаль переключается/сохраняется, S4 тексты3языков; рекомендаций нет | Неполно | Локализовать request/выбор/errors/новые вертикали; реальный весь путь и языковая проверка |
| 03 ручной старт без GPS | У готовой прогулки публичный старт, но пользователь его не выбирает среди допустимых origin | Неполно | Явный manual point/public-anchor выбор; уточнение неподтверждённого подхода |
| 04 1–3 цельных варианта/основания | Один EditorialWalk в S3; selection/generator нет | Отсутствует | CityEvidence → feasible ranking → grounded explanations; честные1–3/none |
| 05 переходы/визиты/резерв/конец | S2/S4/S11 проверяют сумму и возврат одного пакета | Неполно | Requested time/end-dependent ETA и расписания; runtime UI всего запроса |
| 06 возврат/last stop/заданный конец | S2 literal `return_to_start` | Неполно | Три EndRule, immutable original origin, resolvedEnd при revision |
| 07 ограничения/unknown | S9 хранит unknown, S3 показывает field note, planner constraints отсутствуют | Неполно | Critical unknown исключает обещание до ranking; UI фактически учтённых условий |
| 08 объяснимый отказ/альтернатива | S9 research CLI отказывает точкам; product no-feasible Reply нет | Отсутствует | Доменный no-feasible/clarification отличен от outage; конкретное ослабление |
| 09 одна сессия/следующий шаг | S2/S3/S11 реализуют фазу/порядок, S12 карта/preview на телефоне | Слабо | Полный Start→главы→возврат на текущем APK и выбранном live bundle |
| 10 пауза/явно завершить | Pause/resume/complete реализованы; кнопка Stop в S3 вызывает pause | Неполно | Отдельное досрочное abandoned/terminate с сохранением прогресса и подтверждённым Stop |
| 11 screen-off сопровождение | S6 короткая жизнь FGS; S5 не вычисляет Arrival, звук в S3 останавливается при background | Неполно | Native screen-off arrival+journal и audio; матрица времени/батареи/interruptions |
| 12 исправить отклонение online | Нет routing/revise клиента/сервера | Отсутствует | Подтверждённые foot legs от current point с original end; разрешённая autocorrection |
| 13 согласовать замену | В S2 нет revision proposal/diff/accept | Отсутствует | Предложение→сравнение→accept/reject; нельзя молча менять stops/theme/end |
| 14 сократить время/улицу | Нет request «замёрз»/remaining-time planner | Отсутствует | Indoor critical facts/hours + remaining budget + согласие; честный отказ |
| 15 восстановление процесса | S11 доказывает SQLite pause/restore выбранной revision; S6 только diagnostic paused restart | Неполно | Active editorial process death/reboot/upgrade на текущей native сборке, без autoGPS |
| 16 первое auto discovery/notification | S5 только сервисное Stop-уведомление, S2 manual walk award | Отсутствует | Native arrival → durable first POI event → unique outbox → discovery notification |
| 17 low GPS/manual | S3 показывает stale/precision/status, manual явно отделён; нет arrival waiting state | Неполно | Dwell/ambiguity/low-accuracy state и последующий настоящий Arrival без дубликата |
| 18 запрещённые уведомления | S5/startDiagnostic запрещает acquisition при notifications disabled | Отсутствует | Решить допустимый безопасный native путь без обычного уведомления; arrival сохраняется/in-app при отказе notifications |
| 19 последовательный квест | S2/S4/S11 доказывают3главы/порядок/skip/manual quest одной цепочки | Неполно | Подключить accepted WalkBundle, GPS/mixed provenance и подтвердить native walkthrough |
| 20 текст + озвученная глава | S4 полный текст; S3 системный Speech при голосе, assets unavailable | Неполно | Проверенные licensed audio3языков в pack, pause/resume/interruptions на устройстве |
| 21 источники/fact/idea/unknown | S4 source/fact refs и marked editorial framing; S9 unknown | Неполно | Runtime generated claims с entailment/evaluation, editor lifecycle/withdrawal; человеческая редактура |
| 22 язык/повтор главы | S3/S11 локаль и reread/preview, S4 три текста | Слабо | On-device смена во время пути, offline audio по языку и человеческое качество |
| 23 GPS vs manual collection | S2/S11 manual-only immutable walk discovery | Неполно | Stable-POI GPS discoveries, aliases, mixed proof и независимость от сюжетного завершения |
| 24 загрузить полный pack/готовность | S2 прямо `baseMap:online`, `preparedAudio:unavailable`; downloader нет | Отсутствует | Проверяемые bundle/manifest hashes + map/text/audio3языков + partial/error UI |
| 25 продолжать без сети | Встроенные route/text/quests + SQLite работают локально; map/audio отсутствуют | Неполно | Airplane native map/audio/progress/restart в готовой области |
| 26 честное offline ограничение | S3 предупреждает online подложку; новых AI/routing функций ещё нет | Неполно | Connectivity/freshness/pack state и недоступность revise/RAG/publish без фиктивного результата |
| 27 без аккаунта сохранить | S2/S11 реальный Node SQLite, S6 diagnostic durability | Доказано узко | Для существующих manual discoveries/locale. При добавлении GPS/профиля повторить совместимые миграции |
| 28 потеря телефона/управления | S3 лишь «Sharing is off»; lifecycle/admin secret нет | Отсутствует | Перед первым publish понятное предупреждение без ложного восстановления |
| 29 поля/preview | PublicCollection/UI отсутствуют | Отсутствует | Whitelist snapshot preview совпадает с payload; default private |
| 30 обновляемая ссылка | Нет public server/read UI | Отсутствует | Постоянный readURL + отдельная защищённая admin capability; HTTPS |
| 31 явное продление30дней | Нет PublicCollection | Отсутствует | Server-time TTL только publish/update, renew expired сохраняет допустимыйURL |
| 32 отзыв | Нет PublicCollection | Отсутствует | Revoke/rotate атомарны; future read410, old URL не оживает |
| 33 посетитель видит proof | S2 локально хранит manual, share/viewer нет | Отсутствует | Public reader выбранных полей/provenance без GPS/дат/admin token |
| 34 остановить/очистить | S5/S6 независимый Stop; reset в S3 архивирует, не удаляет | Неполно | Подтверждённое granular delete history/pack/progress и отдельное revoke, без новых логовGPS |
| 35 проверенная редакция | S4 источники/права/контент3глав, S9 импорт20карточек | Неполно | Reviewed/published/withdrawn lifecycle, новые пакеты исключают критический отзыв, корпус M2 и люди |
| 36 следующая глава жителю | S3 предлагает повтор того же walk; другого проверенного корпуса нет | Отсутствует | Следующий feasible пакет с объяснением новизны относительно opted-in открытий |
| 37 следующая прогулка туристу | Один пакет, no planner history preference | Отсутствует | Оставшееся время/уже открытое → подходящий следующий пакет/честный none |
| 38 feedback без трека | Нет UI/persistence/export/server feedback | Отсутствует | RU/KK/EN форма POI/chapter/revision/type, offline draft, добровольный минимальный экспорт |

## Приёмочные сценарии AT-01–20

| AT | Доказательство сейчас | Статус полного AT | Обязательная следующая проверка |
|---|---|---|---|
| 01 1–3 выполнимых предложения | S4 один заранее выбранный; runtime planner нет | Отсутствует | Реальные запросы/ограничения, непохожие варианты, none/clarification/outage |
| 02 grounding/injection | S4 editorial refs; RAG/injection corpus нет | Отсутствует | Runtime retrieval+generation; malicious POI source не становится instruction; semantic claim audit |
| 03 расписания/полночь/праздник | S9 содержит реальный конфликт/unknown; evaluator не product | Неполно | Weekly intervals+exceptions+TZ, full visit inside interval, sourced override/unknown |
| 04 бюджет/EndRule | S2/S11 сумма fixed loop PASS | Неполно | Три end modes, origin/first/last connectors, no missing-return-time |
| 05 online deviation/consent | Нет revise path | Отсутствует | Current-from + original-end; изменение согласуется/отклоняется без потери old revision |
| 06 process restore/no double award | S11 actual SQLite PASS; S6 paused diagnostic restart | Неполно | Kill active/editorial/native states, upgrade/interruptions на accepted матрице |
| 07 GPS dwell/скачки/соседи | Только provider sample metadata S5/S6 | Отсутствует | Native rules/replay:60m,accuracy≤30m,dwell≥30s,3sample,age≤15s,speed≤3m/s + field отдельно |
| 08 manual → laterGPS | Manual-only правила S2/S11 PASS | Неполно | First actualGPS после manual сохраняет оба происхождения, уникальный POI award |
| 09 notification once/denied | S6 сервисный Stop, не discovery; disabled блокирует Start | Отсутствует | Durable discovery outbox/stableIDs, denied сохраняет in-app, lategrant не спамит |
| 10 quest/mixed/reread | Manual3chapters S2/S11 PASS | Неполно | GPS/mixed and native reread/progress по всему контенту |
| 11 aliases/replay/republication | Unique manual walk_id S2/S11 PASS; POI aliases/publication нет | Неполно | Global canonicalPOI uniqueness+event IDs+publication не создаёт awards |
| 12 все RU/KK/EN | S4/S3 три языка; новые вертикали отсутствуют, people review pending | Неполно | Request/errors/end/profile/chapters в3языках + компетентная смысловая редактура |
| 13 core audio offline3языка | Assets unavailable, системныйSpeech честно unverified | Отсутствует | Реальные файлы/права/hashes, airplane на поддерживаемых аппаратах |
| 14 полный/partial/adapt pack | Нет AssetManifest/downloader/native enforcement | Отсутствует | Atomic ready per bundleHash/revision/manifest; checksum/storage/cancel/newrevision cases |
| 15 airplane | Local text/route/progress уже в пакете, baseMap online | Неполно | Полный map/audio3языков+restart; новыйAI/routing/publish offline недоступны явно |
| 16 public preview/no leak | PublicCollection нет | Отсутствует | Whitelist export actualHTTP responses/logs; noGPS/date/token, preview equals read |
| 17 TTL/revoke/cleanup/secret loss | PublicCollection нет | Отсутствует | Server time, read-time410/no-store,cleanup≤24h,renew/rotate/restore negative tests |
| 18 large type/screen reader | Accessibility props/RM в city, S8 обычный UI | Слабо | TalkBack, fontscale, touch targets, contrast, every language/required screen on device |
| 19 failures/cost/progress | S10 defaultdeny; S11 actualSQLite failure PASS | Неполно | Bounded real provider/DB/storage/weather/pack failures, atomic budget, saved walk intact |
| 20 full80min chain | Только fixed manual3stop chain и city opening | Отсутствует | Request→choice→prepare→arrival/quest→adapt→offline→complete→optin profile, все обязательные функции |

## Билеты плана: что можно принять сейчас

Чекбоксы архивных билетов намеренно не редактировались. `blocked by` описывает последовательность приёмки; не является запретом писать независимую реализацию с маркированным adapter до появления аккаунта/полевого участника.

| Билет | Текущий статус | Конкретный остаток и доказательство принятия |
|---|---|---|
| T01 native foundation | Неполно | S5–S7 доказывают build/install/map/Stop; нет30мин/20мин screen-off baseline, полной native матрицы, core audio/offline map |
| T02 data/routing/free/RAG | Неполно | S9 accepted bounded research, не fullgate. Нужны lawful exact-origin+connectors, actual hosted/managed resource limits, verified no-charge entitlement, real30case RAG |
| T03 WalkBundle/contracts | Отсутствует | S2 явный standalone EditorialWalk. Нужны полный versioned contract/asset manifest, четыре Module Interface, failure variants, одинаковые версии/preview на обоих clone |
| T04 real request→walk | Отсутствует | Product request/server/planner нет; подключить импорт+EndRule+geometry+manual/current start+source UI |
| T05 durable WalkSession | Неполно | S2/S11 strong manual save/restore; нет event journal/outbox, abandoned, production bundle compatibility, actual active-kill acceptance |
| T06 grounded RAG | Отсутствует | Retrieval+generator+claim validator,20question eval и30provider probe с10/язык, no invented critical facts; honest quota/offline fallback |
| T07 arrivals | Отсутствует | Native dwell+replay+journal+stable notification IDs+POI identity+denied notification path; матрица screen-off/Stop |
| T08 context feasibility | Отсутствует | Requests/time/season/hours/weather/1–3, current end-resolved budget и детерминированные edge cases |
| T09 languages/audio | Неполно | S3/S4 text3языка; нет asset3языка, player/filehash/version/pause/duck/headphones/native offline |
| T10 complete offline | Отсутствует | Immutable manifests, durable map/audio downloader, readiness tuple, native byte/concurrency/UA limits, airplane/revision/storage proof |
| T11 quests/collection | Неполно | One coherent manual3question chain and one walk discovery S2/S11. GPS/manual/mixed,canonicalPOI aliases, nextchapter и event ids ещё нет |
| T12 consented adaptation | Отсутствует | Warm indoor verified alternative+remaining time+diff/accept/reject+revision/oldpack retention+safe deviation |
| T13 PublicCollection | Отсутствует | Нет code/storage/UI/endpoints; весь preview/token/TTL/update/rotate/revoke/read/export/cleanup scope |
| T14 first editorial sample | Неполно | S4 source-linked original3chapters delivered to APK; audio/people review/full language-offline walkthrough pending |
| T15 usable/accessibility | Неполно | Map/card/motion source+S7/S8; нет completeonehand/TalkBack/large type3языка/navigationinterruptions/feedback |
| T16 privacy/cost vertical | Неполно | Defaultdeny и nativeStop есть; server ACL/global reservations/profile leak tests/delete/retention отсутствуют |
| T17 M2 three zones | Неполно | Один3stop package в районе Байтерека. Нужны≥30обогащённыхPOI,3цепочки,≥6глав(цель9),6достижений,EXPO+старыйцентр и3языка/audio |
| T18 M2-TECH | Отсутствует | Все AT и contentminimum + lawfulcurrent-origin gate на frozenRC, допускается только labeled18+research beta до поля |
| T19 pilot/FIELD-PASS | Отсутствует | Нет8–12добровольцев/наблюдений/реальных3маршрутов и второгоAndroid. Нельзя заменить кликами/MCP/replay |
| T20 repeat refinement | Отсутствует | Opt-in discoveries/novelty ranking, newchain/notenoughreason, фактический secondwalk; priorpilot informs refinements |
| T21 operations/recovery | Отсутствует | Нет deployedbackend/backuprestore/epoch/failuremonitoring/rollback доказательств; savedlocal walk alone недостаточен |
| T22 release/track demo | Отсутствует | Есть reproducibleAPK, не finalsmoke. Требуются allAT/FIELD gate,5–7minpresentation+actualvideo+RAG/data/privacy/constraints package и finalreviews |

## Минимумы и цифры: текущее покрытие

| Требование S1 | Факт baseline | Статус |
|---|---|---|
| Базовый городской каталог с честным административным coverage | 20 импортных карточек одного bbox из247locatedrecords;6районов cityguide геометрии | Неполно: polygons не городскойPOIsearch; знаменатель полноты неизвестен |
| ≥30 обогащённых POI, примерно10/зона | 3 editorial stops одного маршрута;20raw/curated import не равны20обогащённым | Не достигнуто |
| 3 полные квестовые цепочки, по1/EXPO,Байтерек,старыйцентр | 1 chain с3вопросами | Не достигнуто |
| ≥6 опубликованных глав, рабочая цель9 | 3 text chapters, humanreview pending | Не достигнуто |
| 6 правил личных достижений | 1 manualwalk discovery;GPSPOIfirstarrival нет | Не достигнуто |
| RU/KK/EN core audio для каждой опубликованной главы | 0 подготовленных файлов/hashes; deviceSpeech возможен | Не достигнуто |
| Полный pack≤3000tiles,≤50MB ресурсов,≤4requests/UA | Packнестроился, counters/trace нет | Не измерено |
| T01 baseline30мин,≥20мин экран-off | FGS81сDozing, callbacksвоsleepнеизолированы | Не достигнуто |
| Android матрица/второй производитель | XiaomiAndroid12/API31; Android14+ не принят | Не достигнуто |
| RAG30realrequests,10/язык,≥90%supported,0inventedcritical,p95gen≤10s | 0 modelcalls | Не измерено |
| End-to-end полезныевариантыp95≤15s,harddeadline25s | Нетend-to-end runtimeplanner | Не измерено |
| Managedrouting при выбореfallback:graph/index≤300MB,DB≤400MB,SQLp95≤2s/timeout3s | Localgraphcountsесть,managedDBнет | Не измерено; localJSONsize не SQLmeasurement |
| Pilot8–12adults, resident/tourist recruitmentgoal | Нетзаписанныхучастников/согласий/наблюдений | Не достигнуто |
| Pilotвыбор≤2мин≥75%,конкретныйwow≥2/3,завершение≥75%,пониманиеadapt≥80% | Нетприёмочногонаблюдения | Не измерено |
| Repeat≥1/2residentsза14дней;≥1/2touristsсвозможностьюследующихдней | Единственныйпакет,наблюденийнет | Не измерено; intentionнеretention |
| FIELD:по1полному3zones+repeatkeyscenario на2ndmanufacturer | Нетполевыхпротоколов | Не достигнуто |
| Profileexpiry30×24h/read-time;cleanup≤24h;backupdoesnotreviveURL | Нетimplementation/runtime | Не достигнуто |
| RolloutSLO≥99%crashfree,≥95%admittedplans;0progressloss/duplicateaward/leaks | Scopedtestsесть,livecampaignнет | Не измерено; noincidentsinlocaltestsнеSLO |

Архитектурные лимиты50plan/revise/day,5/device/day,80%providerquota,ORS300/day20/min,publication10mutations/device/day,1/s/token и request/payload512KiB/32KiB/16KiB пока являются требованиями. S10 не является реализацией общего атомарного serverbudget, rate limits, idempotency receipts или deadlines. Проверять их нужно через реальный backend Interface, не через вручную написанную таблицу лимитов.

## Наиболее важные инженерные решения перед следующим APK

1. **Сначала общий контракт и Interface модулей.** Root реализует `contracts` с PlanRequest, PlanReply, WalkBundleV1, EndRule, EvidenceSet, AssetManifest, SessionEvent и PublicSnapshot. Сохранить EditorialWalk как явно обозначенный подготовленный Adapter и сделать явное преобразование. Не расширять его бесконечно независимыми полями. Неизменяемые содержание и bundle отделены от готовности ресурсов и прогресса. Ошибки различают unavailable, no-feasible, неизвестную major-версию и неверный hash. Исходный origin, выбранный конец, доказательства connector, время, три языка и audio входят в контракт. Это разблокирует параллельную работу без ожидания аккаунтов, но не закрывает приёмку T01/T02.
2. **Рабочий запрос → выполнимые предложения на реальных данных.** Root: нормализация запроса, retrieval сведений, структурированные часы/праздники, бюджет и вычисление конца, ограниченные вызовы маршрутизатора, 1–3 различающихся предложения. Импортные карточки становятся POIEvidence с provenance/unknown, а не произвольным текстом prompt. Подготовленный маршрут остаётся доступен независимо от backend. Generator Adapter выключен до доказанного бесплатного режима. Фиксированное объяснение называется сохранённым или редакционным материалом; для RAG нужен настоящий допустимый generator.
3. **Нативная сессия и прибытие.** Отдельный владелец native/session: вычисление прибытия внутри активного FGS, монотонное время, короткое окно сырых отсчётов в RAM, durable Arrival/event journal/outbox без координат. Нельзя строить screen-off Arrival через текущий JS `onLocation`: controller сохраняет point только при `foregroundUi`, module посылает signal только при `resumed`, а UI отбрасывает background fix. Сохранить независимый native Stop и отсутствие скрытого восстановления GPS. Сначала уникальность eventId/POI/aliases и транзакция, затем уведомление. Сделать отдельное подтверждённое досрочное завершение вместо Stop=Pause. Отдельно решить случай запрещённых уведомлений: нынешняя diagnostic-защита блокирует acquisition и не выполняет US-18.
4. **Пакет и audio как одна проверяемая автономная вертикаль.** Владелец на втором ноутбуке: manifest/checksum, временные файлы и атомарная активация, готовность для конкретной revision, durable map/audio, native UA/bytes/concurrency, отмена и нехватка места. Root согласует зависимости и миграции. Основное audio на трёх языках требует прав и компетентной редакторской проверки. Системный expo-speech остаётся дополнительной функцией для динамического текста. Сначала один настоящий полный pack, затем три зоны.
5. **PublicCollection параллельно отдельным владельцем.** Domain/server code, настоящая локальная БД и интеграционные тесты можно написать сейчас. Deployment не нужен для подготовки preview, sanitizer, TTL, revoke, rotate и восстановления с epoch. SecureStore capability требует согласованной зависимости. Проверить whitelist публичных полей, независимые токены, только digest на сервере, no-store, compare-and-swap и очистку. Локальная интеграция не закрывает публичную HTTPS-приёмку.
6. **Контент и данные без ожидания backend.** Независимые исполнители готовят EXPO и старый центр: наружные anchors, факты, права, свежесть источников, 3 цепочки, минимум 6 глав, 6 правил достижений и 30 обогащённых POI. Каждое утверждение сверяется с первичным источником; критические unknown/конфликты передаются планировщику. Неподтверждённое кафе ради «кофе/внутрь» не добавляется. Человеческая редактура и полевая проверка учитываются раздельно.
7. **Адаптация после первых общих bundle/session Interface.** Предложение новой revision показывает diff и требует согласия, учитывает исходный end rule и оставшееся время, сохраняет заработанные открытия. Отказ сохраняет прежний план; принятие новой revision сбрасывает ready до проверки ресурсов. Тесты охватывают deadline, повторный ответ, устаревшую revision, current origin, indoor hours, отмену и offline. Затем выполняется весь AT-20 на 80 минут.
8. **Приёмка и выпуск отдельным потоком.** Зафиксировать RC, версии данных/audio/manifest, воспроизводимый APK, матрицу устройств и отрицательные сценарии всех AT. Провести независимые Standards/Spec review. Затем — явно обозначенная исследовательская M2-бета 18+, настоящий пилот/FIELD, повторная ценность, эксплуатация и комплект T22. Выпуск не объявлять до соответствующего уровня gate.

## Что агенты могут сделать автономно, а где нужны люди/аккаунты

| Зависимость | Можно подготовить без участия человека | Необходимое внешнее доказательство |
|---|---|---|
| Бесплатный backend/routing/generator | Runtime adapters, локальные миграции/RPC/HTTP-тесты, fail-closed бюджет, обезличенный набор из 30 запросов, конфигурация deployment без секретов | Конкретные аккаунты/права, проверенные бесплатные quota/billing/privacy/retention и реальная работа по HTTPS. Секреты вводит владелец в хранилище, не в чат; платных вызовов нет |
| Маршрут от текущей точки | Проверка endpoint/connector, импорт настоящего графа, отрицательные случаи барьеров/входов, уточнение публичного старта | Актуальные условия выбранного hosted adapter либо реально развёрнутый managed graph с измерениями ресурсов/latency/logging; физические anchors/connectors затем проверяются в поле |
| Основное audio и языки | Скрипты, manifest прав, player, checksum, тексты записи, локальные проверки | Реальный разрешённый голос/собственная запись и компетентная RU/KK/EN редактура/произношение. Наличие ключа или системного голоса не доказывает права |
| Android acceptance | Build, install-r без clear, hash/signature/manifest/DEX, запись собственного приложения, протоколы | Подтверждение фактических Play Protect/runtime-диалогов; физический телефон и экран; второй производитель и Android14+ по матрице |
| Поле и пилот | Маршруты, чеклисты без GPS-трека, согласие/feedback-формы, наблюдаемые задачи и отчёты | Люди реально проходят три зоны, повторяют ключевой сценарий на втором Android и дают добровольные наблюдения. Агент и запись экрана это не заменяют |
| Повтор за 14 дней и стабильность | Добровольные измерения, локальный экспорт отчёта, правила знаменателя, runbook | Реально прошедшее время, реальные возвращения/наблюдения, без покупок или скрытых keepalive |
| Комплект трека | Уже можно писать архитектуру, data/RAG/privacy-пояснение и каркас презентации на 5–7 минут | Финальная демонстрация показывает реально работающие RAG/routing/adapt/offline/profile, помечает replay и ограничения; не монтирует несуществующий live path |

Это точечные внешние gates, а не причина прекращать всю разработку. Пока они отсутствуют, продолжать общий контракт, native/local modules, backend Implementation, контент, meaningful tests и полноценный интегрированный внутренний путь. Итог цели остаётся непроверенным до исполнения исходной матрицы; этот документ не разрешает сокращать scope или выдать pending за completed.

## Дельта после исходного аудита: локальный PublicCollection

Следующая работа делегирована Root и добавлена отдельно от baseline-матрицы выше. [PublicCollection](../../packages/public-collection/README.md) реализован как независимый Module без новых внешних зависимостей: строгий preview/allowlist, явный publish/update/renew, отдельные read/admin capabilities с хранением только hashes, revision/CAS, тридцатидневный TTL, rotate/revoke, очистка payload и стандартный HTTP Request→Response с no-store JSON/HTML. Публичный snapshot не получает координаты, даты посещения, device/session/admin-поля; выбранные названия квестов включаются только явным `quests[]`.

Восемнадцать тестов публичного Interface прошли на настоящих локальных SQLite, real crypto и управляемом серверном времени. В том числе физически восстановлена старая profile DB после revoke/rotate при сохранённом внешнем authority store: старые URL не ожили. Проверены недоступность/новая epoch, alias того же физического SQLite-файла, idempotency, concurrent/stale updates, expiry/renewal/cleanup, HTML escaping, bounded bodies, atomic quotas и finite capacity. Root отдельно прочитал основной shape; окончательный независимый review после freeze ещё требуется.

Атомарная authority SQLite ограничивает установку десятью mutations/day и одним новым действием в секунду; десятое действие резервируется для revoke. Общие ceilings — 200 mutations/day, 120 reads/minute и 5,000/day, 240 HTTP requests/minute и 10,000/day, а также конечное число profiles/actors/read-token/operation records. Новые capability не обходят глобальный бюджет. Нет IP/raw-body logging. При storage capacity publication закрывается fail closed, а maintenance может удалить недоступные payload. Это локальные потолки, не подтверждение quota бесплатного хостинга.

Это переводит локальную реализацию T13 и часть правил T16/T21 из «отсутствует» в «неполно» для следующего integration baseline. Полная T13/T21 и US-29–33/AT-16–17 ещё не приняты: mobile selection/SecureStore, реальный hosted HTTPS/SQL/независимый authority, scheduled cleanup ≤24h, edge limits, operational backups/restore и device/language acceptance отсутствуют. Pending operation старше 24h остаётся fail closed; README задаёт глобальный epoch barrier с явной новой публикацией, а автоматический targeted recovery и настоящий crash exercise не заявлены выполненными. Никаких deployment/network/account/paid API/purchases/ключей в этой работе не было.

### Исправление после независимого Spec review: доверенный каталог PublicCollection

Независимый reviewer воспроизвёл P2: первоначальный структурный allowlist разрешал произвольные ID/title и тем самым свободный личный текст вне псевдонима. После воспроизводящих RED-проверок Module требует обязательный server-owned `catalog`: ID, все переводы RU/KK/EN и допустимые proof kinds. Constructor копирует каталог в приватные lookup; последующая мутация исходного объекта не меняет правила. Bound `collection.preview` используется и HTTP preview. Publish/update заново проверяют этот каталог даже при хеше, полученном через standalone helper с другим каталогом. Неизвестный ID, подменённый/чужой язык title или недопустимый proof отклоняется; отсутствие/повреждение каталога закрывает Implementation с 503. Сохранённый payload перепроверяется при read: удаление/переименование каталожной записи закрывает прежний snapshot с 410, без молчаливой замены подтверждённого названия.

Текущий пакет проходит **23/23** local public-interface tests на настоящем SQLite: 18 прежних и 5 новых с подслучаями всех групп/языков, поддельного helper hash, mutable catalog и read/HTML после смены доверенного содержания. Команда/хеши — [local-verification](../../packages/public-collection/evidence/local-verification.json), полный результат — [TAP](../../packages/public-collection/evidence/local-tests.tap). Исторический результат 18 выше сохранён как отдельный baseline. Объектный каталог тестов не доказывает прав на production-содержание, компетентной редакторской проверки, фактического прохождения квестов или запуска hosted profile; соответствующие gates остаются открытыми. Нужна повторная независимая проверка исправления.

## Интеграционное дополнение · 2026-10-20

Это отдельный более поздний срез исходников и локальных модулей. **Исходные 38 строк US, 20 AT и 22 билета выше сохранены как baseline-аудит, а не переписаны задним числом.** Новые доказательства меняют состояние отдельных реализаций, но не превращают прежние device/field-наблюдения в проверку нового продукта. Установленный Android остаётся **0.3.4/code9**: новые contracts, CityEvidence, planner, offline-pack, PublicCollection и canonical audio в него ещё не интегрированы. Полная T03, M2-TECH, FIELD-PASS, hosted beta и первый трек не приняты; исходный scope не сокращён.

### Что появилось после baseline и на чём основан статус

| Module / seam | Более позднее локальное доказательство | Чего это ещё не подтверждает |
|---|---|---|
| Canonical contracts | Root сообщает **49** tests; [Standards addendum](CONTRACT-STANDARDS-REVIEW.md) независимо повторяет три новых deadline-сценария и объясняет сохранение сокращённого бюджета/явного продления. Полный immutable bundle, hash, endpoint/end rule, parent validation и partial pack reader реализованы | Mobile Session v2/migration/consent, SHA Adapter на Android, один контракт на двух ноутбуках и полные T01/T02 |
| CityEvidence | [Source-local receipt](../../packages/city-evidence/evidence/verification.json): **19** tests, фактический каталог из 20 выбранных OSM-карточек +2 редакционных идентичностей, всего 22 POI/3 anchors/24 facts/24 sources; query filters, provenance, unknown и source closure | Это один bounded район. Receipt прямо фиксирует 0 field-verified anchors, 0 current structured schedules, 0 current indoor access и 0 current coffee service. Нельзя обещать работающий кофе/помещение или полноту Астаны |
| WalkPlanner | Root сообщает **13** tests текущего source-local планировщика; [независимый Spec review](PLANNER-SPEC-REVIEW.md) проверяет записанные пути, три окончания, честные отказы и более поздние proposal mechanics. В reviewed routing replay независимо сопоставлены 248 adjacent traversals по шести путям | Runtime RAG/разрешённый генератор, arbitrary exact-origin connectors, живые часы/погода/альтернативы, warm-indoor успех, HTTP/backend и mobile принятие revision. Последние source/metadata delta после review требуют сверки с окончательными hashes |
| OfflinePack | [Actual filesystem/SQLite receipt](../../packages/offline-pack/verification.json): **14** tests. [Node runtime review](NODE-WORKSPACE-REVIEW.md) дополнительно проверяет настоящий canonical plan → partial pinned pack → reopen без ложной активации | Native durable storage/map Adapter, реальная карта с соблюдением UA/bytes/concurrency/лицензии, полные audio assets, airplane/revision/low-storage сценарии на Android. Partial остаётся partial |
| PublicCollection | **23** actual SQLite tests и [независимый Spec recheck](PUBLIC-COLLECTION-SPEC-REVIEW.md). P2 произвольного title/ID закрыт trusted server-owned catalog; bound preview, publish/update и read перепроверяют ID/перевод/proof. Проверены capabilities, TTL, revoke/rotate, restore barrier и finite budgets | Mobile selection/SecureStore/delete UX, hosted HTTPS/SQL/независимый authority, actual scheduled cleanup ≤24h, edge quota/logging и operational recovery. Каталог не аттестует реальное посещение |
| Normal Node workspace / Metro export | [Независимый review](NODE-WORKSPACE-REVIEW.md): сборка из отсутствующих scratch outputs, обычные package ESM imports, **2** runtime tests, strict consumer types. P2 native-source export воспроизведён полным Expo pipeline и закрыт compiled native entries; изолированный Android JS bundle собран, **24 modules**, hash записан в review | Это JS-сборка отдельного consumer, не установленное приложение, Hermes/device run, bridge/native SQLite или приёмка GPS/audio |
| Canonical audio tools | Финальные **18 Python +3 Node** checks. [Независимый audio review](CANONICAL-AUDIO-REVIEW.md) закрыл P2 root-junction и linked writer-lock после реальных Windows regressions. Root затем отдельно проверил [54 фактических MP3](../../evidence/audio-corpus/root-media-verification.json) и [их canonical binding](../../evidence/audio-corpus/root-binding-verification.json), partial только из-за карты | Native player/offline/focus/headphones и человеческое прослушивание/произношение/языковая редактура остаются gates; наличие файлов не принимает всю поставку на Android |

**Граница общего прогона.** По сообщению Root при передаче этого дополнения первый расширенный aggregate завершился **227 PASS**: 25 data, 22 spend, 49 contracts, 19 CityEvidence, 13 planner, 14 offline, 23 PublicCollection, 2 runtime, 16 Python audio, 3 Node canonical audio, 10 lifecycle, 23 editorial/SQLite/Stop, 3 city и 5 geometry. Это сообщение координатора о конкретном более раннем прогоне, а не новый независимо выполненный этим аудитом aggregate. После него Root сообщил отдельный **source/metadata delta 13 PASS**; эти результаты **не складываются** в «240 независимых тестов». Исправления Windows audio junction/lock и последующие изменения требуют повторного общего прогона с новыми receipts/hashes и review. Здесь финальный aggregate текущих исходников не сертифицируется. [Foundation receipt](../../evidence/foundation/local-verification.json) на момент чтения всё ещё содержал исторический 146-test срез; он не подтверждает число 227 или окончательные bytes.

**Второй ноутбук.** По удалённому наблюдению Root на экране друга есть кандидат **30 POI**, Git bundle `fb3e4e9` и три субагента, исследующие три цепочки. Это ещё не импорт, не проверенная версия общего контракта, не измеренное покрытие трёх зон и не accepted handoff. Для зачёта нужны полный commit/bundle hash, provenance/rights, сами файлы в отдельной копии, независимое извлечение/валидация и meaningful tests; screenshot/сообщение о готовности этого не заменяет. Данное дополнение не обращалось к ноутбуку друга.

### Следующий путь по всем 22 билетам

Статусы ниже — остаточная работа полного билета после появления локальных модулей. Таблица не присваивает процент готовности и не закрывает билет количеством тестов.

| Билет | Осталось до приёмки |
|---|---|
| T01 | Новый standalone APK с реально подключёнными Module; upgrade и восстановление; native карта/SQLite/audio/GPS вместе. Полная 30-минутная проверка, ≥20 минут screen-off, Stop/permission/process matrix, Android14+/второе устройство и измеренная батарея |
| T02 | Интегрировать/перепроверить данные и граф; lawful actual origin/end connectors и resource/endpoint gate. Подтвердить именно бесплатный допустимый runtime provider и выполнить обязательную RAG evaluation; при отсутствии остаётся blocked соответствующая способность, независимая работа продолжается |
| T03 | Применить canonical contract в Android через Adapter, не переименовывая EditorialWalk; Session v2/event schemas, транзакционная миграция с сохранением старого прогресса, device preview и одна pinned версия на двух clone. Source foundation/Node build сами этот билет не закрывают |
| T04 | Подключить настоящий пользовательский запрос/ручной или точный текущий старт к runtime данным/планировщику/телефону; 1–3 содержательно различающихся выполнимых предложения и понятные отказы. Prepared replay явно остаётся prepared replay |
| T05 | Реализовать durable canonical Session `open/dispatch/snapshot`, event IDs, shared control/version CAS, abandoned и once-only awards. Активная сохранённая сессия восстанавливается paused; проверить миграцию, повтор и active process kill |
| T06 | Настоящий retrieval → разрешённый runtime generator → grounded reply, prompt-injection защита, проверка утверждений/источников, RU/KK/EN quality/quota/latency gate. Лексический поиск и сохранённые главы не подменяют генерацию |
| T07 | Native screen-off detector с нормативными 60m/30m/30s/≥3 samples, freshness/monotonic/outlier/ambiguity policy, coordinate-free Arrival/journal/outbox и stable POI aliases. Отдельно отказ уведомлений, native Stop и физическая матрица; [точный integration design](../research/NATIVE-ARRIVAL-INTEGRATION.md) |
| T08 | Развить ограниченный replay до реальных context/hours/weather/holidays/длительности визита, допустимых входов/переходов и обязательных ограничений; подтвердить выбранный конец/возврат и честные indoor/coffee альтернативы |
| T09 | После независимо закрытых filesystem review-defects и подготовленных 54 MP3 подключить native Audio Adapter; выполнить human pronunciation, offline, audio focus, interruption/headphones/lockscreen и права/атрибуцию поставки на Android |
| T10 | Подключить native filesystem/map/audio Adapters и полный revision-scoped pack; законные лимиты скачивания/UA/concurrency/bytes, atomic activation, interruption/low-storage/revision readiness и airplane/restart на Android |
| T11 | Подключить общий event/proof model к квестам и коллекции; Arrival/manual/mixed различимы, aliases и first award глобально once-only, события/повторные прохождения не дублируют награды. Сохранить ручной доступ и последовательный сюжет |
| T12 | Связать source-local revision proposals с проверенной warm-indoor альтернативой, текущим бюджетом/end rule и mobile diff/явным accept/reject. Повторить parent CAS/consent при durable commit; новый pack не наследует offlineReady прежнего |
| T13 | Подключить opt-in preview/selection/SecureStore/управление в приложении и реальный бесплатный hosted Adapter. Подтвердить HTTPS read/revoke/rotate/expiry/cleanup/cache/logging/restore на живом сервисе |
| T14 | Превратить один редакционный sample в полноценный эталон: source/rights/fact-versus-fiction, human RU/KK/EN review, prepared audio и полный пользовательский walkthrough; исходное наличие трёх глав недостаточно |
| T15 | Интегрировать весь новый путь в приятный map-first UI; one-hand, крупный текст, TalkBack, Reduce Motion, focus/ошибки/права/обратная связь на устройстве, все три языка. Старый motion PASS не покрывает новые экраны |
| T16 | Свести location RAM-only/Stop/delete/backup, public allowlist/catalog/secret storage и server quotas/logging в одну проверенную вертикаль. Policy/default deny и local Public budgets полезны, но не доказывают atomic planning/provider quota и hosted leakage absence |
| T17 | Получить проверенный corpus трёх глубоких зон, включая EXPO/старый центр: ≥30 обогащённых POI, 3 цельные цепочки, ≥6 глав (цель9), 6 достижений, три языка/audio. Проверить данные друга самостоятельно; административная карта и candidate30 не являются этим покрытием |
| T18 | Зафиксировать release candidate и повторить **все AT-01–20 и все US-01–38**, включая 80-минутный сценарий и обязательное содержание. M2-TECH допускает лишь явно обозначенную research beta до отдельного FIELD-PASS |
| T19 | Выполнить нормативный полевой объём/маршруты трёх зон и второе Android; пилот 8–12 добровольцев обоих сегментов, реальные ошибки/батарея/входы/язык и privacy-safe feedback. Агенты/симуляция не заменяют людей |
| T20 | Реализовать следующую прогулку/главу и novelty с учётом открытий; измерить повторное использование по пилоту, внести проверенные улучшения. Нет обещания retention по локальному тесту |
| T21 | Испытать реальный backup/restore/epoch closure, retention, мониторинг/лимиты, rollback контента/APK, provider pause/outage и pending mutation recovery. Local restore тест Public и Node pack reopen не доказывают hosted operations |
| T22 | Пройти final smoke/reviews/upgrade и ограничения поддерживаемых устройств/зон на принятом RC после нужных gates; подготовить весь комплект трека: RAG/data/location/privacy/constraints, воспроизводимые сценарии, презентация 5–7 минут и фактическое demo video |

### Покрытие оставшегося пути: 38 US и 20 AT

Каждая исходная история остаётся в индивидуальной baseline-матрице выше. Практические владельцы реализации теперь группируются так: **US-01–08 → T02/T04/T06/T08**; **US-09–18 → T01/T03/T05/T07/T12/T15**; **US-19–23 → T09/T11/T14/T17**; **US-24–26 → T03/T09/T10/T12/T21**; **US-27–28 → T05/T11/T13/T16/T21**; **US-29–34 → T13/T16/T21**; **US-35 → T02/T06/T14/T17**; **US-36–37 → T17/T19/T20**; **US-38 → T15/T19**. T18 и T22 повторяют общую приёмку всех историй, а не заменяют их реализацию.

| AT | Следующее недостающее сквозное доказательство |
|---|---|
| AT-01–04 | После local CityEvidence/planner подключить реальный запрос/варианты, runtime grounded facts, живые hours/holiday/context и выбранный конец/бюджет на проверяемом Adapter; unknown не становится обещанием |
| AT-05 | Реальный revision proposal → понятный mobile diff → согласие/отказ → current-parent CAS → сохранённый новый/старый pack; source proposal сам не является применённой адаптацией |
| AT-06 | Canonical Session и pack на Android переживают процесс/перезапуск/upgrade; once-only прогресс и paused recovery, без обещания GPS после force-stop |
| AT-07–09 | Native Arrival/replay boundaries плюс физический screen-off; различимая ручная отметка и поздний GPS award; запрет уведомлений сохраняет достижение без повторного alert после выдачи разрешения |
| AT-10–12 | Полный сюжет/квест/коллекция с proof/aliases, повторные события и три языка всех главных экранов/ошибок/итога/public UI; компетентная языковая проверка |
| AT-13–15 | Весь prepared core audio и карта в durable pack на устройстве; частичная загрузка не готова, новая revision проверяется заново; airplane продолжает сохранённое и честно отказывает новому route/AI/publish |
| AT-16–17 | Local Public23 + catalog review интегрируются с mobile preview/SecureStore и реальным HTTPS/no-store/revoke/expiry/≤24h cleanup/restore. Не опубликованы raw GPS/visit dates/admin secret |
| AT-18 | Реальные large-text/screen-reader/one-hand проверки всего интегрированного пути и текстовый эквивалент аудио, три языка |
| AT-19 | Provider/погода/network/storage/quota failures через реальные Adapters сохраняют доступный прогресс; никакой автоматической платной операции; pending/errors не показываются как success |
| AT-20 | Зафиксированный новый APK действительно связывает выбор → подготовку → прохождение → «замёрз, внутрь» → согласованную замену → offline → восстановление/итог → выбранную публикацию. Все обязательные функции, а не только motion или текстовый sample |

**Последующий срез Root.** После завершения первоначального дополнения Root повторил полный runner на исправленных исходниках: **229 PASS / 0 failed / 0 skipped**, с [новым точным логом и hashes](../../evidence/foundation/integration-verification.json). Это заменяет число 227 для финального source-local среза, а не суммируется с ним. Исторический 146-test receipt сохранён отдельно. Reviewer независимо закрыл оба audio ownership P2; Root отдельно проверил все фактические MP3 и binding, как указано выше. Эти локальные результаты не принимают мобильную сессию, хостинг или всю бету.

Ближайшая конкретная последовательность: **canonical Android consumer + Session v2/migration/manual path → native Arrival/Stop/US18 и Audio/Offline Adapters → live no-charge planning/RAG + consented warm-indoor flow + Public hosting → verified three-zone corpus → T18/T19/T20/T21/T22**. Независимые данные/контент/редактура и эксплуатационные Adapters могут готовиться параллельно. Недоступный аккаунт, носитель языка, устройство или поле оставляет соответствующий gate открытым; он не разрешает выдать локальный тест за окончательную готовность и не требует прекращать независимую работу.
