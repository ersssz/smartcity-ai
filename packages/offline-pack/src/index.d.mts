import type { Asset, AssetReader, PackIdentity, PackVerification } from '../../contracts/src/index.js';

export type BlobInspection = Awaited<ReturnType<AssetReader>>;
export type PackRecord = { json: string; identity: PackIdentity; status: string; policyErrors: string[] };
export type RejectedRecord = { id: string; code: string; bytes: number; json?: string };
export type PackState = { version: 1; packs: Record<string, PackRecord>; current: string | null;
  previous: string | null; pins: {sessionId: string; bundleHash: string}[]; rejected: RejectedRecord[] };
export interface BlobWriter {
  write(chunk: Uint8Array): Promise<void>;
  commit(expectedBytes: number): Promise<void>;
  abort(): Promise<void>;
}
export interface PackStorage {
  exclusive<T>(operation: () => Promise<T>): Promise<T>;
  readState(): Promise<PackState>;
  updateState(change: (before: PackState) => PackState): Promise<PackState>;
  inspectBlob(sha256: string): Promise<BlobInspection>;
  readBlob(sha256: string): AsyncIterable<Uint8Array>;
  createBlob(sha256: string): Promise<BlobWriter>;
  removeBlob(sha256: string): Promise<void>;
  usage(): Promise<number>;
}
export interface AssetSource {
  open(asset: Asset, request: {signal: AbortSignal; byteLimit: number; headers: {'User-Agent': string}}):
    Promise<{body: AsyncIterable<Uint8Array>}>;
}
export type Verification = PackVerification & {policyErrors?: string[]};
export type Transfer = {downloadedBytes: number; receivedBytes: number; reusedBytes: number;
  failures: {id: string; code: string}[]};
export type Preparation = (Verification | {state: 'invalid_bundle'; code: string; rejectedId: string}) & {transfer?: Transfer};
export type Selection = {json: string; identity: PackIdentity; verification: Verification};
export interface PackStore {
  prepare(json: string, options?: {signal?: AbortSignal}): Promise<Preparation>;
  verify(bundleHash: string): Promise<Verification>;
  activate(bundleHash: string): Promise<Verification>;
  snapshot(): Promise<{current: Selection | null; previous: Selection | null; pins: PackState['pins']}>;
  pin(sessionId: string, bundleHash: string): Promise<void>;
  unpin(sessionId: string): Promise<void>;
  remove(bundleHash: string): Promise<void>;
  getRejected(id: string): Promise<RejectedRecord | null>;
  assetReader: AssetReader;
}
export function createPackStore(options: {
  storage: PackStorage; source: AssetSource;
  contracts: Pick<typeof import('../../contracts/src/index.js'), 'readBundle' | 'verifyPack' | 'narrationEntries' | 'canonicalJson'>;
  hash: (utf8: string) => Promise<string>; userAgent: string;
  limits?: {concurrency?: number; maxPackBytes?: number; maxTransferBytes?: number; maxStoredBytes?: number;
    maxMapBytes?: number; maxMapTiles?: number; maxPacks?: number};
  mapPolicy?: {kind: 'self_contained'} | {kind: 'tile_provider'; tileAssetIds: string[]};
}): PackStore;
