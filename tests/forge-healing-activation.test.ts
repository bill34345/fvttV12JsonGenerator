import { describe, expect, test } from 'bun:test';
import corpus from './fixtures/forge-iterate50-round11-cases.json';
import providerReplies from './fixtures/forge-healing-provider-replies.json';
import regenerate from './fixtures/forge-regenerate-healing.json';
import {runStagedMonsterExtraction} from '../packages/intake-ai/src/staged-extraction';
import { chain, modelReply, ordinary, request, requireAcceptedChain, staged } from './helpers/forge-semantic-chain';
import { anchorIrEvidence } from '../packages/intake-ai/src/orchestrator';
import { validateMonsterIntakeIR } from '../packages/intake-ai/src/validator';
import { stagedFeatureMechanics } from '../packages/intake-ai/src/staged-feature-mechanics';
import { assembleStagedFeature } from '../packages/intake-ai/src/staged-extraction';
import { splitStagedMonsterSource } from '../packages/intake-ai/src/staged-source';
import { verifyMonsterIntake } from '../packages/intake-ai/src/verifier';

const periapt = (): any => structuredClone(corpus.cases.find(c => c.id === 'r20r-periapt-of-health'));
const reply = (c: any): any => {
  const ir = modelReply(c);
  ir.creature.traits[0].uses = structuredClone(c.features[0].uses);
  return ir;
};
function wording(from: string, to: string): any {
  const c = periapt(), f = c.features[0];
  f.text = f.text.replace(from, to);
  f.legacy.nativeRuleText = f.text;
  f.legacy.manualRemainder = f.text;
  f.legacy.healing.target.special = f.legacy.healing.target.special.replace(from, to);
  c.units.find((u: any) => u.destination === 'feature').text = f.text + '\n';
  c.source = c.units.map((u: any) => u.text).join('');
  return c;
}

describe('fixed healing activation', () => {
  test('frozen real provider Utility with title in evidence restores the complete healing action', async () => {
    const c=periapt(),raw:any=structuredClone(providerReplies.ordinaryPeriaptIr);
    const before=validateMonsterIntakeIR(c.source,raw,{coverageRange:request(c.source).candidate});
    expect(before.blocking.some(f=>f.code==='SOURCE_BASIC_OPERATION_OMITTED')).toBe(true);
    const r=await chain(c,()=>ordinary(c,raw));requireAcceptedChain(r);
    const item=r.actor.items[0],acts:any[]=Object.values(item.system.activities);
    expect(r.ir.creature.traits[0]!.description).toBe(c.features[0].text);
    expect(acts).toHaveLength(1);expect(acts[0].type).toBe('heal');expect(acts[0].activation.type).toBe('action');
    expect(acts[0].healing).toMatchObject({number:2,denomination:4,bonus:'2'});
    expect(acts[0].target.affects.type).toBe('self');expect(item.system.uses.max).toBe('1');
    expect(item.system.uses.recovery).toEqual([{period:'dawn',type:'recoverAll'}]);
    expect(acts[0].consumption.targets[0].value).toBe('1');
  });

  test('real provider missing-title presentation cannot erase an explicit conflicting healing amount or action', () => {
    const c=periapt();
    for(const conflict of ['amount','action','unproven-body']as const){
      const raw:any=structuredClone(providerReplies.ordinaryPeriaptIr);
      if(conflict==='amount')raw.creature.traits[0].healing={formula:'99',type:'healing',target:{type:'self',count:1,special:'You'}};
      if(conflict==='action')raw.creature.traits[0].activationType='bonus';
      if(conflict==='unproven-body')raw.creature.traits[0].description='An unrelated pendant restores 99 Hit Points.';
      const ir=anchorIrEvidence(c.source,request(c.source).candidate,raw);
      expect(validateMonsterIntakeIR(c.source,ir).blocking.length,conflict).toBeGreaterThan(0);
      if(conflict==='amount')expect(ir.creature.traits[0]!.healing!.formula).toBe('99');
      if(conflict==='action')expect(ir.creature.traits[0]!.activationType).toBe('bonus');
    }
  });

  for(const [label,c]of [['single',periapt()],['two-event',structuredClone(regenerate.case)]]as const)
    test(`proven ${label} healing uses source facts without asking AI to re-propose them`,async()=>{
      const calls:string[]=[];
      const r=await chain(c,async()=>({ir:await runStagedMonsterExtraction(request(c.source),async call=>{
        calls.push(call.stage);await call.onAttempt(1);
        if(call.stage!=='base')throw Error('Proven healing unexpectedly requested a feature proposal');
        return{schemaVersion:1,creature:structuredClone(c.creature),uncertainties:[]};
      },{baseMode:'facts',featureMode:'auto'}),calls}));
      requireAcceptedChain(r);expect(calls).toEqual(['base']);
      const acts:any[]=Object.values(r.actor.items[0].system.activities);
      expect(acts.map(a=>a.type)).toEqual(label==='single'?['heal']:['heal','heal']);
    });

  test('frozen invalid provider healing proposals remain rejected by the strict assembler',()=>{
    for(const [c,proposal]of [[periapt(),providerReplies.stagedPeriapt],[structuredClone(regenerate.case),providerReplies.stagedRegenerate]]as const){
      const plan=splitStagedMonsterSource(request(c.source));
      expect(()=>assembleStagedFeature(plan,plan.features[0]!,proposal,c.creature.identity.name)).toThrow();
    }
  });
  for (const [label, timing, activation] of [
    ['frozen Magic action', 'a Magic action', 'action'],
    ['ordinary action', 'an action', 'action'],
    ['Bonus action', 'a Bonus action', 'bonus'],
  ] as const) for (const path of ['ordinary', 'staged']) test(`${label} survives ${path} with healing, target and dawn pool`, async () => {
    const c = wording('a Magic action', timing);
    const r = await chain(c, () => path === 'ordinary' ? ordinary(c, reply(c)) : staged(c));
    requireAcceptedChain(r);
    expect(r.ir.creature.traits[0]!.activationType).toBe(activation);
    expect(r.markdown).toContain(`激活: ${activation}`);
    expect(r.actor.items).toHaveLength(1);
    const item = r.actor.items[0], activities: any[] = Object.values(item.system.activities);
    expect(activities).toHaveLength(1);
    expect(activities[0].type).toBe('heal');
    expect(activities[0].activation.type).toBe(activation);
    expect(activities[0].healing).toMatchObject({ number: 2, denomination: 4, bonus: '2', types: ['healing'] });
    expect(activities[0].target.affects).toEqual({ type: 'self', count: '1', choice: false, special: c.features[0].legacy.healing.target.special });
    expect(item.system.uses).toEqual({ spent: 0, max: '1', recovery: [{ period: 'dawn', type: 'recoverAll' }] });
    expect(activities[0].consumption.targets).toEqual([{ type: 'itemUses', target: '', value: '1', scaling: { mode: '', formula: '' } }]);
    expect(item.system.description.value).toContain('Advantage on saving throws');
    expect(r.ir.creature.traits[0]!.description).toBe(c.features[0].text);
    expect(item.effects).toEqual([]);
  });

  test('wrong explicit timing is rejected while missing same-source timing is restored', () => {
    const c = periapt(), candidate = request(c.source).candidate;
    const correct = anchorIrEvidence(c.source, candidate, reply(c));
    expect(correct.creature.traits[0]!.activationType).toBe('action');
    expect(validateMonsterIntakeIR(c.source, correct).blocking).toEqual([]);
    const plan = splitStagedMonsterSource(request(c.source)), unit = plan.features[0]!;
    for (const activation of ['bonus', 'reaction', 'special'] as const) {
      const raw = reply(c);
      raw.creature.traits[0].activationType = activation;
      const ir = anchorIrEvidence(c.source, candidate, raw);
      expect(ir.creature.traits[0]!.activationType).toBe(activation);
      expect(validateMonsterIntakeIR(c.source, ir).blocking.length).toBeGreaterThan(0);
      expect(() => assembleStagedFeature(plan, unit, { schemaVersion: 1, unitId: unit.id, mode: 'manual', facts: { activationType: activation } }, 'Sentinel')).toThrow();
    }
  });

  test('the existing verifier rejects a healing Actor that loses its proven action', async () => {
    const c = periapt(), r = await chain(c, () => ordinary(c, reply(c)));
    requireAcceptedChain(r);
    const actor = structuredClone(r.actor), item = actor.items[0];
    if (item.system.activation) item.system.activation.type = '';
    for (const activity of Object.values(item.system.activities) as any[]) activity.activation.type = '';
    expect(verifyMonsterIntake(c.source, r.ir, r.markdown, actor, request(c.source).candidate).findings.some(f => f.blocking && f.code === 'ACTOR_ACTIVATION_DRIFT')).toBe(true);
  });

  for (const path of ['ordinary', 'staged']) test(`passive and adjacent unrelated action do not become ${path} healing timing`, async () => {
    const c = wording('While wearing this pendant, you can take a Magic action to regain', 'You regain');
    const f = c.features[0];
    f.legacy.healing.target.special = 'You';
    // A passive benefit has no separate use pool; the frozen active pendant's
    // cooldown cannot be borrowed by this deliberately different control.
    delete f.uses;
    f.text = f.text.replace('Once used, this property can’t be used again until the next dawn. ', '');
    f.text += ' You can take a Magic action to light a candle.';
    f.legacy.nativeRuleText = f.legacy.manualRemainder = f.text;
    c.units.find((u: any) => u.destination === 'feature').text = f.text + '\n';
    c.source = c.units.map((u: any) => u.text).join('');
    const r = await chain(c, () => path === 'ordinary' ? ordinary(c, reply(c)) : staged(c));
    requireAcceptedChain(r);
    expect(r.ir.creature.traits[0]!.activationType).toBeUndefined();
    const activity: any = Object.values(r.actor.items[0].system.activities)[0];
    expect(activity.type).toBe('heal');
    expect(activity.activation.type).toBe('');
  });

  test('a trigger or another actor cannot lend an action to fixed healing', () => {
    for (const text of [
      'Renewal. When you take a Magic action, you regain 5 Hit Points.',
      'Renewal. When another creature takes a Magic action, you regain 5 Hit Points.',
      'Renewal. You regain 5 Hit Points. Another creature can take a Magic action to move.',
    ]) {
      const facts = stagedFeatureMechanics(text, 'Renewal', 'Sentinel')?.facts;
      if (!text.startsWith('Renewal. When another')) expect(facts?.healing?.formula).toBe('5');
      expect(facts?.activationType).toBeUndefined();
    }
  });
});
