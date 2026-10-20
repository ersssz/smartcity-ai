# City opening: Standards and lifecycle review

Result: **PASS at source level; no remaining blocking finding.** Native rendering, frame pacing, TalkBack behavior and physical interaction are separate device acceptance items.

Reviewed the 0.3.2 / Android code 7 working delta against `16701a153e34621828b84ee29d08d1f68c4d3c59`, including the new, initially untracked `CityOpening.tsx`. Standards source: root `AGENTS.md`; relevant existing startup/persistence/native-control behavior and the installed MapLibre Camera/Map implementation were read. Zero spending, no network requests, no phone interactions and no changes to source were performed by this reviewer.

Frozen UI files reviewed (SHA-256):

- `apps/mobile/src/features/city/CityIntro.tsx`: `f2ff1e780c5e442727b3115817109ab1b663a2f6502ceefe8ae69bb7530980a8`
- `apps/mobile/src/features/city/CityOpening.tsx`: `627d7b92062f1976f25709fd89b4f01edf64e4708e0d81cbaf46920b4f047ce2`

## Findings

No documented-standard breach or actionable baseline smell was found in this bounded change. The separate opening module contains the curtain sequence, timers and lifetime guards; `CityIntro` retains map interaction and existing sheet behavior. Dependencies, native permissions, application ID, GPS handling, walk progress and the SQLite seen marker are unchanged. The package/lock/app/Gradle changes are version-only. Root is updating implementation-status evidence separately.

## Lifecycle and rendering checks

- Both accessibility probes finish before automatic motion starts; probe failures choose reduced motion/manual reader behavior. Reduced Motion or ScreenReader chooses an explicit button and stable content. A later preference change cancels the old sequence and settles an already revealed map.
- The native Map surface is not scaled or faded. The paper panels, greeting and UI wrappers use native-driver opacity/transforms. The sheet height remains a distinct non-native-driver animated value on its inner wrapper; it is not attached to the native opacity graph.
- Map camera calls are gated on native full-render readiness. The opening waits for readiness, has a five-second bounded fallback, and remains skippable. Late readiness after Skip is settled with a zero-duration fit.
- Timers are owned by a set and removed when fired or cancelled. A generation token, mounted and done guards prevent stale sequence callbacks. Readiness and parent callbacks are held in refs, so ordinary parent renders do not restart the sequence.
- Backgrounding cancels the child sequence immediately; returning restarts only an unopened greeting or settles an already partly opened map. Cleanup stops child values/timers and removes its AppState listener; parent cleanup stops its separate values.
- Background map/chrome/sheet are hidden from accessibility and pointer interaction while the opening is modal. Skip remains an accessible button; Android Back reaches the same settled state. The explicit replay action resets only ephemeral city UI state.
- The existing first-launch gate and `openCity` stop/pause path are unchanged: existing active, restored and completed walks keep priority, and no progress or preferences are erased to replay.

## Independent checks

- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` from `apps/mobile`: PASS, exit 0.
- `git diff --check 16701a1`: PASS, exit 0. Git printed its existing CRLF-to-LF normalization notices for three JSON files; no whitespace error.

These checks do not establish smooth native motion, duration as perceived by the user, TalkBack focus/announcement quality or background/resume behavior on a real phone. Capture and inspect native playback before accepting the visual result.

## Final adjacent fix recheck

**PASS** after the Spec-review annotation fix. Final `CityIntro.tsx` SHA-256 is `9fad8b48cdbcb05aca0391a58de1d99012830e375cc03845c6b4ca24ce825b43`; `CityOpening.tsx` remains `627d7b92062f1976f25709fd89b4f01edf64e4708e0d81cbaf46920b4f047ce2`. These supersede the initial CityIntro hash above.

Both bank labels and the river label now mount only when `openingLabelsVisible` becomes true. Their ViewAnnotation children are static opaque Views, avoiding Android's invisible cached annotation bitmap when a native-driver child opacity starts at zero. The gate resets on explicit replay and opens on UI reveal or settled Skip/finish. `finishOpening` now sets `snapNextFit` before leaving the modal, so its final camera effect uses duration zero rather than starting an unnecessary second 850 ms transition. This local delta leaves the previously reviewed lifecycle, persistence and permission paths unchanged. No source or device actions were performed for this recheck; native playback acceptance remains pending.
