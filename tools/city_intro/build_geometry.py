"""Build small, exact-coordinate city overview GeoJSON from cached OSM witnesses.

Python standard library only. No topology repair, coordinate invention, clipping,
or simplification: input endpoint IDs must form closed, degree-two rings.
"""
from __future__ import annotations

from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path

from fetch_sources import ROOT, DEST, DISTRICTS

OUT = ROOT / "data" / "city-intro"
NAMES = {"almaty": "Алматы", "baikonyr": "Байқоңыр", "esil": "Есиль", "nura": "Нұра", "saryarka": "Сарыарка", "sarayshyq": "Сарайшық"}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_source(filename):
    path = DEST / filename
    receipt = json.loads((DEST / (filename + ".receipt.json")).read_text(encoding="utf-8"))
    if sha(path) != receipt["sha256"]:
        raise ValueError("Source hash mismatch: " + filename)
    return json.loads(path.read_bytes()), receipt


def area(ring):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:])) / 2


def contains(ring, p):
    x, y = p
    inside = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def in_polygon(poly, p):
    return contains(poly[0], p) and not any(contains(hole, p) for hole in poly[1:])


def bounds(points):
    points = list(points)
    return [min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)]


def combine_rings(way_ids, ways, nodes):
    at = defaultdict(list)
    remaining = set(way_ids)
    for way_id in way_ids:
        way = ways[way_id]["nodes"]
        if len(way) < 2:
            raise ValueError("Short way")
        at[way[0]].append(way_id)
        at[way[-1]].append(way_id)
    if any(len(ids) != 2 for ids in at.values()):
        raise ValueError("Boundary is not a degree-two endpoint graph")
    rings = []
    while remaining:
        first = min(remaining)
        ids = list(ways[first]["nodes"])
        remaining.remove(first)
        while ids[-1] != ids[0]:
            options = [i for i in at[ids[-1]] if i in remaining]
            if len(options) != 1:
                raise ValueError("Ambiguous or open boundary")
            way_id = options[0]
            next_ids = ways[way_id]["nodes"]
            if next_ids[0] != ids[-1]:
                next_ids = list(reversed(next_ids))
            ids.extend(next_ids[1:])
            remaining.remove(way_id)
        ring = [[nodes[i]["lon"], nodes[i]["lat"]] for i in ids]
        if len(ring) < 4 or abs(area(ring)) < 1e-10:
            raise ValueError("Degenerate ring")
        rings.append(ring)
    return rings


def seg_distance(p, a, b):
    # Fixed local longitude scale is enough for selecting an interior label.
    x, y = p[0] * 0.628, p[1]
    ax, ay, bx, by = a[0] * 0.628, a[1], b[0] * 0.628, b[1]
    norm = (bx - ax) ** 2 + (by - ay) ** 2
    t = max(0, min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / norm)) if norm else 0
    return math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay))


def label_point(polygons):
    poly = max(polygons, key=lambda p: abs(area(p[0])))
    w, s, e, n = bounds(poly[0])
    candidates = [[w + (e - w) * (x + .5) / 31, s + (n - s) * (y + .5) / 31] for x in range(31) for y in range(31)]
    candidates = [p for p in candidates if in_polygon(poly, p)]
    if not candidates:
        raise ValueError("No interior label point")
    p = max(candidates, key=lambda p: min(seg_distance(p, a, b) for ring in poly for a, b in zip(ring, ring[1:])))
    return [round(p[0], 7), round(p[1], 7)]


def orient(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def proper_cross(a, b, c, d):
    if max(a[0], b[0]) <= min(c[0], d[0]) or max(c[0], d[0]) <= min(a[0], b[0]) or max(a[1], b[1]) <= min(c[1], d[1]) or max(c[1], d[1]) <= min(a[1], b[1]):
        return False
    return orient(a, b, c) * orient(a, b, d) < -1e-22 and orient(c, d, a) * orient(c, d, b) < -1e-22


def validate_self(ring):
    edges = list(zip(ring, ring[1:]))
    for i, (a, b) in enumerate(edges):
        for j in range(i + 2, len(edges)):
            if i == 0 and j == len(edges) - 1:
                continue
            if proper_cross(a, b, *edges[j]):
                raise ValueError(f"Proper self-intersection edges {i},{j}")


def main():
    features, metadata, sources, all_ways, all_nodes = [], [], [], {}, {}
    for district_id, relation_id in DISTRICTS.items():
        data, receipt = load_source(district_id + ".json")
        elements = data["elements"]
        nodes = {e["id"]: e for e in elements if e["type"] == "node"}
        ways = {e["id"]: e for e in elements if e["type"] == "way"}
        rel = next(e for e in elements if e["type"] == "relation" and e["id"] == relation_id)
        if rel["tags"].get("boundary") != "administrative" or rel["tags"].get("admin_level") != "6":
            raise ValueError("Not an expected city district")
        outer_ids = [m["ref"] for m in rel["members"] if m["type"] == "way" and m["role"] == "outer"]
        inner_ids = [m["ref"] for m in rel["members"] if m["type"] == "way" and m["role"] == "inner"]
        outer = combine_rings(outer_ids, ways, nodes)
        inner = combine_rings(inner_ids, ways, nodes) if inner_ids else []
        polygons = [[ring if area(ring) > 0 else list(reversed(ring))] for ring in outer]
        for ring in inner:
            owners = [p for p in polygons if contains(p[0], ring[0])]
            if len(owners) != 1:
                raise ValueError("Ambiguous inner-ring assignment")
            owners[0].append(ring if area(ring) < 0 else list(reversed(ring)))
        for poly in polygons:
            for ring in poly:
                validate_self(ring)
        b = bounds(p for poly in polygons for ring in poly for p in ring)
        center = label_point(polygons)
        assert any(in_polygon(poly, center) for poly in polygons)
        geometry = {"type": "Polygon", "coordinates": polygons[0]} if len(polygons) == 1 else {"type": "MultiPolygon", "coordinates": polygons}
        features.append({"type": "Feature", "properties": {"id": district_id, "nameRu": NAMES[district_id], "sourceRelationId": relation_id}, "geometry": geometry})
        metadata.append({"id": district_id, "center": center, "bounds": b, "sourceRelationId": relation_id, "sourceVersion": rel["version"], "sourceTimestamp": rel["timestamp"], "ringCount": sum(len(p) for p in polygons), "coordinateCount": sum(len(ring) for p in polygons for ring in p)})
        sources.append({"id": district_id, **receipt})
        for key, value in ways.items():
            if key in all_ways and all_ways[key]["nodes"] != value["nodes"]:
                raise ValueError("Source way changed during snapshot")
            all_ways[key] = value
        for key, value in nodes.items():
            if key in all_nodes and (all_nodes[key]["lon"], all_nodes[key]["lat"]) != (value["lon"], value["lat"]):
                raise ValueError("Source node changed during snapshot")
            all_nodes[key] = value
    # Detect proper crossing or interior containment between independently named
    # district boundaries. Shared source vertices/edges are allowed adjacency.
    crossings = []
    overlaps = []
    polygon_interiors = {}
    for feature in features:
        geometry = feature["geometry"]
        for poly in geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]:
            polygon_interiors[id(poly)] = label_point([poly])
    for i, first in enumerate(features):
        first_polys = first["geometry"]["coordinates"] if first["geometry"]["type"] == "MultiPolygon" else [first["geometry"]["coordinates"]]
        for second in features[i + 1:]:
            second_polys = second["geometry"]["coordinates"] if second["geometry"]["type"] == "MultiPolygon" else [second["geometry"]["coordinates"]]
            for p1 in first_polys:
                for p2 in second_polys:
                    for a, b in zip(p1[0], p1[0][1:]):
                        for c, d in zip(p2[0], p2[0][1:]):
                            if proper_cross(a, b, c, d):
                                crossings.append({"first": first["properties"]["id"], "second": second["properties"]["id"], "segments": [[a, b], [c, d]]})
                    for source_poly, target_poly in [(p1, p2), (p2, p1)]:
                        candidates = [polygon_interiors[id(source_poly)]] + source_poly[0][:-1] + [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] for a, b in zip(source_poly[0], source_poly[0][1:])]
                        for point in candidates:
                            if in_polygon(target_poly, point) and min(seg_distance(point, a, b) for ring in target_poly for a, b in zip(ring, ring[1:])) > 1e-9:
                                overlaps.append({"first": first["properties"]["id"], "second": second["properties"]["id"], "interiorWitness": point})
                                break
    if crossings or overlaps:
        raise ValueError("OSM district topology overlaps/crosses: " + json.dumps({"crossings": crossings, "overlaps": overlaps}))
    river_data, river_receipt = load_source("esil-river-relation.json")
    river_rel = next(e for e in river_data["elements"] if e["type"] == "relation" and e["id"] == 157622)
    river_way_ids = sorted({m["ref"] for m in river_rel["members"] if m["type"] == "way" and m["role"] == "main_stream" and m["ref"] in all_ways})
    lines = [[[all_nodes[node]["lon"], all_nodes[node]["lat"]] for node in all_ways[way_id]["nodes"]] for way_id in river_way_ids]
    if not lines:
        raise ValueError("No actual river main stream available")
    river_endpoints = defaultdict(list)
    for way_id in river_way_ids:
        for node_id in [all_ways[way_id]["nodes"][0], all_ways[way_id]["nodes"][-1]]:
            river_endpoints[node_id].append(way_id)
    unseen, river_component_count = set(river_way_ids), 0
    while unseen:
        pending = [unseen.pop()]
        river_component_count += 1
        while pending:
            way_id = pending.pop()
            for node_id in [all_ways[way_id]["nodes"][0], all_ways[way_id]["nodes"][-1]]:
                for neighbour in river_endpoints[node_id]:
                    if neighbour in unseen:
                        unseen.remove(neighbour)
                        pending.append(neighbour)
    river = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"id": "esil-river", "nameRu": "Есиль (Ишим)", "sourceRelationId": 157622}, "geometry": {"type": "MultiLineString", "coordinates": lines}}]}
    city_bounds = [min(d["bounds"][0] for d in metadata), min(d["bounds"][1] for d in metadata), max(d["bounds"][2] for d in metadata), max(d["bounds"][3] for d in metadata)]
    district_geo = {"type": "FeatureCollection", "features": features}
    write("districts.geojson", district_geo)
    write("river.geojson", river)
    result = {
        "schemaVersion": 1,
        "generatedFrom": "OpenStreetMap API exact-coordinate witnesses; no simplification or image tracing",
        "coordinateReferenceSystem": "WGS84 longitude,latitude",
        "legalStatus": "Community mapping overview; not a legal cadastral or administrative boundary determination",
        "bounds": city_bounds,
        "districts": metadata,
        "river": {"sourceRelationId": 157622, "sourceTimestamp": river_rel["timestamp"], "mainStreamWayIds": river_way_ids, "bounds": bounds(p for line in lines for p in line), "coordinateCount": sum(len(line) for line in lines), "connectedComponents": river_component_count, "scope": "Only actual main_stream ways also present in the six district source witnesses; not the full river, no connector segments fabricated", "knownLimitation": "Three connected components; two short source gaps near the western dam/canal area are preserved, not filled. East and west ends are the extracted urban segment, not river sources or mouths."},
        "officialContext": {"checkedOn": "2026-10-20", "url": "https://old.adilet.zan.kz/rus/docs/P2600000697", "publicationEvidenceUrl": "https://old.adilet.zan.kz/rus/docs/P2600000697/history", "adoptedOn": "2026-08-04", "firstPublishedOn": "2026-08-07", "effectiveOn": "2026-08-08", "districtCount": 6, "limitation": "Official text confirms the six districts and describes boundaries. This package does not certify that OSM coordinates exactly implement that legal text; several OSM relations predate the act."},
        "sources": [*sources, {"id": "esil-river-relation", **river_receipt}],
        "license": {"name": "Open Database License 1.0", "url": "https://opendatacommons.org/licenses/odbl/1-0/", "attribution": "© OpenStreetMap contributors", "attributionUrl": "https://www.openstreetmap.org/copyright"},
        "bankLabelPoints": {"left": [71.401, 51.138], "right": [71.405, 51.177]},
        "bankLabelPointBasis": "Editorial label anchors in the urban centre, not whole-bank polygons. Right anchor is in Saryarka north of the local westward-flowing main-stream segment; left anchor is in Nura south of it. Validated against actual directed OSM river geometry and district interiors. Administrative district boundaries and bank division are different concepts.",
        "checks": {"districtCount": len(features), "closedDegreeTwoRings": True, "interiorLabelPoints": True, "properSelfIntersections": 0, "properCrossingsBetweenDistricts": len(crossings), "interiorOverlapWitnesses": overlaps, "crossings": crossings},
        "artifacts": {name: {"sha256": sha(OUT / name), "bytes": (OUT / name).stat().st_size} for name in ["districts.geojson", "river.geojson"]},
    }
    by_id = {f["properties"]["id"]: f for f in features}
    for bank, district_id, wanted_sign in [("left", "nura", 1), ("right", "saryarka", -1)]:
        point = result["bankLabelPoints"][bank]
        geom = by_id[district_id]["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        if not any(in_polygon(poly, point) for poly in polys):
            raise ValueError("Bank label anchor outside expected district")
        nearest = min(((seg_distance(point, a, b), a, b) for line in lines for a, b in zip(line, line[1:])), key=lambda item: item[0])
        if orient(nearest[1], nearest[2], point) * wanted_sign <= 0:
            raise ValueError("Bank label on wrong side of directed river")
    write("metadata.json", result)
    print(json.dumps({"districts": metadata, "bounds": city_bounds, "properCrossingsBetweenDistricts": len(crossings), "riverWayIds": river_way_ids, "artifacts": result["artifacts"]}, ensure_ascii=False, indent=2))


def write(filename, data):
    (OUT / filename).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
