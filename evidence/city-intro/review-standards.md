# Standards review — city introduction

Base: `bd86d8ffcc5b32df632f7b3ad1783f2380f0367f`. Reviewed the current working-tree changes, including new files; there were no later commits at review start. Independent read-only source review; only this report was written.

Standards: `AGENTS.md`; relevant privacy, evidence, lifecycle and acceptance provisions in `docs/plan/PRODUCT-SPEC.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `GLOSSARY.md`, `TEAM-WORKFLOW.md`; `docs/research/CITY-INTRO-GEOMETRY.md`. Installed `code-review` skill and its heuristic smell baseline applied. No packages, keys, payments or APIs used.

## Findings and correction recheck

1. **P2 — CLOSED: visible OSM attribution.** Initially the default outline disabled native attribution and hid every OSM credit in a collapsed panel. Rechecked `apps/mobile/src/features/city/CityIntro.tsx:264–265`: a permanent, accessible `© OpenStreetMap` link now remains beside the caption in both schematic and street/fallback modes. It has a 44-point minimum touch height. The detailed provenance and overview limitation remain accessible in the source panel. The initial finding cited the project's explicit UI standard, not a legal opinion.

2. **P3 — CLOSED: Android annotation bitmaps.** Initially the stable district key prevented colour-only selection updates from refreshing Android bitmaps. Rechecked `CityIntro.tsx:233`: both React key and native id now include district, locale and selection state. The native view is remounted and freshly rendered on either change. The corresponding id change is safe because the React key changes too; installed `useFrozenId` therefore does not receive an id mutation on an existing annotation. Camera target, card and selected district remain in parent state. A label click invokes only `onPress`; native selection/deselection events are not bound to application actions, so remount cannot create a callback loop. Repeated clicks on the same selected district continue to use `onPress`.

The remounted bitmap label may briefly lose native selection/accessibility focus; this is a runtime observation to test, not a demonstrated blocker. The actual accessible district `Pressable` chips keep stable keys and selected semantics and are not remounted by selection or locale changes. Native chip/TalkBack and visual transition smoothness remain pending.

No blocking GPS, durable-progress, dependency or payment regression found. Opening/replaying waits for verified native Stop and audio cleanup, pauses an active walk, preserves the walk repository and leaves controls visible on failure. Cold-load checks the separate preference after native cleanup; non-ready progress takes priority. Timers/listeners/animations have cleanup; reduced motion defaults to the conservative mode and accessible district chips offer an alternative to map taps. No additional smell worth reporting.

## Verification and limits

- Strict mobile TypeScript: PASS, repeated after corrections.
- Four actual-guide/SQLite preference tests: PASS, repeated after final content regeneration; five synthetic geometry invariants: PASS.
- Read-only producer replay: all three geography/metadata artifacts matched; bundled boundary/river geometry matched the real source witnesses. No files rewritten.
- MapLibre camera, style/event, annotation, frozen-id, native click/selection and paint-transition APIs checked in installed sources.
- Startup publish now follows the preference decision (`WalkApp.tsx:77–84`), preventing a transient walk-map render before a new introduction.
- Final candidate-code-5 bundled guide SHA256 at recheck: `e565c4d307adca5a1730152a4dbd7a81e126fd4fc3d941d14c41cc850a88fc9b`. Strict TypeScript and all four city/SQLite tests were repeated on this candidate: PASS.
- Candidate-code-5 layout recheck: the root is measured with `onLayout`; the footer does not shrink, includes explicit bottom clearance, and the maximum card height follows the measured viewport. The Android 48dp minimum is expressly a conservative fallback for the observed three-button-navigation device, not a general WindowInsets implementation. No dependency or privacy changes were introduced. The changed WalkExperience attribution/compass position is below the added city button.
- First river camera now uses real river bounds. A read-only inclusion check found the right-bank label `[71.405, 51.177]` slightly outside their northern bound `51.1744009`; reported to Root. Padding may still keep it visible, so this is a framing check for the final native screenshot, not a demonstrated source blocker. Combining river bounds with the two bank-label anchors would remove the uncertainty.
- Reviewer inspected Root's initial code-4 Android screenshots. `android12-river-steady-initial.png` actually shows KK district mode/Almaty and confirms the bottom CTA/system-navigation overlap that prompted the layout correction. `android12-welcome.png` actually shows the initial loading screen. Neither filename establishes a welcome-animation or river-screen PASS. Preserve them as initial evidence; final candidate-code-5 CTA visibility and camera framing require fresh device evidence.
- Native interactions, screen reader, enlarged fonts, offline rendering and Android GPS/replay acceptance were not executed by this reviewer. These and final code-5 layout confirmation remain separate runtime gates, not claimed source-test PASS.

Status: **PASS — 0 remaining source findings.** Both initial findings corrected and independently rechecked. Native/field acceptance is separate.
