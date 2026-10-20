"""Independent local first-walk evidence validator; no network or product changes.

Checks exported paths against the retained full source rather than trusting the
exporter's pathfinding/metrics. This does not validate field access, geometric
wall intersections without a shared OSM node, visibility, or actual GPS.
"""
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path


SOURCE_SHA = "e3db0146acb00e261bbbe2c02ec36a330054d87a25b02af7783aa0e386e01c01"
PBF_SHA = "9ad8e895d4703248b97a5d17e883e49dc58549305aa4ba6bd6661d247cb98bdb"
ALLOWED = {"yes", "designated", "permissive", "official"}
OPEN_BARRIERS = {"no", "entrance"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def load(path):
    raw = path.read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest(), b"\r\n" in raw


def distance(first, second):
    lat1, lon1, lat2, lon2 = map(math.radians,
        (first["lat"], first["lon"], second["lat"], second["lon"]))
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371008.8 * 2 * math.atan2(math.sqrt(h), math.sqrt(max(0, 1-h)))


def validate(source, metadata, route, fragment, stories, reserve, budget):
    records = {(e["type"], e["id"]): e for e in source["elements"]}
    pieces = {(e["type"], e["id"]): e for e in fragment["elements"]}
    for key, record in pieces.items():
        require(records.get(key) == record, f"Fragment record changed or invented: {key}")
    barriers = [e for e in source["elements"] if e["type"] == "way" and e.get("tags", {}).get("barrier")]
    relations = [e for e in source["elements"] if e["type"] == "relation"]
    require(all((e["type"], e["id"]) in pieces for e in barriers + relations),
            "Fragment dropped a source barrier way or restriction relation")
    linear_nodes = {n for e in barriers if e["tags"]["barrier"] not in OPEN_BARRIERS for n in e["nodes"]}
    restricted_ways = {m["ref"] for e in relations if e.get("tags", {}).get("type") == "restriction"
                       for m in e.get("members", []) if m["type"] == "way"}
    require(route["source"]["snapshotSha256"] == SOURCE_SHA, "Candidate source hash mismatch")
    require(route["source"]["license"] == "ODbL-1.0", "Candidate license missing")
    require(fragment["provenance"]["snapshotSha256"] == SOURCE_SHA, "Fragment provenance mismatch")
    require(fragment["provenance"]["sourcePbfSha256"] == PBF_SHA, "Fragment PBF provenance mismatch")
    require(fragment["provenance"]["fetchedAt"] == metadata["fetched_at"], "Fragment acquisition timestamp mismatch")
    require(route["fieldVerified"] is False, "Field acceptance must remain false")
    require(route["endRule"] == "return_to_start", "Wrong end rule")
    stops = route["stops"]
    require([s["osmNodeId"] for s in stops] == [14080470212, 14086334441, 3874361286], "Selected stops changed")
    require([s["candidateKey"] for s in stops] == ["baiterek", "nurzhol", "round-square"], "Approved content keys changed")
    by_id = {s["id"]: s for s in stops}
    require(len(by_id) == 3 and len(route["legs"]) == 3, "Expected three distinct stops and nonzero legs")
    require(route["startAnchor"]["id"] == stops[0]["id"] and
            route["startAnchor"]["osmNodeId"] == stops[0]["osmNodeId"] and
            route["startAnchor"]["coordinate"] == stops[0]["coordinate"], "Explicit start changed")
    for stop in stops:
        n = records[("node", stop["osmNodeId"])]
        require(stop["coordinate"] == [n["lon"], n["lat"]], "Stop is not the exact source foot node")
    lengths, traversals, used_ways, leg_metrics = {}, Counter(), set(), []
    for index, leg in enumerate(route["legs"]):
        first, last = stops[index], stops[(index+1) % len(stops)]
        require(leg["fromStopId"] == first["id"] and leg["toStopId"] == last["id"], "Leg order/return changed")
        ns, ws, coordinates = leg["osmNodeIds"], leg["sourceWayIds"], leg["coordinates"]
        require(len(ns) > 1 and len(ws) == len(ns)-1 and len(coordinates) == len(ns), "Missing ordered edge proof")
        require(ns[0] == first["osmNodeId"] and ns[-1] == last["osmNodeId"], "Unproved connector or changed endpoint")
        for node_id, point in zip(ns, coordinates):
            node = records[("node", node_id)]
            require(pieces.get(("node", node_id)) == node, "Fragment omitted route node")
            require(point == [node["lon"], node["lat"]], "Geometry point differs from source")
            t = node.get("tags", {})
            require(not any("conditional" in k for k in t) and t.get("locked") != "yes", "Unknown/locked node used")
            require(t.get("foot", t.get("access", "yes")) in ALLOWED, "Restricted node used")
            barrier = t.get("barrier")
            require(not barrier or barrier in OPEN_BARRIERS or t.get("foot") in ALLOWED, "Unknown barrier traversed")
            require(node_id not in linear_nodes or barrier in OPEN_BARRIERS or t.get("foot") in ALLOWED,
                    "Continuous source wall/fence traversed without permitted opening")
        leg_length = 0
        for a, b, way_id in zip(ns, ns[1:], ws):
            way = records[("way", way_id)]
            require(pieces.get(("way", way_id)) == way, "Source way changed or omitted")
            require(way_id not in restricted_ways, "Restricted relation way used")
            t = way["tags"]
            require(t.get("highway") in {"footway", "pedestrian", "path"}, "Carriageway centerline used")
            require(not any("conditional" in k for k in t), "Conditional restriction assumed open")
            require(t.get("foot", "yes") in ALLOWED and t.get("access", "yes") in ALLOWED, "Restricted way used")
            require(t.get("indoor", "no") == "no" and t.get("area") != "yes" and
                    t.get("building", "no") == "no" and t.get("location", "surface") == "surface" and
                    t.get("level", "0") == "0" and t.get("tunnel", "no") == "no" and
                    t.get("conveying", "no") == "no", "Unsupported indoor/level/conveying way")
            forward = any(x == a and y == b for x, y in zip(way["nodes"], way["nodes"][1:]))
            backward = any(x == b and y == a for x, y in zip(way["nodes"], way["nodes"][1:]))
            direction = t.get("oneway:foot", "no")
            require(direction in {"no", "0", "false", "yes", "1", "true", "-1"}, "Unknown pedestrian direction")
            allowed_forward = forward and direction != "-1" and t.get("foot:forward", t.get("access:forward", "yes")) in ALLOWED
            allowed_backward = backward and direction not in {"yes", "1", "true"} and t.get("foot:backward", t.get("access:backward", "yes")) in ALLOWED
            require(allowed_forward or allowed_backward, "Nonadjacent or prohibited directed edge")
            edge = tuple(sorted((a, b)))
            amount = distance(records[("node", a)], records[("node", b)])
            lengths[edge] = amount
            traversals[edge] += 1
            used_ways.add(way_id)
            leg_length += amount
        require(abs(leg_length-leg["distanceMeters"]) <= .011, "Leg distance is not source edge sum")
        leg_metrics.append({"from": first["id"], "to": last["id"], "meters": round(leg_length, 6), "edges": len(ws)})
    meters = sum(lengths[e]*count for e, count in traversals.items())
    walk = meters/1.0/60
    require(stories == 18 and reserve == max(5, .1*budget), "Approved story/reserve assumptions changed")
    require(math.ceil(walk)+stories+reserve <= budget, "80-minute budget exceeded")
    require(14204046451 not in {s["osmNodeId"] for s in stops}, "Korme must not substitute for Round Square")
    repeat_meters = sum(lengths[e]*(c-1) for e, c in traversals.items())
    require(2*repeat_meters < meters-.01, "Entire outbound retraced: street loop not demonstrated")
    return {"status": "PASS_TECHNICAL_EVIDENCE_ONLY", "legs": leg_metrics,
            "sourceBarrierWaysRetained": len(barriers), "sourceRelationsRetained": len(relations),
            "sourceRecordsRetained": len(pieces), "directedEdgeTraversals": sum(traversals.values()),
            "distinctUndirectedEdges": len(traversals), "distinctUsedWays": len(used_ways),
            "repeatedExtraMeters": round(repeat_meters, 6),
            "meters": round(meters, 6), "speedAssumptionMps": 1.0, "exactWalkingMinutes": walk,
            "displayWalkingMinutes": math.ceil(walk), "storyQuestMinutes": stories, "reserveMinutes": reserve,
            "displayTotalMinutes": math.ceil(walk)+stories+reserve, "budgetMinutes": budget,
            "field": "OPEN", "actualGpsConnectors": "NOT_CALCULATED",
            "geometricObstacleIntersectionsWithoutSharedNodes": "NOT_VALIDATED"}


def validate_context(context, fragment, route, full_source=None):
    """Check the exact mapped locator association; never add context as route edges."""
    require(context["provenance"]["snapshotSha256"] == SOURCE_SHA and
            context["provenance"]["sourcePbfSha256"] == PBF_SHA and context["fieldVerified"] is False,
            "Context provenance/field label mismatch")
    records = {(e["type"], e["id"]): e for e in context["elements"]}
    pieces = {(e["type"], e["id"]): e for e in fragment["elements"]}
    originals = {(e["type"], e["id"]): e for e in full_source["elements"]} if full_source else None
    for key, record in records.items():
        if originals is not None:
            require(originals.get(key) == record, "Context invented or changed a source record")
        if key in pieces:
            require(pieces[key] == record, "Context and routing fragment disagree")
    circle, bridge = records[("way", 384147232)], records[("way", 255969480)]
    require(circle["nodes"][0] == circle["nodes"][-1] and circle["tags"].get("highway") == "footway" and
            circle["tags"].get("layer") == "-1" and 3874361286 in circle["nodes"], "Round Square circle evidence changed")
    require(bridge["tags"].get("bridge") == "yes" and bridge["tags"].get("layer") == "1" and
            bridge["tags"].get("foot") == "no", "Bridge context lost grade/access evidence")
    require(not set(circle["nodes"]).intersection(bridge["nodes"]), "Circle and vehicle bridge share a node")
    used_nodes = {n for leg in route["legs"] for n in leg["osmNodeIds"]}
    used_ways = {w for leg in route["legs"] for w in leg["sourceWayIds"]}
    require(not used_nodes.intersection(bridge["nodes"]) and 255969480 not in used_ways,
            "Vehicle bridge entered the pedestrian proof")
    require(255969480 in context["notRoutingEdges"], "Vehicle bridge must stay context-only")
    for node in circle["nodes"]:
        require(("node", node) in records, "Context circle lacks coordinate descendants")
    require("https://www.gov.kz/org/astana/press/news/details/901398?lang=ru" in context["locatorSources"],
            "Primary geographic locator missing")
    return {"selectedNode": 3874361286, "circleWay": 384147232, "mappedCircleLayer": "-1",
            "vehicleBridgeWay": 255969480, "mappedBridgeLayer": "1", "bridgeUsedForRouting": False,
            "geographicAssociation": "editorial source correspondence, not an OSM name or surveyed coordinate",
            "physicalGradeAndAccessibility": "OPEN"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--route", type=Path, default=Path("data/first-walk/route-candidate.json"))
    parser.add_argument("--fragment", type=Path, default=Path("evidence/first-walk/routing-source.json"))
    parser.add_argument("--context", type=Path, default=Path("evidence/first-walk/routing-source-context.json"))
    parser.add_argument("--witness-only", action="store_true", help="Explicit bounded replay; cannot prove original-source completeness")
    parser.add_argument("--expected-fragment-sha256")
    parser.add_argument("--expected-context-sha256")
    parser.add_argument("--expected-candidate-sha256")
    args = parser.parse_args()
    route, route_hash, route_crlf = load(args.route)
    fragment, fragment_hash, fragment_crlf = load(args.fragment)
    context, context_hash, context_crlf = load(args.context)
    if args.expected_candidate_sha256:
        require(route_hash == args.expected_candidate_sha256, "Candidate checksum mismatch")
    if args.witness_only:
        require(not args.source and not args.metadata, "Witness mode cannot silently mix with full-source mode")
        require(bool(args.expected_fragment_sha256) and bool(args.expected_context_sha256) and
                bool(args.expected_candidate_sha256), "Witness mode requires three expected artifact checksums")
        require(fragment_hash == args.expected_fragment_sha256 and context_hash == args.expected_context_sha256,
                "Witness fragment/context checksum mismatch")
        source, source_hash = fragment, SOURCE_SHA
        metadata = {"fetched_at": fragment["provenance"]["fetchedAt"]}
    else:
        require(args.source is not None and args.metadata is not None,
                "Full-source mode requires --source and --metadata; witness replay must be explicitly requested")
        source, source_hash, _ = load(args.source)
        metadata, _, _ = load(args.metadata)
        require(source_hash == SOURCE_SHA and metadata["sha256"] == source_hash and
                metadata["source_pbf_sha256"] == PBF_SHA, "Trusted source identity failed")
    result = validate(source, metadata, route, fragment, 18, 8, 80)
    result["anchorContext"] = validate_context(context, fragment, route, None if args.witness_only else source)
    if args.witness_only:
        result["status"] = "PASS_FRAGMENT_REPLAY_ONLY"
        result["sourceCompleteness"] = "NOT_PROVEN_WITHOUT_RETAINED_FULL_INPUT"
        result["witnessBarrierWaysRetained"] = result.pop("sourceBarrierWaysRetained")
        result["witnessRelationsRetained"] = result.pop("sourceRelationsRetained")
        result["witnessRecords"] = result.pop("sourceRecordsRetained")
    else:
        result["sourceCompleteness"] = "CROSSCHECKED_AGAINST_PINNED_RETAINED_SNAPSHOT_ONLY"
    result.update(sourceSha256=source_hash, candidateSha256=route_hash, fragmentSha256=fragment_hash,
                  contextSha256=context_hash, candidateHasCrlf=route_crlf, fragmentHasCrlf=fragment_crlf,
                  contextHasCrlf=context_crlf)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
