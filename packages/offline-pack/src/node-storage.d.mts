import type { PackStorage } from './index.mjs';
/** Node-only Adapter. One writer process per task-owned root; see README. */
export function openFilesystemStorage(root: string): Promise<PackStorage & {close(): void}>;
