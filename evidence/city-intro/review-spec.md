# City introduction — independent Spec review

Reviewed on 20 October 2026 against base `bd86d8ffcc5b32df632f7b3ad1783f2380f0367f`, including new untracked city files. Authority: the user's latest welcome → city overview → river/two banks → interactive districts request, plus repository AGENTS.md and the relevant archived product/domain decisions. This is a source review, not Android visual or field acceptance.

## Final result

**No remaining source-level Spec blockers.** The initial P2 bootstrap ordering finding is resolved: `apps/mobile/WalkApp.tsx:77–84` now awaits the city preference and decides whether to show the introduction before publishing the first walk snapshot. The render remains in its loading state until this decision. The preference-error fallback still fails open to the walk, and active/paused/completed progress retains priority. This satisfies the source ordering requested by «пользователь заходит и появляется плавный надпись ... потом плавно открывается карта города». Actual animation timing still needs device observation.

## Implemented requirements

- Exact RU welcome, gradual text entrance/map reveal, explicit skip, reduced-motion handling and a screen-reader exit.
- Fullscreen native map with six separate real OSM district geometries; tap/chip selection, gradual highlighting, camera fit and short localized district descriptions/editorial suggestions.
- Correct Esil/Ishim **river**, two bank labels, distinction between banks and administrative districts. No invented lake, traced screenshot geometry or claimed legal cadastral precision.
- Separate persistent intro preference, explicit city replay, native GPS/audio stop before replay, no walk reset or fabricated six ready walks.
- Saved outline works without street tiles; optional public street backdrop is honestly labelled as online. No new packages, secrets or paid calls were used by this review.

## Evidence and limits

Three actual Node SQLite preference tests and five synthetic geometry tests passed. An independent read-only producer replay matched all three generated geography/metadata objects. The final guide (`ab268cd5d2e78a935b7981bd9a8e65e74654342df3a11f51b2bbaa6c1c79c532`) matches its reviewed content, six districts, 15 sources and four provenance SHA256 values. All ten documented POI reference points independently fell uniquely within their expected bundled districts; this confirms those points, not entire POI footprints, entrances or legal boundaries. Visible map attribution and district-label remount keys for locale/selection are present. Repeated GOV.KZ page opens timed out, so this reviewer relies on the documented content-author primary-source checks rather than claiming a fresh independent factual reread. Android animation quality, actual hit targets/gesture behavior, font scaling and offline device behavior remain device-acceptance work; the not-yet-built APK is not a source defect.
