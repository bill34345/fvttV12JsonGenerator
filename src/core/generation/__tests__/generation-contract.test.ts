import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActorGenerator } from '../../generator/actor';
import { ItemGenerator } from '../../generator/item-generator';
import type { ParsedItem } from '../../models/item';
import {
  adaptParsedActorToCanonical,
  adaptParsedItemToCanonical,
} from '../adapters';
import { getGenerationProjector } from '../projectors';
import { verifyGeneratedDocument } from '../verification';
import { GenerationResourceError } from '../resources';
import { getFoundryTarget } from '@fvtt-json-generator/generation/target';
import { projectNativeDocument } from '@fvtt-json-generator/workflows/native-projection';
import { decodeIconReviewReport } from '@fvtt-json-generator/contracts/icon-review';

const originalCwd = process.cwd();
const tempPaths: string[] = [];

afterEach(() => {
  process.chdir(originalCwd);
  for (const path of tempPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

function minimalItem(): ParsedItem {
  return {
    name: 'Binding Charm',
    type: 'armor',
    description: 'A source-derived test item.',
    structuredActions: {
      utilities: [{
        name: 'Bind',
        type: 'utility',
        desc: 'On use, the target is restrained until it takes damage.',
      }],
    },
  };
}

function attackItem(): ParsedItem {
  return {
    name: 'Projection Blade',
    type: 'weapon',
    description: 'A test blade.',
    structuredActions: {
      attacks: [{
        name: 'Projection Strike',
        type: 'attack',
        attack: {
          type: 'mwak',
          toHit: 5,
          range: 'reach 5 ft.',
          damage: [{ formula: '1d8+3', type: 'slashing' }],
        },
      }],
    },
  };
}

function saveItem(): ParsedItem {
  return {
    name: 'Projection Burst',
    type: 'equipment',
    description: 'A test burst.',
    structuredActions: {
      saves: [{
        name: 'Burst',
        type: 'save',
        save: { dc: 14, ability: 'dex', outcome: 'none' },
        damage: [{ formula: '2d6', type: 'fire' }],
      }],
    },
  };
}

describe('canonical generation contract', () => {
  it.each([
    { foundryVersion: '14.370', systemId: 'dnd5e', systemVersion: '6.0.6' },
    { foundryVersion: '14.364', systemId: 'dnd5e', systemVersion: '5.3.3' },
  ])('retains the original icon report identity for read-only recovery: %o', target => {
    const report = { schemaVersion: 1, target, mode: 'safe', entries: [],
      summary: { total: 0, override: 0, existing: 0, exact: 0, semantic: 0, fallback: 0 } };
    expect(decodeIconReviewReport(report).target).toEqual(target);
    expect(() => decodeIconReviewReport({ ...report, target: { ...target, systemVersion: target.systemVersion === '6.0.6' ? '5.3.3' : '6.0.6' } })).toThrow('Invalid icon review version or target.');
  });

  it.each(['init', 'senses', 'spell', 'skills', 'resources', 'ac'])('checks native6 %s preservation at an optional receiver', async (field) => {
    const actor = new ActorGenerator().generate({
      name: 'Receiver Control', type: 'npc', abilities: { dex: 14 },
      attributes: { ac: { value: 17, calc: 'flat' }, init: 5, legres: { max: 3, value: 2 } },
      details: { spellLevel: 5 }, traits: { senses: { darkvision: 60 } }, skills: { prc: 1 }, skillBonuses: { prc: 2 }, saves: [], items: [],
    });
    const target = getFoundryTarget('14');
    expect(await projectNativeDocument({ target, runtime: { coreVersion: '14.369', systemId: 'dnd5e', systemVersion: '6.0.6' }, project: (_kind, input) => input }, 'Actor', actor)).toEqual(actor);
    const port = { target, project(_kind: 'Actor' | 'Item', input: any) {
      if (field === 'skills' || field === 'resources') input.system[field] = {};
      else input.system.attributes[field] = {};
      return input;
    } };
    await expect(projectNativeDocument(port, 'Actor', actor)).rejects.toThrow('Native projection changed');
    expect(actor.system.attributes.ac.override).toBe(17);
  });

  it('adapts Actor and Item compatibility inputs into one discriminated union', () => {
    const actor = adaptParsedActorToCanonical({
      name: 'Contract Actor',
      type: 'npc', abilities: {}, attributes: {}, details: {}, traits: {}, skills: {}, saves: [], items: [],
      structuredActions: {
        动作: [{
          name: 'Arc Bolt',
          type: 'attack',
          attackType: 'rsak',
          toHit: 6,
          range: '120 ft.',
          damage: [{ formula: '2d10', type: 'force' }],
          describe: 'Ranged Spell Attack.',
        }],
      },
    } as any, { sourcePath: 'actor.md', sourceText: 'actor source' });
    const item = adaptParsedItemToCanonical(minimalItem(), {
      sourcePath: 'item.md',
      sourceText: 'item source',
    });

    expect(actor.kind).toBe('actor');
    expect(item.kind).toBe('item');
    expect(actor.mechanics.map((entry) => entry.kind)).toContain('attack');
    expect(item.sourceItemType).toBe('armor');
    expect(item.targetDocumentType).toBe('equipment');
  });

  it('routes v12/v13 and v14 through independent locked-system projectors', () => {
    expect(getGenerationProjector('12').systemVersion).toBe('4.3.9');
    expect(getGenerationProjector('13').systemVersion).toBe('4.3.9');
    expect(getGenerationProjector('14').systemVersion).toBe('6.0.6');
    expect(getGenerationProjector('12')).not.toBe(getGenerationProjector('14'));
  });
});

describe('generation resources and Item profiles', () => {
  it('generates Actor and Item independently of process.cwd()', async () => {
    const temp = mkdtempSync(join(tmpdir(), 'fvtt-generation-cwd-'));
    tempPaths.push(temp);
    process.chdir(temp);

    const actor = new ActorGenerator({ fvttVersion: '12', effectProfile: 'core' }).generate({
      name: 'External CWD Actor',
      details: {},
    } as any);
    const item = await new ItemGenerator({ fvttVersion: '12', effectProfile: 'core' })
      .generate(minimalItem());

    expect(actor.name).toBe('External CWD Actor');
    expect(actor.type).toBe('npc');
    expect(item.name).toBe('Binding Charm');
    expect(item.type).toBe('equipment');
  });

  it('validates Item effect profiles and strips module automation from core', async () => {
    expect(() => new ItemGenerator({ fvttVersion: '12', effectProfile: 'modded-v14' }))
      .toThrow(/effect profile/i);

    const core = await new ItemGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(minimalItem());
    const modded = await new ItemGenerator({ fvttVersion: '14', effectProfile: 'modded-v14' }).generate(minimalItem());
    const coreSerialized = JSON.stringify(core);

    expect(coreSerialized).not.toContain('midi-qol');
    expect(coreSerialized).not.toContain('"dae"');
    expect(modded.effects?.some((effect) => effect.flags?.dae)).toBe(true);
  });

  it('reports a structured error when an injected required resource is missing', () => {
    try {
      new ActorGenerator({
        resources: {
          requiredFiles: { lockedSchema: join(tmpdir(), 'missing-dnd5e-schema.json') },
        },
      });
      throw new Error('Expected required resource failure.');
    } catch (error) {
      expect(error).toBeInstanceOf(GenerationResourceError);
      expect((error as GenerationResourceError).code).toBe('GENERATION_RESOURCE_MISSING');
      expect((error as GenerationResourceError).resource).toBe('lockedSchema');
    }
  });
});

describe('typed fail-closed verification', () => {
  const native606Target = {
    ...getFoundryTarget('14'),
    dnd5eVersion: '6.0.6',
    stats: { coreVersion: '14.369', systemId: 'dnd5e' as const, systemVersion: '6.0.6' },
  };

  it.each([
    { name: 'utility', parsed: minimalItem },
    { name: 'attack', parsed: attackItem },
    { name: 'save', parsed: saveItem },
  ])('native606: accepts omitted empty uses max for Item and Activity on $name', async ({ parsed }) => {
    const source = parsed();
    const canonical = adaptParsedItemToCanonical(source);
    const output = await new ItemGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(source);
    expect(verifyGeneratedDocument({ canonical, output, target: '14', effectProfile: 'core' }).status).toBe('accepted');
    output._stats = { ...output._stats, ...native606Target.stats };
    output.system.uses = { spent: 0, recovery: [] };
    for (const activity of Object.values(output.system.activities) as any[]) activity.uses = { spent: 0, recovery: [] };
    const before = structuredClone(output);
    const verified = verifyGeneratedDocument({ canonical, output, target: '14', effectProfile: 'core', runtimeTarget: native606Target });
    expect(verified.status).toBe('accepted');
    expect(verified.diagnostics).toEqual([]);
    expect(output).toEqual(before);
  });

  it.each(['12', '13'] as const)('native606: keeps omitted max invalid for the legacy v%s target', async (target) => {
    const source = minimalItem();
    const canonical = adaptParsedItemToCanonical(source);
    const output = await new ItemGenerator({ fvttVersion: target, effectProfile: 'core' }).generate(source);
    output.system.uses = { spent: 0, recovery: [] };
    for (const activity of Object.values(output.system.activities) as any[]) activity.uses = { spent: 0, recovery: [] };
    const verified = verifyGeneratedDocument({ canonical, output, target, effectProfile: 'core' });
    const schemaErrors = verified.diagnostics.filter((entry) => entry.code === 'GEN_INVALID_USES_SCHEMA');
    expect(verified.status).toBe('failed');
    expect(schemaErrors.map((entry) => entry.path)).toContain('documents/0/system/uses');
    expect(schemaErrors.some((entry) => entry.path.includes('/activities/'))).toBe(true);
  });

  it.each(['value', 'per'])('native606: rejects legacy uses.%s even when max is omitted', async (field) => {
    const source = minimalItem();
    const output = await new ItemGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(source);
    output._stats = { ...output._stats, ...native606Target.stats };
    output.system.uses = { spent: 0, recovery: [], [field]: 1 };
    const verified = verifyGeneratedDocument({ canonical: adaptParsedItemToCanonical(source), output, target: '14', effectProfile: 'core', runtimeTarget: native606Target });
    expect(verified.status).toBe('failed');
    expect(verified.diagnostics.map((entry) => entry.code)).toContain('GEN_LEGACY_USES_PRESENT');
  });

  it.each([null, true, {}, []].map((max) => ({ max })))('native606: does not accept invalid explicit max: %o', async ({ max }) => {
    const source = minimalItem();
    const output = await new ItemGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(source);
    output._stats = { ...output._stats, ...native606Target.stats };
    output.system.uses = { spent: 0, recovery: [], max };
    const verified = verifyGeneratedDocument({ canonical: adaptParsedItemToCanonical(source), output, target: '14', effectProfile: 'core', runtimeTarget: native606Target });
    expect(verified.diagnostics.map((entry) => entry.code)).toContain('GEN_INVALID_USES_SCHEMA');
  });

  it('native606: missing finite Actor uses max still fails source mechanics coverage', () => {
    const parsed = {
      name: 'Limited Feature Contract', type: 'npc', abilities: {}, attributes: {}, details: {}, traits: {}, skills: {}, saves: [], items: [],
      structuredActions: { 特性: [{ name: 'Limited Recovery', type: 'utility', uses: { max: 3, period: 'day' }, describe: 'Recover three times per day.' }] },
    } as any;
    const canonical = adaptParsedActorToCanonical(parsed);
    const output = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(parsed);
    output._stats = { ...output._stats, ...native606Target.stats };
    const verify = () => verifyGeneratedDocument({ canonical, output, target: '14', effectProfile: 'core', runtimeTarget: native606Target });
    expect(verify().mechanicsCoverage.find((entry) => entry.kind === 'uses')?.status).toBe('projected');
    const limitedItem = output.items.find((item: any) => item.system.uses.max === '3');
    expect(limitedItem).toBeDefined();
    if (!limitedItem) throw new Error('Expected the generated limited-use feature.');
    delete limitedItem.system.uses.max;
    const verified = verify();
    expect(verified.status).toBe('failed');
    expect(verified.diagnostics.map((entry) => entry.code)).not.toContain('GEN_INVALID_USES_SCHEMA');
    expect(verified.diagnostics.map((entry) => entry.code)).toContain('GEN_MECHANIC_NOT_PROJECTED');
    expect(verified.mechanicsCoverage.find((entry) => entry.kind === 'uses')?.status).toBe('missing');
  });

  it('native606: does not relax uses for an unreviewed runtime target', async () => {
    const source = minimalItem();
    const output = await new ItemGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(source);
    expect(() => verifyGeneratedDocument({
      canonical: adaptParsedItemToCanonical(source), output, target: '14', effectProfile: 'core',
      runtimeTarget: { ...native606Target, stats: { ...native606Target.stats, coreVersion: '14.368' } },
    })).toThrow('Unsupported verifier runtime target.');
  });

  it('rejects missing mechanics, duplicate IDs, dangling effect links, and core profile leakage', async () => {
    const canonical = adaptParsedItemToCanonical(minimalItem(), {
      sourcePath: 'item.md',
      sourceText: 'item source',
    });
    const output = await new ItemGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(minimalItem());
    const activity = Object.values(output.system.activities ?? {})[0] as any;
    activity.effects = [{ _id: 'missing-effect-id' }];
    activity.flags = { 'midi-qol': { automation: true } };
    output.effects = [
      { _id: 'duplicate0000001', statuses: [] },
      { _id: 'duplicate0000001', statuses: [] },
    ];

    const verification = verifyGeneratedDocument({
      canonical,
      output,
      target: '14',
      effectProfile: 'core',
    });

    expect(verification.status).toBe('failed');
    expect(verification.diagnostics.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      'GEN_DUPLICATE_EFFECT_ID',
      'GEN_DANGLING_EFFECT_REFERENCE',
      'GEN_CORE_PROFILE_MODULE_LEAK',
    ]));
  });

  it('marks literal-only mechanics as needs_review and accepted output as accepted otherwise', async () => {
    const parsed = minimalItem();
    const acceptedCanonical = adaptParsedItemToCanonical(parsed, {
      sourcePath: 'item.md',
      sourceText: 'item source',
    });
    const output = await new ItemGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(parsed);
    const accepted = verifyGeneratedDocument({
      canonical: acceptedCanonical,
      output,
      target: '14',
      effectProfile: 'core',
    });

    const literalCanonical = {
      ...acceptedCanonical,
      mechanics: [{
        id: 'literal-save',
        kind: 'save' as const,
        path: 'item/save',
        projection: 'literal-only' as const,
        evidence: [],
      }],
    };
    const literal = verifyGeneratedDocument({
      canonical: literalCanonical,
      output,
      target: '14',
      effectProfile: 'core',
    });

    expect(accepted.status).toBe('accepted');
    expect(literal.status).toBe('needs_review');
    expect(literal.diagnostics.some((entry) => entry.code === 'GEN_LITERAL_REVIEW_REQUIRED')).toBe(true);
  });

  it('rejects planted damage loss, save-outcome drift, and duplicate Activity IDs', async () => {
    const attackParsed = attackItem();
    const attackCanonical = adaptParsedItemToCanonical(attackParsed);
    const attackOutput = await new ItemGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(attackParsed);
    const attackActivity = Object.values(attackOutput.system.activities)[0] as any;
    attackActivity.damage.parts = [];
    delete attackOutput.system.damage;
    const damageResult = verifyGeneratedDocument({
      canonical: attackCanonical,
      output: attackOutput,
      target: '14',
      effectProfile: 'core',
    });

    const saveParsed = saveItem();
    const saveCanonical = adaptParsedItemToCanonical(saveParsed);
    const saveOutput = await new ItemGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(saveParsed);
    const saveActivity = Object.values(saveOutput.system.activities)[0] as any;
    saveActivity.damage.onSave = 'half';
    const saveResult = verifyGeneratedDocument({
      canonical: saveCanonical,
      output: saveOutput,
      target: '14',
      effectProfile: 'core',
    });

    const duplicateOutput = await new ItemGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(attackParsed);
    const originalActivity = Object.values(duplicateOutput.system.activities)[0] as any;
    duplicateOutput.system.activities.other = { ...originalActivity };
    const duplicateResult = verifyGeneratedDocument({
      canonical: attackCanonical,
      output: duplicateOutput,
      target: '14',
      effectProfile: 'core',
    });

    expect(damageResult.diagnostics.map((entry) => entry.code)).toContain('GEN_MECHANIC_NOT_PROJECTED');
    expect(saveResult.diagnostics.map((entry) => entry.code)).toContain('GEN_SAVE_OUTCOME_MISMATCH');
    expect(duplicateResult.diagnostics.map((entry) => entry.code)).toContain('GEN_DUPLICATE_ACTIVITY_ID');
    expect([damageResult.status, saveResult.status, duplicateResult.status]).toEqual([
      'failed',
      'failed',
      'failed',
    ]);
  });
});
