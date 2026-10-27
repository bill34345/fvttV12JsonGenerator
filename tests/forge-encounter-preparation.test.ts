import { describe, expect, test } from 'bun:test';
import { hashArtifact, hashSource,attachForgeSourceId,type ForgeSourceId } from '@fvtt-json-generator/forge-gateway-protocol';
import { prepareForgeEncounter, assertPreparedForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import {draftForgeEncounterLocalization,approveForgeEncounterLocalization} from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';
import { encounterFixture, assistedEncounterFixture as assistedFixture } from './helpers/forge-encounter';

function assistedWithSourceIds(){
  const bundle=assistedFixture();
  for(const [index,actor]of bundle.actors.entries()){
    actor.source=attachForgeSourceId(actor.source,`actor:v1:123e4567-e89b-42d3-a456-42661417400${index}` as ForgeSourceId).content;
    actor.sourceHash=hashSource(actor.source);
  }
  return bundle;
}

describe('encounter formal source preparation',()=>{
  test('preserves literal assisted review and the complete candidate when companion coverage is missing',async()=>{
    const bundle=assistedWithSourceIds();
    bundle.actors[0].source=bundle.actors[0].source.replaceAll('表达覆盖: structured','表达覆盖: literal');
    bundle.actors[0].sourceHash=hashSource(bundle.actors[0].source);
    const prepared=await prepareForgeEncounter(JSON.stringify(bundle));
    expect(prepared.actors[0]!.status).toBe('needs_review');expect(prepared.requirements).toHaveLength(5);
    bundle.macros[0].covers=bundle.macros[0].covers.filter((c:any)=>c.actorKey!=='dragon');
    const unbound=await prepareForgeEncounter(JSON.stringify(bundle));
    expect(unbound.actors.map(actor=>actor.status)).toEqual(prepared.actors.map(actor=>actor.status));
    expect(unbound.actors.map(actor=>actor.artifactHash)).toEqual(prepared.actors.map(actor=>actor.artifactHash));
    expect(unbound.requirements).toEqual(prepared.requirements);
    expect(unbound.bundle.actors[0]!.source).toBe(bundle.actors[0].source);
    expect(unbound.reviewFindings?.join(' ')).toContain('没有唯一配套控制');
  });
  test('keeps GM-assisted findings and full candidates while rejecting macros bound to the wrong Actor',async()=>{
    const bundle=assistedWithSourceIds();const prepared=await prepareForgeEncounter(JSON.stringify(bundle));
    expect(prepared.actors.map(a=>a.status)).toEqual(['needs_review','needs_review']);
    expect(prepared.requirements).toHaveLength(5);
    const corruption=prepared.requirements.find(r=>r.actorKey==='crystal'&&r.mechanicId==='salvo-crystal-corruption')!;
    expect(corruption.externalRule).toMatchObject({dc:18,ability:'cha'});
    expect(corruption.externalRule!.result).toContain('已有腐化');
    expect(corruption.gmSteps.join(' ')).toContain('不能把力竭直接应用');
    expect(prepared.requirements.find(r=>r.mechanicId==='crystalbleed-eclipse-ward')!.trigger!.condition).toContain('超过 20');
    expect(prepared.requirements.every(r=>r.gmSteps.join(' ')!==bundle.macros[0].notes)).toBe(true);
    const removed=bundle.macros[0].covers.pop();
    const withoutControl=await prepareForgeEncounter(JSON.stringify(bundle));
    expect(withoutControl.actors.map(actor=>actor.artifactHash)).toEqual(prepared.actors.map(actor=>actor.artifactHash));
    expect(withoutControl.requirements).toEqual(prepared.requirements);
    expect(withoutControl.reviewFindings?.join(' ')).toContain(removed.mechanicId);
    expect(withoutControl.actors.map(actor=>actor.status)).toEqual(['needs_review','needs_review']);
    const unbound=assistedFixture();unbound.macros[0].bindings={crystal:'crystal'};
    const unboundResult=await prepareForgeEncounter(JSON.stringify(unbound));
    expect(unboundResult.actors).toHaveLength(2);expect(unboundResult.reviewFindings?.join(' ')).toContain('未绑定');
  });
  test('keeps optional behavior duration fields JSON-safe for special, round and second durations',async()=>{
    for(const [replacement,expected] of [['特殊: 直到龙兽下一回合开始',{special:'直到龙兽下一回合开始'}],['轮: 2',{rounds:2}],['秒: 30',{seconds:30}]] as const){
      const bundle=assistedFixture();bundle.actors[0].source=bundle.actors[0].source.replace('特殊: 直到龙兽下一回合开始',replacement);bundle.actors[0].sourceHash=hashSource(bundle.actors[0].source);
      const result=await prepareForgeEncounter(JSON.stringify(bundle));
      const effect=(result.actors[0]!.artifact.items as any[]).flatMap(i=>i.effects??[]).find(e=>e.flags?.fvttJsonGenerator?.behaviorState?.stateId==='ward-broken');
      expect(effect.flags.fvttJsonGenerator.behaviorState.duration).toEqual(expected);
    }
  });
  test('regenerates both actors without running macro code and seals the current preview',async()=>{
    const result=await prepareForgeEncounter(JSON.stringify(encounterFixture()));
    expect(result.actors.map(a=>[a.name,a.status])).toEqual([['main','accepted'],['summon','accepted']]);
    expect(result.actors[0]!.artifact._stats).toMatchObject({coreVersion:'14.364',systemVersion:'5.3.3'});
    expect(()=>assertPreparedForgeEncounter(result)).not.toThrow();
    expect(()=>assertPreparedForgeEncounter(structuredClone(result))).toThrow();
    expect(Object.isFrozen(result.actors[0]!.artifact)).toBe(true);
  });
  test('a broken legacy source does not cancel other available Actors',async()=>{
    const bundle:any=encounterFixture();bundle.actors[0].source='---\n名称: Broken\n类型: npc\n未知字段: 5\n---';bundle.actors[0].sourceHash=hashSource(bundle.actors[0].source);
    const prepared=await prepareForgeEncounter(JSON.stringify(bundle));
    expect(prepared.actors.some(actor=>actor.key==='summon')).toBe(true);
  });
  test('invalid companion coverage only removes the controller while Actors remain available',async()=>{
    const bundle:any=encounterFixture();bundle.macros[0].covers=[{actorKey:'main',mechanicId:'invented'}];
    const prepared=await prepareForgeEncounter(JSON.stringify(bundle));
    expect(prepared.actors).toHaveLength(2);expect(prepared.macros).toHaveLength(0);
    expect(prepared.reviewFindings?.join(' ')).toContain('Actor 保留');
    const controller=new AbortController();controller.abort();
    await expect(prepareForgeEncounter(JSON.stringify(encounterFixture()),controller.signal)).rejects.toThrow();
  });
  test('saved artifacts bypass source regeneration and remain byte-identical in the current preview',async()=>{
    const bundle:any=encounterFixture(),original=await prepareForgeEncounter(JSON.stringify(bundle));
    const artifact=structuredClone(original.actors[0]!.artifact);
    bundle.actors[0].source='Retained original source without a parseable statblock.';
    bundle.actors[0].sourceHash=hashSource(bundle.actors[0].source);bundle.actors[0].artifact=artifact;
    bundle.actors[0].artifactHash='0'.repeat(64);
    const prepared=await prepareForgeEncounter(JSON.stringify(bundle));
    expect(prepared.actors[0]!.artifact).toEqual(artifact);
    expect(prepared.bundle.actors[0]!.artifact).toEqual(artifact);
    expect(prepared.actors[0]!.artifactHash).toBe(hashArtifact(artifact));
  });

  test('a malformed macro is isolated from saved Actor artifacts',async()=>{
    const bundle:any=encounterFixture(),original=await prepareForgeEncounter(JSON.stringify(bundle));
    bundle.actors=bundle.actors.map((actor:any,index:number)=>({...actor,artifact:structuredClone(original.actors[index]!.artifact)}));
    bundle.macros[0].commandHash='0'.repeat(64);
    const prepared=await prepareForgeEncounter(JSON.stringify(bundle));
    expect(prepared.actors.map(actor=>actor.artifact)).toEqual(original.actors.map(actor=>actor.artifact));
    expect(prepared.macros).toEqual([]);expect(prepared.reviewFindings?.join(' ')).toContain('Actor 保留');
  });
  test('more than twenty saved Actors are retained without a package-count or JSON-node veto',async()=>{
    const bundle:any=encounterFixture(),original=await prepareForgeEncounter(JSON.stringify(bundle));
    bundle.actors=Array.from({length:21},(_,index)=>({...bundle.actors[0],key:`actor-${index+1}`,artifact:structuredClone(original.actors[0]!.artifact)}));
    bundle.primaryActorKey='actor-1';bundle.macros=[];
    const prepared=await prepareForgeEncounter(JSON.stringify(bundle));
    expect(prepared.actors).toHaveLength(21);
    expect(prepared.actors.every(actor=>JSON.stringify(actor.artifact)===JSON.stringify(original.actors[0]!.artifact))).toBe(true);
  });

  test('malformed companion metadata cannot discard a complete saved Actor',async()=>{
    const bundle:any=encounterFixture(),original=await prepareForgeEncounter(JSON.stringify(bundle));
    bundle.actors[0].artifact=structuredClone(original.actors[0]!.artifact);
    bundle.actors[0].artifact.items[0].flags??={};bundle.actors[0].artifact.items[0].flags.fvttJsonGenerator??={};
    bundle.actors[0].artifact.items[0].flags.fvttJsonGenerator.behaviorMechanics=[null];
    const prepared=await prepareForgeEncounter(JSON.stringify(bundle));
    expect(prepared.actors[0]!.artifact).toEqual(bundle.actors[0].artifact);
    expect(prepared.reviewFindings?.length).toBeGreaterThan(0);
  });

  test('malformed localization metadata retains saved source-language Actors',async()=>{
    const bundle:any=encounterFixture(),original=await prepareForgeEncounter(JSON.stringify(bundle));
    bundle.actors=bundle.actors.map((actor:any,index:number)=>({...actor,artifact:structuredClone(original.actors[index]!.artifact)}));
    bundle.localization={unsupported:'incomplete translation'};
    const prepared=await prepareForgeEncounter(JSON.stringify(bundle));
    expect(prepared.actors.map(actor=>actor.artifact)).toEqual(original.actors.map(actor=>actor.artifact));
    expect(prepared.bundle.localization).toBeUndefined();
    expect(prepared.reviewFindings?.join(' ')).toContain('翻译记录未准备');
  });

  test('cached artifacts retain rule facts and explicit Chinese approval changes display without regenerating mechanics',async()=>{
    const source=['---','名称: Forest Keeper','类型: npc','护甲等级: 14','生命值: 20',
      '特性:','  - 名称: Quiet Watch','    类型: utility','    执行模式: gm-manual','    描述: Quiet Watch. It remains alert.','---'].join('\n');
    const bundle:any={schema:'fvtt-json-forge-encounter',version:1,id:'cached-keeper',label:'Keeper package',
      target:{foundry:'14.364',system:'dnd5e',systemVersion:'5.3.3',effectProfile:'core'},primaryActorKey:'keeper',
      actors:[{key:'keeper',label:'Forest Keeper',source,sourceHash:hashSource(source)}],macros:[],assets:[]};
    const generated=await prepareForgeEncounter(JSON.stringify(bundle));
    bundle.actors[0].artifact=structuredClone(generated.actors[0]!.artifact);
    bundle.actors[0].rulePresentation=structuredClone(generated.actors[0]!.rulePresentation);
    bundle.actors[0].artifactHash=hashArtifact(bundle.actors[0].artifact);
    const cached=await prepareForgeEncounter(JSON.stringify(bundle));
    expect(cached.actors[0]!.rulePresentation).toBeDefined();
    const before=cached.actors[0]!.artifact as any;
    const draft=await draftForgeEncounterLocalization({prepared:cached,service:{model:'offline',reviewModel:'disabled',
      translate:async request=>({texts:request.texts.map(field=>({id:field.id,text:field.kind==='title'
        ?field.source==='Forest Keeper'?'森林守卫':field.source==='Quiet Watch'?'静默守望':'守卫资料'
        :field.source.replace('Quiet Watch.','静默守望。').replace('It remains alert.','它保持警觉。')}))}),
      review:async()=>{throw Error('No AI review');}}});
    const approved=await approveForgeEncounterLocalization({prepared:cached,draft,gmId:'gm'});
    const after=approved.actors[0]!.artifact as any;
    expect(approved.reviewFindings?.join(' ')).not.toContain('保存的 Actor 指纹与内容不同');
    expect(after.name).toContain('森林守卫');expect(after.name).toContain('Forest Keeper');
    expect(after.items[0].system.description.value).toContain('它保持警觉');
    expect(after.system.attributes.hp).toEqual(before.system.attributes.hp);
    expect(after.system.attributes.ac).toEqual(before.system.attributes.ac);
    const operation=(actor:any)=>actor.items.flatMap((item:any)=>Object.values(item.system.activities??{}).map((activity:any)=>({
      type:activity.type,attack:activity.attack,save:activity.save,damage:activity.damage,consumption:activity.consumption})));
    expect(operation(after)).toEqual(operation(before));
    const restored=await prepareForgeEncounter(JSON.stringify(approved.bundle));
    expect(restored.actors[0]!.artifact).toEqual(after);
    expect(restored.reviewFindings?.join(' ')).not.toContain('保存的 Actor 指纹与内容不同');
  });

});
