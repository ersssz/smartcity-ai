# Prepared editorial audio build tools

These tools generate local files from a deliberate text/model manifest. They
do not download a model, call an API, register a Windows voice or choose a
fallback engine. Root owns mobile integration and dependency decisions.

`generate_prepared_audio.py` supports the verified local Piper KK/EN models.
`generate_rhvoice_audio.py` captures the portable Russian Elena voice through
RHVoice's C API. Both accept `--manifest`, `--manifest-sha256`, `--output` and
an optional explicit `--ffmpeg` executable path. Output paths must be new.
The complete batch receives a final manifest only after every item succeeds.

The actual prepared Baiterek samples, exact file hashes, engine/model rights,
download origins and remaining review gates are recorded in
[AUDIO-OFFLINE-FEASIBILITY.md](../../docs/research/AUDIO-OFFLINE-FEASIBILITY.md).
Heavy files and isolated runtimes are in the task's `work/audio-build` folder,
outside this Git repository. No runtime binary or model belongs in the APK.

## Manifest requirements

Both formats use `schemaVersion: 1`, a `source` object with an explicit local
canonical JSON `path` and `sha256`, and an `assets` array. Each asset contains:

- A distinct safe `id` used as the filename stem.
- `locale`, exact `text`, `textSha256`, and its canonical `sourcePointer`.
- Optional `textFormatting: "literal-paragraph-breaks-v1"` to interpret literal
  backslash-n pairs as paragraph breaks. The original and spoken hashes are
  both recorded. Default `none` changes no characters.
- An explicit narrator selection; there is no locale or voice substitution.

The Piper format has a `models` map. Each entry declares `engine: "piper"`,
`locale`, local ONNX `path`/`sha256`, `configPath`/`configSha256`,
`cardPath`/`cardSha256`, `sourceRevision` and `rights`. An asset selects the
`model` key and integer `speakerId`. `runtime.piperVersion` must match the
installed build tool. Only the approved local eSpeak phonemizers are accepted;
model configurations requiring auxiliary downloads are rejected.

The RHVoice format has one `model` object with `engine: "rhvoice"`, explicit
`dllPath`/`dllSha256`, `licensePath`/`licenseSha256`, `sourcePackages`, `rights`
and `resourceDirectories`. Each directory has a `path` and a `files` map of
relative paths to hashes. Unlisted, missing or modified resource files fail
preflight. Assets specify `locale: "ru"` and `speakerName: "Elena"`.
`runtime.rhvoiceVersion` must equal the loaded library version. The initialized
engine must expose exactly Elena in Russian from the explicit resources.

Use the real `first-chapter-input.json` and `first-chapter-ru-input.json` in
`work/audio-build` as concrete manifests. Their frozen hashes are in the report.
Create a new manifest for new source text/revisions and a new output folder
for a new batch; existing audio and partial files are preserved for inspection.

## Commands

From the repository root, with the already prepared isolated environment:

```powershell
$audioWork = (Resolve-Path -LiteralPath '../../work/audio-build').Path
& "$audioWork/venv/Scripts/python.exe" -X utf8 -B `
  './tools/audio/generate_prepared_audio.py' `
  --manifest "$audioWork/first-chapter-input.json" `
  --manifest-sha256 '435cc16ffa2a2b9688d13ba1e38281fea1536e883e81ee21d850ee593d8be70a' `
  --output "$audioWork/new-kk-en-output"
```

Use `generate_rhvoice_audio.py`, `first-chapter-ru-input.json` and its frozen
hash for the RU batch. Pass `--ffmpeg '<absolute executable path>'` to generate
64 kbit/s mono MP3 files in addition to the original WAV. Every compressed
file is decoded again before being included in the final manifest.

```powershell
& "$audioWork/venv/Scripts/python.exe" -X utf8 -B -m unittest discover `
  -s './tools/audio' -p 'test_*.py' -v
```

The integrity tests do not load neural engines or download anything. They
verify corruption, source mismatch, extra resources and overwrite rejection.
The actual samples separately prove real engine synthesis and MP3 decoding.
Neither test replaces pronunciation/listening, phone playback, audio-focus,
headphone-disconnect, lockscreen or offline lifecycle acceptance.

The RHVoice adapter has separate GPL licensing and notice in
[RHVOICE-NOTICE.md](RHVOICE-NOTICE.md) and [COPYING-GPL-3.0.txt](COPYING-GPL-3.0.txt).
Keep voice/data provenance separate from the source text and application code.
