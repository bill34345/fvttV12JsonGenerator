import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SpellsMapper } from '../../generation/src/spellsMapper';

const repoRoot = resolve(import.meta.dir, '../../..');
const sourcePath = resolve(repoRoot, 'data/spells.ldb');
const outputPath = resolve(import.meta.dir, '../src/browser-legacy-spell-data.ts');

process.chdir(repoRoot);
const source = await readFile(sourcePath);
const sourceSha256 = createHash('sha256').update(source).digest('hex');
const entries = new SpellsMapper().entries();

const output = [
  '// Generated from the final Node SpellsMapper entries. Do not hand-edit entries.',
  `// Source: data/spells.ldb sha256=${sourceSha256}`,
  'export interface BrowserLegacySpell {',
  '  name: string;',
  '  uuid: string;',
  '  sourceId: string;',
  '}',
  '',
  'export const LEGACY_BROWSER_SPELLS: readonly BrowserLegacySpell[] =',
  `${JSON.stringify(entries, null, 2)} as const;`,
  '',
].join('\n');

await writeFile(outputPath, output, 'utf8');
console.log(JSON.stringify({ outputPath, sourceSha256, count: entries.length }, null, 2));
