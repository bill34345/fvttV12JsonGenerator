import type {MonsterIntakeIR} from './types';
import {StagedExtractionError} from './staged-source';
import {unmarkStagedHeader} from './staged-source-facts';
/** Same dnd5e NPC derivation already allowed by source number validation. */
export const sourceDerivedProficiencyBonus=(cr:number):number=>Math.floor((Math.max(cr,1)+7)/4);
const exactEqual=(left:unknown,right:unknown):boolean=>JSON.stringify(left,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value)===JSON.stringify(right,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);

/** Source-derived header numbers, shared by staged extraction and full-IR validation. */
export function validateSourceBaseNumbers(source: string, ir: MonsterIntakeIR, complete=true): void {
  const unmarked = unmarkStagedHeader(source.normalize('NFKC'));
  const normalized = unmarked.replace(/[−–]/gu,'-').replace(/\s+/gu, ' ');
  const printed:Record<string,RegExp>={
    'attributes/ac':/\bAC\b|Armor Class|armor_class:|护甲等级/iu,
    'attributes/hp/value':/\bHP\b|Hit Points|hit_points:|生命值/iu,
    'attributes/initiative':/\bInitiative\b|先攻/iu,
    'attributes/cr':/\bCR\b|\bChallenge\b|challenge:|挑战等级/iu,
    'attributes/xp':/\bXP\b|经验值/iu,
    'attributes/proficiencyBonus':/Proficiency Bonus|\bPB\b|熟练加值/iu,
  };
  const fields: Array<[string, unknown, RegExp, boolean?]> = [
    ['attributes/ac', ir.creature.attributes.ac, /(?:\bAC\b|Armor Class|armor_class:|护甲等级)\s*[:："']?\s*(\d+)/iu],
    ['attributes/hp/value', ir.creature.attributes.hp.value, /(?:\bHP\b|Hit Points|hit_points:|生命值)\s*[:："']?\s*(\d+)/iu],
    ['attributes/initiative', ir.creature.attributes.initiative, /(?:Initiative|先攻)\s*[:：]?\s*([+\-]?\d+)/iu],
    ['attributes/cr', ir.creature.attributes.cr, /(?:\bCR\b|Challenge|challenge:|挑战等级)\s*[:："']?\s*(\d+(?:\s*\/\s*\d+|\.\d+)?)(?![\p{L}\p{N}./])/iu, true],
    ['attributes/xp', ir.creature.attributes.xp, /(?:\bXP|经验值)\s*[:：]?\s*([\d,]+)/iu],
    ['attributes/proficiencyBonus', ir.creature.attributes.proficiencyBonus, /(?:Proficiency Bonus|\bPB\b|熟练加值)\s*[:：]?\s*([+\-]?\d+)/iu],
  ];
  for (const [path, actual, pattern, fraction] of fields) {
    const matches = [...normalized.matchAll(new RegExp(pattern.source, pattern.flags + 'g'))];
    if (path === 'attributes/xp') matches.push(...normalized.matchAll(/(?<![A-Za-z\d])(\d[\d,]*)\s*XP\b/giu));
    if (!matches.length) {
      // schema-derived: dnd5e proficiency follows the already source-checked CR
      // when PB is omitted. This is the same rule as the existing projector;
      // a printed or conflicting PB still needs its own exact source proof.
      if(path==='attributes/proficiencyBonus'&&!printed[path]!.test(unmarked)&&actual===sourceDerivedProficiencyBonus(ir.creature.attributes.cr))continue;
      if (complete&&actual !== undefined||printed[path]?.test(unmarked)) throw new StagedExtractionError('UNPROVEN_BASE_NUMBER', `/creature/${path}`);
      continue;
    }
    // An OCR fragment such as HP 3O or XP 450l cannot prove the numeric prefix.
    if(matches.some(match=>/^[A-Za-z\d/]|^\.\d/u.test(normalized.slice(match.index!+match[0].length))))throw new StagedExtractionError('UNPROVEN_BASE_NUMBER',`/creature/${path}`);
    const expected = matches.map(match => {
      const literal = match[1]!.replace(/,/gu, '');
      return fraction && literal.includes('/') ? Number(literal.split('/')[0]) / Number(literal.split('/')[1]) : Number(literal);
    });
    if (new Set(expected).size !== 1) throw new StagedExtractionError('CONFLICTING_BASE_NUMBERS', `/creature/${path}`);
    if (actual !== expected[0]) throw new StagedExtractionError('BASE_NUMBER_CONFLICT', `/creature/${path}`);
  }
  // A bad ability table must not suppress a separately readable HP formula.
  const formulas = [...normalized.normalize('NFKC').matchAll(/(?:\bHP\b|Hit Points|hit_points:|生命值)\s*[:："']?\s*\d+\s*\(([^)]+)\)/giu)]
    .map(match => match[1]!.replace(/\s+/gu, '').toLowerCase());
  if (new Set(formulas).size > 1) throw new StagedExtractionError('CONFLICTING_BASE_FORMULAS', '/creature/attributes/hp/formula');
  if (formulas.length && ir.creature.attributes.hp.formula?.replace(/\s+/gu, '').toLowerCase() !== formulas[0]) throw new StagedExtractionError('BASE_FORMULA_CONFLICT', '/creature/attributes/hp/formula');
  if (complete&&!formulas.length && ir.creature.attributes.hp.formula) throw new StagedExtractionError('UNPROVEN_BASE_NUMBER', '/creature/attributes/hp/formula');
  const abilityLabels = { str: 'STR|Strength|力量', dex: 'DEX|Dexterity|敏捷', con: 'CON|Constitution|体质', int: 'INT|Intelligence|智力', wis: 'WIS|Wisdom|感知', cha: 'CHA|Charisma|魅力' } as const;
  const aliases=new Map(Object.entries(abilityLabels).flatMap(([key,labels])=>labels.split('|').map(label=>[label.toLowerCase(),key] as const)));
  const abilityLines=unmarked.split(/\r\n|\n|\r/u),horizontal:Record<string,number[]>={};
  for(let index=0;index<abilityLines.length;index++){
    const cells=abilityLines[index]!.split('|').map(cell=>cell.trim()).filter(Boolean),rowKey=aliases.get(cells[0]?.toLowerCase()??'');
    if(abilityLines[index]!.includes('|')&&rowKey&&cells.length>=2&&!aliases.has(cells[1]!.toLowerCase())){
      if(cells.length>4||!/^\d+$/u.test(cells[1]!)||cells[2]!==undefined&&!/^[+\-−–]\d+$/u.test(cells[2])||cells[3]!==undefined&&!/^[+\-−–]\d+$/u.test(cells[3]))throw new StagedExtractionError('UNPROVEN_BASE_NUMBER',`/creature/abilities/${rowKey}`);
      const score=Number(cells[1]);
      if(cells[2]!==undefined&&Number(cells[2].replace(/[−–]/gu,'-'))!==Math.floor((score-10)/2))throw new StagedExtractionError('BASE_NUMBER_CONFLICT',`/creature/abilities/${rowKey}`);
      (horizontal[rowKey]??=[]).push(score);abilityLines[index]='';continue;
    }
    const headers=abilityLines[index]!.replace(/\|/gu,' ').trim().toLowerCase().split(/\s+/u).map(label=>aliases.get(label));
    if(headers.length!==6||headers.some(label=>!label))continue;
    if(new Set(headers).size!==6)throw new StagedExtractionError('UNPROVEN_BASE_NUMBER','/creature/abilities');
    let rowIndex=index+1;
    if(/^[\s|:\-]+$/u.test(abilityLines[rowIndex]??''))rowIndex++;
    const row=(abilityLines[rowIndex]??'').replace(/\|/gu,' ').trim();
    const cell=/\d+(?:\s*\(\s*([+\-−–]?\d+)\s*\))?/gu;
    const values=[...row.matchAll(new RegExp(`(${cell.source})`,'gu'))];
    if(values.length!==6||row.replace(cell,'').trim()){
      if(complete)throw new StagedExtractionError('UNPROVEN_BASE_NUMBER','/creature/abilities');
      // A legacy layout we cannot decode owns only these table lines; it
      // must not suppress independent HP/movement checks later in the header.
      for(let line=index;line<=rowIndex;line++)abilityLines[line]='';
      index=rowIndex;continue;
    }
    for(const[column,label]of headers.entries()){
      const value=values[column]!,score=Number(value[1]!.match(/^\d+/u)![0]);
      if(value[2]!==undefined&&Number(value[2].replace(/[−–]/gu,'-'))!==Math.floor((score-10)/2))
        throw new StagedExtractionError('BASE_NUMBER_CONFLICT',`/creature/abilities/${label}`);
      (horizontal[label!]??=[]).push(score);
    }
    // Exclude table headers from adjacent-label matching: the last header
    // must not borrow the first value in the next row as its own score.
    for(let line=index;line<=rowIndex;line++)abilityLines[line]='';
    index=rowIndex;
  }
  const inlineAbilities=abilityLines.join(' ').replace(/\s+/gu,' ');
  for (const [ability, labels] of Object.entries(abilityLabels)) {
    const label=`(?:\\b(?:${labels.split('|').slice(0,-1).join('|')})\\b|${labels.split('|').at(-1)})`;
    const matches = [...inlineAbilities.matchAll(new RegExp(`${label}\\s*[:：]?\\s*(\\d+)(?![A-Za-z\\d./])`, 'giu'))].map(match=>Number(match[1]));
    const values=[...matches,...(horizontal[ability]??[])];
    if (!values.length) {if(complete||new RegExp(label,'iu').test(inlineAbilities))throw new StagedExtractionError('UNPROVEN_BASE_NUMBER', `/creature/abilities/${ability}`);continue;}
    if (new Set(values).size !== 1) throw new StagedExtractionError('CONFLICTING_BASE_NUMBERS', `/creature/abilities/${ability}`);
    if (ir.creature.abilities[ability as keyof typeof abilityLabels] !== values[0]) throw new StagedExtractionError('BASE_NUMBER_CONFLICT', `/creature/abilities/${ability}`);
  }
  const speedLines = [...unmarked.matchAll(/^(?:[ \t]*)(?:Speed\b|speed:|速度)\s*[:："']?[^\r\n]*(?:(?:\r\n|\n|\r)[ \t]*(?:Walk\b|Fly\b|Swim\b|Climb\b|Burrow\b|步行|飞行|游泳|攀爬|掘穴)[^\r\n]*)*/gimu)]
    .map(match => match[0].normalize('NFKC').split(/\bType\b/iu)[0]!);
  if (!speedLines.length) {if(complete)throw new StagedExtractionError('UNPROVEN_BASE_NUMBER', '/creature/attributes/movement');return;}
  const speeds: Record<string, number | boolean> = {};
  const addSpeed = (mode: string, value: number | boolean) => {
    if (Object.hasOwn(speeds, mode) && speeds[mode] !== value) throw new StagedExtractionError('CONFLICTING_BASE_NUMBERS', `/creature/attributes/movement/${mode}`);
    speeds[mode] = value;
  };
  const labels = { walk: 'walk|步行', fly: 'fly|flying|飞行', swim: 'swim|swimming|游泳', climb: 'climb|climbing|攀爬', burrow: 'burrow|burrowing|掘穴|掘地' };
  for (const speedLine of speedLines) {
    for (const walk of speedLine.matchAll(/(?:Speed\b|speed:|速度)\s*[:："']?\s*(\d+)\s*(?:ft\.?|feet|尺)/giu)) addSpeed('walk', Number(walk[1]));
    for (const [mode, label] of Object.entries(labels)) {
      const matches = speedLine.matchAll(new RegExp(`(?:\\b(?:${label.split('|').filter(value => /^[a-z]+$/u.test(value)).join('|')})\\b|${label.split('|').filter(value => !/^[a-z]+$/u.test(value)).join('|')})\\s*(\\d+)\\s*(?:ft\\.?|feet|尺)`, 'giu'));
      for (const match of matches) addSpeed(mode, Number(match[1]));
    }
    if (/\bhover(?:ing)?\b|悬浮/iu.test(speedLine)) addSpeed('hover', true);
    const remainingSpeed = speedLine.replace(/(?:Speed\b|speed:|速度)\s*[:："']?/giu, '')
      .replace(/(?:walk|fly|flying|swim|swimming|climb|climbing|burrow|burrowing|步行|飞行|游泳|攀爬|掘穴|掘地)?\s*\d+\s*(?:ft\.?|feet|尺)/giu, '')
      .replace(/hover(?:ing)?|悬浮/giu, '').replace(/[,，;；()\s"']/gu, '');
    if (remainingSpeed) throw new StagedExtractionError('UNSUPPORTED_STATIC_FACT', '/creature/attributes/movement');
  }
  if (!exactEqual(ir.creature.attributes.movement, speeds)) throw new StagedExtractionError('BASE_NUMBER_CONFLICT', '/creature/attributes/movement');
}

