#!/usr/bin/env python3
"""Generate prepared files from an explicit, hashed text/model manifest.

This build tool never obtains models, invokes cloud providers or falls back to
another voice. The Piper engine and models stay outside the mobile application.
"""

from __future__ import annotations

import argparse
import array
import hashlib
import importlib.metadata
import json
import math
import re
import subprocess
import sys
import time
import wave
from pathlib import Path


SAFE_ID = re.compile(r"[a-z0-9][a-z0-9._-]{0,95}\Z")
SHA256 = re.compile(r"[0-9a-f]{64}\Z")
LOCALES = {"kk", "en", "ru"}
PHONEMIZERS = {"kk": {"kk"}, "en": {"en", "en-us", "en_US"}, "ru": {"ru"}}


def file_hash(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def verified_file(value: str, expected: str, label: str) -> Path:
    if not SHA256.fullmatch(expected):
        raise ValueError(f"{label}: explicit SHA-256 is required")
    path = Path(value).resolve(strict=True)
    if not path.is_file() or file_hash(path) != expected:
        raise ValueError(f"{label}: SHA-256 mismatch")
    return path


def spoken_text(asset: dict) -> str:
    text = asset["text"]
    if not isinstance(text, str) or not text.strip() or len(text) > 100_000:
        raise ValueError("Each asset needs nonempty, bounded text")
    if text_hash(text) != asset["textSha256"]:
        raise ValueError(f"{asset['id']}: text SHA-256 mismatch")
    if "[[" in text or "]]" in text:
        raise ValueError("Inline Piper phoneme overrides are not accepted")
    formatting = asset.get("textFormatting", "none")
    if formatting == "literal-paragraph-breaks-v1":
        return text.replace("\\n\\n", "\n\n")
    if formatting != "none":
        raise ValueError(f"Unknown explicit text formatting: {formatting}")
    return text


def prepare(manifest_path: Path, expected_hash: str, output: Path) -> tuple[dict, dict]:
    verified_file(str(manifest_path), expected_hash, "text manifest")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1 or not manifest.get("assets"):
        raise ValueError("Expected a schemaVersion 1 manifest with assets")
    source = manifest["source"]
    source_path = verified_file(source["path"], source["sha256"], "canonical content source")
    source_content = json.loads(source_path.read_text(encoding="utf-8"))
    models = {}
    for key, model in manifest["models"].items():
        if not SAFE_ID.fullmatch(key) or model.get("engine") != "piper":
            raise ValueError("Only explicitly named local Piper models are accepted")
        model_path = verified_file(model["path"], model["sha256"], f"{key} model")
        config_path = verified_file(model["configPath"], model["configSha256"], f"{key} config")
        verified_file(model["cardPath"], model["cardSha256"], f"{key} model card")
        config = json.loads(config_path.read_text(encoding="utf-8"))
        if config.get("phoneme_type", "espeak") != "espeak":
            raise ValueError("Only installed eSpeak phonemization is allowed; no auxiliary downloads")
        if model["locale"] not in LOCALES or config["espeak"]["voice"] not in PHONEMIZERS[model["locale"]]:
            raise ValueError("Unsupported locale or phonemizer")
        if not model.get("rights") or not model.get("sourceRevision"):
            raise ValueError("Model rights and source revision are required")
        models[key] = (model_path, config_path, config)
    seen = set()
    for asset in manifest["assets"]:
        name = asset["id"]
        if not SAFE_ID.fullmatch(name) or name in seen:
            raise ValueError("Duplicate or unsafe asset ID")
        seen.add(name)
        model_key = asset["model"]
        if model_key not in models or asset["locale"] != manifest["models"][model_key]["locale"]:
            raise ValueError("Each asset must explicitly match its model locale")
        speaker = asset["speakerId"]
        if not isinstance(speaker, int) or not 0 <= speaker < models[model_key][2]["num_speakers"]:
            raise ValueError("Explicit speaker ID is outside the model")
        pointer = asset["sourcePointer"]
        if not isinstance(pointer, str) or not pointer.startswith("/"):
            raise ValueError("An explicit source JSON Pointer is required")
        canonical = source_content
        for part in pointer[1:].split("/"):
            part = part.replace("~1", "/").replace("~0", "~")
            canonical = canonical[int(part)] if isinstance(canonical, list) else canonical[part]
        if canonical != asset["text"]:
            raise ValueError("Manifest text differs from its canonical source")
        spoken_text(asset)
        for suffix in (".wav", ".mp3"):
            if (output / f"{name}{suffix}").exists():
                raise ValueError("Refusing to overwrite an existing generated asset")
    if (output / "generated-audio-manifest.json").exists():
        raise ValueError("Refusing to overwrite an existing output manifest")
    return manifest, models


def inspect_wav(path: Path) -> dict:
    with wave.open(str(path), "rb") as sound:
        channels, width, rate, frames = sound.getnchannels(), sound.getsampwidth(), sound.getframerate(), sound.getnframes()
        if channels != 1 or width != 2 or frames <= 0 or rate <= 0:
            raise ValueError("Expected nonempty mono 16-bit PCM")
        samples = array.array("h", sound.readframes(frames))
    if sys.byteorder != "little":
        samples.byteswap()
    nonzero = sum(value != 0 for value in samples)
    if nonzero == 0:
        raise ValueError("Generated audio contains silence only")
    return {
        "file": path.name, "sha256": file_hash(path), "bytes": path.stat().st_size,
        "codec": "pcm_s16le", "sampleRate": rate, "channels": channels,
        "frames": frames, "durationSeconds": frames / rate,
        "nonzeroSamples": nonzero, "peak": max(abs(value) for value in samples),
        "rms": math.sqrt(sum(value * value for value in samples) / len(samples)),
        "clippedSamples": sum(abs(value) >= 32767 for value in samples),
    }


def generate(manifest_path: Path, expected_hash: str, output: Path, ffmpeg: Path | None) -> dict:
    manifest, models = prepare(manifest_path, expected_hash, output)
    # Import only after all explicit inputs and output paths have passed checks.
    import onnxruntime
    from piper import PiperVoice, SynthesisConfig
    from piper.config import PiperConfig

    if importlib.metadata.version("piper-tts") != manifest["runtime"]["piperVersion"]:
        raise ValueError("Piper runtime differs from the manifest")
    output.mkdir(parents=True, exist_ok=True)
    report = {
        "schemaVersion": 1, "kind": "prepared-editorial-synthetic-audio",
        "inputManifestSha256": expected_hash,
        "source": manifest["source"], "models": manifest["models"],
        "runtime": {"python": sys.version, "piper": importlib.metadata.version("piper-tts"),
                    "onnxruntime": onnxruntime.__version__, "device": "CPU", "threads": 2},
        "networkUseDuringSynthesis": False, "linguisticHumanReview": "pending",
        "devicePlaybackVerification": "pending", "assets": [],
    }
    if ffmpeg:
        if not ffmpeg.is_file():
            raise ValueError("The explicit ffmpeg executable was not found")
        report["runtime"]["ffmpegSha256"] = file_hash(ffmpeg)
        report["runtime"]["ffmpegVersion"] = subprocess.run(
            [str(ffmpeg), "-version"], check=True, capture_output=True, text=True
        ).stdout.splitlines()[0]
    voices = {}
    for asset in manifest["assets"]:
        key = asset["model"]
        if key not in voices:
            model_path, _, config = models[key]
            options = onnxruntime.SessionOptions()
            options.intra_op_num_threads = 2
            options.inter_op_num_threads = 1
            options.execution_mode = onnxruntime.ExecutionMode.ORT_SEQUENTIAL
            voices[key] = PiperVoice(
                session=onnxruntime.InferenceSession(str(model_path), sess_options=options,
                                                   providers=["CPUExecutionProvider"]),
                config=PiperConfig.from_dict(config), use_tashkeel=False,
            )
        text = spoken_text(asset)
        config = SynthesisConfig(speaker_id=asset["speakerId"], length_scale=1.0,
                                 noise_scale=0.667, noise_w_scale=0.8,
                                 normalize_audio=True, volume=0.9)
        wav_path = output / f"{asset['id']}.wav"
        partial = output / f"{asset['id']}.partial.wav"
        if partial.exists():
            raise ValueError("A partial file exists; inspect it before retrying")
        started = time.monotonic()
        with wave.open(str(partial), "wb") as sound:
            voices[key].synthesize_wav(text, sound, syn_config=config)
        result = inspect_wav(partial)
        partial.rename(wav_path)
        result["file"] = wav_path.name
        entry = {key: asset[key] for key in ("id", "locale", "model", "speakerId", "textSha256")}
        entry.update({"sourcePointer": asset.get("sourcePointer"),
                      "textFormatting": asset.get("textFormatting", "none"),
                      "spokenTextSha256": text_hash(text),
                      "synthesis": {"lengthScale": 1.0, "noiseScale": 0.667, "noiseWScale": 0.8,
                                    "normalizeAudio": True, "volume": 0.9},
                      "synthesisSeconds": time.monotonic() - started, "wav": result})
        if ffmpeg:
            compressed = output / f"{asset['id']}.mp3"
            subprocess.run([str(ffmpeg), "-nostdin", "-hide_banner", "-loglevel", "error", "-n",
                            "-i", str(wav_path), "-map_metadata", "-1", "-codec:a", "libmp3lame",
                            "-b:a", "64k", "-ac", "1", str(compressed)], check=True)
            # Decode the compressed file too, so a written but invalid MP3 is rejected.
            subprocess.run([str(ffmpeg), "-nostdin", "-hide_banner", "-loglevel", "error",
                            "-i", str(compressed), "-f", "null", "-"], check=True)
            entry["mp3"] = {"file": compressed.name, "sha256": file_hash(compressed),
                            "bytes": compressed.stat().st_size, "codec": "mp3", "bitrate": 64000}
        report["assets"].append(entry)
        print(json.dumps({"id": asset["id"], "durationSeconds": result["durationSeconds"],
                          "synthesisSeconds": entry["synthesisSeconds"]}), flush=True)
    target = output / "generated-audio-manifest.json"
    temporary = output / "generated-audio-manifest.partial.json"
    temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.rename(target)
    return report


def main() -> None:
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
