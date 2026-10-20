# Canonical WalkSession v2

Private additive storage adapter for the validated `WalkBundleV1`. Root owns app/native integration and shared contracts. This adapter does not start or restore GPS, claim physical arrival, grant GPS awards, or declare an offline pack ready.

Public seam: `createCanonicalWalkSession(db, { hash, now, nextSessionId })`, with the existing Expo-compatible `WalkDatabase`. Methods:

- `open(bundleOrSessionId): Promise<Snapshot>` validates/imports a bundle once or restores the selected session. Opening another bundle while the current session is nonterminal fails with `SESSION_CONFLICT`. Restoring a saved active session by ID safely pauses it; `snapshot()` itself does not change phase.
- `getCurrentSessionId(): Promise<string | null>` reads the durable selection for startup.
- `dispatch({ eventId, expectedVersion, action }): Promise<Snapshot>` commits one event atomically with its projection and any manual story collection. `action.type` names the command. A redelivered event must match its original whitelisted command identity and returns its recorded result. Each new accepted event increments `version` once.
- `snapshot(): Promise<Snapshot>` reloads the selected committed state rather than returning a cached overwrite candidate.

Snapshot contains `{ bundle, session, discoveries }`. Session schema version is 2; initial phase is `prepared`, initial version is 0. Its coordinate-free progress fields are `sessionId`, `bundleHash`, `bundleRevision`, `phase`, `version`, `currentStopIndex`, `manualStopIds`, `completedStopIds`, `skippedStopIds`, `answers`, `startedAt`, `updatedAt`. Discoveries have `{ walkId, title, proof: 'manual_reported', earnedAt }` and never imply GPS proof.

Actions use `start`, `pause`, `resume`, `mark_stop`, `answer`, `continue`, `skip`, `confirm_end`, `abandon`. Stop actions include `stopId`; answer also includes `choiceId`. Final confirmation applies to all three end rules; the UI labels the agreed endpoint. Revision acceptance is added only with the parent/hash/consent transaction guard, never by relabelling legacy progress.

Only separate `canonical_*` tables are created in the injected database. Existing `walk_*` tables/settings remain readable and are not migrated, reset, deleted or imported as GPS evidence. No schema-wide `user_version` or native table migration is performed. A later native adapter must coordinate its control and transaction design with Root; Node SQLite tests do not prove Expo/native same-file or device behavior.

The connection enables foreign keys, WAL and a 2,500 ms busy timeout before creating private tables. Public storage failures expose only bounded `CanonicalSessionError.code` values. A stale version requires the caller to reload; the adapter does not retry a stale command against a new version. A duplicate event returns its recorded snapshot even if later events exist, while the database remains at its latest committed projection; use `snapshot()` when reconciling the current UI. The journal stores a command hash, typed action/stop/choice identifiers and schema-validated progress/discovery receipts, never a raw command or live location/provider payload. Only the immutable canonical bundle table contains its agreed route/endpoints.

The first implementation includes **12 actual SQLite source tests**: full manual walkthrough and one collection; legacy coexistence; file reopen and safe pause; two independent connections and stale CAS; identity-matched event replay; real SQL-trigger rollback for both event and collection writes; ordered quest interaction; all end rules; skips/abandonment; connection pragmas; strict privacy fields and preserved corrupt-progress recovery. Tests dynamically import the built public contracts/planner packages; the test's narrow TypeScript loader only compiles this mobile adapter and supplies that already imported contracts namespace to CommonJS output. Root's `build:node` is a prerequisite.

```powershell
& 'C:/Program Files/nodejs/node.exe' --experimental-sqlite --test apps/mobile/src/canonical/session.test.cjs
```

`accept_revision` is deliberately not yet an accepted command. Proposal validation alone does not apply a revision. Native shared control, location interruption integration, pack preparation, audio and device/process-kill acceptance remain separate integration tasks; no T05/full-beta completion is implied by these source tests.

TDD seams agreed with Root: `open/dispatch/snapshot/getCurrentSessionId` on actual SQLite, including reopen, event identity/CAS, transaction rollback, manual-only collections, separate connections and legacy coexistence. Synthetic storage faults are labelled; no source test constitutes field, native GPS or airplane-mode acceptance.
