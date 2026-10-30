import {describe,test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {convertMarkdownContentToJson} from '../src/core/workflow/singleFileConversion';
import {YamlParser} from '@fvtt-json-generator/parser';
import {adaptParsedActorToCanonical} from '../packages/generation/src/adapters';
import {verifyGeneratedDocument} from '../packages/generation/src/verification';
import {assertEqualStructure} from '../src/core/utils/assertEqualStructure';
const source=readFileSync('tests/fixtures/structured-source-uses.md','utf8');
describe('source resource recovery periods',()=>{
  test('formal workflow preserves day, short-rest and dawn separately from legacy long rest',async()=>{
    const result=await convertMarkdownContentToJson({content:source,fvttVersion:'14',effectProfile:'core',translationService:null});
    expect(result.status).toBe('accepted');
    const items=(result.rawJson as any).items;
    for(const [name,max,period] of [['每日能力',2,'day'],['短休能力',3,'sr'],['黎明能力',4,'dawn'],['旧长休入口',1,'lr']] as const){
      const item=items.find((i:any)=>i.name===name);
      assertEqualStructure(item.system.uses,{spent:0,max:String(max),recovery:[{period,type:'recoverAll'}]});
      const a=Object.values(item.system.activities)[0] as any;
      expect(a.consumption.targets).toEqual([{type:'itemUses',target:'',value:'1',scaling:{mode:'',formula:''}}]);
    }
    expect(items.find((i:any)=>i.name==='被动特性').system.uses).toBeUndefined();
  });
  test('formal verification rejects structured use drift in max, period, or activity consumption',async()=>{
    const result=await convertMarkdownContentToJson({content:source,fvttVersion:'14',effectProfile:'core',translationService:null});
    expect(result.status).toBe('accepted');
    const actor=result.rawJson as any;
    const parsed=new YamlParser().parse(source) as any;
    const canonical=adaptParsedActorToCanonical(parsed);
    for(const [index, action] of (parsed.structuredActions?.特性 ?? []).entries()){
      if(!action.uses) continue;
      const sourcePath=`structuredActions/特性/${index}/`;
      const item=actor.items.find((candidate:any)=>Object.values(candidate.system.activities ?? {}).some((activity:any)=>
        String(activity.flags?.fvttJsonGenerator?.sourceLogicalPath ?? '').includes(sourcePath)));
      expect(item).toBeDefined();
      for(const corrupt of [
        (copy:any)=>{delete (Object.values(copy.system.activities ?? {})[0] as any).consumption;},
        (copy:any)=>{copy.system.uses.max=String(Number(copy.system.uses.max)+1);},
        (copy:any)=>{copy.system.uses.recovery[0].period=copy.system.uses.recovery[0].period==='day'?'sr':'day';},
      ]){
        const copy=structuredClone(actor);
        const broken=copy.items.find((candidate:any)=>Object.values(candidate.system.activities ?? {}).some((activity:any)=>
          String(activity.flags?.fvttJsonGenerator?.sourceLogicalPath ?? '').includes(sourcePath)));
        corrupt(broken);
        const verification=verifyGeneratedDocument({canonical,output:copy,target:'14',effectProfile:'core'});
        expect(verification.status).toBe('failed');
      }
    }
  });
  test('Chinese daily shorthand retains daily meaning rather than silently becoming long rest',()=>{
    const parsed=new YamlParser().parse(source.replace('使用次数: {max: 2, period: day}','每日: 2')) as any;
    const serialized=JSON.stringify(parsed);expect(serialized).toContain('"uses":{"max":2,"period":"day"}');
  });
  test('retains invalid and conflicting resource records beside the other abilities',()=>{
    for(const [replacement,expectedUses,note] of [
      ['使用次数: {max: 0, period: day}',undefined,'GM 次数与恢复：{"max":0,"period":"day"}'],
      ['使用次数: {max: 2, period: never}',undefined,'GM 次数与恢复：{"max":2,"period":"never"}'],
      ['使用次数: {max: 2, period: day, extra: true}',{max:2,period:'day'},null],
      ['使用次数: {max: 2, period: day}\n    充能: [5, 6]',{max:2,period:'day'},null],
      ['使用次数: {max: 2, period: [day]}',undefined,'GM 次数与恢复：{"max":2,"period":["day"]}'],
      ['使用次数: null',undefined,'GM 次数与恢复：null'],
      ['使用次数: {max: 2, period: longRest}\n    每日: 3',{max:2,period:'longRest'},'GM 另有每日次数：3'],
    ] as const){
      const parsed=new YamlParser().parse(source.replace('使用次数: {max: 2, period: day}',replacement));
      const actions=parsed.structuredActions!.特性!;
      expect(actions.map(action=>action.name)).toEqual(['每日能力','短休能力','黎明能力','旧长休入口','被动特性']);
      expect(actions[0]!.uses).toEqual(expectedUses);
      expect(actions[0]!.describe).toContain('每日可使用两次。确切重置时点由GM决定。');
      if(note)expect(actions[0]!.describe).toContain(note);
      if(replacement.includes('充能:'))expect(actions[0]!.recharge).toEqual([5,6]);
      expect(actions[1]!.uses).toEqual({max:3,period:'shortRest'});
      expect(actions[2]!.uses).toEqual({max:4,period:'dawn'});
    }
  });
});
