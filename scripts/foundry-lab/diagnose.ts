import type { ActiveModuleEntry, ModuleInventoryEntry } from './types';
import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { assertInsideLabRoot, type FoundryLabConfig } from './config';

export type ModuleHealthStatus = 'ok' | 'warning' | 'performance-suspect' | 'incompatible' | 'untested';

export interface ModuleHealthEntry {
  id: string;
  title: string;
  version: string;
  status: ModuleHealthStatus;
  findings: string[];
  recommendation: string;
}

export interface DiagnosticReport {
  generatedAt: string;
  environment: { foundry: string; dnd5e: string };
  modules: ModuleHealthEntry[];
  mechanicalEvidence: string[];
  semanticEvidence: string[];
}

export interface PerformanceSample {
  minute: number;
  browserHeapMb: number;
  serverRssMb: number;
  operationMs: number;
  longTasks: number;
  errors: number;
}

export type CumulativePhase = 'baseline' | 'scene-ready' | 'combat-before' | 'combat-after' | 'heavy-scene' | 'natural-recovery' | 'post-gc' | 'checkpoint' | 'gap';
export interface CumulativePerformanceSample {
  timestamp: string;
  elapsedMinute: number;
  cycle: number;
  phase: CumulativePhase;
  sceneId: string | null;
  combatId: string | null;
  moduleConfigSha256: string;
  browser: {
    heapUsedMb: number | null; heapTotalMb: number | null; nodes: number | null; listeners: number | null;
    documents: number | null; frames: number | null; webglContexts: number | null; longTasks: number | null;
    fps: number | null; frameTimeMs: number | null; consoleErrors: number | null; networkFailures: number | null;
    openDialogs?: number | null;
  };
  server: {
    rssMb: number | null; privateMb: number | null; heapMb: number | null; cpuPercent: number | null;
    eventLoopDelayMs: number | null; webSockets: number | null; logBytes: number | null; newErrors: number | null;
  };
  operation: { name: string; durationMs: number | null };
  gaps: string[];
}

export type CumulativeVerdict = 'not-reproduced' | 'reproduced-scene' | 'reproduced-combat' | 'reproduced-server' | 'insufficient-evidence';
export interface CumulativeAnalysis {
  verdict: CumulativeVerdict;
  sustainedGrowth: boolean;
  firstAnomalousCycle: number | null;
  rootCauseProven: false;
  reasons: string[];
}

export interface RuntimeEvidence {
  semanticEvidence: string[];
  mechanicalEvidence?: string[];
  moduleFindings: Array<{ id: string; status: ModuleHealthStatus; evidence: string; recommendation: string }>;
}

const major = (value: string | number | undefined): number | null => {
  if (value === undefined) return null;
  const parsed = Number.parseInt(String(value).split('.')[0] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export function diagnoseInventory(
  active: ActiveModuleEntry[],
  disk: ModuleInventoryEntry[],
  environment: { foundry: string; dnd5e: string },
): DiagnosticReport {
  const diskById = new Map(disk.filter((entry) => entry.id !== null).map((entry) => [entry.id!, entry]));
  const activeIds = new Set(active.map((entry) => entry.id));
  const foundryMajor = major(environment.foundry)!;
  const modules = active.map((entry): ModuleHealthEntry => {
    const manifest = diskById.get(entry.id);
    const findings: string[] = [];
    if (!manifest) return { ...entry, status: 'incompatible', findings: ['active module is missing from disk inventory'], recommendation: 'restore or disable the module before runtime testing' };
    if (manifest.parseError) findings.push(`manifest parse error: ${manifest.parseError}`);
    if (manifest.folder !== entry.id) findings.push(`folder/id mismatch: ${manifest.folder}`);
    if (manifest.version !== entry.version) findings.push(`active/disk version mismatch: ${entry.version} vs ${manifest.version ?? '<missing>'}`);
    const minimum = major(manifest.compatibility.minimum);
    const maximum = major(manifest.compatibility.maximum);
    if (minimum !== null && minimum > foundryMajor) findings.push(`requires Foundry ${minimum} or newer`);
    if (maximum !== null && maximum < foundryMajor) findings.push(`declares maximum Foundry ${maximum}`);
    for (const dependency of manifest.requires) if (!activeIds.has(dependency)) findings.push(`missing required dependency: ${dependency}`);
    for (const conflict of manifest.conflicts) if (activeIds.has(conflict)) findings.push(`declared conflict active: ${conflict}`);
    const incompatible = findings.some((finding) => /missing from disk|parse error|requires Foundry|maximum Foundry/.test(finding));
    if (!findings.length) findings.push('manifest metadata is compatible; runtime behavior not yet accepted');
    return {
      ...entry,
      status: incompatible ? 'incompatible' : findings.length > 1 || !findings[0]?.startsWith('manifest metadata') ? 'warning' : 'untested',
      findings,
      recommendation: incompatible ? 'disable or repair before compatibility acceptance' : 'requires runtime and semantic acceptance',
    };
  });
  return {
    generatedAt: new Date().toISOString(), environment, modules,
    mechanicalEvidence: [`${disk.length} disk manifests inspected`, `${active.length} active module records compared`],
    semanticEvidence: ['Runtime behavior and Chinese localization require live review'],
  };
}

export function classifyPerformance(samples: PerformanceSample[]) {
  if (samples.length < 2) return { status: 'untested' as const, rootCauseProven: false, reasons: ['at least two samples are required'] };
  const first = samples[0]!;
  const last = samples.at(-1)!;
  const reasons: string[] = [];
  if (last.browserHeapMb - first.browserHeapMb > 500) reasons.push('browser heap net growth exceeds 500 MB');
  if (last.browserHeapMb > first.browserHeapMb * 1.25 || last.serverRssMb > first.serverRssMb * 1.25) reasons.push('memory growth exceeds 25% of baseline');
  if (last.operationMs > first.operationMs * 1.2) reasons.push('operation latency degraded by more than 20%');
  if (last.longTasks > Math.max(first.longTasks * 2, first.longTasks + 1)) reasons.push('long tasks more than doubled');
  if (last.errors > first.errors) reasons.push('runtime errors accumulated');
  return { status: reasons.length ? 'performance-suspect' as const : 'ok' as const, rootCauseProven: false, reasons };
}

const finite = (value: number | null): value is number => typeof value === 'number' && Number.isFinite(value);

export async function appendCumulativeSample(config: FoundryLabConfig, path: string, sample: CumulativePerformanceSample): Promise<void> {
  const output = resolve(path);
  assertInsideLabRoot(config, output);
  if (!Number.isFinite(sample.elapsedMinute) || sample.elapsedMinute < 0 || !Number.isInteger(sample.cycle) || sample.cycle < 0) throw new Error('Invalid cumulative sample identity');
  if (!/^[a-f0-9]{64}$/i.test(sample.moduleConfigSha256)) throw new Error('Invalid module configuration SHA-256');
  if (!Array.isArray(sample.gaps) || sample.gaps.some((gap) => !gap.trim())) throw new Error('Invalid cumulative sample gaps');
  await mkdir(resolve(output, '..'), { recursive: true });
  await appendFile(output, `${JSON.stringify(sample)}\n`, 'utf8');
}

export async function readCumulativeSamples(config: FoundryLabConfig, path: string): Promise<CumulativePerformanceSample[]> {
  const input = resolve(path);
  assertInsideLabRoot(config, input);
  const lines = (await readFile(input, 'utf8')).split(/\r?\n/).filter(Boolean);
  return lines.map((line, index) => {
    try { return JSON.parse(line) as CumulativePerformanceSample; }
    catch { throw new Error(`Invalid cumulative JSONL at line ${index + 1}`); }
  });
}

function strictlyRising(values: number[]): boolean {
  return values.length >= 4 && values.every((value, index) => index === 0 || value > values[index - 1]!);
}

export function analyzeCumulativePerformance(samples: CumulativePerformanceSample[], options: { requireCompleteRun?: boolean; requiredCheckpoints?: number[]; requiredCycles?: number } = {}): CumulativeAnalysis {
  if (!samples.length) return { verdict: 'insufficient-evidence', sustainedGrowth: false, firstAnomalousCycle: null, rootCauseProven: false, reasons: ['no cumulative samples'] };
  const hashes = new Set(samples.map((sample) => sample.moduleConfigSha256));
  const gaps = samples.flatMap((sample) => sample.gaps);
  const unresolvedDialogs = samples.filter((sample) => finite(sample.browser.openDialogs ?? null) && sample.browser.openDialogs! > 0);
  if (hashes.size !== 1 || gaps.length || unresolvedDialogs.length) {
    const reasons = [
      ...(hashes.size !== 1 ? ['module configuration hash changed during the run'] : []),
      ...(unresolvedDialogs.length ? [`unresolved dialogs contaminated ${unresolvedDialogs.length} samples`] : []),
      ...gaps,
    ];
    return { verdict: 'insufficient-evidence', sustainedGrowth: false, firstAnomalousCycle: null, rootCauseProven: false, reasons };
  }
  if (options.requireCompleteRun) {
    const checkpoints = options.requiredCheckpoints ?? [0, 15, 30, 50];
    const requiredCycles = options.requiredCycles ?? 5;
    const actual = new Set(samples.map((sample) => sample.elapsedMinute));
    const missing = checkpoints.filter((minute) => !actual.has(minute));
    const cycles = new Set(samples.filter((sample) => sample.phase === 'post-gc').map((sample) => sample.cycle));
    const reasons = [
      ...(missing.length ? [`missing required checkpoints: ${missing.join(', ')}`] : []),
      ...(cycles.size < requiredCycles ? [`${requiredCycles} cycles required; found ${cycles.size}`] : []),
    ];
    if (reasons.length) return { verdict: 'insufficient-evidence', sustainedGrowth: false, firstAnomalousCycle: null, rootCauseProven: false, reasons };
  }
  const floors = samples.filter((sample) => sample.phase === 'post-gc' && finite(sample.browser.heapUsedMb)).sort((a, b) => a.cycle - b.cycle);
  if (floors.length < 4) return { verdict: 'insufficient-evidence', sustainedGrowth: false, firstAnomalousCycle: null, rootCauseProven: false, reasons: ['fewer than four post-GC cycle floors'] };
  const heaps = floors.map((sample) => sample.browser.heapUsedMb!).filter(finite);
  const sustainedGrowth = strictlyRising(heaps.slice(-Math.max(4, heaps.length)));
  const growth = heaps.at(-1)! - heaps[0]!;
  const threshold = heaps.at(-1)! > heaps[0]! * 1.25 || growth > 500;
  if (!sustainedGrowth || !threshold) return { verdict: 'not-reproduced', sustainedGrowth, firstAnomalousCycle: null, rootCauseProven: false, reasons: ['post-GC cycle floors did not meet sustained growth thresholds'] };
  const firstAnomalousCycle = floors[1]?.cycle ?? floors[0]!.cycle;
  const combatSamples = samples.filter((sample) => sample.phase === 'combat-after');
  const sceneSamples = samples.filter((sample) => sample.phase === 'scene-ready' || sample.phase === 'heavy-scene');
  const serverFloors = floors.map((sample) => sample.server.rssMb).filter(finite);
  const browserGrowth = growth > 0;
  const serverGrowth = serverFloors.length >= 4 && strictlyRising(serverFloors) && serverFloors.at(-1)! > serverFloors[0]! * 1.25;
  const verdict: CumulativeVerdict = !browserGrowth && serverGrowth ? 'reproduced-server' : combatSamples.length && !sceneSamples.length ? 'reproduced-combat' : 'reproduced-scene';
  return { verdict, sustainedGrowth: true, firstAnomalousCycle, rootCauseProven: false, reasons: [`post-GC heap grew ${growth.toFixed(1)} MB across ${floors.length} cycles`] };
}

const cumulativeLabels: Record<CumulativeVerdict, string> = {
  'not-reproduced': 'Cumulative degradation not reproduced',
  'reproduced-scene': 'Reproduced, primarily during scene operations',
  'reproduced-combat': 'Reproduced, primarily during combat or Activity operations',
  'reproduced-server': 'Reproduced, primarily on the Foundry server',
  'insufficient-evidence': 'Evidence insufficient',
};

export function renderCumulativeReport(analysis: CumulativeAnalysis, samples: CumulativePerformanceSample[]): string {
  const floors = samples.filter((sample) => sample.phase === 'post-gc');
  return `# Foundry v14 operation accumulation report\n\n## Verdict\n\n${cumulativeLabels[analysis.verdict]}\n\n## Mechanical evidence\n\n- Samples: ${samples.length}\n- Post-GC cycle floors: ${floors.length}\n- First anomalous cycle: ${analysis.firstAnomalousCycle ?? 'none'}\n- Root cause proven: no\n\n## Reasons\n\n${analysis.reasons.map((reason) => `- ${reason}`).join('\n')}\n`;
}

function renderCumulativeSvg(samples: CumulativePerformanceSample[]): string {
  const floors = samples.filter((sample) => sample.phase === 'post-gc' && finite(sample.browser.heapUsedMb) && finite(sample.server.rssMb)).sort((a, b) => a.cycle - b.cycle);
  const values = floors.flatMap((sample) => [sample.browser.heapUsedMb!, sample.server.rssMb!]);
  const max = Math.max(1, ...values), width = 900, height = 360, left = 55, top = 25, plotWidth = 810, plotHeight = 285;
  const points = (selector: (sample: CumulativePerformanceSample) => number) => floors.map((sample, index) => {
    const x = left + (floors.length < 2 ? 0 : index * plotWidth / (floors.length - 1));
    const y = top + plotHeight - selector(sample) / max * plotHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`+
    `<rect width="100%" height="100%" fill="#fff"/><line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" stroke="#555"/>`+
    `<line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" stroke="#555"/>`+
    `<polyline fill="none" stroke="#c0392b" stroke-width="3" points="${points((sample) => sample.browser.heapUsedMb!)}"/>`+
    `<polyline fill="none" stroke="#2980b9" stroke-width="3" points="${points((sample) => sample.server.rssMb!)}"/>`+
    `<text x="${left}" y="345" font-family="sans-serif" font-size="14">Cycle 1-${floors.length}</text>`+
    `<text x="160" y="20" fill="#c0392b" font-family="sans-serif" font-size="14">Browser post-GC heap MB</text>`+
    `<text x="420" y="20" fill="#2980b9" font-family="sans-serif" font-size="14">Server RSS MB</text></svg>\n`;
}

export async function runCumulativeReport(config: FoundryLabConfig, inputPath: string) {
  const samples = await readCumulativeSamples(config, inputPath);
  const analysis = analyzeCumulativePerformance(samples, { requireCompleteRun: true, requiredCheckpoints: [0, 15, 30, 50], requiredCycles: 5 });
  const reportPath = resolve(config.repoRoot, 'docs/acceptance/foundry-v14-operation-accumulation.md');
  const chartPath = join(config.evidenceRoot, 'diagnostics', 'operation-accumulation.svg');
  assertInsideLabRoot(config, chartPath);
  await mkdir(resolve(reportPath, '..'), { recursive: true });
  await mkdir(resolve(chartPath, '..'), { recursive: true });
  await writeFile(reportPath, renderCumulativeReport(analysis, samples), 'utf8');
  await writeFile(chartPath, renderCumulativeSvg(samples), 'utf8');
  return { ok: analysis.verdict !== 'insufficient-evidence', reportPath, chartPath, analysis, samples };
}

const labels: Record<ModuleHealthStatus, string> = {
  ok: 'OK', warning: 'Warning', 'performance-suspect': 'Performance suspect', incompatible: 'Incompatible', untested: 'Untested',
};

export function renderDiagnosticReport(report: DiagnosticReport): string {
  const rows = report.modules.map((entry) => `| ${entry.id} | ${entry.version} | ${labels[entry.status]} | ${entry.findings.join('; ')} | ${entry.recommendation} |`).join('\n');
  return `# Foundry v14 module health report\n\nGenerated: ${report.generatedAt}\n\nFoundry ${report.environment.foundry}; dnd5e ${report.environment.dnd5e}.\n\n## Mechanical evidence\n\n${report.mechanicalEvidence.map((item) => `- ${item}`).join('\n')}\n\n## Semantic acceptance\n\n${report.semanticEvidence.map((item) => `- ${item}`).join('\n')}\n\n## Module matrix\n\n| Module | Version | Status | Evidence | Recommendation |\n| --- | --- | --- | --- | --- |\n${rows}\n`;
}

export function mergeRuntimeEvidence(report: DiagnosticReport, evidence: RuntimeEvidence): DiagnosticReport {
  const byId = new Map(report.modules.map((entry) => [entry.id, entry]));
  for (const finding of evidence.moduleFindings) {
    const module = byId.get(finding.id);
    if (!module) throw new Error(`Runtime evidence references unknown module: ${finding.id}`);
    if (!finding.evidence.trim() || !finding.recommendation.trim()) throw new Error(`Runtime evidence is incomplete for module: ${finding.id}`);
    module.status = finding.status;
    module.findings.push(finding.evidence);
    module.recommendation = finding.recommendation;
  }
  return {
    ...report,
    mechanicalEvidence: [...report.mechanicalEvidence, ...(evidence.mechanicalEvidence ?? [])],
    semanticEvidence: evidence.semanticEvidence.length ? evidence.semanticEvidence : report.semanticEvidence,
  };
}

async function writeAtomic(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.tmp`;
  await rm(temporary, { force: true });
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

export async function runInventoryDiagnosis(config: FoundryLabConfig) {
  const activeDocument = JSON.parse(await readFile(join(config.inventoryRoot, 'production-active.json'), 'utf8')) as { modules?: ActiveModuleEntry[] } | ActiveModuleEntry[];
  const active = Array.isArray(activeDocument) ? activeDocument : activeDocument.modules;
  const disk = JSON.parse(await readFile(join(config.inventoryRoot, 'production-disk.json'), 'utf8')) as ModuleInventoryEntry[];
  if (!Array.isArray(active) || !Array.isArray(disk)) throw new Error('Diagnostic inventories have an invalid shape');
  const report = diagnoseInventory(active, disk, config.versions);
  const directory = join(config.evidenceRoot, 'diagnostics');
  const output = join(directory, 'inventory.json');
  for (const path of [directory, output, `${output}.tmp`]) assertInsideLabRoot(config, path);
  await mkdir(directory, { recursive: true });
  await writeAtomic(output, report);
  return { ok: true, count: report.modules.length, output, report };
}

export async function runPerformanceBaseline(config: FoundryLabConfig, profile: string, inputPath: string) {
  const input = resolve(inputPath);
  assertInsideLabRoot(config, input);
  const samples = JSON.parse(await readFile(input, 'utf8')) as PerformanceSample[];
  if (!Array.isArray(samples)) throw new Error('Performance samples must be an array');
  const required = [0, 15, 30, 60, 90, 120];
  const actual = new Set(samples.map((sample) => sample.minute));
  if (required.some((minute) => !actual.has(minute))) throw new Error(`Performance samples are missing required soak checkpoints: ${required.filter((minute) => !actual.has(minute)).join(', ')}`);
  for (const sample of samples) {
    for (const field of ['minute', 'browserHeapMb', 'serverRssMb', 'operationMs', 'longTasks', 'errors'] as const) {
      if (!Number.isFinite(sample[field]) || sample[field] < 0) throw new Error(`Invalid performance sample field: ${field}`);
    }
  }
  const classification = classifyPerformance(samples);
  const output = join(config.evidenceRoot, 'diagnostics', `baseline-${profile}.json`);
  assertInsideLabRoot(config, output);
  await writeAtomic(output, { profile, samples, classification });
  return { ok: true, profile, output, classification };
}

export async function runDiagnosticReport(config: FoundryLabConfig, evidencePath: string) {
  const inventoryPath = join(config.evidenceRoot, 'diagnostics', 'inventory.json');
  const evidenceFile = resolve(evidencePath);
  assertInsideLabRoot(config, inventoryPath);
  assertInsideLabRoot(config, evidenceFile);
  const report = JSON.parse(await readFile(inventoryPath, 'utf8')) as DiagnosticReport;
  const evidence = JSON.parse(await readFile(evidenceFile, 'utf8')) as RuntimeEvidence;
  if (!Array.isArray(evidence.semanticEvidence) || !Array.isArray(evidence.moduleFindings)) throw new Error('Runtime evidence has an invalid shape');
  const merged = mergeRuntimeEvidence(report, evidence);
  const output = resolve(config.repoRoot, 'docs/acceptance/foundry-v14-module-health.md');
  const directory = resolve(config.repoRoot, 'docs/acceptance');
  await mkdir(directory, { recursive: true });
  await writeFile(output, renderDiagnosticReport(merged), 'utf8');
  return { ok: true, output, report: merged };
}
