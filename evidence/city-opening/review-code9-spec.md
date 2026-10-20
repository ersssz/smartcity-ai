# Independent specification review: automatic entry, code 9

2026-10-20. Compared the actual working-tree delta against `a3cc82e`, including `App.tsx`, `WalkApp.tsx`, city preferences/tests, `CityIntro.tsx` and version metadata. Read-only source review; only this report was written. No device, network, installation, secret, API or payment operations.

The latest user instruction requires the opening automatically on app entry. That supersedes the former once-only/ready-phase introduction policy, so removing that obsolete predicate and its assertion is appropriate.

## Resolved finding

**[P2] Run the pending launch gate after successful corrupt-progress recovery.** A cold `load()` that reports `CORRUPT_PROGRESS` correctly leaves the App launch claim unused. However, the explicit confirmed `restart()` recovery publishes its new snapshot directly and does not run the launch claim/entry selection. The first successful entry after that recovery therefore opens `WalkExperience` without the automatic opening. Ordinary Retry routes through `load()` and does not have this gap. Reuse the pending launch-entry decision when successfully publishing recovered initial progress; do not reset or reopen a launch whose App claim was already consumed.

**Resolution independently rechecked:** final `WalkApp.tsx:70-77` extracts stable `chooseCityEntry(phase)`, called after successful ordinary load and after confirmed recovery restart/native Stop/audio/locale work. Both callers check the component is still mounted and choose entry before publishing the snapshot. If the App lifetime claim was already consumed, an ordinary later restart does not replay the opening. The original P2 is resolved at source level. The helper depends only on the stable App callback, so it does not repeatedly rerun the load effect on snapshot/locale changes.

## Main-path review

- App owns the synchronous lifetime claim in a stable ref/callback. It survives the diagnostics branch and a WalkApp remount; a fresh App mount can claim again. WalkApp does not claim before confirmed native Stop, audio cleanup and successful saved-data load, or after an unmount.
- Failed native Stop, storage failure and ordinary Retry leave an unclaimed opening available for a later successful load. AppState foreground handling refreshes native state and does not call `load`, so ordinary background/resume does not trigger the entry gate again.
- Entry selection and locale are committed before publishing the first walk snapshot, avoiding an intervening route-map view. `playOpening` independently controls greeting/river-stage initialization while `replay` controls return wording, so paused/completed saved sessions can animate without being replaced by a new walk.
- The existing repository remains responsible for restoring active persisted sessions paused; the introduction changes do not create a new session or reset answers/discoveries. Manual city browsing still confirms native Stop first and uses `playOpening=false`.
- The permanent `collapsable=false` native map parent, static bitmap annotation children, compact card and prior accessibility/skip behavior remain intact. `CityOpening.tsx` is unchanged. Versions consistently identify 0.3.4/code 9; no dependency/permission expansion occurred.

## Evidence boundary

Final source specification result: **PASS, zero unresolved blocking findings**. No code 9 APK or real automatic-entry animation was accepted by this review. Device launch, resume, saved-progress return and uninterrupted map surface remain runtime gates.

Initial reviewed SHA256: App `2efbcc99cbdbb52a1aee5f460f9289bdf0a5f53413d0659dd09d1f4b3f5e47c3`; WalkApp `008c4c58d2c0d419bf248022b9d4d247953baaabc5edcadf5f81bc1d7f443b57`; CityIntro `4bfd60d3eee64c0b616cf576be3b147caf1dffd2f18170c62d4e3f0460c47d85`.

Final SHA256 independently verified after the resolution: App unchanged `2efbcc99cbdbb52a1aee5f460f9289bdf0a5f53413d0659dd09d1f4b3f5e47c3`; WalkApp `b2a2fc9fcd8b6469150e72256c63978f4e564a70e63bee603dc1d03800ebec4e`; CityIntro unchanged `4bfd60d3eee64c0b616cf576be3b147caf1dffd2f18170c62d4e3f0460c47d85`.
