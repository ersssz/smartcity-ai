# Standards review — first editorial walk

Date: 2026-10-20. Baseline: `7487404e9d774280110ae3f840f81cdb670383af`.

Scope: tracked working-tree changes against that baseline plus new untracked implementation, tests and documentation. There are no subsequent commits yet. Standards source: `AGENTS.md`; scoped module/behavior promises: `docs/FIRST-EDITORIAL-WALK.md`. Read model, engine, repository, migration, priority Stop, WalkApp, App, UI and representative public-interface tests. No source changes or device/provider claims were made by this review.

## Documented hard violations

None found in the reviewed implementation. Public graph geometry and coordinate-free progress remain separate from live device coordinates; no paid provider or secret-loading path was added. Root owns the shared contracts and migration. Repository checks exercise real SQLite and engine interfaces, and correctly distinguish simulated content from device/field acceptance. The prepared catalog and source-edge witness are still known work in progress, not accepted delivery evidence.

## Concrete bug judgment

- **P2 — stale narration can start after Stop or backgrounding.** `apps/mobile/WalkApp.tsx:149-155` checks visibility before `await stopAudio()`, then starts `Speech.speak` without rechecking cancellation or lifecycle. If that first stop is delayed while a newer urgent Stop/background cleanup finishes, the older operation can resume and begin narration after the user's Stop. `runPriorityStop` waits for that pending operation but does not repeat audio cleanup afterwards. Guard the post-await start with a captured cancellation revision, mounted/foreground checks and the priority-Stop state. This is a behavioral race, not a style violation.

## Reassessment and heuristics

The earlier ignored-Stop finding is resolved: `WalkApp.tsx:110-119,188` bypasses the ordinary busy guard and invokes the tested priority Stop interface before waiting for pending persistence. Independent `node --test tests/priorityStop.test.cjs`: **4 passed**; this verifies promise scheduling, not device cleanup. Unknown accuracy is no longer shown as zero. Manual marks, quest answers and return confirmation remain distinct.

No additional actionable smell-baseline judgments were identified; no tooling-enforced formatting or speculative style findings are included. A final delta review is required after catalog integration and any Stop/audio repair.
