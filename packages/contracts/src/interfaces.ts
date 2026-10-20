import { z } from 'zod';
import { IdSchema, TextSchema, CoordinateSchema, PublicAnchorSchema, FactSchema, SourceSchema, ContextSchema, AccessSchema, OpeningSchema, EvidenceFieldSchema, type PlanRequest, type WalkBundleV1, type Endpoint, type LocalizedText } from './model.js';

export const PoiEvidenceSchema = z.object({
  id: IdSchema, names: TextSchema, aliases: z.object({ ru: z.array(z.string()), kk: z.array(z.string()), en: z.array(z.string()) }).strict(),
  zoneIds: z.array(IdSchema), categories: z.array(z.enum(['landmark', 'culture', 'park', 'public_space', 'cafe', 'museum', 'other'])),
  center: EvidenceFieldSchema(CoordinateSchema), anchorIds: z.array(IdSchema),
  access: EvidenceFieldSchema(AccessSchema), opening: EvidenceFieldSchema(OpeningSchema),
  services: z.object({ coffee: EvidenceFieldSchema(z.boolean()) }).strict(), factRefs: z.array(IdSchema), sourceIds: z.array(IdSchema).min(1),
}).strict();
export const EvidenceSetSchema = z.object({
  revision: IdSchema, evaluatedAt: z.string().datetime(),
  coverage: z.object({ zoneIds: z.array(IdSchema), scope: z.enum(['sample', 'base', 'deep']), complete: z.literal(false), limitations: z.array(TextSchema) }).strict(),
  pois: z.array(PoiEvidenceSchema), anchors: z.array(PublicAnchorSchema), facts: z.array(FactSchema), sources: z.array(SourceSchema), context: ContextSchema,
}).strict();
export const EvidenceQuerySchema = z.object({
  locale: z.enum(['ru', 'kk', 'en']), at: z.string().datetime(),
  area: z.union([z.object({ kind: z.literal('public_zone'), zoneId: IdSchema }).strict(), z.object({ kind: z.literal('bounds'), bounds: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-180).max(180), z.number().min(-90).max(90)]).refine(([w, s, e, n]) => w < e && s < n) }).strict()]),
  terms: z.array(z.string().trim().min(1).max(100)).max(10), interests: z.array(z.enum(['architecture', 'history', 'art', 'parks', 'coffee', 'unusual'])).max(6),
  required: z.array(z.enum(['indoor', 'coffee', 'step_free', 'public_anchor'])).max(4), limit: z.number().int().min(1).max(24),
}).strict();
export type PoiEvidence = z.infer<typeof PoiEvidenceSchema>;
export type EvidenceSet = z.infer<typeof EvidenceSetSchema>;
export type EvidenceQuery = z.infer<typeof EvidenceQuerySchema>;
export interface CityEvidence { search(query: EvidenceQuery): Promise<EvidenceSet> }
export type PlanningReason = { code: 'OUTSIDE_COVERAGE' | 'UNKNOWN_ACCESS' | 'UNKNOWN_HOURS' | 'UNSUPPORTED_CONNECTOR' | 'NO_ROUTE' | 'INSUFFICIENT_TIME' | 'CONSTRAINT_UNSUPPORTED' | 'NO_SUPPORTED_CONTENT'; message: LocalizedText };
export type PlanFailure = { kind: 'clarification'; fields: string[]; message: LocalizedText }
  | { kind: 'no_feasible_walk'; reasons: PlanningReason[] }
  | { kind: 'unavailable'; code: 'DATA_UNAVAILABLE' | 'ROUTING_UNAVAILABLE' | 'GENERATION_UNAVAILABLE' | 'BUDGET_EXHAUSTED'; retryAfterSec?: number };
export type PlanReply = { kind: 'candidates'; bundles: WalkBundleV1[]; omittedReasons: PlanningReason[] } | PlanFailure;
export type RevisionRequest = {
  requestId: string; parentBundle: WalkBundleV1; expectedRevision: number; expectedHash: string;
  from: Endpoint; now: string; remainingMinutes: number; completedStopIds: string[];
  reason: 'deviation' | 'user_change'; constraints: PlanRequest['constraints'];
  proposedDeadlineAt?: string;
};
export type RevisionReply = PlanFailure | { kind: 'revision_proposal'; proposalId: string; expiresAt: string;
  parentRevision: number; parentHash: string; bundle: WalkBundleV1;
  changes: { addedStopIds: string[]; removedStopIds: string[]; oldEndsAt: string; newEndsAt: string; themeChanged: boolean };
  requiresConsent: boolean;
};
export interface WalkPlanner { plan(request: PlanRequest): Promise<PlanReply>; revise(request: RevisionRequest): Promise<RevisionReply> }

/** Session integration boundary; durable command/event schema remains repository-owned. */
export interface WalkSession<Command, Snapshot> {
  open(bundleOrSessionId: WalkBundleV1 | string): Promise<Snapshot>;
  dispatch(command: Command): Promise<Snapshot>;
  snapshot(): Promise<Snapshot>;
}
