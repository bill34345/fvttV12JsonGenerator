import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertInsideLabRoot, type FoundryLabConfig } from '../config';
import { validateRemoteInventory } from './remoteInventory';
import type {
  ActiveModuleEntry,
  ClassifiedPackage,
  ModuleInventoryEntry,
  PackageClass,
} from '../types';

function isUsableHttpsUrl(value: string | null): boolean {
  if (value === null || value.length === 0 || value.trim() !== value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function manualReviewReason(
  active: ActiveModuleEntry,
  disk: ModuleInventoryEntry | null,
): string {
  if (disk === null) return `active module "${active.id}" is missing from disk inventory`;
  if (disk.parseError !== null) {
    return `installed manifest for "${active.id}" could not be parsed: ${disk.parseError}`;
  }
  return `active version "${active.version}" differs from installed manifest version "${disk.version ?? '<missing>'}"`;
}

export function classifyActivePackages(
  diskEntries: ModuleInventoryEntry[],
  activeEntries: ActiveModuleEntry[],
): ClassifiedPackage[] {
  const byId = new Map(
    diskEntries.filter((entry) => entry.id !== null).map((entry) => [entry.id!, entry]),
  );

  return activeEntries.map((active) => {
    const disk = byId.get(active.id) ?? null;
    const reasons: string[] = [];
    let packageClass: PackageClass;

    if (disk === null || disk.parseError !== null || disk.version !== active.version) {
      packageClass = 'manual-review';
      reasons.push(manualReviewReason(active, disk));
    } else if (disk.protected) {
      packageClass = 'account-protected';
      reasons.push('installed manifest marks package as protected; use an authorized package account or installer');
    } else if (isUsableHttpsUrl(disk.download)) {
      packageClass = 'upstream-exact';
      reasons.push(`exact installed manifest version "${disk.version}" exposes HTTPS download "${disk.download}"`);
    } else {
      packageClass = 'server-only';
      if (disk.download === null || disk.download.length === 0) {
        reasons.push(
          `exact installed manifest version "${disk.version}" exposes no download URL; transfer server folder "${disk.folder}"`,
        );
      } else {
        reasons.push(
          `exact installed manifest download "${disk.download}" is not a usable HTTPS URL; transfer server folder "${disk.folder}"`,
        );
      }
    }

    return { active, disk, packageClass, reasons };
  }).sort((left, right) => left.active.id.localeCompare(right.active.id));
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requiredNonEmptyString(
  entry: Record<string, unknown>,
  field: keyof ActiveModuleEntry,
  index: number,
): string {
  const value = entry[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Active module entry ${index} has invalid ${field}`);
  }
  return value;
}

function validateActiveSnapshot(parsed: unknown): ActiveModuleEntry[] {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Production active snapshot must be an object');
  }
  const modules = (parsed as Record<string, unknown>).modules;
  if (!Array.isArray(modules)) throw new Error('Production active snapshot modules must be an array');

  const ids = new Set<string>();
  return modules.map((value, index) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`Active module entry ${index} is not an object`);
    }
    const entry = value as Record<string, unknown>;
    const normalized = {
      id: requiredNonEmptyString(entry, 'id', index),
      title: requiredNonEmptyString(entry, 'title', index),
      version: requiredNonEmptyString(entry, 'version', index),
    };
    if (ids.has(normalized.id)) {
      throw new Error(`Active module entry ${index} has duplicate id: ${normalized.id}`);
    }
    ids.add(normalized.id);
    return normalized;
  });
}

export async function writePackagePlan(config: FoundryLabConfig): Promise<ClassifiedPackage[]> {
  const diskPath = join(config.inventoryRoot, 'production-disk.json');
  const activePath = join(config.inventoryRoot, 'production-active.json');
  const outputPath = join(config.inventoryRoot, 'package-plan.json');
  const stagingPath = `${outputPath}.tmp`;
  for (const path of [config.inventoryRoot, diskPath, activePath, outputPath, stagingPath]) {
    assertInsideLabRoot(config, path);
  }

  const [diskText, activeText] = await Promise.all([
    readFile(diskPath, 'utf8'),
    readFile(activePath, 'utf8'),
  ]);
  const disk = validateRemoteInventory(parseJson(diskText, 'production-disk.json'));
  const active = validateActiveSnapshot(parseJson(activeText, 'production-active.json'));
  const plan = classifyActivePackages(disk, active);

  await mkdir(config.inventoryRoot, { recursive: true });
  await rm(stagingPath, { force: true });
  try {
    await writeFile(stagingPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
    await rename(stagingPath, outputPath);
  } finally {
    await rm(stagingPath, { force: true });
  }
  return plan;
}
