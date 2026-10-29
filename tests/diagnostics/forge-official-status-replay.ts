import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import {analyzeBrowserActorSourceWithAi, generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {createForgeSourceId, hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {prepareFoundryImportArtifact} from '../../foundry-modules/fvtt-json-forge/src/runtime';

const root = process.env.FORGE_STATUS_EVIDENCE_ROOT!;
if (!root) throw Error('Set FORGE_STATUS_EVIDENCE_ROOT to this task evidence directory.');
const previous = 'H:/CodexData/visualizations/2026/10/27/01a17bee-ceb9-7eb3-8fce-a8320e15295f/forge-four-chm-first-pass-20261027';
const oldPair = 'H:/CodexData/visualizations/2026/10/27/01a17adc-866c-7053-9668-326e795f4b96/forge-offline-five-20261027/results';
const medusaRoot = 'H:/CodexData/visualizations/2026/10/22/01a163d8-f3e5-7663-bd1b-25d55bfdac88/forge-four-2024-20261023-dc5545/live/medusa';
const originals = new Map<string, string>();
let networkAttempts = 0;
globalThis.fetch = Object.assign(async () => { networkAttempts++; throw Error('No external generation requests are permitted.'); },
  {preconnect: () => { networkAttempts++; throw Error('No external network preconnect is permitted.'); }});
const noCall = async (): Promise<never> => { throw Error('No discovery, review, repair or extra extraction.'); };
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const read = (path: string) => { const bytes = readFileSync(path); originals.set(path, sha(bytes)); return bytes.toString('utf8').replace(/^\uFEFF/u, ''); };
const json = (path: string) => JSON.parse(read(path));
const save = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
const sourceIdFor = (id: string) => {
  const bytes = createHash('sha256').update('forge-official-status-effects-20261027:' + id).digest();
  bytes[6] = (bytes[6]! & 15) | 64; bytes[8] = (bytes[8]! & 63) | 128;
  const h = bytes.toString('hex');
  return createForgeSourceId(() => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`);
};

const cases = [{id: 'phase-spider', source: read(join(previous, 'sources-r2/phase-spider.md')),
  reply: read(join(previous, 'results/phase-spider/raw-answer.txt')), provenance: 'Original CHM four-batch first answer'}];
for (const id of ['otyugh', 'mimic']) {
  const base = join(oldPair, 'member-' + id);
  cases.push({id, source: json(join(base, 'analysis.json')).candidate.quote, reply: read(join(base, 'raw-answer.txt')),
    provenance: 'Original saved extraction answer and its discovered candidate quote'});
}
cases.push({id: 'medusa', source: read(join(medusaRoot, 'source.md')), reply: json(join(medusaRoot, 'reply-2-extract.json')).content,
  provenance: 'Existing saved Medusa extraction, not a new first-answer claim'});

const fear = 'Wisdom Saving Throw: DC 12. Failure: the target has the Frightened condition for 1 minute.';
const fatigue = 'Melee Weapon Attack: +3 to hit, reach 5 ft. Hit: 3 (1d4+1) bludgeoning damage, and the target gains 2 levels of Exhaustion.';
const fixtureSource = `状态练习员 Condition Tester\nMedium humanoid, unaligned\nArmor Class 12\nHit Points 22 (4d8+4)\nSpeed 30 ft.\nSTR DEX CON INT WIS CHA\n12 14 12 10 10 10\nChallenge 1 (200 XP; PB +2)\nActions\nDread. ${fear}\nFatiguing Touch. ${fatigue}\n`;
const fixtureReply = {schemaVersion: 1, source: {sha256: hashSource(fixtureSource), length: fixtureSource.length}, claims: [], coverage: [], uncertainties: [],
  creature: {identity: {name: '状态练习员', englishName: 'Condition Tester', size: 'medium', creatureType: 'humanoid', alignment: 'unaligned'},
    abilities: {str: 12, dex: 14, con: 12, int: 10, wis: 10, cha: 10}, attributes: {ac: 12, hp: {value: 22, formula: '4d8+4'}, movement: {walk: 30}, cr: 1, proficiencyBonus: 2, xp: 200},
    saves: {}, skills: {}, defenses: {resistances: [], immunities: [], vulnerabilities: [], conditionImmunities: []}, senses: {passivePerception: 10}, languages: {values: []},
    traits: [], bonusActions: [], reactions: [], legendaryActions: [], actions: [
      {name: '恐惧凝视', englishName: 'Dread', description: fear, sourceOperations: [{name: '恐惧豁免', type: 'save', relationship: 'primary',
        save: {dc: 12, abilities: ['wis'], choice: 'single', outcome: 'none'}, appliedConditions: [{statuses: ['frightened'], duration: '1 minute'}], proof: {save: 'Wisdom Saving Throw: DC 12.'}}]},
      {name: '疲惫之触', englishName: 'Fatiguing Touch', description: fatigue, sourceOperations: [{name: '疲惫攻击', type: 'attack', relationship: 'primary',
        attack: {type: 'mwak', toHit: 3, reach: 5}, damage: [{formula: '1d4+1', type: 'bludgeoning', relationship: 'base'}],
        appliedConditions: [{statuses: ['exhaustion'], exhaustionLevels: 2}], proof: {attack: 'Melee Weapon Attack: +3 to hit, reach 5 ft.', damage: [fatigue]}}]},
    ]},
};
cases.push({id: 'condition-tester', source: fixtureSource, reply: JSON.stringify(fixtureReply), provenance: 'Explicit controlled Actor fixture for ordinary failed-save and official Exhaustion-level application; not a model response'});

const results = [];
const selectedCases = process.env.FORGE_STATUS_CASES?.split(',');
for (const entry of cases.filter(entry => !selectedCases || selectedCases.includes(entry.id))) {
  const output = join(root, 'replay', entry.id); mkdirSync(output, {recursive: true});
  let syntheticRequests = 0;
  const evidence: unknown[] = [];
  const provider = new OpenAICompatibleMonsterIntakeProvider({authMode: 'api-key', apiKey: 'frozen-only', baseUrl: 'https://offline.invalid', model: 'saved-answer', reviewModel: 'disabled',
    timeoutMs: 60000, repairTimeoutMs: 60000, maxAttempts: 1,
    httpClient: async () => {syntheticRequests++; return new Response(JSON.stringify({choices: [{message: {content: entry.reply}}]}), {status: 200, headers: {'content-type': 'application/json'}});},
    responseEvidence: {record: event => {evidence.push(event);}},
  });
  const allowed = {providerName: provider.providerName, extractionModel: provider.extractionModel, reviewModel: 'disabled', discover: noCall,
    extract: provider.extract.bind(provider), extractAnswer: provider.extractAnswer.bind(provider), review: noCall, repair: noCall};
  const input = {source: entry.source, sourceName: entry.id, sourceScope: 'single' as const, sourceId: sourceIdFor(entry.id),
    requestId: 'official-status-' + entry.id, fvttVersion: '14.368', systemVersion: '5.3.3', autoCorrect: false};
  save(join(output, 'provenance.json'), {...entry, reply: undefined, rawReplySha256: sha(entry.reply), sourceId: input.sourceId, actualExternalHttp: 0});
  const analysis = await analyzeBrowserActorSourceWithAi(input, allowed);
  const generation = await generateBrowserActorIntakeCandidate(input, analysis, {...allowed, extract: noCall, extractAnswer: noCall});
  save(join(output, 'analysis.json'), analysis); save(join(output, 'generation.json'), generation); save(join(output, 'response-evidence.json'), evidence);
  const response = generation.candidateResponse;
  const actor = response && 'result' in response ? response.result.artifact as any : undefined;
  if (actor) {
    save(join(output, 'actor.json'), actor);
    const adapted = prepareFoundryImportArtifact(actor, {modules: {get: () => ({active: true, version: '14.0.11'})}} as any);
    save(join(output, 'import-adapted.json'), adapted);
  }
  if (generation.finalSource) writeFileSync(join(output, 'generated-source.md'), generation.finalSource, {flag: 'wx'});
  results.push({id: entry.id, candidateAvailable: generation.candidateAvailable, status: generation.formalStatus, sourceId: input.sourceId,
    syntheticRequests, realModelRequests: 0, items: actor?.items.map((item: any) => ({name: item.name, effects: item.effects,
      activities: Object.values(item.system?.activities ?? {}).map((activity: any) => ({name: activity.name, type: activity.type, effects: activity.effects, roll: activity.roll, damage: activity.damage, save: activity.save}))}))});
}
const changed = [...originals].filter(([path, hash]) => sha(readFileSync(path)) !== hash).map(([path]) => path);
save(join(root, 'replay-summary.json'), {networkAttempts, actualExternalHttp: 0, protectedOriginalFiles: [...originals].map(([path, hash]) => ({path, sha256: hash})), changed, results});
console.log(JSON.stringify({networkAttempts, changed, results: results.map(({items, ...result}) => ({...result, items: items?.length}))}));
if (networkAttempts || changed.length || results.some(result => !result.candidateAvailable)) process.exitCode = 1;
