import { SessionSchema, type EditorialWalk, type WalkAction, type WalkSession } from './model';

export type WalkErrorCode = 'INVALID_STATE' | 'NOT_CURRENT_STOP' | 'VISIT_REQUIRED' | 'QUEST_REQUIRED' | 'UNKNOWN_CHOICE' | 'INVALID_SESSION';
export class WalkError extends Error {
  constructor(readonly code: WalkErrorCode) {
    super(code);
    this.name = 'WalkError';
  }
}

/** Restore accepts only this walk revision and a coordinate-free progress snapshot. */
export function validateSession(walk: EditorialWalk, input: unknown): WalkSession {
  const parsed = SessionSchema.strict().safeParse(input);
  if (!parsed.success) throw new WalkError('INVALID_SESSION');
  const session = parsed.data;
  if (session.walkId !== walk.id || session.walkRevision !== walk.revision) throw new WalkError('INVALID_SESSION');
  const stopCount = walk.stops.length;
  if (session.currentStopIndex > stopCount
    || (session.phase === 'completed' && session.currentStopIndex !== stopCount)) throw new WalkError('INVALID_SESSION');
  if (session.phase === 'ready') {
    if (session.currentStopIndex !== 0 || session.startedAt !== null || session.manualStopIds.length
      || session.completedStopIds.length || session.skippedStopIds.length || Object.keys(session.answers).length) throw new WalkError('INVALID_SESSION');
  } else if (session.startedAt === null) {
    throw new WalkError('INVALID_SESSION');
  }
  for (const ids of [session.manualStopIds, session.completedStopIds, session.skippedStopIds]) {
    if (new Set(ids).size !== ids.length) throw new WalkError('INVALID_SESSION');
  }
  const indices = new Map(walk.stops.map((stop, index) => [stop.id, index]));
  const completed = new Set(session.completedStopIds);
  const skipped = new Set(session.skippedStopIds);
  const manual = new Set(session.manualStopIds);
  for (const ids of [session.manualStopIds, session.completedStopIds, session.skippedStopIds]) {
    for (const id of ids) {
      const index = indices.get(id);
      if (index === undefined || index > session.currentStopIndex) throw new WalkError('INVALID_SESSION');
    }
  }
  for (const id of completed) {
    if (skipped.has(id) || !manual.has(id) || session.answers[id]?.correct !== true) throw new WalkError('INVALID_SESSION');
  }
  for (const id of skipped) {
    if (indices.get(id)! >= session.currentStopIndex) throw new WalkError('INVALID_SESSION');
  }
  for (const [id, answer] of Object.entries(session.answers)) {
    const index = indices.get(id);
    if (index === undefined || index > session.currentStopIndex || !manual.has(id)) throw new WalkError('INVALID_SESSION');
    const quest = walk.stops[index]!.quest;
    if (!quest.choices.some(choice => choice.id === answer.choiceId)
      || answer.correct !== (answer.choiceId === quest.correctChoiceId)
      || answer.correct !== completed.has(id)) throw new WalkError('INVALID_SESSION');
  }
  for (let index = 0; index < session.currentStopIndex; index++) {
    const stop = walk.stops[index];
    if (!stop || (!completed.has(stop.id) && !skipped.has(stop.id))) throw new WalkError('INVALID_SESSION');
  }
  return session;
}

/** Progression is pure: callers persist the returned snapshot and own tracking separately. */
export function createSession(walk: EditorialWalk, sessionId: string, now: string): WalkSession {
  return validateSession(walk, {
    schemaVersion: 1, sessionId, walkId: walk.id, walkRevision: walk.revision,
    phase: 'ready', currentStopIndex: 0, manualStopIds: [], completedStopIds: [], skippedStopIds: [],
    answers: {}, startedAt: null, updatedAt: now,
  });
}

export function transition(walk: EditorialWalk, session: WalkSession, action: WalkAction, now: string): WalkSession {
  session = validateSession(walk, session);
  // Device wall time can move backwards. Phase and stop order govern progression;
  // these ISO instants describe observations and are not a monotonic event clock.
  if (!SessionSchema.shape.updatedAt.safeParse(now).success) throw new WalkError('INVALID_STATE');
  if (action.type === 'start' && session.phase === 'ready') {
    return { ...session, phase: 'active', startedAt: now, updatedAt: now };
  }
  if (action.type === 'pause' && (session.phase === 'active' || session.phase === 'paused')) {
    return session.phase === 'paused' ? session : { ...session, phase: 'paused', updatedAt: now };
  }
  if (action.type === 'resume' && session.phase === 'paused') {
    return { ...session, phase: 'active', updatedAt: now };
  }
  if (action.type === 'confirm_return') {
    if (session.phase !== 'active' || session.currentStopIndex !== walk.stops.length) throw new WalkError('INVALID_STATE');
    return { ...session, phase: 'completed', updatedAt: now };
  }
  if (session.phase !== 'active' || !('stopId' in action)) throw new WalkError('INVALID_STATE');
  const stop = walk.stops[session.currentStopIndex];
  if (!stop || stop.id !== action.stopId) throw new WalkError('NOT_CURRENT_STOP');
  if (action.type === 'mark_stop') {
    return session.manualStopIds.includes(stop.id) ? session : {
      ...session, manualStopIds: [...session.manualStopIds, stop.id], updatedAt: now,
    };
  }
  if (action.type === 'answer') {
    if (!session.manualStopIds.includes(stop.id)) throw new WalkError('VISIT_REQUIRED');
    if (!stop.quest.choices.some(choice => choice.id === action.choiceId)) throw new WalkError('UNKNOWN_CHOICE');
    if (session.completedStopIds.includes(stop.id)) {
      if (session.answers[stop.id]?.choiceId !== action.choiceId) throw new WalkError('INVALID_STATE');
      return session;
    }
    const correct = action.choiceId === stop.quest.correctChoiceId;
    return {
      ...session, answers: { ...session.answers, [stop.id]: { choiceId: action.choiceId, correct } },
      completedStopIds: correct && !session.completedStopIds.includes(stop.id)
        ? [...session.completedStopIds, stop.id] : session.completedStopIds,
      updatedAt: now,
    };
  }
  if (action.type === 'continue' || action.type === 'skip') {
    if (action.type === 'continue' && !session.completedStopIds.includes(stop.id)) throw new WalkError('QUEST_REQUIRED');
    if (action.type === 'skip' && session.completedStopIds.includes(stop.id)) throw new WalkError('INVALID_STATE');
    const currentStopIndex = session.currentStopIndex + 1;
    return {
      ...session, currentStopIndex,
      skippedStopIds: action.type === 'skip' ? [...session.skippedStopIds, stop.id] : session.skippedStopIds,
      phase: 'active', updatedAt: now,
    };
  }
  throw new WalkError('INVALID_STATE');
}

/** These discoveries describe manual story completion, never GPS-confirmed presence. */
export function getDiscovery(walk: EditorialWalk, session: WalkSession) {
  session = validateSession(walk, session);
  return {
    earned: session.phase === 'completed' && session.completedStopIds.length === walk.stops.length,
    completed: session.completedStopIds.length, skipped: session.skippedStopIds.length,
    proof: 'manual' as const,
  };
}
