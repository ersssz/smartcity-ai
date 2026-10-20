# Independent Node workspace review

2026-10-20. Reviewer: delegated agent, independent of Root's Node build/contracts/planner implementation. Base `2be738f1c815b746334dfb9125148d897cbfc85b` plus the named uncommitted files below. Scope: root workspace manifest/lock, `scripts/build-node.cjs`, exports of contracts/city-evidence/walk-planner, normal runtime consumer and the future mobile condition. Standards: `AGENTS.md`, ARCHITECTURE §2–4, installed codebase-design/TDD/code-review guidance. No source, dependency, lock, phone, remote laptop or Root build output was changed by this review.

**Result:** ordinary Node ESM build/consumption passes from absent generated output. The earlier consumer gap caused by exporting uncompiled TypeScript is repaired for Node. This review also found one **P2 future-mobile integration defect** in the original `react-native` source condition and proved a narrow fix with the actual Expo/Metro bundler. **Root has applied the matching three compiled export targets and documented the build prerequisite; those final manifest values were independently checked. P2 is closed.** This does not migrate the existing editorial app or prove Android runtime acceptance.

## Standards

No blocking documented-standard violation found in the reviewed Node Implementation:

- The three private packages build together; normal `import` exports resolve generated `dist/index.js` entries, which point to the matching root `.runtime` tree. This is explicitly a private workspace, not an independently publishable package. Tests use ordinary ESM package names and real SHA/SQLite; no TypeScript test loader supplies the claimed runtime proof.
- Compiler flags include strict, noUncheckedIndexedAccess, declaration output and noEmitOnError. TypeScript 6.0.3 is reused from the separately pinned installed mobile toolchain; the build executes no install/download/lifecycle hook. Source-only `types` exports resolve for a strict consuming project under both NodeNext and bundler conditions.
- Root lock v3 enumerates all six local workspaces, exact runtime Zod 3.25.76 and development converter 3.25.2. `npm ls --offline --all --json` reports no missing/invalid package. An isolated `npm ci --dry-run --offline --ignore-scripts --no-audit --no-fund` succeeds with empty user/global npm configs; it does **not** prove an uncached clean install or another laptop's environment. The converter's root lock entry lacks resolved/integrity metadata, so archive-byte reproducibility is not independently established by that dry run; no Node runtime/build failure was reproduced from it.
- Runtime source imports contain no Node filesystem/crypto builtins. Hashing remains injected; build/test-specific Node use stays outside canonical runtime. Catalog coordinates are public evidence, not raw device tracks. The build adds no body/location logging or network provider. These source observations do not pass the app's separate privacy acceptance.
- Mobile keeps its own manifest/lock/editorial schema. No silent migration or reinterpretation of manual history occurred. `git diff --name-only -- apps/mobile` was empty during this review.

Generated forwarding entries have a deliberate packaging purpose; they are not flagged as a Middle Man smell. No unrelated abstraction/refactor is recommended.

## Spec finding, now closed: P2 — native source export could not resolve its JS-suffixed imports

**Location:** `packages/contracts/package.json:6`, `packages/city-evidence/package.json:6`, `packages/walk-planner/package.json:6`; first failure `packages/contracts/src/index.ts:1`.

At the initial review all three manifests advertised `"react-native":"./src/index.ts"`. The source deliberately uses NodeNext-relative `.js` imports/re-exports (for example `./model.js`), but only `model.ts` exists there. TypeScript performs extension substitution for typechecking; this is not proof of Metro resolution. The installed Expo 58/Metro 0.87.1 default mobile configuration has no user resolver rewriting these paths.

This was first probed through the actual installed Metro resolver and then **confirmed with the full installed Expo CLI export pipeline**, not inferred from that probe:

```powershell
$env:EXPO_OFFLINE = '1'; $env:EXPO_NO_DOTENV = '1'; $env:CI = '1'
node node_modules/expo/bin/cli export:embed --entry-file consumer-entry.ts --platform android --dev false --minify false --max-workers 2 --bundle-output ../../canonical.android.js --assets-dest ../../metro-assets --config metro.config.js
```

The temporary entry imports `readBundle`, `createCityEvidence` and `createReplayPlanner` by package name. The scratch app uses `getDefaultConfig(__dirname)`, the existing two-worker setting and the actual installed dependency tree; only `watchFolders` is extended to make that reused tree visible. No resolver substitution or app source edit was supplied. Result: **exit 1**, `Android Bundling failed 10307ms ... (4 modules)`, `Unable to resolve "./model.js" from "../../packages/contracts/src/index.ts"`. Candidates include `model.js.ts`, not `model.ts`.

**Tested narrow solution:** change only the three **scratch** `react-native` export targets to the existing `./dist/index.js` entries after `build:node`. Repeat the same Expo command: **exit 0**, `Android Bundled 3827ms ... (24 modules)`, output 516,482 bytes, SHA-256 `26cd185a693cbb7957dd7a351f471b067c1241bb7b3777a71b87558c831af2c1`. No custom resolver or additional runtime dependency was needed. Root was notified immediately and applied these exact targets in the real manifests; the contracts README now says to run `build:node` before Metro. The final export values and prerequisite were independently read back. Keep the normal Node consumer test and add a reproducible Android bundle smoke check for this seam. A successful JS bundle alone is not Hermes/device acceptance.

An alternative is a tested, contained owned-package `.js`→sibling `.ts` resolver, but the demonstrated compiled entry requires less custom behavior. Do not broadly rewrite all dependency imports or emit JavaScript into source folders.

## Bounded validation performed

Scratch: `C:/Users/era/Documents/Codex/2026-10-20/x20/work/node-workspace-review-2f041019`. Source/dependencies were copied or explicitly reused locally. The original `.runtime` and `packages/*/dist` were never renamed, deleted or changed by this reviewer. The first scratch build began with all those outputs absent. Later, after Root added the deadline regressions/runtime pack test, current source was recopied and **scratch-only** generated directories were moved aside after validating their absolute paths stayed inside the task scratch root. The current-source rebuild passed too. Scratch source manifests differ only for the separately labeled proposed mobile fix.

| Check | Independent result |
|---|---|
| `node scripts/build-node.cjs`, absent scratch `.runtime`/dist | PASS; actual TypeScript 6.0.3, Node 22.22.2, Windows |
| Latest-source clean scratch rebuild | PASS; noEmitOnError/strict; no source loader |
| `node --experimental-sqlite --test tests/runtime/*.test.mjs` | **2/2 PASS**, 0 skipped: normal ESM real-catalog plan→sealed/readable bundle→partial pack, and actual filesystem/SQLite pin→reopen retaining partial/unactivated state; no source provider called |
| Strict consumer importing all three package names | PASS: `tsc --noEmit --strict --noUncheckedIndexedAccess --target es2022 --module nodenext --moduleResolution nodenext consumer.ts` |
| Same consumer with native type condition | PASS: `--module preserve --moduleResolution bundler --customConditions react-native`; this result did not hide the separate Metro failure |
| Offline installed graph / dry-run install | PASS within the already available local environment; no install/network performed |
| Real Expo Android bundle, reviewed source condition | FAIL as P2 above |
| Same bundle, compiled native condition | PASS in isolated scratch; matching Root export values/prerequisite independently checked afterward; no full app/device integration claim |

Reviewed initial build metadata hashes: root package `9e10713af19098c86d9d6b83ccb0b09b5fd15e6a22f4b1a757853341f23ada0f`; root lock `16724ebb93599ce16b966bb208836a75e6673c2c6a0ffd38fcc58e20c82274a5`; build script `6d08e7766a3e3da01672ca5b9e0869c4f9e75339b8d0b3e2739ec762ed7db15d`. Final compiled-native manifest hashes: contracts `404e8b1b0fcba2244eecd8fff15c6d14a26c6acd6e5719f87a04c82494c2a6fe`; city-evidence `d673997fcaa463700737c41845074bb9733333fb871a863065910e4742cc51bd`; walk-planner `77ee15f162c4a3f57ca281cad153100c87fafb42ad7517bf46b29a9ed96a5ba2`. These hashes do not freeze the rest of the shared working tree.

No dependency installation (`npm ci` was dry-run only), fresh dependency download, second-laptop setup, app package install, mobile hash Adapter, native SQLite connection, screen-off/GPS/audio/field test or hosted integration was performed. No secret/account access, configuration change, paid API or purchase occurred.

## Concrete next mobile integration seam

With the compiled native export fix applied, the next coherent slice is **canonical bundle → durable prepared/manual Session**, before native Arrival. Use the [Native Arrival design](../research/NATIVE-ARRIVAL-INTEGRATION.md); do not attach automatic achievements to today's foreground-only `onLocation`.

1. Root adds Session v2 control/event schemas and the transactionally idempotent v1 import in `src/walk/migration.ts` (or a separately versioned Root-owned migration). Preserve old editorial/history/manual collection rows and the diagnostic step counter. No unearned GPS proof is imported. Unknown versions/corrupt bytes remain recoverable evidence, not silently replaced progress.
2. Add a canonical repository Adapter behind `open(bundleJsonOrSessionId)`, `dispatch({eventId,expectedVersion,command})`, `snapshot()`, using `readBundle` with an injected Android-safe SHA-256 Adapter. Keep Node crypto out of the app. Save validated immutable bundle/hash/revision plus control/story projections in the same existing SQLite file; active restore becomes paused, event+snapshot+manual/quest awards commit atomically and one active-session/version CAS prevents stale overwrite.
3. Adapt that snapshot to `WalkExperience` through a small canonical UI adapter. Show `partial` map/audio honestly and start manually without GPS/notification permission. Keep legacy `EditorialWalk` and canonical WalkBundle identities distinct. First vertical proof: valid sealed replay bundle → prepared → manual start → mark/answer → pause → process reopen → same progress and proof; duplicate command does not award again. Add an explicit abandoned/early-end path distinct from Pause.
4. Only then bind `startTracking(sessionId,bundleHash,revision)` to the native controller/store and implement native Arrival/outbox/Stop as designed. The common control/version row lets notification Stop persist pause without JS, while story state stays independent. Revoking acquisition must precede storage/network waits; screen-off recording, permission denial and notification delivery remain independent measured gates.

This sequence creates a real mobile consumer of the new contracts and a durable native read seam without prematurely calling partial offline materials ready, replay routes field-verified, or a JS bundle a running product.
