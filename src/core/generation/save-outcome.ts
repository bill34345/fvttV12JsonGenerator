import type { SaveOutcome } from '@fvtt-json-generator/parser/models/action';

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
