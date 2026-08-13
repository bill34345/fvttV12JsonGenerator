import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileSpeciesMarkdownV14, validateNativeSpeciesPackage } from '@fvtt-json-generator/generation/species-v14';
import { parseSpeciesMarkdown } from '@fvtt-json-generator/parser/species-parser';
import { runSpeciesIntake } from '@fvtt-json-generator/intake-ai/species-orchestrator';
import { renderSpeciesIntakeMarkdown } from '@fvtt-json-generator/intake-ai/species-renderer';
import type { SpeciesDiscoveryCandidate, SpeciesIntakeAiProvider, SpeciesIntakeIR } from '@fvtt-json-generator/intake-ai/species-types';

const source = readFileSync(resolve('tests/fixtures/species/ogre.txt'), 'utf8').trim();
const candidate: SpeciesDiscoveryCandidate = { id: 'ogre', label: '食人魔（Ogre）', start: 0, end: source.length, quote: source };

function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function rehash(pkg: any): any {
  pkg.logicalHash = hash(canonicalJson({ schemaVersion: pkg.schemaVersion, moduleId: pkg.moduleId, target: pkg.target, sourceSha256: pkg.sourceSha256, species: pkg.species, features: pkg.features, coverageLedger: pkg.coverageLedger }));
  return pkg;
}
function makeIr(input = source): SpeciesIntakeIR {
  const evidence = { start: 0, end: input.length, quote: input };
  const claimPaths = ['/species/name', '/species/englishName', '/species/displayName', '/species/identifier', '/species/rules', '/species/creatureType', '/species/size', '/species/movement', '/species/senses', ...Array.from({ length: 5 }, (_, index) => `/species/features/${index}`)];
  return {
    schemaVersion: 1,
    source: { sha256: hash(input), length: input.length },
    species: {
      name: '食人魔', englishName: 'Ogre', displayName: '食人魔（Ogre）', identifier: 'ogre', rules: '2024',
      creatureType: { value: 'giant', subtype: 'Ogre' },
      size: { options: ['lg'], hint: '大型（约10–12尺）' }, movement: { walk: 40 }, senses: { darkvision: 60 },
      source: { kind: 'private-homebrew', sha256: hash(input), irRevision: 1 },
      features: [
        {
          id: 'giant-weapon-use', name: '巨武器使用', description: [
            '你可以使用比重型还大的巨型武器：',
            '1. 巨型武器可以造成比原本武器大一面骰子的伤害。若武器原本是1d12的骰子伤害，则伤害变成2d8。',
            '2. 你可以投掷任意不带重型或巨型词条的武器，在投掷时从原本的一个骰子拆分成两个更小面的骰子，最终最大值保持一致（eg：战锤1d8 → 投掷战锤2d4），投掷范围20/60。',
            '3. 你的武器或徒手攻击可以让体型不超过你二级的生物进行一次力量豁免，DC=8+你的攻击检定时使用的调整值+熟练加值，失败的生物会被你推离5尺（已记在武器内）。',
            '4. 若你武器或徒手攻击的目标是物件或建筑物，则你可以对其造成双倍伤害。',
          ].join('\n'), parts: [{ id: 'giant-weapon-use-assisted', level: 0, automation: 'gm-assisted', mechanics: [{ kind: 'gm-assisted', boundaries: ['玩家自行修改对应武器数据。', '不解释“体型不超过你二级”。', '不自动判定物件或建筑物。', '不生成推击或移动Token；已有武器推击规则不重复生成。'] }] }],
        },
        { id: 'powerful-build', name: '身强力壮', englishName: 'Powerful Build', description: '你为让自己结束受擒状态所进行的属性检定具有优势。', parts: [{ id: 'powerful-build-passive', level: 0, automation: 'descriptive', mechanics: [{ kind: 'descriptive-passive' }] }] },
        { id: 'powerful-build-bonus-escape', name: '身强力壮：附赠动作脱困', description: '从第5级开始，若原本解除受擒状态所需要进行的属性检定要求消耗你的动作，取而代之你可以消耗一个附赠动作进行尝试，你可以这么做2次，长休后恢复所有使用次数。', parts: [{ id: 'powerful-build-bonus-escape-utility', level: 5, automation: 'native', mechanics: [{ kind: 'limited-utility', activation: 'bonus', uses: { max: 2, recovery: 'lr' }, consumption: 1, chatFlavor: '按原受擒规则进行相应属性检定；你继续享有身强力壮提供的优势。本活动不自动选择属性、技能或移除受擒状态。' }] }] },
        { id: 'ogre-toughness', name: '食人魔刚毅', englishName: 'Ogre Toughness', description: '你的生命值上限加3，且此后每次升级时再加3。角色总等级为N时，生命值上限共增加3N。', parts: [{ id: 'ogre-toughness-hp', level: 0, automation: 'native', mechanics: [{ kind: 'hp-per-level', value: 3 }] }] },
        { id: 'ogre-clumsiness', name: '食人魔笨拙', description: '你的AC-2，若你倒地，则你需要花费全部速度站起来。', parts: [{ id: 'ogre-clumsiness-ac', level: 0, automation: 'native', mechanics: [{ kind: 'ac-bonus', value: -2 }] }, { id: 'ogre-clumsiness-prone', level: 0, automation: 'gm-assisted', mechanics: [{ kind: 'gm-assisted', boundaries: ['倒地后花费全部速度站起由玩家/GM执行；不自动扣除移动，不自动处理倒地状态。'] }] }] },
      ],
    },
    claims: claimPaths.map((path) => ({ path, evidence: [evidence] })),
    coverage: [{ ...evidence, classification: 'mechanical', claimPaths }],
    uncertainties: [],
  };
}

class FakeProvider implements SpeciesIntakeAiProvider {
  providerName = 'fake'; extractionModel = 'fake'; reviewModel = 'fake';
  async discover() { return { schemaVersion: 1 as const, candidates: [candidate] }; }
  async extract() { return makeIr(); }
  async repair() { return makeIr(); }
  async review() { return { schemaVersion: 1 as const, verdict: 'accepted' as const, findings: [] }; }
}

describe('Species TXT Intake and Ogre v14 projection', () => {
  test('promotes one evidence-backed Ogre and writes a hash ledger', async () => {
    const root = mkdtempSync(join(tmpdir(), 'species-intake-'));
    const result = await runSpeciesIntake({ source, sourceName: 'ogre.txt', runRoot: join(root, 'runs'), vaultPath: join(root, 'vault'), fvttVersion: '14', effectProfile: 'core' }, new FakeProvider());
    expect(result.status).toBe('succeeded'); expect(result.species[0]?.status).toBe('accepted');
    const markdown = readFileSync(result.species[0]!.markdownPath!, 'utf8');
    const parsed = parseSpeciesMarkdown(markdown);
    expect(parsed.displayName).toBe('食人魔（Ogre）'); expect(parsed.rawSource).toContain('食人魔Orge');
    const pkg = compileSpeciesMarkdownV14(markdown);
    expect(validateNativeSpeciesPackage(pkg)).toEqual({ ok: true, findings: [] });
    expect(pkg.species.system.type).toEqual({ value: 'giant', custom: '', subtype: 'Ogre' });
    expect(pkg.species.system.movement.walk).toBe(40); expect(pkg.species.system.senses.darkvision).toBe(60);
    expect(pkg.species.system.advancement[0].configuration.sizes).toEqual(['lg']);
    expect(pkg.species.system.advancement.filter((entry: any) => entry.type === 'ItemGrant').map((entry: any) => [entry.level, entry.configuration.items.length])).toEqual([[0, 4], [5, 1]]);
    const giantWeapon = pkg.features.find((item) => item.system.identifier === 'giant-weapon-use')!;
    expect(giantWeapon.system.description.value).toContain('1d12'); expect(giantWeapon.system.description.value).toContain('战锤1d8');
    expect(Object.keys(giantWeapon.system.activities)).toHaveLength(0); expect(giantWeapon.effects).toHaveLength(0);
    const baseBuild = pkg.features.find((item) => item.system.identifier === 'powerful-build')!;
    expect(baseBuild.effects).toHaveLength(0); expect(JSON.stringify(baseBuild)).not.toContain('system.abilities.str.check.roll.mode');
    const escape = pkg.features.find((item) => item.system.identifier === 'powerful-build-bonus-escape')!;
    expect(escape.system.uses).toEqual({ spent: 0, recovery: [{ period: 'lr', type: 'recoverAll' }], max: '2' });
    const activity = Object.values(escape.system.activities)[0] as any;
    expect(activity.activation.type).toBe('bonus'); expect(activity.consumption.targets[0].value).toBe('1'); expect(activity.consumption.spellSlot).toBe(false); expect(activity.description.chatFlavor).toContain('不自动选择属性');
    const toughness = pkg.features.find((item) => item.system.identifier === 'ogre-toughness')!;
    expect(toughness.effects[0].changes).toEqual([{ key: 'system.attributes.hp.bonuses.level', mode: 2, value: '3', priority: null }]);
    const clumsy = pkg.features.find((item) => item.system.identifier === 'ogre-clumsiness')!;
    expect(clumsy.effects[0].changes).toEqual([{ key: 'system.attributes.ac.bonus', mode: 2, value: '-2', priority: null }]);
    expect(JSON.stringify(pkg)).not.toMatch(/ability-score|language|reach|carrying|weaponProficien|unarmed|resistance/iu);
    const arbitraryMarkdown = markdown.replace('kind: hp-per-level', 'kind: hp-per-level\n            system-path: system.attributes.hp.value');
    expect(() => parseSpeciesMarkdown(arbitraryMarkdown)).toThrow('Arbitrary');
    const arbitraryPackage = structuredClone(pkg);
    arbitraryPackage.features.find((item) => item.system.identifier === 'ogre-toughness')!.effects[0].changes[0].key = 'system.attributes.hp.max';
    expect(validateNativeSpeciesPackage(arbitraryPackage).findings.some((finding) => finding.code === 'EFFECT_KEY')).toBeTrue();
  });

  test('is deterministic and refuses unsupported targets before provider work', async () => {
    const root = mkdtempSync(join(tmpdir(), 'species-intake-'));
    const provider = new FakeProvider();
    const result = await runSpeciesIntake({ source, sourceName: 'ogre.txt', runRoot: join(root, 'runs'), vaultPath: join(root, 'vault'), fvttVersion: '14', effectProfile: 'core' }, provider);
    const markdown = readFileSync(result.species[0]!.markdownPath!, 'utf8');
    expect(compileSpeciesMarkdownV14(markdown).logicalHash).toBe(compileSpeciesMarkdownV14(markdown).logicalHash);
    await expect(runSpeciesIntake({ source, sourceName: 'ogre.txt', fvttVersion: '14', effectProfile: 'core', dryRun: true })).resolves.toMatchObject({ status: 'dry_run' });
    await expect(runSpeciesIntake({ source, sourceName: 'ogre.txt', fvttVersion: '12' as any, effectProfile: 'core' }, provider)).rejects.toThrow('only supports');
  });

  test('rejects rehashed package mutations that escape declared Core mechanics', () => {
    const root = compileSpeciesMarkdownV14(renderForMutation());
    const mutate = (apply: (pkg: any) => void) => { const pkg = structuredClone(root); apply(pkg); return validateNativeSpeciesPackage(rehash(pkg)).findings.map((finding) => finding.code); };
    expect(mutate((pkg) => { pkg.target.foundry = '15.0'; })).toContain('TARGET');
    expect(mutate((pkg) => { pkg.features[1]._id = pkg.features[0]._id; })).toContain('DUPLICATE_ID');
    expect(mutate((pkg) => { pkg.species.system.advancement.find((entry: any) => entry.type === 'ItemGrant').configuration.items[0].uuid = 'Compendium.fvtt-homebrew-species.features.Item.0000000000000000'; })).toContain('DANGLING_GRANT');
    expect(mutate((pkg) => { pkg.features[0].flags['midi-qol'] = { onUseMacroName: 'x' }; })).toContain('CORE_PROFILE_MODULE_LEAKAGE');
    expect(mutate((pkg) => { pkg.features[0].effects = structuredClone(pkg.features.find((item: any) => item.system.identifier === 'ogre-toughness').effects); })).toContain('UNDECLARED_EFFECT');
    expect(mutate((pkg) => { pkg.features[0].system.activities = structuredClone(pkg.features.find((item: any) => item.system.identifier === 'powerful-build-bonus-escape').system.activities); })).toContain('ACTIVITY_COVERAGE_MISMATCH');
    expect(mutate((pkg) => { pkg.species.system.advancement.find((entry: any) => entry.type === 'ItemGrant').configuration.items.shift(); })).toContain('MISSING_GRANT');
    expect(mutate((pkg) => { const grant = pkg.species.system.advancement.find((entry: any) => entry.type === 'ItemGrant'); grant.configuration.items.push(structuredClone(grant.configuration.items[0])); })).toContain('DUPLICATE_GRANT');
  });
});

function renderForMutation(): string {
  return renderSpeciesIntakeMarkdown(source, candidate, makeIr());
}
