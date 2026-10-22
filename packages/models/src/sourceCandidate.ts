import type { SourceCandidateReview, SourceCandidateCounter } from './sourceOperationTypes';

const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const dice=(value:unknown):value is string=>text(value)&&value.length<200&&/^[\ddD\s+\-*/().]+$/u.test(value);

/** Candidate metadata is data only. It never grants accepted status. */
export function isSourceCandidateReview(value:unknown):value is SourceCandidateReview{
  if(!object(value)||value.version!==1||!Array.isArray(value.findings)||!value.findings.length||value.findings.length>4096
    ||Object.keys(value).some(key=>!['version','findings','proposal'].includes(key))
    ||value.findings.some(f=>!object(f)||!text(f.code)||!text(f.path)||!text(f.message)
      ||Object.keys(f).some(key=>!['code','path','message'].includes(key)))||!Object.hasOwn(value,'proposal'))return false;
  let nodes=0;const seen=new Set<object>();
  const valid=(entry:unknown,depth:number):boolean=>{
    if(++nodes>20000||depth>40)return false;
    if(entry===null||typeof entry==='boolean'||typeof entry==='string')return true;
    if(typeof entry==='number')return Number.isFinite(entry);
    if(!entry||typeof entry!=='object'||seen.has(entry))return false;
    seen.add(entry);
    if(Array.isArray(entry))return entry.every(e=>valid(e,depth+1));
    if(![Object.prototype,null].includes(Object.getPrototypeOf(entry)))return false;
    return Object.entries(entry).every(([key,child])=>!['__proto__','prototype','constructor'].includes(key)&&valid(child,depth+1));
  };
  return valid(value.proposal,0);
}

/** Inert/manual recovery declarations must not smuggle executable fields. */
export function isSourceCandidateCounters(value:unknown):value is SourceCandidateCounter[]{
  return Array.isArray(value)&&value.length>0&&value.length<=128&&value.every(entry=>object(entry)
    &&Object.keys(entry).every(key=>['name','max','recovery'].includes(key))&&text(entry.name)
    &&Number.isSafeInteger(entry.max)&&entry.max>0&&(entry.recovery===null||text(entry.recovery)));
}

/** Native projection safety, deliberately independent of semantic source proof.
 * It permits a typed proposal to be delivered for review while the ordinary
 * sourceOperationErrors still reports every unverified/contradictory fact. */
export function candidateSourceOperationShapeErrors(value:unknown):string[]{
  const errors:string[]=[];
  if(!Array.isArray(value)||!value.length||value.length>128)return['operations'];
  const ids=new Set<string>();
  for(const[index,op]of value.entries()){
    const at=String(index),bad=(field:string)=>errors.push(at+'/'+field);
    if(!object(op)){bad('object');continue;}
    if(!text(op.id)||ids.has(op.id)||!text(op.name)||!text(op.sourceText))bad('identity');
    ids.add(op.id);
    if(!['attack','save','damage','heal'].includes(op.type)||!['primary','follow-up','alternative'].includes(op.relationship))bad('type');
    if(op.condition!==undefined&&!text(op.condition))bad('condition');
    if(!object(op.proof)||Object.entries(op.proof).some(([key,p])=>key==='upgrade'
      ?!object(p)||!text(p.sourceText)||!text(p.quote)
      :typeof p!=='string'&&(!Array.isArray(p)||p.some(v=>!text(v)))))bad('proof');
    if(op.attack!==undefined){
      const a=op.attack;
      if(!object(a)||!['mwak','rwak','msak','rsak','melee','ranged'].includes(a.type)||!Number.isSafeInteger(a.toHit)
        ||['reach','range','longRange'].some(k=>a[k]!==undefined&&(!finite(a[k])||a[k]<0)))bad('attack');
    }else if(op.type==='attack')bad('attack');
    if(op.save!==undefined){
      const s=op.save;
      if(!object(s)||!Number.isSafeInteger(s.dc)||s.dc<1||!Array.isArray(s.abilities)||!s.abilities.length
        ||s.abilities.some((a:unknown)=>!['str','dex','con','int','wis','cha'].includes(String(a)))
        ||!['single','target'].includes(s.choice)||!['none','half','full'].includes(s.outcome))bad('save');
    }else if(op.type==='save')bad('save');
    if(op.damage!==undefined&&(!Array.isArray(op.damage)||op.damage.some((d:unknown)=>!object(d)||!dice(d.formula)||!text(d.type)
      ||!['base','additional','conditional','replacement'].includes(d.relationship)||d.condition!==undefined&&!text(d.condition))))bad('damage');
    if(op.healing!==undefined){
      const h=op.healing;
      if(!object(h)||!dice(h.formula)||!['healing','temphp'].includes(h.type)||!object(h.target)
        ||!['self','creature'].includes(h.target.type)||h.target.count!==1||typeof h.target.special!=='string')bad('healing');
    }else if(op.type==='heal')bad('healing');
    if(op.range!==undefined&&(!finite(op.range)||op.range<0))bad('range');
    if(op.aoe!==undefined){const a=op.aoe;if(!object(a)||!['sphere','radius','cone','line','cube','cylinder','rectangle'].includes(a.shape)
      ||!finite(a.radius)||a.radius<=0||['width','height'].some(k=>a[k]!==undefined&&(!finite(a[k])||a[k]<=0)))bad('area');}
    if(op.failureStatuses!==undefined||op.damageAdjustment!==undefined)bad('unsupported-candidate-automation');
  }
  return errors;
}
