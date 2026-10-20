"""Bounded static-parser fixtures, not installable DEX or Android runtime tests."""
import copy
import hashlib
import importlib.util
from pathlib import Path
import struct
import unittest
import zlib

SCRIPT = Path(__file__).with_name('audit_canonical_apk.py')
SPEC = importlib.util.spec_from_file_location('audit_canonical_apk', SCRIPT)
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


def uleb(value):
    output = bytearray()
    while True:
        part = value & 127; value >>= 7
        output.append(part | (128 if value else 0))
        if not value:
            return output


def dex_fixture(descriptor, methods, *, declared=True, no_code=False, invalid_code=None):
    """Minimal class_def/class_data/code_item table fixture, not an installable DEX."""
    strings = [descriptor, *methods]
    stringoff = 112; typeoff = stringoff + 4 * len(strings)
    methodoff = typeoff + 4; classoff = methodoff + 8 * len(methods)
    data = bytearray(classoff + (32 if declared else 0))
    data[:8] = b'dex\n035\x00'
    for offset, value in [(36, 112), (40, 0x12345678), (56, len(strings)), (60, stringoff),
                          (64, 1), (68, typeoff), (88, len(methods)), (92, methodoff),
                          (96, 1 if declared else 0), (100, classoff if declared else 0)]:
        struct.pack_into('<I', data, offset, value)
    for index, value in enumerate(strings):
        struct.pack_into('<I', data, stringoff + index * 4, len(data))
        data.extend(uleb(len(value))); data.extend(value.encode('ascii')); data.append(0)
    struct.pack_into('<I', data, typeoff, 0)
    codeoffs = []
    for index, _ in enumerate(methods):
        struct.pack_into('<HHI', data, methodoff + index * 8, 0, 0, index + 1)
        while len(data) % 4:
            data.append(0)
        codeoffs.append(len(data))
        data.extend(struct.pack('<HHHHIIH', 1, 0, 0, 0, 0, 1, 0x000e))
    if declared:
        classdata = len(data)
        struct.pack_into('<IIIIIIII', data, classoff, 0, 1, 0xffffffff, 0, 0xffffffff, 0, classdata, 0)
        data.extend(uleb(0) + uleb(0) + uleb(len(methods)) + uleb(0))
        for index, codeoff in enumerate(codeoffs):
            chosen = 0 if no_code else invalid_code if isinstance(invalid_code, int) else codeoff
            if invalid_code == 'tail':
                chosen = classdata - 4
            data.extend(uleb(0 if index == 0 else 1) + uleb(1) + uleb(chosen))
    struct.pack_into('<I', data, 32, len(data))
    data[12:32] = hashlib.sha1(data[32:]).digest()
    struct.pack_into('<I', data, 8, zlib.adler32(data[12:]) & 0xffffffff)
    return bytes(data)


class NarrationManifestTests(unittest.TestCase):
    def manifest(self):
        return {
            'service': [{'name': 'kz.astanaai.activewalk.narration.NarrationPlaybackService',
                         'exported': False, 'foregroundServiceType': 2, 'stopWithTask': True}],
            'receiver': [{'name': 'kz.astanaai.activewalk.narration.NarrationMediaActionReceiver',
                          'exported': False}],
        }, ['android.permission.WAKE_LOCK', 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK']

    def test_exact_merged_narration_service_receiver_and_permissions_pass(self):
        components, permissions = self.manifest()
        checks = audit.narration_manifest_checks(components, permissions)
        self.assertEqual(len(checks), 4)
        self.assertTrue(all(c['passed'] for c in checks))

    def test_aapt2_tree_feeds_typed_merged_manifest_attributes(self):
        tree = audit.xmltree('''E: manifest (line=1)
  E: uses-permission (line=2)
    A: android:name(0x01010003)="android.permission.WAKE_LOCK"
  E: uses-permission (line=3)
    A: android:name(0x01010003)="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"
  E: application (line=4)
    E: service (line=5)
      A: android:name(0x01010003)="kz.astanaai.activewalk.narration.NarrationPlaybackService"
      A: android:exported(0x01010010)=false
      A: android:stopWithTask(0x010104c9)=true
      A: android:foregroundServiceType(0x01010599)=0x2
    E: receiver (line=6)
      A: android:name(0x01010003)="kz.astanaai.activewalk.narration.NarrationMediaActionReceiver"
      A: android:exported(0x01010010)=false
''')
        app = audit.descendants(tree, 'application')[0]
        components = {name: [n['attrs'] for n in audit.descendants(app, name)] for name in ['service', 'receiver']}
        permissions = [n['attrs']['name'] for n in audit.descendants(tree, 'uses-permission')]
        self.assertTrue(all(c['passed'] for c in audit.narration_manifest_checks(components, permissions)))

    def test_wrong_type_export_task_policy_duplicate_or_missing_component_fails(self):
        components, permissions = self.manifest()
        changes = [('exported', True), ('stopWithTask', False), ('foregroundServiceType', 8),
                   ('foregroundServiceType', 10), ('foregroundServiceType', 'mediaPlayback')]
        for key, value in changes:
            with self.subTest(key=key, value=value):
                altered = copy.deepcopy(components); altered['service'][0][key] = value
                self.assertFalse(audit.narration_manifest_checks(altered, permissions)[0]['passed'])
        for name in ['service', 'receiver']:
            for values in [[], components[name] * 2]:
                altered = copy.deepcopy(components); altered[name] = values
                self.assertFalse(all(c['passed'] for c in audit.narration_manifest_checks(altered, permissions)))
        altered = copy.deepcopy(components); altered['receiver'][0]['exported'] = True
        self.assertFalse(audit.narration_manifest_checks(altered, permissions)[1]['passed'])

    def test_each_permission_is_required_as_exact_manifest_name(self):
        components, permissions = self.manifest()
        for removed in permissions:
            values = [p for p in permissions if p != removed] + ['other.' + removed.rsplit('.', 1)[-1]]
            checks = audit.narration_manifest_checks(components, values)
            self.assertEqual(sum(not c['passed'] for c in checks), 1)


class NarrationDexTests(unittest.TestCase):
    def descriptors(self):
        return {f'Lkz/astanaai/activewalk/{name};': name for name in {**audit.NATIVE, **audit.NARRATION_NATIVE}}

    def test_default_parser_keeps_all_four_legacy_class_definitions(self):
        for name, methods in audit.NATIVE.items():
            with self.subTest(name=name):
                result = audit.dex_classes(dex_fixture(f'Lkz/astanaai/activewalk/{name};', sorted(methods)))
                self.assertEqual(set(result['requiredClasses']), {name})
                self.assertEqual({m['name'] for m in result['requiredClasses'][name]['methods'] if m['hasCode']}, methods)
                self.assertTrue(result['headerSha1Valid']); self.assertTrue(result['adler32Valid'])

    def test_opt_in_exact_subpackage_definitions_have_required_code_methods(self):
        for name, methods in audit.NARRATION_NATIVE.items():
            with self.subTest(name=name):
                result = audit.dex_classes(dex_fixture(f'Lkz/astanaai/activewalk/{name};', sorted(methods)), self.descriptors())
                self.assertEqual(set(result['requiredClasses']), {name})
                self.assertEqual({m['name'] for m in result['requiredClasses'][name]['methods'] if m['hasCode']}, methods)
                self.assertEqual(audit.dex_classes(dex_fixture(f'Lkz/astanaai/activewalk/{name};', sorted(methods)))['requiredClasses'], {})

    def test_descriptor_strings_wrong_namespace_and_no_body_cannot_prove_narration_methods(self):
        target = 'Lkz/astanaai/activewalk/narration/NarrationBridgeFacade;'
        for data in [dex_fixture(target, ['play'], declared=False),
                     dex_fixture('Lkz/astanaai/activewalk/NarrationBridgeFacade;', ['play'])]:
            self.assertEqual(audit.dex_classes(data, self.descriptors())['requiredClasses'], {})
        result = audit.dex_classes(dex_fixture(target, ['play'], no_code=True), self.descriptors())
        self.assertFalse(result['requiredClasses']['narration/NarrationBridgeFacade']['methods'][0]['hasCode'])

    def test_nonzero_offset_into_header_or_truncated_code_item_is_not_method_body(self):
        for value in [1, 'tail']:
            with self.subTest(codeoff=value):
                with self.assertRaisesRegex(ValueError, 'code item'):
                    audit.dex_classes(dex_fixture('Lkz/astanaai/activewalk/PreparedAudioPlayer;', ['play'], invalid_code=value))


if __name__ == '__main__':
    unittest.main()
