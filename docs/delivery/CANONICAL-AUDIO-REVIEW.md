# Canonical audio: independent source review

Review date: 2026-10-20. Reviewer: `planner_contract_design`, independent of the audio source owner. Scope is the frozen local export/build/apply tooling and its source tests, not a complete audio or offline product acceptance. No model synthesis, network request, device action or paid service was performed by this review.

Current result after the independent follow-up below: **both reproduced P2 findings are closed**. No blocking source-review finding remains within this scope. Runtime/editorial/full-offline acceptance remains pending.

## Source snapshot

| File | Reviewed SHA-256 |
| --- | --- |
| `tools/audio/canonical_audio.cjs` | `fe8b937ad81a487405dbc6b5a829177ecefc087ac24ba533c5dbbfb114d2404b` |
| `tools/audio/build_narration_corpus.py` | `3f7244f70d5b820a2cfe59b842f1f7c35a75b796ec795f916fb9199b47da7862` |
| `tools/audio/test_canonical_audio.cjs` | `c60a13780e43514861a6b7bd2fa3e6b755f2e26089239555a4417d1f6667a249` |
| `tools/audio/test_build_narration_corpus.py` | `f48e741efb476c67fb52d5f0f13026c4d2b4ee8130b3c0e506f6f09223d66ef3` |

Standards authority: `AGENTS.md`, in particular preserving unrelated files, explicit rights, actual evidence and meaningful public Interface tests. Spec authority: `docs/plan/tasks/t09-three-languages-audio.md`, PRODUCT-SPEC audio/offline requirements, ARCHITECTURE sections 3–4, and the exact `narrationEntries`/`verifyPack` contract. This is an assigned source snapshot review rather than a branch diff review. Separate Standards and Spec assessments are retained.

## Standards

### P2 — Windows junction output root bypasses ownership/link guard (open at initial snapshot)

At `build_narration_corpus.py:36–48`, `owned_root` rejects `is_symlink()` but not `is_junction()`. Windows Python 3.12 reports an NTFS directory junction as `is_symlink=False, is_junction=True`. Supplying an empty junction as the cache or delivery root succeeds, creates the ownership marker in its target, and returns that target from `resolve()`. The same implementation explicitly rejects junctions below a root in `within()` at lines 56–60, so the root boundary is inconsistent.

This matters before synthesis: an output path that is linked elsewhere can cause writes outside the expected folder. Reproduced only with a dedicated junction and empty target both inside `work/audio-review-8a1ffd9dabf343dfb0f39d794582fdec`; no unrelated files were accessed. Actual output was `ACCEPTED_JUNCTION_ROOT` with `markerCreated=true` in `outside-requested-root`.

Fix: reject a root junction before creating the folder or marker, using the existing child-path policy, and add a Windows regression checking that no target marker/render output is created. Root and the audio source owner were notified immediately. Independent closure will be appended against the corrected source hash.

### P2 — Linked writer-lock file can modify a file outside the owned root (open at initial snapshot)

At `build_narration_corpus.py:66–69`, `writer_lock` opens `.writer-lock` directly with `a+b` and writes a byte before acquiring the lock. The generated-path guard is not used, and no regular-file/link-count validation occurs. A hard link is neither a symlink nor a reparse point, so fixing the directory-junction guard alone does not close this path.

Reproduced with a separate dedicated marked scratch root and an NTFS hard link from its `.writer-lock` to a scratch sentinel outside that root. Calling `with writer_lock(root): pass` changed the sentinel from `KEEP UNCHANGED` to `KEEP UNCHANGED0`; `st_nlink` was 2. Only reviewer-created scratch files were used. This is an actual write outside the owned folder, before any synthesis or cache verification.

Fix: validate the lock path before any write (including regular-file, reparse/symlink and multiple-hardlink rejection); retain protection when creating/opening the lock and add a regression asserting an outside sentinel remains unchanged. Source owner and Root were notified. Independent closure remains pending.

No other actionable documented-standard breach was reproduced in this bounded review. Code-smell heuristics are not reported as hard violations.

## Spec

No additional blocking content/integrity defect was reproduced in the reviewed snapshot. The following were actually checked:

- Exported the real canonical replay bundle. Independently reconstructed every chapter from title plus all blocks, each question from prompt plus choices, each separate hint/explanation and all six cues. All **54 exact UTF-8 texts and hashes** matched: 3 chapters + 9 quest parts + 6 cues per locale, **18 each for RU/KK/EN**. The question entry does not concatenate its explanation or correct-answer metadata. The builder requests `textFormatting: none`; no canonical text rewriting is introduced.
- Public apply rejected **nine** additional mutations: duplicate ID, wrong locale, changed content revision, unverified decoding flag, zero duration, fractional byte count, missing rights, incorrect content-addressed asset ID and a junction asset root. Existing tests separately cover changed text hash, missing coverage, path escape and corrupt file bytes.
- Applying the explicit non-playable integrity fixture preserved request, stop/route data, context and facts, resealed the bundle, and returned **partial**, with exactly `map / MAP_UNAVAILABLE`. This fixture tests integrity only; it is not evidence of playable audio.
- Python public builder tests exercise interrupted rendering, absence of a partial final manifest, verified finished-file reuse, repeat-run identity, actual cached-byte corruption, changed corpus SHA, rejection of unowned nonempty output and traversal in a cache receipt. They use small synthetic PCM files and local FFmpeg, not a neural voice or language acceptance. Finished cache items are decoded again before reuse. Delivery files are checked before reuse and atomically copied; a changed final manifest cannot overwrite an existing different one.
- Application hashes the real bounded asset bytes and enforces the expected filename, size, locale, text hash and provenance. It does not decode at the application seam; `decodingVerified` is a trusted builder receipt. CLI manifest bytes have an explicit SHA guard. Reusing matching text recordings across different bundle geometry is compatible with per-entry text identity; the manifest's original source bundle hash is provenance, not a replacement for target-text validation.

## Commands and limits

Environment: Windows, Node `v22.22.2`, Python `3.12.14`. Commands from repository root:

```powershell
& 'C:/Program Files/nodejs/node.exe' --test tools/audio/test_canonical_audio.cjs
& 'C:/Users/era/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' -X utf8 -B -m unittest discover -s tools/audio -p 'test_*.py' -v
```

Results at initial snapshot: **3/3 Node PASS; 16/16 Python PASS**. Additional public API probes: **54/54 exact entries; 9/9 mutations rejected; expected partial pack**. The root-junction and hardlinked writer-lock ownership probes reproduced both P2 findings despite the green source tests.

Full neural synthesis is a separate source-owner operation. Listening/pronunciation review, semantic translation review, actual Android playback, audio focus, headset disconnection, background/lockscreen behavior, airplane-mode playback, durable app installation and licensed offline map acceptance remain unproven by these tests. The builder manifest correctly records human/native review as pending and offline readiness as not asserted. T09/T10/T14 and the full beta are not accepted by this source review.

Initial result: Standards **2 reproduced P2 findings, pending fixes**; Spec **0 additional reproduced blocking findings**, with the runtime/editorial acceptance limits above.

## Follow-up: ownership findings closed independently

Corrected builder SHA-256: `0fce22ed9971ad7144d7a23620182fb1649eaa8dacbc594d0d56dc32bf03df9c`. Corrected builder-test SHA-256: `c29953064e47083883b475ef4207511df54ac6aa2f9885f41c2f51639ca8fc1b`. The JS adapter and JS test hashes remain exactly as pinned above.

The source owner changed `owned_root` to inspect the requested root and its existing parent chain for symlinks, junctions and Windows reparse attributes before `mkdir` or marker creation. `writer_lock` now rejects nonregular, reparse and multiple-hardlink files before writing, opens without append/truncate, checks descriptor/path identity, acquires the OS lock and only then initializes an empty lock file.

I repeated both original failing probes in a new Python process against the corrected source. The root junction returned `Refusing a linked/reparse output root or parent`; the previous target marker bytes remained unchanged. The hardlinked `.writer-lock` returned `Refusing a linked/reparse/non-regular writer lock`; the sentinel bytes remained unchanged. The two new regression tests also ran on Windows, including the parent-junction case, without skipping.

Independent repeated source suites: **18/18 Python PASS, 0 skipped; 3/3 Node PASS, 0 skipped**. Python used only its synthetic PCM/FFmpeg fixtures. No neural resynthesis was started. A pre-fix synthesis already running under the source owner's control is a separate operation; its output and provenance were not certified by this review.

Final source-review result: Standards **2 findings fixed and independently closed, 0 open**; Spec **0 additional blocking findings reproduced**. Exact corpus identity, real-byte integrity and conservative partial readiness are verified at the build seam. Pronunciation, phone playback and a complete offline pack remain separate gates.
