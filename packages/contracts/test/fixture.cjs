// Synthetic CC0 contract data. This proves no actual route, venue or opening.
const text = value => ({ ru: value, kk: value, en: value });
const sha = 'a'.repeat(64);
const at = '2026-10-20T10:00:00.000Z';
const anchor = (id, x) => ({ id, coordinate: [x, 0], graphNodeId: id, sourceIds: ['fixture-source'], checkedAt: at, fieldVerified: false });
const a = anchor('a', 0), b = anchor('b', 0.001);
const endpoint = a => ({ requested: { kind: 'public_anchor', anchorId: a.id, explicitlyChosen: true }, coordinate: a.coordinate, graphPoint: { id: a.graphNodeId, coordinate: a.coordinate }, snapDistanceM: 0, connector: { kind: 'exact' } });
const audioMissing = () => ({ ru: { state: 'missing', reason: 'Test only' }, kk: { state: 'missing', reason: 'Test only' }, en: { state: 'missing', reason: 'Test only' } });
function fixture() {
  const stops = [a, b].map((anchor, i) => ({
    id: `stop-${i}`, poiId: `fixture:place:${i}`, title: text(`Synthetic stop ${i}`), anchor,
    visitMinutes: 4, arrivalAt: i ? '2026-10-20T10:06:00.000Z' : at,
    departureAt: i ? '2026-10-20T10:10:00.000Z' : '2026-10-20T10:04:00.000Z',
    intent: 'outdoor_observation', access: { state: 'unknown', reason: 'Synthetic fixture, not field data', sourceIds: [] },
    opening: { state: 'unknown', reason: 'No actual schedule', sourceIds: [] },
    services: { coffee: { state: 'unknown', reason: 'No actual service', sourceIds: [] } },
    factRefs: ['fixture-fact'], chapterId: `chapter-${i}`, questId: `quest-${i}`, collectionId: 'fixture-collection',
  }));
  const legs = [
    { kind: 'already_at_endpoint', id: 'first', fromId: 'origin', toId: 'stop-0', from: endpoint(a), to: endpoint(a), distanceMeters: 0, walkMinutes: 0 },
    { kind: 'walk', id: 'middle', fromId: 'stop-0', toId: 'stop-1', from: endpoint(a), to: endpoint(b), distanceMeters: 111.32, walkMinutes: 2, geometry: { type: 'LineString', coordinates: [a.coordinate, b.coordinate] }, source: { sourceIds: ['fixture-source'], datasetRevision: 'synthetic-1', graphSha256: sha, checkedAt: at, license: 'CC0-1.0', attribution: 'Synthetic test geometry', fieldVerified: false } },
    { kind: 'walk', id: 'return', fromId: 'stop-1', toId: 'end', from: endpoint(b), to: endpoint(a), distanceMeters: 111.32, walkMinutes: 2, geometry: { type: 'LineString', coordinates: [b.coordinate, a.coordinate] }, source: { sourceIds: ['fixture-source'], datasetRevision: 'synthetic-1', graphSha256: sha, checkedAt: at, license: 'CC0-1.0', attribution: 'Synthetic test geometry', fieldVerified: false } },
  ];
  legs.forEach(l => { if (l.kind === 'walk') l.stepFree = { state: 'unknown', reason: 'No actual route accessibility proof', sourceIds: [] }; });
  return JSON.parse(JSON.stringify({
    schemaVersion: 1, kind: 'walk_bundle', bundleId: 'fixture-bundle', revision: 1,
    generatedAt: at, contentRevision: 'synthetic-1', evidenceRevision: 'synthetic-1', plannerVersion: 'contract-fixture-1',
    evidenceMode: 'test_fixture', timeZone: 'Asia/Almaty',
    request: { requestId: 'fixture-request', locale: 'ru', origin: endpoint(a).requested, startAt: at, budgetMinutes: 30, endRule: { kind: 'return_to_start' }, interests: ['architecture'], constraints: [], contextFlags: [] },
    originalOrigin: endpoint(a),
    continuation: { origin: endpoint(a), startAt: at, budgetMinutes: 30, constraints: [], timeTerms: { kind: 'current_deadline', deadlineAt: '2026-10-20T10:30:00.000Z' } },
    resolvedEnd: { endpoint: endpoint(a) },
    theme: { id: 'fixture-theme', title: text('Synthetic contract walk'), explanation: { text: text('Test-only explanation'), factRefs: ['fixture-fact'] } },
    stops, legs,
    timing: { walkMinutes: 4, visitMinutes: 8, reserveMinutes: 5, totalMinutes: 17, distanceMeters: 222.64, endsAt: '2026-10-20T10:17:00.000Z' },
    sources: [{ id: 'fixture-source', title: 'Owned synthetic fixture', url: 'https://example.invalid/astanaai-fixture', checkedAt: at, rights: 'CC0-1.0' }],
    facts: [{ id: 'fixture-fact', statement: text('This is synthetic contract test data.'), sourceIds: ['fixture-source'], checkedAt: at }],
    content: {
      origin: 'editorial', translationReview: 'pending',
      chapters: stops.map((s, i) => ({ id: s.chapterId, stopId: s.id, title: text(`Test chapter ${i}`), blocks: [{ kind: 'fact', text: text('This is synthetic contract test data.'), factRefs: ['fixture-fact'] }, { kind: 'idea', text: text('Look around in this test.') }], audio: audioMissing() })),
      quests: stops.map(s => ({ id: s.questId, stopId: s.id, question: text('Is this synthetic?'), choices: [{ id: 'yes', label: text('Yes') }, { id: 'no', label: text('No') }], correctChoiceId: 'yes', hint: text('Read the fixture label'), explanation: text('This is a contract test'), factRefs: ['fixture-fact'], proof: 'answer', audio: { question: audioMissing(), hint: audioMissing(), explanation: audioMissing() } })),
      collections: [{ id: 'fixture-collection', title: text('Test collection'), description: text('No actual visit'), proof: 'manual' }],
      cues: Object.fromEntries(['start', 'nearby', 'pause', 'resume', 'complete', 'abandon'].map(id => [id, { text: text(`Synthetic ${id} cue`), audio: audioMissing() }])),
    },
    assets: { version: 1, items: [], map: { state: 'missing', reason: 'No offline map in synthetic fixture' } },
    context: { evaluatedAt: at, season: 'autumn', weather: { state: 'unknown', reason: 'Unavailable in synthetic fixture', sourceIds: [] }, calendar: { state: 'unknown', reason: 'Unavailable in synthetic fixture', sourceIds: [] } },
    limitations: [text('Synthetic test data only; no field or offline acceptance.')],
  }));
}
module.exports = { fixture, text, sha };
