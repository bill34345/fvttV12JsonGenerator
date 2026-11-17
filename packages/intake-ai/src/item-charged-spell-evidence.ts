import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
import type { ItemDiscoveryCandidate, ItemIntakeAbility } from './item-types';

type Cast = Extract<ItemIntakeAbility, { kind: 'spell' }>;

export interface ChargedSpellOption {
  name: string;
  cost?: number;
  scaling?: { extraCharge: number; maxLevel: number };
  variant?: string;
  uuid?: string;
  footnote?: string;
  unreadable?: boolean;
  castingText?: string;
  tableRow?: boolean;
  fixedChargeCost?: boolean;
  evidence: EvidenceRef;
}

const AMOUNTS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] as const;
const HAN_AMOUNTS = '零一二三四五六七八九十';
const AMOUNT = '\\d+|' + AMOUNTS.join('|') + '|[' + HAN_AMOUNTS + '两兩]';
const CHARGE = '(?:charges?\\b|(?:次|点|點|发|發|格)?\\s*(?:充能|充電))';
const CAST_GRANT = /\b(?:you|(?:the )?(?:wearer|holder|wielder))\s+(?:can|may)\s+(?:(?:expend|spend|use)\b[^.!?;\n]{0,95}?\bto\s+)?cast\b|(?:你(?:可以|能(?:够)?)|可(?:以)?)(?:[^。！？\n]{0,45}?)(?:施放|施展)/iu;
const ANNOTATED_COST = new RegExp('[（(]\\s*(' + AMOUNT + ')\\s*' + CHARGE + '\\s*[)）]', 'giu');
const FIXED_COST = new RegExp('(?:\\b(?:expend|spend|use)\\s+|(?:消耗|花费|花費)\\s*)(' + AMOUNT + ')\\s*' + CHARGE, 'iu');
const AFTER_NAME_COST = new RegExp('^(.+?)\\s+(?:for|by (?:spending|expending))\\s+(' + AMOUNT + ')\\s*' + CHARGE, 'iu');
const TABLE_COST = new RegExp('^(' + AMOUNT + ')(?:\\s*' + CHARGE + ')?(?:\\s*[,，;；]\\s*(.+))?$', 'iu');
const TABLE_SCALING = /^(?:每(?:额外|額外|多)(?:消耗|花费|花費|支出)\s*(\d+)\s*(?:点|點|次|发|發)?\s*(?:充能|充電)(?:可(?:以)?)?(?:升|提高|提升|增加)\s*[1一]\s*[环環][,，;；]?\s*(?:至多|最多|最高)(?:升至|到|为|為)?\s*([1-9])\s*[环環]|(?:add|spend|expend)\s+(\d+)\s+charges?\s+(?:per|for each) additional (?:spell )?level[,;]?\s*(?:up to|max(?:imum)?)\s*(?:level\s*)?([1-9])(?:st|nd|rd|th)?(?:[- ]level)?)$/iu;
const SCALING_PROSE = /\b(?:upcast\w*|higher[- ]level|additional charges?|charges? per (?:spell )?level|increase (?:its|the spell.?s) level)\b|升[环環]|[升高提增加][^。；;\n]{0,10}[环環]|(?:额外|額外)[^。；;\n]{0,15}充[能電]/iu;

export function spellUsesCasterSaveDc(option: ChargedSpellOption, source: string): boolean {
  const quoted = [option.castingText, option.evidence.quote].join(' ');
  return /\busing (?:your|the (?:wearer|wielder|caster|holder)'s) (?:own )?spell(?:casting)? save DC\b|(?:使用|采用|採用)(?:你|持用者|持握者|佩戴者|施法者)(?:自己)?的(?:法术|法術|施法)豁免\s*(?:DC|难度|難度)/iu.test(quoted)
    && !/\bDC\s*\d+\b|豁免(?:难度|難度)?\s*[:：]?\s*\d+/iu.test(quoted)
    && !/\bspell(?:casting)? save DC\s*(?:is|of|:)?\s*\d+|(?:法术|法術|施法)豁免\s*(?:DC|难度|難度)\s*(?:为|為|是|[:：])?\s*\d+/iu.test(source);
}

const ACTIVATION_WORDS = [
  ['bonus', /\bbonus action\b|附赠动作|附贈動作|奖励动作|獎勵動作|附赠行动/iu],
  ['reaction', /\b(?:as|take|use|using)\s+(?:a |your )?reaction\b|反应动作|反應動作|(?:用|以|作为|作為)(?:一个|一個)?反[应應]/iu],
  ['free', /\b(?:no action required|without (?:taking |using )?an action|as a free action)\b|无需动作|無需動作|不需要动作/iu],
  ['action', /\b(?:as|take|use|using)\s+(?:an? |your |the magic )?action\b|(?:用|以|作为|作為|花费|消耗)(?:一(?:个|個|次)?\s*)?(?:魔法)?[动動]作/iu],
] as const;

export function spellCastingTiming(text: string, option?: ChargedSpellOption) {
  const sentences = [text, option?.castingText ?? ''].join('\n').split(/[。.!?；;\n]+/u);
  const cast = sentences.filter(sentence => /\bcast(?:s|ing)?\b|施[展放]|施法时间|施法時間/iu.test(sentence));
  const clauses = (cast.length ? cast : sentences).flatMap(sentence => sentence.split(/[，,]/u));
  const activations = new Set(clauses.flatMap(clause => {
    const type = ACTIVATION_WORDS.find(([, pattern]) => pattern.test(clause))?.[0];
    return type ? [type] : [];
  }));
  const unsupported = cast.some(sentence =>
    /\bcasting time(?:\s+(?:of|is))?\s*:?\s*(?:\d+|one|a|an)\s+(?:minutes?|hours?)\b|\b(?:take|spend)\s+(?:\d+|one|a|an)\s+(?:minutes?|hours?)\s+(?:to cast|casting)\b|(?:施法时间|施法時間)\s*(?:为|為|是|[:：])?\s*[\d一二三四五六七八九十]+\s*(?:分钟|分鐘|小时|小時)|(?:花费|花費|用)\s*[\d一二三四五六七八九十]+\s*(?:分钟|分鐘|小时|小時)\s*[来來]?施[展放]/iu.test(sentence));
  return { activations, unsupported };
}

export function sourceChargedSpellOptions(candidate: ItemDiscoveryCandidate): ChargedSpellOption[] {
  const options: ChargedSpellOption[] = [];
  const { quote: source } = candidate;
  function add(label: string, amount: string, start: number, end: number, castingText: string): void {
    const name = spellLabel(label);
    if (!name) return;
    const cost = parseChargeAmount(amount);
    options.push({
      name,
      cost,
      castingText,
      evidence: { start: candidate.start + start, end: candidate.start + end, quote: source.slice(start, end) },
    });
  }

  function precedingGrant(start: number): string | undefined {
    return source.slice(0, start).trimEnd().split(/\r?\n[ \t]*\r?\n/u).at(-1)
      ?.split(/[。.!?；;\n]+/u).find(sentence => CAST_GRANT.test(sentence));
  }

  function addTableRow(label: string, price: string, start: number, end: number, castingText?: string): void {
    if (!label && !price) return;
    const unmarked = label.trim().replace(/^(\*{1,3})([^*]+)\1$/u, '$2');
    const footnote = /(?:\\?\*+|†|‡|\[\^[^\]]+\])\s*$/u.exec(unmarked);
    const spell = unmarked.slice(0, footnote?.index).trim();
    const links = [...spell.matchAll(/@UUID\[([^\]]+)\]\{[^}]+\}/giu)];
    const annotation = /\s*[（(]([^()（）]+)[)）]$/u.exec(spell);
    const bare = spellLabel(spell);
    const name = bare ?? (annotation && spellLabel(spell.slice(0, annotation.index)));
    const cost = TABLE_COST.exec(price);
    const scaling = cost?.[2] ? TABLE_SCALING.exec(cost[2]) : undefined;
    options.push({
      name: name || label || '（法术名称缺失）',
      castingText,
      tableRow: true,
      ...(cost ? { cost: parseChargeAmount(cost[1]!) } : {}),
      ...(scaling ? { scaling: { extraCharge: Number(scaling[1] ?? scaling[3]), maxLevel: Number(scaling[2] ?? scaling[4]) } } : {}),
      ...(!bare && annotation && name ? { variant: annotation[1]!.trim() } : {}),
      ...(links.length === 1 ? { uuid: links[0]![1]! } : {}),
      ...(footnote ? { footnote: footnote[0].replace(/^\\/u, '').trim() } : {}),
      ...(!name || !cost || links.length > 1 || (cost[2] && !scaling) ? { unreadable: true } : {}),
      evidence: { start: candidate.start + start, end: candidate.start + end, quote: source.slice(start, end) },
    });
  }

  for (const match of source.matchAll(/(?:\.(?!\s|$)|[^.!?。！？])+/gu)) {
    const sentence = match[0];
    const grant = CAST_GRANT.exec(sentence);
    if (!grant) continue;
    const castEnd = grant.index + grant[0].length;
    const rawTail = sentence.slice(castEnd);
    // A following paragraph belongs to the grant when it introduces a colon-delimited list.
    const paragraphBreak = /\r?\n[ \t]*\r?\n/u.exec(rawTail);
    let tail = rawTail;
    if (paragraphBreak) {
      const first = rawTail.slice(0, paragraphBreak.index);
      if (/[:：]\s*$/u.test(first)) {
        const rest = rawTail.slice(paragraphBreak.index + paragraphBreak[0].length);
        tail = rawTail.slice(0, rawTail.length - rest.length + (rest.match(/\r?\n[ \t]*\r?\n/u)?.index ?? rest.length));
      } else {
        tail = first;
      }
    }
    const optionsBefore = options.length;
    let previousEnd = 0;
    for (const cost of tail.matchAll(ANNOTATED_COST)) {
      const prefix = tail.slice(previousEnd, cost.index);
      const separator = Math.max(prefix.lastIndexOf(':'), prefix.lastIndexOf('：'), prefix.lastIndexOf(','), prefix.lastIndexOf('，'),
        prefix.lastIndexOf('、'), prefix.lastIndexOf(';'), prefix.lastIndexOf('；'), prefix.lastIndexOf('\n'));
      const start = previousEnd + separator + 1;
      const end = cost.index + cost[0].length;
      add(tail.slice(start, cost.index), cost[1]!, match.index + castEnd + start, match.index + castEnd + end, sentence.slice(0, castEnd));
      previousEnd = end;
    }
    if (options.length > optionsBefore) continue;

    // For a single shared price, keep the whole casting clause as evidence for each option.
    const beforeCast = FIXED_COST.exec(grant[0]);
    const names = tail.replace(/^.*?[:：]/u, '')
      .replace(/\s+from (?:it|(?:this|the) [\p{L}]+)\b/iu, '')
      .replace(/\s+(?:without\b|using (?:your|the)\b|with (?:a |your )?spell save DC\b).*$/iu, '');
    if (/^\s*\|/u.test(tail)) continue;
    for (const entry of names.split(/\s*(?:[,，、;；]|\s+(?:or|and)\s+|或者|或|以及)\s*/iu)) {
      const priced = AFTER_NAME_COST.exec(entry.trim());
      const amount = priced?.[2] ?? beforeCast?.[1];
      if (amount !== undefined) add(priced?.[1] ?? entry, amount, match.index + grant.index, match.index + castEnd + tail.length, sentence.slice(0, castEnd));
    }
  }

  const rows = [...source.matchAll(/^[ \t]*\|?.+\|.*$/gmu)];
  for (const [index, header] of rows.entries()) {
    const columns = spellCostColumns(tableCells(header[0]));
    if (!columns) continue;
    const [spellColumn, costColumn] = columns;
    const castingText = precedingGrant(header.index);
    let previous = rows[index + 1];
    if (!previous || !tableCells(previous[0]).every(value => /^:?-{3,}:?$/u.test(value))
      || source.slice(header.index + header[0].length, previous.index).trim()) continue;
    for (const row of rows.slice(index + 2)) {
      if (!/^\r?\n$/u.test(source.slice(previous.index + previous[0].length, row.index))) break;
      const cells = tableCells(row[0]);
      addTableRow(cells[spellColumn] ?? '', cells[costColumn] ?? '', row.index, row.index + row[0].length, castingText);
      previous = row;
    }
  }

  for (const table of source.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/giu)) {
    const [header, ...body] = table[0].matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/giu);
    const columns = header && spellCostColumns(htmlCells(header[0]));
    if (!columns) continue;
    const [spellColumn, costColumn] = columns;
    for (const row of body) {
      const cells = htmlCells(row[0]);
      const start = table.index + row.index;
      addTableRow(cells[spellColumn] ?? '', cells[costColumn] ?? '', start, start + row[0].length, precedingGrant(table.index));
    }
  }

  // Some rich-text editors paste a two-column table as one empty Markdown header per cell.
  const cells = [...source.matchAll(/^[ \t]*\|[ \t]*\|[ \t]*\r?\n[ \t]*\|[ \t]*-+[ \t]*\|[ \t]*\r?\n(?:[ \t]*\r?\n)*([^\r\n|]+)$/gmu)];
  const adjacent = (left: RegExpMatchArray, right: RegExpMatchArray) =>
    !source.slice(left.index! + left[0].length, right.index).trim();
  for (let index = 0; index + 1 < cells.length; index += 1) {
    const header = cells[index]!;
    const costHeader = cells[index + 1]!;
    if (!adjacent(header, costHeader) || !spellCostColumns([header[1]!.trim(), costHeader[1]!.trim()])) continue;
    const castingText = precedingGrant(header.index);
    index += 1;
    while (cells[index + 1] && adjacent(cells[index]!, cells[index + 1]!)) {
      const label = cells[++index]!;
      const price = cells[index + 1];
      if (!price || !adjacent(label, price)) {
        addTableRow(label[1]!.trim(), '', label.index!, label.index! + label[0].length);
        break;
      }
      addTableRow(label[1]!.trim(), price[1]!.trim(), label.index!, price.index! + price[0].length, castingText);
      index += 1;
    }
  }
  const tableRows = options.filter(option => option.tableRow).sort((left, right) => left.evidence.start - right.evidence.start);
  let cursor = 0;
  const outsideRows = tableRows.map(({ evidence }) => {
    const before = source.slice(cursor, Math.max(cursor, evidence.start - candidate.start));
    cursor = Math.max(cursor, evidence.end - candidate.start);
    return before;
  });
  outsideRows.push(source.slice(cursor));
  if (!SCALING_PROSE.test(outsideRows.join('\n'))) {
    for (const row of tableRows) {
      if (!row.unreadable && !row.scaling) row.fixedChargeCost = true;
    }
  }
  return options;
}

export function compareChargedSpellOptions(
  options: readonly ChargedSpellOption[],
  abilities: readonly ItemIntakeAbility[],
): Array<ChargedSpellOption & { problem: 'missing' | 'consumption' | 'unreadable' }> {
  const casts = abilities.filter(ability => ability?.kind === 'spell');
  const used = new Set<number>();
  return options.flatMap((option): Array<ChargedSpellOption & { problem: 'missing' | 'consumption' | 'unreadable' }> => {
    if (option.unreadable) return [{ ...option, problem: 'unreadable' }];
    const matches = casts.flatMap((cast, index) => !used.has(index) && sameSpell(option, cast)
      ? [{ cast, index }] : []);
    const sameCost = matches.find(({ cast }) => cast.consumption === option.cost);
    if (sameCost) {
      used.add(sameCost.index);
      return [];
    }
    return [{ ...option, problem: matches.length ? 'consumption' : 'missing' }];
  });
}

function spellCostColumns(headings: string[]): [number, number] | undefined {
  const labels = headings.map(value => value.replace(/[*_]/gu, '').trim());
  const spell = labels.findIndex(value => /^(?:spells?|法[术術])$/iu.test(value));
  const cost = labels.findIndex(value => /^(?:charge cost|charges(?: spent|required)?|cost in charges|充[能電](?:消耗|费用|費用|花费|花費)|(?:消耗|所需)充[能電])$/iu.test(value));
  if (spell >= 0 && cost >= 0) return [spell, cost];
}

function htmlCells(row: string): string[] {
  return [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/giu)].map(match =>
    match[1]!.replace(/<[^>]*>|&nbsp;/giu, ' ').replace(/\s+/gu, ' ').trim());
}

function tableCells(row: string): string[] {
  return row.trim().replace(/^\||\|$/gu, '').split('|').map(cell => cell.trim());
}

function spellLabel(value: string): string | undefined {
  const label = value.replace(/@UUID\[[^\]]+\]\{([^}]+)\}/giu, '$1').replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/[*_]/gu, '').trim()
    .replace(/^(?:[-+•]\s+|(?:and|or|the spell)\s+|(?:或(?:者)?|以及)\s*)+/iu, '')
    .replace(/^['“"]|['”"]$/gu, '').replace(/\s+/gu, ' ')
    .replace(/^([\p{Script=Han}\s]+)[（(]([A-Za-z][\p{L} ’'ʼ/-]+)[)）]$/u, '$1 $2')
    .replace(/\s*[（(]\s*(?:save\s+DC|spell save DC|DC\s*\d|level\s*\d|\d+(?:st|nd|rd|th)[- ]level|\d+\s*[环環]|豁免难度)\b[^)）]*[)）]$/iu, '')
    .trim();
  // Prose following a different rule is not a spell option.
  return /^[\p{L}][\p{L} ’'ʼ/-]{0,64}$/u.test(label) ? label : undefined;
}

export function exactChargedSpellOption(options: readonly ChargedSpellOption[], cast: Cast): ChargedSpellOption | undefined {
  const matching = options.filter(option => !option.unreadable && option.cost === cast.consumption && sameSpell(option, cast));
  return matching.length === 1 ? matching[0] : undefined;
}

function sameSpell(option: ChargedSpellOption, cast: Cast): boolean {
  const label = chargedSpellNameKey(option.name);
  return [cast.spell?.name, cast.spell?.identifier].some(value => typeof value === 'string' && chargedSpellNameKey(value) === label);
}

export function chargedSpellNameKey(value: string): string {
  const english = value.replace(/\p{Script=Han}+/gu, '').trim();
  return (english || value).normalize('NFKC').toLowerCase().replace(/[’ʼ]/gu, "'").replace(/[ /-]+/gu, ' ');
}

function parseChargeAmount(value: string): number {
  if (/^\d+$/u.test(value)) return Number(value);
  if (value === '两' || value === '兩') return 2;
  const word = AMOUNTS.findIndex(amount => amount === value.toLowerCase());
  return word === -1 ? HAN_AMOUNTS.indexOf(value) : word;
}
