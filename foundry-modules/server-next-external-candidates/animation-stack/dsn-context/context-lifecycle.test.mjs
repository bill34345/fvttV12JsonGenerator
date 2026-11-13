import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { dsnContextUpstream, patchDsnContextLifecycle } from './context-lifecycle.mjs';
import { buildDsnContextBundle } from './bundle.mjs';

const sourcePath = process.env.DSN_CONTEXT_SOURCE;
assert(sourcePath, 'Set DSN_CONTEXT_SOURCE to the pinned official module/Dice3D.js');
const source = await readFile(sourcePath, 'utf8');
const patched = patchDsnContextLifecycle(source);
const packageRoot = process.env.DSN_CONTEXT_OFFICIAL_PACKAGE;
assert(packageRoot, 'Set DSN_CONTEXT_OFFICIAL_PACKAGE to the extracted official 6.4.4 package');
const bundle = await readFile(`${packageRoot}/main.js`, 'utf8');
const sourceMapText = await readFile(`${packageRoot}/main.js.map`, 'utf8');

function actualResizeMethod(text) {
  const match = /\bresizeAndRebuild\(\)\s*\{/.exec(text);
  assert.ok(match);
  const start = match.index;
  let end = start + match[0].length;
  let braces = 1;
  while (braces && end < text.length) {
    if (text[end] === '{') braces++;
    if (text[end] === '}') braces--;
    end++;
  }
  assert.equal(braces, 0);
  return runInNewContext(`({ ${text.slice(start, end)} }).resizeAndRebuild`);
}

function makeHarness(method) {
  const liveContexts = new Set();
  const released = [];
  const disposed = [];
  const events = [];
  let nextContext = 0;
  const newRenderer = () => {
    const id = ++nextContext;
    liveContexts.add(id);
    return {
      id,
      dispose() { disposed.push(id); events.push(`dispose:${id}`); },
      forceContextLoss() { released.push(id); liveContexts.delete(id); events.push(`release:${id}`); }
    };
  };
  const unrelatedRenderer = { dispose() { assert.fail('Unrelated renderer disposed'); }, forceContextLoss() { assert.fail('Unrelated context lost'); } };
  const state = {
    dice3dRenderers: { board: newRenderer(), showcase: unrelatedRenderer },
    DiceFactory: { systems: new Map([['custom', { value: 'preserved' }]]), roleRegistry: { default: 'preserved' } },
    canvas: { remove() { events.push('remove'); } },
    _buildCanvas() { events.push('canvas'); },
    _buildDiceBox() {
      events.push('build');
      this.dice3dRenderers.board = newRenderer();
      this.DiceFactory = { systems: new Map(), roleRegistry: {} };
      this.box = makeBox();
    },
    resizeAndRebuild: method
  };
  function makeBox() {
    return { initialized: true, clearScene() { events.push('clear'); }, soundManager: { preloadSounds() { events.push('sounds'); } } };
  }
  state.box = makeBox();
  return { state, liveContexts, released, disposed, events, unrelatedRenderer };
}

test('locks the actual official Dice3D source', () => {
  assert.equal(createHash('sha256').update(source).digest('hex'), dsnContextUpstream.sourceSha256);
  assert.throws(() => patchDsnContextLifecycle(`${source}\n`), /pinned official/);
  assert.throws(() => patchDsnContextLifecycle(patched), /pinned official/);
});

test('actual unpatched resize method disposes resources but retains every old context', () => {
  const h = makeHarness(actualResizeMethod(source));
  for (let index = 0; index < 20; index++) h.state.resizeAndRebuild();
  assert.equal(h.disposed.length, 20);
  assert.equal(h.released.length, 0);
  assert.equal(h.liveContexts.size, 21);
});

test('actual patched resize method releases each replaced board context before creating its replacement', () => {
  const h = makeHarness(actualResizeMethod(patched));
  const systems = h.state.DiceFactory.systems;
  const roles = h.state.DiceFactory.roleRegistry;
  for (let index = 0; index < 20; index++) {
    const old = h.state.dice3dRenderers.board.id;
    h.state.resizeAndRebuild();
    assert.equal(h.liveContexts.size, 1);
    assert.ok(!h.liveContexts.has(old));
    assert.ok(h.liveContexts.has(h.state.dice3dRenderers.board.id));
    assert.equal(h.state.DiceFactory.systems, systems);
    assert.equal(h.state.DiceFactory.roleRegistry, roles);
    assert.equal(h.state.dice3dRenderers.showcase, h.unrelatedRenderer);
  }
  assert.deepEqual(h.disposed, h.released);
  assert.deepEqual(h.events.slice(0, 7), ['remove', 'dispose:1', 'release:1', 'clear', 'canvas', 'build', 'sounds']);
});

test('an uninitialized box still performs no teardown or rebuild', () => {
  const h = makeHarness(actualResizeMethod(patched));
  h.state.box.initialized = false;
  h.state.resizeAndRebuild();
  assert.deepEqual(h.events, []);
  assert.equal(h.liveContexts.size, 1);
});

test('source delta is only the explicit release of the replaced board renderer', () => {
  assert.equal(patched.replace('        this.dice3dRenderers.board.forceContextLoss();\n', ''), source);
  assert.equal((patched.match(/forceContextLoss\(/g) ?? []).length, 1);
});

test('generated candidate executes the same context release contract and changes no unrelated bundle bytes', () => {
  const built = buildDsnContextBundle(bundle, sourceMapText);
  assert.equal(built.bundle.replace(',this.dice3dRenderers.board.forceContextLoss()', ''), bundle);
  assert.equal(built.source, patched);
  assert.equal(built.adaptation.otherSourceContentsUnchanged, true);
  assert.ok(built.adaptation.preservedMappings > 200000);
  const h = makeHarness(actualResizeMethod(built.bundle));
  for (let index = 0; index < 20; index++) h.state.resizeAndRebuild();
  assert.equal(h.liveContexts.size, 1);
  assert.equal(h.released.length, 20);
  assert.equal(h.state.dice3dRenderers.showcase, h.unrelatedRenderer);
});

test('generated build rejects modified source-map or bundle inputs', () => {
  assert.throws(() => buildDsnContextBundle(`${bundle}\n`, sourceMapText), /pinned release/);
  assert.throws(() => buildDsnContextBundle(bundle, `${sourceMapText}\n`), /pinned release/);
});
