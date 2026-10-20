import { z } from 'zod';

export const IdSchema = z.string().min(1).max(100);
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const InstantSchema = z.string().datetime();
/** A date-only source check has day precision. Never interpret it as a midnight observation. */
export const SourceCheckSchema = z.union([InstantSchema, z.string().date()]);
export const LocaleSchema = z.enum(['ru', 'kk', 'en']);
export const TextSchema = z.object({ ru: z.string().trim().min(1), kk: z.string().trim().min(1), en: z.string().trim().min(1) }).strict();
export const CoordinateSchema = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
const Positive = z.number().finite().positive();
const Nonnegative = z.number().finite().nonnegative();
const SourceIds = z.array(IdSchema);
const Line = z.object({ type: z.literal('LineString'), coordinates: z.array(CoordinateSchema).min(2) }).strict();
export const SourceSchema = z.object({ id: IdSchema, title: z.string().min(1), url: z.string().url().startsWith('https://'), checkedAt: SourceCheckSchema, rights: z.string().min(1) }).strict();
export const FactSchema = z.object({ id: IdSchema, statement: TextSchema, sourceIds: SourceIds.min(1), checkedAt: SourceCheckSchema, validUntil: InstantSchema.optional() }).strict();
export function EvidenceFieldSchema<T extends z.ZodTypeAny>(value: T) {
  return z.discriminatedUnion('state', [
    z.object({ state: z.literal('known'), value, sourceIds: SourceIds.min(1), observedAt: InstantSchema, validUntil: InstantSchema }).strict(),
    z.object({ state: z.enum(['unknown', 'stale', 'conflicting']), reason: z.string().min(1), sourceIds: SourceIds }).strict(),
  ]);
}
export const EndpointSchema = z.union([
  z.object({ kind: z.literal('public_anchor'), anchorId: IdSchema, explicitlyChosen: z.literal(true) }).strict(),
  z.object({ kind: z.literal('point'), coordinate: CoordinateSchema, source: z.literal('manual') }).strict(),
  z.object({ kind: z.literal('point'), coordinate: CoordinateSchema, source: z.literal('gps'), accuracyM: Positive, capturedAt: InstantSchema }).strict(),
]);
export const EndRuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('return_to_start') }).strict(),
  z.object({ kind: z.literal('last_stop') }).strict(),
  z.object({ kind: z.literal('point'), endpoint: EndpointSchema }).strict(),
]);
export const ConstraintSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('indoor_required') }).strict(),
  z.object({ kind: z.literal('coffee_required') }).strict(),
  z.object({ kind: z.literal('step_free_required') }).strict(),
  z.object({ kind: z.literal('max_distance_m'), value: Positive }).strict(),
]);
export const PlanRequestSchema = z.object({
  requestId: IdSchema, locale: LocaleSchema, origin: EndpointSchema, startAt: InstantSchema,
  budgetMinutes: z.number().int().min(15).max(240), endRule: EndRuleSchema,
  interests: z.array(z.enum(['architecture', 'history', 'art', 'parks', 'coffee', 'unusual'])).max(6),
  constraints: z.array(ConstraintSchema).max(4), contextFlags: z.array(z.enum(['cold', 'wind', 'rain', 'tired'])).max(4),
}).strict();
export const PublicAnchorSchema = z.object({ id: IdSchema, coordinate: CoordinateSchema, graphNodeId: IdSchema, sourceIds: SourceIds.min(1), checkedAt: SourceCheckSchema, fieldVerified: z.boolean() }).strict();
export const ResolvedEndpointSchema = z.object({
  requested: EndpointSchema, coordinate: CoordinateSchema,
  graphPoint: z.object({ id: IdSchema, coordinate: CoordinateSchema }).strict(), snapDistanceM: Nonnegative,
  connector: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('exact') }).strict(),
    z.object({ kind: z.literal('verified'), geometry: Line, distanceMeters: Positive, walkMinutes: Positive, sourceIds: SourceIds.min(1), checkedAt: InstantSchema, stepFree: EvidenceFieldSchema(z.boolean()) }).strict(),
  ]),
}).strict();
const LegEndpoints = { id: IdSchema, fromId: IdSchema, toId: IdSchema, from: ResolvedEndpointSchema, to: ResolvedEndpointSchema };
export const LegSchema = z.discriminatedUnion('kind', [
  z.object({ ...LegEndpoints, kind: z.literal('already_at_endpoint'), distanceMeters: z.literal(0), walkMinutes: z.literal(0) }).strict(),
  z.object({ ...LegEndpoints, kind: z.literal('walk'), distanceMeters: Positive, walkMinutes: Positive, geometry: Line,
    source: z.object({ sourceIds: SourceIds.min(1), datasetRevision: IdSchema, graphSha256: Sha256Schema, checkedAt: InstantSchema, license: z.string().min(1), attribution: z.string().min(1), fieldVerified: z.boolean() }).strict(),
    stepFree: EvidenceFieldSchema(z.boolean()),
  }).strict(),
]);
export const AccessSchema = z.object({ public: z.boolean(), stepFree: z.enum(['verified', 'unknown']), indoor: z.boolean() }).strict();
export const OpeningSchema = z.object({ timeZone: z.literal('Asia/Almaty'), openIntervals: z.array(z.object({ from: InstantSchema, until: InstantSchema }).strict()).min(1) }).strict();
export const PlannedStopSchema = z.object({
  id: IdSchema.refine(id => id !== 'origin' && id !== 'end', 'Reserved endpoint id'), poiId: IdSchema, title: TextSchema, anchor: PublicAnchorSchema,
  arrivalAt: InstantSchema, departureAt: InstantSchema, visitMinutes: Positive,
  intent: z.enum(['outdoor_observation', 'indoor_visit']), access: EvidenceFieldSchema(AccessSchema), opening: EvidenceFieldSchema(OpeningSchema),
  services: z.object({ coffee: EvidenceFieldSchema(z.boolean()) }).strict(),
  factRefs: SourceIds.min(1), chapterId: IdSchema, questId: IdSchema, collectionId: IdSchema,
}).strict();
export const AudioRefSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('available'), assetId: IdSchema, textSha256: Sha256Schema, durationSeconds: Positive }).strict(),
  z.object({ state: z.literal('missing'), reason: z.string().min(1) }).strict(),
]);
export const AudioSetSchema = z.object({ ru: AudioRefSchema, kk: AudioRefSchema, en: AudioRefSchema }).strict();
export const SpokenCueSchema = z.object({ text: TextSchema, audio: AudioSetSchema }).strict();
export const ChapterSchema = z.object({ id: IdSchema, stopId: IdSchema, title: TextSchema, blocks: z.array(z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fact'), text: TextSchema, factRefs: SourceIds.min(1) }).strict(),
  z.object({ kind: z.enum(['idea', 'fiction']), text: TextSchema }).strict(),
])).min(1), audio: AudioSetSchema }).strict();
export const QuestSchema = z.object({ id: IdSchema, stopId: IdSchema, question: TextSchema,
  choices: z.array(z.object({ id: IdSchema, label: TextSchema }).strict()).min(2).max(4), correctChoiceId: IdSchema,
  hint: TextSchema, explanation: TextSchema, factRefs: SourceIds.min(1), proof: z.literal('answer'),
  audio: z.object({ question: AudioSetSchema, hint: AudioSetSchema, explanation: AudioSetSchema }).strict(),
}).strict();
export const CollectionSchema = z.object({ id: IdSchema, title: TextSchema, description: TextSchema, proof: z.enum(['manual', 'nearby', 'quest']) }).strict();
const SafePath = z.string().min(1).max(240).regex(/^[a-zA-Z0-9_./-]+$/).refine(v => !v.startsWith('/') && !v.split('/').some(p => p === '..' || p === ''), 'Relative asset path required');
export const AssetSchema = z.object({ id: IdSchema, role: z.enum(['audio', 'map', 'style', 'glyphs', 'sprite', 'attribution', 'text']),
  locale: LocaleSchema.optional(), sha256: Sha256Schema, bytes: z.number().int().positive().max(100_000_000), required: z.boolean(),
  license: z.string().min(1), attribution: z.string().min(1),
  location: z.discriminatedUnion('kind', [z.object({ kind: z.literal('bundled'), path: SafePath }).strict(), z.object({ kind: z.literal('https'), url: z.string().url().startsWith('https://') }).strict()]),
}).strict();
export const AssetManifestSchema = z.object({ version: z.literal(1), items: z.array(AssetSchema).max(1000), map: z.discriminatedUnion('state', [
  z.object({ state: z.literal('missing'), reason: z.string().min(1) }).strict(),
  z.object({ state: z.literal('available'), bounds: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]), minZoom: z.number().int().min(0).max(22), maxZoom: z.number().int().min(0).max(22), assetIds: SourceIds.min(1), attribution: z.string().min(1) }).strict(),
]) }).strict();
const Weather = z.object({ model: z.string().min(1), updatedAt: InstantSchema, retrievedAt: InstantSchema, temperatureC: z.number().finite(), windMetersPerSecond: Nonnegative }).strict();
const Calendar = z.object({ timeZone: z.literal('Asia/Almaty'), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), exceptions: z.array(z.object({ poiId: IdSchema, from: InstantSchema, until: InstantSchema, open: z.boolean(), sourceIds: SourceIds.min(1) }).strict()) }).strict();
export const ContextSchema = z.object({ evaluatedAt: InstantSchema, season: z.enum(['winter', 'spring', 'summer', 'autumn']), weather: EvidenceFieldSchema(Weather), calendar: EvidenceFieldSchema(Calendar) }).strict();
export const WalkBundleObjectSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal('walk_bundle'), bundleId: IdSchema, revision: z.number().int().positive(),
  parentRevision: z.number().int().positive().optional(), parentHash: Sha256Schema.optional(),
  generatedAt: InstantSchema, contentRevision: IdSchema, evidenceRevision: IdSchema, plannerVersion: IdSchema,
  evidenceMode: z.enum(['test_fixture', 'real_catalog_replay', 'live_catalog']), timeZone: z.literal('Asia/Almaty'),
  request: PlanRequestSchema, originalOrigin: ResolvedEndpointSchema,
  continuation: z.object({ origin: ResolvedEndpointSchema, startAt: InstantSchema, budgetMinutes: z.number().finite().min(0).max(240), constraints: z.array(ConstraintSchema).max(4), timeTerms: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('current_deadline'), deadlineAt: InstantSchema }).strict(),
    z.object({ kind: z.literal('extension_proposal'), previousDeadlineAt: InstantSchema, deadlineAt: InstantSchema, requestId: IdSchema }).strict(),
  ]) }).strict(),
  resolvedEnd: z.object({ endpoint: ResolvedEndpointSchema, stopId: IdSchema.optional() }).strict(),
  theme: z.object({ id: IdSchema, title: TextSchema, explanation: z.object({ text: TextSchema, factRefs: SourceIds.min(1) }).strict() }).strict(),
  stops: z.array(PlannedStopSchema).max(6), legs: z.array(LegSchema).min(1).max(7),
  timing: z.object({ walkMinutes: Nonnegative, visitMinutes: Nonnegative, reserveMinutes: Positive, totalMinutes: Positive, distanceMeters: Nonnegative, endsAt: InstantSchema }).strict(),
  sources: z.array(SourceSchema).min(1), facts: z.array(FactSchema).min(1),
  content: z.object({ origin: z.enum(['editorial', 'grounded_generation']), translationReview: z.enum(['pending', 'human_reviewed']), chapters: z.array(ChapterSchema), quests: z.array(QuestSchema), collections: z.array(CollectionSchema),
    cues: z.object({ start: SpokenCueSchema, nearby: SpokenCueSchema, pause: SpokenCueSchema, resume: SpokenCueSchema, complete: SpokenCueSchema, abandon: SpokenCueSchema }).strict(),
  }).strict(),
  assets: AssetManifestSchema, context: ContextSchema, limitations: z.array(TextSchema).max(30),
}).strict();
export type Locale = z.infer<typeof LocaleSchema>;
export type LocalizedText = z.infer<typeof TextSchema>;
export type Coordinate = z.infer<typeof CoordinateSchema>;
export type Endpoint = z.infer<typeof EndpointSchema>;
export type PlanRequest = z.infer<typeof PlanRequestSchema>;
export type ResolvedEndpoint = z.infer<typeof ResolvedEndpointSchema>;
export type WalkBundlePayload = z.infer<typeof WalkBundleObjectSchema>;
export type WalkBundleV1 = WalkBundlePayload & { sha256: string };
export type Asset = z.infer<typeof AssetSchema>;
export type Fact = z.infer<typeof FactSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type PublicAnchor = z.infer<typeof PublicAnchorSchema>;
export type ContextSnapshot = z.infer<typeof ContextSchema>;
