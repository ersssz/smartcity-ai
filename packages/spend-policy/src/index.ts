export interface ProviderTarget {
  readonly providerId: string;
  readonly endpoint: string;
  readonly model: string;
}

export interface ProviderRequest extends ProviderTarget {
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
}

export interface FiniteQuota {
  readonly observedAtMs: number;
  readonly expiresAtMs: number;
  readonly remainingRequests: number;
  readonly remainingInputTokens: number;
  readonly remainingOutputTokens: number;
}

export interface VerifiedNoChargeEvidence extends ProviderTarget {
  readonly verification: "verified";
  readonly proofId: string;
  readonly verificationSource: string;
  readonly verifiedAtMs: number;
  readonly expiresAtMs: number;
  readonly billingMode: "no-charge";
  readonly requiresPaymentDetails: false;
  readonly autoTopUpEnabled: false;
  readonly paidFallbackEnabled: false;
  readonly chargeOnQuotaExhaustion: false;
  readonly quota: FiniteQuota;
}

export type DenialReason =
  | "UNVERIFIED_PROVIDER" | "INVALID_TARGET" | "TARGET_MISMATCH"
  | "INVALID_PROOF" | "BILLING_NOT_NO_CHARGE" | "PAYMENT_RISK"
  | "STALE_PROOF" | "INVALID_QUOTA" | "STALE_QUOTA" | "QUOTA_EXHAUSTED"
  | "INVALID_CLOCK" | "INVALID_REQUEST_BUDGET" | "REQUEST_EXCEEDS_QUOTA";

export type ProviderUseDecision =
  | { readonly allowed: false; readonly reason: DenialReason }
  | {
      readonly allowed: true;
      readonly proofId: string;
      readonly validUntilMs: number;
      readonly target: ProviderTarget;
      readonly quota: FiniteQuota;
    };

export type RequestAuthorization =
  | { readonly authorized: false; readonly reason: DenialReason }
  | {
      readonly authorized: true;
      readonly proofId: string;
      readonly validUntilMs: number;
      readonly request: ProviderRequest;
      readonly automaticFallback: "none";
      readonly maxBillableCostUsd: 0;
    };

export const MAX_PROOF_AGE_MS = 86_400_000;
export const MAX_QUOTA_AGE_MS = 300_000;

export function evaluateProviderUse(
  evidence: unknown,
  target: ProviderTarget,
  nowMs: number,
): ProviderUseDecision {
  if (!isCount(nowMs)) {
    return { allowed: false, reason: "INVALID_CLOCK" };
  }
  if (!isSpecificTarget(target)) {
    return { allowed: false, reason: "INVALID_TARGET" };
  }
  if (!isRecord(evidence) || evidence.verification !== "verified") {
    return { allowed: false, reason: "UNVERIFIED_PROVIDER" };
  }
  if (!isSpecificName(evidence.proofId) || !isSpecificName(evidence.verificationSource)) {
    return { allowed: false, reason: "INVALID_PROOF" };
  }
  if (
    evidence.providerId !== target.providerId ||
    evidence.endpoint !== target.endpoint ||
    evidence.model !== target.model
  ) {
    return { allowed: false, reason: "TARGET_MISMATCH" };
  }
  if (evidence.billingMode !== "no-charge") {
    return { allowed: false, reason: "BILLING_NOT_NO_CHARGE" };
  }
  if (
    evidence.requiresPaymentDetails !== false ||
    evidence.autoTopUpEnabled !== false ||
    evidence.paidFallbackEnabled !== false ||
    evidence.chargeOnQuotaExhaustion !== false
  ) {
    return { allowed: false, reason: "PAYMENT_RISK" };
  }
  const proofWindow = freshWindow(evidence.verifiedAtMs, evidence.expiresAtMs, nowMs, MAX_PROOF_AGE_MS);
  if (!proofWindow) {
    return { allowed: false, reason: "STALE_PROOF" };
  }
  const quota = evidence.quota;
  if (
    !isRecord(quota) ||
    !isCount(quota.remainingRequests) ||
    !isCount(quota.remainingInputTokens) ||
    !isCount(quota.remainingOutputTokens)
  ) {
    return { allowed: false, reason: "INVALID_QUOTA" };
  }
  const quotaWindow = freshWindow(quota.observedAtMs, quota.expiresAtMs, nowMs, MAX_QUOTA_AGE_MS);
  if (!quotaWindow) {
    return { allowed: false, reason: "STALE_QUOTA" };
  }
  if (
    quota.remainingRequests === 0 ||
    quota.remainingInputTokens === 0 ||
    quota.remainingOutputTokens === 0
  ) {
    return { allowed: false, reason: "QUOTA_EXHAUSTED" };
  }
  return Object.freeze({
    allowed: true,
    proofId: evidence.proofId,
    validUntilMs: Math.min(
      proofWindow.expiresAtMs,
      proofWindow.observedAtMs + MAX_PROOF_AGE_MS,
      quotaWindow.expiresAtMs,
      quotaWindow.observedAtMs + MAX_QUOTA_AGE_MS,
    ),
    target: Object.freeze({ providerId: target.providerId, endpoint: target.endpoint, model: target.model }),
    quota: Object.freeze({ ...quotaWindow,
      remainingRequests: quota.remainingRequests,
      remainingInputTokens: quota.remainingInputTokens,
      remainingOutputTokens: quota.remainingOutputTokens,
    }),
  });
}

export function authorizeProviderRequest(
  evidence: unknown,
  request: ProviderRequest,
  nowMs: number,
): RequestAuthorization {
  const decision = evaluateProviderUse(evidence, request, nowMs);
  if (!decision.allowed) {
    return { authorized: false, reason: decision.reason };
  }
  if (!isCount(request.maxInputTokens) || !isCount(request.maxOutputTokens) ||
    request.maxInputTokens === 0 || request.maxOutputTokens === 0) {
    return { authorized: false, reason: "INVALID_REQUEST_BUDGET" };
  }
  if (request.maxInputTokens > decision.quota.remainingInputTokens ||
    request.maxOutputTokens > decision.quota.remainingOutputTokens) {
    return { authorized: false, reason: "REQUEST_EXCEEDS_QUOTA" };
  }
  return Object.freeze({
    authorized: true,
    proofId: decision.proofId,
    validUntilMs: decision.validUntilMs,
    request: Object.freeze({ ...decision.target,
      maxInputTokens: request.maxInputTokens,
      maxOutputTokens: request.maxOutputTokens,
    }),
    automaticFallback: "none",
    maxBillableCostUsd: 0,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSpecificTarget(target: unknown): target is ProviderTarget {
  if (!isRecord(target) || !isSpecificName(target.providerId) || !isSpecificName(target.model) ||
    !isSpecificName(target.endpoint)) {
    return false;
  }
  try {
    const endpoint = new URL(target.endpoint);
    return endpoint.protocol === "https:" && endpoint.username === "" && endpoint.password === "" &&
      endpoint.search === "" && endpoint.hash === "";
  } catch {
    return false;
  }
}

function isSpecificName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value && !value.includes("*");
}

function freshWindow(observedAt: unknown, expiresAt: unknown, nowMs: number, maxAgeMs: number): {
  observedAtMs: number; expiresAtMs: number;
} | undefined {
  if (isCount(observedAt) && isCount(expiresAt) &&
    observedAt <= nowMs && nowMs - observedAt < maxAgeMs && expiresAt > nowMs) {
    return { observedAtMs: observedAt, expiresAtMs: expiresAt };
  }
  return undefined;
}
