import type {EvidenceRef} from './types';
import {dailySpellGrantLabel} from './spell-grant-label';

function exactEvidence(value:EvidenceRef):boolean{
  return !!value&&Number.isSafeInteger(value.start)&&Number.isSafeInteger(value.end)&&value.start>=0&&value.end>value.start
    &&typeof value.quote==='string'&&value.end-value.start===value.quote.length;
}

export function sourceSpellGrantLabel(raw:string){
  if(typeof raw!=='string')return;
  return dailySpellGrantLabel(raw)?.match??/^\s*(?:\*{1,3})?\s*(随意|at[ -]*will|cantrips?\s*\(at will\)|戏法\s*[（(]随意[）)]|[1-9](?:st|nd|rd|th)?\s*level\s*\(\d+\s*slots?\)|[1-9]\s*环\s*[（(]\d+\s*法位[）)])\s*[:：]\s*(?:\*{1,3})?\s*/iu.exec(raw);
}

/** Source-owned PDF rows. Parenthetical annotations and trailing separators
 * continue the same grant, preserving the complete original UTF-16 slice. */
export function sourceSpellGrantRows(source:string):Array<{text:string;index:number}>{
  const result:Array<{text:string;index:number}>=[];
  if(typeof source!=='string')return result;
  for(const line of source.matchAll(/[^\r\n]+/gu)){
    const previous=result.at(-1);
    const balance=previous?[...previous.text].reduce((count,c)=>count+(/[（(]/u.test(c)?1:/[）)]/u.test(c)?-1:0),0):0;
    if(previous&&sourceSpellGrantLabel(previous.text)&&!sourceSpellGrantLabel(line[0])&&(balance>0||/[,，、]\s*$/u.test(previous.text))){
      previous.text=source.slice(previous.index,line.index!+line[0].length);
    }else result.push({text:line[0],index:line.index!});
  }
  return result;
}

/** Split only top-level separators. Positions are absolute UTF-16 offsets
 * when offset is supplied; interior whitespace, commas and newlines survive. */
export function sourceSpellGrantTokens(text:string,offset=0):EvidenceRef[]|undefined{
  if(typeof text!=='string'||!Number.isSafeInteger(offset)||offset<0)return;
  const result:EvidenceRef[]=[],stack:string[]=[];let beginning=0;
  const append=(end:number)=>{
    const part=text.slice(beginning,end),leading=part.length-part.trimStart().length;
    const value=part.trim().replace(/[;；。.]$/u,'');
    if(!value)return false;
    const start=offset+beginning+leading;
    result.push({start,end:start+value.length,quote:value});return true;
  };
  for(let index=0;index<text.length;index++){
    const c=text[index]!;
    if(c==='('||c==='（')stack.push(c==='('?')':'）');
    else if(c===')'||c==='）'){if(stack.pop()!==c)return;}
    else if(/[,，、]/u.test(c)&&!stack.length){if(!append(index))return;beginning=index+1;}
  }
  if(stack.length||!append(text.length))return;
  return result;
}

export function sourceSpellGrantTokenName(token:EvidenceRef):{name:string;annotation?:string}|undefined{
  if(!exactEvidence(token))return;
  const at=token.quote.search(/[（(]/u),annotation=at>=0?token.quote.slice(at+1,-1):undefined;
  const name=(at>=0?token.quote.slice(0,at):token.quote).trim().replace(/\s+/gu,' ');
  if(!name||!/^[\p{L}\p{N} '’\-]+$/u.test(name))return;
  if(at>=0&&!/[）)]$/u.test(token.quote))return;
  return{name,...(annotation===undefined?{}:{annotation})};
}

/** A manual token inherits cadence only from its containing actual grant row,
 * never from a nearby different row, quote or model-supplied offset. */
export function sourceManualSpellGrant(parent:EvidenceRef,manual:EvidenceRef):{
  row:EvidenceRef;token:EvidenceRef;name:string;annotation?:string;
  usage:'at-will'|'1/day-each'|'daily-each'|'daily-shared'|'prepared-cantrip'|'prepared-slots';count?:number;
}|undefined{
  if(!exactEvidence(parent)||!exactEvidence(manual))return;
  if(manual.start<parent.start||manual.end>parent.end||parent.quote.slice(manual.start-parent.start,manual.end-parent.start)!==manual.quote)return;
  for(const row of sourceSpellGrantRows(parent.quote)){
    const label=sourceSpellGrantLabel(row.text);if(!label)continue;
    const at=parent.start+row.index,tokens=sourceSpellGrantTokens(row.text.slice(label[0].length),at+label[0].length);
    const token=tokens?.find(token=>token.start===manual.start&&token.end===manual.end&&token.quote===manual.quote);if(!token)continue;
    const parsed=sourceSpellGrantTokenName(token);if(!parsed)return;
    const daily=dailySpellGrantLabel(row.text);
    const usage=daily?(daily.shared?'daily-shared':daily.count===1?'1/day-each':'daily-each'):/cantrip|戏法/iu.test(label[0])?'prepared-cantrip':/slots?|法位/iu.test(label[0])?'prepared-slots':'at-will';
    return{row:{start:at,end:at+row.text.length,quote:row.text},token,...parsed,usage,...(daily?{count:daily.count}:{})};
  }
}
