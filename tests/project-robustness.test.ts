import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertItemCollectionToJson } from '../src/core/application/workflows';
import { convertMarkdownContentToJson } from '../packages/workflows/src/singleFileConversion';
import { convertMonsterCollectionToJson } from '../packages/workflows/src/collectionConversion';
import { disabledIconWorkflowPort } from '../packages/workflows/src/iconPort';
import { ItemParser } from '../packages/parser/src/itemParser';
import { generateItemArtifacts } from '../packages/workflows/src/itemGenerationWorkflow';
import { verifyGeneratedDocument } from '../packages/generation/src/verification';
import { buildActorVerificationSummaryFromValues } from '../packages/workflows/src/actorVerification';
import { assertEqualStructure } from '../src/core/utils/assertEqualStructure';
import { projectForgeVerificationSummary } from '../packages/forge-gateway-protocol/src';
import { adaptParsedActorToCanonical } from '../packages/generation/src/adapters';
import { ParserFactory } from '../packages/parser/src/router';

const shield = readFileSync('tests/fixtures/robustness/shield.md', 'utf8');
const creature = readFileSync('tests/fixtures/robustness/rest-creature.md', 'utf8');
const target = { fvttVersion: '14' as const, effectProfile: 'core' as const };
const spear = readFileSync('obsidian/dnd数据转fvttjson/input/items/moonweavers-spear__织月者之矛.md', 'utf8');

describe('integrated Item save contract', () => {
  test.each(['2d8', '1d6+3', '3d4-2'])('preserves damage %s and rejects extra costs or damage', async formula => {
    const source = spear.replace('formula: 2d8', `formula: ${formula}`);
    const [artifact] = await generateItemArtifacts(new ItemParser().parse(source), { ...target, sourceText: source });
    expect(artifact!.verification.status).toBe('accepted');
    const item = artifact!.item as any;
    expect(Object.values(item.system.activities).filter((a: any) => a.type === 'cast')).toEqual([]);
    expect(item.system.description.value).toContain('GM 辅助边界');
    for (const corrupt of [
      (a: any) => a.damage.parts.push(structuredClone(a.damage.parts[0])),
      (a: any) => a.damage.parts[0].types.push('fire'),
      (a: any) => a.consumption.targets.push({ type: 'itemUses', target: '', value: '2' }),
      (a: any) => { a.consumption.targets[0].target = 'anotherItem'; },
      (a: any) => a.save.ability.push('wis'),
      (a: any) => { a.damage.parts[0].scaling.number = 9; },
    ]) {
      const copy = structuredClone(item);
      corrupt(Object.values(copy.system.activities).find((a: any) => a.type === 'save'));
      const result = verifyGeneratedDocument({ canonical: artifact!.canonical, output: copy, target: '14', effectProfile: 'core' });
      expect(result.status).toBe('failed');
      expect(result.diagnostics.some(d => d.code === 'GEN_ITEM_SAVE_ACTIVITY_MISMATCH')).toBeTrue();
    }
    const crlf = await convertMarkdownContentToJson({ ...target, content: source.replace(/\r?\n/g, '\r\n') });
    expect(crlf.status).toBe('accepted');
    expect((crlf.rawJson as any).system.activities).toEqual(item.system.activities);
  });

  test.each([
    ['ability: con', 'ability: mystery'],
    ['mode: whole', 'mode: arbitrary'],
    ['number: 2', 'number: 1.5'],
    ['formula: 2d8', 'formula: 2d0'],
    ['max: 3', 'max: nonsense'],
    ['max: 3', 'max: -1'],
    ['max: 3', 'max: 1.5'],
    ['period: dawn', 'period: dwan'],
    ['type: recoverAll', 'type: misspelled'],
    ['type: recoverAll', 'type: formula'],
    ['scale-max: 3', 'scale-max: nonsense'],
    ['scale-max: 3', 'scale-max: 4'],
    ['scale-max: 3', 'scale-max: 0'],
    ['consumption: 1', 'consumption: 1.5'],
  ])('rejects unsupported source value %s', (before, after) => {
    expect(() => new ItemParser().parse(spear.replace(before, after))).toThrow();
  });
  test.each(['lr', 'dusk', 'initiative'])('preserves valid recovery period %s', async period => {
    const source = spear.replace('period: dawn', `period: ${period}`);
    const result = await convertMarkdownContentToJson({ ...target, content: source });
    expect(result.status).toBe('accepted');
    expect((result.rawJson as any).system.uses.recovery).toEqual([{ period, type: 'recoverAll' }]);
  });
});

describe('project robustness source regressions', () => {
  test.each([1, 3, 5])('structured per-rest action spends its own %s-use resource', async maximum => {
    const source = readFileSync('tests/fixtures/robustness/daily-guard.md', 'utf8')
      .replace('使用次数: {max: 3, period: longRest}', `使用次数: {max: ${maximum}, period: longRest}`);
    for (const version of ['12', '14'] as const) {
      const result = await convertMarkdownContentToJson({ ...target, fvttVersion: version, content: source });
      expect(result.status).toBe('accepted');
      const actor = result.rawJson as any;
      const touch = actor.items.find((i: any) => i.name === '日用警报');
      expect(touch.system.uses).toEqual({ spent: 0, max: String(maximum), recovery: [{ period: 'lr', type: 'recoverAll' }] });
      expect((Object.values(touch.system.activities)[0] as any).consumption).toEqual({
        targets: [{ type: 'itemUses', value: '1', target: '', scaling: { mode: '', formula: '' } }],
        scaling: { allowed: false, max: '' }, spellSlot: false,
      });
      const tail = actor.items.find((i: any) => i.name === '手势');
      expect(tail.system.uses).toBeUndefined();
      expect((Object.values(tail.system.activities)[0] as any).consumption).toBeUndefined();
      const canonical = adaptParsedActorToCanonical(new ParserFactory().parse(source));
      for (const corrupt of [
        (item: any) => { delete (Object.values(item.system.activities)[0] as any).consumption; },
        (item: any) => { item.system.uses.max = String(maximum + 1); },
        (item: any) => { item.system.uses.recovery[0].period = 'day'; },
      ]) {
        const copy = structuredClone(actor);
        const broken = copy.items.find((i: any) => i.name === '日用警报');
        corrupt(broken);
        expect(verifyGeneratedDocument({ canonical, output: copy, target: version, effectProfile: 'core' }).status).toBe('failed');
      }
    }
  });
  test.each(['珍稀', '稀有', 'rare'])('preserves exact rare label %s', async rarity => {
    const result = await convertMarkdownContentToJson({ ...target, content: shield.replace('珍稀', rarity) });
    expect((result.rawJson as any).system.rarity).toBe('rare');
    expect(new ItemParser().parse(shield.replace('珍稀', rarity + '材料')).rarity).toBeUndefined();
  });
  test.each([2, 3, 4])('explicit shield bonus %s survives and mutations fail', async bonus => {
    const source = shield.replace('+3', `+${bonus}`);
    const [artifact] = await generateItemArtifacts(new ItemParser().parse(source), { ...target, sourceText: source });
    expect(artifact!.verification.status).toBe('accepted');
    expect(artifact!.canonical.source.text).toBe(source);
    const item = artifact!.item as any;
    expect(item.system.armor.magicalBonus).toBe(bonus);
    expect(item.system.source.custom).toBe('Custom campaign source');
    expect(item.system.source.book).toBe('');
    expect(item.system.source.license).toBe('');
    for (const corrupt of [
      (copy: any) => { copy.system.armor.magicalBonus = 99; },
      (copy: any) => { delete copy.system.armor; },
      (copy: any) => { copy.system.type.baseItem = 'plate'; },
    ]) {
      const copy = structuredClone(item); corrupt(copy);
      expect(verifyGeneratedDocument({ canonical: artifact!.canonical, output: copy, target: '14', effectProfile: 'core' }).status).toBe('failed');
    }
    const crlf = await convertMarkdownContentToJson({ ...target, content: source.replace(/\r?\n/g, '\r\n') });
    assertEqualStructure(crlf.rawJson, item, { mode: 'shape' });
    expect((crlf.rawJson as any).system.armor).toEqual(item.system.armor);
  });

  test.each([2, 3, 4])('ambiguous shield bonus %s needs review without official output', async bonus => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-robustness-'));
    try {
      const outputPath = join(root, 'result.json');
      const result = await convertMarkdownContentToJson({ ...target, outputPath, content: shield.replace('额外 +3', `+${bonus}`) });
      expect(result.status).toBe('needs_review');
      expect(result.diagnostics.some(d => d.code === 'GEN_LITERAL_REVIEW_REQUIRED')).toBe(true);
      expect(existsSync(outputPath)).toBe(false);
    } finally { rmSync(root, { recursive: true }); }
  });

  test('negated bonus is not invented', async () => {
    const result = await convertMarkdownContentToJson({ ...target, content: shield.replace('获得额外 +3 加值', '不会获得 +3 加值') });
    expect(result.status).toBe('accepted');
    expect((result.rawJson as any).system.armor.magicalBonus).toBeNull();
  });

  test.each(['护甲等级提高 +3', '护甲等级提升 +3', '护甲等级增加 +3', 'Armor Class increases by +3'])('unresolved AC increase requires review: %s', async clause => {
    const result = await convertMarkdownContentToJson({ ...target, content: shield.replace('护甲等级获得额外 +3 加值', clause) });
    expect(result.status).toBe('needs_review');
    expect(result.diagnostics.some(d => d.code === 'GEN_LITERAL_REVIEW_REQUIRED')).toBe(true);
    const projected = projectForgeVerificationSummary(result.verification);
    expect(projected.mechanicsCoverage.find(entry => entry.status === 'literal-only')?.sourceField).toBe('item.armor');
  });

  test.each(['护甲等级不会提高 +3', '护甲等级不增加 +3', 'Armor Class does not increase by +3', "Armor Class doesn't increase by +3"])('negated AC increase stays unautomated: %s', async clause => {
    const result = await convertMarkdownContentToJson({ ...target, content: shield.replace('护甲等级获得额外 +3 加值', clause) });
    expect(result.status).toBe('accepted');
    expect((result.rawJson as any).system.armor.magicalBonus).toBeNull();
  });

  test.each(['Sentinel', 'sentinel'])('duplicate item filenames reject whole batch (%s)', async second => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-robustness-'));
    const block = (name: string, bonus: number) => `## 盾牌（${name}）\n*护甲（盾牌），珍稀*\n持握这面盾牌期间，你的护甲等级获得额外 +${bonus} 加值。\n`;
    try {
      await expect(convertItemCollectionToJson({ ...target, content: block('Sentinel', 2) + block(second, 3), outputDir: root })).rejects.toThrow('COLLECTION_OUTPUT_COLLISION');
      expect(readdirSync(root)).toEqual([]);
    } finally { rmSync(root, { recursive: true }); }
  });

  test('monster normalized output collision is caught before first write', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-robustness-'));
    try {
      await expect(convertMonsterCollectionToJson({ ...target, content: '', outputDir: root }, {
        iconWorkflow: disabledIconWorkflowPort,
        ingestion: {
          splitMonsterCollection: () => ['a', 'b'].map(rawBlock => ({ rawBlock, chineseName: rawBlock, englishName: '' })),
          parseMonsterBlock: raw => ({ fileName: raw === 'a' ? 'A:B.md' : 'a?b.md', markdown: creature }),
          splitItemCollection: () => [],
        },
      })).rejects.toThrow('COLLECTION_OUTPUT_COLLISION');
      expect(readdirSync(root)).toEqual([]);
    } finally { rmSync(root, { recursive: true }); }
  });

  test.each([
    ['Short or Long', 'humanoid (orc, shapechanger)', 'sr'],
    ['Long', 'fiend (demon)', 'lr'],
    ['Short', 'beast', 'sr'],
  ])('source identity and %s rest recovery survive generation', async (rest, type, period) => {
    const content = creature.replace('Short or Long', rest).replace('humanoid (orc, shapechanger)', type);
    const result = await convertMarkdownContentToJson({ ...target, content });
    const actor = result.rawJson as any;
    expect(result.status).not.toBe('failed');
    expect(actor.system.details.type.value).toBe(type!.split(' ')[0]);
    expect(result.actorVerification!.sourceIntegrityErrors).toEqual([]);
    const expectedName=`Guard Stance (Recharges after a ${rest} Rest)`;
    const item = actor.items.find((i: any) => i.name === expectedName);
    expect(item.system.uses).toEqual({ spent: 0, max: '1', recovery: [{ period, type: 'recoverAll' }] });
    expect(Object.values(item.system.activities).some((a: any) => a.consumption?.targets.some((t: any) => t.type === 'itemUses' && t.value === '1'))).toBe(true);
    const crlf = await convertMarkdownContentToJson({ ...target, content: content.replace(/\r?\n/g, '\r\n') });
    assertEqualStructure(crlf.rawJson, actor, { mode: 'shape' });
    for (const corrupt of [
      (copy: any) => { copy.system.details.type.value = ''; },
      (copy: any) => { copy.system.details.type.subtype = 'invented subtype'; },
      (copy: any) => { delete copy.items.find((i: any) => i.name === expectedName).system.uses; },
      (copy: any) => { copy.items.find((i: any) => i.name === expectedName).system.description.value = ''; },
    ]) {
      const copy = structuredClone(actor); corrupt(copy);
      expect(buildActorVerificationSummaryFromValues({ source: content, actor: copy }).sourceIntegrityErrors.length).toBeGreaterThan(0);
    }
  });

  test('ordinary and negated headings do not gain rest consumption', async () => {
    for (const heading of ['Guard Stance', 'Guard Stance (Does not recharge after a Long Rest)']) {
      const content = creature.replace('Guard Stance (Recharges after a Short or Long Rest)', heading);
      const result = await convertMarkdownContentToJson({ ...target, content });
      expect((result.rawJson as any).items[0].system.uses?.max ?? '').not.toBe('1');
    }
  });

  test('real multiline White Tusk source retains subtype and recovery', async () => {
    const content = readFileSync('obsidian/dnd数据转fvttjson/input/white-tusk-shaman.md', 'utf8');
    const result = await convertMarkdownContentToJson({ ...target, content });
    const actor = result.rawJson as any;
    expect(actor.system.details.type).toMatchObject({ value: 'humanoid', subtype: 'orc, shapechanger' });
    expect(result.actorVerification!.sourceIntegrityErrors).toEqual([]);
    expect(actor.items.find((i: any) => i.name === 'Spirit-Bonded Body (Recharges after a Short or Long Rest)').system.uses.recovery[0].period).toBe('sr');
    expect(actor.system.skills.prc.bonuses.passive).toBe('+3');
  });

  test.each([15, 18, 22])('explicit passive Perception %s is retained and independently verified', async score => {
    const content = creature.replace('challenge: 1', `challenge: 1\nsenses: "passive Perception ${score}"`);
    const result = await convertMarkdownContentToJson({ ...target, content });
    expect(result.actorVerification!.sourceIntegrityErrors).toEqual([]);
    const copy = structuredClone(result.rawJson) as any;
    copy.system.skills.prc.bonuses.passive = '+99';
    expect(buildActorVerificationSummaryFromValues({ source: content, actor: copy }).sourceIntegrityErrors).toContain('SOURCE_PASSIVE_PERCEPTION_MISMATCH: passive Perception differs from source.');
  });
});
