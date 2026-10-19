import { explicitSourceSaves } from './save-evidence';
import { explicitMovementHoverEvidence } from './movement-evidence';
import { completeSourceFeatureEvidence, sourceCompletenessFindings, sourceRuleText, sourceSharedTargetBindings } from './source-completeness';
import type { MonsterIntakeIR, EvidenceRef, CanonicalFeature } from './types';
import { localizationFormulaSpans } from '@fvtt-json-generator/contracts/localization';
import { parseSupportedRuleFacts } from '@fvtt-json-generator/models/source-rule-facts';
import {sourceOperationErrors} from '@fvtt-json-generator/models/source-operations';
import type { SourceRuleFact } from '@fvtt-json-generator/models/action';
import {sourceStatHeader} from './staged-source';
import {unmarkStagedHeader,sourceLanguageNotes,completeSourceHeaderIdentity} from './staged-source-facts';

const SOURCE_DAMAGE_TYPE = 'acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder';
const SOURCE_SAVE_ABILITY: Record<string, NonNullable<CanonicalFeature['save']>['ability']> = {
  strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int',
  wisdom: 'wis', charisma: 'cha',
};
function compactRule(value: string): string { return value.toLowerCase().replace(/\s+/gu, ' ').trim(); }
function formulaIdentity(value: string): string {
  let identity = localizationFormulaSpans(value).map(span => span.signature).join(',')
    || value.replace(/\s+/gu, '').replace(/[xX×*]/gu, '*').toLowerCase();
  while (identity.startsWith('(') && identity.endsWith(')')) {
    let depth = 0;
    let enclosesAll = true;
    for (let index = 0; index < identity.length; index++) {
      depth += identity[index] === '(' ? 1 : identity[index] === ')' ? -1 : 0;
      if (depth === 0 && index < identity.length - 1) { enclosesAll = false; break; }
    }
    if (!enclosesAll || depth !== 0) break;
    identity = identity.slice(1, -1);
  }
  return identity;
}
const STAGED_SOURCE_BRANCH = /second failure|failure by \d+ or more|第二次失败|失败.{0,12}(?:至少|或更多)|若.{0,24}(?:已|已经).{0,24}则改为/iu;

function exactFeatureEvidence(feature: CanonicalFeature, path: string, ir: MonsterIntakeIR,
  source: string, scope: { start: number; end: number }, includeChildClaims = true): EvidenceRef[] {
  const refs = [
    ...(Array.isArray(feature.evidence) ? feature.evidence : []),
    ...(completeSourceFeatureEvidence(source,ir,feature,path,scope) ? [completeSourceFeatureEvidence(source,ir,feature,path,scope)!] : []),
    ...ir.claims.filter(claim => claim.path === path
      || includeChildClaims && claim.path.startsWith(path + '/'))
      .flatMap(claim => Array.isArray(claim.evidence) ? claim.evidence : []),
  ].filter(ref => Number.isInteger(ref?.start) && Number.isInteger(ref?.end)
    && ref.start >= scope.start && ref.end <= scope.end && ref.end > ref.start
    && source.slice(ref.start, ref.end) === ref.quote)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: EvidenceRef[] = [];
  for (const ref of refs) {
    const last = merged.at(-1);
    if (last && ref.start <= last.end) {
      last.end = Math.max(last.end, ref.end);
      last.quote = source.slice(last.start, last.end);
    } else merged.push({ start: ref.start, end: ref.end, quote: ref.quote });
  }
  return merged;
}

/** Compare independently evidenced source mechanics to the actual IR fields consumed by generation. */
function structuredRuleConflict(feature: CanonicalFeature, evidence: string,
  facts: readonly SourceRuleFact[], manualConditional = false): string | undefined {
  const expectedSaves = facts.flatMap(fact => {
    if ('dc' in fact && 'ability' in fact)
      return [{ dc: fact.dc, ability: fact.ability }];
    return [];
  });
  for (const match of evidence.matchAll(/\b(strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw:\s*DC\s*(\d+)\b/giu)) {
    expectedSaves.push({ dc: Number(match[2]), ability: SOURCE_SAVE_ABILITY[match[1]!.toLowerCase()]! });
  }
  if (expectedSaves.length && !manualConditional) {
    const unique = [...new Set(expectedSaves.map(save => save.dc + ':' + save.ability))];
    if (unique.length !== 1 || !feature.save || feature.save.dc !== expectedSaves[0]!.dc
      || feature.save.ability !== expectedSaves[0]!.ability)
      return 'save DC or ability is missing or conflicts with the complete source rule';
  }

  const damage = [...evidence.matchAll(new RegExp(
    '\\b\\d+\\s*\\(([^)]+)\\)\\s*(' + SOURCE_DAMAGE_TYPE + ')\\b(?:\\s+damage)?', 'giu'))];
  if (damage.length && !manualConditional) {
    const declinedEnd=/\bWhenever (.+?), it can choose to fail and end this effect\. If it does not, it takes \d+\s*\([^)]+\)\s*\w+ damage\./iu.exec(sourceRuleText(evidence));
    const expected = damage.map((match, index) => {
      const between = index ? evidence.slice(damage[index - 1]!.index! + damage[index - 1]![0].length, match.index) : '';
      const relationship = index === 0 ? declinedEnd&&damage.length===1?'conditional':'base' : /\bplus\b/iu.test(between) ? 'additional'
        : /\bor\b/iu.test(between) ? 'replacement' : 'unknown';
      return { formula: formulaIdentity(match[1]!), type: match[2]!.toLowerCase(), relationship };
    });
    if (expected.some(part => part.relationship === 'unknown'))
      return 'source damage relationship needs review';
    const actual = (feature.damage ?? []).map(part => ({ formula: formulaIdentity(part.formula),
      type: part.type.toLowerCase(), relationship: part.relationship }));
    if (JSON.stringify(expected) !== JSON.stringify(actual))
      return 'damage count, formula, type or relationship is missing or conflicts with source';
    if(declinedEnd&&sourceRuleText(feature.damage?.[0]?.condition??'')!==sourceRuleText(declinedEnd[0])
      &&(!compactRule(feature.damage?.[0]?.condition??'').includes(compactRule(declinedEnd[1]!))
      ||! /\bdoes not choose to fail and end this effect\b/iu.test(feature.damage?.[0]?.condition??'')))
      return 'conditional damage trigger or declined ending condition is missing or conflicts with source';
  }

  const sourceStatus = /\b(?:is|are|becomes)\s+([A-Z][a-z]+(?:\s+and\s+[A-Z][a-z]+)*)\s+until the end of (?:its|their) next turn\b/gu;
  const expectedStatuses = [...evidence.matchAll(sourceStatus)]
    .flatMap(match => match[1]!.split(/\s+and\s+/u).map(status => status.toLowerCase()));
  if (expectedStatuses.length) {
    const actual = (feature.appliedConditions ?? []).flatMap(condition =>
      condition.statuses.map(status => status.toLowerCase()));
    if (JSON.stringify(expectedStatuses.sort()) !== JSON.stringify(actual.sort()))
      return 'applied status is missing or conflicts with source';
    if ((feature.appliedConditions ?? []).some(condition =>
      compactRule(condition.duration ?? '') !== 'until the end of its next turn'))
      return 'applied status duration is missing or conflicts with source';
  }
  const escapeDcs = [...evidence.matchAll(/\bescape\s+DC\s*(\d+)\b|逃脱\s*(?:DC|难度等级)\s*(\d+)/giu)]
    .map(match => Number(match[1] ?? match[2]));
  const actualEscapeDcs = (feature.appliedConditions ?? [])
    .flatMap(condition => condition.escapeDc === undefined ? [] : [condition.escapeDc]);
  if (JSON.stringify(escapeDcs) !== JSON.stringify(actualEscapeDcs))
    return 'escape DC is missing or conflicts with source';
  if ((feature.appliedConditions ?? []).some(condition => condition.staged)
    && !STAGED_SOURCE_BRANCH.test(evidence))
    return 'staged condition has no source evidence';

  const activation = /\(Only if ([^)]+)\)/iu.exec(evidence)?.[1];
  if (activation && feature.activationCondition
    && compactRule(feature.activationCondition) !== compactRule('Only if ' + activation))
    return 'activation condition conflicts with the source label';
  return undefined;
}

/** Conditional/delayed saves are not an immediate single native Save. Require
 * the entire unit and keep its consequences literal for the GM. */
function completeConditionalUtility(feature:CanonicalFeature,unit:EvidenceRef|undefined):boolean{
  if(!unit||feature.activityType!=='utility'||feature.save||feature.attack||feature.damage?.length)return false;
  const text=sourceRuleText(unit.quote);
  const saves=[...text.matchAll(/\b(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:\s*DC\s*\d+\./giu)];
  if(saves.length!==1||! /\bSuccess:/iu.test(text))return false;
  return /\bWhenever\b.+\bIf it does,\s+the creature can make a\b/iu.test(text)
    || /\bAt the end of the .+? creature['’]s next turn, it must make a\b/iu.test(text);
}

/** Shared, browser-safe restoration of exact source facts. Callers own the cloned proposal. */
export function normalizeMonsterSourceFacts(ir:MonsterIntakeIR,source:string,scope:{start:number;end:number}):void{
  if(!ir.creature)return;
  {
    // Missing optional data can be restored from one unambiguous printed
    // value. Never override a conflicting numeric proposal or borrow a roll
    // from an ability. Whole-header evidence keeps raw Unicode coordinates.
    try{
      const header=sourceStatHeader({source,sourceSha256:ir.source.sha256,candidate:{id:'initiative',label:ir.creature.identity.name,...scope,quote:source.slice(scope.start,scope.end)}});
      const recoveredIdentity=completeSourceHeaderIdentity(header.quote,ir.creature);
      for(const path of recoveredIdentity){
        if(Array.isArray(ir.claims)&&!ir.claims.some(claim=>claim.path===path))ir.claims.push({path,valueKind:'explicit',confidence:'high',evidence:[header]});
        for(const entry of ir.coverage??[])if(entry.start<=header.start&&entry.end>=header.end&&!entry.claimPaths.includes(path))entry.claimPaths.push(path);
      }
      const totals=[...unmarkStagedHeader(header.quote).matchAll(/(?:Initiative|先攻)\s*[:：]?\s*([+\-−–]?\d+)(?![A-Za-z\d./])/giu)].map(match=>Number(match[1]!.replace(/[−–]/gu,'-')));
      if(ir.creature.attributes&&ir.creature.attributes.initiative==null&&totals.length&&new Set(totals).size===1){
        ir.creature.attributes.initiative=totals[0];
        const path='/creature/attributes/initiative';
        if(Array.isArray(ir.claims)&&!ir.claims.some(claim=>claim.path===path))ir.claims.push({path,valueKind:'explicit',confidence:'high',evidence:[header]});
        for(const entry of ir.coverage??[])if(entry.start<=header.start&&entry.end>=header.end&&!entry.claimPaths.includes(path))entry.claimPaths.push(path);
      }
      if(ir.creature.languages&&!ir.creature.languages.custom){
        const note=sourceLanguageNotes(header.quote,ir.creature.languages.values);
        if(note)ir.creature.languages.custom=note;
      }
    }catch{/* Unreadable/conflicting headers remain validator review findings. */}
  }
  const movement=ir.creature.attributes?.movement;
  if(movement&&typeof movement==='object'){
    const hover=explicitMovementHoverEvidence(source,ir.claims,scope);
    if(hover&&typeof movement.fly==='number')movement.hover=true;
    else delete movement.hover;
  }
  const facts=explicitSourceSaves(source,scope);
  if(ir.creature.saves&&typeof ir.creature.saves==='object'&&!Array.isArray(ir.creature.saves)){
    const evidence:EvidenceRef[]=[];
    for(const fact of facts){
      if(facts.some(other=>other.ability===fact.ability&&other.total!==fact.total))continue;
      if(fact.score!==undefined&&ir.creature.abilities?.[fact.ability]!==fact.score)continue;
      if(ir.creature.saves[fact.ability]===undefined)ir.creature.saves[fact.ability]=fact.total;
      evidence.push(fact.evidence);
    }
    if(evidence.length){
      if(!Array.isArray(ir.claims))ir.claims=[];
      const previous=ir.claims.find(claim=>claim.path==='/creature/saves'&&claim.valueKind==='explicit');
      if(previous){
        if(!Array.isArray(previous.evidence))previous.evidence=[];
        for(const ref of evidence)if(!previous.evidence.some(old=>old.start===ref.start&&old.end===ref.end&&old.quote===ref.quote))previous.evidence.push(ref);
      }else ir.claims.push({path:'/creature/saves',valueKind:'explicit',confidence:'high',evidence});
    }
  }
  for(const section of ['traits','actions','bonusActions','reactions','legendaryActions'] as const){
    for(const [index,feature] of (Array.isArray(ir.creature[section])?ir.creature[section]:[]).entries()){
      const conditions=Array.isArray(feature?.appliedConditions)?feature.appliedConditions:[];
      if(conditions.length<2)continue;
      const evidence=exactFeatureEvidence(feature,`/creature/${section}/${index}`,ir,source,scope)
        .map(ref=>ref.quote).join('\n').replace(/\s+/gu,' ');
      for(const applied of conditions){
        const qualifier=typeof applied?.condition==='string'?applied.condition.replace(/\s+/gu,' '):'';
        if(STAGED_SOURCE_BRANCH.test(qualifier)&&STAGED_SOURCE_BRANCH.test(evidence))applied.staged=true;
      }
    }
  }
  preserveReferencedDefinitionText(ir, source, scope);
  preserveTargetChoiceSave(ir, source, scope);
  preserveSharedTargetRange(ir, source, scope);
  preserveIndependentSpellFeatureBoundary(ir,source,scope);
  checkKnownRuleEvidence(ir, source, scope);
}

/** A labelled spell feature is not evidence of a global caster profile. Only
 * resolve the specific absent-profile question after every labelled feature's
 * complete body and explicit per-feature usage remain independently bound. */
function preserveIndependentSpellFeatureBoundary(ir:MonsterIntakeIR,source:string,scope:{start:number;end:number}):void{
  for(const uncertainty of ir.uncertainties){
    if(uncertainty.code!=='SOURCE_EXPLICIT_SPELL_FEATURES_MANUAL')continue;
    uncertainty.code='AMBIGUOUS_SPELLCASTING';uncertainty.blocking=true;
  }
  if(ir.creature.spellcasting?.length||/\b(?:innate )?spellcasting\s*[.:]|spellcasting ability|\b\d+(?:st|nd|rd|th)[ -]level spellcaster|spell slots\s*[:：]/iu.test(source.slice(scope.start,scope.end)))return;
  const entries=(['traits','actions','bonusActions','reactions','legendaryActions'] as const).flatMap(section=>
    (ir.creature[section]??[]).map((feature,index)=>({feature,path:`/creature/${section}/${index}`})));
  const units=entries.map(entry=>({...entry,ref:completeSourceFeatureEvidence(source,ir,entry.feature,entry.path,scope)}))
    .filter(entry=>entry.ref&&/^[^.]+\([^)]*\bLevel\s+\d+\s+Spell\b/iu.test(sourceRuleText(entry.ref.quote)));
  const sourceLevels=[...source.slice(scope.start,scope.end).matchAll(/\bLevel\s+(\d+)\s+Spell\b/giu)];
  if(!units.length||units.length!==sourceLevels.length)return;
  for(const {feature,ref} of units){
    const label=sourceRuleText(ref!.quote).split(/\.\s/u)[0]!;
    const level=/\bLevel\s+(\d+)\s+Spell\b/iu.exec(label)![1]!;
    if(!new RegExp('\\bLevel\\s+'+level+'\\s+Spell\\b','iu').test([feature.name,feature.englishName,feature.sourceQualifier,feature.description].join(' ')))return;
    const daily=/\b(\d+)\s*\/\s*Day\b/iu.exec(label);
    if(daily&&(feature.uses?.max!==Number(daily[1])||feature.uses.period!=='day'||Object.hasOwn(feature,'use')))return;
  }
  for(const uncertainty of ir.uncertainties){
    if(uncertainty.code!=='AMBIGUOUS_SPELLCASTING'||uncertainty.path!=='/creature/spellcasting'
      ||!Array.isArray(uncertainty.candidates)||uncertainty.candidates.length||!uncertainty.evidence?.length)continue;
    if(!uncertainty.evidence.every(ref=>ref.start>=scope.start&&ref.end<=scope.end&&source.slice(ref.start,ref.end)===ref.quote
      &&units.some(unit=>ref.start>=unit.ref!.start&&ref.end<=unit.ref!.end&&/\bLevel\s+\d+\s+Spell\b/iu.test(ref.quote))))continue;
    uncertainty.code='SOURCE_EXPLICIT_SPELL_FEATURES_MANUAL';uncertainty.blocking=false;
    uncertainty.message='The source provides independent, fully preserved level-labelled features and their explicit DC/uses. No global spellcasting ability, caster level or slot pool is supplied or inferred. Native fields describe only each feature; the GM adjudicates its remaining literal branches.';
  }
}

/** A claimed feature cannot change a complete source formula or known condition's role. */
function checkKnownRuleEvidence(ir: MonsterIntakeIR, source: string, scope: {start:number;end:number}): void {
  if (!Array.isArray(ir.claims) || !Array.isArray(ir.uncertainties)) return;
  for(const uncertainty of ir.uncertainties){
    if(uncertainty.code!=='SOURCE_VERIFIED_CONDITIONAL_RULE_MANUAL')continue;
    uncertainty.code='SOURCE_CONDITIONAL_RECHECK_REQUIRED';uncertainty.blocking=true;
  }
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/gu, ' ').trim();
  const formulaToken = (signature: string): string => {
    let value = signature;
    // Source prose often wraps a complete damage roll in presentation-only
    // parentheses. Strip only a group enclosing the entire expression;
    // inner grouping and operator order still participate in the signature.
    while (value.startsWith('(') && value.endsWith(')')) {
      let depth = 0;
      let whole = true;
      for (let index = 0; index < value.length; index++) {
        depth += value[index] === '(' ? 1 : value[index] === ')' ? -1 : 0;
        if (depth === 0 && index < value.length - 1) { whole = false; break; }
      }
      if (!whole || depth !== 0) break;
      value = value.slice(1, -1);
    }
    return value;
  };
  const formula = (value: string) => localizationFormulaSpans(value).map(span => span.signature).join(',')
    || value.replace(/\s+/gu, '').replace(/[xX×*]/gu, '*').replace(/[÷/]/gu, '/').toLowerCase();
  const signature = (fact: SourceRuleFact): unknown => {
    if (fact.kind === 'attack-damage') return { kind: fact.kind, attackType: fact.attackType,
      toHit: fact.toHit, range: normalize(fact.distance).replace(/\b(?:ft|feet)\b\.?/gu, 'feet'),
      target: normalize(fact.target), average: fact.average, formula: formula(fact.formula), type: fact.damageType };
    if (fact.kind === 'save-damage') return { kind: fact.kind, targetScope: fact.targetScope,
      dc: fact.dc, ability: fact.ability, average: fact.average, formula: formula(fact.formula),
      type: fact.damageType, half: fact.halfOnSuccess };
    if (fact.kind === 'save-status') return { kind: fact.kind,
      requiredTargetStatus: fact.requiredTargetStatus, withinFeet: fact.withinFeet,
      dc: fact.dc, ability: fact.ability, appliedStatus: fact.appliedStatus,
      duration: fact.duration, failureMarginDropToZero: fact.failureMarginDropToZero ?? null };
    if (fact.kind === 'save-damage-status') return { kind: fact.kind,
      withinFeet: fact.withinFeet, dc: fact.dc, ability: fact.ability,
      average: fact.average, formula: formula(fact.formula), type: fact.damageType,
      appliedStatus: fact.appliedStatus, duration: fact.duration, half: fact.halfOnSuccess };
    if (fact.kind === 'visible-target-save-damage') return { kind: fact.kind,
      viewer: normalize(fact.viewer), withinFeet: fact.withinFeet, dc: fact.dc, ability: fact.ability,
      damages: fact.damages.map(part => ({ average: part.average, formula: formula(part.formula),
        type: part.damageType })), half: fact.halfOnSuccess };
    if (fact.kind === 'heavy-armour-half') return { kind: fact.kind, targetCondition: fact.targetCondition,
      grappler: normalize(fact.grappler), average: fact.average, formula: formula(fact.formula),
      type: fact.damageType, armourNegated: fact.armourNegated };
    if (fact.kind === 'target-choice-save') return { kind: fact.kind,
      targetScope: fact.targetScope.kind === 'area'
        ? { kind: 'area', feet: fact.targetScope.feet }
        : { kind: 'within', feet: fact.targetScope.feet, mustSeeSource: fact.targetScope.mustSeeSource },
      choices: [...fact.choices].sort(), dc: fact.dc, failedStatus: fact.failedStatus,
      duration: fact.duration, repeatAt: fact.repeatAt };
    if (fact.kind === 'forced-movement') return { kind: fact.kind, target: fact.target,
      dc: fact.dc, ability: fact.ability, distance: fact.distance,
      distanceFormula: fact.distanceFormula ? formula(fact.distanceFormula) : null,
      origin: normalize(fact.origin) };
    if (fact.kind === 'food-retention') return {
      kind: fact.kind, food: fact.food, liquid: fact.requiredLiquid, outcome: fact.outcome,
    };
    throw new TypeError('已识别规则缺少事实签名，须阻断并补齐来源对照。');
  };
  for (const section of ['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions'] as const) {
    for (const [index, feature] of (ir.creature[section] ?? []).entries()) {
      const path = '/creature/' + section + '/' + index;
      const exact = exactFeatureEvidence(feature, path, ir, source, scope);
      if (!exact.length) continue;
      // Child claims may cite another feature to justify inherited mechanics
      // (for example a reaction using Longbow). They count for structured
      // attack/damage evidence, but are not prose the reaction must repeat.
      const primary = exactFeatureEvidence(feature, path, ir, source, scope, false);
      const unit=completeSourceFeatureEvidence(source,ir,feature,path,scope);
      const manualConditional=completeConditionalUtility(feature,unit);
      if(manualConditional){
        const prior=ir.uncertainties.find(value=>value.id==='source-conditional:'+path);
        const checked={id:'source-conditional:'+path,code:'SOURCE_VERIFIED_CONDITIONAL_RULE_MANUAL',path,
          message:'The complete source binds a conditional or delayed saving throw and its branches. The Utility preserves the entire rule for GM adjudication; no immediate Save or automatic consequences are implied.',
          blocking:false,evidence:[unit!]};
        if(prior){
          if(['SOURCE_CONDITIONAL_RECHECK_REQUIRED','SOURCE_VERIFIED_CONDITIONAL_RULE_MANUAL'].includes(prior.code))Object.assign(prior,checked);
        }else ir.uncertainties.push(checked);
      }
      const clearOwn=(code:string)=>{
        const id='source-rule:'+code+':'+path;
        ir.uncertainties=ir.uncertainties.filter(value=>value.id!==id||value.code!==code);
      };
      const block = (code: string, message: string) => {
        if (ir.uncertainties.some(value => value.path === path && value.code === code)) return;
        ir.uncertainties.push({ id: 'source-rule:' + code + ':' + path, code, path,
          message, blocking: true, evidence: [{ ...(primary[0] ?? exact[0]!) }] });
      };
      // A separately proven upgrade is context, not words the original
      // parent must repeat. Its operation/relationship has its own gate.
      const formulaEvidence=feature.sourceOperations?.some(op=>op.proof?.upgrade)&&!sourceOperationErrors(feature.description,feature.sourceOperations,feature.sourceContext).length?primary:exact;
      const expected = [...new Map(formulaEvidence.flatMap(ref => localizationFormulaSpans(ref.quote)
        .map(span => [ref.start + span.start, formulaToken(span.signature)] as const))).entries()]
        .sort(([left], [right]) => left - right).map(([, signature]) => signature);
      const described = localizationFormulaSpans(String(feature.description ?? ''))
        .map(span => formulaToken(span.signature));
      const structured = (feature.damage ?? []).flatMap(part =>
        localizationFormulaSpans(part.formula).map(span => formulaToken(span.signature)));
      // A concise description may omit the formula while the accepted
      // structured damage still carries it. A contradictory description or
      // structured damage never inherits that omission allowance.
      const contradictsDescription = described.length > 0 && JSON.stringify(expected) !== JSON.stringify(described);
      const contradictsStructured = structured.some(signature => !expected.includes(signature));
      const omittedEverywhere = described.length === 0 && structured.length === 0;
      if (expected.length && (contradictsDescription || contradictsStructured || omittedEverywhere)) {
        block('SOURCE_FORMULA_MISMATCH',
          'Feature dice formula differs from the exact source evidence and requires review.');
      }else if(expected.length)clearOwn('SOURCE_FORMULA_MISMATCH');
      const sourceFacts = exact.flatMap(ref => parseSupportedRuleFacts(ref.quote));
      const primaryFacts = primary.flatMap(ref => parseSupportedRuleFacts(ref.quote));
      if (primaryFacts.length) {
        const irFacts = parseSupportedRuleFacts(String(feature.description ?? '')).map(signature);
        if (JSON.stringify(primaryFacts.map(signature)) !== JSON.stringify(irFacts)) {
          block('SOURCE_RULE_FACT_MISMATCH',
            'A supported complete rule has different target, range, DC, condition or outcome in the proposed IR.');
        }
      }
      const sourceEvidence = exact.map(ref => ref.quote.replace(/\s+/gu, ' ').trim()).join(' ');
      const explicitManual = feature.executionMode==='gm-manual' && !!unit && feature.activityType==='utility'
        && !feature.attack && !feature.save && !feature.damage && !feature.appliedConditions;
      const structuredConflict = explicitManual||feature.executionMode==='native-with-gm' ? undefined : structuredRuleConflict(feature, sourceEvidence, sourceFacts,manualConditional);
      if (structuredConflict) block('SOURCE_STRUCTURED_RULE_MISMATCH', structuredConflict);
      else if(unit)clearOwn('SOURCE_STRUCTURED_RULE_MISMATCH');
    }
  }
}

/** Inherit only across a source-proved numbered subrule sequence, stopping at
 * its first boundary. Names do not determine either the parent or the children. */
function preserveSharedTargetRange(ir:MonsterIntakeIR,source:string,scope:{start:number;end:number}):void{
  for(const binding of sourceSharedTargetBindings(source,ir,scope)){
    const {feature,path,range,targetSpecial,evidence,sourceConflict}=binding;
    if(feature.executionMode==='gm-manual')continue;
    const conflict=sourceConflict||feature.range!==undefined&&feature.range!==range
      ||feature.targetSpecial!==undefined&&feature.targetSpecial!==targetSpecial||feature.attack!==undefined
      ||ir.claims.some(claim=>(claim.path===path+'/range'||claim.path===path+'/targetSpecial')
        &&claim.value!==undefined&&claim.value!==(claim.path.endsWith('/range')?range:targetSpecial));
    if(conflict){
      const id='source-shared-target:'+path;
      if(!ir.uncertainties.some(value=>value.id===id))ir.uncertainties.push({id,code:'SOURCE_SHARED_TARGET_CONFLICT',path,
        message:'An explicit child distance or target restriction conflicts with the complete shared parent rule; inheritance cannot overwrite it.',blocking:true,evidence});
      continue;
    }
    feature.range=range;feature.targetSpecial=targetSpecial;
    for(const [field,value] of [['range',range],['targetSpecial',targetSpecial]] as const){
      const fieldPath=path+'/'+field;
      if(!ir.claims.some(claim=>claim.path===fieldPath))ir.claims.push({path:fieldPath,value,valueKind:'derived',confidence:'high',evidence:evidence.map(ref=>({...ref}))});
    }
  }
}

/** Recognize the bounded INT/WIS target-choice rule from source, never from a
 * model diagnostic code. Preserve it as literal GM handling; a conflicting
 * native Save remains blocking. Claims are an equally valid evidence carrier. */
function preserveTargetChoiceSave(ir: MonsterIntakeIR, source: string, scope: {start: number; end: number}): void {
  if (!Array.isArray(ir.uncertainties) || !Array.isArray(ir.claims) || !Array.isArray(ir.coverage)
    || !Number.isInteger(scope.start) || !Number.isInteger(scope.end)
    || scope.start < 0 || scope.end > source.length || scope.end <= scope.start) return;
  const sections = ['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions'] as const;
  const entries = sections.flatMap(section => (Array.isArray(ir.creature[section]) ? ir.creature[section] : [])
    .flatMap((feature, index) => feature && typeof feature === 'object' ? [{ feature, path: `/creature/${section}/${index}` }] : []));
  const exact = (ref: EvidenceRef): boolean => !!ref && Number.isInteger(ref.start) && Number.isInteger(ref.end)
    && ref.start >= scope.start && ref.end <= scope.end && ref.end > ref.start
    && typeof ref.quote === 'string' && source.slice(ref.start, ref.end) === ref.quote;
  const compact = (text: string): string => text.replace(/\s+/gu, ' ').trim();
  // Preserve exact raw quotes/offsets. Only boundary whitespace may differ
  // between two citations of the same complete rule.
  const contentSpan = (ref: EvidenceRef) => [ref.start + ref.quote.length - ref.quote.trimStart().length,
    ref.end - (ref.quote.length - ref.quote.trimEnd().length)];
  const sameContentSpan = (left: EvidenceRef, right: EvidenceRef): boolean => exact(left) && exact(right)
    && contentSpan(left).every((offset, index) => offset === contentSpan(right)[index]);
  // A source-present numeric distance line wrap retains its hyphen and unit.
  // Do not remove arbitrary hyphens or normalize model evidence quotes.
  const joinedSourceDistance = (text: string): string => compact(text.replace(/(\b\d+)-[ \t]*\r?\n[ \t]*(foot|feet)\b/giu, '$1-$2'));
  const choice = /(?:Intelligence\s+or\s+Wisdom|Wisdom\s+or\s+Intelligence)\s+Saving\s+Throw:\s*\(Target['’]s\s+Choice\)\s+DC\s+([1-9]\d?)\./giu;
  const claimsFor = (path: string) => ir.claims.filter(claim => claim?.path === path);
  const refsFor = (entry: typeof entries[number]) => [
    ...(Array.isArray(entry.feature.evidence) ? entry.feature.evidence : []),
    ...claimsFor(entry.path).flatMap(claim => Array.isArray(claim.evidence) ? claim.evidence : []),
  ];
  // This code identifies our own recorded resolution, not a model error. A
  // resumed proposal must establish the source proof again on every entry.
  for (const uncertainty of ir.uncertainties) {
    if (uncertainty?.code !== 'SOURCE_VERIFIED_TARGET_CHOICE_MANUAL') continue;
    uncertainty.code = 'SOURCE_TARGET_CHOICE_RECHECK_REQUIRED';
    uncertainty.blocking = true;
    uncertainty.message = 'The saved target-choice representation requires current, complete source proof before GM preparation.';
  }
  for (const entry of entries) {
    const { feature, path } = entry;
    if(feature.executionMode==='gm-manual')continue;
    const titles = [feature.name, feature.englishName].filter((name): name is string => typeof name === 'string');
    const claimRefs = claimsFor(path).flatMap(claim => Array.isArray(claim.evidence) ? claim.evidence : []);
    const unit = completeSourceFeatureEvidence(source, ir, feature, path, scope);
    const refs = unit ? [unit] : [];
    if (refs.length !== 1) continue;
    const ref = refs[0]!, matches = [...ref.quote.matchAll(choice)];
    if (matches.length === 0) continue;
    const related = ir.uncertainties.filter(value => value?.blocking && (value.path === path || value.path?.startsWith(`${path}/`)));
    const block = (code: string, message: string) => {
      if (related.length) return; // Never erase or replace an existing conflict.
      const id = `source-target-choice:${path}`;
      const prior = ir.uncertainties.find(value => value?.id === id);
      const finding = { id, code, path, message, blocking: true, evidence: [{ ...ref }] };
      if (prior) Object.assign(prior, finding); else ir.uncertainties.push(finding);
    };
    const body = typeof feature.description === 'string' ? sourceRuleText(feature.description) : '';
    const quotes = [compact(ref.quote), joinedSourceDistance(ref.quote)];
    const sourceRefs = refsFor(entry);
    const nextStart = entries.filter(other => other !== entry).flatMap(other => refsFor(other).filter(exact))
      .map(other => other.start).filter(start => start > ref.start).sort((a, b) => a - b)[0];
    const complete = !!body && quotes.some(quote => titles.some(title => quote === `${compact(title)}. ${body}` || quote === body))
      && sourceRefs.every(proof => exact(proof) && proof.start >= ref.start && proof.end <= ref.end)
      && (feature.evidence === undefined || Array.isArray(feature.evidence))
      && nextStart !== undefined && ref.end <= nextStart && !source.slice(ref.end, nextStart).trim()
      && claimsFor(path).some(claim => claim.value === undefined)
      && ir.coverage.some(coverage => sameContentSpan(coverage, ref)
        && coverage.classification === 'mechanical' && Array.isArray(coverage.claimPaths) && coverage.claimPaths.includes(path));
    if (!complete || matches.length !== 1 || Number(matches[0]![1]) > 30
      || (body.match(/\b(?:Intelligence|Wisdom)\b/giu) ?? []).length !== 2
      || (body.match(/\bDC\s*\d+/giu) ?? []).length !== 1
      || (body.match(/\b(?:choice|choose\w*|select\w*)\b/giu) ?? []).length !== 1
      || /\b(?:not|never|instead|except|unless|otherwise|GM|DM)\b/iu.test(body)) {
      block('SOURCE_TARGET_CHOICE_UNVERIFIED', 'Target-selected INT/WIS requires the complete, uniquely bound source rule without omitted or conflicting clauses.');
      continue;
    }
    const clause = matches[0]![0], dc = Number(matches[0]![1]);
    const relatedChoice = related.length === 1 ? related[0] : undefined;
    if (related.length && (!relatedChoice || !Array.isArray(relatedChoice.candidates) || relatedChoice.candidates.length !== 2
      || !relatedChoice.candidates.some(value => value === 'int' || value === 'intelligence')
      || !relatedChoice.candidates.some(value => value === 'wis' || value === 'wisdom')
      || !Array.isArray(relatedChoice.evidence) || relatedChoice.evidence.length !== 1
      || !exact(relatedChoice.evidence[0]!) || !compact(relatedChoice.evidence[0]!.quote).endsWith(compact(clause))
      || relatedChoice.evidence[0]!.start < ref.start || relatedChoice.evidence[0]!.end > ref.end)) continue;
    const save = feature.save;
    const sourceChoiceSave = save !== null && typeof save === 'object' && !Array.isArray(save)
      && (save.ability === undefined || typeof save.ability === 'string'
        && /^(?:intelligence\s+or\s+wisdom|wisdom\s+or\s+intelligence)$/iu.test(save.ability.trim()))
      && save.dc === dc
      && Object.keys(save).every(key => ['ability', 'dc', 'condition'].includes(key))
      && (save.condition === undefined || typeof save.condition === 'string' && !!save.condition.trim() && body.includes(compact(save.condition)));
    if (save !== undefined && !sourceChoiceSave) {
      block('SOURCE_TARGET_CHOICE_CONFLICT', 'A native Save may not select one ability or a different DC for an explicit target-selected INT/WIS rule.');
      continue;
    }
    if (feature.attack != null || !['save', 'utility'].includes(feature.activityType ?? '')
      || ir.claims.some(claim => claim?.path === `${path}/save` || claim?.path?.startsWith(`${path}/save/`)
        || claim?.path === `${path}/activityType`)) {
      block('SOURCE_TARGET_CHOICE_CONFLICT', 'Conflicting native mechanics or field claims require review; they cannot be discarded by manual normalization.');
      continue;
    }
    // Only the source-proved incomplete/choice Save is removed. No ability is guessed;
    // full descriptions, conditions and provenance claims remain unchanged.
    if (save !== undefined) delete feature.save;
    feature.activityType = 'utility';
    const start = ref.start + matches[0]!.index!;
    const uncertainty = relatedChoice ?? { id: `source-target-choice:${path}`, code: '', path,
      message: '', blocking: false, evidence: [{ start, end: start + clause.length, quote: clause }], candidates: ['int', 'wis'] };
    if (!relatedChoice) ir.uncertainties.push(uncertainty);
    uncertainty.blocking = false;
    uncertainty.code = 'SOURCE_VERIFIED_TARGET_CHOICE_MANUAL';
    uncertainty.message = 'The exact complete source assigns the INT/WIS choice to each target. Preserve the rule as Utility for GM adjudication; do not create a single-ability Save or automate its consequences.';
  }
}

/** Copy only explicit, candidate-scoped definition blocks identified by the same
 * strict preservation check. This is literal text, never inferred mechanics. */
function preserveReferencedDefinitionText(ir: MonsterIntakeIR, source: string, scope: {start: number; end: number}): void {
  if (!Number.isInteger(scope.start) || !Number.isInteger(scope.end)
    || scope.start < 0 || scope.end > source.length || scope.end <= scope.start
    || !Array.isArray(ir.claims) || !Array.isArray(ir.coverage)
    || (ir.creature.biography != null && typeof ir.creature.biography !== 'string')) return;
  if (!/^(?:#{1,6}\s*)?(?:Referenced definitions[^\r\n]*|引用定义[^\r\n]*|补充定义[^\r\n]*)\r?\n/imu.test(source.slice(scope.start, scope.end))) return;
  const refs = sourceCompletenessFindings(source, ir, scope)
    .filter(finding => finding.code === 'SOURCE_DEFINITION_OMITTED')
    .flatMap(finding => finding.evidence ?? [])
    .filter(ref => ref.start >= scope.start && ref.end <= scope.end
      // A range ending inside a larger document cannot certify its final block.
      && (ref.end < scope.end || scope.end === source.length)
      && ref.end > ref.start && source.slice(ref.start, ref.end) === ref.quote);
  if (!refs.length) return;

  const previous = ir.creature.biography ?? '';
  const biography = [previous, ...refs.map(ref => ref.quote.trim())].filter(Boolean).join('\n\n');
  ir.creature.biography = biography;
  const path = '/creature/biography';
  const existing = ir.claims.filter(claim => claim && claim.path === path);
  // A value claim matching the old complete field follows this literal append.
  // Conflicting assertions remain unchanged so the validator still rejects them.
  const values = new Set(existing.filter(claim => claim.value !== undefined).map(claim => JSON.stringify(claim.value)));
  for (const claim of existing) {
    if (values.size <= 1 && typeof claim.value === 'string'
      && claim.value.replace(/\s+/gu, ' ') === previous.replace(/\s+/gu, ' ')) {
      claim.value = biography;
      if (Array.isArray(claim.evidence)) claim.evidence.push(...refs.map(ref => ({...ref})));
    }
  }
  ir.claims.push({path, valueKind: 'preserved-literal', confidence: 'high', evidence: refs.map(ref => ({...ref}))});

  for (const ref of refs) {
    for (const entry of ir.coverage) {
      if (!entry || entry.start < ref.start || entry.end > ref.end || source.slice(entry.start, entry.end) !== entry.quote
        || !Array.isArray(entry.claimPaths)
        || !['mechanical', 'narrative', 'ignored-with-reason'].includes(entry.classification)) continue;
      entry.classification = 'mechanical';
      entry.claimPaths = [...new Set([...entry.claimPaths, path])];
      entry.reason = 'Exact referenced definition preserved as text; GM handles its mechanics.';
    }
    if (!ir.coverage.some(entry => entry && entry.start === ref.start && entry.end === ref.end
      && entry.classification === 'mechanical' && Array.isArray(entry.claimPaths) && entry.claimPaths.includes(path))) {
      ir.coverage.push({...ref, classification: 'mechanical', claimPaths: [path]});
    }
  }
}
