import type { BloodHunterSourceEntry } from './types';

const ICONS: Record<string, string> = {
  'Blood Hunter': 'icons/skills/melee/blade-tip-chipped-blood-red.webp',
  'Order of the Ghostslayer': 'icons/magic/death/undead-ghost-strike-white.webp',
  'Order of the Profane Soul': 'icons/magic/death/undead-ghosts-trio-blue.webp',
  'Order of the Mutant': 'icons/tools/laboratory/vials-blue-pink.webp',
  'Order of the Lycan': 'icons/creatures/mammals/wolf-howl-moon-gray.webp',
  'Hemocraft': 'icons/skills/wounds/anatomy-organ-heart-red.webp',
  'Weapon Mastery': 'icons/weapons/swords/sword-runed-glowing.webp',
  'Crimson Rite': 'icons/skills/melee/blood-slash-foam-red.webp',
  'Fighting Style': 'icons/skills/melee/shield-block-bash-blue.webp',
  'Mutagenic Warrior': 'icons/tools/laboratory/vial-orange.webp',
  'Extra Attack': 'icons/skills/melee/strike-blade-blood-red.webp',
  'Brand of Castigation': 'icons/magic/symbols/rune-sigil-red-orange.webp',
  'Grim Psychometry': 'icons/skills/wounds/anatomy-organ-brain-pink-red.webp',
  'Hardened Soul': 'icons/magic/life/heart-cross-blue.webp',
  'Sanguine Mastery': 'icons/magic/life/heart-area-circle-red-green.webp',
  'Rite of the Dawn': 'icons/magic/air/weather-clouds-sunlight.webp',
  'Curse Specialist': 'icons/sundries/documents/document-symbol-rune-brown.webp',
  'Aether Walk': 'icons/magic/death/undead-ghost-scream-teal.webp',
  'Rite Revival': 'icons/magic/life/heart-broken-red.webp',
  'Pact Magic': 'icons/sundries/documents/document-symbol-rune-tan.webp',
  'Mutagencraft': 'icons/tools/laboratory/vial-orange.webp',
  'Mutagens': 'icons/consumables/potions/potion-vial-corked-labeled-purple.webp',
  'Hybrid Transformation': 'icons/creatures/mammals/humanoid-wolf-dog-blue.webp',
  "Stalker's Prowess": 'icons/creatures/mammals/wolf-shadow-black.webp',
  'Advanced Transformation': 'icons/magic/nature/wolf-paw-glow-large-orange.webp',
  'Transformation Mastery': 'icons/magic/nature/wolf-paw-glow-large-purple-teal.webp',
  'Rite of the Flame': 'icons/weapons/axes/axe-fire.webp',
  'Rite of the Frozen': 'icons/weapons/daggers/dagger-crooked-ice-blue.webp',
  'Rite of the Storm': 'icons/weapons/swords/sword-flanged-lightning.webp',
  'Rite of the Dead': 'icons/commodities/treasure/token-white-skull.webp',
  'Rite of the Oracle': 'icons/commodities/treasure/brooch-gold-eye-green.webp',
  'Rite of the Roar': 'icons/creatures/mammals/wolf-howl-moon-black.webp',
  'Blood Curse of the Anxious': 'icons/skills/wounds/anatomy-organ-brain-pink-red.webp',
  'Blood Curse of Binding': 'icons/weapons/sickles/sickle-kusarigama-chain.webp',
  'Blood Curse of Bloated Agony': 'icons/magic/life/heart-broken-red.webp',
  'Blood Curse of Corrosion': 'icons/creatures/slimes/slime-face-skull-green.webp',
  'Blood Curse of the Exorcist': 'icons/magic/death/undead-ghost-strike-white.webp',
  'Blood Curse of Exposure': 'icons/commodities/treasure/brooch-eye-silver-teal.webp',
  'Blood Curse of the Eyeless': 'icons/commodities/treasure/token-engraved-eye-red.webp',
  'Blood Curse of the Fallen Puppet': 'icons/weapons/wands/wand-skull-feathers.webp',
  'Blood Curse of the Howl': 'icons/creatures/mammals/wolf-howl-moon-forest-blue.webp',
  'Blood Curse of the Marked': 'icons/skills/melee/strike-axe-blood-red.webp',
  'Blood Curse of the Muddled Mind': 'icons/creatures/tentacles/tentacle-eyes-yellow-pink.webp',
  'Blood Curse of Mutual Suffering': 'icons/magic/life/heart-area-circle-red-green.webp',
  'Blood Curse of the Reckless': 'icons/weapons/fist/claw-grey-black.webp',
  'Blood Curse of the Souleater': 'icons/magic/death/undead-ghosts-trio-blue.webp',
};

export function bloodHunterDisplayName(entry: Pick<BloodHunterSourceEntry, 'name' | 'ENG_name'>): string {
  return entry.ENG_name && entry.ENG_name !== entry.name ? `${entry.name} ${entry.ENG_name}` : entry.name;
}

export function bloodHunterActivityName(name: string, entry: Pick<BloodHunterSourceEntry, 'name' | 'ENG_name'>): string {
  const english = entry.ENG_name;
  if (!english || name.includes(english)) return name;
  if (name.includes('失血')) return `${name} Hemocraft Loss`;
  if (name.startsWith('增幅')) return `${name} Amplify ${english}`;
  if (name.startsWith('激活')) return `${name} Activate ${english}`;
  return `${name} ${english}`;
}

export function bloodHunterIcon(entry: Pick<BloodHunterSourceEntry, 'name' | 'ENG_name'>): string {
  const english = entry.ENG_name ?? entry.name;
  if (ICONS[english]) return ICONS[english];
  if (/Brand/.test(english)) return 'icons/skills/melee/strike-axe-blood-red.webp';
  if (/Attunement|Arcana|Frenzy|Resilience/.test(english)) return 'icons/sundries/documents/document-symbol-rune-tan.webp';
  if (/Metabolism|Mutation/.test(english)) return 'icons/tools/laboratory/vials-blue-pink.webp';
  if (/Aether|Alluring|Celerity|Conversant|Cruelty|Echolocation|Embers|Gelid|Impermeable|Mobile|Nighteye|Percipient|Potency|Precision|Rapidity|Reagent|Reconstruction|Sagacity|Shielded|Unbreakable|Vermillion/.test(english)) return 'icons/consumables/potions/potion-vial-corked-purple.webp';
  return 'icons/sundries/flags/banner-symbol-sun-gold-red.webp';
}
