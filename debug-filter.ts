import { ItemParser } from './src/core/parser/item-parser';
import { readFileSync } from 'fs';

const content = readFileSync('obsidian/dnd数据转fvttjson/input/items/三祷之坠.md', 'utf-8');
const parser = new ItemParser();
const result = parser.parse(content);

for (const stage of result.stages!) {
  console.log(`${stage.name}: ${stage.requirements!.length} requirements`);
}
