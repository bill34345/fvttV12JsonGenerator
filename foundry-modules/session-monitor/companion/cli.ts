import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import {
  createSanitizedError,
  MODULE_ID,
  PRODUCT_VERSION,
  type CompanionLifecycleEvent,
  type CompanionSample,
  type SanitizedError,
  type SessionExport,
  type SessionStatus,
} from '../src/schema';
import {
  CdpConnection,
  evaluate,
} from './cdp';
import { ChromeSupervisor } from './chromeSupervisor';
import { sessionMonitorFoundryPaths, type SessionMonitorEnvironment } from '../foundryPaths';
import { combineSession, readJsonLines, writeReportBundle } from './report';
import { aggregateProcesses, WindowsProcessReader } from './windowsProcess';

const COMPANION_VERSION = PRODUCT_VERSION;
const SAMPLE_MS = 10_000;
const REGION_SCAN_EVERY = 6;

export interface CliOptions {
  command: 'record' | 'report';
  url: string;
  outputRoot: string;
  profile: string;
  chrome?: string;
  browserExport?: string;
  companionJsonl?: string;
  companionEvents?: string;
  out?: string;
}

export interface RecordRuntimeHooks {
  sampleMs?: number;
  stopAfterSamples?: number;
  headless?: boolean;
  onSample?: (
    sample: CompanionSample,
    control: { terminateChrome(): Promise<void> },
  ) => void | Promise<void>;
  onPageLaunched?: (page: CdpConnection, browserGeneration: number) => void | Promise<void>;
}

export async function runRecord(options: CliOptions, hooks: RecordRuntimeHooks = {}): Promise<string> {
  const chrome = options.chrome ?? findChrome();
  const supervisor = new ChromeSupervisor({
    chrome,
    profile: options.profile,
    url: options.url,
    headless: hooks.headless,
  });
  let chromeGeneration = await supervisor.launch();
  let page = chromeGeneration.page;
  let status: SessionStatus;
  try {
    await hooks.onPageLaunched?.(page, chromeGeneration.generation);
    status = await waitForModule(page, () => supervisor.hasExited);
  } catch (error) {
    await supervisor.shutdown();
    throw error;
  }
  if (status.state !== 'active') {
    status = await evaluate<SessionStatus>(page, moduleExpression('api.startSession()'));
  }
  if (!status.sessionId) throw new Error('The module did not return a session ID.');
  const sessionId = status.sessionId;

  const outputDirectory = resolve(options.outputRoot, sessionId);
  const companionPath = resolve(outputDirectory, 'companion.jsonl');
  const companionErrorsPath = resolve(outputDirectory, 'companion-errors.jsonl');
  const companionEventsPath = resolve(outputDirectory, 'companion-events.jsonl');
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(resolve(outputDirectory, 'run.json'), `${JSON.stringify({
    schemaVersion: 1,
    sessionId,
    startedAt: status.startedAt,
    urlOrigin: new URL(options.url).origin,
    companionVersion: COMPANION_VERSION,
    chrome: basename(chrome),
    dedicatedProfile: true,
  }, null, 2)}\n`);

  const processReader = new WindowsProcessReader();
  let stopping = false;
  let sequence = 0;
  let errorSequence = 0;
  let lifecycleSequence = 0;
  let rendererGeneration = 1;
  let rendererSignature: string | null = null;
  let companionErrors: SanitizedError[] = [];
  const companionEvents: CompanionLifecycleEvent[] = [];
  let lastWasmCount: number | null = null;
  let resolveStopSignal: (() => void) | undefined;
  const signalHandler = () => {
    stopping = true;
    resolveStopSignal?.();
  };
  const stopSignal = new Promise<void>((resolveStop) => {
    resolveStopSignal = resolveStop;
  });
  process.once('SIGINT', signalHandler);
  process.once('SIGTERM', signalHandler);

  const recordLifecycle = async (
    kind: CompanionLifecycleEvent['kind'],
    reason?: CompanionLifecycleEvent['reason'],
    browserGeneration = supervisor.generation,
  ) => {
    const event: CompanionLifecycleEvent = {
      sequence: ++lifecycleSequence,
      timestamp: new Date().toISOString(),
      kind,
      browserGeneration,
      rendererGeneration,
      ...(reason ? { reason } : {}),
    };
    companionEvents.push(event);
    await appendFile(companionEventsPath, `${JSON.stringify(event)}\n`);
  };

  const attachErrorListeners = async () => {
    await page.send('Runtime.enable');
    await page.send('Log.enable');
    const record = async (source: SanitizedError['source'], value: unknown, stack?: string) => {
      const error = value instanceof Error ? value : new Error(String(value ?? 'CDP error'));
      if (stack) error.stack = `${error.name}: ${error.message}\n${stack}`;
      const sanitized = await createSanitizedError({
        sequence: ++errorSequence,
        startedAt: status.startedAt ?? new Date().toISOString(),
        source,
        error,
      });
      companionErrors.push(sanitized);
      if (companionErrors.length > 1_000) companionErrors = companionErrors.slice(-1_000);
      await appendFile(companionErrorsPath, `${JSON.stringify(sanitized)}\n`);
    };
    page.on('Runtime.exceptionThrown', (params) => {
      const detail = params?.exceptionDetails;
      const stack = detail?.stackTrace?.callFrames?.map((frame: any) =>
        `at ${frame.functionName || '<anonymous>'} (${frame.url || '<script>'}:${frame.lineNumber}:${frame.columnNumber})`
      ).join('\n');
      void record('cdp-runtime', detail?.text ?? 'Runtime exception', stack);
    });
    page.on('Log.entryAdded', (params) => {
      if (params?.entry?.level === 'error') {
        const stack = params.entry.stackTrace?.callFrames?.map((frame: any) =>
          `at ${frame.functionName || '<anonymous>'} (${frame.url || '<script>'}:${frame.lineNumber}:${frame.columnNumber})`
        ).join('\n');
        void record('cdp-log', params.entry.text, stack);
      }
    });
  };
  await attachErrorListeners();
  await page.send('Performance.enable');
  await recordLifecycle('chrome-launch', 'initial');

  console.log(`Recording ${sessionId}`);
  console.log(`Evidence ${outputDirectory}`);
  console.log('Press Ctrl+C to stop, export, and build the report.');

  try {
    while (!stopping) {
      const started = Date.now();
      const gaps: string[] = [];
      try {
        await evaluate(page, moduleExpression(
          `api.setCompanionHeartbeat(${JSON.stringify({ timestamp: new Date().toISOString(), version: COMPANION_VERSION })})`,
        ));
        const [heapResponse, performanceResponse, processResponse] = await Promise.all([
          page.send<any>('Runtime.getHeapUsage'),
          page.send<any>('Performance.getMetrics'),
          supervisor.current.browser.send<any>('SystemInfo.getProcessInfo'),
        ]);
        const processes = (processResponse.processInfo ?? []) as Array<{ id: number; type: string; cpuTime?: number }>;
        const memory = new Map(processes.map((entry) => [entry.id, processReader.readMemory(entry.id)]));
        const renderers = processes.filter((entry) => entry.type === 'renderer');
        const nextRendererSignature = renderers.map((entry) => entry.id).sort((left, right) => left - right).join(',');
        if (rendererSignature !== null && nextRendererSignature !== rendererSignature) {
          rendererGeneration++;
          await recordLifecycle('renderer-generation', 'renderer-set-changed');
        }
        rendererSignature = nextRendererSignature;
        if (sequence % REGION_SCAN_EVERY === 0) {
          const counts = renderers.map((entry) => processReader.countWasmCommittedAllocations(entry.id));
          lastWasmCount = counts.every((count) => count !== null)
            ? counts.reduce((sum, count) => sum + (count ?? 0), 0)
            : null;
          if (lastWasmCount === null) gaps.push('VirtualQueryEx');
        }
        const performance = Object.fromEntries(
          (performanceResponse.metrics ?? []).map((metric: { name: string; value: number }) => [
            metric.name,
            Number.isFinite(metric.value) ? metric.value : null,
          ]),
        );
        const sample: CompanionSample = {
          sequence: ++sequence,
          timestamp: new Date().toISOString(),
          sessionId,
          browserGeneration: supervisor.generation,
          rendererGeneration,
          rendererAttribution: renderers.length === 1
            ? 'dedicated-single-renderer'
            : renderers.length > 1 ? 'dedicated-multiple-renderers' : 'unknown',
          heap: {
            usedBytes: finiteOrNull(heapResponse.usedSize),
            totalBytes: finiteOrNull(heapResponse.totalSize),
            embedderBytes: finiteOrNull(heapResponse.embedderHeapUsedSize),
            backingBytes: finiteOrNull(heapResponse.backingStorageSize),
          },
          performance,
          processes: aggregateProcesses(processes, memory),
          wasmCommittedRegionCount: lastWasmCount,
          gaps,
        };
        await appendFile(companionPath, `${JSON.stringify(sample)}\n`);
        await hooks.onSample?.(sample, {
          terminateChrome: () => supervisor.terminateUnexpectedly(),
        });
        if (hooks.stopAfterSamples && sequence >= hooks.stopAfterSamples) stopping = true;
      } catch (error) {
        const reason = supervisor.hasExited ? 'process-exit' : 'cdp-disconnected';
        console.warn(`Sampling gap: ${error instanceof Error ? error.message : String(error)}`);
        await recordLifecycle('chrome-exit-detected', reason);
        let reconnected = false;
        if (!supervisor.hasExited) {
          try {
            page = await supervisor.reconnectPage();
            status = await waitForResumedSession(page, sessionId, () => supervisor.hasExited);
            await attachErrorListeners();
            await page.send('Performance.enable');
            await recordLifecycle('page-reconnect', 'cdp-disconnected');
            reconnected = true;
          } catch {}
        }
        if (!reconnected) {
          await recordLifecycle('chrome-relaunch-start', reason, supervisor.generation + 1);
          chromeGeneration = await supervisor.relaunch();
          page = chromeGeneration.page;
          await hooks.onPageLaunched?.(page, chromeGeneration.generation);
          status = await waitForResumedSession(page, sessionId, () => supervisor.hasExited);
          rendererGeneration++;
          rendererSignature = null;
          lastWasmCount = null;
          await attachErrorListeners();
          await page.send('Performance.enable');
          await recordLifecycle('chrome-relaunch-complete', reason);
        }
      }
      if (stopping) break;
      await Promise.race([
        stopSignal,
        Bun.sleep(Math.max(0, (hooks.sampleMs ?? SAMPLE_MS) - (Date.now() - started))),
      ]);
    }

    let browserExport: SessionExport | null = null;
    try {
      browserExport = await evaluate<SessionExport | null>(page, moduleExpression('api.stopSession({download:false})'));
    } catch {
      browserExport = await evaluate<SessionExport | null>(page, moduleExpression('api.exportSession()'));
    }
    if (!browserExport) throw new Error('Could not export the browser session.');
    await writeFile(resolve(outputDirectory, 'browser-session.json'), `${JSON.stringify(browserExport, null, 2)}\n`);
    const companionSamples = await readJsonLines<CompanionSample>(companionPath).catch(() => []);
    const combined = combineSession(browserExport, companionSamples, companionErrors, companionEvents);
    await writeReportBundle(outputDirectory, combined);
    console.log(`Report ${resolve(outputDirectory, 'report.md')}`);
    return outputDirectory;
  } finally {
    process.off('SIGINT', signalHandler);
    process.off('SIGTERM', signalHandler);
    processReader.close();
    await supervisor.shutdown();
  }
}

async function waitForModule(
  page: CdpConnection,
  chromeExited: () => boolean = () => false,
): Promise<SessionStatus> {
  let announced = 0;
  while (true) {
    if (chromeExited()) throw new Error('Chrome exited before the monitoring session was ready.');
    try {
      const status = await evaluate<SessionStatus | null>(
        page,
        `globalThis.game?.modules?.get(${JSON.stringify(MODULE_ID)})?.api?.getStatus?.() ?? null`,
      );
      if (status?.enabled) return status;
    } catch {}
    if (Date.now() - announced > 5_000) {
      console.log('Waiting for a logged-in GM world with FVTT Session Monitor enabled...');
      announced = Date.now();
    }
    await Bun.sleep(1_000);
  }
}

async function waitForResumedSession(
  page: CdpConnection,
  expectedSessionId: string,
  chromeExited: () => boolean,
): Promise<SessionStatus> {
  let announced = 0;
  let mismatchedSince = 0;
  while (true) {
    if (chromeExited()) throw new Error('Chrome exited while waiting for the monitoring session to resume.');
    try {
      const status = await evaluate<SessionStatus | null>(
        page,
        `globalThis.game?.modules?.get(${JSON.stringify(MODULE_ID)})?.api?.getStatus?.() ?? null`,
      );
      if (status?.enabled && status.state === 'active' && status.sessionId === expectedSessionId) return status;
      if (status?.enabled) {
        mismatchedSince ||= Date.now();
        if (Date.now() - mismatchedSince >= 15_000) {
          throw new Error(
            `The relaunched page did not resume the expected active session ${expectedSessionId}.`,
          );
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('The relaunched page did not resume')) throw error;
    }
    if (Date.now() - announced > 5_000) {
      console.log('Chrome restarted. Waiting for the GM world to reopen and resume the same monitoring session...');
      announced = Date.now();
    }
    await Bun.sleep(1_000);
  }
}

function moduleExpression(invocation: string): string {
  return `(async()=>{const api=globalThis.game?.modules?.get(${JSON.stringify(MODULE_ID)})?.api;if(!api)throw new Error("Session Monitor API unavailable");return await ${invocation};})()`;
}

function findChrome(): string {
  const candidates = [
    process.env.PROGRAMFILES ? resolve(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe') : '',
    process.env['PROGRAMFILES(X86)'] ? resolve(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe') : '',
    process.env.LOCALAPPDATA ? resolve(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe') : '',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (Bun.file(candidate).size > 0) return candidate;
  }
  throw new Error('Chrome executable not found. Pass --chrome <path>.');
}

async function runReport(options: CliOptions): Promise<string> {
  if (!options.browserExport || !options.companionJsonl || !options.out) {
    throw new Error('report requires --browser, --companion, and --out.');
  }
  const browser = JSON.parse(await readFile(options.browserExport, 'utf8')) as SessionExport;
  const samples = await readJsonLines<CompanionSample>(options.companionJsonl);
  const eventPath = options.companionEvents
    ?? resolve(dirname(options.companionJsonl), 'companion-events.jsonl');
  const events = await readJsonLines<CompanionLifecycleEvent>(eventPath).catch(() => []);
  const combined = combineSession(browser, samples, [], events);
  await writeReportBundle(options.out, combined);
  return options.out;
}

export function parseArgs(
  argv: string[],
  environment: SessionMonitorEnvironment = process.env,
): CliOptions {
  const valueOptions = new Set([
    '--workspace-root',
    '--url',
    '--output-root',
    '--profile',
    '--chrome',
    '--browser',
    '--companion',
    '--events',
    '--out',
  ]);
  let command: CliOptions['command'] = 'record';
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (valueOptions.has(argument ?? '')) {
      index++;
      continue;
    }
    if (argument === 'record' || argument === 'report') {
      command = argument;
      break;
    }
  }
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const workspaceRoot = resolve(value('--workspace-root') ?? resolve(import.meta.dir, '..'));
  const foundryPaths = sessionMonitorFoundryPaths(workspaceRoot, environment);
  return {
    command,
    url: value('--url') ?? 'http://127.0.0.1:30001/game',
    outputRoot: resolve(value('--output-root') ?? foundryPaths.sessionEvidenceRoot),
    profile: resolve(value('--profile') ?? resolve(workspaceRoot, '.local/fvtt-session-monitor/chrome-profile')),
    chrome: value('--chrome'),
    browserExport: value('--browser'),
    companionJsonl: value('--companion'),
    companionEvents: value('--events'),
    out: value('--out'),
  };
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const output = options.command === 'report' ? await runReport(options) : await runRecord(options);
  console.log(output);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
