/** Durable preparation Module. Platform IO and contracts are explicit seams. */
const SHA = /^[a-f0-9]{64}$/;
const bytes = value => new TextEncoder().encode(value).byteLength;
const requireHash = value => { if (!SHA.test(value)) throw new Error('INVALID_BUNDLE_HASH'); return value; };
function interruptible(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(new Error('CANCELLED')); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); });
    if (signal.aborted) abort();
  });
}
async function* stream(body, signal) {
  const iterator = body[Symbol.asyncIterator]();
  try {
    while (true) { const next = await interruptible(iterator.next(), signal); if (next.done) return; yield next.value; }
  } finally {
    if (iterator.return) Promise.resolve(iterator.return()).catch(() => {});
  }
}

export function createPackStore({ storage, source, contracts, hash, userAgent, limits = {}, mapPolicy = { kind: 'self_contained' } }) {
  if (typeof userAgent !== 'string' || !/^AstanaAI\/[\w.-]+ \(.{8,200}\)$/.test(userAgent)) throw new Error('IDENTIFYING_USER_AGENT_REQUIRED');
  const concurrency = limits.concurrency ?? 4;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('INVALID_CONCURRENCY_LIMIT');
  const maxTransferBytes = limits.maxTransferBytes ?? 250_000_000;
  const maxStoredBytes = limits.maxStoredBytes ?? 500_000_000;
  const maxPackBytes = limits.maxPackBytes ?? 250_000_000;
  const maxMapBytes = limits.maxMapBytes ?? 50_000_000;
  const maxMapTiles = limits.maxMapTiles ?? 3000;
  const maxPacks = limits.maxPacks ?? 20;
  for (const limit of [maxTransferBytes, maxStoredBytes, maxPackBytes]) if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000_000_000) throw new Error('INVALID_BYTE_LIMIT');
  if (!Number.isSafeInteger(maxMapBytes) || maxMapBytes < 1 || maxMapBytes > 50_000_000 || !Number.isInteger(maxMapTiles) || maxMapTiles < 1 || maxMapTiles > 3000) throw new Error('INVALID_MAP_LIMIT');
  if (!['self_contained', 'tile_provider'].includes(mapPolicy.kind)) throw new Error('INVALID_MAP_POLICY');
  if (!Number.isInteger(maxPacks) || maxPacks < 1 || maxPacks > 50) throw new Error('INVALID_PACK_LIMIT');
  function policy(bundle) {
    const errors = [], unique = new Map();
    for (const asset of bundle.assets.items) {
      if (asset.location.kind === 'bundled') {
        const path = asset.location.path;
        if (!/^[A-Za-z0-9_./-]+$/.test(path) || path.startsWith('/') || path.split('/').some(p => !p || p === '.' || p === '..')) errors.push('UNSAFE_ASSET_PATH');
      } else {
        const url = new URL(asset.location.url);
        if (url.protocol !== 'https:' || url.username || url.password) errors.push('UNSAFE_ASSET_URL');
      }
      if (unique.has(asset.sha256) && unique.get(asset.sha256).bytes !== asset.bytes) errors.push('INCONSISTENT_CONTENT_SIZE');
      unique.set(asset.sha256, asset);
    }
    if ([...unique.values()].reduce((n, asset) => n + asset.bytes, 0) > maxPackBytes) errors.push('PACK_BYTE_LIMIT');
    const mapIds = new Set(bundle.assets.map.state === 'available' ? bundle.assets.map.assetIds : []);
    const mapAssets = [...new Map(bundle.assets.items.filter(a => mapIds.has(a.id) || ['map', 'style', 'glyphs', 'sprite', 'attribution'].includes(a.role)).map(a => [a.sha256, a])).values()];
    if (mapAssets.reduce((n, asset) => n + asset.bytes, 0) > maxMapBytes) errors.push('MAP_BYTE_LIMIT');
    if (mapPolicy.kind === 'tile_provider') {
      const ids = mapPolicy.tileAssetIds;
      if (!Array.isArray(ids) || new Set(ids).size !== ids.length || bundle.assets.items.filter(a => a.role === 'map').some(a => !ids.includes(a.id)) || ids.some(id => !bundle.assets.items.some(a => a.id === id && a.role === 'map'))) errors.push('TILE_MANIFEST_REQUIRED');
      if (Array.isArray(ids) && ids.length > maxMapTiles) errors.push('MAP_TILE_LIMIT');
    }
    return [...new Set(errors)];
  }
  const reader = asset => storage.inspectBlob(asset.sha256);
  async function reject(json, code) {
    const rejectedId = await hash(json);
    await storage.updateState(state => {
      state.rejected = state.rejected.filter(record => record.id !== rejectedId);
      state.rejected.push({ id: rejectedId, code, bytes: bytes(json),
        ...(bytes(json) <= 512 * 1024 ? { json } : {}) });
      state.rejected = state.rejected.slice(-10);
      return state;
    });
    return { state: 'invalid_bundle', code, rejectedId };
  }
  async function verify(bundleHash) {
    requireHash(bundleHash);
    const record = (await storage.readState()).packs[bundleHash];
    if (!record) throw new Error('UNKNOWN_PACK');
    const result = await contracts.verifyPack(record.json, hash, reader);
    if (result.state === 'invalid_bundle') return result;
    const policyErrors = [...new Set([...(record.policyErrors ?? []), ...policy(JSON.parse(record.json))])];
    return policyErrors.length ? { ...result, state: 'partial', policyErrors } : { ...result, policyErrors: [] };
  }
  async function prepare(json, { signal: externalSignal } = {}) {
    const read = await contracts.readBundle(json, hash);
    if (!read.ok) return reject(json, read.code);
    const bundle = read.bundle;
    const existing = await storage.readState();
    if (!existing.packs[bundle.sha256] && Object.keys(existing.packs).length >= maxPacks) return reject(json, 'PACK_COUNT_LIMIT');
    const identity = { bundleHash: bundle.sha256, revision: bundle.revision,
      manifestHash: await hash(contracts.canonicalJson(bundle.assets)) };
    const policyErrors = policy(bundle);
    await storage.updateState(state => {
      state.packs[bundle.sha256] = { json, identity, status: 'partial', policyErrors }; return state;
    });
    if (policyErrors.length) return { ...await verify(bundle.sha256), transfer: { downloadedBytes: 0, receivedBytes: 0, reusedBytes: 0, failures: [] } };
    const controller = new AbortController(), signal = controller.signal;
    const cancel = () => controller.abort();
    externalSignal?.addEventListener('abort', cancel, { once: true });
    if (externalSignal?.aborted) cancel();
    let downloadedBytes = 0, reusedBytes = 0, receivedBytes = 0, reserved = 0, stopped = false;
    const baselineUsage = await storage.usage();
    const failures = [];
    const assets = [...new Map(bundle.assets.items.map(asset => [asset.sha256, asset])).values()];
    let cursor = 0;
    async function worker() {
      while (cursor < assets.length && !stopped) {
        const asset = assets[cursor++];
        if (signal.aborted) { failures.push({ id: asset.id, code: 'CANCELLED' }); break; }
        let writer, written = 0, phase = 'storage';
        try {
          const current = await reader(asset);
          if (current.state === 'present' && current.storage === 'durable' && current.sha256 === asset.sha256 && current.bytes === asset.bytes) { reusedBytes += asset.bytes; continue; }
          writer = await storage.createBlob(asset.sha256);
          phase = 'source';
          const response = await interruptible(source.open(asset, { signal, byteLimit: Math.min(asset.bytes + 1, maxTransferBytes - receivedBytes + 1), headers: { 'User-Agent': userAgent } }), signal);
          let received = 0;
          for await (const chunk of stream(response.body, signal)) {
            if (signal.aborted) throw new Error('CANCELLED');
            if (!(chunk instanceof Uint8Array)) throw new Error('INVALID_SOURCE_BYTES');
            receivedBytes += chunk.byteLength;
            if (chunk.byteLength > 65_536) { stopped = true; controller.abort(); throw new Error('SOURCE_CHUNK_LIMIT'); }
            if (receivedBytes > maxTransferBytes) { stopped = true; controller.abort(); throw new Error('TRANSFER_BYTE_LIMIT'); }
            if (baselineUsage + reserved + chunk.byteLength > maxStoredBytes) { stopped = true; controller.abort(); throw new Error('STORAGE_BYTE_LIMIT'); }
            if (received + chunk.byteLength > asset.bytes) throw new Error('ASSET_BYTE_LIMIT');
            received += chunk.byteLength; downloadedBytes += chunk.byteLength;
            written += chunk.byteLength; reserved += chunk.byteLength;
            phase = 'storage'; await writer.write(chunk); phase = 'source';
          }
          phase = 'storage'; await writer.commit(asset.bytes);
        } catch (error) {
          try { await writer?.abort(); } catch { phase = 'storage'; }
          reserved -= written;
          const known = ['CANCELLED', 'INVALID_SOURCE_BYTES', 'SOURCE_CHUNK_LIMIT', 'TRANSFER_BYTE_LIMIT', 'STORAGE_BYTE_LIMIT', 'ASSET_BYTE_LIMIT', 'CORRUPT_FILE'];
          failures.push({ id: asset.id, code: known.includes(error.message) ? error.message : phase === 'storage' ? 'STORAGE_UNAVAILABLE' : 'SOURCE_UNAVAILABLE' });
        }
      }
    }
    try { await Promise.all(Array.from({ length: concurrency }, worker)); }
    finally { externalSignal?.removeEventListener('abort', cancel); }
    const result = await verify(bundle.sha256);
    await storage.updateState(state => { state.packs[bundle.sha256].status = result.state; return state; });
    return { ...result, transfer: { downloadedBytes, receivedBytes, reusedBytes, failures } };
  }
  async function activate(bundleHash) {
    const verification = await verify(bundleHash);
    if (verification.state !== 'ready') throw new Error('PACK_NOT_READY');
    await storage.updateState(state => {
      if (state.current !== bundleHash) { state.previous = state.current; state.current = bundleHash; }
      return state;
    });
    return verification;
  }
  async function snapshot() {
    const state = await storage.readState();
    const view = async key => key ? { json: state.packs[key].json, identity: state.packs[key].identity, verification: await verify(key) } : null;
    return { current: await view(state.current), previous: await view(state.previous), pins: state.pins };
  }
  async function pin(sessionId, bundleHash) {
    requireHash(bundleHash);
    if (typeof sessionId !== 'string' || !/^[\w:-]{1,100}$/.test(sessionId)) throw new Error('INVALID_SESSION_ID');
    await storage.updateState(state => {
      if (!state.packs[bundleHash]) throw new Error('UNKNOWN_PACK');
      const existing = state.pins.find(p => p.sessionId === sessionId);
      if (existing && existing.bundleHash !== bundleHash) throw new Error('SESSION_PIN_CONFLICT');
      if (!existing) {
        if (state.pins.length >= 100) throw new Error('PIN_LIMIT');
        state.pins.push({ sessionId, bundleHash });
      }
      return state;
    });
  }
  async function unpin(sessionId) {
    await storage.updateState(state => { state.pins = state.pins.filter(p => p.sessionId !== sessionId); return state; });
  }
  async function remove(bundleHash) {
    requireHash(bundleHash);
    let removed;
    const state = await storage.updateState(state => {
      if (state.pins.some(p => p.bundleHash === bundleHash)) throw new Error('PACK_PINNED');
      if (state.current === bundleHash) throw new Error('CURRENT_PACK');
      removed = state.packs[bundleHash];
      if (!removed) throw new Error('UNKNOWN_PACK');
      delete state.packs[bundleHash];
      if (state.previous === bundleHash) state.previous = null;
      return state;
    });
    const referenced = new Set(Object.values(state.packs).flatMap(record => JSON.parse(record.json).assets.items.map(a => a.sha256)));
    for (const asset of JSON.parse(removed.json).assets.items) if (!referenced.has(asset.sha256)) await storage.removeBlob(asset.sha256);
  }
  const serialized = method => (...args) => storage.exclusive(() => method(...args));
  return { prepare: serialized(prepare), verify: serialized(verify), activate: serialized(activate),
    snapshot: serialized(snapshot), pin: serialized(pin), unpin: serialized(unpin), remove: serialized(remove),
    getRejected: serialized(async id => (await storage.readState()).rejected.find(record => record.id === id) ?? null), assetReader: reader };
}
