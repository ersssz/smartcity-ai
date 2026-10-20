# Prepared offline audio: RU / KK / EN

Checked: 2026-10-20. Scope: T09, T10 and the audio sections of ARCHITECTURE. Research was followed by Root-authorized local preparation: isolated Piper installation, verified official KK/EN models, portable RHVoice/Elena extraction, and actual first-chapter WAV/MP3 generation in all three languages. No key was read, no system voice was installed, and no paid service was called. Device playback and competent human listening remain unverified.

## Decision supported by the evidence

Generate editorial audio on the development laptop, then ship ordinary audio files and a versioned rights/checksum manifest with the walk. This removes the dependency on the user's Android TTS engine, including the frequent absence of a Kazakh voice. It also avoids putting hundreds of megabytes of TTS models into the APK. The existing `expo-speech` dependency cannot establish the prepared-file or offline-playback acceptance criteria.

**Kazakh is available at zero service cost.** The best small, established candidate is Piper `kk_KZ-issai-high`. Its publisher card identifies six voices, 22,050 Hz and KazakhTTS data under CC-BY-4.0; it is trained from scratch. The originating ISSAI repository confirms attribution requirements and lists the original research authors and institution. Use a clearly synthetic narrator, retain the model card and the ISSAI attribution, and record the exact chosen speaker ID. Sound quality and local place-name pronunciation still require a listening check. [Piper KK card](https://huggingface.co/rhasspy/piper-voices/blob/c10ece1aade47bb51c153c893d14e5bf8e5b7117/kk/kk_KZ/issai/high/MODEL_CARD), [ISSAI source](https://github.com/IS2AI/Kazakh_TTS).

For English, Piper `en_US-ljspeech-high` is the cleanest candidate found: the card says trained from scratch, 22,050 Hz and public-domain LJ Speech recordings. The dataset author's own page confirms that both the recordings and texts are public domain. This is an American English female narrator, not a professionally directed tourism recording. [EN model card](https://huggingface.co/rhasspy/piper-voices/blob/c10ece1aade47bb51c153c893d14e5bf8e5b7117/en/en_US/ljspeech/high/MODEL_CARD), [dataset author](https://keithito.com/LJ-Speech-Dataset/).

Russian has usable free engines, but the convenient Piper options need a more careful decision. Do not treat a repository-wide MIT badge as proof that every voice has unrestricted provenance. The exact findings are below. The implemented local alternative is **RHVoice Elena**, whose actual extracted README states GPL v3. The official NVDA release archives contain a portable C API library and the voice/language resources: no SAPI registration or NVDA installation is necessary. A first full chapter was captured successfully through that API. This is statistical parametric synthesis; this research does not assert that its naturalness matches a neural narrator. [Elena voice and license](https://github.com/RHVoice/elena-rus), [official Windows instructions](https://rhvoice.org/installation/), [Russian voice packages](https://rhvoice.org/ru-voices/), [RHVoice method and platform description](https://github.com/RHVoice/RHVoice), [file-output CLI source](https://github.com/RHVoice/RHVoice/blob/master/src/test/test.cpp).

## Exact public model metadata inspected

The Hugging Face repository API and `voices.json` were fetched without authentication. The inspected and downloaded KK/EN revision was **`c10ece1aade47bb51c153c893d14e5bf8e5b7117`**. The table gives published metadata; the KK/EN downloads were subsequently independently hashed and matched their published LFS SHA-256 values. No Russian Piper voice was downloaded. Pin this revision rather than `main`. [Publisher repository API](https://huggingface.co/api/models/rhasspy/piper-voices), [pinned voice index](https://huggingface.co/rhasspy/piper-voices/blob/c10ece1aade47bb51c153c893d14e5bf8e5b7117/voices.json).

| Candidate | ONNX bytes | Config bytes | Published ONNX MD5 | Decision |
| --- | ---: | ---: | --- | --- |
| `kk_KZ-issai-high` | 127,864,258 | 4,358 | `d5a97c25feb0949c187ae5f8e72753e3` | Preferred KK synthesis experiment |
| `en_US-ljspeech-high` | 114,199,011 | 4,970 | `dad093b5d2cff6a5fda99883ceda09d1` | Preferred EN synthesis experiment |
| `ru_RU-denis-medium` | 63,201,294 | 4,823 | `76c2f14e521fef3ed574f97ad492728e` | CC0 recordings, but Lessac base provenance unresolved |
| `ru_RU-dmitri-medium` | 63,201,294 | 4,824 | `589ccc91745a1e2353508ff62c5941b7` | Same Lessac issue |
| `ru_RU-irina-medium` | 63,201,294 | 4,765 | `21fbe77fdc68bdc35d7adb6bf4f52199` | Card explicitly lists unknown data license; not cleared |
| `ru_RU-ruslan-medium` | 63,201,294 | 4,882 | `731eb188e63b4c57320e38047ba2d850` | Card lists CC-BY-NC-SA-4.0; not a general commercial-product choice |

The KK high voice has these published speaker IDs: `0` ISSAI_KazakhTTS2_M2; `1` ISSAI_KazakhTTS_M1_Iseke; `2` ISSAI_KazakhTTS2_F3; `3` ISSAI_KazakhTTS_F1_Raya; `4` ISSAI_KazakhTTS2_F1; `5` ISSAI_KazakhTTS2_F2. This permits comparison of six narrators using one downloaded model. The smaller `kk_KZ-iseke-x_low` is a 16 kHz, one-speaker alternative, also trained from scratch on CC-BY-4.0 data, but its tier is an explicit quality compromise rather than the preferred final narrator. [KK index](https://huggingface.co/rhasspy/piper-voices/blob/c10ece1aade47bb51c153c893d14e5bf8e5b7117/voices.json), [Iseke card](https://huggingface.co/rhasspy/piper-voices/blob/main/kk/kk_KZ/iseke/x_low/MODEL_CARD).

The actual source ONNX is approximately 128 MB for KK, **not** the roughly 64 MB shown by a third-party fp16 conversion. No converted mirror is needed for build-time synthesis.

## Russian provenance finding

Denis and Dmitri cards each identify the CC0 OHF/Nabu Casa recordings, but also explicitly state that the voice was fine-tuned from Lessac medium. OHF confirms its contributed recordings are CC0. The original Lessac/Voice Factory corpus license, however, is a manually granted research license that excludes commercial product development. The sources do not resolve how that original agreement applies to redistribution or commercial use of the subsequently released weights and their output. This is a **provenance uncertainty**, not a claim that every downstream output is automatically prohibited. Avoid presenting these voices as commercially cleared until that conflict is resolved, or use another original voice. [Denis card](https://huggingface.co/rhasspy/piper-voices/blob/main/ru/ru_RU/denis/medium/MODEL_CARD), [Dmitri card](https://huggingface.co/rhasspy/piper-voices/blob/main/ru/ru_RU/dmitri/medium/MODEL_CARD), [OHF recordings](https://github.com/OHF-Voice/voice-datasets), [Lessac agreement](https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html).

Irina's card says unknown license; Ruslan's identifies a noncommercial dataset. Neither is the shortcut around this issue. [Irina card](https://huggingface.co/rhasspy/piper-voices/blob/main/ru/ru_RU/irina/medium/MODEL_CARD), [Ruslan card](https://huggingface.co/rhasspy/piper-voices/blob/main/ru/ru_RU/ruslan/medium/MODEL_CARD).

## Build tooling and safe next experiment

Piper's maintained engine is `OHF-Voice/piper1-gpl`, **GPL-3.0**, and is a local engine. Use it only in a dedicated build environment initially. Engine licensing, model licensing, source-text rights and generated audio metadata are separate manifest entries; do not embed this engine into the Android application by accident. [Engine source/license](https://github.com/OHF-Voice/piper1-gpl), [CLI documentation](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/CLI.md).

The PyPI JSON inspected on this date identifies **`piper-tts==1.8.0`** and a Windows Python stable-ABI wheel:

- `piper_tts-1.8.0-cp39-abi3-win_amd64.whl`
- 34,119,688 bytes
- SHA-256 `5da9bfdb05dfe15da3536859d422e605483ffa6d2b3ec2c5b9593bae6b5aa6a4`

That exact wheel was installed in the isolated `work/audio-build/venv` and both models synthesized successfully. Dependencies were captured in `work/audio-build/pip-install-report.json`, including the downloaded wheel hashes. No mobile dependency or lockfile changed. Actual runtime: Python 3.12.14, Piper 1.8.0, ONNX Runtime 1.31.0, NumPy 2.5.4, CPU with two intra-op threads. [Official PyPI metadata](https://pypi.org/pypi/piper-tts/json), [Piper build/platform notes](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/BUILDING.md).

The following describes the setup pattern; the actual executed pipeline commands and output files are recorded below. Run from the task workspace, not the user's home. Obtain the pinned model, config and card together using their exact URL; calculate SHA-256 locally after downloading and retain it in the build manifest.

```powershell
$audioPython = 'C:/Users/era/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
& $audioPython -m venv './work/audio-build-venv'
& './work/audio-build-venv/Scripts/python.exe' -m pip install 'piper-tts==1.8.0'

# After pinned files and a UTF-8 sample have been obtained by the controlled downloader:
& './work/audio-build-venv/Scripts/python.exe' -m piper `
  -m './work/audio-models/kk_KZ-issai-high.onnx' `
  --speaker 3 --input-file './work/audio-samples/kk.txt' `
  -f './work/audio-samples/kk-raya.wav'
```

Pinned KK base URL:
`https://huggingface.co/rhasspy/piper-voices/resolve/c10ece1aade47bb51c153c893d14e5bf8e5b7117/kk/kk_KZ/issai/high/`

Pinned EN base URL:
`https://huggingface.co/rhasspy/piper-voices/resolve/c10ece1aade47bb51c153c893d14e5bf8e5b7117/en/en_US/ljspeech/high/`

The actual sample is the complete first Baiterek chapter from the prepared walk in each language. KK used speaker 3 (Raya); no comparative listening of all six speakers has been completed. A sample demonstrates file generation and measurable PCM, not competent pronunciation or tourism-narration acceptance. The entire corpus has not been generated.

`ffmpeg.exe` was already available locally. The executed preparation used FFmpeg 8.1.1, mono MP3 at 64 kbit/s, removed copied metadata, and decoded each resulting MP3 without an error. Actual files and sizes follow. The WAV originals remain available for later encoding changes without rerunning the models.

## Initial local inventory, before the authorized isolated installation

- Bundled Python: **3.12.14**, x64, at the path above.
- `numpy` present; `piper`, `sherpa_onnx`, `onnxruntime`, `torch` and `soundfile` absent in that runtime.
- No `piper`, `sherpa-onnx-offline-tts` or `espeak-ng` CLI found on PATH. `ffmpeg` found.
- Windows OneCore registry exposes `MSTTS_V110_ruRU_IrinaM` and `MSTTS_V110_ruRU_PavelM`. The inspected Windows speech engine folders include English and Russian. **No installed KK voice was observed.** This is a local inventory result, not a universal Windows capability claim.
- Current mobile dependencies include `expo-speech==58.0.3`; no prepared-file playback package was present in the inspected package.json.
- The inspected editorial content still marks all three prepared-audio slots unavailable. Its translations are drafts awaiting competent human review. Generating audio does not complete that review.

## Required integration after generation

1. Bind every chapter, quest prompt/options/hint/explanation, closing and required command to the exact canonical UTF-8 text hash, locale, text revision, narrator/model revision, model/config hashes, generation settings, audio SHA-256, duration, bytes, codec and rights/attribution entry. Audio for an older text hash is unavailable for the new revision.
2. Bundle the immutable initial assets in the APK and use a single prepared-file player. Give play/pause/resume/stop explicit state; stop on language/stop change, headphones disconnect, session end and the priority Stop path. Background playback/notification control requires actual native implementation and phone checks.
3. Verify files in durable storage, with temporary writes and atomic manifest activation for downloaded updates. A manifest, an APK asset reference, or system TTS availability alone must not set `offlineReady`.
4. Couple audio readiness to the exact `(bundleHash, revision, assetManifestHash)`. Map coverage, complete text/quest materials and all three audio languages must independently pass. A saved route line is not the required offline basemap.
5. Prove the same chapter in RU, KK and EN plays with the network disabled; then process-kill/resume, language switch with progress retained, interruption, pause/resume and native Stop. Human pronunciation checks and device playback are still open.

These application integration steps follow T09/T10 and ARCHITECTURE. Only build-time preparation and integrity checks were executed by this assignment; mobile integration remains Root-owned.

## Actual preparation results

All heavy files are outside Git under `C:/Users/era/Documents/Codex/2026-10-20/x20/work/audio-build/`. Source snapshot: `sources/preparedWalk.json`, bundle `astana-three-forms`, revision 2, SHA-256 **`4c361722fd6eefc31488431ca84e8bf9fe17fa09b83d193256381512ba86422b`**. Filenames identify the Baiterek chapter. The pipeline verifies each string against its JSON Pointer in that hashed source. No words or names were edited. The explicitly declared paragraph-formatting option caused no text-hash change in these actual inputs.

| Locale / narrator | Duration | WAV bytes | MP3 bytes | Synthesis time | Sample rate |
| --- | ---: | ---: | ---: | ---: | ---: |
| KK / Piper ISSAI speaker 3, Raya | 88.479637 s | 3,901,996 | 708,693 | 35.453 s | 22,050 Hz |
| EN / Piper LJ Speech speaker 0 | 93.843447 s | 4,138,540 | 751,534 | 36.141 s | 22,050 Hz |
| RU / RHVoice Elena | 85.915000 s | 4,123,964 | 687,981 | 2.593 s | 24,000 Hz |

All WAVs are mono signed 16-bit PCM. All contain nonzero samples and **zero clipped samples** by the implemented sample inspection. This detects empty/clipped artifacts, not wrong words, omitted speech or unnatural pronunciation.

Actual output paths relative to `work/audio-build`:

- `first-chapter-output/bayterek-chapter-kk-sample-r2.wav` — SHA-256 `9fbeefde754b9284e387ea3cc3920fafe1b7bf64560c06dc9fc5330a2149be66`
- `first-chapter-output/bayterek-chapter-kk-sample-r2.mp3` — SHA-256 `c1fccef28ecdae4f501494b5ea2184990ec8f759469cde4307e924417c317393`
- `first-chapter-output/bayterek-chapter-en-sample-r2.wav` — SHA-256 `8fb0d88986a49411a968b15e3944aa77f36ea2ffe360fda9eb71cd90a2a7eed7`
- `first-chapter-output/bayterek-chapter-en-sample-r2.mp3` — SHA-256 `349ec427b31826e55850a9afec691d2934fce4d02e30f4aa0f526361b086f3ee`
- `first-chapter-ru-output/bayterek-chapter-ru-sample-r2.wav` — SHA-256 `14707c67c28e9f41e964578e6c49b54f36dfe7d06e05bb4816c1fae03c3d9c61`
- `first-chapter-ru-output/bayterek-chapter-ru-sample-r2.mp3` — SHA-256 `76765569d4baebde60df7087c2509a74c7acf2c8f6407617d22755b671bb32c4`

KK/EN input manifest: `first-chapter-input.json`, SHA-256 `435cc16ffa2a2b9688d13ba1e38281fea1536e883e81ee21d850ee593d8be70a`.

RU input manifest: `first-chapter-ru-input.json`, SHA-256 `4663cb6cc1d3f57c3c737d2f3707ce9ecbf471deed5239a7231690848421fd62`.

Output manifests retain source text hashes, explicit narrator, model/config/card/resource hashes, rights, runtime, synthesis settings, measured samples/frames/duration/size, output hashes and pending human/device review:

- `first-chapter-output/generated-audio-manifest.json` — SHA-256 `888ec46cca4bb01f800775c595ac02796542a0b293327c74bd9237280a751c1e`
- `first-chapter-ru-output/generated-audio-manifest.json` — SHA-256 `72ef5c3467367cc0ce876a4c50834f686dfe14c43515d16af47e0ecea6e7f59a`

Downloaded and checked original model SHA-256:

- KK ONNX `4dee767c893e8535da821447d12cb030e3569e11254c14030a1da5d8b2222c16`; config `eb145ac8712b87beda9f0266e95b98cad76acce89d4626cd8b1408234e9842f0`.
- EN ONNX `5d4f08ba6a2a48c44592eed3ce56bf85e9de3dd4e20df90541ae68a8310c029a`; config `7e1f4634af596d83cca997fb7a931ba80b70f8a316a2655ee69c55365e0ace14`.

## Portable Russian preparation: provenance and behavior

The official release API provided package sizes and SHA-256 digests. Both downloaded archives matched those values:

- [RHVoice-1.18.201.nvda-addon](https://github.com/RHVoice/RHVoice/releases/download/1.18.2/RHVoice-1.18.201.nvda-addon), 1,495,432 bytes, SHA-256 `f15a127a15b0bdd531d0cb95072ce8750b1399652917f8d192bed05eaf3ca7b9`.
- [Elena-4.3.2017.12.nvda-addon](https://github.com/RHVoice/elena-rus/releases/download/v4.3/RHVoice-voice-Russian-Elena-4.3.2017.12.nvda-addon), 6,390,783 bytes, SHA-256 `17c12f291bba8154bd42a8f0afdc0f5c24720e4d3efade72756d79c10ce5fd40`.

Archives were inspected and path-checked before extraction. No installer, `installTasks.py`, NVDA addon loader or system registration was run. The only runtime loaded was `rhvoice/core/synthDrivers/RHVoice/lib/x64/RHVoice.dll`, SHA-256 `4a8f760719aaebeac87dc98c3bd777138f53cf8be52278c1d86b7b123e190d84`. Its C API reports **1.18.2**. Explicit `resource_paths` point only to the extracted Elena `data` and `langdata`; **all 68 resource files** are individually hashed. The engine exposed exactly `Elena` with locale `ru`. An empty configuration folder is created inside the output directory.

PCM callbacks write to a temporary WAV; successful `RHVoice_speak == 1`, nonempty PCM inspection and MP3 decode precede publication of the generated manifest. The full GPL text and extracted voice README are retained. [Build adapter notice](../../tools/audio/RHVOICE-NOTICE.md) explains separation from the application; the build adapter is GPL-3.0-or-later. These preparation results do not imply human narrator consent to endorse AstanaAI.

## Executed integrity checks and remaining gates

Executed successfully:

```powershell
& '<task>/work/audio-build/venv/Scripts/python.exe' -X utf8 -B -m unittest discover -s './tools/audio' -p 'test_*.py' -v
```

**12 tests passed.** They exercise corrupted model/source/resource rejection, source-text mismatch even with a newly matching manifest hash, locale/narrator mismatch, unsafe output IDs, unlisted voice resources, auxiliary-download phonemizers, manifest corruption and preservation of existing audio. The valid preflight cases do not import a synthesis runtime or write outputs. Actual full-chapter generation then separately proved the real local engines work.

Remaining before audio acceptance: competent RU/KK/EN listening and name pronunciation, full corpus (including quests/closings/commands), app player lifecycle, revisions/readiness integration, airplane-mode device playback and interruption/Stop behavior. Prepared text marked as awaiting human translation review retains that status after synthesis. Source text changes require a fresh manifest and regeneration of the affected assets.
