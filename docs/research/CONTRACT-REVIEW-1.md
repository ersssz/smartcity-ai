# Independent contract review 1

2026-10-20. Root requested a read-only review of `packages/contracts/src/model.ts`, `src/bundle.ts` and `test/fixture.cjs` against ARCHITECTURE/PRODUCT-SPEC/T03. The initial review changed none of those files and used only local Node/TypeScript and synthetic fixtures. No network, device, API, purchase, secret or unrelated file was touched. Root subsequently authorized one new regression test file, `packages/contracts/test/review-probes.test.cjs`; implementation fixes remain Root-owned.

Initial reviewed source SHA-256:

- `model.ts`: `cb2901ef8ab7828b4bda1a316916346feb0488d73cd26038a61b7f21f3ebd1c7`
- `bundle.ts`: `f3b83babe26a1f25948e29e3bfc5a2dbf2e4b35b0e7fb278956c4e4d764b114e`
- First fixture read: `30dc48eae4cbd9220dd49edbbac0bb0fec7406995b53daf0411c534a366e0f25`. Root was actively updating the fixture later; the initial probes used its then-current imported synthetic content.

## Actionable findings on the initial source

### P1 — A public return anchor can silently move

`bundle.ts` checked return-to-start via `sameEndpoint`, which compares public anchor IDs, not resolved coordinates. `matchesStop` checked a graph-point ID but did not reconcile the same public anchor ID across all appearances. A local probe changed `resolvedEnd.endpoint.coordinate` and its graph coordinate, then changed the final leg destination/geometry to that new coordinate while retaining the same requested public anchor ID. `sealBundle` **accepted** it. With the same weakness, the new coordinate could equal the last stop and remove the return leg entirely.

Required fix: retain an immutable resolved original origin, not only its unresolved public-anchor ID. Return must equal that resolved origin; explicit public endpoints also need consistent canonical anchor resolution. Validate every repeated graph/public-anchor ID against one coordinate definition and compare full endpoint semantics when chaining legs.

### P1 — Connector metadata need not be traversed by the line

A probe gave a leg endpoint a verified connector to a different graph-point coordinate, with positive time/distance and valid source refs. The leg's actual LineString remained the original direct line and never visited that graph point. `sealBundle` **accepted** it because the line endpoints and scalar lower bounds passed.

Required fix: either model a leg as ordered connector + graph geometry + reversed destination connector, or require its complete geometry to contain those exact ordered prefixes/suffixes and graph joins. Match graph-point coordinates to the anchor/node record. Check connector and complete path distances against their geometry within documented geodesic tolerance; a 1 m scalar must not certify a much longer geometric connector. Endpoint identity alone is insufficient evidence of an included foot segment.

### P1 — Real fractional ETAs fail valid millisecond timestamps

`close()` used a tolerance of `0.00001` for both duration values and absolute millisecond timestamps. A probe increased one leg ETA by `0.000001` minutes (0.06 ms), recomputed every total and timeline using `new Date(...).toISOString()`, and was **rejected** for missing visit/walk time and exceeding the declared deadline. ISO/Date stores integer milliseconds, so this rejects physically meaningless sub-millisecond differences in real computed paths. Existing real leg ETAs have six decimal places.

Required fix: use a separate instant comparison with a documented approximately 1 ms tolerance, or normalize all accumulated ETA instants to integer milliseconds through one producer/validator rule. Keep the tighter duration/distance tolerance separate. Test a fractional real-style ETA, not only integer-minute synthetic legs.

### P1 — Return-only adaptation is impossible

`stops.min(1)`, `chapters/quests.min(1)`, positive visit time and route validation that assumes one visit leg per stop prevent a legitimate revision after all visits are complete but a return/end leg remains. The application must not fabricate another stop, replay an earned quest or silently discard the original end to represent that continuation.

Required fix: for revisions, support zero pending stops, zero new chapters/quests, zero visit duration and exactly one supported continuation-origin → resolved-end leg. Initial proposals still require real visits. If full content and remaining itinerary are modeled separately instead, validate exactly that pending subset and preserve previously completed material/events outside the bundle's mutable pending plan.

### P1 — Constraint validation does not prove the promise

- `step_free_required` **passed** when only each stop's access field was marked verified; no route/connector access evidence existed in the schema. A stair-containing route could therefore pass.
- `coffee_required` **passed** with no coffee service or category evidence; the validator deferred it to a future catalog check and the immutable bundle did not carry that result.

Required fix: carry explicit dated service evidence at stops and step-free evidence on every route/connector required for the promise. Validate freshness over the visit/transition window. A title containing “coffee” is not evidence. Unknown/stale/conflicting conditions must not satisfy hard constraints. If route accessibility cannot be demonstrated from the current sources, return clarification/no-feasible rather than promote an unverified route.

### P2 — Future weather and arbitrary completed IDs are accepted

A weather probe with `updatedAt` and field `observedAt` in 2027, evaluated in October 2026, **passed**. The test checked only future retrieval, an upper age bound and expiry; negative model age passed. A revision probe with duplicate invented `completedStopIds` also **passed**.

Required fixes: enforce `updatedAt <= retrievedAt <= evaluatedAt`, field observation not in the future, validity interval ordering and freshness; preserve explicit unknown/stale states. Remove progress IDs from the immutable bundle as ARCHITECTURE requires. Session/proposal validation must check completed IDs against the actual parent session and reconcile them atomically, rather than trust a new bundle's declaration.

## Original request, remaining budget and consented extensions

Initial code forbade `continuation.budgetMinutes > request.budgetMinutes` and forbade any end after `request.startAt + request.budgetMinutes`, for every revision. That protects against silent overrun but also makes an explicit, legitimate user extension impossible to represent. Dropping both checks globally would instead allow an unannounced deadline change.

The original `request` and resolved original origin should remain immutable history of intent. The continuation describes the actual planning window from the current point. A sealed revision is still a **proposal**, not permission to activate a new deadline. Proposed time terms can be represented as:

```ts
type TimeTerms =
  | { kind: 'current_deadline'; deadlineAt: string }
  | { kind: 'extension_proposal'; previousDeadlineAt: string;
      deadlineAt: string; requestId: string };
```

Required invariants:

1. Revision 1 has current-deadline terms equal to the original request deadline. It cannot claim a previously consented extension. Later current-deadline terms retain the active parent's deadline, including a previously accepted extension.
2. The continuation's `startAt + budgetMinutes` fits its declared proposed deadline; all remaining walking, visits and reserve fit its budget. It cannot predate the original start. The original total budget need not cap a **proposed explicit extension**.
3. An unchanged original deadline cannot move silently. An extension proposal must strictly extend the active parent's deadline and name that exact previous deadline. It must keep the original request, original resolved origin and chosen end rule unless the separately displayed change explicitly covers them.
4. `validateRevisionAgainstParent` checks parent bundle ID/hash/revision, immutable original fields, prior active deadline and meaningful diff. It derives consent requirements from the actual change rather than accepting a caller-supplied boolean.
5. Session accepts an extension only through an explicit user acceptance command against the current parent. Persist command/proposal identity and the accepted new deadline in one transaction. The sealed bundle does not invent a `consented:true` field. Preview, sealing or receiving a proposal cannot activate it.
6. Duplicate accept is idempotent, stale-parent accept fails, rejection keeps the active deadline/bundle/events, and interruption before commit changes neither. Further extensions use the current accepted parent's deadline, not the original deadline as a stale baseline.
7. Consent policy still applies when a route is within the proposed new deadline: changed stops/theme, deadline extension, >5-minute extension or >10% of the original budget each require explicit acceptance. “Budget sufficient” and “consent obtained” are separate predicates.

This supports an explicitly extended walk without allowing an unannounced extra hour. Endpoint semantics do not change merely because time terms change: original return stays original return, explicit end stays explicit end, and last-stop is resolved from the proposed stop sequence.

## Hash and assets observations

The initial code correctly hashes canonical payload bytes excluding the digest, verifies transport hash before semantic parsing, preserves array order, rejects unpaired surrogates/non-finite values, rejects normalizing trims and distinguishes unknown schema major. No hash bypass was reproduced. The following acceptance gaps remain to cover with tests:

- Verify key order invariance, array order sensitivity, modified byte → hash mismatch, Unicode behavior, 512 KiB including the digest, unavailable hash function and unsupported major.
- Exact immutable v1 readers currently reject any new unknown optional field because schemas are strict. ARCHITECTURE calls new optional v1 fields compatible; Root should define a deliberate extension/retention rule before declaring that compatibility promise satisfied.
- `AudioRef.textSha256` must be checked against an explicitly defined localized chapter text serialization by the preparation path; a well-formed arbitrary digest is not proof that the audio speaks the current chapter. Binary checksum validation still belongs to actual preparation, not bundle sealing.
- Map coverage must include relevant endpoints/stops even for an all-zero/return-only itinerary, not only vertices of positive-length `walk` legs. Assets being listed as available never establishes downloaded offline readiness.
- Calendar/date interval validity and sourced closed exceptions must not contradict an admitted indoor interval. Confirm this at the public planner/bundle seam with an actual contradiction fixture.

## Regression evidence

The first six malformed probes were accepted locally and the fractional-ETA probe was rejected locally using the existing transpile loader and actual `sealBundle`/public schema. They used only synthetic fixtures and do not certify any real route or provider. Root is updating implementation and fixture while this review remains an initial-state report. Follow-up negative and positive regression cases belong in the separately authorized `test/review-probes.test.cjs`; the result of that current-state run should be recorded separately from these historical failures.

### First follow-up run after Root's fixes

Command: `node --test packages/contracts/test/review-probes.test.cjs` from the repo root. Result: **24 tests, 24 passed, 0 failed, 0 skipped**. This run used the updated fixture with immutable `originalOrigin`, `current_deadline` / `extension_proposal` terms, explicit coffee service and transition accessibility fields, and no progress IDs in bundle continuation.

The previously admitted moved return, missing connector traversal, unproven step-free/coffee, future weather and embedded completed IDs were rejected. Positive baseline, fractional ETA, return-only revision, fully supported step-free/coffee, fresh weather and explicitly labeled extension proposal passed. A minute genuinely missing from a timeline was still rejected. Hash tampering, major-version behavior, Unicode and canonical ordering also passed. No consent or session acceptance was simulated: this verifies proposal representation only. Parent-aware first/second-generation extension and stale-parent checks are pending the separate `validateRevisionAgainstParent` Interface, which Root is adding.

### Parent-aware follow-up run

After Root added `validateRevisionAgainstParent(parentJson, candidateJson, hash, completedStopIds)` and `continuation.constraints`, the same command passed **36 tests, 36 passed, 0 failed, 0 skipped**. The added checks cover:

- First extension derives consent from the actual deadline change.
- A following correction retains the already accepted parent's extended deadline without re-requesting the same extension.
- A further extension names the current parent's deadline, not the initial request deadline.
- A wrong parent hash, wrong prior deadline, silent current-deadline drift and overwritten original request are refused.
- Duplicate/fabricated/still-pending completed IDs are refused; omitting a completed visit can preserve the unchanged remaining experience; omitting it without authoritative completion requires consent.
- All completed visits can leave a valid return-only correction.
- Effective constraints remain distinct from original request constraints, require consent on change, are retained by later corrections and are actually used for feasibility validation.

These tests only validate proposal/bundle behavior and derivation of consent requirements. They do not execute a Session CAS transaction, persist explicit consent, deliver notifications, validate hosted providers or prove route passage. Parent-bundle inputs labeled as accepted in the synthetic test are assumptions supplied to this Interface; actual active-parent authority remains the repository's responsibility.

### Source precision closure

Root introduced the shared `SourceCheckSchema` union of an ISO instant or a valid date. The subsequent real CityEvidence import preserves the three editorial source dates as `2026-10-20`; its public search test confirms no invented midnight. OSM acquisition timestamps retain their original precision. This closes the identified source-import precision mismatch; it does not re-check the external publications or certify human language review.
