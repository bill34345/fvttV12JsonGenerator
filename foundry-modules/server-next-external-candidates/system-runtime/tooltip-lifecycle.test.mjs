import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import vm from 'node:vm';
import { patchTooltipLifecycle, readPinnedTooltipSource } from './tooltip-lifecycle.mjs';

const sourceRoot = process.env.SYSTEM_RUNTIME_SOURCE_ROOT
  ?? (process.env.FVTT_REFERENCE_CACHE_ROOT && join(process.env.FVTT_REFERENCE_CACHE_ROOT, 'dnd5e/6.0.6/repo'));
assert(sourceRoot, 'Set SYSTEM_RUNTIME_SOURCE_ROOT to the pinned dnd5e 6.0.6 checkout');
const originalSource = await readPinnedTooltipSource(sourceRoot);
const patchedSource = patchTooltipLifecycle(originalSource);

function deferred() {
  let resolve;
  const promise = new Promise(complete => { resolve = complete; });
  return { promise, resolve };
}

function classes(...initial) {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    contains: name => values.has(name),
    toggle: (name, enabled) => enabled ? values.add(name) : values.delete(name)
  };
}

function runtime(source, { loading=null, fromUuid=async () => undefined }={}) {
  const frames = [];
  const anchors = [];
  const tooltip = {
    innerHTML: 'existing tooltip',
    classList: classes('document-tooltip'),
    getBoundingClientRect: () => ({ x: 100, y: 100 }),
    offsetHeight: 40,
    offsetWidth: 80,
    ownerDocument: { defaultView: { innerHeight: 800, innerWidth: 1200 } },
    querySelector: selector => selector === '.loading' ? loading : null
  };
  const makeElement = (uuid='Item.first') => ({
    dataset: { uuid },
    classList: classes('content-link'),
    closest: () => ({ className: 'themed theme-light' }),
    ownerDocument: { body: { className: 'theme-light' } },
    getBoundingClientRect: () => ({ x: 100, y: 100 })
  });
  const manager = {
    element: makeElement(),
    deactivateCalls: 0,
    deactivate() { this.deactivateCalls++; this.element = null; },
    _setAnchor(direction) {
      this.element.getBoundingClientRect();
      anchors.push(direction);
    }
  };
  const context = vm.createContext({
    foundry: {
      helpers: { interaction: { TooltipManager: { implementation: {
        TOOLTIP_DIRECTIONS: { LEFT: 'LEFT', RIGHT: 'RIGHT', UP: 'UP', DOWN: 'DOWN' },
        TOOLTIP_MARGIN_PX: 10
      } } } },
      utils: { cleanHTML: value => `clean:${value}` }
    },
    game: { tooltip: manager },
    document: { getElementById: () => tooltip },
    dnd5e: { documents: { Actor5e: class Actor5e {} } },
    fromUuid,
    requestAnimationFrame: callback => frames.push(callback)
  });
  vm.runInContext(source.replace('export default class Tooltips5e', 'globalThis.Tooltips5e = class Tooltips5e'), context);
  return { tooltips: new context.Tooltips5e(), tooltip, manager, frames, anchors, makeElement };
}

test('source guard refuses an input other than the pinned upstream file', () => {
  assert.throws(() => patchTooltipLifecycle(`${originalSource}\n`), /does not match the pinned/);
});

test('original source reproduces the observed null dataset error after cancelled rich rendering', async () => {
  const pending = deferred();
  const run = runtime(originalSource);
  const rendering = run.tooltips._onHoverContentLink({ richTooltip: () => pending.promise });
  run.manager.element = null;
  pending.resolve({ content: 'obsolete item' });
  await assert.rejects(rendering, /Cannot read properties of null \(reading 'dataset'\)/);
});

test('original source reproduces the observed null anchor error on the next animation frame', async () => {
  const run = runtime(originalSource);
  await run.tooltips._onHoverContentLink({ richTooltip: () => ({ content: 'item' }) });
  run.manager.element = null;
  assert.throws(() => run.frames.shift()(), /Cannot read properties of null \(reading 'getBoundingClientRect'\)/);
});

test('cancelled rich rendering leaves current content and layout untouched', async () => {
  const pending = deferred();
  const run = runtime(patchedSource);
  const rendering = run.tooltips._onHoverContentLink({ richTooltip: () => pending.promise });
  run.manager.element = null;
  pending.resolve({ content: 'obsolete item', classes: ['obsolete-class'] });
  await rendering;
  assert.equal(run.tooltip.innerHTML, 'existing tooltip');
  assert.equal(run.tooltip.classList.contains('obsolete-class'), false);
  assert.equal(run.frames.length, 0);
  assert.deepEqual(run.anchors, []);
});

test('a previous rich rendering cannot overwrite the next hovered element', async () => {
  const pending = deferred();
  const run = runtime(patchedSource);
  const rendering = run.tooltips._onHoverContentLink({ richTooltip: () => pending.promise });
  run.manager.element = run.makeElement('Item.next');
  run.tooltip.innerHTML = 'next item';
  pending.resolve({ content: 'previous item' });
  await rendering;
  assert.equal(run.tooltip.innerHTML, 'next item');
  assert.equal(run.frames.length, 0);
});

for (const nextElement of ['cancelled', 'changed']) {
  test(`${nextElement} hover skips its already scheduled layout frame`, async () => {
    const run = runtime(patchedSource);
    await run.tooltips._onHoverContentLink({ richTooltip: () => ({ content: 'previous item' }) });
    assert.equal(run.frames.length, 1);
    run.manager.element = nextElement === 'cancelled' ? null : run.makeElement('Item.next');
    run.tooltip.innerHTML = 'next state';
    assert.doesNotThrow(() => run.frames.shift()());
    assert.deepEqual(run.anchors, []);
    assert.equal(run.tooltip.innerHTML, 'next state');
  });
}

test('a cancelled activation safely ignores a queued mutation callback', async () => {
  const run = runtime(patchedSource);
  run.manager.element = null;
  await run.tooltips._onTooltipActivate();
  assert.equal(run.tooltip.innerHTML, 'existing tooltip');
});

for (const kind of ['content-link', 'sheet-item']) {
  test(`a stale ${kind} UUID lookup does not start rendering the old document`, async () => {
    const lookup = deferred();
    let rendered = 0;
    const run = runtime(patchedSource, {
      loading: kind === 'sheet-item' ? { dataset: { uuid: 'Item.first' } } : null,
      fromUuid: () => lookup.promise
    });
    if (kind === 'sheet-item') run.manager.element.classList.remove('content-link');
    const activation = run.tooltips._onTooltipActivate();
    run.manager.element = run.makeElement('Item.next');
    lookup.resolve({ richTooltip() { rendered++; return { content: 'previous item' }; } });
    await activation;
    assert.equal(rendered, 0);
    assert.equal(run.tooltip.innerHTML, 'existing tooltip');
    assert.equal(run.frames.length, 0);
  });
}

test('normal rich tooltip retains sanitized extras, classes and direction layout', async () => {
  const run = runtime(patchedSource);
  let options;
  run.manager.element.dataset.tooltipDirection = 'DOWN';
  await run.tooltips._onHoverContentLink({ richTooltip(value) {
    options = value;
    return { content: 'current item', classes: ['dnd5e-tooltip'] };
  } }, { extras: 'details' });
  assert.equal(options.extras, 'clean:details');
  assert.equal(run.tooltip.innerHTML, 'current item');
  assert.equal(run.tooltip.classList.contains('dnd5e-tooltip'), true);
  run.frames.shift()();
  assert.deepEqual(run.anchors, ['DOWN']);
});

test('normal system-data richTooltip fallback retains default positioning', async () => {
  const run = runtime(patchedSource);
  await run.tooltips._onHoverContentLink({ system: { richTooltip: () => ({ content: 'system item' }) } });
  run.frames.shift()();
  assert.equal(run.tooltip.innerHTML, 'system item');
  assert.deepEqual(run.anchors, ['LEFT', 'LEFT']);
});

test('normal activation resolves and renders its current content link', async () => {
  let uuid;
  const run = runtime(patchedSource, { fromUuid: async value => {
    uuid = value;
    return { richTooltip: () => ({ content: 'resolved item' }) };
  } });
  await run.tooltips._onTooltipActivate();
  assert.equal(uuid, 'Item.first');
  assert.equal(run.tooltip.innerHTML, 'resolved item');
  run.frames.shift()();
  assert.deepEqual(run.anchors, ['LEFT', 'LEFT']);
});

test('missing document still deactivates the current tooltip', async () => {
  const run = runtime(patchedSource);
  await run.tooltips._onHoverContentLink(null);
  assert.equal(run.manager.deactivateCalls, 1);
});

test('a document without rich content does not change the tooltip', async () => {
  const run = runtime(patchedSource);
  await run.tooltips._onHoverContentLink({});
  assert.equal(run.tooltip.innerHTML, 'existing tooltip');
  assert.equal(run.frames.length, 0);
});
