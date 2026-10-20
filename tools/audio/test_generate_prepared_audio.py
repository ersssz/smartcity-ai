"""Integrity failures must stop before loading a neural runtime or writing assets."""

import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from generate_prepared_audio import file_hash, prepare, spoken_text, text_hash


class ManifestIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "canonical.json"
        self.source.write_text(json.dumps({"chapter": {"kk": "Сәлем.\\n\\nАстана."}}), encoding="utf-8")
        model = self.root / "model.onnx"
        model.write_bytes(b"not loaded by the manifest validator")
        config = self.root / "model.json"
        config.write_text(json.dumps({"num_speakers": 2, "espeak": {"voice": "kk"}}), encoding="utf-8")
        card = self.root / "MODEL_CARD"
        card.write_text("Dataset: CC-BY-4.0", encoding="utf-8")
        text = "Сәлем.\\n\\nАстана."
        self.manifest = {
            "schemaVersion": 1,
            "source": {"path": str(self.source), "sha256": file_hash(self.source)},
            "models": {"kk": {"engine": "piper", "locale": "kk", "path": str(model),
                              "sha256": file_hash(model), "configPath": str(config),
                              "configSha256": file_hash(config), "cardPath": str(card),
                              "cardSha256": file_hash(card), "rights": "CC-BY-4.0",
                              "sourceRevision": "pinned-revision"}},
            "assets": [{"id": "chapter-kk", "locale": "kk", "model": "kk", "speakerId": 1,
                        "sourcePointer": "/chapter/kk", "text": text, "textSha256": text_hash(text),
                        "textFormatting": "literal-paragraph-breaks-v1"}],
        }

    def run_prepare(self, value=None):
        path = self.root / "input.json"
        path.write_text(json.dumps(value or self.manifest), encoding="utf-8")
        return prepare(path, file_hash(path), self.root / "out")

    def test_canonical_text_and_explicit_formatting_pass_without_loading_engine(self):
        manifest, _ = self.run_prepare()
        self.assertEqual(spoken_text(manifest["assets"][0]), "Сәлем.\n\nАстана.")
        self.assertFalse((self.root / "out").exists())

    def test_corrupted_model_is_rejected(self):
        Path(self.manifest["models"]["kk"]["path"]).write_bytes(b"corrupted")
        with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
            self.run_prepare()

    def test_changed_canonical_source_is_rejected(self):
        self.source.write_text("{}", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "canonical content source"):
            self.run_prepare()

    def test_text_cannot_be_rewritten_even_with_new_matching_manifest_hash(self):
        value = copy.deepcopy(self.manifest)
        value["assets"][0]["text"] = "Other content."
        value["assets"][0]["textSha256"] = text_hash("Other content.")
        with self.assertRaisesRegex(ValueError, "canonical source"):
            self.run_prepare(value)

    def test_unexpected_locale_and_unsafe_filename_are_rejected(self):
        for field, replacement in [("locale", "en"), ("id", "../outside")]:
            with self.subTest(field=field):
                value = copy.deepcopy(self.manifest)
                value["assets"][0][field] = replacement
                with self.assertRaises(ValueError):
                    self.run_prepare(value)

    def test_voice_with_auxiliary_downloads_is_rejected(self):
        value = copy.deepcopy(self.manifest)
        config = Path(value["models"]["kk"]["configPath"])
        config.write_text(json.dumps({"num_speakers": 2, "phoneme_type": "pinyin",
                                      "espeak": {"voice": "kk"}}), encoding="utf-8")
        value["models"]["kk"]["configSha256"] = file_hash(config)
        with self.assertRaisesRegex(ValueError, "no auxiliary downloads"):
            self.run_prepare(value)

    def test_existing_audio_is_preserved(self):
        output = self.root / "out"
        output.mkdir()
        (output / "chapter-kk.mp3").write_bytes(b"preserve")
        with self.assertRaisesRegex(ValueError, "overwrite"):
            self.run_prepare()
        self.assertEqual((output / "chapter-kk.mp3").read_bytes(), b"preserve")

    def test_wrong_manifest_hash_is_rejected_before_inputs(self):
        path = self.root / "input.json"
        path.write_text(json.dumps(self.manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "text manifest"):
            prepare(path, hashlib.sha256(b"another file").hexdigest(), self.root / "out")


if __name__ == "__main__":
    unittest.main()
