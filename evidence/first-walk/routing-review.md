# Independent first-walk routing review — final selected geometry

2026-10-20; reviewer `/root/provider_evidence`; branch `codex/t04-first-walk-routing`, baseline `9859ba9aecc9622d12eb7ec2e3bd6421c447d475`. Scope: **Bayterek → Nurzhol → actual Round Square → original Bayterek node** technical route and source witnesses. This does not accept full T04, Android, actual GPS connectors, entrances, accessibility or field conditions. The previous Korme candidate is superseded and is not a Round Square arrival.

Used installed `research` and `codebase-design` skills. The validator independently checks the exported Interface against retained primary OSM records; it does not call the builder or trust its metrics. No paid API, credentials, new map download, device, relay POST, settings or builder-file edits were used. Public official locator pages were read only.

## Frozen artifacts

| Artifact | SHA-256 |
|---|---|
| Full augmented OSM snapshot | `e3db0146acb00e261bbbe2c02ec36a330054d87a25b02af7783aa0e386e01c01` |
| Originating PBF lineage | `9ad8e895d4703248b97a5d17e883e49dc58549305aa4ba6bd6661d247cb98bdb` |
| `data/first-walk/route-candidate.json` | `3f700ecf9e4edac484c4dd213ce42c8713cd0970d1dc4d7b612dee0722d9f5d3` |
| `evidence/first-walk/routing-source.json` | `7c71e91aa760e046c7a706ebd68fca4954d71fd457fa7d8c1d7a744fb9e5799b` |
| `evidence/first-walk/routing-source-context.json` | `465ded9ff687e66dc1433664341a54228060b5afa648651cf2490b8a026b8442` |

All three exported JSON artifacts have LF bytes and independently observed hashes matching this table.

## Actual commands and results

From the new clone root, existing CPython 3.12.7:

```powershell
python evidence/first-walk/routing-check.py `
  --source 'C:\Users\erszt\Documents\Codex\2026-10-20\new-chat\outputs\astanaai-t02-20261020-024857\repository\raw-data\walking-with-barriers.json' `
  --metadata 'C:\Users\erszt\Documents\Codex\2026-10-20\new-chat\outputs\astanaai-t02-20261020-024857\repository\raw-data\walking-with-barriers.metadata.json' `
  --expected-candidate-sha256 3f700ecf9e4edac484c4dd213ce42c8713cd0970d1dc4d7b612dee0722d9f5d3
```

Actual exit **0**, `PASS_TECHNICAL_EVIDENCE_ONLY`. The fragment contains 1,825 unchanged records and retains **all 32 barrier ways and all 816 relations in the full pinned input**; context records are also compared with that input. This proves correspondence/completeness against this snapshot, not completeness of OSM or the physical city.

Reproduction without the 4 MB raw input is explicitly weaker:

```powershell
python evidence/first-walk/routing-check.py --witness-only `
  --expected-candidate-sha256 3f700ecf9e4edac484c4dd213ce42c8713cd0970d1dc4d7b612dee0722d9f5d3 `
  --expected-fragment-sha256 7c71e91aa760e046c7a706ebd68fca4954d71fd457fa7d8c1d7a744fb9e5799b `
  --expected-context-sha256 465ded9ff687e66dc1433664341a54228060b5afa648651cf2490b8a026b8442
```

Actual exit **0**, `PASS_FRAGMENT_REPLAY_ONLY`, with `sourceCompleteness=NOT_PROVEN_WITHOUT_RETAINED_FULL_INPUT`. It checks every supplied edge, coordinate, direction/access condition, closure and budget within the checksummed witness. It cannot prove no original restriction was omitted. All three expected hashes are mandatory; missing full-source inputs never trigger silent fallback.

## Independent topology and location checks

- **216/216 directed traversals pass:** each ordered `(from node, to node, source way ID)` is an actual consecutive source-way pair in an allowed pedestrian direction. All 45 used ways are `highway=footway`; no vehicle-road centerline or invented connector is used. Every coordinate equals its source node; the three nonzero legs join at identical stops.
- Content keys are exactly `baiterek`, `nurzhol`, `round-square`. Stop nodes are `14080470212`, `14086334441`, **`3874361286`**. The former Korme node `14204046451` is not the third stop. Final endpoint is original Bayterek node `14080470212`, `[71.4292869,51.1284827]`.
- Round Square point `[71.4149354,51.1307184]` lies on closed circular footway **`384147232`, `layer=-1`**, at a real shared junction with approach footway `411096096`. Kabanbay Batyr bridge `255969480` is `bridge=yes`, `layer=1`, `foot=no` and remains **context only**. Circle and road bridge share no OSM nodes; no route node is a vehicle-bridge node. No connection was invented at a 2D crossing.
- The city publication locates Round Square under the Kabanbay Batyr bridge; Visit Astana describes its two-level design on the Nurzhol itinerary. Together with circle/bridge/nearby venue records, this supports the **editorial geographic association** of the selected point. The OSM point/way itself is unnamed: these pages do not survey its exact coordinate or verify an entrance. [Astana akimat locator](https://www.gov.kz/org/astana/press/news/details/901398?lang=ru), [Visit Astana itinerary](https://visitastana.kz/ru/exkursion/peshaya-ekskursiya-po-bulvaru-nurzhol-ob-astane-s-interesom-i-lyubovyu/).
- Used ways `384147232` and `609676635` have mapped `layer=-1`; the other 43 have no layer tag. Missing `level`, `location`, `tunnel` or `indoor` tags is **not physical surface/elevation proof**. Mapped shared-node topology is preserved, while slope, level continuity, step-free access and current passage remain field checks. Locator sources establish no current-open or building-entry promise.
- Restricted/conditional access, unknown/locked barriers, malformed pedestrian direction, forbidden travel and unsupported indoor/area segments are refused. Ten in-memory synthetic sensitivity checks rejected old-Korme substitution, wrong content key, invented coordinate, unrelated way, private access, unknown gate, malformed direction, prohibited direction, removed relation and changed return endpoint. These mutations are not source or field evidence.

## Distance, route shape and final user-selected pace

| Leg | Independently summed distance | Directed edges |
|---|---:|---:|
| Bayterek → Nurzhol | 501.915186 m | 28 |
| Nurzhol → Round Square | 604.184692 m | 34 |
| Round Square → original Bayterek | 2117.004562 m | 154 |
| Total | **3223.104440 m** | **216** |

Distances were independently recomputed from source coordinates using an `atan2` great-circle formulation. The selected return deliberately favours different existing edges with the builder's ×20 overlap-cost heuristic; it need not be shortest. **Only actual unpenalized distance enters the budget.** The fully retraced return was replaced. There are 210 distinct undirected edges; six repeated traversals add **60.188527 m**. This is a street loop with a small repeated spur, not a completely nonrepeating circle. A zero-overlap search failure is a model result, not proof no physical alternative exists.

Final user-selected pace: **60 m/min = 1.0 m/s**. Exact walking is **53.718407336 minutes**; with 18 content and 8 reserve, exact total is **79.718407336 ≤ 80 minutes**. Round walking upward once: **54 + 18 + 8 = 80/80**, with **zero integer slack**. Fractional margin beyond the allocated reserve is only about 16.90 seconds, not another safety buffer. Reserve 8 matches `max(5, 10% of 80)` in PRODUCT-SPEC. These are estimates, not measured speed or guaranteed completion.

## Final scoped conclusion

**No remaining blocking defect found in this declared technical route evidence.** Actual GPS approach/return connectors, field passage, lawful/current access, entrances, visibility, barrier-free continuity, crossing operation, weather/ice and measured walking times remain **OPEN**. Acquisition date is not a fresh field inspection. Start is explicitly selected and already the first stop; no path from the user's current GPS position was calculated.

Geometric wall/path obstacle intersections **without a shared mapped OSM node are not validated**. This limitation remains in the candidate; not inventing junctions is a separate guarantee. ODbL attribution/lineage remain; editorial content has separate rights. The coordinator must separately validate any transformed final bundle. This review grants no Android, full T04 or field acceptance.
