import { ItemParser } from './src/core/parser/item-parser';
import { readFileSync } from 'fs';

const content = readFileSync('obsidian/dnd数据转fvttjson/input/items/三祷之坠.md', 'utf-8');
const parser = new ItemParser();
const result = parser.parse(content);

console.log('=== STAGES ===');
console.log(JSON.stringify(result.stages, null, 2));

console.log('\n=== STRUCTURED ACTIONS ===');
console.log(JSON.stringify(result.structuredActions, null, 2));

console.log('\n=== CASTS ===');
console.log(JSON.stringify(result.structuredActions?.casts, null, 2));
