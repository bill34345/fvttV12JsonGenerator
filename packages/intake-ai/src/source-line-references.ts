/** Mechanical source indexing for ordinary model proposals. The model selects
 * boundaries and meanings; this module only copies the selected original text
 * (JS UTF-16 positions). It never identifies a creature or an ability. */
import {sourceOperationClauses} from '@fvtt-json-generator/models/source-operations';
import {sourceSpellGrantRows,sourceSpellGrantLabel,sourceSpellGrantTokens} from './spell-grant-tokens';
type Range={start:number;end:number};
type SourceLine={id:string;text:string;start:number;end:number};
function lines(source:string,range:Range):SourceLine[]{
  if(!Number.isSafeInteger(range.start)||!Number.isSafeInteger(range.end)||range.start<0||range.end<range.start||range.end>source.length)throw new TypeError('Invalid source line bounds.');
  return [...source.slice(range.start,range.end).matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/gu)].filter(row=>row[0].length).map((row,index)=>({id:`L${index+1}`,text:row[0].replace(/(?:\r\n|\n|\r)$/u,''),start:range.start+row.index!,end:range.start+row.index!+row[0].length}));
}
export function sourceLineCatalog(source:string,range:Range={start:0,end:source.length}){
  return lines(source,range).map(({id,text})=>({id,text}));
}
/** Reuse the existing proof protocol's boundaries; the model chooses which
 * original clause supports an operation instead of guessing that boundary. */
export function sourceProofCatalog(source:string,range:Range={start:0,end:source.length}){
  lines(source,range); // Validate the same candidate bounds as line references.
  return sourceOperationClauses(source.slice(range.start,range.end)).map((text,index)=>({id:`P${index+1}`,text}));
}
/** These are the same complete list tokens that manual-grant validation uses.
 * The model chooses manual versus native; this catalog only exposes bounds. */
export function sourceGrantCatalog(source:string,range:Range={start:0,end:source.length}){
  lines(source,range);
  try{
    return sourceSpellGrantRows(source.slice(range.start,range.end)).flatMap(row=>{
      const label=sourceSpellGrantLabel(row.text);
      return label?sourceSpellGrantTokens(row.text.slice(label[0].length),range.start+row.index+label[0].length)??[]:[];
    }).map((ref,index)=>({id:`G${index+1}`,...ref}));
  }catch{
    // The catalog is optional citation metadata, not a source acceptance gate.
    // Ambiguous labels stay available as original lines for AI/GM review.
    return [];
  }
}
const textFields=new Set(['description','nativeRuleText','manualRemainder','preamble','text']);
/** Legacy numeric EvidenceRefs remain untouched. Explicit line selections must
 * be valid and exact; bad/mixed/ambiguous references are rejected, not guessed. */
export function materializeSourceLineReferences(source:string,value:unknown,range:Range={start:0,end:source.length}):unknown{
  const table=new Map(lines(source,range).map(row=>[row.id,row]));
  const proofs=new Map(sourceProofCatalog(source,range).map(row=>[row.id,row.text]));
  const visit=(entry:any,key='',proof=false):any=>{
    if(Array.isArray(entry))return entry.map(row=>visit(row,key,proof));
    if(!entry||typeof entry!=='object')return entry;
    if(Object.hasOwn(entry,'clauseId')){
      const selected=proof&&typeof entry.clauseId==='string'?proofs.get(entry.clauseId):undefined;
      if(selected===undefined||Object.keys(entry).length!==1)throw new TypeError('Invalid or misplaced source proof reference.');
      return selected;
    }
    if(Object.hasOwn(entry,'firstLineId')||Object.hasOwn(entry,'lastLineId')){
      const first=table.get(entry.firstLineId),last=table.get(entry.lastLineId);
      if(!first||!last||last.start<first.start||Object.hasOwn(entry,'start')||Object.hasOwn(entry,'end'))throw new TypeError('Invalid or mixed source line reference.');
      let start=first.start,end=last.end,quote=source.slice(start,end);
      if(Object.hasOwn(entry,'quote')){
        if(typeof entry.quote!=='string'||!entry.quote.length)throw new TypeError('Empty source line subquote.');
        const offset=quote.indexOf(entry.quote);
        if(offset<0||quote.indexOf(entry.quote,offset+1)>=0)throw new TypeError('Source line subquote is absent or ambiguous.');
        start+=offset;quote=entry.quote;end=start+quote.length;
      }
      const {firstLineId,lastLineId,quote:_quote,...rest}=entry;
      if(textFields.has(key)||proof){if(Object.keys(rest).length)throw new TypeError('Unexpected source text reference fields.');return quote;}
      return {...rest,start,end,quote};
    }
    return Object.fromEntries(Object.entries(entry).map(([name,next])=>[name,visit(next,name,proof||key==='proof')]));
  };
  return visit(value);
}
