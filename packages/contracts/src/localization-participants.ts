import {localizationSourceUrls,withoutLocalizationSourceUrls} from './localization-source-urls';

const categories = [
  {label:'生物',english:/\bcreatures?\b/giu,chinese:/生物|活物|生灵|生命体/gu},
  {label:'物体',english:/\bobjects?\b/giu,chinese:/物体|物件/gu},
  {label:'建筑',english:/\bbuildings?\b/giu,chinese:/建筑(?:物)?/gu},
];
function paragraphs(text:string):string[]{
  const prose=withoutLocalizationSourceUrls(text,localizationSourceUrls(text))
    .replace(/(?:<br\s*\/?>\s*){2,}/giu,'\n\n').replace(/<\/(?:p|li|h[1-6])\s*>/giu,'\n\n')
    .replace(/<[^>]*>|\[\[[\s\S]*?\]\]|@(?:UUID|Compendium)\[[^\]]+\]/giu,' ');
  return prose.split(/\n\s*\n/gu).map(part=>part.trim()).filter(Boolean);
}
/** A bounded contradiction check, not an equivalence proof. A missing category
 * alone can be a pronoun. Only flag its substitution by another category that
 * gains mentions in the corresponding source paragraph. */
export function participantMeaningFindings(source:string,translated:string):string[]{
  let before=paragraphs(source),after=paragraphs(translated);
  if(before.length!==after.length){before=[before.join(' ')];after=[after.join(' ')];}
  return before.flatMap((paragraph,index)=>{
    const sourceCounts=categories.map(category=>[...paragraph.matchAll(category.english)].length);
    const translatedCounts=categories.map(category=>[...(after[index]??'').matchAll(category.chinese)].length);
    const lost=categories.filter((_category,i)=>sourceCounts[i]!>translatedCounts[i]!);
    const gained=categories.filter((_category,i)=>translatedCounts[i]!>sourceCounts[i]!);
    return lost.length&&gained.length
      ?[`段落${index+1}的对象类别可能从${lost.map(c=>c.label).join('/')}变成${gained.map(c=>c.label).join('/')}，须对照来源修正。`]:[];
  });
}

/** Bounded contradictions from recorded source/translation failures. These do
 * not claim general translation equivalence or require one canonical wording. */
export function ruleRelationMeaningFindings(source:string,translated:string):string[]{
  const original=paragraphs(source).join(' ').replace(/\s+/gu,' '),chinese=paragraphs(translated).join('').replace(/\s+/gu,'');
  const findings:string[]=[];
  if(/\bor half as much damage if\s+[^,.;]{1,160}\bBloodied,\s+and the target is Grappled(?:\s*\([^)]*\))?[.;]/iu.test(original)
    &&/(?:若|如果|当)[^。；;]{0,100}减半[，,]且目标[^。；;]{0,12}受擒/u.test(chinese))findings.push('半伤条件被连到后续受擒效果；须分别表达条件半伤与独立结果。');
  const sphere=/\bEach creature in a (\d+)[ -]foot[ -]radius Sphere within (\d+) feet\s+(?:must|makes?|takes?)\b/iu.exec(original);
  if(sphere){
    const radius=/半径(\d+)(?:英)?尺/u.exec(chinese);
    const remaining=original.replace(sphere[0],'');
    const separateSourceLimit=new RegExp(`(?:each|every|the) (?:creature|target)[^.]{0,80}within ${sphere[2]} feet`,'iu').test(remaining);
    const directTargetLimit=!separateSourceLimit&&new RegExp(`每(?:个|一个|名)(?:生物|目标)[^。；;]{0,12}(?:位于|处于|在)${sphere[2]}(?:英)?尺(?:以|之)?内`,'u').test(chinese);
    if((radius&&radius[1]!==sphere[1])||directTargetLimit||new RegExp(`区域内[、，,]?(?:且|并且)(?:位于|在)${sphere[2]}(?:英)?尺内`,'u').test(chinese))findings.push('球形区域的半径与中心点射程混淆，不能把射程改成每个受影响目标的额外距离限制。');
  }
  const swarm=/\bSize\s+(Tiny|Small|Medium|Large|Huge|Gargantuan)\s*\(\s*Swarm of\s+(Tiny|Small|Medium|Large|Huge|Gargantuan)\s*\)/iu.exec(original);
  if(swarm){
    const sizes:Record<string,string>={tiny:'微型',small:'小型',medium:'中型',large:'大型',huge:'巨型',gargantuan:'超巨型'};
    if(new RegExp(`${sizes[swarm[1]!.toLowerCase()]}[（(]${sizes[swarm[2]!.toLowerCase()]}集群[）)]`,'u').test(chinese))findings.push('集群整体体型与组成生物的体型关系缺失。');
  }
  return findings;
}
