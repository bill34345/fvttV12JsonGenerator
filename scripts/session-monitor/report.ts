import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  percentile,
  type BrowserSample,
  type CombinedSessionExport,
  type CompanionLifecycleEvent,
  type CompanionSample,
  type SanitizedError,
  type SessionExport,
} from '../../src/foundry/session-monitor/schema';

export function combineSession(
  browser: SessionExport,
  companionSamples: CompanionSample[],
  companionErrors: SanitizedError[] = [],
  companionEvents: CompanionLifecycleEvent[] = [],
): CombinedSessionExport {
  const expected = Math.max(1, browser.samples.length);
  const matched = companionSamples.filter((sample) => sample.sessionId === browser.session.id)
    .sort((left, right) => left.sequence - right.sequence);
  const gaps = Array.from(new Set(matched.flatMap((sample) => sample.gaps))).sort();
  return {
    ...browser,
    companion: {
      samples: matched,
      events: companionEvents
        .filter((event) => event.browserGeneration <= Math.max(1, ...matched.map((sample) => sample.browserGeneration)))
        .sort((left, right) => left.sequence - right.sequence),
      errors: companionErrors,
      coveragePercent: Math.min(100, Math.round((matched.length / expected) * 10_000) / 100),
      gaps,
    },
  };
}

export function renderMarkdownReport(combined: CombinedSessionExport): string {
  const samples = combined.samples;
  const companion = combined.companion.samples;
  const heap = samples.map((sample) => sample.heap.usedBytes).filter(isNumber);
  const frameMax = samples.map((sample) => sample.frames.maxMs).filter(isNumber);
  const rendererPrivate = companion.map((sample) =>
    sample.processes.find((process) => process.type === 'renderer')?.privateBytes ?? null
  ).filter(isNumber);
  const markers = combined.events.filter((event) => event.kind === 'jank-marker');
  const restarts = combined.companion.events.filter((event) => event.kind === 'chrome-relaunch-complete');
  const lines = [
    '# FVTT Session Monitor Report',
    '',
    `- Session: \`${combined.session.id}\``,
    `- Window: ${combined.session.startedAt} to ${combined.session.endedAt ?? 'not stopped'}`,
    `- Foundry / system: ${combined.session.environment.foundryVersion} / ${combined.session.environment.systemId} ${combined.session.environment.systemVersion}`,
    `- Browser samples: ${samples.length}; companion samples: ${companion.length}; coverage: ${combined.companion.coveragePercent}%`,
    `- Manual jank markers: ${markers.length}; sanitized errors: ${combined.errors.length + combined.companion.errors.length}`,
    `- Full Chrome cold restarts: ${restarts.length}; browser generations: ${Math.max(0, ...companion.map((sample) => sample.browserGeneration))}`,
    '',
    '## Signals',
    '',
    `- JS heap used: ${formatBytes(first(heap))} -> ${formatBytes(last(heap))}; max ${formatBytes(max(heap))}`,
    `- Renderer private bytes: ${formatBytes(first(rendererPrivate))} -> ${formatBytes(last(rendererPrivate))}; max ${formatBytes(max(rendererPrivate))}`,
    `- Frame gap p95/max: ${formatMs(percentile(frameMax, 0.95))} / ${formatMs(max(frameMax))}`,
    `- Long Tasks: ${samples.reduce((sum, sample) => sum + sample.longTasks.count, 0)}`,
    `- Exact ${299_958_272}-byte private committed allocations (last scan): ${last(companion.map((sample) => sample.wasmCommittedRegionCount).filter(isNumber)) ?? 'n/a'}`,
    '',
    '## Markers',
    '',
    ...(markers.length ? markers.map((marker) => {
      const nearest = nearestSample(samples, marker.timestamp);
      return `- ${marker.timestamp}: heap ${formatBytes(nearest?.heap.usedBytes ?? null)}, frame max ${formatMs(nearest?.frames.maxMs ?? null)}, scene ${marker.sceneAlias ?? 'n/a'}, combat ${marker.combatAlias ?? 'n/a'}`;
    }) : ['- None']),
    '',
    '## Chrome cold restart boundaries',
    '',
    ...(restarts.length ? restarts.map((restart) => renderRestartBoundary(companion, restart)) : ['- None']),
    '',
    '## Capability gaps',
    '',
    ...(combined.companion.gaps.length ? combined.companion.gaps.map((gap) => `- ${gap}`) : ['- None']),
    '',
    '## Interpretation boundary',
    '',
    'This report correlates observations; it does not prove causation. Browser heap, OS process memory, GPU/texture estimates, DOM scale, and fixed Worker reservations are separate signals.',
    '',
  ];
  return lines.join('\n');
}

export function renderSvgChart(combined: CombinedSessionExport): string {
  const values = combined.samples.map((sample) => sample.heap.usedBytes);
  const numeric = values.filter(isNumber);
  const width = 960;
  const height = 320;
  const margin = 44;
  const ceiling = Math.max(1, ...numeric);
  const points = values.map((value, index) => {
    if (value === null) return null;
    const x = margin + (index / Math.max(1, values.length - 1)) * (width - margin * 2);
    const y = height - margin - (value / ceiling) * (height - margin * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).filter(Boolean).join(' ');
  const started = Date.parse(combined.session.startedAt);
  const ended = Date.parse(combined.session.endedAt ?? combined.samples.at(-1)?.timestamp ?? combined.session.startedAt);
  const restartLines = combined.companion.events
    .filter((event) => event.kind === 'chrome-relaunch-complete')
    .map((event) => {
      const ratio = Math.max(0, Math.min(1, (Date.parse(event.timestamp) - started) / Math.max(1, ended - started)));
      const x = margin + ratio * (width - margin * 2);
      return `  <line x1="${x.toFixed(1)}" y1="${margin}" x2="${x.toFixed(1)}" y2="${height - margin}" stroke="#f39c6b" stroke-width="2" stroke-dasharray="6 5"/>\n  <text x="${(x + 4).toFixed(1)}" y="${margin + 14}" fill="#f39c6b" font-family="sans-serif" font-size="11">Chrome g${event.browserGeneration}</text>`;
    }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#15181d"/>
  <line x1="${margin}" y1="${height - margin}" x2="${width - margin}" y2="${height - margin}" stroke="#69727d"/>
  <line x1="${margin}" y1="${margin}" x2="${margin}" y2="${height - margin}" stroke="#69727d"/>
  <polyline fill="none" stroke="#7eb8da" stroke-width="2" points="${points}"/>
${restartLines}
  <text x="${margin}" y="24" fill="#eef2f5" font-family="sans-serif" font-size="16">JS heap used (${formatBytes(ceiling)} max)</text>
  <text x="${margin}" y="${height - 12}" fill="#aab2bc" font-family="sans-serif" font-size="12">${combined.session.startedAt}</text>
</svg>
`;
}

function renderRestartBoundary(samples: CompanionSample[], event: CompanionLifecycleEvent): string {
  const before = [...samples]
    .filter((sample) => Date.parse(sample.timestamp) < Date.parse(event.timestamp))
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))[0];
  const after = [...samples]
    .filter((sample) => sample.browserGeneration === event.browserGeneration)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))[0];
  const beforeHeap = before?.heap.usedBytes ?? null;
  const afterHeap = after?.heap.usedBytes ?? null;
  const beforePrivate = processBytes(before, 'renderer', 'privateBytes');
  const afterPrivate = processBytes(after, 'renderer', 'privateBytes');
  return `- ${event.timestamp}: browser g${Math.max(1, event.browserGeneration - 1)} -> g${event.browserGeneration}; page heap ${formatTransition(beforeHeap, afterHeap)}; renderer private ${formatTransition(beforePrivate, afterPrivate)}`;
}

function processBytes(
  sample: CompanionSample | undefined,
  type: string,
  field: 'workingSetBytes' | 'privateBytes',
): number | null {
  return sample?.processes.find((process) => process.type === type)?.[field] ?? null;
}

function formatTransition(before: number | null, after: number | null): string {
  if (before === null || after === null) return `${formatBytes(before)} -> ${formatBytes(after)} (delta n/a)`;
  const delta = after - before;
  return `${formatBytes(before)} -> ${formatBytes(after)} (delta ${delta >= 0 ? '+' : ''}${formatBytes(delta)})`;
}

export async function writeReportBundle(outputDirectory: string, combined: CombinedSessionExport): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(resolve(outputDirectory, 'session-combined.json'), `${JSON.stringify(combined, null, 2)}\n`),
    writeFile(resolve(outputDirectory, 'report.md'), renderMarkdownReport(combined)),
    writeFile(resolve(outputDirectory, 'heap-timeline.svg'), renderSvgChart(combined)),
  ]);
}

export async function readJsonLines<T>(path: string): Promise<T[]> {
  const content = await readFile(path, 'utf8');
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as T);
}

function nearestSample(samples: BrowserSample[], timestamp: string): BrowserSample | undefined {
  const target = Date.parse(timestamp);
  return [...samples].sort((left, right) =>
    Math.abs(Date.parse(left.timestamp) - target) - Math.abs(Date.parse(right.timestamp) - target)
  )[0];
}

function isNumber(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function first<T>(values: T[]): T | null {
  return values[0] ?? null;
}

function last<T>(values: T[]): T | null {
  return values.at(-1) ?? null;
}

function max(values: number[]): number | null {
  return values.length ? Math.max(...values) : null;
}

function formatBytes(value: number | null): string {
  return value === null ? 'n/a' : `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

function formatMs(value: number | null): string {
  return value === null ? 'n/a' : `${value.toFixed(1)} ms`;
}
