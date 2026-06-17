import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ActorGenerator } from '../../generator/actor';
import { ParserFactory } from '../../parser/router';
import {
  PlainTextIngestionWorkflow,
  parseCreatureBlock,
  splitCollection,
} from '../plaintext';

const FIXTURE_DIR = resolve(process.cwd(), 'tests/fixtures/plaintext');
const SOURCE_PATH = resolve(
  FIXTURE_DIR,
  readdirSync(FIXTURE_DIR).find((file) => file.toLowerCase().endsWith('.md')) ?? '',
);

class FailingAiNormalizer {
  public async normalizeBlock(): Promise<string> {
    throw new Error('upstream failed');
  }
}

function getBlock(englishName: string) {
  const text = readFileSync(SOURCE_PATH, 'utf-8');
  const block = splitCollection(text).find((entry) => entry.englishName === englishName);
  expect(block).toBeDefined();
  if (!block) {
    throw new Error(`Expected creature block for ${englishName}`);
  }
  return block;
}

async function generateActorFromBlock(englishName: string) {
  const block = getBlock(englishName);
  const generated = parseCreatureBlock(block.rawBlock);
  const parserFactory = new ParserFactory();
  const route = parserFactory.detectRoute(generated.markdown);
  const parsed = parserFactory.parse(generated.markdown);
  const actor = await new ActorGenerator({
    fvttVersion: '12',
    translationService: null,
    effectProfile: 'modded-v12',
  }).generateForRoute(parsed, route);
  return { generated, parsed, actor };
}

async function generateActorFromRawBlock(rawBlock: string) {
  const generated = parseCreatureBlock(rawBlock);
  const parserFactory = new ParserFactory();
  const route = parserFactory.detectRoute(generated.markdown);
  const parsed = parserFactory.parse(generated.markdown);
  const actor = await new ActorGenerator({
    fvttVersion: '12',
    translationService: null,
    effectProfile: 'core',
  }).generateForRoute(parsed, route);
  return { generated, parsed, actor };
}

describe('PlainTextIngestionWorkflow', () => {
  const roots: string[] = [];

  afterAll(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('splits the fixture collection into 7 creature blocks with bilingual names', () => {
    const text = readFileSync(SOURCE_PATH, 'utf-8');
    const blocks = splitCollection(text);

    expect(blocks).toHaveLength(7);
    expect(blocks[0]?.englishName).toBe('Scuttling Serpentmaw');
    expect(blocks[1]?.englishName).toBe('Slithering Bloodfin');
    expect(blocks[6]?.englishName).toBe("Death's Embrace");
  });

  it('emits stable bilingual filenames and sectioned markdown', () => {
    const first = getBlock('Scuttling Serpentmaw');
    const parsed = parseCreatureBlock(first.rawBlock);

    expect(parsed.fileName).toBe('scuttling-serpentmaw__蛇口蛮蟹.md');
    expect(parsed.markdown).toContain('### 特性');
    expect(parsed.markdown).toContain('### 动作');
    expect(parsed.markdown).not.toContain('### 原始备注');
  });

  it('writes 7 markdown files when not in dry-run mode', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-plaintext-ingest-'));
    roots.push(root);
    const inputDir = join(root, 'input');

    const workflow = new PlainTextIngestionWorkflow({ aiNormalizer: null });
    const result = await workflow.ingest({
      sourcePath: SOURCE_PATH,
      emitDir: inputDir,
      dryRun: false,
    });

    expect(result.files).toHaveLength(7);
    expect(result.emitDir).toBe(join(root, 'middle'));
    expect(existsSync(join(root, result.files[0]!.fileName))).toBe(false);
    expect(existsSync(join(result.emitDir, result.files[0]!.fileName))).toBe(true);
    expect(existsSync(join(result.emitDir, result.files[1]!.fileName))).toBe(true);
  });

  it('does not write files in dry-run mode', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-plaintext-dry-run-'));
    roots.push(root);
    const inputDir = join(root, 'input');

    const workflow = new PlainTextIngestionWorkflow({ aiNormalizer: null });
    const result = await workflow.ingest({
      sourcePath: SOURCE_PATH,
      emitDir: inputDir,
      dryRun: true,
    });

    expect(result.files).toHaveLength(7);
    expect(result.emitDir).toBe(join(root, 'middle'));
    expect(existsSync(join(result.emitDir, result.files[0]!.fileName))).toBe(false);
  });

  it('falls back to rule-based normalization when AI normalization fails', async () => {
    const workflow = new PlainTextIngestionWorkflow({
      aiNormalizer: new FailingAiNormalizer(),
    });

    const result = await workflow.ingest({
      sourcePath: SOURCE_PATH,
      emitDir: tmpdir(),
      dryRun: true,
      enableAiNormalize: true,
    });

    expect(result.files).toHaveLength(7);
    expect(result.files[0]?.fileName).toBe('scuttling-serpentmaw__蛇口蛮蟹.md');
  });

  it('bridges generated markdown into parsed actions and actor items', async () => {
    const { parsed, actor } = await generateActorFromBlock('Slithering Bloodfin');

    expect(parsed.actions?.length).toBeGreaterThan(0);
    expect(parsed.bonus_actions?.length).toBeGreaterThan(0);
    expect(parsed.reactions?.length).toBeGreaterThan(0);
    expect(actor.items.some((item) => item.name.includes('(Swallow)'))).toBe(true);
    expect(actor.items.some((item) => item.system?.activation?.type === 'reaction')).toBe(true);
  });

  it('maps structured sense notes into actor senses.special for Scuttling Serpentmaw', async () => {
    const { parsed, actor } = await generateActorFromBlock('Scuttling Serpentmaw');

    expect(parsed.traits.senses).toEqual({
      blindsight: 60,
      special: '盲视: 超出该范围则视为目盲',
    });
    expect(parsed.skillPassives?.prc).toBe(10);
    expect(actor.system.attributes.senses.blindsight).toBe(60);
    expect(actor.system.attributes.senses.special).toContain('超出该范围则视为目盲');
  });

  it('maps hit point ranges to stable midpoint values while preserving the original range note', () => {
    const bloodfin = parseCreatureBlock(getBlock('Slithering Bloodfin').rawBlock);
    const lightDevourer = parseCreatureBlock(getBlock('Light Devourer').rawBlock);

    expect(bloodfin.markdown).toContain("生命值: '143'");
    expect(bloodfin.markdown).toContain('### 原始备注');
    expect(bloodfin.markdown).toContain('生命值原始范围: 135-150');
    expect(lightDevourer.markdown).toContain("生命值: '180'");
    expect(lightDevourer.markdown).toContain('### 原始备注');
    expect(lightDevourer.markdown).toContain('生命值原始范围: 160-200');
    expect(lightDevourer.markdown).toContain('160-200');
  });

  it('parses Chinese senses without English parenthetical labels into parsed actor data', async () => {
    const { parsed, actor } = await generateActorFromBlock('Slithering Bloodfin');

    expect(parsed.attributes.hp).toEqual({
      value: 143,
      max: 143,
    });
    expect(parsed.traits.senses).toEqual({
      blindsight: 100,
    });
    expect(parsed.skillPassives?.prc).toBe(14);
    expect(actor.system.attributes.senses.blindsight).toBe(100);
    expect(actor.system.skills.prc.bonuses.passive).toBe('');
  });

  it('captures Bloodfin saving throws from the bilingual Saves line in plaintext input', async () => {
    const { parsed } = await generateActorFromBlock('Slithering Bloodfin');

    expect(parsed.saves).toContain('dex');
    expect(parsed.saveBonuses?.dex ?? 0).toBe(0);
  });

  it('maps daily uses, recharge, and reaction costs from plaintext-derived action text into actor data', async () => {
    const { actor: bloodfinActor } = await generateActorFromBlock('Slithering Bloodfin');
    const { actor: sharkActor } = await generateActorFromBlock('Corrupted Giant Shark');
    const { actor: embraceActor } = await generateActorFromBlock("Death's Embrace");

    const screech = bloodfinActor.items.find((item) => item.name.includes('(Pelagic Screech)'));
    const ram = sharkActor.items.find((item) => item.name.includes('(Ram)'));
    const bodyShield = embraceActor.items.find((item) => item.name.includes('(Body Shield)'));

    expect(screech?.system?.uses).toEqual(
      expect.objectContaining({
        value: 1,
        max: 1,
        per: 'day',
        spent: 0,
      }),
    );
    expect(screech?.system?.uses?.recovery?.[0]).toEqual(
      expect.objectContaining({
        period: 'day',
        type: 'recoverAll',
      }),
    );
    expect(
      Object.values(ram?.system?.activities ?? {})[0]?.uses?.recovery?.[0],
    ).toEqual(expect.objectContaining({ period: 'recharge', formula: '5' }));
    expect(bodyShield?.system?.activation?.cost).toBe(2);
  });

  it('keeps the fixture markdown compatible with parser routing', () => {
    const generated = parseCreatureBlock(getBlock('Scuttling Serpentmaw').rawBlock);
    const parserFactory = new ParserFactory();
    const route = parserFactory.detectRoute(generated.markdown);
    const parsed = parserFactory.parse(generated.markdown);

    expect(route).toBe('chinese');
    expect(parsed.name.length).toBeGreaterThan(0);
    expect(parsed.type).toBe('npc');
  });

  it('preserves nested Venomous Bite rider lines as multiline action text for Scuttling Serpentmaw', () => {
    const generated = parseCreatureBlock(getBlock('Scuttling Serpentmaw').rawBlock);
    const parsed = new ParserFactory().parse(generated.markdown);
    const venomousBite = parsed.actions?.find(
      (entry) => typeof entry === 'string' && entry.startsWith('毒液咬击 (Venomous Bite)'),
    );

    expect(venomousBite).toBeDefined();
    expect(venomousBite).toContain('\n盐水电击 (Brine-shock)');
    expect(venomousBite).toContain('\n针刺噬咬 (Needling Bite)');
    expect(venomousBite).toContain('\n吸血噬咬 (Vampiric Bite)');
  });

  it('maps a source markdown image to actor.img only, not the prototype token texture', async () => {
    const rawBlock = `# **Nightgaunt**

_Large Aberration, Chaotic Evil_

![Nightgaunt](https://media.example.test/nightgaunt.png)

**Armor Class**: 16
**Hit Points**: 136 (16d10+48)
**Speed**: 30 ft., fly 40 ft.
**Challenge**: 8 (3,900 XP) Proficiency Bonus +3

Nightgaunts haunt alien skies.

---

### Actions

- **Claw**: Melee Weapon Attack: +8 to hit, reach 5 ft. Hit: 14 (2d8+5) slashing damage.`;

    const { generated, parsed, actor } = await generateActorFromRawBlock(rawBlock);

    expect(generated.markdown).toContain('image: https://media.example.test/nightgaunt.png');
    expect(parsed.img).toBe('https://media.example.test/nightgaunt.png');
    expect(actor.img).toBe('https://media.example.test/nightgaunt.png');
    expect(actor.prototypeToken.texture.src).toBe('');
  });

  it('preserves Nightgaunt biography and maps Chinese statblock traits into actor JSON', async () => {
    const rawBlock = `# **夜魇 (Nightgaunt)**

_大型异怪 (Large Aberration)，混乱邪恶 (Chaotic Evil)_

**护甲等级 (Armor Class)**：16
**生命值 (Hit Points)**：136 (16d10+48)
**速度 (Speed)**：30 尺，飞行 40 尺

|**STR**|**DEX**|**CON**|**INT**|**WIS**|**CHA**|
|---|---|---|---|---|---|
|17 (+3)|20 (+5)|16 (+3)|13 (+1)|10 (+0)|10 (+0)|

**豁免 (Saves)**：敏捷 +8
**伤害抗性 (Damage Resistances)**：闪电，毒素，心灵
**状态免疫 (Condition Immunities)**：目盲，耳聋，力竭
**感官 (Senses)**：盲视 60 尺；被动察觉13
**语言 (Languages)**：理解深潜语但不会说
**挑战等级 (Challenge)**：8（3,900 XP）熟练加值 +3

夜魇Nightgaunt
自遥远国度而来的无面恐魔
不可名状的夜魇形似石像鬼，翱翔于地底的连绵山脉之上。

---

### 特质 (Traits)

- **飞掠 (Flyby)**：夜魇飞行离开敌人的触及范围时不会引发借机攻击。

---

### 动作 (Actions)

- **爪击 (Claw)**：近战攻击检定：+8，触及 5 尺。命中：14（2d8+5）挥砍伤害外加10（3d6）毒素伤害。
- **尾刺 (Barb)**：远程攻击检定：+8，射程 60 尺。命中：21（6d6）穿刺伤害，且目标陷入中毒状态直至其下一回合结束。

---

### 附赠动作 (Bonus Actions)

- **瘙痒 (Tickle)**：感知豁免检定：DC16，单一正受擒于该夜魇的生物。失败：目标陷入失能状态，直至夜魇的下一回合开始。
`;

    const { generated, parsed, actor } = await generateActorFromRawBlock(rawBlock);

    expect(generated.markdown).toContain('背景:');
    expect(generated.rawNotes).not.toContain(
      '伤害抗性 (Damage Resistances):闪电,毒素,心灵',
    );
    expect(parsed.details.biography).toContain('不可名状的夜魇形似石像鬼');
    expect(actor.system.details.biography.value).toContain('不可名状的夜魇形似石像鬼');
    expect(actor.system.details.biography.value).not.toContain('飞掠 (Flyby)');
    expect(actor.system.traits.dr.value).toEqual(
      expect.arrayContaining(['lightning', 'poison', 'psychic']),
    );
    expect(actor.system.traits.ci.value).toEqual(
      expect.arrayContaining(['blinded', 'deafened', 'exhaustion']),
    );
    expect(actor.system.traits.languages.value).toContain('deep');

    const claw = actor.items.find((item: any) => item.name === '爪击 (Claw)');
    const clawActivities = Object.values(claw?.system?.activities ?? {}) as any[];
    const clawAttack = clawActivities.find((activity) => activity.type === 'attack');
    expect(clawAttack).toBeDefined();
    expect(clawAttack?.attack?.type?.value).toBe('mwak');
    expect(clawAttack?.attack).toEqual(
      expect.objectContaining({
        ability: 'dex',
        bonus: '',
        flat: false,
      }),
    );
    expect(clawAttack?.range?.reach).toBe(5);
    expect(claw?.system?.damage?.base).toEqual(
      expect.objectContaining({ number: 2, denomination: 8, bonus: '', types: ['slashing'] }),
    );
    expect(clawAttack?.damage?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ number: 3, denomination: 6, bonus: '', types: ['poison'] }),
      ]),
    );

    const barb = actor.items.find((item: any) => item.name === '尾刺 (Barb)');
    const barbActivities = Object.values(barb?.system?.activities ?? {}) as any[];
    const barbAttack = barbActivities.find((activity) => activity.type === 'attack');
    expect(barbAttack).toBeDefined();
    expect(barbAttack?.attack?.type?.value).toBe('rwak');
    expect(barbAttack?.attack).toEqual(
      expect.objectContaining({
        bonus: '8',
        flat: true,
      }),
    );
    expect(barbAttack?.range?.value).toBe(60);
    expect(barbAttack?.damage?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ number: 6, denomination: 6, bonus: '', types: ['piercing'] }),
      ]),
    );

    const tickle = actor.items.find((item: any) => item.name === '瘙痒 (Tickle)');
    const tickleActivities = Object.values(tickle?.system?.activities ?? {}) as any[];
    const tickleSave = tickleActivities.find((activity) => activity.type === 'save');
    expect(tickleSave).toBeDefined();
    expect(tickleSave?.activation?.type).toBe('bonus');
    expect(tickleSave?.save?.ability).toEqual(['wis']);
    expect(tickleSave?.save?.dc?.value).toBe(16);
  });

  it('maps ability-before-DC damage save lines to save activities instead of damage-only stubs', async () => {
    const rawBlock = `# **古老者 (Elder Thing)**

_中型异怪 (Medium Aberration)，守序邪恶 (Lawful Evil)_

**护甲等级 (Armor Class)**：15
**生命值 (Hit Points)**：95 (10d8+50)
**速度 (Speed)**：30 尺
|**STR**|**DEX**|**CON**|**INT**|**WIS**|**CHA**|
|---|---|---|---|---|---|
|18 (+4)|12 (+1)|20 (+5)|20 (+5)|17 (+3)|15 (+2)|

**挑战等级 (Challenge)**：10（5,900 XP）熟练加值 +4

---

### 动作 (Actions)

- **心灵戳刺 (Psychic Skewer)**：感知豁免检定：DC18，单一 60 尺内的生物。失败：22（4d10）心灵伤害。`;

    const { actor } = await generateActorFromRawBlock(rawBlock);
    const skewer = actor.items.find((item: any) => item.name.includes('Psychic Skewer'));
    const activities = Object.values(skewer?.system?.activities ?? {}) as any[];
    const save = activities.find((activity) => activity.type === 'save');

    expect(save).toBeDefined();
    expect(activities.some((activity) => activity.type === 'damage')).toBe(false);
    expect(save?.save?.ability).toEqual(['wis']);
    expect(save?.save?.dc?.value).toBe(18);
    expect(save?.damage?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ number: 4, denomination: 10, bonus: '', types: ['psychic'] }),
      ]),
    );
  });
});
