import type { SaveOutcome } from '@fvtt-json-generator/models/action';

// Save-outcome normalization is part of the source-to-document projection boundary.

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
  const conditionFailure=/(?:^|[.!?]|\n)\s*(?:FIRST\s+)?FAILURE\s*:[^.!?\n]*(?:\b(?:blinded|charmed|dazed|deafened|frightened|grappled|incapacitated|invisible|paralyzed|petrified|poisoned|prone|restrained|stunned|unconscious)\b|目盲|魅惑|恍惚|麻痹|石化|中毒|束缚|昏迷)/iu.test(sourceText);
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
