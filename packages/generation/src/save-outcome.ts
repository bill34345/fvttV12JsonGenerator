import type { SaveOutcome, SourceDamagePart } from '@fvtt-json-generator/models/action';

// Save-outcome normalization is part of the source-to-document projection boundary.

const ORDINARY_HALF_FAILURE_LABEL = /^(?:Failure(?:\s*\(\s*half\s+(?:as\s+much\s+)?damage\s+on\s+(?:a\s+)?Success\s*\))?|on\s+a\s+failed\s+save)$/iu;

function completeOrdinaryFailureDamage(parts: SourceDamagePart[], failure: string): boolean {
  // Source-derived: match the whole ordered damage declaration at the start of
  // ordinary Failure. Searching after a comma/plus can erase a prerequisite.
  if (!parts.length || parts.some(part => !['base', 'additional'].includes(part.relationship)
    || part.condition && !ORDINARY_HALF_FAILURE_LABEL.test(part.condition.trim()))) return false;
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const expressions = parts.map(part => {
    const formula = part.formula.replace(/\s+/gu, '').split('').map(escape).join('\\s*');
    return '(?:\\d+\\s*\\(\\s*' + formula + '\\s*\\)|' + formula + ')\\s+'
      + escape(part.type) + '\\s+damage\\b';
  });
  const declaration = new RegExp('^\\s*' + expressions.join('\\s+(?:plus|and)\\s+'), 'iu').exec(failure);
  if (!declaration) return false;
  const remainder = failure.slice(declaration[0].length).trim();
  if (/^[.!?]?$/u.test(remainder)) return true;
  // Source-derived: fully consume the known independent non-damage
  // consequences. Their state/lifecycle remains GM prose. An arbitrary tail,
  // another damage clause or a prerequisite is not proof of independence.
  if (/^(?:and|,)\s+(?:the\s+)?(?:creature|target)\s+(?:is|becomes)\s+(?:Cursed|Charmed)[.!]?$/iu.test(remainder)) return true;
  if (/^(?:and|,)\s+(?:the\s+)?(?:creature|target)\s+is\s+Cursed\.\s*The\s+Cursed\s+(?:creature|target)\s+can't\s+be\s+returned\s+to\s+life\s+by\s+any\s+means\s+short\s+of\s+a\s+Wish\s+spell\.\s*If\s+(?:this|the)\s+curse\s+is\s+removed,\s*(?:the\s+)?(?:creature|target)\s+dies[.!]?$/iu.test(remainder)) return true;
  return /^,\s*(?:the\s+)?(?:creature|target)\s+is\s+Charmed\s+by\s+(?:the\s+)?[\p{L}\p{N}'-]+(?:\s+[\p{L}\p{N}'-]+){0,7},\s*and\s+it\s+is\s+hostile\s+to\s+all\s+other\s+creatures\s+until\s+the\s+end\s+of\s+its\s+next\s+turn[.!]?$/iu.test(remainder);
}

/** Source-derived: a settlement label is not an additional damage trigger. */
export function normalizedSourceDamageParts(action: Record<string, any>): SourceDamagePart[] | undefined {
  const parts = action.sourceDamageParts as SourceDamagePart[] | undefined;
  if (!parts) return undefined;
  const text = String(action.describe ?? action.desc ?? '').replace(/\s+/gu, ' ').trim();
  const successes = [...text.matchAll(/(?:^|[.!?])\s*Success\s*:\s*([\s\S]*?)(?=\b(?:Failure|Success)\s*:|$)/giu)];
  const failures = [...text.matchAll(/(?:^|[.!?])\s*Failure\s*:\s*([\s\S]*?)(?=\b(?:Success|Failure(?:\s+by[^:]+)?)\s*:|$)/giu)];
  const halfSuccess = (text.match(/\bSuccess\s*:/giu)?.length ?? 0) === 1
    && successes.length === 1 && /^half\s+(?:as\s+much\s+)?damage[.!]?$/iu.test(successes[0]![1]!.trim());
  const hasSave = !action.attack && action.type !== 'attack' && (action.save || action.DC)
    && !(action.save?.condition || action.saveCondition)
    && (action.save?.outcome === undefined || action.save.outcome === 'half');
  const ordinaryFailureDamage = failures.length === 1 && completeOrdinaryFailureDamage(parts, failures[0]![1]!);
  return parts.map(part => {
    // Only ordinary base/additional damage can carry this redundant branch
    // annotation. Conditional/replacement parts and arbitrary qualifiers stay literal.
    if (!hasSave || !halfSuccess || !ordinaryFailureDamage
      || !['base', 'additional'].includes(part.relationship) || !part.condition
      || !ORDINARY_HALF_FAILURE_LABEL.test(part.condition.trim())) return part;
    const { condition: _condition, ...normalized } = part;
    return normalized;
  });
}

/** The attack stays native; this source-authored post-damage save needs GM handling. */
export function conditionalAttackSaveTrigger(action: Record<string, any>): string | undefined {
  if (!(action.attack || action.type === 'attack') || !(action.save || action.DC)) return undefined;
  const text = String(action.describe ?? action.desc ?? '').replace(/\s+/gu, ' ');
  const match = /\b(?:A|The)\s+(?:creature|target)\s+reduced\s+to\s+0\s+Hit\s+Points\s+by\s+this\s+damage\s+must\s+make\s+a\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+Saving\s+Throw\s*:\s*DC\s+(\d+)\b/iu.exec(text);
  const abilities: Record<string, string> = {strength:'str',dexterity:'dex',constitution:'con',intelligence:'int',wisdom:'wis',charisma:'cha'};
  const save = action.save ?? {dc:action.DC,ability:action.ability};
  const trigger = match?.[0].split(/\s+must\s+make\s+/iu)[0];
  const explicitCondition = action.saveCondition ?? action.save?.condition;
  return match && Number(match[2]) === save.dc && abilities[match[1]!.toLowerCase()] === save.ability
    && /^\s*[.!]\s*Failure\s*:/iu.test(text.slice(match.index + match[0].length))
    && (!explicitCondition || explicitCondition === trigger) ? trigger : undefined;
}

export function deriveExplicitSaveOutcome(action: Record<string, any>): SaveOutcome {
  const explicit = action.save?.outcome;
  if (explicit === 'none' || explicit === 'half' || explicit === 'full' || explicit === 'literal') {
    return explicit;
  }

  const sourceText = [
    action.desc,
    action.describe,
    ...(action.successEffects ?? []).map((effect: any) => effect?.describe),
  ].filter(Boolean).join(' ');
  if (/half\s+(?:as\s+much\s+)?damage|一半伤害|伤害减半/i.test(sourceText)) {
    return 'half';
  }
  if (/full\s+damage|same\s+damage|完整伤害/i.test(sourceText)) {
    return 'full';
  }
  if (/no\s+damage|no\s+effect|不受伤害|无效/i.test(sourceText)) {
    return 'none';
  }
  if (
    /\bmust\s+succeed\b[\s\S]*\b(?:or|otherwise)\b|\bon\s+a\s+failed\s+save\b|豁免失败|必须成功[\s\S]*否则/i
      .test(sourceText)
  ) {
    return 'none';
  }

  // source-derived: 2024-style statblocks label the ordinary failed-save
  // branch as FAILURE:. A margin-only branch is not the ordinary failure,
  // and an unresolved SUCCESS: branch must remain literal for review.
  const labelledFailure = /(?:^|[.!?]|\n)\s*FAILURE\s*:/i.test(sourceText);
  const unresolvedSuccess = /\bSUCCESS\b[^:.!?\n]{0,40}:/i.test(sourceText);
  // source-derived: an explicit ordinary/first failed-save condition also
  // leaves zero damage on success. Arbitrary GM prose is not such a branch.
  // A PDF line wrap can split this same clause; sentence and paragraph breaks
  // remain boundaries, so a later statement cannot supply the failed effect.
  const conditionFailure=Array.from(sourceText.matchAll(/(?:^|[.!?]|\n)[ \t]*(?:FIRST[ \t]+)?FAILURE[ \t]*:([^.!?]*)/giu))
    .some(match=>{
      const clause=match[1]!.split(/\r?\n[ \t]*\r?\n/u)[0]!.replace(/\s+/gu,' ').trim();
      return /^(?:(?:the )?(?:creature|target) (?:is|becomes) |(?:目标|该生物|生物)\s*(?:陷入|受到|变为|被)?\s*)?(?:\b(?:blinded|charmed|dazed|deafened|frightened|grappled|incapacitated|invisible|paralyzed|petrified|poisoned|prone|restrained|stunned|unconscious)\b|目盲|魅惑|恍惚|麻痹|石化|中毒|束缚|昏迷)/iu.test(clause);
    });
  // source-derived: an explicitly inflicted Curse also has no damage on success,
  // even when the non-native consequence is retained for GM adjudication.
  const cursedFailure=/(?:^|[.!?]|\n)\s*(?:FIRST\s+)?FAILURE\s*:\s*(?:(?:the\s+)?(?:creature|target)\s+(?:is|becomes)\s+)?(?:cursed\b|(?:目标|该生物|生物)(?:会)?(?:受到|受|被)诅咒)/iu.test(sourceText);
  if ((labelledFailure&&(action.damage?.length??0)>0 || conditionFailure || cursedFailure) && !unresolvedSuccess
    && (action.successEffects?.length ?? 0) === 0) {
    return 'none';
  }

  const failedEffect = (action.failEffects?.length ?? 0) > 0
    || (
      (action.damage?.length ?? 0) > 0
      && /failed\s+save|on\s+a\s+failure|豁免失败|失败时/i.test(sourceText)
    );
  if (failedEffect && (action.successEffects?.length ?? 0) === 0) {
    return 'none';
  }
  return 'literal';
}
