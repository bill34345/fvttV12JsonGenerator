import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { FoundryLabConfig } from './config';
import type { ActiveModuleEntry, ModuleInventoryEntry } from './types';

export interface LocalModule { id: string; version: string; requires: string[]; unresolvedReason?: string }
export interface UserDecisions {
  acceptedVersionOverrides: Array<{ id: string; productionVersion: string; localVersion: string; reason: string }>;
  optionalDisabledModules: Array<{ id: string; reason: string }>;
}
export interface ParityReport {
  expected: number; exact: string[]; missing: string[]; extra: string[];
  versionMismatch: Array<{ id: string; expected: string; actual: string }>;
  missingDependencies: Array<{ id: string; dependency: string }>;
  unresolved: Array<{ id: string; reason: string }>;
  approvedVersionMismatch: Array<{ id: string; expected: string; actual: string }>;
  unapprovedVersionMismatch: Array<{ id: string; expected: string; actual: string }>;
  optionalDisabled: string[]; pass: boolean; effectivePass: boolean;
}

const emptyDecisions = (): UserDecisions => ({ acceptedVersionOverrides: [], optionalDisabledModules: [] });

export function compareModuleParity(active: ActiveModuleEntry[], local: LocalModule[], decisions = emptyDecisions()): ParityReport {
  const expected = new Map(active.map((entry) => [entry.id, entry]));
  const actual = new Map(local.map((entry) => [entry.id, entry]));
  const exact: string[] = [], missing: string[] = [], extra: string[] = [];
  const versionMismatch: ParityReport['versionMismatch'] = [];
  for (const entry of active) {
    const found = actual.get(entry.id);
    if (!found) missing.push(entry.id);
    else if (found.version === entry.version) exact.push(entry.id);
    else versionMismatch.push({ id: entry.id, expected: entry.version, actual: found.version });
  }
  for (const entry of local) if (!expected.has(entry.id)) extra.push(entry.id);
  const missingDependencies = local.filter((entry) => expected.has(entry.id)).flatMap((entry) => entry.requires
    .filter((dependency) => !actual.has(dependency))
    .map((dependency) => ({ id: entry.id, dependency })));
  const unresolved = local.filter((entry) => entry.unresolvedReason).map((entry) => ({ id: entry.id, reason: entry.unresolvedReason! }));
  const approvedVersionMismatch = versionMismatch.filter((gap) => decisions.acceptedVersionOverrides.some((item) =>
    item.id === gap.id && item.productionVersion === gap.expected && item.localVersion === gap.actual));
  const approvedIds = new Set(approvedVersionMismatch.map((entry) => entry.id));
  const unapprovedVersionMismatch = versionMismatch.filter((entry) => !approvedIds.has(entry.id));
  const optionalDisabled = decisions.optionalDisabledModules.map((entry) => entry.id).filter((id) => actual.has(id));
  const pass = missing.length === 0 && versionMismatch.length === 0 && missingDependencies.length === 0 && unresolved.length === 0;
  return { expected: active.length, exact, missing, extra, versionMismatch, missingDependencies, unresolved,
    approvedVersionMismatch, unapprovedVersionMismatch, optionalDisabled, pass,
    effectivePass: missing.length === 0 && unapprovedVersionMismatch.length === 0 && missingDependencies.length === 0 && unresolved.length === 0 };
}

function validateDecisions(value: unknown): UserDecisions {
  if (!value || typeof value !== 'object') throw new Error('user-decisions.json must be an object');
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.acceptedVersionOverrides) || !Array.isArray(data.optionalDisabledModules)) throw new Error('user-decisions.json arrays are required');
  const stringFields = (entry: unknown, fields: string[]) => {
    if (!entry || typeof entry !== 'object') return false;
    const record = entry as Record<string, unknown>;
    return fields.every((field) => typeof record[field] === 'string' && (record[field] as string).length > 0);
  };
  if (!data.acceptedVersionOverrides.every((entry) => stringFields(entry, ['id', 'productionVersion', 'localVersion', 'reason']))) throw new Error('Invalid acceptedVersionOverrides entry');
  if (!data.optionalDisabledModules.every((entry) => stringFields(entry, ['id', 'reason']))) throw new Error('Invalid optionalDisabledModules entry');
  return data as unknown as UserDecisions;
}

export async function generateRealParity(config: FoundryLabConfig): Promise<ParityReport> {
  const activeDocument = JSON.parse(await readFile(join(config.inventoryRoot, 'production-active.json'), 'utf8')) as { modules?: ActiveModuleEntry[] } | ActiveModuleEntry[];
  const active = Array.isArray(activeDocument) ? activeDocument : activeDocument.modules;
  if (!Array.isArray(active)) throw new Error('production-active.json must contain a modules array');
  const disk = JSON.parse(await readFile(join(config.inventoryRoot, 'production-disk.json'), 'utf8')) as ModuleInventoryEntry[];
  const dependencies = new Map(disk.filter((entry) => entry.id).map((entry) => [entry.id!, entry.requires]));
  const modulesRoot = join(config.profiles.serverMirror.dataPath, 'Data/modules');
  const local: LocalModule[] = [];
  for (const folder of await readdir(modulesRoot, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    try {
      const manifest = JSON.parse(await readFile(join(modulesRoot, folder.name, 'module.json'), 'utf8')) as { id?: unknown; version?: unknown };
      if (typeof manifest.id === 'string' && manifest.version !== undefined) local.push({ id: manifest.id, version: String(manifest.version), requires: dependencies.get(manifest.id) ?? [] });
    } catch { /* malformed extras are not active package candidates */ }
  }
  const decisions = validateDecisions(JSON.parse(await readFile(join(config.inventoryRoot, 'user-decisions.json'), 'utf8')));
  return compareModuleParity(active, local, decisions);
}

export async function writeParityAcceptance(config: FoundryLabConfig, report: ParityReport): Promise<string> {
  const path = resolve(config.repoRoot, 'docs/acceptance/foundry-v14-module-parity.md');
  const list = (items: unknown[]) => items.length ? `\`${items.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join('`, `')}\`` : 'none';
  const text = `# Foundry v14 module parity\n\nGenerated from sanitized package IDs and manifest versions.\n\n- Production active modules: ${report.expected}\n- Raw production-exact pass: **${report.pass}**\n- Effective pass after explicit user decisions: **${report.effectivePass}**\n- Exact versions: ${report.exact.length}\n- Raw version mismatches: ${list(report.versionMismatch)}\n- Approved version mismatches: ${list(report.approvedVersionMismatch)}\n- Unapproved version mismatches: ${list(report.unapprovedVersionMismatch)}\n- Missing: ${list(report.missing)}\n- Missing dependencies: ${list(report.missingDependencies)}\n- Unresolved: ${list(report.unresolved)}\n- Extra installed packages (non-blocking): ${list(report.extra)}\n- Installed but intentionally disabled in activation policy: ${list(report.optionalDisabled)}\n\nAn effective pass proves manifest/dependency inventory parity under recorded decisions; it does not prove world activation or runtime module compatibility.\n`;
  await writeFile(path, text, 'utf8');
  return path;
}
