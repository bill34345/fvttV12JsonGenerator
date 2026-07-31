import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type {
  IconWorkflowOptions,
  V14IconCatalog,
  V14IconOverrideFile,
} from './types';

const CATALOG_PATH = fileURLToPath(
  new URL('../../../../references/foundry-v14-icons/catalog.json', import.meta.url),
);
const DEFAULT_OVERRIDES_PATH = fileURLToPath(
  new URL('../../../../config/icon-overrides.v14.json', import.meta.url),
);

export class IconConfigurationError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IconConfigurationError';
  }
}

export function loadV14IconCatalog(options: IconWorkflowOptions = {}): V14IconCatalog {
  const catalog = options.catalog ?? readJsonFile<V14IconCatalog>(
    CATALOG_PATH,
    'ICON_CATALOG_MISSING',
    'v14 icon catalog',
  );
  assertTarget(catalog.target, 'catalog');
  if (catalog.schemaVersion !== 1) {
    throw new IconConfigurationError(
      'ICON_CATALOG_SCHEMA_UNSUPPORTED',
      `Unsupported v14 icon catalog schema: ${String(catalog.schemaVersion)}.`,
    );
  }
  return catalog;
}

export function loadV14IconOverrides(
  options: IconWorkflowOptions,
  catalog: V14IconCatalog,
): V14IconOverrideFile {
  const overrides = options.overrides ?? readJsonFile<V14IconOverrideFile>(
    options.overridePath ?? DEFAULT_OVERRIDES_PATH,
    'ICON_OVERRIDE_MISSING',
    'v14 icon override file',
  );
  assertTarget(overrides.target, 'override file');
  if (overrides.schemaVersion !== 1 || !Array.isArray(overrides.entries)) {
    throw new IconConfigurationError(
      'ICON_OVERRIDE_SCHEMA_UNSUPPORTED',
      'The v14 icon override file must use schemaVersion 1 and contain an entries array.',
    );
  }
  validateOverrides(overrides, catalog);
  return overrides;
}

export function iconWorkflowFingerprint(options: IconWorkflowOptions = {}): string {
  if ((options.mode ?? 'off') === 'off') return 'off';
  const catalog = loadV14IconCatalog(options);
  const overrides = loadV14IconOverrides(options, catalog);
  return createHash('sha256')
    .update(JSON.stringify({
      target: catalog.target,
      provenance: catalog.provenance,
      overrides,
    }))
    .digest('hex');
}

function readJsonFile<T>(path: string, code: string, label: string): T {
  if (!existsSync(path)) {
    throw new IconConfigurationError(code, `Required ${label} is missing at "${path}".`);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch (error) {
    throw new IconConfigurationError(
      `${code}_INVALID`,
      `Unable to parse ${label} at "${path}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function assertTarget(
  target: V14IconCatalog['target'] | undefined,
  label: string,
): void {
  if (
    target?.foundryVersion !== '14.364'
    || target.systemId !== 'dnd5e'
    || target.systemVersion !== '5.3.3'
  ) {
    throw new IconConfigurationError(
      'ICON_TARGET_MISMATCH',
      `The ${label} must target Foundry 14.364 and dnd5e 5.3.3.`,
    );
  }
}

function validateOverrides(
  overrides: V14IconOverrideFile,
  catalog: V14IconCatalog,
): void {
  const knownPaths = new Set(catalog.files.map((entry) => entry.path));
  const keys = new Set<string>();
  for (const [index, entry] of overrides.entries.entries()) {
    if (!entry || typeof entry !== 'object') {
      throw new IconConfigurationError('ICON_OVERRIDE_INVALID', `Override entry ${index} is not an object.`);
    }
    const selector = entry.selector;
    if (!selector || typeof selector.itemType !== 'string' || !selector.itemType.trim()) {
      throw new IconConfigurationError(
        'ICON_OVERRIDE_INVALID',
        `Override entry ${index} must provide selector.itemType.`,
      );
    }
    for (const field of ['englishName', 'name', 'actorEnglishName', 'actorName'] as const) {
      const value = selector[field];
      if (
        value !== undefined
        && (typeof value !== 'string' || !value.trim() || value !== value.trim())
      ) {
        throw new IconConfigurationError(
          'ICON_OVERRIDE_INVALID',
          `Override entry ${index} selector.${field} must be a non-empty trimmed string when provided.`,
        );
      }
    }
    if (selector.itemType !== selector.itemType.trim()) {
      throw new IconConfigurationError(
        'ICON_OVERRIDE_INVALID',
        `Override entry ${index} selector.itemType must not contain surrounding whitespace.`,
      );
    }
    if (!catalog.typeDefaults[selector.itemType]) {
      throw new IconConfigurationError(
        'ICON_OVERRIDE_INVALID',
        `Override entry ${index} references unsupported selector.itemType "${selector.itemType}".`,
      );
    }
    const names = [selector.englishName, selector.name].filter((value) => typeof value === 'string' && value.trim());
    if (names.length !== 1) {
      throw new IconConfigurationError(
        'ICON_OVERRIDE_INVALID',
        `Override entry ${index} must provide exactly one of selector.englishName or selector.name.`,
      );
    }
    if (
      selector.actorEnglishName
      && selector.actorName
    ) {
      throw new IconConfigurationError(
        'ICON_OVERRIDE_INVALID',
        `Override entry ${index} may provide only one actor-scoping name.`,
      );
    }
    if (
      typeof entry.img !== 'string'
      || !/^(?:icons|systems\/dnd5e)\//u.test(entry.img)
      || entry.img.includes('..')
      || entry.img.startsWith('modules/')
      || !knownPaths.has(entry.img)
    ) {
      throw new IconConfigurationError(
        'ICON_OVERRIDE_PATH_INVALID',
        `Override entry ${index} references an unavailable core/dnd5e path: "${String(entry.img)}".`,
      );
    }
    const key = overrideSelectorKey(selector);
    if (keys.has(key)) {
      throw new IconConfigurationError(
        'ICON_OVERRIDE_DUPLICATE',
        `Duplicate v14 icon override selector: ${key}.`,
      );
    }
    keys.add(key);
  }
}

export function overrideSelectorKey(selector: V14IconOverrideFile['entries'][number]['selector']): string {
  return [
    normalizeSelectorValue(selector.itemType),
    selector.actorEnglishName ? `actor-en:${normalizeSelectorValue(selector.actorEnglishName)}` : '',
    selector.actorName ? `actor:${normalizeSelectorValue(selector.actorName)}` : '',
    selector.englishName ? `en:${normalizeSelectorValue(selector.englishName)}` : '',
    selector.name ? `name:${normalizeSelectorValue(selector.name)}` : '',
  ].filter(Boolean).join('|');
}

function normalizeSelectorValue(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’']/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}
