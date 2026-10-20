# Complete canonical narration corpus

Build-only additions; existing first-chapter samples and adapters are preserved.
No network, download, paid API, key, account, voice installation, or system setting
is used. Root owns mobile integration and contracts.

## Interfaces

`canonical_audio.cjs` loads the actual local TypeScript contracts with the existing
mobile TypeScript/Zod dependencies. It exports `exportCanonicalCorpus`,
`exportCanonicalReplay` and `applyPreparedNarration`.

The export validates a sealed bundle and calls **contracts.narrationEntries**,
without reproducing its text composition. The current walk has 54 entries:
three chapters, nine quest fragments and six cues per locale, RU/KK/EN. Question
audio includes choices; the hint and explanation are separate. Chapter title,
all blocks and observation are included. Exact UTF-8 text hashes change when any
of this canonical content changes. No punctuation or pronunciation rewriting is
performed.

`build_narration_corpus.py` accepts a pinned exported corpus and pinned explicit
voice configuration. It uses only the existing local RHVoice Elena (RU), Piper
ISSAI speaker 3 (KK), and Piper LJ Speech speaker 0 (EN). Each attempt delegates
to the original hashed build adapters. Models, engine resources and licenses are
verified before synthesis; no voice or API fallback exists.

The reusable library seam `build_corpus(..., renderer_identity, render)` supports
an explicit local render callback for tests/build adapters. The CLI always uses
`ExplicitLocalRenderer`; the synthetic numeric test signal is never a CLI voice.

## Resume and verification

Cache keys bind exact text/locale, renderer/config/script identity and ffmpeg SHA.
An OS file lock permits one writer per cache/delivery root and is released on
process death. Output roots and existing parents refuse symlinks, junctions and
Windows reparse points before any directory/marker write. Lock files must be
regular, unlinked files; pre-open/path/handle identities are checked before any
write. Each attempt has a new private directory. Nothing is recursively
deleted. Failed attempts remain inspectable, and completed receipts are atomic.
Only completed receipts with matching actual file hashes/sizes and successful
MP3 decoding can be reused. Corrupt finished cache/delivery files cause a visible
failure; no silent overwrite or model replacement occurs. To rebuild after an
integrity failure, preserve the evidence and select a new explicit owned cache
and output folder.

The final manifest is written only after all entries succeed. Delivery filenames
are `audio/<MP3-SHA256>.mp3`; the hash is of encoded bytes, not the text/model.
WAV statistics and encoded duration (ffprobe), size, SHA, successful decode,
upstream model/resources, rights and attribution are retained per entry. WAVs,
models, isolated environments and unfinished attempts stay outside Git in work.

`applyPreparedNarration` requires complete matching coverage and current exact
text hashes, checks bounded file bytes in 64 KiB chunks, refuses path traversal
and linked assets, updates audio refs/assets, and reseals a copied bundle through
the real contracts. It retains map, route and text. Its `verifyPack` result is
**partial / MAP_UNAVAILABLE** while the map is missing. It does not claim native
Android integration, offline readiness, codec decoding at this adapter seam,
human listening, competent pronunciation review, audio focus or lockscreen
acceptance. Codec decoding is performed by the builder and repeated on cache
reuse. Replacing prepared content before publication is a build operation; Root
must handle any previously accepted immutable user revision through its normal
revision flow.

## Commands

From the repository root:

```powershell
node --test tools/audio/test_canonical_audio.cjs
& '../../work/audio-build/venv/Scripts/python.exe' -X utf8 -B -m unittest discover -s tools/audio -p test_*.py -v
```

The Node fixture tests actual file integrity and contracts, explicitly using
nonplayable fixture bytes. Six new Python behavioral tests create real numeric
PCM fixtures, encode/decode actual MP3 and test interruption/resume, corruption,
ownership and path escape. Actual Windows junction-root/parent and hardlinked
lock sentinel regressions run on Windows (not skipped there). They do not load
neural models. Actual full-corpus
synthesis is separate evidence.

```powershell
node tools/audio/canonical_audio.cjs --repo . --output ../../work/audio-build/canonical-corpus-v1 --at 2026-10-20T12:00:00.000Z --bundle-id prepared-audio-corpus

$audioWork=(Resolve-Path -LiteralPath '../../work/audio-build').Path
$ffmpegPath=(Get-Command ffmpeg).Source
& "$audioWork/venv/Scripts/python.exe" -X utf8 -B tools/audio/build_narration_corpus.py `
  --corpus "$audioWork/canonical-corpus-v1/canonical-corpus.json" `
  --corpus-sha256 60d47bec055e667597bbbb8689ec23af1a2bbd6cdd394895f95bc9b5ca80a7f3 `
  --voice-config "$audioWork/canonical-voice-config-v1.json" `
  --voice-config-sha256 09068a792c2b49037b885b06f64c1bdf4bdc904f28399ef3658ba5a3b7956079 `
  --cache "$audioWork/canonical-corpus-cache-v1" `
  --output '../AstanaAI-Prepared-Narration' --ffmpeg $ffmpegPath
```

The export command refuses existing files; reuse the pinned exported source when
resuming the same build version. A changed builder/renderer source changes its
cache identity; select a new delivery folder for a newly generated build instead
of replacing an older final manifest. The voice configuration was deliberately assembled from the original
verified local manifests; it includes exact model/config/card/library/resource
hashes and runtime versions. It never scans for unrelated voices or secrets.
ffprobe must be alongside the explicitly selected ffmpeg executable.

After verifying the final manifest's actual hash:

```powershell
node tools/audio/canonical_audio.cjs --repo . `
  --bundle ../../work/audio-build/canonical-corpus-v1/canonical-bundle.json `
  --apply-manifest ../AstanaAI-Prepared-Narration/prepared-narration-manifest.json `
  --manifest-sha256 '<verified manifest SHA-256>' `
  --asset-root ../AstanaAI-Prepared-Narration `
  --output ../../work/audio-build/canonical-corpus-integrated-v1
```

`licenses/` in the user delivery retains full GPL text, Elena credits and exact
KK/EN model cards. Retain these notices and the manifest when integrating the
assets. Engine/model/data provenance and the project's original editorial text
rights are recorded separately; synthetic narrators are not human participants
or endorsements. All language quality and native lifecycle gates remain open.
