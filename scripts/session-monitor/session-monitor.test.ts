import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type {
  CompanionSample,
  SessionExport,
} from '../../src/foundry/session-monitor/schema';
import { aggregateProcesses, WindowsProcessReader } from './windowsProcess';
import { combineSession, renderMarkdownReport, renderSvgChart } from './report';
import { runRecord, type CliOptions } from './cli';

const browser: SessionExport = {
  schemaVersion: 1,
  session: {
    id: 'session-one',
    state: 'stopped',
    startedAt: '2026-07-29T10:00:00.000Z',
    endedAt: '2026-07-29T10:00:20.000Z',
    updatedAt: '2026-07-29T10:00:20.000Z',
    refreshCount: 1,
    sampleSequence: 2,
    eventSequence: 1,
    errorSequence: 0,
    truncated: { samples: false, events: false, errors: false },
    environment: {
      foundryVersion: '14.364',
      systemId: 'dnd5e',
      systemVersion: '5.3.3',
      moduleConfigSha256: 'hash',
      activeModules: [],
      browserMajor: '140',
      platform: 'Windows',
      hardwareConcurrency: 16,
      deviceMemoryGb: 32,
    },
  },
  samples: [browserSample(1, 100), browserSample(2, 150)],
  events: [{
    sequence: 1,
    timestamp: '2026-07-29T10:00:10.000Z',
    elapsedMs: 10_000,
    kind: 'jank-marker',
    sceneAlias: 'scene-1',
  }],
  errors: [],
  privacy: {
    sceneAndCombatIdsAliased: true,
    freeTextMarkersDisabled: true,
    rawConsoleArgumentsExcluded: true,
    forbiddenContent: [],
  },
};

describe('process attribution', () => {
  test('reads real Windows process memory and virtual regions', () => {
    if (process.platform !== 'win32') return;
    const reader = new WindowsProcessReader();
    try {
      const memory = reader.readMemory(process.pid);
      expect(memory?.workingSetBytes).toBeGreaterThan(0);
      expect(memory?.privateBytes).toBeGreaterThan(0);
      expect(reader.countWasmCommittedAllocations(process.pid)).toBeGreaterThanOrEqual(0);
    } finally {
      reader.close();
    }
  });

  test('keeps renderer, GPU, browser, and utility memory separate', () => {
    const result = aggregateProcesses(
      [
        { id: 1, type: 'renderer', cpuTime: 1 },
        { id: 2, type: 'renderer', cpuTime: 2 },
        { id: 3, type: 'GPU', cpuTime: 3 },
      ],
      new Map([
        [1, { workingSetBytes: 10, privateBytes: 20 }],
        [2, { workingSetBytes: 30, privateBytes: 40 }],
        [3, { workingSetBytes: 50, privateBytes: 60 }],
      ]),
    );
    expect(result).toContainEqual({
      type: 'renderer',
      processCount: 2,
      workingSetBytes: 40,
      privateBytes: 60,
      cpuTimeSeconds: 3,
    });
    expect(result).toContainEqual({
      type: 'GPU',
      processCount: 1,
      workingSetBytes: 50,
      privateBytes: 60,
      cpuTimeSeconds: 3,
    });
  });
});

describe('offline report', () => {
  test('joins only the matching session and states coverage', () => {
    const combined = combineSession(browser, [
      companionSample('session-one', 1),
      companionSample('other-session', 2),
    ]);
    expect(combined.companion.samples).toHaveLength(1);
    expect(combined.companion.coveragePercent).toBe(50);
    const markdown = renderMarkdownReport(combined);
    expect(markdown).toContain('Manual jank markers: 1');
    expect(markdown).toContain('correlates observations; it does not prove causation');
    expect(markdown).toContain('scene scene-1');
  });

  test('renders a standalone SVG without embedding gameplay content', () => {
    const svg = renderSvgChart(combineSession(browser, [companionSample('session-one', 1)]));
    expect(svg.startsWith('<svg')).toBeTrue();
    expect(svg).toContain('<polyline');
    expect(svg).not.toContain('chat');
  });
});

describe('full Chrome restart recovery', () => {
  test('relaunches a real dedicated Chrome and resumes the same active session', async () => {
    if (process.platform !== 'win32') return;
    const chrome = chromePath();
    if (!chrome) return;
    const temporary = await mkdtemp(resolve(tmpdir(), 'fvtt-session-monitor-restart-'));
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        if (new URL(request.url).pathname === '/favicon.ico') return new Response('', { status: 204 });
        return new Response(mockFoundryPage(), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      },
    });
    const options: CliOptions = {
      command: 'record',
      url: `http://127.0.0.1:${server.port}/game`,
      outputRoot: resolve(temporary, 'evidence'),
      profile: resolve(temporary, 'profile'),
      chrome,
    };
    try {
      const output = await runRecord(options, {
        headless: true,
        sampleMs: 150,
        stopAfterSamples: 2,
        async onSample(sample, control) {
          if (sample.sequence === 1) await control.terminateChrome();
        },
      });
      const combined = JSON.parse(await readFile(resolve(output, 'session-combined.json'), 'utf8'));
      const run = JSON.parse(await readFile(resolve(output, 'run.json'), 'utf8'));
      expect(run.companionVersion).toBe('1.1.1');
      expect(combined.session.id).toBe('restart-smoke-session');
      expect(combined.companion.samples.map((sample: CompanionSample) => sample.browserGeneration)).toEqual([1, 2]);
      expect(combined.companion.samples.every((sample: CompanionSample) =>
        sample.sessionId === 'restart-smoke-session'
      )).toBeTrue();
      expect(combined.companion.events.map((event: { kind: string }) => event.kind)).toEqual([
        'chrome-launch',
        'chrome-exit-detected',
        'chrome-relaunch-start',
        'chrome-relaunch-complete',
      ]);
      const report = await readFile(resolve(output, 'report.md'), 'utf8');
      expect(report).toContain('Full Chrome cold restarts: 1');
      expect(report).toContain('browser g1 -> g2');
    } finally {
      server.stop(true);
      await rm(temporary, { recursive: true, force: true });
    }
  }, 60_000);
});

function browserSample(sequence: number, usedBytes: number) {
  return {
    sequence,
    timestamp: `2026-07-29T10:00:${String(sequence * 10).padStart(2, '0')}.000Z`,
    elapsedMs: sequence * 10_000,
    visibility: 'visible' as const,
    canvasReady: true,
    sceneAlias: 'scene-1',
    combatAlias: null,
    round: null,
    turn: null,
    heap: { usedBytes, totalBytes: 200, limitBytes: 1_000 },
    dom: { elements: 10, chatCards: 0, chatMessages: 0, openWindows: 0 },
    textureApproxBytes: 20,
    midi: { workflows: 0, liveWeakRefs: 0 },
    sequencerEffects: 0,
    timerDriftMs: 0,
    frames: { count: 1, p95Ms: 16, p99Ms: 16, maxMs: sequence === 2 ? 80 : 16, over50Ms: sequence === 2 ? 1 : 0, over100Ms: 0, over250Ms: 0 },
    longTasks: { count: 0, totalMs: 0, maxMs: 0 },
    capabilityGaps: [],
  };
}

function companionSample(sessionId: string, sequence: number): CompanionSample {
  return {
    sequence,
    timestamp: '2026-07-29T10:00:10.000Z',
    sessionId,
    browserGeneration: 1,
    rendererGeneration: 1,
    rendererAttribution: 'dedicated-single-renderer',
    heap: { usedBytes: 100, totalBytes: 200, embedderBytes: 10, backingBytes: 20 },
    performance: {},
    processes: [{
      type: 'renderer',
      processCount: 1,
      workingSetBytes: 300,
      privateBytes: 400,
      cpuTimeSeconds: 1,
    }],
    wasmCommittedRegionCount: 7,
    gaps: [],
  };
}

function chromePath(): string | null {
  const candidates = [
    process.env.PROGRAMFILES ? resolve(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe') : '',
    process.env['PROGRAMFILES(X86)'] ? resolve(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe') : '',
    process.env.LOCALAPPDATA ? resolve(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe') : '',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function mockFoundryPage(): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Session Monitor Restart Smoke</title></head>
<body><main>restart smoke</main><script>
(() => {
  const key = "fvtt-session-monitor-restart-smoke";
  const idle = () => ({
    enabled: true, state: "idle", sessionId: null, startedAt: null,
    elapsedMs: 0, samples: 0, companionLastSeenAt: null,
    recentMaxFrameGapMs: null, recentLongTaskMaxMs: 0
  });
  const read = () => JSON.parse(localStorage.getItem(key) || "null") || idle();
  const write = value => {
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  };
  const environment = {
    foundryVersion: "14.364", systemId: "dnd5e", systemVersion: "5.3.3",
    moduleConfigSha256: "restart-smoke", activeModules: [],
    browserMajor: "smoke", platform: "Windows",
    hardwareConcurrency: 1, deviceMemoryGb: 1
  };
  const api = {
    getStatus: read,
    async startSession() {
      const startedAt = new Date().toISOString();
      return write({
        ...idle(), state: "active", sessionId: "restart-smoke-session",
        startedAt, elapsedMs: 1
      });
    },
    setCompanionHeartbeat(input) {
      return write({...read(), companionLastSeenAt: input.timestamp});
    },
    async stopSession() {
      const status = write({...read(), state: "stopped"});
      return {
        schemaVersion: 1,
        session: {
          id: status.sessionId, state: "stopped", startedAt: status.startedAt,
          endedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          refreshCount: 1, sampleSequence: 0, eventSequence: 0, errorSequence: 0,
          truncated: {samples:false,events:false,errors:false}, environment
        },
        samples: [], events: [], errors: [],
        privacy: {
          sceneAndCombatIdsAliased: true, freeTextMarkersDisabled: true,
          rawConsoleArgumentsExcluded: true, forbiddenContent: []
        }
      };
    },
    async exportSession() { return this.stopSession(); }
  };
  globalThis.game = { modules: new Map([["fvtt-session-monitor", {api}]]) };
})();
</script></body></html>`;
}
