import { classifyWeaponEvidence } from '../e2e/evidence.ts';
import { normalizeWeaponExport } from '../e2e/receipt-evidence.ts';
import { MODULE_ID } from './constants.ts';

const SETTING = 'e2eHarnessEnabled';
const CASES = ['slow', 'vex', 'push', 'cleave', 'graze', 'nick', 'sap', 'topple', 'deadly', 'fatal', 'criticalBleeding'];
const MASTERIES = ['cleave', 'graze', 'nick', 'push', 'sap', 'slow', 'topple', 'vex'];
const DEFAULT_PROPERTY_RULES = {
  deadly: { ruleId: 'house.deadly', kind: 'deadly', label: 'Deadly', params: { dice: 1, die: 8 }, stackingGroup: 'house.deadly' },
  fatal: { ruleId: 'house.fatal', kind: 'fatal', label: 'Fatal', params: { die: 10 }, stackingGroup: 'house.fatal' },
  criticalBleeding: { ruleId: 'house.criticalBleeding', kind: 'criticalBleeding', label: 'Critical Bleeding',
    params: { formula: '1d6', mode: 'damage', damageType: 'slashing', endOnHealing: true }, stackingGroup: 'house.criticalBleeding' },
};

function escape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function values(collection: any): any[] {
  return collection?.contents ?? (collection?.values ? [...collection.values()] : []);
}

function parseRecord(text: string, label: string): Record<string, any> {
  const value = JSON.parse(text || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);
  return value;
}

function parseSettings(text: string): Array<{ namespace: string; key: string; value: unknown }> {
  const value = JSON.parse(text || '[]');
  if (!Array.isArray(value) || value.some(entry => !entry || typeof entry.namespace !== 'string'
    || typeof entry.key !== 'string' || !Object.prototype.hasOwnProperty.call(entry, 'value'))) {
    throw new Error('Expected settings must be a JSON array of {namespace,key,value}.');
  }
  return value;
}

function lightWeapon(item: any): boolean {
  const properties = item?.system?.properties;
  return properties instanceof Set ? properties.has('lgt') : Boolean(properties?.lgt ?? properties?.light);
}

/** Explicit scan of official dnd5e Item packs by metadata, never by a localized name. */
export async function discoverOfficialWeaponSources(globals: any = globalThis): Promise<any> {
  if (!isHarnessEnabled(globals)) throw new Error('Only the active GM may scan official weapon sources.');
  const found: Record<string, string> = {};
  const scores: Record<string, number> = {};
  const light: string[] = [];
  const packIds: string[] = [];
  const packs = values(globals.game?.packs).filter(pack => pack?.documentName === 'Item'
    && (pack.metadata?.packageName ?? pack.metadata?.package) === 'dnd5e')
    .sort((a, b) => Number(/equipment|weapon/i.test(String(b.collection ?? b.metadata?.name)))
      - Number(/equipment|weapon/i.test(String(a.collection ?? a.metadata?.name))));
  for (const pack of packs) {
    if (typeof pack.getIndex !== 'function' || typeof pack.getDocument !== 'function') continue;
    packIds.push(String(pack.collection ?? pack.metadata?.name ?? 'dnd5e Item'));
    const index = await pack.getIndex({ fields: ['type', 'system.mastery', 'system.properties'] });
    const candidates = values(index).filter(entry => {
      const mastery = entry.system?.mastery ?? entry['system.mastery'];
      const kind = typeof mastery === 'string' ? mastery.replace(/^dnd2024\./, '') : '';
      return entry.type === 'weapon' && (MASTERIES.includes(kind)
        || lightWeapon({ system: { properties: entry.system?.properties ?? entry['system.properties'] } }));
    });
    for (const candidate of candidates) {
      const item = await pack.getDocument(candidate._id ?? candidate.id);
      if (item?.type !== 'weapon' || !values(item.system?.activities).some(activity => activity.type === 'attack')
        || typeof item.uuid !== 'string') continue;
      const properties = item.system?.properties;
      const magical = properties?.has?.('mgc') === true || (Array.isArray(properties) ? properties.includes('mgc') : properties?.mgc === true);
      if (magical || Number(item.system?.magicalBonus) > 0
        || (item.system?.rarity && item.system.rarity !== 'common')) continue;
      const mastery = item.system?.mastery;
      const kind = typeof mastery === 'string' ? mastery.replace(/^dnd2024\./, '') : '';
      const score = /M$/.test(String(item.system?.type?.value ?? '')) ? 2 : 1;
      if (MASTERIES.includes(kind) && score > (scores[kind] ?? 0)) { found[kind] = item.uuid; scores[kind] = score; }
      if (lightWeapon(item)) light.push(item.uuid);
    }
    if (MASTERIES.every(kind => found[kind]) && light.some(uuid => uuid !== found.nick)) break;
  }
  for (const kind of ['vex', 'slow', 'push']) if (!found[kind]) throw new Error(`No official dnd5e Attack Activity weapon with system.mastery=${kind} was found.`);
  const nickFirst = light.find(uuid => uuid !== found.nick) ?? '';
  return { weaponSourceUuids: { ...found, deadly: found.vex, fatal: found.vex, criticalBleeding: found.vex },
    supportWeaponSourceUuids: nickFirst ? { nickFirst } : {},
    propertyRules: DEFAULT_PROPERTY_RULES,
    missingMasteries: MASTERIES.filter(kind => !found[kind]), packIds };
}

export function isHarnessEnabled(globals: any = globalThis): boolean {
  const user = globals?.game?.user;
  return user?.isGM === true && user?.active !== false && globals?.game?.users?.activeGM?.id === user.id
    && globals?.game?.settings?.get?.(MODULE_ID, SETTING) === true;
}

export function registerE2EHarnessSetting(globals: any = globalThis): void {
  globals?.game?.settings?.register?.(MODULE_ID, SETTING, {
    name: 'Weapon Mastery GM E2E harness (development only)',
    hint: 'Enable the GM-only task fixture and receipt panel for the exact CoTN test world.',
    scope: 'world', config: true, type: Boolean, default: false, restricted: true,
    onChange: (enabled: boolean) => {
      globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS__ = enabled && globals?.game?.user?.isGM === true;
      if (enabled && globals?.game?.ready && globals?.game?.user?.isGM) installE2EHarness(globals);
      globals?.ui?.controls?.render?.({ reset: true });
    },
  });
}

export function installE2EHarness(globals: any = globalThis): any {
  if (!isHarnessEnabled(globals)) throw new Error('Enable the GM-only E2E harness world setting first.');
  globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS__ = true;
  if (!globals.WMP_E2E && typeof globals.WMP_E2E_INSTALL === 'function') globals.WMP_E2E_INSTALL();
  if (!globals.WMP_E2E) throw new Error('Bundled WMP E2E helper is unavailable.');
  return globals.WMP_E2E;
}

export interface HarnessFields {
  profile: string;
  confirmed: boolean;
  ledgerMessageId: string;
  scenario: string;
  vexUuid: string;
  slowUuid: string;
  pushUuid: string;
  extraSources: string;
  propertyRules: string;
  nickFirstUuid: string;
  expectedSettings: string;
  observations: string;
  cleanupRunId: string;
  receiptSaved: boolean;
  closeCase: boolean;
}

function requireProfile(fields: HarnessFields, globals: any): void {
  if (fields.confirmed !== true) throw new Error('Confirm the exact CoTN world and profile in the panel.');
  if (globals.game?.world?.id !== 'cor-cotn' || (globals.game?.version ?? globals.game?.release?.version) !== '14.364'
    || globals.game?.system?.id !== 'dnd5e' || globals.game?.system?.version !== '5.3.3') {
    throw new Error('This harness requires cor-cotn / Foundry 14.364 / dnd5e 5.3.3.');
  }
  const midiActive = globals.game.modules?.get?.('midi-qol')?.active === true;
  if ((fields.profile === 'cotn-midi') !== midiActive || !['cotn-midi', 'cotn-native'].includes(fields.profile)) {
    throw new Error('Selected Midi/native profile does not match the active module set.');
  }
}

function classifyStoredReceipt(receipt: any): any {
  if (!receipt?.classifiedInput) return receipt;
  const normalized = normalizeWeaponExport(receipt);
  return { ...receipt, classifiedInput: normalized.input, evidenceAssociation: normalized.association,
    classification: classifyWeaponEvidence(normalized.input) };
}

/** One explicit GM action. No attack outcome, damage, or effect is synthesized here. */
export async function performHarnessAction(action: string, fields: HarnessFields, globals: any = globalThis): Promise<any> {
  const helper = installE2EHarness(globals);
  requireProfile(fields, globals);
  if (action === 'scanSources') return discoverOfficialWeaponSources(globals);
  const ledgerMessageId = fields.ledgerMessageId;
  const scenario = fields.scenario;
  if (action === 'ensure') {
    const expectedBuildId = globals.game.modules.get(MODULE_ID)?.api?.buildId;
    if (typeof expectedBuildId !== 'string' || !expectedBuildId) throw new Error('Current bundled build ID is unavailable.');
    const expectedSettings = parseSettings(fields.expectedSettings);
    if (ledgerMessageId) return helper.ensureBatch({ ledgerMessageId, expectedBuildId, expectedSettings });
    const sources = { vex: fields.vexUuid.trim(), slow: fields.slowUuid.trim(), push: fields.pushUuid.trim(),
      ...parseRecord(fields.extraSources, 'Extra source UUIDs') };
    if (Object.values(sources).some(value => typeof value !== 'string' || !value)) {
      throw new Error('Provide real Vex, Slow, and Push source Item UUIDs.');
    }
    const expectedEnabledModules = values(globals.game.modules).filter(module => module.active)
      .map(module => ({ id: module.id, version: String(module.version ?? '') }));
    const runId = `WMP-E2E-${globals.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 12)
      ?? Math.random().toString(36).slice(2, 14)}`;
    return helper.ensureBatch({ runId, expectedEnabledModules, expectedBuildId, expectedSettings,
      weaponSourceUuids: sources, propertyRules: parseRecord(fields.propertyRules, 'Property rules'),
      supportWeaponSourceUuids: fields.nickFirstUuid.trim() ? { nickFirst: fields.nickFirstUuid.trim() } : {} });
  }
  if (!ledgerMessageId) throw new Error('Select or create an exact task ledger first.');
  if (action === 'loadReceipt') {
    const marker = globals.game.messages?.get?.(ledgerMessageId)?.getFlag?.(MODULE_ID, 'e2eFixture');
    const receipt = marker?.ledger?.cases?.[scenario]?.receipt;
    if (marker?.role !== 'ledger' || marker.ledger?.worldId !== globals.game.world?.id
      || !receipt || receipt.runId !== marker.runId || receipt.scenario !== scenario) {
      throw new Error('No saved receipt belongs to this exact batch and case.');
    }
    return classifyStoredReceipt(receipt);
  }
  if (action === 'prepareCombat') return helper.prepareCombat({ ledgerMessageId });
  if (action === 'openSource') {
    const ledger = globals.game.messages?.get?.(ledgerMessageId)?.getFlag?.(MODULE_ID, 'e2eFixture')?.ledger;
    const source = globals.game.actors?.get?.(ledger?.actorIds?.source);
    const marker = source?.getFlag?.(MODULE_ID, 'e2eFixture');
    if (!ledger || marker?.runId !== ledger.runId || marker.role !== 'source') throw new Error('Task source Actor ownership differs.');
    await source.sheet.render({ force: true });
    return { status: 'source-sheet-open', actorId: source.id };
  }
  if (action === 'adoptBuild') return helper.adoptBuild({ ledgerMessageId,
    expectedBuildId: globals.game.modules.get(MODULE_ID)?.api?.buildId, receiptsSaved: fields.receiptSaved });
  if (action === 'registerCombat') return helper.registerCombat({ ledgerMessageId, combatId: globals.game.combat?.id });
  if (action === 'reset') return helper.resetCase({ ledgerMessageId, scenario });
  if (action === 'runUi') return helper.runCase({ ledgerMessageId, scenario, source: 'ui-activity' });
  if (action === 'runApi') {
    const ledger = globals.game.messages?.get?.(ledgerMessageId)?.getFlag?.(MODULE_ID, 'e2eFixture')?.ledger;
    if (!ledger) throw new Error('Exact task ledger is unavailable.');
    if (ledger.activeCase && ledger.activeCase !== scenario) throw new Error(`Finish active case ${ledger.activeCase} first.`);
    const status = ledger.cases?.[scenario]?.status;
    if (!status || status === 'exported' || status === 'abandoned') await helper.resetCase({ ledgerMessageId, scenario });
    return helper.runCase({ ledgerMessageId, scenario, source: 'runtime-api' });
  }
  if (action === 'snapshot') return { ...helper.snapshot({ ledgerMessageId, scenario }),
    diagnostics: globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS_LOG__ ?? [] };
  if (action === 'checkpointVex') {
    if (scenario !== 'vex') throw new Error('Select the Vex case for its first-hit checkpoint.');
    return helper.checkpointVex({ ledgerMessageId, observations: parseRecord(fields.observations, 'Observations') });
  }
  if (action === 'prepareVexNext') {
    if (scenario !== 'vex') throw new Error('Select the Vex case for its second-attack check.');
    return helper.prepareVexNext({ ledgerMessageId });
  }
  if (action === 'recordVexPreRoll') {
    if (scenario !== 'vex') throw new Error('Select the Vex case for its advantage observation.');
    return helper.recordVexPreRoll({ ledgerMessageId,
      observation: parseRecord(fields.observations, 'Observations').vexPreRoll });
  }
  if (action === 'export') {
    const observations = parseRecord(fields.observations, 'Observations');
    const receipt = await helper.exportReceipt({ ledgerMessageId, scenario,
      observations: { ...observations, closeCase: fields.closeCase } });
    return classifyStoredReceipt(receipt);
  }
  if (action === 'cleanup') {
    const ledger = globals.game.messages?.get?.(ledgerMessageId)?.getFlag?.(MODULE_ID, 'e2eFixture')?.ledger;
    if (!ledger || fields.cleanupRunId !== ledger.runId) throw new Error('Type the exact batch run ID before cleanup.');
    return helper.cleanupBatch({ ledgerMessageId });
  }
  if (action === 'finalize') return helper.finalize({ ledgerMessageId, externalReceiptSaved: fields.receiptSaved });
  if (action === 'reconcile') return helper.reconcileCase({ ledgerMessageId, scenario,
    isolationReason: parseRecord(fields.observations, 'Observations').isolationReason });
  throw new Error(`Unknown harness action: ${action}`);
}

function ledgerChoices(globals: any): Array<{ id: string; runId: string; status: string }> {
  return values(globals.game?.messages).map(message => {
    const marker = message.getFlag?.(MODULE_ID, 'e2eFixture');
    return marker?.role === 'ledger' ? { id: String(message.id), runId: String(marker.runId), status: String(marker.ledger?.status ?? '?') } : null;
  }).filter((choice): choice is { id: string; runId: string; status: string } => choice !== null);
}

function readFields(dialog: any, state: HarnessFields): HarnessFields {
  const root = dialog?.element ?? dialog?.form;
  const field = (name: string) => root?.querySelector?.(`[name="${name}"]`);
  return {
    profile: field('profile')?.value ?? state.profile,
    confirmed: field('confirmed')?.checked === true,
    ledgerMessageId: field('ledgerMessageId')?.value ?? state.ledgerMessageId,
    scenario: field('scenario')?.value ?? state.scenario,
    vexUuid: field('vexUuid')?.value ?? state.vexUuid,
    slowUuid: field('slowUuid')?.value ?? state.slowUuid,
    pushUuid: field('pushUuid')?.value ?? state.pushUuid,
    extraSources: field('extraSources')?.value ?? state.extraSources,
    propertyRules: field('propertyRules')?.value ?? state.propertyRules,
    nickFirstUuid: field('nickFirstUuid')?.value ?? state.nickFirstUuid,
    expectedSettings: field('expectedSettings')?.value ?? state.expectedSettings,
    observations: field('observations')?.value ?? state.observations,
    cleanupRunId: field('cleanupRunId')?.value ?? state.cleanupRunId,
    receiptSaved: field('receiptSaved')?.checked === true,
    closeCase: field('closeCase')?.checked === true,
  };
}

function loadPanelState(globals: any, fallback: HarnessFields): HarnessFields {
  try {
    const saved = JSON.parse(globals.sessionStorage?.getItem?.(`${MODULE_ID}.e2ePanel`) ?? 'null');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...fallback, ...saved } : fallback;
  } catch { return fallback; }
}

function savePanelState(globals: any, fields: HarnessFields): void {
  globals.sessionStorage?.setItem?.(`${MODULE_ID}.e2ePanel`, JSON.stringify(fields));
}

export function summarizeHarnessResult(result: any, scenario: string, caseState?: any, batchState?: any): any {
  if (!result && caseState?.status === 'awaiting-observation' && caseState.source === 'ui-activity') {
    return { status: '已准备，请攻击；完成真实 Activity 和伤害应用后导出收据',
      scenario, startedAt: caseState.startedAt, activeSource: 'ui-activity',
      vexCheckpoint: caseState.vexCheckpoint, vexPreRoll: caseState.vexPreRoll };
  }
  if (!result) return { status: caseState?.status ?? 'Ready', scenario };
  const after = result.after ?? result;
  const rule = result.classification?.rules?.[scenario];
  return {
    status: rule?.status ?? result.status ?? (result.error ? 'ERROR' : 'Observed'),
    caseStatus: caseState?.status ?? after.ledger?.cases?.[scenario]?.status,
    batchStatus: batchState?.status ?? after.ledger?.status,
    activeCase: batchState ? batchState.activeCase : after.ledger?.activeCase,
    requireNewBatch: result.requireNewBatch,
    retainedIds: result.retainedIds,
    reconciliation: result.reconciliation,
    error: result.error, reasons: rule?.reasons ?? after.preflight?.reasons,
    batch: result.runId ?? after.ledger?.runId, scene: after.ledger?.sceneId, combat: after.ledger?.combatId,
    targetHP: { before: result.before?.target?.hpValue, after: after.target?.hpValue },
    attackerHP: { before: result.before?.source?.hpValue, after: after.source?.hpValue },
    targetSpeed: { before: result.before?.target?.movement?.walk, after: after.target?.movement?.walk },
    paused: after.environment?.observed?.paused,
    sourceTokenId: after.source?.token?.id,
    weaponUseGate: { ...after.source?.weapon?.useGate,
      attackActivities: after.source?.weapon?.attackActivities?.map((activity: any) => ({ id: activity.id, canUse: activity.canUse })) },
    sourceSelection: after.sourceSelection,
    targetSelection: after.targetSelection,
    cleaveGeometry: after.cleaveGeometry,
    attackerEffects: after.source?.effects?.map((effect: any) => ({ id: effect.id, name: effect.name, disabled: effect.disabled })),
    targetEffects: after.target?.effects?.map((effect: any) => ({ id: effect.id, name: effect.name, disabled: effect.disabled })),
    attack: result.classifiedInput?.rules?.[scenario]?.attack,
    evidenceAssociation: result.evidenceAssociation,
    nextAttack: result.classifiedInput?.rules?.[scenario]?.nextAttack && {
      attackId: result.classifiedInput.rules[scenario].nextAttack.attackId,
      messageId: result.classifiedInput.rules[scenario].nextAttack.messageId,
      advantage: result.classifiedInput.rules[scenario].nextAttack.advantageObservation?.advantage,
      oldEffectPresent: result.classifiedInput.rules[scenario].nextAttack.effectAfter?.present,
      regrantEffectId: result.classifiedInput.rules[scenario].nextAttack.regrant?.effectReadback?.instance?.id,
    },
    recentAttacks: after.chatMessages?.filter((message: any) => message.moduleFlags?.attackId
      || message.dnd5eFlags?.roll?.type === 'attack').slice(-4).map((message: any) => ({
      messageId: message.id, attackId: message.moduleFlags?.attackId, rollType: message.dnd5eFlags?.roll?.type })),
    checkpoint: result.checkpoint ?? result.vexCheckpoint ?? caseState?.vexCheckpoint,
    vexPreRoll: result.vexPreRoll ?? caseState?.vexPreRoll,
    actualDamage: result.actualDamageDelta,
    diagnostics: result.diagnostics,
  };
}

/** GM panel with durable ledger selection; repeat an action without editing a macro. */
export async function openE2EHarness(globals: any = globalThis): Promise<any> {
  installE2EHarness(globals);
  const DialogV2 = globals?.foundry?.applications?.api?.DialogV2;
  if (typeof DialogV2?.wait !== 'function') throw new Error('Foundry DialogV2 is unavailable.');
  let state: HarnessFields = loadPanelState(globals, { profile: 'cotn-midi', confirmed: false, ledgerMessageId: '', scenario: 'slow',
    vexUuid: '', slowUuid: '', pushUuid: '', extraSources: '{}', propertyRules: '{}', nickFirstUuid: '',
    expectedSettings: '[]', observations: '{}', cleanupRunId: '', receiptSaved: false, closeCase: false });
  let last: any = classifyStoredReceipt(globals.game.messages?.get?.(state.ledgerMessageId)?.getFlag?.(MODULE_ID, 'e2eFixture')
    ?.ledger?.cases?.[state.scenario]?.receipt ?? null);
  while (true) {
    const choices = ledgerChoices(globals);
    const selectedLedger = globals.game.messages?.get?.(state.ledgerMessageId)
      ?.getFlag?.(MODULE_ID, 'e2eFixture')?.ledger;
    const selectedCase = selectedLedger?.cases?.[state.scenario];
    const summary = summarizeHarnessResult(last, state.scenario, selectedCase, selectedLedger);
    let downloadUrl: string | null = null;
    let downloadError: string | null = null;
    if (last) {
      try {
        downloadUrl = globals.URL.createObjectURL(new globals.Blob([JSON.stringify(last, null, 2)],
          { type: 'application/json' }));
      } catch (error) { downloadError = String(error); }
    }
    const downloadName = `wmp-e2e-${state.scenario}-${Date.now()}.json`;
    const content = `<div class="standard-form" style="display:grid;gap:.45rem;max-height:65vh;overflow:auto">
      <p><b>GM development harness</b> · current build <code>${escape(globals.game.modules.get(MODULE_ID)?.api?.buildId)}</code></p>
      <label>Exact environment <select name="profile"><option value="cotn-midi" ${state.profile === 'cotn-midi' ? 'selected' : ''}>CoTN + Midi</option><option value="cotn-native" ${state.profile === 'cotn-native' ? 'selected' : ''}>CoTN native (Midi disabled)</option></select></label>
      <label><input type="checkbox" name="confirmed" ${state.confirmed ? 'checked' : ''}> I checked cor-cotn / 14.364 / dnd5e 5.3.3 and the selected module profile</label>
      <label>Batch <select name="ledgerMessageId"><option value="">Create new</option>${choices.map(choice => `<option value="${escape(choice.id)}" ${state.ledgerMessageId === choice.id ? 'selected' : ''}>${escape(`${choice.runId} (${choice.status})`)}</option>`).join('')}</select></label>
      <label>Case <select name="scenario">${CASES.map(name => `<option value="${name}" ${state.scenario === name ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
      <label>Operation <select name="operation">${[
        ['scanSources', 'Scan official dnd5e weapons'], ['ensure', 'Create / resume batch'], ['prepareCombat', 'Prepare task scene and Combat'],
        ['openSource', 'Open task attacker sheet'], ['adoptBuild', 'Accept updated build (keep fixtures)'], ['registerCombat', 'Register current Combat (manual setup)'],
        ['reset', 'Reset case'], ['runUi', 'Record UI start (then use Activity outside panel)'],
        ['runApi', 'Run public Activity API'], ['loadReceipt', 'Load selected saved receipt'], ['snapshot', 'Snapshot'],
        ['checkpointVex', 'Vex: save first-hit checkpoint'], ['prepareVexNext', 'Vex: check target and effect'],
        ['recordVexPreRoll', 'Vex: record dialog before roll'], ['export', 'Export receipt'],
        ['reconcile', 'Reconcile interrupted case'], ['cleanup', 'Cleanup exact batch'], ['finalize', 'Finalize ledger'],
      ].map(([action, label]) => `<option value="${action}">${escape(label)}</option>`).join('')}</select></label>
      <details><summary>New batch: real source Item UUIDs and exact settings</summary>
        <label>Vex UUID <input name="vexUuid" value="${escape(state.vexUuid)}"></label>
        <label>Slow UUID <input name="slowUuid" value="${escape(state.slowUuid)}"></label>
        <label>Push UUID <input name="pushUuid" value="${escape(state.pushUuid)}"></label>
        <label>Other case UUIDs JSON <textarea name="extraSources">${escape(state.extraSources)}</textarea></label>
        <label>House test rules JSON (editable: Deadly d8, Fatal d10, bleeding 1d6 slashing) <textarea name="propertyRules">${escape(state.propertyRules)}</textarea></label>
        <label>Nick first Light weapon UUID <input name="nickFirstUuid" value="${escape(state.nickFirstUuid)}"></label>
        <label>Expected settings JSON [{namespace,key,value}] <textarea name="expectedSettings">${escape(state.expectedSettings)}</textarea></label>
      </details>
      <label>UI observations JSON (choices, card IDs, next attack) <textarea name="observations">${escape(state.observations)}</textarea></label>
      <p>Vex: apply first damage, save checkpoint, check target/effect, then record the real dialog before rolling. For the dialog action, put <code>vexPreRoll</code> in observations with targetActorId, effectId, offeredAdvantage, sourceLabel, selectedMode. For the same-weapon Midi case, export and saved-receipt loading associate the second attack automatically; a second damaging hit must also create a fresh Vex. Ambiguous records remain incomplete.</p>
      <label><input type="checkbox" name="closeCase" ${state.closeCase ? 'checked' : ''}> Close case only after terminal attack</label>
      <label>Cleanup run ID <input name="cleanupRunId" value="${escape(state.cleanupRunId)}"></label>
      <label><input type="checkbox" name="receiptSaved" ${state.receiptSaved ? 'checked' : ''}> Previous receipts saved (accept updated build / finalize)</label>
      <p>${escape(last?.error ?? summary.status)}</p>
      <pre aria-label="Test result summary" style="white-space:pre-wrap">${escape(JSON.stringify(summary, null, 2))}</pre>
      <p>Full receipt: ${downloadUrl ? `<a class="button" href="${escape(downloadUrl)}" download="${escape(downloadName)}">Download last JSON</a>`
        : escape(downloadError ?? 'Run a case or load a saved receipt first.')} Verify the file exists before marking receipts saved.</p>
      </div>`;
    const buttons: any[] = [
      { action: 'execute', label: 'Run selected', callback: (_event: unknown, _button: unknown, dialog: any) => {
        const root = dialog?.element ?? dialog?.form;
        return { action: root?.querySelector?.('[name="operation"]')?.value, fields: readFields(dialog, state) };
      } },
      { action: 'copy', label: 'Copy last', callback: async (_event: unknown, _button: unknown, dialog: any) => {
        const fields = readFields(dialog, state);
        if (!last) return { action: 'copy', fields, copyError: 'No receipt or snapshot to copy.' };
        try {
          // Start the browser clipboard write while this button's user activation is live.
          await globals.navigator.clipboard.writeText(JSON.stringify(last, null, 2));
          return { action: 'copy', fields };
        } catch (error) { return { action: 'copy', fields, copyError: String(error) }; }
      } },
      { action: 'close', label: 'Close', callback: (_event: unknown, _button: unknown, dialog: any) =>
        ({ action: 'close', fields: readFields(dialog, state) }) },
    ];
    // DialogV2.cleanHTML removes blob: download links from string content. Our own escaped
    // form markup can be passed as a bare DIV so the native download attributes survive.
    const contentElement = globals.document.createElement('div');
    contentElement.innerHTML = content;
    let choice: any;
    try {
      choice = await DialogV2.wait({ window: { title: 'WMP GM E2E harness' }, modal: false, content: contentElement, buttons,
        render: (_event: unknown, dialog: any) => {
          const remember = () => { state = readFields(dialog, state); savePanelState(globals, state); };
          dialog.element?.addEventListener?.('input', remember);
          dialog.element?.addEventListener?.('change', remember);
        } });
    } finally {
      if (downloadUrl) {
        const release = () => globals.URL.revokeObjectURL(downloadUrl);
        if (typeof globals.setTimeout === 'function') globals.setTimeout(release, 60_000);
        else release();
      }
    }
    if (!choice?.action) return last;
    state = choice.fields;
    savePanelState(globals, state);
    if (choice.action === 'close') return last;
    try {
      if (choice.action === 'copy') {
        if (choice.copyError) globals.ui?.notifications?.error?.(choice.copyError);
      }
      else {
        last = await performHarnessAction(choice.action, state, globals);
        if (choice.action === 'scanSources') {
          state.vexUuid = last.weaponSourceUuids.vex;
          state.slowUuid = last.weaponSourceUuids.slow;
          state.pushUuid = last.weaponSourceUuids.push;
          state.extraSources = JSON.stringify(Object.fromEntries(Object.entries(last.weaponSourceUuids)
            .filter(([kind]) => !['vex', 'slow', 'push'].includes(kind))), null, 2);
          state.propertyRules = JSON.stringify(last.propertyRules, null, 2);
          state.nickFirstUuid = last.supportWeaponSourceUuids.nickFirst ?? '';
        }
        if (choice.action === 'ensure') state.ledgerMessageId = last?.ledger?.messageId ?? last?.ledgerMessageId ?? state.ledgerMessageId;
        savePanelState(globals, state);
        if (choice.action === 'runUi' || choice.action === 'runApi' || choice.action === 'openSource') return last;
      }
    } catch (error) {
      last = { error: String(error) };
      globals.ui?.notifications?.error?.(String(error));
    }
  }
}
