import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { readFileSync } from 'node:fs';
import type { ForgeEncounterPackage } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
export const encounterSource = (name:string) => readFileSync('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md','utf8').replace(/^名称:.*$/mu,`名称: ${name}`);
export function encounterFixture(): ForgeEncounterPackage {
  const command='void forgeEncounter.actors.main;';
  return {schema:'fvtt-json-forge-encounter',version:1,id:'test-encounter',label:'Encounter fixture',
    target:{foundry:'14.364',system:'dnd5e',systemVersion:'5.3.3',effectProfile:'core'},primaryActorKey:'main',
    actors:['main','summon'].map(key=>({key,label:key,source:encounterSource(key),sourceHash:hashSource(encounterSource(key))})),
    macros:[{key:'control',name:'Test encounter control',command,commandHash:hashSource(command),bindings:{main:'main',summon:'summon'},covers:[],notes:'Test-only inert script.'}],assets:[]};
}
export function assistedEncounterFixture():any {
  const bundle:any=encounterFixture();bundle.primaryActorKey='dragon';
  bundle.actors=['dragon','crystal'].map(key=>{const source=readFileSync(`tools/forge-encounter/examples/crystalbleed/${key}.md`,'utf8');return{key,label:key,source,sourceHash:hashSource(source)};});
  bundle.macros[0].bindings={dragon:'dragon',crystal:'crystal'};
  bundle.macros[0].covers=[['dragon','crystalbleed-eclipse-ward'],['dragon','crystalbleed-defiance-break'],['dragon','crystalbleed-corruption'],['crystal','salvo-crystal-pulse'],['crystal','salvo-crystal-corruption']].map(([actorKey,mechanicId])=>({actorKey,mechanicId}));
  return bundle;
}
