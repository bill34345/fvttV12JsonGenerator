import { describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeCumulativePerformance, appendCumulativeSample, classifyPerformance, diagnoseInventory, mergeRuntimeEvidence, readCumulativeSamples, renderCumulativeReport, renderDiagnosticReport, runCumulativeReport, runDiagnosticReport, runInventoryDiagnosis, runPerformanceBaseline } from '../diagnose';
import { createHermeticLabConfig as createLabConfig } from '../../config';
import type { ModuleInventoryEntry } from '../../types';

const disk = (overrides: Partial<ModuleInventoryEntry> = {}): ModuleInventoryEntry => ({
  folder: 'healthy', id: 'healthy', title: 'Healthy', version: '1.0.0',
  compatibility: { minimum: 13, verified: 14 }, manifest: null, download: null,
  requires: [], conflicts: [], protected: false, persistentStorage: false,
  manifestSha256: 'a'.repeat(64), parseError: null, ...overrides,
});

describe('Foundry module diagnostics', () => {
  it('classifies missing, incompatible, dependency, conflict, and metadata-only modules without claiming runtime acceptance', () => {
    const active = [
      { id: 'healthy', title: 'Healthy', version: '1.0.0' },
      { id: 'old', title: 'Old', version: '1.0.0' },
      { id: 'missing-dep', title: 'Missing dep', version: '1.0.0' },
      { id: 'conflict-a', title: 'Conflict A', version: '1.0.0' },
      { id: 'missing', title: 'Missing', version: '1.0.0' },
    ];
    const inventory = [
      disk(),
      disk({ folder: 'old', id: 'old', title: 'Old', compatibility: { maximum: 13 } }),
      disk({ folder: 'missing-dep', id: 'missing-dep', title: 'Missing dep', requires: ['absent'] }),
      disk({ folder: 'conflict-a', id: 'conflict-a', title: 'Conflict A', conflicts: ['healthy'] }),
    ];
    const result = diagnoseInventory(active, inventory, { foundry: '14.364', dnd5e: '5.3.3' });
    expect(result.modules.find((entry) => entry.id === 'healthy')?.status).toBe('untested');
    expect(result.modules.find((entry) => entry.id === 'old')?.status).toBe('incompatible');
    expect(result.modules.find((entry) => entry.id === 'missing-dep')?.findings).toContain('missing required dependency: absent');
    expect(result.modules.find((entry) => entry.id === 'conflict-a')?.findings).toContain('declared conflict active: healthy');
    expect(result.modules.find((entry) => entry.id === 'missing')?.status).toBe('incompatible');
  });

  it('marks threshold breaches as performance suspects without claiming a root cause', () => {
    const result = classifyPerformance([
      { minute: 0, browserHeapMb: 600, serverRssMb: 900, operationMs: 100, longTasks: 2, errors: 0 },
      { minute: 120, browserHeapMb: 1150, serverRssMb: 1200, operationMs: 130, longTasks: 5, errors: 3 },
    ]);
    expect(result.status).toBe('performance-suspect');
    expect(result.rootCauseProven).toBe(false);
    expect(result.reasons).toContain('browser heap net growth exceeds 500 MB');
    expect(result.reasons).toContain('operation latency degraded by more than 20%');
  });

  it('renders separate mechanical and semantic acceptance sections', () => {
    const text = renderDiagnosticReport({
      generatedAt: '2026-07-11T00:00:00.000Z',
      environment: { foundry: '14.364', dnd5e: '5.3.3' },
      modules: [{ id: 'healthy', title: 'Healthy', version: '1.0.0', status: 'untested', findings: ['manifest metadata is compatible; runtime behavior not yet accepted'], recommendation: 'requires runtime and semantic acceptance' }],
      mechanicalEvidence: ['manifest parsed'], semanticEvidence: ['Chinese Actor sheet not yet reviewed'],
    });
    expect(text).toContain('## Mechanical evidence');
    expect(text).toContain('## Semantic acceptance');
    expect(text).toContain('| healthy | 1.0.0 | Untested |');
  });

  it('writes inventory diagnostics atomically inside the ignored evidence root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'foundry-diagnose-'));
    const config = createLabConfig(root);
    await mkdir(config.inventoryRoot, { recursive: true });
    await writeFile(join(config.inventoryRoot, 'production-active.json'), JSON.stringify({ modules: [{ id: 'healthy', title: 'Healthy', version: '1.0.0' }] }));
    await writeFile(join(config.inventoryRoot, 'production-disk.json'), JSON.stringify([disk()]));
    const result = await runInventoryDiagnosis(config);
    expect(result.output.startsWith(config.evidenceRoot)).toBe(true);
    expect(JSON.parse(await readFile(result.output, 'utf8')).modules[0].status).toBe('untested');
  });

  it('rejects an incomplete soak timeline instead of treating it as a baseline', async () => {
    const root = await mkdtemp(join(tmpdir(), 'foundry-baseline-'));
    const config = createLabConfig(root);
    await mkdir(join(config.evidenceRoot, 'diagnostics'), { recursive: true });
    const path = join(config.evidenceRoot, 'diagnostics', 'short.json');
    await writeFile(path, JSON.stringify([{ minute: 0, browserHeapMb: 1, serverRssMb: 1, operationMs: 1, longTasks: 0, errors: 0 }]));
    await expect(runPerformanceBaseline(config, 'full', path)).rejects.toThrow('required soak checkpoints');
  });

  it('only promotes metadata-only modules when explicit runtime and semantic evidence exists', () => {
    const base = diagnoseInventory([{ id: 'healthy', title: 'Healthy', version: '1.0.0' }], [disk()], { foundry: '14.364', dnd5e: '5.3.3' });
    expect(mergeRuntimeEvidence(base, { semanticEvidence: [], moduleFindings: [] }).modules[0]?.status).toBe('untested');
    const merged = mergeRuntimeEvidence(base, { semanticEvidence: ['Actor sheet reviewed'], moduleFindings: [{ id: 'healthy', status: 'ok', evidence: 'Representative workflow passed', recommendation: 'continue enabled' }] });
    expect(merged.modules[0]?.status).toBe('ok');
    expect(merged.modules[0]?.findings).toContain('Representative workflow passed');
  });

  it('exposes inventory diagnosis through the Foundry Lab CLI', async () => {
    const root = await mkdtemp(join(tmpdir(), 'foundry-cli-diagnose-'));
    const config = createLabConfig(root);
    await mkdir(config.inventoryRoot, { recursive: true });
    await writeFile(join(config.inventoryRoot, 'production-active.json'), JSON.stringify({ modules: [{ id: 'healthy', title: 'Healthy', version: '1.0.0' }] }));
    await writeFile(join(config.inventoryRoot, 'production-disk.json'), JSON.stringify([disk()]));
    const cli = join(process.cwd(), 'scripts/foundry-lab/cli.ts');
    const child = Bun.spawn(['bun', 'run', cli, 'diagnose', 'inventory'], {
      cwd: root,
      env: {
        ...process.env,
        FVTT_OPS_LAB_ROOT: config.labRoot,
        FVTT_OPS_EVIDENCE_ROOT: config.evidenceRoot,
        FVTT_OPS_BACKUP_ROOT: config.backupRoot,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(child.stdout).text();
    expect(await child.exited).toBe(0);
    expect(JSON.parse(stdout).count).toBe(1);
  });
  it('writes a sanitized tracked report only from explicit ignored runtime evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'foundry-report-'));
    const config = createLabConfig(root);
    const directory = join(config.evidenceRoot, 'diagnostics');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'inventory.json'), JSON.stringify(diagnoseInventory([{ id: 'healthy', title: 'Healthy', version: '1.0.0' }], [disk()], config.versions)));
    const evidence = join(directory, 'runtime-evidence.json');
    await writeFile(evidence, JSON.stringify({ semanticEvidence: ['Chinese sheet reviewed'], moduleFindings: [{ id: 'healthy', status: 'ok', evidence: 'workflow passed', recommendation: 'continue enabled' }] }));
    const result = await runDiagnosticReport(config, evidence);
    expect(result.output).toBe(join(root, 'docs/acceptance/foundry-v14-module-health.md'));
    expect(await readFile(result.output, 'utf8')).toContain('| healthy | 1.0.0 | OK |');
  });

  it('appends independently recoverable cumulative samples and records metric gaps without aborting', async () => {
    const root = await mkdtemp(join(tmpdir(), 'foundry-cumulative-'));
    const config = createLabConfig(root);
    const path = join(config.evidenceRoot, 'diagnostics', 'operation-cumulative.jsonl');
    const base = {
      timestamp: '2026-07-11T00:00:00.000Z', elapsedMinute: 0, cycle: 0, phase: 'baseline' as const,
      sceneId: 'landing', combatId: null, moduleConfigSha256: 'a'.repeat(64),
      browser: { heapUsedMb: 500, heapTotalMb: 700, nodes: 1000, listeners: 200, documents: 1, frames: 1, webglContexts: 1, longTasks: 0, fps: 60, frameTimeMs: 16.7, consoleErrors: 0, networkFailures: 0 },
      server: { rssMb: 300, privateMb: 320, heapMb: 100, cpuPercent: 2, eventLoopDelayMs: 5, webSockets: 1, logBytes: 10, newErrors: 0 },
      operation: { name: 'baseline', durationMs: 0 }, gaps: [],
    };
    await appendCumulativeSample(config, path, base);
    await appendCumulativeSample(config, path, { ...base, timestamp: '2026-07-11T00:01:00.000Z', elapsedMinute: 1, cycle: 1, phase: 'scene-ready', browser: { ...base.browser, fps: null }, gaps: ['browser.fps unavailable'] });
    const samples = await readCumulativeSamples(config, path);
    expect(samples).toHaveLength(2);
    expect(samples[1]?.gaps).toEqual(['browser.fps unavailable']);
    expect((await readFile(path, 'utf8')).trim().split('\n')).toHaveLength(2);
  });

  it('attributes sustained post-GC growth to scene operations only when four consecutive cycle floors rise', () => {
    const sample = (cycle: number, phase: 'scene-ready' | 'post-gc', heap: number, nodes: number) => ({
      timestamp: `2026-07-11T00:${String(cycle).padStart(2, '0')}:00.000Z`, elapsedMinute: cycle * 10, cycle, phase,
      sceneId: phase === 'scene-ready' ? 'heavy' : 'landing', combatId: null, moduleConfigSha256: 'b'.repeat(64),
      browser: { heapUsedMb: heap, heapTotalMb: heap + 100, nodes, listeners: nodes / 5, documents: 1, frames: 1, webglContexts: 1, longTasks: cycle, fps: 60, frameTimeMs: 16.7, consoleErrors: 0, networkFailures: 0 },
      server: { rssMb: 300, privateMb: 320, heapMb: 100, cpuPercent: 2, eventLoopDelayMs: 5, webSockets: 1, logBytes: 10, newErrors: 0 },
      operation: { name: phase, durationMs: 100 }, gaps: [],
    });
    const samples = [1, 2, 3, 4, 5].flatMap((cycle) => [sample(cycle, 'scene-ready', 700 + cycle * 100, 2000 + cycle * 200), sample(cycle, 'post-gc', 400 + cycle * 120, 1000 + cycle * 150)]);
    const result = analyzeCumulativePerformance(samples);
    expect(result.verdict).toBe('reproduced-scene');
    expect(result.sustainedGrowth).toBe(true);
    expect(result.firstAnomalousCycle).toBe(2);
    expect(result.rootCauseProven).toBe(false);
  });

  it('returns insufficient evidence for missing checkpoints, hash drift, or metric gaps', () => {
    const result = analyzeCumulativePerformance([]);
    expect(result.verdict).toBe('insufficient-evidence');
    expect(result.reasons).toContain('no cumulative samples');
    expect(renderCumulativeReport(result, [])).toContain('Evidence insufficient');
  });

  it('rejects cumulative conclusions when unresolved dialogs contaminate the workload', () => {
    const sample = (cycle: number) => ({
      timestamp: `2026-07-11T00:${String(cycle).padStart(2, '0')}:00.000Z`, elapsedMinute: cycle * 10, cycle,
      phase: 'post-gc' as const, sceneId: 'landing', combatId: null, moduleConfigSha256: 'e'.repeat(64),
      browser: { heapUsedMb: 400 + cycle * 150, heapTotalMb: 1200, nodes: 1000 + cycle * 500, listeners: 200 + cycle * 100, documents: 1, frames: 1, webglContexts: 1, longTasks: cycle, fps: 60, frameTimeMs: 16, consoleErrors: 0, networkFailures: 0, openDialogs: cycle },
      server: { rssMb: 300, privateMb: 320, heapMb: 100, cpuPercent: 2, eventLoopDelayMs: 5, webSockets: 1, logBytes: 10, newErrors: 0 },
      operation: { name: 'post-gc', durationMs: 100 }, gaps: [],
    });
    const result = analyzeCumulativePerformance([1, 2, 3, 4, 5].map(sample));
    expect(result.verdict).toBe('insufficient-evidence');
    expect(result.reasons.join(' ')).toContain('unresolved dialogs');
  });

  it('rejects a formally complete run when required elapsed checkpoints or cycles are absent', () => {
    const result = analyzeCumulativePerformance([{
      timestamp: '2026-07-11T00:00:00.000Z', elapsedMinute: 0, cycle: 0, phase: 'baseline', sceneId: 'landing', combatId: null, moduleConfigSha256: 'c'.repeat(64),
      browser: { heapUsedMb: 1, heapTotalMb: 2, nodes: 1, listeners: 1, documents: 1, frames: 1, webglContexts: 1, longTasks: 0, fps: 60, frameTimeMs: 16, consoleErrors: 0, networkFailures: 0 },
      server: { rssMb: 1, privateMb: 1, heapMb: 1, cpuPercent: 1, eventLoopDelayMs: 1, webSockets: 1, logBytes: 1, newErrors: 0 }, operation: { name: 'baseline', durationMs: 0 }, gaps: [],
    }], { requireCompleteRun: true, requiredCheckpoints: [0, 15, 30, 50], requiredCycles: 5 });
    expect(result.verdict).toBe('insufficient-evidence');
    expect(result.reasons.join(' ')).toContain('checkpoints');
    expect(result.reasons.join(' ')).toContain('5 cycles');
  });

  it('renders a sanitized cumulative report and SVG curves from ignored JSONL evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'foundry-cumulative-report-'));
    const config = createLabConfig(root);
    const input = join(config.evidenceRoot, 'diagnostics', 'operation-cumulative.jsonl');
    await mkdir(join(config.evidenceRoot, 'diagnostics'), { recursive: true });
    const lines = Array.from({ length: 5 }, (_, index) => {
      const cycle = index + 1;
      return JSON.stringify({
        timestamp: `2026-07-11T00:${String(cycle).padStart(2, '0')}:00.000Z`, elapsedMinute: cycle * 10, cycle, phase: 'post-gc', sceneId: 'landing', combatId: null, moduleConfigSha256: 'd'.repeat(64),
        browser: { heapUsedMb: 400 + cycle, heapTotalMb: 600, nodes: 1000 + cycle, listeners: 200 + cycle, documents: 1, frames: 1, webglContexts: 1, longTasks: cycle, fps: 60, frameTimeMs: 16, consoleErrors: 0, networkFailures: 0 },
        server: { rssMb: 300 + cycle, privateMb: 320, heapMb: 100, cpuPercent: 2, eventLoopDelayMs: 5, webSockets: 1, logBytes: 10, newErrors: 0 }, operation: { name: 'post-gc', durationMs: 100 }, gaps: [],
      });
    });
    lines.push(JSON.stringify({ ...JSON.parse(lines[0]!), elapsedMinute: 0, cycle: 0, phase: 'checkpoint' }));
    lines.push(JSON.stringify({ ...JSON.parse(lines[0]!), elapsedMinute: 15, phase: 'checkpoint' }));
    lines.push(JSON.stringify({ ...JSON.parse(lines[0]!), elapsedMinute: 30, phase: 'checkpoint' }));
    lines.push(JSON.stringify({ ...JSON.parse(lines[0]!), elapsedMinute: 50, phase: 'checkpoint' }));
    await writeFile(input, `${lines.join('\n')}\n`);
    const result = await runCumulativeReport(config, input);
    expect(await readFile(result.reportPath, 'utf8')).toContain('Cumulative degradation not reproduced');
    expect(await readFile(result.chartPath, 'utf8')).toContain('<svg');
  });
});
