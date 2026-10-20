import { canonicalJson, readBundle, type Sha256 } from './bundle.js';
import { Sha256Schema, type Asset, type Locale, type WalkBundleV1 } from './model.js';

/** Reader must hash actual durable file bytes, not return the expected manifest hash. */
export type AssetReader = (asset: Asset) => Promise<
  { state: 'present'; sha256: string; bytes: number; storage: 'durable' | 'cache' } | { state: 'missing' }
>;
export type PackIdentity = { bundleHash: string; revision: number; manifestHash: string };
export type MissingAsset = { id: string; reason: 'MAP_UNAVAILABLE' | 'AUDIO_UNAVAILABLE' | 'MISSING_FILE' | 'CORRUPT_FILE' | 'VOLATILE_FILE' | 'AUDIO_TEXT_MISMATCH' | 'READ_FAILED' };
export type PackVerification = { state: 'invalid_bundle'; code: string } | { state: 'partial'; identity: PackIdentity; missing: MissingAsset[] } | { state: 'ready'; identity: PackIdentity; missing: [] };
/** Exact source used to bind a chapter narration. Formatting changes require new audio. */
export function chapterNarration(chapter: WalkBundleV1['content']['chapters'][number], locale: Locale): string {
  return [chapter.title[locale], ...chapter.blocks.map(b => b.text[locale])].join('\n\n');
}
/** No answer is included in question audio; hints and explanation are separate actions. */
export function narrationEntries(bundle: WalkBundleV1) {
  const result: { id: string; locale: Locale; text: string; audio: WalkBundleV1['content']['chapters'][number]['audio'][Locale] }[] = [];
  for (const locale of ['ru', 'kk', 'en'] as const) {
    for (const c of bundle.content.chapters) result.push({ id: `${c.id}:${locale}`, locale, text: chapterNarration(c, locale), audio: c.audio[locale] });
    for (const q of bundle.content.quests) {
      result.push({ id: `${q.id}:question:${locale}`, locale, text: [q.question[locale], ...q.choices.map(c => c.label[locale])].join('\n\n'), audio: q.audio.question[locale] });
      result.push({ id: `${q.id}:hint:${locale}`, locale, text: q.hint[locale], audio: q.audio.hint[locale] });
      result.push({ id: `${q.id}:explanation:${locale}`, locale, text: q.explanation[locale], audio: q.audio.explanation[locale] });
    }
    for (const [id, cue] of Object.entries(bundle.content.cues)) result.push({ id: `cue:${id}:${locale}`, locale, text: cue.text[locale], audio: cue.audio[locale] });
  }
  return result;
}
export async function verifyPack(json: string, hash: Sha256, reader: AssetReader): Promise<PackVerification> {
  const read = await readBundle(json, hash);
  if (!read.ok) return { state: 'invalid_bundle', code: read.code };
  const bundle = read.bundle;
  let manifestHash: string;
  try { manifestHash = Sha256Schema.parse(await hash(canonicalJson(bundle.assets))); }
  catch { return { state: 'invalid_bundle', code: 'HASH_UNAVAILABLE' }; }
  const identity = { bundleHash: bundle.sha256, revision: bundle.revision, manifestHash };
  const missing: MissingAsset[] = [];
  const required = new Set(bundle.assets.items.filter(i => i.required).map(a => a.id));
  if (bundle.assets.map.state === 'missing') missing.push({ id: 'map', reason: 'MAP_UNAVAILABLE' });
  else bundle.assets.map.assetIds.forEach(id => required.add(id));
  for (const entry of narrationEntries(bundle)) {
    const audio = entry.audio;
    if (audio.state === 'missing') missing.push({ id: entry.id, reason: 'AUDIO_UNAVAILABLE' });
    else {
      required.add(audio.assetId);
      try { if (await hash(entry.text) !== audio.textSha256) missing.push({ id: audio.assetId, reason: 'AUDIO_TEXT_MISMATCH' }); }
      catch { missing.push({ id: audio.assetId, reason: 'READ_FAILED' }); }
    }
  }
  // Sequential reads bound memory and avoid unbounded IO on a malformed manifest.
  for (const id of required) {
    const asset = bundle.assets.items.find(a => a.id === id)!;
    try {
      const actual = await reader(asset);
      if (actual.state === 'missing') missing.push({ id, reason: 'MISSING_FILE' });
      else if (actual.sha256 !== asset.sha256 || actual.bytes !== asset.bytes) missing.push({ id, reason: 'CORRUPT_FILE' });
      else if (actual.storage !== 'durable') missing.push({ id, reason: 'VOLATILE_FILE' });
    } catch { missing.push({ id, reason: 'READ_FAILED' }); }
  }
  return missing.length ? { state: 'partial', identity, missing } : { state: 'ready', identity, missing: [] };
}
