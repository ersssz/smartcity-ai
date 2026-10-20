# Independent native visual review — final code 9 cold launch

## Scope and inputs

Read-only visual inspection of the actual native-device chronology `outputs/AstanaAI-city-launch/device/android12-code9-launch-sequence.jpg` and source frames `work/city-launch-sequence/frame-07.png`, `frame-08.png`, `frame-09.png`, `frame-10.png`, `frame-11.png`, and `frame-15.png`. Root identifies this as a package cold restart and automatic opening, with no human replay. I did not operate the phone or initiate events.

The source recording is `outputs/AstanaAI-city-launch/device/android12-code9-cold-launch-20261020T123800Z.mp4`. Its SHA-256 was independently read and matches `552320af9ff121c993f637cfc050af9fde3d4c4d403560fb20e129a825d36086`.

## Observed sequence

- At the chronology's 0 s and 1 s samples, the application shows its loading presentation with “AstanaAI” and “Открываем Астану…”. These samples precede the map reveal.
- At 2 s, the greeting “Добро пожаловать в Астану!” is fully visible with the monogram, introductory copy, and “Сразу к карте →” affordance.
- At 3 s, a central horizontal portion of the map and river is visible while the upper and lower greeting surfaces are still partway through their transition. The greeting text is faded at this intermediate stage.
- At 3.5 s and 4 s, the coloured map and continuous blue river fill the revealed surface. Changes in map framing are visible between these samples. The regular header and lower information sheet are not yet shown; the map itself is present.
- By 4.5 s, the normal city header, controls, bank labels, and compact lower sheet are visible. The 5 s and 7 s samples retain this settled composition.

## Settled interface findings

- “ПРАВЫЙ БЕРЕГ”, “ЛЕВЫЙ БЕРЕГ”, and “Есиль (Ишим)” are fully legible without mutual overlap or clipping in the inspected settled frames.
- The map remains large above the compact sheet. The circular replay control, “Обзор города”, and “Улицы” controls are distinguishable.
- The “К первой прогулке →” CTA is fully readable and separated from the Android three-button navigation bar by a visible light gap. No CTA/system-navigation overlap is visible.
- OpenStreetMap attribution is readable above the sheet.
- The introductory paragraph remains only partly visible in the compact sheet. These frames do not establish whether expansion or scrolling exposes the rest.

## Result and limits

**PASS for the inspected native chronology samples:** greeting → partial curtain reveal → full map with changed framing → settled city UI. No blank map after reveal is visible in the inspected samples, including 3.5 s, 4 s, 4.5 s, 5 s, and 7 s. This independently supports the shown sequence on code 9; earlier code 7 or code 6 acceptance was not carried forward.

This is a sampled-frame review, not a frame-by-frame playback or timing analysis. It cannot exclude a brief blank or stutter between the sampled times, establish 60 fps, prove subjective smoothness, verify replay/touch/scroll behaviour, establish TalkBack accessibility, or serve as physical-field acceptance. Root's separate per-coded-frame river-presence analysis is outside this visual review. No source changes, device events, network requests, or paid API calls were performed.
