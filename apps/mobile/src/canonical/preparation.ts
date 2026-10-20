import { narrationEntries, sealBundle, verifyPack, type Locale, type PackVerification, type WalkBundleV1 } from '@astanaai/contracts';
import { createReplayPlanner } from '@astanaai/walk-planner';
import registry from './preparedAudioRegistry.generated.json';
import { installedAudioReader, nativeHash } from './bundledAssets';

export type PreparedCanonicalWalk = { bundle: WalkBundleV1; verification: PackVerification };
let sequence = 0;

/** Local real-source planner; no generator, GPS transfer or online fallback. */
export async function prepareCanonicalWalk(locale: Locale): Promise<PreparedCanonicalWalk> {
  const at = new Date().toISOString();
  const id = `prepared-${Date.now().toString(36)}-${++sequence}`;
  const planner = createReplayPlanner({ hash: nativeHash, id: () => id, now: () => at });
  const reply = await planner.plan({ requestId: `${id}-request`, locale, origin: { kind: 'public_anchor', anchorId: 'bayterek-outdoor', explicitlyChosen: true },
    startAt: at, budgetMinutes: 80, endRule: { kind: 'return_to_start' }, interests: ['architecture'], constraints: [], contextFlags: [] });
  if (reply.kind !== 'candidates' || !reply.bundles[0]) throw new Error('PREPARATION_UNAVAILABLE');
  const { sha256: _hash, ...payload } = JSON.parse(JSON.stringify(reply.bundles[0])) as WalkBundleV1;
  if (payload.contentRevision !== registry.contentRevision) throw new Error('AUDIO_REVISION_MISMATCH');
  const byId = new Map(registry.entries.map(e => [e.id, e]));
  const narration = narrationEntries(payload);
  if (narration.length !== registry.entries.length) throw new Error('AUDIO_COVERAGE_MISMATCH');
  const used = new Set<string>();
  for (const entry of narration) {
    const asset = byId.get(entry.id);
    if (!asset || asset.locale !== entry.locale || await nativeHash(entry.text) !== asset.textSha256) throw new Error('AUDIO_TEXT_MISMATCH');
    Object.assign(entry.audio, { state: 'available', assetId: asset.assetId, textSha256: asset.textSha256, durationSeconds: asset.durationSeconds });
    if ('reason' in entry.audio) delete (entry.audio as { reason?: string }).reason;
    if (!used.has(asset.assetId)) {
      payload.assets.items.push({ id: asset.assetId, role: 'audio', locale: entry.locale, sha256: asset.sha256, bytes: asset.bytes,
        required: true, license: asset.license, attribution: asset.attribution, location: { kind: 'bundled', path: asset.path } });
      used.add(asset.assetId);
    }
  }
  const bundle = await sealBundle(payload, nativeHash);
  const reader = await installedAudioReader(bundle.assets.items);
  return { bundle, verification: await verifyPack(JSON.stringify(bundle), nativeHash, reader) };
}

export async function verifyInstalledWalk(bundle: WalkBundleV1): Promise<PackVerification> {
  return verifyPack(JSON.stringify(bundle), nativeHash, await installedAudioReader(bundle.assets.items));
}
