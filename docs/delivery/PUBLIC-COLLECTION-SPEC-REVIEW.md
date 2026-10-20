# PublicCollection — независимый Spec review

Дата: 2026-10-20. Среда: Windows, Node v22.22.2, встроенная experimental SQLite. Проверены исходники `packages/public-collection`, исходные 18 тестов, итоговые 23 теста и README против PRODUCT-SPEC, ARCHITECTURE, DECISIONS A05, T13 и T21. Изменений пакета нет. Это Spec axis; Standards review выполняется отдельно владельцем.

## Вердикт

**В проверенном локальном ядре открытых блокирующих Spec findings после исправления нет. Полная приёмка T13/T21 остаётся открытой из-за перечисленных ниже интеграционных gates.** Найденный P2 дефект границы содержимого исправлен автором и независимо перепроверен. Отдельно отмечен UX integration concern отзыва при конфликте revision; API сохраняет CAS по нынешней ARCHITECTURE. Подтверждённых P0/P1 дефектов или возрождения отозванной ссылки в проверенных сценариях нет.

### P2 — CLOSED: произвольный текст проходил как название открытия/квеста

Норма: PRODUCT-SPEC:204 запрещает свободный текст первой беты; ARCHITECTURE:165 описывает выбранные badge/discovery IDs и названия завершённых квестов.

До исправления `src/model.mjs:45–52` проверял форму ID и длину `title`, но не существование ID, соответствие названия каталогу/языку или допустимую связь ID и типа. `collection.mjs:88–103` публикует результат, `http.mjs:21–24` выводит эти строки.

Исходное воспроизведение до исправления: snapshot с `nonexistent-poi-review`/`nonexistent-quest-review` и придуманными названиями проходит preview → publish → публичный HTML **200**, оба произвольных текста видны. Экранирование исправно; проблема в разрешённом содержимом. Структурный whitelist не обеспечивает запрет свободного личного текста.

До внешнего HTTP нужны доверенный каталог/проверка разрешённых ID и серверное получение локализованных названий. Альтернатива — явно ограничить этот Interface доверенным внутренним источником и проверять содержимое на внешней границе. Ограничения одного мобильного селектора недостаточно. Псевдоним остаётся разрешённым исключением. Проверка не утверждает наличие серверной аттестации посещения.

**Recheck исправления:** обязательный server-owned catalog копируется в закрытые lookup при construction; `collection.preview` связан с ним, HTTP preview вызывает этот же Interface. Publish/update повторно сверяют известный ID, точный локализованный title и allowed proof; read/HTML не переименовывают сохранённое подтверждённое содержимое. Отсутствующий/невалидный каталог закрывает запуск с `CATALOG_UNAVAILABLE`/503. Новый код: `model.mjs:71–112`, `collection.mjs:10–11,41–44,88,148–152`, `http.mjs:64–66`.

Независимые **15/15 сценариев**: все RU/KK/EN проходят preview/publish/read/HTML; неизвестные IDs и подменённые titles всех трёх списков отклоняются, даже с совпадающим hash от поддельного helper catalog; запрещённый proof и forged-hash update отклоняются, прежний профиль сохраняется; mutation caller-owned catalog не меняет bound lookup; HTTP preview возвращает no-store/400; замена серверного title закрывает прежние persisted read/HTML с 410, без silent rename. **P2 закрыт для локального ядра.** Это не проверка фактического посещения/выполнения квеста и не компетентная языковая оценка.

### UX integration concern — stale revoke требует обработки CAS-конфликта

T13:36 требует «параллельные update/revoke … корректный приоритет отзыва». При этом ARCHITECTURE:167 требует compare-and-swap revision для update/revoke/rotate.

Факт: после update revision 1→2 корректно авторизованный revoke с revision 1 возвращает **409 REVISION_CONFLICT** (`collection.mjs:76–83,128–134`); профиль остаётся читаемым. Тест 13 проверяет другую последовательность: сначала update, затем revoke с уже актуальной revision, затем запоздалый update. Приоритет конкурирующего отзыва он не доказывает.

Root подтвердил: нынешняя ARCHITECTURE сохраняет CAS, объём API без отдельного решения не расширяется. Это UX integration concern, а не второй подтверждённый дефект ядра. Для приёмки T13 нужен явный owner retry/pending UX с получением актуального состояния. Отказ не называется успешным отзывом.

## Проверенный состав

| Область | Факт / граница доказательства |
|---|---|
| Preview и явная публикация | Канонический snapshot/hash, явное подтверждение и предупреждение о потере управления; без publish публичного профиля нет. Реальный Android opt-in ещё не доказан. |
| Expiry / renewal | 30×24 часа; чтение/rotate не продлевают; explicit update восстанавливает истёкший профиль с прежним URL. Монотонные часы предотвращают возрождение при откате серверного времени. |
| Revoke / rotate | Старые URL закрыты, retired hashes сохраняются; revoke удаляет активный payload. Восстановление старого profile-файла после revoke/rotate не открывает ссылки при сохранённой authority. |
| DTO / секреты | После fix — обязательный trusted catalog для IDs/titles/proofs. Лишние вложенные GPS/date/device/admin поля отклоняются. Read/admin — отдельные 256-bit значения; SQL содержит hashes, не raw tokens. Внешние URL/body/Authorization logs не исследованы. |
| HTTP / cache | HTML экранируется, внешних ресурсов/скриптов нет; JSON/HTML/ошибки и owner replies используют no-store, no-referrer, noindex. Реальная CDN/прокси конфигурация не проверена. |
| Authority / pending | Отдельный store, отключение при недоступности, новый epoch, hard-link alias отказ. Восемь fault probes ниже подтвердили закрытие чтения и retry через reopen. Независимость реальных hosted backup остаётся операционным требованием. |
| Бюджеты | SQLite BEGIN IMMEDIATE, persistent installation/global/read/request counters, Retry-After, конечные storage ceilings и закрытие при исчерпании. Новые capabilities не обходят global quota. Нагрузочная межпроцессная гонка отдельно не выполнялась. |

## Точные receipts

Команда из `packages/public-collection`:

```powershell
node --experimental-sqlite --test test/public-collection.test.mjs
```

Исходный итог до fix: **18 PASS, 0 FAIL, 0 cancelled, 0 skipped, 0 todo; 1561.7462 ms; exit 0**. Итоговый независимый прогон после fix: `node --experimental-sqlite --test test/*.test.mjs` — **23 PASS, 0 FAIL, 0 cancelled, 0 skipped, 0 todo; 1581.5679 ms; exit 0**. SQLite experimental warning не означает ошибку теста.

До fix дополнительно выполнены 11 read-only проверок вне repo, с отдельными настоящими SQLite файлами:

- 8 комбинаций publish/update/rotate/revoke × прерывание после `authority.reserve` / перед `authority.complete`: чтение закрыто; maintenance + закрытие/повторное открытие обеих БД + идентичный retry восстановили ожидаемое состояние; raw tokens отсутствуют в проверенных SQL-строках.
- Pending после 24 часов: `RESULT_NOT_RETAINED`, чтение остаётся закрытым.
- Stale revoke после выигравшего update: 409, профиль доступен.
- Неизвестные ID с произвольными titles: публикация и публичный HTML 200.

После fix повторены все 8 fault scenarios и 2 edge cases: результаты неизменны. Кроме них, отдельный каталоговый probe прошёл 15 сценариев, перечисленных в recheck выше. Все probes используют отдельные временные SQLite файлы и удаляют только собственный явно созданный каталог через единый Node filesystem API; продуктовые БД не меняются.

Fault probes моделируют исключение на публичной authority boundary и затем reopen. Это **не** OS kill, отключение питания, hosted restore или production acceptance. Исходный тест «interrupted publish» проверяет replay уже committed операции; восемь этих fault сценариев стоит добавить в постоянную regression suite.

Scratch-команды, если владелец повторяет проверку в этой workspace:

```powershell
node --experimental-sqlite C:/Users/era/Documents/Codex/2026-10-20/x20/work/public-collection-review/boundary-probe.mjs
node --experimental-sqlite C:/Users/era/Documents/Codex/2026-10-20/x20/work/public-collection-review/catalog-recheck.mjs
```

## Открытые gates T13/T21

Mobile field selection/preview, SecureStore и Android backup rules, owner pending/retry UX, hosted PostgreSQL/Worker adapter/HTTPS, cache/logging configuration, реальный cleanup ≤24 ч, backup retention/restore report, подтверждение бесплатных ресурсов, outage/offline continuation, rollout/rollback и язык/accessibility остаются непринятыми.

Pending старше 24 часов не имеет точечного автоматического восстановления. README:98 честно требует операторского global suspend → fresh epoch → maintenance → explicit new publication/new URL. Это безопасно закрывает чтение, но полноценный T21 recovery требует фактической проверки этого runbook и понятного пользовательского состояния. Ручная кнопка maintenance не доказывает соблюдение 24-часового SLA.

Сетевых/provider запросов, облачных действий, платных API, покупок, работы с секретами и телефоном не было.

## SHA-256 исходного состояния до исправления

| Файл | SHA-256 |
|---|---|
| src/model.mjs | `6622313d97c1163fbc2af26739c481a5a22187ed169a702501d672d93d5ea437` |
| src/collection.mjs | `e6e311daab322c588b7d67c51401ecad227f203469b446618dc8130ae6e3ddbc` |
| src/authority.mjs | `3672f5b76ecb303736721d10b1167941f91b2a7a3102d94d1a1a67614524b206` |
| src/http.mjs | `226607a64b11f8ace24e64e3915b85f71d95c9ee5dc5bc1fc08c2bca6876e48a` |
| test/public-collection.test.mjs | `9c7ef27408880355d986ed87c6c0fbfcfa7c86bce86f9903b6405d38b234e251` |


## SHA-256 финального recheck

| Файл | SHA-256 |
|---|---|
| src/model.mjs | `7899ed8b58ae7c60f288fedab0be1fde66e01f1172a780abf5ce72fa543b1f92` |
| src/collection.mjs | `796ecf48b61e53554c0df6b3efa6268e8cba35b3e1049c4206232cc8817bcffe` |
| src/authority.mjs | `3672f5b76ecb303736721d10b1167941f91b2a7a3102d94d1a1a67614524b206` |
| src/http.mjs | `71d6fc619f16230df7bef66aeef29c5ba0fad8a60dc3b4a6ade6824a4f65bf04` |
| test/public-collection.test.mjs | `7198e09244f9c72c0ea227bae5fff2db92a689280018566dbba073012e6fa848` |
| test/catalog.test.mjs | `9d6d6933437b2140013d1e694cc81c4e3a568ec59529fd7b902d75a7fb9825f0` |
