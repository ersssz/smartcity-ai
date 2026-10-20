# Final Standards delta review

Date: 2026-10-20. Reviewer: Codex first_walk_content; independent of the WalkExperience UI author. Read-only source review against AGENTS.md and docs/FIRST-EDITORIAL-WALK.md. Scope: full-screen map, bottom sheet, stop search, WalkApp/App integration and priority Stop. No application source was edited.

## Result

No remaining actionable Standards blocker found in this reviewed delta. This does not establish physical UI, field or full-beta acceptance.

The previous P2 narration race is fixed: WalkApp captures `++speechGeneration.current` **before** awaiting `Speech.stop()`, then checks the generation, priority-Stop flag, mounted state and foreground state before `Speech.speak`. Backgrounding, Stop and unmount invalidate that generation. The persistent Stop button has no busy disabling and calls urgentStop directly; native/audio cancellation starts before waiting for pending persistence.

Map taps use ViewAnnotation `onPress`. Checked the installed MapLibre wrapper and Android MLRNPointAnnotation: this is the press callback; selection is a separate event. Search and sheet state change browsing only. Manual marking, current-stop answers, chapter continuation and explicit return confirmation still invoke domain commands. The full journal is earned only after completed chapters and manual return; previously saved discoveries remain separately rendered after restart.

The UI consumes the saved route and public anchors, without calculating connectors or remote search. Device coordinates stay in ephemeral state with foreground/generation/freshness checks; external-map links contain the public start. No new paid-provider, credential-loading, storage or setup-hook path appears in the UI integration. Existing dependencies are reused.

Independent targeted command: `node --test tests/priorityStop.test.cjs` — **4 passed**. These verify promise ordering and failure propagation, not device cleanup. Root’s reported final TypeScript result was not rerun here.

Pending release evidence: rebuilt-APK UI/taps/drag/search checks on the phone, actual walking access, human KK/EN review and prepared audio. Those are explicit remaining acceptance work, not concealed source-review passes.

## Reviewed SHA256

- `src/features/walk/WalkExperience.tsx`: `ecef646c0b57147b896b58a88dd3fcbb8542d5e257038d930fbceab94af9508e`
- `WalkApp.tsx`: `c868ea8688b742c1972e04aa02cd4628c5340188cc35989f32f32e1862ecd7fc`
- `App.tsx`: `806929aac22d760f2931f3a86b2721e99efb86cbe1c8346c2d27113b65266602`
- `src/walk/priorityStop.ts`: `90b29f474907bc078ece3608f124816603052027952bba24c3d7fc1c5ab23e22`
