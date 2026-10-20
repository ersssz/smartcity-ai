// Owned CC0 synthetic evidence. No actual venue, service or opening is asserted.
const text = value => ({ ru: value, kk: value, en: value });
const unknown = reason => ({ state: 'unknown', reason, sourceIds: ['synthetic-source'] });
const known = (value, changes = {}) => ({ state: 'known', value, sourceIds: ['synthetic-source'],
  observedAt: '2026-10-20T10:00:00.000Z', validUntil: '2026-10-20T14:00:00.000Z', ...changes });
function synthetic() {
  const names = ['Target', 'Target Cafe', 'Target Conflict', 'Target Expired', 'Target Future', 'Target Already Stale'];
  const pois = names.map((name, index) => ({ id: `synthetic:${index}`, names: text(name),
    aliases: { ru: [name], kk: [name], en: [name] }, zoneIds: ['synthetic-zone'], categories: ['cafe'],
    center: known([index / 100, 0]), anchorIds: [],
    access: known({ public: true, indoor: true, stepFree: 'verified' }),
    opening: known({ timeZone: 'Asia/Almaty', openIntervals: [
      { from: '2026-10-20T11:00:00.000Z', until: '2026-10-20T13:00:00.000Z' },
    ] }), services: { coffee: unknown('No service evidence') },
    factRefs: [`synthetic-fact:${index}`], sourceIds: ['synthetic-source'] }));
  pois[1].services.coffee = known(true);
  pois[2].services.coffee = { state: 'conflicting', reason: 'Two synthetic observations disagree', sourceIds: ['synthetic-source'] };
  pois[3].services.coffee = known(true, { validUntil: '2026-10-20T11:00:00.000Z' });
  pois[4].services.coffee = known(true, { observedAt: '2026-10-20T13:00:00.000Z' });
  pois[5].services.coffee = { state: 'stale', reason: 'Already stale in source', sourceIds: ['synthetic-source'] };
  return { revision: 'synthetic-test-only', evaluatedAt: '2026-10-20T12:00:00.000Z',
    coverage: { zoneIds: ['synthetic-zone'], scope: 'sample', complete: false, limitations: [text('Synthetic test only')] },
    pois, anchors: [], facts: pois.map((p, i) => ({ id: `synthetic-fact:${i}`, statement: text('Synthetic fixture statement'),
      sourceIds: ['synthetic-source'], checkedAt: '2026-10-20' })),
    sources: [{ id: 'synthetic-source', title: 'Owned synthetic fixture', url: 'https://example.invalid/fixture', checkedAt: '2026-10-20', rights: 'CC0-1.0 synthetic data' }],
    context: { evaluatedAt: '2026-10-20T12:00:00.000Z', season: 'autumn', weather: unknown('No synthetic weather'), calendar: unknown('No synthetic calendar') } };
}
module.exports = { synthetic, known, unknown, text };
