"""Probe contract tests with a tiny synthetic graph, not ten real city pairs."""
import unittest

from tools.data.probe_walking import probe


class ProbeTests(unittest.TestCase):
    def test_rejects_wrong_size_or_repeated_cases_before_claiming_baseline(self):
        for pairs in ([], [{"id": "duplicate"}] * 10):
            with self.subTest(count=len(pairs)), self.assertRaises(ValueError):
                probe({"elements": []}, pairs)

    def test_mismatched_expectation_is_reported_and_does_not_accept_live_gates(self):
        document = {"elements": [
            {"type": "node", "id": 1, "lon": 71.42, "lat": 51.13},
            {"type": "node", "id": 2, "lon": 71.421, "lat": 51.13},
            {"type": "way", "id": 1, "nodes": [1, 2], "tags": {"highway": "footway"}}]}
        pairs = [{"id": f"fixture-{i}", "category": "synthetic",
                  "start_osm_node": 1, "end_osm_node": 2, "expected_kind": "no_path_in_snapshot"}
                 for i in range(10)]
        result = probe(document, pairs)
        self.assertFalse(any(p["technical_expectation_met"] for p in result["pairs"]))
        self.assertEqual(result["acceptance"]["actual_gps_origin"], "PENDING")
        self.assertEqual(result["acceptance"]["field"], "NOT_TESTED")


if __name__ == "__main__":
    unittest.main()
