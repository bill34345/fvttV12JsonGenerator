import {expect,test} from 'bun:test';
import fixture from './fixtures/forge-regenerate-healing.json';
import providerReplies from './fixtures/forge-healing-provider-replies.json';
import {chain,modelReply,ordinary,staged,requireAcceptedChain} from './helpers/forge-semantic-chain';
import {sourceHealingOperations,bindSourceOperations} from '@fvtt-json-generator/models/source-operations';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {request} from './helpers/forge-semantic-chain';
import {assembleStagedFeature} from '@fvtt-json-generator/intake-ai/staged-extraction';
import {splitStagedMonsterSource} from '@fvtt-json-generator/intake-ai/staged-source';

test('recorded real repair keeps exact source healing with dice whitespace and separately named title',async()=>{
  const raw:any=structuredClone(providerReplies.ordinaryRegenerateRepairedIr);
  const r=await chain(fixture.case,async()=>({ir:raw,calls:['saved-real-repair']}));requireAcceptedChain(r);
  const acts:any[]=Object.values(r.actor.items[0].system.activities);
  expect(acts.map(a=>a.type)).toEqual(['heal','heal']);
  expect(acts[0].healing).toMatchObject({number:4,denomination:8,bonus:'15'});
  expect(acts[1].healing.custom.formula).toBe('1');
  for(const a of acts){expect(a.target.affects).toMatchObject({type:'creature',count:'1'});expect(a.consumption.targets).toEqual([]);}
  for(const wrong of ['formula','recipient','timing']as const){
    const bad=structuredClone(raw),op=bad.creature.traits[0].sourceOperations[1];
    if(wrong==='formula')op.healing.formula='99';
    if(wrong==='recipient')op.healing.target.type='self';
    if(wrong==='timing')op.proof.healing=op.proof.healing.replace('start','end');
    expect((await chain(fixture.case,async()=>({ir:bad}))).status).toBe('blocked');
  }
});

function withParent(text:string):any{
  const c:any=structuredClone(fixture.case),f=c.features[0];
  f.text=text;delete f.legacy;
  c.units.find((u:any)=>u.destination==='feature').text=text+'\n';
  c.source=c.units.map((u:any)=>u.text).join('');return c;
}

for(const path of ['ordinary','staged'])test(`complete Regenerate preserves both healing events in ${path}`,async()=>{
  const c:any=structuredClone(fixture.case);
  const result=await chain(c,()=>path==='ordinary'?ordinary(c,modelReply(c)):staged(c));
  requireAcceptedChain(result);
  expect(result.actor.items).toHaveLength(1);
  const activities:any[]=Object.values(result.actor.items[0].system.activities);
  expect(activities.map(a=>a.type)).toEqual(['heal','heal']);
  expect(activities[0].healing).toMatchObject({number:4,denomination:8,bonus:'15',types:['healing']});
  expect(activities[1].healing).toMatchObject({types:['healing'],custom:{enabled:true,formula:'1'}});
  expect(activities[1].activation.type).toBe('special');
  expect(activities[1].activation.condition).toContain('at the start of each of its turns');
  for(const a of activities){expect(a.target.affects.type).toBe('creature');expect(a.target.affects.count).toBe('1');expect(a.consumption.targets).toEqual([]);}
  expect(result.ir.creature.traits[0]!.description).toBe(c.features[0].text);
  expect(result.actor.items[0].effects).toEqual([]);
});

for(const [label,initial,follow,expectedType,target]of [
  ['self/end','You regain 2d6 + 3 Hit Points.','For the duration, you regain 2 Hit Points at the end of each of your turns.','healing','self'],
  ['temporary recipient/end','One creature you touch regains 6 Temporary Hit Points.','For the duration, the target regains 1d4 Temporary Hit Points at the end of each of its turns.','temphp','creature'],
] as const)for(const path of ['ordinary','staged'])test(`two qualified healing events preserve ${label} in ${path}`,async()=>{
  // Synthetic regression controls only; not additional official-source cases.
  const text=fixture.case.features[0]!.text.replace(/A creature you touch regains[\s\S]*$/u,initial+' '+follow),c=withParent(text);
  const r=await chain(c,()=>path==='ordinary'?ordinary(c,modelReply(c)):staged(c));requireAcceptedChain(r);
  const acts:any[]=Object.values(r.actor.items[0].system.activities);
  expect(acts.map(a=>a.type)).toEqual(['heal','heal']);
  expect(acts.map(a=>a.healing.types)).toEqual([[expectedType],[expectedType]]);
  expect(acts.map(a=>a.target.affects.type)).toEqual([target,target]);
  expect(acts[1].activation.type).toBe('special');expect(acts[1].activation.condition).toContain('at the end');
});

test('two-event healing binding rejects altered, omitted, reordered or invented operations',()=>{
  const source=fixture.case.features[0]!.text,ops=sourceHealingOperations(source)!;
  expect(ops).toHaveLength(2);expect(bindSourceOperations(source,ops)).toHaveLength(2);
  const mutations:Array<(x:any[])=>void>=[
    x=>{x.pop();},x=>{x.push(structuredClone(x[1]));},x=>{x.reverse();},
    x=>{x[0].healing.formula='4d8';},x=>{x[1].healing.formula='4d8+15';},
    x=>{x[1].healing.type='temphp';},x=>{x[1].healing.target.type='self';},
    x=>{x[1].healing.target.count=2;},x=>{x[1].healing.target.special='another creature';},
    x=>{x[1].relationship='primary';},x=>{x[1].proof.healing=x[0].proof.healing;},
    x=>{x[1].range=5;},x=>{x[1].healing.extra=true;},
  ];
  for(const change of mutations){const wrong=structuredClone(ops);change(wrong);expect(()=>bindSourceOperations(source,wrong)).toThrow();}
  for(const text of [source.replace('the target regains','another creature regains'),source.replace('each of its turns','each of your turns'),source+' The healing is doubled.',source.replace('regains 1 Hit Point','regains 1 Hit Point per level')])expect(sourceHealingOperations(text)).toBeUndefined();
});

for(const path of ['ordinary','staged'])test(`extra explicit operations cannot hide behind the ${path} two-healing shortcut`,async()=>{
  const extra='Each creature within 10 feet must make a DC 15 Constitution saving throw, taking 2d6 poison damage on a failed save.';
  for(const source of [fixture.case.features[0]!.text+' '+extra,extra+' '+fixture.case.features[0]!.text,fixture.case.features[0]!.text.replace(', and any severed body parts regrow after 2 minutes.',', and each creature takes 2d6 poison damage.')]){
    expect(sourceHealingOperations(source)).toBeUndefined();
    const c=withParent(source);
    // Reproduce the review finding: a proposal exposes only the two heals
    // despite additional basic operations. A wholly manual unsupported rule
    // is not the same claim and is never counted as native success here.
    c.features[0].operations=sourceHealingOperations(fixture.case.features[0]!.text)!.map(op=>({...op,sourceText:source.trim(),...(op.relationship==='follow-up'?{condition:source.trim()}:{})}));
    const r=await chain(c,()=>path==='ordinary'?ordinary(c,modelReply(c)):staged(c));
    expect(r.status).toBe('blocked');
  }
});

for(const path of ['ordinary','staged'])test(`explicit wrong healing proposals remain blocked in ${path}`,async()=>{
  const c=withParent(fixture.case.features[0]!.text);c.features[0].operations=sourceHealingOperations(c.features[0].text)!;
  c.features[0].operations[1].healing.formula='99';
  // Auto extraction now owns proven healing without requesting a model
  // proposal. Exercise the actual proposal consumer directly for this path.
  if(path==='staged'){
    const plan=splitStagedMonsterSource(request(c.source));
    expect(()=>assembleStagedFeature(plan,plan.features[0]!,{schemaVersion:1,unitId:plan.features[0]!.id,mode:'native-with-gm',facts:{sourceOperations:c.features[0].operations}},c.creature.identity.name)).toThrow();
    return;
  }
  const r=await chain(c,()=>path==='ordinary'?ordinary(c,modelReply(c)):staged(c));expect(r.status).toBe('blocked');
});

test('source and Actor verification reject losing the second healing event or changing its recipient/timing/cost',async()=>{
  const c:any=structuredClone(fixture.case),r=await chain(c,()=>ordinary(c,modelReply(c)));requireAcceptedChain(r);
  for(const change of [
    (a:any)=>{delete a.items[0].system.activities[Object.keys(a.items[0].system.activities)[1]!];},
    (a:any)=>{Object.values<any>(a.items[0].system.activities)[1].healing.custom.formula='99';},
    (a:any)=>{Object.values<any>(a.items[0].system.activities)[1].target.affects.type='self';},
    (a:any)=>{Object.values<any>(a.items[0].system.activities)[1].activation.type='action';},
    (a:any)=>{Object.values<any>(a.items[0].system.activities)[1].consumption.targets=[{type:'itemUses',value:'1'}];},
  ]){const actor=structuredClone(r.actor);change(actor);expect(verifyMonsterIntake(c.source,r.ir,r.markdown,actor,request(c.source).candidate).status).toBe('needs_review');}
});
