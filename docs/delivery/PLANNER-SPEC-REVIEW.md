# Planner Spec review — first source tracer

2026-10-20. Read-only review of `packages/walk-planner` and `tools/planner/build_replay_catalog.py` against T04/T08/T12 and the full product scope. No source edits, network, API, purchase, key inspection or device actions. Initial reviewed `src/index.ts` SHA-256: `cdd13145d3ffc5b07c213e5ccd774bf66dd20ab8218b49a5f289b8e166ffc952`.

## Initial findings (closed by the follow-up below)

1. **P1 — GPS freshness uses the planned start, not the observation clock; explicit GPS ends bypass it.** T04 requires preserving and correctly handling the actual endpoint. Public probes rejected a fresh 12:00 fix for a 12:30 plan, but accepted that same fix/start with `now()` at 18:00. An explicit end with accuracy 999 m and capture in 2025 also produced a candidate. Validate live-fix freshness against one captured `now()` and apply an explicit quality policy to every GPS endpoint; do not silently turn an unreliable fix into an intentionally selected manual point.

2. **P1 — Retrieved fact identity is treated as sufficient chapter support.** ARCHITECTURE explicitly states that an existing fact ID does not prove entailment. A synthetic wrapper changed the retrieved `fact-tree-life` statement to a withdrawn assertion. The candidate retained the old Tree-of-Life chapter while publishing the changed fact under its reference. For this pinned editorial Adapter, compare required statements/provenance with its supported content revision and refuse incompatible evidence; do not attach the old chapter to an updated, contradictory fact.

3. **P2 — Malformed evidence escapes the public error contract.** T04 requires understandable data/network failure states. A throwing search correctly returns `DATA_UNAVAILABLE`; a search resolving `{}` instead rejects `plan()` with an uncaught TypeError. Validate the returned EvidenceSet before reading it and return an explicit unavailable reply for invalid data.

## Verified source-local behavior

Baseline test and builder replay passed. Independent raw-way checks matched **248 adjacent traversals across six paths**; recomputed geodesic distances differed by less than 0.004815 m from rounded stored totals. Return/last-stop/explicit-Nurzhol estimates were respectively **2,212.20/1,106.10/1,710.28 m** and **62.87/44.435/54.504667 minutes**, including visits/reserve. Exact manual start preserved its point; an off-node gap refused. Short budget, required coffee and source outage returned honest failure states. Chapters remain explicitly editorial; audio/maps are missing and field acceptance is denied.

At that initial snapshot, T04 remained partial: no hosted backend/APK planning flow, general actual-origin connectors or city coverage. T08 remained partial: one supported experience, limited context and no wider feasible alternatives. T12 was unimplemented: `revise()` returned unavailable. These were remaining full-scope requirements, not completed gates or reasons to reduce the plan.

## Follow-up: initial plan fixes and revision proposals

Reviewed source SHA-256: `fa4c1eabce9f2f58020e50bf99f75df154f67e52e0b3ee3f4a0ad82dcf4670c7`; normal-import compiled entry: `1ba24805b82cec93465976ad073d276f87a4204a3bbcb00ec6aa0b102b9c5db5`. The local suite passed **10/10**. Independent probes used ordinary `@astanaai/*` package imports, without compiling or editing shared files.

The original failures are closed: fresh GPS with a future start now succeeds, unreliable explicit GPS end clarifies, changed retrieved facts refuse old content, and malformed evidence returns `DATA_UNAVAILABLE`. Revision proposals preserve return/last-stop/explicit endpoints after all visits, with respectively 1,106.10/0/604.18 m remaining. Stale parent hash, duplicate completions, an off-node current point and stale request time clarify; missing parent returns a bounded unavailable error. No proposal applies itself or mutates the parent.

### Revision findings (closed by the final follow-up below)

1. **P1 — A shortened continuation window can later expand silently.** At 12:40, a user-change request with 25 minutes remaining and all visits completed produces a proposal whose budget ends at 13:05, but `timeTerms.deadlineAt` remains 13:20. Assuming that proposal is accepted, a deviation at 12:43 with remaining 37 (derived from the retained deadline) finishes at **13:06:26.100 with `requiresConsent:false`**. The three-minute increase stays below substantial-extension thresholds while exceeding the latest explicit time budget. Persist the effective shortened deadline or derive it as the minimum of agreed deadline and continuation start+budget; expansion past it needs explicit extension consent.

2. **P1 — A valid-hash unsupported parent chapter is inherited.** A synthetic parent was resealed with the same planner/content revision strings and valid fact refs, but an unsupported Round Square fact-block. `revise()` with the first two visits completed returned a proposal containing that changed block. Hash verifies integrity, not editorial support. Validate parent content/facts/provenance against the supported pinned revision, or reconstruct pending chapters/quests from that revision. An actual Session CAS is still separately required.

3. **P2 — New context provenance is not merged.** A schema-valid EvidenceSet with a newly sourced weather snapshot returned `DATA_UNAVAILABLE` during revision: context is replaced, but sources remain copied from the parent, so bundle validation finds an unknown weather source. Rebuild the relevant source closure from current evidence plus retained content/route sources before sealing.

T04/T08 remain partial. T12 now has source-local proposal mechanics, but positive warm-indoor data, Session acceptance/CAS/consent, durable progress reconciliation, actual offline resources/readiness and device checks remain open. The full original product scope is unchanged.

## Final follow-up: three revision fixes closed at the public source seam

Current `packages/walk-planner/src/index.ts` SHA-256: `19974c455dbb547ff7cd5d0fe91d62da95e4543b8854f9ebfbcd392adb9df071`. Current `test/planner.test.cjs` SHA-256: `be0b4772f53550bd353cf686cb2eadb6a7ee808bca24482d73922b9289798959`. Following the independent findings above, this reviewer became the assigned owner of those two files to implement fixes. Root independently reviewed the changes and added the final change-metadata correction; the source-owner tests below are not represented as a separate reviewer approving their own implementation.

1. **Shortened active deadline — closed.** Every successful revision stores `now + remainingMinutes` as its active deadline. The effective old deadline is `min(parent declared deadline, parent start + parent budget)`, including older slack bundles. Growth past it requires an explicit proposal whose deadline matches the selected window. The regression shortens 13:20 to 13:05, rejects unproposed or mismatched later growth, then permits an explicitly proposed extension back to 13:20 with consent and previous deadline 13:05.

2. **Unsupported inherited story — closed.** Pending chapters, quests, cues and theme are reconstructed from the approved pinned editorial revision. Stop title, references, duration and current evidence-backed anchor/access/services are refreshed instead of trusting valid-hash parent prose. Unsupported editorial stop order refuses. The regression reseals a poisoned fact block, question, cue, theme title/explanation, stop title and false field-verification flag; no poisoned prose survives the proposal. Root's final metadata delta derives `themeChanged` from the parent guard's reasons, and the regression also asserts it is true when the title changes back to the approved one.

3. **Fresh context source closure — closed.** Revision facts and context come from the new EvidenceSet. Relevant source closure includes facts, stop fields, route and endpoint connectors, route accessibility, weather and calendar exceptions. A missing required source returns `DATA_UNAVAILABLE`; unrelated sources are excluded. The regression adds a synthetic, clearly labelled current weather source and refreshes fact/source check times: the proposal seals, contains the current provenance, excludes unrelated source data and does not mutate its parent.

After Root's metadata delta, an independent process repeated all **13/13 source tests PASS**, including the original GPS/fact/error regressions. A separate filtered process repeated the three critical revision regressions **3/3 PASS**. These are public Interface tests with actual retained editorial/routing data and labelled synthetic edge cases. This follow-up does not claim a refreshed compiled-package, phone, field, Session-acceptance or complete offline gate. T04/T08/T12 remain partial for the reasons above.
