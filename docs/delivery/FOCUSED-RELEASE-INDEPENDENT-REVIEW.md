# Focused release: independent source review

Reviewed 2026-10-20 against `AGENTS.md` and `docs/FOCUSED-RELEASE.md`, on HEAD `18378ffe71e36aea4e932e63fa9c9f4670c7f62c` plus current uncommitted focused-release sources. Read-only source inspection; only this report was added. No APK build, device action, network request or paid service.

## Actionable findings

### P2: terminal story-only sessions have no way to start another walk

`apps/mobile/src/features/walk/WalkExperience.tsx:414` renders the `storyOnly && isComplete` branch with only a Back to places action. Unlike the journal branch, it never calls `onRestart`. `apps/mobile/src/canonical/CanonicalApp.tsx:72` always reopens the selected stored session when an ID exists. `toCanonicalUiSession` also deliberately maps abandoned to the UI completed phase. Consequently, after either finishing or abandoning the walk, returning to places and choosing the guided walk repeatedly returns the terminal screen; the existing `CanonicalApp` restart callback at line134 is unreachable from the story-only flow. Add an explicit repeat/start-new action to this terminal branch and retain the distinction between completed and abandoned copy. Regression should finish/abandon, return to discovery, reenter, start a new prepared session and preserve old reading progress.

### P2: discovery hides errors and busy state from parent operations

`apps/mobile/WalkApp.tsx:134` catches native Stop / locale persistence / navigation-operation failures into `error`, while the discovery branch at line239 passes neither `error` nor `busy` to `DiscoveryApp`. The discovery component has no such inputs. Example: native Stop fails when pressing About the city or the guided-walk action; the parent correctly prevents navigation but silently leaves the same screen. Repeated buttons remain visually enabled while the parent ignores them during `operate`. Pass bounded error/busy presentation into the discovery shell and disable affected controls until the operation settles. A boundary regression should reject native Stop or locale SQL write, retain the current screen, expose a visible error, and allow retry.

## Checks and non-findings

- `node --experimental-sqlite --test src/canonical/session.test.cjs`: **14 PASS / 0 skip**. Actual host SQLite verifies durable reading without fake answers/visits/collections, v2 compatibility, unchanged readable legacy progress, two-connection CAS, idempotency and rollback. This is not Android persistence acceptance.
- `node --experimental-sqlite --test tests/canonicalPresentation.test.cjs tests/discoveryContext.test.cjs tests/discoveryContextHook.test.cjs`: **26 PASS / 0 skip**. The initial command also named a nonexistent `tests/canonicalSession.test.cjs`; Node22 ignored that name rather than testing it. The actual session path above was then run explicitly.
- First launch is claimed at App scope and triggered only after saved legacy progress/native Stop load. AppState foreground callbacks do not replay it. Discovery detail is an overlay over the same Map component; ordinary context/locale rerenders do not change the map component identity. CityOpening bounds readiness with a watchdog and supports manual reduced-motion exit. No new first-launch/remount blocker was reproduced by source inspection.
- Weather URL uses a fixed public city centroid, not device coordinates. Current weather freshness is rechecked on local ticks/resume without fetching in the background. Manual fallback is labeled, stale state loses weather ranking, and unknown indoor access is never advertised as confirmed shelter. Calendar uses UTC+5 and explicitly limits coverage to2026; its unusual March15 Constitution date is explained by primary-source research in `docs/research/DISCOVERY-CONTEXT-SOURCES.md`, not assumed to be an August30 typo.
- Each non-Baiterek card opens its actual public point through an explicitly external-map action. It cannot silently open the Baiterek route. Unknown hours and unverified entrances remain visible. Map interaction/rendering and Android HTTP have not been exercised in this review.
- Story-only reading advances through `read_story`, preserving manual/quest provenance and generating no collection. Presentation hides collection UI. Canonical migration is additive and old v2 rows default missing `readStopIds` to empty;14 actual SQLite tests pass.

## Adopted photo manifest check

All five production `assets/discovery/*.jpg` SHA256 values exactly match the final staged derivative hashes. The copied `evidence/discovery/photo-source-manifest.json` is an earlier descriptive snapshot (SHA256 `d98256b348efb6b76586941da0ccc6795a0df4161ad8ea54bdd26884fdf5c3c4`); compared with final stage SHA256 `40ab2099c85ac23889f1808a4a48bb4da8de4838e3ad18f5e704f8451bca61a4`, it only lacks five `photographerUrl` fields and has the previous local review/check timestamps. Photo bytes, names, licenses, crop metadata, place coordinates and copy match. Copying the final manifest would make provenance consistent; no product identity defect was found. Public modern-architecture rights and human KK/EN review remain documented release limits.

## Source fingerprints at inspection

| Source | SHA256 |
|---|---|
| WalkApp.tsx | `10f0e1040d26ee8bab494a83465189636141f574e0e2f973a743c482f0d6b217` |
| WalkExperience.tsx | `9bfd0f6e7becddc0533b8874f167d6d5f58482933337534b191479bd64bd0991` |
| DiscoveryApp.tsx | `ea41d6365b3efc2e9a9fd34ef6211ba1b7a94a7b3256576a6edf78a7ac08dbdd` |
| DiscoveryMap.tsx | `9892e6675d0d5641561d8b2ebd0f250f490d185b1145c14335775c3b8d020347` |
| context.ts | `382078d21eb8e183d9633e183deb29cbae3f6719207a66dcd79b42a0c045470c` |
| useDiscoveryContext.ts | `b03a686469073b0fa386594e871fca1c1fca158bc5e405857c09626fbc506180` |
| canonical/session.ts | `9841e186869bd46a6f1c52b7300e903e8eb965daca3ad942f974ec0a7be23189` |
| canonical/schema.ts | `44ac5d92a7d686970de5fb1f90123c6be64c6b6b28b79b6b61b8f12cde224cd8` |

No speculative P1, actual field traversal, audible playback, device rendering or complete focused-release acceptance is claimed.
