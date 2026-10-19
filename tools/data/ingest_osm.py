"""Export a bounded research OSM graph/POI snapshot from a Geofabrik PBF.

Uses pinned ephemeral osmium (see INGESTION.md); no project dependency changes.
Two passes retain complete highway descendants without a countrywide node cache.
"""
import argparse
import hashlib
import json
from pathlib import Path
import time

import osmium


BBOX = (51.115, 71.40, 51.160, 71.45)  # south, west, north, east


def is_poi(tags):
    return bool(any(k == "name" or k.startswith("name:") for k in tags) and
                ("tourism" in tags or "historic" in tags or tags.get("leisure") == "park" or
                 tags.get("amenity") in {"cafe", "restaurant", "theatre", "cinema", "library", "place_of_worship"}))


def extract(path, bbox=BBOX):
    south, west, north, east = bbox

    class Selection(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.inside = set()
            self.ways = {}
            self.nodes = {}
            self.relations = []
            self.needed = set()

        def node(self, node):
            if not node.location.valid():
                return
            if south <= node.location.lat <= north and west <= node.location.lon <= east:
                self.inside.add(node.id)
                tags = dict(node.tags)
                if is_poi(tags) or "barrier" in tags:
                    self.nodes[node.id] = {"type": "node", "id": node.id, "lat": node.location.lat,
                                           "lon": node.location.lon, "tags": tags}

        def way(self, way):
            tags = dict(way.tags)
            if "highway" not in tags and not is_poi(tags):
                return
            refs = [node.ref for node in way.nodes]
            if not any(ref in self.inside for ref in refs):
                return
            self.ways[way.id] = {"type": "way", "id": way.id, "nodes": refs, "tags": tags}
            self.needed.update(refs)

        def relation(self, relation):
            tags = dict(relation.tags)
            if tags.get("type") == "restriction" and any(member.type == "w" and member.ref in self.ways for member in relation.members):
                self.relations.append({"type": "relation", "id": relation.id, "tags": tags,
                                       "members": [{"type": {"n": "node", "w": "way", "r": "relation"}[m.type],
                                                    "ref": m.ref, "role": m.role} for m in relation.members]})

    selection = Selection()
    selection.apply_file(str(path))
    print(f"Selected {len(selection.ways)} ways; resolving {len(selection.needed)} node descendants", flush=True)

    class Descendants(osmium.SimpleHandler):
        def node(self, node):
            if node.id in selection.needed and node.location.valid():
                selection.nodes[node.id] = {"type": "node", "id": node.id, "lat": node.location.lat,
                                            "lon": node.location.lon, "tags": dict(node.tags)}

    Descendants().apply_file(str(path))
    missing = selection.needed - selection.nodes.keys()
    if missing:
        raise ValueError(f"Missing {len(missing)} highway/POI descendants; refusing incomplete graph")
    for way in selection.ways.values():
        coords = [selection.nodes[ref] for ref in way["nodes"]]
        way["center"] = {"lat": (min(n["lat"] for n in coords) + max(n["lat"] for n in coords)) / 2,
                         "lon": (min(n["lon"] for n in coords) + max(n["lon"] for n in coords)) / 2}
    return {"elements": [selection.nodes[k] for k in sorted(selection.nodes)] +
                         [selection.ways[k] for k in sorted(selection.ways)] +
                         sorted(selection.relations, key=lambda x: x["id"])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pbf", required=True, type=Path)
    parser.add_argument("--pbf-metadata", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    metadata = json.loads(args.pbf_metadata.read_text(encoding="utf-8-sig"))
    with args.pbf.open("rb") as source:
        actual = hashlib.file_digest(source, "sha256").hexdigest()
    if actual != metadata["sha256"]:
        raise ValueError("PBF SHA-256 mismatch")
    started = time.monotonic()
    result = extract(args.pbf)
    raw = (json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(raw)
    out_meta = {"endpoint": metadata["url"], "source_pbf_sha256": actual,
                "fetched_at": metadata["fetched_at"], "sha256": hashlib.sha256(raw).hexdigest(),
                "license": "ODbL-1.0", "bbox_south_west_north_east": list(BBOX),
                "source_format": "Geofabrik OSM PBF converted locally; Overpass-shaped JSON is an internal format",
                "exporter": "osmium==4.3.2", "elements": len(result["elements"]),
                "bytes": len(raw), "export_seconds": round(time.monotonic()-started, 3)}
    args.out.with_suffix(".metadata.json").write_text(json.dumps(out_meta, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(out_meta, indent=2))


if __name__ == "__main__":
    main()
