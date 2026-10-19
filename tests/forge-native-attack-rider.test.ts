import {describe,expect,test} from 'bun:test';
import {modelReply,ordinary,staged,chain,request,requireAcceptedChain as accepted} from './helpers/forge-semantic-chain';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import data from './fixtures/forge-native-attack-cases.json';

// Synthetic counterexample of the reviewed shared-rider source clause. Its
// condition belongs to fire damage, independently of the half-HP replacement.
function attackRiderCase(suffix:string,placement:'separate'|'ordinary'='separate'){
  const c:any=structuredClone(data.cases.find(c=>c.id==='alternative-1-sentinel')!);
  const feature=c.features[0],previous=feature.text.slice(feature.text.indexOf('Hit:'));
  const hit=previous.slice(0,-1)+', plus 3 (1d6) fire damage'+suffix+'.';
  feature.text=feature.text.replace(previous,hit);
  for(const op of feature.operations)if(op.proof.damage)op.proof.damage=op.proof.damage.map(()=>hit);
  const part={formula:'1d6',type:'fire',relationship:'conditional'};
  if(placement==='separate')feature.operations.push({id:'rider',name:'Conditional Fire Damage',type:'damage',relationship:'follow-up',damage:[part],proof:{damage:[hit]}});
  else {const op=feature.operations.find((op:any)=>op.id==='ordinary');op.damage.push(part);op.proof.damage.push(hit);}
  c.units.find((unit:any)=>unit.destination==='feature').text=feature.text+'\n';
  c.source=c.units.map((unit:any)=>unit.text).join('');
  return c;
}
function independentRiderCase(prefix:string,suffix:string){
  const c:any=structuredClone(data.cases.find(c=>c.id==='alternative-1-sentinel')!),feature=c.features[0];
  const quote=prefix+' 3 (1d6) fire damage'+suffix+'.';feature.text+=' '+quote;
  feature.operations.push({id:'rider',name:'Independent Fire Damage',type:'damage',relationship:'follow-up',damage:[{formula:'1d6',type:'fire',relationship:'additional'}],proof:{damage:[quote]}});
  c.units.find((unit:any)=>unit.destination==='feature').text=feature.text+'\n';c.source=c.units.map((unit:any)=>unit.text).join('');return c;
}
const control=(c:any,path:string)=>chain(c,()=>path==='ordinary'?ordinary(c,modelReply(c)):staged(c));
const activities=(result:any)=>Object.values(result.actor.items.find((item:any)=>item.name==='Bites').system.activities) as any[];
const fireParts=(activity:any)=>(activity.damage?.parts??[]).filter((part:any)=>part.types?.includes('fire'));

describe('replacement attack modes retain conditional damage riders',()=>{
  for(const prefix of ['In either case, the attack also deals','The attack also deals'])for(const suffix of ['', ' on a critical hit'])for(const path of ['ordinary','staged-auto'])test('separate proof: '+prefix+suffix+' '+path,async()=>{
    const c=independentRiderCase(prefix,suffix),result=await control(c,path);accepted(result);
    const rolls=activities(result),attacks=rolls.filter(a=>a.type==='attack'),riders=rolls.filter(a=>a.type==='damage');
    expect(attacks).toHaveLength(2);expect(attacks.every(a=>fireParts(a).length===(suffix?0:1))).toBe(true);expect(riders).toHaveLength(suffix?1:0);
  });
  for(const path of ['ordinary','staged-auto'])test('unknown prefix is not proof of unconditional shared damage '+path,async()=>{
    const c=independentRiderCase('On a critical hit, in either case, the attack also deals',''),result=await control(c,path);accepted(result);
    const rolls=activities(result);expect(rolls.filter(a=>a.type==='attack').every(a=>fireParts(a).length===0)).toBe(true);expect(rolls.filter(a=>a.type==='damage')).toHaveLength(1);
  });
  for(const suffix of [' if the target is prone',' unless the target is immune to fire',' except against Constructs',' on a critical hit'])for(const path of ['ordinary','staged-auto'])test(suffix+' '+path,async()=>{
    const c=attackRiderCase(suffix),result=await control(c,path);accepted(result);
    const rolls=activities(result),attacks=rolls.filter(activity=>activity.type==='attack'),riders=rolls.filter(activity=>activity.type==='damage');
    expect(attacks).toHaveLength(2);
    expect(attacks.every(activity=>fireParts(activity).length===0)).toBe(true);
    expect(riders).toHaveLength(1);
    expect(fireParts(riders[0])).toHaveLength(1);
    expect(riders[0].activation.type).toBe('special');
    expect(riders[0].activation.condition).toContain(suffix.trim());
    expect(riders[0].consumption.targets).toEqual([]);
    const changed=structuredClone(result.actor),item=changed.items.find((item:any)=>item.name==='Bites');
    const finalAttacks=Object.values(item.system.activities).filter((activity:any)=>activity.type==='attack') as any[];
    finalAttacks[0].damage.parts.push(structuredClone(riders[0].damage.parts[0]));
    expect(verifyMonsterIntake(c.source,result.ir,result.markdown,changed,request(c.source).candidate).findings.some(finding=>finding.blocking&&finding.code==='ACTOR_SOURCE_OPERATION_DAMAGE_DRIFT')).toBe(true);
  });
  for(const path of ['ordinary','staged-auto'])test('unconditional shared fire remains on both attacks '+path,async()=>{
    const c=attackRiderCase(''),result=await control(c,path);accepted(result);
    const rolls=activities(result),attacks=rolls.filter(activity=>activity.type==='attack');
    expect(attacks).toHaveLength(2);expect(attacks.every(activity=>fireParts(activity).length===1)).toBe(true);
    expect(rolls.filter(activity=>activity.type==='damage')).toHaveLength(0);
  });
  for(const path of ['ordinary','staged-auto'])test('an absorbed multi-part OP with a conditional rider retains the existing GM rolls '+path,async()=>{
    const c=attackRiderCase(' if the target is prone','ordinary'),result=await control(c,path);accepted(result);
    const rolls=activities(result),attacks=rolls.filter(activity=>activity.type==='attack'),damage=rolls.filter(activity=>activity.type==='damage');
    expect(attacks).toHaveLength(1);expect(attacks.every(activity=>fireParts(activity).length===0)).toBe(true);
    expect(damage).toHaveLength(2);
    expect(damage.flatMap(activity=>fireParts(activity))).toHaveLength(1);
    expect(rolls.every(activity=>activity.activation.condition.includes('if the target is prone'))).toBe(true);
  });
});
