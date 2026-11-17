import type { ItemLastChargeCheck } from '@fvtt-json-generator/models/item';

export function parseItemLastChargeCheck(source: string): ItemLastChargeCheck | undefined {
  const text = source.replace(/\[\[\/r\s+((?:1)?d\d+)\s*\]\]/giu, '$1').replace(/<[^>]+>|[*_`]/gu, '');
  const clauses = text.split(/[。.!?！？\n]+/u).map(clause => clause.trim()).filter(Boolean);
  const matches = clauses.flatMap((clause, index) => {
    const lastCharge = /\b(?:if|when)\s+you\s+(?:expend|spend|use)\b[^;；]*\b(?:last|final) charge\b|(?:(?:若|如果|当)\s*(?:你)?\s*)?(?:用掉|耗尽|耗盡|消耗|使用)(?:掉|了)?\s*(?:最后|最後)\s*(?:一|1)?\s*(?:发|發|点|點|次)?\s*充能/iu;
    if (!lastCharge.test(clause)) return [];
    const die = /(?:\broll\s+(?:a\s+)?|掷(?:一次)?\s*)(?:1)?d(\d+)\s*$/iu.exec(clause);
    const outcome = clauses[index + 1] ?? '';
    const result = /^(?:on (?:a |a roll of )?(\d+)\s*[,，]|(?:若|如果|若是|若结果为)(?:掷出|骰出)?\s*(\d+)\s*[,，])/iu.exec(outcome);
    if (!die || !result || /\b(?:not|unless|instead)\b|不会|不會|除非|而不是/iu.test(outcome)) return [];
    if (!/\b(?:the (?:wand|staff|item)|it)\b[^;；]*(?:\bis destroyed\b|\bcrumbles? into (?:ashes|dust)\b)|(?:魔杖|法杖|物品|它)[^;；]*(?:摧毁|摧毀|销毁|銷毀|化为灰烬|化為灰燼)/iu.test(outcome)) return [];
    const faces = Number(die[1]);
    const destroyOn = Number(result[1] ?? result[2]);
    return Number.isSafeInteger(faces) && faces >= 2 && destroyOn >= 1 && destroyOn <= faces
      ? [{ formula: '1d' + faces, destroyOn }] : [];
  });
  return matches.length === 1 ? matches[0] : undefined;
}
