import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EvidenceRef, MonsterIntakeIR } from '../../types';

export const RAT_WARLOCK_SOURCE = readFileSync(resolve(import.meta.dir, 'rat-warlock.raw.txt'), 'utf-8');

export function ratEvidence(quote: string, occurrence = 0): EvidenceRef {
  let start = -1;
  let from = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    start = RAT_WARLOCK_SOURCE.indexOf(quote, from);
    if (start < 0) throw new Error(`Missing Rat Warlock fixture quote: ${quote} #${occurrence}`);
    from = start + quote.length;
  }
  return { start, end: start + quote.length, quote };
}

function ratLineEvidence(prefix: string): EvidenceRef {
  const start = RAT_WARLOCK_SOURCE.indexOf(prefix);
  if (start < 0) throw new Error(`Missing Rat Warlock fixture line: ${prefix}`);
  const lineBreak = RAT_WARLOCK_SOURCE.indexOf('\n', start);
  const rawEnd = lineBreak < 0 ? RAT_WARLOCK_SOURCE.length : lineBreak;
  const end = RAT_WARLOCK_SOURCE[rawEnd - 1] === '\r' ? rawEnd - 1 : rawEnd;
  return { start, end, quote: RAT_WARLOCK_SOURCE.slice(start, end) };
}

function ratEvidenceWithin(quote: string, parent: EvidenceRef): EvidenceRef {
  const local = parent.quote.indexOf(quote);
  if (local < 0) throw new Error(`Missing Rat Warlock grant quote: ${quote}`);
  const start = parent.start + local;
  return { start, end: start + quote.length, quote };
}

export function buildRatWarlockIr(): MonsterIntakeIR {
  const title = 'Warlock of the Rat God';
  const claim = (path: string, evidence: EvidenceRef[] = [ratEvidence(title, 1)]) => ({
    path,
    valueKind: 'explicit' as const,
    evidence,
    confidence: 'high' as const,
  });
  const spellcastingStart = RAT_WARLOCK_SOURCE.indexOf('天生施法Innate Spellcasting');
  const spellcastingEnd = RAT_WARLOCK_SOURCE.indexOf('敏锐嗅觉Keen Smell');
  if (spellcastingStart < 0 || spellcastingEnd < 0) throw new Error('Missing Rat Warlock spellcasting boundary.');
  const spellcastingDescription = RAT_WARLOCK_SOURCE.slice(spellcastingStart, spellcastingEnd).trim();
  const spellcastingEvidence = {
    start: spellcastingStart,
    end: spellcastingStart + spellcastingDescription.length,
    quote: spellcastingDescription,
  };
  const atWillEvidence = ratLineEvidence('随意：');
  const dailyEvidence = ratLineEvidence('每项1/日：');
  const spell = (
    refId: string,
    identifier: string,
    originalName: string,
    chineseName: string,
    englishName: string,
    grantEvidence: EvidenceRef,
    restrictions: Array<{ kind: 'target' | 'summoning' | 'casting'; text: string; quote: string }> = [],
  ) => ({
    refId,
    identifier,
    originalName,
    englishName,
    chineseName,
    aliases: [chineseName, englishName],
    restrictions: restrictions.map((restriction) => ({
      kind: restriction.kind,
      text: restriction.text,
      evidence: [ratEvidenceWithin(restriction.quote, grantEvidence)],
    })),
    evidence: [ratEvidenceWithin(originalName, grantEvidence)],
  });

  const claims = [
    claim('/creature/identity/name'), claim('/creature/identity/size'), claim('/creature/identity/creatureType'), claim('/creature/identity/alignment'),
    claim('/creature/attributes/ac'), claim('/creature/attributes/hp'), claim('/creature/attributes/movement'), claim('/creature/attributes/cr'), claim('/creature/attributes/xp'), claim('/creature/attributes/proficiencyBonus'),
    claim('/creature/abilities'), claim('/creature/skills'), claim('/creature/senses'), claim('/creature/languages'),
    claim('/creature/spellcasting/0', [spellcastingEvidence]), claim('/creature/traits/0'), claim('/creature/traits/1'), claim('/creature/actions/0'),
  ];

  const creature: MonsterIntakeIR['creature'] = {
    identity: { name: '鼠神邪术师', englishName: title, size: 'small', creatureType: 'monstrosity', alignment: 'chaotic evil' },
    abilities: { str: 7, dex: 14, con: 13, int: 13, wis: 11, cha: 15 },
    attributes: { ac: 12, acNote: '有法师护甲mage armor时15', hp: { value: 27, formula: '6d6+6' }, movement: { walk: 30, climb: 30, swim: 30 }, cr: 2, xp: 450, proficiencyBonus: 2 },
    saves: {},
    skills: { deception: 4, stealth: 4 },
    defenses: { resistances: [], immunities: [], vulnerabilities: [], conditionImmunities: [] },
    senses: { darkvision: 60, passivePerception: 10 },
    languages: { values: ['common'] },
    spellcasting: [{
      groupId: 'innate-charisma',
      featureName: '天生施法',
      featureEnglishName: 'Innate Spellcasting',
      description: spellcastingDescription,
      evidence: [spellcastingEvidence],
      ability: 'cha',
      abilityEvidence: [ratEvidence('天生施法属性为魅力')],
      saveDc: 12,
      saveDcEvidence: [ratEvidence('法术豁免DC12')],
      attackBonus: 4,
      attackBonusEvidence: [ratEvidence('法术攻击命中加值+4')],
      componentWaivers: [{ component: 'material', evidence: [ratEvidence('无需材料成分')] }],
      usageGroups: [
        {
          usage: 'at-will',
          evidence: [atWillEvidence],
          spellRefs: [
            spell('eldritch-blast', 'eldritch-blast', '魔能爆eldritch blast', '魔能爆', 'eldritch blast', atWillEvidence, [{ kind: 'casting', text: '2条射线', quote: '2条射线' }]),
            spell('mage-armor', 'mage-armor', '法师护甲mage armor', '法师护甲', 'mage armor', atWillEvidence, [{ kind: 'target', text: '仅自身', quote: '仅自身' }]),
            spell('minor-illusion', 'minor-illusion', '次级幻象minor illusion', '次级幻象', 'minor illusion', atWillEvidence),
            spell('thaumaturgy', 'thaumaturgy', '奇术thaumaturgy', '奇术', 'thaumaturgy', atWillEvidence),
          ],
        },
        {
          usage: '1/day-each',
          evidence: [dailyEvidence],
          spellRefs: [
            spell('augury', 'augury', '卜筮术augury', '卜筮术', 'augury', dailyEvidence),
            spell('burning-hands', 'burning-hands', '燃烧之手burning hands', '燃烧之手', 'burning hands', dailyEvidence),
            spell('conjure-animals', 'conjure-animals', '动物咒唤术conjure animals', '动物咒唤术', 'conjure animals', dailyEvidence, [{ kind: 'summoning', text: '仅限巨鼠Giant Rat', quote: '仅限巨鼠Giant Rat' }]),
            spell('faerie-fire', 'faerie-fire', '妖火faerie fire', '妖火', 'faerie fire', dailyEvidence),
            spell('invisibility', 'invisibility', '隐形术invisibility', '隐形术', 'invisibility', dailyEvidence),
            spell('misty-step', 'misty-step', '迷踪步misty step', '迷踪步', 'misty step', dailyEvidence),
          ],
        },
      ],
    }],
    traits: [
      { name: '敏锐嗅觉', englishName: 'Keen Smell', description: '鼠怪依靠嗅觉进行的感知检定具有优势。' },
      { name: '潜伏者', englishName: 'Skulker', description: '在每个鼠怪自己的回合中，鼠怪都可以用附赠动作来进行躲藏动作。', activationType: 'bonus' },
    ],
    actions: [
      { name: '啃咬', englishName: 'Bite', description: '近战武器攻击检定：命中+4，触及5尺，单一目标。命中：4（1d4+2）穿刺伤害。', activityType: 'attack', attack: { type: 'mwak', toHit: 4, reach: 5 }, damage: [{ formula: '1d4+2', type: 'piercing', relationship: 'base' }] },
    ],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
  };

  return {
    schemaVersion: 1,
    source: { sha256: createHash('sha256').update(RAT_WARLOCK_SOURCE).digest('hex'), length: RAT_WARLOCK_SOURCE.length },
    creature,
    claims,
    coverage: (() => {
      const statblockStart = ratEvidence('鼠神邪术师 Warlock of the Rat God', 1).start;
      return [{
        start: 0,
        end: statblockStart,
        quote: RAT_WARLOCK_SOURCE.slice(0, statblockStart),
        classification: 'narrative' as const,
        claimPaths: [],
      }, {
        start: statblockStart,
        end: RAT_WARLOCK_SOURCE.length,
        quote: RAT_WARLOCK_SOURCE.slice(statblockStart),
        classification: 'mechanical' as const,
        claimPaths: claims.map((entry) => entry.path),
      }];
    })(),
    uncertainties: [],
  };
}
