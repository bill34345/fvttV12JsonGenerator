import { sourceActorNameMatches, sourceOperationClauses } from '@fvtt-json-generator/models/source-operations';
import { StagedExtractionError } from './staged-source';
import type { V2Healing } from './category-form-v2';
import { bindV2SelfReference, bindV2SourceFeatureReference, type V2FeatureIdentityScope } from './category-form-v2-identity';

export interface V2DynamicHealingBinding {
  sourceQuote: string;
  damageType: string;
  recipient: 'self';
  /** An unbound translated proper name is never evidence of acceptance. */
  targetStatus: 'verified' | 'unresolved-translation';
  proposedTarget: string;
}

const labels: Record<string, string> = {
  acid: 'acid|强酸|酸蚀', bludgeoning: 'bludgeoning|钝击', cold: 'cold|冷冻|寒冷', fire: 'fire|火焰',
  force: 'force|力场', lightning: 'lightning|闪电', necrotic: 'necrotic|黯蚀|死灵|暗蚀|坏死',
  piercing: 'piercing|穿刺', poison: 'poison|毒素', psychic: 'psychic|心灵',
  radiant: 'radiant|光耀|辐射', slashing: 'slashing|挥砍', thunder: 'thunder|雷鸣',
};
const types = Object.keys(labels).join('|');
const visible = (value: string) => value.normalize('NFKC').replace(/[*_]/gu, '').replace(/\s+/gu, ' ').trim();
const bare = (value: string) => visible(value).replace(/[.。]$/u, '');
const roll = String.raw`(?:\d+(?:\s*\(\s*\d+d\d+(?:\s*[+\-]\s*\d+)?\s*\))?|\d+d\d+(?:\s*[+\-]\s*\d+)?)`;
const damage = `${roll}\\s+(?:${types})\\s+damage`;
const hit = new RegExp(`^Hit:\\s*${damage}(?:\\s+plus\\s+${damage})*$`, 'iu');
const failure = new RegExp(`^Failure:\\s*${damage}(?:\\s+plus\\s+${damage})*$`, 'iu');
const takes = new RegExp(`^The target takes\\s+${damage}$`, 'iu');

function fail(code: string, path: string): never {
  throw new StagedExtractionError(code, path.split('/').map(part => part === '治疗' ? 'healing' : part).join('/'));
}

interface Relation {
  quote: string;
  type: string;
  owner: string;
  hit: boolean;
  maximumReduction: boolean;
}

/** Deliberately closed literal relationships. "That amount" is authorized only
 * by its one adjacent, typed actual-damage antecedent, never by a nearby roll.
 * Other amounts/conditions require a richer contract rather than a guess. */
function sourceRelation(source: string, actorNames: readonly string[], path: string): Relation {
  const clauses = sourceOperationClauses(source);
  const events = clauses.flatMap((quote, index) => /\b(?:regains?|gains?)\s+(?:temporary\s+)?hit points?\s+equal to\b/iu.test(visible(quote)) ? [{ quote, index }] : []);
  if (events.length !== 1) fail('V2_HEALING_SOURCE_RELATION_UNSUPPORTED', path);
  const { quote, index } = events[0]!, text = bare(quote);
  const bridge = new RegExp(`^The target['’]s hit point maximum (?:is reduced|decreases) by an amount equal to the (${types}) damage taken, and (.+?) regains hit points equal to that amount$`, 'iu').exec(text);
  const direct = new RegExp(`^(.+?) regains hit points equal to the (${types}) damage (?:taken by the target|dealt to the target|the target (?:takes|has taken))$`, 'iu').exec(text);
  const inline = new RegExp(`^(The target takes ${roll}\\s+(${types}) damage), and (.+?) regains hit points equal to that damage$`, 'iu').exec(text);
  const type = (bridge?.[1] ?? direct?.[2] ?? inline?.[2])?.toLowerCase();
  const owner = bridge?.[2] ?? direct?.[1] ?? inline?.[3];
  if (!type || !owner) fail('V2_HEALING_SOURCE_RELATION_UNSUPPORTED', path);
  if (!sourceActorNameMatches(owner, actorNames)) fail('V2_HEALING_SOURCE_OWNER_UNPROVEN', path);
  // An additional source healing prohibition/timing is not erased by matching
  // the equal-amount sentence. The complete parent still belongs to the GM.
  if (clauses.some((clause, at) => at !== index && /\b(?:regains?|gains?|heals?|healing|restores?)\b/iu.test(visible(clause))))
    fail('V2_HEALING_SOURCE_CONDITION_UNSUPPORTED', path);
  const previous = clauses[index - 1], event = inline?.[1] ?? (previous ? bare(previous) : '');
  const eventIsHit = hit.test(event);
  if (!eventIsHit && !failure.test(event) && !takes.test(event)) fail('V2_HEALING_DAMAGE_ANTECEDENT_UNPROVEN', path);
  if ([...event.matchAll(new RegExp(`\\b${type}\\s+damage\\b`, 'giu'))].length !== 1)
    fail('V2_HEALING_DAMAGE_ANTECEDENT_UNPROVEN', path);
  // Keep exact source bytes, including wrapped lines, for independent review.
  const start = source.indexOf(inline ? quote : previous!), end = source.indexOf(quote) + quote.length;
  if (start < 0 || source.indexOf(quote, source.indexOf(quote) + 1) !== -1
    || !inline && source.indexOf(previous!) !== source.lastIndexOf(previous!))
    fail('V2_HEALING_SOURCE_RELATION_UNSUPPORTED', path);
  return { quote: source.slice(start, end), type, owner, hit: eventIsHit, maximumReduction: !!bridge };
}

function relationMatches(value: string, relation: Relation): boolean {
  let text = bare(value);
  // This explanatory equivalence is accepted only when the source actually
  // binds the maximum reduction to the same damage amount.
  const reduction = /\s*\(即目标生命值上限降低的数值\)$/u;
  if (reduction.test(text)) {
    if (!relation.maximumReduction) return false;
    text = text.replace(reduction, '');
  }
  const type = labels[relation.type]!;
  const chinese = new RegExp(`^(?:等于|等同于|等同)?目标(?:(?:因|由)(?:本|这次|该次|此次|本次)攻击)?(?:此次|这次|该次|本次)?(?:实际)?(?:受到|承受|所受)的?(?:${type})伤害的?(?:实际)?(?:数值|量)?$`, 'iu');
  const english = new RegExp(`^(?:equal to )?(?:the )?(?:actual (?:amount of )?)?(?:${type}) damage (?:taken by the target|dealt to the target|the target (?:actually )?(?:takes|has taken))$`, 'iu');
  return chinese.test(text) || english.test(text);
}

function conditionMatches(value: string | null, relation: Relation): boolean {
  if (value === null) return false;
  const text = bare(value), type = labels[relation.type]!;
  // A proved Hit owns this damage event. The separately verified relation
  // still uses actual damage (including zero), never the printed roll.
  if (relation.hit && /^(?:命中时|命中后|on (?:a )?hit|after (?:a )?hit)$/iu.test(text)) return true;
  const chinese = new RegExp(`^(?:命中(?:并|且))?(?:造成|目标(?:实际)?(?:受到|承受))(?:(?:该|此|本|这)次)?(?:${type})伤害(?:后|时)$`, 'iu');
  const english = new RegExp(`^(?:when|after) (?:the target (?:actually )?(?:takes|has taken) (?:${type}) damage|(?:a hit deals?|dealing) (?:${type}) damage)$`, 'iu');
  if (/命中|\bhit\b/iu.test(text) && !relation.hit) return false;
  // "Dealing" without a hit or explicit damaged target could name a different
  // event. Require the condition's actual target or this source's hit.
  return (chinese.test(text) || english.test(text))
    && (relation.hit || /目标|\bthe target\b/iu.test(text));
}

function currentReference(reference: string, source: string, scope: V2FeatureIdentityScope, path: string): void {
  const bareReference = reference.replace(/^\[([^\[\]]+)\]$/u, '$1').trim();
  const binding = bindV2SourceFeatureReference(bareReference, scope, path);
  if (binding.unitId !== scope.currentUnitId || binding.sourceQuote !== source)
    fail('V2_HEALING_EVENT_REFERENCE_CONFLICT', path);
}

// Formatting marks inside an explicit identity are not discarded: D_rain is
// not evidence for the source name Drain, even if prose comparison ignores
// Markdown emphasis elsewhere.
const referenceText = (value: string) => value.normalize('NFKC').replace(/\s+/gu, ' ').trim().replace(/[.。]$/u, '');

/** The reference syntax lives in existing text fields. Brackets delimit an ID
 * or full source name; an unbracketed full name is accepted in the same closed
 * phrase. Rewriting here only checks the established relation grammar. It
 * never rewrites the provider reply, source or resulting rule text. */
function referencedRelationMatches(value: string, relation: Relation, source: string, scope: V2FeatureIdentityScope, path: string): boolean {
  const text = referenceText(value);
  const chinese = /^(?:等于|等同于|等同)?目标(?:因|由)(?:(?:这次|该次|此次|本次|本))?(\[[^\[\]]+\]|.+?)(?:实际)?(?:受到|承受|所受)的?(.+)$/u.exec(text);
  if (chinese) {
    currentReference(chinese[1]!, source, scope, path);
    return relationMatches('等于目标因本攻击所受' + chinese[2]!, relation);
  }
  const english = /^(.*?\bdamage (?:taken by the target|dealt to the target|the target (?:actually )?(?:takes|has taken))) by (\[[^\[\]]+\]|.+)$/iu.exec(text);
  if (!english) return false;
  currentReference(english[2]!, source, scope, path);
  return relationMatches(english[1]!, relation);
}

function referencedConditionMatches(value: string | null, relation: Relation, source: string, scope: V2FeatureIdentityScope, path: string): boolean {
  if (value === null) return false;
  const text = referenceText(value);
  const chinese = /^(\[[^\[\]]+\]|.+?)\s*(命中(?:并|且).+|目标(?:实际)?(?:受到|承受).+)$/u.exec(text);
  if (chinese) {
    currentReference(chinese[1]!, source, scope, path);
    return conditionMatches(chinese[2]!, relation);
  }
  const english = /^(when|after) (\[[^\[\]]+\]|.+?) hits? and deals? (.+)$/iu.exec(text);
  if (!english) return false;
  currentReference(english[2]!, source, scope, path);
  return conditionMatches(`${english[1]} a hit deals ${english[3]}`, relation);
}

/** The old CLI/parser Heal requires a fixed formula; manufacturing one from
 * actual damage changes the rule. This is source binding for the existing
 * native-with-gm/full-parent consumer only. It never creates native Heal,
 * automatic recovery, maximum-HP changes, or a replacement damage formula. */
export function bindV2DynamicHealing(healing: V2Healing, source: string, actorNames: readonly string[], path: string, scope?: V2FeatureIdentityScope): V2DynamicHealingBinding {
  if (healing.公式 !== null || healing.取值依据 === null) fail('V2_DYNAMIC_HEALING_UNSUPPORTED', path);
  if (healing.类型 !== '治疗') fail('V2_HEALING_TYPE_CONFLICT', path);
  if (scope) currentReference(scope.currentUnitId, source, scope, path);
  const relation = sourceRelation(source, actorNames, path);
  if (!relationMatches(healing.取值依据, relation)
    && !(scope && referencedRelationMatches(healing.取值依据, relation, source, scope, path))) fail('V2_HEALING_RELATION_CONFLICT', path);
  if (!conditionMatches(healing.生效条件, relation)
    && !(scope && referencedConditionMatches(healing.生效条件, relation, source, scope, path))) fail('V2_HEALING_CONDITION_CONFLICT', path);
  return { sourceQuote: relation.quote, damageType: relation.type,
    ...bindV2SelfReference(healing.目标, actorNames, path) };
}
