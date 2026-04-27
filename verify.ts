import { readFileSync } from 'fs';
import { join } from 'path';

const dir = 'obsidian/dnd数据转fvttjson/output/items';
const files = [
  '三祷之坠.json/三祷之坠.json',
  '三祷之坠.json/三祷之坠 (Awakened).json',
  '三祷之坠.json/三祷之坠 (Exalted).json',
  '骑士之盾.json'
];

for (const file of files) {
  const content = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
  const activities = content.system.activities || {};
  const names = Object.values(activities).map((a: any) => {
    if (a.type === 'cast') return `cast:${a.spell?.uuid || 'unknown'}`;
    if (a.type === 'save') return `save:DC${a.save?.dc?.value || a.save?.dc || '?'}`;
    if (a.type === 'attack') return `attack`;
    return `${a.type}:${a.activation?.type || 'passive'}`;
  });
  console.log(`${file}:`);
  console.log(`  uses.max: ${content.system.uses?.max || 'none'}`);
  console.log(`  activities: ${names.length}`);
  for (const n of names) console.log(`    - ${n}`);
}
