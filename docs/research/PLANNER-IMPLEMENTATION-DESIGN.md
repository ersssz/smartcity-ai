# Planner implementation design from the current source

2026-10-20. Read-only source investigation and a proposal for Root; this does not accept a contract or change production code. No network, API, account, secret, device or paid operation was used. Source state was read directly from the repository. The archived planning statements and paid-credit allowances are superseded by current [AGENTS](../../AGENTS.md).

## What exists and what cannot be renamed into completion

The public contract currently implemented is a **prepared editorial walk**, explicitly named that way in [model.ts](../../apps/mobile/src/walk/model.ts). Its validator requires 3–6 stops, one leg per stop, an identical first-stop/start anchor, and `return_to_start`. The [engine](../../apps/mobile/src/walk/engine.ts) requires `confirm_return` after the last stop. The [repository](../../apps/mobile/src/walk/repository.ts) parses that exact schema, restores an active session as paused and serializes SQLite mutations. Neither a server WalkBundle, planner nor evidence search exists under `packages`; only spend-policy does. A version label or renaming this schema would leave arbitrary endpoints, last-stop endings, revisions and asset readiness unimplemented.

The accepted implementation direction remains three deep Module interfaces: CityEvidence, WalkPlanner and WalkSession. The following proposal follows [ARCHITECTURE sections 2–5](../plan/ARCHITECTURE.md), [T03](../plan/tasks/t03-walkbundle-foundation.md), [T04](../plan/tasks/t04-first-real-walk.md), [T06](../plan/tasks/t06-grounded-rag.md), [T08](../plan/tasks/t08-context-feasibility.md) and [T12](../plan/tasks/t12-consented-adaptation.md). It does not replace their full acceptance scope with the first implementation slice.

## Actual available evidence

Direct JSON inspection found:

| Current artifact | Finding | Consequence |
| --- | --- | --- |
| `data/curated/poi-bayterek.json` | 20 selected cards; coverage counters describe 247 located cards in the Bayterek bbox before sampling | Search the available 20, display sample coverage; do not call it a city-wide catalog |
| Same | 0 current structured schedules and 0 verified outdoor anchors | No promise of an open cafe, museum entrance or warm indoor replacement can be derived from these cards |
| `apps/mobile/src/walk/preparedWalk.json` | 3 separate editorial public anchors, 4 fact IDs, 3 source IDs; RU/KK/EN stories and quests | Reuse authored material and public geometry as an editorial input Adapter, preserving its limitations |
| Same | `poiId` values are `prepared-anchor:osm-node:…`, not canonical backend POI IDs | Introduce an explicit curated place-to-anchor mapping; do not silently equate an OSM foot node with a landmark/building |
| `evidence/first-walk/routing-source.json` | Retained witness, not full source topology; 932 nodes, 530 accepted walk nodes, 1,092 directed edges, 45 accepted ways | It supports technical graph replay and endpoint/end-rule behavior, not full-graph/current-origin/field acceptance |
| `tools/data/walking.py` | Conservative restrictions, exact nodes only, no invented connector | Reuse the algorithm and refusal semantics as the real-source replay Adapter, keeping its evidence label |
| `tools/data/ingest_poi.py` | Hash checks, explicit field states, conflicts, stale intervals and source refs | Reuse normalized observations, rather than flattening missing or conflicting values into strings |

An independent invocation of `WalkingGraph` over that witness returned these ordered foot pairs, all `technical_path`:

| Public anchors | Distance m | Minutes at the existing explicit assumption of 60 m/min |
| --- | ---: | ---: |
| Baiterek → Nurzhol / reverse | 501.92 | 8.365 |
| Nurzhol → Round Square / reverse | 604.18 | 10.070 |
| Baiterek → Round Square / reverse | 1,106.10 | 18.435 |

The existing prepared return uses an overlap-penalized alternative of 2,117.004562 m; it is not the shortest route and its unpenalized length is correctly used for time. A new planner may select a shorter technically supported return, but must produce a new bundle identity/revision and show the new geometry. Do not alter the old saved package in place. These distances are technical source replay, not measurements on the street. All six pair results were obtained without network or writing generated output.

## Small public Interface proposal

Place one Zod/type authority in Root-owned `packages/contracts`. Keep provider records, SQL rows, route search internals and UI state outside it. Inject two genuinely varying Adapters at internal seams: current source replay for deterministic integration and the eventual managed/hosted real routing Adapter. Do not expose an imitation provider API merely to create interfaces.

Illustrative types below describe behavior; Root owns the final shape and compatibility decision.

```ts
type Endpoint =
  | { kind: 'point'; coordinate: Coordinate; source: 'gps' | 'manual';
      accuracyM?: number; capturedAt?: string }
  | { kind: 'public_anchor'; anchorId: string; explicitlyChosen: true };
type EndRule = { kind: 'return_to_start' } | { kind: 'last_stop' }
  | { kind: 'point'; endpoint: Endpoint };

type EvidenceQuery = {
  locale: Locale; at: string;
  area: { kind: 'bounds'; bounds: [number, number, number, number] }
      | { kind: 'public_zone'; zoneId: string };
  terms: string[]; interests: string[];
  required: Constraint[]; limit: number; // server cap 24
};
type EvidenceField<T> =
  | { state: 'known'; value: T; sourceRefs: string[];
      observedAt: string; validUntil?: string }
  | { state: 'unknown' | 'stale' | 'conflicting';
      sourceRefs: string[]; reason: string };
type EvidenceSet = {
  revision: string; evaluatedAt: string;
  coverage: { zoneIds: string[]; scope: 'sample' | 'base' | 'deep';
              complete: false; limitations: LocalizedText };
  pois: PoiEvidence[]; anchors: PublicAnchor[];
  facts: Fact[]; sources: Source[]; context: ContextSnapshot;
};
interface CityEvidence { search(query: EvidenceQuery): Promise<EvidenceSet> }

type PlanRequest = {
  requestId: string; locale: Locale; origin: Endpoint;
  startAt: string; budgetMinutes: number; // integer 15–240
  endRule: EndRule; interests: string[];
  constraints: Constraint[]; contextFlags: ContextFlag[];
};
type PlanReply =
  | { kind: 'candidates'; bundles: WalkBundleV1[]; // 1–3 unique experiences
      omittedReasons: PlanningReason[] }
  | { kind: 'clarification'; fields: string[]; message: LocalizedText }
  | { kind: 'no_feasible_walk'; reasons: PlanningReason[] }
  | { kind: 'unavailable'; code: 'DATA_UNAVAILABLE' | 'ROUTING_UNAVAILABLE'
      | 'GENERATION_UNAVAILABLE' | 'BUDGET_EXHAUSTED'; retryAfterSec?: number };

type RevisionRequest = {
  requestId: string; parentBundle: WalkBundleV1;
  expectedRevision: number; expectedHash: string;
  from: Endpoint; now: string; remainingMinutes: number;
  completedStopIds: string[]; constraints: Constraint[];
  reason: 'deviation' | 'user_change';
};
type RevisionReply = Exclude<PlanReply, { kind: 'candidates' }>
  | { kind: 'revision_proposal'; proposalId: string; expiresAt: string;
      parentRevision: number; parentHash: string; bundle: WalkBundleV1;
      changes: RevisionDiff; requiresConsent: boolean };
interface WalkPlanner {
  plan(request: PlanRequest): Promise<PlanReply>;
  revise(request: RevisionRequest): Promise<RevisionReply>;
}
```

`Constraint` should be a finite discriminated union with semantics, not `Record<string, any>`. Minimum cases: required indoor access, avoid stairs, max walking distance, mandatory coffee stop. Optional preferences and hard constraints must be distinguishable. An unrecognized or unsupported condition produces clarification; an unsupported indoor request must not silently become an outdoor walk. Public search queries can use a zone/bounds without making a user's precise position part of a cache key or persisted search log.

`PoiEvidence` needs stable place ID, localized sourced names/aliases, category/tags, distinct coordinate-versus-arrival-anchor state, structured access and opening fields, fact IDs and provenance. `Fact` needs a narrowly scoped factual statement in all provided translations, supported source IDs and validity; an idea/fiction sentence is separately labeled. Existing duplicated axis/corridor prose should be split into narrow fact atoms before generation evaluation. An existing `factRef` only proves reference integrity; it does not prove that a generated claim follows from that fact.

`ContextSnapshot` must describe weather model/update/retrieval/expiry, season and sourced dated holiday exceptions with explicit states. Absence of weather can lower ranking or add an unknown notice; it cannot prove wind shelter, safe surfaces or indoor availability. Raw OSM hours are unknown until parsed and supported. For indoor access, evaluate the entire visit interval, not only arrival.

## Canonical WalkBundle v1: payload and validation obligations

Keep bundle content immutable and progress separate. All arrays whose order matters retain that order when hashed. Define a single canonical serialization and hash rule in contracts (for example RFC 8785 over the payload excluding its own `sha256` field), and use identical UTF-8 bytes at producer and reader. Verify the supplied hash before a schema reader discards any fields. Do not normalize Unicode, reround route coordinates or mutate source data after hashing. Reject non-finite numbers and payloads above 512 KiB. Unknown major versions must fail with a distinct, user-visible error while retaining the old saved package.

Required semantic groups:

```ts
type WalkBundleV1 = {
  schemaVersion: 1; bundleId: string; revision: number;
  parentRevision?: number; parentHash?: string; sha256: string;
  generatedAt: string; contentRevision: string;
  evidenceRevision: string; plannerVersion: string;
  request: PlanRequest; // original origin/end rule survive revisions
  resolvedEnd: { endpoint: Endpoint; stopId?: string };
  theme: { id: string; title: LocalizedText; explanation: GroundedText };
  stops: PlannedStop[]; legs: PlannedLeg[];
  timing: { walkMinutes: number; visitMinutes: number;
            reserveMinutes: number; totalMinutes: number; endsAt: string };
  facts: Fact[]; sources: Source[];
  content: { chapters: Chapter[]; quests: Quest[]; collections: Collection[];
             origin: 'editorial' | 'grounded_generation' };
  assets: AssetManifest; context: ContextSnapshot;
  evidenceMode: 'real_catalog_replay' | 'live_catalog';
  limitations: LocalizedText[];
};
```

`PlannedStop`: stable stop ID, canonical place ID and a **separate** public anchor ID/coordinate, arrival/departure UTC instants, visit minutes, access intent (`outdoor_observation` versus `indoor_visit`), applicable schedule/access evidence, fact refs and chapter/quest/collection IDs. Up to six stops; an origin is not implicitly a stop. The normal 80-minute hero option must support three confirmed stops as specified, even though shorter sensible alternatives may contain fewer. Never clone an itinerary by changing its title.

`PlannedLeg`: explicit from/to endpoint identities, ordered GeoJSON LineString, source/version/date/license and distance/ETA. Each end has requested endpoint, matched graph point, snap distance/quality and a supported connector geometry/time or the explicit exact-node case. A zero-distance origin-to-first-stop leg needs an explicit `already_at_endpoint` representation; do not require a fake two-point LineString or positive ETA for it. No last-stop-to-end leg is necessary if the chosen end is exactly that last anchor. Unknown connectors produce a clarification/refusal, even for tiny gaps. Persist no off-route location samples or track in the bundle.

`AssetManifest`: content-addressed refs for texts, maps/style/attribution and prepared audio by RU/KK/EN with checksum, license and required/optional status. An absent asset is explicit; the server does not set `offlineReady`. Readiness belongs to local `(bundleHash, revision, manifestHash)`. The existing `preparedAudio:'unavailable'` and `baseMap:'online'` cannot be upgraded by a new schema name.

There is an archived timezone inconsistency: ARCHITECTURE's bundle example says `Asia/Almaty`, while T08 and current user/client context use `Asia/Qyzylorda`. Root should resolve it explicitly in the contracts/decision record before freezing. Use UTC instants for storage and one declared local IANA zone for calendar evaluation; do not rely on host locale. Both names being UTC+5 today does not justify conflicting declared semantics.

## Feasibility and revision algorithm

1. Validate/normalize the request and resolve only explicitly selected public anchor IDs. Preserve point endpoints exactly. Unsupported constraints require clarification.
2. CityEvidence applies geometry/mandatory filters before ranking and limiting to 24. Filter out critical unknowns. Retrieve editorial chapter/quest material by stable place/fact IDs.
3. Build bounded distinct stop sequences (maximum six stops). Use known public-pair distances only for preliminary search; final route geometry must come from the routing Adapter. Maximum three simultaneous final routing requests.
4. Compute first/last connectors, all legs, visits and reserve against the end rule. The initial reserve is `max(5, 0.1 * budgetMinutes)`; the existing prepared catalog rounds reserve up to whole minutes. Root should choose and test one representation rather than make mobile invent a second formula. Round display totals once, not every leg.
5. Evaluate the complete arrival-to-departure intervals in the declared local zone, including midnight, exceptions and valid-until. Require freshness for critical access promises. Preserve unknown weather explicitly.
6. Produce and validate the feasible itinerary before generation. A permitted generator receives only whitelisted public facts and normalized preferences; no GPS, raw user/source instructions, profile token or history. Validate output structure and references, then evaluate claim entailment. A model timeout/disabled Adapter must not be presented as successful RAG. A separately labeled editorial result may remain available without satisfying the RAG acceptance gate.
7. Rank/deduplicate by meaningful place set, actions and theme, then return 1–3, with omission reasons. A small catalog yielding one good option is better than three copies, but remains incomplete for wider district coverage.
8. For revise, derive a continuation from `from`, actual `now` and remaining budget while retaining original request/origin/end rule. Return-to-start resolves to original origin; explicit end retains its selected endpoint; last-stop resolves anew after proposed stop changes. Preserve completed content and event identities.
9. Compare stop identities/order/theme and completion time. Any stop/theme change requires consent. Automatic correction is limited to the same agreed experience/end rule and an extension **not more than either** 5 minutes or 10% of the original budget; exceeding either threshold or the chosen deadline requires consent. Return a proposal/diff; do not mutate the current session from inside `revise`.
10. WalkSession alone atomically applies a proposal after checking the expected parent revision/hash and explicit acceptance where required. Duplicate proposal acceptance is idempotent. Rejection, timeout and stale responses leave the previous accepted package/progress intact. Recheck new asset readiness; do not copy the old offline-ready flag.

## Reuse versus new Implementation

| Existing source | Reuse | New work / caution |
| --- | --- | --- |
| `walk/model.ts` Text/Coordinate/Locale and validators | Shared value definitions and regression fixtures | Keep EditorialWalk as legacy input; canonical WalkBundle is a distinct schema until migration succeeds |
| `walk/preparedWalk.json`, first-walk content/builders | Authored stories, quests, source IDs, exact existing geometry | Explicit curated place/anchor mapping and adapter; do not pretend prepared-anchor IDs are accepted canonical POIs |
| `tools/data/ingest_poi.py` | Hash-pinned normalization, field states, provenance and dedupe observations | CityEvidence TS/runtime Adapter, bounded spatial/lexical search, entity mapping and dated facts; full-city extraction still needed |
| `tools/data/walking.py`, retained source witness | Conservative graph/refusal behavior and independent test oracle | TS/server routing Adapter or produced public-pair artifact with preserved witness; full topology, actual endpoints/connectors and resource gate still required |
| `walk/engine.ts` | Pure transitions, manual proof, quest ordering, paused restore | Bundle-aware end conditions, stable event IDs, nearby-arrival proof and revision reconciliation |
| `walk/repository.ts`, migration | Serialized SQLite transactions, archive on restart and no duplicate manual collection row | Root-owned migration with discriminator, old-row preservation, atomic revision acceptance, durable command journal and proof-specific dedupe |
| `features/walk/WalkExperience.tsx` | Existing fullscreen map/sheet, text/quest/source presentation | Request composer, candidates, context/limitations, plan errors, revision comparison/accept actions, end-rule label and missing-assets state |
| `packages/spend-policy` | Default-off paid/unverified adapters | Bounded atomic backend reservation before any enabled generation; no key or subscription treated as free entitlement |

Suggested new homes are `packages/contracts`, `packages/city-evidence` and `packages/walk-planner`, with thin mobile/backend Adapters. Root should own public contracts, migrations and integration, and can delegate implementations behind those seams independently. Backend hosting/DB provisioning is a separate actual integration gate; a local test server is useful development evidence but does not satisfy the planned self-sufficient hosted product.

## First vertical slice, then full coverage

1. Freeze contracts plus three explicit legacy-import fixtures: valid prepared data, unknown-major bundle and corrupt asset/hash. Parse legacy rows with their existing schema and migrate/copy transactionally; never clear user progress to make a new schema work.
2. Implement CityEvidence against the actual 20-card sample and the separately sourced editorial anchor/fact catalog. Search and return current facts/unknowns with clear coverage. A new canonical place mapping must be backed by the named official records, not nearest-center inference.
3. Implement plan over the retained real-source graph for supported public anchors, all three end rules, budget/constraints and 1–3 distinct supported stop sets. Existing three-anchor data can exercise meaningful shorter two-stop and longer three-stop options; it cannot create three geographically/content-distinct deep walks, coffee service or indoor adaptation. Annotate replay and field limits visibly.
4. Wire mobile request → planner reply → selected bundle → saved session, using the real type authority. Keep the old prepared walk accessible and existing progress intact. Device checks must verify this actual flow, not just validator tests.
5. Implement revision proposal/apply using an actual supported shorter route first. Test a required-indoor request returning precise unavailable evidence, rather than inventing a venue. This refusal is valuable but **does not complete T12's positive warm-indoor scenario**.
6. Expand data acquisition/curation to additional real POIs, current access/schedules and independent chapters; obtain full graph/endpoint Adapter evidence. Add the confirmed indoor option, actual runtime generation under verified no-charge conditions and the hosted backend. Expand from first technical route to all agreed deep zones and base-city coverage as required by T17.
7. Finish audio/offline/GPS/public-profile/accessibility and full AT-01–20 acceptance with actual device/server tests; a completed planner slice cannot stand in for those product requirements.

## Meaningful tests through public Interfaces

1. `search`: known Baiterek aliases in RU/KK/EN retrieve the same stable place and relevant fact IDs; mandatory indoor filter excludes unknown access **before** limit/ranking. Empty retrieval is empty, not a seeded default list. Assertions use actual imported cards plus clearly labeled synthetic edge cases.
2. `plan`: exact public anchor, 80-minute loop includes all chosen visits, supported foot geometry, return to identical original start and reserve. Independently recompute edge lengths/total and verify references against retained source records.
3. `plan`: same stops, last-stop end omits the return and has a different total/resolved end. Explicit other end retains its exact requested endpoint and includes a supported final leg; unsupported connector refuses.
4. `plan`: 15-minute/over-constrained request yields explained no-feasible, never silently increases budget or drops the required condition. Distinctness prevents three reordered copies of the same experience.
5. `plan`: a point 0.1 m off a supported graph node with no connector remains the original point and yields clarification. A nearby center across a barrier cannot pass via snapping. Low-accuracy GPS cannot silently become a public anchor.
6. Calendar evaluation: visit ending after closing is rejected; 23:50–00:20 uses both dates; sourced holiday exception overrides regular hours; absence of an exception is unknown where critical. Conflicting/expired indoor facts refuse the warm option.
7. Context: current, <=6-hour stale and unavailable weather are distinguished; no variant claims wind protection/safe ice from a generic forecast. Runtime backend outage does not erase an existing selected bundle.
8. Grounding: a fixed minimum 20-question corpus covers known facts, missing knowledge, contradiction, schedule mismatch and injected source instructions. Existing/missing fact IDs, claims adding invented opening times and unrelated referenced facts are separately tested. Disabled/timeout generator is honestly marked and cannot pass the runtime RAG gate.
9. `revise`: starting from the middle retains original return endpoint, honors remaining budget and emits a diff. New last-stop changes resolved end only after explicit acceptance. Indoor unknown yields a refusal or available supported shortening, with no fake open cafe.
10. WalkSession apply: stale parent hash/revision, duplicate response, double accept, cancel, reject and write failure leave one accepted package/progress. Completed quest and first-discovery IDs survive revisions and repeated acceptance without a second award.
11. Consent threshold cases: +5 min exactly, >5 min, +10% exactly, >10%, changed stop, changed theme and deadline exceeded. Auto correction is allowed only when **all** unchanged-experience conditions hold.
12. Assets/hash: unknown major, modified byte, corrupt source ref, missing audio and changed map bounds do not become ready. A revised bundle reuses matching assets but invalidates readiness for missing ones; interrupted replacement retains old materials and progress.
13. Privacy: inspect actual HTTP log/cache behavior and generator input; exact origin/endpoints remain out of ordinary logs, server history, analytics and prompts. `Cache-Control:no-store` is asserted for plan/revision responses. This requires integration evidence, not a source-code grep alone.

## Remaining blockers, without reducing scope

The current actual data cannot prove current-origin routing, current cafe/indoor access, city-wide base coverage, three distinct deep walks, real runtime RAG, complete offline audio/map assets or field passage. These are separate missing capabilities, not grounds to discard the plan. They also do not block contracts, evidence search, end-rule/budget planning, device integration, consented revision mechanics or truthful handling of unavailable evidence. Preserve the larger plan and implement each gate using its required evidence.
