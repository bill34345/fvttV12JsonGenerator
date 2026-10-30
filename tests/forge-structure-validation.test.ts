import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { auditMonsterIntakeSource, validateMonsterIntakeIR } from '@fvtt-json-generator/intake-ai/validator';
import { sourceOperationStructureErrors } from '@fvtt-json-generator/models/source-operations';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows/single-file-conversion';
import type { MonsterIntakeIR } from '@fvtt-json-generator/intake-ai/types';

const SOURCE = '伊斯人 Yithian\n大型异怪。护甲等级18，生命值180，挑战等级15。\n' +
  '钳击。近战攻击：+9命中，触及10尺。命中：2d8+5钝击伤害。\n' +
  '闪电枪。远程攻击：+9命中，射程120/360尺。命中：3d10闪电伤害。\n' +
  '精神震击。目标进行DC17智力或感知豁免，失败则震慑。\n' +
  '火焰灵光。生物在回合开始时受到3d8火焰伤害。\n' +
  '恢复。恢复2d8+3生命值。施法。每日共享三次：侦测思想，暗示术。';
const ref = { start: 0, end: SOURCE.length, quote: SOURCE };

function fixture(): MonsterIntakeIR {
  return {
    schemaVersion: 1,
    source: { sha256: createHash('sha256').update(SOURCE).digest('hex'), length: SOURCE.length },
    creature: {
      identity: { name: '伊斯人', englishName: 'Yithian', size: 'large', creatureType: 'aberration', alignment: 'neutral' },
      abilities: { str: 20, dex: 14, con: 18, int: 24, wis: 18, cha: 16 },
      attributes: { ac: 18, acKind: 'flat', hp: { value: 180, formula: '19d10+76' }, movement: { walk: 30, fly: 20, hover: true }, cr: 15, xp: 13000, proficiencyBonus: 5, initiative: 2 },
      saves: { con: 9, int: 12, wis: 9 }, skills: { arcana: 12, perception: 9 },
      defenses: { resistances: ['psychic'], immunities: [], vulnerabilities: [], conditionImmunities: ['charmed'] },
      senses: { darkvision: 120, passivePerception: 19, special: '特殊感官由GM处理' },
      languages: { values: ['common'], custom: '心灵感应120尺' }, biography: '中文结构回归。',
      traits: [{ name: '火焰灵光', description: 'AI自行理解的条件伤害。', activityType: 'damage', damage: [{ formula: '3d8', type: 'fire', relationship: 'conditional', condition: '生物回合开始时' }] }],
      actions: [{
        sourceFeatureId: '1111111111111111', name: '复合操作', description: 'AI自行组织的完整操作，不要求程序重读这段话。',
        executionMode: 'native-with-gm', activityType: 'utility', nativeRuleText: '按显式操作执行。', manualRemainder: '其余限定由GM处理。',
        sourceOperations: [{
          id: 'claw', name: '钳击', type: 'attack', relationship: 'primary', sourceText: SOURCE,
          attack: { type: 'mwak', toHit: 19, reach: 10 }, damage: [{ formula: '2d8+5', type: 'bludgeoning', relationship: 'base' }],
          damageAdjustment: { multiplier: 0.5, condition: 'source-actor-bloodied', actor: '伊斯人', quote: 'AI保留的半伤条件' },
          proof: { attack: 'AI保留的攻击声明', damage: ['AI保留的伤害声明'] },
        }, {
          id: 'gun', name: '闪电枪', type: 'attack', relationship: 'alternative', sourceText: SOURCE,
          attack: { type: 'rwak', toHit: 19, range: 120, longRange: 360 },
          damage: [{ formula: '3d10', type: 'lightning', types: ['lightning', 'thunder'], relationship: 'base' }], proof: {},
        }, {
          id: 'mind-save', name: '精神震击', type: 'save', relationship: 'follow-up', sourceText: SOURCE, condition: '由GM选择时机',
          save: { dc: 17, abilities: ['int', 'wis'], choice: 'target', outcome: 'none' }, failureStatuses: ['stunned'], proof: {},
        }, {
          id: 'aura', name: '火焰灵光', type: 'damage', relationship: 'follow-up', sourceText: SOURCE,
          damage: [{ formula: '3d8', type: 'fire', relationship: 'conditional', condition: '生物回合开始时' }],
          range: 60, aoe: { shape: 'cylinder', radius: 10, height: 20, width: 10 }, targetSpecial: '指定区域', proof: {},
        }, {
          id: 'restore', name: '恢复', type: 'heal', relationship: 'follow-up', sourceText: SOURCE,
          healing: { formula: '2d8+3', type: 'healing', target: { type: 'self', count: 1, special: '' } }, proof: { healing: '恢复生命值' },
        }],
      }, {
        sourceFeatureId: '2222222222222222', name: '共享能力甲', description: '共享资源甲', uses: { max: 3, period: 'day' },
      }, {
        sourceFeatureId: '3333333333333333', name: '共享能力乙', description: '共享资源乙', uses: { max: 3, period: 'day' },
      }, {
        name: '独立钳击', description: '独立的扁平攻击特性。', activityType: 'attack', attack: { type: 'mwak', toHit: 19, reach: 10 },
        damage: [{ formula: '2d8+5', type: 'bludgeoning', relationship: 'base' }],
      }],
      bonusActions: [], reactions: [], legendaryActions: [], mythicActions: [],
      sourceResourcePools: [{ id: 'shared-pool', name: '共享资源', max: 3, period: 'day', members: [{ collection: 'actions', index: 1, featureId: '2222222222222222', cost: 1 }, { collection: 'actions', index: 2, featureId: '3333333333333333', cost: 1 }], evidence: [] }],
      spellcasting: [{
        groupId: 'mind-spells', featureName: '施法', description: 'AI选择每日共享三次施法。', evidence: [], ability: 'int', abilityEvidence: [], saveDc: 19, attackBonus: 19,
        componentWaivers: [{ component: 'material', evidence: [] }],
        usageGroups: [{ usage: 'daily-shared', count: 3, evidence: [], spellRefs: [
          { refId: 'detect-thoughts', identifier: 'detect-thoughts', originalName: '侦测思想', aliases: ['Detect Thoughts'], evidence: [], restrictions: [{ kind: 'target', text: '仅可见目标', value: true, evidence: [] }] },
          { refId: 'suggestion', identifier: 'suggestion', originalName: '暗示术', aliases: [], evidence: [], restrictions: [] },
        ] }],
      }],
    },
    claims: [], coverage: [], uncertainties: [],
  };
}
const errors = (ir: unknown) => validateMonsterIntakeIR(SOURCE, ir).blocking;
function formalFixture(): MonsterIntakeIR {
  const ir = fixture();
  // The representative formal chain exercises the independent OP carrier and
  // the separate flat attack, without requiring a spell-resolution fixture.
  ir.creature.actions = [ir.creature.actions[0]!, ir.creature.actions[3]!];
  ir.creature.traits = []; delete ir.creature.spellcasting; delete ir.creature.sourceResourcePools;
  return ir;
}
const convert = (ir: MonsterIntakeIR) => convertMarkdownContentToJson({
  content: renderMonsterIntakeMarkdown(ir, SOURCE), fvttVersion: '14', effectProfile: 'core', translationService: null,
});

describe('default Monster validation delegates source understanding to AI', () => {
  test('accepts Chinese structure, unclaimed AI fields, conditional damage, two attacks and shared spell uses', () => {
    const ir = fixture(), before = structuredClone(ir);
    expect(SOURCE).toContain('+9命中');
    expect(ir.creature.actions[3]!.attack!.toHit).toBe(19);
    expect(errors(ir)).toEqual([]);
    expect(ir as unknown).toEqual(before);
    expect(sourceOperationStructureErrors(ir.creature.actions[0]!.sourceOperations)).toEqual([]);
  });

  test('does not classify prose, infer omissions or require source-backed claims', () => {
    const ir = fixture();
    ir.creature.actions = [{ name: '复杂能力', description: 'Multiattack. Spellcasting. DC 99. 无法由确定性句式理解的完整规则。' }];
    delete ir.creature.sourceResourcePools;
    ir.creature.spellcasting = [];
    ir.creature.attributes.ac = 99;
    ir.creature.attributes.movement = { fly: 200, hover: true };
    expect(errors(ir)).toEqual([]);
  });

  test('preserves human-readable spell lookup identifiers allowed by the portable contract', () => {
    const ir = fixture(), spells = ir.creature.spellcasting![0]!.usageGroups[0]!.spellRefs;
    spells[0]!.identifier = 'Modify Memory'; spells[1]!.identifier = 'Transport via Plants';
    expect(errors(ir)).toEqual([]);
  });

  test('retains the old source audit as an explicit separate entry', () => {
    const ir = fixture();
    expect(errors(ir)).toEqual([]);
    expect(auditMonsterIntakeSource(SOURCE, ir).blocking.length).toBeGreaterThan(0);
  });

  test('preserves AI uncertainties and their own severity without inventing semantic errors', () => {
    const ir = fixture();
    ir.uncertainties = [
      { id: 'warning:/creature', code: 'AI_CHECK', path: '/creature', message: 'AI主动提示人工复核。', blocking: false, evidence: [], candidates: [19, 9] },
      { id: 'blocking:/missing', code: 'AI_UNRESOLVED', path: '/creature/missing', message: 'AI明确没有确定此项。', blocking: true, evidence: [] },
    ];
    const before = structuredClone(ir), result = validateMonsterIntakeIR(SOURCE, ir);
    expect(result.findings).toHaveLength(2);
    expect(result.warnings[0]).toMatchObject({ code: 'AI_CHECK', origin: 'ai-review', blocking: false });
    expect(result.blocking[0]).toMatchObject({ code: 'AI_UNRESOLVED', origin: 'ai-review', blocking: true });
    expect(ir as unknown).toEqual(before);
  });

  test('checks supplied evidence location but allows absent and empty evidence ledgers', () => {
    const ir = fixture();
    ir.creature.actions[0]!.evidence = [ref];
    ir.creature.actions[0]!.sourceOperations![0]!.evidence = ref;
    ir.claims = [{ path: '/creature/actions/3/attack/toHit', valueKind: 'explicit', confidence: 'high', evidence: [ref], value: 19 }];
    ir.coverage = [{ ...ref, classification: 'mechanical', claimPaths: [ir.claims[0]!.path] }];
    expect(errors(ir)).toEqual([]);
    ir.claims[0]!.evidence[0] = { ...ref, quote: SOURCE + 'wrong' };
    expect(errors(ir).some(f => f.code === 'EVIDENCE_MISMATCH')).toBe(true);
  });

  test('rejects another source identity and evidence outside the candidate scope', () => {
    const ir = fixture();
    ir.source.sha256 = 'a'.repeat(64); ir.source.length--;
    expect(errors(ir).map(f => f.code)).toEqual(expect.arrayContaining(['SOURCE_HASH_MISMATCH', 'SOURCE_LENGTH_MISMATCH']));
    const scoped = fixture(); scoped.creature.actions[0]!.evidence = [ref];
    expect(validateMonsterIntakeIR(SOURCE, scoped, { coverageRange: { start: 1, end: SOURCE.length } }).blocking.some(f => f.code === 'EVIDENCE_OUT_OF_RANGE')).toBe(true);
    expect(validateMonsterIntakeIR(SOURCE, fixture(), { coverageRange: { start: -1, end: SOURCE.length } }).blocking.length).toBeGreaterThan(0);
  });
});

describe('closed canonical structure rejects unsafe or unprojectable values', () => {
  const cases: Array<[string, (ir: any) => void]> = [
    ['unsupported version', ir => { ir.schemaVersion = 2; }],
    ['missing ability', ir => { delete ir.creature.abilities.cha; }],
    ['unknown identity field', ir => { ir.creature.identity.flags = {}; }],
    ['unknown feature field', ir => { ir.creature.actions[0].script = 'return 1'; }],
    ['unknown HP field', ir => { ir.creature.attributes.hp.system = {}; }],
    ['unsupported feature activity', ir => { ir.creature.actions[0].activityType = 'macro'; }],
    ['unsupported ability', ir => { ir.creature.spellcasting[0].ability = 'luck'; }],
    ['nonfinite number', ir => { ir.creature.attributes.ac = NaN; }],
    ['unsafe integer', ir => { ir.creature.actions[3].attack.toHit = Number.MAX_SAFE_INTEGER + 1; }],
    ['fractional counter', ir => { ir.creature.actions[1].uses.max = 1.5; }],
    ['bad dice', ir => { ir.creature.traits[0].damage[0].formula = '1d0'; }],
    ['script dice', ir => { ir.creature.attributes.hp.formula = '1d6;game.user'; }],
    ['bad ID', ir => { ir.creature.actions[0].sourceFeatureId = '../unsafe'; }],
    ['unprojectable feature ID', ir => { ir.creature.actions[0].sourceFeatureId = 'opaque-label'; }],
    ['duplicate feature ID', ir => { ir.creature.actions[2].sourceFeatureId = ir.creature.actions[1].sourceFeatureId; }],
    ['broken pool reference', ir => { ir.creature.sourceResourcePools[0].members[0].featureId = 'missing'; }],
    ['broken pool index', ir => { ir.creature.sourceResourcePools[0].members[0].index = 500; }],
    ['duplicate pool member', ir => { ir.creature.sourceResourcePools[0].members[1] = structuredClone(ir.creature.sourceResourcePools[0].members[0]); }],
    ['inconsistent shared pool', ir => { ir.creature.actions[1].uses.max = 4; }],
    ['unknown pool execution field', ir => { ir.creature.sourceResourcePools[0].changes = []; }],
    ['unknown spell ref field', ir => { ir.creature.spellcasting[0].usageGroups[0].spellRefs[0].uuid = 'Compendium.example'; }],
    ['bad shared spell count', ir => { ir.creature.spellcasting[0].usageGroups[0].count = 0; }],
    ['usage-specific unknown field', ir => { ir.creature.spellcasting[0].usageGroups[0].slots = 4; }],
    ['broken spell reuse', ir => { ir.creature.spellcasting[0].usageGroups[0].spellRefs[0].reuseOf = { groupId: 'missing', refId: 'missing' }; }],
    ['duplicate spell ID', ir => { ir.creature.spellcasting[0].usageGroups[0].spellRefs[1].refId = 'detect-thoughts'; }],
    ['unknown waiver', ir => { ir.creature.spellcasting[0].componentWaivers[0].component = 'verbal'; }],
    ['bad recharge', ir => { ir.creature.actions[0].recharge = [6, 5]; }],
    ['conflicting use mechanisms', ir => { ir.creature.actions[1].recharge = [5,6]; }],
    ['missing mixed display boundary', ir => { delete ir.creature.actions[0].nativeRuleText; }],
    ['manual executable mechanics', ir => { ir.creature.actions[0].executionMode = 'gm-manual'; }],
    ['missing operation boundary', ir => { delete ir.creature.actions[0].executionMode; }],
    ['missing typed mechanics', ir => { ir.creature.traits[0].activityType = 'save'; }],
    ['missing claim target', ir => { ir.claims = [{ path: '/creature/absent', valueKind: 'derived', confidence: 'high', evidence: [] }]; }],
    ['broken coverage reference', ir => { ir.coverage = [{ ...ref, classification: 'mechanical', claimPaths: ['/creature/identity/name'] }]; }],
    ['infinite claim data', ir => { ir.claims = [{ path: '/creature', valueKind: 'derived', confidence: 'high', evidence: [], value: Infinity }]; }],
    ['callable uncertainty data', ir => { ir.uncertainties = [{ id: 'x', code: 'AI', path: '/', message: 'review', blocking: false, evidence: [], candidates: [() => 1] }]; }],
  ];
  for (const [label, mutate] of cases) test(label, () => {
    const ir = fixture(); mutate(ir); const before = structuredCloneSafe(ir);
    expect(errors(ir).length).toBeGreaterThan(0);
    if (before !== undefined) expect(ir as unknown).toEqual(before);
  });

  test('supports every current spell usage variant, direct reuse and optional feature mechanics', () => {
    const ir = fixture(), group = ir.creature.spellcasting![0]!, first = group.usageGroups[0]!.spellRefs[0]!;
    group.recharge = [5, 6]; group.legendaryCost = 1; group.activationType = 'legendary'; group.casterLevel = 15; group.casterLevelEvidence = [];
    group.manualGrants = []; group.saveDcEvidence = []; group.attackBonusEvidence = [];
    const copy = (id: string) => ({ ...structuredClone(first), refId: id });
    group.usageGroups.push(
      { usage: 'at-will', evidence: [], spellRefs: [copy('atwill-definition')] },
      { usage: '1/day-each', evidence: [], spellRefs: [copy('daily-one')] },
      { usage: 'daily-each', count: 2, evidence: [], spellRefs: [copy('daily-two')] },
      { usage: 'prepared-cantrip', evidence: [], spellRefs: [copy('cantrip')] },
      { usage: 'prepared-slots', level: 3, levelEvidence: [], slots: 2, slotsEvidence: [], evidence: [], spellRefs: [copy('prepared')] },
    );
    const parent = { ...structuredClone(group), groupId: 'atwill-parent', recharge: undefined, usageGroups: [{ usage: 'at-will' as const, evidence: [], spellRefs: [copy('parent-definition')] }] };
    const child = { ...structuredClone(parent), groupId: 'atwill-child', usageGroups: [{ usage: 'at-will' as const, evidence: [], spellRefs: [{ ...copy('reuse'), reuseOf: { groupId: parent.groupId, refId: 'parent-definition' } }] }] };
    ir.creature.spellcasting!.push(parent, child);
    ir.creature.legendary = { max: 3, lairMax: 4, recovery: 'own-turn-start', preamble: 'AI解释的资源', evidence: [] };
    ir.creature.identity.swarmSize = 'tiny'; ir.creature.identity.sourceSize = '大型或巨型'; ir.creature.identity.creatureTypeCustom = '自定义';
    ir.creature.reactions.push({
      name: '反应能力', englishName: 'Reaction', sourceQualifier: '专注', description: '完整中文能力', evidence: [],
      activationType: 'reaction', activationCondition: '由GM决定', activityType: 'utility', executionMode: 'native-with-gm',
      nativeRuleText: '原生部分', manualRemainder: 'GM部分', sourceContext: ['共同前言'],
      spellUseRecords: [{ name: '手动法术', max: 2, period: 'day' }],
      gmTriggeredSave: { dc: 17, ability: 'wis', trigger: '条件满足', sourceText: '完整能力', failureStatuses: ['prone'] },
      nativeFailureStatuses: ['prone'],
      healing: { formula: '5', type: 'temphp' }, range: 30, targetSpecial: '一个目标', aoe: { shape: 'sphere', radius: 5 },
      save: { dc: 17, ability: 'wis', dcSourceKind: 'literal', outcome: 'half', condition: 'GM条件' },
      candidateReview: { version: 1, findings: [{ code: 'AI', path: '/', message: '检查' }], proposal: { value: 19 } }, candidateCounters: [{ name: '计数', max: 2, recovery: null }],
    });
    ir.creature.actions.push({name:'独立状态',description:'状态说明',appliedConditions:[{statuses:['prone','exhaustion','burning'],escapeDc:17,condition:'由GM决定',duration:'1分钟',staged:true}]});
    expect(errors(ir)).toEqual([]);
  });
});

describe('source-operation execution combinations match the formal conversion boundary', () => {
  test('retains explicit mixed native/GM state templates without reading prose', () => {
    const ir=fixture();
    ir.creature.actions=[{name:'Timed consequence',description:'Complete rule',activityType:'save',save:{dc:17,ability:'wis'},
      executionMode:'native-with-gm',nativeRuleText:'Basic save',manualRemainder:'Timed consequence',
      appliedConditions:[{statuses:['paralyzed'],duration:'until next turn ends'}]}];
    delete ir.creature.sourceResourcePools;
    expect(errors(ir)).toEqual([]);
    expect(ir.creature.actions[0]!.appliedConditions).toEqual([{statuses:['paralyzed'],duration:'until next turn ends'}]);
  });
  const carrierFields: Array<[string, unknown]> = [
    ['attack', { type: 'mwak', toHit: 19, reach: 10 }],
    ['save', { dc: 17, ability: 'wis' }],
    ['damage', [{ formula: '1d6', type: 'fire', relationship: 'base' }]],
    ['healing', { formula: '1d6', type: 'healing' }],
    ['aoe', { shape: 'sphere', radius: 10 }], ['range', 60], ['targetSpecial', '一个目标'],
    ['appliedConditions', [{ statuses: ['prone'] }]],
    ['spellUseRecords', [{ name: '手动法术', max: 2, period: 'day' }]],
    ['gmTriggeredSave', { dc: 17, ability: 'wis', trigger: 'GM选择时机', sourceText: '显式规则', failureStatuses: ['prone'] }],
    ['nativeFailureStatuses', ['prone']], ['activityType', 'attack'],
  ];
  for (const [field, value] of carrierFields) test('rejects the OP carrier plus flat '+field, () => {
    const ir = fixture(), carrier = ir.creature.actions[0]!;
    (carrier as any)[field] = structuredClone(value);
    const before = structuredClone(ir), findings = errors(ir);
    if(field==='appliedConditions')expect(findings).toEqual([]);
    else expect(findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'CONFLICTING_SOURCE_OPERATION_CARRIER', path: `/creature/actions/0/${field}` })]));
    expect(ir as unknown).toEqual(before);
  });

  for (const opIndex of [0, 2]) for (const variant of ['conditional', 'replacement', 'base-with-condition', 'additional-with-condition']) {
    test(`rejects ${fixture().creature.actions[0]!.sourceOperations![opIndex]!.type} with ${variant} damage parts`, () => {
      const ir = fixture(), op = ir.creature.actions[0]!.sourceOperations![opIndex]!;
      const gated = variant.endsWith('-with-condition');
      op.damage = [{ formula: '1d6', type: 'fire', relationship: (gated ? variant.split('-')[0] : variant) as 'base' | 'additional' | 'conditional' | 'replacement', ...(gated ? { condition: '由GM选择条件' } : {}) }];
      const before = structuredClone(ir);
      expect(sourceOperationStructureErrors(ir.creature.actions[0]!.sourceOperations)).toContain(`${opIndex}/damage/0/independent-damage-required`);
      expect(errors(ir)).toEqual(expect.arrayContaining([expect.objectContaining({ path: `/creature/actions/0/sourceOperations/${opIndex}/damage/0/independent-damage-required` })]));
      expect(ir as unknown).toEqual(before);
    });
  }

  test('the valid separated OP carrier and flat feature convert through the workflow', async () => {
    const ir = formalFixture(), before = structuredClone(ir);
    expect(errors(ir)).toEqual([]);
    const result = await convert(ir), actor = result.rawJson as any;
    expect(actor.items).toHaveLength(2);
    expect(Object.values(actor.items[0].system.activities).map((activity: any) => activity.type)).toEqual(['attack', 'attack', 'save', 'damage', 'heal']);
    expect(Object.values(actor.items[1].system.activities)).toHaveLength(1);
    expect(Object.values(actor.items[1].system.activities)[0]).toMatchObject({ type: 'attack', attack: { bonus: '19' } });
    expect(ir as unknown).toEqual(before);
  });

  test('the formal workflow retains attack and independent conditional damage without rejecting the Actor', async () => {
    const ir = formalFixture(); ir.creature.actions[0]!.sourceOperations![0]!.damage![0]!.relationship = 'conditional';
    expect(errors(ir).some(finding => finding.path.endsWith('/independent-damage-required'))).toBe(true);
    const result=await convert(ir),actor=result.rawJson as any;expect(actor.items.length).toBeGreaterThan(0);expect(Object.values<any>(actor.items[0].system.activities).some(activity=>activity.type==='attack')).toBe(true);expect(Object.values<any>(actor.items[0].system.activities).some(activity=>activity.type==='damage')).toBe(true);
  });

  test('the formal workflow retains explicit flat attack fields beside an operation carrier', async () => {
    const ir = formalFixture(); ir.creature.actions[0]!.attack = { type: 'mwak', toHit: 19, reach: 10 };
    expect(errors(ir).some(finding => finding.code === 'CONFLICTING_SOURCE_OPERATION_CARRIER')).toBe(true);
    const result=await convert(ir),actor=result.rawJson as any;expect(actor.items.length).toBeGreaterThan(0);expect(Object.values<any>(actor.items[0].system.activities).some(activity=>activity.type==='attack')).toBe(true);
  });
});

function structuredCloneSafe(value: unknown): unknown { try { return structuredClone(value); } catch { return undefined; } }

describe('source operation shape is independent of prose proof', () => {
  const operations = () => fixture().creature.actions[0]!.sourceOperations!;
  const cases: Array<[string, (ops: any[]) => void]> = [
    ['unknown type', ops => { ops[0].type = 'effect'; }],
    ['unknown top-level execution path', ops => { ops[0]['system.attributes.hp'] = 1; }],
    ['unknown attack field', ops => { ops[0].attack.formula = 'script'; }],
    ['unknown proof field', ops => { ops[0].proof.script = 'return game'; }],
    ['upgrade without required damage proof', ops => { ops[3].proof.upgrade = { sourceText: '显式升级', quote: '升级描述' }; }],
    ['unknown damage field', ops => { ops[0].damage[0].changes = []; }],
    ['bad ID', ops => { ops[0].id = 'a/b'; }],
    ['duplicate ID', ops => { ops[1].id = ops[0].id; }],
    ['nonfinite toHit', ops => { ops[0].attack.toHit = NaN; }],
    ['invalid dice grammar', ops => { ops[0].damage[0].formula = '1d6++3'; }],
    ['unsafe dice', ops => { ops[0].damage[0].formula = '9007199254740992d6'; }],
    ['zero dice', ops => { ops[0].damage[0].formula = '0d6'; }],
    ['unknown damage type', ops => { ops[0].damage[0].type = 'magic'; }],
    ['inconsistent selected damage choice', ops => { ops[1].damage[0].types = ['fire', 'cold']; }],
    ['unknown status', ops => { ops[2].failureStatuses = ['custom-script']; }],
    ['status without a save', ops => { ops[0].failureStatuses = ['prone']; }],
    ['unsupported adjustment', ops => { ops[0].damageAdjustment.multiplier = 2; }],
    ['attack and save on one operation', ops => { ops[0].save = structuredClone(ops[2].save); }],
    ['wrong save choice', ops => { ops[2].save.choice = 'single'; }],
    ['bad healing target', ops => { ops[4].healing.target.count = -2; }],
    ['zero area', ops => { ops[3].aoe.radius = 0; }],
    ['bad evidence length', ops => { ops[0].evidence = { ...ref, end: ref.end + 1 }; }],
  ];
  for (const [label, mutate] of cases) test(label, () => {
    const ops = operations(); mutate(ops); const before = structuredClone(ops);
    if(label==='status without a save')expect(sourceOperationStructureErrors(ops)).toEqual([]);
    else expect(sourceOperationStructureErrors(ops).length).toBeGreaterThan(0); expect(ops).toEqual(before);
  });
  test('constant and sum dice are supported, arbitrary execution expressions are rejected', () => {
    for (const formula of ['5', '2d8 + 4', '2d8+1d6-3', '1D10']) {
      const ops = operations(); ops[0]!.damage![0]!.formula = formula; expect(sourceOperationStructureErrors(ops)).toEqual([]);
    }
    for (const formula of ['1d6 + @mod', 'Math.random()', '1d6/0', '1d-6', '1d6d8', 'Infinity']) {
      const ops = operations(); ops[0]!.damage![0]!.formula = formula; expect(sourceOperationStructureErrors(ops).length).toBeGreaterThan(0);
    }
  });
});
