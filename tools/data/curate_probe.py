"""Keep a tiny attributed source-record slice for offline probe replay.

This removes alternate topology and is NOT a substitute for the full-source
probe or a deployable graph. No synthesized nodes/edges/geometry are added.
"""
import argparse
import hashlib
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--pairs", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    raw = args.source.read_bytes()
    source = json.loads(raw)
    results = json.loads(args.results.read_text(encoding="utf-8"))
    pairs = json.loads(args.pairs.read_text(encoding="utf-8"))
    digest = hashlib.sha256(raw).hexdigest()
    if digest != results["source_sha256"] or digest != pairs["source_sha256"]:
        raise ValueError("Curated replay source/probe/manifest mismatch")
    ways = {e["id"]: e for e in source["elements"] if e["type"] == "way"}
    way_ids = {w for p in results["pairs"] for w in p["result"].get("way_ids", [])}
    node_ids = {p[k] for p in pairs["pairs"] for k in ("start_osm_node", "end_osm_node") if k in p}
    # Preserve adjacent source ways for negative node cases (e.g. unknown gate).
    for way in ways.values():
        if node_ids.intersection(way["nodes"]):
            way_ids.add(way["id"])
    node_ids.update(n for w in way_ids for n in ways[w]["nodes"])
    for way in ways.values():
        if way.get("tags", {}).get("barrier") and node_ids.intersection(way["nodes"]):
            way_ids.add(way["id"])
    node_ids.update(n for w in way_ids for n in ways[w]["nodes"])
    elements = []
    for e in source["elements"]:
        if ((e["type"] == "node" and e["id"] in node_ids) or
            (e["type"] == "way" and e["id"] in way_ids) or
            (e["type"] == "relation" and any(m["type"] == "way" and m["ref"] in way_ids for m in e.get("members", [])))):
            elements.append(e)
    result = {"mode": "recorded_public_source_slice_for_replay_not_full_graph",
              "source": results["source"], "attribution": results["attribution"],
              "license_url": results["license_url"],
              "limitations": "Alternate topology removed; replay is NOT live/GPS/field or full-graph acceptance",
              "elements": elements}
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"retained_source_records": len(elements), "bytes": args.output.stat().st_size}))


if __name__ == "__main__":
    main()
