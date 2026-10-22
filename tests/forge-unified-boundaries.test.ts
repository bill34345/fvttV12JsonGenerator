import {test,expect} from 'bun:test';
import yaml from 'js-yaml';
import {sha256} from '@fvtt-json-generator/contracts/hash';
import {splitStagedMonsterSource} from '@fvtt-json-generator/intake-ai/staged-source';
import {assembleStagedMonsterIntake,validateStagedBaseFacts} from '@fvtt-json-generator/intake-ai/staged-extraction';
import {makeWholeCategoryForm,decodeCategoryFormV2} from '../packages/intake-ai/src/category-form-v2';
import {adaptCategoryFormV2,completeCategoryFormSpellcasting} from '../packages/intake-ai/src/category-form-v2-adapter';
import {sourceGroupComponentClause,stagedSpellcastingGroups} from '../packages/intake-ai/src/staged-spellcasting';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {YamlParser} from '@fvtt-json-generator/parser/yaml';
import {ActorGenerator} from '@fvtt-json-generator/generation/actor';
import {hashManifest,validatePortableSpellManifestStructure} from '@fvtt-json-generator/spell-manifest-contracts';
import {buildCastActivitySource} from '../foundry-modules/monster-spell-resolver/src/cast-activity';
import {readFixedEncounterConfiguration} from '@fvtt-json-generator/intake-ai/encounter-capabilities';
import {planVampire2024,authorVampire2024Form,vampire2024BaseFacts,runVampire2024FormalChain} from './helpers/vampire-2024-contract';

function fixture(body:string,crlf=false){
  const source=('Proof Beast\nMedium beast, unaligned\nArmor Class 14\nHit Points 30 (4d8 + 12)\nSpeed 30 ft.\nSTR DEX CON INT WIS CHA\n10 10 16 10 10 10\nChallenge 2\n'+body+'\n').replace(/\n/gu,crlf?'\r\n':'\n');
  const plan=splitStagedMonsterSource({source,sourceSha256:sha256(source),candidate:{id:'proof',label:'Proof Beast',start:0,end:source.length,quote:source}});
  const base=validateStagedBaseFacts(plan,{schemaVersion:1,creature:{identity:{name:'Proof Beast',size:'medium',creatureType:'beast',alignment:'unaligned'},abilities:{str:10,dex:10,con:16,int:10,wis:10,cha:10},attributes:{ac:14,hp:{value:30,formula:'4d8+12'},movement:{walk:30},cr:2},saves:{},skills:{},defenses:{resistances:[],immunities:[],vulnerabilities:[],conditionImmunities:[]},senses:{},languages:{values:[]}},uncertainties:[]});
  const form=yaml.load(String(makeWholeCategoryForm(plan).payload.template)) as Record<string,any[]>;
  const rows=Object.values(form).flat();for(const row of rows)row.特殊规则=plan.features.find(unit=>unit.id===row.编号)!.quote;
  return{source,plan,base,form,rows};
}
function assemble(data:ReturnType<typeof fixture>){
  const decoded=decodeCategoryFormV2({markdown:yaml.dump(data.form,{lineWidth:-1})},data.plan);
  return completeCategoryFormSpellcasting(data.plan,assembleStagedMonsterIntake(data.plan,data.base,adaptCategoryFormV2(data.plan,data.base,decoded)),decoded);
}
function generated(data:ReturnType<typeof fixture>){
  const ir=assemble(data),validation=validateMonsterIntakeIR(data.source,ir);
  expect(validation.findings.filter(finding=>finding.blocking)).toEqual([]);
  const markdown=renderMonsterIntakeMarkdown(ir),actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core',translationService:null}).generate(new YamlParser().parse(markdown));
  expect(verifyMonsterIntake(data.source,ir,markdown,actor).findings).toEqual([]);
  return{ir,markdown,actor};
}
const activities=(item:any):any[]=>Object.values(item.system.activities);
const attack={类型:'近战武器攻击',命中加值:4,触及尺:5,射程尺:null,远射程尺:null,目标数量:1,目标限制:'one creature'};
const damage={公式:'1d6+2',伤害类型:'piercing',生效条件:null,倍率:1,成功时倍率:null};

for(const crlf of [false,true])test('complete delayed recovery stays GM while independent native attack remains: '+crlf,()=>{
  const data=fixture('Actions\nNeedle. Melee Weapon Attack: +4 to hit, reach 5 ft., one creature. Hit: 5 (1d6 + 2) piercing damage. The beast regains 2 Hit Points after spending 1 hour there.',crlf);
  Object.assign(data.rows[0]!,{攻击:attack,伤害:[damage],治疗:[{公式:'2',取值依据:null,类型:'治疗',目标:'self',生效条件:'after spending 1 hour there'}]});
  const before=JSON.stringify(data.form),{ir,actor}=generated(data),feature=ir.creature.actions[0]!,item=actor.items[0];
  expect(feature.executionMode).toBe('native-with-gm');expect(feature.description).toBe(data.plan.features[0]!.quote.trim());
  expect(activities(item).map(activity=>activity.type)).toEqual(['attack']);expect(item.type).toBe('feat');
  expect(activities(item)[0].target.affects).toMatchObject({count:'1',type:'creature',special:'one creature'});
  expect(item.effects).toEqual([]);expect(JSON.stringify(data.form)).toBe(before);
  for(const value of ['3','1d8']){data.rows[0]!.治疗[0].公式=value;expect(()=>assemble(data)).toThrow();}
});

test('existing fixed self healing remains Heal, and unknown delayed timing stays whole GM',()=>{
  const native=fixture('Traits\nRecovery. The beast regains 8 Hit Points.');
  native.rows[0]!.治疗=[{公式:'8',取值依据:null,类型:'治疗',目标:'self',生效条件:null}];
  const nativeResult=generated(native);expect(activities(nativeResult.actor.items[0]).map(activity=>activity.type)).toEqual(['heal']);
  const delayed=fixture('Traits\nRecovery. Once in its den, it is asleep until it regains any Hit Points, and it regains 1 Hit Point after spending 2 hours there.');
  delayed.rows[0]!.治疗=[{公式:'1',取值依据:null,类型:'治疗',目标:'self',生效条件:'after spending 2 hours there'}];
  const manual=generated(delayed);expect(manual.ir.creature.traits[0]!.executionMode).toBe('gm-manual');
  expect(activities(manual.actor.items[0]).map(activity=>activity.type)).toEqual(['utility']);expect(manual.actor.items[0].effects).toEqual([]);
});

test('modern Save preserves one complete eligible recipient and actual-damage recovery is never a Heal',()=>{
  const plan=planVampire2024().plan,base=validateStagedBaseFacts(plan,vampire2024BaseFacts),authored=authorVampire2024Form(plan),decoded=decodeCategoryFormV2(authored.reply,plan);
  const ir=completeCategoryFormSpellcasting(plan,assembleStagedMonsterIntake(plan,base,adaptCategoryFormV2(plan,base,decoded)),decoded);
  const markdown=renderMonsterIntakeMarkdown(ir),actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core',translationService:null}).generate(new YamlParser().parse(markdown));
  expect(verifyMonsterIntake(plan.source,ir,markdown,actor).findings).toEqual([]);
  const bite=actor.items.find((item:any)=>item.name==='Bite (Bat or Vampire Form Only)'),save=activities(bite)[0];
  expect(save.type).toBe('save');expect(save.save).toEqual({ability:['con'],dc:{calculation:'',formula:'17'}});
  expect(save.target.affects.count).toBe('1');expect(save.target.affects.special).toContain('willing or that has the Grappled, Incapacitated, or Restrained condition');
  expect(activities(bite).some(activity=>activity.type==='heal')).toBe(false);expect(bite.effects).toEqual([]);
  const row=(Object.values(authored.form).flat() as any[]).find(row=>row.名称==='Bite (Bat or Vampire Form Only)');
  const initial=structuredClone(row);
  for(const mutate of [(row:any)=>{row.豁免.目标限制=null;},(row:any)=>{row.豁免.DC=18;},(row:any)=>{row.伤害=[];},(row:any)=>{row.治疗[0].目标='the target';},(row:any)=>{row.治疗[0].取值依据='等于目标实际受到的穿刺伤害量';},(row:any)=>{row.治疗[0].取值依据='等于目标实际受到的黯蚀伤害量的一半';},(row:any)=>{row.治疗[0].生效条件='[unit-8]目标受到死灵伤害时';}]){
    Object.assign(row,structuredClone(initial));mutate(row);expect(()=>adaptCategoryFormV2(plan,base,decodeCategoryFormV2({markdown:yaml.dump(authored.form,{lineWidth:-1})},plan))).toThrow();
  }
  const changed=structuredClone(actor);activities(changed.items.find((item:any)=>item.name===bite.name))[0].target.affects.count='';
  expect(verifyMonsterIntake(plan.source,ir,markdown,changed).findings.some(finding=>finding.code==='ACTOR_SOURCE_OPERATION_TARGET_DRIFT')).toBe(true);
});

for(const [section,name,body,cost,recharge] of [
  ['Actions','Call','The beast casts Command, using Charisma as the spellcasting ability (spell save DC 12).',undefined,undefined],
  ['Bonus Actions','Veil (Recharge 4–6)','The beast casts Invisibility, requiring no spell components and using Charisma as the spellcasting ability (spell save DC 12), and the duration is 2 minutes.',undefined,[4,6]],
  ['Legendary Actions','Compel (Costs 2 Actions)','The beast casts Command, requiring no spell components and using Charisma as the spellcasting ability (spell save DC 12). The beast can’t take this action again until the start of its next turn.',2,undefined],
] as const)test('source Cast retains ordinary, Recharge and legendary ownership: '+name,()=>{
  const context=section==='Legendary Actions'?'The beast can take three legendary actions, choosing from the options below. Only one action can be used at the end of another creature’s turn. The beast regains all expended legendary actions at the start of each of its turns.\n':'';
  const data=fixture(section+'\n'+context+name+'. '+body),row=data.rows[0]!;
  Object.assign(row,{使用次数:recharge?1:null,恢复方式:recharge?'Recharge 4-6':null,传奇动作消耗:cost??null,共享资源:cost?{名称:'legendary actions',上限:3,恢复:'at the start of its turns',限制:'one action at the end of another creature turn'}:null,
    施法:{属性:'cha',豁免DC:12,命中加值:null,无需材料:recharge||cost?true:false,法术:[{名称:recharge?'Invisibility':'Command',次数:null,恢复:null,限制:recharge?'duration is 2 minutes':null}]}});
  const {ir,actor}=generated(data),manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest,group=manifest.spellcastingGroups[0],ref=group.spellRefs[0],item=actor.items[0];
  const activationType=section==='Actions'?'action':section==='Bonus Actions'?'bonus':'legendary';
  const built=buildCastActivitySource({manifestId:manifest.manifestId,featureId:'SourceFeature001',group,ref,selectedUuid:'Compendium.dnd5e.spells24.Item.abcdefghijklmnop',activationType,...(cost?{activationCost:cost}:{})});
  expect(built.activity.type).toBe('cast');expect(built.activity.activation).toEqual(activationType==='action'?undefined:{type:activationType,value:cost??1,override:true});
  expect(built.activity.spell.challenge.save).toBe('12');expect(activities(item)[0].activation.type).toBe('');expect(activities(item)[0].consumption.targets).toEqual([]);
  if(recharge){expect(built.activity.consumption.targets).toEqual([{type:'itemUses',value:'1'}]);expect(built.activity.uses).toBeUndefined();expect(built.activity.duration).toEqual({value:'2',units:'minute',concentration:false,override:true});expect(built.activity.spell.properties).toEqual(['vocal','somatic','material']);}
  if(cost){expect(built.activity.consumption.targets).toEqual([]);expect(built.activity.description?.chatFlavor).toContain('can’t take this action again');const altered=structuredClone(ir);altered.creature.spellcasting![0]!.legendaryCost=1;expect(validateMonsterIntakeIR(data.source,altered).findings.some(finding=>finding.code==='SPELL_LEGENDARY_COST_SOURCE_MISMATCH')).toBe(true);}
});

for(const tail of ['; this waiver applies only while in mist form.','. This waiver applies only while in mist form.','; except while in sunlight.','. The spell requires components if the beast is injured.'])test('a later waiver qualifier remains wholly GM: '+tail,()=>{
  const body='Charm. The beast casts Charm Person, requiring no spell components and using Charisma as the spellcasting ability (spell save DC 12)'+tail;
  const data=fixture('Actions\n'+body),group=[...stagedSpellcastingGroups(data.plan).values()][0]!;
  expect(sourceGroupComponentClause(group.evidence[0]!,group)?.ambiguous).toBe(true);expect(group.usageGroups).toEqual([]);
  data.rows[0]!.施法={属性:'cha',豁免DC:12,命中加值:null,无需材料:true,法术:[{名称:'Charm Person',次数:null,恢复:null,限制:null}]};
  const {ir,actor}=generated(data);expect(ir.creature.spellcasting![0]!.manualGrants![0]!.quote).toBe(data.plan.features[0]!.quote);
  expect(actor.flags['fvtt-json-generator-spell-resolver']).toBeUndefined();expect(activities(actor.items[0]).map(activity=>activity.type)).toEqual(['utility']);
});

test('unsupported Recharge upper bounds stay complete manual and malformed portable cooldowns stay rejected',()=>{
  const data=fixture('Bonus Actions\nVeil (Recharge 4–5). The beast casts Invisibility, using Charisma as the spellcasting ability (spell save DC 12).');
  Object.assign(data.rows[0]!,{使用次数:1,恢复方式:'Recharge 4-5',施法:{属性:'cha',豁免DC:12,命中加值:null,无需材料:false,法术:[{名称:'Invisibility',次数:null,恢复:null,限制:null}]}});
  const {actor}=generated(data);expect(actor.items[0].system.uses).toBeUndefined();expect(actor.flags['fvtt-json-generator-spell-resolver']).toBeUndefined();
  const native=fixture('Actions\nCall. The beast casts Command, using Charisma as the spellcasting ability (spell save DC 12).');
  native.rows[0]!.施法={属性:'cha',豁免DC:12,命中加值:null,无需材料:false,法术:[{名称:'Command',次数:null,恢复:null,限制:null}]};
  const manifest=generated(native).actor.flags['fvtt-json-generator-spell-resolver'].spellManifest,originalHash=hashManifest(manifest);
  manifest.spellcastingGroups[0].recharge=[5,6];expect(validatePortableSpellManifestStructure(manifest).ok).toBe(true);expect(hashManifest(manifest)).not.toBe(originalHash);
  for(const value of [[4,5],[0,6],[6,5],[5,6,6],'5-6']){manifest.spellcastingGroups[0].recharge=value;expect(validatePortableSpellManifestStructure(manifest).ok).toBe(false);}
});

test('same 2024 source compiles an owned recovery controller, complete3/4 resources, and strict final readback',async()=>{
  const run=await runVampire2024FormalChain();expect(run.result.report.findings).toEqual([]);expect(run.result.report.status).toBe('ready_for_gm_review');
  expect(run.modelHttp).toBe(0);expect(run.requests).toHaveLength(3);expect(run.unexpectedRequests).toEqual([]);
  const prepared=run.result.prepared!,actor:any=prepared.actors[0]!.artifact,ir=run.result.report.actors[0]!.analysis.ir!,markdown=run.result.report.actors[0]!.generation!.markdown!;
  expect(actor.system.resources.legact.max).toBe(3);expect(actor.system.resources.legres.max).toBe(3);expect(actor.system.resources.lair).toMatchObject({value:true,inside:false});
  expect(actor.flags.fvttJsonGenerator.sourceLegendaryLedger).toEqual({version:1,max:3,lairMax:4,recovery:'own-turn-start',resistanceMax:3,resistanceLairMax:4});
  expect(prepared.bundle.macros).toHaveLength(1);expect(prepared.bundle.macros[0]!.command).toContain('legendaryRecovery');expect(readFixedEncounterConfiguration(prepared.bundle.macros[0]!.command)!.legendaryRecovery).toEqual([{actorKey:'actor-1',max:3,when:'own-turn-start'}]);
  for(const mutate of [(actor:any)=>{actor.system.resources.legact.max=4;},(actor:any)=>{actor.system.resources.lair.value=false;},(actor:any)=>{actor.system.resources.legres.max=0;},(actor:any)=>{delete actor.flags.fvttJsonGenerator.sourceLegendaryLedger;}]){const changed=structuredClone(actor);mutate(changed);expect(verifyMonsterIntake(run.plan.source,ir,markdown,changed).findings.length).toBeGreaterThan(0);}
  const changed=structuredClone(ir);changed.creature.legendary!.lairMax=5;expect(validateMonsterIntakeIR(run.plan.source,changed).findings.some(finding=>finding.blocking)).toBe(true);
  const altered=yaml.load(markdown.slice(4,markdown.lastIndexOf('\n---'))) as any;altered['intake-legendary-ledger'].max=4;expect(()=>new YamlParser().parse('---\n'+yaml.dump(altered)+'---\n')).toThrow('InvalidSourceLegendaryLedger');
});
