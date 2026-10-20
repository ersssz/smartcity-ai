# Canonical walking contracts

Root owns this package. This is a new contract alongside the existing mobile
`prepared_editorial_walk`; it does not rename, migrate or overwrite saved
editorial sessions. The runtime imports Zod only. Node crypto, filesystem and
TypeScript are confined to build tools/tests or injected platform boundaries.

## Public interfaces

- `CityEvidence.search(EvidenceQuery): Promise<EvidenceSet>` returns bounded,
  sourced public data with explicit unknowns and coverage. Precise user GPS is
  absent from this retrieval interface.
- `WalkPlanner.plan(PlanRequest)` and `revise(RevisionRequest)` produce candidates,
  clarification, refusal, dependency error or an unapplied revision proposal.
- `sealBundle(payload, sha256)` accepts a complete valid payload and freezes its
  immutable revision. The injected hash receives the exact canonical UTF-8 text.
- `readBundle(json, sha256)` distinguishes unknown major version, malformed data,
  oversized JSON, unavailable hashing and corruption. It verifies the complete
  payload before a schema reader can strip fields. Callers retain rejected bytes
  and old progress; this module deletes nothing.
- `validateRevisionAgainstParent(parentJson, candidateJson, sha256, completedIds)`
  verifies immutable parent identity/original terms and derives consent. It never
  activates a proposal. WalkSession must repeat the parent compare-and-swap and
  record required explicit consent in its durable transaction. Current-parent
  completed IDs come from that repository, never from generator output.
- `verifyPack(json, sha256, assetReader)` binds integrity to the bundle hash,
  revision and manifest hash. Missing map, any core narration, text mismatch,
  corrupt bytes or volatile cache remain partial. The reader must hash actual
  durable files. It must not echo expected hashes.

The exported generic `WalkSession<Command, Snapshot>` names the agreed deep seam;
its durable event/command schema and repository migration are still pending.
PublicCollection has its own strictly limited public DTO and never accepts a
WalkBundle as a publication snapshot.

## Invariants and decisions

All three endings preserve exact endpoints. Route geometry includes complete
verified connectors, visits, return/end legs and the reserve
`max(5, ceil(0.1 * remainingBudgetMinutes))`. Zero displacement is explicit, with
no invented line. Route-only continuations are valid after the visits finish.
Source geometry/provenance checks still belong to the routing adapter; structural
validation cannot prove actual street passage, current closures or claim entailment.

`request` and `originalOrigin` remain immutable through revisions. Effective new
constraints and current origin belong to `continuation`. A later deadline is an
explicit `extension_proposal` with its previous deadline; subsequent corrections
retain or shorten the accepted window using `current_deadline`. A smaller selected
remaining budget persists as a deadline and cannot grow silently on the next
correction. For older bundles with slack, the effective parent deadline is the
earlier of its declared deadline and continuation start plus selected budget.
An explicit extension may also follow a shortening; the immutable original
request still retains its original deadline. Consent/progress
are outside immutable content. Required indoor/coffee visits need fresh public
access and the whole visit opening interval. Step-free promises require both
stop and route/connector proof. Unknown evidence never becomes a positive promise.

Use UTC instants for timelines and **Asia/Almaty** for Astana civil-calendar
evaluation, consistently with the normative bundle example in ARCHITECTURE.
The conflicting Asia/Qyzylorda mention in archived T08 is not a second contract
timezone. The host's timezone does not select the city's calendar. Date-only
`checkedAt` provenance retains day precision; it is never a midnight observation.
Freshness-sensitive `observedAt` and `validUntil` still require actual instants.

Canonical JSON sorts object keys in UTF-16 order and retains array order,
ECMAScript number/string encoding and Unicode content. Non-finite values,
undefined and unpaired surrogates are rejected. No Unicode normalization or
coordinate rounding occurs. SHA-256 excludes its own `sha256` field; complete
transport JSON is limited to 512 KiB. Unknown/private fields cannot be sealed.

`narrationEntries` binds chapters, question/options, separately requested hints
and explanations, and six basic cues to exact RU/KK/EN text. Generated voices,
codec decoding, pronunciation, native playback and map-style dependency closure
require their actual adapters/device checks. Synthetic integrity fixtures do
not accept those capabilities. A ready integrity receipt is not a field gate.

## Reproducible local checks

With mobile dependencies already installed, first run from the repository root:

```powershell
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run build:node
npm run test:node-runtime
npm --workspace @astanaai/contracts test
npm --workspace @astanaai/contracts run typecheck
npm --workspace @astanaai/contracts run check:artifacts
```

`npm run artifacts` regenerates structural JSON Schema and three owned CC0
synthetic fixtures with byte hashes. `schema/WalkBundleV1.schema.json` is derived
from the sole Zod authority; semantic refinements and SHA validation remain
mandatory. The pinned converter is a development-only tool for the project's
existing Zod v3 schemas. It is not part of the application runtime.

The root workspace lock is authoritative for these packages; the mobile app
retains its separate existing lock. Ordinary Node ESM package imports use the
compiled private-workspace entries under `dist`/`.runtime`, produced together
by `build:node`. Those generated directories are not source deliverables.
The runtime tracer imports the actual package exports without a test loader.
The `types` condition retains source entries for TypeScript. The `react-native`
condition uses the same compiled JavaScript: Metro does not resolve the source
NodeNext `.js` specifiers to sibling `.ts` files. Run `build:node` before bundling
an application that imports these modules. An unbuilt source checkout is not
a runnable runtime package. These private packages are built as one repository,
not published as standalone npm artifacts.

The fixtures prove valid/unknown-major/corrupt handling and missing full-pack
materials, not a real route or beta acceptance. Mobile migration/preview,
both-laptop reproducibility, real planning/RAG/hosting and native asset readiness
remain open parts of T03 and the larger plan.
