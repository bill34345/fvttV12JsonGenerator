// Source shape reduced from the preserved 2024 PHB Geas native cache in
// .local/forge-common-boundary-20261021/chrome/business-final-before-reload.json.
// Personal/world identities and cache ownership are deliberately absent.
export const conditionalRule = 'While Charmed, the creature takes [[/damage 5d10 type=psychic]] damage if it acts in a manner directly counter to your command. It takes this damage no more than once each day.';

export function conditionalSpellFixture(): Record<string, any> {
  return {
    type: 'spell', name: 'Source spell',
    _stats: { compendiumSource: 'Compendium.dnd-players-handbook.spells.Item.phbsplGeas000000' },
    system: {
      source: { rules: '2024' },
      description: { value: '<p>The target must succeed on a Wisdom saving throw or be Charmed for the duration.</p><p>' + conditionalRule + '</p>', chat: '' },
      activities: {
        dnd5eactivity000: {
          _id: 'dnd5eactivity000', type: 'save', activation: { type: 'action', override: false },
          description: { chatFlavor: 'Native Save note' },
          consumption: { spellSlot: true, targets: [] },
          effects: [{ _id: 'SourceEffect0001', onSave: false }],
          save: { ability: ['wis'], dc: { calculation: 'spellcasting', formula: '' } },
          damage: { onSave: 'none', parts: [{ number: 5, denomination: 10, bonus: '', types: ['psychic'], custom: { enabled: false, formula: '' }, scaling: { mode: '', number: 1 } }] },
        },
      },
    },
    effects: [{ _id: 'SourceEffect0001', type: 'base', statuses: ['charmed'], transfer: false, duration: { value: 2592000, units: 'seconds' } }],
    flags: { foreign: { keep: true } },
  };
}
