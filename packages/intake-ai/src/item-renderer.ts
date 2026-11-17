import * as yaml from 'js-yaml';
import type { ItemDiscoveryCandidate, ItemIntakeAbility, ItemIntakeDamage, ItemIntakeIR, ItemIntakeUses } from './item-types';

/** Render a reviewable project Item Markdown file without losing source prose. */
export function renderItemIntakeMarkdown(
  source: string,
  candidate: ItemDiscoveryCandidate,
  ir: ItemIntakeIR,
  spellUuids: ReadonlyMap<string, string> = new Map(),
): string {
  const mechanics = {
    schemaVersion: 1,
    ...(ir.item.uses ? { uses: renderUses(ir.item.uses) } : {}),
    abilities: ir.item.abilities.map(ability => renderAbility(ability, spellUuids.get(ability.id))),
  };
  const frontmatter = yaml.dump({
    layout: 'item',
    名称: ir.item.name,
    ...(ir.item.englishName ? { 英文名: ir.item.englishName } : {}),
    类型: ir.item.type,
    ...(ir.item.rarity ? { 稀有度: ir.item.rarity } : {}),
    ...(ir.item.attunement === 'required' ? { 'require-attunement': true } : {}),
    'item-mechanics': mechanics,
  }, { noRefs: true, lineWidth: -1 });
  const original = source.slice(candidate.start, candidate.end).trim();
  return `---\n${frontmatter}---\n\n## 原始资料（Intake 保留）\n\n${original}\n`;
}

function renderAbility(ability: ItemIntakeAbility, uuid?: string): object {
  const identity = { id: ability.id, kind: ability.kind };
  switch (ability.kind) {
    case 'passive-ac':
    case 'passive-save':
      return { ...identity, value: ability.value };
    case 'passive-resistance':
      return { ...identity, damageType: ability.damageType };
    case 'passive-movement':
      return { ...identity, movement: ability.movement, value: ability.value };
    case 'weapon-bonus':
      return { ...identity, baseItem: ability.baseItem, value: ability.value };
    case 'enchant-weapon-bonus':
      return { ...identity, bonuses: ability.bonuses };
    case 'enchant-armor-resistance':
      return { ...identity, damageTypes: ability.damageTypes };
    case 'container':
      return { ...identity, count: ability.count, weight: ability.weight, volume: ability.volume,
        itemWeight: ability.itemWeight, weightlessContents: ability.weightlessContents };
    case 'spell-scroll':
      return { ...identity, level: ability.level, spell: ability.spell };
    case 'spell-storage':
      return { ...identity, capacity: ability.capacity, foundLevels: ability.foundLevels, spells: ability.spells };
    case 'timed-speed':
      return { ...identity, seconds: ability.seconds };
    case 'summon-creature':
      return { ...identity, actorName: ability.actorName, actorUuid: ability.actorUuid,
        rangeFeet: ability.rangeFeet, durationHours: ability.durationHours, cooldownDays: ability.cooldownDays };
    case 'light':
      return { ...identity, activation: ability.activation, consumption: ability.consumption,
        bright: ability.bright, dim: ability.dim, extinguish: ability.extinguish };
    case 'spell':
      return {
        ...identity, activation: ability.activation, consumption: ability.consumption,
        spell: { identifier: ability.spell.identifier, name: ability.spell.name, ...(uuid ? { uuid } : {}) },
        ...(ability.activityUses ? { activityUses: renderUses(ability.activityUses) } : {}),
        ...(ability.level === undefined ? {} : { level: ability.level }),
        ...(ability.saveDc === undefined ? {} : { saveDc: ability.saveDc }),
        ...(ability.maxCharges === undefined ? {} : { maxCharges: ability.maxCharges }),
        ...(ability.activationOverride ? { activationOverride: true } : {}),
      };
    case 'heal':
      return { ...identity, name: ability.name, englishName: ability.englishName, activation: ability.activation,
        formula: ability.formula, target: ability.target, range: ability.range, consumption: ability.consumption };
    case 'attack':
      return { ...identity, name: ability.name, englishName: ability.englishName, activation: ability.activation,
        attackType: ability.attackType, ability: ability.ability, toHit: ability.toHit,
        range: ability.range, target: ability.target, damage: renderDamage(ability.damage) };
    case 'save':
      return { ...identity, name: ability.name, englishName: ability.englishName, activation: ability.activation,
        ability: ability.ability, dc: ability.dc, outcome: ability.outcome, consumption: ability.consumption,
        range: ability.range, target: ability.target, duration: ability.duration, damage: renderDamage(ability.damage),
        ...(ability.scaleMax === undefined ? {} : { 'scale-consumption': true, 'scale-max': ability.scaleMax }) };
    case 'utility':
      return { ...identity, name: ability.name, englishName: ability.englishName, activation: ability.activation,
        consumption: ability.consumption, trigger: ability.trigger, range: ability.range,
        target: ability.target, duration: ability.duration };
  }
}

function renderDamage(damage: ItemIntakeDamage[]): ItemIntakeDamage[] {
  return damage.map(({ formula, type, scaling }) => ({ formula, type, ...(scaling ? { scaling } : {}) }));
}

function renderUses(uses: ItemIntakeUses): ItemIntakeUses {
  return {
    max: uses.max,
    recovery: uses.recovery.map((entry) => entry.type === 'formula'
      ? { ...entry, formula: entry.formula.trim().toLowerCase() } : entry),
  };
}
