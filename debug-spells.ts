import { spellsMapper } from './src/core/mapper/spells';

const spellNames = ['隐形术', 'Invisibility', 'invisibility'];
for (const name of spellNames) {
  const info = spellsMapper.get(name);
  console.log(`spellsMapper.get("${name}"):`, info ? JSON.stringify(info) : 'undefined');
}

console.log('\nAll keys in spellsMapper (first 20):');
const entries = [...spellsMapper.entries()];
console.log(entries.slice(0, 20).map(([k]) => k));
console.log(`Total spells: ${entries.length}`);
