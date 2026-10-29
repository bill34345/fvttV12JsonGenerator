const LANGUAGE_CODE_MAP: Record<string, string> = {
  // 中文 → Foundry VTT dnd5e code
  '通用语': 'common',
  '通用': 'common',
  '龙语': 'draconic',
  '精灵语': 'elvish',
  '精灵': 'elvish',
  '矮人语': 'dwarvish',
  '矮人': 'dwarvish',
  '巨人语': 'giant',
  '巨人': 'giant',
  '地精语': 'goblin',
  '地精': 'goblin',
  '兽人语': 'orc',
  '兽人': 'orc',
  '深渊语': 'deep',
  '深渊': 'deep',
  '炼狱语': 'infernal',
  '炼狱': 'infernal',
  '天界语': 'celestial',
  '天界': 'celestial',
  '木族语': 'sylvan',
  '木族': 'sylvan',
  '地下通用语': 'undercommon',
  '水族语': 'aquan',
  '水族': 'aquan',
  '风族语': 'auran',
  '风族': 'auran',
  '火族语': 'ignan',
  '火族': 'ignan',
  '土族语': 'terran',
  '土族': 'terran',
  '狗头人语': 'draconic',
  '地底侏儒语': 'gnomish',
  '半身人语': 'halfling',
  '半身人': 'halfling',
  '恐爪怪语': 'deep',
  '泛语言': 'all',
  '无': '',
  // 英文 → Foundry code (pass-through)
  'common': 'common',
  'abyssal': 'abyssal',
  'aarakocra': 'aarakocra',
  'cant': 'cant',
  'druidic': 'druidic',
  'gith': 'gith',
  'gnoll': 'gnoll',
  'sign': 'sign',
  'gnomish': 'gnomish',
  'halfling': 'halfling',
  'primordial': 'primordial',
  'draconic': 'draconic',
  'elvish': 'elvish',
  'dwarvish': 'dwarvish',
  'giant': 'giant',
  'goblin': 'goblin',
  'orc': 'orc',
  'deep': 'deep',
  'infernal': 'infernal',
  'celestial': 'celestial',
  'sylvan': 'sylvan',
  'undercommon': 'undercommon',
  'aquan': 'aquan',
  'auran': 'auran',
  'ignan': 'ignan',
  'terran': 'terran',
};

const V14_LANGUAGE_ALIASES: Record<string, string> = {
  深渊语: 'abyssal', 深渊: 'abyssal', 深渊魔语: 'abyssal', 深渊魔: 'abyssal',
  深语: 'deep', 侏儒语: 'gnomish', 原初语: 'primordial',
  通用手语: 'sign', 手语: 'sign', 盗贼黑话: 'cant', 德鲁伊语: 'druidic',
  吉斯语: 'gith', 豺狼人语: 'gnoll', 鸟人语: 'aarakocra',
  'deep speech': 'deep', dwarven: 'dwarvish',
};

export function projectActorLanguages(languages:string[],custom:string,v14:boolean):{value:string[];custom:string}{
  if(!v14)return{value:languages.map(lang=>LANGUAGE_CODE_MAP[lang]||lang).filter(lang=>lang!==''),custom};
  const value:string[]=[],unregistered:string[]=[];
  const visible=new Set(custom.split(/[;；]/u).map(part=>part.trim()));
  for(const lang of languages){
    if(lang==='')continue;
    const lower=lang.toLowerCase();
    const code=Object.hasOwn(V14_LANGUAGE_ALIASES,lower)?V14_LANGUAGE_ALIASES[lower]
      :Object.hasOwn(LANGUAGE_CODE_MAP,lang)?LANGUAGE_CODE_MAP[lang]
        :Object.hasOwn(LANGUAGE_CODE_MAP,lower)?LANGUAGE_CODE_MAP[lower]
          :/^all$/iu.test(lang)?'all':/^(?:none|noneactionlabel)$/iu.test(lang)?'':undefined;
    if(code!==undefined){if(code!=='')value.push(code==='all'?'ALL':code);continue;}
    // Schema-derived: 5.3.3 prepareLanguages renders catalogue entries and
    // custom text only. An unknown native key is stored but never displayed.
    const identity=lang.trim();
    if(!visible.has(identity)){unregistered.push(lang);visible.add(identity);}
  }
  return{value,custom:unregistered.length?unregistered.join('; ')+(custom?'; '+custom:''):custom};
}
