import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
import { DND5E_V14_SPELL_SCROLL_LEVELS } from '@fvtt-json-generator/contracts/target';
import { readItemEnchantment, ENCHANTMENT_DAMAGE_TYPES } from '@fvtt-json-generator/models/item';
import type { ItemContainerData, ItemSpellScrollData } from '@fvtt-json-generator/models/item';
import { ITEM_DAMAGE_LABELS } from './item-p1-evidence';
import type { ItemCoreSpellResolver } from './item-core';
import type { ItemIntakeFinding } from './item-types';

type Check = (code: string, path: string, message: string, origin: ItemIntakeFinding['origin'], evidence?: EvidenceRef[]) => void;

const CAPACITY = /\b(?:can (?:hold|carry|contain|store)|holds?|carries|contains|stores|capacity|not exceeding (?:a )?(?:weight|volume) of|no more than)\b|容[纳納]|装下|裝下|承载|承載|容量|最多|不超[过過]|最大/iu;
const OWN_WEIGHT = /\bweighs?\s+(?:only\s+)?|(?:净重|淨重|自重|(?<![总總载載承])重(?:量)?(?:(?:恒|恆)?[为為]|[达達])?)\s*(?=\d)/iu;
const WEIGHTLESS = /\b(?:regardless of (?:its|the) contents|contents (?:have|add|contribute) no weight|contents do not (?:add|contribute) weight)\b|(?:内容物|內容物|其中物品|所装物品|所裝物品).{0,16}(?:不计|不計|不增加|没有|沒有)重量|无论.{0,30}(?:装|内容|物品).{0,30}(?:重)|無論.{0,30}(?:裝|內容|物品).{0,30}(?:重)/iu;
const WEIGHT_UNITS = { lb: 'pounds?\\b|lbs?\\b|磅', kg: 'kilograms?\\b|kg\\b|千克|公斤' };
const VOLUME_UNITS = { cubicFoot: 'cubic\\s+(?:feet|foot)\\b|ft\\s*(?:³|3)|立方(?:英)?尺', liter: 'lit(?:er|re)s?\\b|升' };
const OBJECT_UNITS = 'items?\\b|objects?\\b|件|个物品|個物品';
const NUMBER = '(?<![\\d.,-])(\\d+(?:,\\d{3})*(?:\\.\\d+)?)';
const ALL_CAPACITY_UNITS = [...Object.values(WEIGHT_UNITS), ...Object.values(VOLUME_UNITS), OBJECT_UNITS];
const STANDARD_SCROLL = /\bspell scroll\b|法[术術]卷[轴軸]/iu;

const SPEED_DOUBLED = /\bdouble(?:s)? your speed\b|\byour speed is doubled\b|(?:移动|移動)?速度(?:翻倍|加倍|变为\s*(?:两|兩|2)\s*倍)/iu;
const SPECIFIC_SPEED = /\b(?:walking|flying|swimming|climbing|burrowing) speed\b|(?:步行|飞行|飛行|游泳|游水|攀爬|掘穴)速度/iu;
const SPEED_START = /\bbonus action\b|附[赠贈][动動]作/iu;
const SPEED_STOP = /\b(?:again[^.]{0,35}(?:end|stop)|end the effect[^.]{0,30}again)\b|再次[^。\n]{0,28}(?:[结結]束|停止|解除)[^。\n]{0,8}效果/iu;
const SPEED_REST = /\b(?:finish|complete) (?:a |your )?long rest\b|完成(?:一[次个個])?[长長]休/iu;
const TIMED_SPEED_TOTAL = /\b(?:a )?total of\s*(\d+)\s*(minutes?|seconds?)\b|(?:累[计計]|总共|總共|合计|合計)\D{0,10}(\d+)\s*(分[钟鐘]|秒)/iu;

export function timedSpeedSeconds(source: string): number | undefined {
  const text = source.normalize('NFKC').replace(/[*_]/gu, '');
  const total = TIMED_SPEED_TOTAL.exec(text);
  if (!total || !SPEED_START.test(text) || !SPEED_STOP.test(text) || !SPEED_REST.test(text)
    || !SPEED_DOUBLED.test(text) || SPECIFIC_SPEED.test(text)) return undefined;
  return Number(total[1] ?? total[3]) * (/minute|分/iu.test(total[2] ?? total[4]!) ? 60 : 1);
}

const SIMPLE_OR_MARTIAL = /\bany simple or martial\b|任意(?:一[种種]?)?简易(?:或|[、，])军用/iu;
const LIGHT_MEDIUM_HEAVY = /\b(?:any\s+)?light\s*,\s*medium\s*,?\s*or\s+heavy\b|(?:任意)?轻(?:型|甲)?[、，,]\s*中(?:型|甲)?[、，,或]\s*重(?:型|甲)?/iu;
const ATTACK_AND_DAMAGE = /\battack rolls?\s+and\s+damage rolls?\b|攻[击擊](?:掷骰|擲骰)?\s*(?:和|与|與|及|、)\s*[伤傷]害(?:掷骰|擲骰)?/iu;
const WORN_SINGLE_RESISTANCE = /\bresistance to (?:one|a single) (?:type|kind) of damage\b|(?:一种|一種|一项|一項)(?:[伤傷]害(?:类型|類型)?)?[^。.!?\n]{0,12}抗性|对一种[^。\n]{0,16}伤害具有抗性/iu;
const WORN = /\b(?:(?:while|when) (?:you )?wear(?:ing)?|while worn)\b|穿[戴着著]时|穿[戴着著]此|穿[戴着著]该/iu;
const REQUIRED_ATTUNEMENT = /\brequires? attunement\b|需要同[调調]|[须須]同[调調]/iu;
const RARE_ARMOR = /(?<!very )\brare\b|(?<!极|極)珍稀/iu;
const GM_CHOICE = /\b(?:the )?(?:dm|gm)\s+(?:may\s+)?chooses?\b|(?:DM|GM|主持人|城主)[^。\n]{0,8}(?:[选選]择|決定|决定)/iu;

function weaponEnchantmentTiers(text: string): number[] {
  const variants = [...text.matchAll(/(very rare|uncommon|(?<!very )\brare\b|极珍稀|極珍稀|非普通|(?<!极|極)珍稀)\s*\(\s*\+\s*([123])\s*\)/giu)];
  return variants.flatMap(match => {
    const bonus = Number(match[2]);
    const rarity = match[1]!.toLowerCase();
    return [['uncommon', '非普通'], ['rare', '珍稀'], ['very rare', '极珍稀', '極珍稀']][bonus - 1]!.includes(rarity) ? [bonus] : [];
  }).filter((bonus, index, all) => all.indexOf(bonus) === index);
}

function armorResistanceOptions(text: string): string[] {
  const tableRows = [...text.matchAll(/^\s*\|?\s*\d{1,2}\s*(?:[|.)、:]|\s+)\s*([^\n|]+)(?:\||$)/gmu)]
    .map(row => row[1]!);
  const list = text.match(/(?:\bone of (?:the following(?: damage types)?\s*:?\s*)?|[从從]下列[^：:\n]{0,12}[：:])([^.!?。\n]+)/iu)?.[1];
  const options = tableRows.length > 0 ? tableRows : list ? list.split(/(?:[,，、]|\bor\b|或)/iu) : [];
  return [...new Set(options.flatMap(option => ENCHANTMENT_DAMAGE_TYPES.filter(type => ITEM_DAMAGE_LABELS[type].test(option))))];
}

export function sourceEnchantmentKind(source: string): 'enchant-weapon-bonus' | 'enchant-armor-resistance' | undefined {
  const text = source.normalize('NFKC');
  if (SIMPLE_OR_MARTIAL.test(text) && ATTACK_AND_DAMAGE.test(text) && weaponEnchantmentTiers(text).length) return 'enchant-weapon-bonus';
  if (LIGHT_MEDIUM_HEAVY.test(text) && WORN_SINGLE_RESISTANCE.test(text) && WORN.test(text) && GM_CHOICE.test(text)
    && armorResistanceOptions(text).length > 0) return 'enchant-armor-resistance';
  return undefined;
}

export function validateEnchantmentEvidence(
  ability: Record<string, unknown>, path: string, evidence: EvidenceRef[], source: string, add: Check,
): void {
  const definition = readItemEnchantment(ability);
  if (!definition) {
    add('INVALID_ENCHANTMENT_VARIANTS', path, 'Use an enchantment template with distinct supported options.', 'schema', evidence);
    return;
  }
  const text = [...evidence].sort((a, b) => a.start - b.start).map(ref => ref?.quote ?? '').join('\n').normalize('NFKC');
  const full = source.normalize('NFKC');
  const equalOptions = (actual: readonly (string | number)[], expected: readonly (string | number)[]) =>
    actual.length === expected.length && actual.every((value, index) => value === expected[index]);
  const valid = definition.kind === 'enchant-weapon-bonus'
    ? SIMPLE_OR_MARTIAL.test(text) && ATTACK_AND_DAMAGE.test(text)
      && equalOptions(definition.bonuses, weaponEnchantmentTiers(text)) && equalOptions(definition.bonuses, weaponEnchantmentTiers(full))
    : LIGHT_MEDIUM_HEAVY.test(text) && WORN_SINGLE_RESISTANCE.test(text) && WORN.test(text) && GM_CHOICE.test(text)
      && REQUIRED_ATTUNEMENT.test(text) && RARE_ARMOR.test(text)
      && equalOptions(definition.damageTypes, armorResistanceOptions(text)) && equalOptions(definition.damageTypes, armorResistanceOptions(full));
  if (!valid) add('ENCHANTMENT_EVIDENCE_MISMATCH', path,
    'Preserve the source target category, variant list in source order, and prerequisites. Cite the entire table or options.', 'semantic', evidence);
}

export function citesContainerCapacity(source: string): boolean {
  return source.split(/[。！？；;\n]|(?<=[^\d])\.(?=\s|$)/u).some(part =>
    CAPACITY.test(part) && ALL_CAPACITY_UNITS.some(unit => valuesOf(part, unit).length > 0));
}

export function validateContainerEvidence(container: ItemContainerData, path: string, evidence: EvidenceRef[], add: Check): void {
  const text = evidence.map(ref => ref?.quote ?? '').join('\n').replace(/[*_]/gu, '');
  const clauses = text.split(/[。！？；;\n]|(?<=[^\d])\.(?=\s|$)/u);
  const capacity = clauses.filter(clause => CAPACITY.test(clause)).map(clause => clause.split(OWN_WEIGHT, 1)[0]!);
  const ownWeight = clauses.flatMap(clause => {
    const marker = OWN_WEIGHT.exec(clause);
    return marker ? [clause.slice(marker.index + marker[0].length)] : [];
  });
  const bad = (field: string, message: string) => add('CONTAINER_NOT_EXPLICIT', path + '/' + field, message, 'semantic', evidence);

  if (container.count !== undefined
    && (!Number.isSafeInteger(container.count) || container.count < 1 || !capacity.some(clause => valuesOf(clause, OBJECT_UNITS).includes(container.count!)))) {
    bad('count', 'Container count must match an explicit number of stored objects.');
  }
  for (const [field, units, applicable] of [
    ['weight', WEIGHT_UNITS, capacity], ['volume', VOLUME_UNITS, capacity], ['itemWeight', WEIGHT_UNITS, ownWeight],
  ] as const) {
    const measure = container[field];
    if (!measure) {
      if (applicable.some(clause => Object.values(units).some(unit => valuesOf(clause, unit).length))) {
        bad(field, 'Do not omit another stated limit or the container’s own weight.');
      }
      continue;
    }
    const unitWords = (units as Record<string, string>)[measure.units];
    if (!unitWords || !Number.isFinite(measure.value) || (field === 'itemWeight' ? measure.value < 0 : measure.value <= 0)
      || !applicable.some(clause => valuesOf(clause, unitWords).includes(measure.value))) {
      bad(field, 'Preserve the explicit limit or container weight and its original unit.');
    }
  }
  if (typeof container.weightlessContents !== 'boolean' || container.weightlessContents !== WEIGHTLESS.test(text)) {
    bad('weightlessContents', 'Preserve explicitly stated weightless contents.');
  }
  if (!container.count && !container.weight && !container.volume && !container.weightlessContents) {
    bad('capacity', 'A container ability needs a source capacity limit or weightless contents.');
  }
}

function valuesOf(clause: string, units: string): number[] {
  return [...clause.matchAll(new RegExp(NUMBER + '\\s*(?:' + units + ')', 'giu'))]
    .map(match => Number(match[1]!.replaceAll(',', '')));
}

export function validateSpellScrollEvidence(
  scroll: ItemSpellScrollData, path: string, evidence: EvidenceRef[], source: string, resolver: ItemCoreSpellResolver, add: Check,
): void {
  const text = evidence.map(ref => ref?.quote ?? '').join('\n').replace(/[*_]/gu, '');
  const level = scroll.level;
  const levels = new Set<number>();
  if (/\bcantrip\b|戏法|戲法/iu.test(text)) levels.add(0);
  for (const match of text.matchAll(/(?:\blevel\s*(\d+)|\b(\d+)(?:st|nd|rd|th)?[-\s]+level\b|(\d+)\s*[环環])/giu)) {
    levels.add(Number(match[1] ?? match[2] ?? match[3]));
  }
  const spell = scroll.spell && typeof scroll.spell.identifier === 'string' && typeof scroll.spell.name === 'string'
    ? resolver.resolveSpell(scroll.spell.identifier, scroll.spell.name) : undefined;
  const fail = (field: string, message: string) => add('SPELL_SCROLL_NOT_EXPLICIT', path + '/' + field, message, 'semantic', evidence);
  if (!STANDARD_SCROLL.test(source)) fail('kind', 'The candidate needs an explicit standard Spell Scroll type or heading.');
  if (scroll.spell && (spell?.level === undefined || !text.toLowerCase().includes(scroll.spell.name.toLowerCase()))) {
    fail('spell', 'Quote the bound spell name and resolve it to the locked 2024 spell.');
  }
  if ((level === undefined && !spell) || levels.size > 1
    || (level !== undefined && (!Number.isSafeInteger(level) || level < 0 || level > 9 || !levels.has(level)))
    || (spell && (level !== undefined ? level !== spell.level : [...levels].some(entry => entry !== spell.level)))) {
    fail('level', 'Preserve the stated template level and the locked base level of the named spell.');
  }
  const standard = DND5E_V14_SPELL_SCROLL_LEVELS[spell?.level ?? level ?? -1];
  if (standard) {
    const expectedDc = /(?:\b(?:spell )?save DC|法[术術]豁免(?:\s*DC)?|豁免[难難]度)\s*(?:(?:is|of|固定为|固定為|为|為|是|[:：=])\s*)?(\d+)/giu;
    const expectedAttack = /\bspell attack (?:roll )?(?:bonus|modifier)\s*(?:(?:is|of|[:=])\s*)?[+＋]?(\d+)|法[术術]攻[击擊][^。！？\n]{0,40}?[+＋]\s*(\d+)/giu;
    for (const [field, pattern, value] of [['saveDc', expectedDc, standard[0]], ['attackBonus', expectedAttack, standard[1]]] as const) {
      if ([...source.matchAll(pattern)].some(match => Number(match[1] ?? match[2]) !== value)) {
        fail(field, 'The source challenge differs from the supported standard spell scroll at this level.');
      }
    }
  }
}
