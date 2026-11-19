
import type { ParsedSpell, SpellActivity, SpellRoll } from '@fvtt-json-generator/models/spell';
import { renderFoundryItemDescriptionHtml } from './item-description';
import { createStableDocumentId } from './stableId';
import { getFoundryTarget } from './target';

/** Schema-derived from dnd5e 6.0.6 SpellData and its native Activities. */
export function generateSpellDocument(spell: ParsedSpell) {
  const id = createStableDocumentId(['standalone-spell', spell.identifier, spell.activity.type]);
  const activity = {
    _id: id,
    activation: { override: false },
    duration: { override: false },
    range: { override: false },
    target: { override: false, prompt: spell.target.template !== undefined || spell.target.type !== 'self' },
    consumption: { spellSlot: spell.level > 0, targets: [], scaling: { allowed: false } },
    effects: [],
    ...projectActivity(spell.activity),
  };

  const description = spell.gm ? spell.description + '\n\n### GM 裁定\n\n' + spell.gm : spell.description;
  return {
    name: spell.name,
    type: 'spell' as const,
    effects: [],
    system: {
      identifier: spell.identifier,
      description: { value: renderFoundryItemDescriptionHtml(description, { allowHtml: false }) },
      source: { rules: spell.rules, custom: spell.source ?? '' },
      level: spell.level,
      school: spell.school,
      method: 'spell',
      prepared: spell.level === 0 ? 2 : 0,
      ability: '',
      properties: spell.components,
      materials: { value: spell.materials?.value ?? '', cost: spell.materials?.cost ?? 0,
        consumed: spell.materials?.consumed ?? false, supply: 0 },
      activation: { type: spell.activation.type, value: spell.activation.value ?? null, condition: spell.activation.condition ?? '' },
      duration: { units: spell.duration.units, value: formulaValue(spell.duration.value) },
      range: { units: spell.range.units, value: formulaValue(spell.range.value) },
      target: {
        affects: { type: spell.target.type, count: formulaValue(spell.target.count), special: spell.target.special ?? '' },
        ...(spell.target.template && { template: {
          units: 'ft', type: spell.target.template.type, size: String(spell.target.template.size),
          width: formulaValue(spell.target.template.width), height: formulaValue(spell.target.template.height),
        } }),
      },
      activities: { [id]: activity },
    },
    _stats: { ...getFoundryTarget('14').stats },
  };
}

function projectActivity(activity: SpellActivity) {
  switch (activity.type) {
    case 'heal':
      return { type: activity.type, healing: projectRoll(activity.healing) };
    case 'attack':
      return {
        type: activity.type,
        attack: { ability: '', flat: false, type: { value: activity.attack, classification: 'spell' } },
        damage: { includeBase: false, parts: activity.damage.map(projectRoll) },
      };
    case 'save':
      return {
        type: activity.type,
        save: { ability: [activity.save], dc: { calculation: 'spellcasting', formula: '' } },
        damage: { onSave: activity.onSave, parts: activity.damage.map(projectRoll) },
      };
    case 'damage':
      return { type: activity.type, damage: { parts: activity.damage.map(projectRoll) } };
    case 'utility':
      return { type: activity.type };
  }
}

function projectRoll(roll: SpellRoll & { type: string }) {
  return {
    number: roll.dice.count,
    denomination: roll.dice.faces,
    bonus: roll.bonus === undefined ? '' : String(roll.bonus),
    types: [roll.type],
    custom: { enabled: false },
    scaling: { mode: roll.scaling ? 'whole' : '', number: roll.scaling ?? 0 },
  };
}

function formulaValue(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}
