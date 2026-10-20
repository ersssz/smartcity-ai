"""Read-only APK audit. Streams ZIP members; never extracts or executes the app.

Only explicitly named JSON/Markdown reports are written. Requires Python 3.12,
an existing Android build-tools directory and an existing JDK; no downloads.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import struct
import subprocess
import sys
import tempfile
import zipfile
import zlib

HEX = re.compile(r"[0-9a-f]{64}\Z")
MAX_MEMBER = 32 * 1024 * 1024
NATIVE = {
    "ActiveWalkModule": {"definition"},
    "PreparedAssetVerifier": {"hashUtf8", "verify"},
    "PreparedAudioPlayer": {"play", "pause", "stop", "getState", "setForeground", "release"},
    "PreparedAudioOwner": {"register", "detach", "stop"},
}
NARRATION_NATIVE = {
    "narration/NarrationPlaybackService": {"onCreate", "onStartCommand", "onTaskRemoved", "onDestroy", "onBind"},
    "narration/NarrationMediaActionReceiver": {"onReceive"},
    "narration/NarrationHost": {"existing", "createBridge", "stopIfInstalled", "install"},
    "narration/NarrationBridgeFacade": {"captureScopeDto", "getState", "play", "pause", "resume", "stop", "close"},
    "narration/NarrationCoordinator": {"play", "pause", "resume", "stopAudio", "consumeStart", "onServiceCreated", "onServiceDestroyed", "observe", "registerClient", "detachClient"},
    "narration/AndroidNarrationEffects": {"apply", "positionMs", "release"},
}


def digest_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(65536), b""):
            h.update(block)
    return h.hexdigest()


def member_bytes(z: zipfile.ZipFile, name: str) -> bytes:
    info = z.getinfo(name)
    if info.file_size > MAX_MEMBER:
        raise ValueError(f"member exceeds audit memory bound: {name}")
    with z.open(info) as stream:
        data = stream.read(MAX_MEMBER + 1)
    if len(data) != info.file_size:
        raise ValueError(f"member length mismatch: {name}")
    return data


def run(argv: list[str], env: dict[str, str]) -> dict:
    done = subprocess.run(argv, env=env, text=True, encoding="utf-8", errors="replace",
                          capture_output=True, timeout=90, check=False)
    return {"argv": argv, "exitCode": done.returncode,
            "stdout": done.stdout, "stderr": done.stderr}


def xmltree(text: str) -> dict:
    """Parse aapt2's element/attribute indentation, not arbitrary XML or raw APK text."""
    root = {"name": "root", "attrs": {}, "children": []}
    stack = [(-1, root)]
    for line in text.splitlines():
        indent = len(line) - len(line.lstrip())
        token = line.strip()
        if token.startswith("E: "):
            node = {"name": token[3:].split()[0], "attrs": {}, "children": []}
            while stack[-1][0] >= indent:
                stack.pop()
            stack[-1][1]["children"].append(node)
            stack.append((indent, node))
        elif token.startswith("A: ") and "=" in token:
            key, raw = token[3:].split("=", 1)
            key = re.sub(r"\(0x[0-9a-f]+\)$", "", key).split(":")[-1]
            if raw.startswith('"'):
                value = raw[1:raw.index('"', 1)]
            elif raw in ("true", "false"):
                value = raw == "true"
            else:
                try:
                    value = int(raw, 0)
                except ValueError:
                    value = raw
            stack[-1][1]["attrs"][key] = value
    return root


def descendants(node: dict, name: str) -> list[dict]:
    result = []
    for child in node["children"]:
        if child["name"] == name:
            result.append(child)
        result.extend(descendants(child, name))
    return result


def narration_manifest_checks(components: dict, permissions: list[str]) -> list[dict]:
    """Check attributes from the actual aapt2 merged-manifest tree, not source XML."""
    service = [c for c in components.get("service", []) if c.get("name") ==
               "kz.astanaai.activewalk.narration.NarrationPlaybackService"]
    receiver = [c for c in components.get("receiver", []) if c.get("name") ==
                "kz.astanaai.activewalk.narration.NarrationMediaActionReceiver"]
    checks = [
        {"name": "narration-media-playback-service", "passed": len(service) == 1 and
         service[0].get("exported") is False and service[0].get("stopWithTask") is True and
         service[0].get("foregroundServiceType") == 2, "detail": service},
        {"name": "narration-media-receiver-not-exported", "passed": len(receiver) == 1 and
         receiver[0].get("exported") is False, "detail": receiver},
    ]
    for permission in ("android.permission.WAKE_LOCK", "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"):
        checks.append({"name": f"narration-permission:{permission.rsplit('.', 1)[-1]}",
                       "passed": permission in permissions, "detail": permission})
    return checks


def dex_classes(data: bytes, descriptors: dict[str, str] | None = None) -> dict:
    """Inspect DEX class_def/method definitions; strings alone are insufficient."""
    if descriptors is None:
        descriptors = {f"Lkz/astanaai/activewalk/{name};": name for name in NATIVE}
    if len(data) < 112 or not re.fullmatch(rb"dex\n0[0-9]{2}\x00", data[:8]):
        raise ValueError("unsupported DEX header")
    def u32(offset: int) -> int:
        if offset < 0 or offset + 4 > len(data):
            raise ValueError("DEX offset out of bounds")
        return struct.unpack_from("<I", data, offset)[0]
    def table(count: int, offset: int, width: int) -> None:
        if count > 1000000 or offset + count * width > len(data):
            raise ValueError("DEX table out of bounds")
    def uleb(offset: int) -> tuple[int, int]:
        value = 0
        for shift in range(0, 35, 7):
            if offset >= len(data):
                raise ValueError("truncated DEX uleb128")
            byte = data[offset]; offset += 1
            value |= (byte & 127) << shift
            if not byte & 128:
                return value, offset
        raise ValueError("overlong DEX uleb128")
    if u32(32) != len(data) or u32(36) != 112 or u32(40) != 0x12345678:
        raise ValueError("unsupported DEX size/header/endian")
    strings, stringoff = u32(56), u32(60)
    types, typeoff = u32(64), u32(68)
    methods, methodoff = u32(88), u32(92)
    classes, classoff = u32(96), u32(100)
    table(strings, stringoff, 4); table(types, typeoff, 4)
    table(methods, methodoff, 8); table(classes, classoff, 32)
    def string(index: int) -> str:
        if index >= strings:
            raise ValueError("DEX string index")
        _, offset = uleb(u32(stringoff + index * 4))
        end = data.find(b"\x00", offset)
        if end < 0 or end - offset > 1048576:
            raise ValueError("DEX string terminator/bound")
        # Required descriptors and method names are ASCII (no MUTF-8 ambiguity).
        return data[offset:end].decode("utf-8", errors="replace")
    def typename(index: int) -> str:
        if index >= types:
            raise ValueError("DEX type index")
        return string(u32(typeoff + index * 4))
    found = {}
    for index in range(classes):
        base = classoff + index * 32
        descriptor = typename(u32(base))
        short = descriptors.get(descriptor)
        if short is None:
            continue
        offset = u32(base + 24)
        definitions = []
        if offset:
            counts = []
            for _ in range(4):
                count, offset = uleb(offset); counts.append(count)
            if sum(counts) > 100000:
                raise ValueError("DEX class_data count bound")
            for _ in range(counts[0] + counts[1]):
                _, offset = uleb(offset); _, offset = uleb(offset)
            for count in counts[2:]:
                method_index = 0
                for _ in range(count):
                    diff, offset = uleb(offset); method_index += diff
                    access, offset = uleb(offset); codeoff, offset = uleb(offset)
                    if method_index >= methods or codeoff >= len(data):
                        raise ValueError("DEX encoded method out of bounds")
                    if codeoff:
                        if codeoff < 112 or codeoff % 4 or codeoff + 16 > len(data):
                            raise ValueError("DEX code item header/alignment out of bounds")
                        instructions = u32(codeoff + 12)
                        if not instructions or codeoff + 16 + instructions * 2 > len(data):
                            raise ValueError("DEX code item instructions out of bounds")
                    declared_class = struct.unpack_from("<H", data, methodoff + method_index * 8)[0]
                    if typename(declared_class) != descriptor:
                        raise ValueError("DEX method/class mismatch")
                    definitions.append({"name": string(u32(methodoff + method_index * 8 + 4)),
                                        "hasCode": bool(codeoff), "accessFlags": access})
        found[short] = {"descriptor": descriptor, "methods": definitions}
    return {"version": data[4:7].decode("ascii"), "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(), "definedClassCount": classes,
            "headerSha1Valid": hashlib.sha1(data[32:]).digest() == data[12:32],
            "adler32Valid": zlib.adler32(data[12:]) & 0xffffffff == u32(8), "requiredClasses": found}


def write_report(path: Path, data: bytes, overwrite: bool) -> None:
    """Writes reports only; refuse existing links and avoid following final-file links."""
    path = path.absolute()  # Preserve links for ancestor checks; do not resolve them away.
    for parent in (path.parent, *path.parent.parents):
        if parent.is_symlink() or (hasattr(parent, "is_junction") and parent.is_junction()):
            raise ValueError(f"linked report parent: {parent}")
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() or path.is_symlink():
        info = path.lstat()
        if not overwrite or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or path.is_symlink():
            raise ValueError(f"report exists or unsafe; use --overwrite for an ordinary file: {path}")
    fd, temp = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data); stream.flush(); os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)  # Only this exact mkstemp-owned path.


def audit(args: argparse.Namespace) -> dict:
    apk, registry_path = args.apk.resolve(strict=True), args.registry.resolve(strict=True)
    before = digest_file(apk)
    registry_bytes = registry_path.read_bytes()
    registry = json.loads(registry_bytes)
    checks = []
    require_narration = getattr(args, "require_narration", False)
    native_required = {**NATIVE, **(NARRATION_NATIVE if require_narration else {})}
    native_descriptors = {f"Lkz/astanaai/activewalk/{name};": name for name in native_required}
    def check(name: str, passed: bool, detail=None) -> None:
        checks.append({"name": name, "passed": bool(passed), "detail": detail})
    env = os.environ.copy(); env["JAVA_HOME"] = str(args.java_home.resolve(strict=True))
    java = args.java_home / "bin/java.exe"
    aapt = args.build_tools / "aapt2.exe"
    signer = args.build_tools / "lib/apksigner.jar"
    zipalign = args.build_tools / "zipalign.exe"
    tools = {
        "badging": run([str(aapt), "dump", "badging", str(apk)], env),
        "manifest": run([str(aapt), "dump", "xmltree", str(apk), "--file", "AndroidManifest.xml"], env),
        "signature": run([str(java), "-jar", str(signer), "verify", "--verbose", "--print-certs", str(apk)], env),
        "alignment": run([str(zipalign), "-c", "-P", "16", "4", str(apk)], env),
    }
    for name, result in tools.items():
        check(f"tool:{name}", result["exitCode"] == 0)
    tree = xmltree(tools["manifest"]["stdout"])
    manifests, apps = descendants(tree, "manifest"), descendants(tree, "application")
    if len(manifests) != 1 or len(apps) != 1:
        raise ValueError("aapt2 did not yield one manifest/application")
    manifest, app = manifests[0], apps[0]
    identity = {**manifest["attrs"], **descendants(tree, "uses-sdk")[0]["attrs"]}
    permissions = [n["attrs"].get("name") for n in descendants(tree, "uses-permission")]
    components = {name: [n["attrs"] for n in descendants(app, name)]
                  for name in ("activity", "service", "receiver", "provider", "meta-data")}
    check("package/version", identity.get("package") == args.package and
          identity.get("versionName") == args.version_name and identity.get("versionCode") == args.version_code, identity)
    check("not-debuggable", app["attrs"].get("debuggable", False) is False, app["attrs"].get("debuggable", "absent/default false"))
    check("backup-disabled", app["attrs"].get("allowBackup") is False)
    forbidden = {"ACCESS_BACKGROUND_LOCATION", "RECEIVE_BOOT_COMPLETED", "READ_EXTERNAL_STORAGE",
                 "WRITE_EXTERNAL_STORAGE", "SYSTEM_ALERT_WINDOW"}
    check("forbidden-permissions-absent", not any(p.split(".")[-1] in forbidden for p in permissions))
    service = [c for c in components["service"] if c.get("name") == "kz.astanaai.activewalk.ActiveWalkService"]
    receiver = [c for c in components["receiver"] if c.get("name") == "kz.astanaai.activewalk.StopReceiver"]
    check("active-walk-service", len(service) == 1 and service[0].get("exported") is False and
          service[0].get("stopWithTask") is True and service[0].get("foregroundServiceType") == 8, service)
    check("stop-receiver-not-exported", len(receiver) == 1 and receiver[0].get("exported") is False, receiver)
    if require_narration:
        checks.extend(narration_manifest_checks(components, permissions))
    updates = [c for c in components["meta-data"] if c.get("name") == "expo.modules.updates.ENABLED"]
    check("expo-updates-disabled", len(updates) == 1 and updates[0].get("value") is False)
    check("signature-v2", "Verified using v2 scheme (APK Signature Scheme v2): true" in tools["signature"]["stdout"])
    entries = registry.get("entries", [])
    check("registry-54-unique", len(entries) == 54 and len({e["id"] for e in entries}) == 54)
    audio, dex, native, js, credits = [], [], {}, {}, {}
    with zipfile.ZipFile(apk) as z:
        names = z.namelist()
        native_abis = sorted({n.split('/')[1] for n in names if n.startswith('lib/') and n.endswith('.so')})
        check("no-duplicate-zip-names", len(set(names)) == len(names))
        expected_paths = set()
        for entry in entries:
            sha = entry["sha256"]
            if not HEX.fullmatch(sha) or entry["assetId"] != f"audio-{sha}" or entry["path"] != f"audio/{sha}.mp3":
                raise ValueError(f"unsafe/inconsistent registry entry {entry['id']}")
            name = f"assets/astana-{entry['path']}"; expected_paths.add(name)
            if name not in names:
                check(f"audio:{entry['id']}", False, "MISSING"); continue
            info = z.getinfo(name); h = hashlib.sha256(); count = 0
            if info.file_size > MAX_MEMBER:
                raise ValueError(f"oversized audio: {name}")
            with z.open(info) as stream:
                for block in iter(lambda: stream.read(65536), b""):
                    h.update(block); count += len(block)
                    if count > MAX_MEMBER:
                        raise ValueError("audio stream bound")
            passed = h.hexdigest() == sha and count == entry["bytes"] and info.compress_type == zipfile.ZIP_STORED and not info.flag_bits & 1
            audio.append({"id": entry["id"], "locale": entry["locale"], "zipPath": name,
                          "bytes": count, "sha256": h.hexdigest(), "textSha256": entry["textSha256"],
                          "compression": info.compress_type, "compressedBytes": info.compress_size, "passed": passed})
            check(f"audio:{entry['id']}", passed)
        actual_paths = {n for n in names if n.startswith("assets/astana-audio/") and n.endswith(".mp3")}
        check("exact-audio-set", actual_paths == expected_paths)
        for name in sorted(n for n in names if re.fullmatch(r"classes(?:[2-9][0-9]*)?\.dex", n)):
            result = dex_classes(member_bytes(z, name), native_descriptors); result["zipPath"] = name; dex.append(result)
            check(f"dex-integrity:{name}", result["headerSha1Valid"] and result["adler32Valid"])
            for short, definition in result["requiredClasses"].items():
                if short in native:
                    raise ValueError("duplicate required native definition")
                native[short] = {"zipPath": name, **definition}
        for short, required in native_required.items():
            methods = {m["name"] for m in native.get(short, {}).get("methods", []) if m["hasCode"]}
            check(f"native:{short}", required <= methods, {"required": sorted(required), "foundCodeMethods": sorted(methods)})
        jsname = "assets/index.android.bundle"
        if jsname in names:
            data = member_bytes(z, jsname); info = z.getinfo(jsname)
            hermes = data[:8] == bytes.fromhex("c61fbc03c103191f")
            js = {"zipPath": jsname, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                  "compression": info.compress_type, "hermesMagic": hermes,
                  "hermesVersion": struct.unpack_from("<I", data, 8)[0] if hermes else None,
                  "audioHashesPresent": sum(e["sha256"].encode() in data for e in entries),
                  "textHashesPresent": sum(e["textSha256"].encode() in data for e in entries),
                  "narrationIdsPresent": sum(e["id"].encode() in data for e in entries)}
            if args.js_reference:
                js["buildOutputReferenceSha256"] = digest_file(args.js_reference)
                check("js-matches-build-output", js["sha256"] == js["buildOutputReferenceSha256"])
            check("hermes-bundle", hermes and len(data) > 0)
            check("registry-hashes-in-js", js["audioHashesPresent"] == 54 and js["textHashesPresent"] == 54)
        else:
            check("hermes-bundle", False, "MISSING")
        credit_data = member_bytes(z, "assets/astana-audio/credits.json")
        credits = {"sha256": hashlib.sha256(credit_data).hexdigest(), "entries": json.loads(credit_data)}
        expected_credits = {(e["locale"], e["license"], e["attribution"]) for e in entries}
        actual_credits = {(e["locale"], e["license"], e["attribution"]) for e in credits["entries"]}
        check("credits-match-registry", expected_credits == actual_credits)
        gpl = member_bytes(z, "assets/astana-audio/COPYING-GPL-3.0.txt")
        credits["gplBytes"] = len(gpl); credits["gplSha256"] = hashlib.sha256(gpl).hexdigest()
        check("gpl-text-bundled", b"GNU GENERAL PUBLIC LICENSE" in gpl and len(gpl) > 30000)
    after = digest_file(apk)
    check("apk-unchanged-during-audit", before == after)
    check("registry-unchanged-during-audit", hashlib.sha256(registry_path.read_bytes()).hexdigest() == hashlib.sha256(registry_bytes).hexdigest())
    return {"schemaVersion": 1, "auditUtc": dt.datetime.now(dt.timezone.utc).isoformat(),
            "sourceCommit": args.source_commit,
            "buildStage": args.build_stage, "requireNarration": bool(require_narration),
            "status": "PASS_STATIC" if all(c["passed"] for c in checks) else "FAIL_STATIC",
            "apk": {"path": str(apk), "bytes": apk.stat().st_size, "sha256": before},
            "registry": {"path": str(registry_path), "sha256": hashlib.sha256(registry_bytes).hexdigest(),
                         "manifestSha256": registry["manifestSha256"], "contentRevision": registry["contentRevision"]},
            "manifest": {"identity": identity, "application": app["attrs"], "permissions": permissions, "components": components},
            "checks": checks, "audio": audio, "audioBytes": sum(e["bytes"] for e in audio),
            "nativeAbis": native_abis,
            "localeCounts": dict(collections.Counter(e["locale"] for e in audio)),
            "dex": dex, "nativeClasses": native, "jsBundle": js, "credits": credits,
            "tools": tools, "runtime": {"python": sys.version, "scriptSha256": digest_file(Path(__file__)),
                "aapt2Sha256": digest_file(aapt), "apksignerJarSha256": digest_file(signer), "zipalignSha256": digest_file(zipalign)},
            "limits": ["Static archive/manifest/signature/class definition evidence, not Android execution.",
                       "DEX method bodies were not decompiled or executed; class existence does not prove lifecycle semantics.",
                       "Hermes string/hash presence does not prove code reachability or React rendering.",
                       "Audio hashes validate bytes, not pronunciation or human quality.",
                       "Android Debug certificate is for development; production signing/distribution is not accepted.",
                       "Any rebuild changes artifact identity and requires this audit again."]}


def markdown(result: dict, json_path: Path) -> str:
    apk = result["apk"]; identity = result["manifest"]["identity"]; js = result["jsBundle"]
    failures = [c for c in result["checks"] if not c["passed"]]
    lines = ["# Статический аудит APK AstanaAI", "", f"Проверено: {result['auditUtc']}. Статус: **{result['status']}**.", "",
             f"Этап сборки: `{result['buildStage']}`. Это аудит конкретного APK; после финальной пересборки его нужно повторить.", "",
             f"Исходный commit, назначенный владельцем сборки: `{result['sourceCommit']}`. Статический аудит не доказывает воспроизводимость сборки из исходников.", "",
             f"Обязательный статический контроль background narration: **{'включён' if result.get('requireNarration') else 'выключен (legacy mode)'}**. При включении проверены merged mediaPlayback service/receiver/permissions и определения шести narration-классов с кодом. Работа на Android этим не подтверждается.", "",
             f"APK: `{apk['path']}`", f"Размер: **{apk['bytes']:,} байт**. SHA-256: `{apk['sha256']}`.", "",
             f"Пакет `{identity['package']}`, версия **{identity['versionName']} / {identity['versionCode']}**, min SDK {identity['minSdkVersion']}, target SDK {identity['targetSdkVersion']}.", "",
             f"Встроенные native ABI: `{', '.join(result['nativeAbis'])}`; совместимость других архитектур не заявляется.", "",
             f"Проверок: {len(result['checks'])}; PASS {len(result['checks']) - len(failures)}; FAIL {len(failures)}.", "",
             "## Фактические результаты", "",
             f"- Внутри APK проверены все **{len(result['audio'])}/54 MP3**, **{result['audioBytes']:,} байт**, locale: `{result['localeCounts']}`. Для каждого сверены реальные потоковые SHA-256, байты, точный путь и ZIP_STORED (0). Список MP3 совпадает с реестром.",
             f"- Реестр SHA-256: `{result['registry']['sha256']}`; manifest: `{result['registry']['manifestSha256']}`.",
             "- Подпись проверена локальным apksigner; точные схемы и публичные отпечатки ниже. Debug certificate не является производственной подписью.",
             "- В DEX проверены class_def и методы с code offset для Module, Verifier, Player и Owner. Это сильнее поиска строк, но не доказательство выполнения методов.",
             f"- Hermes bundle: **{js.get('bytes', 0):,} байт**, версия bytecode `{js.get('hermesVersion')}`, SHA-256 `{js.get('sha256')}`. Совпадений audio hash {js.get('audioHashesPresent')}/54, text hash {js.get('textHashesPresent')}/54.",
             "- Проверены allowBackup=false, отсутствие debuggable=true, запрещённых background/boot/storage/overlay permissions, экспорт сервиса и StopReceiver, location FGS type, stopWithTask и отключение Expo Updates.",
             "- В APK есть соответствующие реестру credits RU/KK/EN и полный GPL-текст.",
             "- APK и реестр не изменились между началом и концом аудита. Полной распаковки, установки и запуска APK не было.", "",
             "## Подпись", "", "```text", result["tools"]["signature"]["stdout"].strip(), "```", "",
             "## Объявленные permissions", ""]
    lines.extend(f"- `{p}`" for p in result["manifest"]["permissions"])
    lines.extend(["", "## Определения классов", "", "| Класс | DEX | Методы с кодом |", "| --- | --- | --- |"])
    for name, item in result["nativeClasses"].items():
        methods = sorted({m["name"] for m in item["methods"] if m["hasCode"]})
        lines.append(f"| `{name}` | `{item['zipPath']}` | `{', '.join(methods)}` |")
    if failures:
        lines.extend(["", "## Непрошедшие проверки", ""])
        lines.extend(f"- `{f['name']}`: `{f['detail']}`" for f in failures)
    lines.extend(["", "## Границы результата", ""])
    lines.extend(f"- {limit}" for limit in result["limits"])
    lines.extend(["- Полная offline-карта, GPS, Android SQLite restore, audio focus/noisy/background/recreation, полевые и языковые проверки этим аудитом не принимаются.",
                  "", "## Воспроизводимость", "", f"Полная квитанция с 54 строками аудио, командами, stdout и hash инструментов: `{json_path}`.",
                  f"SHA-256 скрипта: `{result['runtime']['scriptSha256']}`. Использованы только уже установленные Python/JDK/Android SDK.", ""])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("apk", "registry", "build-tools", "java-home", "json", "markdown"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--js-reference", type=Path)
    parser.add_argument("--package", default="kz.astanaai.diagnostics")
    parser.add_argument("--version-name", default="0.4.0")
    parser.add_argument("--version-code", default=10, type=int)
    parser.add_argument("--build-stage", required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--require-narration", action="store_true",
                        help="Also require merged mediaPlayback components/permissions and actual narration DEX definitions (static evidence only).")
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.source_commit):
        parser.error("source commit must be an explicit lowercase 40-hex Git commit")
    # Reports must not overwrite any audit input or executable, even by CLI error.
    inputs = {args.apk.resolve(), args.registry.resolve(), Path(__file__).resolve()}
    if args.js_reference:
        inputs.add(args.js_reference.resolve())
    if args.json.resolve() in inputs or args.markdown.resolve() in inputs or args.json.resolve() == args.markdown.resolve():
        parser.error("report paths must differ from inputs and one another")
    for output in (args.json.resolve(), args.markdown.resolve()):
        if output.is_relative_to(args.build_tools.resolve()) or output.is_relative_to(args.java_home.resolve()):
            parser.error("report paths must not be inside SDK/JDK tool directories")
    result = audit(args)
    write_report(args.json, (json.dumps(result, ensure_ascii=False, indent=2) + "\n").encode("utf-8"), args.overwrite)
    write_report(args.markdown, markdown(result, args.json).encode("utf-8"), args.overwrite)
    print(json.dumps({"status": result["status"], "apkSha256": result["apk"]["sha256"],
                      "bytes": result["apk"]["bytes"], "audioEntries": len(result["audio"]),
                      "failedChecks": [c["name"] for c in result["checks"] if not c["passed"]]}))
    return 0 if result["status"] == "PASS_STATIC" else 1


if __name__ == "__main__":
    raise SystemExit(main())
