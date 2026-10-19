/** Program-owned source scopes. Sentence boundaries retain all conditional
 * wording; explicit result labels remain active across wrapped sentences. */
export function sourceOperationClauses(source:string):string[]{
  const clauses:string[]=[];let start=0;
  for(const match of source.matchAll(/[。!?！？]|\.(?=\s|$)/gu)){
    if(match[0]==='.'){
      const prefix=source.slice(start,match.index);
      if(/\b(?:ft|dr|mr|mrs|ms|e\.g|i\.e)$/iu.test(prefix)||/\d$/u.test(prefix)&&/^\d/u.test(source.slice(match.index!+1)))continue;
    }
    const clause=source.slice(start,match.index!+1).trim();if(clause)clauses.push(clause);start=match.index!+1;
  }
  const tail=source.slice(start).trim();if(tail)clauses.push(tail);
  return clauses;
}

export type SourceResultBranch='unbound'|'failure'|'success'|'both';
export interface SourceResultScope {
  clause:string;
  text:string;
  branch:SourceResultBranch;
  clauseIndex:number;
  /** A new printed Save/Attack starts a new operation scope. */
  operation:number;
}
const visible=(value:string)=>value.normalize('NFKC').replace(/[*_]/gu,'').replace(/\s+/gu,' ').trim();
export const SOURCE_NEGATION_TOKEN="(?:cannot|[a-z]+n['’]t|(?:does|do|did|can|will|must|may|should|could|would|is|are|was|were)\\s+not|never)";
// These are fixed printed label variants, not general whitespace repair.
// Match in place so source/proof strings and UTF-16 offsets remain unchanged.
export const SOURCE_SAVE_LABEL=String.raw`\b(?:saving|s[ \t]+aving)[ \t]+(?:throw|t[ \t]+hrow)\b`;
const inlineFailure=new RegExp(`(?:\\bon (?:a |each (?:successive )?)?failed (?:save\\b|${SOURCE_SAVE_LABEL})|\\bon (?:a )?failure\\b|失败(?:时|则|的豁免)|豁免失败)`,'iu');
const inlineSuccess=new RegExp(`(?:\\bon (?:a )?successful (?:save\\b|${SOURCE_SAVE_LABEL}|one\\b)|\\bon (?:a )?success\\b|成功(?:时|则|的豁免)|豁免成功)`,'iu');

function inlineScopes(value:string):Array<{text:string;branch?:SourceResultBranch}>{
  // Conjunctions separate result branches only when the right-hand side has
  // an explicit success/failure qualifier. Damage-type OR stays one atom.
  const events=[...value.matchAll(/[,，]?\s*\b(?:and|but|or)\s+|[,，]?\s*(?:并且|但是|但|或者|或)\s*/giu)];
  const starts=[0];
  for(const event of events){
    const right=value.slice(event.index!+event[0].length);
    const following=events.find(other=>other.index!>event.index!)?.index??value.length;
    const candidate=value.slice(event.index!+event[0].length,following);
    const sharedDamage=/^\d+(?:d\d+(?:\s*[+-]\s*\d+)?)?\s+[^.;。]{1,70}\bdamage\b/iu.test(candidate)&&!inlineFailure.test(value.slice(starts.at(-1),event.index))&&!inlineSuccess.test(value.slice(starts.at(-1),event.index));
    if((inlineFailure.test(candidate)||inlineSuccess.test(candidate))&&!sharedDamage)starts.push(event.index!+event[0].length);
    // SUCCEED ... OR consequence is a failed result even with a dynamic DC.
    else if(/^\s*(?:or|或)\s*$/iu.test(event[0])&&/\bmust\s+succeed\s+on\b/iu.test(value.slice(0,event.index))&&new RegExp(SOURCE_SAVE_LABEL,'iu').test(value.slice(0,event.index))&&/^(?:take|be|become|have|die|fall off)\b/iu.test(right))starts.push(event.index!+event[0].length);
    else if(/^(?:no|none|half)\b|^(?:不受|没有|一半)/iu.test(right)&&/\b(?:success|successful)\b|成功/iu.test(right))starts.push(event.index!+event[0].length);
  }
  return starts.map((start,index)=>{
    let end=starts[index+1]??value.length;
    const connector=events.find(event=>event.index!<end&&event.index!+event[0].length===end);
    if(connector)end=connector.index!;
    const text=value.slice(start,end).trim(),failedOr=start>0&&/\bmust\s+succeed\s+on\b/iu.test(value.slice(0,start))&&new RegExp(SOURCE_SAVE_LABEL,'iu').test(value.slice(0,start))&&/^(?:take|be|become|have|die|fall off)\b/iu.test(text),failure=failedOr||inlineFailure.test(text),success=inlineSuccess.test(text);
    return{text,...(failure&&success?{branch:'both' as const}:failure?{branch:'failure' as const}:success?{branch:'success' as const}:{})};
  }).filter(scope=>scope.text);
}

/** One scope authority is reused by damage entailment, inventories, success
 * projection and ordinary-status lifetime checks. A label applies until the
 * next label or a genuinely new printed operation, not just the next period. */
export function sourceResultScopes(source:string):SourceResultScope[]{
  const result:SourceResultScope[]=[];let branch:SourceResultBranch='unbound',operation=-1;
  for(const[clauseIndex,clause]of sourceOperationClauses(source).entries()){
    const value=visible(clause);
    const save=new RegExp(`${SOURCE_SAVE_LABEL}|豁免`,'iu').test(value)&&(/(?:\bDC\s*\d+|难度等级\s*\d+)/iu.test(value)||/\bmust\s+(?:make|succeed\s+on)\b/iu.test(value)||/\b(?:make|makes)\s+(?:an?\s+)?(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw\b/iu.test(value));
    const check=/\b(?:make|succeeding\s+on)\b[^.;。]{0,140}\bcheck\b/iu.test(value);
    // A new explicitly named output recipient is not the old Save's success
    // branch. Ordinary "the target/creature/it" result continuations stay open.
    const output=/^(.{1,180}?)\s+(?:takes?|deals?|suffers?|receives?)\s+(?:an?\s+)?(?:(?:extra|additional)\s+)?\d/iu.exec(value);
    const independent=!!output&&!inlineFailure.test(value)&&!inlineSuccess.test(value)&&!/^(?:On (?:a|each) hit|Hit)\b/iu.test(value)&&!/^(?:(?:the|a|an|each|every|any|this|that)\s+)?(?:target|creature|it|you)\b|^(?:Failure|Success|失败|成功)[:：]/iu.test(output[1]!);
    if(save||check||independent||/\b(?:melee|ranged)[^。.;；]{0,30}attack|近战[^。.;；]{0,12}攻击|远程[^。.;；]{0,12}攻击/iu.test(value)){
      branch='unbound';operation++;
    }
    const labels=[...value.matchAll(/\b(?:success\s+or\s+failure|failed\s+save|successful\s+save|failure|success)\s*[:：]|(?:成功或失败|无论成功还是失败|失败|成功)\s*[:：]/giu)];
    let cursor=0;
    const append=(text:string)=>{
      for(const scope of inlineScopes(text)){
        if(scope.branch!==undefined)branch=scope.branch;
        result.push({clause,text:scope.text,branch,clauseIndex,operation});
      }
    };
    for(const label of labels){
      append(value.slice(cursor,label.index));
      branch=/or|或|无论/iu.test(label[0])?'both':/failure|failed\s+save|失败/iu.test(label[0])?'failure':'success';
      cursor=label.index!+label[0].length;
    }
    append(value.slice(cursor));
  }
  return result;
}
