# Independent spec/correctness review: persistent finish,0.6.2

Decision: **APPROVED at source/local-test level; no actionable correctness finding in the reviewed delta.** Android rendering, physical arrival and full device-flow acceptance remain separate.

Baseline: `b8516e61bda1958baac14f15e9695b11d8dd0f85`. Reviewed unstaged `WalkExperience.tsx`, new `storyProgressAction.ts`, both new test files and `scripts/verify-local.ps1`; version metadata was observed to advance consistently to0.6.2/code15. The already reviewed fixed OwnUI helper policy was not expanded or re-approved as device execution. No source edits, phone or remote actions by reviewer.

## Requirement checks

- **Reachable explicit finish:** the story-only `persistentActions` remains a sibling after the sheet's `ScrollView`/`Animated.View`, not a scrolled child. Its120px allocation is retained at the end, and sheet/map padding uses the same `footerHeight`. After `currentStopIndex === stops.length`, the first persistent button displays the selected `ending.confirmLabel` and invokes `onConfirmReturn` only on explicit press with a `confirm_end` intent.
- **No duplicate confirmation:** the old body confirmation button is now entirely inside `!storyOnly`; its return title/body remain. Story-only has one end control; legacy non-story mode keeps its original inline control. Generic exact-label helper selection is therefore not deliberately made ambiguous.
- **Selected ending is preserved:** return-to-start, last-stop and chosen-point labels come from the existing `walk.ending`, not a new hardcoded return label. The command continues through existing `CanonicalApp`/session `confirm_end`, whose immutable bundle already records the chosen end rule. The delta does not replan or alter its endpoint.
- **No automatic or paused/busy completion:** the pure helper returns no intent unless story-only, active and permitted. It validates cursors and offers `confirm_end` only at exactly the end. It neither dispatches nor mutates. The end button is disabled otherwise, and its handler independently checks the intent before calling the parent. Existing `operate` serialization/session active-state validation remain the authority.
- **Old manual-completed current chapter is not trapped:** `storyReadDone` now uses only actual `readStopIds`, rather than the union including manual `completedStopIds`. This correctly allows `read_story` at the current chapter even when an old correct quest already marked it complete. Existing session transition appends read provenance and advances the cursor; its validation permits overlap with valid manual completion. No schema/data migration, old bundle replacement or manual/GPS proof manufacture is introduced.
- **Ordinary reading and previews:** the helper requires the selected current chapter for a read intent. Previewing a past/future chapter while another is active cannot mark it. At the end, the explicit ending control remains available even when reviewing an earlier chapter; its label still clearly states confirmation.
- **No new GPS award path:** only UI intent selection changes. Native GPS, session persistence, rewards, sources and narration authority have no delta. Existing manual rewards remain possible only through their established valid manual proof; the new reading action does not populate that proof.

## Independent verification

Executed with existing local Node from `apps/mobile`:

1. `node --test tests/storyProgressAction.test.cjs tests/walkFinishFooter.test.cjs` — **13 PASS/0fail/0skip**:5 pure-interface tests and8 actual-TSX view-tree tests.
2. `node --experimental-sqlite --test src/canonical/session.test.cjs tests/canonicalPresentation.test.cjs` — **20 PASS/0fail/0skip**, including actual hostSQLite durable reading without fabricated visits/answers/collection, old v2 compatibility, terminal confirmation, all ending projections, CAS/rollback and archive conflicts.
3. `node node_modules/typescript/bin/tsc --noEmit` — exit0.

The local runner addition uses the existing `Invoke-LocalCheck`, `apps/mobile` cwd, the exact two present filenames and `--test`; failure propagation and no-download/no-provider behaviour are unchanged. The full runner was not independently rerun here because Root owns that integration run. Root reported the preceding red-to-green sequence; this reviewer independently witnessed the green results above, not the initial red stage.

## What these tests establish and do not establish

The TSX tests execute the actual production component and inspect rendered public button props and scroll ancestry; they are useful regression checks for the previously unreachable UI command, duplicate controls and preserved legacy action. They are not copied implementation bodies. The pure helper tests cover its public intention rules, including actual sealed bundle end variants, but are intentionally smaller than a complete app test.

React hooks, native animation/map/layout are recorded adapters in the view-tree test. These checks do **not** prove actual pixel reachability, large-font fit, Android accessibility click uniqueness, a successfully completed phone flow, audible quality or physical/GPS return. Root should verify the real installed0.6.2 finish control and terminal/repeat path with the unchanged own-window/input/capture protections, retaining the distinction between a manual UI test and field completion.

## Reviewed source hashes

- `WalkExperience.tsx`: `201b4915211f7b7740ea5a486445e45d571e4263c8fca7c1483e1cbf3fd22beb`
- `storyProgressAction.ts`: `c1d4a9f5087f0aeb7b79eb095dd7061ed11fd0f3eb8f18892ee6df8ad9ef2f68`
- `walkFinishFooter.test.cjs`: `b90604707bde7893dea3e4ecb8a1bd62967607b30efe814dd19e2d745049a43f`
- `storyProgressAction.test.cjs`: `54147ebac529054b622342bd97cc58a5baf765a8940ad25dd72e867008b2f693`
- `scripts/verify-local.ps1`: `545299bcd301aea28a3366bd5d549c9142234e451ac231e75c30e2df129f0d5e`

No new purchases, paid calls, downloads, settings changes or external publication.

## Subsequent narrow review: explicit reading count

Root subsequently changed the story-only `finishedIds` projection from the union of `readStopIds` and `completedStopIds` to `readStopIds` alone. This is approved: a historical correct quest/manual completion must not be displayed as an explicit read event. Non-story completion continues using `completedStopIds`; stored proof, bundle identity, SQLite rows and cursor transitions are not changed. A manually completed current chapter still has the enabled read action until actually read.

Independently reran the same13 pure/actual-TSX tests after this change:13PASS/0fail/0skip. The legacy-current test now also observes `1/3 stories read`, preventing the old manual proof from inflating the displayed reading count. The source fingerprints above describe the earlier reviewed snapshot and are not asserted to match this later line or subsequent AstGeo branding edits. No device acceptance is claimed.
