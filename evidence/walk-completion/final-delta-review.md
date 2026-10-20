# AstGeo final delta: brand/docs closure and repeat helper

Independent read-only source review, 2026-10-20. No production source, Git, device, network or account actions. Temporary JVM class output belongs only to this review under task `work/`.

## Closed handoff findings

Commit `6faf8017f2173146a0fbcb6ec456f3990702fa9a` addresses both findings in `astgeo-precommit-review.md`:

- `WalkExperience.tsx:376` and `:527` now both show AstGeo, matching launcher/loading/media names. Current source SHA256 `a29916cbf9b5e4e652d01fb0ddcac2341e08352ed15c0da2f6650950e1ceddbb`.
- `apps/mobile/README.md` now introduces0.6.2 and the focused five-place product, retained geometry,3 stories/54 bundled narration files and durable reading. Native T01 material is under its own separate heading; historical0.1.1 and background0.6.1 results are explicitly versioned. Locked-screen/notification/Bluetooth/language/field limits remain separate. Current SHA256 `385e8fe835bfedb48265d63d223513085c744d8fdccd0af0eb77742b86805e11`.

No new defect found in these changes.

## `walk_again` helper review

Source-local approval: current helper delta is one fixed table entry,16 policy assertions and a bounded README paragraph. The only admitted labels are the3 actual `storyAgain` labels from `WalkExperience.tsx:104,132,160`, used by the story-only repeat Button at`:425`. Non-story `restart` is a different action/label set and has not been added.

The generic matcher is unchanged. Whitespace normalization is retained; prefix/suffix modifications, case changes, zero-width characters, unrelated reset labels, null/empty values and caller-defined `walk_again:<text>` remain rejected. No caller label/session ID/progress payload/coordinate is accepted. The existing repeat callback owns its business transition; the helper does not reset a database directly.

`OwnUiInstrumentation.java` and the manifest are unchanged, including own-window, keyguard, visibility, enabled-state, ambiguity, clickable-ancestor, bounded scroll/timeout, sensitive-screen and screenshot protections. Their SHA256 values remain:

- Instrumentation: `ca33d6f78cdd6f3e95a109e06b2ece19f40d846b56cf5438ca0af228b8f76b7e`.
- Manifest: `00dd93b5d197db0ba88274127b5e48a80a1b84eae496b899a36c90b44ecf2e9e`.

## Independent local verification

Compiled the actual current `UiPolicy.java`, `AndroidPolicyProbe.java` and `UiPolicyTest.java` with cached JDK17, then invoked `kz.astanaai.diagnostics.test.UiPolicyTest`: **142 checks PASS; no Android execution**. Temporary compiled classes: `work/astgeo-policy-review-20261020-234606-321`.

Reviewed source hashes:

- `UiPolicy.java`: `c643bd40fa69a1ea268a4fcfd3ae00fcd8986ddaf767da0d3d768f7b591b351a`.
- `UiPolicyTest.java`: `1db358e0e3e7ad5bca77fb36301c2468e0a8099193aee00e3311fd0d704274c7`.
- Helper README: `94fe8526b96e7b77a28bed05bfc2f21aad00871a19ca5d8660e041d70c4e29d0`.

Root was informed immediately that source review is approved. The helper author owns its APK build/provenance; Root owns installed identity and actual cold-restore/repeat checks. This review does not claim those device steps, audible narration, GPS arrival or field passage.

After the author froze the full helper build, independently read `work/android-ui-build/build-result.json` and hashed its actual APK:29,079 bytes, SHA256 `202a58277bfc22958966891f856522f06410145ab7024e7b1b5c3f838095f13c`. It matches the receipt; all4 manifest/compiled-source entries match current source, permission count0 and builder `phoneRun:false`. No installation/execution was performed by this review. Root received this artifact check before proceeding with the device step.
