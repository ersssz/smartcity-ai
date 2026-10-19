"""Public ingestion seam; synthetic records never represent live field evidence."""
import hashlib
import json
import unittest
from pathlib import Path
import subprocess
import sys
import tempfile

from tools.data.ingest_poi import normalize, resolve_field


class IngestionTests(unittest.TestCase):
    def test_cli_exports_utf8_lf_so_git_transport_preserves_checksums(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            raw = json.dumps({"elements": [{"type": "node", "id": 7, "lat": 51.13, "lon": 71.43,
                "tags": {"name": "Синтетическая карточка", "amenity": "cafe"}}]}).encode()
            (folder / "raw.json").write_bytes(raw)
            (folder / "meta.json").write_text(json.dumps({"sha256": hashlib.sha256(raw).hexdigest(),
                "fetched_at": "2026-10-19T00:00:00Z", "endpoint": "fixture"}), encoding="utf-8")
            subprocess.run([sys.executable, "-m", "tools.data.ingest_poi", "--raw", str(folder / "raw.json"),
                "--metadata", str(folder / "meta.json"), "--as-of", "2026-10-20T00:00:00Z", "--out", str(folder / "out.json")],
                check=True, capture_output=True)
            output = (folder / "out.json").read_bytes()
            self.assertNotIn(b"\r\n", output)
            self.assertIn("Синтетическая карточка".encode("utf-8"), output)

    def test_repeated_osm_id_keeps_full_tags_without_claiming_verified_entrance(self):
        raw = json.dumps({"elements": [
            {"type": "node", "id": 7, "lat": 51.13, "lon": 71.43,
             "tags": {"name": "Fixture cafe", "amenity": "cafe"}},
            {"type": "node", "id": 7, "lat": 51.13, "lon": 71.43},
        ]}).encode()
        meta = {"sha256": hashlib.sha256(raw).hexdigest(),
                "fetched_at": "2026-10-20T00:00:00Z", "endpoint": "fixture"}
        result = normalize(raw, meta, now="2026-10-20T01:00:00Z")
        self.assertEqual(len(result["cards"]), 1)
        card = result["cards"][0]
        self.assertEqual(card["id"], "osm:node/7")
        self.assertEqual(card["fields"]["name"]["value"], "Fixture cafe")
        self.assertEqual(card["fields"]["outdoor_anchor"]["state"], "unknown")
        self.assertEqual(result["coverage"]["repeated_osm_ids_removed"], 1)

    def test_conflicting_current_hours_preserve_both_sources_and_explicit_preference(self):
        # Synthetic schedule conflict verifies policy, not the live conflict gate.
        values = [
            {"value": "10:00-22:00", "source_ref": "fixture-osm", "source_kind": "osm",
             "observed_at": "2026-10-19T00:00:00Z", "valid_until": "2026-10-26T00:00:00Z"},
            {"value": "10:00-20:00", "source_ref": "fixture-official", "source_kind": "official",
             "observed_at": "2026-10-19T00:00:00Z", "valid_until": "2026-10-26T00:00:00Z"},
        ]
        field = resolve_field(values, at="2026-10-20T00:00:00Z")
        self.assertEqual(field["state"], "conflicting")
        self.assertIsNone(field["value"])
        self.assertEqual(field["preferred_source_ref"], "fixture-official")
        self.assertEqual(set(field["source_refs"]), {"fixture-osm", "fixture-official"})

    def test_season_specific_evidence_cannot_claim_current_season_or_expired_hours(self):
        summer = [{"value": "10:00-22:00", "source_ref": "fixture-summer", "source_kind": "official",
                   "observed_at": "2026-06-01T00:00:00Z", "valid_from": "2026-06-01T00:00:00Z",
                   "valid_until": "2026-09-01T00:00:00Z"}]
        self.assertEqual(resolve_field(summer, at="2026-10-20T00:00:00Z")["state"], "stale")
        self.assertEqual(resolve_field(summer, at="2026-05-01T00:00:00Z")["state"], "unknown")

    def test_stale_snapshot_and_unparsed_hours_never_claim_current_indoor_availability(self):
        raw = json.dumps({"elements": [{"type": "way", "id": 15, "center": {"lat": 51.13, "lon": 71.43},
                         "tags": {"name": "Fixture museum", "tourism": "museum", "opening_hours": "PH off"}}]}).encode()
        meta = {"sha256": hashlib.sha256(raw).hexdigest(), "fetched_at": "2026-10-01T00:00:00Z", "endpoint": "fixture"}
        card = normalize(raw, meta, now="2026-10-20T00:00:00Z")["cards"][0]
        self.assertEqual(card["fields"]["coordinates"]["state"], "stale")
        self.assertEqual(card["fields"]["opening_hours"]["state"], "unknown")
        self.assertEqual(card["fields"]["opening_hours"]["raw"], "PH off")

    def test_source_checksum_mismatch_is_rejected_instead_of_normalized(self):
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            normalize(b'{"elements":[]}', {"sha256": "00"}, now="2026-10-20T00:00:00Z")

    def test_newer_osm_version_wins_even_when_it_removes_old_tags(self):
        raw = json.dumps({"elements": [
            {"type": "node", "id": 9, "version": 1, "lat": 51.13, "lon": 71.43,
             "tags": {"name": "Old name", "amenity": "cafe", "opening_hours": "24/7"}},
            {"type": "node", "id": 9, "version": 2, "lat": 51.13, "lon": 71.43,
             "tags": {"name": "New name", "amenity": "cafe"}},
        ]}).encode()
        meta = {"sha256": hashlib.sha256(raw).hexdigest(), "fetched_at": "2026-10-20T00:00:00Z", "endpoint": "fixture"}
        card = normalize(raw, meta, now="2026-10-20T01:00:00Z")["cards"][0]
        self.assertEqual(card["fields"]["name"]["value"], "New name")
        self.assertIsNone(card["fields"]["opening_hours"]["raw"])

    def test_graph_only_barrier_record_without_center_is_quarantined(self):
        raw = json.dumps({"elements": [{"type": "way", "id": 99, "nodes": [1, 2],
                         "tags": {"name": "Fixture park fence", "leisure": "park", "barrier": "fence"}}]}).encode()
        meta = {"sha256": hashlib.sha256(raw).hexdigest(), "fetched_at": "2026-10-20T00:00:00Z", "endpoint": "fixture"}
        result = normalize(raw, meta, now="2026-10-20T01:00:00Z")
        self.assertEqual(result["cards"], [])
        self.assertEqual(result["coverage"]["quarantined_records"][0]["id"], "osm:way/99")


if __name__ == "__main__":
    unittest.main()
