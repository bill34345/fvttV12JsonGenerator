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
  it('adapts Actor and Item compatibility inputs into one discriminated union', () => {
    const actor = adaptParsedActorToCanonical({
      name: 'Contract Actor',
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
    expect(getGenerationProjector('14').systemVersion).toBe('5.3.3');
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
