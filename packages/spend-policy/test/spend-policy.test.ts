import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeProviderRequest, evaluateProviderUse } from "../src/index.ts";

const NOW = Date.UTC(2026, 9, 20, 12, 0);
const TARGET = {
  providerId: "fictional-provider",
  endpoint: "https://provider.invalid/v1/generate",
  model: "fictional-no-charge-model",
};

const QUOTA = {
  observedAtMs: NOW - 1_000,
  expiresAtMs: NOW + 60_000,
  remainingRequests: 5,
  remainingInputTokens: 1_000,
  remainingOutputTokens: 2_000,
};

function verifiedEvidence(overrides: Record<string, unknown> = {}): unknown {
  return {
    verification: "verified",
    proofId: "fictional-checked-record-1",
    verificationSource: "https://provider.invalid/no-charge-proof",
    ...TARGET,
    verifiedAtMs: NOW - 1_000,
    expiresAtMs: NOW + 3_600_000,
    billingMode: "no-charge",
    requiresPaymentDetails: false,
    autoTopUpEnabled: false,
    paidFallbackEnabled: false,
    chargeOnQuotaExhaustion: false,
    quota: { ...QUOTA },
    ...overrides,
  };
}

test("unknown provider evidence is denied before a request can be authorized", () => {
  assert.deepEqual(evaluateProviderUse(undefined, TARGET, NOW), {
    allowed: false,
    reason: "UNVERIFIED_PROVIDER",
  });
});

test("a specific verified no-charge endpoint and model can pass the diagnostic gate", () => {
  assert.equal(evaluateProviderUse(verifiedEvidence(), TARGET, NOW).allowed, true);
});

test("paid, mixed, credit-only and unknown billing are denied despite a verified label", () => {
  for (const billingMode of ["paid", "free-paid-mixed", "credit-only", "unknown", undefined]) {
    assert.deepEqual(
      evaluateProviderUse(verifiedEvidence({ billingMode }), TARGET, NOW),
      { allowed: false, reason: "BILLING_NOT_NO_CHARGE" },
      String(billingMode),
    );
  }
});

test("card requirements, top-ups, paid fallback or unconfirmed safety flags deny use", () => {
  for (const flag of [
    "requiresPaymentDetails", "autoTopUpEnabled", "paidFallbackEnabled", "chargeOnQuotaExhaustion",
  ]) {
    for (const value of [true, undefined]) {
      assert.deepEqual(
        evaluateProviderUse(verifiedEvidence({ [flag]: value }), TARGET, NOW),
        { allowed: false, reason: "PAYMENT_RISK" },
        `${flag}=${String(value)}`,
      );
    }
  }
});

test("missing, infinite, fractional and non-numeric quota cannot authorize use", () => {
  for (const quota of [
    undefined, {},
    { ...QUOTA, remainingRequests: Infinity },
    { ...QUOTA, remainingInputTokens: NaN },
    { ...QUOTA, remainingOutputTokens: 1.5 },
    { ...QUOTA, remainingRequests: "5" },
    { ...QUOTA, remainingRequests: -1 },
  ]) {
    assert.deepEqual(evaluateProviderUse(verifiedEvidence({ quota }), TARGET, NOW), {
      allowed: false, reason: "INVALID_QUOTA",
    });
  }
});

test("an exhausted request or token allowance denies use instead of permitting paid overflow", () => {
  for (const field of ["remainingRequests", "remainingInputTokens", "remainingOutputTokens"]) {
    assert.deepEqual(
      evaluateProviderUse(verifiedEvidence({ quota: { ...QUOTA, [field]: 0 } }), TARGET, NOW),
      { allowed: false, reason: "QUOTA_EXHAUSTED" },
      field,
    );
  }
});

test("expired, older-than-one-day or future-dated no-charge proof is denied", () => {
  for (const overrides of [
    { expiresAtMs: NOW },
    { verifiedAtMs: NOW - 86_400_001 },
    { verifiedAtMs: NOW + 1 },
    { expiresAtMs: Infinity },
  ]) {
    assert.deepEqual(evaluateProviderUse(verifiedEvidence(overrides), TARGET, NOW), {
      allowed: false, reason: "STALE_PROOF",
    });
  }
});

test("quota observations expire at their boundary or after five minutes, and future observations are denied", () => {
  for (const overrides of [
    { expiresAtMs: NOW },
    { observedAtMs: NOW - 300_001 },
    { observedAtMs: NOW + 1 },
    { observedAtMs: undefined },
  ]) {
    assert.deepEqual(
      evaluateProviderUse(verifiedEvidence({ quota: { ...QUOTA, ...overrides } }), TARGET, NOW),
      { allowed: false, reason: "STALE_QUOTA" },
    );
  }
});

test("verification for a different provider, endpoint or model cannot authorize this target", () => {
  for (const overrides of [
    { providerId: "another-provider" },
    { endpoint: "https://provider.invalid/v1/paid" },
    { model: "another-model" },
    { model: "*" },
  ]) {
    assert.deepEqual(evaluateProviderUse(verifiedEvidence(overrides), TARGET, NOW), {
      allowed: false, reason: "TARGET_MISMATCH",
    });
  }
});

test("wildcards, missing identities and credential-bearing or non-HTTPS endpoints are not specific targets", () => {
  for (const target of [
    { ...TARGET, providerId: "" },
    { ...TARGET, model: "*" },
    { ...TARGET, endpoint: "http://provider.invalid/v1/generate" },
    { ...TARGET, endpoint: "https://user:secret@provider.invalid/v1/generate" },
    { ...TARGET, endpoint: "https://provider.invalid/v1/generate?key=secret" },
    { ...TARGET, endpoint: "https://provider.invalid/v1/generate#fragment" },
  ]) {
    assert.deepEqual(evaluateProviderUse(verifiedEvidence(target), target, NOW), {
      allowed: false, reason: "INVALID_TARGET",
    });
  }
});

test("a verified label without an auditable proof identity and source is denied", () => {
  for (const overrides of [
    { proofId: undefined }, { proofId: "" },
    { verificationSource: undefined }, { verificationSource: "" },
  ]) {
    assert.deepEqual(evaluateProviderUse(verifiedEvidence(overrides), TARGET, NOW), {
      allowed: false, reason: "INVALID_PROOF",
    });
  }
});

test("request authorization binds a bounded request to its verified target and never enables fallback", () => {
  assert.deepEqual(
    authorizeProviderRequest(verifiedEvidence(), { ...TARGET, maxInputTokens: 100, maxOutputTokens: 200 }, NOW),
    {
      authorized: true,
      proofId: "fictional-checked-record-1",
      validUntilMs: NOW + 60_000,
      request: { ...TARGET, maxInputTokens: 100, maxOutputTokens: 200 },
      automaticFallback: "none",
      maxBillableCostUsd: 0,
    },
  );
});

test("a request with unbounded or invalid token ceilings is denied even with valid provider proof", () => {
  for (const limits of [
    { maxInputTokens: Infinity, maxOutputTokens: 1 },
    { maxInputTokens: 1, maxOutputTokens: NaN },
    { maxInputTokens: 0, maxOutputTokens: 1 },
    { maxInputTokens: 1, maxOutputTokens: -1 },
    { maxInputTokens: 1.5, maxOutputTokens: 1 },
  ]) {
    assert.deepEqual(authorizeProviderRequest(verifiedEvidence(), { ...TARGET, ...limits }, NOW), {
      authorized: false, reason: "INVALID_REQUEST_BUDGET",
    });
  }
});

test("a bounded request exceeding either observed token allowance is denied", () => {
  for (const limits of [
    { maxInputTokens: 1_001, maxOutputTokens: 1 },
    { maxInputTokens: 1, maxOutputTokens: 2_001 },
  ]) {
    assert.deepEqual(authorizeProviderRequest(verifiedEvidence(), { ...TARGET, ...limits }, NOW), {
      authorized: false, reason: "REQUEST_EXCEEDS_QUOTA",
    });
  }
});

test("request authorization preserves default-deny for unknown, paid and expired evidence", () => {
  const request = { ...TARGET, maxInputTokens: 100, maxOutputTokens: 200 };
  for (const [evidence, reason] of [
    [undefined, "UNVERIFIED_PROVIDER"],
    [verifiedEvidence({ billingMode: "paid" }), "BILLING_NOT_NO_CHARGE"],
    [verifiedEvidence({ billingMode: "credit-only" }), "BILLING_NOT_NO_CHARGE"],
    [verifiedEvidence({ expiresAtMs: NOW }), "STALE_PROOF"],
    [verifiedEvidence({ quota: undefined }), "INVALID_QUOTA"],
  ]) {
    assert.deepEqual(authorizeProviderRequest(evidence, request, NOW), { authorized: false, reason });
  }
});

test("freshness is exclusive at its hard boundary and an invalid clock cannot authorize use", () => {
  assert.deepEqual(
    evaluateProviderUse(verifiedEvidence({ verifiedAtMs: NOW - 86_400_000 }), TARGET, NOW),
    { allowed: false, reason: "STALE_PROOF" },
  );
  assert.deepEqual(
    evaluateProviderUse(verifiedEvidence({ quota: { ...QUOTA, observedAtMs: NOW - 300_000 } }), TARGET, NOW),
    { allowed: false, reason: "STALE_QUOTA" },
  );
  assert.deepEqual(evaluateProviderUse(verifiedEvidence(), TARGET, NaN), {
    allowed: false, reason: "INVALID_CLOCK",
  });
});

test("an authorization is a detached immutable diagnostic, not a mutable retargetable request", () => {
  const request = { ...TARGET, maxInputTokens: 100, maxOutputTokens: 200 };
  const authorization = authorizeProviderRequest(verifiedEvidence(), request, NOW);
  assert.equal(authorization.authorized, true);
  if (!authorization.authorized) {
    assert.fail("Expected the fictional verified fixture to pass");
  }
  request.model = "different-paid-model";
  request.maxOutputTokens = 10_000;
  assert.equal(authorization.request.model, "fictional-no-charge-model");
  assert.equal(authorization.request.maxOutputTokens, 200);
  assert.equal(Reflect.set(authorization.request, "endpoint", "https://other.invalid/paid"), false);
  assert.equal(Reflect.set(authorization, "automaticFallback", "paid"), false);
});

test("an accessor cannot replace a validated output-token ceiling with Infinity in the authorization", () => {
  let reads = 0;
  const request = {
    ...TARGET,
    maxInputTokens: 100,
    get maxOutputTokens() {
      reads += 1;
      return reads <= 3 ? 100 : Infinity;
    },
  };
  const authorization = authorizeProviderRequest(verifiedEvidence(), request, NOW);
  assert.equal(authorization.authorized, true);
  if (!authorization.authorized) {
    assert.fail("Expected the finite snapshot to be authorized");
  }
  assert.equal(authorization.request.maxOutputTokens, 100);
});

test("a stateful endpoint accessor cannot retarget the validated diagnostic or authorized request", () => {
  function retargetingRequest() {
    let reads = 0;
    return {
      providerId: TARGET.providerId,
      model: TARGET.model,
      get endpoint() {
        reads += 1;
        return reads <= 3 ? TARGET.endpoint : "https://provider.invalid/v1/paid";
      },
      maxInputTokens: 100,
      maxOutputTokens: 100,
    };
  }
  const decision = evaluateProviderUse(verifiedEvidence(), retargetingRequest(), NOW);
  assert.equal(decision.allowed, true);
  if (!decision.allowed) {
    assert.fail("Expected the concrete initial target to pass");
  }
  assert.equal(decision.target.endpoint, "https://provider.invalid/v1/generate");

  const authorization = authorizeProviderRequest(verifiedEvidence(), retargetingRequest(), NOW);
  assert.equal(authorization.authorized, true);
  if (!authorization.authorized) {
    assert.fail("Expected the concrete initial request target to pass");
  }
  assert.equal(authorization.request.endpoint, "https://provider.invalid/v1/generate");
});

test("a changing quota accessor cannot inflate the allowance after validation", () => {
  function changingQuota() {
    let reads = 0;
    return {
      ...QUOTA,
      get remainingOutputTokens() {
        reads += 1;
        return reads <= 2 ? 50 : Infinity;
      },
    };
  }
  assert.deepEqual(
    authorizeProviderRequest(
      verifiedEvidence({ quota: changingQuota() }),
      { ...TARGET, maxInputTokens: 100, maxOutputTokens: 100 },
      NOW,
    ),
    { authorized: false, reason: "REQUEST_EXCEEDS_QUOTA" },
  );

  const decision = evaluateProviderUse(verifiedEvidence({ quota: changingQuota() }), TARGET, NOW);
  assert.equal(decision.allowed, true);
  if (!decision.allowed) {
    assert.fail("Expected the finite initial quota to pass the diagnostic");
  }
  assert.equal(decision.quota.remainingOutputTokens, 50);
});

test("a proof accessor cannot replace the validated evidence identity in the result", () => {
  let reads = 0;
  const evidence = Object.defineProperty(verifiedEvidence(), "proofId", {
    get() {
      reads += 1;
      return reads === 1 ? "fictional-checked-record-1" : "";
    },
  });
  const decision = evaluateProviderUse(evidence, TARGET, NOW);
  assert.equal(decision.allowed, true);
  if (!decision.allowed) {
    assert.fail("Expected the initial auditable proof identity to pass");
  }
  assert.equal(decision.proofId, "fictional-checked-record-1");
});

test("throwing accessors fail closed without leaking their errors", () => {
  const throwingTarget = {
    ...TARGET,
    get endpoint(): string { throw new Error("untrusted target accessor"); },
  };
  assert.deepEqual(evaluateProviderUse(verifiedEvidence(), throwingTarget, NOW), {
    allowed: false, reason: "INVALID_TARGET",
  });

  const throwingProof = Object.defineProperty(verifiedEvidence(), "proofId", {
    get() { throw new Error("untrusted proof accessor"); },
  });
  assert.deepEqual(evaluateProviderUse(throwingProof, TARGET, NOW), {
    allowed: false, reason: "INVALID_PROOF",
  });

  const throwingQuota = {
    ...QUOTA,
    get remainingRequests(): number { throw new Error("untrusted quota accessor"); },
  };
  assert.deepEqual(evaluateProviderUse(verifiedEvidence({ quota: throwingQuota }), TARGET, NOW), {
    allowed: false, reason: "INVALID_QUOTA",
  });

  const throwingRequest = {
    ...TARGET,
    maxInputTokens: 100,
    get maxOutputTokens(): number { throw new Error("untrusted ceiling accessor"); },
  };
  assert.deepEqual(authorizeProviderRequest(verifiedEvidence(), throwingRequest, NOW), {
    authorized: false, reason: "INVALID_REQUEST_BUDGET",
  });
});
