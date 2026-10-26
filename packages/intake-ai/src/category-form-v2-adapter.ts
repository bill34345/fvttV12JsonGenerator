import { bindSourceOperations, sourceFeatureResources, sourceOperationClauses, sourceHealingOperations,
  sourceActorNameMatches,sourceOperationSelfArea,sourceLegendaryLairResistance, type SourceOperation } from '@fvtt-json-generator/models/source-operations';
import { sourceResultScopes } from '@fvtt-json-generator/models/source-operation-scopes';
import { sourceSharedUseDeclarations } from '@fvtt-json-generator/models/source-resource-pools';
import { assertStagedSourcePartition, stagedLegendaryBudget, stagedLegendaryActionCost, StagedExtractionError,
  type StagedMonsterSource, type StagedSourceUnit } from './staged-source';
import { stagedDamageType, stagedRecharge,stagedCreatureType } from './staged-source-facts';
import { stagedFeatureMechanics } from './staged-feature-mechanics';
import { isSourceSpellcastingFeature, stagedSpellcastingGroups } from './staged-spellcasting';
import {sourceDailySpellAction} from './daily-spell-action';
import {sourceReferencedSpellAction,normalizedSourceSpellName} from './source-spell-reference';
import { sourceSpellcastingAbility } from './spellcasting-ability';
import { dailySpellGrantLabel, sourceSpellComponentClause } from './spell-grant-label';
import type { MonsterIntakeIR, CanonicalSpellcastingGroup, EvidenceRef } from './types';
import type { StagedFeatureResponse } from './staged-feature-contract';
import type { DecodedCategoryFormV2, V2Operation, V2Row, V2Damage, V2Healing } from './category-form-v2';
import {bindV2DynamicHealing} from './category-form-v2-healing';
import {bindV2DamageAdjustment} from './category-form-v2-damage-adjustment';
import {sourceSingleSpellAction} from '@fvtt-json-generator/models/source-rule-facts';
import {makeV2FeatureIdentityScope,bindV2SelfReference} from './category-form-v2-identity';
import {sourceManualSpellGrant,sourceSpellGrantTokens} from './spell-grant-tokens';

function fail(code: string, path: string): never {
  const fields: Record<string, string> = { 攻击: 'attack', 豁免: 'save', 范围: 'area', 伤害: 'damage', 特殊规则: 'manual-rule', 距离: 'distance', 治疗: 'healing',
    目标: 'target', 目标数量: 'target-count', 目标限制: 'target-restriction', 中心: 'center', 距离尺: 'range', 使用次数: 'uses', 恢复方式: 'recovery',
    其他操作: 'operations', 施法: 'spellcasting', 传奇动作消耗: 'legendary-cost', 共享资源: 'shared-resource', 限制: 'restriction' };
  throw new StagedExtractionError(code, path.split('/').map(part => fields[part] ?? part).join('/'));
}
const visible = (value: string) => value.normalize('NFKC').replace(/[*_]/gu, '').replace(/[−–]/gu, '-').replace(/\s+/gu, ' ').trim();
const formula = (value: string) => visible(value).replace(/\s+/gu, '').toLowerCase();
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const conditional = /\b(?:if|unless|while|whenever|when|after|before|provided|instead|only when|at the (?:start|end))\b|如果|若|当|每当|之后|之前|除非|仅当|改为|代替/iu;
const abilityLabels: Record<string, string> = { str: 'strength|力量', dex: 'dexterity|敏捷', con: 'constitution|体质', int: 'intelligence|智力', wis: 'wisdom|感知', cha: 'charisma|魅力' };
const typeLabels: Record<string, string> = { acid: 'acid|强酸|酸蚀', bludgeoning: 'bludgeoning|钝击', cold: 'cold|冷冻|寒冷', fire: 'fire|火焰', force: 'force|力场', lightning: 'lightning|闪电', necrotic: 'necrotic|黯蚀|死灵|暗蚀|坏死', piercing: 'piercing|穿刺', poison: 'poison|毒素', psychic: 'psychic|心灵', radiant: 'radiant|光耀|辐射', slashing: 'slashing|挥砍', thunder: 'thunder|雷鸣' };
function one<T>(values: T[], path: string): T {
  if (values.length !== 1) fail('V2_SOURCE_BINDING', path);
  return values[0]!;
}
function damageType(value: string, path: string): string {
  const type = stagedDamageType(value) ?? Object.keys(typeLabels).find(key => new RegExp(`^(?:${typeLabels[key]})$`, 'iu').test(value));
  if (!type) fail('V2_DAMAGE_TYPE', path);
  return type;
}
function damageProof(source: string, damage: V2Damage, path: string): string {
  const type = damageType(damage.伤害类型, path);
  const roll = [...formula(damage.公式)].map(escape).join('\\s*');
  const match = new RegExp(`(?<![\\p{L}\\d])${roll}\\s*[)）]?\\s*(?:点|的)?\\s*(?:${typeLabels[type]})\\s*(?:damage|伤害)`, 'iu');
  return one(sourceOperationClauses(source).filter(clause => match.test(visible(clause))), path);
}

/** Natural-language fields stay literal GM work, never a new inferred executor.
 * Reject mechanically contradicted assertions; retain the complete original
 * parent instead of publishing a model paraphrase as the authoritative rule. */
function manualText(text: string | null, source: string, path: string): void {
  if (text === null) return;
  const original = visible(source), candidate = visible(text);
  const numeric = /(?<![\p{L}\d])\d+(?:d\d+(?:\s*[+-]\s*\d+)?)?/giu;
  const originalNumbers = [...original.matchAll(numeric)].map(match => formula(match[0]));
  const quantities: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  for (const word of original.matchAll(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\b/giu)) originalNumbers.push(String(quantities[word[0].toLowerCase()]));
  for (const value of candidate.matchAll(numeric)) if (!originalNumbers.includes(formula(value[0]))) fail('V2_RULE_NUMBER_CONFLICT', path);
}

// Closed bilingual recipient concepts. Unrecognized complex target prose is
// never used as executable data: the source's literal recipient is preserved.
const targetConcepts = [
  [/\bcreatures?\b|生物/iu, /\bcreatures?\b|生物/iu],
  [/\bobjects?\b|物体|物件/iu, /\bobjects?\b|物体|物件/iu],
  [/\bhumanoids?\b|类人生物|类人/iu, /\bhumanoids?\b|类人生物|类人/iu],
  [/\bwilling\b|自愿/iu, /\bwilling\b|自愿/iu],
  [/\bgrappled\b|擒抱/iu, /\bgrappled\b|擒抱/iu],
  [/\bincapacitated\b|失能/iu, /\bincapacitated\b|失能/iu],
  [/\brestrained\b|束缚/iu, /\brestrained\b|束缚/iu],
  [/\baware\b|察觉|意识到|感知到/iu, /\baware\b|察觉|意识到|感知到/iu],
  [/\b(?:see|sees|visible)\b|看见|看到|可见/iu, /\b(?:see|sees|visible)\b|看见|看到|可见/iu],
] as const;
function target(source: string, quote: string, literal: string, proposed: string | null, count: number | null, path: string,context?:string|null,area?:V2Operation['范围']): string {
  const raw = visible(literal).replace(/[.。]$/u, '');
  // Visibility of an area placement point is not visibility of its recipients.
  // Both slots must be present and source-proven before separating them.
  const placement=/\s+centered on (a point (.+?) can see within (\d+) (?:feet|ft\.?))$/iu.exec(raw);
  let recipient=raw;
  if(placement&&area?.中心!==null&&area?.中心!==undefined){
    const center=visible(area.中心),range=Number(placement[3]);
    const english=/^(?:a )?point (.+?) can see within (\d+) (?:feet|ft\.?)$/iu.exec(center);
    const chinese=/^(.+?)(?:能|可以)?(?:看见|看到)的(\d+)尺内(?:一)?点$/u.exec(center);
    const observer=english?.[1]??chinese?.[1],centerRange=english?.[2]??chinese?.[2];
    const observerIdentity=(value:string)=>visible(value).replace(/^the\s+/iu,'').replace(/(?:能|可以)$/u,'').toLowerCase();
    const sourceObserver=observerIdentity(placement[2]!),proposedObserver=observer&&observerIdentity(observer);
    const sameObserver=proposedObserver===sourceObserver||!!proposedObserver&&stagedCreatureType(sourceObserver)!==undefined&&stagedCreatureType(proposedObserver)===stagedCreatureType(sourceObserver);
    if(!sameObserver||Number(centerRange)!==range)fail('V2_AREA_CENTER_CONFLICT',path);
    if(area.距离尺!==range||!/(?:\bpoint\b|一点|一处|点位)/iu.test(center)
      ||!/(?:\b(?:see|visible)\b|看见|看到|可见)/iu.test(center)
      ||/\b(?:not|cannot|can't|without)\b|不能|不可见|看不见/iu.test(center))fail('V2_AREA_CENTER_CONFLICT',path);
    manualText(center,source,path);
    recipient=raw.slice(0,placement.index);
  }
  const simple = /^(?:one|a|an|1) target$/iu.test(raw);
  if (proposed === null && !simple) fail('V2_TARGET_OMITTED', path);
  if (proposed !== null) {
    // Shared placement in the same parent may precede the Save sentence.
    // Its literal distance is still source-owned; the full binder checks the
    // executable geometry/recipient's operation ownership independently.
    manualText(proposed, source, path);
    const proposedRecipient=recipient!==raw&&visible(proposed).replace(/[.。]$/u,'').toLowerCase()===raw.toLowerCase()?recipient:proposed;
    for (const [sourceToken, proposedToken] of targetConcepts) {
      // Humanoid is a creature; the generic Chinese 生物 suffix is not an
      // additional unrestricted-creature assertion.
      if (sourceToken.source.includes('creatures?') && /\bhumanoids?\b/iu.test(raw)) continue;
      if (sourceToken.test(recipient) !== proposedToken.test(proposedRecipient)) fail('V2_TARGET_CONFLICT', path);
    }
    const each = /\b(?:each|every|any)\b/iu.test(raw), eachProposed = /\b(?:each|every|any)\b|每(?:一)?个|每名|每位|所有|全部|任一|任意|任何/iu.test(proposed);
    // A quantifier elsewhere in the parent may name a different set. Only an
    // affirmative Save clause naming this exact filled recipient can supply
    // the redundant quantifier; null/one targets never inherit it.
    const explicitSetInSameOperation=each&&!/一个|一名|1个|\bone\b/iu.test(proposed)
      &&typeof context==='string'&&visible(context).split(/[。；;.]/u).some(clause=>
        new RegExp(`^(?:任何|每(?:一)?个|所有)${escape(visible(proposed))}(?:须|必须|应)进行[^。；;.]*豁免$`,'u').test(clause.trim())
        ||new RegExp(`^(?:each|every|any) ${escape(visible(proposed))} must (?:make|succeed on) [^.;。]+saving throw$`,'iu').test(clause.trim()));
    const chosenSet = /\bchoice\b/iu.test(raw) && /选择|所选|选定|chosen|choice/iu.test(proposed) && !/一个|一名|1个|\bone\b/iu.test(proposed);
    if (each !== eachProposed && !(each && chosenSet)&&!explicitSetInSameOperation) fail('V2_TARGET_CONFLICT', path);
    if (/\bor\b/iu.test(raw)&&!/\bor\b|或/iu.test(proposed)) fail('V2_TARGET_CONFLICT',path);
    if (/\b(?:not|cannot|can't|without)\b/iu.test(raw) !== /\b(?:not|cannot|can't|without)\b|不能|不得|不被|未被|没有/iu.test(proposed)) fail('V2_TARGET_CONFLICT', path);
  }
  const printed = /^(?:one|a|an|1)\b/iu.test(raw) ? 1 : /^(\d+)\b/u.exec(raw)?.[1];
  if (count !== null && (printed === undefined || Number(printed) !== count)) fail('V2_TARGET_COUNT', path);
  if (!visible(quote).includes(raw) || !source.includes(quote)) fail('V2_SOURCE_BINDING', path);
  return raw;
}

function attackTarget(quote: string, path: string): string {
  // The complete target slot may itself contain comma-separated alternatives.
  // Start after the final printed reach/range, never at the final comma.
  const q=visible(quote).split(/\bHit:/iu)[0]!.trim().replace(/[.。]$/u,''),distances=[...q.matchAll(/\b(?:reach|range)\s+\d+(?:\s*\/\s*\d+)?\s*(?:ft\.?|feet)\s*[,，;；]\s*/giu)];
  const last=distances.at(-1),slot=last?q.slice(last.index!+last[0].length).trim():q.split(/[,，;；]/u).at(-1)?.trim();
  if (!slot || /^(?:reach|range|melee|ranged|命中|触及|射程)/iu.test(slot)) fail('V2_TARGET_UNSUPPORTED', path);
  return slot;
}
function saveTarget(quote: string): string | undefined {
  const q = visible(quote);
  const modern=/^(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:\s*DC\s*\d+\s*[,，]\s*(.+?)[.。]?$/iu.exec(q);
  if(modern)return modern[1];
  const first = /^((?:Each|Every|Any|One|A|The) (?:creature|target|humanoid)[\s\S]*?)\s+(?:must|makes?|succeeds?)\b/iu.exec(q);
  if (first) return first[1];
  const forced=/\bforcing\s+((?:each|every|any) creature[\s\S]*?)\s+to\s+make\b/iu.exec(q);
  if(forced)return forced[1];
  const conditionalRecipient=/^If (the target can see [^,]+),\s*(the target) must\b/iu.exec(q);
  if(conditionalRecipient)return q.slice(0,q.indexOf(' must'));
  const condition = /^If (the target) is a creature,/iu.exec(q);
  if (condition) return 'the target';
  return undefined;
}
function saveOutcome(fields: V2Operation, source: string, proof: string, path: string): 'none' | 'half' | 'full' {
  const values = fields.伤害.map(part => part.成功时倍率).filter(value => value !== null);
  if (new Set(values).size > 1) fail('V2_SAVE_BRANCH_UNSUPPORTED', path);
  const multiplier = values[0];
  if (multiplier !== undefined && ![0, 0.5, 1].includes(multiplier)) fail('V2_DAMAGE_MULTIPLIER_UNSUPPORTED', path);
  const text = fields.豁免!.成功结果;
  // Only damage outcomes govern damage multipliers. Speed is halved (or is
  // not halved) is a separate consequence, retained in the complete GM rule.
  const halfDamage=(value:string)=>/\bhalf(?: as much)?\s+damage\b|\bdamage\s+(?:is\s+)?(?:halved|reduced (?:by|to) half)\b|伤害(?:值)?(?:减为|降低为)?(?:一半|减半)|(?:一半|减半)(?:的)?伤害|半伤/iu.test(value)
    ||/^(?:half(?: as much)?|减半|一半)$/iu.test(value.trim());
  const half = halfDamage(text), none = /no damage|不受.*伤害|没有伤害|无伤害/iu.test(text);
  if (multiplier !== undefined && (half !== (multiplier === 0.5) || none && multiplier !== 0)) fail('V2_SAVE_OUTCOME_CONFLICT', path);
  if (!fields.伤害.length && (half||/full damage|全额伤害/iu.test(text))) fail('V2_SAVE_OUTCOME_CONFLICT', path);
  manualText(text, source, path);
  const index = sourceOperationClauses(source).indexOf(proof);
  const scopes = sourceResultScopes(source).filter(scope => scope.clauseIndex >= index);
  if (half && !scopes.some(scope => halfDamage(scope.text))) fail('V2_SAVE_OUTCOME_CONFLICT', path);
  return multiplier === 0.5 ? 'half' : multiplier === 1 ? 'full' : 'none';
}

/** Distances used for triggers/movement remain full literal GM rules. Only a
 * source-explicit selection range becomes the existing native range field. */
function distances(fields: V2Operation, unit: StagedSourceUnit, base: MonsterIntakeIR, path: string): Array<{ value: number; quote: string }> {
  const range: Array<{ value: number; quote: string }> = [];
  for (const [index, distance] of fields.距离.entries()) {
    const at = path + '/距离/' + index;
    const clauses = sourceOperationClauses(unit.quote);
    const literal = clauses.filter(clause => new RegExp(`(?<![\\d.])${distance.尺}[-\\s]*(?:feet|foot|ft\\.?|尺)`, 'iu').test(visible(clause)));
    if (!literal.length) {
      // A printed fraction of the Actor's explicit speed is still GM movement,
      // never a fabricated fixed teleport/range or an unprinted area.
      const speed = /flying|fly|飞行/iu.test(distance.用途) ? base.creature.attributes.movement.fly : base.creature.attributes.movement.walk;
      const half = /half (?:its |the creature['’]s )?(?:flying )?speed/iu.test(visible(unit.quote));
      const full = /up to (?:its |the creature['’]s )?speed/iu.test(visible(unit.quote));
      if (speed === undefined || !(half && distance.尺 === speed / 2 || full && distance.尺 === speed)) fail('V2_DISTANCE_UNPROVEN', at);
      manualText(distance.条件, unit.quote + '\n' + String(speed), at);
    } else {
      manualText(distance.条件, unit.quote, at);
      if (/选择.*目标|目标.*距离|选择目标|target|selection/iu.test(distance.用途)
        && !/传送|移动|teleport|move/iu.test(distance.用途)) {
        const quote = one(literal.filter(clause => new RegExp(`(?:within|range|射程|周围)\\s*[:：]?\\s*${distance.尺}\\s*(?:feet|ft\\.?|尺)`, 'iu').test(visible(clause))), at);
        range.push({ value: distance.尺, quote });
      }
    }
    // Every other distance is retained in the carrier's complete source rule.
  }
  if (range.length > 1) fail('V2_DISTANCE_UNSUPPORTED', path);
  return range;
}

function operationsFor(fields: V2Operation, unit: StagedSourceUnit, base: MonsterIntakeIR, path: string, label: string, literalHealing:ReadonlySet<V2Healing>=new Set()): SourceOperation[] {
  const source = unit.quote.trim(), clauses = sourceOperationClauses(source), operations: SourceOperation[] = [];
  const operation = (type: SourceOperation['type']): SourceOperation => ({ id: 'v2-' + type, name: label, type, relationship: 'primary', sourceText: source, proof: {} });
  manualText(fields.特殊规则, source, path + '/特殊规则');
  const ranges = distances(fields, unit, base, path);
  const actorNames=[base.creature.identity.name,base.creature.identity.englishName].filter((name):name is string=>!!name);
  const adjustment=bindV2DamageAdjustment(fields,source,actorNames,path,damageType);
  let attack: SourceOperation | undefined, save: SourceOperation | undefined;
  if (fields.攻击) {
    const a = fields.攻击, types: Record<string, NonNullable<SourceOperation['attack']>['type']> = { 近战武器攻击: 'mwak', 远程武器攻击: 'rwak', 近战法术攻击: 'msak', 远程法术攻击: 'rsak',近战攻击:'melee',远程攻击:'ranged' };
    if (!types[a.类型]) fail('V2_ATTACK_CLASSIFICATION_UNSUPPORTED', path + '/攻击');
    // The modern neutral choice needs separately selectable modes. Holding
    // both distances in one melee/ranged operation is a filled-value error.
    if(/\bMelee or Ranged Attack Roll:/iu.test(visible(source))&&['近战攻击','远程攻击'].includes(a.类型)
      &&a.触及尺!==null&&a.射程尺!==null)fail('V2_ATTACK_MODE_CONFLICT',path+'/攻击');
    attack = operation('attack');
    attack.attack = { type: types[a.类型]!, toHit: a.命中加值, ...(a.触及尺 !== null ? { reach: a.触及尺 } : {}),
      ...(a.射程尺 !== null ? { range: a.射程尺 } : {}), ...(a.远射程尺 !== null ? { longRange: a.远射程尺 } : {}) };
    attack.proof.attack = one(clauses.filter(clause => /(?:melee|ranged).{0,35}attack|近战.{0,12}攻击|远程.{0,12}攻击/iu.test(visible(clause))
      && new RegExp(`(?:[+\\-]\\s*${Math.abs(a.命中加值)}\\s+to hit|(?:attack roll|命中|攻击检定)\\s*[:：]?\\s*[+\\-]?\\s*${Math.abs(a.命中加值)})`, 'iu').test(visible(clause))), path + '/攻击');
    const classified=/\b(?:melee|ranged)\s+(?:weapon|spell)\s+attack\b|(?:近战|远程)(?:武器|法术)攻击/iu.test(visible(attack.proof.attack));
    const neutral=types[a.类型]==='melee'||types[a.类型]==='ranged';
    if(classified===neutral)fail('V2_ATTACK_CLASSIFICATION_CONFLICT',path+'/攻击');
    try{
      const literal = attackTarget(attack.proof.attack, path);
      attack.targetSpecial = target(source, attack.proof.attack, literal, a.目标限制, a.目标数量, path + '/攻击/目标');
      attack.proof.target = attack.proof.attack;
    }catch(error){
      if(!neutral||!(error instanceof StagedExtractionError)||error.code!=='V2_TARGET_UNSUPPORTED')throw error;
      // 2024 Attack Notation defaults to one target unless the attack says
      // otherwise. Do not manufacture a quote/target slot for this default.
      const hit=adjustment?.adjustment.quote??clauses[clauses.indexOf(attack.proof.attack)+1];
      if(a.目标限制!==null||a.目标数量!==null&&a.目标数量!==1)fail('V2_TARGET_UNPROVEN',path+'/攻击/目标');
      if(hit&&/\bHit:/iu.test(visible(hit))&&/\bthe target\b/iu.test(hit)){attack.targetSpecial='the target';attack.proof.target=hit;}
    }
    if(adjustment)attack.damageAdjustment=adjustment.adjustment;
    operations.push(attack);
  }
  if (fields.豁免) {
    const s = fields.豁免;
    save = operation('save');
    save.proof.save = one(clauses.filter(clause => new RegExp(`(?:\\bDC|难度等级)\\s*${s.DC}(?!\\d)`, 'iu').test(visible(clause))
      && s.属性.every(ability => new RegExp(abilityLabels[ability]!, 'iu').test(visible(clause))) && /saving\s+throw|豁免/iu.test(visible(clause))), path + '/豁免');
    save.save = { dc: s.DC, abilities: s.属性, choice: s.属性.length === 1 ? 'single' : 'target', outcome: saveOutcome(fields, source, save.proof.save, path + '/豁免') };
    const saveAt=clauses.indexOf(save.proof.save);
    const introductions=clauses.slice(0,saveAt).flatMap(quote=>{
      const match=/^(.+?)\s+(?:targets?|chooses?|selects?)\s+(.+?)[.。]?$/iu.exec(visible(quote));
      return match&&sourceActorNameMatches(match[1]!,[base.creature.identity.name,base.creature.identity.englishName].filter((name):name is string=>!!name))
        ?[{quote,literal:match[2]!.replace(/[.。]$/u,'')}]:[];
    });
    const introduced=/^If the target can see\b/iu.test(visible(save.proof.save))&&introductions.length===1?introductions[0]:undefined;
    const literal = introduced?.literal??saveTarget(save.proof.save);
    if (literal) {
      // A conditional creature predicate owns the target type although the
      // grammatical recipient itself is the literal "the target".
      const recipient = /^If the target is a creature,/iu.test(visible(save.proof.save)) ? 'If the target is a creature' : literal;
      target(source, introduced?.quote??save.proof.save, recipient, s.目标限制, null, path + '/豁免/目标',fields.特殊规则,fields.范围);
      // The existing recipient grammar binds the whole conditional sentence
      // when its grammatical subject changes from "the target" to "it".
      // Keep that exact GM qualifier rather than dropping the creature gate.
      save.targetSpecial = /^If the target is a creature,/iu.test(visible(save.proof.save)) ? visible(save.proof.save) : literal;
      save.proof.target = introduced?.quote??save.proof.save;
    } else if (s.目标限制 !== null) fail('V2_TARGET_UNSUPPORTED', path + '/豁免/目标');
    operations.push(save);
  }
  for (const [index, part] of fields.伤害.entries()) {
    if(adjustment&&index===adjustment.halfIndex)continue;
    const at = path + '/伤害/' + index;
    if (part.倍率 !== 1) fail('V2_DAMAGE_MULTIPLIER_UNSUPPORTED', at);
    const proof = damageProof(source, part, at), position = source.indexOf(proof);
    const savePosition = save ? source.indexOf(save.proof.save!) : -1;
    // A Save after conditional extra damage does not own that earlier atom.
    const owner = save && position >= savePosition ? save : attack;
    const scopes = sourceResultScopes(source).filter(scope => scope.clause === proof);
    const saveResult = owner === save && scopes.some(scope => scope.branch === 'failure' || scope.branch === 'both');
    const isConditional = !adjustment&&!saveResult && conditional.test(visible(proof));
    if (isConditional && part.生效条件 === null) fail('V2_DAMAGE_CONDITION_OMITTED', at);
    if (part.生效条件 !== null) manualText(part.生效条件, source, at);
    if ((!save || owner !== save) && part.成功时倍率 !== null) fail('V2_DAMAGE_SAVE_OWNER', at);
    let destination = owner;
    if (!destination) {
      destination = operation('damage'); destination.id += '-' + index;
      if (isConditional) { destination.relationship = 'follow-up'; destination.condition = source; }
      operations.push(destination);
    }
    const relationship: NonNullable<SourceOperation['damage']>[number]['relationship'] = isConditional ? /instead|改为|代替/iu.test(visible(proof)) ? 'replacement' : 'conditional'
      : destination.damage?.length ? 'additional' : 'base';
    (destination.damage ??= []).push({ formula: formula(part.公式), type: damageType(part.伤害类型, at), relationship,
      ...(isConditional ? { condition: source } : {}) });
    (destination.proof.damage ??= []).push(proof);
  }
  if (fields.范围) {
    const area = fields.范围, shapes: Record<string, NonNullable<SourceOperation['aoe']>['shape']> = { 球体: 'sphere', 球形: 'sphere', 半径: 'radius', 锥形: 'cone', 线形: 'line', 立方体: 'cube', 圆柱体: 'cylinder', 矩形: 'rectangle' };
    const owner = save ?? attack ?? operations[0]; if (!owner) fail('V2_AREA_WITHOUT_OPERATION', path);
    const labels: Record<string, string> = { sphere: 'sphere|球形|球体', radius: 'radius|within|半径|周围', cone: 'cone|锥形', line: 'line|线形', cube: 'cube|立方体', cylinder: 'cylinder|圆柱', rectangle: 'rectangle|square|矩形' };
    const shape = shapes[area.形状]!;
    owner.aoe = { shape, radius: area.大小尺 };
    owner.proof.aoe = one(clauses.filter(clause => new RegExp(labels[shape]!, 'iu').test(visible(clause))
      && new RegExp(`(?<![\\d.])${area.大小尺}[-\\s]*(?:feet|foot|ft\\.?|尺)`, 'iu').test(visible(clause))), path + '/范围');
    if (area.中心 !== null) manualText(area.中心, unit.quote, path + '/范围/中心');
    if (area.距离尺 !== null && !(area.距离尺===0 && sourceOperationSelfArea(source,owner,[base.creature.identity.name,base.creature.identity.englishName].filter((name):name is string=>!!name)))) ranges.push({ value: area.距离尺, quote: one(clauses.filter(clause => new RegExp(`(?:within|range|射程)\\s*${area.距离尺}\\s*(?:feet|ft\\.?|尺)`, 'iu').test(visible(clause))), path + '/范围/距离尺') });
  }
  if (ranges.length) {
    const range = one(ranges, path + '/距离'), owner = save ?? attack ?? operations[0];
    if (!owner) fail('V2_RANGE_WITHOUT_OPERATION', path);
    owner.range = range.value; owner.proof.range = range.quote;
  }
  if (fields.治疗.some(healing=>!literalHealing.has(healing))) fail('V2_HEALING_COMBINATION_UNSUPPORTED', path + '/治疗');
  operations.sort((a, b) => source.indexOf(a.proof.attack ?? a.proof.save ?? a.proof.damage?.[0] ?? '') - source.indexOf(b.proof.attack ?? b.proof.save ?? b.proof.damage?.[0] ?? ''));
  for (const [index, op] of operations.entries()) {
    if (index > 0 || op.type === 'save' && conditional.test(visible(op.proof.save!))) { op.relationship = 'follow-up'; op.condition = source; }
    op.id = 'v2-op-' + index;
  }
  return operations;
}

function period(value: string | null): 'day' | 'shortRest' | 'longRest' | 'dawn' | undefined {
  if (value === null) return;
  if (/short|短休/iu.test(value)) return 'shortRest';
  if (/long|长休/iu.test(value)) return 'longRest';
  if (/dawn|黎明|破晓/iu.test(value)) return 'dawn';
  if (/day|每日|每天|每日|每天|天|日/iu.test(value)) return 'day';
  return undefined;
}
const dailyRecovery=(value:string|null)=>value!==null&&/^(?:每天|每日|daily|day|each day|per day)$/iu.test(visible(value));
function resources(row: V2Row, unit: StagedSourceUnit, plan: StagedMonsterSource, base: MonsterIntakeIR): StagedFeatureResponse['facts'] {
  const path = '/features/' + unit.id, owner = base.creature.identity.name;
  const expected = { ...sourceFeatureResources(unit.name!, unit.quote, owner) };
  expected.recharge ??= stagedRecharge(unit.name!);
  const rest = /Recharges? after (?:a )?(Short(?: or Long)?|Long) Rest/iu.exec(unit.name!);
  if (rest && !expected.uses) expected.uses = { max: 1, period: /^short/iu.test(rest[1]!) ? 'shortRest' : 'longRest' };
  const aliases = [owner, base.creature.identity.englishName].filter((value): value is string => !!value);
  const lairResistance=sourceLegendaryLairResistance(unit.name!,unit.quote,aliases);
  const cost = /Costs?\s+(\d+)\s+Actions?/iu.exec(unit.name!);
  const budget = stagedLegendaryBudget(plan, aliases);
  if(lairResistance&&budget?.lairMax)delete expected.uses;
  const expectedCost = cost ? Number(cost[1]) : stagedLegendaryActionCost(plan, unit, aliases) ?? (unit.section === 'legendary' && budget ? 1 : undefined);
  // A rechargeable option may be described as one use then Recharge N.
  // Keep that source-owned cooldown, never add a separate daily-use pool.
  const suppliedLairResistance=!!lairResistance&&!!budget?.lairMax&&(row.使用次数!==null||row.恢复方式!==null);
  if(suppliedLairResistance){
    if(row.使用次数!==lairResistance!.max)fail('V2_USE_COUNT_CONFLICT',path+'/使用次数');
    const recovery=visible(row.恢复方式??'').replace(/\s+/gu,'');
    const lair=lairResistance!.lairMax;
    const chinese=new RegExp(`^(?:每天|每日)(?:[;(,]?(?:在)?巢穴(?:内|中)(?:为|是|时)?(?:每天|每日)?${lair}次[)]?)?$`,'iu');
    const english=new RegExp(`^(?:daily|day|eachday|perday)(?:[;(,]?(?:${lair}/dayinlair|inlair${lair}/day|inlair${lair}(?:uses|times)(?:perday)?)[)]?)?$`,'iu');
    if(!chinese.test(recovery)&&!english.test(recovery))fail('V2_RECOVERY_CONFLICT',path+'/恢复方式');
    // The Actor's existing source ledger owns this pool and lair switch.
    // Do not project a second independent Item daily-use counter.
  }else if (row.使用次数 !== (expected.uses?.max ?? null) && !(expected.recharge && row.使用次数 === 1)) fail('V2_USE_COUNT_CONFLICT', path + '/使用次数');
  if (expected.uses && period(row.恢复方式) !== expected.uses.period) fail('V2_RECOVERY_CONFLICT', path + '/恢复方式');
  if (expected.recharge) {
    const recharge = row.恢复方式 && stagedRecharge(row.恢复方式);
    if (!recharge || recharge[0] !== expected.recharge[0] || recharge[1] !== expected.recharge[1]) fail('V2_RECHARGE_CONFLICT', path + '/恢复方式');
  } else if (!expected.uses && row.恢复方式 !== null&&!suppliedLairResistance) fail('V2_RECOVERY_UNSUPPORTED', path + '/恢复方式');
  if (row.传奇动作消耗 !== (expectedCost ?? null)) fail('V2_LEGENDARY_COST_CONFLICT', path + '/传奇动作消耗');
  const facts: StagedFeatureResponse['facts'] = {};
  if (unit.section !== 'trait') facts.activationType = unit.section === 'mythic' ? 'legendary' : unit.section;
  const body = visible(unit.quote).slice(visible(unit.name!).length + 1).trim();
  const activation = /^As (?:an?|its) (bonus action|reaction|action),/iu.exec(body)?.[1]?.toLowerCase();
  if (activation) facts.activationType = activation === 'bonus action' ? 'bonus' : activation as 'action' | 'reaction';
  if (expected.uses) facts.uses = expected.uses;
  if (expected.recharge) facts.recharge = expected.recharge;
  if (expected.legendaryCost !== undefined) facts.legendaryCost = expected.legendaryCost;
  if (row.共享资源) {
    const shared = row.共享资源;
    if (unit.section === 'legendary') {
      if (!budget || shared.上限 !== budget.max || !/legendary|传奇/iu.test(shared.名称)
        || !/start|开始/iu.test(shared.恢复) || !/turn|回合/iu.test(shared.恢复)
        || !/start of (?:each of )?(?:its|their|the \w+['’]s) turns?/iu.test(visible(budget.preamble))) fail('V2_LEGENDARY_BUDGET_CONFLICT', path + '/共享资源');
      if (shared.限制 === null || !/end|结束/iu.test(shared.限制) || !/one|一个|1个/iu.test(shared.限制)) fail('V2_LEGENDARY_RESTRICTION', path + '/共享资源');
      manualText(shared.限制, budget.preamble, path + '/共享资源/限制');
    } else {
      const contexts = (unit.contextIds ?? []).map(id => plan.units.find(item => item.id === id)!.quote);
      const declaration = one([unit.quote, ...contexts].flatMap(sourceSharedUseDeclarations), path + '/共享资源');
      const names = plan.features.filter(item => visible(declaration).includes(visible(item.name!).replace(/\s*\([^)]*(?:Day|Rest)[^)]*\)/giu, '')));
      const recovery = period(shared.恢复);
      if (names.length < 2 || !recovery || shared.限制 !== null) fail('V2_SHARED_RESOURCE_UNSUPPORTED', path + '/共享资源');
      facts.sharedUses = { members: names.map(item => item.id), max: shared.上限, period: recovery, cost: 1, quote: declaration };
    }
  } else if (unit.section === 'legendary' && budget&&!budget.lairMax) fail('V2_LEGENDARY_BUDGET_OMITTED', path + '/共享资源');
  return facts;
}

interface SourceSpellEntry { names: Array<string | undefined>; count: number | null; atWill:boolean; independentDaily?:boolean;restrictions: string[]; start: number }
function spellEntries(groups: CanonicalSpellcastingGroup[], path: string): SourceSpellEntry[] {
  const entries: SourceSpellEntry[] = [];
  for (const group of groups) {
    for (const usage of group.usageGroups) for (const spell of usage.spellRefs) entries.push({
      names: [spell.originalName, spell.englishName, spell.chineseName], count: usage.usage === '1/day-each' ? 1 : 'count' in usage ? usage.count : null,
      atWill:usage.usage==='at-will',
      independentDaily:usage.usage==='1/day-each'||usage.usage==='daily-each',
      restrictions: spell.restrictions.filter(restriction => restriction.kind!=='other'&&!sourceSpellComponentClause(restriction.text)).map(restriction => restriction.text),
      start: spell.evidence[0]!.start,
    });
    // Existing staged extraction deliberately keeps some complete restricted
    // grant rows manual (for example fly, self only). Validate the filled list
    // against those literal rows without converting them to executable grants.
    for (const manual of group.manualGrants ?? []) {
      const token=group.evidence.length===1?sourceManualSpellGrant(group.evidence[0]!,manual):undefined;
      if(token){entries.push({names:[token.name],count:token.count??null,atWill:token.usage==='at-will',independentDaily:token.usage==='1/day-each'||token.usage==='daily-each',restrictions:token.annotation?[token.annotation]:[],start:token.token.start});continue;}
      const single=manual.quote===group.description?sourceSingleSpellAction(manual.quote):undefined;
      if(single){
        const duration=/\bthe duration is \d+ (?:hours?|minutes?|days?)\b/iu.exec(manual.quote)?.[0];
        entries.push({names:[single.name],count:null,atWill:true,restrictions:duration?[duration]:[],start:manual.start+single.start});
        continue;
      }
      const daily = dailySpellGrantLabel(manual.quote);
      const label = daily?.match ?? /^\s*(?:\*{1,3})?\s*(?:随意|at[ -]*will|cantrips?\s*\(at will\)|戏法\s*[（(]随意[）)]|[1-9](?:st|nd|rd|th)?\s*level\s*\(\d+\s*slots?\)|[1-9]\s*环\s*[（(]\d+\s*法位[）)])\s*[:：]\s*(?:\*{1,3})?\s*/iu.exec(manual.quote);
      if (!label) fail('V2_SPELLCASTING_GRANT_UNSUPPORTED', path);
      const tokens=sourceSpellGrantTokens(manual.quote.slice(label[0].length),manual.start+label[0].length);
      if(!tokens)fail('V2_SPELLCASTING_GRANT_UNSUPPORTED',path);
      for (const token of tokens) {
        const raw = token.quote, annotation = /[（(]([\s\S]+)[）)]\s*$/u.exec(raw);
        const name = (annotation ? raw.slice(0, annotation.index) : raw).trim();
        if (!name || !/^[\p{L}\p{N} '’\-]+$/u.test(name)) fail('V2_SPELLCASTING_GRANT_UNSUPPORTED', path);
        entries.push({ names: [name], count: daily?.count ?? null,atWill:!daily&&/^\s*(?:\*{1,3})?\s*(?:随意|at[ -]*will)\s*[:：]/iu.test(manual.quote),independentDaily:!!daily?.each, restrictions: annotation ? [annotation[1]!] : [], start: token.start });
      }
    }
  }
  return entries.sort((a, b) => a.start - b.start);
}
/** Closed bilingual equality for literal form limitations. It only compares
 * source facts; it never creates a shape-changing or spell-effect executor. */
function formRestrictionFacts(value:string):string|undefined{
  const raw=visible(value).replace(/^[（(]|[）)]$/gu,'').trim();
  const english=/^([\p{L} ,]+?)\s+forms?\s+only(?:\s*[,;]\s*([\s\S]+))?$/iu.exec(raw);
  const chinese=/^(?:仅限|只限|只能(?:变为|使用))(.+?)(?:形态|形体)(?:\s*[；;,，]\s*([\s\S]+))?$/u.exec(raw);
  const match=english??chinese;if(!match)return;
  const names=match[1]!.split(/\s*(?:,|\bor\b|或)\s*/iu).filter(Boolean).map(name=>stagedCreatureType(name.trim()));
  if(!names.length||names.some(name=>!name))return;
  const facts:{forms:string[];gainTemporaryHp?:false;maintenance?:string[]}={forms:[...new Set(names as string[])].sort()};
  for(const rawClause of (match[2]??'').split(/[,;；，]/u).filter(clause=>clause.trim())){
    const clause=rawClause.trim().replace(/^(?:and\s+|且|并且?)/iu,'');
    if(/^no temporary hit points (?:are )?gained from (?:the|this) spell$/iu.test(clause)
      ||/^(?:不会|不)(?:从(?:该|此|这个)法术)?(?:获得|得到)临时生命值$/u.test(clause)){
      if(facts.gainTemporaryHp!==undefined)return;facts.gainTemporaryHp=false;continue;
    }
    const maintain=/^no (concentration|temporary hit points)(?: or (concentration|temporary hit points))? (?:is |are )?required to maintain (?:the|this) spell$/iu.exec(clause)
      ??/^(?:维持|维系)(?:该|此|这个)法术(?:不需要|无需)(专注|临时生命值)(?:或(专注|临时生命值))?$/u.exec(clause);
    if(maintain){if(facts.maintenance)return;facts.maintenance=[...new Set(maintain.slice(1).filter(Boolean).map(item=>/concentration|专注/iu.test(item)?'concentration':'temporary-hp'))].sort();continue;}
    return;
  }
  return JSON.stringify(facts);
}
function sameRestriction(proposed: string | null, restrictions: string[]): boolean {
  if (!restrictions.length) return proposed === null;
  if (proposed === null) return false;
  const normalized = (value: string) => visible(value).replace(/\b(?:the )?duration (?:is|:)\s*/giu,'duration ').replace(/[()（）,，;；.。\s]/gu, '').toLowerCase();
  if (normalized(proposed) === normalized(restrictions.join('; '))) return true;
  if(restrictions.length===1){
    const forms=formRestrictionFacts(restrictions[0]!);
    if(forms&&forms===formRestrictionFacts(proposed))return true;
    const sourceLevel=/^\(?level\s+([1-9])\s+version\)?$/iu.exec(visible(restrictions[0]!));
    if(sourceLevel&&new RegExp(`^${sourceLevel[1]}环版本$`,'u').test(visible(proposed).replace(/\s+/gu,'')))return true;
    if(/^\(?included in AC\)?$/iu.test(visible(restrictions[0]!))&&/^(?:已计入AC|已包含在AC中)$/iu.test(visible(proposed).replace(/\s+/gu,'')))return true;
  }
  return restrictions.length === 1 && /^\(?self only\)?$/iu.test(visible(restrictions[0]!)) && /^(?:仅限自身|仅限自己|仅对自身|只能对自身|仅自身)$/u.test(proposed.trim());
}
/** A source-explicit daily spell action outside the supported Cast grammar
 * still has a verifiable identity and parent quota. Preserve it as a complete
 * GM action using the existing parent counter; never erase the filled form or
 * invent separate per-option pools. This is deliberately a closed grammar. */
function validateManualSpellAction(row:V2Row,unit:StagedSourceUnit,plan:StagedMonsterSource,base:MonsterIntakeIR):void{
  const path='/features/'+unit.id+'/施法',supplied=row.施法!;
  const daily=sourceDailySpellAction(unit.quote);
  if(daily){
    const group=stagedSpellcastingGroups(plan).get(unit.id);
    if(!group||supplied.属性!==group.ability||supplied.豁免DC!==null&&supplied.豁免DC!==group.saveDc
      ||supplied.命中加值!==null&&supplied.命中加值!==group.attackBonus||supplied.无需材料!==null&&supplied.无需材料!==false)fail('V2_SPELLCASTING_UNPROVEN',path);
    const normalize=(value:string)=>visible(value).replace(/\s+or\s+|\s*或\s*/giu,'|').toLowerCase();
    const actual=supplied.法术.map(spell=>normalize(spell.名称)),wanted=daily.spells.map(spell=>normalize(spell.name));
    if(actual.join('|')!==wanted.join('|'))fail('V2_SPELLCASTING_GRANT_CONFLICT',path);
    for(const spell of supplied.法术){
      if(spell.次数!==daily.count||!dailyRecovery(spell.恢复)||!dailyRecovery(row.恢复方式))fail('V2_SPELLCASTING_USE_CONFLICT',path);
      if(spell.限制!==null&&!(daily.trigger&&/^(?:仅作为反应使用[,，]需响应法术的触发条件|in response to the spell['’]s trigger)$/iu.test(visible(spell.限制))))fail('V2_SPELLCASTING_RESTRICTION_CONFLICT',path);
    }
    return;
  }
  const body=visible(unit.quote).slice(visible(unit.name!).length+1).trim();
  const cast=/^(.+?) casts ([A-Za-z][A-Za-z '’\-]+?)(?=,| in response to the spell['’]s trigger)/iu.exec(body);
  const inheritance=/\busing the same spellcasting ability as ([A-Za-z][A-Za-z '’\-]+?)[.]?$/iu.exec(body);
  const aliases=[base.creature.identity.name,base.creature.identity.englishName].filter((value):value is string=>!!value);
  if(!cast||!inheritance||!sourceActorNameMatches(cast[1]!,aliases))fail('V2_SPELLCASTING_UNPROVEN',path);
  const targetFeature=one(plan.features.filter(feature=>visible(feature.name!)===inheritance[1]),path);
  const profile=sourceSpellcastingAbility(targetFeature.quote,targetFeature.start),expected=sourceFeatureResources(unit.name!,unit.quote,base.creature.identity.name);
  const remainder=body.slice(cast[0].length);
  if(!/^(?: in response to the spell['’]s trigger,)? using the same spellcasting ability as [A-Za-z][A-Za-z '’\-]+[.]?$/iu.test(remainder.replace(/^,\s*/u,' '))
    ||!expected.uses||!profile||supplied.属性!==profile.ability||supplied.豁免DC!==null||supplied.命中加值!==null||supplied.无需材料!==null&&supplied.无需材料!==false)fail('V2_SPELLCASTING_UNPROVEN',path);
  const spell=one(supplied.法术,path),normalize=(value:string)=>visible(value).replace(/\s+or\s+|\s*或\s*/giu,'|').toLowerCase();
  if(normalize(spell.名称)!==normalize(cast[2]!))fail('V2_SPELLCASTING_GRANT_CONFLICT',path);
  if(spell.次数!==expected.uses.max||period(spell.恢复)!==expected.uses.period
    ||expected.uses.period==='day'&&(!dailyRecovery(spell.恢复)||!dailyRecovery(row.恢复方式)))fail('V2_SPELLCASTING_USE_CONFLICT',path);
  manualText(spell.限制,unit.quote,path);
  if(spell.限制!==null&&!/^(?:仅作为反应使用[,，]需响应法术的触发条件|in response to the spell['’]s trigger)$/iu.test(visible(spell.限制)))fail('V2_SPELLCASTING_RESTRICTION_CONFLICT',path);
  if(spell.限制!==null&&!/in response to the spell['’]s trigger/iu.test(body))fail('V2_SPELLCASTING_RESTRICTION_CONFLICT',path);
}
function spellAttackBonus(unit: StagedSourceUnit): { value: number; evidence: EvidenceRef } | undefined {
  const matches = sourceOperationClauses(unit.quote).flatMap(quote => [...visible(quote).matchAll(/([+\-]\s*\d+)\s+to hit with spell attacks|(?:spell attack (?:modifier|bonus)|法术攻击命中加值)\s*[:：]?\s*([+\-]?\s*\d+)/giu)].map(match => ({ value: Number((match[1] ?? match[2])!.replace(/\s/gu, '')), quote })));
  if (!matches.length) return;
  const match = one(matches, '/features/' + unit.id + '/spellcasting/attack-bonus');
  const start = unit.start + unit.quote.indexOf(match.quote);
  return { value: match.value, evidence: { start, end: start + match.quote.length, quote: match.quote } };
}

/** A fixed printed recovery can remain complete GM prose when its timing is
 * outside the existing native Heal grammar. This never creates an activity.
 * Supplied quantities and recipients are checked as facts, not interpreted as
 * an executable Heal. Its complete timing/conditions remain GM-owned. */
function literalFixedHealing(healing: V2Healing, source: string, ownerNames: string[], path: string): void {
  if (healing.公式 === null || healing.取值依据 !== null) fail('V2_HEALING_UNSUPPORTED', path);
  const roll = [...formula(healing.公式)].map(escape).join('\\s*');
  const pattern = new RegExp(`\\b(?:regains?|gains?)\\s+(?:\\d+\\s*[(（])?${roll}\\s*[)）]?\\s+(temporary\\s+)?hit points?\\b`, 'giu');
  const match = one(sourceOperationClauses(source).flatMap(quote => [...visible(quote).matchAll(pattern)].map(match => ({ quote, match }))), path);
  if ((healing.类型 === '临时生命值') !== !!match.match[1]) fail('V2_HEALING_CONFLICT', path);
  const before = visible(match.quote).slice(0, match.match.index).split(/[,，]/u).at(-1)!.trim().replace(/^and\s+/iu,'');
  const self = /^you$/iu.test(before) || sourceActorNameMatches(before, ownerNames)
    || /^it$/iu.test(before) && !/\b(?:the target|a creature|an ally|one creature)\b/iu.test(source.slice(0, source.indexOf(match.quote) + match.match.index!));
  const creature = /^(?:the target|a creature|an ally|one creature)$/iu.test(before);
  if(!self&&!creature)fail('V2_HEALING_TARGET_UNSUPPORTED',path);
  if(self){if(bindV2SelfReference(healing.目标,ownerNames,path).targetStatus!=='verified')fail('V2_HEALING_TARGET_REVIEW_REQUIRED',path);}
  else if(!/target|creature|ally|目标|生物|盟友/iu.test(healing.目标))fail('V2_HEALING_TARGET_UNSUPPORTED',path);
  manualText(healing.生效条件, source, path);
}
function spellcasting(row: V2Row, unit: StagedSourceUnit, plan: StagedMonsterSource,base:MonsterIntakeIR): StagedFeatureResponse {
  const path = '/features/' + unit.id + '/施法', supplied = row.施法;
  if(sourceDailySpellAction(unit.quote)){
    if(supplied)validateManualSpellAction(row,unit,plan,base);
    const parentFacts=resources(row,unit,plan,base);
    if(row.攻击||row.豁免||row.范围||row.伤害.length||row.其他操作.length||row.距离.length||row.治疗.length)fail('V2_SPELLCASTING_COMBINATION_UNSUPPORTED',path);
    const group=stagedSpellcastingGroups(plan).get(unit.id);
    if(!group)fail('V2_SPELLCASTING_UNPROVEN',path);
    manualText(row.特殊规则,unit.quote,path);
    // Retain the filled form's validated quota proposal. It is not an attack
    // or an AI-quoted ability fact inside this unit. The complete-source group
    // assembler separately proves inheritance and emits the executable Casts.
    return{schemaVersion:1,unitId:unit.id,mode:'manual',facts:parentFacts};
  }
  if (!supplied) fail('V2_SPELLCASTING_OMITTED', path);
  const profile = sourceSpellcastingAbility(unit.quote, unit.start);
  if (!profile || supplied.属性 !== profile.ability) fail('V2_SPELLCASTING_ABILITY_CONFLICT', path);
  const groups = [...stagedSpellcastingGroups(plan).entries()].filter(([id]) => id === unit.id || id.startsWith(unit.id + '::')).map(([, group]) => group);
  if (!groups.length) fail('V2_SPELLCASTING_GRANT_UNSUPPORTED', path);
  const group = groups[0]!;
  if (supplied.豁免DC !== (group.saveDc ?? null)) fail('V2_SPELLCASTING_PROFILE_UNSUPPORTED', path);
  if (supplied.命中加值 !== (spellAttackBonus(unit)?.value ?? null)) fail('V2_SPELLCASTING_ATTACK_BONUS_CONFLICT', path);
  const whollyManual=groups.every(group=>!group.usageGroups.length&&group.manualGrants?.length);
  const waiver = whollyManual?!!sourceSpellComponentClause(unit.quote):group.componentWaivers.some(item => item.component === 'material');
  if (supplied.无需材料 !== waiver && !(supplied.无需材料 === null && !waiver)) fail('V2_SPELLCASTING_COMPONENT_CONFLICT', path);
  const spells = spellEntries(groups, path);
  if (spells.length !== supplied.法术.length) fail('V2_SPELLCASTING_GRANT_CONFLICT', path);
  for (const [index, value] of supplied.法术.entries()) {
    const item = spells[index]!;
    if (!item.names.some(name => name !== undefined && visible(name).toLowerCase() === visible(value.名称).toLowerCase())) fail('V2_SPELLCASTING_GRANT_CONFLICT', path);
    // Prepared spells use the source-owned slot pool, never an independent
    // daily counter copied onto every spell. Their V2 per-spell count is null.
    if (value.次数 !== item.count || (item.count !== null ? !dailyRecovery(value.恢复) : value.恢复 !== null&&!(item.atWill&&/^(?:随意|at[ -]*will)$/iu.test(visible(value.恢复))))) fail('V2_SPELLCASTING_USE_CONFLICT', path);
    const cadence=value.限制===null?undefined:/^(?:每(?:个|项|道)法术(?:每天|每日)各?\s*(\d+)\s*次|(\d+)\s*\/\s*day\s+each)$/iu.exec(visible(value.限制));
    const repeatedCadence=!item.restrictions.length&&item.independentDaily&&cadence&&Number(cadence[1]??cadence[2])===item.count;
    if (!sameRestriction(value.限制, item.restrictions)&&!repeatedCadence) fail('V2_SPELLCASTING_RESTRICTION_CONFLICT', path);
  }
  if (row.攻击 || row.豁免 || row.范围 || row.伤害.length || row.其他操作.length || row.距离.length || row.治疗.length) fail('V2_SPELLCASTING_COMBINATION_UNSUPPORTED', path);
  // A Cast can be owned by an ordinary cooldown or the Actor's legendary
  // budget. Validate the supplied limits exactly; never turn them at-will.
  resources(row,unit,plan,base);
  manualText(row.特殊规则, unit.quote, path);
  return { schemaVersion: 1, unitId: unit.id, mode: 'native', facts: { spellcastingAbility: { ability: profile.ability, quote: profile.evidence.quote } } };
}

/** BW-only completion of the already existing spell group attack-bonus field.
 * Staged's ordinary source assembler is unchanged. The filled value is checked
 * before assembly and rebound to the same full source clause here. */
function completeCategoryFormSpellAttackBonus(plan: StagedMonsterSource, ir: MonsterIntakeIR, decoded: DecodedCategoryFormV2): MonsterIntakeIR {
  assertStagedSourcePartition(plan);
  if (ir.source.sha256 !== plan.sourceSha256 || ir.source.length !== plan.source.length) fail('V2_SOURCE_IDENTITY', '/source');
  const result = structuredClone(ir);
  for (const row of decoded.rows) {
    if (!row.施法 || row.施法.命中加值 === null) continue;
    const unit = one(plan.features.filter(unit => unit.id === row.编号), '/features/identity');
    if (unit.quote !== row.source) fail('V2_SOURCE_IDENTITY', '/features/' + unit.id);
    let fact = spellAttackBonus(unit);
    if(!fact&&(sourceDailySpellAction(unit.quote)||sourceReferencedSpellAction(unit.quote))){
      const inherited=stagedSpellcastingGroups(plan).get(unit.id),proof=inherited?.attackBonusEvidence;
      if(inherited?.attackBonus!==undefined&&proof?.length===1)fact={value:inherited.attackBonus,evidence:proof[0]!};
    }
    if (!fact || fact.value !== row.施法.命中加值) fail('V2_SPELLCASTING_ATTACK_BONUS_CONFLICT', '/features/' + unit.id);
    const matches = (result.creature.spellcasting ?? []).flatMap((group, index) => group.evidence.some(ref => ref.start === unit.start && ref.end === unit.end && ref.quote === unit.quote) ? [{ group, index }] : []);
    if (!matches.length) fail('V2_SPELLCASTING_GRANT_UNSUPPORTED', '/features/' + unit.id);
    for (const { group, index } of matches) {
      if (group.attackBonus !== undefined && group.attackBonus !== fact.value) fail('V2_SPELLCASTING_ATTACK_BONUS_CONFLICT', '/features/' + unit.id);
      group.attackBonus = fact.value; group.attackBonusEvidence = [fact.evidence];
      const path = '/creature/spellcasting/' + index + '/attackBonus';
      result.claims.push({ path, valueKind: 'explicit', confidence: 'high', evidence: [fact.evidence] });
      for (const coverage of result.coverage) if (coverage.start <= fact.evidence.start && coverage.end >= fact.evidence.end && !coverage.claimPaths.includes(path)) coverage.claimPaths.push(path);
    }
  }
  return result;
}

/** The historical V2 form stored this resource in its named trait row. Read
 * only the model-filled slots; titles and source prose never supply numbers. */
function completeCategoryFormResistance(plan: StagedMonsterSource, ir: MonsterIntakeIR, decoded: DecodedCategoryFormV2): void {
  const ledger = ir.creature.legendary;
  if (!ledger?.lairMax) return;
  const rows = decoded.rows.filter(row => /^(?:Legendary Resistance|传奇抗性)(?:\s*\([^()]*\))?$/iu.test(visible(row.名称)));
  if (!rows.length) return;
  const incomplete = (message: string, evidence: EvidenceRef[]) => {
    const code = 'V2_LEGENDARY_RESISTANCE_REEXTRACTION_REQUIRED', path = '/creature/legendary/resistanceMax';
    if (!ir.uncertainties.some(issue => issue.code === code && issue.path === path)) ir.uncertainties.push({
      id: 'v2-legendary-resistance-reextraction', code, path, message, blocking: true, evidence,
    });
  };
  if (rows.length !== 1) {
    incomplete('早期表格有多个传奇抗性条目，无法唯一迁移独立计数；请重新提取。原始条目保留。', []);
    return;
  }
  const row = rows[0]!, unit = one(plan.features.filter(unit => unit.id === row.编号), '/features/identity');
  if (unit.section !== 'trait' || row.category !== '特性' || unit.name !== row.名称 || unit.quote !== row.source
    || !ir.creature.traits.some(feature => feature.name === unit.name && feature.evidence?.some(ref =>
      ref.start === unit.start && ref.end === unit.end && ref.quote === unit.quote))) fail('V2_SOURCE_IDENTITY', '/features/' + unit.id);
  const evidence = [{ start: unit.start, end: unit.end, quote: unit.quote }];
  const recovery = visible(row.恢复方式 ?? '').replace(/\s+/gu, '');
  const chinese = /^(?:每天|每日)[;(,]?(?:在)?巢穴(?:内|中)(?:为|是|时)?(?:每天|每日)?(\d+)次[)]?$/iu.exec(recovery);
  const english = /^(?:daily|day|eachday|perday)[;(,]?(?:(\d+)\/dayinlair|inlair(\d+)\/day|inlair(\d+)(?:uses|times)(?:perday)?)[)]?$/iu.exec(recovery);
  const max = row.使用次数, lairMax = Number(chinese?.[1] ?? english?.[1] ?? english?.[2] ?? english?.[3]);
  if (!Number.isSafeInteger(max) || max === null || max < 1 || !Number.isSafeInteger(lairMax) || lairMax !== max + 1
    || ledger.recovery !== 'own-turn-start') {
    incomplete('早期表格未明确保存可迁移的传奇抗性普通／巢穴次数，当前版本无法无损重建；请重新提取。原始条目保留。', evidence);
    return;
  }
  if (ledger.resistanceMax !== undefined && ledger.resistanceMax !== max
    || ledger.resistanceLairMax !== undefined && ledger.resistanceLairMax !== lairMax) {
    fail('V2_LEGENDARY_RESISTANCE_CONFLICT', '/creature/legendary');
  }
  ledger.resistanceMax = max; ledger.resistanceLairMax = lairMax;
  for (const [key, value] of [['resistanceMax', max], ['resistanceLairMax', lairMax]] as const) {
    const path = '/creature/legendary/' + key;
    if (!ir.claims.some(claim => claim.path === path)) ir.claims.push({ path, value, valueKind: 'explicit', confidence: 'high', evidence });
    for (const coverage of ir.coverage) if (coverage.start === unit.start && coverage.end === unit.end && !coverage.claimPaths.includes(path)) coverage.claimPaths.push(path);
  }
}

/** Complete the historical form's explicit model-owned values after ordinary
 * staged assembly. This migration never runs on the default full-IR path. */
export function completeCategoryFormV2(plan: StagedMonsterSource, ir: MonsterIntakeIR, decoded: DecodedCategoryFormV2): MonsterIntakeIR {
  const result = completeCategoryFormSpellAttackBonus(plan, ir, decoded);
  completeCategoryFormResistance(plan, result, decoded);
  return result;
}

/** Compatibility entry for existing V2 callers. */
export function completeCategoryFormSpellcasting(plan: StagedMonsterSource, ir: MonsterIntakeIR, decoded: DecodedCategoryFormV2): MonsterIntakeIR {
  return completeCategoryFormV2(plan, ir, decoded);
}

/** Adapt actual filled values to the established staged proposal contract.
 * Evidence/conditions remain source-owned; the shared binder proves all rolls
 * and detects source atoms missing from the filled form. No I/O or repair. */
export function adaptCategoryFormV2(plan: StagedMonsterSource, base: MonsterIntakeIR, decoded: DecodedCategoryFormV2): unknown[] {
  const inspected=inspectCategoryFormV2(plan,base,decoded);
  const failures=inspected.flatMap(entry=>entry.error?[entry.error]:[]);
  if(failures.length){const first=failures[0]!;throw new StagedExtractionError(first.code,first.path,failures.slice(1));}
  return inspected.map(entry=>entry.proposal);
}

/** Capability-level diagnostics use the exact same adapter, without admitting
 * a partial Monster. An inspected proposal still needs the normal assembler,
 * omission checks and whole-source verification before any product acceptance. */
export function inspectCategoryFormV2(plan:StagedMonsterSource,base:MonsterIntakeIR,decoded:DecodedCategoryFormV2):Array<{unitId:string;proposal?:unknown;error?:{code:string;path:string}}>{
  assertStagedSourcePartition(plan);
  if (decoded.rows.length !== plan.features.length) fail('V2_MISSING_UNITS', '/features');
  return plan.features.map(unit=>{
    try{return{unitId:unit.id,proposal:adaptCategoryFormFeature(plan,base,decoded,unit)};}
    catch(error){
      if(!(error instanceof StagedExtractionError))throw error;
      return{unitId:unit.id,error:{code:error.code,path:error.path}};
    }
  });
}
function adaptCategoryFormFeature(plan:StagedMonsterSource,base:MonsterIntakeIR,decoded:DecodedCategoryFormV2,unit:StagedSourceUnit):unknown {
    const row = one(decoded.rows.filter(row => row.编号 === unit.id), '/features/' + unit.id), path = '/features/' + unit.id;
    if (row.source !== unit.quote || row.名称 !== unit.name) fail('V2_SOURCE_IDENTITY', path);
    const reference=sourceReferencedSpellAction(unit.quote);
    if(reference){
      const facts=resources(row,unit,plan,base),group=stagedSpellcastingGroups(plan).get(unit.id);
      if(group){
        if(row.攻击||row.豁免||row.范围||row.伤害.length||row.其他操作.length||row.距离.length||row.治疗.length||row.使用次数!==null||row.恢复方式!==null)
          fail('V2_REFERENCED_SPELL_COMBINATION_CONFLICT',path);
        if(row.施法){
          const cast=row.施法,entry=one(cast.法术,path);
          if(cast.属性!==group.ability||cast.豁免DC!==(group.saveDc??null)||cast.命中加值!==(group.attackBonus??null)
            ||cast.无需材料!==group.componentWaivers.some(w=>w.component==='material')||normalizedSourceSpellName(entry.名称)!==normalizedSourceSpellName(reference.name)
            ||entry.次数!==null||entry.恢复!=='随意'||!sameRestriction(entry.限制,reference.level===undefined?[]:['level '+reference.level+' version']))fail('V2_REFERENCED_SPELL_FACT_CONFLICT',path);
        }else{
          const literal=normalizedSourceSpellName(row.特殊规则??'').replace(/\s/gu,'');
          if(!literal.includes(normalizedSourceSpellName(reference.name).replace(/\s/gu,''))||!literal.includes(reference.parent.replace(/\s/gu,'')))
            fail('V2_REFERENCED_SPELL_OMITTED',path);
        }
        manualText(row.特殊规则,unit.quote,path);
        // Keep the original form proposal. Executable inheritance is separately
        // proved by the full source assembler, not fabricated as a local AI fact.
        return{schemaVersion:1,unitId:unit.id,mode:'manual',facts};
      }
      // An external/unsupported complete rule stays manual. Explicit supplied
      // casting mechanics still go through the existing strict validator.
    }
    if (!reference&&isSourceSpellcastingFeature(unit.quote)) return spellcasting(row, unit, plan,base);
    if (row.施法 !== null) validateManualSpellAction(row,unit,plan,base);
    const facts = resources(row, unit, plan, base);
    const all = [row, ...row.其他操作];
    const healing = all.flatMap(item => item.治疗);
    const literalHealing=new Set<V2Healing>();
    if (healing.length) {
      const known = stagedFeatureMechanics(unit.quote, unit.name!, base.creature.identity.name)?.facts;
      const multi = sourceHealingOperations(unit.quote);
      const expected = multi?.map(op => op.healing!) ?? (known?.healing ? [known.healing] : []);
      if (!expected.length) {
        const names=[base.creature.identity.name,base.creature.identity.englishName].filter((name):name is string=>!!name);
        for(const [index,item] of healing.entries()){
          if(item.公式===null){
            const binding=bindV2DynamicHealing(item,unit.quote,names,path+'/healing/'+index,makeV2FeatureIdentityScope(plan,unit.id));
            if(binding.targetStatus!=='verified')fail('V2_HEALING_TARGET_REVIEW_REQUIRED',path+'/healing/'+index);
          }else literalFixedHealing(item,unit.quote,names,path+'/healing/'+index);
          literalHealing.add(item);
        }
        // A non-executable recovery must not veto independent native attacks,
        // Saves or damage. The same complete source parent accompanies every
        // projection; this is an explicit boundary, never an error catch.
      } else {
      if (expected.length !== healing.length) fail('V2_HEALING_UNSUPPORTED', path + '/治疗');
      for (const [index, h] of healing.entries()) {
        const want = expected[index]!;
        if (formula(h.公式!) !== formula(want.formula) || (h.类型 === '治疗' ? 'healing' : 'temphp') !== want.type
          || /self|自身|自己/iu.test(h.目标) !== (want.target?.type === 'self')) fail('V2_HEALING_CONFLICT', path + '/治疗');
        manualText(h.生效条件, unit.quote, path + '/治疗');
      }
      for (const item of all) manualText(item.特殊规则, unit.quote, path + '/特殊规则');
      if (multi) return { schemaVersion: 1, unitId: unit.id, mode: 'native-with-gm', facts: { sourceOperations: bindSourceOperations(unit.quote, multi, unit.start), ...(facts.sharedUses ? { sharedUses: facts.sharedUses } : {}) } };
      // Single healing retains the established exact source-derived facts and
      // therefore the existing source-healing target/timing boundary.
      return { schemaVersion: 1, unitId: unit.id, mode: 'native-with-gm', facts: { ...facts, ...known } };
      }
    }
    const operations = all.flatMap((item, index) => {
      if (index) manualText(row.其他操作[index - 1]!.条件, unit.quote, path + '/其他操作/' + (index - 1));
      return operationsFor(item, unit, base, path + (index ? '/其他操作/' + (index - 1) : ''), index ? row.其他操作[index - 1]!.名称 : row.名称,literalHealing);
    });
    for (const [index, operation] of operations.entries()) {
      operation.id = 'v2-op-' + index;
      if (index > 0) {
        const previous=operations[index-1]!;
        const rangeChoice=operation.type==='attack'&&previous.type==='attack'&&operation.proof.attack===previous.proof.attack
          &&/\bMelee or Ranged (?:(?:Weapon|Spell) )?Attack(?: Roll)?:/iu.test(visible(operation.proof.attack!));
        operation.relationship = rangeChoice?'alternative':'follow-up'; operation.condition = unit.quote.trim();
        if(rangeChoice)previous.condition=unit.quote.trim();
      }
    }
    if (operations.length) {
      let bound: SourceOperation[];
      try { bound = bindSourceOperations(unit.quote, operations, unit.start); }
      catch (error) {
        const issue = error instanceof Error ? /^InvalidSourceOperations: ([A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)(?:, |$)/u.exec(error.message)?.[1] : undefined;
        fail('V2_SOURCE_OPERATION_CONFLICT', path + (issue ? '/' + issue : ''));
      }
      const established = stagedFeatureMechanics(unit.quote, unit.name!, base.creature.identity.name)?.facts;
      const flatSave = established?.save;
      // The established flat Save consumer supports some ordinary statuses
      // whose older prose is deliberately outside the richer OP status grammar.
      // Reuse that exact consumer only after the actual form's sole Save and
      // geometry match; no invented status or silently omitted roll is added.
      if (bound.length === 1 && bound[0]!.type === 'save' && !bound[0]!.damage?.length && flatSave
        && established.nativeFailureStatuses?.length && bound[0]!.save?.dc === flatSave.dc
        && bound[0]!.save?.abilities.length === 1 && bound[0]!.save!.abilities[0] === flatSave.ability
        && bound[0]!.save!.outcome === (flatSave.outcome ?? 'none') && bound[0]!.range === established.range
        && JSON.stringify(bound[0]!.aoe) === JSON.stringify(established.aoe)
        && established.nativeFailureStatuses.some(status => !bound[0]!.failureStatuses?.includes(status)))
        return { schemaVersion: 1, unitId: unit.id, mode: 'native-with-gm', facts: { ...facts, ...established } };
      return { schemaVersion: 1, unitId: unit.id, mode: 'native-with-gm', facts: { sourceOperations: bound, ...(facts.sharedUses ? { sharedUses: facts.sharedUses } : {}) } };
    }
    // Source basic-omission and full Monster validation remain mandatory at the
    // existing caller; a manual proposal itself cannot accept an omitted roll.
    return { schemaVersion: 1, unitId: unit.id, mode: 'manual', facts };
}
