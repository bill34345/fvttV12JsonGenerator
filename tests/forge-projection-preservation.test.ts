import { beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { hashManifest, RESOLVER_MODULE_ID } from '@fvtt-json-generator/spell-manifest-contracts';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { verifyMonsterIntake } from '@fvtt-json-generator/intake-ai/verifier';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows/single-file-conversion';
import { buildRatWarlockIr, RAT_WARLOCK_SOURCE } from '../src/core/intake/__tests__/fixtures/rat-warlock';

describe('Monster Intake checks AI IR projection preservation without reviewing raw content', () => {
  let baseline: { ir: ReturnType<typeof buildRatWarlockIr>; markdown: string; actor: any };
  beforeAll(async () => {
    const ir = buildRatWarlockIr();
    ir.creature.languages.values = ['深潜语'];
    ir.creature.biography = 'The AI retained this complete narrative. Its second sentence remains visible.';
    ir.creature.actions[0]!.attack!.range = 30;
    ir.creature.actions[0]!.attack!.longRange = 90;
    ir.creature.actions.push({ name: 'Pulse', description: 'Each target makes a DC 17 Constitution saving throw. It takes 2d6 Force damage on a failed save, or half as much damage on a success.',
      activityType: 'save', range: 60, save: { dc: 17, ability: 'con', outcome: 'half' },
      damage: [{ formula: '2d6', type: 'force', relationship: 'base' }], aoe: { shape: 'sphere', radius: 10 } });
    const group = ir.creature.spellcasting![0]!;
    group.usageGroups[1] = { ...group.usageGroups[1]!, usage: 'daily-shared', count: 3 };
    const markdown = renderMonsterIntakeMarkdown(ir);
    const generated = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null });
    baseline = { ir, markdown, actor: generated.rawJson };
  });
  const fixture = () => structuredClone(baseline);
  const findings = (f: typeof baseline, source = RAT_WARLOCK_SOURCE) => verifyMonsterIntake(source, f.ir, f.markdown, f.actor).findings;
  const item = (f: typeof baseline, name: string) => f.actor.items.find((entry: any) => entry.name.includes(name));
  const firstActivity = (entry: any): any => Object.values(entry.system.activities)[0];

  test('accepts the declared IR values and existing deep-language representation without mutating the inputs', () => {
    const f = fixture(), before = structuredClone(f);
    expect(findings(f)).toEqual([]);
    expect(f.actor.system.traits.languages.value).toEqual(['deep']);
    expect(f).toEqual(before);
  });

  for (const [label, mutate, code] of [
    ['attack bonus', (f: typeof baseline) => { firstActivity(item(f, '啃咬')).attack.bonus = '99'; }, 'ACTOR_TO_HIT_DRIFT'],
    ['save DC', (f: typeof baseline) => { firstActivity(item(f, 'Pulse')).save.dc.formula = '99'; }, 'ACTOR_SAVE_DC_DRIFT'],
    ['range', (f: typeof baseline) => { firstActivity(item(f, 'Pulse')).range.value = 90; }, 'ACTOR_RANGE_DRIFT'],
    ['damage', (f: typeof baseline) => { firstActivity(item(f, 'Pulse')).damage.parts[0].number = 9; }, 'ACTOR_DAMAGE_FORMULA_DRIFT'],
    ['shared uses', (f: typeof baseline) => { item(f, '天生施法').system.uses.max = '9'; }, 'SHARED_SPELL_POOL_DRIFT'],
    ['language', (f: typeof baseline) => { f.actor.system.traits.languages.value = []; }, 'ACTOR_LANGUAGE_DRIFT'],
    ['complete rule text', (f: typeof baseline) => { item(f, 'Pulse').system.description.value = '<p>Each target makes a DC 17 Constitution saving throw.</p>'; }, 'ACTOR_DESCRIPTION_LOSS'],
    ['biography', (f: typeof baseline) => { f.actor.system.details.biography.value = ''; }, 'ACTOR_BIOGRAPHY_LOSS'],
    ['area', (f: typeof baseline) => { firstActivity(item(f, 'Pulse')).target.template.size = '90'; }, 'ACTOR_AREA_PROJECTION_DRIFT'],
  ] as const) test(`detects altered ${label} in the generated Actor`, () => {
    const f = fixture(); mutate(f);
    expect(findings(f).map(finding => finding.code)).toContain(code);
  });

  test('checks material-component waivers against the IR even if both saved artifacts are changed together', () => {
    const f = fixture();
    const resolver = f.actor.flags[RESOLVER_MODULE_ID];
    resolver.spellManifest.spellcastingGroups[0].spellRefs[0].ignoresMaterialComponents = false;
    resolver.spellResolution.manifestHash = hashManifest(resolver.spellManifest);
    const doc = yaml.load(f.markdown.slice(4, f.markdown.lastIndexOf('---'))) as any;
    doc['法术清单'].spellcastingGroups[0].spellRefs[0].ignoresMaterialComponents = false;
    f.markdown = `---\n${yaml.dump(doc, { lineWidth: -1 })}---\n`;
    expect(findings(f).map(finding => finding.code)).toContain('MARKDOWN_IR_PROJECTION_DRIFT');
  });

  test('missing native fields remain projection losses rather than acceptable empty values', () => {
    for (const [remove, code] of [
      [(f: typeof baseline) => { delete firstActivity(item(f, '啃咬')).attack.bonus; }, 'ACTOR_TO_HIT_DRIFT'],
      [(f: typeof baseline) => { delete firstActivity(item(f, 'Pulse')).save.dc.formula; }, 'ACTOR_SAVE_DC_DRIFT'],
      [(f: typeof baseline) => { delete firstActivity(item(f, 'Pulse')).range.value; }, 'ACTOR_RANGE_DRIFT'],
      [(f: typeof baseline) => { firstActivity(item(f, 'Pulse')).damage.parts = []; }, 'ACTOR_DAMAGE_FORMULA_DRIFT'],
      [(f: typeof baseline) => { delete item(f, '天生施法').system.uses.max; }, 'SHARED_SPELL_POOL_DRIFT'],
      [(f: typeof baseline) => { delete item(f, 'Pulse').system.description.value; }, 'ACTOR_DESCRIPTION_LOSS'],
      [(f: typeof baseline) => { delete f.actor.flags[RESOLVER_MODULE_ID].spellManifest.spellcastingGroups[0].spellRefs[0].ignoresMaterialComponents; }, 'PORTABLE_SPELL_MANIFEST_DRIFT'],
    ] as const) {
      const f = fixture(); remove(f);
      expect(findings(f).map(finding => finding.code)).toContain(code);
    }
  });

  test('malformed Markdown yields projection findings instead of throwing from manifest extraction', () => {
    const f = fixture(); f.markdown = '---\n法术清单: [\n---\n';
    expect(findings(f).map(finding => finding.code)).toContain('MARKDOWN_IR_PROJECTION_INVALID');
  });

  test('a changed source value with matching identity does not change the AI IR or its projected value', () => {
    const f = fixture(), source = RAT_WARLOCK_SOURCE.replace('AC 12', 'AC 92');
    expect(source).not.toBe(RAT_WARLOCK_SOURCE);
    f.ir.source = { sha256: createHash('sha256').update(source).digest('hex'), length: source.length };
    const updateEvidence = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      const entry = value as any;
      if (Number.isInteger(entry.start) && Number.isInteger(entry.end) && typeof entry.quote === 'string') entry.quote = source.slice(entry.start, entry.end);
      Object.values(entry).forEach(updateEvidence);
    };
    updateEvidence(f.ir);
    f.markdown = renderMonsterIntakeMarkdown(f.ir);
    // The manifest owns the exact source identity even though its spell
    // profile remains the AI's unchanged profile.
    const resolver = f.actor.flags[RESOLVER_MODULE_ID];
    const doc = yaml.load(f.markdown.slice(4, f.markdown.lastIndexOf('---'))) as any;
    resolver.spellManifest = doc['法术清单'];
    resolver.spellResolution.manifestHash = hashManifest(resolver.spellManifest);
    const before = structuredClone(f);
    expect(findings(f, source)).toEqual([]);
    expect(f.ir.creature.attributes.ac).toBe(12);
    expect(f.actor.system.attributes.ac.flat).toBe(12);
    expect(f).toEqual(before);
  });

  test('source identity mismatches remain blocking', () => {
    expect(findings(fixture(), `${RAT_WARLOCK_SOURCE}\nchanged`).map(finding => finding.code)).toContain('SOURCE_HASH_MISMATCH');
  });

  test('review metadata stays historical and is never changed into a new accepted verdict', () => {
    const f = fixture();
    f.ir.creature.candidateReview = { version: 1, findings: [{ code: 'OLD_AI_REVIEW', path: '/creature', message: 'Historical review remains unresolved.' }], proposal: { original: true } };
    const before = structuredClone(f.ir.creature.candidateReview);
    verifyMonsterIntake(RAT_WARLOCK_SOURCE, f.ir, f.markdown, f.actor);
    expect(f.ir.creature.candidateReview).toEqual(before);
  });
});

describe('literal conditional and replacement damage projection', () => {
  async function generated(withPrimary: boolean) {
    const ir = buildRatWarlockIr();
    ir.creature.actions = [{ name: 'ConditionalProbe', description: 'When the GM chooses, deal cold damage. A separate replacement roll remains a GM choice.',
      activityType: withPrimary ? 'attack' : 'damage',
      ...(withPrimary ? { attack: { type: 'mwak' as const, toHit: 5, reach: 5 }, uses: { max: 2, period: 'day' as const } } : {}),
      damage: [
        ...(withPrimary ? [{ formula: '1d6', type: 'slashing', relationship: 'base' as const }] : []),
        { formula: '2d6', type: 'cold', relationship: 'conditional', condition: 'When the GM chooses' },
        { formula: '3d4 + 1', type: 'necrotic', relationship: 'replacement', condition: 'When the GM chooses replacement' },
      ] }];
    const markdown = renderMonsterIntakeMarkdown(ir);
    const result = await convertMarkdownContentToJson({ content: markdown, fvttVersion: '14', effectProfile: 'core', translationService: null });
    return { ir, markdown, actor: result.rawJson as any };
  }
  const probe = (actor: any) => actor.items.find((item: any) => item.name === 'ConditionalProbe');
  const helpers = (actor: any): any[] => Object.values(probe(actor).system.activities).filter((activity: any) => activity.flags?.fvttJsonGenerator?.literalDamage);
  const primary = (actor: any): any => Object.values(probe(actor).system.activities).find((activity: any) => !activity.flags?.fvttJsonGenerator?.literalDamage);
  const codes = (f: Awaited<ReturnType<typeof generated>>, actor = f.actor) => verifyMonsterIntake(RAT_WARLOCK_SOURCE, f.ir, f.markdown, actor).findings.map(finding => finding.code);

  test('all-deferred damage is accepted only as separate GM helpers rather than an unconditional primary action', async () => {
    const f = await generated(false);
    expect(primary(f.actor)).toBeUndefined();
    expect(helpers(f.actor)).toHaveLength(2);
    expect(codes(f)).toEqual([]);
    const changed = structuredClone(f.actor);
    helpers(changed)[0].activation.type = 'action';
    expect(codes(f, changed)).toContain('ACTOR_DAMAGE_HELPER_BOUNDARY_DRIFT');
    const missing = structuredClone(f.actor), id = helpers(missing)[0]._id;
    delete probe(missing).system.activities[id];
    expect(codes(f, missing)).toContain('ACTOR_DAMAGE_HELPER_IDENTITY_DRIFT');
  });

  test('primary and both helper relationships retain independent complete rolls and consume the parent only once', async () => {
    const f = await generated(true), before = structuredClone(f);
    expect(primary(f.actor).consumption.targets).toHaveLength(1);
    expect(helpers(f.actor).every(activity => activity.activation.type === 'special' && activity.consumption.targets.length === 0)).toBe(true);
    expect(codes(f)).toEqual([]);
    expect(f).toEqual(before);
    for (const [mutate, code] of [
      [(actor: any) => { delete probe(actor).system.activities[helpers(actor)[0]._id]; }, 'ACTOR_DAMAGE_HELPER_IDENTITY_DRIFT'],
      [(actor: any) => { delete probe(actor).system.activities[helpers(actor)[1]._id]; }, 'ACTOR_DAMAGE_HELPER_IDENTITY_DRIFT'],
      [(actor: any) => { helpers(actor)[0].damage.parts[0].number = 9; }, 'ACTOR_DAMAGE_HELPER_ROLL_DRIFT'],
      [(actor: any) => { helpers(actor)[1].damage.parts[0].types = ['fire']; }, 'ACTOR_DAMAGE_HELPER_ROLL_DRIFT'],
      [(actor: any) => { helpers(actor)[0].flags.fvttJsonGenerator.literalDamage.part.relationship = 'base'; }, 'ACTOR_DAMAGE_HELPER_IDENTITY_DRIFT'],
      [(actor: any) => { probe(actor).flags.fvttJsonGenerator.literalMechanics.sourceDamageParts[1].formula = '99'; }, 'ACTOR_DAMAGE_IR_LEDGER_DRIFT'],
      [(actor: any) => { helpers(actor)[0].consumption.targets = [{ type: 'itemUses', target: '', value: '1' }]; }, 'ACTOR_DAMAGE_HELPER_RESOURCE_DRIFT'],
      [(actor: any) => { helpers(actor)[1].consumption.spellSlot = true; }, 'ACTOR_DAMAGE_HELPER_RESOURCE_DRIFT'],
      [(actor: any) => { helpers(actor)[0].activation.condition = ''; }, 'ACTOR_DAMAGE_HELPER_BOUNDARY_DRIFT'],
      [(actor: any) => { primary(actor).damage.parts.push(structuredClone(helpers(actor)[0].damage.parts[0])); }, 'ACTOR_PRIMARY_DAMAGE_DRIFT'],
      [(actor: any) => { primary(actor).damage.parts[0].number = 9; }, 'ACTOR_PRIMARY_DAMAGE_DRIFT'],
      [(actor: any) => { delete helpers(actor)[0].flags.fvttJsonGenerator.literalDamage; }, 'ACTOR_DAMAGE_ACTIVITY_COUNT_DRIFT'],
      [(actor: any) => { primary(actor).consumption.targets = []; }, 'ACTOR_RESOURCE_CONSUMPTION_DRIFT'],
      [(actor: any) => { helpers(actor)[1].range.value = 60; }, 'ACTOR_DAMAGE_HELPER_TARGET_DRIFT'],
    ] as const) {
      const actor = structuredClone(f.actor); mutate(actor);
      expect(codes(f, actor)).toContain(code);
    }
  });

  test('an explicit condition on a base part remains outside the primary damage roll', async () => {
    const f = await generated(false);
    f.ir.creature.actions[0]!.damage![0]!.relationship = 'base';
    f.markdown = renderMonsterIntakeMarkdown(f.ir);
    const result = await convertMarkdownContentToJson({ content: f.markdown, fvttVersion: '14', effectProfile: 'core', translationService: null });
    f.actor = result.rawJson;
    expect(primary(f.actor)).toBeDefined();
    expect(helpers(f.actor)).toHaveLength(2);
    expect(codes(f)).toEqual([]);
    const actor = structuredClone(f.actor);
    primary(actor).damage = { parts: [structuredClone(helpers(actor)[0].damage.parts[0])] };
    expect(codes(f, actor)).toContain('ACTOR_PRIMARY_DAMAGE_DRIFT');
  });
});

test.skipIf(!process.env.FORGE_PROJECTION_FROZEN_ROOT)('frozen Yithian retains its AI IR projection without source-content or language false positives', () => {
  const root = process.env.FORGE_PROJECTION_FROZEN_ROOT!;
  const ir = JSON.parse(readFileSync(join(root, 'source-ir.json'), 'utf8'));
  const actor = JSON.parse(readFileSync(join(root, 'candidate.json'), 'utf8'));
  const markdown = readFileSync(join(root, 'canonical.md'), 'utf8');
  const raw = readFileSync(join(root, 'source.md'), 'utf8');
  const source = [raw, raw.replace(/\r\n?/gu, '\n'), raw.replace(/\r\n?/gu, '\n').replace(/\n/gu, '\r\n')]
    .find(value => createHash('sha256').update(value).digest('hex') === ir.source.sha256);
  expect(source).toBeDefined();
  const before = structuredClone({ ir, actor });
  const report = verifyMonsterIntake(source!, ir, markdown, actor);
  expect(report.findings).toEqual([]);
  expect({ ir, actor }).toEqual(before);
});
