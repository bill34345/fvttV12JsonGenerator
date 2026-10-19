import type {AbilityKey,EvidenceRef} from './types';
import {sourceSpellComponentClause} from './spell-grant-label';

const labels:Record<AbilityKey,string[]>={str:['strength','力量'],dex:['dexterity','敏捷'],con:['constitution','体质'],int:['intelligence','智力'],wis:['wisdom','感知'],cha:['charisma','魅力']};

function normalizedSource(source:string){
  // Keep exact UTF-16 source ranges even when width/ligature normalization changes length.
  let normalized='',offset=0;const starts:number[]=[],ends:number[]=[];
  for(const character of source){
    if(/[*_`]/u.test(character)){offset+=character.length;continue;}
    const value=character.normalize('NFKC').replace(/\s/gu,' ');normalized+=value;
    for(let i=0;i<value.length;i++){starts.push(offset);ends.push(offset+character.length);}
    offset+=character.length;
  }
  return{text:normalized,starts,ends};
}

function declarations(source:string){
  const {text:normalized,starts,ends}=normalizedSource(source);
  const found:Array<{ability:AbilityKey;evidence:EvidenceRef}>=[];
  for(const [ability,names]of Object.entries(labels))for(const name of names){
    const predicate=new RegExp(`(?:(?:its\\s+)?spellcasting\\s+ability\\s+(?:is|uses?)\\s*${name}|(?:uses?|using)\\s+${name}\\s+as\\s+(?:(?:its|the)\\s+)?spellcasting\\s+ability|施法(?:关键)?属性(?:是|为)\\s*${name}|(?:使用|以)\\s*${name}\\s*(?:作为|为)\\s*(?:其|它的|该生物的)?\\s*施法(?:关键)?属性)(?=$|[^\\p{L}\\p{N}]|且|并|以及)`,'giu');
    for(const match of normalized.matchAll(predicate)){
      let before=normalized.slice(0,match.index).split(/[。.;；!?！？]|\bbut\b|而是/iu).at(-1)??'';
      const component=sourceSpellComponentClause(before);
      if(component&&!component.ambiguous)before=before.slice(0,component.match.index)+before.slice(component.match.index+component.match[0].length);
      if(/\b(?:not|never|cannot|if|unless|when|while)\b|\b[a-z]+n['’]t\b|不|并非|不是|未|不能|无法|如果|除非|仅当|若/iu.test(before))continue;
      const start=starts[match.index]!,end=ends[match.index+match[0].length-1]!;
      found.push({ability:ability as AbilityKey,evidence:{start,end,quote:source.slice(start,end)}});
    }
  }
  return found.sort((left,right)=>left.evidence.start-right.evidence.start);
}

type AbilityFact={ability:AbilityKey;evidence:EvidenceRef;removable:EvidenceRef;polarity:'positive'|'negative'|'conditional'|'ambiguous'};
export type SpellcastingAbilityAssessment={status:'supported'|'contradicted'|'unconfirmed'};

/** Bind the role and literal value inside source clauses, independent of the
 * model's proposed value. Syntax/layout varies; a bare ability name or an
 * attack/save role is never evidence for the spellcasting field. */
function sourceAbilityFacts(source:string):AbilityFact[]{
  const {text,starts,ends}=normalizedSource(source),facts:AbilityFact[]=[];
  const exact=(start:number,end:number):EvidenceRef=>({start:starts[start]!,end:ends[end-1]!,quote:source.slice(starts[start]!,ends[end-1]!)});
  for(const sentence of text.matchAll(/[^。.;；!?！？]+/gu)){
    const sentenceStart=sentence.index!;
    for(const clause of sentence[0].matchAll(/[^,，]+/gu)){
      const clauseStart=sentenceStart+clause.index!,value=clause[0];
      const role=/(?:spellcasting\s+ability|施法[^,，。.;；!?！？]{0,16}属性|spellcasting|施法)/iu.exec(value);
      if(!role)continue;
      const mentions=Object.entries(labels).flatMap(([ability,names])=>names.flatMap(name=>{
        const pattern=/^[a-z]+$/u.test(name)?new RegExp(`(?<![\\p{L}\\p{N}])${name}(?![\\p{L}\\p{N}])`,'giu'):new RegExp(name,'gu');
        return [...value.matchAll(pattern)].map(match=>({ability:ability as AbilityKey,start:match.index!,end:match.index!+match[0].length}));
      }));
      if(!mentions.length)continue;
      const nounRole=/ability|属性/iu.test(role[0]);
      if(!nounRole&&!/\b(?:uses?|using|relies|based)\b|使用|采用|基于|依赖|用于/iu.test(value))continue;
      for(const mention of mentions){
        const left=Math.min(role.index,mention.start),right=Math.max(role.index+role[0].length,mention.end);
        const binding=value.slice(left,right);
        if(/\b(?:attack|save|saving|target|damage)\b|攻击|豁免|目标|伤害/iu.test(binding))continue;
        // A shared clause is not a relation. Require a complete affirmative
        // assignment/use connector, in either order; unknown relations stay unknown.
        const afterRole=mention.start>=role.index+role[0].length;
        const connector=afterRole?value.slice(role.index+role[0].length,mention.start):value.slice(mention.end,role.index);
        const affirmative=afterRole
          ? /^\s*(?:(?:is|uses?|equals?|relies\s+on|depends\s+on|is\s+based\s+on)|[:=]|(?:是|为|使用|采用|依赖|基于)|(?:时|时会|时所)(?:使用|采用|依赖|基于))\s*$/iu.test(connector)
          : /^\s*(?:(?:as|is|for)\s+(?:(?:its|the|their)\s+)?|(?:作为|用于|是|为)(?:其|它的|该生物的|本生物的)?)\s*$/iu.test(connector);
        let context=text.slice(sentenceStart,clauseStart+value.length).split(/\bbut\b|而是/iu).at(-1)??'';
        const component=sourceSpellComponentClause(context);
        if(component&&!component.ambiguous)context=context.slice(0,component.match.index)+context.slice(component.match.index+component.match[0].length);
        // A trailing condition still qualifies this fact unless a new subject
        // explicitly starts a separate named-spell casting predicate. That spell's
        // own restrictions remain the responsibility of the spell-grant validator.
        let conditionScope=sentence[0];
        for(const next of sentence[0].matchAll(/[^,，]+/gu)){
          if(next.index!<=clause.index!)continue;
          if(/spellcasting\s+ability|施法[^,，]{0,16}属性/iu.test(next[0]))continue;
          if(/^\s*(?:(?:and|but)\s+)?(?:it|this creature|the creature|the monster)\s+(?:can\s+)?casts?\s+(?!the\b|spells?\b|using\b|with\b|when\b|if\b)[\p{L}]|^\s*(?:并且?|且|而)?(?:它|该生物)(?:可以|能够|能)?(?:施展|施放)(?!法术|以下|下列|使用)[\p{L}]/iu.test(next[0])){
            conditionScope=sentence[0].slice(0,next.index);break;
          }
        }
        const conditional=/\b(?:if|unless|when|while|whenever|provided|only)\b|如果|除非|仅当|仅在|只有|每当|若|(?:当|在)[^,，]{1,40}时/iu.test(conditionScope);
        const negative=/\b(?:not|never|cannot)\b|\b[a-z]+n['’]t\b|不|并非|不是|未|不能|无法/iu.test(context);
        const quoted=/["“「『][^"”」』]*$/u.test(value.slice(0,left));
        const ambiguous=!affirmative||new Set(mentions.map(entry=>entry.ability)).size!==1||quoted;
        const evidence=exact(clauseStart+left,clauseStart+right);
        const prefix=value.slice(0,left);
        const removeStart=/^\s*(?:(?:its?|the creature|the monster)\s+|其|它的|该生物的|本生物的)?\s*$/iu.test(prefix)?clauseStart:clauseStart+left;
        facts.push({ability:mention.ability,evidence,removable:exact(removeStart,clauseStart+right),polarity:negative?'negative':conditional?'conditional':ambiguous?'ambiguous':'positive'});
      }
    }
  }
  return facts;
}

/** Check an AI-normalized fact against exact evidence AND its whole owning
 * group. A clipped quote cannot hide a later contradiction or earlier condition.
 * Unknown prose remains unconfirmed; exact coordinates alone never prove meaning. */
export function assessSourceSpellcastingAbility(source:string,ability:AbilityKey,evidence:EvidenceRef[]|undefined,owners:EvidenceRef[]|undefined):SpellcastingAbilityAssessment{
  const exact=(ref:EvidenceRef)=>ref&&Number.isSafeInteger(ref.start)&&Number.isSafeInteger(ref.end)&&ref.start>=0&&ref.end>ref.start&&ref.end<=source.length&&source.slice(ref.start,ref.end)===ref.quote;
  if(!evidence?.length||!owners?.length||!evidence.every(exact)||!owners.every(exact))return{status:'unconfirmed'};
  const word=(value:string|undefined)=>!!value&&/[\p{Script=Latin}\p{N}]/u.test(value.normalize('NFKC'));
  if(evidence.some(ref=>word([...source.slice(Math.max(0,ref.start-2),ref.start)].at(-1))&&word([...ref.quote][0])
    ||word([...ref.quote].at(-1))&&word([...source.slice(ref.end,ref.end+2)][0])))return{status:'unconfirmed'};
  const contains=(outer:EvidenceRef,inner:EvidenceRef)=>inner.start>=outer.start&&inner.end<=outer.end;
  const outside=evidence.some(ref=>!owners.some(owner=>contains(owner,ref)));
  const inherited=owners.some(owner=>/使用与施法动作相同的施法属性|same spellcasting ability/iu.test(owner.quote));
  if(outside&&!inherited)return{status:'unconfirmed'};
  const scopes=outside?[{start:0,end:source.length,quote:source}]:owners;
  const facts=scopes.flatMap(scope=>sourceAbilityFacts(scope.quote).map(fact=>({...fact,evidence:{...fact.evidence,start:scope.start+fact.evidence.start,end:scope.start+fact.evidence.end}})));
  const positives=facts.filter(fact=>fact.polarity==='positive');
  const values=new Set(positives.map(fact=>fact.ability));
  if(values.size>1||values.size===1&&!values.has(ability)||facts.some(fact=>fact.ability===ability&&fact.polarity==='negative'))return{status:'contradicted'};
  if(facts.some(fact=>fact.polarity==='conditional'||fact.polarity==='ambiguous'))return{status:'unconfirmed'};
  const proof=positives.some(fact=>fact.ability===ability&&evidence.some(ref=>contains(ref,fact.evidence)));
  return{status:proof?'supported':'unconfirmed'};
}

/** One affirmative, unambiguous source fact shared by extraction and validation. */
export function sourceSpellcastingAbility(source:string,offset=0):{ability:AbilityKey;evidence:EvidenceRef}|undefined{
  const found=declarations(source);
  if(new Set(found.map(entry=>entry.ability)).size!==1)return;
  const first=found[0]!;
  if(assessSourceSpellcastingAbility(source,first.ability,[first.evidence],[{start:0,end:source.length,quote:source}]).status!=='supported')return;
  return{ability:first.ability,evidence:{...first.evidence,start:offset+first.evidence.start,end:offset+first.evidence.end}};
}

/** Remove only the same proved profile from component-waiver metadata. */
export function withoutSourceSpellcastingAbility(source:string):string{
  const facts=sourceAbilityFacts(source),values=new Set(facts.filter(fact=>fact.polarity==='positive').map(fact=>fact.ability));
  if(values.size!==1)return source;
  const ability=[...values][0]!,owner={start:0,end:source.length,quote:source};
  const selected=facts.filter(fact=>fact.ability===ability&&fact.polarity==='positive');
  if(assessSourceSpellcastingAbility(source,ability,selected.map(fact=>fact.evidence),[owner]).status!=='supported')return source;
  const legacy=declarations(source),found:EvidenceRef[]=[];
  for(const fact of selected){
    const span=legacy.find(entry=>entry.evidence.start<=fact.evidence.start&&entry.evidence.end>=fact.evidence.end)?.evidence??fact.removable;
    if(!found.some(existing=>existing.start===span.start&&existing.end===span.end))found.push(span);
  }
  let result=source;
  for(const evidence of found.sort((a,b)=>b.start-a.start))result=result.slice(0,evidence.start)+result.slice(evidence.end);
  return result;
}
