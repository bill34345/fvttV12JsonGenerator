import type { AbilityKey, EvidenceRef } from './types';

const LABELS: Record<string, AbilityKey> = {
  str:'str',strength:'str','力量':'str',dex:'dex',dexterity:'dex','敏捷':'dex',
  con:'con',constitution:'con','体质':'con',int:'int',intelligence:'int','智力':'int',
  wis:'wis',wisdom:'wis','感知':'wis',cha:'cha',charisma:'cha','魅力':'cha',
};
const LABEL = '(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma|Str|Dex|Con|Int|Wis|Cha|力量|敏捷|体质|智力|感知|魅力)';
const SIGNED = '([+\\-−]\\s*\\d+)';
const SECTION = /(?:^|\r?\n)[ \t]*(?:#{1,6}[ \t]*)?(?:\*{1,2}|_{1,2})?(?:Traits|Actions|Bonus Actions|Reactions|Legendary Actions|Mythic Actions|特质(?:Traits)?|特性|动作(?:Actions)?|附赠动作(?:Bonus Actions)?|反应|传奇动作|神话动作)[ \t]*[:：]?[ \t]*(?:\*{1,2}|_{1,2})?[ \t]*[:：]?[ \t]*(?:\r?\n|$)/iu;
export interface SourceSaveEvidence { ability:AbilityKey;total:number;score?:number;evidence:EvidenceRef }

/** Source-derived table/list facts from this candidate's core block, never a feature or another creature. */
export function explicitSourceSaves(source:string,scope={start:0,end:source.length}):SourceSaveEvidence[]{
  if(!Number.isInteger(scope.start)||!Number.isInteger(scope.end)||scope.start<0||scope.end>source.length||scope.start>=scope.end)return [];
  const text=source.slice(scope.start,scope.end);
  const boundary=SECTION.exec(text);
  let core=text.slice(0,boundary?.index??text.length);
  const acStart=/^[ \t]*(?:\*{1,2})?(?:AC|Armor Class|护甲等级)(?:\*{1,2})?[ \t]*[:：]?[ \t]*\d+/imu.exec(core)?.index;
  if(acStart===undefined)return [];
  let offset=acStart;
  for(const line of core.slice(acStart).split(/(?<=\n)/u)){
    const value=line.trim().replace(/^[*_]+|[*_]+$/gu,'');
    const metadata=/^(?:AC|Armor Class|HP|Hit Points|Speed|Initiative|Size|Type|Skills|Saving Throws|Immunities|Resistances|Vulnerabilities|Senses|Languages|Challenge|CR|XP|Proficiency|Drives|MOD|SAVE|Str|Dex|Con|Int|Wis|Cha|Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma|护甲等级|生命值|速度|先攻|技能|豁免|感官|语言|力量|敏捷|体质|智力|感知|魅力)(?:\b|\s|[:：])/iu.test(value);
    if(!metadata&&(/^[\p{L}][\p{L}\d '\-()]{1,75}[.。:：]\s*\S/u.test(value)
      ||/^(?:#{1,6}\s+\S|\*{1,2}\S.+\*{1,2}$|_{1,2}\S.+_{1,2}$)/u.test(line.trim()))){core=core.slice(0,offset);break;}
    offset+=line.length;
  }
  core=core.slice(acStart);
  const facts:SourceSaveEvidence[]=[];
  const signed=(value:string)=>Number(value.replace(/\s/gu,'').replace('−','-'));
  // An ability table has SCORE, MOD and SAVE columns, with six distinct rows.
  // Requiring the complete table prevents a numeric fragment in ordinary prose from becoming a save.
  const rows=[...core.matchAll(new RegExp(`(${LABEL})\\s+(\\d+)\\s+${SIGNED}\\s+${SIGNED}(?!\\d)`,'giu'))];
  if(rows.length===6&&new Set(rows.map(row=>LABELS[row[1]!.toLowerCase()])).size===6){
    for(const row of rows){
      const score=Number(row[2]);
      if(score<1||score>30||signed(row[3]!)!==Math.floor((score-10)/2))return [];
      const start=scope.start+acStart+row.index!;
      facts.push({ability:LABELS[row[1]!.toLowerCase()]!,score,total:signed(row[4]!),evidence:{start,end:start+row[0].length,quote:row[0]}});
    }
  }
  for(const line of core.matchAll(/^(?:[ \t]*)(?:Saving Throws|豁免(?:加值)?)\s*[:：]?([^\r\n]+)/gimu)){
    const body=line[1]!;
    const offset=line.index!+line[0].lastIndexOf(body);
    for(const pair of body.matchAll(new RegExp(`(${LABEL})\\s*${SIGNED}(?!\\d)`,'giu'))){
      const start=scope.start+acStart+offset+pair.index!;
      facts.push({ability:LABELS[pair[1]!.toLowerCase()]!,total:signed(pair[2]!),evidence:{start,end:start+pair[0].length,quote:pair[0]}});
    }
  }
  return facts;
}
