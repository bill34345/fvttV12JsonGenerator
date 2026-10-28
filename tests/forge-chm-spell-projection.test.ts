import {afterAll, describe, expect, test} from 'bun:test';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {analyzeBrowserActorSourceWithAi, generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import type {PortableSpellManifest, PortableSpellRef} from '@fvtt-json-generator/spell-manifest-contracts';
import {RESOLVER_MODULE_ID} from '@fvtt-json-generator/spell-manifest-contracts';
import {buildCastActivitySource} from '../foundry-modules/monster-spell-resolver/src/cast-activity';
import {buildValidLurkerIr, LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';

const forbidden = async (): Promise<never> => { throw Error('No model, discovery, review or repair is permitted.'); };
const protectedFiles = new Map<string, string>();

function providerFor(reply: string) {
  let replayRequests = 0;
  const provider = new OpenAICompatibleMonsterIntakeProvider({
    apiKey: 'offline-fixture', baseUrl: 'https://offline.invalid', model: 'frozen-replay', reviewModel: 'disabled',
    timeoutMs: 60000, repairTimeoutMs: 60000, maxAttempts: 1,
    httpClient: async () => {
      replayRequests++;
      return new Response(JSON.stringify({choices: [{message: {content: reply}}]}), {status: 200, headers: {'content-type': 'application/json'}});
    },
  });
  return {provider, replayRequests: () => replayRequests};
}

async function generate(source: string, reply: string, sourceId = 'actor:v1:957b231f-8e7d-43cc-a3ee-477e785648d7') {
  const replay = providerFor(reply);
  const allowed = {providerName: replay.provider.providerName, extractionModel: 'frozen-replay', reviewModel: 'disabled',
    discover: forbidden, extract: replay.provider.extract.bind(replay.provider), extractAnswer: replay.provider.extractAnswer.bind(replay.provider), review: forbidden, repair: forbidden};
  const input = {source, sourceName: 'CHM spell projection fixture', sourceScope: 'single' as const,
    sourceId: sourceId as `actor:v1:${string}`, requestId: 'chm-spell-projection', fvttVersion: '14.368', systemVersion: '5.3.3', autoCorrect: false};
  const analysis = await analyzeBrowserActorSourceWithAi(input, allowed);
  const generation = await generateBrowserActorIntakeCandidate(input, analysis, {...allowed, extract: forbidden, extractAnswer: forbidden});
  expect(replay.replayRequests()).toBe(1);
  expect(generation.candidateAvailable).toBe(true);
  const response = generation.candidateResponse!;
  if (!('result' in response) || !response.result.artifact) throw Error('Expected a real generated Actor');
  return {analysis, generation, actor: response.result.artifact as Record<string, any>};
}

function casts(actor: Record<string, any>) {
  expect(actor.flags[RESOLVER_MODULE_ID], JSON.stringify(actor.flags.fvttJsonGenerator?.candidateReview)).toBeDefined();
  const manifest = actor.flags[RESOLVER_MODULE_ID].spellManifest as PortableSpellManifest;
  return manifest.spellcastingGroups.flatMap(group => {
    const feature = actor.items.find((item: any) => item.flags?.[RESOLVER_MODULE_ID]?.groupId === group.groupId);
    expect(feature).toBeDefined();
    return group.spellRefs.map(ref => ({group, ref, feature, ...buildCastActivitySource({
      manifestId: manifest.manifestId, group, ref, featureId: 'Feature000000001',
      selectedUuid: 'Compendium.dnd5e.spells24.Item.Spell00000000001',
      useParentItemPool: feature.flags.fvttJsonGenerator.spellcastingUsesParent === true,
    })}));
  });
}

function casterFixture(clause: string, shared = false) {
  const source = LURKER_SOURCE + '\n' + clause + '\nSpells: Detect Magic, Identify.';
  const ir = buildValidLurkerIr();
  ir.source = {sha256: hashSource(source), length: source.length};
  const evidence = [{start: -1, end: -1, quote: clause}];
  ir.creature.spellcasting = [{groupId: 'rest-casting', featureName: '休息施法', featureEnglishName: 'Rest Casting',
    description: clause, evidence, ability: 'int', abilityEvidence: [], componentWaivers: [],
    usageGroups: [{usage: shared ? 'daily-shared' : 'daily-each', count: 1, evidence,
      spellRefs: ['Detect Magic', 'Identify'].map((name, index) => ({refId: `spell-${index}`, identifier: name,
        originalName: name, englishName: name, aliases: [], restrictions: [], evidence: [{start: -1, end: -1, quote: name}]}))}]}];
  return {source, ir};
}

describe('CHM spell recovery and casting-level projection', () => {
  for (const [clause, expected] of [
    ['每项一次；完成长休后才能再次施展该法术。', 'lr'],
    ['Each spell can be cast once, regaining its use after a Short Rest.', 'sr'],
    ['Each spell can be cast once per day.', 'day'],
  ] as const) test(`declared use evidence projects independent native ${expected} recovery`, async () => {
    const {source, ir} = casterFixture(clause);
    const {actor} = await generate(source, JSON.stringify(ir));
    const projected = casts(actor);
    expect(projected).toHaveLength(2);
    for (const {activity} of projected) {
      expect(activity.uses).toEqual({spent: 0, max: '1', recovery: [{period: expected, type: 'recoverAll'}]});
      expect(activity.consumption).toEqual({spellSlot: false, targets: [{type: 'activityUses', value: '1'}]});
    }
  });

  test('shared long-rest casts retain one generated parent pool and no per-spell duplicate', async () => {
    const {source, ir} = casterFixture('这些法术共享一次使用，完成长休后恢复。', true);
    const {actor} = await generate(source, JSON.stringify(ir));
    for (const {feature, activity} of casts(actor)) {
      expect(feature.system.uses).toEqual({spent: 0, max: '1', recovery: [{period: 'lr', type: 'recoverAll'}]});
      expect(activity.uses).toBeUndefined();
      expect(activity.consumption.targets).toEqual([{type: 'itemUses', value: '1'}]);
    }
  });

  const buildLevel = (text: string, castingLevel?: number) => {
    const ref: PortableSpellRef = {refId: 'test', identifier: 'test', originalName: 'Unrelated Spell', aliases: [], method: 'at-will',
      ...(castingLevel === undefined ? {} : {castingLevel}), restrictions: [{kind: 'casting', text, evidence: []}], evidence: []};
    return buildCastActivitySource({manifestId: 'test', featureId: 'Feature000000001',
      selectedUuid: 'Compendium.dnd5e.spells24.Item.Spell00000000001', group: {groupId: 'test', featureItemKey: 'test', spellRefs: [ref]}, ref});
  };
  for (const [text, level] of [['四环版本', 4], ['（ 6 环版本 ）', 6], ['level 3 version', 3]] as const) {
    test(`complete casting qualifier ${text} produces the native fixed spell level`, () => {
      const result = buildLevel(text);
      expect(result.activity.spell.level).toBe(level);
      expect(result.literalRestrictions).toEqual([]);
      expect(result.activity.consumption).toEqual({spellSlot: false, targets: []});
    });
  }
  test('a nearby mention of a spell level stays literal; explicit innate/at-will levels remain usable', () => {
    const unmatched = buildLevel('四环版本的法术受到影响时另有后果');
    expect(unmatched.activity.spell.level).toBeUndefined();
    expect(unmatched.literalRestrictions).toHaveLength(1);
    expect(buildLevel('仅在水中使用', 5).activity.spell.level).toBe(5);
  });

  test('an unrelated noncaster retains its exact Actor projection', async () => {
    const ir = buildValidLurkerIr();
    const first = await generate(LURKER_SOURCE, JSON.stringify(ir));
    const second = await generate(LURKER_SOURCE, JSON.stringify({...ir, creature: {...ir.creature, spellcasting: []}}));
    expect(second.actor).toEqual(first.actor);
  });
});

const frozenRoot = process.env.FORGE_CHM_FROZEN_ROOT;
test.skipIf(!frozenRoot)('frozen first-answer Night Hag keeps all abilities and projects long-rest Casts plus fourth-level Magic Missile', async () => {
  const read = (relative: string) => {
    const path = join(frozenRoot!, relative), text = readFileSync(path, 'utf8');
    protectedFiles.set(path, hashSource(text));
    return text;
  };
  const source = read('sources-r2/night-hag.md'), reply = read('results/night-hag/raw-answer.txt');
  const oldActor = JSON.parse(read('results/night-hag/actor.json'));
  const {analysis, generation, actor} = await generate(source, reply, 'actor:v1:5cf73706-1459-458e-a346-82c3d34d2f0b');
  expect(actor.items.map((item: any) => item.name)).toEqual(oldActor.items.map((item: any) => item.name));
  expect(actor.system).toEqual(oldActor.system);
  for (const item of oldActor.items.filter((item: any) => !item.flags?.[RESOLVER_MODULE_ID])) {
    expect(actor.items.find((value: any) => value.name === item.name)).toEqual(item);
  }
  const built = casts(actor);
  expect(built).toHaveLength(12);
  const coven = built.filter(row => row.group.groupId === 'casting-1');
  expect(coven).toHaveLength(6);
  for (const row of coven) expect(row.activity.uses).toEqual({spent: 0, max: '1', recovery: [{period: 'lr', type: 'recoverAll'}]});
  const missile = built.find(row => row.ref.englishName === 'Magic Missile')!;
  expect(missile.activity.spell.level).toBe(4);
  expect(missile.literalRestrictions).toEqual([]);
  expect(built.find(row => row.ref.englishName === 'Dream')!.activity.uses?.max).toBe('1');
  expect(built.find(row => row.ref.englishName === 'Phantasmal Killer')!.activity.uses?.max).toBe('2');
  expect(built.find(row => row.ref.englishName === 'Plane Shift')!.activity.target?.affects.type).toBe('self');
  if (process.env.FORGE_CHM_FIX_EVIDENCE) {
    const output = join(process.env.FORGE_CHM_FIX_EVIDENCE, 'night-hag'); mkdirSync(output, {recursive: true});
    for (const [name, data] of Object.entries({analysis, generation, actor, casts: built})) writeFileSync(join(output, name + '.json'), JSON.stringify(data, null, 2) + '\n');
    writeFileSync(join(output, 'generated-source.md'), generation.finalSource!);
  }
});

afterAll(() => { for (const [path, hash] of protectedFiles) { expect(existsSync(path)).toBe(true); expect(hashSource(readFileSync(path, 'utf8'))).toBe(hash); } });
