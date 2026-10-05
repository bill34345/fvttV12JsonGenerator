import { legacyNextInputPath } from '../../../tests/helpers/legacy-next-inputs.mjs';
import { beforeAll, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { loadPreparedWorkflowSource } from './helpers/real-workflow-source';
import { readPinnedDnd5eSource } from './helpers/pinned-dnd5e-source.mjs';

const sourceRoot = legacyNextInputPath(resolve(import.meta.dir, '../../../.local/midi-qol/source'));
const componentPath = 'src/module/ChatClasses/DamageApplicationElementMidi.ts';
const componentHash = '2cbe1f5e0892eda1977a568c51c2b586be1d1a81243c6254b0e2eda7d5eb17e3';
let ts: any, component: any, upstream: any, system: any;
const digest = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const one = (nodes: any[], label: string): any => {
  if (nodes.length !== 1) throw new Error(`Expected one ${label}; found ${nodes.length}`);
  return nodes[0];
};
const getClass = (file: any, name: string) => one(file.statements.filter((s: any) => ts.isClassDeclaration(s) && s.name?.text === name), name);
const getMember = (file: any, owner: string, name: string) => one(getClass(file, owner).members.filter((m: any) => m.name?.getText(file) === name), `${owner}.${name}`);
const member = (file: any, owner: string, name: string) => getMember(file, owner, name).getText(file);

beforeAll(async () => {
  const prepared = await loadPreparedWorkflowSource();
  ts = prepared.typescript;
  const current = (await readFile(resolve(sourceRoot, componentPath), 'utf8')).replaceAll('\r\n', '\n');
  expect(digest(current)).toBe(componentHash);
  const original = execFileSync('git', ['show', `${prepared.commit}:${componentPath}`], { cwd: sourceRoot, encoding: 'utf8' }).replaceAll('\r\n', '\n');
  component = ts.createSourceFile('component.ts', current, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  upstream = ts.createSourceFile('upstream.ts', original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const method = getMember(component, 'DamageApplicationElementMidi', 'buildTargetListEntry');
  const guard = method.body.statements[0];
  expect(ts.isIfStatement(guard)).toBe(true);
  expect(guard.expression.getText(component)).toContain('>= 6');
  const originalMethod = getMember(upstream, 'DamageApplicationElementMidi', 'buildTargetListEntry');
  // Preserve every original statement and every byte outside this method; a
  // separator blank line around the inserted guard is not a behavior change.
  expect(method.body.statements.slice(1).map((s: any) => s.getText(component)))
    .toEqual(originalMethod.body.statements.map((s: any) => s.getText(upstream)));
  // Patch 0006 also adds a separate manual-apply method to this class.
  const rawSystem = readPinnedDnd5eSource();
  system = ts.createSourceFile('dnd5e.mjs', rawSystem.toString('utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
});

// Minimal DOM/document boundaries; the list construction, native parent entry,
// native Apply loop and Midi calculation/entry methods below are actual source.
class ElementShim {
  children: any[] = []; dataset: Record<string, string> = {}; attrs: Record<string, string> = {};
  classes = new Set<string>(); classList = { add: (...names: string[]) => names.forEach(n => this.classes.add(n)) };
  textContent = ''; value = ''; title = ''; preview: any;
  constructor(public tagName: string) {}
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  getAttribute(k: string) { return this.attrs[k] ?? null; }
  toggleAttribute(k: string, enabled = true) { if (enabled) this.attrs[k] = ''; else delete this.attrs[k]; }
  append(...children: any[]) { this.children.push(...children); }
  replaceChildren(...children: any[]) { this.children = children; }
  insertAdjacentHTML(_where: string, html: string) {
    for (const tag of ['label', 'datalist']) if (html.includes(`<${tag}>`)) this.append(new ElementShim(tag));
  }
  querySelectorAll(tag: string): ElementShim[] {
    return this.children.flatMap(child => child instanceof ElementShim
      ? [...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag)] : []);
  }
  querySelector(tag: string) { return this.querySelectorAll(tag)[0] ?? null; }
}

function harness({ old = false, version = '6.0.2', localization = true } = {}) {
  const documents = new Map<string, any>();
  const scene = { id: 'viewed' }, otherScene = { id: 'other' };
  const canvas = { scene, tokens: { controlled: [] } };
  const createdTags: string[] = [];
  const document = { createElement: (tag: string) => { createdTags.push(tag); return new ElementShim(tag); } };
  class ActorShim {
    hp = 50; calls = 0; applies = 0; isOwner = true; activeTokens: any[] = []; fail = false;
    constructor(public uuid: string, public name = uuid) { documents.set(uuid, this); }
    getActiveTokens() { return this.activeTokens; }
    calculateDamage() {
      this.calls++;
      if (this.fail) throw new Error('genuine actor calculation failed');
      return Object.assign([{ type: 'slashing', value: 8, active: { type: {}, all: {} } }], { amount: 8, temp: 0, tempMax: 0 });
    }
    async applyDamage() { this.applies++; this.hp -= 8; }
  }
  class TokenShim {
    isOwner = true; actorLink = true; object: any;
    constructor(public uuid: string, public actor: any, public parent: any = scene, public name = uuid) {
      this.object = { document: this, actor, name }; documents.set(uuid, this);
    }
    getGroupingKey() { return this.actorLink ? this.actor.uuid : this.uuid; }
  }
  const game = { system: { version }, settings: { get: () => 'manual' }, i18n: localization ? { localize: (key: string) => key === 'DOCUMENT.Token' ? 'Token' : 'Unavailable' } : undefined };
  const foundry = { utils: { parseUuid: (uuid: string) => ({ primaryType: uuid?.split('.')[0] }), getType: (x: any) => x instanceof Set ? 'Set' : typeof x } };
  const names = ['fromUuidSync', 'Actor', 'TokenDocument', 'document', 'game', 'canvas', 'foundry', '_loc', 'isDnd5e53', 'TroubleShooter'];
  const values = [(uuid: string) => documents.get(uuid), ActorShim, TokenShim, document, game, canvas, foundry, (_: string, data: any) => data?.name ?? '', true,
    { recordError: () => { throw new Error('Unexpected swallowed damage error'); } }];
  const midiFile = old ? upstream : component;
  const code = `
    class TargetsField { ${member(system, 'TargetsField', 'resolve')} }
    class RecordedTargets {
      #lastTargets = new Set(); shouldBuildTargetList = true; targetingMode = 'targeted';
      targetList = document.createElement('ul'); targetGroups = {}; chatMessage = {system:{targets:[]}};
      dispatchEvent() {};
      ${member(system, 'RecordedTargetsElement', 'buildTargetsList')}
    }
    class NativeDamage {
      damages = []; chatMessage = {}; getMergedOptions() { return {multiplier:1}; }
      refreshListEntry(li, damage) { li.preview = damage; }
      #buildTargetPane() {} #buildTargetMenuEntry() {} #onClickTargetMenuEntry() {}
      ${member(system, 'DamageApplicationElement', '#getGroupingKey')}
      ${member(system, 'DamageApplicationElement', 'buildTargetListEntry')}
      ${member(system, 'DamageApplicationElement', '_onApplyDamage')}
    }
    class DamageApplicationElementMidi extends NativeDamage {
      ${member(midiFile, 'DamageApplicationElementMidi', 'SET_FLAGS')}
      ${member(midiFile, 'DamageApplicationElementMidi', 'SAVE_FLAGS')}
      ${member(midiFile, 'DamageApplicationElementMidi', 'BOOL_FLAGS')}
      #addInlineChangeSources() {} #changeSourceList() {} #changeSourceEntry() {}
      ${member(midiFile, 'DamageApplicationElementMidi', 'calculateDamage')}
      ${member(midiFile, 'DamageApplicationElementMidi', 'buildTargetListEntry')}
    }
  `;
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const { Damage, Targets } = new Function(...names, `${js}; return {Damage:DamageApplicationElementMidi, Targets:RecordedTargets};`)(...values);
  const damage = new Damage(), targets = new Targets();
  targets.onBuildTargetListEntry = damage.buildTargetListEntry.bind(damage);
  damage.targetList = targets.targetList;
  const render = (descriptors: any[]) => { targets.chatMessage.system.targets = descriptors; targets.buildTargetsList(); return targets.targetList.children as ElementShim[]; };
  return { Actor: ActorShim, Token: TokenShim, damage, targets, render, documents, canvas, scene, otherScene, createdTags };
}

test('actual native list handles off-scene Actor-only and orphan-token targets without blocking valid damage rows', async () => {
  const h = harness();
  const off = new h.Actor('Actor.off'), good = new h.Actor('Actor.good');
  const oldToken = new h.Token('Scene.other.Token.old', off, h.otherScene);
  const goodToken = new h.Token('Scene.viewed.Token.good', good);
  const orphan = new h.Token('Scene.viewed.Token.orphan', undefined);
  const rows = h.render([
    { actor: off.uuid, token: oldToken.uuid, name: 'Off-scene' },
    { actor: 'Actor.deleted', token: orphan.uuid, name: 'Orphan' },
    { actor: good.uuid, token: goodToken.uuid, name: 'Valid' },
  ]);
  expect(rows).toHaveLength(3);
  for (const row of rows.slice(0, 2)) {
    expect(row.getAttribute('aria-disabled')).toBe('true');
    expect(row.textContent).toContain('Unavailable');
    expect(row.preview).toBeUndefined();
    for (const tag of ['option', 'input', 'button']) expect(row.querySelectorAll(tag)).toEqual([]);
  }
  expect(rows[2]!.preview.total).toBe(8);
  expect(h.targets.targetList.querySelectorAll('option').map((n: ElementShim) => n.value)).toEqual([goodToken.uuid]);
  expect(off.calls).toBe(0); expect(good.calls).toBeGreaterThan(0);
  await h.damage._onApplyDamage({ preventDefault() {} });
  expect(off.hp).toBe(50); expect(off.applies).toBe(0);
  expect(good.hp).toBe(42); expect(good.applies).toBe(1);
});

test('viewing the original scene restores the exact available Token path without guessing another target', () => {
  const h = harness();
  const actor = new h.Actor('Actor.off');
  const token = new h.Token('Scene.other.Token.old', actor, h.otherScene);
  const descriptors = [{ actor: actor.uuid, token: token.uuid, name: 'Original' }];
  expect(h.render(descriptors)[0]!.getAttribute('aria-disabled')).toBe('true');
  h.canvas.scene = h.otherScene;
  const rows = h.render(descriptors);
  expect(rows[0]!.preview.total).toBe(8);
  expect(h.targets.targetList.querySelectorAll('option')[0]!.value).toBe(token.uuid);
});

test('unavailable names are text and no fallback target receives damage', async () => {
  const h = harness();
  const actor = new h.Actor('Actor.only');
  const name = '<img src=x onerror=alert(1)>';
  const row = h.render([{ actor: actor.uuid, name }])[0]!;
  expect(row.textContent).toContain(name);
  expect(h.createdTags).not.toContain('img');
  expect(h.targets.targetList.querySelectorAll('option')).toEqual([]);
  await h.damage._onApplyDamage({ preventDefault() {} });
  expect(actor.hp).toBe(50); expect(actor.applies).toBe(0);
});

test('a truly missing document produces a disabled row without a damage calculation', () => {
  const h = harness();
  const row = h.damage.buildTargetListEntry(h.targets, { uuid: 'Scene.deleted.Token.deleted', name: 'Deleted' });
  expect(row.getAttribute('aria-disabled')).toBe('true');
  expect(row.querySelectorAll('option')).toEqual([]);
});

test('unavailable rows remain readable if localization has not initialized', () => {
  const h = harness({ localization: false });
  const actor = new h.Actor('Actor.only');
  const rows = h.render([{ actor: actor.uuid, name: 'Only actor' }]);
  expect(rows[0]!.textContent).toBe('Only actor (Token: Unavailable)');
  expect(rows[0]!.querySelectorAll('option')).toEqual([]);
});

test('valid Actor damage calculation failures still propagate instead of becoming zero damage', () => {
  const h = harness();
  const actor = new h.Actor('Actor.bad'); actor.fail = true;
  const token = new h.Token('Scene.viewed.Token.bad', actor);
  expect(() => h.render([{ actor: actor.uuid, token: token.uuid, name: 'Bad calculation' }])).toThrow('genuine actor calculation failed');
});

test('5.x behavior is unchanged and does not use the new unavailable-target branch', () => {
  const h = harness({ version: '5.3.3' });
  const actor = new h.Actor('Actor.legacy');
  expect(() => h.render([{ actor: actor.uuid, name: 'Legacy' }])).toThrow('calculateDamage');
});

test('removing only patch 0003 reproduces the actual native parent calculateDamage failure', () => {
  const h = harness({ old: true });
  const actor = new h.Actor('Actor.off');
  const token = new h.Token('Scene.other.Token.off', actor, h.otherScene);
  expect(() => h.render([{ actor: actor.uuid, token: token.uuid, name: 'Off-scene' }])).toThrow('calculateDamage');
});
