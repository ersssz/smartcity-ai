"""Bounded tests for the binary audit boundaries; no SDK, phone or extraction."""
import hashlib
import importlib.util
from pathlib import Path
import os
import struct
import tempfile
import unittest
import zlib

spec = importlib.util.spec_from_file_location("apk_audit", Path(__file__).with_name("audit_canonical_apk.py"))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def leb(value):
    result = bytearray()
    while True:
        byte = value & 127; value >>= 7
        result.append(byte | (128 if value else 0))
        if not value:
            return result


def fixture_dex():
    descriptor = b"Lkz/astanaai/activewalk/PreparedAudioOwner;"
    method = b"stop"
    data = bytearray(192)
    data[:8] = b"dex\n035\0"
    def u32(offset, value):
        struct.pack_into("<I", data, offset, value)
    u32(36, 112); u32(40, 0x12345678)
    u32(56, 2); u32(60, 112); u32(64, 1); u32(68, 120)
    u32(88, 1); u32(92, 124); u32(96, 1); u32(100, 132)
    u32(120, 0)
    struct.pack_into("<HHI", data, 124, 0, 0, 1)
    u32(132, 0); u32(156, 184)
    struct.pack_into("<HHHHIIH", data, 164, 1, 0, 0, 0, 0, 1, 0x000e)
    data[184:192] = bytes([0, 0, 1, 0, 0, 1]) + leb(164)
    for index, value in enumerate((descriptor, method)):
        u32(112 + index * 4, len(data))
        data.extend(leb(len(value)) + value + b"\0")
    u32(32, len(data))
    data[12:32] = hashlib.sha1(data[32:]).digest()
    u32(8, zlib.adler32(data[12:]) & 0xffffffff)
    return bytes(data)


class AuditTests(unittest.TestCase):
    def test_aapt_tree_preserves_typed_attributes_and_component_ownership(self):
        tree = audit.xmltree('''N: android=x
  E: manifest (line=2)
    A: package="example.app" (Raw: "example.app")
    A: x:versionCode(0x0101021b)=10
      E: application (line=4)
        A: x:allowBackup(0x01010280)=false
          E: service (line=5)
            A: x:exported(0x01010010)=false
            A: x:foregroundServiceType(0x01010599)=0x00000008
          E: receiver (line=6)
            A: x:exported(0x01010010)=true
''')
        manifest = audit.descendants(tree, "manifest")[0]
        self.assertEqual(manifest["attrs"], {"package": "example.app", "versionCode": 10})
        self.assertIs(audit.descendants(tree, "application")[0]["attrs"]["allowBackup"], False)
        self.assertEqual(audit.descendants(tree, "service")[0]["attrs"], {"exported": False, "foregroundServiceType": 8})
        self.assertIs(audit.descendants(tree, "receiver")[0]["attrs"]["exported"], True)

    def test_dex_requires_class_definition_and_method_code(self):
        result = audit.dex_classes(fixture_dex())
        self.assertTrue(result["headerSha1Valid"])
        self.assertTrue(result["adler32Valid"])
        cls = result["requiredClasses"]["PreparedAudioOwner"]
        self.assertEqual(cls["methods"][0]["name"], "stop")
        self.assertTrue(cls["methods"][0]["hasCode"])

    def test_descriptor_string_without_class_def_is_not_a_class(self):
        data = bytearray(fixture_dex())
        struct.pack_into("<I", data, 96, 0)
        self.assertIn(b"Lkz/astanaai/activewalk/PreparedAudioOwner;", data)
        self.assertEqual(audit.dex_classes(bytes(data))["requiredClasses"], {})

    def test_tampered_dex_integrity_is_reported(self):
        data = bytearray(fixture_dex()); data[180] ^= 1
        result = audit.dex_classes(bytes(data))
        self.assertFalse(result["headerSha1Valid"])
        self.assertFalse(result["adler32Valid"])

    def test_malformed_dex_table_is_refused(self):
        data = bytearray(fixture_dex())
        struct.pack_into("<I", data, 100, 0xffffff00)
        with self.assertRaisesRegex(ValueError, "out of bounds"):
            audit.dex_classes(bytes(data))

    def test_report_overwrite_refuses_hardlink_and_preserves_target(self):
        with tempfile.TemporaryDirectory(prefix="apk-audit-test-") as scratch:
            root = Path(scratch); target = root / "sentinel"; report = root / "report.json"
            target.write_bytes(b"KEEP UNCHANGED")
            os.link(target, report)
            with self.assertRaises(ValueError):
                audit.write_report(report, b"BAD", overwrite=True)
            self.assertEqual(target.read_bytes(), b"KEEP UNCHANGED")

    def test_report_is_only_explicit_owned_output(self):
        with tempfile.TemporaryDirectory(prefix="apk-audit-test-") as scratch:
            report = Path(scratch) / "report.json"
            audit.write_report(report, b"ONE", overwrite=False)
            with self.assertRaises(ValueError):
                audit.write_report(report, b"TWO", overwrite=False)
            self.assertEqual(report.read_bytes(), b"ONE")
            audit.write_report(report, b"TWO", overwrite=True)
            self.assertEqual(report.read_bytes(), b"TWO")
            self.assertEqual(list(Path(scratch).iterdir()), [report])


if __name__ == "__main__":
    unittest.main()
