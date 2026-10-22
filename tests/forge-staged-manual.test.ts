import {describe,test,expect} from 'bun:test';
import yaml from 'js-yaml';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import type {MonsterIntakeIR} from '@fvtt-json-generator/intake-ai/types';
import {normalizeMonsterSourceFacts} from '@fvtt-json-generator/intake-ai/source-facts';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {normalizeDiscovery} from '@fvtt-json-generator/intake-ai/discovery';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {prepareForgeEncounter} from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import {serializeForgeEncounterPackage} from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import {createActorLocalizationRequest} from '@fvtt-json-generator/generation/reviewed-localization';
import {FACT_LOCALIZATION_POLICY} from '@fvtt-json-generator/contracts/localization';
import {draftForgeEncounterLocalization,approveForgeEncounterLocalization} from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';
import {YamlParser} from '@fvtt-json-generator/parser/yaml';
import {ActorGenerator} from '@fvtt-json-generator/generation/actor';
import literalRules from './fixtures/forge-manual-literal-rules.json';
import {bindSourceOperations,sourceOperationClauses} from '@fvtt-json-generator/models/source-operations';

const sections=['traits','actions','bonusActions','reactions','legendaryActions','mythicActions'] as const;
const forbidden=async():Promise<never>=>{throw new Error('Offline full-chain regression forbids AI, repair and automation requests');};
function fixture(rule:string,split=false){
  const base='Proof Beast CR 2\nMedium beast, unaligned\nArmor Class 14\nHit Points 30 (4d8+12)\nSpeed 30 ft.\nSTR DEX CON INT WIS CHA\n10 10 16 10 10 10\nChallenge 2\nActions\n';
  const source=base+rule+'\n';
  const ref={start:base.length,end:source.length,quote:source.slice(base.length)};
  const name=rule.split('.')[0]!;
  const ir:MonsterIntakeIR={schemaVersion:1,source:{sha256:hashSource(source),length:source.length},
    creature:{identity:{name:'Proof Beast',size:'medium',creatureType:'beast',alignment:'unaligned'},
      abilities:{str:10,dex:10,con:16,int:10,wis:10,cha:10},attributes:{ac:14,hp:{value:30,formula:'4d8+12'},movement:{walk:30},cr:2},
      saves:{},skills:{},defenses:{resistances:[],immunities:[],vulnerabilities:[],conditionImmunities:[]},senses:{},languages:{values:[]},
      traits:[],actions:[{name,description:rule,activityType:'utility',executionMode:'gm-manual',evidence:[ref]}],bonusActions:[],reactions:[],legendaryActions:[]},
    claims:[],coverage:[],uncertainties:[]};
  const paths=['/creature/identity/name','/creature/identity/size','/creature/identity/creatureType','/creature/identity/alignment','/creature/abilities','/creature/attributes/ac','/creature/attributes/hp','/creature/attributes/movement','/creature/attributes/cr'];
  const header={start:0,end:base.length,quote:base};
  ir.claims=paths.map(path=>({path,valueKind:'explicit',confidence:'high',evidence:[header]}));
  ir.claims.push({path:'/creature/actions/0',valueKind:'preserved-literal',confidence:'high',evidence:[ref]});
  ir.coverage=[{...header,classification:'mechanical',claimPaths:paths}];
  const cut=split?ref.start+rule.indexOf('\n')+1:ref.end;
  ir.coverage.push({start:ref.start,end:cut,quote:source.slice(ref.start,cut),classification:'mechanical',claimPaths:['/creature/actions/0']});
  if(split)ir.coverage.push({start:cut,end:ref.end,quote:source.slice(cut,ref.end),classification:'mechanical',claimPaths:['/creature/actions/0']});
  return {source,ir};
}
async function run(data:ReturnType<typeof fixture>){
  let calls=0;const stop=async():Promise<never>=>{calls++;return forbidden();};
  const result=await generateEncounterFromHumanMarkdown({source:data.source,label:'Offline manual rule',reviewPolicy:'deferred',outputLanguage:'source',
    drafts:[{key:'actor-1',...data}],draftParentHash:hashSource(JSON.stringify(data.ir)),
    provider:{providerName:'offline',extractionModel:'disabled',reviewModel:'disabled',discover:stop,extract:stop,repair:stop,review:stop},
    automationProvider:{generate:stop,review:stop}});
  return {result,calls};
}
describe('complete manual rules reach the formal Actor without native inference',()=>{
  for(const variant of ['It can keep solid food down only if washed down with sea water.',
    'It can keep solid food\ndown only if washed down with sea water.',
    'It can keep solid food down only if\r\nwashed down with sea water.'])
    test('literal biography retains the closed display-only food fact: '+JSON.stringify(variant),()=>{
      const input=fixture('Watchful. The creature remains alert.');input.ir.creature.biography=variant;
      const parsed=new YamlParser().parse(renderMonsterIntakeMarkdown(input.ir));
      expect(parsed.biographyMode).toBe('literal');
      expect(parsed.biographyRuleFacts?.map(fact=>fact.kind)).toEqual(['food-retention']);
      const actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core',translationService:null}).generate(parsed);
      expect(actor.items).toHaveLength(1);expect(actor.effects).toEqual([]);
      expect(actor.items[0].name).toBe('Watchful');expect(actor.items[0].effects).toEqual([]);
    });
  test('literal biography still cannot infer other rules or bless a different food-retention liquid',()=>{
    const input=fixture('Watchful. The creature remains alert.');input.ir.creature.biography='It can keep solid food down only if washed down with fresh water.\nEye Ray. One target takes 5 psychic damage.';
    const parsed=new YamlParser().parse(renderMonsterIntakeMarkdown(input.ir));
    expect(parsed.biographyRuleFacts).toBeUndefined();
    const actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core',translationService:null}).generate(parsed);
    expect(actor.items).toHaveLength(1);expect(actor.effects).toEqual([]);
  });
  for(const {rule} of literalRules)for(const lineEnding of ['LF','CRLF'] as const)
    test(rule.split('.')[0]+' preserves literal prose with '+lineEnding,async()=>{
      const literal=lineEnding==='CRLF'?rule.replace(/\n/gu,'\r\n'):rule;
      const data=fixture(literal),native=rule===literalRules[0]!.rule;
      if(native){
        const feature=data.ir.creature.actions[0]!,clauses=sourceOperationClauses(literal);
        feature.executionMode='native-with-gm';feature.nativeRuleText=literal;feature.manualRemainder=literal;
        const supplied={id:'attack',name:'Attack',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:7,reach:5},damage:[{formula:'1d6+5',type:'slashing',relationship:'base'}],proof:{attack:clauses[1],damage:[clauses.find(clause=>clause.includes('Hit:'))!]}};
        // This authored fixture's modern header never classified the attack.
        // Keep rejection of its old guessed type, then exercise the explicit
        // new contract with the very same immutable source and literal values.
        expect(()=>bindSourceOperations(literal,[supplied])).toThrow('attack/type-or-bonus');
        feature.sourceOperations=bindSourceOperations(literal,[{...supplied,attack:{...supplied.attack,type:'melee'}}],feature.evidence![0]!.start);
      }
      const {result,calls}=await run(data);
      expect(result.report.findings).toEqual([]);expect(calls).toBe(0);
      const reloaded=await prepareForgeEncounter(serializeForgeEncounterPackage(result.prepared!.bundle));
      const actor=reloaded.actors[0]!.artifact as any,item=actor.items[0];
      const encoded=literal.replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;')
        .replace(/"/gu,'&quot;').replace(/'/gu,'&#39;').replace(/\r\n|\n/gu,'<br>');
      expect(item.system.description.value).toContain(encoded);
      expect(item.flags.fvttJsonGenerator.manualRule.sourceText).toBe(literal);
      expect(item.system.description.value).not.toContain('<b>');
      expect(item.effects).toEqual([]);
      const activity=Object.values(item.system.activities)[0] as any;
      expect(activity.description.chatFlavor).toContain(encoded);
      expect(Object.keys(item.system.activities)).toHaveLength(native?2:1);expect(activity.type).toBe('utility');
      if(native){expect(activity.attack).toBeUndefined();expect(activity.roll.formula).toBe('1d20+7');const damage=Object.values<any>(item.system.activities).find(a=>a.type==='damage')!;expect(damage.damage.parts[0]).toMatchObject({number:1,denomination:6,bonus:'5'});expect(damage.consumption.targets).toEqual([]);}
      else for(const key of ['attack','save','damage'])expect(activity[key]).toBeUndefined();
      expect(activity.effects??[]).toEqual([]);expect(activity.consumption?.targets??[]).toEqual([]);
      const markdown=renderMonsterIntakeMarkdown(data.ir);
      expect(verifyMonsterIntake(data.source,data.ir,markdown,actor).findings).toEqual([]);
      for(const mutate of [
        (text:string)=>text.replace('+ 5','- 5').replace('- 1','+ 1').replace('this sign','a sign'),
        (text:string)=>text.replace('+ 5','5').replace('- 1','1').replace('&lt;b&gt;','').replace('&lt;/b&gt;',''),
      ]){
        const tampered=structuredClone(actor);
        tampered.items[0].system.description.value=mutate(tampered.items[0].system.description.value);
        const altered=Object.values(tampered.items[0].system.activities)[0] as any;
        altered.description.chatFlavor=mutate(altered.description.chatFlavor);
        expect(verifyMonsterIntake(data.source,data.ir,markdown,tampered).findings.some(f=>f.code==='ACTOR_MANUAL_RULE_LOSS'||f.code==='ACTOR_SOURCE_OPERATION_RULE_LOSS')).toBe(true);
      }
      const badMarker=structuredClone(actor);badMarker.items[0].flags.fvttJsonGenerator.manualRule.sourceText=literal+' ';
      expect(verifyMonsterIntake(data.source,data.ir,markdown,badMarker).findings.some(f=>f.code==='ACTOR_MANUAL_RULE_LOSS'||f.code==='ACTOR_SOURCE_OPERATION_RULE_LOSS')).toBe(true);
      if(rule.includes('<b>')){
        const equivalent=structuredClone(actor),numeric=(text:string)=>text.replaceAll('&lt;b&gt;','&#60;b&#62;').replaceAll('&lt;/b&gt;','&#x3c;/b&#x3e;');
        equivalent.items[0].system.description.value=numeric(equivalent.items[0].system.description.value);
        (Object.values(equivalent.items[0].system.activities)[0] as any).description.chatFlavor=numeric(activity.description.chatFlavor);
        expect(verifyMonsterIntake(data.source,data.ir,markdown,equivalent).findings).toEqual([]);
        for(const mutate of [
          (text:string)=>text.replaceAll('&lt;b&gt;','<b>').replaceAll('&lt;/b&gt;','</b>'),
          (text:string)=>text.replace('&amp;lt;stay&amp;gt;','&lt;stay&gt;'),
          (text:string)=>text.replace('&lt;b&gt;','&Lt;b&gt;'),
        ]){
          const escapedLoss=structuredClone(actor);
          escapedLoss.items[0].system.description.value=mutate(escapedLoss.items[0].system.description.value);
          (Object.values(escapedLoss.items[0].system.activities)[0] as any).description.chatFlavor=mutate(activity.description.chatFlavor);
          expect(verifyMonsterIntake(data.source,data.ir,markdown,escapedLoss).findings.some(f=>f.code==='ACTOR_MANUAL_RULE_LOSS')).toBe(true);
        }
      }
    });

  test('canonical narrative keeps complete Lore and Treasure with exactly the eight explicit abilities',()=>{
    const data=fixture('Explicit Rule. Keep the complete rule.');
    const biography='Lore\nArcana/Nature (Uncommon): The beast gives allies + 2 to a check.\nNature/Religion (Rare): The beast cannot be Frightened.\nTreasure\nCarrying. Tokens of Friendship\nHarvest. Glittering Pelt & <Golden Ruff>\nHoard. Rainbow Nest-Feathers';
    data.ir.creature.biography=biography;
    const names=['Scent','Poor Flyer','Multiattack','Taloned Paws','Glimmerlight Gaze','Noble Howl','Smite Evil','Prismatic Flash'];
    const abilities=names.map(name=>({...data.ir.creature.actions[0]!,name,description:name+'. Keep the complete rule.'}));
    data.ir.creature.traits=abilities.slice(0,2);data.ir.creature.actions=abilities.slice(2,6);data.ir.creature.bonusActions=abilities.slice(6);
    const markdown=renderMonsterIntakeMarkdown(data.ir),parsed=new YamlParser().parse(markdown);
    expect(parsed.biographyMode).toBe('literal');expect(parsed.biographyRuleFacts).toBeUndefined();
    const actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(parsed);
    expect(actor.items.map((item:any)=>item.name)).toEqual(names);expect(actor.items).toHaveLength(8);
    expect(actor.system.details.biography.value).toContain(biography.replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;').replace(/\n/gu,'<br>'));
    expect(actor.effects).toEqual([]);expect(actor.items.every((item:any)=>item.effects.length===0)).toBe(true);
    const legacyDocument=yaml.load(markdown.slice(4,-4)) as Record<string,unknown>;
    delete legacyDocument['intake-biography-mode'];delete legacyDocument['intake-biography-presentation'];
    const legacy=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(new YamlParser().parse(yaml.dump(legacyDocument)));
    expect(legacy.items.map((item:any)=>item.name)).toContain('Arcana/Nature (Uncommon)');
    expect(legacy.items.some((item:any)=>item.name.startsWith('Nature/Religion (Rare)'))).toBe(true);
    expect(legacy.items).toHaveLength(10);
  });
  for(const rule of [
    'Conditional Pulse. Whenever the target attacks, it can choose to fail and end this effect. If it does not, it takes 10 (3d6) Psychic damage.',
    'Armour Rend. One grappled creature takes 9 (2d8) Slashing damage, or half as much if it is wearing Heavy Armor.',
    'Delayed Frost. The target is Restrained until its next turn. At the end of its turn, it must make a DC 15 Constitution saving throw or be pushed 25 feet.',
  ])test(rule.split('.')[0]+' survives package regeneration and translation request',async()=>{
    const data=fixture(rule);normalizeMonsterSourceFacts(data.ir,data.source,{start:0,end:data.source.length});
    const native=rule.startsWith('Delayed Frost.');
    if(native){
      const feature=data.ir.creature.actions[0]!,clauses=sourceOperationClauses(rule);
      feature.executionMode='native-with-gm';feature.nativeRuleText=rule;feature.manualRemainder=rule;
      feature.sourceOperations=bindSourceOperations(rule,[{id:'delayed-save',name:'Turn-end Save (GM)',type:'save',relationship:'follow-up',save:{dc:15,abilities:['con'],choice:'single',outcome:'none'},proof:{save:clauses[2]}}],feature.evidence![0]!.start);
    }
    expect(validateMonsterIntakeIR(data.source,data.ir).blocking).toEqual([]);
    const {result,calls}=await run(data);
    expect(result.report.findings).toEqual([]);expect(result.report.status).toBe('ready_for_gm_review');expect(calls).toBe(0);
    expect(result.prepared!.bundle.macros).toEqual([]);
    const reloaded=await prepareForgeEncounter(serializeForgeEncounterPackage(result.prepared!.bundle));
    expect(reloaded.hash).toBe(result.prepared!.hash);
    const actor=reloaded.actors[0]!.artifact as any,item=actor.items[0];
    expect(item.system.description.value).toContain(rule);expect(item.system.description.value).toContain('GM');expect(item.effects).toEqual([]);
    expect(Object.values(item.system.activities).map((a:any)=>a.type)).toEqual([native?'save':'utility']);
    if(native)expect((Object.values(item.system.activities)[0] as any).activation).toMatchObject({type:'special',override:true});
    const source=renderMonsterIntakeMarkdown(data.ir);
    expect(verifyMonsterIntake(data.source,data.ir,source,actor).findings).toEqual([]);
    const request=createActorLocalizationRequest(actor,reloaded.bundle.actors[0]!.source,FACT_LOCALIZATION_POLICY,reloaded.actors[0]!.rulePresentation);
    expect(request.texts.some(t=>t.source.includes(rule))).toBe(true);
    const tampered=structuredClone(actor);tampered.items[0].effects=[{statuses:['restrained']}];
    expect(verifyMonsterIntake(data.source,data.ir,source,tampered).findings.some(f=>f.code==='ACTOR_MANUAL_RULE_EXECUTION_DRIFT'||f.code==='ACTOR_SOURCE_OPERATION_COUNT_DRIFT')).toBe(true);
  });
  test('same-feature paragraph coverage assembles but deleted text and foreign carriers fail',async()=>{
    const data=fixture('Whole Rule. Choose a visible target.\nThe target cannot regain hit points until the end of its next turn.',true);
    expect(validateMonsterIntakeIR(data.source,data.ir).blocking).toEqual([]);
    const truncated=structuredClone(data);truncated.ir.creature.actions[0]!.description='Whole Rule. Choose a visible target.';
    expect(validateMonsterIntakeIR(truncated.source,truncated.ir).blocking.some(f=>f.code==='MANUAL_FEATURE_INCOMPLETE_SOURCE')).toBe(true);
    const crossed=structuredClone(data);crossed.ir.coverage[2]!.claimPaths=['/creature/actions/1'];
    expect(validateMonsterIntakeIR(crossed.source,crossed.ir).blocking.some(f=>f.code==='MANUAL_FEATURE_INCOMPLETE_SOURCE')).toBe(true);
  });
  test('manual marker never hides an inconsistent proposed native field',async()=>{
    const data=fixture('Unsafe Rule. One target takes 7 (2d6) Fire damage.');
    data.ir.creature.actions[0]!.damage=[{formula:'9d6',type:'fire',relationship:'base'}];
    expect(validateMonsterIntakeIR(data.source,data.ir).blocking.some(f=>f.code==='MANUAL_FEATURE_EXECUTABLE_FIELDS')).toBe(true);
    const {result}=await run(data);expect(result.prepared).toBeUndefined();
  });
  test('a complete manual span cannot swallow a second independent named ability',()=>{
    const data=fixture('Whole Rule. Choose a visible target.\nSecond Rule. The target cannot regain hit points.');
    expect(validateMonsterIntakeIR(data.source,data.ir).blocking.some(f=>f.code==='SOURCE_FEATURE_OMITTED')).toBe(true);
  });
  for(const [name,max,period] of [['Passage (1/Day)',1,'day'],['Rest Ward (2/Long Rest)',2,'longRest'],['Brief Ward (3/Short Rest)',3,'shortRest']] as const)
    test(name+' preserves its counter without automatic consumption',async()=>{
      const data=fixture(name+'. The target is Charmed until the GM ends this effect.');
      data.ir.creature.actions[0]!.uses={max,period};
      const {result}=await run(data);expect(result.report.findings).toEqual([]);expect(result.prepared).toBeDefined();
      const item=(result.prepared!.actors[0]!.artifact as any).items[0];expect(item.system.uses.max).toBe(String(max));
      const activity=Object.values(item.system.activities)[0] as any;expect(activity.consumption?.targets??[]).toEqual([]);
    });
  test('CRLF discovery maps presentation-equivalent quotes to exact original bytes and rejects changed negation',()=>{
    const source='Creature\r\nA target cannot move.\r\n';
    const quote=source.replace(/\r\n/gu,'\n');
    const candidate={id:'one',label:'Creature',start:0,end:quote.length,quote};
    const found=normalizeDiscovery(source,[candidate])[0]!;expect(source.slice(found.start,found.end)).toBe(found.quote);
    expect(()=>normalizeDiscovery(source,[{...candidate,quote:quote.replace('cannot','can')}])).toThrow();
  });
  test('an explicitly synthetic Chinese draft survives GM approval and formal package regeneration with zero manual execution',async()=>{
    const rule='Silent Ward. The target cannot speak until the end of its next turn.';
    const {result}=await run(fixture(rule)),prepared=result.prepared!;let reviewCalls=0;
    const draft=await draftForgeEncounterLocalization({prepared,service:{model:'synthetic-offline',reviewModel:'disabled',
      translate:async request=>({texts:request.texts.map(field=>({id:field.id,text:field.source
        .replaceAll(rule,'静默守护。目标直到其下个回合结束前无法说话。')
        .replaceAll('Silent Ward','静默守护').replaceAll('Proof Beast','凭证兽').replaceAll('Offline manual rule','离线手动规则')}))}),
      review:async()=>{reviewCalls++;throw new Error('Paid review disabled in this synthetic test');}}});
    const approved=await approveForgeEncounterLocalization({prepared,draft,gmId:'synthetic-test-gm'});
    const reloaded=await prepareForgeEncounter(serializeForgeEncounterPackage(approved.bundle));
    expect(reloaded.hash).toBe(approved.hash);expect(reviewCalls).toBe(0);
    const actor=reloaded.actors[0]!.artifact as any,item=actor.items[0],activity=Object.values(item.system.activities)[0] as any;
    expect(actor.name).toBe('凭证兽 Proof Beast');expect(item.name).toBe('静默守护 Silent Ward');
    expect(item.system.description.value).toContain('目标直到其下个回合结束前无法说话。');
    const [chinese,english]=item.system.description.value.split('<hr><h3>英文原文</h3>');
    expect(chinese).toContain('静默守护');expect(chinese).not.toContain(rule);
    expect(english).toBe('<p>'+rule+'</p>');expect(item.flags.fvttJsonGenerator.manualRule.sourceText).toBe(rule);
    expect(chinese!.match(/GM 手动能力：/gu)?.length).toBe(1);
    const [chatChinese,chatEnglish]=activity.description.chatFlavor.split('<hr><h3>英文原文</h3>');
    expect(chatChinese.match(/GM 手动能力：/gu)?.length).toBe(1);expect(chatEnglish).toBe(english);
    expect(item.effects).toEqual([]);expect(activity.type).toBe('utility');expect(activity.consumption?.targets??[]).toEqual([]);
    expect(activity.attack).toBeUndefined();expect(activity.save).toBeUndefined();expect(activity.damage).toBeUndefined();
  });
});
