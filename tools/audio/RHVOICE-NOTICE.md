# RHVoice build adapter

`generate_rhvoice_audio.py` is a build-only adapter, licensed GPL-3.0-or-later.
It contains C API structure/function declarations corresponding to RHVoice's
public API and the official Python/NVDA bindings. The synthesis/capture and
integrity-validation flow is specific to this project.

Upstream: [RHVoice](https://github.com/RHVoice/RHVoice), copyright Olga Yakovleva
and contributors. [Official GPL license](https://github.com/RHVoice/RHVoice/blob/master/LICENSE.md).

The inspected runtime came from the official `RHVoice-1.18.201.nvda-addon`
release package, extracted as a ZIP into the task's `work/audio-build` folder.
Neither NVDA nor a system speech voice is installed by this adapter. It calls
the x64 library directly and receives PCM callbacks into a WAV file.

Elena voice source: [RHVoice/elena-rus](https://github.com/RHVoice/elena-rus).
The voice's README identifies GPL v3 and credits Artem Plaksin, Sergey
Parshakov, Zvonimir Stanecic, Dmitry Kaslin and speaker Elena Soboleva.
Keep this voice's notice and full GPL text with any distributed audio assets;
record voice/engine/source package hashes separately. Do not describe the
synthetic narrator as a participating human guide or an endorsement.

No RHVoice engine, voice model or other runtime binary belongs in the mobile
source tree through this build tool. Prepared audio integration is separate
and must retain the rights manifest and linguistic review status.
