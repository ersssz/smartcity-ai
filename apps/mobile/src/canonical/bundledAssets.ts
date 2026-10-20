import { requireNativeModule } from 'expo-modules-core';
import { type Asset, type AssetReader, type Sha256 } from '@astanaai/contracts';

type Observation = Awaited<ReturnType<AssetReader>> & { id: string };
interface NativeAssets {
  hashUtf8(text: string): string;
  verifyAudioAssets(records: { id: string; path: string; sha256: string; bytes: number }[]): Promise<Observation[]>;
}
const native = requireNativeModule<NativeAssets>('AstanaActiveWalk');
export const nativeHash: Sha256 = async text => native.hashUtf8(text);

/** Readiness comes from streamed bytes in the installed APK, not registry claims. */
export async function installedAudioReader(assets: readonly Asset[]): Promise<AssetReader> {
  const audio = assets.filter(asset => asset.role === 'audio');
  if (audio.some(asset => asset.location.kind !== 'bundled')) throw new Error('INVALID_BUNDLED_ASSET');
  const observations = await native.verifyAudioAssets(audio.map(asset => ({ id: asset.id,
    path: asset.location.kind === 'bundled' ? asset.location.path : '', sha256: asset.sha256, bytes: asset.bytes })));
  const byId = new Map(observations.map(item => [item.id, item]));
  return async asset => byId.get(asset.id) ?? { state: 'missing' };
}
