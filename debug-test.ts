import { ItemGenerator } from './src/core/generator/item-generator';
import { ItemParser } from './src/core/parser/item-parser';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REFERENCES_PATH = join(__dirname, '../../..', 'references/dnd5e-4.3.9/repo/packs/_source/items');

console.log('REFERENCES_PATH:', REFERENCES_PATH);
console.log('existsSync:', existsSync(REFERENCES_PATH));

const generator = new ItemGenerator();
const parser = new ItemParser();

const content = `
---
layout: item
名称: 测试护甲
类型: 护甲
稀有度: rare
require-attunement: true
---
## 测试护甲（Test Armor）
*护甲，稀有（需同调）*
这是一个测试护甲。
`.trim();

const parsed = parser.parse(content);
console.log('Parsed type:', parsed.type);

const armorPath = join(REFERENCES_PATH, 'armor');
console.log('armor path:', armorPath);
console.log('armor exists:', existsSync(armorPath));
if (existsSync(armorPath)) {
  const files = readdirSync(armorPath).filter(f => f.endsWith('.json'));
  console.log('armor files count:', files.length);
  if (files.length > 0) {
    const firstFile = files[0];
    const templatePath = join(armorPath, firstFile);
    console.log('Reading:', templatePath);
    const content = readFileSync(templatePath, 'utf-8');
    const template = JSON.parse(content);
    console.log('Template has system:', 'system' in template);
    console.log('Template type:', template.type);
  }
}

const item = await generator.generate(parsed);
console.log('Item type:', item.type);
console.log('Item system:', item.system ? 'exists' : 'undefined');
console.log('Item has system:', 'system' in item);
console.log('Item keys:', Object.keys(item));
if (item.system) {
  console.log('System keys:', Object.keys(item.system));
}
