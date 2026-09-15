import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { decodeForgeEncounterPackageText, encodeForgeEncounterPackageZip, serializeForgeEncounterPackage, hashEncounterBytes } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { prepareForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';

const example=resolve(import.meta.dir,'examples/crystalbleed');
const root=resolve(import.meta.dir,'../..');
const output=resolve(root,'obsidian/dnd数据转fvttjson/output/forge-encounter');
await mkdir(output,{recursive:true});
const build=await Bun.build({entrypoints:[resolve(example,'battle-control.mjs')],target:'browser',format:'cjs',minify:false});
if(!build.success)throw new Error(build.logs.map(String).join('\n'));
const command=`const module = { exports: {} };\n${await build.outputs[0]!.text()}\nreturn await module.exports.installCrystalbleedRuntime({ game, canvas, Hooks, ui, ChatMessage: CONFIG.ChatMessage.documentClass, Combat: CONFIG.Combat.documentClass, Roll: foundry.dice.Roll, DialogV2: foundry.applications.api.DialogV2, CONFIG }, { actors: forgeEncounter.actors });\n`;
const actors=await Promise.all(['dragon','crystal'].map(async key=>{const source=await readFile(resolve(example,`${key}.md`),'utf8');return{key,label:key==='dragon'?'晶血龙兽':'月石晶体',source,sourceHash:hashSource(source)};}));
const image=await readFile(resolve(example,'dragon.png'));
const bundle=decodeForgeEncounterPackageText(JSON.stringify({schema:'fvtt-json-forge-encounter',version:1,id:'crystalbleed-v14',label:'晶血龙兽与月石晶体',
  target:{foundry:'14.364',system:'dnd5e',systemVersion:'5.3.3',effectProfile:'core'},primaryActorKey:'dragon',actors,
  macros:[{key:'battle-control',name:'晶血龙兽·战斗控制 V14',command,commandHash:hashSource(command),bindings:{dragon:'dragon',crystal:'crystal'},
    covers:[{actorKey:'dragon',mechanicId:'crystalbleed-eclipse-ward'},{actorKey:'dragon',mechanicId:'crystalbleed-defiance-break'},{actorKey:'dragon',mechanicId:'crystalbleed-corruption'},{actorKey:'crystal',mechanicId:'salvo-crystal-pulse'},{actorKey:'crystal',mechanicId:'salvo-crystal-corruption'}],
    notes:'配套宏处理守护、齐射召唤、晶体回合和腐化。需要一个GM客户端启动；刷新后重新启动。吐息方向、普通攻击目标、尾击分支等仍由GM决定。自动充能关闭时由GM手动充能；拖出龙兽后核对固定HP176。'}],
  assets:[{key:'dragon-art',fileName:'dragon.png',mime:'image/png',base64:image.toString('base64'),sha256:hashEncounterBytes(image),targets:[{actorKey:'dragon',fields:['img','prototypeToken.texture.src']}]}],
}));
const serialized=serializeForgeEncounterPackage(bundle);
const prepared=await prepareForgeEncounter(serialized);
await writeFile(resolve(output,'crystalbleed.forge-encounter.json'),serialized);
await writeFile(resolve(output,'crystalbleed.forge-encounter.zip'),await encodeForgeEncounterPackageZip(bundle));
await writeFile(resolve(output,'preparation.json'),JSON.stringify({hash:prepared.hash,actors:prepared.actors.map(a=>({key:a.key,name:a.name,status:a.status})),requirements:prepared.requirements},null,2));
console.log(JSON.stringify({output,hash:prepared.hash,actors:prepared.actors.length,macros:bundle.macros.length}));
