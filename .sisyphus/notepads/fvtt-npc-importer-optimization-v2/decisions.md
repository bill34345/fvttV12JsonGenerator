- Decided to initialize missing skills with a default structure { value: 0, ability: SKILL_ABILITIES[key] || 'int', bonuses: { check: '', passive: '' } } to ensure compatibility with Foundry VTT dnd5e system.
### Damage Bypasses Implementation
- Decided to use a shared  array in  for simplicity, as most 5e creatures have bypasses that apply to all their physical resistances/immunities.
- Updated  in parsers to be more robust when handling  separators, especially when they appear at the end of the input or without a leading separator.
### Damage Bypasses Implementation
- Decided to use a shared bypasses array in ParsedNPC.traits for simplicity, as most 5e creatures have bypasses that apply to all their physical resistances/immunities.
- Updated splitContent in parsers to be more robust when handling "---" separators, especially when they appear at the end of the input or without a leading separator.
