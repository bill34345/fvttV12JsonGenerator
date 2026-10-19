import type {SourceOperation} from './sourceOperationTypes';

const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
const identity=(value:string)=>value.replace(/^Level [1-9]\d?:\s*/u,'').replace(/[.]$/u,'').trim();
const stable=(value:unknown):string=>JSON.stringify(value,(_key,entry)=>entry&&typeof entry==='object'&&!Array.isArray(entry)?Object.fromEntries(Object.entries(entry).sort(([a],[b])=>a.localeCompare(b))):entry);
const damageTypes:Record<string,string>={acid:'acid',bludgeoning:'bludgeoning',cold:'cold',fire:'fire',force:'force',lightning:'lightning',necrotic:'necrotic',piercing:'piercing',poison:'poison',psychic:'psychic',radiant:'radiant',slashing:'slashing',thunder:'thunder'};

/** Source-derived, deliberately bounded fixed-amount upgrade. The named
 * option and complete conditional base remain GM-controlled. No class-level
 * inference, feature-name exception, automatic trigger or rewritten quote. */
export function fixedDamageUpgrade(source:string,contexts:readonly string[],proveBase:(source:string,ops:SourceOperation[])=>boolean,applyUpgrade=true):SourceOperation[]|undefined{
  const parent=source.trim(),heading=identity(parent.split(/\r?\n/u)[0]??'');
  if(!heading||!contexts.length)return;
  const matches:SourceOperation[][]=[];
  for(const context of contexts){
    if(typeof context!=='string')continue;
    const upgrade=context.trim();
    if(!new RegExp(`(?:^|\\n)The option you chose for ${escape(heading)} grows more powerful, as detailed below\\.`,'u').test(upgrade))continue;
    const increases=[...upgrade.matchAll(/The extra damage of your ([\p{L}][\p{L}'’ -]{0,100}) increases to (\d+d\d+(?:\s*[+-]\s*\d+)?)\./gu)];
    if(increases.length!==1)continue;
    const increase=increases[0]!,option=increase[1]!,amount=increase[2]!.replace(/\s/gu,'');
    // Both literal subheadings and the exact selected-option relationship
    // are required. A similarly named adjacent rule supplies no authority.
    if(!new RegExp(`(?:^|[.\\n]\\s*)${escape(option)}\\.\\s*${escape(increase[0])}`,'u').test(upgrade))continue;
    const block=new RegExp(`(?:^|[.\\n]\\s*)${escape(option)}\\.\\s*([^.!?\\r\\n]+[.!?])`,'u').exec(parent);
    const quote=block?.[1];if(!quote||!/\bcreature\b/u.test(quote)||!/\bthe target\b/u.test(quote))continue;
    const damage=/\bextra (\d+d\d+(?:\s*[+-]\s*\d+)?) ([\p{L}, ]+) damage\b/u.exec(quote);
    if(!damage||damage[1]!.replace(/\s/gu,'')===amount)continue;
    const typeText=damage[2]!.trim(),labels=typeText.split(/,\s*|\s+or\s+/u).filter(Boolean).map(label=>label.replace(/^or\s+/u,'').toLowerCase());
    if(!labels.length||new Set(labels).size!==labels.length||labels.some(label=>!Object.hasOwn(damageTypes,label))||labels.length>1&&!/\bor\b/u.test(typeText))continue;
    const types=labels.map(label=>damageTypes[label]!),base:SourceOperation={id:'named-damage-upgrade',name:option+'（按已选选项与原条件）',type:'damage',relationship:'follow-up',sourceText:parent,condition:parent,
      damage:[{formula:damage[1]!.replace(/\s/gu,''),type:types[0]!,...(types.length>1?{types}:{}),relationship:'conditional',condition:parent}],proof:{damage:[quote]}};
    if(!proveBase(parent,[base]))continue;
    const op:SourceOperation={...base,damage:[{...base.damage![0]!,formula:amount}],proof:{...base.proof,upgrade:{sourceText:context,quote:increase[0]}}};
    matches.push(applyUpgrade?[op]:[base]);
  }
  return matches.length===1?matches[0]:undefined;
}

export function fixedDamageUpgradeErrors(source:string,value:unknown,contexts:readonly string[],proveBase:(source:string,ops:SourceOperation[])=>boolean):string[]{
  const expected=fixedDamageUpgrade(source,contexts,proveBase);
  if(!expected||!Array.isArray(value)||value.length!==1)return['upgrade/source-relation'];
  const actual=value.map(op=>{
    if(!op||typeof op!=='object')return op;
    const {evidence,...rest}=op;
    if(evidence&&(!Number.isSafeInteger(evidence.start)||!Number.isSafeInteger(evidence.end)||evidence.start<0||evidence.end-evidence.start!==source.trim().length||evidence.quote!==source.trim()))return op;
    return rest;
  });
  return stable(actual)===stable(expected)?[]:['upgrade/facts-or-condition'];
}
