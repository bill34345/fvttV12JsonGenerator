import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { FACT_LOCALIZATION_POLICY, LOCALIZATION_POLICY,
  approveLocalizationByGm,acceptLocalization,assertReviewedLocalization,localizationHash,localizationRequest,localizationText,validateLocalizationDraft } from '@fvtt-json-generator/contracts/localization';
import { ActorGenerator } from '@fvtt-json-generator/generation/actor';
import { createRulePresentationPlan } from '@fvtt-json-generator/generation/rule-presentation';
import { actorLocalizationDisplayRows, createActorLocalizationRequest,
  projectActorLocalizationDraft, projectReviewedActorLocalization } from '@fvtt-json-generator/generation/reviewed-localization';
import { verifyMonsterIntake } from '@fvtt-json-generator/intake-ai/verifier';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { YamlParser, parseSupportedRuleFacts } from '@fvtt-json-generator/parser';
import type { MonsterIntakeIR } from '@fvtt-json-generator/intake-ai/types';
import type { ActionData } from '@fvtt-json-generator/models/action';
import { formatLiteralHtml, formatManualRuleHtml, MANUAL_RULE_NOTICE } from '../packages/generation/src/actor-text';

const savedMezz = 'tests/fixtures/forge-facts-history/mezzoloth.json';
const savedSea = 'tests/fixtures/forge-target-choice-fresh-intake.json';

describe('source participant categories at the approval boundary',()=>{
 test.each([
  ['<p>The sentinel watches creatures that enter.</p>','<p>守卫监视进入的建筑。</p>'],
  ['<p>The sentinel watches objects that enter.</p>','<p>守卫监视进入的生物。</p>'],
  ['<p>A building stands here.</p><p>The sentinel ignores creatures but warns creatures that approach.</p>',
   '<p>这里有一栋建筑。</p><p>守卫不理会生物，但会警告靠近的建筑。</p>'],
 ])('keeps a source-bound erroneous draft editable but refuses approval: %s',(source,text)=>{
  const field=localizationText('body',source),request=localizationRequest('participant-category-fixture',[field]),draft={texts:[{id:field.id,text}]};
  expect(()=>validateLocalizationDraft(request,draft)).not.toThrow();
  expect(()=>approveLocalizationByGm(request,draft,'fixture-gm')).toThrow('对象类别');
  expect(()=>acceptLocalization(request,draft,{verdict:'accepted',findings:[]},'fixture-review')).toThrow('对象类别');
  const requestHash=localizationHash(request);
  const oldApproval={version:2,language:'zh-CN',policy:request.policy,terminology:request.terminology,requestHash,texts:draft.texts,
   approval:{kind:'gm',gmId:'old-fixture-gm',translationHash:localizationHash({requestHash,texts:draft.texts})}};
  expect(()=>assertReviewedLocalization(request,oldApproval)).toThrow('对象类别');
 });
 test.each([
  ['<p>Creatures approach the building.</p>','<p>生物靠近建筑。</p>'],
  ['<p>Creatures leave.</p>','<p>活物离开了。</p>'],
  ['<p>Creatures leave, and creatures return.</p>','<p>生物离开了，它们又返回。</p>'],
 ])('allows source-backed categories and pronouns without claiming full semantic equivalence: %s',(source,text)=>{
  const field=localizationText('body',source),request=localizationRequest('participant-positive-fixture',[field]);
  expect(()=>approveLocalizationByGm(request,{texts:[{id:field.id,text}]},'fixture-gm')).not.toThrow();
 });
});

describe('current v14 descriptions retain exact English after Chinese',()=>{
 const source='generic-bilingual-description-fixture';
 const original:any={name:'Forest Keeper',type:'npc',_stats:{coreVersion:'14.368',systemVersion:'5.3.3'},
  system:{attributes:{hp:{value:20,max:20}},details:{biography:{value:'<p>It guards a quiet library.</p>'}},traits:{languages:{custom:'It speaks old languages.'}}},
  items:[{_id:'abcdefghijklmnop',name:'Stone Ward',type:'feat',system:{description:{value:'<p>The ward ends if the door opens.</p>'},
   activities:{ward:{_id:'ward',type:'utility',description:{chatFlavor:'<p>The target escapes at the end of its turn.</p>'}}}},effects:[]}],
  effects:[{name:'Quiet Watch',description:'<p>It cannot move.</p>'}]};
 const translations:Record<string,string>={'Forest Keeper':'森林守卫','Stone Ward':'石之守护','Quiet Watch':'静默守望',
  '<p>It guards a quiet library.</p>':'<p>它守护着安静的图书馆。</p>',
  '<p>The ward ends if the door opens.</p>':'<p>若门被打开，守护结束。</p>',
  '<p>The target escapes at the end of its turn.</p>':'<p>目标在其回合结束时逃脱。</p>',
  '<p>It cannot move.</p>':'<p>它不能移动。</p>','It speaks old languages.':'它会说古老的语言。'};
 function project(policy=FACT_LOCALIZATION_POLICY as typeof FACT_LOCALIZATION_POLICY|typeof LOCALIZATION_POLICY){
  const plan=createRulePresentationPlan({sourceActor:original,sourceIdentity:source,consumedActions:[],biographyFacts:[]});
  const request=createActorLocalizationRequest(original,source,policy,plan);
  return projectActorLocalizationDraft(original,source,{texts:request.texts.map(field=>({id:field.id,text:translations[field.source]!}))},policy,undefined,plan).actor;
 }
 for(const [name,path]of [
  ['biography',['system','details','biography','value']],
  ['ability description',['items',0,'system','description','value']],
  ['activity chat description',['items',0,'system','activities','ward','description','chatFlavor']],
  ['effect description',['effects',0,'description']],
 ] as const)test(name,()=>{
  const read=(actor:any)=>path.reduce((value:any,key)=>value[key],actor);
  const english=read(original),out=read(project());
  expect(out).toBe(`${translations[english]}<hr><h3>英文原文</h3>${english}`);
  expect(read(original)).toBe(english);
 });
 test('titles, non-description fields and all mechanics keep their own semantics',()=>{
  const out=project();expect(out.name).toBe('森林守卫 Forest Keeper');
  expect(out.system.traits.languages.custom).toBe('它会说古老的语言。');
  expect(out.system.attributes).toEqual(original.system.attributes);
  expect(out.items[0]._id).toBe(original.items[0]._id);
  expect(out.items[0].system.activities.ward.type).toBe('utility');
  expect(out.items[0].effects).toEqual([]);
 });
 test('legacy policy and a Chinese-only description do not get extra source blocks',()=>{
  expect(project(LOCALIZATION_POLICY).items[0].system.description.value).toBe('<p>若门被打开，守护结束。</p>');
  const actor=structuredClone(original);actor.system.details.biography.value='<p>只有中文。</p>';
  const plan=createRulePresentationPlan({sourceActor:actor,sourceIdentity:source,consumedActions:[],biographyFacts:[]});
  const request=createActorLocalizationRequest(actor,source,FACT_LOCALIZATION_POLICY,plan);
  const out=projectActorLocalizationDraft(actor,source,{texts:request.texts.map(field=>({id:field.id,text:translations[field.source]!}))},FACT_LOCALIZATION_POLICY,undefined,plan).actor;
  expect(out.system.details.biography.value).toBe('<p>只有中文。</p>');
 });
});

describe('author source and generated GM instructions have separate ownership',()=>{
 function sample(source:string,zh:string,marker:'valid'|'missing'|'mismatched'='valid'){
  const original:any={name:'Forest Keeper',type:'npc',_stats:{coreVersion:'14.368',systemVersion:'5.3.3'},
   system:{details:{biography:{value:''}}},effects:[],items:[{name:'Stone Ward',type:'feat',effects:[],
    flags:marker==='missing'?{}:{fvttJsonGenerator:{manualRule:{version:1,mode:'gm-manual',
     sourceText:source+(marker==='mismatched'?' Additional rule.':''),logicalPath:'actions/0'}}},
    system:{description:{value:formatManualRuleHtml(source,true)},activities:{ward:{type:'utility',
     description:{chatFlavor:formatManualRuleHtml(source,false)}}}}}]};
  const plan=createRulePresentationPlan({sourceActor:original,sourceIdentity:'manual-source-ownership',consumedActions:[],biographyFacts:[]});
  const request=createActorLocalizationRequest(original,'manual-source-ownership',FACT_LOCALIZATION_POLICY,plan);
  const titles:Record<string,string>={'Forest Keeper':'森林守卫','Stone Ward':'石之守护'};
  const draft={texts:request.texts.map(field=>({id:field.id,text:field.kind==='title'
   ? titles[field.source]!
   : field.source.replaceAll(formatLiteralHtml(source),formatLiteralHtml(zh))}))};
  const untouched=structuredClone(original);
  const projected=projectActorLocalizationDraft(original,'manual-source-ownership',draft,FACT_LOCALIZATION_POLICY,undefined,plan);
  expect(original).toEqual(untouched);
  expect(projected.actor.items[0].flags).toEqual(original.items[0].flags);
  expect(createActorLocalizationRequest(original,'manual-source-ownership',FACT_LOCALIZATION_POLICY,plan)).toEqual(request);
  return {original,actor:projected.actor,rows:actorLocalizationDisplayRows(original,'manual-source-ownership',draft,plan)};
 }
 for(const [label,source,zh] of [
  ['ordinary rule','The ward ends if the door opens.','若门被打开，守护结束。'],
  ['multiline rule and citation','It takes 5 (1d10) Fire damage.\nSource: https://example.org/rule#burn','它受到5（1d10）火焰伤害。\n来源：https://example.org/rule#burn'],
  ['author-written Chinese stays literal',`A creature reads: ${MANUAL_RULE_NOTICE} The ward remains.`,`生物读到：${MANUAL_RULE_NOTICE}守护持续。`],
 ] as const)test(label,()=>{
  const {actor,rows}=sample(source!,zh!);
  for(const out of [actor.items[0].system.description.value,actor.items[0].system.activities.ward.description.chatFlavor]){
   const [chinese,english]=out.split('<hr><h3>英文原文</h3>');
   expect(english).toBe(formatLiteralHtml(source));
   expect(chinese.match(/GM 手动能力：/gu)?.length).toBe(1+(source!.includes(MANUAL_RULE_NOTICE)?1:0));
  }
  for(const row of rows.filter(row=>row.path.includes('description')))expect(row.fullSource).toBe(formatLiteralHtml(source));
 });
 for(const marker of ['missing','mismatched'] as const)test(`${marker} provenance never deletes display text`,()=>{
  const {actor,original}=sample('The ward ends if the door opens.','若门被打开，守护结束。',marker);
  expect(actor.items[0].system.description.value.split('<hr><h3>英文原文</h3>')[1]).toBe(original.items[0].system.description.value);
  expect(actor.items[0].system.activities.ward.description.chatFlavor.split('<hr><h3>英文原文</h3>')[1]).toBe(original.items[0].system.activities.ward.description.chatFlavor);
 });
});

function generate(ir: MonsterIntakeIR) {
  const source = renderMonsterIntakeMarkdown(ir);
  const parsed = new YamlParser().parse(source);
  let plan: ReturnType<typeof createRulePresentationPlan> | undefined;
  const actor = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core',
    rulePresentationSource: source, onRulePresentationPlan: value => { plan = value; } }).generate(parsed);
  if (!plan) throw new Error('missing rule plan');
  return { source, parsed, actor, plan };
}

describe('biography authorship survives rendering, parsing and bilingual projection', () => {
  function sample(source: string, zh: string, size = false) {
    const ir = (JSON.parse(readFileSync(savedSea, 'utf8')) as { ir: MonsterIntakeIR }).ir;
    ir.creature.identity = { name: 'Forest Keeper', size: size ? 'gargantuan' : 'medium', creatureType: 'beast',
      ...(size ? { sourceSize: 'Colossal' } : {}) };
    ir.creature.biography = source;
    ir.creature.attributes.ac = 14;
    ir.creature.attributes.acNote = 'Natural Armor';
    ir.creature.languages = { values: [] };
    delete ir.creature.legendary;
    delete ir.creature.spellcasting;
    for (const key of ['traits','actions','bonusActions','reactions','legendaryActions','mythicActions'] as const) ir.creature[key] = [];
    const generated = generate(ir);
    const request = createActorLocalizationRequest(generated.actor, generated.source, FACT_LOCALIZATION_POLICY, generated.plan);
    const encodedSource = formatLiteralHtml(source).slice(3, -4);
    const encodedZh = formatLiteralHtml(zh).slice(3, -4);
    const draft = { texts: request.texts.map(field => ({ id: field.id, text: field.kind === 'title' ? '森林守卫'
      : field.source.replace(encodedSource, encodedZh).replaceAll('Natural Armor', '天生护甲').replaceAll('gargantuan', '超巨型') })) };
    return { ...generated, request, draft };
  }
  for (const [label, source, zh, size] of [
    ['armor note', 'It guards a quiet library.', '它守护安静的图书馆。', false],
    ['author uses the same Chinese label', 'Author note: 护甲等级：14（Natural Armor）.\nSource: https://example.org/rules',
      '作者备注：护甲等级：14（天生护甲）。\n来源：https://example.org/rules', false],
    ['size note and mixed-language author', 'It rises above the forest.\r\n作者记录：不能删掉这一行。',
      '它高耸于森林之上。\r\n作者记录：不能删掉这一行。', true],
  ] as const) test(label, () => {
    const data = sample(source, zh, size);
    const presentation = (data.parsed as any).biographyPresentation;
    expect(presentation?.sourceText).toBe(source.trim());
    expect(presentation?.programNotes).toHaveLength(size ? 2 : 1);
    expect(data.actor.flags.fvttJsonGenerator.biographyPresentation).toEqual(presentation);
    const out = projectActorLocalizationDraft(data.actor, data.source, data.draft,
      FACT_LOCALIZATION_POLICY, undefined, data.plan).actor;
    const [chinese, original] = out.system.details.biography.value.split('<hr><h3>英文原文</h3>');
    expect(original).toBe(formatLiteralHtml(source.trim()));
    expect(chinese).toContain('data-forge-program-notes');
    expect(chinese).toContain('程序说明');
    expect(chinese).toContain('护甲等级：14（天生护甲）');
    expect(chinese).toContain(formatLiteralHtml(zh).slice(3, -4));
    expect(out.system.attributes).toEqual(data.actor.system.attributes);
    expect(out.items).toEqual([]);
    expect(out.effects).toEqual([]);
  });
  test('program notes alone never acquire an author source block', () => {
    const data = sample('', '');
    const out = projectActorLocalizationDraft(data.actor, data.source, data.draft,
      FACT_LOCALIZATION_POLICY, undefined, data.plan).actor;
    expect(out.system.details.biography.value).toContain('data-forge-program-notes');
    expect(out.system.details.biography.value).not.toContain('英文原文');
  });
  test('mismatched provenance is rejected rather than hiding authored text', () => {
    const data = sample('It guards a quiet library.', '它守护安静的图书馆。');
    const altered = structuredClone(data.actor);
    altered.flags ??= {};
    altered.flags.fvttJsonGenerator ??= {};
    altered.flags.fvttJsonGenerator.biographyPresentation = {version:1, sourceText:'Other author.', programNotes:[]};
    expect(() => createActorLocalizationRequest(altered, data.source, FACT_LOCALIZATION_POLICY,
      createRulePresentationPlan({sourceActor:altered,sourceIdentity:data.source,consumedActions:[],biographyFacts:[]}))).toThrow();
  });
});

describe('same consumed facts render Actor and fixed Chinese rules', () => {
  test('Faldric longbow and shortsword keep source damage in native Actor and fixed Chinese', () => {
    const ir = JSON.parse(readFileSync('tests/fixtures/forge-faldric-intake.json', 'utf8')) as MonsterIntakeIR;
    const { source, actor, plan } = generate(ir);
    const longbow = actor.items.find((item: any) => item.name.includes('Longbow'));
    const shortsword = actor.items.find((item: any) => item.name.includes('Shortsword'));
    expect(longbow).toBeTruthy();
    expect(shortsword).toBeTruthy();
    expect(JSON.stringify(longbow.system)).toContain('1d8');
    expect(JSON.stringify(shortsword.system)).toContain('1d6');
    expect(plan.blocks.some(block => block.factRefs.some(ref=>ref.includes('Longbow/structured/attack'))
      && block.zh.includes('1d8 + 3') && block.zh.includes('射程150/600尺'))).toBe(true);
    expect(plan.blocks.some(block => block.factRefs.some(ref=>ref.includes('Shortsword/structured/attack'))
      && block.zh.includes('1d6 + 3') && block.zh.includes('触及5尺'))).toBe(true);
    const request = createActorLocalizationRequest(actor, source, FACT_LOCALIZATION_POLICY, plan);
    expect(request.texts.some(text => text.source.includes('Ranged Weapon Attack'))).toBe(true);
    expect(request.texts.some(text => text.source.includes('Melee Weapon Attack'))).toBe(true);
  });

  test('saved Shred preserves its native damage and keeps the Heavy Armor exception available for review', () => {
    const ir = (JSON.parse(readFileSync(savedMezz, 'utf8')) as { ir: MonsterIntakeIR }).ir;
    const { source, actor, plan } = generate(ir);
    const shred = actor.items.find((item: any) => item.name.includes('Shred'));
    expect(shred).toBeTruthy();
    expect(JSON.stringify(shred.system.activities)).toContain('2d8');
    const heavy = plan.blocks.filter(block => block.factRefs.some(ref => ref.includes('heavy-armour-half')));
    expect(heavy).toEqual([]);
    expect(shred.system.description.value).toBe(formatLiteralHtml(ir.creature.bonusActions.find(action=>action.name==='Shred')!.description));
    expect(plan.blocks.some(block=>block.factRefs.some(ref=>ref.includes('Shred/structured/damage'))&&block.zh.includes('2d8'))).toBe(true);
    expect(plan.uncoveredMechanics.some(entry=>entry.source.includes('Heavy Armor'))).toBe(true);
    const request = createActorLocalizationRequest(actor, source, FACT_LOCALIZATION_POLICY, plan);
    expect(request.texts.some(text => text.source.includes('or half as much if'))).toBe(true);
  });

  test('saved Toxic Emission retains native Save and damage while leaving its unmapped condition visibly unresolved', () => {
    const saved=JSON.parse(readFileSync(savedMezz,'utf8')) as {source:string;ir:MonsterIntakeIR};
    const {source,actor,plan}=generate(saved.ir);
    const toxic=actor.items.find((item:any)=>item.name.includes('Toxic Emission'));
    const activity=Object.values(toxic.system.activities)[0] as any;
    expect(activity.save).toEqual({ability:['con'],dc:{calculation:'',formula:'14'}});
    expect(activity.damage.parts).toMatchObject([{number:4,denomination:8,types:['poison']}]);
    expect(toxic.effects).toEqual([]);
    expect(toxic.system.description.value.startsWith(formatLiteralHtml(saved.ir.creature.actions[3]!.description))).toBe(true);
    expect(toxic.system.description.value).toContain('适用条件、期限、逃脱与解除依完整原文判断');
    expect(plan.blocks.filter(block=>block.factRefs.some(ref=>ref.includes('save-damage-status')))).toEqual([]);
    const report=verifyMonsterIntake(saved.source,saved.ir,source,actor);
    expect(report.status).toBe('needs_review');
    expect(report.findings).toContainEqual(expect.objectContaining({code:'INVALID_STRUCTURE',path:'/creature/actions/3/appliedConditions/0/statuses/0'}));
    expect(createActorLocalizationRequest(actor,source,FACT_LOCALIZATION_POLICY,plan).texts.some(text=>text.source.includes('the creature is Blinded until'))).toBe(true);
  });

  test('an explicitly typed Toxic Emission status and save outcome bind the native template and approval to the current fields',()=>{
    const ir=(JSON.parse(readFileSync(savedMezz,'utf8')) as {ir:MonsterIntakeIR}).ir;
    const action=ir.creature.actions[3]!;
    action.appliedConditions![0]!.statuses=['blinded'];action.save!.outcome='half';
    const {source,actor,plan}=generate(ir);
    const toxic=actor.items.find((item:any)=>item.name.includes('Toxic Emission'));
    const activity=Object.values(toxic.system.activities)[0] as any;
    expect(activity.save).toEqual({ability:['con'],dc:{calculation:'',formula:'14'}});
    expect(activity.damage.onSave).toBe('half');
    expect(toxic.effects).toHaveLength(1);
    expect(toxic.effects[0].statuses).toEqual(['blinded']);
    expect(toxic.effects[0].flags.fvttJsonGenerator.conditionLifecycle).toMatchObject({version:1,mode:'gm',duration:'until the end of its next turn'});
    expect(activity.effects).toContainEqual(expect.objectContaining({_id:toxic.effects[0]._id}));
    expect(plan.blocks.some(block=>block.factRefs.some(ref=>ref.endsWith('/effect/status'))&&block.zh.includes('目盲'))).toBe(true);
    const changedSave=structuredClone(actor);
    (Object.values(changedSave.items.find((item:any)=>item.name.includes('Toxic Emission')).system.activities)[0] as any).save.dc.formula='15';
    expect(()=>createActorLocalizationRequest(changedSave,source,FACT_LOCALIZATION_POLICY,plan)).toThrow();
    const changedEffectLink=structuredClone(actor);
    (Object.values(changedEffectLink.items.find((item:any)=>item.name.includes('Toxic Emission')).system.activities)[0] as any).effects[0]._id='another-effect-id';
    expect(()=>createActorLocalizationRequest(changedEffectLink,source,FACT_LOCALIZATION_POLICY,plan)).toThrow();
  });

  test('a different structured status duration cannot certify the source rule as fixed', () => {
    const ir = (JSON.parse(readFileSync(savedMezz, 'utf8')) as { ir: MonsterIntakeIR }).ir;
    const toxic = ir.creature.actions.find(action => action.name === 'Toxic Emission')!;
    toxic.appliedConditions![0]!.duration = 'until the start of its next turn';
    const { plan } = generate(ir);
    expect(plan.blocks.some(block => block.factRefs.some(ref => ref.includes('save-damage-status')))).toBe(false);
    expect(plan.uncoveredMechanics.some(entry => entry.source.includes('Blinded until the end'))).toBe(true);
  });

  test('a source viewer name must match whole Actor words, not a substring', () => {
    const rule = 'A creature the cat can see within 60 feet, forcing it to make a Constitution Saving Throw: DC 15. Failure: 22 (5d8) Acid damage plus 22 (5d8) Necrotic damage. Success: Half damage.';
    const actor: any = { name: 'Catoblepas', _stats: { coreVersion: '14.364', systemVersion: '5.3.3' },
      system: { details: { biography: { value: '' } } }, effects: [],
      items: [{ name: 'Bilebrine', system: { description: { value: rule, chat: '' }, activities: {} }, effects: [] }] };
    const action: ActionData = { name: 'Bilebrine', type: 'save', desc: rule,
      save: { dc: 15, ability: 'con', outcome: 'half' },
      sourceDamageParts: [
        { formula: '5d8', type: 'acid', relationship: 'base' },
        { formula: '5d8', type: 'necrotic', relationship: 'additional' },
      ], sourceRuleFacts: parseSupportedRuleFacts(rule) };
    const plan = createRulePresentationPlan({ sourceActor: actor, sourceIdentity: rule,
      biographyFacts: [], consumedActions: [{ logicalPath: 'structuredActions/动作/0', itemIndex: 0, action }] });
    expect(action.sourceRuleFacts?.some(fact => fact.kind === 'visible-target-save-damage')).toBe(true);
    expect(plan.blocks.some(block => block.source.includes('the cat can see')
      && block.zh.includes('该能力来源者看得见'))).toBe(false);
    expect(createActorLocalizationRequest(actor, rule, FACT_LOCALIZATION_POLICY, plan).texts
      .some(text => text.source.includes('the cat can see'))).toBe(true);
  });

  test('saved Death Glare separates native Save and GM status facts from its complete prerequisites and special result', () => {
    const ir = (JSON.parse(readFileSync(savedSea, 'utf8')) as { ir: MonsterIntakeIR }).ir;
    const { source, actor, plan } = generate(ir);
    const glare = actor.items.find((item: any) => item.name.includes('Death Glare'));
    expect(glare).toBeTruthy();
    expect(JSON.stringify(glare.effects).toLowerCase()).toContain('stunned');
    const blocks = plan.blocks.filter(block => block.factRefs.some(ref => ref.includes('save-status')));
    expect(blocks).toEqual([]);
    expect(plan.blocks.some(block=>block.factRefs.some(ref=>ref.includes('Death Glare')&&ref.endsWith('/structured/save'))&&block.zh.includes('DC 15感知豁免'))).toBe(true);
    const status=glare.effects.find((effect:any)=>effect.statuses.includes('stunned'));
    expect(status.flags.fvttJsonGenerator.conditionLifecycle).toMatchObject({version:1,mode:'gm',duration:'until the end of its next turn'});
    expect(glare.system.description.value.startsWith(formatLiteralHtml(ir.creature.bonusActions.find(action=>action.name.includes('Death Glare'))!.description))).toBe(true);
    expect(glare.system.description.value).toContain('适用条件、期限、逃脱与解除依完整原文判断');
    const request = createActorLocalizationRequest(actor, source, FACT_LOCALIZATION_POLICY, plan);
    expect(request.texts.some(text => text.source.includes('The creature is Stunned until'))).toBe(true);
  });

  test('conditional and replacement damage survive parser, but never join native base damage', () => {
    const source = [
      '---', '名称: Rule Beast', '类型: npc', '护甲等级: 12', '生命值: 20',
      '动作:', '  - 名称: Claw', '    类型: attack', '    攻击类型: mwak',
      '    命中: 5', '    范围: 触及 5 尺', '    描述: "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) Slashing damage."',
      '    伤害:', '      - {公式: "1d8 + 3", 类型: slashing, 关系: base}',
      '      - {公式: "1d4", 类型: fire, 关系: additional, 条件: "if burning"}',
      '      - {公式: "2d6", 类型: cold, 关系: conditional, 条件: "if wet"}',
      '      - {公式: "3d6", 类型: acid, 关系: replacement}', '---',
    ].join('\n');
    const parsed = new YamlParser().parse(source);
    const action = parsed.structuredActions?.['动作']?.[0];
    expect(action?.sourceDamageParts?.map(part => part.relationship))
      .toEqual(['base', 'additional', 'conditional', 'replacement']);
    expect(action?.damage?.map(part => part.formula)).toEqual(['1d8 + 3', '1d4']);
    const actor = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(parsed);
    const item = actor.items.find((entry: any) => entry.name.includes('Claw'));
    const native=Object.values(item.system.activities).find((activity:any)=>activity.type==='attack') as any;
    expect(native.damage.parts).toMatchObject([{number:1,denomination:8,bonus:'3',types:['slashing']}]);
    expect(native.damage.parts).toHaveLength(1);
    const helpers=(Object.values(item.system.activities) as any[]).filter(activity=>activity.flags?.fvttJsonGenerator?.literalDamage);
    expect(helpers.map(helper=>helper.flags.fvttJsonGenerator.literalDamage.part.formula)).toEqual(['1d4','2d6','3d6']);
    expect(helpers.every(helper=>helper.activation.type==='special'&&helper.consumption.targets.length===0)).toBe(true);
    const legacy = new ActorGenerator({ fvttVersion: '12', effectProfile: 'core' }).generate(parsed);
    const legacyItem = legacy.items.find((entry: any) => entry.name.includes('Claw'));
    const legacyParts = Object.values(legacyItem.system.activities)
      .flatMap((activity: any) => activity.damage?.parts ?? []);
    expect(legacyParts.some((part: any) => part.number === 1 && part.denomination === 4
      && part.types?.includes('fire'))).toBe(true);
  });

  test('fixed blocks have no model text ID and approval is bound to current facts', () => {
    const rule = 'One creature Grappled by the mezzoloth takes 9 (2d8) Slashing damage, or half as much if it is wearing Heavy Armor.';
    const actor: any = { name: 'Mezzoloth Sellblade',
      _stats: { coreVersion: '14.364', systemVersion: '5.3.3' },
      system: { details: { biography: { value: '' } } },
      items: [{ name: 'Shred', system: { description: { value: '<ul><li>Shred. ' + rule + '</li></ul>', chat: '' },
        activities: { damage: { description: { chatFlavor: rule } } } }, effects: [] }],
      effects: [] };
    const action: ActionData = { name: 'Shred', type: 'damage', desc: rule,
      damage: [{ formula: '2d8', type: 'slashing' }], sourceRuleFacts: parseSupportedRuleFacts(rule) };
    const plan = createRulePresentationPlan({ sourceActor: actor, sourceIdentity: 'source-A',
      biographyFacts: [], consumedActions: [{ logicalPath: 'structuredActions/附赠动作/0/Shred', itemIndex: 0, action }] });
    const request = createActorLocalizationRequest(actor, 'source-A', FACT_LOCALIZATION_POLICY, plan);
    expect(request.texts.some(text => text.source.includes('Heavy Armor'))).toBe(false);
    const draft = { texts: request.texts.map(text => ({
      id: text.id,
      text: text.kind === 'title' ? '撕碎' : text.source.replace('Shred', '撕碎'),
    })) };
    const approved = approveLocalizationByGm(request, draft, 'fixture-gm');
    const localized = projectReviewedActorLocalization(actor, 'source-A', approved, plan).actor;
    expect(localized.items[0].system.description.value).toContain('穿着重甲');
    expect(localized.items[0].system.activities.damage.description.chatFlavor).toContain('伤害减半');
    const rows = actorLocalizationDisplayRows(actor, 'source-A', draft, plan);
    expect(rows.some(row => row.fixedBlocks.some(block => block.executionMode === 'gm-assisted'))).toBe(true);
    expect(rows.some(row => row.fullSource === 'Mezzoloth Sellblade' && row.assembledZh.includes('撕碎'))).toBe(true);
    expect(() => projectReviewedActorLocalization(actor, 'source-A', approved)).toThrow();
    const changed = createRulePresentationPlan({ sourceActor: actor, sourceIdentity: 'source-A',
      biographyFacts: [], consumedActions: [{ logicalPath: 'structuredActions/附赠动作/0/Shred', itemIndex: 0,
        action: { ...action, damage: [{ formula: '3d8', type: 'slashing' }] } }] });
    expect(() => projectReviewedActorLocalization(actor, 'source-A', approved, changed)).toThrow();
    expect(createActorLocalizationRequest(actor, 'source-A').policy).toBe(LOCALIZATION_POLICY);
  });

  test('one target-choice fact fixes area, status duration and repeat-save outcome together', () => {
    const rule = 'A veil fills a 15-foot Emanation. Each creature in the area must make a Intelligence or Wisdom Saving Throw: (Target’s Choice) DC 15. Failure: The creature is Frightened for 1 minute (Save Ends at end of turn).';
    const actor: any = { name: 'Veil Guardian',
      _stats: { coreVersion: '14.364', systemVersion: '5.3.3' },
      system: { details: { biography: { value: '' } } }, effects: [],
      items: [{ name: 'Dread Veil', system: { description: { value: '<p>' + rule + '</p>', chat: '' },
        activities: { utility: { description: { chatFlavor: rule } } } }, effects: [] }] };
    const action: ActionData = { name: 'Dread Veil', type: 'utility', desc: rule,
      sourceRuleFacts: parseSupportedRuleFacts(rule) };
    const plan = createRulePresentationPlan({ sourceActor: actor, sourceIdentity: rule,
      biographyFacts: [], consumedActions: [{ logicalPath: 'structuredActions/动作/0', itemIndex: 0, action }] });
    const fixed = plan.blocks.filter(block => block.factRefs.some(ref => ref.includes('target-choice-save')));
    expect(fixed.some(block => block.zh.includes('15尺光环区域内的每个生物')
      && block.zh.includes('DC 15智力或感知豁免') && block.zh.includes('恐慌')
      && block.zh.includes('1分钟') && block.zh.includes('回合结束时可再次豁免')
      && block.zh.includes('成功则结束'))).toBe(true);
    const request = createActorLocalizationRequest(actor, rule, FACT_LOCALIZATION_POLICY, plan);
    expect(request.texts.some(text => text.source.includes('15-foot Emanation')
      || text.source.includes('(Target’s Choice)'))).toBe(false);
  });

  test('Chinese-only structured source still assembles fixed facts without a model field', () => {
    const actor: any = { name: '规则兽', _stats: { coreVersion: '14.364', systemVersion: '5.3.3' },
      system: { details: { biography: { value: '' } } }, effects: [],
      items: [{ name: '重击', system: { description: { value: '目标受到1d8火焰伤害。', chat: '' },
        activities: {} }, effects: [] }] };
    const action: ActionData = { name: '重击', type: 'damage', desc: '目标受到1d8火焰伤害。',
      damage: [{ formula: '1d8', type: 'fire' }],
      sourceDamageParts: [{ formula: '1d8', type: 'fire', relationship: 'base' }] };
    const plan = createRulePresentationPlan({ sourceActor: actor, sourceIdentity: '中文来源',
      biographyFacts: [], consumedActions: [{ logicalPath: 'structuredActions/动作/0', itemIndex: 0,
        action, sourceStructured: { name: '重击', type: 'damage', describe: action.desc!,
          damage: [{ formula: '1d8', type: 'fire' }] } }] });
    const request = createActorLocalizationRequest(actor, '中文来源', FACT_LOCALIZATION_POLICY, plan);
    expect(request.texts).toEqual([]);
    const projected = projectActorLocalizationDraft(actor, '中文来源', { texts: [] },
      FACT_LOCALIZATION_POLICY, undefined, plan).actor;
    expect(projected.items[0].system.description.value).toBe('目标受到1d8火焰伤害。');
    expect(projected.items[0].system.description.chat).toContain('【结构化事实供GM核对】');
    expect(projected.items[0].system.description.chat).toContain('1d8');
    expect(plan.uncoveredMechanics).toHaveLength(1);
  });
});
