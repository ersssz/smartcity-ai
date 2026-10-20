import copy
import json
import tempfile
import unittest
from pathlib import Path

from generate_prepared_audio import file_hash, text_hash
from generate_rhvoice_audio import checked_manifest


class PortableVoiceIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        source = self.root / "source.json"
        source.write_text(json.dumps({"chapter": "Байтерек."}), encoding="utf-8")
        dll = self.root / "voice.dll"
        dll.write_bytes(b"never loaded by these tests")
        license_path = self.root / "license.txt"
        license_path.write_text("GPL-3.0", encoding="utf-8")
        resources = self.root / "resources"
        resources.mkdir()
        voice = resources / "voice.info"
        voice.write_text("name=Elena", encoding="utf-8")
        self.manifest = {
            "schemaVersion": 1, "source": {"path": str(source), "sha256": file_hash(source)},
            "model": {"engine": "rhvoice", "dllPath": str(dll), "dllSha256": file_hash(dll),
                      "licensePath": str(license_path), "licenseSha256": file_hash(license_path),
                      "sourcePackages": [{"sha256": file_hash(dll)}], "rights": "GPL-3.0",
                      "resourceDirectories": [{"path": str(resources),
                                               "files": {"voice.info": file_hash(voice)}}]},
            "assets": [{"id": "chapter-ru", "locale": "ru", "speakerName": "Elena",
                        "sourcePointer": "/chapter", "text": "Байтерек.",
                        "textSha256": text_hash("Байтерек.")}],
        }

    def validate(self, value=None):
        path = self.root / "manifest.json"
        path.write_text(json.dumps(value or self.manifest), encoding="utf-8")
        return checked_manifest(path, file_hash(path), self.root / "output")

    def test_preflight_does_not_load_dll_or_create_output(self):
        _, dll, resources = self.validate()
        self.assertEqual(dll.name, "voice.dll")
        self.assertEqual(len(resources), 1)
        self.assertFalse((self.root / "output").exists())

    def test_extra_resource_cannot_be_loaded_silently(self):
        (self.root / "resources" / "unlisted-model").write_bytes(b"extra")
        with self.assertRaisesRegex(ValueError, "Resource tree"):
            self.validate()

    def test_corrupted_voice_data_is_rejected(self):
        (self.root / "resources" / "voice.info").write_text("name=Other", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
            self.validate()

    def test_another_voice_and_rewritten_text_are_rejected(self):
        for field, replacement in [("speakerName", "Other"), ("text", "Changed")]:
            with self.subTest(field=field):
                value = copy.deepcopy(self.manifest)
                value["assets"][0][field] = replacement
                with self.assertRaises(ValueError):
                    self.validate(value)


if __name__ == "__main__":
    unittest.main()
