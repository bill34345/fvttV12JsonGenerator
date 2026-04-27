import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// This mimics what item-generator.ts does
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REFERENCES_PATH = join(__dirname, '../../..', 'references/dnd5e-4.3.9/repo/packs/_source/items');

console.log('Script location:', __dirname);
console.log('REFERENCES_PATH:', REFERENCES_PATH);
console.log('existsSync:', existsSync(REFERENCES_PATH));

// Now try going only 2 levels up
const REFERENCES_PATH2 = join(__dirname, '../..', 'references/dnd5e-4.3.9/repo/packs/_source/items');
console.log('REFERENCES_PATH2:', REFERENCES_PATH2);
console.log('existsSync2:', existsSync(REFERENCES_PATH2));
