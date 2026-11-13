import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { buildDsnContextBundle } from '../dsn-context/bundle.mjs';
import { buildDsnInitiativeBundle } from './bundle.mjs';
import { dsnInitiativeUpstream, flagMethod, patchInitiativeMask, pendingField } from './initiative-mask.mjs';

const packageRoot = process.env.DSN_CONTEXT_OFFICIAL_PACKAGE;
assert(packageRoot, 'Set DSN_CONTEXT_OFFICIAL_PACKAGE to the extracted official 6.4.4 package');
const bundle = await readFile(`${packageRoot}/main.js`, 'utf8');
const sourceMapText = await readFile(`${packageRoot}/main.js.map`, 'utf8');
const originalMap = JSON.parse(sourceMapText);
const original = originalMap.sourcesContent[originalMap.sources.indexOf(dsnInitiativeUpstream.sourcePath)];
const patched = patchInitiativeMask(original);
const candidate = process.env.DSN_INITIATIVE_TEST_ORIGINAL === '1' ? original : patched;

function harness(source) {
  const dom = new JSDOM('<section><ol></ol></section>');
  const root = dom.window.document.querySelector('section');
  const combatants = Array.from({ length: 6 }, (_, index) => ({ id: `c${index}`, tokenId: `t${index}`, actorId: `a${index}` }));
  const combat = { turns: [...combatants].reverse(), combatants };
  for (const combatant of combatants) combatant.parent = combat;
  const microtasks = [], timers = [], renders = [];
  let Mask;
  const context = {
    game: { combat }, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    queueMicrotask(callback) { microtasks.push(callback); },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    ui: { combat: { render() {
      root.querySelector('ol').innerHTML = combatants.map(c => `<li data-combatant-id="${c.id}"><span class="token-initiative">20</span></li>`).join('');
      Mask.apply(root);
      renders.push({ order: [...root.querySelectorAll('li')].map(row => row.dataset.combatantId),
        pending: root.querySelectorAll('.dsn-initiative-pending').length,
        icons: root.querySelectorAll('.dsn-initiative-pending-icon').length });
    } } }
  };
  Mask = runInNewContext(`${source.replace('export class InitiativeMask', 'class InitiativeMask')}\nInitiativeMask`, context);
  const messages = combatants.map((c, index) => ({ id: `m${index}`, speaker: { token: c.tokenId } }));
  return { Mask, root, combatants, combat, messages, microtasks, timers, renders, dom,
    flushMicrotasks() { for (const callback of microtasks.splice(0)) callback(); },
    flushTimers() { for (const { callback } of timers.splice(0)) callback(); } };
}

test('locks the exact original source and refuses reapplication or unknown input', () => {
  assert.equal(createHash('sha256').update(original).digest('hex'), dsnInitiativeUpstream.sourceSha256);
  assert.throws(() => patchInitiativeMask(`${original}\n`), /pinned official source/);
  assert.throws(() => patchInitiativeMask(patched), /pinned official source/);
});

test('original source redraws six full trackers for six synchronous initiative flags', () => {
  const h = harness(original);
  h.Mask.snapshot(h.combatants[0]);
  for (const message of h.messages) h.Mask.flag(message);
  assert.equal(h.renders.length, 6);
  assert.equal(h.microtasks.length, 0);
  assert.equal(h.renders.at(-1).pending, 6);
  h.dom.window.close();
});

test('six synchronous flags prepare every mask immediately and redraw once before paint', () => {
  const h = harness(candidate);
  h.Mask.snapshot(h.combatants[0]);
  for (const message of h.messages) h.Mask.flag(message);
  assert.equal(h.Mask._pendingCombatants.size, 6);
  assert.equal(h.Mask._messageToCombatant.size, 6);
  assert.equal(h.renders.length, 0, 'the pending batch must not queue six complete tracker renders');
  assert.equal(h.microtasks.length, 1);
  assert.equal(h.Mask._pendingSnapshot, null);
  h.flushMicrotasks();
  assert.equal(h.renders.length, 1);
  assert.deepEqual(h.renders[0], { order: ['c5', 'c4', 'c3', 'c2', 'c1', 'c0'], pending: 6, icons: 6 });
  assert.equal(h.Mask._flagRenderPending, false);
  h.dom.window.close();
});

test('a later microtask batch renders independently and preserves the first frozen snapshot', () => {
  const h = harness(candidate);
  h.Mask.snapshot(h.combatants[0]);
  const snapshot = h.Mask._pendingSnapshot;
  h.messages.slice(0, 3).forEach(message => h.Mask.flag(message));
  h.flushMicrotasks();
  h.combat.turns = h.combatants;
  h.Mask.snapshot(h.combatants[0]);
  h.messages.slice(3).forEach(message => h.Mask.flag(message));
  assert.equal(h.microtasks.length, 1);
  assert.equal(h.Mask._frozenOrder, snapshot);
  h.flushMicrotasks();
  assert.equal(h.renders.length, 2);
  assert.equal(h.renders[0].pending, 3);
  assert.equal(h.renders[1].pending, 6);
  assert.deepEqual(h.renders[1].order, ['c5', 'c4', 'c3', 'c2', 'c1', 'c0']);
  h.dom.window.close();
});

test('release retains the native 50ms coalescing and only the final release unfreezes order', () => {
  const h = harness(candidate);
  h.Mask.snapshot(h.combatants[0]);
  h.messages.forEach(message => h.Mask.flag(message));
  h.flushMicrotasks();
  for (const message of h.messages.slice(0, -1)) h.Mask.release(message.id);
  assert.equal(h.Mask._pendingCombatants.size, 1);
  assert.ok(h.Mask._frozenOrder);
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].delay, 50);
  h.Mask.release(h.messages.at(-1).id);
  assert.equal(h.Mask._frozenOrder, null);
  assert.equal(h.Mask._messageToCombatant.size, 0);
  assert.equal(h.timers.length, 1);
  h.flushTimers();
  assert.deepEqual(h.renders.at(-1), { order: ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'], pending: 0, icons: 0 });
  assert.equal(h.Mask._renderTimer, null);
  h.dom.window.close();
});

test('an immediate release before the microtask draws final state and preserves the native release timer', () => {
  const h = harness(candidate);
  h.Mask.snapshot(h.combatants[0]);
  h.Mask.flag(h.messages[0]);
  h.Mask.release(h.messages[0].id);
  assert.equal(h.renders.length, 0);
  assert.equal(h.microtasks.length, 1);
  h.flushMicrotasks();
  assert.equal(h.renders[0].pending, 0);
  assert.equal(h.Mask._frozenOrder, null);
  assert.equal(h.timers[0].delay, 50);
  h.flushTimers();
  assert.equal(h.renders.length, 2);
  h.dom.window.close();
});

test('unmatched messages and unknown releases schedule nothing; actor fallback remains supported', () => {
  const h = harness(candidate);
  h.Mask.flag({ id: 'unknown', speaker: { token: 'missing', actor: 'missing' } });
  h.Mask.release('unknown');
  assert.equal(h.microtasks.length, 0);
  assert.equal(h.timers.length, 0);
  assert.equal(h.renders.length, 0);
  h.Mask.flag({ id: 'actor-fallback', speaker: { actor: 'a0' } });
  assert.equal(h.Mask._pendingCombatants.has('c0'), true);
  h.flushMicrotasks();
  assert.equal(h.renders.length, 1);
  h.dom.window.close();
});

test('generated candidate embeds the actual patched method and preserves the existing context delta', () => {
  const context = buildDsnContextBundle(bundle, sourceMapText);
  const built = buildDsnInitiativeBundle(bundle, sourceMapText);
  assert.equal(built.source, patched);
  assert.equal(built.contextSource, context.source);
  assert.equal(built.bundle.replace(pendingField.trim(), '').replace(flagMethod(patched),
    context.bundle.slice(context.bundle.indexOf('static flag(i){'), context.bundle.indexOf('static release(i){'))), context.bundle);
  const classStart = built.bundle.indexOf('class InitiativeMask{');
  const classEnd = built.bundle.indexOf('class RollRules{', classStart);
  const h = harness(built.bundle.slice(classStart, classEnd));
  h.Mask.snapshot(h.combatants[0]);
  h.messages.forEach(message => h.Mask.flag(message));
  assert.equal(h.renders.length, 0);
  h.flushMicrotasks();
  assert.equal(h.renders.length, 1);
  assert.equal(h.renders[0].pending, 6);
  assert.ok(built.bundle.includes('this.dice3dRenderers.board.forceContextLoss()'));
  assert.equal(built.adaptation.otherSourceContentsUnchanged, true);
  h.dom.window.close();
});

test('generated source map retains exact unchanged anchors and maps the inserted method to real source', () => {
  const context = buildDsnContextBundle(bundle, sourceMapText);
  const built = buildDsnInitiativeBundle(bundle, sourceMapText);
  const { SourceMapConsumer } = createRequire(import.meta.resolve('handlebars'))('source-map');
  const before = new SourceMapConsumer(context.sourceMap);
  const after = new SourceMapConsumer(built.sourceMap);
  const generatedPosition = (text, offset) => { const lines = text.slice(0, offset).split('\n'); return { line: lines.length, column: lines.at(-1).length }; };
  for (const text of ['class InitiativeMask{', 'static _scheduleTrackerRender()', 'static release(i){', 'static apply(i){', 'class RollRules{', 'this.dice3dRenderers.board.forceContextLoss()']) {
    const a = before.originalPositionFor(generatedPosition(context.bundle, context.bundle.indexOf(text)));
    const b = after.originalPositionFor(generatedPosition(built.bundle, built.bundle.indexOf(text)));
    assert.equal(b.source, a.source, text);
    assert.equal(b.column, a.column, text);
    const shift = text.startsWith('static _schedule') ? 1 : text.startsWith('static release') || text.startsWith('static apply') ? 7 : 0;
    assert.equal(b.line, a.line + shift, text);
  }
  const offset = built.bundle.indexOf('queueMicrotask(');
  const actual = after.originalPositionFor(generatedPosition(built.bundle, offset));
  const expected = generatedPosition(patched, patched.indexOf('queueMicrotask('));
  assert.equal(actual.source, dsnInitiativeUpstream.sourcePath);
  assert.equal(actual.line, expected.line);
  assert.equal(actual.column, expected.column);
  before.destroy?.(); after.destroy?.();
});
