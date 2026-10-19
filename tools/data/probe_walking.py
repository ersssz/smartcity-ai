"""Bounded local public-node routing probe. No HTTP, keys, SQL or personal GPS."""
import argparse
import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path

from tools.data.walking import WalkingGraph


def probe(document, pairs):
    """Evaluate exactly ten independently specified public-node/negative cases."""
    if len(pairs) != 10 or len({p["id"] for p in pairs}) != 10:
        raise ValueError("Exactly 10 distinct public research pairs required")
    graph = WalkingGraph(document)
    results = []
    for pair in pairs:
        started = time.perf_counter()
        if "start_osm_node" in pair:
            result = graph.route(pair["start_osm_node"], pair["end_osm_node"])
        else:
            result = graph.route_points(pair["public_start"], pair["public_end"])
        results.append({"id": pair["id"], "category": pair["category"],
                        "expected_kind": pair["expected_kind"],
                        "technical_expectation_met": result["kind"] == pair["expected_kind"],
                        "elapsed_ms": round((time.perf_counter() - started) * 1000, 3),
                        "result": result})
    return {"format_version": 1, "mode": "local_public_osm_graph_probe",
            "generated_at": datetime.now(timezone.utc).isoformat(), "graph": graph.stats,
            "walk_node_count": len(graph.walk_nodes), "pairs": results,
            "acceptance": {"hosted_foot_provider": "PENDING", "actual_gps_origin": "PENDING",
                           "managed_pgrouting_resources_latency": "PENDING", "field": "NOT_TESTED"},
            "limitations": ["Local research algorithm, not deployed routing fallback",
                            "Only exact public OSM graph nodes; no snap or unverified connectors",
                            "Mapped paths do not prove legal/current access, pavement, entrances or winter safety",
                            "Wall/path geometric obstacle intersections without shared OSM nodes are not validated",
                            "Missing routes mean snapshot/model limits, not proven city-wide impossibility"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--pairs", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    raw = args.source.read_bytes()
    metadata = json.loads(args.metadata.read_text(encoding="utf-8-sig"))
    if hashlib.sha256(raw).hexdigest() != metadata["sha256"]:
        raise ValueError("Routing source SHA-256 mismatch")
    result = probe(json.loads(raw), json.loads(args.pairs.read_text(encoding="utf-8"))["pairs"])
    result["source"] = metadata
    result["source_sha256"] = hashlib.sha256(raw).hexdigest()
    result["source_osm_timestamp"] = json.loads(raw).get("osm3s", {}).get("timestamp_osm_base")
    result["attribution"] = "© OpenStreetMap contributors; ODbL 1.0"
    result["license_url"] = "https://www.openstreetmap.org/copyright"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"pairs": len(result["pairs"]), "technical_expectations_met":
                      sum(p["technical_expectation_met"] for p in result["pairs"])}))
    return 0 if all(p["technical_expectation_met"] for p in result["pairs"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
