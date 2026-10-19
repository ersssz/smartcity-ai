"""Retain linear barriers sharing mapped nodes with the bounded graph.

One local PBF way-only pass. No network, no invented geometric intersections.
Barrier references outside the graph need no coordinates: only shared nodes
block graph traversal. Original source and augmented hashes remain distinct.
"""
import argparse
import hashlib
import json
from pathlib import Path
import time


def merge_barriers(document, barrier_ways):
    nodes = {e["id"] for e in document["elements"] if e["type"] == "node"}
    elements = {(e["type"], e["id"]): e for e in document["elements"]}
    count = 0
    for way in barrier_ways:
        if way.get("tags", {}).get("barrier") and nodes.intersection(way["nodes"]):
            key = ("way", way["id"])
            elements[key] = {**elements.get(key, {}), **way}
            count += 1
    return {**document, "elements": [elements[k] for k in sorted(elements)]}, count


def main():
    import osmium  # Pinned optional local importer, not required by stdlib tests.

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pbf", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    metadata = json.loads(args.metadata.read_text(encoding="utf-8-sig"))
    raw = args.source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != metadata["sha256"]:
        raise ValueError("Base graph SHA-256 mismatch")
    with args.pbf.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != metadata["source_pbf_sha256"]:
            raise ValueError("PBF SHA-256 mismatch")
    document = json.loads(raw)
    node_ids = {e["id"] for e in document["elements"] if e["type"] == "node"}

    class Barriers(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.ways = []

        def way(self, way):
            if "barrier" not in way.tags:
                return
            refs = [n.ref for n in way.nodes]
            if node_ids.intersection(refs):
                self.ways.append({"type": "way", "id": way.id, "nodes": refs, "tags": dict(way.tags)})

    started = time.monotonic()
    handler = Barriers()
    handler.apply_file(str(args.pbf))
    augmented, count = merge_barriers(document, handler.ways)
    output = (json.dumps(augmented, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(output)
    meta = {**metadata, "base_graph_sha256": metadata["sha256"],
            "sha256": hashlib.sha256(output).hexdigest(), "bytes": len(output),
            "elements": len(augmented["elements"]), "linear_barrier_ways": count,
            "barrier_export_seconds": round(time.monotonic() - started, 3),
            "barrier_exporter": "augment_barriers.py with osmium==4.3.2"}
    args.out.with_suffix(".metadata.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
