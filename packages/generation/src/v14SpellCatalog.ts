import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

export interface LockedDnd5eV14Spell {
  identifier: string;
  name: string;
  uuid: string;
}

export type LockedDnd5eV14Activation = 'action' | 'bonus' | 'reaction' | 'free';

interface LockedSpellCatalog {
  byIdentifier: Map<string, LockedDnd5eV14Spell[]>;
  byName: Map<string, LockedDnd5eV14Spell[]>;
  activationByUuid: Map<string, LockedDnd5eV14Activation>;
}

const CATALOG_CACHE = new Map<string, LockedSpellCatalog>();
let yamlLoader: { load(value: string): unknown } | undefined;

/**
 * Resolve a core dnd5e 5.3.3 spell from the manifest-pinned reference cache.
 * Both identifier and English name must independently select the same one
 * source spell.  This deliberately avoids the older unversioned spell mapper
 * for formal V14 Item Intake.
 */
export function resolveLockedDnd5eV14Spell(
  identifier: string,
  name: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): LockedDnd5eV14Spell | undefined {
  const normalizedIdentifier = normalize(identifier);
  const normalizedName = normalize(name);
  if (!normalizedIdentifier || !normalizedName) return undefined;

  const root = resolve(environment.FVTT_REFERENCE_CACHE_ROOT?.trim()
    || join(process.cwd(), '.local', 'references'));
  const catalog = loadCatalog(root);
  const identifiers = catalog.byIdentifier.get(normalizedIdentifier) ?? [];
  const names = catalog.byName.get(normalizedName) ?? [];
  if (identifiers.length !== 1 || names.length !== 1) return undefined;
  return identifiers[0]?.uuid === names[0]?.uuid ? identifiers[0] : undefined;
}

/**
 * Read the canonical casting activation for a uniquely resolved core spell.
 * This is a catalog-derived value, not an inference from an Item's prose.
 */
export function resolveLockedDnd5eV14SpellActivation(
  identifier: string,
  name: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): LockedDnd5eV14Activation | undefined {
  const spell = resolveLockedDnd5eV14Spell(identifier, name, environment);
  if (!spell) return undefined;
  const root = resolve(environment.FVTT_REFERENCE_CACHE_ROOT?.trim()
    || join(process.cwd(), '.local', 'references'));
  return loadCatalog(root).activationByUuid.get(spell.uuid);
}

function loadCatalog(cacheRoot: string): LockedSpellCatalog {
  const cached = CATALOG_CACHE.get(cacheRoot);
  if (cached) return cached;

  const repoRoot = join(cacheRoot, 'dnd5e', '5.3.3', 'repo');
  const systemPath = join(repoRoot, 'system.json');
  const spellsRoot = join(repoRoot, 'packs', '_source', 'spells');
  if (!existsSync(systemPath) || !existsSync(spellsRoot)) {
    const empty = emptyCatalog();
    CATALOG_CACHE.set(cacheRoot, empty);
    return empty;
  }
  const system = parseYaml(readFileSync(systemPath, 'utf8')) as Record<string, unknown> | undefined;
  if (String(system?.version ?? '') !== '5.3.3') {
    const empty = emptyCatalog();
    CATALOG_CACHE.set(cacheRoot, empty);
    return empty;
  }

  const catalog = emptyCatalog();
  for (const path of collectYamlFiles(spellsRoot)) {
    const source = parseYaml(readFileSync(path, 'utf8')) as Record<string, unknown> | undefined;
    const itemSystem = source?.system as Record<string, unknown> | undefined;
    const identifier = typeof itemSystem?.identifier === 'string' ? itemSystem.identifier : '';
    const name = typeof source?.name === 'string' ? source.name : '';
    const id = typeof source?._id === 'string' ? source._id : '';
    if (!identifier || !name || !id) continue;
    const activation = (((itemSystem?.activation as Record<string, unknown> | undefined)?.type) as string | undefined);
    const spell = {
      identifier,
      name,
      uuid: `Compendium.dnd5e.spells.Item.${id}`,
    };
    add(catalog.byIdentifier, normalize(identifier), spell);
    add(catalog.byName, normalize(name), spell);
    if (activation && isActivation(activation)) catalog.activationByUuid.set(spell.uuid, activation);
  }
  CATALOG_CACHE.set(cacheRoot, catalog);
  return catalog;
}

function emptyCatalog(): LockedSpellCatalog {
  return { byIdentifier: new Map(), byName: new Map(), activationByUuid: new Map() };
}

function collectYamlFiles(root: string): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) paths.push(...collectYamlFiles(path));
    else if (path.endsWith('.yml')) paths.push(path);
  }
  return paths;
}

function add(
  index: Map<string, LockedDnd5eV14Spell[]>,
  key: string,
  spell: LockedDnd5eV14Spell,
): void {
  if (!key) return;
  const existing = index.get(key) ?? [];
  existing.push(spell);
  index.set(key, existing);
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

function isActivation(value: string): value is LockedDnd5eV14Activation {
  return value === 'action' || value === 'bonus' || value === 'reaction' || value === 'free';
}

/** Keep ordinary CLI routes from paying to initialize the YAML parser. */
function parseYaml(source: string): unknown {
  yamlLoader ??= createRequire(import.meta.url)('js-yaml') as { load(value: string): unknown };
  return yamlLoader.load(source);
}
