# Spec review — first editorial walk

Compared the working tree, including untracked files, with `7487404e9d774280110ae3f840f81cdb670383af`. Scope: `docs/FIRST-EDITORIAL-WALK.md`, relevant PRODUCT-SPEC US/AT, domain, persistence, priority Stop, integration and map UI. Declared-open T04/T14/full-beta capabilities are outside this prepared slice.

## Findings and resolutions

1. **Resolved P2 — Saved discoveries hidden after restart.** FIRST-EDITORIAL-WALK:15 promises “открытия сохраняются без повторной выдачи той же награды.” WalkApp now passes persisted discoveries independently of the current session, and the journal renders them with manual provenance. SQLite uniqueness and restart persistence pass real-database tests.

2. **Resolved P2 — Completed chapters unreadable.** PRODUCT-SPEC:239 / AT-10 requires “материалы доступны для повторного чтения.” Completed sessions can switch from journal to map/chapters. Chapter text, sources and audio remain available; progression controls stay disabled. No restart is required to read again.

3. **Resolved P2 — Pending speech could begin after Stop.** FIRST-EDITORIAL-WALK:26 requires “немедленная отмена GPS/звука и последующая сохранённая пауза.” Speech captures its generation before awaited cleanup and afterwards checks cancellation, Stop, mount and AppState. Priority Stop cancels native/audio immediately and persists pause after the pending operation. Native acquisition remains visibly active, with Stop available, when status is error but subscription/foreground acquisition remains.

4. **Resolved P2 — Repeated pin taps could not reopen the sheet.** The map requirement (FIRST-EDITORIAL-WALK:9: “Полноэкранная карта остаётся фоном”) now has a persistent full-screen MapLibre map, route, pins, local search and collapsible bottom sheet. Pin activation uses `onPress`; installed Android MapLibre emits this every tap, unlike selection-only `onSelect`. Ready pins open place previews. Saved awards, manual quests, explicit return confirmation and completed rereading remain accessible.

## Final source verification and limits

No remaining source-level Spec blocker found. Independent full mobile `tsc --noEmit`: **PASS**. Mobile public-interface suites: **33/33 PASS**, including actual catalog SHA256 `4c361722fd6eefc31488431ca84e8bf9fe17fa09b83d193256381512ba86422b`. Reviewed UI SHA256 `ecef646c0b57147b896b58a88dd3fcbb8542d5e257038d930fbceab94af9508e` and WalkApp `c868ea8688b742c1972e04aa02cd4628c5340188cc35989f32f32e1862ecd7fc`.

This is source/test acceptance. New APK layout, touch/drag/search/dialog behavior and lifecycle still require actual device verification. Route field access, GPS accuracy/battery, human translation review and prepared audio/offline acceptance remain open. No source edits were made by this review.
