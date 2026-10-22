import type { CanonicalFeature } from './types';
import {sourceActorNameMatches} from './source-subject';
import {stagedDamageLabels,stagedDamageType} from './staged-source-facts';
import {sourceManualSpellUses,sourceGmTriggeredSave,sourceFailedSaveStatuses} from '@fvtt-json-generator/models/source-rule-facts';
import {sourceOperationErrors,sourceFeatureResources,sourceOperationClauses,sourceSpellHeaderRange,sourceSpellHeaderBody,sourceOperationExistingArea,sourceOperationSelfArea,sourceHealingOperations} from '@fvtt-json-generator/models/source-operations';
import {isSourceCandidateReview,isSourceCandidateCounters} from '@fvtt-json-generator/models/source-operations';

type Facts = Partial<Pick<CanonicalFeature,'activityType'|'activationType'|'attack'|'damage'|'save'|'range'|'aoe'|'spellUseRecords'|'gmTriggeredSave'|'nativeFailureStatuses'|'healing'|'sourceOperations'>>;
const damageTypes='acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder';
const abilities:Record<string,'str'|'dex'|'con'|'int'|'wis'|'cha'>={strength:'str',dexterity:'dex',constitution:'con',intelligence:'int',wisdom:'wis',charisma:'cha',力量:'str',敏捷:'dex',体质:'con',智力:'int',感知:'wis',魅力:'cha'};
export function featureText(value:string):string{return value.replace(/[*_]/gu,'').replace(/\s+/gu,' ').trim();}
/** Actor range needs the source actor as origin. Distances around a flash,
 * target, ally or other object stay in the complete GM target rule. */
function sourceActorRangeDistance(quote:string,actorName?:string):number|undefined{
  const distance=/\b(within|range)\s+(\d+)\s*(?:feet|ft\.)/iu.exec(quote);if(!distance)return;
  if(/\b(?:not|never)\s*\(?\s*$/iu.test(quote.slice(0,distance.index)))return;
  const tail=quote.slice(distance.index+distance[0].length);
  const relative=/^\s+(?:of|from)\s+(.+?)(?=\s+(?:(?:and|but)\s+)?(?:that|who|which|while|when|if|aware|unaware|to|must|can(?:not)?|can't|can’t|makes?|takes?|hits?|has|is|are)\b|[,.;]|$)/iu.exec(tail);
  const origin=relative?.[1]?.replace(/^(?:the|an?|this|that)\s+/iu,'').trim().toLowerCase();
  const sourceOrigins=['you','yourself','it','itself'];
  if(relative){
    if(origin&&(sourceOrigins.includes(origin)||sourceActorNameMatches(origin,actorName)))return Number(distance[2]);
    // Gendered self references require both the source Actor as the acting
    // subject and the matching seeing pronoun in this same target sentence.
    // An ally/target's "her" or "him" cannot become the Actor's range.
    const subjectName=/^(.+?)\s+(?:targets?|chooses?|selects?)\b/iu.exec(quote.trim())?.[1];
    const subject=subjectName&&sourceActorNameMatches(subjectName,actorName);
    const seeing=/\b(she|he)\s+can\s+see\s*$/iu.exec(quote.slice(0,distance.index));
    if(subject&&seeing&&origin===(seeing[1]!.toLowerCase()==='she'?'her':'him'))return Number(distance[2]);
    return;
  }
  // A missing recognized preposition does not prove a missing origin.
  // Unknown spatial wording stays manual. Only a real predicate/qualifier
  // or the end of the distance proves that the source omitted its origin.
  // Published target clauses may omit both `of itself` and a relative `that`:
  // "one creature within 5 feet the sprite can see". Only this source Actor
  // can own the following sensory predicate; foreign subjects remain manual.
  const viewer=/^\s+(.+?)\s+(?:can(?:not)?|can't|can’t)\s+(?:see|hear)\b/iu.exec(tail)?.[1];
  if(viewer&&sourceActorNameMatches(viewer,actorName))return Number(distance[2]);
  const omitted=/^\s*(?:[,;]\s*)?(?:(?:and\s+)?(?:that|who|which|must|can|makes?|takes?|has|is|are)\b|[.!?。]|$)/iu.test(tail);
  return omitted||distance[1]!.toLowerCase()==='range'?Number(distance[2]):undefined;
}
/** The area may refer back only to the immediately preceding, source-owned
 * point selection. Another subject, intervening rule or unrelated number is not
 * evidence for a remote template. Raw proof strings remain unchanged. */
function sourceAdjacentPointPlacement(source:string,rangeQuote:unknown,areaQuote:string,actorName?:string):number|undefined{
  if(typeof rangeQuote!=='string'||!actorName||!/\bcentered on that point[.!]?$/iu.test(areaQuote.trim()))return;
  const clauses=sourceOperationClauses(source).map(featureText),range=featureText(rangeQuote),area=featureText(areaQuote);
  const index=clauses.indexOf(range);if(index<0||clauses.indexOf(range,index+1)>=0||clauses[index+1]!==area)return;
  const subject=/^(.*?)\s+(?:conjures?|creates?|places?)\b/iu.exec(range)?.[1];
  if(!subject||!sourceActorNameMatches(subject,actorName)||!/[\s]at a point (?:it|the creature) can see within \d+ (?:feet|ft\.)[.!]?$/iu.test(range))return;
  return sourceActorRangeDistance(range,actorName);
}
/** A physical printed title may have no stop. Its line, never a guessed
 * flattened prefix, owns the body. Presentation changes do not rewrite proof. */
function sourceFeatureBody(quote:string,name:string):string|undefined{
  const text=featureText(quote),label=featureText(name);
  if(text.startsWith(label+'.')||text.startsWith(label+'。'))return text.slice(label.length+1).trim();
  const lines=quote.trim().split(/\r\n|\n|\r/u);
  if(featureText(lines[0]??'').replace(/^#{1,6}\s*/u,'')!==label||lines.length<2)return;
  return featureText(lines.slice(1).join('\n'));
}
function sourceHealingGrants(body:string):RegExpMatchArray[]{
  return [...body.matchAll(/\b(?:regains?|gains?|receives?|restoring)\s+(?:\d+\s*\((\d+d\d+(?:\s*[+\-]\s*\d+)?)\)|((?:\d+d\d+|\d+)(?:\s*[+\-]\s*\d+)?))\s+(temporary\s+)?hit points?\b/giu)];
}
function healingClauses(body:string):Array<{clause:string;index:number;grant:RegExpMatchArray}>{
  return sourceOperationClauses(body).map(featureText).flatMap((clause,index)=>sourceHealingGrants(clause).map(grant=>({clause,index,grant})));
}
/** Timing and independent consequences do not multiply an amount. Unknown
 * same-clause arithmetic remains GM; neighbouring non-healing quantities have
 * their own scope and cannot change this grant's one printed amount. */
function fixedHealingAmountTail(clause:string,grant:RegExpMatchArray):boolean{
  const prefix=clause.slice(0,grant.index),suffix=clause.slice(grant.index!+grant[0].length).trim().replace(/[.!?。]$/u,'').trim();
  if(/\b(?:for each|for every|per|multiplied|doubled|tripled|halved)\b/iu.test(prefix))return false;
  if(!suffix)return true;
  const turn='(?:the start|the end) of [\\p{L}\\x27’ \\-]+turns?';
  const independentRider=new RegExp('^,?\\s*and (?:(?:has|gains) (?:Advantage|Disadvantage) on (?:attack rolls|saving throws|ability checks)|(?:its|the target[\\x27’]s) AC (?:increases|decreases) by \\d+)(?: until '+turn+')?$','iu');
  if(independentRider.test(suffix))return true;
  if(grant[3]&&/^that lasts? for \d+ (?:rounds?|minutes?|hours?|days?)$/iu.test(suffix))return true;
  return /^(?:when|whenever|if|while) (?:it|you) [\p{L}\p{N}'’ \-]+$/iu.test(suffix)
    &&!/\b(?:amount|heal(?:ing)?|regains?|receives?|gains?|instead|multiplied|doubled|tripled|halved|maximum|per)\b/iu.test(suffix);
}
function healingContextChangesAmount(body:string,source:string):boolean{
  // Pointed references can amend a grant in another sentence. Do not confuse
  // incoming damage exceeding someone's HP maximum with scaling this heal.
  const clauses=sourceOperationClauses(body),header=sourceSpellHeaderBody(source);
  const level=header!==undefined?/^Level (\d+)\b/u.exec(featureText(source.trim().split(/\r\n|\n|\r/u).slice(1).join(' ')))?.[1]:undefined;
  return clauses.some((clause,index)=>{
    // A complete spell's explicit base amount is independent of its separate
    // higher-slot option. Keep that option verbatim for the GM; do not choose a
    // slot, change the base formula or waive any other quantity modifier.
    const higher=/^The healing increases by \d+ for each spell slot level above (\d+)\.$/u.exec(clause);
    if(higher&&level===higher[1]&&index===clauses.length-1&&clauses[index-1]==='Using a Higher-Level Spell Slot.')return false;
    return /\b(?:(?:this|that|the|these|those) (?:amount|healing|(?:temporary )?hit points?(?!\s+maximum))|(?:your|its) healing)\b/iu.test(clause)
    ||/\bhealing\s+(?:is|becomes|equals|doubles|triples|halves|increases|decreases|scales)\b/iu.test(clause)
    ||/\b(?:heal(?:ing)?|regains?|restores?|recover(?:ed|s)?)\b/iu.test(clause)&&/\b(?:double[sd]?|twice|triple[sd]?|halve[sd]?|half|multipl(?:y|ied)|divid(?:e|ed)|scal(?:e|ed)|round(?:ed)?)\b/iu.test(clause);
  });
}
/** Shared by restoration and the validator's independent legacy-IR guard. */
export function sourceHealingAmountUnproven(quote:string):boolean{
  const text=featureText(quote),grants=healingClauses(text);
  return grants.length>1||grants.some(({clause,grant})=>!fixedHealingAmountTail(clause,grant))||!!grants.length&&healingContextChangesAmount(text,quote);
}
function sourceHealingBody(quote:string,name:string):string|undefined{
  const raw=sourceFeatureBody(quote,name);if(raw===undefined)return;
  const first=sourceSpellHeaderBody(quote);
  return first!==undefined?[first,...sourceOperationClauses(raw).slice(1)].join(' ')
    :raw.replace(/^(?:Potion|Rod|Staff|Wand|Ring|Scroll|Wondrous Item|Weapon|Armor),\s*(?:Very Rare|Uncommon|Common|Rare|Legendary|Artifact)(?:\s*\([^)]*\))?\s+/iu,'');
}
function sourceHealingAura(clauses:string[]):number|undefined{
  const own=/^An aura radiates from you in a (\d+)[\s\-\u2010-\u2015]+foot Emanation for the duration\.$/u.exec(clauses[0]??'');
  return own?Number(own[1]):undefined;
}
/** Source-derived GM-operated fixed healing. Conditions, target eligibility,
 * expiry and other consequences stay complete prose, never automatic effects. */
export function sourceFixedHealing(quote:string,name:string,actorName?:string):CanonicalFeature['healing']|undefined{
  return sourceFixedHealingFacts(quote,name,actorName)?.healing;
}
function sourceFixedHealingFacts(quote:string,name:string,actorName?:string):Pick<Facts,'healing'|'activationType'>|undefined{
  const body=sourceHealingBody(quote,name);if(body===undefined)return;
  const clauses=sourceOperationClauses(body).map(featureText),grants=healingClauses(body);
  if(grants.length!==1||sourceHealingAmountUnproven(quote))return;
  const {clause,index,grant}=grants[0]!,prefix=clause.slice(0,grant.index).trim(),previous=clauses[index-1];
  if(/\b(?:cannot|can't|can’t|does not|doesn't|doesn’t|never|instead of|prevents?|lose[sd]?)\b/iu.test(prefix))return;
  let target:NonNullable<CanonicalFeature['healing']>['target'];
  let activationType:CanonicalFeature['activationType'];
  const choice=/^(.+?) or one creature of its choice that can (?:see(?: or hear)?|hear(?: or see)?) it$/iu.exec(prefix);
  if(choice&&sourceActorNameMatches(choice[1]!,actorName))target={type:'creature',count:1,special:prefix};
  else if(/^(?:you|yourself)$/iu.test(prefix)||sourceActorNameMatches(prefix,actorName)){
    const conditional=/\b(?:when|whenever|if|while) (?:it|you)\b/iu.test(clause.slice(grant.index!+grant[0].length));
    let special=conditional?clause:prefix;
    const event=/\bwhen it ([\p{L}]+)\b/iu.exec(clause.slice(grant.index!+grant[0].length))?.[1];
    if(event&&previous){
      const ownEvent=new RegExp('\\b([\\p{L}\\x27’\\-]+)\\s+'+event+'\\b','giu');
      if([...previous.matchAll(ownEvent)].some(match=>sourceActorNameMatches(match[1]!,actorName)))special=previous+' '+clause;
    }
    target={type:'self',count:1,special};
  }else if((/^the target$/iu.test(prefix)||/^[\p{L}'’ -]+ (?:washes|flows|surges) through the target,$/u.test(prefix))&&previous){
    const selected=/^(.+?) (?:targets?|chooses?|selects?) itself or one creature it can see within (\d+) (?:feet|ft\.) of itself\.$/iu.exec(previous);
    if(selected&&sourceActorNameMatches(selected[1]!,actorName)&&sourceActorRangeDistance(previous,actorName)===Number(selected[2]))target={type:'creature',count:1,special:previous};
    else if(index===1&&sourceSpellHeaderBody(quote)!==undefined&&/^Choose a creature that you can see within range\.$/u.test(previous))target={type:'creature',count:1,special:previous};
  }else{
    const conditional=/^If (.+?) has [^,]+, it uses ([\p{Lu}\p{Lt}][\p{L}'’ \-]+) and$/u.exec(prefix);
    if(conditional&&sourceActorNameMatches(conditional[1]!,actorName))target={type:'self',count:1,special:conditional[1]!};
    const selfTrigger=/^((?:If|When|Whenever) you [^,]+), you$/iu.exec(prefix);
    if(selfTrigger)target={type:'self',count:1,special:/\bdrink\b/iu.test(selfTrigger[1]!)?selfTrigger[1]!:clause};
    // Source-derived: only the action that directly owns this proven healing
    // grant supplies timing. A trigger or a neighbouring action cannot lend it.
    const ownAction=/^(?:(?:While wearing|While holding) [\p{L}'’ -]+, )?you (?:can|may) take an? (Magic |Bonus )?action to$/iu.exec(prefix);
    if(ownAction){target={type:'self',count:1,special:clause};activationType=ownAction[1]?.trim().toLowerCase()==='bonus'?'bonus':'action';}
    if(/^If an ally with 0 Hit Points starts its turn in the aura, that ally$/u.test(prefix)&&sourceHealingAura(clauses)!==undefined)target={type:'creature',count:1,special:clause};
  }
  if(!target)return;
  return {healing:{formula:(grant[1]??grant[2])!.replace(/\s+/gu,''),type:grant[3]?'temphp':'healing',target},...(activationType?{activationType}:{})};
}
/** A complete damage sentence can be followed by a separately conditional
 * movement/status rider. An incomplete qualifier or any damage reference is
 * deliberately not evidence that the preceding additional damage is native. */
function independentChineseNonDamageRider(tail:string):boolean{
  const clause=/^\s*[。.]\s*((?:如果|若|当)[^。.]+)(?:[。.]|$)/u.exec(tail)?.[1];
  return !!clause&&!/伤害|生命值|掷骰|豁免|检定|额外|上述|此次|该次|相同/u.test(clause)
    &&/[,，]\s*(?:则)?\s*(?:目标|该生物|该目标)(?:被(?:拉入|推离|推动|移动|移至)|陷入|获得)/u.test(clause);
}
/** Field-level reasons shared by acceptance and the ordinary repair request.
 * A valid OP does not authorize an additional legacy executable projection. */
export function sourceOperationFeatureErrors(feature:CanonicalFeature,actorName?:string,sharedLegendaryCost?:number):Array<{field:string;message:string}>{
  const errors:Array<{field:string;message:string}>=[];
  const allowed=['executionMode','nativeRuleText','manualRemainder','name','englishName','sourceQualifier','description','evidence','activityType','activationType','activationCondition','uses','recharge','legendaryCost','sourceOperations','sourceContext','sourceFeatureId','candidateReview','candidateCounters'];
  if(feature.candidateReview!==undefined&&!isSourceCandidateReview(feature.candidateReview))errors.push({field:'candidateReview',message:'Candidate review metadata must have its closed inert data shape; it cannot add executable carrier fields.'});
  if(feature.candidateCounters!==undefined&&(!isSourceCandidateReview(feature.candidateReview)||!isSourceCandidateCounters(feature.candidateCounters)))errors.push({field:'candidateCounters',message:'Manual candidate counters require a valid review record and closed name/count/recovery data.'});
  for(const field of Object.keys(feature).filter(key=>!allowed.includes(key)))errors.push({field,message:field==='appliedConditions'
    ?'This legacy automatic condition field is not supported with sourceOperations. Remove only appliedConditions; retain the complete consequence, duration and timing in description/manualRemainder for the GM.'
    :'This legacy or unknown feature field cannot execute alongside sourceOperations. Keep supported mechanics on their source-proven OP; do not remove the complete source consequence.'});
  if(feature.activityType!=='utility')errors.push({field:'activityType',message:'A sourceOperations carrier must use activityType utility; each OP retains its own executable type.'});
  for(const field of ['nativeRuleText','manualRemainder'] as const)if(feature[field]!==feature.description)errors.push({field,message:'This sourceOperations carrier must retain the complete original description in this field.'});
  if(feature.sourceContext!==undefined&&(!Array.isArray(feature.sourceContext)||feature.sourceContext.some(context=>typeof context!=='string'||!context.trim())))errors.push({field:'sourceContext',message:'Shared context must be an array of complete nonempty source strings.'});
  const resources=sourceFeatureResources(feature.name,feature.description,actorName);
  if(resources.legendaryCost===undefined&&sharedLegendaryCost!==undefined)resources.legendaryCost=sharedLegendaryCost;
  for(const field of ['uses','recharge','legendaryCost'] as const)if(JSON.stringify(feature[field])!==JSON.stringify(resources[field]))errors.push({field,message:'This resource must exactly match the complete source feature heading, including its count and recovery.'});
  let rangeProofErrors:string[]|undefined;
  for(const [index,op]of (Array.isArray(feature.sourceOperations)?feature.sourceOperations:[]).entries()){
    if(!actorName||!op||typeof op!=='object')continue;
    if(op.damageAdjustment&&(typeof op.damageAdjustment.actor!=='string'||!sourceActorNameMatches(op.damageAdjustment.actor,actorName)))errors.push({field:`sourceOperations/${index}/damageAdjustment/actor`,message:'Conditional outgoing damage must bind the source Actor, not a target or another creature.'});
    let ownedHeaderRange:number|undefined;
    if(op.range!==undefined&&typeof op.proof?.range==='string'){
      const actorRange=sourceActorRangeDistance(op.proof.range,actorName),headerRange=sourceSpellHeaderRange(feature.description,op.proof.range);
      // A complete spell header supplies a literal range fact, not this OP's
      // ownership. Keep the shared model's range/proof scope check independent;
      // unrelated damage findings must not become false Actor-origin errors.
      ownedHeaderRange=headerRange!==undefined&&!(rangeProofErrors??=sourceOperationErrors(feature.description,feature.sourceOperations))
        .some(error=>error===`${index}/shape`||error===`${index}/sourceText`||error===`${index}/proof`||error===`${index}/proof/range`||error===`${index}/range`||error.startsWith(`${index}/range/`))?headerRange:undefined;
      if((actorRange??ownedHeaderRange)!==op.range)errors.push({field:`sourceOperations/${index}/range`,message:'An Actor range cannot borrow a distance measured from a target, effect or another object.'});
    }
    // A remote template must retain its separately printed placement range;
    // omitting it would silently turn an effect at a point into a self area.
    const areaQuote=op.proof?.aoe;
    if(op.aoe&&typeof areaQuote==='string'&&/\bpoint\b|\bwithin\s+\d+\s*(?:feet|ft\.)/iu.test(areaQuote)){
      // New shared placement/reuse facts supplement, rather than weaken,
      // the old Actor-origin and adjacent-point evidence. A later area still
      // needs its own source event; missing range alone proves nothing.
      const modelProven=(rangeProofErrors??=sourceOperationErrors(feature.description,feature.sourceOperations)).length===0;
      const existingArea=op.range===undefined&&modelProven?sourceOperationExistingArea(feature.description,feature.sourceOperations!,index):undefined;
      const placement=sourceActorRangeDistance(areaQuote,actorName)??sourceAdjacentPointPlacement(feature.description,op.proof?.range,areaQuote,actorName)
        ??(modelProven?ownedHeaderRange:undefined);
      const ownEmanation=op.aoe.shape==='radius'&&(/^(?:Each|Every|Any) creature within \d+ (?:feet|ft\.) of /iu.test(areaQuote.trim())&&placement===op.aoe.radius
        ||modelProven&&sourceOperationSelfArea(feature.description,op,actorName));
      if(ownEmanation&&op.range!==undefined)errors.push({field:`sourceOperations/${index}/range`,message:'The source Actor is this emanation centre; its radius is not a remote placement range.'});
      if(!existingArea&&!ownEmanation&&(placement===undefined||op.range!==placement))errors.push({field:`sourceOperations/${index}/range`,message:'A remote area needs its source-proven placement range; it cannot become a self-centred template.'});
    }
  }
  return errors;
}
export function mixedFeatureSourceMatches(feature:CanonicalFeature,section?:string,actorName?:string,sharedLegendaryCost?:number):boolean{
  if(feature.sourceOperations!==undefined)return !sourceOperationFeatureErrors(feature,actorName,sharedLegendaryCost).length&&!sourceOperationErrors(feature.description,feature.sourceOperations,feature.sourceContext).length;
  const allowed=['executionMode','nativeRuleText','manualRemainder','name','englishName','sourceQualifier','description','evidence','activityType','activationType','activationCondition','attack','damage','save','range','aoe','uses','recharge','legendaryCost','spellUseRecords','gmTriggeredSave','nativeFailureStatuses','healing','sourceFeatureId'];
  if(Object.keys(feature).some(key=>!allowed.includes(key)))return false;
  // Canonicalization may split a printed resource/qualifier suffix off the
  // feature name. Prove the same heading before recovering that exact label;
  // the body or a different ability must never lend a resource or prefix.
  const printed=featureText(sourceOperationClauses(feature.description)[0]??'').replace(/[。.]$/u,'');
  const bare=printed.replace(/\s*[（(][^）)]*[）)]\s*$/u,'').trim();
  const label=featureText(feature.name)===bare?printed:feature.name;
  const derived=stagedFeatureMechanics(feature.description,label,actorName);
  if(!feature.nativeRuleText||!feature.manualRemainder)return false;
  const stable=(value:any):string=>JSON.stringify(value,(_key,entry)=>entry&&typeof entry==='object'&&!Array.isArray(entry)?Object.fromEntries(Object.keys(entry).sort().map(key=>[key,entry[key]])):entry);
  if(derived){
    if(feature.nativeRuleText!==derived.nativeRuleText||feature.manualRemainder!==(derived.manualRemainder||feature.description.trim()))return false;
    for(const key of ['activityType','attack','damage','save','range','aoe','spellUseRecords','gmTriggeredSave','nativeFailureStatuses','healing'] as const){
      // Formula whitespace is presentation. Keep all other Heal fields and
      // nested eligibility keys in the same exact source comparison.
      const actual=key==='healing'&&feature.healing&&typeof feature.healing.formula==='string'?{...feature.healing,formula:feature.healing.formula.replace(/\s+/gu,'')}:feature[key];
      if(stable(actual)!==stable(derived.facts[key]))return false;
    }
  }else if(feature.activityType!=='utility'||feature.nativeRuleText!==label+'.'||feature.manualRemainder!==feature.description.trim()||!feature.uses&&!feature.recharge||feature.attack||feature.damage||feature.save||feature.healing||feature.aoe||feature.range!==undefined)return false;
  if(feature.appliedConditions)return false;
  const resources=sourceFeatureResources(feature.name,feature.description,actorName);
  const {uses,recharge}=resources,legendaryCost=resources.legendaryCost??sharedLegendaryCost;
  const prefix=featureText(feature.description).slice(featureText(label).length+1).trim();
  const override=/^As (?:an?|its) (bonus action|reaction|action),/iu.exec(prefix)?.[1]?.toLowerCase();
  const activation=derived?.facts.activationType??(override?override==='bonus action'?'bonus':override
    :({traits:undefined,actions:'action',bonusActions:'bonus',reactions:'reaction',legendaryActions:'legendary',mythicActions:'legendary'} as Record<string,string|undefined>)[section??'']);
  return stable(feature.uses)===stable(uses)&&stable(feature.recharge)===stable(recharge)
    &&feature.legendaryCost===legendaryCost&&feature.activationCondition===undefined
    &&(!section||feature.activationType===activation);
}

/** Source-derived primary-operation grammar, independent of creature/ability
 * names. It consumes only the primary operation; its unconsumed tail is never
 * interpreted as unconditional damage, effects, or an additional immediate Save. */
export function stagedFeatureMechanics(quote:string,name:string,actorName?:string):{facts:Facts;nativeRuleText:string;manualRemainder:string}|undefined{
  const label=featureText(name),body=sourceFeatureBody(quote,name);
  if(body===undefined)return;
  const healingOperations=sourceHealingOperations(quote);
  if(healingOperations)return{facts:{activityType:'utility',sourceOperations:healingOperations},nativeRuleText:quote.trim(),manualRemainder:quote.trim()};
  const healingFacts=sourceFixedHealingFacts(quote,name,actorName),healing=healingFacts?.healing;
  if(healing){
    let range=healing.target?.type==='creature'?sourceActorRangeDistance(healing.target.special,actorName):undefined;
    if(healing.target?.type==='creature'&&range===undefined){
      const body=sourceHealingBody(quote,name),clauses=body===undefined?[]:sourceOperationClauses(body).map(featureText);
      if(healing.target.special===clauses[0]&&/^Choose a creature that you can see within range\.$/u.test(healing.target.special))range=sourceSpellHeaderRange(quote,sourceOperationClauses(quote)[0]??'');
      else if(/^If an ally with 0 Hit Points starts its turn in the aura,/u.test(healing.target.special))range=sourceHealingAura(clauses);
    }
    return{facts:{activityType:'heal',...healingFacts,...(range!==undefined?{range}:{})},nativeRuleText:quote.trim(),manualRemainder:quote.trim()};
  }
  const spellUses=sourceManualSpellUses(quote);
  if(spellUses)return{facts:{activityType:'utility',spellUseRecords:spellUses.records},nativeRuleText:spellUses.ruleText,manualRemainder:quote.trim()};
  const chineseType=stagedDamageLabels.join('|');
  const chinese=new RegExp('^(?<kind>近战或远程|近战|远程)(?<category>法术|武器)?攻击(?:检定)?[:：]\\s*(?:命中\\s*)?(?<bonus>[+\\-−–]?\\d+)[,，]\\s*(?:触及\\s*(?<reach>\\d+)\\s*尺(?:\\s*或射程\\s*(?<range>\\d+)(?:[\\/／](?<long>\\d+))?\\s*尺)?|射程\\s*(?<ranged>\\d+)(?:[\\/／](?<rangedLong>\\d+))?\\s*尺)(?:[,，]\\s*(?:单一|单个|一个|一名)(?:目标|生物))?[。.]\\s*命中[:：]\\s*\\d+\\s*[（(](?<formula>\\d+d\\d+(?:\\s*[+\\-−–]\\s*\\d+)?)[)）]\\s*(?:的)?(?<damageType>'+chineseType+')伤害','iu').exec(body);
  if(chinese?.groups){
    const g=chinese.groups,hybrid=g.kind==='近战或远程',ranged=g.kind==='远程';
    if(hybrid&&(!g.reach||!g.range)||!hybrid&&!!g.reach===ranged||!hybrid&&g.range)return;
    const normalizeFormula=(s:string)=>s.replace(/\s+/gu,'').replace(/[−–]/gu,'-');
    const attack:NonNullable<CanonicalFeature['attack']>={type:((ranged?'r':'m')+(g.category==='法术'?'s':'w')+'ak') as 'mwak'|'rwak'|'msak'|'rsak',toHit:Number(g.bonus!.replace(/[−–]/gu,'-')),
      ...(g.reach?{reach:Number(g.reach)}:{}),...(g.range||g.ranged?{range:Number(g.range??g.ranged)}:{}),...(g.long||g.rangedLong?{longRange:Number(g.long??g.rangedLong)}:{})};
    const damage:NonNullable<CanonicalFeature['damage']>=[{formula:normalizeFormula(g.formula!),type:stagedDamageType(g.damageType!)!,relationship:'base'}];
    let consumed=chinese[0].length;
    const extra=new RegExp('^[,，]?\\s*(?:外加|额外加上)\\s*\\d+\\s*[（(](?<formula>\\d+d\\d+(?:\\s*[+\\-−–]\\s*\\d+)?)[)）]\\s*(?:的)?(?<first>'+chineseType+')(?:或(?<second>'+chineseType+'))?伤害(?:[（(]由[^)）]+选择[)）])?','iu');
    const qualified=(tail:string)=>/^\s*[（(]?\s*(?:如果|若|仅当|除非|当)/u.test(tail);
    if(qualified(body.slice(consumed)))return;
    for(let part=extra.exec(body.slice(consumed));part;part=extra.exec(body.slice(consumed))){
      const tail=body.slice(consumed+part[0].length),secondary=sourceGmTriggeredSave(quote);
      const separateSave=/^\s*[。.]/u.test(tail)&&secondary&&featureText(tail).replace(/^[。.]\s*/u,'').startsWith(featureText(secondary.trigger));
      if(/^\s*[,，。.]?\s*[（(]?\s*(?:如果|若|仅当|除非|当)/u.test(tail)&&!separateSave&&!independentChineseNonDamageRider(tail))break;
      const p=part.groups!,first=stagedDamageType(p.first!)!,second=p.second?stagedDamageType(p.second):undefined;
      damage.push({formula:normalizeFormula(p.formula!),type:first,...(second&&second!==first?{types:[first,second]}:{}),relationship:'additional'});consumed+=part[0].length;
    }
    const gmTriggeredSave=sourceGmTriggeredSave(quote);
    return{facts:{activityType:'attack',attack,damage,...(gmTriggeredSave?{gmTriggeredSave}:{})},nativeRuleText:label+'. '+body.slice(0,consumed)+'.',manualRemainder:body.slice(consumed).replace(/^[。.\s]+/u,'')||'GM selects eligible targets using the complete source rule.'};
  }
  const attack=new RegExp('^(Melee|Ranged) (?:(Weapon|Spell) )?Attack(?: Roll)?:\\s*([+\\-]?\\d+)(?: to hit)?,\\s*(?:reach (\\d+) ft\\.|range (\\d+)(?:\\/(\\d+))? ft\\.)(?:,?\\s*(?:one|a|an) (?:target|creature|object)\\.)?\\s*Hit:\\s*\\d+\\s*\\((\\d+d\\d+(?:\\s*[+\\-]\\s*\\d+)?)\\)\\s*('+damageTypes+') damage','iu').exec(body);
  if(attack){
    const parts:NonNullable<CanonicalFeature['damage']>=[{formula:attack[7]!.replace(/\s+/gu,''),type:attack[8]!.toLowerCase(),relationship:'base'}];
    let consumed=attack[0].length;
    const extra=new RegExp('^(?:,?\\s+plus)\\s+\\d+\\s*\\((\\d+d\\d+(?:\\s*[+\\-]\\s*\\d+)?)\\)\\s*('+damageTypes+') damage','iu');
    for(let m=extra.exec(body.slice(consumed));m;m=extra.exec(body.slice(consumed))){
      if(/^\s*[,\.]?\s*(?:if|unless|only|while|when|against)\b/iu.test(body.slice(consumed+m[0].length)))break;
      parts.push({formula:m[1]!.replace(/\s+/gu,''),type:m[2]!.toLowerCase(),relationship:'additional'});consumed+=m[0].length;
    }
    const rawTail=body.slice(consumed),rest=rawTail.replace(/^[.\s]+/u,'');
    // A condition qualifying this same damage clause is not an independent
    // rider. Retain it manual instead of assuming the printed damage always applies.
    if(/^\s*(?:,?\s*)(?:only if|if|unless|while|when|against)\b/iu.test(rawTail))return;
    const gmTriggeredSave=sourceGmTriggeredSave(quote);
    return {facts:{activityType:'attack',...(gmTriggeredSave?{gmTriggeredSave}:{}),attack:{type:((attack[1]!.toLowerCase()==='melee'?'m':'r')+(attack[2]?.toLowerCase()==='spell'?'s':'w')+'ak') as 'mwak'|'rwak'|'msak'|'rsak',
      toHit:Number(attack[3]),...(attack[4]!==undefined?{reach:Number(attack[4])}:{range:Number(attack[5]),...(attack[6]?{longRange:Number(attack[6])}:{})})},damage:parts},
      nativeRuleText:label+'. '+body.slice(0,consumed)+'.',manualRemainder:rest};
  }
  const chineseSaves=[...body.matchAll(/(力量|敏捷|体质|智力|感知|魅力)豁免(?:检定)?\s*[:：]\s*DC\s*(\d+)/gu)];
  if(chineseSaves.length===1&&!/(?:力量|敏捷|体质|智力|感知|魅力)\s*或\s*(?:力量|敏捷|体质|智力|感知|魅力)/u.test(body)){
    const m=chineseSaves[0]!,prefix=body.slice(0,m.index),end=m.index!+m[0].length;
    // A separate introductory operation remains GM work. Never promote a
    // condition/turn trigger into an unconditional Save or use its movement
    // distance as the Save's range.
    if(prefix&&(!/[。.]\s*$/u.test(prefix)||/如果|若|仅当|除非|每当|回合|轮|之后|之前|才(?:能|可)|\b(?:if|when|while|after|before)\b/iu.test(prefix)))return;
    const facts:Facts={activityType:'save',save:{ability:abilities[m[1]!]!,dc:Number(m[2]),dcSourceKind:'literal',outcome:'none'}};
    const target=body.slice(end).split(/失败\s*[:：]/u)[0]!;
    const cone=/(\d+)尺\s*锥状(?:区域)?/u.exec(target);
    if(cone&&!/点|地点/u.test(target))facts.aoe={shape:'cone',radius:Number(cone[1])};
    const failure=new RegExp('失败\\s*[:：]\\s*\\d+\\s*[（(](\\d+d\\d+(?:\\s*[+\\-]\\s*\\d+)?)[）)]\\s*('+chineseType+')伤害','u').exec(body.slice(end));
    const success=/成功\s*[:：]\s*(仅半伤|半伤|无伤害|无效应)[。.]/u.exec(body.slice(end));
    if(failure&&success){
      const tail=body.slice(end+failure.index+failure[0].length);
      if(!/^\s*[（(]?\s*(?:如果|若|仅当|除非|当)/u.test(tail)){
        facts.damage=[{formula:failure[1]!.replace(/\s+/gu,''),type:stagedDamageType(failure[2]!)!,relationship:'base'}];
        facts.save!.outcome=/半伤/u.test(success[1]!)?'half':'none';
      }
    }
    return{facts,nativeRuleText:label+'. '+m[0]+(facts.damage?' '+failure![0]+'。'+success![0]:''),manualRemainder:(prefix+' '+body.slice(end)).trim()};
  }
  const saves=[...body.matchAll(/\b(?:DC\s*(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw|(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+Saving Throw:\s*DC\s*(\d+))/giu)];
  if(saves.length!==1||/\b(?:Intelligence|Wisdom|Strength|Dexterity|Constitution|Charisma)\s+or\s+(?:Intelligence|Wisdom|Strength|Dexterity|Constitution|Charisma)\b/iu.test(body))return;
  const save=saves[0]!,prefix=body.slice(0,save.index!);
  if(/\b(?:if|when|whenever|while|after|before|at the (?:start|end)|reduced to)\b/iu.test(prefix))return;
  const end=save.index!+save[0].length;
  const facts:Facts={activityType:'save',save:{dc:Number(save[1]??save[4]),ability:abilities[(save[2]??save[3])!.toLowerCase()]!,dcSourceKind:'literal',outcome:'none'}};
  const failedStatuses=sourceFailedSaveStatuses(body.slice(end));if(failedStatuses.length)facts.nativeFailureStatuses=failedStatuses;
  // Distance must belong to the saving creature's target clause. A prior
  // teleport/movement sentence does not give the subsequent Save that range.
  const targetClause=/(?:Each|Every|Any|One|The) (?:target|creature)[^.]*$/iu.exec(prefix)?.[0]??'';
  const ownName=actorName?.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  const shortName=actorName?.trim().split(/\s+/u).at(-1)?.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  const distance=sourceActorRangeDistance(targetClause,actorName);if(distance!==undefined)facts.range=distance;
  // Only the source actor (or an explicit self pronoun) proves an emanation.
  // A point, target, ally or unknown noun must not become a self-centered area.
  const origins=['you','itself',...(ownName?['the '+ownName]:[])].join('|');
  const centered=new RegExp('^(?:Each|Every) creature within (\\d+) (?:feet|ft\\.) of (?:'+origins+')(?=\\s*(?:that\\b|must\\b|[,.;]|$))','iu').exec(prefix);
  if(centered){facts.aoe={shape:'radius',radius:Number(centered[1])};delete facts.range;}
  // A described cloud can have an explicit source actor before "forcing".
  // Short statblock self references use the creature name's final noun; an
  // ally, target or unknown origin cannot match that source identity.
  const sourceNames=[ownName,shortName].filter(Boolean).join('|');
  const emitted=sourceNames?new RegExp('\\bfrom the (?:'+sourceNames+'), forcing each creature within (\\d+) (?:feet|ft\\.) of (?:it|itself) to make (?:a|an)\\s*$','iu').exec(prefix):undefined;
  if(emitted){facts.aoe={shape:'radius',radius:Number(emitted[1])};delete facts.range;}
  const sphere=/\b(?:Each|Every) creature in a (\d+)[\s\-\u2010-\u2015]+foot radius Sphere within (\d+) feet\b/iu.exec(prefix);
  if(sphere){facts.aoe={shape:'sphere',radius:Number(sphere[1])};facts.range=Number(sphere[2]);}
  const cones=[...prefix.matchAll(/\b(\d+)[\s\-\u00ad\u2010-\u2015]+foot\s+cone\b/giu)];
  if(cones.length===1&&!/\bpoint\b/iu.test(prefix))facts.aoe={shape:'cone',radius:Number(cones[0]![1])};
  let native=(targetClause||prefix)+save[0],rest=body.slice(end).trim();
  const failure=new RegExp('^(?:\\.\\s*(?:Failure:|On (?:a )?(?:failure|failed save),?\\s*(?:it |the target )?(?:takes? )?)|\\s*,?\\s*(?:taking|or (?:take|takes)|and takes|on a failed save,?))\\s*(?:\\d+\\s*\\()?([0-9]+d[0-9]+(?:\\s*[+\\-]\\s*\\d+)?)(?:\\))?\\s*('+damageTypes+') damage','iu').exec(body.slice(end));
  if(failure){
    let consumed=failure[0].length;
    const parts:NonNullable<CanonicalFeature['damage']>=[{formula:failure[1]!.replace(/\s+/gu,''),type:failure[2]!.toLowerCase(),relationship:'base'}];
    const extra=new RegExp('^\\s+plus\\s+\\d+\\s*\\((\\d+d\\d+(?:\\s*[+\\-]\\s*\\d+)?)\\)\\s*('+damageTypes+') damage','iu');
    for(let part=extra.exec(body.slice(end+consumed));part;part=extra.exec(body.slice(end+consumed))){
      if(/^\s*[,\.]?\s*(?:if|unless|only|while|when|against)\b/iu.test(body.slice(end+consumed+part[0].length)))break;
      parts.push({formula:part[1]!.replace(/\s+/gu,''),type:part[2]!.toLowerCase(),relationship:'additional'});consumed+=part[0].length;
    }
    const tail=body.slice(end+consumed);
    // Conditional qualifiers attached to the damage block remain literal.
    const basicSave=()=>({facts,nativeRuleText:label+'. '+native,manualRemainder:body.slice(end).trim()});
    if(/^\s*(?:,?\s*)(?:if|unless|only|while|when|against)\b/iu.test(tail))return basicSave();
    const success=/\bSuccess:\s*(Half(?: as much)? damage|No damage|No effect)(?:\.|$)/iu.exec(tail)
      ??/^\s*(?:on (?:a )?failed save\s*,?\s*)?,?\s*(?:or )?(half)(?: as much)?(?: damage)? on (?:a )?(?:success|successful (?:one|save))(?:\.|$)/iu.exec(tail);
    if(/\bSuccess\s*:|\b(?:successful|half)\b/iu.test(tail)&&!success)return basicSave();
    facts.damage=parts;
    facts.save!.outcome=success&&/^half/iu.test(success[1]!)?'half':'none';
    native+='.'+body.slice(end,end+consumed).replace(/^\./u,'')+(success?' '+success[0]:'');
    rest=tail.replace(success?.[0]??'\u0000','').replace(/^[.\s]+/u,'');
  }
  return {facts,nativeRuleText:label+'. '+native,manualRemainder:rest||'GM selects eligible targets and adjudicates the complete source rule.'};
}
