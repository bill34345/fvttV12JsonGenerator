import type { SourceRuleFact, ManualSpellUseRecord, GmTriggeredSave, NativeFailureStatus } from './action';
import { NATIVE_LIFECYCLE_STATUSES } from '@fvtt-json-generator/contracts/status-lifecycle';
import {sourceResultScopes,sourceOperationClauses,SOURCE_NEGATION_TOKEN} from './sourceOperationScopes';

const ABILITY: Record<string, 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'> = {
  strength: 'str', dexterity: 'dex', constitution: 'con',
  intelligence: 'int', wisdom: 'wis', charisma: 'cha',
};
interface LocatedFact { start: number; end: number; fact: SourceRuleFact }
export const SOURCE_NATIVE_FAILURE_LABELS:Record<NativeFailureStatus,string>={dead:'死亡',blinded:'目盲',charmed:'魅惑',deafened:'耳聋',exhaustion:'力竭',frightened:'恐慌',grappled:'受擒',incapacitated:'失能',invisible:'隐形',paralyzed:'麻痹',petrified:'石化',poisoned:'中毒',prone:'倒地',restrained:'束缚',stunned:'震慑',unconscious:'昏迷'};
/** Only a direct, unconditional, untimed failed-save state. Timed states and
 * conditional consequences retain their complete GM rule instead of creating
 * an executable indefinite Effect or approximating a target's next turn. */
export function sourceFailedSaveStatuses(tail:string):NativeFailureStatus[]{
  const text=tail.replace(/[*_]/gu,'').replace(/\s+/gu,' ').trim();
  const failed=/^[.。]?\s*(?:Failure|失败)[:：]\s*(.*)$/iu.exec(text);
  const alternate=/^\s*[,，]?\s*or\s+(?:become|be|becomes|have)\s+(.*)$/iu.exec(text);
  const directBody=(failed?.[1]??(alternate&&/^\s*[,，]?\s*or\s+have\b/iu.test(text)?'have '+alternate[1]:alternate?.[1]));if(!directBody)return[];
  const scopes=sourceResultScopes(text),failedScopes=scopes.filter(scope=>scope.branch==='failure');
  const body=failedScopes.length?failedScopes.map(scope=>scope.text).join(' '):directBody;
  const clause=body.split(/[。.](?:\s|$)|[。]/u)[0]!;
  if(/\bescape\s+DC\s*\d+\b/iu.test(clause))return[];
  if(/\b(?:if|unless|until|for|while|when|only|instead|not|may|can|choose|choice|or)\b|如果|若|仅当|除非|直到|持续|回合|轮|分钟|小时|选择|免疫|不会|不能|可以|或者|或是/iu.test(clause))return[];
  // A result label remains in scope across sentences. A separately printed
  // lifetime/end/repeat rule is not an indefinite native status. Consequences
  // whose grammatical subject is a separate soul/body/equipment stay GM-owned
  // without cancelling an explicit ordinary death result.
  // A repeat/end sentence contains its own inline success, but still
  // limits the failed status. Only a separately labelled Success block closes
  // this lifetime region; do not discard it by the sentence's result branch.
  let failureRegion=true;
  for(const sentence of sourceOperationClauses(text).slice(1)){
    if(/^(?:Success|成功)\s*[:：]/iu.test(sentence))failureRegion=false;
    if(/^(?:Failure|失败)\s*[:：]/iu.test(sentence))failureRegion=true;
    if(failureRegion&&/\brepeats? (?:the )?(?:save|saving throw)\b|\bending the effect\b|\bafter \d+ (?:minutes?|rounds?|hours?)\b[^.;。]*\bsucceeds? automatically\b/iu.test(sentence))return[];
  }
  const later=(failedScopes.length?scopes.filter(scope=>scope.branch!=='success').map(scope=>scope.text).join(' '):body).slice(clause.length);
  for(const sentence of later.split(/[。.](?:\s|$)|[。]/u).map(value=>value.replace(/^[.。\s]+/u,'').trim()).filter(Boolean)){
    const otherSubject=/^(?:(?:(?:the )?(?:target|creature)['’]s|its)\s+|(?:the|a|an)\s+)?(?:soul|spirit|body|equipment|weapon)\b|^(?:其|目标的|该生物的)?(?:灵魂|身体|装备|武器)/iu.test(sentence);
    const resurrectionRestriction=/^(?:(?:在|直到)[^。]*[,，]\s*)?(?:该目标|目标|该生物)(?:无法|不能|不得)(?:复活|死而复生)/iu.test(sentence)||/^(?:the )?(?:target|creature) (?:cannot|can't|can’t) be (?:resurrected|revived|restored to life)\b/iu.test(sentence);
    const recoveryWork=/^It takes \d+ (?:minutes?|hours?|rounds?|days?) to (?:recover|collect|gather) (?:the|these|those)\s+[^.;。]+[.。]?$/iu.test(sentence)&&!/\b(?:condition|target|creature|itself)\b/iu.test(sentence);
    if(!otherSubject&&!resurrectionRestriction&&!recoveryWork&&/\b(?:until|for|turn|round|minute|hour|day|ends?|repeats?|saving throw)\b|直到|持续|回合|轮|分钟|小时|\d+\s*天|豁免|结束|解除|之前|之后/iu.test(sentence))return[];
  }
  if(/^(?:die\b|(?:the )?(?:target|creature) (?:immediately )?(?:dies\b|is dead\b)|(?:目标|该生物)(?:立即)?死亡)/iu.test(body))return['dead'];
  // The omitted subject of a direct failed-save landing is this recipient.
  // Another explicit creature, a condition or a later end remains GM-owned.
  if(/^fall off,\s*landing with the Prone condition\b/iu.test(clause))return['prone'];
  // 2024's HAS/HAVE <state> CONDITION is the same untimed state. A
  // preceding damage/push may share its target, but no different subject or
  // conditional/lifetime clause can create an indefinite native Effect.
  // Stay at this failed recipient's subject. A conjunction may carry
  // its own damage/movement verb, but cannot cross a new explicit subject.
  const modern=/^(?:have|has)\s+(?:the )?([a-z]+)\s+condition\b|^(?:\d[^,.;。]{0,100},\s*and\s+)?the\s+(?:target|creature)\s+(?:(?:is (?:pushed|pulled|moved)|takes)\s+(?:(?!\b(?:and|but|then)\b)[^.;。]){1,160}?\s*,?\s+and\s+){0,2}(?:the target\s+)?(?:has|have)\s+(?:the )?([a-z]+)\s+condition\b/iu.exec(clause);
  const id=(modern?.[1]??modern?.[2])?.toLowerCase();
  if(id&&id!=='dead'&&Object.hasOwn(SOURCE_NATIVE_FAILURE_LABELS,id))return[id as NativeFailureStatus];
  const status=body.replace(/^(?:(?:the )?(?:target|creature)\s+(?:is|becomes)\s+|(?:目标|该生物)(?:陷入|受到|被)?)/iu,'').replace(/^knocked\s+/iu,'');
  for(const [id,label] of Object.entries(SOURCE_NATIVE_FAILURE_LABELS))if(id!=='dead'&&(new RegExp('^'+id+'\\b','iu').test(status)||status.startsWith(label)))return[id as NativeFailureStatus];
  return[];
}

/** Quoted prose is source material, not the creature's casting declaration.
 * Preserve UTF-16 positions so single-spell offsets remain exact. */
function unquotedCastingText(source:string):string{return source.replace(/"[^"\r\n]*(?:\r?\n[^"\r\n]*)*"|“[^”]*”/gu,quote=>quote.replace(/[^\r\n]/g,' '));}
// Modifiers can intervene between an active auxiliary/subject and its verb.
// Restrict this to adverbs so "can see a spell cast ..." stays a reference.
const castingAdverbs='(?:(?:[a-z]+ly|also|still|always|only|just|even)\\s+)*';
const activeCastingSuffix=new RegExp('\\b(?:can|may|must|will|could|would|should|you|we|they|i|to|and|or)\\s+'+castingAdverbs+'$','iu');
const externalCastingSubject=new RegExp('\\b(?:the|a|another)\\s+(?:target|wearer|summoner|creator|ally|enemy|spellcaster)\\s+(?:(?:can|may|must|will|could|would|does)\\s+'+castingAdverbs+'(?:choose to\\s+)?)?$','iu');
/** An indefinite creature that appears/emerges/is summoned is a separate
 * source entity. Its later definite subject cannot grant its spells to the
 * source carrier. Require the same noun phrase and an actual introduction;
 * another creature merely mentioned nearby does not own the next cast. */
function introducedCastingSubject(before:string,clause:string):boolean{
  const subject=new RegExp('\\bthe\\s+([\\p{L}\\p{M}’\'\\-]+(?:\\s+[\\p{L}\\p{M}’\'\\-]+){0,4}?)\\s+(?:(?:can|may|must|will|could|would|should|does)\\s+'+castingAdverbs+')?$','iu').exec(clause.trimEnd()+' ')?.[1];
  if(!subject)return false;
  const noun=subject.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&').replace(/\s+/gu,'\\s+');
  return new RegExp('\\b(?:a|an|another)\\s+'+noun+'\\s+(?:(?:magically|suddenly)\\s+)?(?:appears?|emerges?|is\\s+(?:summoned|created))\\b','iu').test(before);
}
function castingPredicateNegated(source:string,index:number):boolean{
  // AND/OR can share the preceding negative auxiliary ("cannot speak or
  // cast"); they do not prove a new positive predicate. A contrasting BUT
  // does. Keep uncertain coordination negative instead of creating a Cast.
  const before=source.slice(0,index).split(/[。.;；]|\bbut\b|但是|但/iu).at(-1)??'';
  return new RegExp(`\\b${SOURCE_NEGATION_TOKEN}\\b|不|不能|无法|并非`,'iu').test(before);
}

/** Polarity of actual casting declarations, shared by staged selection and
 * validation of already-declared groups. Header/prepared tables may have no
 * cast verb; a quoted declaration alone is never a positive grant. */
export function sourceCastingGrantPolarity(source:string):'positive'|'negative'|'quoted'|'absent'|'external'{
  const visible=unquotedCastingText(source),matches=[...visible.matchAll(/\bcasts?\b|施展/giu)];
  if(matches.some(match=>castingPredicateNegated(visible,match.index!)))return'negative';
  if(matches.some(match=>{const before=visible.slice(0,match.index);return!introducedCastingSubject(before,sourceOperationClauses(before).at(-1)??'');}))return'positive';
  if(matches.length)return'external';
  return/\bcasts?\b|施展/iu.test(source)?'quoted':'absent';
}

/** Shared positive list predicate used by staged extraction and ordinary IR
 * omission checks. Optional "one of" changes choice, not real spell casting. */
export function sourceHasSpellList(source:string):boolean{
  const visible=unquotedCastingText(source).replace(/[*_]/gu,'').replace(/\s+/gu,' ');
  // Negation governs the casting predicate through intervening modifiers
  // ("cannot normally cast", "does not usually cast"), including coordinated
  // verbs governed by the same negative auxiliary. An earlier foreign or
  // negative list cannot hide a later actual grant to the source creature.
  for(const match of visible.matchAll(/(?:施展[^。\n]{0,70}法术|casts? (?:one of )?the following spells)/giu)){
    const before=visible.slice(0,match.index);
    if(!castingPredicateNegated(visible,match.index)&&!introducedCastingSubject(before,sourceOperationClauses(before).at(-1)??''))return true;
  }
  return false;
}

/** An explicit single spell cast action, without an added resource limit. */
export function sourceSingleSpellAction(source:string):{name:string;start:number;end:number}|undefined{
  const visible=unquotedCastingText(source);
  let cursor=0;
  const clauses=sourceOperationClauses(visible).map(quote=>{const start=visible.indexOf(quote,cursor);cursor=start+quote.length;return{start,end:cursor};});
  for(const match of visible.matchAll(/(?:施展\s*([\p{L} '’\-]+?)|\bcasts?\b\s+([A-Za-z '’\-]+?))(?=[,，。.]| without\b| using\b)/giu)){
    const name=(match[1]??match[2])!.trim(),owner=clauses.find(clause=>clause.start<=match.index!&&match.index!<clause.end),clause=visible.slice(owner?.start??0,match.index);
    // A trigger/end condition, another actor's casting, or a reference to an
    // unnamed/stored spell grants no spell of that name to this creature.
    const generic=/^(?:on|onto|at|into|than)\b/iu.test(name)||/^(?:a|an|the|its|their|this|that|any|another|one)\s+(?:(?:stored|prepared|chosen|selected|same|specified)\s+)*spells?\b/iu.test(name)
      ||/^(?:(?:stored|prepared|chosen|selected|same|specified)\s+)*spells?(?:$|\s+(?:on|with|of|that|which)\b)/iu.test(name)
      ||/^(?:no|zero|neither)\b|^(?:it|them|either|both)(?:$|\s+(?:at|as|on|with|without|using|for|normally|successfully)\b)/iu.test(name);
    // Bare "cast" is also a passive participle ("a spell cast outside").
    // A finite plural/second-person subject, modal, infinitive or coordinated
    // active predicate is required before treating that form as a grant.
    const passive=/^cast\s/iu.test(match[0])&&clause.trim()!==''&&!activeCastingSuffix.test(clause);
    const externalSubject=externalCastingSubject.test(clause)||introducedCastingSubject(visible.slice(0,match.index),clause);
    // A choice to spend an attack on the existing named Spellcasting ability
    // is not a second independent grant of the referenced spell. The complete
    // choice stays on its parent rule; independent direct casts still count.
    const existingAbilityChoice=/\bcan\s+replace\s+(?:one|a|an|\d+)\s+attack\s+with\s+a\s+use\s+of\s+[^.。]*\bspellcasting\s+to\s*$/iu.test(clause);
    if(generic||passive||externalSubject||existingAbilityChoice||/以下|法术|following|\bspells\b/iu.test(name)||castingPredicateNegated(visible,match.index!)
      ||/\b(?:if|when|whenever|unless|until|before|after|while)\b|如果|仅当|除非|直到|之前|之后|每当/iu.test(clause)
      ||/\d+\s*\/\s*(?:日|day)/iu.test(source))continue;
    const start=match.index!+match[0].indexOf(name);return{name,start,end:start+name.length};
  }
  return;
}

/** Only a source-explicit post-damage 0HP Save. Invoking it is always separate
 * from attacking; dropping to zero is never itself interpreted as death. */
export function sourceGmTriggeredSave(source:string):GmTriggeredSave|undefined {
  const text=source.replace(/[*_]/gu,'').replace(/\s+/gu,' ').trim();
  const patterns=[
    /(?<trigger>如果(?:目标|该生物)因(?:此|该)(?:次)?攻击生命值降至0[^。]*。)\s*(?<ability>力量|敏捷|体质|智力|感知|魅力)豁免[:：]\s*DC\s*(?<dc>\d+)[。.。]\s*失败[:：]\s*(?<failure>.*)/giu,
    /(?<trigger>如果(?:此次伤害使|该次伤害使)(?:目标|该生物)(?:的)?生命值降至0[^。]*。)\s*(?<ability>力量|敏捷|体质|智力|感知|魅力)豁免[:：]\s*DC\s*(?<dc>\d+)[。.。]\s*失败[:：]\s*(?<failure>.*)/giu,
    /(?<trigger>\b(?:A|The) (?:creature|target) reduced to 0 Hit Points by this damage) must make a (?<ability>Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:\s*DC\s*(?<dc>\d+)\.\s*Failure:\s*(?<failure>.*)/giu,
  ];
  const matches=patterns.flatMap(pattern=>[...text.matchAll(pattern)]);
  if(matches.length!==1){
    // The same manual entry also preserves a single explicit post-hit Save
    // with a different source trigger. Its full prefix is the GM condition.
    const hit=/\bHit:|命中[:：]/iu.exec(text);
    const saves=[...text.matchAll(/(?:DC\s*(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw|(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+Saving Throw:\s*DC\s*(\d+)|(力量|敏捷|体质|智力|感知|魅力)豁免[:：]\s*DC\s*(\d+)|DC\s*(\d+)\s*(?:的\s*)?(力量|敏捷|体质|智力|感知|魅力)\s*豁免(?:检定)?)/giu)];
    if(!hit||saves.length!==1||saves[0]!.index!<hit.index)return;
    const s=saves[0]!,before=text.slice(Math.max(hit.index,s.index!-45),s.index!);
    if(/(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+or\s*$|(?:力量|敏捷|体质|智力|感知|魅力)或\s*$/iu.test(before))return;
    const cn:Record<string,GmTriggeredSave['ability']>={力量:'str',敏捷:'dex',体质:'con',智力:'int',感知:'wis',魅力:'cha'};
    const ability=cn[s[5]??s[8]??'']??ABILITY[(s[2]??s[3]??'').toLowerCase()],dc=Number(s[1]??s[4]??s[6]??s[7]);
    if(!ability||dc<1||dc>40)return;
    const tail=text.slice(s.index!+s[0].length),trigger=text.slice(hit.index,s.index!).trim();
    if(/^\s*(?:或|or)\s*(?:DC\s*\d+\s*(?:的\s*)?)?(?:力量|敏捷|体质|智力|感知|魅力|Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/iu.test(tail))return;
    return{dc,ability,trigger,sourceText:text.slice(hit.index),failureStatuses:sourceFailedSaveStatuses(tail)};
  }
  const m=matches[0]!,g=m.groups!,dc=Number(g.dc);
  if(dc<1||dc>40)return;
  const chinese:Record<string,GmTriggeredSave['ability']>={力量:'str',敏捷:'dex',体质:'con',智力:'int',感知:'wis',魅力:'cha'};
  const ability=chinese[g.ability!]??ABILITY[g.ability!.toLowerCase()];if(!ability)return;
  return{dc,ability,trigger:g.trigger!,sourceText:m[0],failureStatuses:sourceFailedSaveStatuses('Failure: '+g.failure!)};
}

/** Source-derived independent daily lists. Shared, qualified and annotated
 * lists remain literal; this helper neither identifies nor resolves spells. */
export function sourceManualSpellUses(source: string): { records: ManualSpellUseRecord[]; ruleText: string } | undefined {
  const text=source.replace(/[*_]/gu,'');
  if(!sourceHasSpellList(text))return;
  const lines=text.split(/\r\n|\n|\r/u),records:ManualSpellUseRecord[]=[],rules:string[]=[];
  for(const line of lines){
    const match=/^\s*(?:每项\s*(\d+)\s*[/／]\s*日|([0-9]+)\s*\/\s*Day\s+Each)\s*[:：]\s*(.+?)\s*$/iu.exec(line);
    if(!match)continue;
    const max=Number(match[1]??match[2]),names=match[3]!.split(/[,，、]/u).map(name=>name.trim());
    if(!Number.isSafeInteger(max)||max<1||max>99||names.some(name=>!name||!/^\p{L}[\p{L}\p{N}\s'’\-]*$/u.test(name)||/如果|仅当|除非|\b(?:if|unless|only|shared)\b/iu.test(name)))return;
    records.push(...names.map(name=>({name,max,period:'day' as const})));rules.push(line.trim());
  }
  if(!records.length||new Set(records.map(record=>record.name.toLowerCase())).size!==records.length)return;
  return{records,ruleText:rules.join('\n')};
}

/** Bounded source grammar for complete rules. Unknown prose remains outside this set. */
export function parseSupportedRuleFacts(source: string): SourceRuleFact[] {
  const visible = source.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ');
  const found: LocatedFact[] = [];
  const add = (match: RegExpMatchArray, fact: SourceRuleFact) => found.push({
    start: match.index!, end: match.index! + match[0].length, fact,
  });

  const attack = /\b(melee|ranged) weapon attack:\s*([+-]\d+) to hit,\s*(reach \d+ ft\.|range \d+(?:\/\d+)? ft\.),\s*(one target)\.\s*hit:\s*(\d+)\s*\(([^)]+)\)\s*(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder) damage\./giu;
  for (const match of visible.matchAll(attack)) {
    const [, mode, toHit, distance, target, average, formula, damageType] = match;
    if (!mode || !toHit || !distance || !target || !average || !formula || !damageType) continue;
    add(match, { kind: 'attack-damage', source: match[0], attackType: mode.toLowerCase() === 'melee' ? 'mwak' : 'rwak',
      toHit: Number(toHit), distance, target, average: Number(average), formula, damageType: damageType.toLowerCase() });
  }

  const saveDamage = /\b(the target|each creature in the area|each creature within (\d+) feet) must make a (strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw:\s*DC\s*(\d+)\.\s*failure:\s*(\d+)\s*\(([^)]+)\)\s*(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder) damage\.(?:\s*success:\s*half damage\.)?/giu;
  for (const match of visible.matchAll(saveDamage)) {
    const [, target, feet, ability, dc, average, formula, damageType] = match;
    if (!target || !ability || !dc || !average || !formula || !damageType) continue;
    const targetScope = feet ? { kind: 'within' as const, feet: Number(feet) }
      : target.toLowerCase() === 'the target' ? { kind: 'target' as const } : { kind: 'area' as const };
    add(match, { kind: 'save-damage', source: match[0], targetScope,
      ability: ABILITY[ability.toLowerCase()]!, dc: Number(dc),
      average: Number(average), formula, damageType: damageType.toLowerCase(),
      halfOnSuccess: /success:\s*half damage\./iu.test(match[0]) });
  }

  const knownStatus = (name: string) => NATIVE_LIFECYCLE_STATUSES.includes(
    name.toLowerCase() as typeof NATIVE_LIFECYCLE_STATUSES[number]);
  const saveStatus = /\b(?:one|the) ([a-z]+) creature within (\d+) feet must make a (strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw:\s*DC\s*(\d+)\.\s*failure:\s*the creature is ([a-z]+) until the end of its next turn\.(?:\s*failure by (\d+) or more:\s*the creature drops to 0 hit points\.)?/giu;
  for (const match of visible.matchAll(saveStatus)) {
    const [, required, feet, ability, dc, applied, margin] = match;
    if (!required || !feet || !ability || !dc || !applied
      || !knownStatus(required) || !knownStatus(applied)) continue;
    add(match, { kind: 'save-status', source: match[0],
      requiredTargetStatus: required.toLowerCase(), withinFeet: Number(feet),
      dc: Number(dc), ability: ABILITY[ability.toLowerCase()]!,
      appliedStatus: applied.toLowerCase(), duration: 'target-next-turn-end',
      ...(margin ? { failureMarginDropToZero: Number(margin) } : {}) });
  }

  const saveDamageStatus = /\bforcing each creature within (\d+) feet of it to make a (strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw:\s*DC\s*(\d+)\.\s*failure:\s*(\d+)\s*\(([^)]+)\)\s*(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder) damage and the creature is ([a-z]+) until the end of its next turn\.?\s*success:\s*half damage\./giu;
  for (const match of visible.matchAll(saveDamageStatus)) {
    const [, feet, ability, dc, average, formula, damageType, applied] = match;
    if (!feet || !ability || !dc || !average || !formula || !damageType
      || !applied || !knownStatus(applied)) continue;
    add(match, { kind: 'save-damage-status', source: match[0],
      withinFeet: Number(feet), dc: Number(dc), ability: ABILITY[ability.toLowerCase()]!,
      average: Number(average), formula, damageType: damageType.toLowerCase(),
      appliedStatus: applied.toLowerCase(), duration: 'target-next-turn-end',
      halfOnSuccess: true });
  }

  const visibleSave = /\ba creature the ([a-z][a-z '-]*?) can see within (\d+) feet, forcing it to make a (strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw:\s*DC\s*(\d+)\.\s*failure:\s*(\d+)\s*\(([^)]+)\)\s*(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder) damage plus (\d+)\s*\(([^)]+)\)\s*(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder) damage\.\s*success:\s*half damage\./giu;
  for (const match of visible.matchAll(visibleSave)) {
    const [, viewer, feet, ability, dc, average1, formula1, type1, average2, formula2, type2] = match;
    if (!viewer || !feet || !ability || !dc || !average1 || !formula1 || !type1
      || !average2 || !formula2 || !type2) continue;
    add(match, { kind: 'visible-target-save-damage', source: match[0], viewer: viewer.trim(),
      withinFeet: Number(feet), ability: ABILITY[ability.toLowerCase()]!, dc: Number(dc),
      damages: [
        { average: Number(average1), formula: formula1, damageType: type1.toLowerCase() },
        { average: Number(average2), formula: formula2, damageType: type2.toLowerCase() },
      ], halfOnSuccess: true });
  }

  const heavy = /\b(?:one|a|the) creature (grappled|restrained) by the ([a-z][a-z '-]*?) takes (\d+) \(([^)]+)\) (acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder) damage, or half as much if (?:it|the creature|the target) is (not )?wearing heavy armou?r\./giu;
  for (const match of visible.matchAll(heavy)) {
    const [, status, grappler, average, formula, damageType, negative] = match;
    if (!status || !grappler || !average || !formula || !damageType) continue;
    add(match, { kind: 'heavy-armour-half', source: match[0],
      targetCondition: status.toLowerCase() as 'grappled' | 'restrained', grappler: grappler.trim(),
      average: Number(average), formula, damageType: damageType.toLowerCase(),
      armourNegated: Boolean(negative) });
  }

  const food = /\b(?:it|the creature|a creature) can keep solid food down only if washed down with sea water\./giu;
  for (const match of visible.matchAll(food)) add(match, { kind: 'food-retention', source: match[0],
    food: 'solid', requiredLiquid: 'sea-water', outcome: 'retain-not-vomit' });

  const choice = /\b(each creature (?:in the area|within \d+ feet(?: that can see it)?) must make an? )?(intelligence or wisdom|wisdom or intelligence) saving throw:\s*\(target['’]s choice\)\s*DC\s*(\d+)\.\s*failure:\s*(?:the creature|the target) is (frightened|charmed|grappled|restrained|blinded|stunned) for (\d+) (minute|round|hour)s?\s*\(save ends at (?:the )?(end|start|beginning) of (?:each )?turn\)\./giu;
  for (const match of visible.matchAll(choice)) {
    const [, target, , dc, status, amount, unit, timing] = match;
    if (!target || !dc || !status || !amount || !unit || !timing) continue;
    const within = /\bwithin (\d+) feet(?: (that can see it))?/iu.exec(target);
    const areaPrefix = visible.slice(0, match.index);
    const areaRanges = [...areaPrefix.matchAll(/\b(\d+)-\s*foot emanation\b/giu)];
    const area = areaRanges.at(-1);
    // The area clause must have a unique, explicit source radius. Otherwise
    // the complete target rule stays in GM prose instead of losing its range.
    if (!within && (!area?.[1] || areaRanges.length !== 1)) continue;
    const targetScope = within
      ? { kind: 'within' as const, feet: Number(within[1]), mustSeeSource: Boolean(within[2]) }
      : { kind: 'area' as const, feet: Number(area![1]), areaSource: area![0] };
    add(match, { kind: 'target-choice-save', source: match[0], targetScope, choices: ['int', 'wis'],
      dc: Number(dc), failedStatus: status.toLowerCase(),
      duration: { value: Number(amount), unit: unit.toLowerCase() as 'minute' | 'round' | 'hour' },
      repeatAt: timing.toLowerCase() === 'end' ? 'end' : 'start' });
  }

  const movement = /\bthe (target|creature) must make a (strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw:\s*DC\s*(\d+)\.\s*failure:\s*the (target|creature) is pushed (\d+)(?:\s*\(([^)]+)\))? feet away from (?:the )?([a-z][a-z '-]*)\./giu;
  for (const match of visible.matchAll(movement)) {
    const [, target, ability, dc, failureTarget, distance, formula, origin] = match;
    if (!target || !ability || !dc || !distance || !origin || target.toLowerCase() !== failureTarget?.toLowerCase()) continue;
    add(match, { kind: 'forced-movement', source: match[0], target: target.toLowerCase() as 'creature' | 'target',
      dc: Number(dc), ability: ABILITY[ability.toLowerCase()]!, distance: Number(distance),
      ...(formula ? { distanceFormula: formula } : {}), origin: origin.trim() });
  }

  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const accepted: SourceRuleFact[] = [];
  let end = -1;
  for (const item of found) {
    if (item.start < end) {
      if (item.end > end) throw new TypeError('规则来源片段交叠，须核对完整来源。');
      continue;
    }
    accepted.push(item.fact);
    end = item.end;
  }
  return accepted;
}

