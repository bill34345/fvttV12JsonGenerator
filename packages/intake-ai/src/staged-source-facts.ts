import type { CanonicalMonster, CanonicalFeature, EvidenceRef } from './types';
import { StagedExtractionError } from './staged-source';
import yaml from 'js-yaml';
import {headerPresentation} from './header-presentation';

const sizeAliases: Record<string, string> = { tiny: 'tiny', 微型: 'tiny', small: 'small', 小型: 'small', medium: 'medium', 中型: 'medium', large: 'large', 大型: 'large', huge: 'huge', 巨型: 'huge', gargantuan: 'gargantuan', 超巨型: 'gargantuan', colossal:'colossal' };
const typeAliases: Record<string, string> = { aberration: 'aberration', 异怪: 'aberration', beast: 'beast', 野兽: 'beast', celestial: 'celestial', 天界生物: 'celestial', 天族: 'celestial', construct: 'construct', 构装生物: 'construct', 构装体: 'construct', 构装: 'construct', dragon: 'dragon', 龙: 'dragon', elemental: 'elemental', 元素生物: 'elemental', fey: 'fey', 妖精: 'fey', fiend: 'fiend', 邪魔: 'fiend', giant: 'giant', 巨人: 'giant', humanoid: 'humanoid', 类人生物: 'humanoid', 类人: 'humanoid', monstrosity: 'monstrosity', 怪兽: 'monstrosity', ooze: 'ooze', 泥怪: 'ooze', plant: 'plant', 植物: 'plant', undead: 'undead', 亡灵: 'undead' };
// Identity is read only from the bounded stat header. Ability prose never owns
// the Actor size, creature type, or the size of individual swarm members.
for (const [plural,singular] of Object.entries({aberrations:'aberration',beasts:'beast',celestials:'celestial',constructs:'construct',dragons:'dragon',elementals:'elemental',fiends:'fiend',giants:'giant',humanoids:'humanoid',monstrosities:'monstrosity',oozes:'ooze',plants:'plant'})) typeAliases[plural]=singular;
interface HeaderIdentityRow {size:string;type:string;subtype?:string;swarmSize?:string;alignment?:string}
function identityHeaderRows(source:string){
  const plain=headerPresentation(source).replace(/<!--\s*document-source\b[^]*?-->/gu,'').replace(/\*{1,3}|_{2,3}/gu,'').normalize('NFKC');
  const sizes=Object.keys(sizeAliases).sort((a,b)=>b.length-a.length).join('|');
  const types=Object.keys(typeAliases).sort((a,b)=>b.length-a.length).join('|');
  const identityView=plain.replace(/^[ \t]*(?:size|体型)[ \t]*:[ \t]*(["']?)([^\r\n]+?)\1[ \t]*$/gimu,'$2');
  const sizeTypeRows:HeaderIdentityRow[]=[];
  const natural=new RegExp(`^[ \\t]*(${sizes})[ \\t]+(?:swarm[ \\t]+of[ \\t]*(?:\\r?\\n[ \\t]*)?(${sizes})[ \\t]+)?(${types})(?:[ \\t]*\\(([^\\r\\n)]+)\\))?(?:[ \\t]*[,，]([^\\r\\n]+))?[ \\t]*$`,'gimu');
  const naturalMatches=[...identityView.matchAll(natural)];
  for(const row of naturalMatches)sizeTypeRows.push({size:row[1]!,type:row[3]!,swarmSize:row[2],subtype:row[4],alignment:row[5]});
  // Chinese ordinary and explicit compound swarm identity lines.
  const chinese=new RegExp(`^[ \\t]*(${sizes})[ \\t]*(?:(${sizes})[ \\t]*)?(${types})[ \\t]*(集群|虫群)?(?:[ \\t]*\\(([^\\r\\n)]+)\\))?(?:[ \\t]*[,，]([^\\r\\n]+))?[ \\t]*$`,'gimu');
  for(const row of identityView.matchAll(chinese))if(!naturalMatches.some(match=>row.index!>=match.index!&&row.index!<match.index!+match[0].length))sizeTypeRows.push({size:row[1]!,type:row[3]!,swarmSize:row[4]?row[2]:undefined,subtype:row[5],alignment:row[6]});
  const initialSizes=[...identityView.matchAll(new RegExp(`^[ \\t]*(${sizes})[ \\t]*(?=(?:${types}|swarm\\b|集群|虫群))`,'gimu'))].filter(row=>!naturalMatches.some(match=>row.index!>=match.index!&&row.index!<match.index!+match[0].length)).map(row=>row[1]!);
  const chineseSwarm=new RegExp(`^[ \\t]*(${sizes})[ \\t]*(?:虫群|集群)[ \\t]*[,，][ \\t]*由[ \\t]*(${sizes})[ \\t]*(${types})[ \\t]*组成(?:[ \\t]*[,，]([^\\r\\n]+))?[ \\t]*$`,'gimu');
  for(const row of identityView.matchAll(chineseSwarm))sizeTypeRows.push({size:row[1]!,swarmSize:row[2],type:row[3]!,alignment:row[4]});
  const declaredSizes=[...plain.matchAll(/(?:\bSize|(?<![\p{L}])体型)\s*[:："']?\s*(\p{L}+)/giu)].map(row=>row[1]!).concat(sizeTypeRows.map(row=>row.size),initialSizes);
  const explicitTypes=[...plain.matchAll(/(?:\bType\b|(?:生物)?类型)[ \t]*[:："']?[ \t]*(\p{L}+)(?:[ \t]*\(([^\r\n)]+)\))?/giu)];
  const declaredTypes=explicitTypes.map(row=>row[1]!).concat(sizeTypeRows.map(row=>row.type));
  const swarmSizes=sizeTypeRows.flatMap(row=>row.swarmSize?[row.swarmSize]:[]);
  const labelledSwarm=new RegExp(`(?:\\bSize|体型)[ \\t]*[:："']?[ \\t]*(?:${sizes})[ \\t]*\\([ \\t]*(?:Swarm\\s+of\\s+(${sizes})|由[ \\t]*(${sizes})[ \\t]*(?:个体|生物)?[ \\t]*组成的?(?:虫群|集群))[ \\t]*\\)`,'giu');
  for(const row of plain.matchAll(labelledSwarm))swarmSizes.push((row[1]??row[2])!);
  const separateSwarm=new RegExp(`^[ \\t]*(?:集群个体体型|虫群个体体型)[ \\t]*[:：][ \\t]*(${sizes})[ \\t]*$`,'gimu');
  for(const row of plain.matchAll(separateSwarm))swarmSizes.push(row[1]!);
  const alignments=[...plain.matchAll(/^[ \t]*(?:alignment|阵营)[ \t]*[:：][ \t]*([^\r\n]+)/gimu)].map(row=>row[1]!).concat(sizeTypeRows.flatMap(row=>row.alignment?[row.alignment]:[]));
  const subtypes=explicitTypes.flatMap(row=>row[2]?[row[2]]:[]).concat(sizeTypeRows.flatMap(row=>row.subtype?[row.subtype]:[]));
  return {plain,sizeTypeRows,declaredSizes,declaredTypes,swarmSizes,alignments,subtypes};
}

/** Only absent, uniquely explicit header facts may be filled. Contradictory
 * model values and conflicting source declarations stay for the strict gate. */
export function completeSourceHeaderIdentity(source:string,creature:CanonicalMonster):string[]{
  const facts=identityHeaderRows(source),paths:string[]=[];
  const canonicalType=typeAliases[creature.identity.creatureType?.toLowerCase()];
  if(canonicalType)creature.identity.creatureType=canonicalType;
  const swarm=[...new Set(facts.swarmSizes.map(value=>sizeAliases[value.toLowerCase()]))];
  if(creature.identity.swarmSize===undefined&&swarm.length===1&&swarm[0]&&swarm[0]!=='colossal'){
    creature.identity.swarmSize=swarm[0] as NonNullable<CanonicalMonster['identity']['swarmSize']>;paths.push('/creature/identity/swarmSize');
  }
  const alignment=[...new Set(facts.alignments.map(value=>value.trim()))];
  // Preserve the legacy complete-IR contract: ordinary creature alignment
  // omissions/nulls remain errors. Swarm headers may restore their own explicit
  // alignment alongside the newly supported member-size identity.
  if(creature.identity.alignment===undefined&&swarm.length===1&&swarm[0]&&alignment.length===1){creature.identity.alignment=alignment[0];paths.push('/creature/identity/alignment');}
  return paths;
}

/** Source-derived annotation recovery in the facts adapter only. No subtype is
 * inferred from a creature name, and a supplied contradictory value is retained
 * for the strict source validator to reject. The complete IR API stays strict. */
export function completeStagedBaseSubtype(source:string,creature:CanonicalMonster):void{
  if(creature.identity.creatureTypeCustom!==undefined)return;
  const {plain,sizeTypeRows}=identityHeaderRows(source);
  const explicit=[...plain.matchAll(new RegExp(`^[ \\t]*Type[ \\t]*[:："']?[ \\t]*(${Object.keys(typeAliases).join('|')})[ \\t]*\\(([^\\r\\n)]+)\\)[ \\t]*$`,'gimu'))];
  const rows=[...sizeTypeRows.map(row=>({type:row.type,subtype:row.subtype})),...explicit.map(row=>({type:row[1]!,subtype:row[2]}))];
  if(!rows.length||rows.some(row=>typeAliases[row.type.toLowerCase()]!==typeAliases[creature.identity.creatureType.toLowerCase()]))return;
  const values=[...new Set(rows.map(row=>row.subtype?.trim()).filter((value):value is string=>Boolean(value)))];
  if(values.length===1)creature.identity.creatureTypeCustom=values[0];
}

export function stagedRecharge(name:string):CanonicalFeature['recharge']{
  const match=/(?:\bRecharge|充能)\s*([1-6])(?:\s*[-–~～]\s*([1-6]))?(?=\s*[,，)）.]|\s*$)/iu.exec(name);
  return match&&Number(match[1])<=Number(match[2]??match[1])?[Number(match[1]),Number(match[2]??match[1])]:undefined;
}

const DAMAGE: Record<string, string> = {
  acid: 'acid', 强酸: 'acid', bludgeoning: 'bludgeoning', 钝击: 'bludgeoning', cold: 'cold', 冷冻: 'cold', 寒冷: 'cold', fire: 'fire', 火焰: 'fire',
  force: 'force', 力场: 'force', lightning: 'lightning', 闪电: 'lightning', necrotic: 'necrotic', 黯蚀: 'necrotic', 暗蚀: 'necrotic', piercing: 'piercing', 穿刺: 'piercing',
  poison: 'poison', 毒素: 'poison', psychic: 'psychic', 心灵: 'psychic', radiant: 'radiant', 光耀: 'radiant', slashing: 'slashing', 挥砍: 'slashing', thunder: 'thunder', 雷鸣: 'thunder',
};
const CONDITIONS: Record<string, string> = {
  blinded: 'blinded', 目盲: 'blinded', charmed: 'charmed', 魅惑: 'charmed', deafened: 'deafened', 耳聋: 'deafened', frightened: 'frightened', 恐慌: 'frightened',
  grappled: 'grappled', 受擒: 'grappled', incapacitated: 'incapacitated', 失能: 'incapacitated', invisible: 'invisible', 隐形: 'invisible', paralyzed: 'paralyzed', 麻痹: 'paralyzed',
  petrified: 'petrified', 石化: 'petrified', poisoned: 'poisoned', 中毒: 'poisoned', prone: 'prone', 倒地: 'prone', restrained: 'restrained', 束缚: 'restrained',
  stunned: 'stunned', 震慑: 'stunned', unconscious: 'unconscious', 昏迷: 'unconscious', exhaustion: 'exhaustion', exhausted: 'exhaustion', 力竭: 'exhaustion',
  // These source names have no native dnd5e condition key. They are retained
  // in complete manual header Items, never native condition immunities.
  diseased: 'diseased', surprised: 'surprised', dazed: 'dazed', cursed: 'cursed', indebted: 'indebted',
};
const SKILLS: Record<string, string> = {
  acrobatics: 'acrobatics', 特技: 'acrobatics', 体操: 'acrobatics', animalhandling: 'animalhandling', 驯兽: 'animalhandling', arcana: 'arcana', 奥秘: 'arcana', athletics: 'athletics', 运动: 'athletics',
  deception: 'deception', 欺瞒: 'deception', 欺诈: 'deception', history: 'history', 历史: 'history', insight: 'insight', 洞悉: 'insight', 洞察: 'insight', intimidation: 'intimidation', 威吓: 'intimidation',
  investigation: 'investigation', 调查: 'investigation', medicine: 'medicine', 医药: 'medicine', 医疗: 'medicine', nature: 'nature', 自然: 'nature', perception: 'perception', 察觉: 'perception',
  performance: 'performance', 表演: 'performance', persuasion: 'persuasion', 游说: 'persuasion', 说服: 'persuasion', religion: 'religion', 宗教: 'religion',
  sleightofhand: 'sleightofhand', 巧手: 'sleightofhand', stealth: 'stealth', 隐匿: 'stealth', survival: 'survival', 生存: 'survival', 求生: 'survival',
};
const LANGUAGES: Record<string, string> = {
  all: 'all', 所有语言: 'all', 全部: 'all', abyssal: 'abyssal', 深渊语: 'abyssal', aquan: 'aquan', 水族语: 'aquan', celestial: 'celestial', 天界语: 'celestial', common: 'common', 通用语: 'common',
  deepspeech: 'deep', deep: 'deep', 深潜语: 'deep', draconic: 'draconic', 龙语: 'draconic', dwarvish: 'dwarvish', dwarven: 'dwarvish', 矮人语: 'dwarvish',
  elvish: 'elvish', 精灵语: 'elvish', giant: 'giant', 巨人语: 'giant', gnomish: 'gnomish', 侏儒语: 'gnomish', goblin: 'goblin', 地精语: 'goblin', halfling: 'halfling', 半身人语: 'halfling',
  infernal: 'infernal', 炼狱语: 'infernal', orc: 'orc', 兽人语: 'orc', primordial: 'primordial', 原初语: 'primordial', sylvan: 'sylvan', 木族语: 'sylvan', terran: 'terran', 土族语: 'terran', undercommon: 'undercommon', 地底通用语: 'undercommon',
};
const HEADS: Array<[string, RegExp]> = [
  ['skills', /^(?:Skills|技能)\s*[:：]?\s*(.*)$/iu],
  ['saves', /^(?:Saving Throws|saving_throws|豁免熟练|豁免(?:加值)?)\s*[:：]?\s*(.*)$/iu],
  ['resistances', /^(?:Damage Resistances|damage_resistances|Resistances|伤害抗性|抗性)\s*[:：]?\s*(.*)$/iu],
  ['vulnerabilities', /^(?:Damage Vulnerabilities|damage_vulnerabilities|Vulnerabilities|伤害易伤|易伤)\s*[:：]?\s*(.*)$/iu],
  ['conditionImmunities', /^(?:Condition Immunities|condition_immunities|状态免疫)\s*[:：]?\s*(.*)$/iu],
  ['damageImmunities', /^(?:Damage Immunities|damage_immunities|伤害免疫)\s*[:：]?\s*(.*)$/iu],
  ['immunities', /^(?:Immunities|免疫)\s*[:：]?\s*(.*)$/iu],
  ['senses', /^(?:Senses|感官)\s*[:：]?\s*(.*)$/iu],
  ['languages', /^(?:Languages|语言)\s*[:：]?\s*(.*)$/iu],
];
const METADATA = /^(?:---|#{1,6}\s|AC\b|Armor Class\b|armor_class:|HP\b|Hit Points\b|hit_points:|Speed\b|speed:|Initiative\b|Size\b|Type\b|Challenge\b|challenge:|CR\b|XP\b|Proficiency Bonus\b|Drives\b|MOD\b|SAVE\b|Str\b|Dex\b|Con\b|Int\b|Wis\b|Cha\b|Strength\b|Dexterity\b|Constitution\b|Intelligence\b|Wisdom\b|Charisma\b|name:|layout:|tags:|alignment:|护甲等级|生命值|速度|先攻|体型|类型|挑战等级|经验值|熟练加值|力量|敏捷|体质|智力|感知|魅力|调整)/iu;
/** Keep the field boundary when a numeric header label is emphasized directly
 * against its value, as in CHM-derived **AC**19. Source bytes stay unchanged. */
export function unmarkStagedHeader(value:string):string {
  return headerPresentation(value).replace(/(\*{1,3}|_{2,3})(AC|HP|CR|XP|PB|STR|DEX|CON|INT|WIS|CHA)\1(?=[+\-\d])/giu,'$2 ')
    .replace(/\*{1,3}|_{2,3}/gu,'');
}
const clean = (value: string) => unmarkStagedHeader(value.normalize('NFKC')).replace(/^["']|["']$/gu, '').replace(/\s+/gu, ' ').trim();
const token = (value: string) => clean(value).toLowerCase().replace(/[\s_\-]/gu, '');
export const stagedDamageLabels=Object.keys(DAMAGE);
export const stagedDamageType=(value:string):string|undefined=>DAMAGE[token(value)];
const empty = (value: string) => /^(?:none|—|-|无)[。.]?$/iu.test(clean(value));
const parts = (value: string) => clean(value).split(/[,，;；、]/u).map(value => value.trim().replace(/^and\s+/iu, '')).filter(Boolean);
const languageParts=(value:string)=>parts(value).flatMap(part=>part.split(/以及|\s+and\s+/iu)).map(part=>part.trim().replace(/^(?:以及|and\s+)/iu,'')).filter(Boolean);
/** Exact source language qualifiers remain notes, never inferred speaking
 * capabilities. Used only to restore an absent note; conflicts are not erased. */
export function sourceLanguageNotes(source:string,values:readonly string[]):string|undefined {
  const body=staticEntries(source).get('languages');
  if(!body||empty(body))return;
  const sourceParts=languageParts(body),expected=sourceParts.map(part=>LANGUAGES[token(part)]).filter(Boolean).sort();
  const actual=values.map(value=>LANGUAGES[token(value)]).sort();
  if(JSON.stringify(expected)!==JSON.stringify(actual))return;
  return sourceParts.filter(part=>!LANGUAGES[token(part)]).join(', ')||undefined;
}
// Printed signed numbers may use the mathematical minus or an en dash. This
// normalization applies only after a bounded numeric-field match; original
// source text, title punctuation and evidence coordinates remain untouched.
const signedNumber = (value: string) => Number(value.replace(/\s/gu, '').replace(/[−–]/gu, '-'));
function fail(code: string, path: string): never { throw new StagedExtractionError(code, `/creature/${path}`); }

function titleNames(value: string): Set<string> {
  const title = clean(value).replace(/^#{1,6}\s+/u, '').trim();
  if (!title || !/\p{L}/u.test(title) || /[。！？!?]|[.]$/u.test(title)) fail('UNSUPPORTED_SOURCE_TITLE', 'identity/name');
  const names = new Set([title.toLowerCase()]);
  // Existing Chinese source convention: 中文English Name, also permitting an
  // explicit parenthesized bilingual label. English-only qualifiers are never
  // treated as aliases, nor are words merely mentioned in body prose.
  const chineseFirst = title.match(/^([\p{Script=Han}·・\s]+?)\s*(?:\(\s*)?([A-Za-z][\p{Script=Latin}\p{N} .'’:\-]*?)(?:\s*\))?$/u);
  const englishFirst = title.match(/^([A-Za-z][\p{Script=Latin}\p{N} .'’:\-]*?)\s*(?:\(\s*)?([\p{Script=Han}·・\s]+?)(?:\s*\))?$/u);
  for (const match of [chineseFirst, englishFirst]) if (match) {
    names.add(clean(match[1]!).toLowerCase()); names.add(clean(match[2]!).toLowerCase());
  }
  return names;
}

/** Names are bound to complete source titles, independently of discovery's
 * proposed label. A substring or an exact word in biography is not a title. */
function sourceTitleNames(source: string): Set<string> {
  const plain = source.replace(/<!--\s*document-source\b[^]*?-->/gu, '').trim();
  const frontmatter = plain.match(/^---(?:\r\n|\n|\r)([^]*?)(?:\r\n|\n|\r)---(?:\r\n|\n|\r|$)/u);
  if (frontmatter) {
    let parsed: unknown;
    try { parsed = yaml.load(frontmatter[1]!, { schema: yaml.FAILSAFE_SCHEMA }); }
    catch { fail('UNSUPPORTED_SOURCE_TITLE', 'identity/name'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('UNSUPPORTED_SOURCE_TITLE', 'identity/name');
    const fields = parsed as Record<string, unknown>;
    const title = fields.name ?? fields['名称'];
    if (typeof title !== 'string' || !title.trim()) fail('UNSUPPORTED_SOURCE_TITLE', 'identity/name');
    const names = titleNames(title);
    for (const key of ['englishName', 'english_name', '英文名']) if (fields[key] !== undefined) {
      if (typeof fields[key] !== 'string') fail('UNSUPPORTED_SOURCE_TITLE', 'identity/englishName');
      for (const name of titleNames(fields[key] as string)) names.add(name);
    }
    return names;
  }
  const lines = plain.split(/\r\n|\n|\r/u).map(value => clean(value)).filter(Boolean);
  const statStart = lines.findIndex(value => /^(?:AC\b|Armor Class\b|护甲等级)\s*[:：]?\s*\d/iu.test(value));
  if (statStart < 1) fail('UNSUPPORTED_SOURCE_TITLE', 'identity/name');
  const prefix = lines.slice(0, statStart);
  const explicit = prefix.flatMap(line => {
    const match = line.match(/^(.+?)\s+(?:CR|Challenge|挑战等级)\s*[:：]?\s*\d+(?:\/\d+)?(?:\s*\([^)]*\))?\s*$/iu);
    return match ? [titleNames(match[1]!)] : [];
  });
  const names = explicit[0] ?? titleNames(prefix[0]!);
  for (const title of explicit.slice(1)) {
    if (![...title].some(name => names.has(name))) fail('CONFLICTING_SOURCE_TITLES', 'identity/name');
    for (const name of title) names.add(name);
  }
  // A document heading contributes bilingual aliases only when one of its
  // complete names already matches the explicit stat-block title.
  const heading = prefix.find(line => /^#{1,6}\s/u.test(line));
  if (heading && explicit.length) {
    const aliases = titleNames(heading);
    if ([...aliases].some(name => names.has(name))) for (const name of aliases) names.add(name);
  }
  return names;
}
function equalSets(actual: readonly string[], expected: readonly string[], aliases: Record<string, string>, path: string): void {
  const normalize = (values: readonly string[]) => values.map(value => aliases[token(value)] ?? fail('UNSUPPORTED_STATIC_FACT', path)).sort();
  if (JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(expected))) fail('BASE_STATIC_CONFLICT', path);
}

function staticEntries(source: string): Map<string, string> {
  const entries = new Map<string, string>();
  let active: string | undefined;
  for (const original of source.replace(/<!--\s*document-source\b[^]*?-->/gu, '').split(/\r\n|\n|\r/u)) {
    const line = clean(original);
    if (!line) continue;
    const head = HEADS.map(([key, pattern]) => ({ key, match: line.match(pattern) })).find(value => value.match);
    if (head) {
      if (entries.has(head.key)) fail('DUPLICATE_STATIC_FIELD', head.key);
      active = head.key; entries.set(active, clean(head.match![1]!));
    } else if (METADATA.test(line)) active = undefined;
    else if (active) entries.set(active, `${entries.get(active)} ${line}`);
  }
  return entries;
}

type DefenseKind = keyof CanonicalMonster['defenses'];
const NATIVE_CONDITIONS = new Set(['blinded','charmed','deafened','frightened','grappled','incapacitated','invisible','paralyzed','petrified','poisoned','prone','restrained','stunned','unconscious','exhaustion']);
/** Header text stays owned by the base unit. These exact nested references
 * additionally prove the complete GM Items compiled from unprojectable facts. */
function headerReferences(source: string): Map<string,{start:number;end:number;quote:string;name:string}> {
  const result=new Map<string,{start:number;end:number;quote:string;name:string}>();
  let active:string|undefined;
  for(const row of source.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/gu)){
    if(!row[0])continue;
    const line=clean(row[0]),at=row.index!;
    if(!line)continue;
    const head=HEADS.map(([kind,pattern])=>({kind,match:line.match(pattern)})).find(value=>value.match);
    if(head||METADATA.test(line)){
      if(active){const prior=result.get(active)!;prior.end=at;prior.quote=source.slice(prior.start,at);}
      active=undefined;
    }
    if(head){
      active=head.kind;
      const name=head.match![0].slice(0,head.match![0].length-head.match![1]!.length).replace(/[:：]\s*$/u,'').trim();
      result.set(active,{start:at,end:source.length,quote:source.slice(at),name});
    }
  }
  return result;
}
function defenseHeaderPlan(source:string){
  const entries=staticEntries(source),refs=headerReferences(source);
  const native:CanonicalMonster['defenses']={resistances:[],immunities:[],vulnerabilities:[],conditionImmunities:[]};
  const allowed:Record<DefenseKind,Set<string>>={resistances:new Set(),immunities:new Set(),vulnerabilities:new Set(),conditionImmunities:new Set()};
  const manual:CanonicalFeature[]=[];
  for(const kind of ['resistances','vulnerabilities','conditionImmunities','damageImmunities','immunities'] as const){
    const body=entries.get(kind);if(!body||empty(body))continue;
    let needsManual=false;
    for(const group of clean(body).split(/[;；]/u)){
      const items=parts(group);
      const resolved=items.map(item=>{
        const damage=DAMAGE[token(item)],condition=CONDITIONS[token(item)];
        const field:DefenseKind=kind==='immunities'?(damage?'immunities':'conditionImmunities'):kind==='damageImmunities'?'immunities':kind;
        const value=field==='conditionImmunities'?condition:damage;
        return {item,field,value,native:Boolean(value&&(field!=='conditionImmunities'||NATIVE_CONDITIONS.has(value)))};
      });
      // A qualifier may govern all comma-separated types before it. Retain the
      // whole semicolon clause manually instead of making an early type unconditional.
      const conditional=resolved.some(value=>!value.value);
      for(const value of resolved){
        allowed[value.field].add(value.value??token(value.item));
        if(value.native&&!conditional)native[value.field].push(value.value!);else needsManual=true;
      }
      if(conditional){
        const field:DefenseKind=kind==='damageImmunities'?'immunities':kind==='immunities'?'immunities':kind;
        allowed[field].add(token(group));
        if(kind==='immunities'){
          // A combined Immunities header need not identify an unfamiliar
          // clause as damage or condition. Either exact literal placement is
          // safe because the complete clause remains manual in both cases.
          for(const value of resolved.filter(value=>!value.value)){
            allowed.immunities.add(token(value.item));
            allowed.conditionImmunities.add(token(value.item));
          }
          allowed.conditionImmunities.add(token(group));
        }
        // Source-printed types inside a qualified clause may be returned by a
        // model, but are never promoted as unconditional native defenses.
        for(const [literal,value] of Object.entries(field==='conditionImmunities'?CONDITIONS:DAMAGE))
          if(new RegExp(`(?:^|[^\\p{L}])${literal}(?:$|[^\\p{L}])`,'iu').test(group))allowed[field].add(value);
      }
    }
    if(needsManual){const ref=refs.get(kind);if(!ref)fail('MISSING_HEADER_RULE_SOURCE',`defenses/${kind}`);
      manual.push({name:ref!.name,description:ref!.quote,executionMode:'gm-manual',activityType:'utility',evidence:[{start:ref!.start,end:ref!.end,quote:ref!.quote}]});}
  }
  return {native,allowed,manual};
}

/** Normalize only exact source-bound header propositions on the caller's
 * clone. Unknown/conditional propositions become complete GM Items later;
 * they never become native damage types or disappear into an empty fallback. */
export function normalizeStagedHeaderFacts(source:string,creature:CanonicalMonster):void {
  const plan=defenseHeaderPlan(source);
  for(const kind of Object.keys(plan.native) as DefenseKind[]){
    const aliases=kind==='conditionImmunities'?CONDITIONS:DAMAGE;
    const supplied=creature.defenses[kind].map(value=>aliases[token(value)]??token(value));
    for(const value of supplied)if(!plan.allowed[kind].has(value))fail('BASE_STATIC_CONFLICT',`defenses/${kind}`);
    const actual=supplied.filter(value=>plan.native[kind].includes(value));
    if(JSON.stringify(actual.slice().sort())!==JSON.stringify(plan.native[kind].slice().sort()))fail('BASE_STATIC_CONFLICT',`defenses/${kind}`);
    creature.defenses[kind]=[...plan.native[kind]];
  }
  // explicit-exception: user approved this mapping on 2026-10-14. The source
  // category is not declared equivalent to Gargantuan; size rules remain GM adjudication.
  const size=source.match(/\bSize(?:\*{1,3})?\s*[:："']?\s*(Colossal(?:\s*\([^)]*\))?)/iu);
  if(size){
    if(creature.identity.size!=='gargantuan')fail('BASE_STATIC_CONFLICT','identity/size');
    if(creature.identity.sourceSize!==undefined&&creature.identity.sourceSize!==size[1])fail('BASE_STATIC_CONFLICT','identity/sourceSize');
    creature.identity.sourceSize=size[1]!;
  }
}

export function stagedManualHeaderFeatures(source:string):CanonicalFeature[]{
  const features=defenseHeaderPlan(source).manual;
  const size=source.match(/\bSize(?:\*{1,3})?\s*[:："']?\s*Colossal(?:\s*\([^)]*\))?/iu);
  if(size){const start=size.index!,end=start+size[0].length;
    features.push({name:'Size',description:size[0],executionMode:'gm-manual',activityType:'utility',evidence:[{start,end,quote:size[0]}]});}
  return features;
}

/** This qualifier constrains a sense, not a global Blinded condition. Keep the
 * exact complete header for final source-to-visible-text verification. */
export function sourceSenseQualifier(source:string):EvidenceRef|undefined {
  const ref=headerReferences(source).get('senses');
  return ref&&/\(\s*blind beyond this radius\s*\)/iu.test(clean(ref.quote))?{start:ref.start,end:ref.end,quote:ref.quote}:undefined;
}

/** All native static fields are compared independently with their source.
 * Qualified header rules are program-owned manual Items during assembly;
 * keeping source in biography cannot excuse a missing unconditional fact. */
export function validateStagedStaticSourceFacts(source: string, creature: CanonicalMonster, field?: 'defenses'|'skills'|'saves'|'senses'|'languages'|'identity'): void {
  const entries = staticEntries(source);
  if(!field||field==='defenses'){
  const expected = defenseHeaderPlan(source).native;
  for (const kind of ['resistances', 'immunities', 'vulnerabilities', 'conditionImmunities'] as const) equalSets(creature.defenses[kind], expected[kind], kind === 'conditionImmunities' ? CONDITIONS : DAMAGE, `defenses/${kind}`);

  }
  if(!field||field==='skills'){
  const skillBody = entries.get('skills');
  const expectedSkills: Record<string, number> = {};
  if (skillBody && !empty(skillBody)) {
    const expression = /([\p{L}][\p{L} \-]*?)\s*([+\-−–]\s*\d+)/gu;
    let remaining = skillBody.replace(expression, (_whole, label: string, number: string) => {
      const key = SKILLS[token(label)]; if (!key || key in expectedSkills) fail('UNSUPPORTED_STATIC_FACT', 'skills');
      expectedSkills[key] = signedNumber(number); return '';
    });
    remaining = remaining.replace(/[,，;；、\s]/gu, '');
    if (remaining) fail('UNSUPPORTED_STATIC_FACT', 'skills');
  }
  const actualSkills: Record<string, number> = {};
  for (const [key, value] of Object.entries(creature.skills)) {
    const normalized = SKILLS[token(key)]; if (!normalized || normalized in actualSkills) fail('UNSUPPORTED_STATIC_FACT', 'skills'); actualSkills[normalized] = value;
  }
  if (Object.keys(expectedSkills).length !== Object.keys(actualSkills).length || Object.entries(expectedSkills).some(([key, value]) => actualSkills[key] !== value)) fail('BASE_STATIC_CONFLICT', 'skills');

  }
  if(!field||field==='saves'){
  const abilityAliases: Record<string, keyof CanonicalMonster['abilities']> = { str: 'str', strength: 'str', 力量: 'str', dex: 'dex', dexterity: 'dex', 敏捷: 'dex', con: 'con', constitution: 'con', 体质: 'con', int: 'int', intelligence: 'int', 智力: 'int', wis: 'wis', wisdom: 'wis', 感知: 'wis', cha: 'cha', charisma: 'cha', 魅力: 'cha' };
  const expectedSaves: Record<string, number> = {};
  const plainTable = clean(source);
  const label = '(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma|Str|Dex|Con|Int|Wis|Cha|力量|敏捷|体质|智力|感知|魅力)';
  const table = [...plainTable.matchAll(new RegExp(`(${label})\\s+(\\d+)\\s+([+\\-−–]\\d+)\\s+([+\\-−–]\\d+)`, 'giu'))];
  if (table.length) {
    if (table.length !== 6 || new Set(table.map(row => abilityAliases[token(row[1]!)])).size !== 6) fail('UNSUPPORTED_STATIC_FACT', 'saves');
    for (const row of table) {
      const key = abilityAliases[token(row[1]!)]!;
      if (signedNumber(row[3]!) !== Math.floor((Number(row[2]) - 10) / 2)) fail('BASE_STATIC_CONFLICT', 'abilities');
      expectedSaves[key] = signedNumber(row[4]!);
    }
  }
  const saveBody = entries.get('saves');
  if (saveBody && !empty(saveBody)) {
    const expression = new RegExp(`(${label})\\s*([+\\-−–]\\s*\\d+)`, 'giu');
    const remaining = saveBody.replace(expression, (_whole, name: string, number: string) => {
      const key = abilityAliases[token(name)]!; const total = signedNumber(number);
      if (key in expectedSaves && expectedSaves[key] !== total) fail('BASE_STATIC_CONFLICT', 'saves'); expectedSaves[key] = total; return '';
    }).replace(/[,，;；、\s]/gu, '');
    if (remaining) fail('UNSUPPORTED_STATIC_FACT', 'saves');
  }
  for (const key of Object.keys(creature.abilities) as Array<keyof CanonicalMonster['abilities']>) {
    const expected = expectedSaves[key] ?? Math.floor((creature.abilities[key] - 10) / 2);
    if ((creature.saves[key] ?? Math.floor((creature.abilities[key] - 10) / 2)) !== expected) fail('BASE_STATIC_CONFLICT', `saves/${key}`);
  }
  if (Object.keys(creature.saves).some(key => !(key in creature.abilities))) fail('UNSUPPORTED_STATIC_FACT', 'saves');

  }
  if(!field||field==='senses'){
  const expectedSenses: Record<string, number> = {};
  const senseAliases: Record<string, string> = { darkvision: 'darkvision', 黑暗视觉: 'darkvision', blindsight: 'blindsight', 盲视: 'blindsight', tremorsense: 'tremorsense', 震颤感知: 'tremorsense', truesight: 'truesight', 真实视觉: 'truesight', passiveperception: 'passivePerception', 被动察觉: 'passivePerception' };
  const senseBody = entries.get('senses');
  if (senseBody && !empty(senseBody)) {
    const expression = /(Darkvision|Blindsight|Tremorsense|Truesight|Passive Perception|黑暗视觉|盲视|震颤感知|真实视觉|被动察觉)\s*(\d+)\s*(?:ft\.?|feet|尺)?/giu;
    const remaining = senseBody.replace(/\(\s*blind beyond this radius\s*\)/giu,'').replace(expression, (_whole, label: string, number: string) => {
      const key = senseAliases[token(label)]!; if (key in expectedSenses) fail('DUPLICATE_STATIC_FIELD', 'senses'); expectedSenses[key] = Number(number); return '';
    }).replace(/[,，;；、.\s]/gu, '');
    if (remaining) fail('UNSUPPORTED_STATIC_FACT', 'senses');
  }
  // Null/empty optional schema fields are absence, never positive senses. A
  // source-printed sense still has to match its number after this filtering.
  const actualSenses=Object.fromEntries(Object.entries(creature.senses).filter(([key,value])=>value!=null&&value!==''&&(value!==0||key in expectedSenses)));
  if (Object.keys(actualSenses).length !== Object.keys(expectedSenses).length || Object.entries(expectedSenses).some(([key, value]) => actualSenses[key] !== value)) fail('BASE_STATIC_CONFLICT', 'senses');

  }
  if(!field||field==='languages'){
  const languageBody = entries.get('languages');
  const expectedLanguages = languageBody && !empty(languageBody) ? languageParts(languageBody) : [];
  const actualLanguages = [...creature.languages.values, ...(creature.languages.custom ? languageParts(creature.languages.custom) : [])];
  const languageIdentity = (value: string) => LANGUAGES[token(value)] ?? clean(value).toLowerCase().replace(/[.]$/u, '');
  if (JSON.stringify(actualLanguages.map(languageIdentity).sort()) !== JSON.stringify(expectedLanguages.map(languageIdentity).sort())) fail('BASE_STATIC_CONFLICT', 'languages');

  }
  if(!field||field==='identity'){
  const {plain,declaredSizes,declaredTypes,swarmSizes,alignments,subtypes}=identityHeaderRows(source);
  for (const [values, aliases, path] of [[declaredSizes, sizeAliases, 'identity/size'], [declaredTypes, typeAliases, 'identity/creatureType'],[swarmSizes,sizeAliases,'identity/swarmSize']] as const) {
    const canonical = values.map(value => aliases[value.toLowerCase()] ?? fail('UNSUPPORTED_STATIC_FACT', path));
    if (new Set(canonical).size > 1) fail('CONFLICTING_STATIC_FACT', path);
  }
  const size=declaredSizes[0];
  if (!size || !sizeAliases[size.toLowerCase()]) fail('UNSUPPORTED_STATIC_FACT', 'identity/size');
  if (creature.identity.size !== (size.toLowerCase()==='colossal'?'gargantuan':sizeAliases[size.toLowerCase()])) fail('BASE_STATIC_CONFLICT', 'identity/size');
  const sourceSize=plain.match(/\bSize\s*[:："']?\s*(Colossal(?:\s*\([^)]*\))?)/iu)?.[1];
  if(sourceSize ? clean(creature.identity.sourceSize??'')!==clean(sourceSize) : creature.identity.sourceSize!==undefined)fail('BASE_STATIC_CONFLICT','identity/sourceSize');
  const explicitType=declaredTypes[0];
  if (!explicitType || !typeAliases[explicitType.toLowerCase()]) fail('UNSUPPORTED_STATIC_FACT', 'identity/creatureType');
  if (typeAliases[creature.identity.creatureType.toLowerCase()] !== typeAliases[explicitType.toLowerCase()]) fail('BASE_STATIC_CONFLICT', 'identity/creatureType');
  const swarm=swarmSizes[0]&&sizeAliases[swarmSizes[0].toLowerCase()];
  if(swarm ? creature.identity.swarmSize!==swarm : creature.identity.swarmSize!==undefined)fail('BASE_STATIC_CONFLICT','identity/swarmSize');
  const identityLines=plain.split(/\r?\n/u).filter(line=>new RegExp(`^(?:[ \t]*(?:${Object.keys(sizeAliases).join('|')})|.*(?:\\bSize|体型|集群个体体型|虫群个体体型)[ \t]*[:：]?)`,'iu').test(line)).join('\n');
  if(/\bswarm\b|集群|虫群/iu.test(identityLines)&&!swarm)fail('UNSUPPORTED_STATIC_FACT','identity/swarmSize');
  const declaredSubtypes=subtypes.map(value=>clean(value).toLowerCase());
  if(new Set(declaredSubtypes).size>1)fail('CONFLICTING_STATIC_FACT','identity/creatureTypeCustom');
  if(declaredSubtypes[0]&&clean(creature.identity.creatureTypeCustom??'').toLowerCase()!==declaredSubtypes[0])fail('BASE_STATIC_CONFLICT','identity/creatureTypeCustom');
  const visible = clean(plain).toLowerCase();
  const names = sourceTitleNames(source);
  for (const key of ['name', 'englishName'] as const) {
    const value = creature.identity[key];
    if (typeof value === 'string' && !names.has(clean(value).toLowerCase())) fail('BASE_STATIC_CONFLICT', `identity/${key}`);
  }
  for (const key of ['creatureTypeCustom'] as const) {
    const value = creature.identity[key];
    if (typeof value === 'string' && value && !visible.includes(clean(value).toLowerCase())) fail('BASE_STATIC_CONFLICT', `identity/${key}`);
  }
  const explicitAlignment=alignments[0];
  const alignmentAliases: Record<string, string> = { 'neutral evil': '中立邪恶', 'chaotic evil': '混乱邪恶', 'lawful evil': '守序邪恶', 'neutral good': '中立善良', 'chaotic good': '混乱善良', 'lawful good': '守序善良', 'lawful neutral': '守序中立', 'chaotic neutral': '混乱中立', neutral: '绝对中立', 中立: '绝对中立', unaligned: '无阵营' };
  if (explicitAlignment) {
    const normalize = (value: string) => alignmentAliases[clean(value).toLowerCase()] ?? clean(value).toLowerCase();
    if(new Set(alignments.map(normalize)).size>1)fail('CONFLICTING_STATIC_FACT','identity/alignment');
    if (normalize(creature.identity.alignment ?? '') !== normalize(explicitAlignment)) fail('BASE_STATIC_CONFLICT', 'identity/alignment');
  } else if (creature.identity.alignment) {
    const actual = creature.identity.alignment.toLowerCase();
    if (!visible.includes(actual) && !(alignmentAliases[actual] && visible.includes(alignmentAliases[actual]!))) fail('BASE_STATIC_CONFLICT', 'identity/alignment');
  }  }

}
