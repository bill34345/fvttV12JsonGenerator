import { afterEach, beforeEach, expect, test } from 'bun:test';

// This macro intentionally runs against browser globals. Restore their exact
// descriptors so later suites cannot mistake this mock world for a live client.
const fixtureGlobals = ['game', 'canvas', 'fromUuid', 'ChatMessage', 'Scene', 'Actor', 'Combat',
  'WMP_E2E', '__midiUse', '__FVTT_WMP_DAMAGE_DIAGNOSTICS__', '__FVTT_WMP_DAMAGE_DIAGNOSTICS_LOG__'];
let originalGlobals: Array<[string, PropertyDescriptor | undefined]> = [];
beforeEach(() => {
  originalGlobals = fixtureGlobals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
});
afterEach(() => {
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test('combat preparation creates one linked encounter and reuses it without touching the original', async () => {
  const fixture = world();
  const initial = await fixture.api.ensureBatch({ runId: 'WMP-E2E-COMBAT1', expectedEnabledModules: fixture.enabledModules,
    expectedBuildId: 'build-123', weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const ledger = initial.ledger;
  const scene = fixture.scenes.get(ledger.sceneId);
  expect(scene).toMatchObject({ tokenVision: true,
    environment: { darknessLevel: 0, globalLight: { enabled: true, bright: true } } });
  for (const role of ['source', 'target', 'secondary']) {
    expect(scene.tokens.get(ledger.tokenIds[role])).toMatchObject({ sight: { enabled: true, range: 60 } });
  }
  scene.activate = async () => { (fixture.scenes as any).active = scene; };
  scene.view = async () => {};
  let creates = 0;
  (globalThis as any).Combat = { create: async (data: any) => {
    creates++;
    const combat = fixture.createTaskCombat(data.scene, data.combatants.map((entry: any) => entry.tokenId));
    combat.flags = data.flags;
    combat.activate = async () => { (globalThis as any).game.combat = combat; };
    combat.startCombat = async () => { combat.started = true; };
    return combat;
  } };
  const first = await fixture.api.prepareCombat({ ledgerMessageId: ledger.messageId });
  const second = await fixture.api.prepareCombat({ ledgerMessageId: ledger.messageId });
  expect(first).toMatchObject({ status: 'combat-ready', sceneId: ledger.sceneId });
  expect(second.combatId).toBe(first.combatId);
  expect(creates).toBe(1);
  expect(first.combatId).not.toBe(fixture.originalCombat.id);
  expect(fixture.combats.has(fixture.originalCombat.id)).toBe(true);
});

test('case preparation uses a hard-to-hit target for Graze and a real test-weapon critical threshold for Fatal', async () => {
  for (const scenario of ['graze', 'fatal']) {
    const fixture = world();
    const initial = await fixture.api.ensureBatch({ runId: `WMP-E2E-PREP${scenario.toUpperCase()}`,
      expectedEnabledModules: fixture.enabledModules, expectedBuildId: 'build-123',
      weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push', [scenario]: `Item.${scenario}` },
      propertyRules: { fatal: { ruleId: 'house.fatal', kind: 'fatal', label: 'Fatal', params: { die: 10 }, stackingGroup: 'house.fatal' } } });
    const ledger = initial.ledger;
    const combat = fixture.createTaskCombat(ledger.sceneId, Object.values(ledger.tokenIds));
    await fixture.api.registerCombat({ ledgerMessageId: ledger.messageId, combatId: combat.id });
    (fixture.scenes as any).active = fixture.scenes.get(ledger.sceneId);
    (globalThis as any).game.combat = combat;
    const reset = await fixture.api.resetCase({ ledgerMessageId: ledger.messageId, scenario });
    expect(reset.before.target.ac.value).toBe(scenario === 'graze' ? 99 : 1);
    expect(reset.before.source.abilities.str.value).toBe(16);
    if (scenario === 'fatal') expect(fixture.actors.get(ledger.actorIds.source).items.get(ledger.itemIds.fatal).lastUpdate)
      .toEqual({ 'system.activities.attack-fatal.attack.critical.threshold': 2 });
  }
});

test('Cleave preparation validates real reach, uses a non-overlapping Large source, and restores size for other cases', async () => {
  const fixture = world();
  const initial = await fixture.api.ensureBatch({ runId: 'WMP-E2E-CLEAVEGEOMETRY',
    expectedEnabledModules: fixture.enabledModules, expectedBuildId: 'build-123',
    weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push', cleave: 'Item.cleave' } });
  const ledger = initial.ledger;
  const scene = fixture.scenes.get(ledger.sceneId);
  const combat = fixture.createTaskCombat(scene.id, Object.values(ledger.tokenIds));
  await fixture.api.registerCombat({ ledgerMessageId: ledger.messageId, combatId: combat.id });
  (fixture.scenes as any).active = scene;
  (globalThis as any).game.combat = combat;
  (globalThis as any).canvas = { scene, dimensions: { size: 100 }, grid: { diagonals: 1,
    measurePath: ([a, b]: any[]) => {
      const dx = Math.abs(a.x - b.x) / 100;
      const dy = Math.abs(a.y - b.y) / 100;
      return { distance: (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * 5 };
    } } };
  await scene.tokens.get(ledger.tokenIds.source).update({ x: 500, y: 400 });
  await scene.tokens.get(ledger.tokenIds.target).update({ x: 600, y: 400 });
  await scene.tokens.get(ledger.tokenIds.secondary).update({ x: 600, y: 500 });
  const invalid = fixture.api.snapshot({ ledgerMessageId: ledger.messageId, scenario: 'cleave' });
  expect(invalid.preflight.ok).toBeFalse();
  expect(invalid.preflight.reasons).toContain('cleave-secondary-outside-reach-or-distance');
  expect(invalid.cleaveGeometry.sourceToSecondaryFeet).toBeCloseTo(7.0710678118654755);
  const reset = await fixture.api.resetCase({ ledgerMessageId: ledger.messageId, scenario: 'cleave' });
  expect(reset.before.source.size).toBe('lg');
  expect(reset.before.source.token).toMatchObject({ x: 400, y: 400, width: 2, height: 2 });
  expect(reset.before.cleaveGeometry).toMatchObject({ legal: true, reachFeet: 5,
    sourceToSecondaryFeet: 5, primaryToSecondaryFeet: 5 });
  expect(reset.before.preflight.ok).toBeTrue();
  const stored = fixture.messages.get(ledger.messageId).getFlag('fvtt-weapon-mastery-properties', 'e2eFixture').ledger;
  stored.activeCase = null;
  stored.cases.cleave.status = 'exported';
  const next = await fixture.api.resetCase({ ledgerMessageId: ledger.messageId, scenario: 'slow' });
  expect(next.before.source.size).toBe('med');
  expect(next.before.source.token).toMatchObject({ x: 500, y: 400, width: 1, height: 1 });
  (globalThis as any).canvas.grid.measurePath = () => { throw new Error('grid unavailable'); };
  const unavailable = fixture.api.snapshot({ ledgerMessageId: ledger.messageId, scenario: 'cleave' });
  expect(unavailable.preflight.ok).toBeFalse();
  expect(unavailable.preflight.reasons).toContain('cleave-geometry-unavailable');
});

test('case reset deletes previous attack checkpoints under Foundry recursive flag merging', async () => {
  const fixture = world();
  const initial = await fixture.api.ensureBatch({ runId: 'WMP-E2E-RESETMERGE', expectedBuildId: 'build-123',
    expectedEnabledModules: fixture.enabledModules, weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const ledger = initial.ledger;
  const scene = fixture.scenes.get(ledger.sceneId);
  const combat = fixture.createTaskCombat(scene.id, Object.values(ledger.tokenIds));
  await fixture.api.registerCombat({ ledgerMessageId: ledger.messageId, combatId: combat.id });
  (fixture.scenes as any).active = scene;
  (globalThis as any).game.combat = combat;
  const message = fixture.messages.get(ledger.messageId);
  const namespace = 'fvtt-weapon-mastery-properties';
  const prefix = `flags.${namespace}.e2eFixture`;
  const oldCase = { status: 'exported', primaryAttackId: 'old-attack', primaryAttackMessageId: 'old-message',
    primaryAfter: { buildIdentity: { observedBuildId: 'old-build' } }, primaryDamageUnattributed: true,
    receipt: { marker: 'old-external-evidence-saved' }, observedEffect: { id: 'old-effect' } };
  message.flags[namespace].e2eFixture.ledger.cases.slow = structuredClone(oldCase);
  let persisted = structuredClone(message.flags[namespace].e2eFixture);
  // Foundry merges nested flag objects against persisted data, not a JS assignment.
  function merge(target: any, patch: any): any {
    for (const [key, value] of Object.entries(patch)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) target[key] = merge(target[key] ?? {}, value);
      else target[key] = structuredClone(value);
    }
    return target;
  }
  message.update = async (patch: any) => {
    persisted = merge(persisted, patch[prefix]);
    for (const [key] of Object.entries(patch)) {
      if (!key.startsWith(`${prefix}.`) || !key.includes('.-=')) continue;
      const parts = key.slice(prefix.length + 1).split('.');
      const deletion = parts.pop()!;
      const holder = parts.reduce((value, part) => value?.[part], persisted);
      if (holder) delete holder[deletion.slice(2)];
    }
    message.flags[namespace].e2eFixture = structuredClone(persisted);
  };
  await fixture.api.resetCase({ ledgerMessageId: ledger.messageId, scenario: 'slow' });
  const reset = message.flags[namespace].e2eFixture.ledger.cases.slow;
  expect(reset.status).toBe('reset');
  expect(reset.before.buildIdentity.status).toBe('PASS');
  for (const key of ['primaryAttackId', 'primaryAttackMessageId', 'primaryAfter', 'primaryDamageUnattributed', 'receipt', 'observedEffect']) {
    expect(Object.hasOwn(reset, key)).toBeFalse();
  }
  expect(oldCase.receipt.marker).toBe('old-external-evidence-saved');
});

test('explicit build adoption preserves fixtures and prior receipts but rejects unfinished work', async () => {
  const fixture = world();
  const initial = await fixture.api.ensureBatch({ runId: 'WMP-E2E-UPGRADE1', expectedEnabledModules: fixture.enabledModules,
    expectedBuildId: 'build-123', weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const ledgerMessageId = initial.ledger.messageId;
  const ledger = fixture.messages.get(ledgerMessageId).flags['fvtt-weapon-mastery-properties'].e2eFixture.ledger;
  ledger.cases = { slow: { status: 'exported', receipt: { buildIdentity: { observedBuildId: 'build-123' }, marker: 'old-evidence' } } };
  const ids = JSON.stringify({ scene: ledger.sceneId, actors: ledger.actorIds, items: ledger.itemIds });
  (globalThis as any).game.modules.get('fvtt-weapon-mastery-properties').api.buildId = 'build-456';
  await expect(fixture.api.ensureBatch({ ledgerMessageId, expectedBuildId: 'build-456' })).rejects.toThrow('differs');
  await expect(fixture.api.adoptBuild({ ledgerMessageId, expectedBuildId: 'build-456' })).rejects.toThrow('Save');
  ledger.activeCase = 'slow';
  await expect(fixture.api.adoptBuild({ ledgerMessageId, expectedBuildId: 'build-456', receiptsSaved: true })).rejects.toThrow('active case');
  ledger.activeCase = null;
  expect(await fixture.api.adoptBuild({ ledgerMessageId, expectedBuildId: 'build-456', receiptsSaved: true }))
    .toMatchObject({ status: 'build-adopted', fixturesRetained: true });
  const resumed = await fixture.api.ensureBatch({ ledgerMessageId, expectedBuildId: 'build-456' });
  expect(JSON.stringify({ scene: resumed.ledger.sceneId, actors: resumed.ledger.actorIds, items: resumed.ledger.itemIds })).toBe(ids);
  expect(ledger.cases.slow.receipt.marker).toBe('old-evidence');
  expect(ledger.buildHistory[0]).toMatchObject({ from: 'build-123', to: 'build-456' });
});
import { classifyWeaponEvidence } from '../e2e/evidence.ts';

const source = await Bun.file(new URL('../e2e/fixture-macro.js', import.meta.url)).text();

function world() {
  let counter = 0;
  const next = () => `e2e${String(++counter).padStart(13, '0')}`;
  const withCollection = <T extends { id: string }>() => {
    const map = new Map<string, T>();
    Object.defineProperty(map, 'contents', { get: () => [...map.values()] });
    return map;
  };
  const scenes = withCollection<any>();
  const actors = withCollection<any>();
  const messages = withCollection<any>();
  const combats = withCollection<any>();
  const original = { id: 'original-scene' };
  const originalCombat = { id: 'original-combat', scene: original, round: 1, turn: 0 };
  combats.set(originalCombat.id, originalCombat);
  let activeScene: any = original;
  scenes.set(original.id, original);
  Object.defineProperty(scenes, 'active', { get: () => activeScene, set: (value) => { activeScene = value; } });
  const modules = withCollection<any>();
  const moduleIds = ['fvtt-weapon-mastery-properties', 'fvtt-custom-conditions', 'fvtt-trigger-engine', 'midi-qol'];
  moduleIds.forEach((id) => modules.set(id, { id, version: id === 'midi-qol' ? '14.0.11' : '0.1.1', active: true }));
  const sourceItems = Object.fromEntries(['cleave', 'graze', 'nick', 'push', 'sap', 'slow', 'topple', 'vex', 'deadly', 'fatal', 'criticalBleeding'].map((kind) => [`Item.${kind}`, {
    id: kind, uuid: `Item.${kind}`, type: 'weapon', name: `${kind} source`,
    system: { range: { reach: 5, units: 'ft' }, activities: [{ _id: `attack-${kind}`, type: 'attack' }] },
    toObject() { return { name: this.name, type: 'weapon', system: structuredClone(this.system), flags: {} }; },
  }]));
  function flags(document: any) {
    document.getFlag = (namespace: string, key: string) => document.flags?.[namespace]?.[key];
    return document;
  }
  (globalThis as any).game = {
    world: { id: 'cor-cotn' }, version: '14.364', system: { id: 'dnd5e', version: '5.3.3' },
    user: { id: 'gm', isGM: true, active: true }, users: { activeGM: { id: 'gm' } },
    modules, scenes, actors, messages, combats, combat: originalCombat,
  };
  (globalThis as any).__midiUse = undefined;
  modules.get('midi-qol').api = {
    async completeActivityUse(...args: any[]) {
      return (globalThis as any).__midiUse ? (globalThis as any).__midiUse(...args) : { id: 'workflow-default' };
    },
  };
  modules.get('fvtt-weapon-mastery-properties').api = {
    buildId: 'build-123',
    async configure(item: any, configuration: any) {
      item.flags['fvtt-weapon-mastery-properties'] ??= {};
      item.flags['fvtt-weapon-mastery-properties'].weapon = structuredClone(configuration);
      return configuration;
    },
    configuration(item: any) { return item.flags?.['fvtt-weapon-mastery-properties']?.weapon; },
    async use(activity: any) { return { attackId: 'actual-attack', status: 'pending', settlements: [], results: { activityId: activity.id } }; },
  };
  (globalThis as any).canvas = { scene: original };
  (globalThis as any).fromUuid = async (uuid: string) => (sourceItems as any)[uuid];
  (globalThis as any).ChatMessage = class {
    static async create(data: any) {
      const message = flags({ ...data, id: next(), timestamp: Date.now(),
        async setFlag(namespace: string, key: string, value: unknown) {
          this.flags[namespace] ??= {};
          this.flags[namespace][key] = structuredClone(value);
        },
        async update(patch: any) {
          this.flags['fvtt-weapon-mastery-properties'].e2eFixture = structuredClone(patch['flags.fvtt-weapon-mastery-properties.e2eFixture']);
          this.content = patch.content;
        },
        async delete() { messages.delete(this.id); },
      });
      messages.set(message.id, message);
      return message;
    }
  };
  (globalThis as any).Scene = class {
    static async create(data: any) {
      const scene = flags({ ...data, id: next(), tokens: withCollection<any>(), walls: withCollection<any>(),
        async createEmbeddedDocuments(_type: string, specs: any[]) {
          return specs.map((spec) => {
            const token = flags({ ...spec, id: next(), uuid: `Scene.${scene.id}.Token.${counter}`,
              width: 1, height: 1, elevation: 0,
              async update(patch: any) { Object.assign(this, patch); },
              get actor() { return this.actorLink ? actors.get(this.actorId) : { id: this.actorId, synthetic: true }; } });
            scene.tokens.set(token.id, token);
            return token;
          });
        },
        async delete() { scenes.delete(this.id); },
      });
      scenes.set(scene.id, scene);
      return scene;
    }
  };
  (globalThis as any).Actor = class {
    static async create(data: any) {
      const actorId = next();
      const actor = flags({ ...data, id: actorId, uuid: `Actor.${actorId}`, items: withCollection<any>(), effects: withCollection<any>(),
        async deleteEmbeddedDocuments(kind: string, ids: string[]) {
          if (kind === 'ActiveEffect') {
            for (const id of ids) this.effects.delete(id);
            this.system.attributes.movement.walk = 30;
          }
        },
        async update(patch: any) {
          if ('system.traits.size' in patch) this.system.traits.size = patch['system.traits.size'];
          if ('system.attributes.hp.value' in patch) this.system.attributes.hp.value = patch['system.attributes.hp.value'];
          if ('system.attributes.hp.temp' in patch) this.system.attributes.hp.temp = patch['system.attributes.hp.temp'];
          if ('system.attributes.ac.flat' in patch) this.system.attributes.ac.flat = this.system.attributes.ac.value = patch['system.attributes.ac.flat'];
          for (const ability of ['str', 'dex']) if (`system.abilities.${ability}.value` in patch) {
            this.system.abilities ??= {};
            this.system.abilities[ability] = { value: patch[`system.abilities.${ability}.value`] };
          }
        },
        async createEmbeddedDocuments(_type: string, specs: any[]) {
          return specs.map((spec) => {
            const itemId = next();
            const item = flags({ ...spec, id: itemId, uuid: `Actor.${actor.id}.Item.${itemId}`,
              async update(patch: any) { this.lastUpdate = patch; } });
            actor.items.set(item.id, item);
            return item;
          });
        },
        async delete() { actors.delete(this.id); },
      });
      actor.system.attributes.ac.value = actor.system.attributes.ac.flat;
      actors.set(actor.id, actor);
      return actor;
    }
  };
  new Function(source)();
  function createTaskCombat(sceneId: string, tokenIds: string[]) {
    const combat = flags({ id: next(), scene: scenes.get(sceneId), round: 1, turn: 0,
      combatants: tokenIds.map((tokenId) => ({ tokenId })), turns: tokenIds.map((tokenId) => ({ tokenId })), flags: {},
      get combatant() { return this.turns[this.turn]; },
      async update(patch: any) { Object.assign(this, patch); },
      async setFlag(namespace: string, key: string, value: unknown) {
        this.flags[namespace] ??= {};
        this.flags[namespace][key] = structuredClone(value);
      },
      async delete() { combats.delete(this.id); },
    });
    combats.set(combat.id, combat);
    return combat;
  }
  return { api: (globalThis as any).WMP_E2E, scenes, actors, messages, combats, originalCombat, createTaskCombat,
    enabledModules: moduleIds.map((id) => ({ id, version: id === 'midi-qol' ? '14.0.11' : '0.1.1' })), sourceItems };
}

test('rejects a mismatched full module baseline before creating documents', async () => {
  const fixture = world();
  await expect(fixture.api.create({ runId: 'WMP-E2E-FIRST01', expectedEnabledModules: [{ id: 'midi-qol', version: '14.0.11' }],
    weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } })).rejects.toThrow('Environment mismatch');
  expect(fixture.messages.size).toBe(0);
  expect(fixture.scenes.size).toBe(1);
});

test('creates exact-ID ledger and readback, then cleans only owned documents', async () => {
  const fixture = world();
  const receipt = await fixture.api.create({ runId: 'WMP-E2E-SECOND01', expectedEnabledModules: fixture.enabledModules,
    weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const ledgerMessageId = receipt.ledger.messageId;
  expect(receipt.preflight.ok).toBe(false);
  expect(receipt.preflight.reasons).toContain('fixture-scene-not-active');
  expect(receipt.preflight.reasons).toContain('task-combat-not-registered-active');
  const taskCombat = fixture.createTaskCombat(receipt.ledger.sceneId, Object.values(receipt.ledger.tokenIds));
  const registration = await fixture.api.registerCombat({ ledgerMessageId, combatId: taskCombat.id });
  expect(registration.ownerMarker).toEqual({ runId: receipt.runId, role: 'combat' });
  (fixture.scenes as any).active = fixture.scenes.get(receipt.ledger.sceneId);
  (globalThis as any).game.combat = taskCombat;
  const activeReceipt = fixture.api.snapshot({ ledgerMessageId, scenario: 'vex' });
  expect(activeReceipt.preflight.ok).toBe(true);
  expect(activeReceipt.source.token).toMatchObject({ actorLink: true, linkedActorId: receipt.ledger.actorIds.source });
  expect(activeReceipt.target.token).toMatchObject({ actorLink: true, linkedActorId: receipt.ledger.actorIds.target });
  const taskScene = fixture.scenes.get(receipt.ledger.sceneId);
  const playedTarget = taskScene.tokens.get(receipt.ledger.tokenIds.target).actor;
  playedTarget.system.attributes.hp.value = 191;
  playedTarget.effects.set('effect-from-play', { id: 'effect-from-play', name: 'Slow', flags: {} });
  const afterPlay = fixture.api.snapshot({ ledgerMessageId, scenario: 'slow' });
  expect(afterPlay.target.hpValue).toBe(191);
  expect(afterPlay.target.effects.map((effect: any) => effect.id)).toContain('effect-from-play');
  expect(receipt.environment.observed.enabledModuleVersions['midi-qol']).toBe('14.0.11');
  expect(receipt.source.weapon.configuration).toMatchObject({ mastery: 'dnd2024.vex', grantMastery: true });
  expect(receipt.target.ac.value).toBe(1);
  expect(receipt.target.hpValue).toBe(200);
  expect(receipt.target.tempHp).toBe(0);
  expect(activeReceipt.activeTurnKey).toBe(`Combat.${taskCombat.id}:1:0`);
  expect(receipt.ledger.originalActiveSceneId).toBe('original-scene');
  const push = fixture.api.snapshot({ ledgerMessageId, scenario: 'push' });
  expect(push.preflight.ok).toBe(true);
  expect(push.pushDestination).toMatchObject({ x: 800, y: 400, distanceFeet: 10, collisionClear: true });
  expect(fixture.messages.get(ledgerMessageId).content).toContain(receipt.ledger.sceneId);

  const attackMessage = await (globalThis as any).ChatMessage.create({
    content: 'task attack', flags: { dnd5e: { actor: { uuid: receipt.source.actorUuid } } },
  });
  const unrelatedMessage = await (globalThis as any).ChatMessage.create({
    content: 'unrelated', flags: { dnd5e: { actor: { uuid: 'Actor.unrelated' } } },
  });
  expect(await fixture.api.captureChatMessages({ ledgerMessageId })).toEqual([attackMessage.id]);
  expect(attackMessage.getFlag('fvtt-weapon-mastery-properties', 'e2eFixture'))
    .toEqual({ runId: receipt.runId, role: 'attack-message' });

  const unrelated = { id: 'unrelated', flags: {}, async delete() { throw new Error('unrelated deleted'); } };
  fixture.actors.set(unrelated.id, unrelated);
  (fixture.scenes as any).active = fixture.scenes.get('original-scene');
  (globalThis as any).game.combat = fixture.originalCombat;
  const cleaned = await fixture.api.cleanup({ ledgerMessageId });
  expect(cleaned.status).toBe('cleaned');
  expect(fixture.scenes.has(receipt.ledger.sceneId)).toBe(false);
  expect(fixture.combats.has(taskCombat.id)).toBe(false);
  expect(cleaned.originalActiveCombatRestored).toBe(true);
  expect(cleaned.combatUsed).toBe(true);
  expect(cleaned.registeredCombatId).toBe(taskCombat.id);
  expect(cleaned.entries.find((entry: any) => entry.id === taskCombat.id)).toMatchObject({
    kind: 'combat', ownerMarker: { runId: receipt.runId, role: 'combat' },
    ownershipVerified: true, absentAfterCleanup: true,
  });
  expect(fixture.actors.has(receipt.ledger.actorIds.source)).toBe(false);
  expect(fixture.actors.has(unrelated.id)).toBe(true);
  expect(fixture.messages.has(attackMessage.id)).toBe(false);
  expect(fixture.messages.has(unrelatedMessage.id)).toBe(true);
  expect(fixture.messages.has(ledgerMessageId)).toBe(true);
  expect(cleaned.entries.find((entry: any) => entry.id === attackMessage.id)).toMatchObject({
    ownershipVerified: true, absentAfterCleanup: true,
    ownerMarker: { runId: receipt.runId, role: 'attack-message' },
  });
  expect(cleaned.expectedChatMessageIds).toEqual([attackMessage.id]);
  expect(cleaned.skippedIds).toEqual([]);
  await expect(fixture.api.finalize({ ledgerMessageId })).rejects.toThrow('external cleanup receipt');
  expect((await fixture.api.finalize({ ledgerMessageId, externalReceiptSaved: true })).status).toBe('finalized');
  expect(fixture.messages.has(ledgerMessageId)).toBe(false);
});

test('refuses cleanup when an exact ledger ID points to a document without its run flag', async () => {
  const fixture = world();
  const receipt = await fixture.api.create({ runId: 'WMP-E2E-THIRD01', expectedEnabledModules: fixture.enabledModules,
    weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const taskCombat = fixture.createTaskCombat(receipt.ledger.sceneId, Object.values(receipt.ledger.tokenIds));
  await fixture.api.registerCombat({ ledgerMessageId: receipt.ledger.messageId, combatId: taskCombat.id });
  (fixture.scenes as any).active = fixture.scenes.get(receipt.ledger.sceneId);
  (globalThis as any).game.combat = taskCombat;
  fixture.scenes.get(receipt.ledger.sceneId).tokens.get(receipt.ledger.tokenIds.target).actorLink = false;
  const unlinked = fixture.api.snapshot({ ledgerMessageId: receipt.ledger.messageId, scenario: 'vex' });
  expect(unlinked.preflight.ok).toBe(false);
  expect(unlinked.preflight.reasons).toContain('token-actor-not-linked');
  (fixture.scenes as any).active = fixture.scenes.get('original-scene');
  (globalThis as any).game.combat = fixture.originalCombat;
  fixture.scenes.get(receipt.ledger.sceneId).flags = {};
  const result = await fixture.api.cleanup({ ledgerMessageId: receipt.ledger.messageId });
  expect(result.status).toBe('cleanup-incomplete');
  expect(result.skipped).toContain(`scene:${receipt.ledger.sceneId}`);
  expect(fixture.scenes.has(receipt.ledger.sceneId)).toBe(true);
});

test('registers only a task Combat and defers cleanup until original Combat selection is restored', async () => {
  const fixture = world();
  const receipt = await fixture.api.create({ runId: 'WMP-E2E-FOURTH01', expectedEnabledModules: fixture.enabledModules,
    weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const ledgerMessageId = receipt.ledger.messageId;
  await expect(fixture.api.registerCombat({ ledgerMessageId, combatId: fixture.originalCombat.id }))
    .rejects.toThrow('distinct from the original Combat');
  const wrongCombat = fixture.createTaskCombat(receipt.ledger.sceneId, ['other-token']);
  await expect(fixture.api.registerCombat({ ledgerMessageId, combatId: wrongCombat.id }))
    .rejects.toThrow('exactly the task Tokens');
  expect(wrongCombat.getFlag('fvtt-weapon-mastery-properties', 'e2eFixture')).toBeUndefined();
  fixture.combats.delete(wrongCombat.id);
  const taskCombat = fixture.createTaskCombat(receipt.ledger.sceneId, Object.values(receipt.ledger.tokenIds));
  await fixture.api.registerCombat({ ledgerMessageId, combatId: taskCombat.id });
  (globalThis as any).game.combat = taskCombat;
  const deferred = await fixture.api.cleanup({ ledgerMessageId });
  expect(deferred.status).toBe('cleanup-incomplete');
  expect(deferred.skippedIds).toContain('original-combat-selection-not-restored');
  expect(fixture.combats.has(taskCombat.id)).toBe(true);
  (globalThis as any).game.combat = fixture.originalCombat;
  const cleaned = await fixture.api.cleanup({ ledgerMessageId });
  expect(cleaned.status).toBe('cleaned');
  expect(fixture.combats.has(taskCombat.id)).toBe(false);
  expect(fixture.combats.has(fixture.originalCombat.id)).toBe(true);
});

test('retries after tagged Combat deletion without losing exact ownership proof', async () => {
  const fixture = world();
  const receipt = await fixture.api.create({ runId: 'WMP-E2E-FIFTH01', expectedEnabledModules: fixture.enabledModules,
    weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const ledgerMessageId = receipt.ledger.messageId;
  const taskCombat = fixture.createTaskCombat(receipt.ledger.sceneId, Object.values(receipt.ledger.tokenIds));
  await fixture.api.registerCombat({ ledgerMessageId, combatId: taskCombat.id });
  taskCombat.delete = async () => {
    fixture.combats.delete(taskCombat.id);
    (globalThis as any).game.combat = null;
  };
  const first = await fixture.api.cleanup({ ledgerMessageId });
  expect(first.status).toBe('cleanup-incomplete');
  expect(first.skippedIds).toContain('original-combat-selection-not-restored');
  expect(first.entries.find((entry: any) => entry.id === taskCombat.id)).toMatchObject({
    ownershipVerified: true, absentAfterCleanup: true,
  });
  const stillUnrestored = await fixture.api.cleanup({ ledgerMessageId });
  expect(stillUnrestored.status).toBe('cleanup-incomplete');
  expect(stillUnrestored.skippedIds).toContain('original-combat-selection-not-restored');
  expect(stillUnrestored.deleted.combatId).toBe(taskCombat.id);
  expect(stillUnrestored.entries.find((entry: any) => entry.id === taskCombat.id)).toMatchObject({
    ownerMarker: { runId: receipt.runId, role: 'combat' }, ownershipVerified: true, absentAfterCleanup: true,
  });
  (globalThis as any).game.combat = fixture.originalCombat;
  const retry = await fixture.api.cleanup({ ledgerMessageId });
  expect(retry.status).toBe('cleaned');
  expect(retry.entries.find((entry: any) => entry.id === taskCombat.id)).toMatchObject({
    ownerMarker: { runId: receipt.runId, role: 'combat' }, ownershipVerified: true, absentAfterCleanup: true,
  });
  expect(retry.entries.find((entry: any) => entry.kind === 'scene')).toMatchObject({
    ownershipVerified: true, absentAfterCleanup: true,
  });
});

test('versioned batch resumes, runs public API once, exports real deltas, and retains fixtures between cases', async () => {
  const fixture = world();
  const weaponSourceUuids = Object.fromEntries(['cleave', 'graze', 'nick', 'push', 'sap', 'slow', 'topple', 'vex', 'deadly', 'fatal', 'criticalBleeding']
    .map((kind) => [kind, `Item.${kind}`]));
  const propertyRules = {
    deadly: { ruleId: 'house.deadly', kind: 'deadly', label: 'Deadly', params: { dice: 1, die: 8 }, stackingGroup: 'house.deadly' },
    fatal: { ruleId: 'house.fatal', kind: 'fatal', label: 'Fatal', params: { die: 10 }, stackingGroup: 'house.fatal' },
    criticalBleeding: { ruleId: 'house.criticalBleeding', kind: 'criticalBleeding', label: 'Bleeding',
      params: { formula: '1d6', mode: 'damage', damageType: 'slashing', endOnHealing: true }, stackingGroup: 'house.criticalBleeding' },
  };
  const receipt = await fixture.api.ensureBatch({ runId: 'WMP-E2E-BATCH01', expectedEnabledModules: fixture.enabledModules,
    weaponSourceUuids, propertyRules });
  expect(Object.keys(receipt.ledger.itemIds)).toHaveLength(11);
  const ledgerMessageId = receipt.ledger.messageId;
  const taskCombat = fixture.createTaskCombat(receipt.ledger.sceneId, Object.values(receipt.ledger.tokenIds));
  await fixture.api.registerCombat({ ledgerMessageId, combatId: taskCombat.id });
  (fixture.scenes as any).active = fixture.scenes.get(receipt.ledger.sceneId);
  (globalThis as any).game.combat = taskCombat;
  const reset = await fixture.api.resetCase({ ledgerMessageId, scenario: 'vex' });
  expect(reset.before.preflight.ok).toBe(true);
  await expect(fixture.api.resetCase({ ledgerMessageId, scenario: 'slow' }))
    .rejects.toThrow('Finish active case vex');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  (globalThis as any).__midiUse = async () => {
    await gate;
    fixture.scenes.get(receipt.ledger.sceneId).tokens.get(receipt.ledger.tokenIds.target).actor.system.attributes.hp.value = 190;
    fixture.actors.get(receipt.ledger.actorIds.source).flags['fvtt-weapon-mastery-properties'].ledger = [{
      attackId: 'actual-attack', itemUuid: `Actor.${receipt.ledger.actorIds.source}.Item.${receipt.ledger.itemIds.vex}`,
      step: 'committed', createdAt: Date.now(),
    }];
    return { id: 'workflow-1', aborted: false };
  };
  const running = fixture.api.runCase({ ledgerMessageId, scenario: 'vex', source: 'runtime-api' });
  await expect(fixture.api.runCase({ ledgerMessageId, scenario: 'vex', source: 'runtime-api' }))
    .rejects.toThrow('already in progress');
  expect(() => new Function(source)()).toThrow('do not rebootstrap');
  release();
  const run = await running;
  expect(run).toMatchObject({ driver: 'midi-qol', publicResult: { workflowId: 'workflow-1', status: 'committed' } });
  const exported = await fixture.api.exportReceipt({ ledgerMessageId, scenario: 'vex' });
  expect(exported.source).toBe('runtime-api');
  expect(exported.actualDamageDelta.hp).toBe(10);
  expect(exported.pendingUi).toBe(true);
  expect(classifyWeaponEvidence(exported.classifiedInput).environment.status).toBe('INCOMPLETE');
  expect(fixture.actors.has(receipt.ledger.actorIds.source)).toBe(true);
  expect(fixture.scenes.has(receipt.ledger.sceneId)).toBe(true);
  new Function(source)();
  const resumed = await (globalThis as any).WMP_E2E.ensureBatch({ ledgerMessageId, runId: receipt.runId });
  expect(resumed.resumed).toBe(true);
  expect(resumed.ledger.cases.vex.status).toBe('awaiting-observation');
  await expect((globalThis as any).WMP_E2E.resetCase({ ledgerMessageId, scenario: 'slow' }))
    .rejects.toThrow('Finish active case vex');
  await expect((globalThis as any).WMP_E2E.runCase({ ledgerMessageId, scenario: 'slow', source: 'ui-activity' }))
    .rejects.toThrow('Another case owns the batch');
  expect((await (globalThis as any).WMP_E2E.reconcileCase({ ledgerMessageId, scenario: 'vex' })).status).toBe('abandoned');
  expect((await (globalThis as any).WMP_E2E.resetCase({ ledgerMessageId, scenario: 'slow' })).status).toBe('reset');
  fixture.messages.get(ledgerMessageId).flags['fvtt-weapon-mastery-properties'].e2eFixture.ledger.cases.slow.status = 'running';
  new Function(source)();
  const interrupted = await (globalThis as any).WMP_E2E.ensureBatch({ ledgerMessageId });
  expect(interrupted.ledger.cases.slow.status).toBe('interrupted');
  await expect((globalThis as any).WMP_E2E.exportReceipt({ ledgerMessageId, scenario: 'slow' }))
    .rejects.toThrow('No active completed case run');
  const sourceActor = fixture.actors.get(receipt.ledger.actorIds.source);
  sourceActor.flags['fvtt-weapon-mastery-properties'].ledger = [{
    attackId: 'pending-slow', itemUuid: `Actor.${sourceActor.id}.Item.${receipt.ledger.itemIds.slow}`, step: 'attack',
  }];
  await expect((globalThis as any).WMP_E2E.reconcileCase({ ledgerMessageId, scenario: 'slow' }))
    .rejects.toThrow('Task attack is not terminal');
  sourceActor.flags['fvtt-weapon-mastery-properties'].ledger[0].step = 'cancelled';
  await (globalThis as any).WMP_E2E.reconcileCase({ ledgerMessageId, scenario: 'slow' });
  expect((await (globalThis as any).WMP_E2E.resetCase({ ledgerMessageId, scenario: 'slow' })).status).toBe('reset');
  fixture.actors.get(receipt.ledger.actorIds.target).system.attributes.hp.value = 199;
  fixture.messages.get(ledgerMessageId).flags['fvtt-weapon-mastery-properties'].e2eFixture.ledger.cases.slow.status = 'interrupted';
  new Function(source)();
  await (globalThis as any).WMP_E2E.ensureBatch({ ledgerMessageId });
  const isolated = await (globalThis as any).WMP_E2E.reconcileCase({ ledgerMessageId, scenario: 'slow',
    isolationReason: 'Task actor state changed without a terminal attack identity' });
  expect(isolated).toMatchObject({ status: 'isolated', requireNewBatch: true,
    retainedIds: { sceneId: receipt.ledger.sceneId } });
  await expect((globalThis as any).WMP_E2E.resetCase({ ledgerMessageId, scenario: 'slow' }))
    .rejects.toThrow('Batch scenario is not ready');
});

test('exports classifier input from scoped actual message, HP proof, and fresh weapon effect', async () => {
  const fixture = world();
  const initial = await fixture.api.create({ runId: 'WMP-E2E-ORACLE01', expectedEnabledModules: fixture.enabledModules,
    expectedBuildId: 'build-123',
    weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const ledgerMessageId = initial.ledger.messageId;
  const combat = fixture.createTaskCombat(initial.ledger.sceneId, Object.values(initial.ledger.tokenIds));
  await fixture.api.registerCombat({ ledgerMessageId, combatId: combat.id });
  (fixture.scenes as any).active = fixture.scenes.get(initial.ledger.sceneId);
  (globalThis as any).game.combat = combat;
  await fixture.api.resetCase({ ledgerMessageId, scenario: 'slow' });
  const target = fixture.actors.get(initial.ledger.actorIds.target);
  (globalThis as any).__midiUse = async () => {
    const card = await (globalThis as any).ChatMessage.create({ flags: {
      dnd5e: { actorUuid: `Actor.${initial.ledger.actorIds.source}`, roll: { type: 'attack' } },
      'fvtt-weapon-mastery-properties': { attackId: 'actual-slow-attack' },
    }, rolls: [{ total: 18, formula: '1d20+5', options: { type: 'attack' }, dice: [] }] });
    target.system.attributes.hp.value = 194;
    target.system.attributes.movement.walk = 20;
    target.flags['fvtt-weapon-mastery-properties'].damageProof = {
      attackId: 'actual-slow-attack', targetActorUuid: target.uuid, attackMessageId: card.id,
    };
    target.effects.set('fresh-slow-effect', { id: 'fresh-slow-effect', name: 'Slow', disabled: false,
      flags: { 'fvtt-custom-conditions': { weaponEffect: { effectKind: 'slow', createdAt: card.timestamp + 1,
        source: { actorUuid: `Actor.${initial.ledger.actorIds.source}`,
          itemUuid: `Actor.${initial.ledger.actorIds.source}.Item.${initial.ledger.itemIds.slow}` },
        target: { actorUuid: target.uuid } } } } });
    fixture.actors.get(initial.ledger.actorIds.source).flags['fvtt-weapon-mastery-properties'].ledger = [{
      attackId: 'actual-slow-attack', itemUuid: `Actor.${initial.ledger.actorIds.source}.Item.${initial.ledger.itemIds.slow}`,
      step: 'committed', createdAt: Date.now(),
    }];
    return { id: 'workflow-slow', aborted: false };
  };
  await fixture.api.runCase({ ledgerMessageId, scenario: 'slow', source: 'runtime-api' });
  const receipt = await fixture.api.exportReceipt({ ledgerMessageId, scenario: 'slow', observations: { closeCase: true } });
  expect(receipt.classifiedInput.rules.slow.attack.messageId).toBe(receipt.newMessageIds[0]);
  expect(receipt.classifiedInput.rules.slow.damage.accepted).toBe(true);
  expect(receipt.classifiedInput.rules.slow.effectReadback.instance.id).toBe('fresh-slow-effect');
  expect(classifyWeaponEvidence(receipt.classifiedInput).rules.slow).toMatchObject({ status: 'PASS', source: 'runtime-api' });
  const next = await fixture.api.resetCase({ ledgerMessageId, scenario: 'push' });
  expect(next.before.target.hpValue).toBe(200);
  expect(next.before.target.effects).toEqual([]);
  expect(combat.round).toBe(3);
});

test('Vex UI start requires the exact task target Token to be selected', async () => {
  const fixture = world();
  const initial = await fixture.api.create({ runId: 'WMP-E2E-VEXTARGET', expectedEnabledModules: fixture.enabledModules,
    expectedBuildId: 'build-123', weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const ledgerMessageId = initial.ledger.messageId;
  const combat = fixture.createTaskCombat(initial.ledger.sceneId, Object.values(initial.ledger.tokenIds));
  await fixture.api.registerCombat({ ledgerMessageId, combatId: combat.id });
  (fixture.scenes as any).active = fixture.scenes.get(initial.ledger.sceneId);
  (globalThis as any).game.combat = combat;
  const targetToken = fixture.scenes.get(initial.ledger.sceneId).tokens.get(initial.ledger.tokenIds.target);
  const sourceToken = fixture.scenes.get(initial.ledger.sceneId).tokens.get(initial.ledger.tokenIds.source);
  const targetCalls: any[] = [];
  const canvasLayer: any = { controlled: [],
    activate: async () => undefined,
    setTargets: (ids: string[], options: any) => {
      targetCalls.push({ ids, options });
      (globalThis as any).game.user.targets = new Set(ids.map(id => ({ document: { id } })));
    },
  };
  const sourcePlaceable = { document: sourceToken, control: (_options: any) => {
    canvasLayer.controlled = [sourcePlaceable]; return true;
  } };
  canvasLayer.get = (id: string) => id === targetToken.id ? { document: targetToken }
    : id === sourceToken.id ? sourcePlaceable : null;
  (globalThis as any).canvas = { scene: { id: initial.ledger.sceneId }, tokens: canvasLayer };
  await fixture.api.resetCase({ ledgerMessageId, scenario: 'vex' });
  expect(targetCalls).toEqual([{ ids: [initial.ledger.tokenIds.target], options: { mode: 'replace' } }]);
  expect(fixture.api.snapshot({ ledgerMessageId, scenario: 'vex' }).targetSelection.matches).toBe(true);
  expect(fixture.api.snapshot({ ledgerMessageId, scenario: 'vex' }).sourceSelection.matches).toBe(true);
  canvasLayer.controlled = [];
  await expect(fixture.api.runCase({ ledgerMessageId, scenario: 'vex', source: 'ui-activity' }))
    .rejects.toThrow('vex-source-token-not-controlled');
  canvasLayer.controlled = [sourcePlaceable];
  (globalThis as any).game.user.targets = new Set([{ document: { id: 'other-token' } }]);
  await expect(fixture.api.runCase({ ledgerMessageId, scenario: 'vex', source: 'ui-activity' }))
    .rejects.toThrow('vex-target-token-not-selected');
  (globalThis as any).game.user.targets = new Set([{ document: { id: initial.ledger.tokenIds.target } }]);
  const armed = await fixture.api.runCase({ ledgerMessageId, scenario: 'vex', source: 'ui-activity' });
  expect(armed).toMatchObject({ status: 'awaiting-observation', after: {
    targetSelection: { targetTokenId: initial.ledger.tokenIds.target,
      selectedTokenIds: [initial.ledger.tokenIds.target], matches: true } } });
});

test('an untouched reset Vex case can be abandoned without isolating its batch', async () => {
  const fixture = world();
  const initial = await fixture.api.create({ runId: 'WMP-E2E-RESETVEX', expectedEnabledModules: fixture.enabledModules,
    weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const ledgerMessageId = initial.ledger.messageId;
  const combat = fixture.createTaskCombat(initial.ledger.sceneId, Object.values(initial.ledger.tokenIds));
  await fixture.api.registerCombat({ ledgerMessageId, combatId: combat.id });
  (fixture.scenes as any).active = fixture.scenes.get(initial.ledger.sceneId);
  (globalThis as any).game.combat = combat;
  await fixture.api.resetCase({ ledgerMessageId, scenario: 'vex' });
  expect(await fixture.api.reconcileCase({ ledgerMessageId, scenario: 'vex' }))
    .toMatchObject({ status: 'abandoned', requireNewBatch: false, reconciliation: { pendingAttacks: [] } });
  const ledger = fixture.messages.get(ledgerMessageId).flags['fvtt-weapon-mastery-properties'].e2eFixture.ledger;
  expect(ledger).toMatchObject({ status: 'ready', activeCase: null, cases: { vex: { status: 'abandoned' } } });
});

test('Vex keeps the first fresh effect proof across a second attack that consumes it', async () => {
  const fixture = world();
  const initial = await fixture.api.create({ runId: 'WMP-E2E-VEXNEXT', expectedEnabledModules: fixture.enabledModules,
    expectedBuildId: 'build-123', weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const ledgerMessageId = initial.ledger.messageId;
  const combat = fixture.createTaskCombat(initial.ledger.sceneId, Object.values(initial.ledger.tokenIds));
  await fixture.api.registerCombat({ ledgerMessageId, combatId: combat.id });
  (fixture.scenes as any).active = fixture.scenes.get(initial.ledger.sceneId);
  (globalThis as any).game.combat = combat;
  await fixture.api.resetCase({ ledgerMessageId, scenario: 'vex' });
  const sourceActor = fixture.actors.get(initial.ledger.actorIds.source);
  const target = fixture.actors.get(initial.ledger.actorIds.target);
  (globalThis as any).__midiUse = async () => {
    await (globalThis as any).ChatMessage.create({ type: 'usage', flags: {
      dnd5e: { actorUuid: sourceActor.uuid },
      'fvtt-weapon-mastery-properties': { attackId: 'vex-first' },
    }, rolls: [] });
    const card = await (globalThis as any).ChatMessage.create({ flags: {
      dnd5e: { actorUuid: sourceActor.uuid, roll: { type: 'attack' } },
      'fvtt-weapon-mastery-properties': { attackId: 'vex-first' },
    }, rolls: [{ total: 18, options: { type: 'attack' }, dice: [] }] });
    target.system.attributes.hp.value = 194;
    target.flags['fvtt-weapon-mastery-properties'].damageProof = {
      attackId: 'vex-first', targetActorUuid: target.uuid, attackMessageId: card.id,
    };
    sourceActor.effects.set('vex-fresh', { id: 'vex-fresh', disabled: false,
      flags: { 'fvtt-custom-conditions': { weaponEffect: { effectKind: 'vex', createdAt: card.timestamp + 1,
        source: { actorUuid: sourceActor.uuid, itemUuid: `Actor.${sourceActor.id}.Item.${initial.ledger.itemIds.vex}` },
        target: { actorUuid: target.uuid } } } } });
    sourceActor.flags['fvtt-weapon-mastery-properties'].ledger = [{ attackId: 'vex-first', step: 'committed',
      itemUuid: `Actor.${sourceActor.id}.Item.${initial.ledger.itemIds.vex}`, createdAt: Date.now() }];
    return { id: 'workflow-first', aborted: false };
  };
  await fixture.api.runCase({ ledgerMessageId, scenario: 'vex', source: 'runtime-api' });
  await expect(fixture.api.prepareVexNext({ ledgerMessageId })).rejects.toThrow('checkpoint');
  // A usage/damage card can share the first attack ID; it is not a second attack.
  await (globalThis as any).ChatMessage.create({ flags: {
    dnd5e: { actorUuid: sourceActor.uuid, roll: { type: 'damage' } },
    'fvtt-weapon-mastery-properties': { attackId: 'vex-first' },
  } });
  const first = await fixture.api.checkpointVex({ ledgerMessageId });
  expect(first.checkpoint).toMatchObject({ status: 'SAVED', attackId: 'vex-first', effectId: 'vex-fresh' });
  expect(first.classifiedInput.rules.vex.effectReadback.instance.id).toBe('vex-fresh');
  expect(classifyWeaponEvidence(first.classifiedInput).rules.vex.status).toBe('INCOMPLETE');
  expect(await fixture.api.prepareVexNext({ ledgerMessageId })).toMatchObject({
    status: 'READY_FOR_DIALOG', effectId: 'vex-fresh', targetActorId: target.id });
  const normal = await fixture.api.recordVexPreRoll({ ledgerMessageId, observation: {
    targetActorId: target.id, effectId: 'vex-fresh', offeredAdvantage: true,
    sourceLabel: 'Weapon mastery effect', selectedMode: 'normal' } });
  expect(normal.status).toBe('STOP');
  const stopped = await fixture.api.exportReceipt({ ledgerMessageId, scenario: 'vex', observations: {
    nextAttack: { attackId: 'unrolled', messageId: 'unrolled', moduleModifiers: { advantage: false },
      advantageObservation: { source: 'roll', advantage: false, d20Count: 1 } } } });
  expect(classifyWeaponEvidence(stopped.classifiedInput).rules.vex.status).toBe('INCOMPLETE');
  expect((await fixture.api.recordVexPreRoll({ ledgerMessageId, observation: {
    targetActorId: target.id, effectId: 'vex-fresh', offeredAdvantage: true,
    sourceLabel: 'Weapon mastery effect', selectedMode: 'advantage' } })).status).toBe('READY');
  const nextCard = await (globalThis as any).ChatMessage.create({ flags: {
    dnd5e: { actorUuid: sourceActor.uuid, roll: { type: 'attack' } },
    'fvtt-weapon-mastery-properties': { attackId: 'vex-next' },
  }, rolls: [{ total: 19, options: { type: 'attack' }, dice: [] }] });
  sourceActor.effects.delete('vex-fresh');
  sourceActor.flags['fvtt-weapon-mastery-properties'].ledger.push({ attackId: 'vex-next', step: 'committed',
    itemUuid: `Actor.${sourceActor.id}.Item.${initial.ledger.itemIds.vex}`, createdAt: Date.now() });
  const rawLedger = fixture.messages.get(ledgerMessageId).flags['fvtt-weapon-mastery-properties'].e2eFixture.ledger;
  const retainedEffect = rawLedger.cases.vex.observedEffect;
  delete rawLedger.cases.vex.observedEffect;
  const missingIntermediate = await fixture.api.exportReceipt({ ledgerMessageId, scenario: 'vex',
    observations: { nextAttack: { attackId: 'vex-next', messageId: nextCard.id } } });
  expect(classifyWeaponEvidence(missingIntermediate.classifiedInput).rules.vex.status).toBe('INCOMPLETE');
  fixture.messages.get(ledgerMessageId).flags['fvtt-weapon-mastery-properties'].e2eFixture.ledger.cases.vex.observedEffect = retainedEffect;
  // Reusing the Vex weapon can create another instance after consuming the first.
  sourceActor.effects.set('vex-next-effect', { ...structuredClone(retainedEffect.effect), id: 'vex-next-effect' });
  const second = await fixture.api.exportReceipt({ ledgerMessageId, scenario: 'vex', observations: {
    closeCase: true,
    nextAttack: { attackId: 'vex-next', messageId: nextCard.id, attackerActorId: sourceActor.id,
      targetActorId: target.id, moduleModifiers: { advantage: true },
      advantageObservation: { source: 'roll', advantage: true, d20Count: 2, causeEffectId: 'vex-fresh' } },
  } });
  expect(second.classifiedInput.rules.vex.effectReadback.instance.id).toBe('vex-fresh');
  expect(second.vexCheckpoint).toMatchObject({ status: 'SAVED', effectId: 'vex-fresh' });
  expect(second.vexPreRoll).toMatchObject({ status: 'READY', selectedMode: 'advantage' });
  expect(second.classifiedInput.rules.vex.nextAttack.effectAfter).toEqual({ complete: true, present: false });
  expect(classifyWeaponEvidence(second.classifiedInput).rules.vex).toMatchObject({ status: 'PASS', source: 'runtime-api' });
});

test('export attributes only the linked damage proof, not subsequent damage and healing', async () => {
  const fixture = world();
  const initial = await fixture.api.create({ runId: 'WMP-E2E-DAMAGETHENHEAL', expectedEnabledModules: fixture.enabledModules,
    expectedBuildId: 'build-123', weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const ledger = initial.ledger;
  const combat = fixture.createTaskCombat(ledger.sceneId, Object.values(ledger.tokenIds));
  await fixture.api.registerCombat({ ledgerMessageId: ledger.messageId, combatId: combat.id });
  (fixture.scenes as any).active = fixture.scenes.get(ledger.sceneId);
  (globalThis as any).game.combat = combat;
  await fixture.api.resetCase({ ledgerMessageId: ledger.messageId, scenario: 'slow' });
  const actor = fixture.actors.get(ledger.actorIds.source);
  const target = fixture.actors.get(ledger.actorIds.target);
  (globalThis as any).__midiUse = async () => {
    const card = await (globalThis as any).ChatMessage.create({ flags: {
      dnd5e: { actorUuid: actor.uuid, roll: { type: 'attack' } },
      'fvtt-weapon-mastery-properties': { attackId: 'damage-then-heal' },
    }, rolls: [{ total: 18, formula: '1d20+5', options: { type: 'attack' }, dice: [] }] });
    target.system.attributes.hp.value = 196;
    target.flags['fvtt-weapon-mastery-properties'].damageProof = { schemaVersion: 1,
      attackId: 'damage-then-heal', attackMessageId: card.id, damageMessageId: card.id,
      actorUuid: actor.uuid, targetActorUuid: target.uuid, requesterId: 'gm', nonce: 'one-hit',
      before: { hp: 200, tempHp: 0 }, after: { hp: 196, tempHp: 0 } };
    actor.flags['fvtt-weapon-mastery-properties'].ledger = [{ attackId: 'damage-then-heal',
      itemUuid: `Actor.${actor.id}.Item.${ledger.itemIds.slow}`, step: 'committed', createdAt: Date.now() }];
    return { id: 'midi-complete', aborted: false };
  };
  await fixture.api.runCase({ ledgerMessageId: ledger.messageId, scenario: 'slow', source: 'runtime-api' });
  target.system.attributes.hp.value = 194; // Separate condition tick.
  target.system.attributes.hp.value = 195; // Later healing, without another attack.
  const receipt = await fixture.api.exportReceipt({ ledgerMessageId: ledger.messageId, scenario: 'slow' });
  expect(receipt.classifiedInput.rules.slow.damage).toEqual({ accepted: true, amount: 4,
    hpBefore: 200, hpAfter: 196, tempHpBefore: 0, tempHpAfter: 0 });
  expect(receipt.actualDamageDelta.hp).toBe(5);
  expect(receipt.after.target.hpValue).toBe(195);
});

test('native runtime API uses WMP facade and stores only scalar result fields', async () => {
  const fixture = world();
  (globalThis as any).game.modules.get('midi-qol').active = false;
  const expectedEnabledModules = fixture.enabledModules.filter((entry) => entry.id !== 'midi-qol');
  const initial = await fixture.api.create({ runId: 'WMP-E2E-NATIVE1', expectedEnabledModules,
    weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const ledgerMessageId = initial.ledger.messageId;
  const combat = fixture.createTaskCombat(initial.ledger.sceneId, Object.values(initial.ledger.tokenIds));
  await fixture.api.registerCombat({ ledgerMessageId, combatId: combat.id });
  (fixture.scenes as any).active = fixture.scenes.get(initial.ledger.sceneId);
  (globalThis as any).game.combat = combat;
  combat.turns.reverse();
  await fixture.api.resetCase({ ledgerMessageId, scenario: 'push' });
  expect(combat.combatant.tokenId).toBe(initial.ledger.tokenIds.source);
  let called = false;
  (globalThis as any).game.modules.get('fvtt-weapon-mastery-properties').api.use = async () => {
    called = true;
    const circular: any = {}; circular.self = circular;
    return { attackId: 'native-attack', status: 'committed', results: circular };
  };
  const run = await fixture.api.runCase({ ledgerMessageId, scenario: 'push', source: 'runtime-api' });
  expect(called).toBe(true);
  expect(run).toMatchObject({ driver: 'weapon-api', publicResult: { attackId: 'native-attack', status: 'committed' } });
});

test('resumes a pilot batch and appends a real source weapon without replacing owned fixtures', async () => {
  const fixture = world();
  const initial = await fixture.api.create({ runId: 'WMP-E2E-APPEND01', expectedEnabledModules: fixture.enabledModules,
    weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const sceneId = initial.ledger.sceneId;
  const sourceId = initial.ledger.actorIds.source;
  const result = await fixture.api.ensureBatch({ ledgerMessageId: initial.ledger.messageId,
    weaponSourceUuids: { cleave: 'Item.cleave' } });
  expect(result.resumed).toBe(true);
  expect(result.ledger.sceneId).toBe(sceneId);
  expect(result.ledger.actorIds.source).toBe(sourceId);
  expect(result.ledger.itemIds.cleave).toBeTruthy();
  expect(fixture.actors.get(sourceId).items.get(result.ledger.itemIds.cleave)
    .getFlag('fvtt-weapon-mastery-properties', 'weapon').mastery).toBe('dnd2024.cleave');
  fixture.scenes.get(sceneId).tokens.delete(initial.ledger.tokenIds.target);
  await expect(fixture.api.ensureBatch({ ledgerMessageId: initial.ledger.messageId }))
    .rejects.toThrow('Batch Token target ID or ownership is missing');
});

test('interim attack card before Apply does not freeze zero damage, then primary Apply can close Slow', async () => {
  const fixture = world();
  const initial = await fixture.api.create({ runId: 'WMP-E2E-LATEAPPLY', expectedEnabledModules: fixture.enabledModules,
    expectedBuildId: 'build-123', weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const ledgerMessageId = initial.ledger.messageId;
  const combat = fixture.createTaskCombat(initial.ledger.sceneId, Object.values(initial.ledger.tokenIds));
  await fixture.api.registerCombat({ ledgerMessageId, combatId: combat.id });
  (fixture.scenes as any).active = fixture.scenes.get(initial.ledger.sceneId);
  (globalThis as any).game.combat = combat;
  await fixture.api.resetCase({ ledgerMessageId, scenario: 'slow' });
  await fixture.api.runCase({ ledgerMessageId, scenario: 'slow', source: 'ui-activity' });
  const sourceActor = fixture.actors.get(initial.ledger.actorIds.source);
  const target = fixture.actors.get(initial.ledger.actorIds.target);
  const card = await (globalThis as any).ChatMessage.create({ flags: {
    dnd5e: { actorUuid: sourceActor.uuid, roll: { type: 'attack' } },
    'fvtt-weapon-mastery-properties': { attackId: 'slow-primary' },
  }, rolls: [{ total: 18, options: { type: 'attack' }, dice: [] }] });
  sourceActor.flags['fvtt-weapon-mastery-properties'].ledger = [{ attackId: 'slow-primary', step: 'committed',
    itemUuid: `Actor.${sourceActor.id}.Item.${initial.ledger.itemIds.slow}` }];
  const early = await fixture.api.exportReceipt({ ledgerMessageId, scenario: 'slow' });
  expect(early.classifiedInput.rules.slow.damage.accepted).toBeUndefined();
  expect(classifyWeaponEvidence(early.classifiedInput).rules.slow.status).toBe('INCOMPLETE');
  expect(fixture.messages.get(ledgerMessageId).flags['fvtt-weapon-mastery-properties'].e2eFixture.ledger.cases.slow.primaryAfter)
    .toBeUndefined();
  target.system.attributes.hp.value = 194;
  target.system.attributes.movement.walk = 20;
  target.flags['fvtt-weapon-mastery-properties'].damageProof = {
    attackId: 'slow-primary', targetActorUuid: target.uuid, attackMessageId: card.id,
  };
  target.effects.set('late-slow-effect', { id: 'late-slow-effect', disabled: false,
    flags: { 'fvtt-custom-conditions': { weaponEffect: { effectKind: 'slow', createdAt: card.timestamp + 1,
      source: { actorUuid: sourceActor.uuid, itemUuid: `Actor.${sourceActor.id}.Item.${initial.ledger.itemIds.slow}` },
      target: { actorUuid: target.uuid } } } } });
  const applied = await fixture.api.exportReceipt({ ledgerMessageId, scenario: 'slow', observations: { closeCase: true } });
  expect(applied.classifiedInput.rules.slow.damage).toMatchObject({ accepted: true, hpAfter: 194 });
  expect(classifyWeaponEvidence(applied.classifiedInput).rules.slow.status).toBe('PASS');
});

test('terminal interrupted case records its fresh effect for exact reset removal', async () => {
  const fixture = world();
  const initial = await fixture.api.create({ runId: 'WMP-E2E-TERMCASE', expectedEnabledModules: fixture.enabledModules,
    weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const ledgerMessageId = initial.ledger.messageId;
  const combat = fixture.createTaskCombat(initial.ledger.sceneId, Object.values(initial.ledger.tokenIds));
  await fixture.api.registerCombat({ ledgerMessageId, combatId: combat.id });
  (fixture.scenes as any).active = fixture.scenes.get(initial.ledger.sceneId);
  (globalThis as any).game.combat = combat;
  await fixture.api.resetCase({ ledgerMessageId, scenario: 'slow' });
  await fixture.api.runCase({ ledgerMessageId, scenario: 'slow', source: 'ui-activity' });
  const sourceActor = fixture.actors.get(initial.ledger.actorIds.source);
  const target = fixture.actors.get(initial.ledger.actorIds.target);
  await (globalThis as any).ChatMessage.create({ flags: { dnd5e: { actorUuid: sourceActor.uuid },
    'fvtt-weapon-mastery-properties': { attackId: 'terminal-slow' } } });
  sourceActor.flags['fvtt-weapon-mastery-properties'].ledger = [{ attackId: 'terminal-slow', step: 'committed',
    itemUuid: `Actor.${sourceActor.id}.Item.${initial.ledger.itemIds.slow}` }];
  target.system.attributes.hp.value = 194;
  target.system.attributes.movement.walk = 20;
  target.effects.set('terminal-slow-effect', { id: 'terminal-slow-effect', disabled: false, flags: {} });
  const record = fixture.messages.get(ledgerMessageId).flags['fvtt-weapon-mastery-properties'].e2eFixture.ledger;
  record.cases.slow.status = 'running';
  new Function(source)();
  await (globalThis as any).WMP_E2E.ensureBatch({ ledgerMessageId });
  const reconciled = await (globalThis as any).WMP_E2E.reconcileCase({ ledgerMessageId, scenario: 'slow' });
  expect(reconciled).toMatchObject({ status: 'abandoned', requireNewBatch: false });
  expect(fixture.messages.get(ledgerMessageId).flags['fvtt-weapon-mastery-properties'].e2eFixture.ledger
    .cases.slow.reconciliationAfter.target.effects.map((effect: any) => effect.id)).toContain('terminal-slow-effect');
  const reset = await (globalThis as any).WMP_E2E.resetCase({ ledgerMessageId, scenario: 'push' });
  expect(reset.before.target.effects).toEqual([]);
  expect(reset.before.target.hpValue).toBe(200);
});

test('missing primary Apply checkpoint stays incomplete once another attack card exists', async () => {
  const fixture = world();
  const initial = await fixture.api.create({ runId: 'WMP-E2E-MISSDMG1', expectedEnabledModules: fixture.enabledModules,
    expectedBuildId: 'build-123', weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const ledgerMessageId = initial.ledger.messageId;
  const combat = fixture.createTaskCombat(initial.ledger.sceneId, Object.values(initial.ledger.tokenIds));
  await fixture.api.registerCombat({ ledgerMessageId, combatId: combat.id });
  (fixture.scenes as any).active = fixture.scenes.get(initial.ledger.sceneId);
  (globalThis as any).game.combat = combat;
  await fixture.api.resetCase({ ledgerMessageId, scenario: 'slow' });
  await fixture.api.runCase({ ledgerMessageId, scenario: 'slow', source: 'ui-activity' });
  const sourceUuid = `Actor.${initial.ledger.actorIds.source}`;
  const first = await (globalThis as any).ChatMessage.create({ flags: { dnd5e: { actorUuid: sourceUuid, roll: { type: 'attack' } },
    'fvtt-weapon-mastery-properties': { attackId: 'primary' } }, rolls: [{ total: 18, dice: [] }] });
  await fixture.api.exportReceipt({ ledgerMessageId, scenario: 'slow' });
  await (globalThis as any).ChatMessage.create({ flags: { dnd5e: { actorUuid: sourceUuid, roll: { type: 'attack' } },
    'fvtt-weapon-mastery-properties': { attackId: 'later' } }, rolls: [{ total: 19, dice: [] }] });
  const target = fixture.actors.get(initial.ledger.actorIds.target);
  target.system.attributes.hp.value = 194;
  target.flags['fvtt-weapon-mastery-properties'].damageProof = {
    attackId: 'primary', targetActorUuid: target.uuid, attackMessageId: first.id,
  };
  const receipt = await fixture.api.exportReceipt({ ledgerMessageId, scenario: 'slow' });
  expect(receipt.classifiedInput.rules.slow.damage.accepted).toBeUndefined();
  expect(classifyWeaponEvidence(receipt.classifiedInput).rules.slow.status).toBe('INCOMPLETE');
  expect(fixture.messages.get(ledgerMessageId).flags['fvtt-weapon-mastery-properties'].e2eFixture.ledger
    .cases.slow.primaryDamageUnattributed).toBe(true);
});

test('repeated UI arm is idempotent and untouched arm can switch once to the real API', async () => {
  const fixture = world();
  const initial = await fixture.api.create({ runId: 'WMP-E2E-UIARM01', expectedEnabledModules: fixture.enabledModules,
    weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const ledgerMessageId = initial.ledger.messageId;
  const combat = fixture.createTaskCombat(initial.ledger.sceneId, Object.values(initial.ledger.tokenIds));
  await fixture.api.registerCombat({ ledgerMessageId, combatId: combat.id });
  (fixture.scenes as any).active = fixture.scenes.get(initial.ledger.sceneId);
  (globalThis as any).game.combat = combat;
  await fixture.api.resetCase({ ledgerMessageId, scenario: 'slow' });
  const first = await fixture.api.runCase({ ledgerMessageId, scenario: 'slow', source: 'ui-activity' });
  const repeated = await fixture.api.runCase({ ledgerMessageId, scenario: 'slow', source: 'ui-activity' });
  expect(repeated).toMatchObject({ status: 'awaiting-observation', alreadyArmed: true, startedAt: first.after.ledger.cases.slow.startedAt });
  const switched = await fixture.api.runCase({ ledgerMessageId, scenario: 'slow', source: 'runtime-api' });
  expect(switched).toMatchObject({ source: 'runtime-api', driver: 'midi-qol' });
  const entry = fixture.messages.get(ledgerMessageId).getFlag('fvtt-weapon-mastery-properties', 'e2eFixture').ledger.cases.slow;
  expect(entry.uiArmedAt).toBe(repeated.startedAt);
  expect(entry.source).toBe('runtime-api');
  await expect(fixture.api.runCase({ ledgerMessageId, scenario: 'slow', source: 'runtime-api' }))
    .rejects.toThrow('Call resetCase before each run');
});

test('UI arm with real message, HP, effect, or pending attack refuses API reentry', async () => {
  const fixture = world();
  const initial = await fixture.api.create({ runId: 'WMP-E2E-UIARM02', expectedEnabledModules: fixture.enabledModules,
    weaponSourceUuids: { vex: 'Item.vex', slow: 'Item.slow', push: 'Item.push' } });
  const ledgerMessageId = initial.ledger.messageId;
  const combat = fixture.createTaskCombat(initial.ledger.sceneId, Object.values(initial.ledger.tokenIds));
  await fixture.api.registerCombat({ ledgerMessageId, combatId: combat.id });
  (fixture.scenes as any).active = fixture.scenes.get(initial.ledger.sceneId);
  (globalThis as any).game.combat = combat;
  await fixture.api.resetCase({ ledgerMessageId, scenario: 'slow' });
  const armed = await fixture.api.runCase({ ledgerMessageId, scenario: 'slow', source: 'ui-activity' });
  const sourceActor = fixture.actors.get(initial.ledger.actorIds.source);
  const target = fixture.actors.get(initial.ledger.actorIds.target);
  const attempt = () => fixture.api.runCase({ ledgerMessageId, scenario: 'slow', source: 'runtime-api' });
  const card = await (globalThis as any).ChatMessage.create({ flags: { dnd5e: { actorUuid: sourceActor.uuid },
    'fvtt-weapon-mastery-properties': { attackId: 'started' } } });
  await expect(attempt()).rejects.toThrow('UI case already has activity');
  fixture.messages.delete(card.id);
  target.system.attributes.hp.value = 199;
  await expect(attempt()).rejects.toThrow('UI case already has activity');
  target.system.attributes.hp.value = 200;
  target.effects.set('new-effect', { id: 'new-effect', flags: {} });
  await expect(attempt()).rejects.toThrow('UI case already has activity');
  target.effects.delete('new-effect');
  sourceActor.flags['fvtt-weapon-mastery-properties'].ledger = [{
    attackId: 'pending', itemUuid: `Actor.${sourceActor.id}.Item.${initial.ledger.itemIds.slow}`, step: 'attack',
  }];
  await expect(attempt()).rejects.toThrow('UI case already has activity');
  const entry = fixture.messages.get(ledgerMessageId).getFlag('fvtt-weapon-mastery-properties', 'e2eFixture').ledger.cases.slow;
  expect(entry).toMatchObject({ source: 'ui-activity', startedAt: armed.after.ledger.cases.slow.startedAt,
    status: 'awaiting-observation' });
});
