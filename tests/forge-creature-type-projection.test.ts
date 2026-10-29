import {afterAll,expect,setSystemTime,test} from 'bun:test';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows/single-file-conversion';
import {buildValidLurkerIr} from '../src/core/intake/__tests__/fixtures/lurker';

const originalFetch=globalThis.fetch;
setSystemTime(new Date('2026-10-29T00:00:00.000Z'));
globalThis.fetch=Object.assign(async():Promise<never>=>{throw Error('Creature type regression forbids network');},{preconnect:()=>{throw Error('Creature type regression forbids preconnect');}});
afterAll(()=>{globalThis.fetch=originalFetch;setSystemTime();});

const standardTypes=[
  ['aberration','异怪'],['beast','野兽'],['celestial','天界生物'],['construct','构装生物'],
  ['dragon','龙'],['elemental','元素生物'],['fey','妖精'],['fiend','邪魔'],['giant','巨人'],
  ['humanoid','类人生物'],['monstrosity','怪兽'],['ooze','泥怪'],['plant','植物'],['undead','亡灵'],
] as const;

async function project(type:string,note?:string){
  const ir=buildValidLurkerIr();
  Object.assign(ir.creature.identity,{creatureType:type,creatureTypeCustom:note});
  const before=structuredClone(ir),markdown=renderMonsterIntakeMarkdown(ir);
  const converted=await convertMarkdownContentToJson({content:markdown,fvttVersion:'14',effectProfile:'core',iconOptions:{mode:'off'},translationService:null});
  expect(ir).toEqual(before);
  return converted.rawJson as any;
}

for(const [native,chinese] of standardTypes)test(`creature type: ${native} retains its main type and separate note in English and Chinese`,async()=>{
  const baseline=await project(native,'Subtype note');
  expect(baseline.system.details.type).toEqual({value:native,custom:'Subtype note',swarm:''});
  expect(await project(native.toUpperCase(),'Subtype note')).toEqual(baseline);
  expect(await project(chinese,'Subtype note')).toEqual(baseline);
});

for(const type of ['custom','Astral Spirit'])test(`creature type: explicit ${type} is not replaced by its display note`,async()=>{
  const actor=await project(type,'Display note');
  expect(actor.system.details.type).toEqual({value:type,custom:'Display note',swarm:''});
  const withoutNote=await project(type);
  expect(withoutNote.system.details.type.value).toBe(type);
  expect(withoutNote.system.details.type.custom).toBe('');
  const comparison=structuredClone(actor);
  comparison.system.details.type.custom='';
  expect(comparison).toEqual(withoutNote);
});
