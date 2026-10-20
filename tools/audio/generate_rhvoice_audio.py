#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Capture a verified portable RHVoice C API into prepared WAV/MP3 files.

Build-only adapter; it neither installs SAPI voices nor imports an NVDA driver.
C API layouts follow RHVoice's published GPL-licensed declarations. See
RHVOICE-NOTICE.md. No engine or model is included in this source repository.
"""

from __future__ import annotations

import argparse
import ctypes as c
import json
import subprocess
import sys
import time
import wave
from pathlib import Path

from generate_prepared_audio import SAFE_ID, file_hash, inspect_wav, spoken_text, text_hash, verified_file


RATE = c.CFUNCTYPE(c.c_int, c.c_int, c.c_void_p)
AUDIO = c.CFUNCTYPE(c.c_int, c.POINTER(c.c_short), c.c_uint, c.c_void_p)


class Callbacks(c.Structure):
    _fields_ = [("set_sample_rate", RATE), ("play_speech", AUDIO)] + [
        (name, c.c_void_p) for name in (
            "process_mark", "word_starts", "word_ends", "sentence_starts",
            "sentence_ends", "play_audio", "done"
        )
    ]


class InitParams(c.Structure):
    _fields_ = [("data_path", c.c_char_p), ("config_path", c.c_char_p),
                ("resource_paths", c.POINTER(c.c_char_p)), ("callbacks", Callbacks),
                ("options", c.c_uint)]


class SynthesisParams(c.Structure):
    _fields_ = [("voice_profile", c.c_char_p), ("absolute_rate", c.c_double),
                ("absolute_pitch", c.c_double), ("absolute_volume", c.c_double),
                ("relative_rate", c.c_double), ("relative_pitch", c.c_double),
                ("relative_volume", c.c_double), ("punctuation_mode", c.c_int),
                ("punctuation_list", c.c_char_p), ("capitals_mode", c.c_int), ("flags", c.c_int)]


class VoiceInfo(c.Structure):
    _fields_ = [("language", c.c_char_p), ("name", c.c_char_p),
                ("gender", c.c_int), ("country", c.c_char_p)]


def checked_manifest(path: Path, expected: str, output: Path) -> tuple[dict, Path, list[Path]]:
    verified_file(str(path), expected, "text manifest")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1 or not manifest.get("assets"):
        raise ValueError("Expected a version 1 manifest with assets")
    source = verified_file(manifest["source"]["path"], manifest["source"]["sha256"], "canonical source")
    source_content = json.loads(source.read_text(encoding="utf-8"))
    model = manifest["model"]
    if model["engine"] != "rhvoice" or not model.get("rights") or not model.get("sourcePackages"):
        raise ValueError("Explicit RHVoice provenance and rights are required")
    dll = verified_file(model["dllPath"], model["dllSha256"], "RHVoice library")
    verified_file(model["licensePath"], model["licenseSha256"], "engine license")
    resources = []
    for directory in model["resourceDirectories"]:
        root = Path(directory["path"]).resolve(strict=True)
        if not root.is_dir():
            raise ValueError("Resource directory is absent")
        expected_files = directory["files"]
        actual_files = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}
        if actual_files != set(expected_files):
            raise ValueError("Resource tree differs from the explicit manifest")
        for relative, digest in expected_files.items():
            file = (root / relative).resolve(strict=True)
            if not file.is_relative_to(root):
                raise ValueError("Resource path escapes its directory")
            verified_file(str(file), digest, "voice/language resource")
        resources.append(root)
    seen = set()
    for asset in manifest["assets"]:
        name = asset["id"]
        if not SAFE_ID.fullmatch(name) or name in seen or asset["locale"] != "ru" or asset["speakerName"] != "Elena":
            raise ValueError("Expected distinct safe IDs and explicit Russian Elena assets")
        seen.add(name)
        pointer = asset["sourcePointer"]
        if not isinstance(pointer, str) or not pointer.startswith("/"):
            raise ValueError("Canonical JSON Pointer is required")
        canonical = source_content
        for part in pointer[1:].split("/"):
            part = part.replace("~1", "/").replace("~0", "~")
            canonical = canonical[int(part)] if isinstance(canonical, list) else canonical[part]
        if canonical != asset["text"]:
            raise ValueError("Text differs from its canonical source")
        spoken_text(asset)
        for suffix in (".wav", ".mp3", ".partial.wav"):
            if (output / f"{name}{suffix}").exists():
                raise ValueError("Refusing to overwrite an existing audio file")
    if (output / "generated-audio-manifest.json").exists():
        raise ValueError("Refusing to overwrite the output manifest")
    return manifest, dll, resources


def library(path: Path):
    lib = c.CDLL(str(path))
    declarations = [
        ("RHVoice_get_version", [], c.c_char_p),
        ("RHVoice_new_tts_engine", [c.POINTER(InitParams)], c.c_void_p),
        ("RHVoice_get_number_of_voices", [c.c_void_p], c.c_uint),
        ("RHVoice_get_voices", [c.c_void_p], c.POINTER(VoiceInfo)),
        ("RHVoice_new_message", [c.c_void_p, c.c_char_p, c.c_uint, c.c_int,
                                 c.POINTER(SynthesisParams), c.c_void_p], c.c_void_p),
        ("RHVoice_speak", [c.c_void_p], c.c_int),
        ("RHVoice_delete_message", [c.c_void_p], None),
        ("RHVoice_delete_tts_engine", [c.c_void_p], None),
    ]
    for name, arguments, result in declarations:
        function = getattr(lib, name)
        function.argtypes = arguments
        function.restype = result
    return lib


def generate(path: Path, expected: str, output: Path, ffmpeg: Path | None):
    manifest, dll, directories = checked_manifest(path, expected, output)
    lib = library(dll)
    version = lib.RHVoice_get_version().decode("ascii")
    if version != manifest["runtime"]["rhvoiceVersion"]:
        raise ValueError("RHVoice runtime differs from the manifest")
    if ffmpeg and not ffmpeg.is_file():
        raise ValueError("Explicit ffmpeg executable does not exist")
    output.mkdir(parents=True, exist_ok=True)
    configuration = output / "isolated-rhvoice-config"
    configuration.mkdir()
    paths = (c.c_char_p * (len(directories) + 1))(
        *[str(directory).encode("utf-8") for directory in directories], None
    )
    report = {"schemaVersion": 1, "kind": "prepared-editorial-synthetic-audio",
              "inputManifestSha256": expected, "source": manifest["source"], "model": manifest["model"],
              "runtime": {"python": sys.version, "rhvoice": version, "device": "CPU"},
              "systemInstallationPerformed": False, "networkUseDuringSynthesis": False,
              "linguisticHumanReview": "pending", "devicePlaybackVerification": "pending", "assets": []}
    if ffmpeg:
        report["runtime"]["ffmpegSha256"] = file_hash(ffmpeg)
    for asset in manifest["assets"]:
        text = spoken_text(asset)
        temporary = output / f"{asset['id']}.partial.wav"
        target = output / f"{asset['id']}.wav"
        started = time.monotonic()
        callback_errors = []
        with wave.open(str(temporary), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)

            @RATE
            def set_rate(rate, _):
                try:
                    wav.setframerate(rate)
                    return 1
                except Exception as error:
                    callback_errors.append(str(error))
                    return 0

            @AUDIO
            def play_speech(samples, count, _):
                try:
                    wav.writeframes(c.string_at(samples, count * 2))
                    return 1
                except Exception as error:
                    callback_errors.append(str(error))
                    return 0

            callbacks = Callbacks(set_rate, play_speech, None, None, None, None, None, None, None)
            init = InitParams(None, str(configuration).encode("utf-8"), paths, callbacks, 0)
            engine = lib.RHVoice_new_tts_engine(c.byref(init))
            if not engine:
                raise RuntimeError("RHVoice initialization failed")
            try:
                count = lib.RHVoice_get_number_of_voices(engine)
                voice_info = lib.RHVoice_get_voices(engine)
                voices = [(voice_info[i].name.decode("utf-8"), voice_info[i].language.decode("ascii"))
                          for i in range(count)]
                if voices != [("Elena", "ru")]:
                    raise ValueError("The isolated resource set did not expose exactly Russian Elena")
                params = SynthesisParams(b"Elena", 0, 0, 0, 1, 1, 0.9, 0, None, 0, 0)
                encoded = text.encode("utf-8")
                message = lib.RHVoice_new_message(engine, encoded, len(encoded), 0, c.byref(params), None)
                if not message:
                    raise RuntimeError("RHVoice rejected the message")
                try:
                    result = lib.RHVoice_speak(message)
                    if result != 1 or callback_errors:
                        raise RuntimeError(f"RHVoice synthesis failed: {result}; {callback_errors}")
                finally:
                    lib.RHVoice_delete_message(message)
            finally:
                lib.RHVoice_delete_tts_engine(engine)
        stats = inspect_wav(temporary)
        temporary.rename(target)
        stats["file"] = target.name
        entry = {key: asset[key] for key in ("id", "locale", "speakerName", "textSha256", "sourcePointer")}
        entry.update({"spokenTextSha256": text_hash(text), "textFormatting": asset.get("textFormatting", "none"),
                      "synthesisSeconds": time.monotonic() - started,
                      "synthesis": {"relativeRate": 1, "relativePitch": 1, "relativeVolume": 0.9,
                                    "messageType": "plain-text"}, "wav": stats})
        if ffmpeg:
            compressed = output / f"{asset['id']}.mp3"
            subprocess.run([str(ffmpeg), "-nostdin", "-hide_banner", "-loglevel", "error", "-n",
                            "-i", str(target), "-map_metadata", "-1", "-codec:a", "libmp3lame",
                            "-b:a", "64k", "-ac", "1", str(compressed)], check=True)
            subprocess.run([str(ffmpeg), "-nostdin", "-hide_banner", "-loglevel", "error",
                            "-i", str(compressed), "-f", "null", "-"], check=True)
            entry["mp3"] = {"file": compressed.name, "sha256": file_hash(compressed),
                            "bytes": compressed.stat().st_size, "codec": "mp3", "bitrate": 64000}
        report["assets"].append(entry)
        print(json.dumps({"id": asset["id"], "durationSeconds": stats["durationSeconds"],
                          "synthesisSeconds": entry["synthesisSeconds"]}), flush=True)
    temporary_manifest = output / "generated-audio-manifest.partial.json"
    temporary_manifest.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary_manifest.rename(output / "generated-audio-manifest.json")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--manifest-sha256", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--ffmpeg", type=Path)
    args = parser.parse_args()
    generate(args.manifest.resolve(), args.manifest_sha256, args.output.resolve(),
             args.ffmpeg.resolve() if args.ffmpeg else None)


if __name__ == "__main__":
    main()
