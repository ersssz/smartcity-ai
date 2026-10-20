# Independent Standards review: contracts and local runner

2026-10-20. Baseline `2be738f1c815b746334dfb9125148d897cbfc85b`; reviewed the new untracked `packages/contracts` snapshot and `git diff 2be738f... -- scripts/verify-local.ps1`. This is the Standards axis only. PublicCollection, authored by this reviewer, was deliberately excluded. No implementation, dependency or fixture was edited; this report is the only new review file.

Authority: [AGENTS](../../AGENTS.md), [TEAM-WORKFLOW](../plan/TEAM-WORKFLOW.md), [ARCHITECTURE](../plan/ARCHITECTURE.md), both glossaries, and installed codebase-design/TDD/code-review rules. No separate CONTRIBUTING/CODING_STANDARDS file was found.

## Findings

**No documented-standard blocker found in the reviewed foundation.** Two limited observations remain:

1. **P2 integration gap, not a hard style violation:** [package.json:6](../../packages/contracts/package.json) exports `src/index.ts`, whose imports name `.js` files that have not been emitted. Actual Node22 consumer probe `node --experimental-strip-types --input-type=module -e "import('./src/index.ts')"` fails `ERR_MODULE_NOT_FOUND: src/model.js`. The 46 tests use a custom transpile loader, so they do not prove the declared entry point works in an ordinary Node consumer. Before integrating that consumer, provide an explicit compiled export/build or verify and document the intended bundler. Source-only/native migration is already honestly pending; this does not imply the existing Android application regressed.
2. **P3 judgement: possible Duplicated Code.** The same `load`/`Module._compile` resolver appears in [generator:8](../../packages/contracts/scripts/generate-artifacts.cjs), [bundle tests:10](../../packages/contracts/test/bundle.test.cjs) and [review probes:15](../../packages/contracts/test/review-probes.test.cjs). One owned local loader, or testing the eventual built entry point, would prevent resolution rules drifting. This is a maintainability suggestion, not a release blocker.

## Independently checked

- 46 contract tests PASS; strict TypeScript with `noUncheckedIndexedAccess` PASS; generated schema/three fixtures `--check` PASS.
- Runner parses without PowerShell errors, propagates native exit codes and invokes check-only artifact generation. No install, provider or network command is introduced.
- One Zod authority derives types/schema. Structural schema explicitly does not replace semantic/hash validation. Fixtures are labelled synthetic CC0, missing map/audio remains partial, and file integrity tests hash actual temporary bytes.
- Lock and installed versions match: Zod3.25.76, development-only converter3.25.2; TypeScript6.0.3 is supplied by the explicitly documented pinned mobile prerequisite. Runtime source imports no Node filesystem/crypto, network client or logger.
- Bundle progress/consent remain outside immutable payload; strict unknown/private fields, injected hashing and explicit evidence modes preserve the documented seams. Real routing, claim entailment, media decoding, hosted services and field gates are not claimed.
- Existing `apps/mobile` has no diff from baseline and no new contracts import. Mobile strict types and all23 editorial/actual-SQLite/priority-Stop tests PASS. This proves the old schema remains unchanged, not a completed new-schema migration.

Verdict: **0 hard Standards violations; 1 unaccepted Node-consumer integration gap; 1 optional duplication smell.** No independent Spec verdict is made here. No secrets, phone, purchases, paid API, installs or external services were accessed.

## Reviewed byte identities

| File | SHA-256 |
|---|---|
| contracts/src/model.ts | `d27988a1ff5088a8ff5bded75ddf69d74351a379188d58ca583fdcd486919bad` |
| contracts/src/bundle.ts | `549458151995efef284dd8980af8b524bfcf65b6f91ca8303c0c020031a8eaf7` |
| contracts/src/assets.ts | `9d368660fa7b28cb0dd0c84b1afa9ee3dbc37267bca61c41e11be5b8255d49bb` |
| contracts/src/revision.ts | `03d8857f2831ec0b569308efa493c56687c55234b96e5020312e38c4d0f36f66` |
| contracts/src/interfaces.ts | `e132db50b657004936f66805c929b98e0bfa138de5bf86df12774e7ace71a874` |
| contracts/src/index.ts | `1e6eef80e8e41c684be04de431dbd102979dbe2dc2f7883f0ed5d3c6a66a854c` |
| contracts/scripts/generate-artifacts.cjs | `bac1a8590fe9512e4e1860cb51c4f5bf2a100cb572d51da1582afdc4f2489cf4` |
| contracts/package.json | `23b28023a352fe6b46f48632e08ed0bf364f783fe64b1a89bb85516ac0607ee9` |
| contracts/package-lock.json | `e0110581a69b73115a0d252a57a68c26a10d2c241fb4db437874ff8694e98457` |
| scripts/verify-local.ps1 | `90fa3ab9c305915c3706009450d5c3609df9ac2c41ca28fe9e7b9b05fa83e0a9` |

## Follow-up: Node consumer closure and selected-deadline guard

2026-10-20, later working tree. The earlier P2 ordinary-consumer gap is **closed** by Root's normal private-workspace build/exports. [Independent workspace review](NODE-WORKSPACE-REVIEW.md) records absent-output builds, normal ESM runtime **2/2 PASS**, strict consuming types, the additionally found/fixed native export defect, and a real isolated Expo Android bundle PASS. The original 46-test/byte table above remains historical, not a claim about current file hashes. The optional duplicated test-loader suggestion is unchanged; normal runtime proof no longer depends on that loader.

Root requested a narrow independent review of `bundle.ts`, `revision.ts` and the three added selected-window regression cases. Compared the current logic with the earlier emitted JavaScript retained in isolated scratch; no source was changed.

**Standards: no blocker found.** The new guard stays in the existing parent-aware validation Interface, uses already validated timestamps/budgets, returns a typed refusal, and keeps consent/storage activation outside immutable bundle parsing. It adds no dependency, provider, location retention or hidden state. The removed lower bound on an extension's previous deadline does not change the machine schema or original-request immutability.

**Spec: the narrow change is correct.** `activeDeadline = min(parent.statedDeadline, parent.continuation.startAt + parent.selectedBudget)` preserves an already shortened selection, including older valid parents whose stated deadline still had slack. A correction may retain or shorten that effective end, but cannot grow it under `current_deadline`. An explicit extension must name that exact effective parent deadline and have a later proposed end; parent validation derives `deadline_extension` consent. Removing the standalone `previousDeadline >= originalRequestDeadline` restriction permits an explicitly consented extension after an earlier shortening, while the original request remains unchanged. Standalone `readBundle` establishes bundle validity, **not** acceptance of an extension: Session still repeats parent hash/revision CAS and records actual user consent in its durable transaction.

Independent bounded check:

```powershell
node --test --test-name-pattern="a shorter selected window|an explicit extension may follow|an older parent with slack" test/review-probes.test.cjs
```

**3/3 PASS**, 0 skipped: shortening survives the next correction; an explicit extension after shortening requires consent without rewriting original request; older slack cannot restore the larger budget silently. These tests seal/read actual bundles with real SHA and exercise the public parent-check Interface. No broad suite was repeated for this narrow review; Root's reported 49-test total is not substituted for these independently executed results. The same current source also compiled in the isolated normal Node build recorded in the workspace review.

Reviewed hashes: `bundle.ts` `c1f1a5a4b80b9ddac3ace6a3e15901a5472742661a472d50bd383533be9a27f0`; `revision.ts` `5a3ba5006500129dad6e8dc9225d2f4001be08ce1911c840aae58c54e32b812b`; `review-probes.test.cjs` `a28147f6909afa285634e014f4983265c8226ce863d9087811bd8879930c921c`. This does not accept the yet-unimplemented mobile consent/CAS flow, live generation, field routing or device runtime.
