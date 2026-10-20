// Simulated editorial content and route for progression tests, never field evidence.
const text = (value) => ({ ru: value, kk: value, en: value });
const points = [[71, 51], [71.001, 51], [71.001, 51.001]];
const stops = ['one', 'two', 'three'].map((id, index) => ({
  id, candidateKey: id, poiId: `poi-${id}`, title: text(id), subtitle: text('Simulated stop'),
  coordinate: points[index], osmNodeId: String(index + 1), visitMinutes: 5,
  storyTitle: text('A prepared story'), story: text('Simulated factual story'), observation: text('Read and observe'),
  framing: 'original_editorial_facts_and_clearly_marked_imagination', factRefs: ['fact'], sourceIds: ['source'],
  quest: { id: `quest-${id}`, question: text('Which answer is correct?'),
    choices: [{ id: 'yes', label: text('Correct') }, { id: 'no', label: text('Wrong') }],
    correctChoiceId: 'yes', hint: text('Read the story'), explanation: text('A prepared explanation'), factRefs: ['fact'] },
}));
const walk = {
  schemaVersion: 1, kind: 'prepared_editorial_walk', id: 'simulated-walk', revision: 1,
  title: text('Simulated route'), subtitle: text('Progression fixture'), description: text('Not a real walking route'), collectionTitle: text('Manual discovery'),
  startAnchor: { id: 'start', label: text('Chosen public start'), coordinate: points[0], osmNodeId: '1' },
  endRule: 'return_to_start', stops,
  legs: stops.map((stop, index) => ({ id: `leg-${index}`, fromStopId: stop.id, toStopId: stops[(index + 1) % 3].id,
    coordinates: [points[index], points[(index + 1) % 3]], osmNodeIds: [String(index + 1), String((index + 1) % 3 + 1)], sourceWayIds: ['simulated'], distanceMeters: 100, walkMinutes: 2 })),
  timing: { budgetMinutes: 30, walkMinutes: 6, visitMinutes: 15, reserveMinutes: 5, totalMinutes: 26, distanceMeters: 300, assumedMetersPerMinute: 50 },
  sources: [{ id: 'source', title: 'Simulated source', url: 'https://example.org/source', checkedAt: '2026-10-20T00:00:00.000Z', owner: 'Fixture', rights: 'Simulated test data' }],
  facts: [{ id: 'fact', statement: text('A simulated fact'), sourceIds: ['source'] }],
  routeSource: { url: 'https://example.org/simulated', snapshotSha256: '0'.repeat(64), graphSha256: '1'.repeat(64), preparedAt: '2026-10-20T00:00:00.000Z', license: 'ODbL-1.0', attribution: 'Simulated test graph', fieldVerified: false },
  availability: { textAndRouteBundled: true, baseMap: 'online', preparedAudio: 'unavailable', humanTranslationReview: 'pending' },
};
module.exports = { walk };
