import { sha256 } from '@fvtt-json-generator/contracts/hash';
import type { CanonicalMonster, EvidenceRef, ExtractionRequest, IntakeSection } from './types';
import {headerPresentation} from './header-presentation';
import {sourceActorNameMatches} from './source-subject';

export type StagedSourceDestination = 'base' | 'feature' | 'biography' | 'context' | 'markup';
export interface StagedSourceUnit extends EvidenceRef {
  id: string;
  destination: StagedSourceDestination;
  section?: IntakeSection;
  name?: string;
  /** Context is read-only; its text remains owned by its own source unit. */
  contextIds?: string[];
}
export interface StagedMonsterSource {
  version: 1;
  source: string;
  sourceSha256: string;
  candidate: ExtractionRequest['candidate'];
  base: StagedSourceUnit;
  units: StagedSourceUnit[];
  features: StagedSourceUnit[];
  /** A model may select immutable line IDs; only the program maps coordinates. */
  linePartition?: unknown;
}

export class StagedExtractionError extends Error {
  constructor(readonly code: string, readonly path: string) {
    super(`Staged extraction rejected ${code} at ${path}.`);
    this.name = 'StagedExtractionError';
  }
}

const SECTIONS: Record<string, IntakeSection> = {
  traits: 'trait', trait: 'trait', 特质: 'trait', 特性: 'trait', 特质traits: 'trait', 特性traits: 'trait',
  actions: 'action', 动作: 'action', 动作actions: 'action',
  'bonus actions': 'bonus', 附赠动作: 'bonus', 附赠动作bonusactions: 'bonus',
  reactions: 'reaction', reaction: 'reaction', 反应: 'reaction', 反应reactions: 'reaction',
  'legendary actions': 'legendary', 传奇动作: 'legendary', 传奇动作legendaryactions: 'legendary',
  'mythic actions': 'mythic', 神话动作: 'mythic', 神话动作mythicactions: 'mythic',
};
// Lowercase articles, conjunctions and prepositions are valid whole heading
// words. Content words still require title casing; never case-fold prose or
// rewrite the printed source label to manufacture an ability boundary.
const TITLE_WORD = /^(?:[\p{Lu}\p{Lt}\d][\p{L}\p{N}'’\-]*|a|an|the|and|or|but|nor|as|at|by|for|from|in|into|of|off|on|onto|out|over|to|up|upon|via|with|without|about|above|across|after|against|along|among|around|before|behind|below|beneath|beside|between|beyond|during|near|past|through|throughout|toward|towards|under|underneath|until|within)$/u;
// A slash joins complete title words, not arbitrary text or an empty side.
const titleWord = (word:string):boolean=>word.split('/').every(part=>TITLE_WORD.test(part));
const BASE_METADATA = /^(?:AC\b|Armor Class\b|HP\b|Hit Points\b|Speed\b|Initiative\b|Size\b|Type\b|Skills\b|Saving Throws\b|Damage (?:Immunities|Resistances|Vulnerabilities)\b|Condition Immunities\b|Immunities\b|Resistances\b|Vulnerabilities\b|Senses\b|Languages\b|Challenge\b|CR\b|XP\b|Proficiency Bonus\b|Drives\b|MOD\b|SAVE\b|STR\b|DEX\b|CON\b|INT\b|WIS\b|CHA\b|护甲等级|生命值|速度|先攻|技能|豁免|感官|语言|力量|敏捷|体质|智力|感知|魅力|抗性|免疫|调整)/iu;

function bareHeading(line: string): string {
  return headerPresentation(line).trim().replace(/^#{1,6}\s*/u, '').replace(/[*_]/gu, '').replace(/[:：]\s*$/u, '').trim();
}
function sectionHeading(line: string): IntakeSection | undefined {
  const text = bareHeading(line).toLowerCase();
  return SECTIONS[text] ?? SECTIONS[text.replace(/\s+/gu, '')];
}
// Presence validation must use the same complete heading as source partitioning,
// not the first word of wrapped prose such as "actions at the start of its turn".
export {sectionHeading as sourceSectionHeading};
function referenceHeading(line: string): boolean {
  return /^(?:Referenced definitions(?: from the same PDF)?|Reference definitions|Definitions|引用定义|参考定义)(?:\s|$)/iu.test(bareHeading(line));
}

function featureLabel(text: string): string | undefined {
  // A closed bold title is an explicit source boundary even when Chinese
  // typography puts the body immediately after its stop, without a space.
  // Keep this separate from plain prose so an inline sentence cannot become
  // a new ability or detach a conditional Save from its parent attack.
  const bold = /^\s*(?:#{1,6}\s*)?\*{2,3}([^*。.\r\n]{1,120})[。.]\*{2,3}/u.exec(text);
  const cleaned = text.trim().replace(/^#{1,6}\s*/u, '').replace(/^[*_]+/u, '');
  // A published variant sidebar has a standalone title, without a full stop.
  // Only its own physical title line is a boundary; arbitrary colon prose or
  // a flattened title plus its body cannot acquire a guessed feature name.
  const variant = /^Variant:[ \t]+([^\r\n]{1,100})(?:\r?\n|$)/u.exec(cleaned);
  if (variant) {
    const title=variant[1]!.trim(),words=title.split(/\s+/u);
    if(words.length<=12&&words.every(word=>titleWord(word)))return 'Variant: '+title;
  }
  // A numbered option belongs to its complete parent, including the shared
  // target, selection and timing. Splitting it would lose that context.
  if (/^(?:\d+[.)]|[-•])\s/u.test(cleaned)) return;
  const match = cleaned.match(/^([^。.\n]{1,100}(?:\([^)]{1,160}\))?)[。.](?:[*_]*)(?:\s|$)/u);
  const name = (bold?.[1]??match?.[1])?.replace(/[*_]/gu, '').trim();
  if (!name || name.length > 120) return;
  const title = name.replace(/\s*\([^)]*\)\s*$/u, '').trim();
  if (/\p{Script=Han}/u.test(title)) return name;
  const words = title.split(/\s+/u);
  return /^[\p{Lu}\p{Lt}\d]/u.test(title) && words.length <= 12 && words.every(word => titleWord(word)) ? name.replace(/\s+/gu, ' ') : undefined;
}
// The completeness verifier must use the same physical title boundary.
export {featureLabel as sourceFeatureLabel};

/** A physical title needs a source-owned section position as well as casing.
 * Callers may use this only for its first nonempty content line, never while
 * scanning stat headers or a wrapped ability body. */
function standaloneSectionTitle(line:string,followingLine=''):string|undefined{
  const title=bareHeading(line);
  if(!title||title.length>120||sectionHeading(line)||referenceHeading(line)||/^Level\s+\d+$/iu.test(title))return;
  // As with run-in labels, the first word must establish title casing;
  // a lowercase preposition fragment is not an independent source title.
  if(!/^[\p{Lu}\p{Lt}\d]/u.test(title))return;
  // A stat-like word can also name a complete rule chapter. Its independent
  // section position plus a following prose clause proves that boundary;
  // values, column labels and wrapped stat rows never do.
  if(BASE_METADATA.test(title)){
    const body=bareHeading(followingLine);
    if(!/^[\p{Lu}\p{Lt}][\p{L}'’\-]*$/u.test(title)||BASE_METADATA.test(body)
      ||!/^[\p{Lu}\p{Lt}][^\r\n]*\b(?:is|are|has|have|can|must|may|uses?|moves?|rolls?|determines?|represents?)\b/iu.test(body))return;
  }
  if(/^(?:Tiny|Small|Medium|Large|Huge|Gargantuan)\s/iu.test(title))return;
  const columns=new Set(['strength','dexterity','constitution','intelligence','wisdom','charisma','str','dex','con','int','wis','cha','size','type','substance','color','damage','resistance','level','cr','ac','hp','xp','pb','proficiency','bonus','score','modifier','saving','throw','fragile','resilient','limitations','example','cost','weight']);
  // These are physical, source-classified headings, never inline prose.
  const classified=/^(.+?)\s+\[(?:Hazard|Condition|Area of Effect|Action)\]$/u.exec(title);
  const level=/^Level [1-9]\d?:[ \t]+(.+)$/u.exec(title);
  const named=classified?.[1]??level?.[1];
  if(named){const parts=named.split(/\s+/u);return parts.length<=12&&parts.every(word=>titleWord(word))&&!parts.every(word=>columns.has(word.toLowerCase()))?title:undefined;}
  // A cost belongs to a standalone equipment title, never to a resource
  // counter or a dice field. Keep the complete original title as identity.
  const priced=/^(.+?)\s+\((?:\d+(?:,\d{3})*|\d+\.\d+)\s+(?:CP|SP|EP|GP|PP)\)$/u.exec(title);
  const words=(priced?.[1]??title).split(/\s+/u);
  if(words.every(word=>columns.has(word.toLowerCase())))return;
  if(words.every(word=>/^(?:a|an|the|any|each|every|one|its|their)$/iu.test(word)))return;
  return words.length<=12&&words.every(word=>titleWord(word))?title:undefined;
}

/** Find only the stat header. A later ability's punctuation or wrapping cannot
 * disable its independent numeric checks. Boundaries are raw source line starts,
 * so presentation equivalence never rewrites evidence or borrows body numbers. */
export function sourceStatHeader(request:ExtractionRequest):EvidenceRef {
  const {source,candidate}=request;
  if(request.sourceSha256!==sha256(source))throw new StagedExtractionError('SOURCE_HASH','/sourceSha256');
  if(!Number.isInteger(candidate.start)||!Number.isInteger(candidate.end)||candidate.start<0||candidate.end>source.length||candidate.start>=candidate.end||source.slice(candidate.start,candidate.end)!==candidate.quote)throw new StagedExtractionError('CANDIDATE_RANGE','/candidate');
  const lines=[...candidate.quote.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/gu)].filter(match=>match[0].length);
  const view=(line:string)=>headerPresentation(line).replace(/\*{1,3}|_{2,3}/gu,'').trim();
  const statStart=lines.findIndex(line=>/^(?:AC\b|Armor Class\b|armor_class\s*:|护甲等级)\s*[:：]?/iu.test(view(line[0])));
  // Existing YAML front matter owns its complete header even without an AC row.
  const yamlStart=view(lines[0]?.[0]??'')==='---';
  const yamlEnd=yamlStart?lines.findIndex((line,index)=>index>0&&view(line[0])==='---'):-1;
  if(yamlStart&&yamlEnd<0)throw new StagedExtractionError('UNCLOSED_HEADER','/source');
  if(statStart<0&&yamlEnd<0)throw new StagedExtractionError('MISSING_STAT_HEADER','/source');
  let end=candidate.end;
  for(let index=Math.max(statStart+1,yamlEnd+1);index<lines.length;index++){
    const original=lines[index]!,text=view(original[0]);
    if(!text)continue;
    if(sectionHeading(text)||referenceHeading(text)||!BASE_METADATA.test(text)&&featureLabel(text)){
      end=candidate.start+original.index!;break;
    }
  }
  return{start:candidate.start,end,quote:source.slice(candidate.start,end)};
}

/** A conservative, lossless partition. Unknown headings and unlabelled
 * mechanics are rejected rather than guessed or removed. No model offsets or
 * model-copied body text enter this source graph. */
export function splitStagedMonsterSource(request: ExtractionRequest): StagedMonsterSource {
  const { source, candidate } = request;
  if (request.sourceSha256 !== sha256(source)) throw new StagedExtractionError('SOURCE_HASH', '/sourceSha256');
  if (!Number.isInteger(candidate.start) || !Number.isInteger(candidate.end) || candidate.start < 0
    || candidate.end <= candidate.start || candidate.end > source.length
    || source.slice(candidate.start, candidate.end) !== candidate.quote) throw new StagedExtractionError('CANDIDATE_RANGE', '/candidate');
  if (/<!--|<\/?[a-z][^>]*>/iu.test(candidate.quote.replace(/<!--\s*document-source\b[^]*?-->/gu, ''))) throw new StagedExtractionError('UNSUPPORTED_MARKUP', '/source');
  const lines = [...candidate.quote.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/gu)]
    .filter(match => match[0].length > 0).map(match => ({ text: match[0], start: candidate.start + match.index! }));
  let yamlEnd = -1;
  if (lines[0]?.text.trim() === '---') {
    yamlEnd = lines.findIndex((line, index) => index > 0 && line.text.trim() === '---');
    if (yamlEnd < 0) throw new StagedExtractionError('UNCLOSED_HEADER', '/source');
  }
  const statStart = lines.findIndex(line => /^(?:AC|Armor Class|护甲等级)\s*[:：]?\s*\d/iu.test(headerPresentation(line.text).replace(/\*{1,3}|_{2,3}/gu, '').trim()));
  const hasStats = yamlEnd >= 0 || statStart >= 0;
  if (!hasStats) throw new StagedExtractionError('MISSING_STAT_HEADER', '/source');
  const events: Array<{ start: number; destination: StagedSourceDestination; section?: IntakeSection; name?: string }> = [];
  let section: IntakeSection = 'trait';
  let inMechanics = false;
  let inReferences = false;
  let firstSectionContent = false;
  for (let index = Math.max(0, yamlEnd + 1); index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line.text.trim()) continue;
    if (inMechanics && /^(?:AC|Armor Class|护甲等级)\s*[:：]?\s*\d/iu.test(line.text.normalize('NFKC').trim())) throw new StagedExtractionError('MULTIPLE_STAT_BLOCKS', `/source/${line.start}`);
    if (referenceHeading(line.text)) { events.push({ start: line.start, destination: 'biography' }); inReferences = true; continue; }
    if (inReferences) continue;
    const foundSection = sectionHeading(line.text);
    if (foundSection) { section = foundSection; inMechanics = true; firstSectionContent=true; events.push({ start: line.start, destination: 'context', section }); continue; }
    if (!inMechanics && BASE_METADATA.test(headerPresentation(line.text).replace(/\*{1,3}|_{2,3}/gu, '').trim())) continue;
    const explicit = /^\s*#{2,6}\s/u.test(line.text);
    // An unsupported mechanical section is never narrative, even before AC.
    if (/^(?:Lair Actions|Regional Effects|Villain Actions|巢穴动作|区域效应)\s*$/iu.test(bareHeading(line.text))) throw new StagedExtractionError('UNKNOWN_HEADING', `/source/${line.start}`);
    // Position owns the article preface; a vocabulary of possible narrative
    // titles cannot cover published sources. Preserve every prefix byte in
    // base/biography. Recognized mechanical sections above take precedence,
    // and unknown headings after the stat table remain strict below.
    if (!inMechanics && statStart >= 0 && index < statStart && explicit) continue;
    const emphasized = /^\s*\*{2,3}/u.test(line.text);
    let label = featureLabel(line.text);
    if(!label&&inMechanics&&(firstSectionContent||/^Level [1-9]\d?:[ \t]+[^\r\n]+$/u.test(bareHeading(line.text))))label=standaloneSectionTitle(line.text,lines.slice(index+1).find(entry=>entry.text.trim())?.text);
    if(inMechanics)firstSectionContent=false;
    // PDF extraction may wrap a parenthesized qualifier before the period.
    if (!label && /\([^)]*\r?\n$/u.test(line.text)) {
      const joined = lines.slice(index, index + 3).map(entry => entry.text.trim()).join(' ');
      label = featureLabel(joined);
    }
    if (label && inMechanics && !explicit && !emphasized) {
      let previous = index - 1;
      while (previous >= 0 && !lines[previous]!.text.trim()) previous -= 1;
      const preceding = previous >= 0 ? lines[previous]!.text.trim() : '';
      // A PDF line break does not end a rule. In particular "Steal Passion.",
      // "Heavy Armor." or "DC 12." may merely finish a preceding sentence.
      if (preceding && !sectionHeading(preceding) && !/[.!?。！？][\])}"'’”*_]*$/u.test(preceding)) {
        const tail = line.text.replace(/[*_]/gu, '').trim().replace(/^[^.。]*[.。]\s*/u, '').trim();
        const clearContinuation = !tail || /^DC\s*\d/iu.test(label)
          || /\b(?:is|are|becomes|become|a|an|the|its|their|with|or|and|to|of|from|in|using|wearing|uses|make|takes|can|at|against|until|before|after|without|under|while|this|these)\s*[:：]?$/iu.test(preceding);
        // Published PDFs can omit a paragraph's final stop. A complete,
        // source-explicit rest-recovery suffix supplies stronger heading
        // evidence, while grammatical continuations still stay together.
        const restRecoveryHeading = /\(recharges?\s+after\s+(?:a\s+)?(?:short(?:\s+or\s+(?:a\s+)?long)?|long(?:\s+or\s+(?:a\s+)?short)?)\s+rest\)$/iu.test(label);
        if (!clearContinuation && !restRecoveryHeading) throw new StagedExtractionError('UNKNOWN_ABILITY_BOUNDARY', `/source/${line.start}`);
        if (clearContinuation) label = undefined;
      }
    }
    const plainAfterHeader = statStart >= 0 && index > statStart;
    if (label && plainAfterHeader && !inMechanics && !explicit && !emphasized) {
      let previous = index - 1;
      while (previous >= 0 && !lines[previous]!.text.trim()) previous -= 1;
      if (previous >= 0 && /[,;:，；：\-]|\b(?:and|or)$/iu.test(lines[previous]!.text.trim().slice(-5))) label = undefined;
    }
    if (label && (inMechanics || emphasized || explicit || yamlEnd >= 0 || plainAfterHeader)) {
      inMechanics = true;
      events.push({ start: line.start, destination: 'feature', section, name: label });
    } else if (explicit) {
      throw new StagedExtractionError('UNKNOWN_HEADING', `/source/${line.start}`);
    }
  }
  if (!events.length || events[0]!.start <= candidate.start) throw new StagedExtractionError('UNKNOWN_ABILITY_BOUNDARY', '/source');
  const first = events[0]!.start;
  const base: StagedSourceUnit = { id: 'base', destination: 'base', start: candidate.start, end: first, quote: source.slice(candidate.start, first) };
  const units: StagedSourceUnit[] = [base];
  let contextIds: string[] = [];
  for (const [index, event] of events.entries()) {
    const end = events[index + 1]?.start ?? candidate.end;
    const unit: StagedSourceUnit = { ...event, id: `unit-${index + 1}`, end, quote: source.slice(event.start, end) };
    if (event.destination === 'context') {
      contextIds = [unit.id];
      const body = unit.quote.replace(/^[^\r\n]*(?:\r\n|\n|\r|$)/u, '').trim();
      // Legendary/Mythic sections have legitimate shared preambles; arbitrary
      // unlabelled Actions prose is an unknown boundary, not biography.
      if (body && event.section !== 'legendary' && event.section !== 'mythic'
        && !/^(?:none\.?|no (?:traits|actions|reactions)\.?|无[。.]?)$/iu.test(body)) throw new StagedExtractionError('UNLABELLED_MECHANICS', `/source/${event.start}`);
    }
    if (event.destination === 'feature') unit.contextIds = [...contextIds];
    const titleLine=bareHeading(unit.quote.split(/\r\n|\n|\r/u)[0]??'');
    const body=titleLine===unit.name?unit.quote.replace(/^[^\r\n]*(?:\r\n|\n|\r|$)/u,''):unit.quote.replace(/[*_]/gu, '').replace(/^[^.。]*[.。]\s*/u, '');
    if (event.destination === 'feature' && !body.trim()) throw new StagedExtractionError('EMPTY_FEATURE_BODY', `/source/${event.start}`);
    units.push(unit);
  }
  const plan: StagedMonsterSource = { version: 1, source, sourceSha256: request.sourceSha256, candidate: structuredClone(candidate), base, units,
    features: units.filter(unit => unit.destination === 'feature') };
  checkStagedSourcePartition(plan);
  if (plan.features.length > 64 || [plan.base, ...plan.features].some(unit => unit.quote.length > 16_000)) throw new StagedExtractionError('STAGE_INPUT_LIMIT', '/units');
  return plan;
}

export function assertStagedSourcePartition(plan: StagedMonsterSource): void {
  checkStagedSourcePartition(plan);
  const request={ source: plan.source, sourceSha256: plan.sourceSha256, candidate: plan.candidate };
  const canonical = plan.linePartition===undefined?splitStagedMonsterSource(request):assembleStagedLinePartition(request,plan.linePartition);
  if (JSON.stringify(canonical.units) !== JSON.stringify(plan.units)) throw new StagedExtractionError('SOURCE_PARTITION', '/units');
}

export function stagedSourceLines(request:ExtractionRequest):Array<{id:number;text:string}>{
  if(sha256(request.source)!==request.sourceSha256||request.source.slice(request.candidate.start,request.candidate.end)!==request.candidate.quote)throw new StagedExtractionError('SOURCE_HASH','/source');
  return [...request.candidate.quote.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/gu)].filter(match=>match[0].length).map((match,id)=>({id,text:match[0]}));
}

/** Bounded segmentation fallback: every source line belongs to exactly one
 * contiguous unit. No model-generated offsets, copied body or hidden gaps. */
export function assembleStagedLinePartition(request:ExtractionRequest,value:unknown):StagedMonsterSource{
  const object=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
  if(!object||Object.keys(object).some(key=>!['schemaVersion','units'].includes(key))||object.schemaVersion!==1||!Array.isArray(object.units)||object.units.length<2||object.units.length>130)throw new StagedExtractionError('SOURCE_LINE_PARTITION','/units');
  const lines=stagedSourceLines(request),offsets:number[]=[];
  let offset=request.candidate.start;
  for(const line of lines){offsets.push(offset);offset+=line.text.length;}
  offsets.push(offset);
  const units:StagedSourceUnit[]=[],sections=new Set(Object.values(SECTIONS));
  let next=0,contextIds:string[]=[];
  for(const [index,value]of object.units.entries()){
    const row=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
    if(!row||Object.keys(row).some(key=>!['firstLine','lastLine','destination','section','name'].includes(key))||!Number.isSafeInteger(row.firstLine)||!Number.isSafeInteger(row.lastLine)||row.firstLine!==next||Number(row.lastLine)<next||Number(row.lastLine)>=lines.length)throw new StagedExtractionError('SOURCE_LINE_COVERAGE',`/units/${index}`);
    next=Number(row.lastLine)+1;
    const destination=row.destination as StagedSourceDestination,printedSection=destination==='context'?sectionHeading(lines[Number(row.firstLine)]!.text):undefined;
    const section=(row.section===undefined&&destination==='context'?printedSection:row.section) as IntakeSection|undefined;
    if(!['base','feature','context','biography'].includes(destination)||index===0&&destination!=='base'||index>0&&destination==='base'||section!==undefined&&!sections.has(section))throw new StagedExtractionError('SOURCE_LINE_DESTINATION',`/units/${index}`);
    const start=offsets[Number(row.firstLine)]!,end=offsets[next]!,quote=request.source.slice(start,end),id=index===0?'base':`unit-${index}`;
    const unit:StagedSourceUnit={id,destination,start,end,quote,...(section?{section}:{})};
    if(destination==='feature'){
      const previous=units.at(-1),firstContent=previous?.destination==='context'&&previous.section===section&&!previous.quote.replace(/^[^\r\n]*(?:\r\n|\n|\r|$)/u,'').trim();
      if(!section||typeof row.name!=='string'||!row.name.trim()||row.name.length>120||!textIncludesLabel(quote,row.name,firstContent))throw new StagedExtractionError('SOURCE_LINE_LABEL',`/units/${index}`);
      if(contextIds.some(id=>units.find(context=>context.id===id)?.section!==section))throw new StagedExtractionError('SOURCE_LINE_CONTEXT_SECTION',`/units/${index}`);
      unit.name=row.name;unit.contextIds=[...contextIds];
    }else if(row.name!==undefined)throw new StagedExtractionError('SOURCE_LINE_LABEL',`/units/${index}`);
    if(destination==='context'){
      if(!section||printedSection!==section)throw new StagedExtractionError('SOURCE_LINE_CONTEXT',`/units/${index}`);
      contextIds=[id];
    }
    if(destination==='biography'&&!referenceHeading(lines[Number(row.firstLine)]!.text))throw new StagedExtractionError('SOURCE_LINE_NARRATIVE',`/units/${index}`);
    units.push(unit);
  }
  if(next!==lines.length||!units.some(unit=>unit.destination==='feature'))throw new StagedExtractionError('SOURCE_LINE_COVERAGE','/units');
  const plan:StagedMonsterSource={version:1,source:request.source,sourceSha256:request.sourceSha256,candidate:structuredClone(request.candidate),base:units[0]!,units,features:units.filter(unit=>unit.destination==='feature'),linePartition:structuredClone(value)};
  checkStagedSourcePartition(plan);
  if(plan.features.length>64||[plan.base,...plan.features].some(unit=>unit.quote.length>16000))throw new StagedExtractionError('STAGE_INPUT_LIMIT','/units');
  return plan;
}

function textIncludesLabel(quote:string,label:string,firstSectionContent=false):boolean{
  const visible=(value:string)=>value.replace(/[*_#]/gu,'').trim();
  const lines=quote.split(/\r\n|\n|\r/u),source=visible(lines[0]??''),name=visible(label);
  if(firstSectionContent&&source===name&&standaloneSectionTitle(lines[0]??'',lines.slice(1).find(line=>line.trim()))===name)return true;
  if(source===name&&featureLabel(lines[0]??'')===name&&/^Variant:/u.test(name))return true;
  if(source.startsWith(name)&&/^[。.：:]/u.test(source.slice(name.length).trimStart()))return true;
  // A wrapped label is still the exact printed prefix. Join only contiguous
  // label lines, never an empty paragraph, section heading or prior sentence.
  // Whitespace is presentation; words, punctuation and their order stay exact.
  const expected=name.replace(/\s+/gu,' ');let prefix='';
  for(const line of lines){
    if(!line.trim()||sectionHeading(line)||referenceHeading(line))return false;
    prefix=(prefix?prefix+' ':'')+visible(line).replace(/\s+/gu,' ');
    const stop=prefix.search(/[。.：:]/u);
    if(stop>=0)return prefix.slice(0,stop).trim()===expected;
    if(prefix.length>120)return false;
  }
  return false;
}

/** A source-explicit shared budget is a safe GM counter, not an executable
 * legendary rule. Conditional/unknown budgets remain full literal context. */
/** The 2024 shared ledger proves one use per action independently of its
 * conditional pool ceiling. Unknown additions remain complete GM context. */
export function stagedLegendaryLedger(unit:StagedSourceUnit,actorName?:string|readonly string[]):{cost:1;max?:number;conditional:boolean}|undefined{
  if(unit.destination!=='context'||unit.section!=='legendary')return;
  const body=unit.quote.replace(/^[^\r\n]*(?:\r\n|\n|\r|$)/u,'').replace(/\s+/gu,' ').trim();
  const match=/^Legendary Action Uses:\s*(\d+)(?:\s*\((\d+) in Lair\))?\. Immediately after another creature['’]s turn, (?<owner>[\p{L}'’ \-]+?) can expend a use to take one of the following actions\. (?<recoveryOwner>[\p{L}'’ \-]+?) regains all expended uses at the start of each of its turns\.$/iu.exec(body);
  if(!match)return;
  const owner=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/^the\s+/u,'').replace(/\s+/gu,' ').trim();
  const subject=owner(match.groups!.owner!),recovery=owner(match.groups!.recoveryOwner!);
  if(!actorName&&subject!==recovery)return;
  if(actorName){
    const matches=(value:string)=>/^(?:it|he|she|this creature|creature)$/u.test(value)||sourceActorNameMatches(value,actorName);
    if(!matches(subject)||!matches(recovery))return;
  }
  const base=Number(match[1]),lair=match[2]===undefined?base:Number(match[2]);
  if(![base,lair].every(value=>Number.isSafeInteger(value)&&value>0))return;
  return {cost:1,...(base===lair?{max:base}:{}),conditional:base!==lair};
}
export function stagedLegendaryActionCost(plan:StagedMonsterSource,unit:StagedSourceUnit,actorName?:string|readonly string[]):number|undefined{
  if(unit.section!=='legendary'||!actorName)return;
  const contexts=(unit.contextIds??[]).map(id=>plan.units.find(context=>context.id===id)).filter((value):value is StagedSourceUnit=>!!value);
  return contexts.some(context=>stagedLegendaryLedger(context,actorName))?1:undefined;
}

export function stagedLegendaryBudget(plan: StagedMonsterSource,actorName?:string|readonly string[]): CanonicalMonster['legendary'] {
  const words:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
  const budgets=plan.units.filter(unit=>unit.destination==='context'&&unit.section==='legendary').flatMap(unit=>{
    const body=unit.quote.replace(/^[^\r\n]*(?:\r\n|\n|\r|$)/u,'').replace(/\s+/gu,' ').trim();
    const match=body.match(/^[\p{L}'’ \-]+?\bcan take (\d+|one|two|three|four|five|six|seven|eight|nine|ten) legendary actions?(?:, choosing from (?:the )?options below)?\./iu);
    const modern=actorName?stagedLegendaryLedger(unit,actorName):undefined;
    if(!match&&modern?.max===undefined)return [];
    const max=modern?.max??(words[match![1]!.toLowerCase()]??Number(match![1]));
    if(!Number.isSafeInteger(max)||max<1)return [];
    return [{max,preamble:unit.quote.trim(),evidence:[{start:unit.start,end:unit.end,quote:unit.quote}]}];
  });
  if(budgets.length>1&&new Set(budgets.map(budget=>budget.max)).size>1)throw new StagedExtractionError('CONFLICTING_LEGENDARY_BUDGET','/creature/legendary/max');
  return budgets[0];
}

function checkStagedSourcePartition(plan: StagedMonsterSource): void {
  let cursor = plan.candidate.start;
  const ids = new Set<string>();
  for (const unit of plan.units) {
    if (ids.has(unit.id) || unit.start !== cursor || unit.end <= unit.start || unit.end > plan.candidate.end
      || unit.quote !== plan.source.slice(unit.start, unit.end)) throw new StagedExtractionError('SOURCE_PARTITION', `/units/${unit.id}`);
    ids.add(unit.id); cursor = unit.end;
  }
  if (cursor !== plan.candidate.end || sha256(plan.source) !== plan.sourceSha256
    || JSON.stringify(plan.features) !== JSON.stringify(plan.units.filter(unit => unit.destination === 'feature'))
    || JSON.stringify(plan.base) !== JSON.stringify(plan.units[0])) throw new StagedExtractionError('SOURCE_PARTITION', '/units');
}

/** Human-readable source slots retain static qualifiers, narrative, shared
 * preambles and reference definitions. Provenance comments stay evidence only. */
export function stagedSourceBiography(plan: StagedMonsterSource): string {
  return plan.units.filter(unit => unit.destination !== 'feature').map(unit => unit.quote.replace(/<!--\s*document-source\b[^]*?-->/gu, '').trim())
    .filter(Boolean).join('\n\n');
}
