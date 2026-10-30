import {test,expect} from 'bun:test';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {vampire2024,vampire2024BaseFacts,vampire2024Boundaries,runVampire2024FormalChain,inspectVampire2024Form} from './helpers/vampire-2024-contract';
import {serializeForgeEncounterPackage} from '@fvtt-json-generator/forge-browser-runtime/encounter-package';

const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const plain=(value:string)=>value.replace(/<[^>]*>/gu,' ').replace(/\s+/gu,' ').trim();
const implementationPaths=['tests/helpers/vampire-2024-contract.ts','tests/forge-vampire-2024-retest.test.ts','tests/fixtures/forge-vampire-2024-srd521.json',
  'packages/forge-browser-runtime/src/encounterIntake.ts','packages/forge-browser-runtime/src/ai.ts','packages/intake-ai/src/staged-extraction.ts',
  'packages/intake-ai/src/staged-source.ts','packages/intake-ai/src/staged-source-facts.ts','packages/intake-ai/src/category-form-v2.ts','packages/intake-ai/src/category-form-v2-adapter.ts',
  'packages/intake-ai/src/category-form-v2-healing.ts','packages/intake-ai/src/category-form-v2-identity.ts','packages/intake-ai/src/validator.ts','packages/intake-ai/src/verifier.ts',
  'packages/intake-ai/src/source-completeness.ts','packages/generation/src/actor.ts'];

test('2024 Vampire hand-authored V2 compatibility input preserves complete source choices through the formal workflow',async()=>{
  const sourceFixturePath=resolve('tests/fixtures/forge-vampire-2024-srd521.json'),fixtureBefore=hash(readFileSync(sourceFixturePath));
  expect(vampire2024.edition).toBe('2024');expect(hash(vampire2024.source)).toBe('fa4306f92887058775d167f201e7c96e19de45f4dd545482e1917bad9a40c2b5');
  const implementationHashes=Object.fromEntries(implementationPaths.map(path=>[path,hash(readFileSync(resolve(path)))]));
  const run=await runVampire2024FormalChain(),inspection=inspectVampire2024Form(run.plan),prepared=run.result.prepared,actor=prepared?.actors[0]?.artifact as any;
  const visible=actor?plain([actor.system?.details?.biography?.value,...actor.items.map((item:any)=>item.system?.description?.value??'')].join('\n')):'';
  const semanticChecks=[
    {rule:'Medium or Small choice',status:actor?(visible.includes('Medium or Small')?'PASS':'FAIL'):'NOT_EXECUTED'},
    {rule:'XP 10000 / 11500 in lair choice',status:actor?(/11,?500 in lair/iu.test(visible)?'PASS':'FAIL'):'NOT_EXECUTED'},
    {rule:'Legendary Resistance conditional 3/day or 4/day in Lair',status:actor?(/3\/Day, or 4\/Day in Lair/iu.test(visible)?'PASS':'FAIL'):'NOT_EXECUTED'},
    {rule:'Legendary Action Uses conditional 3 or 4 in Lair',status:actor?(/Legendary Action Uses: 3 \(4 in Lair\)/iu.test(visible)?'PASS':'FAIL'):'NOT_EXECUTED'},
  ];
  const directory=process.env.FORGE_VAMPIRE_2024_EVIDENCE_DIRECTORY;
  if(directory&&!existsSync(resolve(directory)))throw Error('The explicitly selected 2024 evidence directory must exist');
  const prefix='vampire-2024-current-chain-'+new Date().toISOString().replace(/[:.]/gu,'-');
  const contents:Record<string,string>={
    'source.md':vampire2024.source,'base-facts.json':JSON.stringify(vampire2024BaseFacts,null,2)+'\n',
    'new-contract-form.json':JSON.stringify(inspection.form,null,2)+'\n','new-contract-reply.json':JSON.stringify(inspection.reply,null,2)+'\n',
    'formal-report.json':JSON.stringify(run.result.report,null,2)+'\n','source-plan.json':JSON.stringify(run.plan,null,2)+'\n',
    'fake-transport.json':JSON.stringify({requests:run.requests,replies:run.replies,stages:run.stages,unexpectedRequests:run.unexpectedRequests},null,2)+'\n',
    'capability-inspection.json':JSON.stringify(inspection,null,2)+'\n',
  };
  const entry=run.result.report.actors[0];if(entry?.analysis.ir)contents['ir.json']=JSON.stringify(entry.analysis.ir,null,2)+'\n';
  if(entry?.generation?.markdown)contents['rendered.md']=entry.generation.markdown;
  if(actor){contents['actor.json']=JSON.stringify(actor,null,2)+'\n';contents['encounter.json']=serializeForgeEncounterPackage(prepared!.bundle);}
  const files=directory?Object.entries(contents).map(([suffix,text])=>{const path=join(directory,prefix+'.'+suffix);writeFileSync(path,text,{flag:'wx'});return{path,sha256:hash(text)};}):[];
  const receipt={edition:'2024',scope:'hand-authored-correct-input-interface-retest-not-a-real-model-accuracy-measurement',
    status:run.result.report.status==='ready_for_gm_review'&&semanticChecks.every(check=>check.status==='PASS')?'PASS':'FAIL',
    formalStatus:run.result.report.status,packageStatus:prepared?'prepared':'NOT_EXECUTED',sourceSemanticChecks:semanticChecks,
    sourceSha256:hash(vampire2024.source),sourceFixtureSha256:fixtureBefore,sourceUnitCount:run.plan.features.length,
    sourceInventory:run.plan.features.map(unit=>({unitId:unit.id,name:unit.name,section:unit.section,quoteSha256:hash(unit.quote)})),
    sourcePartition:run.partition?'EXACT_PHYSICAL_SOURCE_LINE_OWNERSHIP_FIXTURE':'EXISTING_PROGRAM_SPLIT',splitFailure:run.splitFailure,
    sourceCompletenessBoundaries:vampire2024Boundaries,modelHttp:run.modelHttp,fakeTransportCalls:run.requests.length,
    actualTransportStages:run.requests.map(payload=>payload.lines?'source':payload.template?'whole-feature':payload.source===run.plan.base.quote?'base':'unexpected-rejected'),
    baseStatus:inspection.baseStatus,baseFailure:inspection.baseFailure,inspectionStatus:'NOT_WHOLE_SOURCE_ACCEPTANCE',
    capabilityDiagnostics:inspection.diagnostics.map(({feature,...diagnostic}:any)=>diagnostic),
    sourceUnitsNotReachedInActualWholeRequest:run.requests.some(request=>request.template)?[]:run.plan.features.map(unit=>unit.name),
    runtimeAcceptance:'NOT_EXECUTED',officialActor:'reference-only-not-used-to-author-final-Actor',bunVersion:Bun.version,implementationHashes,files};
  expect(hash(readFileSync(sourceFixturePath))).toBe(fixtureBefore);expect(implementationHashes).toEqual(Object.fromEntries(implementationPaths.map(path=>[path,hash(readFileSync(resolve(path)))])));
  const receiptPath=directory?join(directory,prefix+'.receipt.json'):undefined;if(receiptPath)writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  console.log('2024 Vampire actual result: '+JSON.stringify({status:receipt.status,formalStatus:receipt.formalStatus,packageStatus:receipt.packageStatus,actualTransportStages:receipt.actualTransportStages,findings:run.result.report.findings,receiptPath,capabilityDiagnostics:receipt.capabilityDiagnostics}));
  expect(run.stages).toContainEqual(expect.objectContaining({stage:'assembly',status:'validated',processor:'program'}));
  expect(run.plan.features.map(unit=>({name:unit.name,section:String(unit.section)}))).toEqual(vampire2024.expectedUnits);
  // Record first, then enforce the actual outcome. A diagnostic proposal or
  // preserved source in a report can never substitute for generated behavior.
  expect(receipt.status).toBe('PASS');
});
