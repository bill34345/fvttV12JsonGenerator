import { describe, expect, test } from 'bun:test';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { prepareForgeEncounter, assertPreparedForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { encounterFixture, assistedEncounterFixture as assistedFixture } from './helpers/forge-encounter';

describe('encounter formal source preparation',()=>{
  test('preserves literal assisted review and still requires unique bound macro coverage',async()=>{
    const bundle=assistedFixture();
    bundle.actors[0].source=bundle.actors[0].source.replaceAll('表达覆盖: structured','表达覆盖: literal');
    bundle.actors[0].sourceHash=hashSource(bundle.actors[0].source);
    const prepared=await prepareForgeEncounter(JSON.stringify(bundle));
    expect(prepared.actors[0]!.status).toBe('needs_review');expect(prepared.requirements).toHaveLength(5);
    bundle.macros[0].covers=bundle.macros[0].covers.filter((c:any)=>c.actorKey!=='dragon');
    await expect(prepareForgeEncounter(JSON.stringify(bundle))).rejects.toThrow('唯一');
  });
  test('keeps GM-assisted review explicit and requires complete bound companion coverage',async()=>{
    const bundle=assistedFixture();const prepared=await prepareForgeEncounter(JSON.stringify(bundle));
    expect(prepared.actors.map(a=>a.status)).toEqual(['needs_review','needs_review']);
    expect(prepared.requirements).toHaveLength(5);
    const corruption=prepared.requirements.find(r=>r.actorKey==='crystal'&&r.mechanicId==='salvo-crystal-corruption')!;
    expect(corruption.externalRule).toMatchObject({dc:18,ability:'cha'});
    expect(corruption.externalRule!.result).toContain('已有腐化');
    expect(corruption.gmSteps.join(' ')).toContain('不能把力竭直接应用');
    expect(prepared.requirements.find(r=>r.mechanicId==='crystalbleed-eclipse-ward')!.trigger!.condition).toContain('超过 20');
    expect(prepared.requirements.every(r=>r.gmSteps.join(' ')!==bundle.macros[0].notes)).toBe(true);
    bundle.macros[0].covers.pop();await expect(prepareForgeEncounter(JSON.stringify(bundle))).rejects.toThrow('唯一');
    const unbound=assistedFixture();unbound.macros[0].bindings={crystal:'crystal'};
    await expect(prepareForgeEncounter(JSON.stringify(unbound))).rejects.toThrow('未绑定');
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
  test('rejects broken sources even when their package hashes are updated',async()=>{
    const bundle:any=encounterFixture();bundle.actors[0].source='---\n名称: Broken\n类型: npc\n未知字段: 5\n---';bundle.actors[0].sourceHash=hashSource(bundle.actors[0].source);
    await expect(prepareForgeEncounter(JSON.stringify(bundle))).rejects.toThrow();
  });
  test('rejects invented companion coverage and cancelled previews',async()=>{
    const bundle:any=encounterFixture();bundle.macros[0].covers=[{actorKey:'main',mechanicId:'invented'}];
    await expect(prepareForgeEncounter(JSON.stringify(bundle))).rejects.toThrow('不存在');
    const controller=new AbortController();controller.abort();
    await expect(prepareForgeEncounter(JSON.stringify(encounterFixture()),controller.signal)).rejects.toThrow();
  });
});
