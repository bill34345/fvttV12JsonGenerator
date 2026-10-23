import {test,expect} from 'bun:test';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import yaml from 'js-yaml';
import {sha256} from '@fvtt-json-generator/contracts/hash';
import {splitStagedMonsterSource} from '@fvtt-json-generator/intake-ai/staged-source';
import {validateStagedBaseFacts,assembleStagedMonsterIntake} from '@fvtt-json-generator/intake-ai/staged-extraction';
import {decodeCategoryFormV2,makeWholeCategoryForm} from '../packages/intake-ai/src/category-form-v2';
import {adaptCategoryFormV2,inspectCategoryFormV2,completeCategoryFormSpellcasting} from '../packages/intake-ai/src/category-form-v2-adapter';
import {sourceDailySpellAction,sourceDailySpellActionOwnerMatches} from '../packages/intake-ai/src/daily-spell-action';
import {sourceReferencedSpellAction} from '../packages/intake-ai/src/source-spell-reference';
import {sourceSpellcastingAbility,assessSourceSpellcastingAbility} from '../packages/intake-ai/src/spellcasting-ability';
import {stagedSpellcastingGroups,isSourceSpellcastingFeature,bindSourceGroupComponents,sourceSpellcastingIntroduction} from '../packages/intake-ai/src/staged-spellcasting';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import {sourceSpellGrantTokens,sourceManualSpellGrant} from '../packages/intake-ai/src/spell-grant-tokens';
import {officialDragonSeeds} from './fixtures/forge-2024-dragon-seeds';
import type {MonsterIntakeIR} from '../packages/intake-ai/src/types';
import {namespaceDuplicateSpellRefIds} from '../packages/intake-ai/src/spell-ref-identities';

const header='Proof Sentinel\nMedium construct, unaligned\nArmor Class 14\nHit Points 30 (4d8 + 12)\nSpeed 30 ft.\nSTR DEX CON INT WIS CHA\n10 10 16 10 14 16\nChallenge 2\n';
function synthetic(body:string){
  const source=header+body+'\n',plan=splitStagedMonsterSource({source,sourceSha256:sha256(source),candidate:{id:'proof',label:'Proof Sentinel',start:0,end:source.length,quote:source}});
  const base=validateStagedBaseFacts(plan,{schemaVersion:1,creature:{identity:{name:'Proof Sentinel',size:'medium',creatureType:'construct',alignment:'unaligned'},abilities:{str:10,dex:10,con:16,int:10,wis:14,cha:16},
    attributes:{ac:14,hp:{value:30,formula:'4d8 + 12'},movement:{walk:30},cr:2},saves:{},skills:{},defenses:{resistances:[],immunities:[],vulnerabilities:[],conditionImmunities:[]},senses:{},languages:{values:[]}},uncertainties:[]});
  const form=yaml.load(String(makeWholeCategoryForm(plan).payload.template)) as Record<string,any[]>;
  return{source,plan,base,form,decoded:()=>decodeCategoryFormV2({markdown:yaml.dump(form,{lineWidth:-1})},plan)};
}
const frozenRoot='.local/forge-new-three-paired-20261022';
function frozen(caseId:'N2'|'N3'){
  const index=caseId==='N2'?4:7,whole=caseId==='N2'?6:8;
  const paths=[`${frozenRoot}/${caseId}/source.md`,`${frozenRoot}/frozen-model-calls/forge-${caseId}-${index}-reply-0.txt`,`${frozenRoot}/frozen-model-calls/forge-${caseId}-${whole}-reply-0.txt`];
  const text=(path:string)=>readFileSync(path,'utf8').replace(/^\uFEFF/u,''),source=text(paths[0]!);
  const plan=splitStagedMonsterSource({source,sourceSha256:sha256(source),candidate:{id:caseId,label:caseId,start:0,end:source.length,quote:source}});
  const base=validateStagedBaseFacts(plan,JSON.parse(text(paths[1]!))),decoded=decodeCategoryFormV2(JSON.parse(text(paths[2]!)),plan);
  return{source,plan,base,decoded,paths,hashes:paths.map(path=>createHash('sha256').update(readFileSync(path)).digest('hex'))};
}
const localFrozenTest=existsSync(`${frozenRoot}/N3/source.md`)?test:test.skip;

test('scoped ref-key formatting runs without private dragon fixtures and preserves the reuse target',()=>{
  const parent={refId:'scorching-ray',originalName:'Scorching Ray'},child={...parent,reuseOf:{groupId:'spellcasting',refId:'scorching-ray'}};
  const proposal={creature:{spellcasting:[{groupId:'spellcasting',usageGroups:[{spellRefs:[parent]}]},{groupId:'blazing-light',usageGroups:[{spellRefs:[child]}]}]}};
  namespaceDuplicateSpellRefIds(proposal);
  expect(parent.refId).not.toBe(child.refId);expect(child.reuseOf.refId).toBe(parent.refId);
  expect([parent.originalName,child.originalName]).toEqual(['Scorching Ray','Scorching Ray']);
  const once=JSON.stringify(proposal);namespaceDuplicateSpellRefIds(proposal);expect(JSON.stringify(proposal)).toBe(once);
});

localFrozenTest('provider ref keys may repeat across groups when every reuse target is unambiguous',()=>{
  const {source,ir:original}=officialDragonSeeds().find(row=>row.id==='brass')!,ir=structuredClone(original) as MonsterIntakeIR;
  const parent=ir.creature.spellcasting!.find(group=>group.featureName==='Spellcasting')!,child=ir.creature.spellcasting!.find(group=>group.featureName==='Blazing Light')!;
  const owner=parent.usageGroups.flatMap(usage=>usage.spellRefs).find(ref=>ref.originalName==='Scorching Ray')!,reuse=child.usageGroups[0]!.spellRefs[0]!;
  owner.refId='same-spell';reuse.refId='same-spell';reuse.reuseOf={groupId:parent.groupId,refId:'same-spell'};
  namespaceDuplicateSpellRefIds(ir);
  expect(owner.refId).not.toBe(reuse.refId);expect(reuse.reuseOf.refId).toBe(owner.refId);
  expect(validateMonsterIntakeIR(source,ir).blocking).toEqual([]);
  const once=JSON.stringify(ir);namespaceDuplicateSpellRefIds(ir);expect(JSON.stringify(ir)).toBe(once);
});
localFrozenTest('ambiguous same-group ref keys remain invalid instead of receiving guessed links',()=>{
  const {source,ir:original}=officialDragonSeeds().find(row=>row.id==='brass')!,ir=structuredClone(original) as MonsterIntakeIR;
  const refs=ir.creature.spellcasting![0]!.usageGroups[0]!.spellRefs;
  refs[1]!.refId=refs[0]!.refId;const before=JSON.stringify(ir);namespaceDuplicateSpellRefIds(ir);
  expect(JSON.stringify(ir)).toBe(before);expect(validateMonsterIntakeIR(source,ir).blocking.some(row=>row.code==='DUPLICATE_ID')).toBe(true);
});
localFrozenTest('ref-key formatting cannot conceal a forbidden target-world identifier',()=>{
  const {source,ir:original}=officialDragonSeeds().find(row=>row.id==='brass')!,ir=structuredClone(original) as MonsterIntakeIR;
  const parent=ir.creature.spellcasting!.find(group=>group.featureName==='Spellcasting')!,child=ir.creature.spellcasting!.find(group=>group.featureName==='Blazing Light')!;
  parent.usageGroups[0]!.spellRefs[0]!.refId='Actor.0123456789abcdef';child.usageGroups[0]!.spellRefs[0]!.refId='Actor.0123456789abcdef';
  const before=JSON.stringify(ir);namespaceDuplicateSpellRefIds(ir);expect(JSON.stringify(ir)).toBe(before);
  expect(validateMonsterIntakeIR(source,ir).blocking.some(row=>row.code==='FORBIDDEN_TARGET_WORLD_IDENTIFIER')).toBe(true);
});

localFrozenTest('a mixed native/manual spell grant keeps the original line ending without absorbing the next grant',()=>{
  const {source,ir:original}=officialDragonSeeds().find(row=>row.id==='brass')!,ir=structuredClone(original) as MonsterIntakeIR;
  const group=ir.creature.spellcasting!.find(entry=>entry.featureName==='Spellcasting')!;
  const row=sourceManualSpellGrant(group.evidence[0]!,group.manualGrants![0]!)!.row;
  let end=row.end;while(end<source.length&&/\s/u.test(source[end]!))end++;
  expect(end).toBeGreaterThan(row.end);
  group.usageGroups[0]!.evidence=[{start:row.start,end,quote:source.slice(row.start,end)}];
  expect(validateMonsterIntakeIR(source,ir).blocking).toEqual([]);
  group.usageGroups[0]!.evidence=[{start:row.start,end:end+1,quote:source.slice(row.start,end+1)}];
  expect(validateMonsterIntakeIR(source,ir).blocking.some(finding=>finding.code==='INVALID_SPELL_GRANT_SPAN')).toBe(true);
});

localFrozenTest('reference validation uses the resolved spell rather than program-private group/ref IDs',()=>{
  const {source,ir:original}=officialDragonSeeds().find(row=>row.id==='brass')!,ir=structuredClone(original) as MonsterIntakeIR;
  const groups=ir.creature.spellcasting!,ids=new Map<string,string>();
  groups.forEach((group,i)=>{const old=group.groupId;group.groupId=`model-group-${i}`;ids.set(old,group.groupId);group.usageGroups.forEach((usage,j)=>usage.spellRefs.forEach((ref,k)=>{ids.set(old+'/'+ref.refId,`model-ref-${i}-${j}-${k}`);ref.refId=ids.get(old+'/'+ref.refId)!;}));});
  for(const group of groups)for(const usage of group.usageGroups)for(const ref of usage.spellRefs)if(ref.reuseOf){const old=ref.reuseOf;ref.reuseOf={groupId:ids.get(old.groupId)!,refId:ids.get(old.groupId+'/'+old.refId)!};}
  expect(validateMonsterIntakeIR(source,ir).blocking).toEqual([]);
  const child=groups.find(group=>group.featureName==='Blazing Light')!,ref=child.usageGroups[0]!.spellRefs[0]!;
  ref.reuseOf!.refId='missing-ref';
  expect(validateMonsterIntakeIR(source,ir).blocking.some(row=>row.code==='SPELL_REFERENCE_SOURCE_MISMATCH')).toBe(true);
});
localFrozenTest('reference validation accepts a wider source-proven profile citation but still rejects a different DC',()=>{
  const {source,ir:original}=officialDragonSeeds().find(row=>row.id==='brass')!,ir=structuredClone(original) as MonsterIntakeIR,groups=ir.creature.spellcasting!;
  const parent=groups.find(group=>group.featureName==='Spellcasting')!,child=groups.find(group=>group.featureName==='Blazing Light')!;
  const start=parent.abilityEvidence[0]!.start,end=parent.saveDcEvidence![0]!.end;
  child.saveDcEvidence=[{start,end,quote:source.slice(start,end)}];
  expect(validateMonsterIntakeIR(source,ir).blocking).toEqual([]);
  child.saveDc=17;
  expect(validateMonsterIntakeIR(source,ir).blocking.some(row=>row.code==='SPELL_REFERENCE_SOURCE_MISMATCH')).toBe(true);
  child.saveDc=16;
  const foreign=source.indexOf('DC 16',parent.evidence[0]!.end);
  child.saveDcEvidence=[{start:foreign,end:foreign+5,quote:source.slice(foreign,foreign+5)}];
  expect(validateMonsterIntakeIR(source,ir).blocking.length).toBeGreaterThan(0);
});
localFrozenTest('source-explicit casting level metadata agrees with its literal qualifier',()=>{
  const {source,ir:original}=officialDragonSeeds().find(row=>row.id==='green')!,ir=structuredClone(original) as MonsterIntakeIR;
  const child=ir.creature.spellcasting!.find(group=>group.featureName==='Mind Invasion')!,restriction=child.usageGroups[0]!.spellRefs[0]!.restrictions[0]!;
  const parent=ir.creature.spellcasting!.find(group=>group.featureName==='Spellcasting')!;
  parent.usageGroups[0]!.spellRefs.find(ref=>ref.originalName==='Mind Spike')!.restrictions[0]!.value=3;
  restriction.value=3;
  for(const entry of [restriction,parent.usageGroups[0]!.spellRefs.find(ref=>ref.originalName==='Mind Spike')!.restrictions[0]!])entry.text=entry.text.slice(1,-1);
  expect(validateMonsterIntakeIR(source,ir).blocking).toEqual([]);
  restriction.value=4;
  expect(validateMonsterIntakeIR(source,ir).blocking.some(row=>row.code==='SPELL_REFERENCE_SOURCE_MISMATCH')).toBe(true);
});

localFrozenTest('unchanged 2024 Brass form clears all six former strict adapter false positives',()=>{
  const data=frozen('N3');
  expect(inspectCategoryFormV2(data.plan,data.base,data.decoded).flatMap(row=>row.error?[row.error]:[])).toEqual([]);
  const ir=completeCategoryFormSpellcasting(data.plan,assembleStagedMonsterIntake(data.plan,data.base,adaptCategoryFormV2(data.plan,data.base,data.decoded),{sourceProvenSelfArea:true}),data.decoded);
  expect(validateMonsterIntakeIR(data.source,ir).blocking).toEqual([]);
  const group=ir.creature.spellcasting!.find(g=>g.featureName==='Blazing Light')!;
  expect(group.ability).toBe('cha');expect(group.usageGroups[0]!.spellRefs[0]!.reuseOf).toBeDefined();
  expect(group.usageGroups[0]!.spellRefs[0]!.restrictions.some(r=>/level|环/u.test(r.text))).toBe(false);
  expect(data.paths.map(path=>createHash('sha256').update(readFileSync(path)).digest('hex'))).toEqual(data.hashes);
});
localFrozenTest('unchanged Cultist daily bonus spell inherits the same source profile and one independent two-use quota',()=>{
  const data=frozen('N2');
  expect(inspectCategoryFormV2(data.plan,data.base,data.decoded).flatMap(row=>row.error?[row.error]:[])).toEqual([]);
  const ir=completeCategoryFormSpellcasting(data.plan,assembleStagedMonsterIntake(data.plan,data.base,adaptCategoryFormV2(data.plan,data.base,data.decoded),{sourceProvenSelfArea:true}),data.decoded);
  const group=ir.creature.spellcasting!.find(g=>g.featureName==='Spiritual Weapon (2/Day)')!;
  expect(group).toBeDefined();expect(group.ability).toBe('wis');expect(group.saveDc).toBe(12);expect(group.attackBonus).toBe(4);expect(group.componentWaivers).toEqual([]);
  expect(group.activationType).toBe('bonus');expect(group.usageGroups).toHaveLength(1);expect(group.usageGroups[0]).toMatchObject({usage:'daily-each',count:2});
  expect(group.usageGroups[0]!.spellRefs[0]!.originalName).toBe('Spiritual Weapon');
  expect(validateMonsterIntakeIR(data.source,ir).blocking).toEqual([]);
  expect(data.paths.map(path=>createHash('sha256').update(readFileSync(path)).digest('hex'))).toEqual(data.hashes);
});

for(const name of ['Spiritual\nWeapon','Misty Step','Protection from Evil and Good'])test('daily named spell wrappers keep the exact original name span: '+name,()=>{
  const source=`Recovery (2/Day). The sentinel casts the ${name} spell, using the same spellcasting ability as\nRitual Lore.`;
  const parsed=sourceDailySpellAction(source)!;expect(parsed).toBeDefined();expect(parsed.parent).toBe('Ritual Lore');expect(parsed.count).toBe(2);
  expect(parsed.spells).toHaveLength(1);expect(source.slice(parsed.spells[0]!.start,parsed.spells[0]!.end)).toBe(name);expect(parsed.spells[0]!.name).toBe(name.replace(/\s+/gu,' '));
});
test('daily spell grammar does not turn an unknown trigger, wrong quota or generic spell into a grant',()=>{
  for(const source of [
    'Recovery (2/Week). The sentinel casts the Fireball spell, using the same spellcasting ability as Spellcasting.',
    'Recovery (2/Day). The sentinel casts a spell, using the same spellcasting ability as Spellcasting.',
    'Recovery (2/Day). If Bloodied, the sentinel casts the Fireball spell, using the same spellcasting ability as Spellcasting.',
    'Recovery (2/Day). The sentinel casts the Fireball spell if Bloodied, using the same spellcasting ability as Spellcasting.',
  ])expect(sourceDailySpellAction(source)).toBeUndefined();
});
for(const ability of ['Charisma','Wisdom','Intelligence'])test('a later named spell form restriction cannot qualify the parent '+ability+' profile',()=>{
  const source=`Spellcasting. The sentinel casts the following spells, using\n${ability} as the spellcasting ability (spell save DC 15):\nAt Will: Shapechange (Beast form only, no Temporary Hit Points gained from the spell), Detect Magic`;
  const fact=sourceSpellcastingAbility(source)!;expect(fact?.ability).toBe(({Charisma:'cha',Wisdom:'wis',Intelligence:'int'} as any)[ability]);
  expect(source.slice(fact.evidence.start,fact.evidence.end)).toBe(fact.evidence.quote);
  expect(assessSourceSpellcastingAbility(source,fact.ability,[fact.evidence],[{start:0,end:source.length,quote:source}])).toEqual({status:'supported'});
});
test('actual profile conditions and contrary attributes remain unconfirmed or contradicted',()=>{
  for(const text of [
    'Spellcasting. The sentinel casts the following spells, using Wisdom as the spellcasting ability only while Bloodied:\nAt Will: Detect Magic',
    'Spellcasting. The sentinel uses Wisdom as its spellcasting ability if it is in Beast form.\nAt Will: Detect Magic',
    'Spellcasting. The sentinel does not use Wisdom as its spellcasting ability.\nAt Will: Detect Magic',
  ])expect(sourceSpellcastingAbility(text)).toBeUndefined();
});
for(const phrase of ['three Hook attacks','two Strike attacks','one Bite attack'])test('optional Multiattack replacement is not an independent spell grant: '+phrase,()=>{
  const source=`Multiattack. The sentinel makes ${phrase}. It can replace one attack with a use of (A) Breath or (B) Spellcasting to cast Scorching Ray.`;
  expect(isSourceSpellcastingFeature(source)).toBe(false);
});
test('plain same-source spell references retain absent level instead of inventing one',()=>{
  const source='Bright Flash. The sentinel uses Ritual Lore to cast\nScorching Ray.';
  const reference=sourceReferencedSpellAction(source)!;expect(reference).toBeDefined();expect(reference.name).toBe('Scorching Ray');expect(reference.parent).toBe('ritual lore');expect(reference.level).toBeUndefined();
  expect(source.slice(reference.start,reference.end)).toBe('Scorching Ray');
  expect(sourceReferencedSpellAction('Bright Flash. The sentinel can replace an attack with Ritual Lore to cast Scorching Ray.')).toBeUndefined();
});
test('same ability inheritance does not borrow a parent Material waiver or another caster identity',()=>{
  const data=synthetic('Actions\nRitual Lore. The sentinel casts the following spells, requiring no Material components and using Wisdom as the spellcasting ability (spell save DC 12, +4 to hit with spell attacks):\nAt Will: Light\nBonus Actions\nMisty Step (2/Day). The sentinel casts the Misty Step spell, using the same spellcasting ability as Ritual Lore.');
  const group=stagedSpellcastingGroups(data.plan).get(data.plan.features[1]!.id)!;
  expect(group?.ability).toBe('wis');expect(group.saveDc).toBe(12);expect(group.attackBonus).toBe(4);expect(group.componentWaivers).toEqual([]);
  const bad=synthetic(data.source.slice(header.length).replace('Misty Step (2/Day). The sentinel casts','Misty Step (2/Day). The intruder casts'));
  expect(()=>stagedSpellcastingGroups(bad.plan)).toThrow('UNPROVEN_DAILY_SPELL_ACTION_OWNER');
});
for(const subject of ['the target',"the sentinel's familiar",'the allied sentinel'])test('matching external parent and child subjects do not establish the Actor owner: '+subject,()=>{
  const data=synthetic(`Actions\nRitual Lore. ${subject} casts the following spells, using Wisdom as the spellcasting ability:\nAt Will: Light\nBonus Actions\nMisty Step (2/Day). ${subject} casts the Misty Step spell, using the same spellcasting ability as Ritual Lore.`);
  expect(()=>stagedSpellcastingGroups(data.plan)).toThrow('UNPROVEN_DAILY_SPELL_ACTION_OWNER');
});
test('a shortened prefix requires independent source identity and no introduced external creature',()=>{
  for(const [name,subject]of [['Witch Initiate','the witch'],['Shaman Elder','the shaman'],['Cultist Fanatic','the cultist']]){
    const parent=`Ritual Lore. ${subject} casts the following spells, using Wisdom as the spellcasting ability:\nAt Will: Light`,child=`Misty Step (2/Day). ${subject} casts the Misty Step spell, using the same spellcasting ability as Ritual Lore.`,action=sourceDailySpellAction(child)!;
    expect(sourceDailySpellActionOwnerMatches(action,parent,[name!],name+'\nActions\n'+parent+'\nBonus Actions\n'+child)).toBe(true);
    expect(sourceDailySpellActionOwnerMatches(action,parent,['Different Actor'],name+'\n'+parent+'\n'+child)).toBe(false);
    expect(sourceDailySpellActionOwnerMatches(action,parent,[name!])).toBe(false);
  }
  const parent='Ritual Lore. The dragon casts the following spells, using Wisdom as the spellcasting ability:\nAt Will: Light',child='Misty Step (2/Day). The dragon casts the Misty Step spell, using the same spellcasting ability as Ritual Lore.';
  for(const introduction of ['The summoner summons a dragon.','The summoner summons another red dragon.',"The summoner's dragon appears."]){
    expect(sourceDailySpellActionOwnerMatches(sourceDailySpellAction(child)!,parent,['Dragon Summoner'],'Dragon Summoner\n'+introduction+'\n'+parent+'\n'+child)).toBe(false);
  }
});
for(const tail of ['This exemption does not apply to Fireball.','This benefit excludes Fireball.','This privilege is limited to harmless magic.'])test('an unknown complete later waiver qualifier cannot be dropped: '+tail,()=>{
  const data=synthetic(`Actions\nRitual Lore. The sentinel casts the following spells, requiring no Material components and using Wisdom as the spellcasting ability (spell save DC 12). ${tail}\nAt Will: Fireball`),groups=[...stagedSpellcastingGroups(data.plan).values()];
  expect(groups.flatMap(group=>group.usageGroups.flatMap(usage=>usage.spellRefs))).toEqual([]);expect(groups.flatMap(group=>group.componentWaivers)).toEqual([]);
  expect(groups[0]!.manualGrants![0]!.quote).toContain(tail);
});
test('only an exact redundant shared component atom is folded after every retained real grant has its obligation',()=>{
  const data=synthetic('Actions\nRitual Lore. The sentinel casts the following spells, requiring no spell components and using Wisdom as the spellcasting ability:\nAt Will: Light, Detect Magic'),group=[...stagedSpellcastingGroups(data.plan).values()][0]!,parent=group.evidence[0]!,quote='requiring no spell components',start=data.source.indexOf(quote),atom={start,end:start+quote.length,quote};
  group.componentWaivers=[];group.usageGroups.forEach(usage=>usage.spellRefs.forEach(spell=>{spell.restrictions=[];}));
  const unknown={start:parent.start,end:parent.start+data.plan.features[0]!.name!.length,quote:data.plan.features[0]!.name!};group.manualGrants=[atom,unknown];
  bindSourceGroupComponents(data.source,parent,group);expect(group.usageGroups.flatMap(usage=>usage.spellRefs)).toHaveLength(2);expect(group.manualGrants).toEqual([unknown]);
  expect(group.usageGroups.every(usage=>usage.spellRefs.every(spell=>spell.restrictions.some(rule=>rule.text===quote)))).toBe(true);
  const manual=structuredClone(group);manual.usageGroups=[];manual.componentWaivers=[];manual.manualGrants=[parent];bindSourceGroupComponents(data.source,parent,manual);expect(manual.manualGrants).toEqual([parent]);expect(manual.componentWaivers).toEqual([]);
});
for(const separator of ['\n',' ','\t'])test('spell-local DC and attack overrides never become the shared parent or daily child profile with separator '+JSON.stringify(separator),()=>{
  const data=synthetic(`Actions\nRitual Lore. The sentinel casts the following spells, using Wisdom as the spellcasting ability:${separator}At Will: Light (spell save DC 18, +9 to hit with spell attacks), Detect Magic\nBonus Actions\nCommand (2/Day). The sentinel casts the Command spell, using the same spellcasting ability as Ritual Lore.`);
  const ir=assembleStagedMonsterIntake(data.plan,data.base,data.plan.features.map(()=>({schemaVersion:1,mode:'manual',facts:{}}))),groups=ir.creature.spellcasting!;
  expect(groups).toHaveLength(2);expect(groups.every(group=>group.saveDc===undefined&&group.attackBonus===undefined)).toBe(true);expect(validateMonsterIntakeIR(data.source,ir).blocking).toEqual([]);
  const parent=groups[0]!.evidence[0]!,intro=sourceSpellcastingIntroduction(parent.quote,parent.start);expect(data.source.slice(intro.start,intro.end)).toBe(intro.quote);expect(intro.quote).not.toContain('At Will');
  for(const [field,evidenceField,quote,value] of [['saveDc','saveDcEvidence','spell save DC 18',18],['attackBonus','attackBonusEvidence','+9 to hit with spell attacks',9]] as const){
    for(const index of [0,1]){
      const bad:any=structuredClone(ir),start=data.source.indexOf(quote);bad.creature.spellcasting[index][field]=value;bad.creature.spellcasting[index][evidenceField]=[{start,end:start+quote.length,quote}];
      expect(validateMonsterIntakeIR(data.source,bad).blocking.some(finding=>finding.path===`/creature/spellcasting/${index}/${field}`),field+' '+index).toBe(true);
    }
  }
});
test('inline profile boundaries reuse the real grant-label grammar and ignore nested annotations',()=>{
  for(const label of ['At Will:','2/Day Each:','1st level (4 slots):','随意：']){
    const source=`Ritual Lore. Its spellcasting ability is Wisdom (spell save DC 12). ${label} Light (spell save DC 18).`,intro=sourceSpellcastingIntroduction(source,100);
    expect(intro.quote).toBe(source.slice(0,source.indexOf(label)));expect(intro.start).toBe(100);expect(intro.end).toBe(100+intro.quote.length);
    expect(intro.quote).toContain('spell save DC 12');expect(intro.quote).not.toContain('spell save DC 18');
  }
  const source='Ritual Lore. Its spellcasting ability is Wisdom (reference: At Will: Light) (spell save DC 12). At Will: Detect Magic (spell save DC 18).';
  expect(sourceSpellcastingIntroduction(source).quote).toBe(source.slice(0,source.lastIndexOf('At Will:')));
});

function errors(data:ReturnType<typeof synthetic>){return inspectCategoryFormV2(data.plan,data.base,data.decoded()).flatMap(entry=>entry.error?[entry.error]:[]);}
for(const type of ['近战攻击','远程攻击'])test('2024 target default accepts exactly one implicit recipient for '+type,()=>{
  const melee=type==='近战攻击',data=synthetic(`Actions\nStrike. ${melee?'Melee':'Ranged'} Attack Roll: +4, ${melee?'reach 5':'range 30'} ft. Hit: 5 (1d6 + 2) Piercing damage.`),row=data.form.动作![0]!;
  Object.assign(row,{攻击:{类型:type,命中加值:4,触及尺:melee?5:null,射程尺:melee?null:30,远射程尺:null,目标数量:1,目标限制:null},伤害:[{公式:'1d6+2',伤害类型:'piercing',生效条件:null,倍率:1,成功时倍率:null}]});
  expect(errors(data)).toEqual([]);
  const proposal=adaptCategoryFormV2(data.plan,data.base,data.decoded()) as any[];
  expect(proposal[0].facts.sourceOperations[0].targetSpecial).toBeUndefined();
  row.攻击.目标数量=2;expect(errors(data).map(e=>e.code)).toContain('V2_TARGET_UNPROVEN');
});
test('printed multiple recipients override the one-target default',()=>{
  const data=synthetic('Actions\nStrike. Ranged Attack Roll: +4, range 30 ft., 2 creatures. Hit: 5 (1d6 + 2) Piercing damage.'),row=data.form.动作![0]!;
  Object.assign(row,{攻击:{类型:'远程攻击',命中加值:4,触及尺:null,射程尺:30,远射程尺:null,目标数量:2,目标限制:'2 creatures'},伤害:[{公式:'1d6+2',伤害类型:'piercing',生效条件:null,倍率:1,成功时倍率:null}]});
  expect(errors(data)).toEqual([]);row.攻击.目标数量=1;expect(errors(data).map(e=>e.code)).toContain('V2_TARGET_COUNT');
});
for(const recovery of ['每天；在巢穴中为每天 4 次','每日（巢穴内每日4次）','daily (4/day in lair)'])test('equivalent conditional lair recovery retains base3/lair4: '+recovery,()=>{
  const data=synthetic('Traits\nLegendary Resistance (3/Day, or 4/Day in Lair). If the sentinel fails a saving throw, it can choose to succeed instead.\nLegendary Actions\nLegendary Action Uses: 3 (4 in Lair). Immediately after another creature’s turn, the sentinel can expend a use to take one of the following actions. The sentinel regains all expended uses at the start of each of its turns.\nObserve. The sentinel watches.'),row=data.form.特性![0]!;
  Object.assign(row,{使用次数:3,恢复方式:recovery,特殊规则:'If the sentinel fails a saving throw, it can choose to succeed instead.'});
  data.form.传奇动作![0]!.传奇动作消耗=1;
  expect(errors(data)).toEqual([]);row.使用次数=4;expect(errors(data).map(e=>e.code)).toContain('V2_USE_COUNT_CONFLICT');
  row.使用次数=3;row.恢复方式=recovery.replace('4','5');expect(errors(data).map(e=>e.code)).toContain('V2_RECOVERY_CONFLICT');
});
test('a conditional lair quota without a proved Actor ledger cannot become a flat daily Item quota',()=>{
  const data=synthetic('Traits\nLegendary Resistance (3/Day, or 4/Day in Lair). If the sentinel fails a saving throw, it can choose to succeed instead.'),row=data.form.特性![0]!;
  Object.assign(row,{使用次数:3,恢复方式:'每天',特殊规则:'If the sentinel fails a saving throw, it can choose to succeed instead.'});
  expect(errors(data).map(error=>error.code)).toContain('V2_USE_COUNT_CONFLICT');
});
for(const success of ['No damage; its Speed is not halved','无伤害；目标速度不减半','No damage; speed remains unchanged'])test('speed consequences cannot become success half damage: '+success,()=>{
  const data=synthetic('Actions\nSands. Dexterity Saving Throw: DC 12, one creature within 30 feet. Failure: 7 (2d6) Fire damage, and the target’s Speed is halved until the end of its next turn.'),row=data.form.动作![0]!;
  Object.assign(row,{豁免:{DC:12,属性:['dex'],成功结果:success,目标限制:'one creature within 30 feet'},伤害:[{公式:'2d6',伤害类型:'fire',生效条件:'failed save',倍率:1,成功时倍率:0}],距离:[{用途:'选择目标',尺:30,条件:null}]});
  expect(errors(data)).toEqual([]);row.伤害[0].成功时倍率=0.5;expect(errors(data).map(e=>e.code)).toContain('V2_SAVE_OUTCOME_CONFLICT');
});
test('balanced grant tokenization preserves exact nested commas/newlines and rejects a forged manual span',()=>{
  const text='At Will: Light, Alter Self (Beast form only, no Temporary\nHit Points gained from the spell), Detect Magic';
  const tokens=sourceSpellGrantTokens(text.slice(9),9)!;expect(tokens).toHaveLength(3);
  for(const token of tokens)expect(text.slice(token.start,token.end)).toBe(token.quote);
  const parent={start:100,end:100+text.length,quote:text},manual={...tokens[1]!,start:100+tokens[1]!.start,end:100+tokens[1]!.end};
  expect(sourceManualSpellGrant(parent,manual)).toMatchObject({name:'Alter Self',usage:'at-will'});
  expect(sourceManualSpellGrant(parent,{...manual,start:manual.start+1})).toBeUndefined();
  expect(sourceSpellGrantTokens('Light, Alter Self (Beast, Humanoid')).toBeUndefined();
});
test('malformed token evidence and envelopes fail closed without dereferencing null',()=>{
  const valid={start:0,end:14,quote:'At Will: Light'};
  for(const bad of [null,undefined,{}, {start:0,end:14,quote:null},{start:0,end:14,quote:'Light'}]){
    expect(()=>sourceManualSpellGrant(bad as any,valid)).not.toThrow();expect(sourceManualSpellGrant(bad as any,valid)).toBeUndefined();
    expect(()=>sourceManualSpellGrant(valid,bad as any)).not.toThrow();expect(sourceManualSpellGrant(valid,bad as any)).toBeUndefined();
  }
});
localFrozenTest('translated manual form restrictions and repeated daily cadence remain strictly checked against their source facts',()=>{
  const data=frozen('N3'),original=JSON.stringify(data.decoded);
  for(const [label,mutate]of [
    ['different form',(rows:any[])=>{rows.find(row=>row.施法).施法.法术.find((spell:any)=>spell.名称==='Shapechange').限制='仅限龙或类人形态；不会从该法术获得临时生命值，且维持该法术不需要专注或临时生命值';}],
    ['positive temporary hp',(rows:any[])=>{rows.find(row=>row.施法).施法.法术.find((spell:any)=>spell.名称==='Shapechange').限制='仅限野兽或类人形态；会从该法术获得临时生命值，且维持该法术不需要专注或临时生命值';}],
    ['daily repetition conflict',(rows:any[])=>{rows.find(row=>row.施法).施法.法术.find((spell:any)=>spell.名称==='Detect Thoughts').限制='每个法术每天各2次';}],
  ] as const){
    const decoded=JSON.parse(original);mutate(decoded.rows);
    expect(inspectCategoryFormV2(data.plan,data.base,decoded).some(entry=>entry.error?.code==='V2_SPELLCASTING_RESTRICTION_CONFLICT'),label).toBe(true);
  }
  expect(JSON.stringify(data.decoded)).toBe(original);
});
