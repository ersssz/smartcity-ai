"""Read class definitions, not guessed DEX string matches. No device or network use."""
import hashlib
import json
from pathlib import Path
import struct
import sys
import zipfile


def classes(data):
    if not data.startswith(b"dex\n"):
        raise ValueError("Unexpected DEX format")
    u32 = lambda offset: struct.unpack_from("<I", data, offset)[0]
    strings = []
    for i in range(u32(0x38)):
        pos = u32(u32(0x3C) + i * 4)
        while data[pos] & 0x80:
            pos += 1
        pos += 1
        end = data.index(b"\0", pos)
        strings.append(data[pos:end].decode("utf-8", errors="replace"))
    types = [strings[u32(u32(0x44) + i * 4)] for i in range(u32(0x40))]
    return [types[u32(u32(0x64) + i * 32)] for i in range(u32(0x60))]


apk = Path(sys.argv[1])
with zipfile.ZipFile(apk) as archive:
    definitions = [
        name for member in archive.namelist()
        if member.startswith("classes") and member.endswith(".dex")
        for name in classes(archive.read(member))
    ]
legacy = sorted(name for name in definitions if name.startswith((
    "Lexpo/modules/location/", "Lexpo/modules/taskManager/", "Lexpo/modules/taskmanager/",
)))
native = sorted(name for name in definitions if name.startswith("Lkz/astanaai/activewalk/"))
required = [
    f"Lkz/astanaai/activewalk/{name};"
    for name in ("ActiveWalkModule", "ActiveWalkService", "ActiveWalkController", "StopReceiver")
]
missing = [name for name in required if name not in definitions]
report = {
    "apk": apk.name,
    "sha256": hashlib.sha256(apk.read_bytes()).hexdigest(),
    "dex_class_count": len(definitions),
    "legacy_location_task_classes": legacy,
    "native_active_walk_classes": native,
    "missing_required_classes": missing,
    "class_gate": "PASS" if not legacy and not missing else "FAIL",
    "runtime_acceptance": False,
}
print(json.dumps(report, indent=2))
sys.exit(1 if legacy or missing else 0)
