import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { runMonsterIntake } from '../orchestrator';
import type {
  AiReviewResult,
  DiscoveryRequest,
  DiscoveryResult,
  ExtractionRequest,
  MonsterIntakeAiProvider,
  MonsterIntakeIR,
  RepairRequest,
  ReviewRequest,
} from '../types';

const RESOLVER_MODULE_ID = 'fvtt-json-generator-spell-resolver';
const RAT_WARLOCK_SOURCE = readFileSync(resolve(import.meta.dir, 'fixtures/rat-warlock.raw.txt'), 'utf-8');

class RatWarlockFakeProvider implements MonsterIntakeAiProvider {
  readonly providerName = 'fake';
  readonly extractionModel = 'fake-extract';
  readonly reviewModel = 'fake-review';

  async discover(_request: DiscoveryRequest): Promise<DiscoveryResult> {
    return {
      schemaVersion: 1,
      candidates: [{ id: 'rat-warlock', label: 'Warlock of the Rat God', start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE }],
    };
  }

  async extract(_request: ExtractionRequest): Promise<MonsterIntakeIR> {
    return buildRatWarlockIr();
  }

  async review(_request: ReviewRequest): Promise<AiReviewResult> {
    return { schemaVersion: 1, verdict: 'accepted', findings: [] };
  }

  async repair(_request: RepairRequest): Promise<MonsterIntakeIR> {
    return buildRatWarlockIr();
  }
}

function buildRatWarlockIr(): MonsterIntakeIR {
  const title = 'Warlock of the Rat God';
  const evidence = (quote = title) => {
    const start = RAT_WARLOCK_SOURCE.indexOf(quote);
    if (start < 0) throw new Error(`Missing Rat Warlock fixture quote: ${quote}`);
    return { start, end: start + quote.length, quote };
  };
  const claim = (path: string) => ({ path, valueKind: 'explicit' as const, evidence: [evidence()], confidence: 'high' as const });
  const spellcastingEnd = RAT_WARLOCK_SOURCE.indexOf('Keen Smell');
  if (spellcastingEnd < 0) throw new Error('Missing Rat Warlock spellcasting boundary.');
  const spellcastingDescription = RAT_WARLOCK_SOURCE.slice(RAT_WARLOCK_SOURCE.indexOf('Innate Spellcasting'), spellcastingEnd).trim();
  const claims = [
    claim('/creature/identity/name'), claim('/creature/identity/size'), claim('/creature/identity/creatureType'), claim('/creature/identity/alignment'),
    claim('/creature/attributes/ac'), claim('/creature/attributes/hp'), claim('/creature/attributes/movement'), claim('/creature/attributes/cr'), claim('/creature/attributes/xp'), claim('/creature/attributes/proficiencyBonus'),
    claim('/creature/abilities'), claim('/creature/skills'), claim('/creature/senses'), claim('/creature/languages'),
    claim('/creature/traits/0'), claim('/creature/traits/1'), claim('/creature/traits/2'), claim('/creature/actions/0'),
  ];

  return {
    schemaVersion: 1,
    source: { sha256: createHash('sha256').update(RAT_WARLOCK_SOURCE).digest('hex'), length: RAT_WARLOCK_SOURCE.length },
    creature: {
      identity: { name: '鼠神邪术师', englishName: title, size: 'small', creatureType: 'monstrosity', alignment: 'chaotic evil' },
      abilities: { str: 7, dex: 14, con: 13, int: 13, wis: 11, cha: 15 },
      attributes: { ac: 12, acNote: '有法师护甲 mage armor 时 15', hp: { value: 27, formula: '6d6+6' }, movement: { walk: 30, climb: 30, swim: 30 }, cr: 2, xp: 450, proficiencyBonus: 2 },
      saves: {},
      skills: { deception: 4, stealth: 4 },
      defenses: { resistances: [], immunities: [], vulnerabilities: [], conditionImmunities: [] },
      senses: { darkvision: 60, passivePerception: 10 },
      languages: { values: ['common'] },
      traits: [
        { name: '天生施法', englishName: 'Innate Spellcasting', description: spellcastingDescription },
        { name: '敏锐嗅觉', englishName: 'Keen Smell', description: '鼠怪依靠嗅觉进行的感知检定具有优势。' },
        { name: '潜伏者', englishName: 'Skulker', description: '在每个鼠怪自己的回合中，鼠怪都可以用附赠动作来进行躲藏动作。', activationType: 'bonus' },
      ],
      actions: [
        { name: '啃咬', englishName: 'Bite', description: '近战武器攻击检定：命中+4，触及5尺，单一目标。命中：4（1d4+2）穿刺伤害。', activityType: 'attack', attack: { type: 'mwak', toHit: 4, reach: 5 }, damage: [{ formula: '1d4+2', type: 'piercing', relationship: 'base' }] },
      ],
      bonusActions: [],
      reactions: [],
      legendaryActions: [],
    },
    claims,
    coverage: [{ start: 0, end: RAT_WARLOCK_SOURCE.length, quote: RAT_WARLOCK_SOURCE, classification: 'mechanical', claimPaths: claims.map((entry) => entry.path) }],
    uncertainties: [],
  };
}

async function runRatWarlockFixture() {
  const root = mkdtempSync(join(tmpdir(), 'rat-warlock-spell-baseline-'));
  const intake = await runMonsterIntake({
    source: RAT_WARLOCK_SOURCE,
    sourceName: 'rat-warlock.raw.txt',
    runRoot: join(root, 'runs'),
    vaultPath: join(root, 'vault'),
    fvttVersion: '14',
    effectProfile: 'core',
  }, new RatWarlockFakeProvider());
  const candidateActor = JSON.parse(readFileSync(join(intake.runPath, 'creatures/rat-warlock/candidate-actor.json'), 'utf-8'));
  const spellResolution = (intake as typeof intake & { spellResolution?: { status?: string } }).spellResolution;
  return { monsters: intake.creatures, candidateActor, spellResolution };
}

describe('Rat Warlock spell resolver baseline', () => {
  test('Rat Warlock emits a portable ten-spell manifest without resolved items', async () => {
    const result = await runRatWarlockFixture();
    const actor = result.candidateActor;
    const manifest = actor.flags?.[RESOLVER_MODULE_ID]?.spellManifest;

    expect(result.monsters).toHaveLength(1);
    expect(manifest).toBeDefined();
    expect(manifest.spellcastingGroups.flatMap((group: { spellRefs: unknown[] }) => group.spellRefs)).toHaveLength(10);
    expect(actor.items.filter((item: { type: string }) => item.type === 'spell')).toHaveLength(0);
    expect(result.spellResolution?.status).toBe('pending');
  });
});
