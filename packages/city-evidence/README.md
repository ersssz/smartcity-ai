# CityEvidence: bounded, sourced city search

Public Interface: `createCityEvidence(catalog?: unknown): CityEvidence`, then `await evidence.search(query)`. Query/result schemas are owned by `packages/contracts`; this package does not redefine them. The optional catalog is an injected Adapter for catalog replacement and synthetic contract-edge tests. The default is an offline-produced catalog from the real 20-card OSM sample and three separately curated public observation anchors.

This Module hides source normalization, dated field evaluation, multilingual lexical matching, mandatory filtering, ranking and referential closure. Runtime search has no filesystem, network, key, GPS capture, generation or payment operation. It is useful local evidence retrieval; it is not hosted-backend or runtime-RAG acceptance.

## Search behavior

- Apply area and mandatory conditions before ranking and the requested limit (maximum 24).
- Search actual names and explicit aliases across RU/KK/EN, with Unicode case normalization and bounded prefix matching. No language model or guessed property is used. Unsupported query shapes fail with a generic error without echoing input.
- With terms, require matching lexical tokens; interests rank the matching records. With interests alone, return relevant categories. With neither, browse real records in the requested area after filters; no fabricated default recommendations are inserted. An unknown zone or unmatched terms returns no POIs.
- A missing localized name displays the original sourced proper name. This is a display fallback, not an invented translation; coverage limitations state that linguistic review is pending.
- Dated expired known fields become `stale`; future observations become `unknown`; existing unknown/stale/conflicting states remain distinguishable. Critical indoor/coffee/step-free filters require current positive evidence. A public observation anchor is distinct from a building center, entrance or field-certified route.
- Only selected POIs and their referenced facts/anchors/sources are returned, together with the relevant dated context. Each result is independent from subsequent queries/caller mutation.

The query has an `at` instant but no visit duration: search can exclude a venue not open at that instant; WalkPlanner must still validate the entire arrival-to-departure interval, legs/connectors, reserve, current constraints and chosen end. Stop accessibility evidence does not certify a step-free route.

## Real source and curation

Inputs are hash-pinned `data/curated/poi-bayterek.json`, `apps/mobile/src/walk/preparedWalk.json` and the retained first-walk routing witness. The source sample contains 20 cards selected from 247 imported bbox records, not a complete city catalog. Its current structured schedules and verified entrances are absent. No open cafe, warm indoor replacement or accessible route is inferred.

`fixtures/curation.json` explicitly records the three place-to-anchor associations from prepared editorial candidate keys and official identity/content sources. It does not select a nearest OSM node or equate a building center with an entrance. The Baiterek card remains its existing OSM place; Nurzhol and Round Square use clearly curated place IDs. Anchors retain `fieldVerified:false`. Current access/indoor/opening evidence remains unknown.

Source `checkedAt` preserves date-only precision where that is all the editorial record contains. Precise OSM acquisition timestamps remain precise. Seven-day snapshot field freshness follows the existing T02 ingestion policy; it is not a promise of current access. Weather and dated holiday exceptions remain unknown until actually supplied.

`tools/build_catalog.py` produces `src/catalog.generated.ts` locally from those inputs. It refuses a source hash change rather than silently blessing a new dataset. No downloads or dependencies are installed. Root owns integration, dependencies and contracts.

The evidence revision hashes prepared content plus the explicit curation/source pins. Running `python -B packages/city-evidence/tools/build_catalog.py --check` from the repo root verifies the exact prepared output without writing it. Constructor checks reject broken references, duplicate identities and credential-bearing source URLs. The injected local catalog is bounded to 5,000 POIs, 10,000 anchors and 30,000 facts/sources; larger stores need a different Adapter behind the same search Interface.

Dated calendar exceptions remain in `context.calendar`; the original ordinary `poi.opening` provenance is not overwritten. A positive dated exception can admit a POI whose ordinary interval is closed. WalkPlanner must apply that exception to the complete visit interval, and conflicting exceptions cannot support a critical promise. Unknown calendar data does not manufacture a holiday closure.

## Verification

Tests cross only `CityEvidence.search` / construction and its shared result schema. Actual-card tests exercise known aliases, coverage, geometry, provenance and honest no-match/critical unknowns. Clearly labeled synthetic catalogs exercise filter-before-limit, stale/conflicting evidence and referential closure. They do not claim live provider or field verification.

Run from the repository root: `node --test packages/city-evidence/test/*.test.cjs`. The test loader uses the already installed mobile TypeScript and existing contracts dependencies; it installs nothing.

The source-local handoff passed 19 public search tests, strict TypeScript and two identical read-only builder replays. Exact hashes and scope are in `evidence/verification.json`. No APK/device, hosted backend, live weather, runtime generation or field acceptance is claimed.
