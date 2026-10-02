import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  discoverOfficialWeaponSources,
  isHarnessEnabled,
  openE2EHarness,
  performHarnessAction,
  registerE2EHarnessSetting,
  summarizeHarnessResult,
  type HarnessFields,
} from '../src/e2e-harness.ts';

const moduleId = 'fvtt-weapon-mastery-properties';

test('closed receipt summaries use live batch state instead of the captured pre-close snapshot', () => {
  const receipt = { after: { ledger: { status: 'ready', activeCase: 'cleave',
    cases: { cleave: { status: 'awaiting-observation' } } } } };
  const ledger = { status: 'ready', activeCase: null, cases: { cleave: { status: 'exported' } } };
  expect(summarizeHarnessResult(receipt, 'cleave', ledger.cases.cleave, ledger)).toMatchObject({
    caseStatus: 'exported', batchStatus: 'ready', activeCase: null,
  });
  expect(receipt.after.ledger.activeCase).toBe('cleave');
});
const kinds = ['cleave', 'graze', 'nick', 'push', 'sap', 'slow', 'topple', 'vex'];

function fields(): HarnessFields {
  return { profile: 'cotn-midi', confirmed: true, ledgerMessageId: '', scenario: 'slow',
    vexUuid: 'Compendium.dnd5e.equipment24.Item.vex', slowUuid: 'Compendium.dnd5e.equipment24.Item.slow',
    pushUuid: 'Compendium.dnd5e.equipment24.Item.push', extraSources: '{}', propertyRules: '{}', nickFirstUuid: '',
    expectedSettings: '[{"namespace":"midi-qol","key":"testSetting","value":true}]',
    observations: '{}', cleanupRunId: '', receiptSaved: false, closeCase: false };
}

function world() {
  const calls: any[] = [];
  const helper = { ensureBatch: async (value: any) => { calls.push(value); return { ledger: { messageId: 'ledger-1' } }; } };
  const modules = new Map([
    [moduleId, { id: moduleId, version: '0.1.0', active: true, api: { buildId: 'actual-build' } }],
    ['fvtt-custom-conditions', { id: 'fvtt-custom-conditions', version: '0.1.1', active: true }],
    ['fvtt-trigger-engine', { id: 'fvtt-trigger-engine', version: '0.1.1', active: true }],
    ['midi-qol', { id: 'midi-qol', version: '14.0.11', active: true }],
  ]) as Map<string, any>;
  const globals: any = { WMP_E2E: helper, crypto: { randomUUID: () => '12345678-aaaa-bbbb-cccc-dddddddddddd' },
    document: { createElement: () => ({ tagName: 'DIV', attributes: [], innerHTML: '' }) },
    game: { world: { id: 'cor-cotn' }, version: '14.364', system: { id: 'dnd5e', version: '5.3.3' },
      user: { id: 'gm', isGM: true, active: true }, users: { activeGM: { id: 'gm' } },
      modules, settings: { get: () => true }, packs: [] },
  };
  return { globals, calls };
}

test('GM-only switch and exact profile feed current build plus supplied settings into batch creation', async () => {
  const { globals, calls } = world();
  expect(isHarnessEnabled(globals)).toBe(true);
  await performHarnessAction('ensure', fields(), globals);
  expect(calls[0]).toMatchObject({ expectedBuildId: 'actual-build',
    expectedSettings: [{ namespace: 'midi-qol', key: 'testSetting', value: true }],
    weaponSourceUuids: { vex: fields().vexUuid, slow: fields().slowUuid, push: fields().pushUuid } });
  globals.game.user.isGM = false;
  expect(isHarnessEnabled(globals)).toBe(false);
  await expect(performHarnessAction('ensure', fields(), globals)).rejects.toThrow('GM-only');
});

test('explicit native profile rejects active Midi and world switch is restricted to GM', async () => {
  const { globals } = world();
  const settings: any[] = [];
  globals.game.settings.register = (...args: any[]) => settings.push(args);
  registerE2EHarnessSetting(globals);
  expect(settings[0][2]).toMatchObject({ scope: 'world', default: false, restricted: true });
  await expect(performHarnessAction('ensure', { ...fields(), profile: 'cotn-native' }, globals))
    .rejects.toThrow('does not match');
});

test('official source scan uses exact mastery metadata and real Attack Activities', async () => {
  const { globals } = world();
  const documents = kinds.map(kind => ({ uuid: `Compendium.dnd5e.equipment24.Item.${kind}`, type: 'weapon',
    name: `Localized ${kind}`, system: { mastery: kind, activities: [{ type: 'attack' }],
      properties: kind === 'nick' || kind === 'vex' ? { lgt: true } : {} } }));
  documents.push({ uuid: 'Compendium.dnd5e.equipment24.Item.false', type: 'weapon', name: 'Vex',
    system: { mastery: 'other', activities: [{ type: 'attack' }], properties: {} } });
  documents.unshift({ uuid: 'Compendium.dnd5e.equipment24.Item.magic', type: 'weapon', name: 'Special magic weapon',
    system: { mastery: 'vex', activities: [{ type: 'attack' }], properties: { mgc: true }, rarity: 'rare' } } as any);
  globals.game.packs = [{ collection: 'dnd5e.equipment24', documentName: 'Item', metadata: { packageName: 'dnd5e' },
    getIndex: async () => documents.map((item, index) => ({ _id: String(index), type: item.type,
      system: { mastery: item.system.mastery, properties: item.system.properties } })),
    getDocument: async (id: string) => documents[Number(id)] }];
  const result = await discoverOfficialWeaponSources(globals);
  expect(result.weaponSourceUuids.vex).toBe('Compendium.dnd5e.equipment24.Item.vex');
  expect(result.weaponSourceUuids.deadly).toBe(result.weaponSourceUuids.vex);
  expect(result.supportWeaponSourceUuids.nickFirst).toBe(result.weaponSourceUuids.vex);
  expect(result.missingMasteries).toEqual([]);
  expect(result.propertyRules.deadly.params).toEqual({ dice: 1, die: 8 });
});

test('panel keeps a compact action footer and can close without running a case', async () => {
  const { globals } = world();
  let dialog: any;
  globals.foundry = { applications: { api: { DialogV2: { wait: async (options: any) => { dialog = options; return null; } } } } };
  await openE2EHarness(globals);
  expect(dialog.modal).toBe(false);
  expect(dialog.buttons.map((button: any) => button.action)).toEqual(['execute', 'copy', 'close']);
  expect(dialog.content.tagName).toBe('DIV');
  expect(dialog.content.attributes).toEqual([]);
  expect(dialog.content.innerHTML).toContain('Record UI start');
  expect(dialog.content.innerHTML).toContain('Vex: save first-hit checkpoint');
  expect(dialog.content.innerHTML).toContain('attacker');
});

test('Vex summary shows both actors and the saved attack checkpoint', () => {
  const summary = summarizeHarnessResult({ before: { source: { hpValue: 120 }, target: { hpValue: 200 } },
    after: { ledger: { status: 'ready', activeCase: 'vex', cases: { vex: { status: 'awaiting-observation' } } },
      source: { hpValue: 120, effects: [{ id: 'vex-effect', name: 'Vex' }], weapon: {
        useGate: { equipped: false, isEmbedded: true, isOwner: true, hasItemMacro: false },
        attackActivities: [{ id: 'attack-1', canUse: true }],
      } },
      target: { hpValue: 194, effects: [] },
      sourceSelection: { sourceTokenId: 'source-token', controlledTokenIds: ['source-token'], matches: true },
      targetSelection: { targetTokenId: 'target-token', selectedTokenIds: ['target-token'], matches: true },
      chatMessages: [
        { id: 'next-card', moduleFlags: { attackId: 'next' }, dnd5eFlags: { roll: { type: 'attack' } } }] },
    checkpoint: { status: 'SAVED', attackId: 'first', effectId: 'vex-effect' },
    classifiedInput: { rules: { vex: { attack: { attackId: 'first' } } } } }, 'vex');
  expect(summary).toMatchObject({ caseStatus: 'awaiting-observation', batchStatus: 'ready', activeCase: 'vex',
    attackerHP: { before: 120, after: 120 },
    targetHP: { before: 200, after: 194 }, attackerEffects: [{ id: 'vex-effect' }],
    targetEffects: [], attack: { attackId: 'first' },
    sourceSelection: { sourceTokenId: 'source-token', matches: true },
    weaponUseGate: { equipped: false, isEmbedded: true, isOwner: true, hasItemMacro: false,
      attackActivities: [{ id: 'attack-1', canUse: true }] },
    targetSelection: { targetTokenId: 'target-token', matches: true },
    recentAttacks: [{ messageId: 'next-card', attackId: 'next', rollType: 'attack' }],
    checkpoint: { status: 'SAVED', effectId: 'vex-effect' } });
});

test('isolated reconciliation summary exposes the required new batch and exact retained IDs', () => {
  const summary = summarizeHarnessResult({ status: 'isolated', scenario: 'vex', requireNewBatch: true,
    retainedIds: { ledgerMessageId: 'ledger-1', sceneId: 'scene-1', combatId: 'combat-1',
      actorIds: { source: 'actor-1' }, itemIds: { vex: 'item-1' }, tokenIds: { source: 'token-1' } },
    reconciliation: { attackTerminal: false, pendingAttacks: [{ attackId: 'attack-1', step: 'attack' }],
      isolationReason: 'Documented incomplete attack' } }, 'vex', { status: 'isolated' });
  expect(summary).toMatchObject({ status: 'isolated', caseStatus: 'isolated', requireNewBatch: true,
    retainedIds: { sceneId: 'scene-1', itemIds: { vex: 'item-1' } },
    reconciliation: { pendingAttacks: [{ attackId: 'attack-1', step: 'attack' }] } });
});

test('saved receipt appears as a native download link without embedding raw JSON in the panel', async () => {
  const { globals } = world();
  const receipt = { runId: 'WMP-E2E-EXISTING', scenario: 'push', marker: 'old-build' };
  globals.game.messages = new Map([['ledger-1', { id: 'ledger-1', getFlag: () => ({
    role: 'ledger', runId: receipt.runId, ledger: { status: 'ready', cases: { push: { status: 'exported', receipt } } },
  }) }]]);
  globals.sessionStorage = { getItem: () => JSON.stringify({ ...fields(), ledgerMessageId: 'ledger-1', scenario: 'push' }),
    setItem: () => undefined };
  const urls: string[] = [];
  const released: string[] = [];
  const scheduled: Array<() => void> = [];
  globals.Blob = Blob;
  globals.URL = { createObjectURL: (_blob: Blob) => { urls.push('blob:task-receipt'); return urls.at(-1); },
    revokeObjectURL: (url: string) => released.push(url) };
  globals.setTimeout = (callback: () => void) => scheduled.push(callback);
  let content = '';
  globals.foundry = { applications: { api: { DialogV2: { wait: async (options: any) => {
    content = options.content.innerHTML;
    return options.buttons.find((button: any) => button.action === 'close').callback(null, null, {});
  } } } } };
  await openE2EHarness(globals);
  expect(content).toContain('href="blob:task-receipt"');
  expect(content).toContain('download="wmp-e2e-push-');
  expect(content).toContain('Download last JSON');
  expect(content).not.toContain('old-build');
  expect(urls).toEqual(['blob:task-receipt']);
  expect(released).toEqual([]);
  scheduled.forEach(callback => callback());
  expect(released).toEqual(['blob:task-receipt']);
});

test('saved and newly exported Vex receipts use the same automatic association without editing stored evidence', async () => {
  const { globals, calls } = world();
  const receipt = JSON.parse(readFileSync(new URL('./fixtures/vex-two-hit-receipt.json', import.meta.url), 'utf8'));
  const original = JSON.stringify(receipt);
  globals.game.messages = new Map([['ledger-1', { getFlag: () => ({ role: 'ledger', runId: receipt.runId,
    ledger: { worldId: 'cor-cotn', cases: { vex: { status: 'exported', receipt } } } }) }]]);
  globals.WMP_E2E.exportReceipt = async () => receipt;
  const selected = { ...fields(), ledgerMessageId: 'ledger-1', scenario: 'vex' };
  for (const action of ['loadReceipt', 'export']) {
    const result = await performHarnessAction(action, selected, globals);
    expect(result.classification.rules.vex.status).toBe('PASS');
    expect(result.evidenceAssociation).toMatchObject({ status: 'derived', scope: 'advantage-consumption-and-regrant' });
    expect(summarizeHarnessResult(result, 'vex').nextAttack).toMatchObject({
      messageId: 'FixtureRoll00002', advantage: true, oldEffectPresent: false, regrantEffectId: 'FixtureEffect002',
    });
  }
  expect(JSON.stringify(receipt)).toBe(original);
  expect(calls).toEqual([]);
});

test('Load selected saved receipt reads only the exact batch and case', async () => {
  const { globals, calls } = world();
  const receipt = { runId: 'WMP-E2E-EXISTING', scenario: 'push', marker: 'old-build', classifiedInput: {} };
  globals.game.messages = new Map([['ledger-1', { getFlag: () => ({ role: 'ledger', runId: receipt.runId,
    ledger: { worldId: 'cor-cotn', cases: { push: { status: 'exported', receipt } } } }) }]]);
  const selected = { ...fields(), ledgerMessageId: 'ledger-1', scenario: 'push' };
  expect(await performHarnessAction('loadReceipt', selected, globals)).toMatchObject({ ...receipt,
    classification: { environment: { status: 'INCOMPLETE', reasons: ['environment-snapshot-missing'] } } });
  await expect(performHarnessAction('loadReceipt', { ...selected, scenario: 'vex' }, globals))
    .rejects.toThrow('No saved receipt');
  expect(calls).toHaveLength(0);
});

test('Copy last starts the clipboard write inside the button callback', async () => {
  const { globals } = world();
  const receipt = { runId: 'WMP-E2E-EXISTING', scenario: 'push', marker: 'old-build' };
  globals.game.messages = new Map([['ledger-1', { getFlag: () => ({ role: 'ledger', runId: receipt.runId,
    ledger: { status: 'ready', cases: { push: { status: 'exported', receipt } } } }) }]]);
  globals.sessionStorage = { getItem: () => JSON.stringify({ ...fields(), ledgerMessageId: 'ledger-1', scenario: 'push' }),
    setItem: () => undefined };
  let phase = 'idle';
  let dialogs = 0;
  const writes: any[] = [];
  globals.navigator = { clipboard: { writeText: async (value: string) => writes.push({ phase, value }) } };
  globals.foundry = { applications: { api: { DialogV2: { wait: async (options: any) => {
    const action = ++dialogs === 1 ? 'copy' : 'close';
    phase = 'callback';
    const result = await options.buttons.find((button: any) => button.action === action).callback(null, null, {});
    phase = 'after-callback';
    return result;
  } } } } };
  await openE2EHarness(globals);
  expect(writes).toHaveLength(1);
  expect(writes[0].phase).toBe('callback');
  expect(JSON.parse(writes[0].value)).toEqual(receipt);
});

test('closing the panel preserves edited case and observations without executing a test', async () => {
  const { globals, calls } = world();
  let saved = '';
  globals.sessionStorage = { getItem: () => saved || null, setItem: (_key: string, value: string) => { saved = value; } };
  const form = { querySelector: (selector: string) => selector.includes('scenario') ? { value: 'vex' }
    : selector.includes('observations') ? { value: '{"note":"keep"}' } : undefined };
  globals.foundry = { applications: { api: { DialogV2: { wait: async (options: any) =>
    options.buttons.find((button: any) => button.action === 'close').callback(null, null, { element: form }) } } } };
  await openE2EHarness(globals);
  expect(JSON.parse(saved)).toMatchObject({ scenario: 'vex', observations: '{"note":"keep"}' });
  expect(calls).toHaveLength(0);
});

test('one-click public API resets only a free or completed case and keeps an armed UI case', async () => {
  const { globals } = world();
  const calls: string[] = [];
  const ledger: any = { activeCase: null, cases: {} };
  globals.game.messages = new Map([['ledger-1', { getFlag: () => ({ ledger }) }]]);
  globals.WMP_E2E.resetCase = async () => { calls.push('reset'); ledger.activeCase = 'slow'; ledger.cases.slow = { status: 'reset' }; };
  globals.WMP_E2E.runCase = async ({ source }: any) => { calls.push(source); return { status: 'awaiting-observation', source }; };
  const input = { ...fields(), ledgerMessageId: 'ledger-1' };
  await performHarnessAction('runApi', input, globals);
  expect(calls).toEqual(['reset', 'runtime-api']);
  ledger.cases.slow = { status: 'awaiting-observation', source: 'ui-activity', startedAt: 17 };
  calls.length = 0;
  await performHarnessAction('runApi', input, globals);
  expect(calls).toEqual(['runtime-api']);
  expect(summarizeHarnessResult(null, 'slow', ledger.cases.slow).status).toContain('已准备，请攻击');
  ledger.activeCase = 'vex';
  calls.length = 0;
  await expect(performHarnessAction('runApi', input, globals)).rejects.toThrow('Finish active case vex');
  expect(calls).toEqual([]);
});
