"""Build the explicitly selected outdoor research loop from retained OSM data.

No network, GPS, snapping, inferred connectors or shared-contract changes.
Interface: build(source_bytes, metadata) -> candidate, replay fragment, metrics.
"""
import argparse
from collections import Counter
import hashlib
import heapq
import json
import math
from pathlib import Path
import sys

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.data.walking import WalkingGraph, distance_m


SNAPSHOT_SHA256 = "e3db0146acb00e261bbbe2c02ec36a330054d87a25b02af7783aa0e386e01c01"
PBF_SHA256 = "9ad8e895d4703248b97a5d17e883e49dc58549305aa4ba6bd6661d247cb98bdb"
STOPS = (
    ("bayterek-outdoor", "baiterek", "Байтерек: пешеходная площадь с западной стороны", 14080470212),
    ("nurzhol-outdoor", "nurzhol", "Нуржол: западная пешеходная аллея", 14086334441),
    ("round-square-outdoor", "round-square", "Круглая площадь: круговая пешеходная дорожка", 3874361286),
)


def strict_source(document):
    """Keep barriers/restrictions; admit mapped foot ways without known indoor tags.

    Absent location/level tags pass the filter but do not prove a physical level.
    OSM layer=-1 is relative drawing order, not the same property as level=-1.
    """
    selected = []
    for element in document["elements"]:
        tags = element.get("tags", {})
        if element["type"] != "way" or tags.get("barrier"):
            selected.append(element)
        elif (tags.get("highway") in {"footway", "pedestrian", "path"}
              and tags.get("indoor", "no") == "no"
              and tags.get("tunnel", "no") == "no"
              and tags.get("location", "surface") == "surface"
              and tags.get("level", "0") == "0"
              and tags.get("building", "no") == "no"
              and tags.get("access", "yes") in WalkingGraph.ALLOWED):
            selected.append(element)
    return {"elements": selected}


def return_path(graph, start, end, outbound_edges, penalty=20):
    """Prefer a different return using only already-admitted directed foot edges.

    Penalty changes selection cost only; returned distance is actual edge length.
    Infinite penalty forbids repeated undirected edges for a bounded refusal probe.
    """
    best, previous, queue = {start: 0.0}, {}, [(0.0, start)]
    while queue:
        cost, here = heapq.heappop(queue)
        if cost != best[here]:
            continue
        if here == end:
            nodes, ways = [end], []
            while nodes[-1] != start:
                parent, way = previous[nodes[-1]]
                nodes.append(parent)
                ways.append(way)
            nodes.reverse()
            ways.reverse()
            length = sum(distance_m(graph.point(a), graph.point(b)) for a, b in zip(nodes, nodes[1:]))
            return {"kind": "technical_path", "node_ids": nodes, "way_ids": ways,
                    "distance_m": round(length, 2),
                    "geometry": {"type": "LineString", "coordinates": [graph.point(n) for n in nodes]}}
        for target, length, way in graph.edges.get(here, []):
            repeated = tuple(sorted((here, target))) in outbound_edges
            if repeated and math.isinf(penalty):
                continue
            candidate = cost + length*(penalty if repeated else 1)
            if candidate < best.get(target, math.inf):
                best[target] = candidate
                previous[target] = here, way
                heapq.heappush(queue, (candidate, target))
    return {"kind": "no_path_in_snapshot"}


def build(source_bytes, metadata):
    checksum = hashlib.sha256(source_bytes).hexdigest()
    if checksum != SNAPSHOT_SHA256 or metadata["sha256"] != checksum:
        raise ValueError("Retained augmented source SHA-256 mismatch")
    if metadata["source_pbf_sha256"] != PBF_SHA256:
        raise ValueError("PBF lineage mismatch")
    source = json.loads(source_bytes)
    graph = WalkingGraph(strict_source(source))
    stops = [{"id": stop_id, "candidateKey": key, "label": label,
              "coordinate": graph.point(node_id), "osmNodeId": node_id}
             for stop_id, key, label, node_id in STOPS]
    legs, used_ways, used_nodes, undirected = [], set(), set(), Counter()
    walked_distance = 0.0
    outbound_edges = set()
    for index, (start, end) in enumerate(zip(stops, stops[1:] + stops[:1])):
        route = (return_path(graph, start["osmNodeId"], end["osmNodeId"], outbound_edges)
                 if index == len(stops)-1 else graph.route(start["osmNodeId"], end["osmNodeId"]))
        if route["kind"] != "technical_path":
            raise ValueError(f"No mapped foot path: {start['id']} -> {end['id']}: {route['kind']}")
        ids, ways = route["node_ids"], route["way_ids"]
        if len(ways) != len(ids)-1 or len(ids) < 2:
            raise ValueError("Ordered per-edge proof or nonzero leg missing")
        for a, b, way in zip(ids, ids[1:], ways):
            if not any(target == b and way_id == way for target, _, way_id in graph.edges.get(a, [])):
                raise ValueError("Unproved directed foot edge")
            undirected[tuple(sorted((a, b)))] += 1
            if index < len(stops)-1:
                outbound_edges.add(tuple(sorted((a, b))))
            walked_distance += distance_m(graph.point(a), graph.point(b))
        legs.append({"fromStopId": start["id"], "toStopId": end["id"],
                     "distanceMeters": route["distance_m"],
                     "coordinates": route["geometry"]["coordinates"],
                     "osmNodeIds": ids, "sourceWayIds": ways})
        used_ways.update(ways)
        used_nodes.update(ids)
    # Source restrictions/barriers are NEVER stripped to manufacture connectivity.
    fragment_elements = []
    for element in source["elements"]:
        if element["type"] == "relation" or (element["type"] == "way" and
                (element["id"] in used_ways or element.get("tags", {}).get("barrier"))):
            fragment_elements.append(element)
            if element["type"] == "way":
                used_nodes.update(element["nodes"])
            else:
                used_nodes.update(m["ref"] for m in element.get("members", []) if m["type"] == "node")
    fragment_elements = [e for e in source["elements"] if e["type"] == "node" and e["id"] in used_nodes] + fragment_elements
    fragment = {"provenance": {"snapshotSha256": checksum, "sourcePbfSha256": PBF_SHA256,
                               "fetchedAt": metadata["fetched_at"], "license": "ODbL-1.0",
                               "attribution": "© OpenStreetMap contributors",
                               "method": "All source restriction relations and barrier ways; complete used foot ways and available referenced nodes"},
                "elements": fragment_elements}
    replay_graph = WalkingGraph(strict_source(fragment))
    for index, leg in enumerate(legs):
        replay = (return_path(replay_graph, leg["osmNodeIds"][0], leg["osmNodeIds"][-1], outbound_edges)
                  if index == len(legs)-1 else replay_graph.route(leg["osmNodeIds"][0], leg["osmNodeIds"][-1]))
        if replay["kind"] != "technical_path" or abs(replay["distance_m"]-leg["distanceMeters"]) > 0.01:
            raise ValueError("Independent fragment replay failed")
    repeat_distance = sum((count-1)*distance_m(graph.point(a), graph.point(b))
                          for (a, b), count in undirected.items() if count > 1)
    exact_walk_minutes = walked_distance / 1.0 / 60
    metrics = {"distanceMeters": round(walked_distance, 3),
               "walkingSpeedMetersPerSecond": 1.0, "exactWalkingMinutes": exact_walk_minutes,
               "displayWalkingMinutes": math.ceil(exact_walk_minutes),
               "storyQuestMinutes": 18, "reserveMinutes": 8, "budgetMinutes": 80,
               "exactTotalMinutes": exact_walk_minutes+18+8,
               "displayTotalMinutes": math.ceil(exact_walk_minutes)+18+8,
               "repeatedUndirectedEdgeTraversals": sum(count-1 for count in undirected.values()),
               "repeatedTraversalMeters": round(repeat_distance, 3),
               "totalEdgeTraversals": sum(undirected.values()), "uniqueSourceWays": len(used_ways)}
    metrics["returnSelection"] = {"method": "existing-foot-edges outbound-overlap penalty", "penalty": 20,
                                   "zeroOverlapPathKind": return_path(graph, stops[-1]["osmNodeId"],
                                                                       stops[0]["osmNodeId"], outbound_edges,
                                                                       math.inf)["kind"],
                                   "distanceAndEtaUseUnpenalizedLengths": True}
    if metrics["displayTotalMinutes"] > 80:
        raise ValueError("80-minute budget exceeded")
    candidate = {"id": "first-walk-baiterek-nurzhol-round-square-v1",
                 "title": "Байтерек — Нуржол — Круглая площадь: пешеходный круг",
                 "startAnchor": {"id": stops[0]["id"], "label": stops[0]["label"],
                                 "coordinate": stops[0]["coordinate"], "osmNodeId": stops[0]["osmNodeId"]},
                 "stops": stops, "legs": legs, "endRule": "return_to_start",
                 "source": {"snapshotSha256": checksum, "license": "ODbL-1.0",
                            "attribution": "© OpenStreetMap contributors — https://www.openstreetmap.org/copyright"},
                 "fieldVerified": False,
                 "limitations": [
                     "Старт — явно выбранная общественная пешеходная точка, совпадающая с первой остановкой; подход от текущего GPS не рассчитан.",
                     "Все остановки расположены на картографированных пешеходных узлах; это не входы в здания и не обещание видимости объекта.",
                     "Круглая площадь: узел на картографированной круговой пешеходной дорожке с layer=-1; отсутствие level/location не подтверждает физический уровень, доступ или вход.",
                     "Локальная техническая геометрия OSM не подтверждает актуальную проходимость, безопасность, безбарьерность, отсутствие льда или работу заведений.",
                     f"Оценка: 60 м/мин (1,0 м/с); ходьба округлена вверх один раз до {metrics['displayWalkingMinutes']} мин, истории и задания 18 мин, резерв 8 мин, всего {metrics['displayTotalMinutes']} из 80 мин.",
                     "Обратный путь выбран с предпочтением других пешеходных участков и не является кратчайшим; расстояние и время рассчитаны по действительным длинам, без штрафного коэффициента.",
                     "Есть повторное прохождение некоторых картографированных участков; маршрут не является полностью неповторяющейся петлёй.",
                     "Геометрические пересечения пути и стены без общего OSM-узла автоматически не проверены; картографическая связность не доказывает отсутствие препятствий на месте.",
                     "Доказательство ограничено этим выбранным кругом и сохранённым снимком; GPS и поле не проверены."]}
    return candidate, fragment, metrics


def geographic_context(source_bytes, metadata):
    """Small source records for locator correspondence; never routing edges."""
    source = json.loads(source_bytes)
    chosen = {("way", 384147232), ("way", 255969480),
              ("node", 5787558957), ("node", 4874140222)}
    selected = [e for e in source["elements"] if (e["type"], e["id"]) in chosen]
    if len(selected) != len(chosen):
        raise ValueError("Round Square context source record missing")
    refs = {n for e in selected if e["type"] == "way" for n in e["nodes"]}
    selected += [e for e in source["elements"] if e["type"] == "node" and e["id"] in refs
                 and (e["type"], e["id"]) not in chosen]
    return {"provenance": {"snapshotSha256": SNAPSHOT_SHA256, "sourcePbfSha256": PBF_SHA256,
                           "fetchedAt": metadata["fetched_at"], "license": "ODbL-1.0",
                           "attribution": "© OpenStreetMap contributors"},
            "locatorSources": [
                "https://www.gov.kz/org/astana/press/news/details/901398?lang=ru",
                "https://visitastana.kz/ru/exkursion/peshaya-ekskursiya-po-bulvaru-nurzhol-ob-astane-s-interesom-i-lyubovyu/",
                "https://old.adilet.zan.kz/rus/docs/V12A0000724"],
            "interpretation": "Geographic correspondence: unnamed circular footway/layer -1, Kabanbay Batyr road bridge/layer 1 and neighboring venue records. No invented OSM name, entrance or physical-level claim.",
            "notRoutingEdges": [255969480], "fieldVerified": False, "elements": selected}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--metadata", required=True, type=Path)
    parser.add_argument("--out", default="data/first-walk/route-candidate.json", type=Path)
    parser.add_argument("--fragment", default="evidence/first-walk/routing-source.json", type=Path)
    parser.add_argument("--context", default="evidence/first-walk/routing-source-context.json", type=Path)
    args = parser.parse_args()
    source_bytes = args.source.read_bytes()
    metadata = json.loads(args.metadata.read_text(encoding="utf-8-sig"))
    candidate, fragment, metrics = build(source_bytes, metadata)
    context = geographic_context(source_bytes, metadata)
    for path, value in ((args.out, candidate), (args.fragment, fragment), (args.context, context)):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(metrics, ensure_ascii=False, indent=2))
    print("candidate_sha256=" + hashlib.sha256(args.out.read_bytes()).hexdigest())
    print("fragment_sha256=" + hashlib.sha256(args.fragment.read_bytes()).hexdigest())
    print("context_sha256=" + hashlib.sha256(args.context.read_bytes()).hexdigest())


if __name__ == "__main__":
    main()
