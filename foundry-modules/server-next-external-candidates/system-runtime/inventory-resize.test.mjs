import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import vm from 'node:vm';
import { patchInventoryResize, readPinnedInventorySource } from './inventory-resize.mjs';

const sourceRoot = process.env.SYSTEM_RUNTIME_SOURCE_ROOT
  ?? (process.env.FVTT_REFERENCE_CACHE_ROOT && join(process.env.FVTT_REFERENCE_CACHE_ROOT, 'dnd5e/6.0.6/repo'));
assert(sourceRoot, 'Set SYSTEM_RUNTIME_SOURCE_ROOT to the pinned dnd5e 6.0.6 checkout');
const originalSource = (await readPinnedInventorySource(sourceRoot)).replaceAll('\r\n', '\n');
const patchedSource = patchInventoryResize(originalSource);
const candidateSource = process.env.SYSTEM_INVENTORY_TEST_ORIGINAL === '1' ? originalSource : patchedSource;

function runtime(source, { minWidth=200 }={}) {
  const observers = [], frames = [], writes = [];
  const sections = [];
  class ElementHost {
    isConnected = true;
    closest() { return { id: 'inventory-app' }; }
    querySelectorAll(selector) { return selector === '.items-section' ? sections : []; }
    querySelector() { return {}; }
  }
  class ActorHost { isOwner = true; pack = null; }
  const context = vm.createContext({
    foundry: { applications: { elements: { AdoptableHTMLElement: ElementHost },
      instances: new Map([['inventory-app', { document: new ActorHost() }]]) } },
    Actor: ActorHost,
    ContextMenu5e: class ContextMenuHost {},
    ResizeObserver: class ObserverHost {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(element) { this.target = element; }
    },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; }
  });
  vm.runInContext(source.replace(/^import .+;\n/gm, '')
    .replace('export default class InventoryElement', 'globalThis.InventoryElement = class InventoryElement'), context);
  const cells = {};
  for (const id of ['price', 'controls', 'quantity']) {
    const descriptor = context.InventoryElement.COLUMNS[id];
    cells[id] = Array.from({ length: 2 }, (_, row) => {
      const classes = new Set();
      return { dataset: { columnId: id, columnWidth: String(descriptor.width), columnPriority: String(descriptor.priority) },
        classList: {
          toggle(name, hidden) { writes.push({ id, row, name, hidden }); hidden ? classes.add(name) : classes.delete(name); },
          contains(name) { return classes.has(name); }
        } };
    });
  }
  sections.push({ dataset: { columnMinWidth: String(minWidth) },
    querySelectorAll(selector) {
      return selector === '.items-header [data-column-id]' ? Object.values(cells).map(rows => rows[0])
        : Object.values(cells).flat();
    } });
  const element = new context.InventoryElement();
  element.connectedCallback();
  return { element, observers, frames, writes,
    notify(inlineSize) { observers[0].callback([{ borderBoxSize: [{ inlineSize }] }], observers[0]); },
    flushFrame() { for (const callback of frames.splice(0)) callback(); },
    hidden(id) { return cells[id].map(cell => cell.classList.contains('hidden-width')); }
  };
}

test('source guard refuses a file other than the pinned upstream inventory', () => {
  assert.throws(() => patchInventoryResize(`${originalSource}\n`), /does not match the pinned/);
});

test('the source transform changes only the observer callback binding', () => {
  assert.equal(patchedSource.replace(
    'new ResizeObserver(entries => requestAnimationFrame(() => this._onResize(entries)))',
    'new ResizeObserver(this._onResize.bind(this))'
  ), originalSource);
});

test('original observer synchronously writes header and row column visibility', () => {
  const run = runtime(originalSource);
  run.notify(400);
  assert.equal(run.writes.length, 6);
  assert.deepEqual(run.hidden('controls'), [false, false]);
  assert.deepEqual(run.hidden('quantity'), [false, false]);
  assert.deepEqual(run.hidden('price'), [true, true]);
  assert.equal(run.frames.length, 0);
});

test('candidate callback defers layout writes for one frame and retains column priority', () => {
  const run = runtime(candidateSource);
  run.notify(400);
  assert.equal(run.writes.length, 0, 'ResizeObserver delivery must not synchronously change column layout');
  assert.equal(run.frames.length, 1);
  run.flushFrame();
  assert.deepEqual(run.hidden('controls'), [false, false]);
  assert.deepEqual(run.hidden('quantity'), [false, false]);
  assert.deepEqual(run.hidden('price'), [true, true]);
});

test('narrowing and widening preserve upstream header and row visibility after each frame', () => {
  const run = runtime(candidateSource);
  run.notify(400); run.flushFrame();
  run.writes.length = 0;
  run.notify(200);
  assert.equal(run.writes.length, 0);
  assert.deepEqual(run.hidden('controls'), [false, false]);
  run.flushFrame();
  for (const id of ['controls', 'quantity', 'price']) assert.deepEqual(run.hidden(id), [true, true]);
  run.writes.length = 0;
  run.notify(500);
  assert.equal(run.writes.length, 0);
  run.flushFrame();
  for (const id of ['controls', 'quantity', 'price']) assert.deepEqual(run.hidden(id), [false, false]);
});

test('a custom section minimum width still governs column visibility', () => {
  const run = runtime(candidateSource, { minWidth: 300 });
  run.notify(400); run.flushFrame();
  assert.deepEqual(run.hidden('controls'), [false, false]);
  assert.deepEqual(run.hidden('quantity'), [true, true]);
  assert.deepEqual(run.hidden('price'), [true, true]);
});

test('a queued resize is safe while detached and the original observer works after reconnect', () => {
  const run = runtime(candidateSource);
  run.notify(400);
  run.element.isConnected = false;
  assert.doesNotThrow(() => run.flushFrame());
  assert.deepEqual(run.hidden('price'), [true, true]);
  run.element.isConnected = true;
  run.element.connectedCallback();
  assert.equal(run.observers.length, 1, 'upstream one-time connection must retain its existing observer');
  assert.equal(run.observers[0].target, run.element);
  run.notify(500);
  assert.equal(run.frames.length, 1);
  run.flushFrame();
  for (const id of ['controls', 'quantity', 'price']) assert.deepEqual(run.hidden(id), [false, false]);
});
