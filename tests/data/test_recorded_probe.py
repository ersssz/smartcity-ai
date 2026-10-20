"""Replay of attributed real public records; does not grant live/field acceptance."""
import json
from pathlib import Path
import unittest

from tools.data.probe_walking import probe


class RecordedProbeTests(unittest.TestCase):
    def test_ten_sourced_cases_replay_without_network_or_a_provider_key(self):
        root = Path(__file__).resolve().parents[2]
        snapshot = json.loads((root / "data/curated/walking-probe-replay.json").read_text(encoding="utf-8"))
        manifest = json.loads((root / "data/curated/walking-pairs.json").read_text(encoding="utf-8"))
        self.assertEqual(snapshot["source"]["sha256"], manifest["source_sha256"])
        result = probe(snapshot, manifest["pairs"])
        failures = [p["id"] for p in result["pairs"] if not p["technical_expectation_met"]]
        self.assertEqual(failures, [])
        self.assertEqual(result["acceptance"]["field"], "NOT_TESTED")


if __name__ == "__main__":
    unittest.main()
