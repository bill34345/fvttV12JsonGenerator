export interface ItemRandomSummonData {
  formula: string;
  tableUuid: string;
  rangeFeet: number;
  usesPerDawn: number;
  friendly: boolean;
  profiles: Array<{ actorName: string; actorUuid: string }>;
}

type RandomSummonRules = Omit<ItemRandomSummonData, 'tableUuid' | 'profiles'>;

const smallCounts: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6,
};
const tableLink = String.raw`@Embed\[(Compendium\.[\w-]+\.[\w-]+\.RollTable\.[a-z\d]{16})[ \t]+rollable\]`;
const actorRow = String.raw`(\d+)\.[ \t]+@UUID\[(Compendium\.[\w-]+\.[\w-]+\.Actor\.[a-z\d]{16})\]\{([^{}\r\n]+)\}`;
const tableLine = new RegExp(`^[ \\t]*${tableLink}[ \\t]*$`, 'gmiu');
const actorLine = new RegExp(`^[ \\t]*${actorRow}[ \\t]*$`, 'gmiu');
const appendixStart = new RegExp(String.raw`^(?:[ \t]*\r?\n)+[ \t]*#{1,6}[ \t]+(1d\d+)\b[^\r\n]*\r?\n`
  + String.raw`(?:[ \t]*\r?\n)*(?:[ \t]*${actorRow}[ \t]*\r?\n)+(?:[ \t]*\r?\n)*[ \t]*${tableLink}[ \t]*(?=\r?\n|$)`, 'iu');

export function itemRandomSummonRules(source: string): RandomSummonRules | undefined {
  const die = /(?:\broll(?:ing)?\s+(?:a\s+)?|掷(?:一次)?\s*)(?:1)?d(\d+)(?=\s*(?:[.,，。；;]|\b(?:and|on)\b|并|后|$))/iu.exec(source)
    ?? (/\brolling on the table\b/iu.test(source) ? /^#{1,6}\s+1d(\d+)\b/imu.exec(source) : null);
  const range = /(?:\b(?:throw|toss)[^.!?\n]*?\b(?:up to|within)\s+|(?:投|扔|掷)(?:到|至|向)\s*)(\d+)\s*(?:feet\b|尺)/iu.exec(source);
  const uses = /\bonce\s+(\d+|one|two|three|four|five|six)\s+[^.!?\n]+?\b(?:pulled|drawn)[^.!?\n]+?\buntil the next dawn\b|(?:取出|取了)\s*(\d+|[一二两三四五六])\s*(?:个|顆|颗)[^。！？\n]+?直到下一个黎明[^。！？\n]*?(?:才能|才可)(?:再次|重新)使用/iu.exec(source);
  if (!die || !range || !uses || !/\bmagic action\b|魔法动作/iu.test(source)
    || !/\btransform(?:s|ing)? into a creature\b|变(?:成|为)[^。！？\n]*(?:生物|野兽)/iu.test(source)
    || !/\b(?:vanishes|disappears) at the next dawn or when [^.!?\n]*?\b0 hit points\b|(?:下一个黎明|次日黎明)\s*(?:或|或者)[^。！？\n]*?生命值(?:降至|降到|变为)\s*0[^。！？\n]*?(?:消失|消散)/iu.test(source)) {
    return undefined;
  }
  const count = (uses[1] ?? uses[2]!).toLowerCase();
  return {
    formula: '1d' + Number(die[1]),
    rangeFeet: Number(range[1]),
    usesPerDawn: smallCounts[count] ?? Number(count),
    friendly: /\b(?:is|are) friendly to you and your allies\b|对你和你的盟友(?:友善|友好)/iu.test(source),
  };
}

export function readItemRandomSummon(source: string, rules: RandomSummonRules): ItemRandomSummonData | undefined {
  const tables = [...source.matchAll(tableLine)];
  const rows = [...source.matchAll(actorLine)];
  const faces = Number(rules.formula.slice(2));
  if (tables.length !== 1 || faces < 2 || rows.length !== faces
    || !Number.isSafeInteger(rules.rangeFeet) || rules.rangeFeet < 1
    || !Number.isSafeInteger(rules.usesPerDawn) || rules.usesPerDawn < 1
    || rows.some((row, index) => Number(row[1]) !== index + 1)
    || new Set(rows.map(row => row[2])).size !== rows.length) return undefined;
  return {
    ...rules,
    tableUuid: tables[0]![1]!,
    profiles: rows.map(row => ({ actorUuid: row[2]!, actorName: row[3]!.trim() })),
  };
}

export function itemRandomSummonAppendixLength(body: string, trailing: string): number {
  const appendix = appendixStart.exec(trailing);
  if (!appendix) return 0;
  const rules = itemRandomSummonRules(body);
  if (!rules || rules.formula !== appendix[1]?.toLowerCase()
    || readItemRandomSummon(body, rules) || !readItemRandomSummon(appendix[0], rules)) return 0;
  return appendix[0].length;
}
