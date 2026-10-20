#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Resumable local-only corpus builder. Engines/models are explicit, pinned inputs.

The render callback is the public local synthesis seam. The CLI only supplies
the previously verified Piper/RHVoice adapters; no network or voice fallback.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import uuid
from contextlib import contextmanager
from pathlib import Path
from generate_prepared_audio import file_hash, inspect_wav, text_hash, verified_file

SHA = re.compile(r"[a-f0-9]{64}\Z")


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def atomic_json(path, value):
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".partial")
    with temporary.open("xb") as stream:
        stream.write(encoded(value)); stream.flush(); os.fsync(stream.fileno())
    os.replace(temporary, path)


def owned_root(root):
    # Do not resolve first: that would erase the requested junction/symlink.
    # Check existing ancestors too, before mkdir can cross a linked parent.
    for candidate in (root.absolute(), *root.absolute().parents):
        try:
            attributes = candidate.lstat()
        except FileNotFoundError:
            continue
        if (candidate.is_symlink()
                or (hasattr(candidate, "is_junction") and candidate.is_junction())
                or getattr(attributes, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)):
            raise ValueError("Refusing a linked/reparse output root or parent")
    root.mkdir(parents=True, exist_ok=True)
    marker = root / ".audio-corpus-owner.json"
    if not marker.exists():
        if any(root.iterdir()):
            raise ValueError("Refusing an unowned nonempty output folder")
        with marker.open("xb") as stream:
            stream.write(encoded({"kind": "astana-prepared-audio-build", "version": 1}))
    if marker.is_symlink() or json.loads(marker.read_text()) != {"kind": "astana-prepared-audio-build", "version": 1}:
        raise ValueError("Invalid output ownership marker")
    return root.resolve(strict=True)


def within(root, relative):
    parts = Path(relative).parts
    if not parts or Path(relative).is_absolute() or any(p in ("..", ".", "") for p in parts):
        raise ValueError("Unsafe generated path")
    target = root.joinpath(*parts)
    for parent in (target, *target.parents):
        if parent == root:
            break
        if parent.is_symlink() or (hasattr(parent, "is_junction") and parent.is_junction()):
            raise ValueError("Refusing linked build content")
    if not target.resolve().is_relative_to(root):
        raise ValueError("Generated path escaped owned root")
    return target


@contextmanager
def writer_lock(root):
    target = root / ".writer-lock"

    def plain(info):
        if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
                or getattr(info, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)):
            raise ValueError("Refusing a linked/reparse/non-regular writer lock")

    try:
        before = target.lstat(); plain(before)
    except FileNotFoundError:
        before = None
    # No truncation/append and no writes before checking the actual opened file.
    fd = os.open(target, os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(fd, "r+b") as lock:
        opened = os.fstat(lock.fileno()); plain(opened)
        current = target.lstat(); plain(current)
        identity = lambda info: (info.st_dev, info.st_ino)
        if identity(current) != identity(opened) or (before and identity(before) != identity(opened)):
            raise ValueError("Writer lock identity changed while opening")
        lock.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            if opened.st_size == 0:
                lock.write(b"0"); lock.flush(); os.fsync(lock.fileno()); lock.seek(0)
            yield
        finally:
            lock.seek(0)
            if os.name == "nt":
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def media_info(ffmpeg, mp3):
    ffprobe = ffmpeg.with_name("ffprobe" + ffmpeg.suffix)
    if not ffprobe.is_file():
        raise ValueError("Explicit ffmpeg directory must also contain ffprobe")
    subprocess.run([str(ffmpeg), "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(mp3), "-f", "null", "-"], check=True)
    result = json.loads(subprocess.run([str(ffprobe), "-v", "error", "-show_entries", "format=duration:stream=codec_name,channels", "-of", "json", str(mp3)], check=True, capture_output=True).stdout)
    seconds = float(result["format"]["duration"])
    if len(result["streams"]) != 1 or result["streams"][0] != {"codec_name": "mp3", "channels": 1} or not 0 < seconds < 7200:
        raise ValueError("Expected a bounded nonempty mono MP3")
    return {"durationSeconds": seconds, "decodingVerified": True, "sha256": file_hash(mp3), "bytes": mp3.stat().st_size}


def read_corpus(file, expected):
    verified_file(str(file), expected, "canonical corpus")
    if file.stat().st_size > 5_000_000:
        raise ValueError("Corpus size limit")
    corpus = json.loads(file.read_text(encoding="utf-8"))
    if corpus.get("schemaVersion") != 1 or corpus.get("kind") != "canonical-prepared-narration-corpus" or corpus.get("textFormatting") != "none" or corpus.get("narrationFormat") != "contracts.narrationEntries.v1":
        raise ValueError("Unsupported canonical corpus")
    entries = corpus["entries"]
    if not 1 <= len(entries) <= 500 or len({e["id"] for e in entries}) != len(entries):
        raise ValueError("Invalid corpus entry count/identity")
    for entry in entries:
        if entry["locale"] not in {"ru", "kk", "en"} or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9:._-]{0,199}", entry["id"]):
            raise ValueError("Invalid entry identity/locale")
        if not isinstance(entry["text"], str) or not 0 < len(entry["text"]) <= 100_000 or text_hash(entry["text"]) != entry["textSha256"] or "[[" in entry["text"] or "]]" in entry["text"]:
            raise ValueError("Exact canonical text hash mismatch or unsupported override")
    return corpus


def build_corpus(source, expected, cache, delivery, ffmpeg, renderer_identity, render):
    corpus = read_corpus(source, expected)
    ffmpeg = ffmpeg.resolve(strict=True)
    ffmpeg_hash = file_hash(ffmpeg)
    cache, delivery = owned_root(cache), owned_root(delivery)
    if cache == delivery or cache.is_relative_to(delivery) or delivery.is_relative_to(cache):
        raise ValueError("Cache and delivery roots must be independent")
    with writer_lock(cache), writer_lock(delivery):
        entries, cache_hits, total = [], 0, 0
        for source_entry in corpus["entries"]:
            key = text_hash(json.dumps({"textSha256": source_entry["textSha256"], "locale": source_entry["locale"], "renderer": renderer_identity, "ffmpegSha256": ffmpeg_hash}, sort_keys=True))
            job = within(cache, "jobs/" + key); job.mkdir(parents=True, exist_ok=True)
            receipt_file = job / "receipt.json"
            cached = receipt_file.exists()
            if cached:
                if receipt_file.is_symlink():
                    raise ValueError("Linked cache receipt")
                receipt = json.loads(receipt_file.read_text())
                if receipt["cacheKey"] != key:
                    raise ValueError("Cache identity mismatch")
                mp3 = within(cache, receipt["cachePath"])
                if not mp3.is_file() or file_hash(mp3) != receipt["sha256"] or mp3.stat().st_size != receipt["bytes"]:
                    raise ValueError("Corrupt finished cache: inspect it before explicit rebuild")
                actual = media_info(ffmpeg, mp3)
                if actual["durationSeconds"] != receipt["durationSeconds"]:
                    raise ValueError("Cached MP3 duration mismatch")
                cache_hits += 1
            else:
                attempt = job / ("attempt-" + uuid.uuid4().hex); attempt.mkdir()
                rendered = render(source_entry, attempt)
                wav = Path(rendered["wavPath"]).resolve(strict=True)
                if not wav.is_relative_to(attempt.resolve()):
                    raise ValueError("Renderer returned a file outside its attempt")
                stats = inspect_wav(wav)
                mp3 = attempt / "encoded.mp3"
                subprocess.run([str(ffmpeg), "-nostdin", "-hide_banner", "-loglevel", "error", "-n", "-i", str(wav), "-map_metadata", "-1", "-codec:a", "libmp3lame", "-b:a", "64k", "-ac", "1", str(mp3)], check=True)
                info = media_info(ffmpeg, mp3)
                provenance = rendered["provenance"]
                if not provenance.get("license") or not provenance.get("attribution"):
                    raise ValueError("Explicit recording provenance required")
                receipt = {"cacheKey": key, "cachePath": mp3.relative_to(cache).as_posix(), "wav": stats, "provenance": provenance, **info}
                atomic_json(receipt_file, receipt)
            if receipt["bytes"] > 100_000_000:
                raise ValueError("Per-asset byte ceiling")
            total += receipt["bytes"]
            if total > 250_000_000:
                raise ValueError("Corpus byte ceiling")
            relative = "audio/" + receipt["sha256"] + ".mp3"
            target = within(delivery, relative); target.parent.mkdir(exist_ok=True)
            if target.exists():
                if file_hash(target) != receipt["sha256"] or target.stat().st_size != receipt["bytes"]:
                    raise ValueError("Corrupt existing delivery file; refusing overwrite")
            else:
                temporary = target.with_name(target.name + "." + uuid.uuid4().hex + ".partial")
                with temporary.open("xb") as out, mp3.open("rb") as inp:
                    shutil.copyfileobj(inp, out, 65536); out.flush(); os.fsync(out.fileno())
                if file_hash(temporary) != receipt["sha256"]:
                    raise ValueError("Copy checksum mismatch")
                os.replace(temporary, target)
            entries.append({"id": source_entry["id"], "locale": source_entry["locale"], "textSha256": source_entry["textSha256"],
                            "assetId": "audio-" + receipt["sha256"], "path": relative, "sha256": receipt["sha256"], "bytes": receipt["bytes"],
                            "durationSeconds": receipt["durationSeconds"], "decodingVerified": True, "wav": receipt["wav"], "provenance": receipt["provenance"]})
            print(json.dumps({"id": source_entry["id"], "bytes": receipt["bytes"], "cacheHit": cached}), flush=True)
        manifest = {"schemaVersion": 1, "kind": "verified-prepared-narration", "corpusSha256": expected,
                    "sourceBundleHash": corpus["sourceBundleHash"], "contentRevision": corpus["contentRevision"],
                    "narrationFormat": corpus["narrationFormat"], "textFormatting": "none", "networkUseDuringSynthesis": False,
                    "linguisticHumanReview": "pending", "nativePlaybackVerification": "pending", "offlinePackReadiness": "not_asserted",
                    "runtime": {"python": sys.version, "ffmpegSha256": ffmpeg_hash, "ffprobeSha256": file_hash(ffmpeg.with_name("ffprobe" + ffmpeg.suffix)), "rendererIdentity": renderer_identity}, "entries": entries}
        final = delivery / "prepared-narration-manifest.json"
        if final.exists() and final.read_bytes() != encoded(manifest):
            raise ValueError("Existing final manifest differs; use a new owned delivery folder")
        atomic_json(final, manifest)
        return {"entries": len(entries), "bytes": total, "cacheHits": cache_hits, "manifestSha256": file_hash(final)}


class ExplicitLocalRenderer:
    def __init__(self, config_path, config_hash, source, source_hash):
        verified_file(str(config_path), config_hash, "explicit voice configuration")
        self.config = json.loads(config_path.read_text(encoding="utf-8"))
        self.source, self.source_hash = source, source_hash
        self.indices = {e["id"]: n for n, e in enumerate(read_corpus(source, source_hash)["entries"])}
        self.identity = text_hash(config_hash + file_hash(Path(__file__)) + file_hash(Path(__file__).with_name("generate_prepared_audio.py")) + file_hash(Path(__file__).with_name("generate_rhvoice_audio.py")))

    def __call__(self, entry, attempt):
        asset = {"id": "narration", "locale": entry["locale"], "text": entry["text"], "textSha256": entry["textSha256"], "textFormatting": "none", "sourcePointer": f"/entries/{self.indices[entry['id']]}/text"}
        manifest = {"schemaVersion": 1, "source": {"path": str(self.source), "sha256": self.source_hash}, "assets": [asset]}
        if entry["locale"] == "ru":
            import generate_rhvoice_audio as engine
            manifest.update({"runtime": self.config["rhvoice"]["runtime"], "model": self.config["rhvoice"]["model"]})
            asset["speakerName"] = "Elena"
            rights = manifest["model"]["rights"]
            provenance = {"engine": "RHVoice", "runtime": manifest["runtime"], "voice": "Elena", "license": rights["voiceLicense"], "attribution": rights["attribution"], "model": manifest["model"]}
        else:
            import generate_prepared_audio as engine
            model = self.config["piper"]["models"][entry["locale"]]
            manifest.update({"runtime": self.config["piper"]["runtime"], "models": {entry["locale"]: model}})
            asset.update({"model": entry["locale"], "speakerId": 3 if entry["locale"] == "kk" else 0})
            rights = model["rights"]
            provenance = {"engine": "Piper", "runtime": manifest["runtime"], "speakerId": asset["speakerId"], "license": rights["datasetLicense"], "attribution": rights["attribution"], "model": model}
        file = attempt / "explicit-render-input.json"; file.write_bytes(encoded(manifest))
        output = attempt / "rendered"
        engine.generate(file, file_hash(file), output, None)
        return {"wavPath": output / "narration.wav", "provenance": provenance}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("corpus", "voice-config", "cache", "output", "ffmpeg"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--corpus-sha256", required=True); parser.add_argument("--voice-config-sha256", required=True)
    args = parser.parse_args()
    source = args.corpus.resolve(strict=True)
    renderer = ExplicitLocalRenderer(args.voice_config.resolve(strict=True), args.voice_config_sha256, source, args.corpus_sha256)
    result = build_corpus(source, args.corpus_sha256, args.cache, args.output, args.ffmpeg, renderer.identity, renderer)
    print(json.dumps({"complete": result}), flush=True)


if __name__ == "__main__":
    main()
