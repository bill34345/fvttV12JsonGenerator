/** Final generated N2/N3 -> real planner -> Cast builder -> transaction bridge.
 * Uses pinned source spell DTOs and an offline embedded-Document port only.
 * It does not prove target-world hydration, native hooks or UI Cast execution.
 */
import {describe,test,expect,afterAll} from 'bun:test';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import yaml from 'js-yaml';
import {hashArtifact} from '@fvtt-json-generator/forge-gateway-protocol';
import {hashSourceInventoryMetadata,planSpellHydration,RESOLVER_MODULE_ID,type PortableSpellManifest,type SpellCandidateMetadata} from '../src/core/spell-resolution';
import {buildCastActivitySource} from '../foundry-modules/monster-spell-resolver/src/cast-activity';
import {executeHydrationTransaction,HydrationTransactionError,projectHydrationBindingProjection} from '../foundry-modules/monster-spell-resolver/src/transaction';
import {FinalArtifactResolverActor} from './helpers/final-artifact-resolver-port';

const artifactRoot=resolve('.local/forge-brass-cast-20261022');
const referenceRoot='F:/FoundryLab/reference-cache/dnd5e/5.3.3/repo/packs/_source/spells24';
const pinnedCastSource='F:/FoundryLab/reference-cache/dnd5e/5.3.3/repo/module/documents/activity/cast.mjs';
const required=[join(artifactRoot,'N2.actor.json'),join(artifactRoot,'N3.actor.json'),join(artifactRoot,'replay-final-verification.json'),pinnedCastSource];
const available=required.every(existsSync)&&existsSync(referenceRoot);
const sha=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const protectedHashes=new Map(required.filter(existsSync).map(path=>[path,sha(path)]));

function files(root:string):string[]{return readdirSync(root,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(root,entry.name)):entry.name.endsWith('.yml')?[join(root,entry.name)]:[]);}

function context(id:'N2'|'N3'){
  expect(sha(pinnedCastSource)).toBe('bb553020ee547a1f544f4871122544b6b28e43bc3574d49dab490f0cc61dff6d');
  const artifact=JSON.parse(readFileSync(join(artifactRoot,`${id}.actor.json`),'utf8'));
  const receipt=JSON.parse(readFileSync(join(artifactRoot,'replay-final-verification.json'),'utf8'));
  expect(receipt.verifyExisting).toBe(true);expect(receipt.liveModelCalls).toBe(0);
  expect(hashArtifact(artifact)).toBe(receipt.cases.find((entry:any)=>entry.id===id).actorHash);
  const manifest=artifact.flags[RESOLVER_MODULE_ID].spellManifest as PortableSpellManifest;
  const identifiers=new Set(manifest.spellcastingGroups.flatMap(group=>group.spellRefs.map(ref=>ref.identifier)));
  const sourceSpells=new Map<string,Record<string,any>>(),candidates:SpellCandidateMetadata[]=[];
  for(const path of files(referenceRoot)){
    const source=yaml.load(readFileSync(path,'utf8'),{schema:yaml.JSON_SCHEMA}) as Record<string,any>;
    if(!identifiers.has(source.system?.identifier))continue;
    expect(source.type).toBe('spell');expect(source.system.source.rules).toBe('2024');
    const uuid=`Compendium.dnd5e.spells24.Item.${source._id}`;
    sourceSpells.set(uuid,source);if(!protectedHashes.has(path))protectedHashes.set(path,sha(path));
    candidates.push({id:source._id,uuid,packageId:'dnd5e',packId:'spells24',name:source.name,identifier:source.system.identifier,
      rules:source.system.source.rules,sourceBook:source.system.source.book,level:source.system.level,school:source.system.school});
  }
  expect(candidates).toHaveLength(identifiers.size);
  const actor=new FinalArtifactResolverActor(artifact,sourceSpells);
  const result=planSpellHydration({manifest,candidates,sourceInventoryHash:hashSourceInventoryMetadata(candidates),currentManagedProjection:projectHydrationBindingProjection(actor,manifest)});
  expect(result.status).toBe('ready');
  if(result.status!=='ready')throw Error(JSON.stringify(result.findings));
  expect(result.report.findings).toEqual([]);
  return{id,artifact,manifest,actor,plan:result.plan};
}

function featureFor(actor:FinalArtifactResolverActor,groupId:string){return actor.items.find(item=>item.flags?.[RESOLVER_MODULE_ID]?.groupId===groupId);}

describe.skipIf(!available)('final N2/N3 artifacts through offline Resolver ports',()=>{
  for(const id of ['N2','N3'] as const){
    test(`${id}: final manifest plans all refs and builds their actual feature-linked Cast sources`,()=>{
      const {actor,artifact,manifest,plan}=context(id);
      const built=plan.selections.map(selection=>{
        const group=manifest.spellcastingGroups.find(group=>group.groupId===selection.groupId)!;
        const ref=group.spellRefs.find(ref=>ref.refId===selection.refId)!,feature=featureFor(actor,group.groupId)!;
        const flags=feature.flags.fvttJsonGenerator;
        return{group,ref,feature,selection,...buildCastActivitySource({manifestId:manifest.manifestId,featureId:feature.id,group,ref,selectedUuid:selection.uuid,
          activationType:flags.spellcastingActivationType,...(flags.spellcastingUsesParent?{useParentItemPool:true}:{}),
          ...(flags.spellcastingActivationType==='legendary'?{activationCost:flags.spellcastingActivationCost}:{})})};
      });
      expect(built).toHaveLength(manifest.spellcastingGroups.flatMap(group=>group.spellRefs).length);
      if(id==='N2'){
        const spiritual=built.find(entry=>entry.ref.identifier==='spiritual-weapon')!;
        expect(spiritual.activity.activation).toEqual({type:'bonus',value:1,override:true});
        expect(spiritual.activity.consumption).toEqual({spellSlot:false,targets:[{type:'itemUses',value:'1'}]});
        expect(spiritual.activity.uses).toBeUndefined();expect(spiritual.feature.system.uses.max).toBe('2');
        expect(spiritual.activity.spell).toMatchObject({ability:'wis',challenge:{override:true,save:'12',attack:'4'},properties:[]});
        expect(spiritual.activity.spell.level).toBeUndefined();expect(spiritual.ref.castingLevel).toBeUndefined();
      }else{
        const reuse=built.find(entry=>entry.ref.reuseOf)!;
        const original=built.find(entry=>entry.group.groupId===reuse.ref.reuseOf!.groupId&&entry.ref.refId===reuse.ref.reuseOf!.refId)!;
        expect(reuse.ref.identifier).toBe('scorching-ray');expect(reuse.selection.uuid).toBe(original.selection.uuid);
        expect(reuse.activity.activation).toEqual({type:'legendary',value:1,override:true});
        expect(reuse.activity.uses).toBeUndefined();expect(reuse.activity.consumption).toEqual({spellSlot:false,targets:[]});
        expect(artifact.system.resources.legres.max).toBe(3);
        expect(artifact.flags.fvttJsonGenerator.sourceLegendaryLedger).toMatchObject({resistanceMax:3,resistanceLairMax:4});
        expect(artifact.items.find((item:any)=>/^Legendary Resistance\b/u.test(item.name)).system.uses?.max).toBeUndefined();
      }
    });

    test(`${id}: actual final feature shapes hydrate once, retain nonzero source pools and same-plan no-op`,async()=>{
      const {actor,manifest,plan}=context(id);
      for(const feature of actor.items)if(Number(feature.system?.uses?.max)>0)feature.system.uses.spent=1;
      const beforePools=actor.items.filter(item=>Number(item.system?.uses?.max)>0).map(item=>[item.id,structuredClone(item.system.uses)]);
      const actorResources=structuredClone(actor.system.resources);
      const committed=await executeHydrationTransaction({actor,manifest,plan,lifecycleHooks:actor.hooks});
      expect(committed.status).toBe('committed');
      expect(actor.managedActivities()).toHaveLength(plan.selections.length);expect(actor.managedSpells()).toHaveLength(plan.selections.length);
      expect(new Set(actor.managedActivities().map(activity=>activity.relativeUUID)).size).toBe(plan.selections.length);
      for(const[id,pool]of beforePools)expect(actor.items.find(item=>item.id===id).system.uses).toEqual(pool);
      expect(actor.system.resources).toEqual(actorResources);
      if(id==='N2'){
        const spiritual=actor.managedActivities().find(activity=>activity.flags[RESOLVER_MODULE_ID].groupId===manifest.spellcastingGroups.find(group=>group.spellRefs.some(ref=>ref.identifier==='spiritual-weapon'))!.groupId)!;
        expect(spiritual.activation).toEqual({type:'bonus',value:1,override:true});
        expect(spiritual.consumption.targets).toEqual([{type:'itemUses',value:'1'}]);
        expect(spiritual.uses).toBeUndefined();expect(spiritual.item.system.uses.spent).toBe(1);
        expect(spiritual.cachedSpell.system.identifier).toBe('spiritual-weapon');expect(spiritual.cachedSpell.system.activities.dnd5eactivity000.type).toBe('summon');
      }else expect(actor.managedActivities().find(activity=>activity.activation?.type==='legendary')?.activation.value).toBe(1);
      const writeCount=actor.calls.length;
      expect((await executeHydrationTransaction({actor,manifest,plan,lifecycleHooks:actor.hooks})).status).toBe('noop');
      expect(actor.calls).toHaveLength(writeCount);
    });

    test(`${id}: one partial-cache failure restores all source Items and leaves no owned cache`,async()=>{
      const {actor,manifest,plan}=context(id);
      for(const feature of actor.items)if(Number(feature.system?.uses?.max)>0)feature.system.uses.spent=1;
      const before=actor.source();let observedFailure:unknown,injected=false;
      try{
        await executeHydrationTransaction({actor,manifest,plan,lifecycleHooks:actor.hooks,failureInjector:stage=>{
          if(stage==='after-partial-cache-creation'){injected=true;throw Error('Offline final-artifact partial-cache failure');}
        }});
      }catch(error){observedFailure=error;}
      expect(injected).toBe(true);
      expect(observedFailure).toBeInstanceOf(HydrationTransactionError);
      expect((observedFailure as HydrationTransactionError).rollbackSucceeded).toBe(true);
      expect((observedFailure as HydrationTransactionError).residualDifferences).toEqual([]);
      expect(actor.managedActivities()).toEqual([]);expect(actor.managedSpells()).toEqual([]);
      expect(actor.items.some(item=>item.flags?.dnd5e?.cachedFor)).toBe(false);
      expect(actor.source()).toEqual(before);
    });
  }
});

afterAll(()=>{for(const[path,digest]of protectedHashes)expect(sha(path)).toBe(digest);});
