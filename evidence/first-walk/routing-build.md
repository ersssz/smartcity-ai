# First walking loop — local build evidence

Base `9859ba9aecc9622d12eb7ec2e3bd6421c447d475`, branch
`codex/t04-first-walk-routing`. The user explicitly chose moving the third stop
to actual Round Square. Root accepted the anchor below and the non-shortest
return alternative before final export. No Korme stop/context is substituted.
This public-anchor research candidate does not accept all archived T04/beta gates.

## Selection and geographic correspondence

| Content key | Outdoor stop | Exact foot node | `[longitude,latitude]` |
| --- | --- | --- | --- |
| baiterek | Байтерек: пешеходная площадь с западной стороны | 14080470212 | `[71.4292869,51.1284827]` |
| nurzhol | Нуржол: западная пешеходная аллея | 14086334441 | `[71.4227574,51.1291412]` |
| round-square | Круглая площадь: круговая пешеходная дорожка | 3874361286 | `[71.4149354,51.1307184]` |

The first two stops are mapped footways by the monument/boulevard; their source
landmark centers identify context only and are not route endpoints. The third
node lies ON the closed circular footway **384147232**, at its junction with
footway **411096096**. It is not former Korme node `14204046451`.
[Astana government](https://www.gov.kz/org/astana/press/news/details/901398?lang=ru)
locates Round Square under the Kabanbay Batyr bridge; the
[official tourism walk](https://visitastana.kz/ru/exkursion/peshaya-ekskursiya-po-bulvaru-nurzhol-ob-astane-s-interesom-i-lyubovyu/)
describes its two-level design along Nurzhol. The
[dated municipal legal source](https://old.adilet.zan.kz/rus/docs/V12A0000724)
ties the square to Kabanbay Batyr 25; it is historical context, not current access.

`routing-source-context.json` preserves exact OSM circle, Kabanbay road bridge
**255969480** and neighboring venue nodes **5787558957/4874140222**, with source
coordinates. These bound the correspondence of the unnamed mapped circle to
those primary locators; an OSM Round Square name is not invented. The bridge
is `secondary`, `bridge=yes`, `layer=1`, `foot=no`: CONTEXT ONLY, never route.
The foot circle has `layer=-1`; missing `level/location` tags pass the filter
but do NOT confirm a surveyed physical level, surface, entry or current access.
This correspondence is map/document research, not a field identification.

The selected start/first story share `bayterek-outdoor`. Three nonzero legs
close at that exact original node. No zero-length LineString or GPS connector.
Outdoor labels promise neither entry nor visibility, opening, accessibility or safety.

## Actual length, loop shape and budget

| Leg | Unpenalized mapped distance |
| --- | ---: |
| Baiterek → Nurzhol | 501.92 m |
| Nurzhol → Round Square | 604.18 m |
| Round Square → original Baiterek anchor, different return | 2,117.00 m |
| Total, summed actual edges | **3,223.104 m** |

A bounded search forbidding every outbound UNDIRECTED edge found no return in
this strict snapshot. To reduce retracing, return Dijkstra selection multiplies
outbound-edge cost by **20**, retaining all actual foot/barrier/direction checks.
This is a deliberate **non-shortest return**, not an optimality guarantee.
Distance/ETA always use original physical edge lengths, NEVER penalized cost.
There are **216** traversals across **45** distinct foot ways; only **6** repeated
traversals (**60.189 m**) remain. No connector or junction is added to close the loop.

User-selected app pace **60 m/min (1.0 m/s)** gives **53.718407336165534 min**
walking; round total walking up ONCE to **54 min**. Stories/quests **18 min**,
reserve `max(5,10%×80)=8 min`: exact **79.71840733616554 min**; displayed
**54+18+8=80/80 min**, **zero integer slack** (exact nominal margin about
0.282 min beyond the allocated reserve). Do not sum rounded leg times.
This is a research planning assumption, not measured pace/waits/content completion.
The earlier examined Lovers Park simple out-and-back exceeded this budget
(5,163.20 m, about 112.05 min at the user-selected pace/content/reserve); the examined Khan
Shatyr-side node had no strict-graph path. Those results are snapshot-limited,
not proof of physical disconnection or impossibility of every western itinerary.

## Provenance, proof and reproduction

No new routing-data/PBF download, routing API, installation, credential or paid
service was used; primary web pages were researched for geographic context.
Retained Geofabrik PBF SHA-256:
`9ad8e895d4703248b97a5d17e883e49dc58549305aa4ba6bd6661d247cb98bdb`.
OSM through `2026-10-18T20:25:06Z`, acquired `2026-10-19T21:52:31.3613250Z`.
Augmented source 4,017,606 bytes, SHA-256:
`e3db0146acb00e261bbbe2c02ec36a330054d87a25b02af7783aa0e386e01c01`.
License [ODbL 1.0](https://www.openstreetmap.org/copyright), attribution
**© OpenStreetMap contributors**; applicable attribution/share-alike retained.
All **32** barrier ways and **816** restrictions survive filtering and replay.
Only mapped footway/pedestrian/path edges without known indoor/tunnel/private
conditions are eligible; named residential carriageways are not route edges.
Existing `WalkingGraph` is unchanged. No 2D-intersection junction or snap is added.

`sourceWayIds[i]` proves directed adjacent nodes `osmNodeIds[i]→[i+1]`;
geometry exactly matches source nodes. Complete used ways/nodes, all barriers/
restrictions and available referenced nodes are retained. Unrelated references
already missing coordinates in the bounded source stay unresolved, not fabricated.
Internal policy replay passed; independent review is `routing-review.md`.

| UTF-8 LF artifact | SHA-256 |
| --- | --- |
| `data/first-walk/route-candidate.json` | `3f700ecf9e4edac484c4dd213ce42c8713cd0970d1dc4d7b612dee0722d9f5d3` |
| `evidence/first-walk/routing-source.json` | `7c71e91aa760e046c7a706ebd68fca4954d71fd457fa7d8c1d7a744fb9e5799b` |
| `evidence/first-walk/routing-source-context.json` | `465ded9ff687e66dc1433664341a54228060b5afa648651cf2490b8a026b8442` |

From this repository root using the already retained local source:

```powershell
python tools/data/first_walk_export.py `
  --source 'C:/Users/erszt/Documents/Codex/2026-10-20/new-chat/outputs/astanaai-t02-20261020-024857/repository/raw-data/walking-with-barriers.json' `
  --metadata 'C:/Users/erszt/Documents/Codex/2026-10-20/new-chat/outputs/astanaai-t02-20261020-024857/repository/raw-data/walking-with-barriers.metadata.json'
python -m py_compile tools/data/first_walk_export.py
```

Exporter refuses wrong source/PBF hashes, missing mapped legs/ordered directed
proof, failed policy replay and budget >80 min. Actual-source generation and
compilation passed on Windows/Python 3.12. No dependency/contract/Git mutation.
`fieldVerified=false`: geometric wall crossings without shared OSM nodes are
not automatically checked. Real obstacles, current/seasonal access, visibility,
entrances, GPS, Android/device behavior and field walk remain unverified.
No lawful-GPS/backend/generator/release gate or system-setting change is claimed.
