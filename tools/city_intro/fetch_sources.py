"""Bounded, explicit one-off OSM source acquisition; never called by the app.

No credentials, paid services, dependency installation, polygon tracing or guesses.
Cached sources are immutable until explicitly removed by a human.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import time
from urllib.request import Request, urlopen
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "data" / "city-intro" / "source"
DISTRICTS = {
    "almaty": 3482819,
    "baikonyr": 8593081,
    "esil": 3479876,
    "nura": 20593940,
    "saryarka": 3486954,
    "sarayshyq": 19733918,
}
UA = "AstanaAI-local-research/0.2 (bounded one-off city introduction source acquisition)"


def fetch(relative: str, filename: str) -> dict:
    DEST.mkdir(parents=True, exist_ok=True)
    path = DEST / filename
    receipt_path = DEST / (filename + ".receipt.json")
    url = "https://api.openstreetmap.org/api/0.6/" + relative
    if not path.exists():
        with urlopen(Request(url, headers={"User-Agent": UA}), timeout=35) as response:
            raw = response.read(12_000_001)
        if len(raw) > 12_000_000:
            raise ValueError("Refusing an unexpectedly large bounded source")
        parsed = json.loads(raw)
        if "elements" not in parsed:
            raise ValueError("Not an OSM API response")
        path.write_bytes(raw)
        receipt_path.write_text(json.dumps({
            "url": url,
            "retrievedAtUtc": datetime.now(timezone.utc).isoformat(),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw),
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        time.sleep(1.1)
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != receipt["sha256"]:
        raise ValueError(f"Cached source changed: {path}")
    print(filename, len(raw), receipt["sha256"])
    return json.loads(raw)


if __name__ == "__main__":
    for district_id, relation_id in DISTRICTS.items():
        fetch(f"relation/{relation_id}/full.json", district_id + ".json")
    # Only the relation membership list, not the entire 2,000+ km river.
    fetch("relation/157622.json", "esil-river-relation.json")
    # Fill only two short actual main-stream gaps identified by source node IDs.
    # Node-way membership witnesses prevent an invented straight connector.
    for node_id in [260185599, 10841611178]:
        fetch(f"node/{node_id}/ways.json", f"river-gap-node-{node_id}-ways.json")
