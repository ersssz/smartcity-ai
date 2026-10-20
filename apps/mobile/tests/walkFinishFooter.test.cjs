// Exercise the actual TSX view through rendered button props. Native map/animation
// adapters are recorded, not an Android renderer or proof of a physical return.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const jsx = (type, props) => ({ type, props: props ?? {} });
const react = {
  useState: value => [typeof value === 'function' ? value() : value, () => {}],
  useMemo: fn => fn(), useCallback: fn => fn, useRef: value => ({ current: value }), useEffect() {},
};
class Value { constructor(value) { this.value = value; } }
const native = {
  ActivityIndicator: 'ActivityIndicator', Animated: { Value, View: 'AnimatedView' },
  BackHandler: {}, Keyboard: {}, Linking: {}, PanResponder: { create: () => ({ panHandlers: {} }) },
  Platform: { OS: 'android' }, Pressable: 'Pressable', ScrollView: 'ScrollView',
  StatusBar: { currentHeight: 24 }, StyleSheet: { create: value => value, absoluteFill: {} },
  Text: 'Text', TextInput: 'TextInput', View: 'View', useWindowDimensions: () => ({ width: 360, height: 800 }),
};
function execute(filename) {
  const loaded = new Module(filename, module);
  loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.require = id => {
    if (id === 'react') return react;
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (id === 'react-native') return native;
    if (id === '@maplibre/maplibre-react-native') return {};
    if (id.startsWith('./')) return execute(path.resolve(path.dirname(filename), `${id}.ts`));
    throw new Error(`Unexpected production dependency: ${id}`);
  };
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
  return loaded.exports;
}
const WalkExperience = execute(path.join(root, 'src/features/walk/WalkExperience.tsx')).default;
function fixture(overrides = {}) {
  const calls = [];
  const ending = { kind: 'return_to_start', label: 'Return', title: 'Return', body: 'Follow the saved route.', confirmLabel: 'At the start · finish', tabLabel: 'Return' };
  const walk = {
    id: 'view-fixture', title: 'View fixture', subtitle: 'Recorded view', description: '', eyebrow: '',
    minutes: 63, distanceMeters: 2212, walkMinutes: 37, visitMinutes: 18, reserveMinutes: 8,
    startLabel: 'Public start', endLabel: 'Public start', route: [[71, 51], [71.01, 51.01]],
    attribution: 'Fixture', fieldNote: 'Not a field test', ending,
    stops: ['one', 'two', 'three'].map(id => ({ id, title: id, kicker: '', coordinate: [71, 51], minutes: 6,
      storyTitle: id, story: 'Prepared text', observation: '', quest: { question: '', choices: [], hint: '' }, sources: [] })),
  };
  const session = { phase: 'active', currentStopIndex: 3, completedStopIds: [], readStopIds: ['one', 'two', 'three'],
    skippedStopIds: [], manualStopIds: [], answers: {} };
  const noop = () => {};
  const props = { locale: 'en', walk, session, storyOnly: true, onLocaleChange: noop, onStart: noop,
    onPause: noop, onResume: noop, onStop: noop, onMarkStop: noop, onContinue: noop, onAnswer: noop,
    onSkip: noop, onSpeak: noop, onStopAudio: noop, onRestart: noop, onOpenDiagnostics: noop,
    onConfirmReturn: () => calls.push(['confirm_end']), onFinishStory: id => calls.push(['read_story', id]),
    ...overrides,
  };
  return { tree: WalkExperience(props), props, calls };
}
function buttons(tree, insideScroll = false, result = []) {
  if (Array.isArray(tree)) { for (const child of tree) buttons(child, insideScroll, result); return result; }
  if (!tree || typeof tree !== 'object') return result;
  const scrolling = insideScroll || tree.type === 'ScrollView';
  if (typeof tree.type === 'function' && tree.type.name === 'Button') result.push({ ...tree.props, insideScroll: scrolling });
  buttons(tree.props?.children, scrolling, result);
  return result;
}
function visibleText(tree) {
  if (Array.isArray(tree)) return tree.map(visibleText).join('');
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  return tree && typeof tree === 'object' ? visibleText(tree.props?.children) : '';
}
test('after all stories the explicit finish is reachable outside scrolling content', () => {
  const f = fixture();
  const finish = buttons(f.tree).filter(button => button.label === f.props.walk.ending.confirmLabel);
  assert.equal(finish.length, 1, 'one unambiguous confirmation control');
  assert.equal(finish[0].insideScroll, false, 'completion stays in the persistent controls');
  assert.equal(!!finish[0].disabled, false);
  assert.deepEqual(f.calls, [], 'rendering never asserts arrival');
  finish[0].onPress();
  assert.deepEqual(f.calls, [['confirm_end']], 'only the explicit button sends confirmation');
});
for (const ending of [
  { kind: 'last_stop', confirmLabel: 'Finish at the last stop' },
  { kind: 'point', confirmLabel: 'At the finish · complete' },
]) test(`persistent finish retains the selected ${ending.kind} meaning`, () => {
  const base = fixture().props;
  const f = fixture({ walk: { ...base.walk, ending: { ...base.walk.ending, ...ending } } });
  const finish = buttons(f.tree).find(button => button.label === ending.confirmLabel);
  assert.ok(finish && !finish.insideScroll);
  finish.onPress(); assert.deepEqual(f.calls, [['confirm_end']]);
});
for (const state of ['paused', 'busy']) test(`explicit finish cannot advance while ${state}`, () => {
  const base = fixture().props;
  const f = fixture(state === 'paused' ? { session: { ...base.session, phase: 'paused' } } : { busy: true });
  const finish = buttons(f.tree).find(button => button.label === base.walk.ending.confirmLabel && !button.insideScroll);
  assert.ok(finish, 'the next action remains understandable');
  assert.equal(finish.disabled, true);
  assert.deepEqual(f.calls, []);
});
test('legacy manual completion of the current chapter does not trap reading progress', () => {
  const base = fixture().props;
  const f = fixture({ session: { ...base.session, currentStopIndex: 1, completedStopIds: ['two'],
    manualStopIds: ['two'], readStopIds: ['one'] } });
  const read = buttons(f.tree).find(button => !button.insideScroll && button.label === 'I read the story · next →');
  assert.ok(read && !read.disabled, 'read command remains available despite old manual proof');
  assert.ok(visibleText(f.tree).includes('1/3 stories read'), 'only the explicitly read story is counted');
  read.onPress(); assert.deepEqual(f.calls, [['read_story', 'two']]);
});
test('ordinary current story still offers reading rather than premature finish', () => {
  const base = fixture().props;
  const f = fixture({ session: { ...base.session, currentStopIndex: 1, readStopIds: ['one'] } });
  const fixed = buttons(f.tree).filter(button => !button.insideScroll);
  assert.equal(fixed.some(button => button.label === base.walk.ending.confirmLabel), false);
  const read = fixed.find(button => button.label === 'I read the story · next →');
  assert.ok(read && !read.disabled); read.onPress(); assert.deepEqual(f.calls, [['read_story', 'two']]);
});
test('non-story flow retains its established inline confirmation', () => {
  const f = fixture({ storyOnly: false });
  const finish = buttons(f.tree).filter(button => button.label === f.props.walk.ending.confirmLabel);
  assert.equal(finish.length, 1); assert.equal(finish[0].insideScroll, true);
});
