import { hashSourceInventoryMetadata } from '../../core/spell-resolution/resolver';
import { sha256 } from '../../core/spell-resolution/sha256';
import type { SpellCandidateMetadata } from '../../core/spell-resolution/types';

export const ITEM_INDEX_FIELDS = [
  '_id',
  'name',
  'type',
  'system.identifier',
  'system.source.rules',
  'system.source.book',
  'system.level',
  'system.school',
] as const;

export interface FoundryItemPackRef {
  /** Authoritative Foundry collection identity, e.g. dnd5e.spells24. */
  collection: string;
  packageId: string;
  packageVersion: string;
  packId: string;
  documentName: string;
  enabled: boolean;
  readable: boolean;
  /** Informational only; never used as a content trust gate. */
  typeHints?: string[];
  /** Informational only; covers expansion packs using an options-style manifest. */
  hasOptionsHint?: boolean;
}

export interface FoundrySpellSourceAdapter {
  getRuntimeVersions(): { foundry: string; dnd5e: string };
  listEnabledReadableItemPacks(): Promise<FoundryItemPackRef[]>;
  getItemIndex(pack: FoundryItemPackRef, fields: string[]): Promise<unknown[]>;
  getItemDocument(uuid: string): Promise<unknown | null>;
}

export interface SpellSourcePackageVersion {
  packageId: string;
  version: string;
}

export interface SpellSourcePackInventory {
  collection: string;
  packageId: string;
  packageVersion: string;
  packId: string;
}

export interface SpellSourceIndexDiagnostic {
  code: 'PACK_DISABLED' | 'PACK_UNREADABLE' | 'PACK_NOT_ITEM' | 'PACK_INDEX_FAILED' | 'INVALID_SPELL_INDEX_ROW';
  pack: string;
  path: string;
  message: string;
  blocking: boolean;
}

export interface SpellSourceIndexResult {
  candidates: SpellCandidateMetadata[];
  sourcePackages: SpellSourcePackageVersion[];
  sourcePacks: SpellSourcePackInventory[];
  diagnostics: SpellSourceIndexDiagnostic[];
  candidateMetadataHash: string;
  sourceInventoryHash: string;
}

/**
 * Schema-derived inventory: inspect every eligible Item pack and trust only the
 * actual indexed row type. Pack hints, publishers, and package names are not
 * candidate gates.
 */
export async function buildSpellSourceIndex(adapter: FoundrySpellSourceAdapter): Promise<SpellSourceIndexResult> {
  const candidates: SpellCandidateMetadata[] = [];
  const sourcePacks: SpellSourcePackInventory[] = [];
  const diagnostics: SpellSourceIndexDiagnostic[] = [];
  const packageVersions = new Map<string, Set<string>>();
  const packs = [...await adapter.listEnabledReadableItemPacks()].sort(comparePacks);

  for (const pack of packs) {
    if (!pack.enabled) {
      diagnostics.push(diagnostic('PACK_DISABLED', pack, '/', 'Package is disabled and was not indexed.'));
      continue;
    }
    if (!pack.readable) {
      diagnostics.push(diagnostic('PACK_UNREADABLE', pack, '/', 'Item pack is not readable by the current user.'));
      continue;
    }
    if (pack.documentName !== 'Item') {
      diagnostics.push(diagnostic('PACK_NOT_ITEM', pack, '/', 'Compendium is not an Item pack.'));
      continue;
    }

    sourcePacks.push({
      collection: pack.collection,
      packageId: pack.packageId,
      packageVersion: pack.packageVersion,
      packId: pack.packId,
    });

    const versions = packageVersions.get(pack.packageId) ?? new Set<string>();
    versions.add(pack.packageVersion);
    packageVersions.set(pack.packageId, versions);

    let rows: unknown[];
    try {
      rows = await adapter.getItemIndex(pack, [...ITEM_INDEX_FIELDS]);
    } catch (error) {
      diagnostics.push(diagnostic(
        'PACK_INDEX_FAILED',
        pack,
        '/',
        `Item pack index failed: ${sanitizeError(error)}`,
      ));
      continue;
    }

    const orderedRows = [...rows].sort((left, right) => rowSortKey(left).localeCompare(rowSortKey(right), 'en'));
    for (let index = 0; index < orderedRows.length; index++) {
      const row = orderedRows[index];
      if (!isRecord(row) || row.type !== 'spell') continue;
      const projected = projectSpellCandidate(pack, row);
      if (!projected) {
        diagnostics.push(diagnostic(
          'INVALID_SPELL_INDEX_ROW',
          pack,
          `/${index}`,
          'Spell index row requires a 16-character alphanumeric _id and non-empty name.',
        ));
        continue;
      }
      candidates.push(projected);
    }
  }

  candidates.sort(compareCandidates);
  diagnostics.sort(compareDiagnostics);
  const sourcePackages = [...packageVersions.entries()]
    .flatMap(([packageId, versions]) => [...versions].map((version) => ({ packageId, version })))
    .sort((left, right) => compareText(left.packageId, right.packageId) || compareText(left.version, right.version));
  const candidateMetadataHash = hashSourceInventoryMetadata(candidates);
  const sourceInventoryHash = sha256(canonicalStringify({ sourcePackages, sourcePacks, candidates }));
  return { candidates, sourcePackages, sourcePacks, diagnostics, candidateMetadataHash, sourceInventoryHash };
}

export async function fetchSelectedSpellDocument(
  adapter: FoundrySpellSourceAdapter,
  selectedUuid: string,
): Promise<unknown | null> {
  if (!/^Compendium\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.Item\.[A-Za-z0-9]{16}$/.test(selectedUuid)) {
    throw new TypeError('A selected Compendium Item UUID is required before fetching a full spell document.');
  }
  return adapter.getItemDocument(selectedUuid);
}

function projectSpellCandidate(pack: FoundryItemPackRef, row: Record<string, unknown>): SpellCandidateMetadata | null {
  if (!isFoundryDocumentId(row._id) || !isNonEmptyString(row.name)) return null;
  const identifier = optionalString(readPath(row, 'system.identifier'));
  const rules = optionalString(readPath(row, 'system.source.rules'));
  const sourceBook = optionalString(readPath(row, 'system.source.book'));
  const level = optionalFiniteNumber(readPath(row, 'system.level'));
  const school = optionalString(readPath(row, 'system.school'));
  const candidate: SpellCandidateMetadata = {
    id: row._id,
    uuid: `Compendium.${pack.collection}.Item.${row._id}`,
    packageId: pack.packageId,
    packId: pack.packId,
    name: row.name,
  };
  if (identifier !== undefined) candidate.identifier = identifier;
  if (rules !== undefined) candidate.rules = rules;
  if (sourceBook !== undefined) candidate.sourceBook = sourceBook;
  if (level !== undefined) candidate.level = level;
  if (school !== undefined) candidate.school = school;
  return candidate;
}

function readPath(row: Record<string, unknown>, path: string): unknown {
  if (path in row) return row[path];
  let value: unknown = row;
  for (const segment of path.split('.')) {
    if (!isRecord(value)) return undefined;
    value = value[segment];
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value : undefined;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function comparePacks(left: FoundryItemPackRef, right: FoundryItemPackRef): number {
  return compareText(left.collection, right.collection)
    || compareText(left.packageId, right.packageId)
    || compareText(left.packageVersion, right.packageVersion);
}

function compareCandidates(left: SpellCandidateMetadata, right: SpellCandidateMetadata): number {
  return compareText(left.packageId, right.packageId)
    || compareText(left.packId, right.packId)
    || compareText(left.name, right.name)
    || compareText(left.rules ?? '', right.rules ?? '')
    || compareText(left.id, right.id);
}

function compareDiagnostics(left: SpellSourceIndexDiagnostic, right: SpellSourceIndexDiagnostic): number {
  return compareText(left.pack, right.pack) || compareText(left.path, right.path) || compareText(left.code, right.code);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'en');
}

function rowSortKey(value: unknown): string {
  if (!isRecord(value)) return canonicalStringify(value);
  return `${typeof value._id === 'string' ? value._id : ''}\0${typeof value.name === 'string' ? value.name : ''}\0${canonicalStringify(value)}`;
}

function diagnostic(
  code: SpellSourceIndexDiagnostic['code'],
  pack: FoundryItemPackRef,
  path: string,
  message: string,
): SpellSourceIndexDiagnostic {
  return {
    code,
    pack: pack.collection,
    path,
    message,
    blocking: code === 'PACK_INDEX_FAILED' || code === 'INVALID_SPELL_INDEX_ROW',
  };
}

function sanitizeError(error: unknown): string {
  return error instanceof Error ? error.message.replace(/[\r\n]+/g, ' ').slice(0, 200) : 'unknown error';
}

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFoundryDocumentId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{16}$/.test(value);
}
