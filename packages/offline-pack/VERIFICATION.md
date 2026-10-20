# Verification receipt — 2026-10-20

Environment: Windows, Node **22.22.2**; Node's built-in experimental SQLite.
No global dependency installation, native Android operation or provider request.
The final complete TAP output is [test-receipt.tap](test-receipt.tap).

Executed from the repository root:

```powershell
node --experimental-sqlite --test packages/offline-pack/test/pack.test.mjs
node ./apps/mobile/node_modules/typescript/bin/tsc --noEmit --strict --noUncheckedIndexedAccess --target es2022 --module nodenext --moduleResolution nodenext packages/offline-pack/src/index.d.mts packages/offline-pack/src/node-storage.d.mts
```

Final results: **14 tests passed, zero failed/cancelled/skipped**, exit 0;
7,689.9695 ms reported test duration. Declaration typecheck: exit 0.

TDD slices observed before each corresponding implementation:

| Capability | Observed red | Subsequent green |
| --- | --- | --- |
| Durable prepare/activate/restart | Missing Module import | 1 pass |
| Revision retry, current/previous and pins | `packs.pin is not a function` | 2 pass |
| Four concurrent source slots | Observed peak 1 instead of 4 | 3 pass |
| Actual streamed transfer accounting | Missing `receivedBytes` result | 4 pass |
| Preflight map/pack caps | Missing `policyErrors` result | 5 pass |
| Unsupported original quarantine | Missing `getRejected` | 6 pass |
| Cancel stalled source | Cancellation deadline failure | 7 pass |
| Corruption recheck and deletion scope | Stale status exposed; junction deletion not rejected | 9 pass |
| Abrupt writer process death | Reopened usage retained 3 unpublished bytes | 10 pass |
| Storage-open fault | Simulated ENOSPC rejected entire prepare | 11 pass |

Three final checks additionally cover the real storage quota before persistence,
bundled path/non-owned-directory refusal, and hard map/concurrency caps.

The junction test **ran**, rather than being skipped on this Windows host. Its
only target was another sentinel directory inside the test-owned temporary root.
The process-death test spawned and killed its own Node child and re-opened real
SQLite/files. It did not kill the Android app or any unrelated process.

The ENOSPC test is an explicitly simulated Storage Adapter failure over the real
previously prepared filesystem state. It is not a physical disk-full experiment.
The tests use owned synthetic CC0 map/audio bytes and the actual contract
validator; they do not establish rendering, decoding, field or licensing quality
of a production pack. See README for Source cancellation, single-writer process
and power-loss limitations.

`verification.json` records the frozen package file hashes and the exact shared
contract source hashes used by this final run. No shared contract file changed.
