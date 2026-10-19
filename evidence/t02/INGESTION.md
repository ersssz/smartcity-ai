# T02 — reproducible POI ingestion

Scope: one Bayterek/Ishim research box in Astana, south/west/north/east
`51.115, 71.40, 51.160, 71.45`. This is a research data format, **not** the
Root-owned mobile `CityEvidence` or `WalkBundle` contract. No phone, physical
entrance, GPS, seasonal passage or field-access assertion was verified.

## Source and no-spending evidence

The source is the [Geofabrik Kazakhstan extract](https://download.geofabrik.de/asia/kazakhstan.html),
downloaded from its [public PBF URL](https://download.geofabrik.de/asia/kazakhstan-latest.osm.pbf).
The fetched index said it contains OSM data through **2026-10-18T20:25:06Z**.
The actual snapshot was fetched **2026-10-19T21:52:31.3613250Z**, 224,566,151 bytes,
SHA-256 **9ad8e895d4703248b97a5d17e883e49dc58549305aa4ba6bd6661d247cb98bdb**.
The download took 11.5817853 seconds, excluding subsequent extraction.

OSM data is provided under [ODbL 1.0](https://www.openstreetmap.org/copyright).
The dataset contains attribution `© OpenStreetMap contributors`, source URLs,
and license references. Redistributing this OSM-derived database requires the
applicable ODbL attribution/share-alike obligations; it grants no rights to
unrelated official-site copy, photos or audio. Raw data stays under ignored
`raw-data/`; no paid API, credential, account, billing or remote-control setting
was used. This acquisition is the Geofabrik method specified by ARCHITECTURE.

Initial bounded Overpass attempts failed (TLS handshake, HTTP 502/504); they
produced no dataset and are not evidence of empty coverage. Attempts were
bounded and stopped. TLS verification was never disabled. The
[official Overpass guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
supports small research queries but warns against production-backend reliance;
the final implementation does not depend on that service.

## Reproduce locally

Run from the repository root with PowerShell. These commands are acquisition
commands for a human-authorized run; ordinary tests make no network calls.

```powershell
# Refuses overwriting an existing raw snapshot; choose another path for a new date.
powershell -NoProfile -File tools/data/ingest_fetch.ps1

# Pinned free local parser in an ephemeral uv environment; no shared lock changes.
uv run --no-project --python 3.14 --with osmium==4.3.2 python tools/data/ingest_osm.py `
  --pbf raw-data/kazakhstan-latest.osm.pbf `
  --pbf-metadata raw-data/kazakhstan-latest.metadata.json `
  --out raw-data/walking-source.json

uv run --no-project --python 3.14 --with osmium==4.3.2 python tools/data/augment_barriers.py `
  --pbf raw-data/kazakhstan-latest.osm.pbf --source raw-data/walking-source.json `
  --metadata raw-data/walking-source.metadata.json --out raw-data/walking-with-barriers.json

python tools/data/ingest_poi.py --raw raw-data/walking-with-barriers.json `
  --metadata raw-data/walking-with-barriers.metadata.json `
  --as-of 2026-10-19T21:52:31.3613250Z --out raw-data/poi-bayterek-all.json

python tools/data/ingest_poi.py --raw raw-data/walking-with-barriers.json `
  --metadata raw-data/walking-with-barriers.metadata.json `
  --as-of 2026-10-19T21:52:31.3613250Z --limit 20 --out data/curated/poi-bayterek.json

python -m unittest discover -s tests/data -p test_ingest_poi.py -v
```

The moving `latest` URL will change. Reproducing this precise dataset requires
the retained PBF with the above SHA-256, not an unverified later download.
The exporter checks that PBF hash before reading it; the normalizer checks the
derived JSON hash. The bytes/hash/fetch time/license/PBF lineage are copied to
the curated result. The PBF omits edit metadata: no edit timestamp is invented.
The retained fetch metadata proves acquisition time, not recent verification
of every source tag.

## Meaning of the public Interface

`normalize(raw_bytes, metadata, now=UTC) -> research dataset` performs bounded
category selection, stable OSM ID deduplication, names, attributed field states
and coverage reporting behind one Interface. The CLI also writes its result.
No provider text is executed or treated as an instruction.

Each card preserves OSM type/ID, source URL, coordinates as `[longitude,latitude]`,
raw tags, RU/KK/EN names when present, fetched UTC time, raw SHA-256 and license.
Critical fields are `name`, `coordinates`, `category`, `opening_hours`,
`outdoor_anchor`, `accessibility`. Each has `state`, `value`, `source_refs` and
`reason`. `known` means an attributed OSM observation, not independent field
verification or a guarantee of current opening. A research snapshot older
than seven days is conservatively `stale`; production freshness rules remain
Root's responsibility. Unparsed `opening_hours` is always raw/`unknown`.
Missing entrance, accessible approach or indoor hours stays `unknown`.
An OSM way bounding-box center is explicitly labeled a center and never used
as an entrance or an outdoor arrival anchor.

`resolve_field(observations, at=UTC)` distinguishes known, unknown, stale and
conflicting structured observations. Dated seasonal intervals are applicable
only within `valid_from <= at < valid_until`; missing expiry is not current
evidence. Two disagreeing current sources retain `conflicting` and a null
usable value. Current official evidence is an **editorial preference**, with
both observations retained; this does not automatically permit an indoor
visit. Fixture conflict/season tests are synthetic and cannot close the live
schedule-conflict gate. See the independent `HOURS.md` for real source work.

Duplicate policy removes only repeated exact `type/id`, preferring a newer OSM
version where present, otherwise preserving the richer tag record rather than
replacing it with an Overpass-style skeleton. Nearby
equal names are reported for review and retained: adjacent venues or parts
of a monument must not silently disappear. No claim of city completeness is
made without a denominator.

The base graph export contains selected highway ways with full mapped-node
descendants, node barrier tags and applicable restriction relations. The
mandatory `augment_barriers.py` pass adds linear barriers sharing selected
graph nodes; its metadata preserves base/PBF lineage and the updated raw hash.
This catches mapped walls/fences even when the shared node has no barrier tag.
Selection
requires at least one mapped way node in the box; a long edge crossing the box
with all vertices outside can be absent. It does not add artificial junctions
at 2D crossings or invent connectors. Routing/coverage acceptance is separate.

## Verification and remaining gates

Public ingestion tests ran with CPython 3.12 on Windows. The ID-deduplication
and conflict-policy slices were observed failing before implementation and
then passing. Tests use explicitly synthetic source records; live PBF import
is separately reported. No fixture represents a physical visit or live
provider acceptance. No paid API is enabled by these tools.

## Actual frozen result

The delivered sample `data/curated/poi-bayterek.json` has **20** genuinely
imported located POIs, 51,099 bytes, SHA-256
`fab677b51b9366cfcd08ff1a2f9cd0ef3b37e73ae1b587474c4df4f20f914849`.
The larger research catalog is retained only in ignored
`raw-data/poi-bayterek-all.json`: **247** located cards, 583,520 bytes, SHA-256
`b66f6ff18112b012a08a742b742cc16f1c1e493784ffd95f55a565a253af4126`.
Both use the same fixed evaluation instant as acquisition.

The selected source has 36,014 distinct OSM records; repeated exact IDs removed:
**0**. The conservative nearby-equal-name heuristic found **0** candidate pairs;
this is not proof that all semantic duplicates have been identified. **6**
additional named graph-only barrier records lacked a POI point/center and are
listed as quarantined unknown coordinates rather than counted as located POIs.
All **247/247** located records have coordinates; **64/247** retain raw hours,
but **0** have structured/current verified hours or verified outdoor anchors.
Locale-specific names are present for RU **39**, KK **20**, EN **44** of 247.
This is no denominator for citywide completeness or guaranteed multilingual
content. All outdoor-anchor and accessibility fields remain unknown.

| Frozen sample ID | Source name |
| --- | --- |
| node/455447676 | Жамбыл |
| node/2616721347 | памятник Курмангазы |
| node/4892204728 | Мұстафа Кемал Ататүрік |
| node/4929123022 | Памятник Шарлю Де Голлю |
| node/4958412863 | Zur Sultan |
| node/7684091171 | Н. Ә. Назарбаев |
| node/11500907369 | Городские часы |
| node/12893538292 | Асқар Забикулин |
| node/13333409377 | Махтумкули Фраги |
| node/13397184827 | Юнус Эмре |
| way/230401645 | Бәйтерек |
| node/2388707906 | Астана-Экспо КС |
| node/4109068593 | Жер-ана (Томирис) |
| node/4209560711 | Т34-85 |
| node/10148735979 | Олимпиада сақиналары |
| node/10168959440 | Ailand |
| node/13340040665 | Жетігенші |
| node/13340040666 | Қобызшы |
| node/13340050452 | Хатико |
| node/14087643081 | Жылқылар үйірі |

The locally derived base graph is 4,009,619 bytes / 35,983 elements, SHA-256
`63577bba3db3a554974038b09c49fe8effb538cad46121ecd2dc97727f5dfc4f`;
export duration **369.837 s**. The mandatory augmented source is 4,017,606 bytes /
36,014 elements, SHA-256
`e3db0146acb00e261bbbe2c02ec36a330054d87a25b02af7783aa0e386e01c01`;
**32** linear barrier ways were retained in **13.709 s**. All 20 sample IDs,
coordinates, source times and license fields were checked against this actual
source independently of the synthetic tests. **7/7** ingestion tests passed
on both CPython 3.12 and 3.14 on this Windows laptop. Python compilation passed.

The sample's coverage object deliberately reports the complete pre-sample
catalog; `selection.selected_cards=20` distinguishes the actual payload count.
Gates for lawful current GPS routing, managed
backend performance/capacity, real generator quality and field entrances remain
outside this ingestion evidence; none is implicitly accepted by data import.
