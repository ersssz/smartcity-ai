# Offline walk package preparation

This Module prepares and verifies durable content against the real WalkBundle
contract, then activates an exact `(bundleHash, revision, manifestHash)`.
It owns asset preparation and manifest selection. It has no walking progress,
collection, GPS, network-provider or payment implementation.

The core ESM file has no Node or third-party runtime import. Inject the exports
`readBundle`, `verifyPack`, `narrationEntries` and `canonicalJson` from
`packages/contracts/src/index.ts`, a UTF-8 SHA-256 function, a Storage Adapter
and an AssetSource Adapter. No contract or mobile dependency changed here.

## Interface

```js
const packs = createPackStore({
  contracts, hash, storage, source,
  userAgent: 'AstanaAI/0.4 (offline preparation; contact: your-project-contact)',
  limits: { concurrency: 4, maxPackBytes: 250_000_000,
    maxTransferBytes: 250_000_000, maxStoredBytes: 500_000_000 },
  mapPolicy: { kind: 'self_contained' },
});
const preparation = await packs.prepare(bundleJson, { signal });
// Show partial/missing/policyErrors to the person. No activation is automatic.
if (preparation.state === 'ready') await packs.activate(bundleHash);
await packs.pin(sessionId, bundleHash); // Explicitly retain a session's revision.
const { current, previous, pins } = await packs.snapshot();
```

- `prepare(json, {signal?})` validates before obtaining assets, deduplicates by
  content hash, hashes real stored bytes, fetches missing/corrupt files and
  verifies the exact contract manifest. It returns `ready`, `partial` or
  `invalid_bundle`, plus transfer counts/failure codes when applicable. A new
  revision has independent readiness; it does not inherit a previous ready flag.
- `verify(bundleHash)` rechecks durable bytes with the contract's `AssetReader`;
  it also enforces local policy. `policyErrors` can keep an otherwise intact
  package partial. A different byte count, changed text/audio binding, missing
  locale, map resources or cache-only storage cannot become ready.
- `activate(bundleHash)` first verifies. Only a ready package can atomically
  replace `current`; the former current becomes `previous`. Interrupted
  preparation never changes either selection.
- `snapshot()` returns `{current, previous, pins}`. Each selection contains the
  exact `json`, `identity` and a **fresh** `verification`. There is no separate
  stale ready flag in this Interface.
- `pin(sessionId, bundleHash)` retains a known revision, including a partial
  online session. A session cannot silently change its existing pin to another
  revision. `unpin(sessionId)` is explicit.
- `remove(bundleHash)` refuses current or pinned packages. For an explicitly
  removed unpinned package it deletes only content hashes unreferenced by every
  remaining manifest. Shared audio/maps and other revisions survive. Nothing
  automatically evicts a pinned package to satisfy a quota.
- `getRejected(id)` returns a quarantined original rejected payload. At most ten
  rejected records are retained. JSON up to 512 KiB is preserved exactly; larger
  rejected inputs retain their hash/size/code only. Rejected versions never
  become an active manifest and their paths are never fetched.
- `assetReader(asset)` is the contract-compatible reader over durable storage.

Progress belongs to WalkSession and is deliberately outside this Module.
Deleting a pack never invokes a progress/collection deletion operation.
Callers must surface pending/partial states and request an explicit user choice
before removing material belonging to a session; a pin is the enforcement seam.

## Storage and source seams

The Storage Adapter exposes `readState`, transactional synchronous
`updateState(change)`, `exclusive(operation)`, `inspectBlob`, `createBlob`,
`readBlob`, `removeBlob` and `usage`. `createBlob(hash)` yields a writer with
`write(Uint8Array)`, `commit(expectedBytes)` and `abort()`. A commit verifies the
actual SHA-256 and byte count and publishes by atomic rename only after sync.
`abort` deletes only that writer's unpublished temporary file. `inspectBlob`
hashes actual file contents and reports `durable` or `cache` honestly.

`openFilesystemStorage(root)` is a **Node-only** concrete Adapter for tests and
task-owned local use. It refuses to adopt a nonempty directory without its exact
owner marker. Content filenames are lowercase SHA-256 hashes, never bundle IDs
or supplied source paths. Before IO/rename/deletion it rejects substituted
directories/junctions, symlink files and missing/changed ownership markers.
It does not recursively delete directories.

Metadata is one versioned state value in a task-owned SQLite database, updated
under `BEGIN IMMEDIATE` with `synchronous=FULL`. A transaction selects current,
previous and pins together. Writers use unpublished files, hash verification,
file sync and rename. On reopening, only correctly named temporary files whose
owning OS process is confirmed absent are reclaimed. Live or reused PIDs and
unknown files are not guessed stale. Published content and pins are untouched.

All stores sharing this root in one Node process share an exclusive operation
queue; SQLite also protects metadata transactions. **Use one writer process per
root.** Cross-process preparation/removal arbitration, a hostile concurrent
filesystem adversary and electrical power-loss durability are not accepted by
these tests. The killed-child test proves a process interruption, not a power
failure. A native Android Adapter requires its own implementation and evidence.

`source.open(asset, {signal, byteLimit, headers})` must yield
`{body: AsyncIterable<Uint8Array>}`. It receives the identifying User-Agent and
an explicit byte allowance. Each decoded chunk must be at most 65,536 bytes.
The core counts observed bytes before any write and checks declared asset size,
transfer allowance and storage reservations before persisting a chunk. It never
trusts Content-Length. Unknown errors become bounded public failure codes, not
raw messages or URLs.

Cancellation interrupts waiting for `open()` or the next streamed chunk and
discards the local unpublished writer. The Source Adapter must actually cancel
its underlying HTTP/native request when signalled; a JavaScript consumer cannot
forcibly close an arbitrary foreign provider implementation. No source fallback
or real network downloader is supplied by this package.

## Limits

| Limit | Default / hard rule |
| --- | --- |
| Source slots per preparation | 4; configurable 1–4 |
| Distinct content bytes in one pack | 250,000,000; configurable 1–1,000,000,000 |
| Observed transfer allowance | 250,000,000; configurable 1–1,000,000,000 |
| Stored object + temporary bytes | 500,000,000; configurable 1–1,000,000,000 |
| Map/style/glyph/sprite/attribution bytes | 50,000,000 maximum; may be lowered |
| Provider tiles | 3,000 maximum; may be lowered |
| Known pack manifests | 20; configurable 1–50 |
| Session pins | 100 |
| One accepted asset | Contract ceiling of 100,000,000 bytes |
| Quarantined originals | 10, at most 512 KiB raw JSON each |
| SQLite state JSON | At most 32 MiB |

`downloadedBytes` counts chunks admitted for local writing, including an asset
later discarded. `receivedBytes` counts chunks actually observed by this Module,
including a rejected excessive chunk; it can exceed the allowance by in-flight
delivery. No excessive chunk is written. A Source Adapter must respect chunk
size and cancellation to bound native/network buffering too. Storage reservation
includes concurrent writers; reuse requires intact durable content. Quota
failure does not remove the old package or free arbitrary files.

For a tile provider choose
`mapPolicy: {kind:'tile_provider', tileAssetIds:[...]}`. Every `map` asset must
represent **one individually enumerated tile**, with unique listed IDs. The
Module bounds that count and all map resource bytes before opening a source.
An archive containing an unknown number of provider tiles cannot use this
Interface as proof of tile-policy compliance. `self_contained` describes a
prepared permitted vector/map file; it does not grant provider download rights.
Licensing, provider User-Agent transmission, lawful offline rights and rendered
basemap completeness still require the actual Source/native Adapter evidence.

## Verification

From the repository root with Node 22.22.2:

```powershell
node --experimental-sqlite --test packages/offline-pack/test/pack.test.mjs
```

No dependency installation or real network request is needed. Tests load the
actual TypeScript contracts with the already installed mobile TypeScript/Zod
tooling. Synthetic CC0 audio/map bytes exercise hashes and lifecycle; they are
not real audio decoding or rendered offline maps.

The suite uses actual temporary filesystem objects, SQLite state, atomic renames,
close/reopen, a killed child process and a Windows directory junction. It also
labels the injected storage-open failure as simulated. The tests verify old
selection retention, checksum reuse, explicit pins/removal, stream and storage
limits, path/ownership refusal, quarantine, cancellation and fresh corruption
checks. Native Android integration, airplane-mode playback, real provider
requests, field routing and power-loss behavior are still separate gates.
