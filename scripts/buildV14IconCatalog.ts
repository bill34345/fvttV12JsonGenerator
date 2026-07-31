import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import type {
  V14IconCatalog,
  V14IconCatalogEntry,
  V14IconFileEntry,
} from '../src/core/icons/types';
import { tokenize } from '../src/core/icons/resolver';

interface PublicCompendiumExport {
  schemaVersion: 1;
  foundryVersion: string;
  systemId: string;
  systemVersion: string;
  api: string;
  packs: Array<{
    id: string;
    entries: Array<{
      _id: string;
      name: string;
      img: string;
      type: string;
      identifier?: string | null;
      rules?: string | null;
    }>;
  }>;
}

const ROOT = resolve(import.meta.dir, '..');
const DEFAULT_INPUT = join(
  ROOT,
  '.local',
  'foundry-v14',
  'evidence',
  'icon-catalog',
  'compendium-index.json',
);
const DEFAULT_OUTPUT = join(ROOT, 'references', 'foundry-v14-icons', 'catalog.json');
const CORE_ICON_ROOT = join(ROOT, '.local', 'foundry-v14', 'app', '14.364', 'public', 'icons');
const DND5E_ROOT = join(
  ROOT,
  '.local',
  'foundry-v14',
  'data',
  'server-mirror',
  'Data',
  'systems',
  'dnd5e',
);
const DND5E_ICON_ROOT = join(DND5E_ROOT, 'icons');
const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const PACK_ORDER = [
  'dnd5e.monsterfeatures24',
  'dnd5e.monsterfeatures',
  'dnd5e.items',
  'dnd5e.spells',
] as const;

const TYPE_DEFAULTS: Record<string, string> = {
  background: 'systems/dnd5e/icons/svg/items/background.svg',
  class: 'systems/dnd5e/icons/svg/items/class.svg',
  consumable: 'systems/dnd5e/icons/svg/items/consumable.svg',
  container: 'systems/dnd5e/icons/svg/items/container.svg',
  equipment: 'systems/dnd5e/icons/svg/items/equipment.svg',
  facility: 'systems/dnd5e/icons/svg/items/facility.svg',
  feat: 'systems/dnd5e/icons/svg/items/feature.svg',
  loot: 'systems/dnd5e/icons/svg/items/loot.svg',
  race: 'systems/dnd5e/icons/svg/items/race.svg',
  spell: 'systems/dnd5e/icons/svg/items/spell.svg',
  subclass: 'systems/dnd5e/icons/svg/items/subclass.svg',
  tool: 'systems/dnd5e/icons/svg/items/tool.svg',
  weapon: 'systems/dnd5e/icons/svg/items/weapon.svg',
};

const inputPath = cliValue('--input') ?? DEFAULT_INPUT;
const outputPath = cliValue('--output') ?? DEFAULT_OUTPUT;

for (const required of [inputPath, CORE_ICON_ROOT, DND5E_ICON_ROOT]) {
  if (!existsSync(required)) throw new Error(`Required v14 icon-catalog source is missing: ${required}`);
}

const rawText = readFileSync(inputPath, 'utf-8');
const source = JSON.parse(rawText) as PublicCompendiumExport;
validateExport(source);

const coreFiles = scanIconFiles(CORE_ICON_ROOT, 'icons', 'core');
const dnd5eFiles = scanIconFiles(DND5E_ICON_ROOT, 'systems/dnd5e/icons', 'dnd5e');
const files = [...coreFiles.entries, ...dnd5eFiles.entries]
  .sort((left, right) => left.path.localeCompare(right.path, 'en'));
const filePaths = new Set(files.map((entry) => entry.path));

for (const [type, path] of Object.entries(TYPE_DEFAULTS)) {
  if (!filePaths.has(path)) throw new Error(`Missing dnd5e ${type} default artwork: ${path}`);
}

const compendium: V14IconCatalogEntry[] = [];
for (const [packPriority, packId] of PACK_ORDER.entries()) {
  const pack = source.packs.find((entry) => entry.id === packId);
  if (!pack) throw new Error(`Public Compendium export is missing ${packId}.`);
  for (const entry of pack.entries) {
    if (!entry.img || !filePaths.has(entry.img)) continue;
    compendium.push({
      id: entry._id,
      name: entry.name,
      img: entry.img,
      type: entry.type,
      ...(entry.identifier ? { identifier: entry.identifier } : {}),
      ...(entry.rules === '2014' || entry.rules === '2024' ? { rules: entry.rules } : {}),
      pack: pack.id,
      packPriority,
      tokens: uniqueSorted([
        ...tokenize(entry.name),
        ...tokenize(entry.identifier ?? ''),
        ...tokensFromPath(entry.img),
      ]),
    });
  }
}
compendium.sort((left, right) =>
  left.packPriority - right.packPriority
  || left.name.localeCompare(right.name, 'en')
  || left.id.localeCompare(right.id, 'en'),
);

const catalog: V14IconCatalog = {
  schemaVersion: 1,
  target: {
    foundryVersion: '14.364',
    systemId: 'dnd5e',
    systemVersion: '5.3.3',
  },
  provenance: {
    api: 'CompendiumCollection#getIndex',
    packIndexSha256: sha256(rawText),
    coreFilesSha256: coreFiles.sha256,
    dnd5eFilesSha256: dnd5eFiles.sha256,
    packs: PACK_ORDER.map((id) => ({
      id,
      count: source.packs.find((entry) => entry.id === id)?.entries.length ?? 0,
    })),
  },
  typeDefaults: TYPE_DEFAULTS,
  compendium,
  files,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf-8');
console.log(JSON.stringify({
  outputPath,
  target: catalog.target,
  files: files.length,
  compendium: compendium.length,
  packs: catalog.provenance.packs,
  outputSha256: sha256(readFileSync(outputPath)),
}, null, 2));

function cliValue(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  const value = index >= 0 ? Bun.argv[index + 1] : undefined;
  return value ? resolve(value) : undefined;
}

function validateExport(source: PublicCompendiumExport): void {
  if (
    source.schemaVersion !== 1
    || source.foundryVersion !== '14.364'
    || source.systemId !== 'dnd5e'
    || source.systemVersion !== '5.3.3'
    || source.api !== 'CompendiumCollection#getIndex'
    || !Array.isArray(source.packs)
  ) {
    throw new Error('Compendium export must come from Foundry 14.364 / dnd5e 5.3.3 getIndex().');
  }
}

function scanIconFiles(
  root: string,
  logicalRoot: string,
  source: V14IconFileEntry['source'],
): { entries: V14IconFileEntry[]; sha256: string } {
  const paths = collectFiles(root)
    .filter((path) => IMAGE_EXTENSIONS.has(extname(path).toLowerCase()))
    .sort((left, right) => left.localeCompare(right, 'en'));
  const hash = createHash('sha256');
  const entries = paths.map((path) => {
    const rel = relative(root, path).split(sep).join('/');
    const logicalPath = `${logicalRoot}/${rel}`;
    const bytes = readFileSync(path);
    hash.update(logicalPath);
    hash.update('\0');
    hash.update(bytes);
    return {
      path: logicalPath,
      source,
      tokens: uniqueSorted(tokensFromPath(logicalPath)),
    };
  });
  return { entries, sha256: hash.digest('hex') };
}

function collectFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(path));
    else if (entry.isFile() && statSync(path).size > 0) files.push(path);
  }
  return files;
}

function tokensFromPath(path: string): string[] {
  return path
    .replace(/\.[^.]+$/u, '')
    .split(/[\/_-]+/u)
    .flatMap((part) => tokenize(part))
    .filter((token) => !['icons', 'systems', 'dnd5e', 'svg', 'items'].includes(token));
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en'));
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
