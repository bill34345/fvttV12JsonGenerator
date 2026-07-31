export interface ExtractedAcEffect {
  kind: 'flat' | 'bonus';
  value: number;
  sourceText: string;
}

// AC effect extraction belongs to the generation projection boundary.

const AC_REFERENCE = String.raw`(?:\bAC\b|护甲等级)`;
const CLAUSE_TEXT = String.raw`[^。.;]`;

export function extractSourceDerivedAcEffect(text: string): ExtractedAcEffect | null {
  const flatMatch =
    text.match(new RegExp(`${AC_REFERENCE}${CLAUSE_TEXT}{0,20}(?:降至|变为|is|becomes)\\s*(\\d+)`, 'i'))
    ?? text.match(new RegExp(`(?:降至|变为|is|becomes)\\s*(\\d+)${CLAUSE_TEXT}{0,20}${AC_REFERENCE}`, 'i'));
  if (flatMatch?.[1]) {
    return {
      kind: 'flat',
      value: Number.parseInt(flatMatch[1], 10),
      sourceText: flatMatch[0],
    };
  }

  const bonusMatches = [
    ...text.matchAll(new RegExp(`${AC_REFERENCE}${CLAUSE_TEXT}{0,30}\\+(\\d+)|\\+(\\d+)\\s*${AC_REFERENCE}`, 'gi')),
  ];
  const lastBonus = bonusMatches.at(-1);
  const bonusValue = lastBonus?.[1] ?? lastBonus?.[2];
  if (bonusValue) {
    return {
      kind: 'bonus',
      value: Number.parseInt(bonusValue, 10),
      sourceText: lastBonus?.[0] ?? text,
    };
  }

  return null;
}
