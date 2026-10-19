# T02 — data and pedestrian routing spike

Task base: `cbea535fb7b655e5830ad9a3c46aabfd6d88753f`; branch `codex/t02-city-data-routing-budget-gate`. Windows desktop, 2026-10-20 (UTC evidence dates may be 2026-10-19). **Review-ready scoped research result; complete T02 acceptance remains PARTIAL/BLOCKED below.** No Android, shared contracts, migrations, dependency lockfiles or archived plan edits. Final HEAD and bundle hash are delivered through the authorized relay/status, not inferred from this document.

## Gate status

| Gate | Result | Evidence / remaining acceptance |
|---|---|---|
| Public POI ingestion | PASS for bounded import | 20 real sourced cards delivered from 247 located records in one Astana box; IDs, coordinates, UTC, source hashes, ODbL, unknowns and dedup coverage. Raw/whole catalog excluded from Git. See INGESTION.md. This does not accept editorial/field quality. |
| Critical field uncertainty and hours | PARTIAL | Unknown entrance/access/open-at-ETA remain explicit. Real institution/tourism summer closing-rule disagreement; October closing claims agree. Effective year, weekdays and holiday exceptions remain unknown. See HOURS.md and curated observations. |
| Local pedestrian topology | PASS for technical probe / overall routing PARTIAL | All 10 declared technical expectations met on the real full snapshot: six foot legs and four deliberate refusal cases. Source-based recorded replay is also tested. No hosted foot adapter, verified outdoor POI entrances or actual GPS connector acceptance. |
| Actual GPS start/end/return, lawful hosted adapter | BLOCKED | No phone/current GPS, verified free ORS account, accepted privacy terms for exact endpoints or proven connectors. No coordinates sent to routing APIs. |
| Managed pgRouting deployment/resources | BLOCKED | No verified free Supabase project supplied. Local pathfinding is not the required managed SQL deployment, <=300 MB graph/index or <=400 MB total DB measurement; no SQL p95/timeout or logging proof. |
| Offline licensing | PARTIAL | Published OpenFreeMap rights/limits and native capability documented in PROVIDERS.md. No pack built: size/time/complete assets and Android UA/concurrency/byte trace NOT MEASURED. Standard OSM raster tiles not downloaded. |
| Backend availability | BLOCKED | Published free tiers documented; actual Workers/Supabase accounts, quotas, restore and continuous operation unverified. |
| RAG | BLOCKED / PENDING | No proven no-charge generator entitlement. Zero model API calls. The 30-case RU/KK/EN quality/latency probe was NOT RUN; no product generation claim. |
| Spending/privacy constraints | PASS for performed work | Only public documentation/data and local tools; no purchases, paid APIs, secrets/account hunting, billing, deployments or paid builds. No Windows-MCP/SSH/Codex/protection changes. |
| GPS/hardware/field acceptance | PENDING | No real phone tonight. All code fixtures and public-node probes are labeled; no physical walk, museum entrance, winter passage or actual GPS evidence. |

## Local code and reproducibility

Public source: [Geofabrik Kazakhstan](https://download.geofabrik.de/asia/kazakhstan.html), [OSM licence](https://www.openstreetmap.org/copyright). PBF SHA-256 `9ad8e895d4703248b97a5d17e883e49dc58549305aa4ba6bd6661d247cb98bdb` independently rechecked by Root. Full extraction took 369.837 s plus 13.709 s for 32 linear barrier ways. Augmented source SHA-256 `e3db0146acb00e261bbbe2c02ec36a330054d87a25b02af7783aa0e386e01c01`. The technical graph has 24,356 walk nodes, 5,904 accepted ways and 256 blocked segments. These serialized/local figures do **not** measure PostgreSQL size/indexes or SQL latency.

Root independently checked every delivered card ID/name/coordinate/time/license against the augmented source; 20/20 matched. Sample SHA-256 `8526ee65b745d9eb007ee7cb594af004dc80dd1c0008d7732de372b34d56d033`. The coverage object describes the 247-record pre-sample catalog and `selection.selected_cards=20` describes the actual payload. Zero repeated IDs and zero nearby equal-name candidates were found; this heuristic is not proof of exhaustive entity resolution. Six graph-only records without coordinates are quarantined. Critical entrance/accessibility/current-hours remain unknown. See [INGESTION.md](INGESTION.md), [HOURS.md](HOURS.md), [PROVIDERS.md](PROVIDERS.md).

The research Interface is separate from the Root-owned mobile contract. `WalkingGraph(document).route(start_node_id, end_node_id)` returns a technical path only over mapped node topology. `route_points` requires exact unambiguous mapped public coordinates and otherwise requests clarification. It never draws a connector or silently changes an endpoint. This research CLI is not a production fallback or offline rerouting feature.

The profile rejects motorways/trunks, areas/indoor paths, conditional restrictions it cannot evaluate, unknown barriers, restricted nodes/ways and unsupported conveying. It honours foot-specific direction and access, ignores a car-only `oneway`, and never joins a geometric 2D intersection without a shared OSM node. A supplemental local barrier-way pass preserves continuous walls/fences sharing graph nodes; without an explicit permitted opening the shared node is blocked. Restriction relations are conservatively excluded rather than treated as supported turn logic. **Geometric obstacle intersections between a wall and path without a shared mapped node are not validated.** This is distinct from not inventing junctions. Remaining road centerline, sidewalk-side, grade/access freshness and boundary incompleteness limits prevent an accessibility/safety claim.

Commands from repository root (Python 3.12.7 stdlib tests; pinned ephemeral osmium exporter details in INGESTION.md):

```powershell
python -m unittest discover -s tests/data -v
python -m compileall -q tools/data tests/data
git diff --check
```

Full PBF acquisition/extraction/normalization commands and the pinned `osmium==4.3.2` environment are in INGESTION.md. After that import, run:

```powershell
python -m tools.data.probe_walking --source raw-data/walking-with-barriers.json --metadata raw-data/walking-with-barriers.metadata.json --pairs data/curated/walking-pairs.json --output evidence/t02/routing-results.json
python -m tools.data.curate_probe --source raw-data/walking-with-barriers.json --results evidence/t02/routing-results.json --pairs data/curated/walking-pairs.json --output data/curated/walking-probe-replay.json
```

Actual result: probe exit 0, `pairs=10, technical_expectations_met=10`. The 145-record, 25,457-byte attributed replay slice contains selected **real recorded source records**, not invented fixtures; alternate topology is removed. Its test needs no network/key/PBF, but it cannot replace the full-source probe or live acceptance. Source/output checksums and mode labels keep these experiments separate.

| Case | Technical result | Distance | Limitation |
|---|---|---:|---|
| P01 public footway outbound | PASS, way 112384548 | 383.82 m | Public mapped nodes, no real GPS/POI entrance |
| P02 return to identical P01 origin | PASS | 383.82 m | Exact original public node, not current GPS |
| P03 Seruen pedestrian bridge | PASS, way 263517343 | 151.24 m | North endpoint is retained way context ~105 m beyond selection box; river/current passage not field-verified |
| P04 reverse bridge | PASS | 151.24 m | Technical direction only |
| P05 mapped road crossing | PASS through node 652855975 | 9.20 m | Does not confirm signals/safety/current access |
| P06 mapped foot underpass | PASS, way 409009113, layer -1 | 78.83 m | Not wheelchair/winter/field evidence |
| P07 explicit private gate `foot=no` | PASS: unmatched/refused | — | No public route from restricted endpoint |
| P08 lift gate without foot permission | PASS: unmatched/refused | — | Unknown is not assumed open |
| P09 Bayterek building center | PASS: clarification | — | No invented entrance/connector |
| P10 public manual point ~0.07 m off-node | PASS: clarification | — | No silent snap, no consent inferred, not a GPS observation |

Six positive legs are foot-network paths; four negatives are expected refusals. This is **not** a claim of ten successful full walks. Loose distance ranges and mandatory mapped nodes/ways are technical plausibility checks, not measured field distances. No car route or straight connector is substituted. Per-case local timing is in routing-results.json; it is not managed SQL, hosted-provider or end-to-end planner latency.

Verification: **24/24 tests PASS** on MSYS CPython 3.12.7 and native CPython 3.14.4. `compileall` and `git diff --check` PASS. A CLI regression verifies UTF-8/LF exports so Git transport preserves the documented JSON checksums. Raw PBF/hash checks, real full-source probe and source/card cross-check are separate from synthetic and recorded-replay tests.

## Independent agents and review

- `/root/poi_ingestion`: public-source PBF ingestion, curated cards, provenance and ingestion tests.
- `/root/provider_evidence`: official routing/offline/budget sources; independent restriction/entrance review found ignored `foot:backward` and ignored linear barrier ways. Root reproduced both failing tests, corrected directional access/shared-node barriers, and added mandatory source enrichment. Re-review passed with the geometric obstacle limitation retained. No false center-as-entrance/current-open claims found.
- `/root/hours_evidence`: independent venue/tourism schedule-source comparison, season/freshness/unknown limits.

All received the zero-spending, no-secret-search, no-system-change and no-phone constraints. Their reports do not independently accept the complete T02 gate. Early pinned commit `61b68c75d0cf1632f0627f83932ff3e6cfd27b29` Standards review: 0 violations/actionable smells. Spec review: data/probe then pending, no scope creep/implemented-behaviour defect, one premature INGESTION artifact-reference sentence. Actual card delivery resolves that sentence; GPS/managed/offline/account/RAG acceptance is still open. Final data delta review will be recorded once pinned.

## Handoff

Root should review the research format before mapping it to CityEvidence contracts. Do not treat raw OSM names/centers/hours as verified entrances or current-open facts. Do not enable an account-dependent adapter until its actual free entitlement and privacy/resource requirements are proven. Preserve closed M2-TECH/current-origin and RAG gates. No citywide coverage is claimed.

`docs/IMPLEMENTATION-STATUS.md` is Root-owned and deliberately unchanged under the dispatch scope; this report is the scoped result to reconcile there.
