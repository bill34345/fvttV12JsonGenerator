import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MonsterIntakeIR } from '../../types';

export const LURKER_SOURCE = readFileSync(resolve(import.meta.dir, 'lurker-in-the-dark.raw.txt'), 'utf-8');

function evidence(quote: string, occurrence = 0) {
  let start = -1;
  let from = 0;
  for (let index = 0; index <= occurrence; index++) {
    start = LURKER_SOURCE.indexOf(quote, from);
    if (start < 0) throw new Error(`Missing fixture quote: ${quote}`);
    from = start + quote.length;
  }
  return { start, end: start + quote.length, quote };
}

export function buildValidLurkerIr(): MonsterIntakeIR {
  const claim = (path: string, quote: string) => ({ path, valueKind: 'explicit' as const, evidence: [evidence(quote)], confidence: 'high' as const });
  const claims = [
    claim('/creature/identity/name', '暗影潜妖'), claim('/creature/identity/size', '中型妖精'), claim('/creature/identity/creatureType', '中型妖精'), claim('/creature/identity/alignment', '中立邪恶'),
    claim('/creature/attributes/ac', 'AC 14'), claim('/creature/attributes/initiative', '先攻 +4'), claim('/creature/attributes/hp', 'HP 65（10d8+20）'), claim('/creature/attributes/movement', '速度 30尺，攀爬30尺'),
    claim('/creature/attributes/cr', 'CR 4'), claim('/creature/attributes/xp', 'XP 1100'), claim('/creature/attributes/proficiencyBonus', 'PB +2'),
    claim('/creature/abilities', '力量 18 +4 +4  敏捷 14 +2 +4  体质 14 +2 +2'), claim('/creature/abilities', '智力 11 +0 +0  感知 13 +1 +3  魅力 16 +3 +3'),
    claim('/creature/saves', '力量 18 +4 +4  敏捷 14 +2 +4  体质 14 +2 +2'), claim('/creature/saves', '智力 11 +0 +0  感知 13 +1 +3  魅力 16 +3 +3'),
    claim('/creature/skills', '技能 欺瞒+5，威吓+5，察觉+3，隐匿+6'), claim('/creature/defenses', '抗性 钝击'), claim('/creature/defenses', '免疫 受擒，束缚'),
    claim('/creature/senses', '感官 黑暗视觉60尺；被动察觉13'), claim('/creature/languages', '语言 通用语以及一门其他语言'),
    claim('/creature/traits/0', '畸曲魇体Nightmarish Contortion。潜妖可以挤入1尺的立方空间，且可以移动穿过最窄1寸宽的空间而无需消耗额外的移动力。'),
    claim('/creature/traits/1', '蛛行Spider Climb。潜妖可以在难以攀爬的表面上攀爬，包括沿着天花板移动，且无需为此进行属性检定。'),
    claim('/creature/traits/2', '纯真结界Ward of Innocence。若生物正持握曾属于儿童的毛绒动物玩偶，潜妖无法攻击其，也无法主动进入其10尺内的空间。'),
    claim('/creature/actions/0', '多重攻击Multiattack。潜妖发动两次爪击攻击。'),
    claim('/creature/actions/1', '爪击Claw。近战攻击检定：+6，触及10尺。 命中：9（1d10+4）挥砍伤害，若目标生物体型不超过中型，则其被两只手臂之一擒抱，陷入受擒状态（逃脱DC 14），且目标陷入束缚状态直至擒抱结束。'),
    claim('/creature/bonusActions/0', '黑暗传送Dark Teleport。若潜妖未身处明亮光照中，其传送至多120尺至一处其可见的未占据空间。若目标空间未处于明亮光照 中，则潜妖无需看见该空间。正被潜妖擒抱的生物必须成功通过一次DC13的魅力豁免，否则与潜妖一同传送至距潜妖目标空间最近的未占据空间。'),
  ];
  return {
    schemaVersion: 1,
    source: { sha256: createHash('sha256').update(LURKER_SOURCE).digest('hex'), length: LURKER_SOURCE.length },
    creature: {
      identity: { name: '暗影潜妖', englishName: 'Lurker in the Dark', size: 'medium', creatureType: 'fey', alignment: 'neutral evil' },
      abilities: { str: 18, dex: 14, con: 14, int: 11, wis: 13, cha: 16 },
      attributes: { ac: 14, initiative: 4, hp: { value: 65, formula: '10d8+20' }, movement: { walk: 30, climb: 30 }, cr: 4, xp: 1100, proficiencyBonus: 2 },
      saves: { str: 4, dex: 4, con: 2, int: 0, wis: 3, cha: 3 },
      skills: { deception: 5, intimidation: 5, perception: 3, stealth: 6 },
      defenses: { resistances: ['bludgeoning'], immunities: [], vulnerabilities: [], conditionImmunities: ['grappled', 'restrained'] },
      senses: { darkvision: 60, passivePerception: 13 },
      languages: { values: ['common'], custom: '以及一门其他语言' },
      traits: [
        { name: '畸曲魇体', englishName: 'Nightmarish Contortion', description: '潜妖可以挤入1尺的立方空间，且可以移动穿过最窄1寸宽的空间而无需消耗额外的移动力。' },
        { name: '蛛行', englishName: 'Spider Climb', description: '潜妖可以在难以攀爬的表面上攀爬，包括沿着天花板移动，且无需为此进行属性检定。' },
        { name: '纯真结界', englishName: 'Ward of Innocence', description: '若生物正持握曾属于儿童的毛绒动物玩偶，潜妖无法攻击其，也无法主动进入其10尺内的空间。' },
      ],
      actions: [
        { name: '多重攻击', englishName: 'Multiattack', description: '潜妖发动两次爪击攻击。', activityType: 'utility' },
        { name: '爪击', englishName: 'Claw', description: '近战攻击检定：+6，触及10尺。命中：9（1d10+4）挥砍伤害，若目标生物体型不超过中型，则其被两只手臂之一擒抱，陷入受擒状态（逃脱DC 14），且目标陷入束缚状态直至擒抱结束。', activityType: 'attack', attack: { type: 'mwak', toHit: 6, reach: 10 }, damage: [{ formula: '1d10+4', type: 'slashing', relationship: 'base' }], appliedConditions: [{ statuses: ['grappled', 'restrained'], escapeDc: 14, condition: '目标体型不超过中型，直至擒抱结束' }] },
      ],
      bonusActions: [
        { name: '黑暗传送', englishName: 'Dark Teleport', description: '若潜妖未身处明亮光照中，其传送至多120尺至一处其可见的未占据空间。若目标空间未处于明亮光照中，则潜妖无需看见该空间。正被潜妖擒抱的生物必须成功通过一次DC13的魅力豁免，否则与潜妖一同传送。', activityType: 'save', save: { dc: 13, ability: 'cha', condition: '仅正被潜妖擒抱的生物' } },
      ],
      reactions: [], legendaryActions: [],
    },
    claims,
    coverage: [{ start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE, classification: 'mechanical', claimPaths: [...new Set(claims.map((value) => value.path))] }],
    uncertainties: [],
  };
}
