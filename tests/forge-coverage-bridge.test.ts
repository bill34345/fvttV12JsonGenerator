import { describe, expect, test } from 'bun:test';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { generateEncounterFromHumanMarkdown } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import { compileEncounterSelection } from '@fvtt-json-generator/intake-ai/encounter-automation';
import { verifyMonsterIntake } from '@fvtt-json-generator/intake-ai/verifier';
import { renderMonsterIntakeMarkdown } from '@fvtt-json-generator/intake-ai/renderer';
import { encounterProposalContext, expandEncounterProposal } from '../packages/intake-ai/src/encounter-proposal';
import type { MonsterIntakeIR } from '@fvtt-json-generator/intake-ai/types';
import historical from './fixtures/forge-target-choice-intake.json';
import saved from './fixtures/forge-raw-contracts.json';

const forbidden=async():Promise<never>=>{throw new Error('Coverage bridge regression forbids models/network');};
const provider={providerName:'saved-coverage-no-model',extractionModel:'disabled',reviewModel:'disabled',discover:forbidden,extract:forbidden,repair:forbidden,review:forbidden};
const sample=saved.find(entry=>entry.caseId==='sea-hag-auntie')!;
describe('complete source unit reaches compact proposal and compiler',()=>{
  for(const format of ['original','renamed','html'] as const)test(format+' full-coverage plus short parent claim retains source proof through the formal package',async()=>{
    let source=sample.source,ir=structuredClone(sample.finalIr) as unknown as MonsterIntakeIR;
    let selection=structuredClone(historical.cachedConfiguration.selection);
    if(format==='renamed'){
      source=source.replaceAll('Seed Terror','Root Horror');
      ir=JSON.parse(JSON.stringify(ir).replaceAll('Seed Terror','Root Horror'));
      selection=JSON.parse(JSON.stringify(selection).replaceAll('Seed Terror','Root Horror'));
      ir.source={sha256:hashSource(source),length:source.length};
    }
    if(format==='html')ir.creature.actions[3]!.description='<p>'+ir.creature.actions[3]!.description+'</p>';
    let compilerCalls=0;
    const result=await generateEncounterFromHumanMarkdown({source,label:'Saved complete-unit regression',reviewPolicy:'deferred',outputLanguage:'source',
      drafts:[{key:'actor-1',source,ir}],draftParentHash:hashSource(JSON.stringify(ir)),provider,
      automationProvider:{generate:async request=>{
        compilerCalls++;
        const actor=request.actors[0]!;
        expect(actor.ir.claims.find(claim=>claim.path==='/creature/actions/3')!.evidence[0]!.quote).not.toContain('DC 15');
        const context=encounterProposalContext(request,[]);
        const binding=context.bindings.find(entry=>entry.feature.name===actor.ir.creature.actions[3]!.name)!;
        expect(binding.quote).toContain('Target’s Choice');
        const complete=compileEncounterSelection(selection,request);
        const omittedActor=structuredClone(actor.artifact) as any;
        const omittedItem=omittedActor.items.find((item:any)=>item.name.includes(actor.ir.creature.actions[3]!.name));
        omittedItem.system.description.value='';
        for(const activity of Object.values(omittedItem.system.activities??{}) as any[])activity.description={chatFlavor:''};
        expect(verifyMonsterIntake(source,actor.ir,renderMonsterIntakeMarkdown(actor.ir),omittedActor).findings)
          .toContainEqual(expect.objectContaining({code:'ACTOR_DESCRIPTION_LOSS',path:'/creature/actions/3/description',blocking:true}));
        const compact={version:3,rules:[{featureRef:binding.ref,kind:'gm-manual',parameters:{},gmSteps:['GM must ask the target to choose INT or WIS, roll DC 15, then adjudicate the complete source outcome and repeat save.','This rule is not automatic; the GM applies its consequences.']}],legendaryRecovery:[],unresolved:[]};
        const expanded=expandEncounterProposal(compact,context);
        expect(compileEncounterSelection(expanded,request).rules[0]!.quote).toContain('Target’s Choice');
        for(const mutate of [
          (value:MonsterIntakeIR)=>{value.coverage.find(entry=>entry.claimPaths.includes('/creature/actions/3')&&entry.quote.includes('Target’s Choice'))!.claimPaths=['/creature/actions/2'];},
          (value:MonsterIntakeIR)=>{value.creature.actions[3]!.description=value.creature.actions[3]!.description.replace(' (Save Ends at end of turn)','');},
          (value:MonsterIntakeIR)=>{value.coverage.find(entry=>entry.quote.includes('Target’s Choice'))!.quote+=' forged';},
        ]){
          const changed=structuredClone(actor.ir);mutate(changed);
          const wrong={...request,actors:[{...actor,ir:changed}]};
          expect(()=>compileEncounterSelection(selection,wrong)).toThrow();
          const wrongContext=encounterProposalContext(wrong,[]);
          expect(wrongContext.bindings.find(entry=>entry.feature.name===changed.creature.actions[3]!.name)?.quote).toBeUndefined();
        }
        return complete;
      },review:forbidden}});
    if(compilerCalls!==1)console.log(JSON.stringify({format,findings:result.report.findings}));
    expect(compilerCalls).toBe(1);
    expect(result.report.findings).toEqual([]);
    expect(result.report.status).toBe('ready_for_gm_review');
    expect(result.prepared).toBeDefined();
    expect(result.prepared!.requirements.some(requirement=>requirement.name.includes(format==='renamed'?'Root Horror':'Seed Terror')&&requirement.mode==='gm-assisted')).toBe(true);
  });
});
