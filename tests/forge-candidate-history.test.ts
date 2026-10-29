import {afterEach, beforeEach, describe, expect, setSystemTime, test} from 'bun:test';
import yaml from 'js-yaml';
import {isSourceCandidateReview, type SourceCandidateReview} from '@fvtt-json-generator/models/source-operations';
import {normalizeMonsterIntakeProposal, OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import type {MonsterIntakeIR} from '@fvtt-json-generator/intake-ai/types';
import {analyzeBrowserActorIntakeDraft, generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {hashArtifact, hashSource, type ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import {generateActorArtifact} from '@fvtt-json-generator/workflows/generation-pipeline';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows/single-file-conversion';
import {YamlParser} from '@fvtt-json-generator/parser/yaml';
import {buildValidLurkerIr} from '../src/core/intake/__tests__/fixtures/lurker';
import captured from './fixtures/forge-current-input-recovery.json';

type Scope = 'actor' | 'feature' | 'spell-group';
const scopes: Scope[] = ['actor', 'feature', 'spell-group'];
const reviewCode = 'GEN_SOURCE_CANDIDATE_REVIEW_REQUIRED';
const sourceId = 'actor:v1:8af7aaf9-3545-4d8c-8b91-2a63b0081555' as ForgeSourceId;
const noCall = async (): Promise<never> => { throw Error('Candidate history checks forbid model service calls'); };
const provider = {providerName:'frozen-candidate-history', extractionModel:'frozen', reviewModel:'disabled',
  discover:noCall, extract:noCall, review:noCall, repair:noCall};
const unicorn = captured.cases.find(entry => entry.id === 'unicorn')!;
const base = () => normalizeMonsterIntakeProposal(unicorn.source, structuredClone(unicorn.ir) as MonsterIntakeIR);
const history = (): SourceCandidateReview => ({version:1, findings:[],
  proposal:{prior:{source:'original proposal'}, original:{evidence:[{start:-1,end:-1,quote:'original coordinates'}]}}});
const unresolved = (): SourceCandidateReview => ({...history(), findings:[{
  code:'SOURCE_RULE_REQUIRES_GM', path:'/creature/traits/0/description',
  message:'Legendary Resistance remains subject to the complete source rule and GM adjudication.',
}]});
function carrier(ir: MonsterIntakeIR, scope: Scope) {
  return scope === 'actor' ? ir.creature : scope === 'feature' ? ir.creature.traits[0]! : ir.creature.spellcasting![0]!;
}
async function canonical(content: string, reviewDelivery: 'document' | 'external') {
  return generateActorArtifact({parsed:new YamlParser().parse(content), sourceText:content, route:'chinese',
    fvttVersion:'14', effectProfile:'core', translationService:null, iconOptions:{mode:'off'}, reviewDelivery});
}
async function formal(source: string, ir: MonsterIntakeIR, name: string) {
  const input = {source,sourceName:name,sourceScope:'single' as const,sourceId,requestId:'candidate-history-'+name,
    fvttVersion:'14.368',systemVersion:'5.3.3'};
  const analysis = analyzeBrowserActorIntakeDraft(input, ir, provider);
  const generated = await generateBrowserActorIntakeCandidate(input, analysis, provider);
  return {analysis, generated, actor:generated.actorProjection as any};
}
function expectNoReviewFlags(actor: any) {
  expect(actor.flags?.fvttJsonGenerator?.candidateReview).toBeUndefined();
  for (const item of actor.items) {
    expect(item.flags?.fvttJsonGenerator?.candidateReview).toBeUndefined();
    expect(item.system.description.value).not.toContain('待审候选：');
  }
}
function directSource(scope: Scope, review: unknown, counters?: unknown) {
  const ir = base(), doc = yaml.load(renderMonsterIntakeMarkdown(ir).slice(4,-4)) as Record<string, any>;
  if (scope === 'actor') {
    if (review !== undefined) doc['intake-candidate-review'] = review;
  }
  else {
    const name = scope === 'feature' ? ir.creature.traits[0]!.name : ir.creature.spellcasting![0]!.featureName;
    const entry = Object.values(doc).flatMap(value => Array.isArray(value) ? value : [])
      .find(value => value && typeof value === 'object' && value.名称 === name);
    expect(entry, name).toBeDefined();
    if (review !== undefined) entry.candidateReview = review;
    if (counters !== undefined) entry.candidateCounters = counters;
  }
  return '---\n'+yaml.dump(doc, {noRefs:true,lineWidth:120})+'---\n';
}

describe('candidate history uses the existing closed inert data contract', () => {
  beforeEach(() => setSystemTime(new Date('2026-10-29T00:00:00Z')));
  afterEach(() => setSystemTime());
  test('empty findings are valid history while all other metadata limits remain enforced', () => {
    expect(isSourceCandidateReview(history())).toBe(true);
    expect(isSourceCandidateReview(unresolved())).toBe(true);
    const cycle: any = {}; cycle.self = cycle;
    let deep: unknown = null;
    for (let index=0; index<42; index++) deep = {nested:deep};
    const invalid: unknown[] = [null, {}, {...history(),version:2}, {...history(),unknown:true},
      {version:1,findings:[]}, {...history(),findings:null}, {...history(),findings:'not a list'},
      {...history(),findings:[{code:'',path:'/creature',message:'invalid code'}]},
      {...history(),findings:[{...unresolved().findings[0],executable:true}]},
      {...history(),findings:Array.from({length:4097},()=>({...unresolved().findings[0]}))},
      {...history(),proposal:()=>undefined}, {...history(),proposal:Number.NaN}, {...history(),proposal:cycle},
      {...history(),proposal:new Date(0)}, {...history(),proposal:JSON.parse('{"constructor":1}')},
      {...history(),proposal:deep}, {...history(),proposal:Array(20001).fill(null)}];
    for (const value of invalid) expect(isSourceCandidateReview(value)).toBe(false);
    expect(isSourceCandidateReview({...history(),proposal:Object.create(null)})).toBe(true);
  });

  for (const scope of scopes) test(scope+' history stays in analysis without entering canonical source or either Actor delivery', async () => {
    const ir = base(), review = history(); carrier(ir,scope).candidateReview = review;
    const before = structuredClone(ir), cleanMarkdown = renderMonsterIntakeMarkdown(base());
    expect(validateMonsterIntakeIR(unicorn.source,ir).blocking).toEqual([]);
    const result = await formal(unicorn.source, ir,scope);
    expect(result.analysis.status).toBe('ready_to_generate');
    expect(result.analysis.findings).toEqual([]);
    expect(carrier(result.analysis.ir!,scope).candidateReview).toEqual(review);
    expect(result.generated.candidateAvailable).toBe(true);
    expect(result.generated.intakeVerificationStatus).toBe('accepted');
    expect(result.generated.findings).toEqual([]);
    expect(ir).toEqual(before);
    const markdown = renderMonsterIntakeMarkdown(result.analysis.ir!);
    expect(markdown).toBe(cleanMarkdown);
    for (const delivery of ['document','external'] as const) {
      const actual = await canonical(markdown,delivery), control = await canonical(cleanMarkdown,delivery);
      expect(actual.diagnostics.filter(entry => entry.code === reviewCode)).toEqual([]);
      expect(actual.verification.status).toBe(control.verification.status);
      expect(actual.actor).toEqual(control.actor);
      expectNoReviewFlags(actual.actor);
    }
    const single = await convertMarkdownContentToJson({content:markdown,fvttVersion:'14',effectProfile:'core',
      translationService:null,iconOptions:{mode:'off'}});
    expect(single.diagnostics.filter(entry => entry.code === reviewCode)).toEqual([]);
    expect(single.rawJson).toEqual((await canonical(cleanMarkdown,'document')).actor);
  });

  for (const scope of scopes) test('direct canonical YAML '+scope+' history cannot create unresolved diagnostics or review flags', async () => {
    const markdown = directSource(scope,history()), clean = renderMonsterIntakeMarkdown(base());
    for (const delivery of ['document','external'] as const) for (const lineEnding of ['\n','\r\n']) {
      const actual = await canonical(markdown.replaceAll('\n',lineEnding),delivery), control = await canonical(clean,delivery);
      expect(actual.actor).toEqual(control.actor);
      expect(actual.diagnostics.filter(entry => entry.code === reviewCode)).toEqual([]);
      expect(actual.verification.status).toBe(control.verification.status);
      expectNoReviewFlags(actual.actor);
    }
  });

  const invalidDirectMetadata: Array<{field:'candidateReview'|'candidateCounters'; label:string; value:unknown}> = [
    {field:'candidateReview',label:'wrong version',value:{version:2,findings:[],proposal:null}},
    {field:'candidateReview',label:'missing findings',value:{version:1,proposal:null}},
    {field:'candidateReview',label:'wrong record type',value:'bad'},
    {field:'candidateReview',label:'wrong findings type',value:{version:1,findings:null,proposal:null}},
    {field:'candidateReview',label:'unknown field',value:{...history(),unsupported:true}},
    {field:'candidateReview',label:'explicit null',value:null},
    {field:'candidateCounters',label:'string without review',value:'bad'},
    {field:'candidateCounters',label:'invalid array entry without review',value:['bad']},
    {field:'candidateCounters',label:'wrong count type without review',value:[{name:'Counter',max:'3',recovery:'day'}]},
    {field:'candidateCounters',label:'explicit null without review',value:null},
  ];
  for (const scope of ['feature','spell-group'] as const) for (const delivery of ['document','external'] as const)
    for (const {field,label,value} of invalidDirectMetadata) test('direct YAML '+scope+' '+field+' '+label+' retains its value and Actor in '+delivery, async () => {
      const ir = base(), name = scope === 'feature' ? ir.creature.traits[0]!.name : ir.creature.spellcasting![0]!.featureName;
      const control = await canonical(directSource(scope,undefined),delivery);
      const controlAction = Object.values(control.canonical.compatibilitySource.structuredActions??{}).flatMap(actions => actions??[])
        .find(action => action.name === name)!;
      let lfAction: unknown;
      for (const lineEnding of ['\n','\r\n']) {
        const source = directSource(scope,field === 'candidateReview' ? value : undefined,field === 'candidateCounters' ? value : undefined)
          .replaceAll('\n',lineEnding);
        const actual = await canonical(source,delivery);
        const action = Object.values(actual.canonical.compatibilitySource.structuredActions??{}).flatMap(actions => actions??[])
          .find(entry => entry.name === name)!;
        expect(isSourceCandidateReview(action.candidateReview)).toBe(true);
        expect(action.candidateReview!.findings).toContainEqual(expect.objectContaining({code:'FIELD_PROJECTION_INCOMPLETE',path:field}));
        expect(action.candidateReview!.proposal).toMatchObject({value});
        if (field === 'candidateCounters') expect(action.candidateCounters).toBeUndefined();
        expect(action.describe).toBe(controlAction.describe);
        expect(actual.diagnostics.some(entry => entry.code === reviewCode)).toBe(true);
        expect(actual.diagnostics.some(entry => entry.code === 'GENERATION_CHECK_INCOMPLETE')).toBe(false);
        expect(actual.verification.status).toBe('needs_review');
        const item = actual.actor.items.find((entry: any) => entry.name === name);
        const expected = structuredClone(control.actor), expectedItem = expected.items.find((entry: any) => entry.name === name);
        if (delivery === 'document') {
          expectedItem.flags??={}; expectedItem.flags.fvttJsonGenerator??={};
          expectedItem.flags.fvttJsonGenerator.candidateReview = action.candidateReview;
          expectedItem.system.description.value = '<p><strong>待审候选：规则检查未通过，请对照完整原文核对后决定使用。</strong></p>'+expectedItem.system.description.value;
        } else expectNoReviewFlags(actual.actor);
        expect(actual.actor).toEqual(expected);
        if (lineEnding === '\n') lfAction = action;
        else expect<unknown>(action).toEqual(lfAction);
      }
    });

  test('direct YAML legal standalone counters and empty counter lists preserve their declared meaning', async () => {
    const counters = [{name:'Legendary Resistance (3/Day)',max:3,recovery:'day'}];
    for (const review of [undefined,history()]) for (const delivery of ['document','external'] as const) {
      const actual = await canonical(directSource('feature',review,counters),delivery);
      const item = actual.actor.items.find((entry: any) => entry.name === counters[0]!.name);
      const activities = Object.values<any>(item.system.activities).filter(activity => activity.uses?.max === '3');
      expect(activities).toHaveLength(1);
      expect(activities[0].consumption.targets).toEqual([{type:'activityUses',value:'1'}]);
      expect(activities[0].description.chatFlavor).toContain('day');
      expect(actual.diagnostics.filter(entry => entry.code === reviewCode)).toEqual([]);
      expectNoReviewFlags(actual.actor);
      const empty = await canonical(directSource('feature',review,[]),delivery);
      const action = Object.values(empty.canonical.compatibilitySource.structuredActions??{}).flatMap(actions => actions??[])
        .find(entry => entry.name === counters[0]!.name)!;
      expect(action.candidateCounters).toEqual([]);
      expect(empty.actor).toEqual((await canonical(directSource('feature',undefined),delivery)).actor);
      expect(empty.diagnostics.filter(entry => entry.code === reviewCode)).toEqual([]);
    }
  });

  for (const scope of scopes) test(scope+' nonempty findings remain explicit and preserve the complete Actor in both deliveries', async () => {
    const ir = base(), review = unresolved(); carrier(ir,scope).candidateReview = review;
    const markdown = renderMonsterIntakeMarkdown(ir), before = structuredClone(ir);
    expect(markdown).toContain(review.findings[0]!.message);
    for (const delivery of ['document','external'] as const) for (const lineEnding of ['\n','\r\n']) {
      const result = await canonical(markdown.replaceAll('\n',lineEnding),delivery), control = await canonical(renderMonsterIntakeMarkdown(base()),delivery);
      expect(result.actor.items).toHaveLength(control.actor.items.length);
      expect(result.diagnostics.some(entry => entry.code === reviewCode)).toBe(true);
      expect(result.verification.status).toBe('needs_review');
      if (delivery === 'external') {
        expectNoReviewFlags(result.actor);
        expect(result.actor).toEqual(control.actor);
      } else if (scope === 'actor') expect(result.actor.flags.fvttJsonGenerator.candidateReview).toEqual(review);
      else {
        const name = scope === 'feature' ? ir.creature.traits[0]!.name : ir.creature.spellcasting![0]!.featureName;
        const item = result.actor.items.find((entry: any) => entry.name === name);
        expect(item.flags.fvttJsonGenerator.candidateReview).toEqual(review);
        expect(item.system.activities).toEqual(control.actor.items.find((entry: any) => entry.name === name).system.activities);
      }
    }
    expect(ir).toEqual(before);
  });

  for (const scope of scopes) test(scope+' malformed metadata is reported without cancelling the Actor or losing its abilities', async () => {
    for (const review of [{...history(),version:2},{version:1,proposal:{original:'missing findings'}},
      {...unresolved(),findings:[{...unresolved().findings[0],unsupported:true}]}]) {
      const ir = base(); carrier(ir,scope).candidateReview = review as SourceCandidateReview;
      const before = structuredClone(ir), result = await formal(unicorn.source,ir,'invalid-'+scope);
      expect(result.analysis.status).toBe('needs_review');
      expect(result.analysis.findings.some(entry => entry.code === 'INVALID_STRUCTURE' && entry.path?.endsWith('/candidateReview'))).toBe(true);
      expect<unknown>(carrier(result.analysis.ir!,scope).candidateReview).toEqual(review);
      expect(result.generated.candidateAvailable).toBe(true);
      expect(result.generated.findings.length).toBeGreaterThan(0);
      const control = await formal(unicorn.source,base(),'invalid-control');
      expect(result.actor).toEqual(control.actor);
      expect(ir).toEqual(before);
    }
  });

  test('source-declared manual resistance counts and consumption survive both empty history and nonempty findings', async () => {
    for (const review of [history(),unresolved()]) {
      const ir = base(), feature = ir.creature.traits[0]!;
      expect(feature.name).toBe('Legendary Resistance (3/Day)');
      expect(unicorn.source).toContain('Legendary Resistance (3/Day)');
      feature.candidateReview = review;
      feature.candidateCounters = [{name:feature.name,max:3,recovery:'day'}];
      for (const delivery of ['document','external'] as const) {
        const result = await canonical(renderMonsterIntakeMarkdown(ir),delivery);
        const item = result.actor.items.find((entry: any) => entry.name === feature.name);
        const counters = Object.values<any>(item.system.activities).filter(activity => activity.uses?.max === '3');
        expect(counters).toHaveLength(1);
        expect(counters[0].consumption).toMatchObject({targets:[{type:'activityUses',value:'1'}],spellSlot:false});
        expect(counters[0].description.chatFlavor).toContain('day');
        expect(result.actor.system.resources.legres).toEqual({max:3,spent:0});
      }
    }
  });

  test('unrelated complete Actor without review metadata retains its frozen identity', async () => {
    const markdown = renderMonsterIntakeMarkdown(buildValidLurkerIr());
    const actual = await canonical(markdown,'document');
    expect<string>(hashArtifact(actual.actor)).toBe('c2528e82171761db39d8f45e3580b8689e351e21949be2a05f0fbfecfa0850b8');
    expectNoReviewFlags(actual.actor);
    expect((await canonical(markdown,'external')).actor).toEqual(actual.actor);
  });

  for (const record of captured.cases) test(record.id+' original provider reply retains the original proposal and old coordinates after successful relocation', async () => {
    const before = JSON.stringify(record); let requests = 0;
    const actual = new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',baseUrl:'https://offline.invalid/v1',
      apiKey:'fake-only',model:'frozen',reviewModel:'disabled',timeoutMs:1000,repairTimeoutMs:1000,maxAttempts:1,
      httpClient:async () => { requests++; return new Response(JSON.stringify({choices:[{message:{content:record.rawReply}}]})); }});
    const ir = await actual.extract({source:record.source,sourceSha256:record.sourceSha256,
      candidate:{id:record.id,label:record.id,start:0,end:record.source.length,quote:record.source}});
    expect(validateMonsterIntakeIR(record.source,ir).blocking).toEqual([]);
    expect(ir.creature.candidateReview?.findings).toEqual([]);
    const original = (ir.creature.candidateReview!.proposal as any).original;
    expect(original).toEqual(JSON.parse(record.rawReply));
    expect(original.creature.traits[0].evidence[0]).toMatchObject({start:-1,end:-1});
    expect(ir.creature.traits[0]!.evidence![0]!.start).toBeGreaterThanOrEqual(0);
    const result = await formal(record.source,ir,record.id+'-raw');
    const control = await formal(record.source,normalizeMonsterIntakeProposal(record.source,structuredClone(record.ir) as MonsterIntakeIR),record.id+'-draft');
    expect(result.analysis.status).toBe('ready_to_generate');
    expect(result.analysis.findings).toEqual([]);
    expect(result.generated.findings).toEqual([]);
    expect(result.generated.intakeVerificationStatus).toBe('accepted');
    expect(result.generated.candidateAvailable).toBe(true);
    expect(result.actor).toEqual(control.actor);
    expect(result.analysis.ir!.creature.candidateReview).toEqual(ir.creature.candidateReview);
    expectNoReviewFlags(result.actor);
    const markdown = renderMonsterIntakeMarkdown(result.analysis.ir!);
    expect(markdown).not.toContain('intake-candidate-review');
    const doc = await canonical(markdown,'document');
    expect(doc.diagnostics.filter(entry => entry.code === reviewCode)).toEqual([]);
    expectNoReviewFlags(doc.actor);
    expect(requests).toBe(1);
    expect<string>(hashSource(record.rawReply)).toBe(record.rawReplySha256);
    expect(JSON.stringify(record)).toBe(before);
  });
});
