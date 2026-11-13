import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { load } from 'js-yaml';
import { DND5E_V14_SYSTEM_VERSION } from '@fvtt-json-generator/contracts/target';

export interface GeneratedV14Spell {
  identifier: string;
  name: string;
  uuid: string;
  level: number;
  castingTime: { type: string; value: number | null };
  activation?: 'action' | 'bonus' | 'reaction' | 'free';
}

export interface GeneratedV14SpellSnapshot {
  sourceSha256: string;
  entries: GeneratedV14Spell[];
}

const DND5E_VERSION = DND5E_V14_SYSTEM_VERSION;
const SPELL_PACK = 'spells24';
const EXPECTED_SPELL_COUNT = 340;
const outputPath = resolve(import.meta.dir, '../src/browser-v14-spell-data.ts');

export async function buildV14SpellSnapshot(referenceCacheRoot: string): Promise<GeneratedV14SpellSnapshot> {
  const repoRoot = resolve(referenceCacheRoot, 'dnd5e', DND5E_VERSION, 'repo');
  const systemPath = join(repoRoot, 'system.json');
  const spellsRoot = join(repoRoot, 'packs', '_source', SPELL_PACK);
  const systemBytes = await readFile(systemPath);
  const system = JSON.parse(systemBytes.toString('utf8')) as Record<string, unknown>;
  if (system.version !== DND5E_VERSION) {
    throw new Error(`Expected dnd5e ${DND5E_VERSION}, received ${String(system.version)}.`);
  }

  const yamlPaths = await collectYamlFiles(spellsRoot);
  const sourceHash = createHash('sha256');
  const entries: GeneratedV14Spell[] = [];
  for (const path of [systemPath, ...yamlPaths]) {
    const bytes = path === systemPath ? systemBytes : await readFile(path);
    const sourcePath = relative(repoRoot, path).replaceAll('\\', '/');
    sourceHash.update(sourcePath).update('\0').update(bytes).update('\0');
    if (path === systemPath) continue;

    const source = load(bytes.toString('utf8')) as Record<string, unknown> | undefined;
    const itemSystem = asRecord(source?.system);
    const identifier = typeof itemSystem.identifier === 'string' ? itemSystem.identifier : '';
    const name = typeof source?.name === 'string' ? source.name : '';
    const id = typeof source?._id === 'string' ? source._id : '';
    if (source?.type !== 'spell' || !identifier || !name || !id) continue;
    if (typeof itemSystem.level !== 'number' || !Number.isInteger(itemSystem.level) || itemSystem.level < 0) {
      throw new Error(`Spell source is missing its level: ${sourcePath}.`);
    }
    const parentActivation = asRecord(itemSystem.activation);
    const activation = parentActivation.type;
    if (typeof activation !== 'string'
      || (parentActivation.value !== null && typeof parentActivation.value !== 'number')) {
      throw new Error(`Spell source is missing its casting time: ${sourcePath}.`);
    }
    entries.push({
      identifier,
      name,
      uuid: `Compendium.dnd5e.${SPELL_PACK}.Item.${id}`,
      level: itemSystem.level,
      castingTime: { type: activation, value: parentActivation.value },
      ...(isActivation(activation) ? { activation } : {}),
    });
  }

  entries.sort((left, right) => asciiCompare(left.identifier, right.identifier)
    || asciiCompare(left.uuid, right.uuid));
  if (entries.length !== EXPECTED_SPELL_COUNT) {
    throw new Error(`Expected ${EXPECTED_SPELL_COUNT} locked dnd5e spells, received ${entries.length}.`);
  }
  return { sourceSha256: sourceHash.digest('hex'), entries };
}

export function renderV14SpellSnapshot(snapshot: GeneratedV14SpellSnapshot): string {
  return [
    `// Generated from the locked dnd5e ${DND5E_VERSION} ${SPELL_PACK} reference cache. Do not hand-edit entries.`,
    `// Source snapshot: dnd5e/${DND5E_VERSION}/repo sha256=${snapshot.sourceSha256}`,
    'export interface LockedBrowserSpell {',
    '  identifier: string;',
    '  name: string;',
    '  uuid: string;',
    '  level: number;',
    '  castingTime: { type: string; value: number | null };',
    "  activation?: 'action' | 'bonus' | 'reaction' | 'free';",
    '}',
    '',
    'export const LOCKED_DND5E_V14_SPELLS: readonly LockedBrowserSpell[] =',
    `${JSON.stringify(snapshot.entries, null, 2)} as const;`,
    '',
  ].join('\n');
}

async function collectYamlFiles(root: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of (await readdir(root)).sort(asciiCompare)) {
    const path = join(root, entry);
    const details = await stat(path);
    if (details.isDirectory()) paths.push(...await collectYamlFiles(path));
    else if (path.endsWith('.yml')) paths.push(path);
  }
  return paths;
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isActivation(value: unknown): value is GeneratedV14Spell['activation'] {
  return value === 'action' || value === 'bonus' || value === 'reaction' || value === 'free';
}

if (import.meta.main) {
  const referenceCacheRoot = process.env.FVTT_REFERENCE_CACHE_ROOT?.trim();
  if (!referenceCacheRoot) throw new Error('FVTT_REFERENCE_CACHE_ROOT is required to generate the locked v14 spell snapshot.');
  const snapshot = await buildV14SpellSnapshot(referenceCacheRoot);
  await writeFile(outputPath, renderV14SpellSnapshot(snapshot), 'utf8');
  console.log(JSON.stringify({ outputPath, sourceSha256: snapshot.sourceSha256, count: snapshot.entries.length }, null, 2));
}
