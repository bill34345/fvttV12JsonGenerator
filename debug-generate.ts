import { ItemParser } from './src/core/parser/item-parser';
import { ItemGenerator } from './src/core/generator/item-generator';
import { readFileSync } from 'fs';

const content = readFileSync('obsidian/dnd数据转fvttjson/input/items/三祷之坠.md', 'utf-8');
const parser = new ItemParser();
const parsed = parser.parse(content);

const generator = new ItemGenerator({ fvttVersion: '12' });
const stages = parsed.stages;

console.log('=== STAGE 0 (Dormant) ===');
console.log('requirements:', stages![0].requirements.length, 'items');
console.log('requirements:', JSON.stringify(stages![0].requirements, null, 2));

const stageUsesMax = parsed.uses?.max || '3';
const stageUses = parsed.uses
  ? { ...parsed.uses, max: stageUsesMax }
  : { max: stageUsesMax, spent: 0, recovery: [{ period: 'dawn', type: 'recoverAll' }] };

const stageParsed = { ...parsed, uses: stageUses };
console.log('\nstageParsed.structuredActions:', stageParsed.structuredActions ? 'EXISTS' : 'UNDEFINED');
console.log('stageParsed.structuredActions.spells:', stageParsed.structuredActions?.spells ? JSON.stringify(stageParsed.structuredActions.spells, null, 2) : 'UNDEFINED');

const stageItem = await generator.generate({
  ...stageParsed,
  name: `${parsed.name}`,
  cumulativeRequirements: stages![0].requirements,
});

console.log('\n=== Generated Dormant Item ===');
console.log('activities count:', Object.keys(stageItem.system.activities || {}).length);
console.log('activities:', JSON.stringify(stageItem.system.activities, null, 2));
