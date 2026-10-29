// Schema-derived language identities from the supported dnd5e catalogue.
// This recognises a complete language list, never arbitrary rule prose.
const LANGUAGE_IDENTITIES: Record<string,string> = {
  common:'Common',通用语:'Common',draconic:'Draconic',龙语:'Draconic',
  dwarvish:'Dwarvish',dwarven:'Dwarvish',矮人语:'Dwarvish',elvish:'Elvish',精灵语:'Elvish',
  giant:'Giant',巨人语:'Giant',gnomish:'Gnomish',侏儒语:'Gnomish',goblin:'Goblin',地精语:'Goblin',
  halfling:'Halfling',半身人语:'Halfling',orc:'Orc',兽人语:'Orc',
  sign:'Sign',通用手语:'Sign',aarakocra:'Aarakocra',鸟人语:'Aarakocra',
  abyssal:'Abyssal',深渊语:'Abyssal',cant:'Cant',盗贼黑话:'Cant',celestial:'Celestial',天界语:'Celestial',
  deep:'Deep', 'deep speech':'Deep',深语:'Deep',druidic:'Druidic',德鲁伊语:'Druidic',
  gith:'Gith',吉斯语:'Gith',gnoll:'Gnoll',豺狼人语:'Gnoll',infernal:'Infernal',炼狱语:'Infernal',
  primordial:'Primordial',原初语:'Primordial',sylvan:'Sylvan',木族语:'Sylvan',undercommon:'Undercommon',地下通用语:'Undercommon',
  aquan:'Aquan',水族语:'Aquan',auran:'Auran',风族语:'Auran',ignan:'Ignan',火族语:'Ignan',terran:'Terran',土族语:'Terran',
};

/** Reception-only: keep custom verbatim, including dialect annotations. */
export function normalizeDeclaredLanguageList(languages:Record<string,unknown>):boolean {
  if(!Array.isArray(languages.values)||typeof languages.custom!=='string'||!languages.custom.trim())return false;
  const identity=(name:string)=>{const key=name.trim().toLowerCase();return Object.hasOwn(LANGUAGE_IDENTITIES,key)?LANGUAGE_IDENTITIES[key]:undefined;};
  const clauses=languages.custom.trim().split(/[,;，；](?![^()（）]*[)）])/u);
  const names:string[]=[];
  for(const clause of clauses){
    const match=/^\s*([^()（）]+?)(?:\s*\(([^()]*)\)|\s*（([^（）]*)）)?\s*$/u.exec(clause);
    const name=match&&identity(match[1]!);
    const annotation=match?.[2]??match?.[3];
    if(!name||annotation!==undefined&&(!annotation.trim()||!annotation.split(/[,;，；]/u).every(part=>identity(part))))return false;
    names.push(name);
  }
  const known=new Set(languages.values.flatMap(value=>typeof value==='string'?[identity(value)??value]:[]));
  const additions=names.filter(name=>!known.has(name)&&!(known.has('Primordial')&&['Aquan','Auran','Ignan','Terran'].includes(name))&&(known.add(name),true));
  if(!additions.length)return false;
  languages.values=[...languages.values,...additions];
  return true;
}
