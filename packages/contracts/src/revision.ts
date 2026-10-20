import { canonicalJson, readBundle, type Sha256 } from './bundle.js';

export type RevisionCheck = { ok: false; code: 'INVALID_BUNDLE' | 'STALE_PARENT' | 'ORIGINAL_TERMS_CHANGED' | 'DEADLINE_CHANGED_WITHOUT_PROPOSAL' | 'INVALID_PROGRESS_CONTEXT' }
  | { ok: true; requiresConsent: boolean; reasons: ('stops_changed' | 'theme_changed' | 'constraints_changed' | 'deadline_extension' | 'substantial_extension')[] };

/**
 * Validates a proposal, never applies it. WalkSession must repeat this in its
 * parent-CAS transaction, journal explicit consent and preserve completed events.
 * completedStopIds is authoritative current-parent progress supplied by that
 * repository, not provider/user text and never an immutable-bundle field.
 */
export async function validateRevisionAgainstParent(parentJson: string, candidateJson: string, hash: Sha256, completedStopIds: readonly string[] = []): Promise<RevisionCheck> {
  const parentRead = await readBundle(parentJson, hash), candidateRead = await readBundle(candidateJson, hash);
  if (!parentRead.ok || !candidateRead.ok) return { ok: false, code: 'INVALID_BUNDLE' };
  const parent = parentRead.bundle, candidate = candidateRead.bundle;
  if (candidate.bundleId !== parent.bundleId || candidate.revision !== parent.revision + 1 || candidate.parentRevision !== parent.revision || candidate.parentHash !== parent.sha256) return { ok: false, code: 'STALE_PARENT' };
  if (canonicalJson(candidate.request) !== canonicalJson(parent.request) || canonicalJson(candidate.originalOrigin) !== canonicalJson(parent.originalOrigin)) return { ok: false, code: 'ORIGINAL_TERMS_CHANGED' };
  const oldTerms = parent.continuation.timeTerms, terms = candidate.continuation.timeTerms;
  // A smaller selected time window is a durable limit, including older bundles
  // whose declared deadline still contains slack. Only a new explicit proposal
  // may grow that effective window; the original request remains unchanged.
  const activeDeadline = Math.min(Date.parse(oldTerms.deadlineAt), Date.parse(parent.continuation.startAt) + parent.continuation.budgetMinutes * 60_000);
  if ((terms.kind === 'current_deadline' && Date.parse(terms.deadlineAt) > activeDeadline) || (terms.kind === 'extension_proposal' && Date.parse(terms.previousDeadlineAt) !== activeDeadline)) return { ok: false, code: 'DEADLINE_CHANGED_WITHOUT_PROPOSAL' };
  if (new Set(completedStopIds).size !== completedStopIds.length || completedStopIds.some(id => !parent.stops.some(s => s.id === id))) return { ok: false, code: 'INVALID_PROGRESS_CONTEXT' };
  const done = new Set(completedStopIds);
  if (candidate.stops.some(s => done.has(s.id))) return { ok: false, code: 'INVALID_PROGRESS_CONTEXT' };
  const reasons: Extract<RevisionCheck, { ok: true }>['reasons'] = [];
  const remaining = parent.stops.filter(s => !done.has(s.id)).map(s => ({ id: s.id, poiId: s.poiId, anchor: s.anchor }));
  const proposed = candidate.stops.map(s => ({ id: s.id, poiId: s.poiId, anchor: s.anchor }));
  if (canonicalJson(remaining) !== canonicalJson(proposed)) reasons.push('stops_changed');
  if (candidate.theme.id !== parent.theme.id || canonicalJson(candidate.theme.title) !== canonicalJson(parent.theme.title)) reasons.push('theme_changed');
  if (canonicalJson(candidate.continuation.constraints) !== canonicalJson(parent.continuation.constraints)) reasons.push('constraints_changed');
  if (terms.kind === 'extension_proposal') reasons.push('deadline_extension');
  const extensionMinutes = (Date.parse(candidate.timing.endsAt) - Date.parse(parent.timing.endsAt)) / 60_000;
  if (extensionMinutes > 5 || extensionMinutes > parent.request.budgetMinutes * 0.1) reasons.push('substantial_extension');
  // With no pending visit, last_stop means the already agreed last endpoint.
  if (!candidate.stops.length && candidate.request.endRule.kind === 'last_stop' && canonicalJson(candidate.resolvedEnd) !== canonicalJson(parent.resolvedEnd)) return { ok: false, code: 'ORIGINAL_TERMS_CHANGED' };
  return { ok: true, requiresConsent: reasons.length > 0, reasons };
}
