import { FACT_LOCALIZATION_POLICY, localizationHash } from '@fvtt-json-generator/contracts/localization';
import { nativeLifecycleStatusLabel } from '@fvtt-json-generator/contracts/status-lifecycle';
import type { ActionData, SourceRuleFact, StructuredActionData } from '@fvtt-json-generator/models/action';
import { summarizeStructuredRule } from './structured-rule-summary';
import { normalizedSourceDamageParts } from './save-outcome';
import {parseSupportedRuleFacts} from '@fvtt-json-generator/models/source-rule-facts';

export type RuleDisplayPath = Array<string | number>;
export type RuleExecutionMode = 'native' | 'gm-assisted';
export interface ConsumedRuleAction {
  logicalPath: string;
  itemIndex: number;
  action: ActionData;
  sourceStructured?: StructuredActionData;
}
export interface RulePresentationFixedSegment {
  kind: 'fixed';
  source: string;
  zh: string;
  factRefs: string[];
  executionMode: RuleExecutionMode;
}
export interface RulePresentationProseSegment {
  kind: 'prose';
  source: string;
  review: 'normal' | 'gm-assisted';
}
export type RulePresentationSegment = RulePresentationFixedSegment | RulePresentationProseSegment;
export interface RulePresentationField {
  path: RuleDisplayPath;
  source: string;
  segments: RulePresentationSegment[];
}
export interface RulePresentationPlan {
  version: 1;
  policy: typeof FACT_LOCALIZATION_POLICY;
  sourceIdentityHash: string;
  templateHash: string;
  factsHash: string;
  mechanicalHash: string;
  sourceHash: string;
  blocks: Array<{ path: string; source: string; zh: string; factRefs: string[]; executionMode: RuleExecutionMode }>;
  proseSlots: Array<{ path: string; source: string; review: 'normal' | 'gm-assisted' }>;
  /** Structured facts whose source prose is still a GM-review boundary. */
  uncoveredMechanics: Array<{ path: string; source: string; summaryZh: string;
    factRefs: string[]; details: string[] }>;
  fields: RulePresentationField[];
}

const trustedPlans = new WeakSet<object>();
const planNormalizers = new WeakMap<object, (actor: any) => any>();
const TEMPLATE_VERSION = 'forge-complete-source-rules-20261013-v2';
const TEMPLATE_HASH = localizationHash(TEMPLATE_VERSION);
const DAMAGE_ZH: Record<string, string> = {
  acid: '强酸', bludgeoning: '钝击', cold: '寒冷', fire: '火焰', force: '力场',
  lightning: '闪电', necrotic: '暗蚀', piercing: '穿刺', poison: '毒素',
  psychic: '心灵', radiant: '光耀', slashing: '挥砍', thunder: '雷鸣',
};
const ABILITY_ZH: Record<string, string> = {
  strength: '力量', dexterity: '敏捷', constitution: '体质',
  intelligence: '智力', wisdom: '感知', charisma: '魅力',
  str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力',
};

export function normalizedRuleSourceIdentity(source: string): string {
  return source.replace(/^forge-source-id:[^\r\n]*(?:\r?\n|$)/gmu, '');
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function at(root: any, path: RuleDisplayPath): unknown {
  return path.reduce((value, key) => value?.[key], root);
}
function pathKey(path: RuleDisplayPath): string { return JSON.stringify(path); }
function mechanicalProjection(value: any): any {
  if (Array.isArray(value)) return value.map(mechanicalProjection);
  if (!value || typeof value !== 'object') return value;
  const projected: Record<string, any> = {};
  for (const key of Object.keys(value).sort()) {
    // Version timestamps and portraits/icons are display metadata. Keep
    // deterministic Effect IDs and Activity effect references: they bind
    // native execution, including which Activity applies which status.
    if (key === '_stats' || key === 'img') continue;
    projected[key] = mechanicalProjection(value[key]);
  }
  return projected;
}
function actorMechanicalHash(actor: any, normalizer: (actor: any) => any): string {
  return localizationHash(mechanicalProjection(normalizer(actor)));
}

interface VisibleText { text: string; positions: number[] }
/** HTML is display layout. The visible offset map lets one complete rule span adjacent li elements. */
function visibleText(source: string): VisibleText {
  let text = '';
  const positions: number[] = [];
  const append = (char: string, position: number) => {
    if (/\s/u.test(char)) {
      if (!text || text.endsWith(' ')) return;
      text += ' ';
    } else {
      text += char;
    }
    positions.push(position);
  };
  for (let index = 0; index < source.length;) {
    if (source[index] === '<') {
      const end = source.indexOf('>', index + 1);
      if (end >= 0) { append(' ', index); index = end + 1; continue; }
    }
    append(source[index]!, index);
    index++;
  }
  return { text, positions };
}

interface RuleMatch {
  start: number;
  end: number;
  zh: string;
  factRef: string;
  executionMode: RuleExecutionMode;
}
function normalizedFormula(value: string): string {
  return value.replace(/\s+/gu, '').replace(/[x×*]/giu, '*').toLowerCase();
}
function baseDamageMatches(action: ActionData | undefined, formula: string, damageType: string): boolean {
  if (!action) return false;
  const sourceParts = normalizedSourceDamageParts(action)?.filter(part => part.relationship === 'base' && !part.condition);
  const parts = sourceParts?.length ? sourceParts : action.attack?.damage ?? action.damage ?? [];
  return parts.some(part => normalizedFormula(part.formula) === normalizedFormula(formula)
    && part.type.toLowerCase() === damageType.toLowerCase());
}
function withMarkup(source: string, chinese: string, kind: string): string {
  // Generated li tags mark physical PDF line wraps, not rule boundaries.
  // The complete rule is one local block, so do not split Chinese words at
  // those source-only layout tags. The outer field markup remains intact.
  void source;
  void kind;
  return chinese;
}
function sourceRefersToActor(reference: string, actorName: string): boolean {
  const cleaned = (value: string) => value.toLowerCase().replace(/[^a-z ]/gu, ' ').replace(/\s+/gu, ' ').trim();
  const referent = cleaned(reference);
  const actor = cleaned(actorName);
  const first = actor.split(' ')[0] ?? '';
  return referent === actor || first.length >= 5 && referent === first;
}
function hasNextTurnEndStatus(structured: StructuredActionData | undefined, status: string): boolean {
  return structured?.embeddedEffects?.some(effect =>
    effect.type.toLowerCase() === status
    && effect.duration?.replace(/\s+/gu, ' ').trim().toLowerCase()
      === 'until the end of its next turn') ?? false;
}
function renderFact(fact: SourceRuleFact, action: ActionData | undefined,
  actorName: string, structured?: StructuredActionData): { zh: string; mode: RuleExecutionMode } | undefined {
  if (fact.kind === 'attack-damage') {
    const sourceRange = /\d+(?:\/\d+)?/u.exec(fact.distance)?.[0];
    const actorRange = /\d+(?:\/\d+)?/u.exec(action?.attack?.reach ?? action?.attack?.range ?? '')?.[0];
    if (!action?.attack || action.attack.type !== fact.attackType || action.attack.toHit !== fact.toHit
      || !baseDamageMatches(action, fact.formula, fact.damageType)
      || !sourceRange || sourceRange !== actorRange) return undefined;
    const kind = fact.attackType === 'mwak' ? '近战' : '远程';
    const distance = fact.attackType === 'mwak' ? '触及' + sourceRange + '尺' : '射程' + sourceRange + '尺';
    return { zh: kind + '武器攻击：命中加值' + (fact.toHit >= 0 ? '+' : '') + fact.toHit + '，' + distance
      + '，一个目标。命中：目标受到' + fact.average + '（' + fact.formula
      + '）点' + DAMAGE_ZH[fact.damageType] + '伤害。', mode: 'native' };
  }
  if (fact.kind === 'save-damage') {
    if (!action?.save || action.save.dc !== fact.dc || action.save.ability !== fact.ability
      || !baseDamageMatches(action, fact.formula, fact.damageType)
      || fact.halfOnSuccess && action.save.outcome !== 'half') return undefined;
    const target = fact.targetScope.kind === 'target' ? '目标'
      : fact.targetScope.kind === 'area' ? '区域内的每个生物'
        : fact.targetScope.feet + '尺内的每个生物';
    return { zh: target + '必须进行一次DC ' + fact.dc + ABILITY_ZH[fact.ability]
      + '豁免。失败：受到' + fact.average + '（' + fact.formula
      + '）点' + DAMAGE_ZH[fact.damageType] + '伤害。'
      + (fact.halfOnSuccess ? '成功：伤害减半。' : ''), mode: 'native' };
  }
  if (fact.kind === 'save-status') {
    if (!action?.save || action.save.dc !== fact.dc || action.save.ability !== fact.ability
      || !hasNextTurnEndStatus(structured, fact.appliedStatus)) return undefined;
    const margin = fact.failureMarginDropToZero === undefined ? ''
      : '；若失败差值达到' + fact.failureMarginDropToZero + '或以上，该生物生命值降至0';
    return { zh: fact.withinFeet + '尺内一名已处于' + nativeLifecycleStatusLabel(fact.requiredTargetStatus)
      + '状态的生物必须进行一次DC ' + fact.dc + ABILITY_ZH[fact.ability]
      + '豁免；失败则陷入' + nativeLifecycleStatusLabel(fact.appliedStatus)
      + '，直到其下一回合结束' + margin + '（由GM处理）。', mode: 'gm-assisted' };
  }
  if (fact.kind === 'save-damage-status') {
    if (!action?.save || action.save.dc !== fact.dc || action.save.ability !== fact.ability
      || action.save.outcome !== 'half' || !baseDamageMatches(action, fact.formula, fact.damageType)
      || !hasNextTurnEndStatus(structured, fact.appliedStatus)) return undefined;
    return { zh: '迫使来源生物周围' + fact.withinFeet
      + '尺内的每个生物进行一次DC ' + fact.dc + ABILITY_ZH[fact.ability]
      + '豁免；失败则受到' + fact.average + '（' + fact.formula + '）点'
      + DAMAGE_ZH[fact.damageType] + '伤害，并陷入'
      + nativeLifecycleStatusLabel(fact.appliedStatus)
      + '状态直到其下一回合结束；成功则伤害减半。', mode: 'gm-assisted' };
  }
  if (fact.kind === 'visible-target-save-damage') {
    const viewer = fact.viewer.toLowerCase().replace(/[^a-z ]/gu, ' ').trim();
    const actorNameParts = actorName.toLowerCase().replace(/[^a-z ]/gu, ' ').trim().split(/\s+/gu);
    const viewerParts = viewer.split(/\s+/gu);
    const viewerMatches = viewer.length >= 3 && actorNameParts.some((_, index) =>
      viewerParts.every((part, offset) => actorNameParts[index + offset] === part));
    const parts = (action && normalizedSourceDamageParts(action)?.filter(part =>
      (part.relationship === 'base' || part.relationship === 'additional') && !part.condition))
      ?? action?.damage ?? [];
    if (!viewerMatches || !action?.save || action.save.dc !== fact.dc
      || action.save.ability !== fact.ability || action.save.outcome !== 'half'
      || parts.length !== fact.damages.length
      || fact.damages.some((part, index) => normalizedFormula(parts[index]!.formula) !== normalizedFormula(part.formula)
        || parts[index]!.type.toLowerCase() !== part.damageType)) return undefined;
    const damages = fact.damages.map(part => part.average + '（' + part.formula + '）点'
      + DAMAGE_ZH[part.damageType] + '伤害').join('，外加');
    return { zh: '该能力来源者看得见且位于' + fact.withinFeet
      + '尺内的一名生物必须进行一次DC ' + fact.dc + ABILITY_ZH[fact.ability]
      + '豁免。失败：受到' + damages + '。成功：伤害减半。',
    mode: 'native' };
  }
  if (fact.kind === 'heavy-armour-half') {
    if (!sourceRefersToActor(fact.grappler, actorName)
      || !baseDamageMatches(action, fact.formula, fact.damageType)) return undefined;
    const target = fact.targetCondition === 'grappled' ? '被该怪物擒抱的生物' : '被该怪物束缚的生物';
    const condition = fact.armourNegated ? '未穿着重甲' : '穿着重甲';
    return { zh: target + '受到' + fact.average + '（' + fact.formula + '）点'
      + DAMAGE_ZH[fact.damageType] + '伤害；若其' + condition
      + '，则伤害减半（由GM处理）。', mode: 'gm-assisted' };
  }
  if (fact.kind === 'food-retention') {
    return { zh: '该生物只有用海水送服，才能留住固体食物而不吐出。', mode: 'gm-assisted' };
  }
  if (fact.kind === 'target-choice-save') {
    if(structured?.sourceOperations){
      const choice=structured.sourceOperations.find(op=>op.save?.dc===fact.dc&&op.save.choice==='target'&&JSON.stringify([...op.save.abilities].sort())===JSON.stringify(['int','wis']));
      if(!choice||fact.targetScope.kind==='area'&&(choice.aoe?.shape!=='radius'||choice.aoe.radius!==fact.targetScope.feet))return undefined;
    }else if (action?.type !== 'utility' || action.save) return undefined;
    const duration = fact.duration.value + ({ minute: '分钟', round: '轮', hour: '小时' } as const)[fact.duration.unit];
    const when = fact.repeatAt === 'end' ? '结束时' : '开始时';
    const target = fact.targetScope.kind === 'area' ? fact.targetScope.feet + '尺光环区域内的每个生物'
      : fact.targetScope.feet + '尺内' + (fact.targetScope.mustSeeSource ? '能看见来源生物的' : '的') + '每个生物';
    return { zh: target + '自行选择进行一次DC ' + fact.dc + '智力或感知豁免；失败则陷入'
      + nativeLifecycleStatusLabel(fact.failedStatus) + '，持续' + duration
      + '。其每回合' + when + '可再次豁免，成功则结束此状态（由GM处理）。',
    mode: 'gm-assisted' };
  }
  if (fact.kind === 'forced-movement') {
    if (!sourceRefersToActor(fact.origin, actorName)
      || !action?.save || action.save.dc !== fact.dc || action.save.ability !== fact.ability) return undefined;
    const distance = fact.distance + (fact.distanceFormula
      ? '（' + fact.distanceFormula.replace(/[x*]/giu, '×') + '）' : '');
    return { zh: '该' + (fact.target === 'target' ? '目标' : '生物') + '必须进行一次DC '
      + fact.dc + ABILITY_ZH[fact.ability] + '豁免；失败则远离来源生物被推离'
      + distance + '尺（由GM处理）。', mode: 'gm-assisted' };
  }
  return undefined;
}
function escapeHtml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
}
function effectSummary(effect: any, logicalPath: string): RulePresentationFixedSegment | undefined {
  const statuses: string[] = Array.isArray(effect?.statuses) ? effect.statuses.filter((s: unknown) => typeof s === 'string') : [];
  if (!statuses.length) return undefined;
  return { kind: 'fixed', source: '',
    zh: '<p>【已核实状态】' + escapeHtml(statuses.map(nativeLifecycleStatusLabel).join('、')) + '。</p>',
    factRefs: [logicalPath + '/effect/status'], executionMode: 'gm-assisted' };
}
function matchesFor(source: string, facts: readonly SourceRuleFact[], action: ActionData | undefined,
  logicalPath: string, actorName: string, structured?: StructuredActionData): RuleMatch[] {
  const visible = visibleText(source);
  const matches: RuleMatch[] = [];
  for (const fact of facts) {
    const rendered = renderFact(fact, action, actorName, structured);
    if (!rendered) continue;
    const normalized = fact.source.replace(/\s+/gu, ' ').trim();
    let cursor = 0;
    for (let occurrence = 0;; occurrence++) {
      const startVisible = visible.text.toLowerCase().indexOf(normalized.toLowerCase(), cursor);
      if (startVisible < 0) break;
      const endVisible = startVisible + normalized.length - 1;
      cursor = endVisible + 1;
      const start = visible.positions[startVisible];
      const end = visible.positions[endVisible];
      if (start === undefined || end === undefined) continue;
      const raw = source.slice(start, end + 1);
      matches.push({ start, end: end + 1, zh: withMarkup(raw, rendered.zh, fact.kind),
        factRef: logicalPath + '/' + fact.kind + '/' + localizationHash(fact).slice(0, 12)
          + '/occurrence/' + occurrence,
        executionMode: rendered.mode });
    }
    if (fact.kind === 'target-choice-save' && fact.targetScope.kind === 'area') {
      const rangePattern = new RegExp('\\b' + fact.targetScope.feet + '-\\s*foot Emanation\\b', 'giu');
      for (const [occurrence, range] of [...visible.text.matchAll(rangePattern)].entries()) {
        const rangeAt = range.index!;
        const rawStart = visible.positions[rangeAt];
        const rawEnd = visible.positions[rangeAt + range[0].length - 1];
        if (rawStart !== undefined && rawEnd !== undefined) matches.push({
          start: rawStart, end: rawEnd + 1, zh: fact.targetScope.feet + '尺光环',
          factRef: logicalPath + '/' + fact.kind + '/' + localizationHash(fact).slice(0, 12)
            + '/area/occurrence/' + occurrence,
          executionMode: 'gm-assisted',
        });
      }
    }
  }

  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const accepted: RuleMatch[] = [];
  for (const match of matches) {
    const previous = accepted.at(-1);
    if (previous && match.start < previous.end) {
      if (match.end > previous.end) throw new TypeError('已支持规则来源片段交叠，必须核对。');
      continue;
    }
    accepted.push(match);
  }
  return accepted;
}
function segmentsFor(source: string, facts: readonly SourceRuleFact[], action: ActionData | undefined,
  logicalPath: string, actorName: string, structured?: StructuredActionData): RulePresentationSegment[] {
  const matches = matchesFor(source, facts, action, logicalPath, actorName, structured);
  const segments: RulePresentationSegment[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) segments.push({ kind: 'prose', source: source.slice(cursor, match.start), review: 'gm-assisted' });
    segments.push({ kind: 'fixed', source: source.slice(match.start, match.end), zh: match.zh,
      factRefs: [match.factRef], executionMode: match.executionMode });
    cursor = match.end;
  }
  if (cursor < source.length) segments.push({ kind: 'prose', source: source.slice(cursor), review: 'gm-assisted' });
  return matches.length ? segments : [];
}

/** The same action objects consumed by the Actor generator supply the fixed presentation facts. */
export function createRulePresentationPlan(input: {
  sourceActor: any;
  sourceIdentity: string;
  consumedActions: readonly ConsumedRuleAction[];
  biographyFacts: readonly SourceRuleFact[];
  actorNormalizer?: (actor: any) => any;
}): RulePresentationPlan {
  const fields: RulePresentationField[] = [];
  const uncoveredMechanics: RulePresentationPlan['uncoveredMechanics'] = [];
  const add = (path: RuleDisplayPath, facts: readonly SourceRuleFact[], action: ActionData | undefined,
    logicalPath: string, structured?: StructuredActionData) => {
    const source = at(input.sourceActor, path);
    if (typeof source !== 'string' || !source.trim()) return;
    const segments:RulePresentationSegment[] = source==='targets it can see'&&action?.activity?.targetSpecial===source
      ? [{kind:'fixed',source,zh:'目标必须在该生物视线内',factRefs:[logicalPath+'/activity/targetSpecial'],executionMode:'native'}]
      : segmentsFor(source, facts, action, logicalPath, String(input.sourceActor.name ?? ''), structured);
    if (segments.length && segments.some(segment => segment.kind === 'fixed')) fields.push({ path, source, segments });
  };
  add(['system', 'details', 'biography', 'value'], input.biographyFacts, undefined, 'actor/biography');
  for (const entry of input.consumedActions) {
    const itemPath: RuleDisplayPath = ['items', entry.itemIndex];
    // These facts describe already-generated output. They never re-enter the
    // native inference path used to build the empty carrier for typed OPs.
    const facts = entry.sourceStructured?.sourceOperations?parseSupportedRuleFacts(entry.sourceStructured.describe??''):entry.action.sourceRuleFacts ?? [];
    const generatedItem = at(input.sourceActor, itemPath);
    const summary = summarizeStructuredRule({ logicalPath: entry.logicalPath, action: entry.action,
      sourceAction: entry.sourceStructured, generatedItem });
    add([...itemPath, 'system', 'description', 'value'], facts, entry.action, entry.logicalPath, entry.sourceStructured);
    if (summary && (!fields.some(field => pathKey(field.path) === pathKey([...itemPath, 'system', 'description', 'value']))
      || summary.uncovered.length)) {
      uncoveredMechanics.push({ path: pathKey([...itemPath, 'system', 'description', 'value']),
        source: String(at(input.sourceActor, [...itemPath, 'system', 'description', 'value']) ?? ''),
        summaryZh: summary.zh, factRefs: summary.factRefs, details: [...summary.uncovered] });
    }
    const chatPath: RuleDisplayPath = [...itemPath, 'system', 'description', 'chat'];
    if (summary && at(input.sourceActor, chatPath) === '') {
      fields.push({ path: chatPath, source: '', segments: [{ kind: 'fixed', source: '',
        zh: '<p>【结构化事实供GM核对】' + escapeHtml(summary.zh) + '</p>',
        factRefs: [...summary.factRefs], executionMode: summary.executionMode }] });
    }
    else add(chatPath, facts, entry.action, entry.logicalPath, entry.sourceStructured);
    const activities = at(input.sourceActor, [...itemPath, 'system', 'activities']) as Record<string, any> | undefined;
    for (const key of Object.keys(activities ?? {})) {
      add([...itemPath, 'system', 'activities', key, 'description', 'chatFlavor'], facts, entry.action, entry.logicalPath, entry.sourceStructured);
      add([...itemPath, 'system', 'activities', key, 'activation', 'condition'], facts, entry.action, entry.logicalPath, entry.sourceStructured);
      add([...itemPath, 'system', 'activities', key, 'range', 'special'], facts, entry.action, entry.logicalPath, entry.sourceStructured);
      add([...itemPath, 'system', 'activities', key, 'target', 'affects', 'special'], facts, entry.action, entry.logicalPath, entry.sourceStructured);
    }
    const effects = at(input.sourceActor, [...itemPath, 'effects']) as any[] | undefined;
    for (const [index, effect] of (effects ?? []).entries()) {
      const effectPath: RuleDisplayPath = [...itemPath, 'effects', index, 'description'];
      add(effectPath, facts, entry.action, entry.logicalPath, entry.sourceStructured);
      const statusSummary = effectSummary(effect, entry.logicalPath);
      if (statusSummary && typeof effect?.description === 'string' && effect.description.trim()) {
        const planned = fields.find(field => pathKey(field.path) === pathKey(effectPath));
        if (planned) planned.segments.push(statusSummary);
        else fields.push({ path: effectPath, source: effect.description,
          segments: [{ kind: 'prose', source: effect.description, review: 'gm-assisted' }, statusSummary] });
        if (!planned) uncoveredMechanics.push({ path: pathKey(effectPath),
          source: effect.description, summaryZh: statusSummary.zh,
          factRefs: statusSummary.factRefs, details: ['完整效果描述须由GM核对'] });
      }
    }
    const mechanics = at(input.sourceActor,
      [...itemPath, 'flags', 'fvttJsonGenerator', 'behaviorMechanics']) as any[] | undefined;
    for (const [mechanicIndex, mechanic] of (mechanics ?? []).entries()) {
      for (const [stepIndex] of (mechanic?.gmSteps ?? []).entries()) {
        add([...itemPath, 'flags', 'fvttJsonGenerator', 'behaviorMechanics', mechanicIndex,
          'gmSteps', stepIndex], facts, entry.action, entry.logicalPath, entry.sourceStructured);
      }
      add([...itemPath, 'flags', 'fvttJsonGenerator', 'behaviorMechanics', mechanicIndex,
        'trigger', 'condition'], facts, entry.action, entry.logicalPath, entry.sourceStructured);
      add([...itemPath, 'flags', 'fvttJsonGenerator', 'behaviorMechanics', mechanicIndex,
        'externalRule', 'result'], facts, entry.action, entry.logicalPath, entry.sourceStructured);
    }
  }
  const sourceIdentityHash = localizationHash(normalizedRuleSourceIdentity(input.sourceIdentity));
  const normalizer = input.actorNormalizer ?? ((actor: any) => actor);
  const mechanicalHash = actorMechanicalHash(input.sourceActor, normalizer);
  const factsHash = localizationHash({ biographyFacts: input.biographyFacts,
    actions: input.consumedActions.map(entry => ({
    logicalPath: entry.logicalPath, itemIndex: entry.itemIndex,
    attack: entry.action.attack, save: entry.action.save, damage: entry.action.damage,
    sourceDamageParts: entry.action.sourceDamageParts, target: entry.action.targetAffected,
    activity: entry.action.activity, description: entry.action.desc, sourceRuleFacts: entry.action.sourceRuleFacts,
    sourceStructured: entry.sourceStructured,
  })) });
  const sourceHash = localizationHash({
    sourceIdentityHash, templateHash: TEMPLATE_HASH, factsHash, mechanicalHash,
    fields: fields.map(field => ({ path: field.path, source: field.source, segments: field.segments })),
    uncoveredMechanics,
  });
  const blocks = fields.flatMap(field => field.segments.filter(segment => segment.kind === 'fixed').map(segment => ({
    path: pathKey(field.path), source: segment.source, zh: segment.zh,
    factRefs: [...segment.factRefs], executionMode: segment.executionMode,
  })));
  const proseSlots = fields.flatMap(field => field.segments.filter(segment => segment.kind === 'prose').map(segment => ({
    path: pathKey(field.path), source: segment.source, review: segment.review,
  })));
  const plan = freeze({ version: 1, policy: FACT_LOCALIZATION_POLICY, sourceIdentityHash,
    templateHash: TEMPLATE_HASH, factsHash, mechanicalHash, sourceHash,
    blocks, proseSlots, uncoveredMechanics, fields }) as RulePresentationPlan;
  trustedPlans.add(plan);
  planNormalizers.set(plan, normalizer);
  return plan;
}

/** A deserialized or stale plan cannot grant localization or GM approval. */
export function assertRulePresentationPlan(plan: RulePresentationPlan | undefined, actor: any, sourceIdentity: string): asserts plan is RulePresentationPlan {
  if (!plan || !trustedPlans.has(plan) || plan.version !== 1 || plan.policy !== FACT_LOCALIZATION_POLICY
    || plan.templateHash !== TEMPLATE_HASH
    || plan.sourceIdentityHash !== localizationHash(normalizedRuleSourceIdentity(sourceIdentity))
    || plan.mechanicalHash !== actorMechanicalHash(actor, planNormalizers.get(plan)!)
    || plan.fields.some(field => at(actor, field.path) !== field.source)) {
    throw new TypeError('规则事实与当前来源或Actor不一致，必须重新生成。');
  }
}
export function rulePresentationField(plan: RulePresentationPlan, path: RuleDisplayPath): RulePresentationField | undefined {
  return plan.fields.find(field => pathKey(field.path) === pathKey(path));
}
