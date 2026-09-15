import {describe,test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {convertMarkdownContentToJson} from '../src/core/workflow/singleFileConversion';
import {YamlParser} from '@fvtt-json-generator/parser';
import {assertEqualStructure} from '../src/core/utils/assertEqualStructure';
const source=readFileSync('tests/fixtures/structured-source-uses.md','utf8');
describe('source resource recovery periods',()=>{
  test('formal workflow preserves day, short-rest and dawn separately from legacy long rest',async()=>{
    const result=await convertMarkdownContentToJson({content:source,fvttVersion:'14',effectProfile:'core',translationService:null});
    const items=(result.rawJson as any).items;
    for(const [name,max,period] of [['每日能力',2,'day'],['短休能力',3,'sr'],['黎明能力',4,'dawn'],['旧长休入口',1,'lr']] as const){
      const item=items.find((i:any)=>i.name===name);
      assertEqualStructure(item.system.uses,{spent:0,max:String(max),recovery:[{period,type:'recoverAll'}]});
      const a=Object.values(item.system.activities)[0] as any;
      expect(a.consumption.targets).toEqual([{type:'itemUses',target:'',value:'1',scaling:{mode:'',formula:''}}]);
    }
    expect(items.find((i:any)=>i.name==='被动特性').system.uses).toBeUndefined();
  });
  test('Chinese daily shorthand retains daily meaning rather than silently becoming long rest',()=>{
    const parsed=new YamlParser().parse(source.replace('使用次数: {max: 2, period: day}','每日: 2')) as any;
    const serialized=JSON.stringify(parsed);expect(serialized).toContain('"uses":{"max":2,"period":"day"}');
  });
  test('rejects invalid and conflicting source counters',()=>{
    for(const replacement of ['使用次数: {max: 0, period: day}','使用次数: {max: 2, period: never}','使用次数: {max: 2, period: day, extra: true}','使用次数: {max: 2, period: day}\n    充能: [5, 6]',
      '使用次数: {max: 2, period: [day]}','使用次数: null','使用次数: {max: 2, period: longRest}\n    每日: 3']){
      expect(()=>new YamlParser().parse(source.replace('使用次数: {max: 2, period: day}',replacement))).toThrow();
    }
  });
});
