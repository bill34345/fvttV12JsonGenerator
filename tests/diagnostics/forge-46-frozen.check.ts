import {afterAll, expect, test} from 'bun:test';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import {analyzeBrowserActorSourceWithAi, generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {createForgeSourceId, hashArtifact, type ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import {prepareFoundryImportArtifact} from '../../foundry-modules/fvtt-json-forge/src/runtime';
import {revalidateIntakeCandidate} from '../../foundry-modules/fvtt-json-forge/src/intakeCandidateRecovery';

const fixtureRoot = process.env.FORGE_46_FIXTURE_ROOT ?? 'H:/CodexData/visualizations';
const evidenceRoot = process.env.FORGE_46_EVIDENCE_ROOT;
const base25 = join(fixtureRoot, '2026/10/25/01a1720b-4563-7511-82df-e8cb00ed7e53');
const base27 = join(fixtureRoot, '2026/10/27/01a17adc-866c-7053-9668-326e795f4b96/forge-offline-five-20261027');
const originalFiles = new Map<string, string>();
const rows: Record<string, unknown>[] = [];
let networkAttempts = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = Object.assign(async () => { networkAttempts++; throw Error('Frozen acceptance forbids network requests'); },
  {preconnect: () => { networkAttempts++; throw Error('Frozen acceptance forbids network preconnect'); }});

interface FrozenCase {
  id: string;
  source: string;
  rawReply: string;
  requestId: string;
  sourceId: ForgeSourceId;
  previousActor?: any;
}

function readText(path: string): string {
  const bytes = readFileSync(path);
  originalFiles.set(path, createHash('sha256').update(bytes).digest('hex'));
  return bytes.toString('utf8').replace(/^\uFEFF/u, '');
}

function readJson(path: string): any { return JSON.parse(readText(path)); }
function activities(item: any): any[] { return Object.values(item.system?.activities ?? {}); }
function sourceIdFor(id: string): ForgeSourceId {
  const bytes = createHash('sha256').update('forge-46-frozen:' + id).digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hash = bytes.toString('hex');
  return createForgeSourceId(() => `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`);
}

function frozenCases(): FrozenCase[] {
  const result: FrozenCase[] = [];
  const medusaRoot = join(fixtureRoot, '2026/10/22/01a163d8-f3e5-7663-bd1b-25d55bfdac88/forge-four-2024-20261023-dc5545/live/medusa');
  const medusa = readJson(join(medusaRoot, 'reply-2-extract.json'));
  result.push({id: 'medusa', source: readText(join(medusaRoot, 'source.md')), rawReply: medusa.content,
    requestId: 'forge-46-medusa', sourceId: sourceIdFor('medusa')});

  const batchRoot = join(base25, 'forge-review-disabled-next-batch');
  const capture = readJson(join(batchRoot, 'browser/first-answer-final-capture.json'));
  const identities = readJson(join(batchRoot, 'continuation-identities.json'));
  for (const id of ['ankheg', 'unicorn', 'spirit-naga']) {
    const prior = capture.cases.find((entry: any) => entry.id === id);
    if (!prior?.evidence?.[0]?.content || !prior.capture?.source) throw Error('Missing original frozen reply: ' + id);
    result.push({id, source: prior.capture.source, rawReply: prior.evidence[0].content,
      requestId: prior.capture.generation?.candidateResponse?.requestId ?? `forge-46-${id}`, sourceId: identities[id]});
  }
  const rakshasa = readJson(join(base25, 'forge-vulnerability-new-extraction-20261026/browser/rakshasa/case.json'));
  result.push({id: 'rakshasa', source: rakshasa.capture.source, rawReply: rakshasa.evidence[0].content,
    requestId: 'forge-46-rakshasa', sourceId: sourceIdFor('rakshasa')});

  for (const [id, directory] of [['shield-guardian', 'single-shield-guardian'], ['otyugh', 'member-otyugh'],
    ['mimic', 'member-mimic'], ['hydra', 'single-hydra'], ['black-pudding', 'single-black-pudding']] as const) {
    const root = join(base27, 'results', directory);
    const analysis = readJson(join(root, 'analysis.json'));
    const generation = readJson(join(root, 'generation.json'));
    const response = generation.candidateResponse;
    result.push({id, source: analysis.candidate.quote, rawReply: readText(join(root, 'raw-answer.txt')),
      requestId: response?.requestId ?? `forge-46-${id}`,
      sourceId: response?.result?.sourceIdentity?.sourceId ?? sourceIdFor(id),
      ...(['hydra', 'black-pudding'].includes(id) ? {previousActor: readJson(join(root, 'actor.json'))} : {})});
  }
  return result;
}

const cases = frozenCases();

function damageFormula(part: any): string {
  if (part.custom?.enabled) return String(part.custom.formula).replace(/\s+/gu, '');
  const dice = part.number ? `${part.number}d${part.denomination}` : '';
  const bonus = String(part.bonus ?? '').replace(/\s+/gu, '');
  return dice + (dice && bonus && !/^[+-]/u.test(bonus) ? '+' : '') + bonus;
}

function containsPart(item: any, formula: string, type: string): boolean {
  const parts = [item.system?.damage?.base, item.system?.damage?.versatile,
    ...activities(item).flatMap(activity => activity.damage?.parts ?? [])].filter(Boolean);
  return parts.some(part => damageFormula(part) === formula.replace(/\s+/gu, '') && part.types?.includes(type));
}

function retainedSourceValues(raw: any, actor: any): void {
  const creature = raw.creature;
  expect(actor.name).toContain(creature.identity.name);
  expect(actor.system.attributes.hp.value).toBe(creature.attributes.hp.value);
  expect(actor.system.attributes.ac.flat).toBe(creature.attributes.ac);
  expect(actor.system.details.cr).toBe(creature.attributes.cr);
  for (const [ability, score] of Object.entries(creature.abilities)) expect(actor.system.abilities[ability].value).toBe(score);
  for (const [mode, distance] of Object.entries(creature.attributes.movement ?? {})) expect(actor.system.attributes.movement[mode]).toBe(distance);
  for (const section of ['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions', 'mythicActions']) {
    for (const feature of creature[section] ?? []) {
      const item = actor.items.find((candidate: any) => candidate.name.includes(feature.name));
      expect(item, `${actor.name}: missing ${section}/${feature.name}`).toBeDefined();
      for (const operation of feature.sourceOperations ?? []) {
        for (const part of operation.damage ?? []) {
          expect(containsPart(item, part.formula, part.type), `${feature.name}: missing ${part.formula} ${part.type}`).toBe(true);
        }
        if (operation.save) expect(activities(item).some(activity => activity.type === 'save'
          && Number(activity.save?.dc?.formula) === operation.save.dc
          && operation.save.abilities.every((ability: string) => activity.save.ability.includes(ability))), `${feature.name}: missing source Save`).toBe(true);
        if (operation.attack) expect(activities(item).some(activity => String(activity.roll?.formula ?? '').replace(/\s+/gu, '') === `1d20${operation.attack.toHit >= 0 ? '+' : ''}${operation.attack.toHit}`
          || activity.type === 'attack' && Number(activity.attack?.bonus) === operation.attack.toHit), `${feature.name}: missing source Attack`).toBe(true);
        if (operation.healing) expect(activities(item).some(activity => activity.type === 'heal'
          && damageFormula(activity.healing) === operation.healing.formula.replace(/\s+/gu, '')
          && activity.healing.types.includes(operation.healing.type)), `${feature.name}: missing source Heal`).toBe(true);
      }
      for (const part of feature.damage ?? []) expect(containsPart(item, part.formula, part.type), `${feature.name}: missing ${part.formula} ${part.type}`).toBe(true);
      if (feature.healing) expect(activities(item).some(activity => activity.type === 'heal'
        && damageFormula(activity.healing) === feature.healing.formula.replace(/\s+/gu, '')
        && activity.healing.types.includes(feature.healing.type)), `${feature.name}: missing source Heal`).toBe(true);
    }
  }
  const groups = creature.spellcasting ? Array.isArray(creature.spellcasting) ? creature.spellcasting : [creature.spellcasting] : [];
  const projected = actor.flags?.['fvtt-json-generator-spell-resolver']?.spellManifest?.spellcastingGroups ?? [];
  for (const group of groups) {
    const found = projected.find((entry: any) => entry.groupId === group.groupId);
    expect(found, `${actor.name}: missing spell group ${group.groupId}`).toBeDefined();
    const expected = group.usageGroups.flatMap((usage: any) => usage.spellRefs.map((spell: any) => spell.originalName));
    expect(found.spellRefs.map((spell: any) => spell.originalName).sort()).toEqual(expected.sort());
    expect(found.ability).toBe(group.ability);
    if (group.saveDc !== undefined) expect(found.saveDc).toBe(group.saveDc);
  }
}

function differencePaths(before: any, after: any, path = ''): string[] {
  if (Object.is(before, after)) return [];
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return [path];
  if (Array.isArray(before) !== Array.isArray(after)) return [path];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].flatMap(key => differencePaths(before[key], after[key], `${path}/${key}`));
}

function writeEvidence(id: string, name: string, value: unknown): void {
  if (!evidenceRoot) return;
  const directory = join(evidenceRoot, id);
  mkdirSync(directory, {recursive: true});
  writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + '\n');
}

for (const frozen of cases) test(`46 frozen: ${frozen.id} original answer retains its usable Actor and source mechanics`, async () => {
  const row: Record<string, unknown> = {id: frozen.id, status: 'RUNNING', rawReplySha256: createHash('sha256').update(frozen.rawReply).digest('hex')};
  rows.push(row);
  try {
    const evidence: any[] = [];
    let reads = 0;
    const provider = new OpenAICompatibleMonsterIntakeProvider({authMode: 'api-key', baseUrl: 'https://frozen.invalid/v1', apiKey: 'frozen-fixture',
      model: 'frozen', reviewModel: 'disabled', maxAttempts: 1, timeoutMs: 10000, repairTimeoutMs: 10000,
      responseEvidence: {record: value => { evidence.push(value); }},
      httpClient: async () => { reads++; return Response.json({choices: [{message: {content: frozen.rawReply}}]}); }});
    const input = {source: frozen.source, sourceName: frozen.id, sourceScope: 'single' as const,
      requestId: frozen.requestId, sourceId: frozen.sourceId, fvttVersion: '14.368', systemVersion: '5.3.3', autoCorrect: false};
    const analysis = await analyzeBrowserActorSourceWithAi(input, provider);
    const generated = await generateBrowserActorIntakeCandidate(input, analysis, provider);
    const actor = (generated.candidateResponse as any)?.result?.artifact;
    writeEvidence(frozen.id, 'analysis.json', analysis);
    writeEvidence(frozen.id, 'generation.json', generated);
    if (actor) writeEvidence(frozen.id, 'actor.json', actor);
    expect(reads).toBe(1);
    expect(evidence[0]?.content).toBe(frozen.rawReply);
    expect(generated.calls).toEqual({discovery: 0, extraction: 1, review: 0, repair: 0});
    expect(generated.candidateAvailable, JSON.stringify(generated.findings)).toBe(true);
    expect(actor).toBeDefined();
    retainedSourceValues(JSON.parse(frozen.rawReply), actor);
    const importWarnings: string[] = [];
    const adapted = prepareFoundryImportArtifact(actor, {modules: new Map([['midi-qol', {active: true, version: '14.0.11'}]])}, importWarnings) as any;
    expect(adapted.items).toHaveLength(actor.items.length);

    if (frozen.id === 'mimic') {
      for (const value of [actor, adapted]) {
        const bite = value.items.find((item: any) => item.name === 'Bite');
        const rolls = activities(bite);
        expect(rolls.filter(activity => activity.flags?.fvttJsonGenerator?.sourceOperation?.role === 'attack-roll')).toHaveLength(1);
        const modes = rolls.filter(activity => activity.type === 'damage');
        expect(modes).toHaveLength(2);
        for (const [mode, count] of [['ordinary', 1], ['alternative', 2]] as const) {
          const damage = modes.find(activity => activity.flags?.fvttJsonGenerator?.sourceOperation?.damageMode === mode);
          expect(damage, `Mimic ${mode} damage missing`).toBeDefined();
          expect(damage.damage.parts.map((part: any) => [damageFormula(part), part.types])).toEqual([[`${count}d8+3`, ['piercing']], ['1d8', ['acid']]]);
          expect(damage.consumption.targets).toEqual([]);
        }
      }
    }
    if (frozen.id === 'otyugh') {
      const bite = adapted.items.find((item: any) => item.name === 'Bite');
      const tentacle = adapted.items.find((item: any) => item.name === 'Tentacle');
      const slam = adapted.items.find((item: any) => item.name === 'Tentacle Slam');
      expect(containsPart(bite, '2d8+3', 'piercing')).toBe(true);
      expect(containsPart(tentacle, '2d8+3', 'piercing')).toBe(true);
      expect(containsPart(slam, '3d8+3', 'bludgeoning')).toBe(true);
      expect(activities(bite).some(activity => activity.type === 'save' && String(activity.save.dc.formula) === '15')).toBe(true);
      expect(activities(slam).some(activity => activity.type === 'save' && String(activity.save.dc.formula) === '14' && activity.damage.onSave === 'half')).toBe(true);
      for (const text of ['Poisoned', 'Long Rest', 'Hit Point maximum']) expect(bite.system.description.value).toContain(text);
      for (const text of ['Medium', 'Grappled', 'escape', '13']) expect(tentacle.system.description.value).toContain(text);
      for (const text of ['Stunned', 'next turn']) expect(slam.system.description.value).toContain(text);
    }
    if (frozen.previousActor) {
      const differences = differencePaths(frozen.previousActor, actor);
      const technical = differences.filter(path => /^\/_stats\/(?:createdTime|modifiedTime)$/u.test(path));
      const content = differences.filter(path => !technical.includes(path));
      row.technicalDifferencePaths = technical;
      row.contentDifferencePaths = content;
      expect(content, `${frozen.id}: changed existing artifact`).toEqual([]);
    }
    Object.assign(row, {status: 'PASS', items: actor.items.length, artifactHash: hashArtifact(actor), fakeResponseReads: reads,
      importWarnings, findings: generated.findings, actualNetwork: 0, modelCalls: 0});
  } catch (error) {
    Object.assign(row, {status: 'FAIL', error: error instanceof Error ? error.message : String(error)});
    throw error;
  }
}, 30000);

for (const version of [1, 2]) test(`46 frozen: formal v${version} Actor draft returns its saved artifact without regeneration`, async () => {
  const id = `draft-v${version}`;
  const row: Record<string, unknown> = {id, status: 'RUNNING'};
  rows.push(row);
  try {
    const record = readJson(join(base25, `forge-regression-recovery/stage2-ui/v${version}-record.json`));
    const before = structuredClone(record);
    const restored = await revalidateIntakeCandidate(record, record.input, Date.parse(record.savedAt) + 30 * 24 * 60 * 60 * 1000);
    expect((restored.candidate as any).candidateResponse.result.artifact).toEqual(before.candidate.candidateResponse.result.artifact);
    expect(restored.candidate.gmApproval).toBeUndefined();
    expect(record).toEqual(before);
    writeEvidence(id, 'restored.json', restored);
    Object.assign(row, {status: 'PASS', storageVersion: version, artifactHash: hashArtifact((restored.candidate as any).candidateResponse.result.artifact),
      savedArtifactUnchanged: true, thirtyDayRecovery: true, actualNetwork: 0, modelCalls: 0});
  } catch (error) {
    Object.assign(row, {status: 'FAIL', error: error instanceof Error ? error.message : String(error)});
    throw error;
  }
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  const originalFileChecks = [...originalFiles].map(([path, expected]) => ({path, sha256: expected,
    unchanged: createHash('sha256').update(readFileSync(path)).digest('hex') === expected}));
  if (evidenceRoot) {
    mkdirSync(evidenceRoot, {recursive: true});
    writeFileSync(join(evidenceRoot, 'summary.json'), JSON.stringify({status: rows.length === 12 && rows.every(row => row.status === 'PASS')
      && networkAttempts === 0 && originalFileChecks.every(file => file.unchanged) ? 'PASS' : 'FAIL',
      rows, actualNetwork: networkAttempts, modelCalls: 0, originalFileChecks}, null, 2) + '\n');
  }
  expect(cases).toHaveLength(10);
  expect(networkAttempts).toBe(0);
  expect(originalFileChecks.every(file => file.unchanged)).toBe(true);
});
