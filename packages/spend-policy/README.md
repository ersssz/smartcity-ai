# Spend policy diagnostic

This package performs local policy checks only. It makes no network requests, inspects no credentials, changes no billing settings, and installs no dependencies.

Public test seams agreed with the coordinator:

- `evaluateProviderUse(evidence, target, nowMs)` checks whether a specific endpoint/model has current, explicit no-charge evidence and a finite quota. It does not verify a provider account or reserve that quota.
- `authorizeProviderRequest(evidence, request, nowMs)` also checks bounded request token ceilings. It returns a diagnostic descriptor, never performs the request or automatically changes provider.

Both functions require a caller-supplied trusted epoch-millisecond clock. The request contains `providerId`, the exact HTTPS `endpoint`, the exact `model`, and positive safe-integer `maxInputTokens`/`maxOutputTokens`. No wildcard, query string, fragment or URL credentials are accepted in an endpoint. The returned request is a detached immutable copy, not a mutable reference to caller input.

Target, evidence and quota scalar values are copied into plain snapshots before validation. Request token ceilings are also read once before their validation; the descriptor uses those same captured values. Stateful accessors cannot swap an approved endpoint, proof identity or finite allowance during result construction. An exception while reading an input returns a denial without including the thrown error. This is shallow capture of the required fields, not deep serialization or a sandbox for caller-provided JavaScript.

`VerifiedNoChargeEvidence` describes the evidence record; incoming evidence is still checked at runtime. It requires a proof ID/source, a verified timestamp and expiry, exact provider/endpoint/model identity, `billingMode: "no-charge"`, and explicit `false` for payment-details requirements, automatic top-ups, paid fallback and charging on quota exhaustion. A quota observation must include its own timestamp/expiry and finite non-negative safe-integer remaining request/input-token/output-token counts. Exhausted allowances are denied.

Conservative initial freshness limits: proof age **less than 24 hours** and quota observation age **less than 5 minutes**, each also before its explicit expiry. Future observations and invalid clocks are denied. `validUntilMs` is the exclusive earliest expiry/freshness boundary; re-evaluate at dispatch, never reuse an expired descriptor.

User policy: purchases, paid APIs (including existing credits), mixed free/paid access, payment-card trials, automatic top-ups and automatic paid fallback are forbidden. Missing or unknown evidence is denied.

Tests run through these public functions with clearly fictional evidence and `.invalid` endpoints. Passing tests are not live-provider or billing verification.

## Limits

This is a diagnostic policy module, not a billing firewall. A `verification: "verified"` label cannot authenticate itself: the coordinator must supply evidence actually verified for the real account, endpoint and model. No real provider is verified or enabled by this package. Stored API keys, subscriptions and existing credits do not qualify.

Authorization does not reserve or decrement quota, synchronize concurrent callers, count an actual prompt or guarantee that a third-party quota remains available. Integration must atomically reserve its own remaining no-charge budget, enforce the token ceilings, use the authorized endpoint/model, reject redirects/retargeting and recheck policy immediately before execution. Repeated calls with the same observation do not constitute additional quota reservations. An adapter can ignore a diagnostic return value; integration and live no-charge checks remain separate gates.

No environment flag or existing balance can enable a paid request through this Interface. Paid fallback is never selected. These files contain neither an HTTP adapter nor a credential loader.

Run from this directory with Node 22.22.2 or newer:

```powershell
node --experimental-strip-types --test test/spend-policy.test.ts
```

Node type stripping runs the tests without a TypeScript build step; it does not perform TypeScript type checking.

Observed TDD record on the system Node **v22.22.2**: failing tests were run before the corresponding implementation for unknown evidence, the allowed fixture, billing/payment risks, missing/exhausted/stale quotas, stale proof, target binding, proof metadata and request authorization/budget. Each became green incrementally. The review fix separately reproduced red tests for a token getter returning Infinity after validation, endpoint retargeting, quota inflation and a changing proof identity, then made them green with scalar snapshots. Throwing accessors are also covered. Final public-behavior suite: **22 passed, 0 failed**. Strict source-only TypeScript checking passed using the repository's existing mobile TypeScript toolchain; no compiler dependency was added to this package. No live provider was contacted.
