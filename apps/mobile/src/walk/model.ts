import { z } from 'zod';

/** Prepared public walking content, not the not-yet-accepted server WalkBundle contract. */
export const LocaleSchema = z.enum(['ru', 'kk', 'en']);
export type Locale = z.infer<typeof LocaleSchema>;
export const TextSchema = z.object({ ru: z.string().min(1), kk: z.string().min(1), en: z.string().min(1) });
export type LocalizedText = z.infer<typeof TextSchema>;
export const CoordinateSchema = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
export type Coordinate = z.infer<typeof CoordinateSchema>;
const Id = z.string().min(1).max(100);
const SourceSchema = z.object({ id: Id, title: z.string().min(1), url: z.string().url().startsWith('https://'), checkedAt: z.union([z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]), owner: z.string(), rights: z.string().min(1) });
const FactSchema = z.object({ id: Id, statement: TextSchema, sourceIds: z.array(Id).min(1) });
const QuestSchema = z.object({ id: Id, question: TextSchema, choices: z.array(z.object({ id: Id, label: TextSchema })).min(2).max(4), correctChoiceId: Id, hint: TextSchema, explanation: TextSchema, factRefs: z.array(Id).min(1) });
const StopSchema = z.object({
  id: Id, candidateKey: Id, poiId: Id, title: TextSchema, subtitle: TextSchema,
  coordinate: CoordinateSchema, osmNodeId: z.string().regex(/^\d+$/), visitMinutes: z.number().int().min(1),
  storyTitle: TextSchema, story: TextSchema, observation: TextSchema,
  framing: z.literal('original_editorial_facts_and_clearly_marked_imagination'),
  factRefs: z.array(Id).min(1), sourceIds: z.array(Id).min(1), quest: QuestSchema,
});
const LegSchema = z.object({
  id: Id, fromStopId: Id, toStopId: Id, coordinates: z.array(CoordinateSchema).min(2),
  osmNodeIds: z.array(z.string().regex(/^\d+$/)).min(2), sourceWayIds: z.array(z.string()).min(1),
  distanceMeters: z.number().finite().positive(), walkMinutes: z.number().finite().positive(),
});
export const EditorialWalkSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal('prepared_editorial_walk'), id: Id, revision: z.number().int().positive(),
  title: TextSchema, subtitle: TextSchema, description: TextSchema, collectionTitle: TextSchema,
  closing: TextSchema.optional(), collectionDescription: TextSchema.optional(),
  startAnchor: z.object({ id: Id, label: TextSchema, coordinate: CoordinateSchema, osmNodeId: z.string().regex(/^\d+$/) }),
  endRule: z.literal('return_to_start'), stops: z.array(StopSchema).min(3).max(6), legs: z.array(LegSchema).min(3).max(6),
  timing: z.object({ budgetMinutes: z.number().int().min(15).max(240), walkMinutes: z.number().finite().positive(), visitMinutes: z.number().int().positive(), reserveMinutes: z.number().int().positive(), totalMinutes: z.number().finite().positive(), distanceMeters: z.number().finite().positive(), assumedMetersPerMinute: z.number().positive() }),
  sources: z.array(SourceSchema).min(1), facts: z.array(FactSchema).min(1),
  routeSource: z.object({ url: z.string().url(), snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/), graphSha256: z.string().regex(/^[a-f0-9]{64}$/), preparedAt: z.string().datetime(), license: z.literal('ODbL-1.0'), attribution: z.string().min(1), fieldVerified: z.literal(false) }),
  availability: z.object({ textAndRouteBundled: z.literal(true), baseMap: z.literal('online'), preparedAudio: z.literal('unavailable'), humanTranslationReview: z.literal('pending') }),
}).superRefine((walk, context) => {
  const fail = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  const unique = (ids: string[], label: string) => { if (new Set(ids).size !== ids.length) fail(`Duplicate ${label}`); };
  unique(walk.stops.map(s => s.id), 'stop'); unique(walk.sources.map(s => s.id), 'source'); unique(walk.facts.map(f => f.id), 'fact');
  const sourceIds = new Set(walk.sources.map(s => s.id)); const factIds = new Set(walk.facts.map(f => f.id));
  const same = (a: Coordinate, b: Coordinate) => a[0] === b[0] && a[1] === b[1];
  if (!same(walk.startAnchor.coordinate, walk.stops[0]!.coordinate) || walk.startAnchor.osmNodeId !== walk.stops[0]!.osmNodeId) fail('The explicitly chosen public start must be the first stop anchor');
  if (walk.legs.length !== walk.stops.length) fail('Every stop requires its next foot leg, including return to start');
  walk.facts.forEach(f => f.sourceIds.forEach(id => { if (!sourceIds.has(id)) fail(`Unknown source ${id}`); }));
  walk.stops.forEach((stop, index) => {
    unique(stop.quest.choices.map(c => c.id), 'choice');
    if (!stop.quest.choices.some(c => c.id === stop.quest.correctChoiceId)) fail(`Missing answer at ${stop.id}`);
    [...stop.factRefs, ...stop.quest.factRefs].forEach(id => { if (!factIds.has(id)) fail(`Unknown fact ${id}`); });
    stop.sourceIds.forEach(id => { if (!sourceIds.has(id)) fail(`Unknown source ${id}`); });
    const leg = walk.legs[index]; const next = walk.stops[(index + 1) % walk.stops.length]!;
    if (!leg) return;
    if (leg.fromStopId !== stop.id || leg.toStopId !== next.id) fail('Foot legs must preserve the stop order and return');
    if (!same(leg.coordinates[0]!, stop.coordinate) || !same(leg.coordinates[leg.coordinates.length - 1]!, next.coordinate)) fail('Leg endpoints must exactly match public anchors; no hidden connector');
    if (leg.osmNodeIds.length !== leg.coordinates.length || leg.osmNodeIds[0] !== stop.osmNodeId || leg.osmNodeIds[leg.osmNodeIds.length - 1] !== next.osmNodeId) fail('Foot node proof must match every geometry point');
  });
  const close = (a: number, b: number) => Math.abs(a - b) <= 0.05;
  const t = walk.timing;
  if (!close(t.walkMinutes, walk.legs.reduce((n, l) => n + l.walkMinutes, 0)) || !close(t.distanceMeters, walk.legs.reduce((n, l) => n + l.distanceMeters, 0))) fail('Route totals differ from actual legs');
  if (t.visitMinutes !== walk.stops.reduce((n, s) => n + s.visitMinutes, 0) || !close(t.totalMinutes, t.walkMinutes + t.visitMinutes + t.reserveMinutes) || t.totalMinutes > t.budgetMinutes) fail('Walk does not fit the declared total budget');
  if (t.reserveMinutes < Math.max(5, Math.ceil(t.budgetMinutes * 0.1))) fail('Insufficient time reserve');
});
export type EditorialWalk = z.infer<typeof EditorialWalkSchema>;
export type WalkStop = EditorialWalk['stops'][number];

/** Durable progress stores no live coordinate, track or synthetic GPS proof. */
export const SessionSchema = z.object({
  schemaVersion: z.literal(1), sessionId: Id, walkId: Id, walkRevision: z.number().int().positive(),
  phase: z.enum(['ready', 'active', 'paused', 'completed']), currentStopIndex: z.number().int().nonnegative(),
  manualStopIds: z.array(Id), completedStopIds: z.array(Id), skippedStopIds: z.array(Id),
  answers: z.record(z.object({ choiceId: Id, correct: z.boolean() })),
  startedAt: z.string().datetime().nullable(), updatedAt: z.string().datetime(),
});
export type WalkSession = z.infer<typeof SessionSchema>;
export type WalkAction = { type: 'start' } | { type: 'pause' } | { type: 'resume' } | { type: 'mark_stop'; stopId: string } | { type: 'answer'; stopId: string; choiceId: string } | { type: 'continue'; stopId: string } | { type: 'skip'; stopId: string } | { type: 'confirm_return' };
