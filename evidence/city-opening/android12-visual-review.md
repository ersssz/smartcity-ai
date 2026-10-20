# Independent Android 12 visual review — 0.3.2 / code 7

Reviewed only the actual settled device screenshot `outputs/AstanaAI-city-opening/device/android12-code7-river-after-opening.png` using `view_image`.

- Screenshot SHA-256 independently matches `e86a2a3b879591e1a9d1965c0a8d443f130e127d29a1335d910f6f176bec3976`.
- The highlighted river is prominent and continuous across the shown city overview. “Есиль (Ишим)”, “ПРАВЫЙ БЕРЕГ”, and “ЛЕВЫЙ БЕРЕГ” are fully visible, readable, and do not collide with one another or the bottom sheet.
- The large map remains the dominant visible surface. The compact sheet occupies approximately one third of the useful application area, excluding the Android status and navigation bars; its handle and “Развернуть карточку” affordance are visible.
- The “Вернуться к прогулке →” CTA is fully visible and separated from the Android three-button navigation bar by a visible light gap. No CTA/system-navigation overlap is visible.
- A circular replay icon is clearly visible between “Обзор города” and “Улицы”. The OpenStreetMap attribution is readable above the sheet.
- The introductory paragraph is only partly visible in the compact sheet; its lower line reaches the fixed CTA region. The screenshot does not establish full-paragraph access through expansion or scrolling.

This static image confirms the settled appearance of the shown river stage on code 7 only. It does not prove opening animation smoothness, replay operation, touch interaction, sheet expansion, scrolling, or the geographic correctness of bank assignments. Previous code 5/code 6 visual acceptance was not carried forward. No device events, source edits, network calls, or paid API calls were performed for this review.
