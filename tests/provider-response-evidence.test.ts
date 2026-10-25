import { describe, expect, test } from 'bun:test';
import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { localizationHash, localizationRequest, localizationText } from '@fvtt-json-generator/contracts/localization';
import { OpenAICompatibleMonsterIntakeProvider, type ProviderResponseEvidence, type IntakeProviderAuditEvent } from '@fvtt-json-generator/intake-ai/provider';
import { createReviewedTranslationService } from '@fvtt-json-generator/intake-ai/localization';
import { createEncounterIntakeProviders } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import { buildValidLurkerIr, LURKER_SOURCE } from '../src/core/intake/__tests__/fixtures/lurker';
import yaml from 'js-yaml';

// Newly constructed malformed replies. The missing historical Mezzoloth reply
// has not been recovered and none of these fixtures claim to reproduce it.
const connection = { authMode: 'api-key' as const, baseUrl: 'https://evidence.example/v1', apiKey: 'fixture-private-key',
  model: 'fixture-model', reviewModel: 'fixture-model', timeoutMs: 1_000, repairTimeoutMs: 1_000 };
const response = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const source = 'One complete source rule.';
const extraction = { source, sourceSha256: sha256(source), candidate: { id: 'case-1', label: 'Fixture', start: 0, end: source.length, quote: source } };

describe('explicit private response evidence before rejection', () => {
  test('captures malformed JSON before parsing; redacts credentials without exposing raw request or audit data', async () => {
    const events: ProviderResponseEvidence[] = [], audits: IntakeProviderAuditEvent[] = [];
    const raw = `invalid JSON fixture-private-key Bearer another-token {"cookie":"session-value","secret":"other-value"} ${connection.baseUrl}`;
    let calls = 0;
    const provider = new OpenAICompatibleMonsterIntakeProvider({ ...connection, audit: event => audits.push(event),
      responseEvidence: { record: event => { events.push(event); } },
      httpClient: async () => { calls++; return response(raw); } });
    await expect(provider.extract(extraction)).rejects.toThrow();
    expect(calls).toBe(2); // Existing bounded parser retry, unchanged by evidence capture.
    expect(events).toHaveLength(2);
    expect(events.map(event => event.attempt)).toEqual([1, 2]);
    expect(events[1]!.requestHash).not.toBe(events[0]!.requestHash);
    const event = events[0]!;
    expect(event.stage).toBe('extract');
    expect(event.sourceHash).toBe(sha256(source));
    expect(event.responseHash).toBe(sha256(raw));
    expect(event.requestHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(event.redacted).toBe(true);
    expect(event.truncated).toBe(false);
    for (const sensitive of ['fixture-private-key', 'another-token', 'session-value', 'other-value', connection.baseUrl, source]) {
      expect(JSON.stringify(event)).not.toContain(sensitive);
      expect(JSON.stringify(audits)).not.toContain(sensitive);
    }
    for (const audit of audits) for (const field of ['content', 'request', 'response', 'messages']) expect(audit).not.toHaveProperty(field);
    expect(JSON.stringify(audits)).not.toContain('invalid JSON');
  });

  test('captures the complete token-corrupt translation before restore rejects it and binds the actual batch', async () => {
    const events: ProviderResponseEvidence[] = [];
    const input = localizationRequest(sha256('source one'), [localizationText('body', '<p>Damage 3d6.</p>')]);
    const raw = JSON.stringify({ texts: [{ id: input.texts[0]!.id, text: '伤害⟦0⟧⟦0⟧。' }] });
    let calls = 0;
    const service = createReviewedTranslationService({ ...connection, responseEvidence: { record: event => { events.push(event); } },
      httpClient: async () => { calls++; return response(raw); } });
    await expect(service.translate(input)).rejects.toThrow();
    expect(calls).toBe(1);
    expect(events[0]).toMatchObject({ stage: 'translate', sourceHash: input.sourceHash,
      localizationRequestHash: localizationHash(input), textIds: [input.texts[0]!.id], content: raw, attempt: 1,
      responseHash: sha256(raw), truncated: false, redacted: false });
    const changed = { ...input, sourceHash: sha256('source two') };
    await expect(service.translate(changed)).rejects.toThrow();
    expect(events[1]!.localizationRequestHash).not.toBe(events[0]!.localizationRequestHash);
    expect(events[1]!.sourceHash).not.toBe(events[0]!.sourceHash);
  });

  test('storage rejection and a broken failure reporter never retry or reject a valid provider response', async () => {
    let calls = 0, failed = 0;
    const valid = { schemaVersion: 1 as const, candidates: [] };
    const provider = new OpenAICompatibleMonsterIntakeProvider({ ...connection,
      responseEvidence: { record: async () => { throw new Error('private filesystem error'); },
        onStorageFailure: () => { failed++; throw new Error('private diagnostic error'); } },
      httpClient: async () => { calls++; return response(JSON.stringify(valid)); } });
    expect(await provider.discover({ source, sourceSha256: sha256(source), chunkStart: 0, chunkEnd: source.length })).toEqual(valid);
    expect(calls).toBe(1);
    expect(failed).toBe(1);
  });

  test('capture is disabled unless an owner supplies a sink; ordinary audits remain safe', async () => {
    const audits: IntakeProviderAuditEvent[] = [];
    const provider = new OpenAICompatibleMonsterIntakeProvider({ ...connection, audit: event => audits.push(event),
      httpClient: async () => response('bad response with private model text') });
    await expect(provider.extract(extraction)).rejects.toThrow();
    expect(JSON.stringify(audits)).not.toContain('private model text');
    expect(Object.keys(provider)).not.toContain('responses');
  });

  test('the actual Forge provider factory forwards one opt-in sink to extraction, automation and localization without enabling review', async () => {
    const originalFetch = globalThis.fetch;
    const events: ProviderResponseEvidence[] = [];
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return response('constructed bad reply'); }) as unknown as typeof fetch;
    try {
      const providers = createEncounterIntakeProviders({ ...connection, autoCorrect:true, responseEvidence: { record: event => { events.push(event); } } });
      const stagedSource='Proof CR 1\nMedium construct\nArmor Class 15\nHit Points 20\nSpeed 30 ft.\nSTR 10 DEX 10 CON 10 INT 10 WIS 10 CHA 10\nChallenge 1\nActions\nSlam. One target takes 3 damage.\n';
      await expect(providers.provider.extract({source:stagedSource,sourceSha256:sha256(stagedSource),candidate:{id:'proof',label:'Proof',start:0,end:stagedSource.length,quote:stagedSource}})).rejects.toThrow();
      await expect(providers.automationProvider.generate({source:LURKER_SOURCE,actors:[{key:'actor-1',source:LURKER_SOURCE,
        ir:buildValidLurkerIr(),artifact:{items:[]}}]})).rejects.toThrow();
      const input = localizationRequest(sha256(source), [localizationText('body', 'A rule.')]);
      await expect(providers.translationService.translate(input)).rejects.toThrow();
      expect(events.map(event => event.stage)).toEqual(['extract', 'automation-generate', 'translate']);
      expect(calls).toBe(3); // The default full-IR request has no hidden staged correction.
      expect(events[0]).toMatchObject({sourceHash:sha256(stagedSource),attempt:1,content:'constructed bad reply'});
      expect(events[2]!.sourceHash).toBe(sha256(source));
      expect(events[1]).toMatchObject({sourceHash:sha256(LURKER_SOURCE),attempt:1,content:'constructed bad reply',truncated:false,redacted:false});
      for(const event of events)expect(event.requestHash).toMatch(/^[0-9a-f]{64}$/u);
    } finally { globalThis.fetch = originalFetch; }
  });
  for(const legacy of [false,true])test(legacy
    ? 'explicit legacy BW records its base and whole-feature requests and preserves both operations'
    : 'the default Forge factory records one full-IR request and preserves both AI-authored operations', async () => {
    const originalFetch=globalThis.fetch, events:ProviderResponseEvidence[]=[],stages:any[]=[],payloads:any[]=[];
    const source='Proof CR 1\nMedium construct, unaligned\nArmor Class 15\nHit Points 20\nSpeed 30 ft.\nSTR 10 DEX 10 CON 10 INT 10 WIS 10 CHA 10\nChallenge 1\nActions\nSlam. Melee Weapon Attack: +2 to hit, reach 5 ft., one target. Hit: 3 (1d6) bludgeoning damage.\nDream Snare (Recharge 5-6). Each creature within 20 feet must make a DC 12 Wisdom saving throw or fall asleep until the end of its next turn.\n';
    const facts={schemaVersion:1,creature:{identity:{name:'Proof',size:'medium',creatureType:'construct',alignment:'unaligned'},
      abilities:{str:10,dex:10,con:10,int:10,wis:10,cha:10},attributes:{ac:15,hp:{value:20},movement:{walk:30},cr:1},
      saves:{},skills:{},defenses:{resistances:[],immunities:[],vulnerabilities:[],conditionImmunities:[]},senses:{},languages:{values:[]}},uncertainties:[]};
    const slam=source.slice(source.indexOf('Slam.'),source.indexOf('\nDream Snare'));
    const snare=source.slice(source.indexOf('Dream Snare')).trim();
    const fullIr={...facts,source:{sha256:sha256(source),length:source.length},claims:[],coverage:[],
      creature:{...facts.creature,traits:[],bonusActions:[],reactions:[],legendaryActions:[],actions:[
        {name:'Slam',description:slam,activityType:'utility',executionMode:'native-with-gm',nativeRuleText:slam,manualRemainder:slam,
          sourceOperations:[{id:'slam',name:'Slam attack',type:'attack',relationship:'primary',sourceText:slam,
            attack:{type:'mwak',toHit:2,reach:5},damage:[{formula:'1d6',type:'bludgeoning',relationship:'base'}],proof:{}}]},
        {name:'Dream Snare (Recharge 5-6)',description:snare,activityType:'utility',executionMode:'native-with-gm',nativeRuleText:snare,manualRemainder:'fall asleep until the end of its next turn',recharge:[5,6],
          sourceOperations:[{id:'snare',name:'Dream Snare save',type:'save',relationship:'primary',sourceText:snare,
            save:{dc:12,abilities:['wis'],choice:'single',outcome:'none'},range:20,proof:{}}]},
      ]}};
    const before=structuredClone(fullIr);
    let calls=0;
    globalThis.fetch=(async(_url:unknown,init:any)=>{
      calls++;const payload=JSON.parse(JSON.parse(init.body).messages[1].content);payloads.push(payload);
      if(!payload.template)return response(JSON.stringify(legacy?facts:fullIr));
      const form=yaml.load(payload.template) as any;
      Object.assign(form.动作[0],{攻击:{类型:'近战武器攻击',命中加值:2,触及尺:5,射程尺:null,远射程尺:null,目标数量:1,目标限制:null},
        伤害:[{公式:'1d6',伤害类型:'bludgeoning',生效条件:null,倍率:1,成功时倍率:null}]});
      Object.assign(form.动作[1],{豁免:{DC:12,属性:['wis'],成功结果:'无效果',目标限制:'Each creature within 20 feet'},恢复方式:'Recharge 5-6',特殊规则:'fall asleep until the end of its next turn',距离:[{用途:'目标距离',尺:20,条件:null}]});
      return response(JSON.stringify({markdown:yaml.dump(form,{noRefs:true,lineWidth:-1})}));
    }) as unknown as typeof fetch;
    try{
      const sink={record:(event:ProviderResponseEvidence)=>{events.push(event);}};
      const provider=legacy
        ?new OpenAICompatibleMonsterIntakeProvider({...connection,maxAttempts:1,stagedExtraction:{baseMode:'facts',featureMode:'whole-v2',maxCorrections:0,onStage:event=>{stages.push(event);}},responseEvidence:sink})
        :createEncounterIntakeProviders({...connection,onExtractionStage:event=>{stages.push(event);},responseEvidence:sink}).provider;
      const ir=await provider.extract({source,sourceSha256:sha256(source),candidate:{id:'proof',label:'Proof',start:0,end:source.length,quote:source}});
      expect(calls).toBe(legacy?2:1);expect(events).toHaveLength(legacy?2:1);expect(events.every(event=>event.stage==='extract')).toBe(true);
      expect(ir.creature.actions).toHaveLength(2);
      expect(ir.creature.actions[0]).toMatchObject({name:'Slam',executionMode:'native-with-gm',sourceOperations:[{type:'attack',attack:{toHit:2}}]});
      expect(ir.creature.actions[1]).toMatchObject({name:'Dream Snare (Recharge 5-6)',executionMode:'native-with-gm',sourceOperations:[{type:'save',save:{dc:12,abilities:['wis']}}],recharge:[5,6]});
      expect(ir.creature.actions[1]!.appliedConditions).toBeUndefined();
      expect(ir.creature.actions[1]!.description).toContain('or fall asleep until the end of its next turn.');
      expect(ir.creature.actions[1]!.damage).toBeUndefined();expect(ir.creature.actions[1]!.manualRemainder).toContain('fall asleep');
      if(legacy){
        expect(stages.filter(event=>event.stage==='feature'&&event.unitId!=='all'&&event.status==='validated'&&event.processor==='program')).toHaveLength(2);
        expect(stages.filter(event=>event.stage==='feature').some(event=>event.processor==='model'&&event.status==='request')).toBe(true);
        expect(stages.at(-1)).toMatchObject({stage:'assembly',status:'validated',plannedCalls:2,retryCalls:0});
      }else{
        expect(stages).toEqual([]);expect(payloads[0]).not.toHaveProperty('template');expect(payloads[0]).not.toHaveProperty('sourceSpellGrants');
        expect(ir as unknown).toEqual(before);expect(fullIr).toEqual(before);
        expect(events[0]).toMatchObject({sourceHash:sha256(source),content:JSON.stringify(before),attempt:1});
      }
    }finally{globalThis.fetch=originalFetch;}
  });
});
