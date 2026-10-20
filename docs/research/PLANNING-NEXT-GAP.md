# Planning after focused0.5.1: actual gaps and next implementation

2026-10-20, read-only production audit. No source/dependency/contract edits, network, PBF download, paid API or device action. Local probes are in task `work/planning-next-stage/`. Existing mobile progress remains untouched.

## What actually works today

Public `WalkPlanner.plan` accepts15–240 integer minutes, six interests, four context flags and all three endings (`packages/contracts/src/model.ts:39`). Actual implementation is one retained-source editorial chain, not a general city planner (`packages/walk-planner/src/index.ts:54–94`). Public probes made306 calls, produced31 valid sealed bundles and confirmed no caller-input mutation. Every successful response has exactly one candidate with Baiterek, Nurzhol, Round Square in that order.

| Public request from Baiterek anchor | Actual result |
|---|---|
| Return to original start | First fitting budget62min; at80 budget:2,212.2m,36.87walking+18visiting+8reserve=62.87min |
| Last-stop finish | First fitting budget42min; route1,106.1m |
| Explicit Nurzhol finish | First fitting budget53min; route1,710.28m |
| Exact public Baiterek/Nurzhol/RoundSquare origins/ends | Supported; always the same full ordered three-stop chain, even if origin causes retracing before the first chapter |
| Different point or historical place ID | Clarification; no snapping/substitution |
| Empty interests / architecture / unusual | Same one candidate |
| History / art / parks / coffee alone | `NO_SUPPORTED_CONTENT`; this describes current catalogue capability, not city-wide impossibility |
| Architecture+history / unusual+coffee | Same architecture candidate; interests currently work as broad lexical alternatives, not all-required hard constraints |
| Hard coffee / indoor / step-free | Honest refusal: hours/access unconfirmed |
| Cold/wind/rain/tired flags | Preserved in request; no change to candidate content, geometry or timing |

`plan` resolves only the three retained public anchors, searches one fixed zone, requires all three editorial stops, loops over every prepared stop and returns one bundle (`index.ts:39,68,74,94`). Current weather/holiday discovery ranking lives separately; live discovery weather does not enter this planner. The request flags do not implement weather adaptation. Calendar dates must remain reasons to explore, never claims of scheduled events or open venues.

Mobile hides the public choices entirely: `src/canonical/preparation.ts:15–21` hard-codes80minutes/architecture/Baiterek/return, takes `bundles[0]`, and requires exactly54 narration entries. Other discovery POIs correctly retain external-map actions instead of opening this unrelated walk.

## Route inventory: two useful existing variants, no historical graph yet

The six generated replay paths are pairwise shortest paths over the retained witness (`tools/planner/build_replay_catalog.py:24–35`). Therefore current canonical return is the1,106.1m retraced shortest path. A second, already evidenced route exists in legacy `preparedWalk.json`: different return of2,117.004562m, total3,223.10444m, walking53.718407+visits18+reserve8=79.718407min. Its recorded ×20 overlap-cost search changes path selection only; physical distance remains the unpenalized sum (`evidence/first-walk/routing-build.md:43–61`, `routing-review.md:54–69`). These are different geometries, not conflicting sums. Do not confuse the shorter canonical path with the longer legacy loop.

Independent child inventory confirmed current local witness1,825 records/548,262B:932nodes,77ways,816relations, max node latitude51.1586974; no current repo `raw-data/`, PBF, full augmented graph or historical matrix. Seifullin51.17144196, Gorky51.165083 and waterfront representative viewpoint51.161151 are north of this coverage and not graph/public anchors. Discovery points are not verified entrances; the waterfront coordinate is a photographer viewpoint. They cannot become eligible anchors by nearest-node or straight-line connection.

The old friend-side record mentions Kazakhstan PBF224,566,151B SHA`9ad8e895…98bdb` and full augmented source36,014records/4,017,606B SHA`e3db0146…c01`, but those bytes are not verified on this machine (`evidence/first-walk/routing-build.md:101`, `routing-review.md:25`, `root-witness-replay.json:48`). Root can recover and hash the retained public inputs through the approved file workflow later; no new download is needed for the immediate upgrade.

## Audio reuse: exact bytes are reusable, trimmed narrative is not automatically approved

Registry has54entries/54assets. Local `audio-subsets.cjs` filtered only already approved content and checked every remaining text hash through public `narrationEntries`:

| Selected stops, original Baiterek return | Narration entries | Existing text hashes | Geometric minimum budget |
|---|---:|---|---:|
| Baiterek only |30|all match|15, but ZERO walking distance; existing UI rejects a one-point route |
| Nurzhol only |30|all match|28min; standalone narrative not yet approved |
| Baiterek+Nurzhol |42|all match|34min; partial ending not yet approved |
| Baiterek+RoundSquare |42|all match|55min; narrative refers to third key/earlier line |
| All three |54|all match|62min shortest-return geometry |

Every partial selection fails the current mobile equality guard. More importantly, description/collection/completion cue explicitly promise tree+line+circle. RoundSquare begins “After the long view along the boulevard”; quest asks for the third key. Reusing an audio hash proves textual identity, not coherent partial experience. A partial walk needs reviewed theme/ending and, where necessary, a standalone chapter/quest; changed text needs a new content identity and new local narration. Do not relabel old audio or relax SHA checks.

## Recommended bounded upgrade, in order

1. **Expose existing selection first, without new contracts.** Add a small time/interest/end/start request screen and a candidate comparison screen over public `PlanReply`; retain structured clarification/refusal. Only explicitly supported public anchors can start a guided walk. Unsupported historical cards stay discovery/external-map until their graph/anchors/content exist. Display estimated actual duration and requested budget separately; current fixed “80min” CTA hides the63min canonical estimate.
2. **Offer two honest full-story route shapes using existing54 recordings.** Keep current shortest-return variant and add the already evidenced different-return loop into generated catalogue, with stable `variantId` internal to planner/bundle identity and clear “direct return” versus “city loop” comparison. Both preserve the same selected start/end and full three-chapter editorial content. Recompute visits/reserve/end against each request; omit the long loop below its fitting budget (~80min), never synthesize a third candidate. Two geometries are useful choices but do not claim two different historical themes.
3. **Then add the reviewed34min two-stop editorial edition.** Reuse Baiterek/Nurzhol chapter bytes that remain exactly unchanged; replace the three-form completion cue and metadata. A fresh registry can contain a union of assets; prepare only the entries actually required by the selected bundle and verify each ID/locale/textSHA. Missing changed narration stays explicit. Avoid a zero-distance one-stop candidate. A third standalone Nurzhol loop can follow only after its chapter/quest/ending reads coherently outside the original sequence.
4. **Historical route is a separate data slice.** Recover/hash wider source, select sourced public pedestrian anchors, calculate continuous foot legs with barriers/directions/restrictions and exact selected endpoints, independently review routing and facts, then author short RU/KK/EN stories. No arbitrary centroid→nearest-node connector, unsupported road crossing or invented open shelter. Keep field acceptance separate.

### Small Interface/ownership changes needed

Keep `WalkPlanner.plan(PlanRequest):PlanReply` and `WalkBundleV1` unchanged. An internal editorial variant catalogue owns ordered stop IDs, approved content identity, supported interests, exact route alternatives and source pins. The UI builds a validated request and displays1–3 results. A preparation Adapter accepts the **selected immutable bundle**, attaches only matching narration assets and verifies the pack; it must not silently replan or select`[0]`. Root owns these product/shared edits.

Treat coffee interest as optional preference with visible “coffee not confirmed”; `coffee_required` remains a hard gate. Fresh weather may rank/cap exterior options through a documented local policy; manual/unavailable context cannot become measured or guarantee safety. Holiday context can explain theme ranking without changing venue access assumptions. Avoid interpreting a mixed-interest match as satisfaction of every selected interest.

### Preserve old progress

Do not mutate stored bundle JSON/hash/revision, session tables or legacy progress. New choices create new immutable bundles; selecting another while a nonterminal session exists requires the current explicit pause/abandon flow and retained archive. Continue shipping all54 existing asset bytes so old bundles verify/play. `verifyInstalledWalk` reads the old bundle's manifest directly and need not adopt the new registry's contentRevision. New variants/assets use new IDs/text hashes; existing audio IDs are reused only for identical text. Selection/acceptance must stay separate from preparation.

### Meaningful next acceptance

For budgets30/45/62/80, verify returned option count, exact timing/reserve, genuinely distinct stop/edge sequence and honest no-match. Test all end rules; reject unsupported historical starts without hidden Baiterek fallback; ensure bad/stale weather cannot improve exposed routes. Test subset30/42/54 exact text coverage, extra unused registry entries, missing/changed narration, preserved old54-asset bundle, nonterminal session conflict and terminal repeat. Verify request→candidate→selected bundle→durable reading on actual Android. Local matrix/source tests do not establish that device or field flow.

## Evidence

`work/planning-next-stage/public-audit-results.json`:306 public calls,31 successful sealed bundles. `audio-subset-results.json`: text reuse/path arithmetic only, explicitly not partial editorial approval. `public-capabilities.test.cjs`: public endpoint/budget/identity/input/history invariants plus recorded audio-gap assertions. Source hashes: planner`19974c455dbb547ff7cd5d0fe91d62da95e4543b8854f9ebfbcd392adb9df071`; generated catalogue`22ec97653c6da1219aa610f85ddc4379757c4d3eb23f186b8268314bf8a30e45`; mobile preparation`dc361dcc7809fc78b471595398d7756d4d1d59ca41c1eb80971844fd6c510b17`; registry`959e466442bbe090a8523f0d88607454706ce67d2e7e763e6b4798587ab71925`.
