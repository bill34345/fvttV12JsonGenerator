import type { BloodHunterEnrichedSource, JsonObject } from '../src/types';

const CLASS_FEATURES: Array<[string, string, number]> = [
  ['鲜血秘法', 'Hemocraft', 1], ['武器精通', 'Weapon Mastery', 1], ['猩红仪式', 'Crimson Rite', 2], ['战斗风格', 'Fighting Style', 2],
  ['血猎手子职', 'Blood Hunter Subclass', 3], ['属性值提升', 'Ability Score Improvement', 4], ['额外攻击', 'Extra Attack', 5], ['惩戒烙印', 'Brand of Castigation', 6],
  ['子职特性', 'Subclass Feature', 7], ['属性值提升', 'Ability Score Improvement', 8], ['阴暗灵卜', 'Grim Psychometry', 9], ['黑暗增幅', 'Dark Augmentation', 10],
  ['子职特性', 'Subclass Feature', 11], ['属性值提升', 'Ability Score Improvement', 12], ['强化惩戒烙印', 'Improved Brand of Castigation', 13], ['刚毅灵魂', 'Hardened Soul', 14],
  ['子职特性', 'Subclass Feature', 15], ['属性值提升', 'Ability Score Improvement', 16], ['诅咒烙印', 'Cursed Brand', 17], ['子职特性', 'Subclass Feature', 18],
  ['传奇恩惠', 'Epic Boon', 19], ['胸有成竹', 'Sanguine Mastery', 20],
];

const SUBCLASS_FEATURES: Array<[string, string, string, number]> = [
  ['弑灵结社', 'Order of the Ghostslayer', '弑灵', 3], ['破晓血仪', 'Rite of the Dawn', '弑灵', 3], ['诅咒专家', 'Curse Specialist', '弑灵', 3],
  ['升腾走', 'Aether Walk', '弑灵', 7], ['分离烙印', 'Brand of Sundering', '弑灵', 11], ['驱魔血咒', 'Blood Curse of the Exorcist', '弑灵', 15], ['血仪重生', 'Rite Revival', '弑灵', 18],
  ['渎魂结社', 'Order of the Profane Soul', '渎魂', 3], ['异界同调', 'Otherworldly Attunement', '渎魂', 3], ['契约魔法', 'Pact Magic', '渎魂', 3],
  ['神秘狂乱', 'Mystic Frenzy', '渎魂', 7], ['异界奥秘', 'Otherworldly Arcana', '渎魂', 7], ['痂痕烙印', 'Brand of the Sapping Scar', '渎魂', 11],
  ['异界恢复力', 'Otherworldly Resilience', '渎魂', 11], ['诡秘奥秘', 'Eldritch Arcana', '渎魂', 15], ['噬魂血咒', 'Blood Curse of the Souleater', '渎魂', 18],
  ['突变结社', 'Order of the Mutant', '突变', 3], ['诱变技艺', 'Mutagencraft', '突变', 3], ['炼金代谢', 'Alchemical Metabolism', '突变', 7],
  ['公理烙印', 'Brand of the Axiom', '突变', 11], ['腐蚀血咒', 'Blood Curse of Corrosion', '突变', 15], ['高等突变', 'Exalted Mutation', '突变', 18], ['诱变剂', 'Mutagens', '突变', 3],
  ['化狼结社', 'Order of the Lycan', '化狼', 3], ['混种变形', 'Hybrid Transformation', '化狼', 3], ['追猎造诣', "Stalker's Prowess", '化狼', 7],
  ['高等变形', 'Advanced Transformation', '化狼', 11], ['饕餮烙印', 'Brand of the Voracious', '化狼', 15], ['怒号血咒', 'Blood Curse of the Howl', '化狼', 15], ['变形精通', 'Transformation Mastery', '化狼', 18],
];

const BLOOD_CURSES: Array<[string, string]> = [
  ['焦虑血咒', 'Blood Curse of the Anxious'], ['捆缚血咒', 'Blood Curse of Binding'], ['胀痛血咒', 'Blood Curse of Bloated Agony'], ['腐蚀血咒', 'Blood Curse of Corrosion'],
  ['驱魔血咒', 'Blood Curse of the Exorcist'], ['暴露诅咒', 'Blood Curse of Exposure'], ['盲目血咒', 'Blood Curse of the Eyeless'], ['傀儡血咒', 'Blood Curse of the Fallen Puppet'],
  ['怒号血咒', 'Blood Curse of the Howl'], ['印记血咒', 'Blood Curse of the Marked'], ['乱心血咒', 'Blood Curse of the Muddled Mind'], ['同苦血咒', 'Blood Curse of Mutual Suffering'],
  ['鲁莽血咒', 'Blood Curse of the Reckless'], ['噬魂血咒', 'Blood Curse of the Souleater'],
];

const BLOOD_CURSE_PREREQUISITES: Record<string, { level: number; subclassName: string; subclassEnglish: string }> = {
  'Blood Curse of Corrosion': { level: 15, subclassName: '突变结社', subclassEnglish: 'Order of the Mutant' },
  'Blood Curse of the Exorcist': { level: 15, subclassName: '弑灵结社', subclassEnglish: 'Order of the Ghostslayer' },
  'Blood Curse of the Howl': { level: 18, subclassName: '化狼结社', subclassEnglish: 'Order of the Lycan' },
  'Blood Curse of the Souleater': { level: 18, subclassName: '渎魂结社', subclassEnglish: 'Order of the Profane Soul' },
};

const MUTAGENS: Array<[string, string]> = [
  ['升腾', 'Aether'], ['幻惑', 'Alluring'], ['迅捷', 'Celerity'], ['精通', 'Conversant'], ['残虐', 'Cruelty'], ['回声定位', 'Echolocation'], ['余烬', 'Embers'],
  ['凛冽', 'Gelid'], ['不穿', 'Impermeable'], ['灵活移动', 'Mobile'], ['夜视', 'Nighteye'], ['洞察者', 'Percipient'], ['潜能', 'Potency'], ['精准', 'Precision'],
  ['急速', 'Rapidity'], ['化学试剂', 'Reagent'], ['再生', 'Reconstruction'], ['睿智', 'Sagacity'], ['庇护', 'Shielded'], ['不破', 'Unbreakable'], ['红莲', 'Vermillion'],
];

const RITES: Array<[string, string]> = [
  ['烈焰血仪', 'Rite of the Flame'], ['冻结血仪', 'Rite of the Frozen'], ['风暴血仪', 'Rite of the Storm'], ['死亡血仪', 'Rite of the Dead'],
  ['神谕血仪', 'Rite of the Oracle'], ['轰鸣血仪', 'Rite of the Roar'], ['破晓血仪', 'Rite of the Dawn'],
];

function activity(id: string, effectId?: string): JsonObject {
  return {
    _id: id,
    type: 'utility',
    name: `Activity ${id}`,
    activation: { type: 'special', value: null, condition: '', override: false },
    consumption: { targets: [], scaling: { allowed: false, max: '' }, spellSlot: false },
    description: { chatFlavor: 'Synthetic Blood Hunter fixture activity.' },
    duration: { value: '', units: 'inst', concentration: false, override: false },
    range: { value: '', units: 'self', special: '', override: false },
    target: { template: {}, affects: { count: '1', type: 'self', choice: false, special: '' }, prompt: false, override: false },
    uses: { spent: 0, recovery: [], max: '' },
    ...(effectId ? { effects: [{ foundryId: effectId }] } : {}),
  };
}

export function makeBloodHunter2024Fixture(): BloodHunterEnrichedSource {
  const subclassNames: Array<[string, string, string]> = [
    ['弑灵结社', 'Order of the Ghostslayer', '弑灵'], ['渎魂结社', 'Order of the Profane Soul', '渎魂'],
    ['突变结社', 'Order of the Mutant', '突变'], ['化狼结社', 'Order of the Lycan', '化狼'],
  ];
  return {
    _meta: { sources: [{ json: 'BloodHunter2024' }] },
    class: [{
      name: '血猎手', ENG_name: 'Blood Hunter', source: 'BloodHunter2024', entries: ['Synthetic class text.'],
      optionalfeatureProgression: [
        { name: '血咒', ENG_name: 'Blood Curse', featureType: ['BC'], progression: [2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6] },
        { name: '猩红仪式', ENG_name: 'Crimson Rite', featureType: ['CR'], progression: { 2: 1, 7: 2, 14: 3 } },
      ],
    }],
    subclass: subclassNames.map(([name, english, shortName]) => ({ name, ENG_name: english, shortName, source: 'BloodHunter2024', className: '血猎手', classSource: 'BloodHunter2024', entries: [`${name} text.`] })),
    classFeature: CLASS_FEATURES.map(([name, english, level]) => ({ name, ENG_name: english, source: 'BloodHunter2024', className: '血猎手', classSource: 'BloodHunter2024', level, entries: [`${english} text.`] })),
    subclassFeature: SUBCLASS_FEATURES.map(([name, english, shortName, level]) => ({ name, ENG_name: english, source: 'BloodHunter2024', className: '血猎手', classSource: 'BloodHunter2024', subclassShortName: shortName, subclassSource: 'BloodHunter2024', level, entries: [`${english} text.`] })),
    optionalfeature: [
      ...BLOOD_CURSES.map(([name, english]) => {
        const prerequisite = BLOOD_CURSE_PREREQUISITES[english];
        return {
          name, ENG_name: english, source: 'BloodHunter2024', featureType: ['BC'], entries: [`${english} text.`],
          ...(prerequisite ? {
            prerequisite: [{
              level: {
                level: prerequisite.level,
                class: { ENG_name: 'Blood Hunter', name: '血猎手' },
                subclass: { ENG_name: prerequisite.subclassEnglish, name: prerequisite.subclassName, visible: true },
              },
            }],
          } : {}),
        };
      }),
      ...MUTAGENS.map(([name, english]) => ({ name, ENG_name: english, source: 'BloodHunter2024', featureType: ['MTGN'], entries: [`${english} text.`] })),
      ...RITES.map(([name, english]) => ({ name, ENG_name: english, source: 'BloodHunter2024', featureType: ['CR'], entries: [`${english} text.`] })),
    ],
    foundryClass: [{
      name: '血猎手', source: 'BloodHunter2024', advancement: [
        { type: 'ScaleValue', title: '鲜血秘法', configuration: { identifier: 'hemocraft', type: 'dice', scale: { 1: { number: 1, faces: 6 }, 5: { number: 1, faces: 8 } } } },
      ],
    }],
    foundryClassFeature: [],
    foundrySubclassFeature: [],
    foundryOptionalfeature: [{
      name: '破晓血仪', source: 'BloodHunter2024',
      activities: [activity('dawn000000000001', 'dawnEffect000001'), activity('dawn000000000002', 'dawnEffect000002'), activity('dawn000000000003'), activity('dawn000000000004'), activity('dawn000000000005')],
      effects: [
        { foundryId: 'dawnEffect000001', name: 'Dawn primary effect', type: 'enchantment', disabled: true, transfer: false, changes: [{ key: 'system.damage.parts', mode: 'ADD', value: '[["1d6","radiant"]]' }] },
        { foundryId: 'dawnEffect000002', name: 'Dawn assisted effect', type: 'base', disabled: true, transfer: false, changes: [{ key: 'system.traits.dr.value', mode: 'ADD', value: 'necrotic' }], flags: { fvttJsonGenerator: { automation: 'assisted' } } },
      ],
      flags: { fvttJsonGenerator: { automation: 'assisted' } },
    }],
  };
}
