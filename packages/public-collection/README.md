# PublicCollection

This module implements the local server core for T13 and the publication portion of T21. It does not deploy a server, call a provider, store mobile progress, or prove a live hosted service is free.

## Interface agreed for this implementation

The tests cross these public seams:

- `collection.preview(selection)` validates against its bound trusted server catalog and returns the exact public snapshot plus its confirmation hash and a loss-of-device warning. Standalone `previewCollection(selection, catalog)` also requires an explicit trusted catalog. Neither publishes anything. Only locale, pseudonym, selected discoveries/badges with allowed proof, and selected completed quest titles are accepted. Unknown fields at any depth fail validation.
- `createPublicationCapabilities()` generates independent 256-bit read and admin capabilities. The caller retains the read URL and must save the admin capability in protected device storage **before** sending a publication. Neither public HTML nor public JSON contains the admin capability. The server retains only hashes.
- `createPublicCollection({ databasePath, authority, now, publicBaseUrl, catalog })` exposes `preview`, `publish`, `update`, `rotate`, `revoke`, `read`, `admitRequest`, `maintenance`, and `close`. Missing/invalid catalog fails closed with `CATALOG_UNAVAILABLE`/503. Publication/update require the exact preview hash and explicit confirmation. Update also provides the currently expected revision and the complete selected snapshot, including after ordinary expiry/cleanup. Only publish/update renew the 30-day lifetime. A changed read URL never becomes valid again.
- `createSqlitePublicationAuthority({ databasePath, confirmedOutsideProfileBackups, limits? })` is a separate authoritative epoch/revocation/budget store. It starts closed. An operator explicitly opens a new epoch. Reads and mutations fail closed without this independent authority. Its SQLite file must be backed up and restored separately from the profile database; restoring both together would defeat this guarantee. The authority also guards each committed publication revision and retired token, so rolling back only the profile database cannot undo a revoke/rotate.
- `createPublicCollectionHandler(collection)` accepts standard HTTP `Request` objects and returns `Response` objects. JSON/HTML reads, errors and private mutation replies use `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and no indexing. Tokens are never logged. Body size and media type are bounded before processing.

Actual SQLite is used in integration tests. Only the server clock is replaced; crypto and database operations are real. Tests cover public behavior rather than SQL table layouts.

## Publication protocol

The device selects fields, displays the server's bound `collection.preview(...).snapshot` and the warnings, generates and safely stores capabilities, then sends a confirmed publish with an operation ID. Retrying the same operation with the same capabilities and snapshot recovers the original receipt while that snapshot remains catalog-authorized, without the server having to store a raw admin secret. A lost admin capability cannot be recovered using the read URL, pseudonym, or profile ID.

Mobile SecureStore integration, actual HTTPS hosting, authoritative storage operations, scheduled maintenance, account quotas, deployment, language/device checks and independent release review remain separate gates.

## Public snapshot

```json
{
  "locale": "ru",
  "pseudonym": "Исследователь",
  "discoveries": [{ "id": "baiterek", "title": "Байтерек", "proof": "gps_nearby" }],
  "badges": [{ "id": "three-forms", "title": "Три формы", "proof": "quest_completed" }],
  "quests": [{ "id": "three-forms", "title": "Город между небом и землёй" }]
}
```

All five fields are required; arrays may be empty. Locales are `ru`, `kk`, `en`. Proof values are `gps_nearby`, `manual_reported`, `quest_completed`, restricted further per catalog entry. Only the explicitly chosen pseudonym is free text. Titles must exactly match the trusted catalog's title for the selected locale after NFC normalization; they are not user descriptions. Plain text is escaped in HTML. Duplicate IDs within a selected list, unsupported proof, control characters, missing fields and unknown fields at **any** depth are rejected. The canonical snapshot is NFC-normalized and at most 32 KiB. There are no public coordinates, visit dates/times, track, device ID, session, admin secret, contacts, uploaded image or arbitrary HTML fields.

## Trusted catalog configuration

The deployment supplies an editorially validated catalog from server-owned content, never from a request or mobile bundle. All three translations are mandatory; discoveries and badges must declare a nonempty list of allowed proof kinds. Entries are bounded at 4,096 per group, IDs are unique within their group, and configuration is copied into private lookups when constructing the collection. Later mutation of the caller's objects cannot change the bound trust configuration.

```js
const catalog = {
  discoveries: [{ id: 'baiterek', titles: { ru: 'Байтерек', kk: 'Бәйтерек', en: 'Baiterek' }, allowedProofs: ['gps_nearby', 'manual_reported'] }],
  badges: [{ id: 'three-forms', titles: { ru: 'Три формы', kk: 'Үш пішін', en: 'Three forms' }, allowedProofs: ['quest_completed'] }],
  quests: [{ id: 'three-forms', titles: { ru: 'Город между небом и землёй', kk: 'Аспан мен жер арасындағы қала', en: 'City between sky and earth' } }],
};
const collection = createPublicCollection({ databasePath, authority, now, publicBaseUrl, catalog });
const preview = collection.preview(selectedSnapshot);
```

These example titles are test content, not proof of competent translation review or content rights. Unknown IDs, altered/cross-language titles and disallowed proofs return `PUBLIC_SELECTION_NOT_ALLOWED`/400 in preview and again on publish/update. A hash obtained using standalone preview with another catalog cannot bypass the bound check. HTTP preview uses `collection.preview`, and a request cannot carry its own catalog. No operation silently rewrites the selected title/proof before confirmation.

Every public read also revalidates persisted data against the currently bound catalog. If an entry/title/proof is no longer authorized after configuration change, the old snapshot is unreadable (410); it is never silently renamed. The owner can explicitly preview and update the current selection. Existing valid snapshots keep the same canonical hash and receipt shape. An earlier mutation whose snapshot is no longer allowed cannot be replayed to republish it; rotate/revoke remain control operations. A safe deployment must preserve old authorized entries where appropriate or deliberately close them and require a new review. This catalog limits public content; it does not attest that a person completed a quest or physically visited a site.

This is an owner's selected snapshot. It is not a server attestation of physical presence or an anti-cheat system. The mobile caller must select actual locally available discoveries/quests and retain their original proof type. The server does not infer museum entry from `gps_nearby`.

## Core commands

`publish({ operationId, readToken, adminCapability, snapshot, confirmedPreviewHash, confirmed:true, acknowledgedLossOfDevice:true })` returns private owner metadata `{ profileId, revision, expiresAt, readUrl }`. The returned metadata never includes the admin secret. The caller already holds it. Changing the snapshot after preview fails until it is reviewed again.

`update({ profileId, adminCapability, expectedRevision, operationId, snapshot, confirmedPreviewHash, confirmed:true })` atomically replaces the selected snapshot and returns `{ profileId, revision, expiresAt }`. This is also the **explicit renewal** command, including after ordinary expiry and payload cleanup. It needs the complete currently chosen local snapshot, preserves the read URL, increments revision, and sets expiry to server time plus exactly `30 × 24 hours`.

`rotate({ profileId, adminCapability, expectedRevision, operationId, newReadToken })` replaces a live URL without extending expiry. The device generates the new read token before the request and retains it for retries. Expired profiles must first be explicitly renewed with their selected snapshot.

`revoke({ profileId, adminCapability, expectedRevision, operationId })` closes reading immediately and removes the active payload in the same profile transaction. Revoke cannot be undone by update/renew. A later publish needs a fresh read token; the same retained admin capability may control the new publication.

The operation ID is 16–100 URL-safe characters and scoped to the admin capability hash. The same operation and same content return the original receipt for 24 hours; changed content conflicts. After receipt retention ends, the operation remains consumed and returns `RESULT_NOT_RETAINED`, rather than silently executing again. Receipts contain no raw capabilities or public read URL. Old receipt replies describe an operation's outcome, not a guarantee that its URL remains current after a later rotate/revoke. An accepted idempotent replay does not consume another mutation, but its HTTP request still consumes the aggregate request budget.

`read(readToken)` returns **only** the public snapshot, or `PUBLICATION_GONE`/410. Reads, locale presentation and rotate do not renew expiry. Public expiry dates are not added to the snapshot. Expiry metadata belongs to the private owner receipt. Public reads check the independent authority on every request.

`maintenance()` removes expired, revoked and authoritatively invalid payloads and clears expired private receipt data, while retaining minimal hashes/revocation metadata. A read also removes a locally known expired/revoked payload. A real operator must schedule maintenance at least once per 24 hours (hourly recommended), alert on failure, and prove this in the hosted environment. The local tests prove the cleanup function; **no cron or hosted cleanup SLA has been set up** by this package.

## Standard HTTP handler

| Request | Body / authentication | Result |
|---|---|---|
| `POST /v1/public-profiles/preview` | Public snapshot; JSON | Exact canonical snapshot, hash and localized warnings; no publication |
| `POST /v1/public-profiles` | `Authorization: Bearer <adminCapability>`, `Idempotency-Key`; body `readToken, snapshot, confirmedPreviewHash, confirmed, acknowledgedLossOfDevice` | 201 private owner receipt |
| `PUT /v1/public-profiles/:profileId` | Same private headers; body `expectedRevision, snapshot, confirmedPreviewHash, confirmed` | 200 updated/renewed private metadata |
| `POST /v1/public-profiles/:profileId/rotate` | Same private headers; body `expectedRevision, newReadToken` | 200 private owner receipt with new URL |
| `DELETE /v1/public-profiles/:profileId` | Same private headers; body `expectedRevision` | 200 revoked private metadata |
| `GET /v1/public-profiles/:readToken` | No admin authentication; default JSON; `Accept: text/html` for public page | 200 snapshot/page or 410 without snapshot |
| `HEAD /v1/public-profiles/:readToken` | Same checks as GET | Headers/status only |

Mutations reject unknown body fields and require `application/json`. Both declared and streamed request size are bounded at 40 KiB; the inner public snapshot remains limited to 32 KiB. Errors contain only a stable code: bad input/confirmation/selection 400, unauthorized capability 403, stale revision/operation/token conflict 409, gone publication 410, too large 413, wrong media type 415, budget/rate refusal 429 plus `Retry-After`, unavailable authority/clock/storage/capacity/catalog 503. SQL text, request bodies, tokens and stack traces are not returned. There is no logging or analytics hook in this module.

All responses, including errors, private replies and HTML, carry `Cache-Control: no-store`, no-referrer, noindex/nofollow, nosniff and restrictive CSP. HTML has no script, external resource, payload JSON embedding, management token or automatic request. Deployers must independently disable request-body/Authorization/URL-token logging at their reverse proxy/provider and preserve these cache rules. A copy already viewed or saved by a visitor cannot be retracted.

## Finite atomic budgets and storage

Counters are SQLite transactions in the independent authority store, so profile-process restart or restoring an older profile database does not reset them. Fixed global buckets are overwritten for the next UTC period; they do not create a row for every read, request, IP address or day. Per-installation counters use only the stable admin capability hash. A device identifier is neither accepted nor treated as a security boundary. Generating new capabilities cannot bypass the independent global mutation budget.

| Limit | Default local ceiling |
|---|---|
| Installation mutations | 10 per UTC day total; publish/update/rotate may use at most 9, reserving the tenth action for revoke |
| Owner mutation frequency | At least 1 second between newly reserved mutations for the same admin capability |
| All mutations across capabilities | 200 per UTC day, including revoke; ordinary global quota exhaustion returns 429 without claiming a revoke succeeded |
| All public reads | 120 per minute and 5,000 per UTC day |
| All HTTP requests, including malformed requests and retries | 240 per minute and 10,000 per UTC day |
| Profiles / installation actor rows | 500 / 500 retained rows |
| Permanently used read-token hashes | 5,000 rows |
| Consumed/pending/committed operation hashes | 20,000 rows |

`limits` may lower these aggregate/capacity ceilings; it cannot raise them. Deployment must use one consistent trusted configuration and lower it further to fit independently verified free resources. These local numbers do not prove a free hosting entitlement. The core checks read budgets directly; the supplied HTTP handler additionally calls `admitRequest()` before routing/body parsing. Another handler must preserve that request admission step. Network edge rate protection, connection/time limits and actual hosting CPU/storage/egress measurements still need a real deployment.

Budget checking and operation reservation commit atomically. A rejected stale/unauthorized command creates no mutation receipt. An accepted reservation consumes quota even if the profile transaction later fails, bounding repeated storage work. A refused mutation is not applied; the UI must show retry/pending, and must never label a rate-limited revoke as successful. Reads do not refresh publication expiry.

Retired token and operation hashes deliberately remain remembered. Once a finite storage ceiling would be exceeded, the authority commits a global closure and returns `PUBLIC_CAPACITY_EXHAUSTED`/503. All profile reads stay closed, and maintenance can purge their inaccessible payloads. No oldest token is forgotten and no old URL is recycled to keep accepting writes. Capacity exhaustion is an operator incident requiring review of resources/storage and the restore runbook, not automatic paid expansion or blind epoch reopening. This intentionally trades public-profile availability for a finite resource bound and fail-closed privacy. Local walking progress is outside this module.

## Independent authority and restore runbook

The profile SQLite database contains public payload plus hashes/metadata. The **separate** authority SQLite database contains current epoch, committed revision/hash permits, permanently consumed read-token hashes, and pending/committed operation receipts. Hard-link aliases of the same physical file are rejected. `confirmedOutsideProfileBackups:true` is an operator assertion requiring real evidence; do not set it merely to bypass a 503. The initial authority has no open epoch.

A mutation first reserves the operation in the authority, which closes public reading for that profile. Then the profile transaction commits, and the authority confirms its new permitted revision. A crash or unavailable authority leaves reading closed. An identical retry can complete a pending mutation if the profile state is still its expected old state or intended new state. Any unexplained divergence remains closed. Raw admin/read capabilities are never stored in either database; tokens are supplied again by the owner on a retry.

**Pending operation older than 24 hours:** its receipt is no longer recoverable and `RESULT_NOT_RETAINED` is returned. The existing implementation does not guess whether to commit or cancel it and does not silently reopen the old URL. The installation may remain unable to publish/update through that profile because the authoritative pending permit remains closed. Operator recovery uses the same global `suspend → restore/inspect → fresh epoch → maintenance → explicit new publication/new read token` barrier below. It invalidates all old publication URLs, not just the stuck profile. Do not remove the pending row, roll back the authority, or reactivate an old read token to unblock it. Automatic targeted stale-pending retirement and a real crash/recovery operational exercise remain open T21 work; the tests below do not claim they have been performed.

Before **any** planned profile restore:

1. Call `authority.suspend()` and verify public reads return unavailable.
2. Stop the profile process/close its database and restore only the intended profile database/content backup. Do not restore an older authority snapshot with it.
3. Call `authority.openNewEpoch()` only after the restore is complete and the independent authority is known current. This always creates a fresh random epoch; it cannot reopen an old epoch.
4. Run maintenance. Previous profile rows/URLs remain invalid; require an explicit new preview/publication with a fresh read token. Ordinary renewal of an expired profile is different and preserves its URL.
5. Verify old read URLs, revoked URLs and stale mutations remain closed before opening the service to participants.

The integration tests physically copy an older profile database back after revoke/rotate while preserving the actual separate authority database. Both old URLs remain unavailable. An unplanned profile-only rollback is also detected by its revision/hash permit mismatch. A planned restore still requires the epoch barrier, even if a byte-identical snapshot would otherwise match the current permit.

**Loss, rollback or uncertain freshness of the authoritative store is not recoverable from the profile backup. Keep the service closed.** Reinitializing both stores under the old public namespace while claiming the new authority is known current is unsupported and would defeat the guarantee. This module does not prove independent hosted storage, safe external authority recovery, encrypted operational backups, operator alerting or a deployed restore exercise.

## Verification and remaining integration

From this package directory:

```powershell
node --experimental-sqlite --test test/*.test.mjs
```

Twenty-three public-interface scenarios pass on Windows/Node 22.22.2 with actual SQLite, real crypto and a controlled server clock. They cover opt-in, expiry/renewal/cleanup, idempotency, stale/concurrent requests, separate capability rights, rotate/revoke, actual old-file restore, independent-store outage, clock rollback, public JSON/HTML, escaping, strict nested private-field rejection, trusted catalog ID/title/proof/locale checks, caller-mutation and forged-catalog hash rejection, persisted snapshot revalidation after catalog change, bounded body size, physical database alias rejection, atomic installation/global budgets, aggregate request/read limits, persistent counters, Retry-After and fail-closed storage capacity. There are no mocked repository/SQL implementations and no network/provider requests.

Remaining gates: mobile field selection/preview/SecureStore/delete UX; actual hosted storage/SQL adapter and HTTPS; scheduled cleanup and deployed budget/edge enforcement; actual no-charge provider resources; pending-crash recovery/backup/restore/retention exercises; competent language and accessibility review; release privacy checks. This is a local Node SQLite Implementation behind the module Interface, not a Cloudflare/Supabase deployment or completed T13/T21 acceptance. No signing/payment/API secret was read, and no purchase or paid API operation occurred.
