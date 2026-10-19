import { EncounterProposalError } from './encounter-proposal';

export interface EncounterCompilerDiagnostic {code:string;path:string;expected:string}
export interface EncounterCompilerRejection {attempt:1|2;diagnostic:EncounterCompilerDiagnostic;proposal:unknown;truncated:boolean}
export class EncounterCompilationError extends TypeError {
  constructor(readonly diagnostic:EncounterCompilerDiagnostic,cause?:TypeError){super(cause?.message??`Source-bound compilation ${diagnostic.code} at ${diagnostic.path}: ${diagnostic.expected}`);}
}

/** Messages may contain model-authored names. Public diagnostics use closed
 * categories and paths; the bounded data-only evidence is separately redacted. */
export function encounterCompilerDiagnostic(error:TypeError,path='/'):EncounterCompilerDiagnostic {
  if(error instanceof EncounterCompilationError)return error.diagnostic;
  if(error instanceof EncounterProposalError)return {code:error.code,path:error.path,expected:error.expected};
  const message=error.message;
  const fields:Array<[RegExp,string,string,string]>=[
    [/Forced movement/, 'FORCED_MOVEMENT_SOURCE', '/quote','complete source-bound gm-manual rule'],
    [/exact quote|contained by evidence|source evidence|quoted source/, 'SOURCE_EVIDENCE', '/quote','unique exact evidence from the same feature'],
    [/formally generated Item/, 'NATIVE_CARRIER','/featureName','one formally generated carrier'],
    [/native Save|source-backed save Activity/, 'NATIVE_SAVE','/parameters','one source-backed native Save'],
    [/effect expiry/, 'SOURCE_EXPIRY','/parameters/expiry','expiry matching the full source'],
    [/Failure margin/, 'SOURCE_FAILURE_MARGIN','/parameters/minFailureMargin','source-backed failure margin'],
    [/Area radius/, 'SOURCE_RADIUS','/parameters/radiusFeet','radius matching the IR'],
    [/GM.*steps|GM.*adjudication|GM confirmation/, 'GM_STEPS','/gmSteps','complete GM handling instructions'],
    [/parameters|numeric parameter|parameter value/, 'PARAMETERS','/parameters','supported source-bound parameters'],
  ];
  const match=fields.find(([pattern])=>pattern.test(message));
  if(match)return {code:match[1],path:`${path==='/'?'':path}${match[2]}`,expected:match[3]};
  // Existing decoder paths are authored by this compiler, never copied from a
  // source value. Restrict the alphabet before including a path in a report.
  const quotedPath=/^\$selection\.rules\[(\d+)\](?:\.(quote|gmSteps|actorKey|featureName|section))?/u.exec(message);
  return {code:'SELECTION_CONTRACT',path:quotedPath?`/rules/${quotedPath[1]}${quotedPath[2]?`/${quotedPath[2]}`:''}`:path,
    expected:'supported data shape and source-bound capability constraints'};
}

export function compilerRejectionEvidence(value:unknown,error:TypeError,attempt:1|2,forbiddenValues:readonly string[]):EncounterCompilerRejection {
  let budget=48_000,nodes=2_000,truncated=false;
  const cleanText=(value:string)=>{
    let safe=value;
    for(const forbidden of forbiddenValues)if(forbidden)safe=safe.split(forbidden).join('[redacted]');
    safe=safe.replace(/\bBearer\s+\S+/giu,'Bearer [redacted]');
    safe=safe.replace(/(["']?(?:api[-_]?key|authorization|cookie|password|credential|secret)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\]]+)/giu,'$1"[redacted]"');
    if(safe.length>budget){safe=safe.slice(0,Math.max(0,budget));truncated=true;}
    budget-=safe.length;
    return safe;
  };
  const visit=(value:unknown,depth=0):unknown=>{
    if(depth>12||budget<=0||--nodes<=0){truncated=true;return '[truncated]';}
    if(typeof value==='string')return cleanText(value);
    if(value===null||typeof value==='number'||typeof value==='boolean')return value;
    if(Array.isArray(value)){if(value.length>100)truncated=true;return value.slice(0,100).map(entry=>visit(entry,depth+1));}
    if(value&&typeof value==='object'){
      const entries=Object.getOwnPropertyDescriptors(value);
      const result:Record<string,unknown>=Object.create(null);
      for(const [key,descriptor] of Object.entries(entries).slice(0,100)){
        if(budget<=0||nodes<=0){truncated=true;break;}
        if(!descriptor.enumerable)continue;
        if(descriptor.get||descriptor.set){result['[accessor]']='[omitted]';continue;}
        const safeKey=cleanText(key);
        if(['__proto__','prototype','constructor'].includes(key)){result['[unsafe-key]']='[omitted]';continue;}
        result[safeKey]=/api[-_]?key|authorization|cookie|password|credential|secret|endpoint|baseurl/iu.test(key)?'[redacted]':visit(descriptor.value,depth+1);
      }
      if(Object.keys(entries).length>100)truncated=true;
      return result;
    }
    return '[non-json]';
  };
  return {attempt,diagnostic:encounterCompilerDiagnostic(error),proposal:visit(value),truncated};
}
