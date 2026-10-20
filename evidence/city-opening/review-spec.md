# City opening specification review

2026-10-20. Fixed point: `16701a1`; reviewed the working-tree delta, including untracked `apps/mobile/src/features/city/CityOpening.tsx`, rather than relying on the implementation report. No source/device/network operations were performed; only this report was written. No purchases, APIs, keys or installs.

## Resolved finding

**[P1] Keep bank/river annotation bitmaps visible after the reveal.** `CityIntro.tsx:315-324` changes the three static `ViewAnnotation` children to `Animated.View` with `opacity: introUi`. On a new opening that value starts at zero. The installed MapLibre Android implementation captures annotation children into bitmaps and refreshes them on layout-size/position change or an explicit `refresh()`; changing a child opacity with the native animation driver does not refresh that image. Consequently the first render can cache transparent left-bank, right-bank and river-name labels and leave them absent after the map opens. This undermines the requested introductory explanation of the river and two banks. Evidence: installed `ViewAnnotation.tsx:148-169` documents the bitmap/refresh behavior; `MLRNPointAnnotation.kt:165-205` refreshes on geometry-changing layout, and `:446-448` exposes explicit refresh. Keep these bitmap children static/opaque, or mount/remount them at a settled reveal point. Do not rely on opacity animation inside the Android bitmap annotation.

**Resolution independently rechecked:** final `CityIntro.tsx` uses `openingLabelsVisible` to mount all three annotations at the UI reveal or final/skip settlement; their children are static opaque `View` elements. Replay clears the boolean before opening, so a new reveal creates fresh bitmap-backed labels. Final settlement enables labels for skip, Reduce Motion/manual continuation and interrupted-opening paths. No animated annotation child remains. The prior P1 is resolved at source level.

Reviewed final SHA256: `CityIntro.tsx` = `9fad8b48cdbcb05aca0391a58de1d99012830e375cc03845c6b4ca24ce825b43`; `CityOpening.tsx` = `627d7b92062f1976f25709fd89b4f01edf64e4708e0d81cbaf46920b4f047ce2`. Both hashes were independently read from the final files.

## Other inspected requirements

- Paper curtains animate over a stable native map; the map view itself is not scaled/transformed. The approach starts after native full-render readiness and the greeting gate. The opening frame is only 8% larger on each side; the urban overview and unchanged source geometry are preserved.
- Skip/system Back settles the final state and requests a zero-duration camera fit, including the case where map readiness arrives later. A five-second readiness watchdog prevents an automatic opening from waiting indefinitely. Reduced Motion and screen-reader users get explicit manual continuation after both accessibility probes complete.
- Timer and animation cancellation, generation checks and background handling guard stale opening callbacks. Returning after a partly revealed opening settles it rather than replaying over an already moving map. The replay action creates a new opening and leaves walk progress/persistence untouched.
- Compact card sizing, handle-only gestures, bounded body scroll and fixed CTA from 0.3.1 remain intact. Map pointer input and city accessibility descendants stay gated until the opening finishes.
- Final settlement now sets `snapNextFit.current = true`; the ordinary effect settles to the same target with duration zero instead of issuing a second 850ms animated fit. Annotation mounting changes neither camera dependencies nor target bounds, so it introduces no additional competing camera effect.

## Acceptance boundary

Final source specification review: **PASS, zero unresolved blocking findings**. This report does not accept Android animation smoothness, native camera motion, rendering/annotation labels, gestures or lifecycle transitions. A real new-APK recording and final screen inspection remain required; prior-version screenshots do not establish these properties.
