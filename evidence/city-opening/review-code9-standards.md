# Standards review · 0.3.4 / code9

Reviewed the working-tree delta against `a3cc82e788a5d02857b6090ffb7b36c572b95a56` on 2026-10-20. This is a source review before new device acceptance, not a review of an installed code9 APK.

## Standards and result

`AGENTS.md` is the repository's applicable implementation standard; no separate `CONTRIBUTING.md` or `CODING_STANDARDS.md` was found. The installed code-review skill's Fowler smell baseline was also considered as judgement guidance. **No blocking standards violations or actionable new smell findings.**

- `App.tsx` owns the launch claim in a stable ref and `useCallback`, before the diagnostics branch. A diagnostic remount of `WalkApp` cannot claim a second launch. The claim is process/UI lifetime state, not persisted progress.
- `WalkApp.tsx` claims only after native Stop, audio cleanup, repository acquisition, locale loading and successful walk restore. Errors retain the retry/error path. City visibility is chosen before publishing the restored snapshot, without introducing a route-map render between these synchronous state updates. Foreground AppState events do not rerun this gate.
- Existing repository restoration still pauses an active restored session and retains its stops, answers and discoveries. The delta adds no restart, deletion, migration, location request or collection mutation. Explicit city browsing continues to stop acquisition/audio before opening and does not request the opening choreography.
- `CityIntro.tsx` uses `playOpening` consistently for initial stage, curtain, label visibility, interface opacity, caption opacity and camera framing. `replay` retains the return-to-walk CTA role. The persistent native map container still has `collapsable={false}`. The choreography and its cleanup are unchanged in this delta.
- The obsolete first-introduction policy and its obsolete assertions are removed. SQLite viewing-marker persistence and failure tests remain. Dependencies, native permissions, package identity and provider configuration are unchanged.
- Package, both lockfile version entries, Expo and Android metadata agree on `0.3.4`; Android versionCode is `9`.

## Verification and limits

Independently ran strict mobile TypeScript (`tsc --noEmit -p apps/mobile/tsconfig.json`) and `git diff --check` on the changed source/test files: **PASS**. Inspected the recorded seven targeted tests; that record is not an independent rerun by this reviewer.

Source inspection cannot establish cold-launch motion, absence of a native flash, TalkBack behavior or retained state on an installed code9 build. A new installation and cold-launch recording remain required; prior code8 footage is not code9 acceptance. No phone, network, paid service or source mutation was used for this review.

## Final recovery delta

Rechecked final `WalkApp.tsx` SHA256 `b2a2fc9fcd8b6469150e72256c63978f4e564a70e63bee603dc1d03800ebec4e`. The stable `chooseCityEntry(phase)` callback now shares the launch claim between successful load and an explicitly confirmed recovery restart, after Stop/audio/repository/locale operations succeed. Both callers guard mounting before choosing and publishing. A normal subsequent restart cannot replay the opening because the App claim is already consumed. Its dependency keeps the load lifecycle stable. No additional standards findings; runtime limitations above remain.
