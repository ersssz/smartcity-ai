# T02 — data and pedestrian routing spike

Task base: `cbea535fb7b655e5830ad9a3c46aabfd6d88753f`; branch `codex/t02-city-data-routing-budget-gate`. Windows desktop, 2026-10-20 (UTC evidence dates may be 2026-10-19). This is a research/data delivery; no Android, shared contracts, migrations, dependency lockfiles or archived plan edits.

## Gate status

| Gate | Result | Evidence / remaining acceptance |
|---|---|---|
| Public POI ingestion | IN PROGRESS | Geofabrik PBF fetched and SHA verified; bounded local export running. Final counts below will replace this status. |
| Critical field uncertainty and hours | PARTIAL | Unknown entrance/access/open-at-ETA remain explicit. Real institution/tourism summer closing-rule disagreement; October closing claims agree. Effective year, weekdays and holiday exceptions remain unknown. See HOURS.md and curated observations. |
| Local pedestrian topology | PARTIAL | Conservative OSM graph and refusal of unsupported connectors implemented; synthetic tests are code evidence only. Ten public pairs pending bounded export. |
| Actual GPS start/end/return, lawful hosted adapter | BLOCKED | No phone/current GPS, verified free ORS account, accepted privacy terms for exact endpoints or proven connectors. No coordinates sent to routing APIs. |
| Managed pgRouting deployment/resources | BLOCKED | No verified free Supabase project supplied. Local pathfinding is not the required managed SQL deployment, <=300 MB graph/index or <=400 MB total DB measurement; no SQL p95/timeout or logging proof. |
| Offline licensing | PARTIAL | Published OpenFreeMap rights/limits and native capability documented in PROVIDERS.md. No pack built: size/time/complete assets and Android UA/concurrency/byte trace NOT MEASURED. Standard OSM raster tiles not downloaded. |
| Backend availability | BLOCKED | Published free tiers documented; actual Workers/Supabase accounts, quotas, restore and continuous operation unverified. |
| RAG | BLOCKED / PENDING | No proven no-charge generator entitlement. Zero model API calls. The 30-case RU/KK/EN quality/latency probe was NOT RUN; no product generation claim. |
| Spending/privacy constraints | PASS for performed work | Only public documentation/data and local tools; no purchases, paid APIs, secrets/account hunting, billing, deployments or paid builds. No Windows-MCP/SSH/Codex/protection changes. |
| GPS/hardware/field acceptance | PENDING | No real phone tonight. All code fixtures and public-node probes are labeled; no physical walk, museum entrance, winter passage or actual GPS evidence. |

## Local code and reproducibility

The research Interface is separate from the Root-owned mobile contract. `WalkingGraph(document).route(start_node_id, end_node_id)` returns a technical path only over mapped node topology. `route_points` requires exact unambiguous mapped public coordinates and otherwise requests clarification. It never draws a connector or silently changes an endpoint. This research CLI is not a production fallback or offline rerouting feature.

The profile rejects motorways/trunks, areas/indoor paths, conditional restrictions it cannot evaluate, unknown barriers, restricted nodes/ways and unsupported conveying. It honours foot-specific direction and access, ignores a car-only `oneway`, and never joins a geometric 2D intersection without a shared OSM node. A supplemental local barrier-way pass preserves continuous walls/fences sharing graph nodes; without an explicit permitted opening the shared node is blocked. Restriction relations are conservatively excluded rather than treated as supported turn logic. **Geometric obstacle intersections between a wall and path without a shared mapped node are not validated.** This is distinct from not inventing junctions. Remaining road centerline, sidewalk-side, grade/access freshness and boundary incompleteness limits prevent an accessibility/safety claim.

Commands from repository root (Python 3.12.7 stdlib tests; pinned ephemeral osmium exporter details in INGESTION.md):

```powershell
python -m unittest discover -s tests/data -v
python -m compileall -q tools/data tests/data
git diff --check
```

## Independent agents and review

- `/root/poi_ingestion`: public-source PBF ingestion, curated cards, provenance and ingestion tests.
- `/root/provider_evidence`: official routing/offline/budget sources; independent restriction/entrance review found ignored `foot:backward` and ignored linear barrier ways. Root reproduced both failing tests, corrected directional access/shared-node barriers, and added mandatory source enrichment. Re-review passed with the geometric obstacle limitation retained. No false center-as-entrance/current-open claims found.
- `/root/hours_evidence`: independent venue/tourism schedule-source comparison, season/freshness/unknown limits.

All received the zero-spending, no-secret-search, no-system-change and no-phone constraints. Their reports do not independently accept the complete T02 gate. Formal Standards and Spec review results will be recorded after the delivery commit is pinned.

## Handoff

Root should review the research format before mapping it to CityEvidence contracts. Do not treat raw OSM names/centers/hours as verified entrances or current-open facts. Do not enable an account-dependent adapter until its actual free entitlement and privacy/resource requirements are proven. Preserve closed M2-TECH/current-origin and RAG gates. No citywide coverage is claimed.

`docs/IMPLEMENTATION-STATUS.md` is Root-owned and deliberately unchanged under the dispatch scope; this report is the scoped result to reconcile there.
