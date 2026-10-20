# Discovery context0.5.1: independent review and bounded fix

2026-10-20. Scope: focused user flow, actual discovery context/hook/UI, existing tests and official holiday sources. No narration/native/version/shared Canonical edits. No paid API, purchase, device action or real weather API call. Root authorized the bounded P2 fix after the read-only finding.

## Finding closed in source

P2: following an offline/timeout/aborted attempt, `DiscoveryWeatherClient.load` correctly keeps its30-minute request budget, but the public UI advised refreshing and left Refresh enabled without explaining that the next request was blocked. Repeated taps silently produced the same unknown state, including after connectivity returned.

`context.ts:178` now exposes the fixed `nextAttemptAt` in the public WeatherRead. `useDiscoveryContext.ts:54–64` projects remaining whole minutes into localized `refreshHint`/`refreshDisabled`; its Refresh callback also refuses an early invocation without replacing a manual choice. `DiscoveryHome.tsx:55–57` visibly shows the cooldown/manual fallback and disables the affected button. The existing local minute tick/resume read enables it when the budget expires; this does not trigger a network request. The30-minute policy, failure/timeout/cancellation accounting, shared RAM cache and no-background-request behavior are unchanged.

Two public regressions first failed behaviorally (undefined nextAttemptAt; undefined refreshDisabled), then passed. Client test proves fixed deadline across failed attempts and no automatic retry at expiry. Actual-hook test proves30min→1min→enabled, usable manual rain choice, ignored early Refresh without replacing that choice, exactly one explicit retry after expiry, and RU/KK/EN explanation. Hook harness is a recording React/AppState/timer boundary, not an Android renderer.

## Calendar and recommendation review

Current implementation uses Astana UTC+5 independently of phone timezone. Existing public tests confirm upcoming Republic Day before local midnight and same-day status after `2026-10-24T19:00:00Z`; transferred26October is not invented as a second holiday/event. Calendar coverage is explicitly2026 only, with an unavailable-year message rather than extrapolation into2027. Same-day/upcoming explanations disclaim unconfirmed events and venue hours.

Independently reopened the [official2026 holiday table](https://www.gov.kz/article/33969?lang=ru): its selected dates and27May Kurban Ait agree with the bounded implementation. The [official government Constitution announcement](https://www.gov.kz/org/maslihat-aksuat/press/news/details/1183356?lang=ru) states the annual15March date and1July entry into force; March15 is not a mistaken copy of August30. This review does not interpret employment-law entitlements or promise past/future production-calendar completeness.

Public tests confirm snow/rain/cold/wind take priority over sunshine, including clear minus20°C and40km/h wind. Invalid units/ranges, unrelated city, future>10min and past>90min cannot become current weather; aged data lose weather ranking, while manual presets contain neither invented temperature nor live-provider attribution. Current data show model date/time/source and warn that the city-centre model is not a forecast for an entire future walk. All current discovery visits remain outside-only with unknown hours and no guaranteed shelter. No fabricated festival, live event or open venue was found in the reviewed current flow.

## Verification and limits

- `node --test tests/discoveryContext.test.cjs tests/discoveryContextHook.test.cjs`:22 PASS,0 skip.
- `node node_modules/typescript/bin/tsc --noEmit` from apps/mobile: exit0 after Root's shared Canonical first freeze.
- Scoped `git diff --check`: exit0.
- Production changes limited to four discovery source files and two existing context test files. No new library, timer-driven fetch, data persistence or personal coordinate input.

Remaining limits: actual updated countdown/rendering/HTTP on Android has not been checked; the countdown uses the existing local minute tick (and refresh on foreground), not a second-by-second clock. Weather/holiday ranking remains discovery-level; the prepared guided route is still the existing fixed request described in the separate planning-gap audit. Current sources do not guarantee field passage, indoor opening or weather for a whole walk. No additional confirmed P1/P2 remained in this bounded context review.

Frozen source SHA256:

- context.ts `55060e2710abb1ec417137c8774d5bcc27b240aadd16ef42fc898fc9c7b576ee`
- useDiscoveryContext.ts `5a0f4fe81fd7e8e3d2c06aa9dd1185208b43b81104df0838345d594e33466bed`
- types.ts `f624cff64fcc20d8ec6a14ff4c61ce09601eedea77750471b41e26d78b53646d`
- DiscoveryHome.tsx `4d1819cab6f260b874a21f86c924fea881167cf846b3ad5a74297fcc0a462686`
- discoveryContext.test.cjs `4427e1d79ae3ec77461cdfd65aa3dc8054980a7d23fd2d040be1c4bd42ca89f5`
- discoveryContextHook.test.cjs `2e8c4330af9fec0aca8e29351b3ea823101b968417dffe8511eeb2006b666be7`
