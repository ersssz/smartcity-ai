"""Build seam tests use real PCM/MP3 files, not neural-model acceptance."""
import hashlib
import json
import math
import os
import shutil
import struct
import subprocess
import tempfile
import unittest
import wave
from pathlib import Path

from build_narration_corpus import build_corpus, owned_root, writer_lock


class CorpusBuildTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="astana-corpus-test-")
        self.root = Path(self.temporary.name)
        self.ffmpeg = Path(shutil.which("ffmpeg") or "missing-explicit-test-ffmpeg")
        self.calls = []
        self.corpus = {"schemaVersion": 1, "kind": "canonical-prepared-narration-corpus",
                       "sourceBundleHash": "a" * 64, "contentRevision": "fixture-content-1",
                       "narrationFormat": "contracts.narrationEntries.v1", "textFormatting": "none",
                       "entries": [{"id": f"cue:{n}:ru", "locale": "ru", "text": text,
                                    "textSha256": hashlib.sha256(text.encode()).hexdigest()}
                                   for n, text in [("start", "Fixture one."), ("pause", "Fixture two.")]]}
        self.source = self.root / "corpus.json"
        self.source.write_text(json.dumps(self.corpus), encoding="utf-8")
        self.source_sha = hashlib.sha256(self.source.read_bytes()).hexdigest()

    def tearDown(self):
        self.temporary.cleanup()

    def render(self, entry, directory):
        self.calls.append(entry["id"])
        target = directory / "fixture.wav"
        with wave.open(str(target), "wb") as sound:
            sound.setnchannels(1); sound.setsampwidth(2); sound.setframerate(16000)
            sound.writeframes(b"".join(struct.pack("<h", int(1000 * math.sin(i * .2))) for i in range(1600)))
        return {"wavPath": target, "provenance": {"engine": "test-PCM-fixture", "license": "CC0 test fixture",
                                                  "attribution": "Synthetic numeric test signal", "modelSha256": "b" * 64}}

    def build(self, render=None):
        return build_corpus(self.source, self.source_sha, self.root / "cache", self.root / "delivery",
                            self.ffmpeg, "fixture-renderer-v1", render or self.render)

    def test_interruption_reuses_only_verified_finished_files_and_publishes_no_partial_manifest(self):
        def interrupted(entry, directory):
            if entry["id"] == "cue:pause:ru":
                raise InterruptedError("controlled interruption at renderer boundary")
            return self.render(entry, directory)
        with self.assertRaises(InterruptedError):
            self.build(interrupted)
        self.assertFalse((self.root / "delivery/prepared-narration-manifest.json").exists())
        self.calls.clear()
        report = self.build()
        self.assertEqual(self.calls, ["cue:pause:ru"])
        self.assertEqual(report["cacheHits"], 1)
        manifest = json.loads((self.root / "delivery/prepared-narration-manifest.json").read_text())
        self.assertEqual(len(manifest["entries"]), 2)
        for entry in manifest["entries"]:
            file = self.root / "delivery" / entry["path"]
            self.assertEqual(file.name, entry["sha256"] + ".mp3")
            self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(), entry["sha256"])
            self.assertGreater(entry["durationSeconds"], 0)

    def test_complete_rerun_checks_real_cached_bytes_without_rendering_or_changing_manifest(self):
        first = self.build()
        self.calls.clear()
        second = self.build()
        self.assertEqual(self.calls, [])
        self.assertEqual(second["cacheHits"], 2)
        self.assertEqual(second["manifestSha256"], first["manifestSha256"])
        mp3 = next((self.root / "cache/jobs").glob("*/attempt-*/encoded.mp3"))
        mp3.write_bytes(b"corrupt cached bytes")
        with self.assertRaisesRegex(ValueError, "Corrupt finished cache"):
            self.build()
        self.assertEqual(self.calls, [])

    def test_changed_source_and_unowned_output_are_refused_without_rendering(self):
        self.source.write_text("{}")
        with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
            self.build()
        self.assertEqual(self.calls, [])
        self.source.write_text(json.dumps(self.corpus), encoding="utf-8")
        output = self.root / "delivery"; output.mkdir(); (output / "unrelated.txt").write_text("keep")
        with self.assertRaisesRegex(ValueError, "unowned"):
            self.build()
        self.assertEqual((output / "unrelated.txt").read_text(), "keep")

    def test_cache_receipt_path_traversal_cannot_read_an_unrelated_file(self):
        self.build()
        receipt = next((self.root / "cache/jobs").glob("*/receipt.json"))
        value = json.loads(receipt.read_text()); value["cachePath"] = "../../unrelated.mp3"
        receipt.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError, "Unsafe generated path"):
            self.build()

    def test_hardlinked_lock_never_modifies_outside_sentinel(self):
        cache = owned_root(self.root / "cache")
        sentinel = self.root / "outside-lock-sentinel.txt"; sentinel.write_bytes(b"KEEP UNCHANGED")
        os.link(sentinel, cache / ".writer-lock")
        self.assertEqual(sentinel.stat().st_nlink, 2)
        with self.assertRaisesRegex(ValueError, "linked|reparse|regular"):
            with writer_lock(cache):
                self.fail("A hardlinked lock must not be acquired")
        self.assertEqual(sentinel.read_bytes(), b"KEEP UNCHANGED")

    @unittest.skipUnless(os.name == "nt", "Windows junction regression")
    def test_windows_junction_root_and_linked_parent_leave_outside_target_untouched(self):
        target = self.root / "outside-requested-root"; target.mkdir()
        sentinel = target / "sentinel.txt"; sentinel.write_text("must remain unchanged")
        junction = self.root / "cache-junction"
        self.assertTrue(target.resolve().is_relative_to(self.root.resolve()))
        self.assertTrue(junction.absolute().is_relative_to(self.root.absolute()))
        environment = {**os.environ, "ASTANA_JUNCTION_LINK": str(junction), "ASTANA_JUNCTION_TARGET": str(target)}
        subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
                        "New-Item -ItemType Junction -Path $env:ASTANA_JUNCTION_LINK -Target $env:ASTANA_JUNCTION_TARGET | Out-Null"],
                       check=True, capture_output=True, env=environment)
        try:
            self.assertFalse(junction.is_symlink())
            self.assertTrue(junction.is_junction())
            for requested in (junction / "new-child", junction):
                with self.assertRaisesRegex(ValueError, "linked|reparse"):
                    owned_root(requested)
            self.assertEqual(sentinel.read_text(), "must remain unchanged")
            self.assertEqual(sorted(p.name for p in target.iterdir()), ["sentinel.txt"])
        finally:
            junction.rmdir()  # Remove only the task-created junction itself.


if __name__ == "__main__":
    unittest.main()
