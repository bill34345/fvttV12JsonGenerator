import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assertBrowserOnlyArchiveDelta,
  assertBrowserUpdateManifests,
  assertServerNextCommandLine,
  assertServerNextRuntime,
  PREVIOUS_CANDIDATE_VERSION,
  CANDIDATE_VERSION,
  fetchServedBundleSha256,
  replaceFileAtomically,
  SERVER_NEXT_DATA_ROOT,
  SERVER_NEXT_MAIN,
  SERVER_NEXT_NODE,
  type BrowserUpdateArchive,
  type RuntimeProcess,
} from '../browser-update';

const ownedRoots: string[] = [];
afterEach(async () => {
  for (const root of ownedRoots.splice(0)) await rm(root, { recursive: true });
});

const previousManifest = {
  id: 'midi-qol',
  version: PREVIOUS_CANDIDATE_VERSION,
  title: 'Midi-QOL Beta (dnd5e 6, ServerNext local)',
  description: 'Prior candidate metadata',
  download: 'https://example.invalid/local.7.zip',
  esmodules: ['midi-qol.js'],
  relationships: { systems: [{ id: 'dnd5e', type: 'system' }] },
};

const candidateManifest = {
  ...previousManifest,
  version: CANDIDATE_VERSION,
  title: 'Midi-QOL Beta (dnd5e 6, ServerNext local)',
  description: 'Local ServerNext compatibility candidate',
  download: 'https://example.invalid/local.8.zip',
};

function archive(manifest: Record<string, unknown>, overrides: Record<string, string> = {}): BrowserUpdateArchive {
  return {
    manifest,
    files: new Map(Object.entries({
      'midi-qol.js': 'A'.repeat(64),
      'midi-qol.js.map': 'B'.repeat(64),
      'module.json': 'C'.repeat(64),
      'css/module.css': 'D'.repeat(64),
      'packs/sampleitems/000005.ldb': 'E'.repeat(64),
      ...overrides,
    })),
  };
}

function serverProcess(overrides: Partial<RuntimeProcess> = {}): RuntimeProcess {
  return {
    processId: 11188,
    name: 'node.exe',
    executablePath: SERVER_NEXT_NODE,
    commandLine: `"${SERVER_NEXT_NODE}" --require F:\\FoundryLab\\foundry-v14\\evidence\\server-next-migration\\loopback-preload.cjs "${SERVER_NEXT_MAIN}" --dataPath=${SERVER_NEXT_DATA_ROOT} --hostname=127.0.0.1 --port=30002 --world=cor-cotn --noupnp`,
    ...overrides,
  };
}

describe('ServerNext browser-resource runtime identity', () => {
  test('accepts the restored preload launch without hostname but refuses missing preload or public binding', () => {
    const process = serverProcess();
    process.commandLine = process.commandLine.replace(' --hostname=127.0.0.1', '');
    expect(() => assertServerNextCommandLine(process)).not.toThrow();
    expect(() => assertServerNextCommandLine({ ...process,
      commandLine: process.commandLine.replace('--require', '--not-require') })).toThrow();
    expect(() => assertServerNextRuntime({ processes: [process], listeners: [
      { localAddress: '0.0.0.0', localPort: 30002, owningProcess: process.processId },
    ], foundryOptionsLockExists: true })).toThrow('loopback');
  });
  test('accepts the exact live PID and port owner while Foundry holds its normal options lock', () => {
    const process = serverProcess();
    expect(assertServerNextRuntime({
      processes: [process],
      listeners: [{ localAddress: '127.0.0.1', localPort: 30002, owningProcess: process.processId }],
      foundryOptionsLockExists: true,
    })).toEqual(process);
  });

  test('rejects data-path, port, world, and app-entrypoint prefix lookalikes', () => {
    for (const commandLine of [
      serverProcess().commandLine.replace(SERVER_NEXT_DATA_ROOT, `${SERVER_NEXT_DATA_ROOT}-other`),
      serverProcess().commandLine.replace('--port=30002', '--port=300020'),
      serverProcess().commandLine.replace('--world=cor-cotn', '--world=cor-cotn-other'),
      serverProcess().commandLine.replace(SERVER_NEXT_MAIN, `${SERVER_NEXT_MAIN}.backup`),
    ]) {
      expect(() => assertServerNextCommandLine(serverProcess({ commandLine }))).toThrow();
    }
  });

  test('rejects another process owning the listener or an ambiguous process set', () => {
    const process = serverProcess();
    expect(() => assertServerNextRuntime({
      processes: [process],
      listeners: [{ localAddress: '127.0.0.1', localPort: 30002, owningProcess: 7 }],
      foundryOptionsLockExists: true,
    })).toThrow('not owned exclusively');
    expect(() => assertServerNextRuntime({
      processes: [process, serverProcess({ processId: 22 })],
      listeners: [{ localAddress: '127.0.0.1', localPort: 30002, owningProcess: process.processId }],
      foundryOptionsLockExists: false,
    })).toThrow('exactly one');
  });
});

describe('pinned browser-only archive delta', () => {
  test('allows only bundle, source map, and release metadata changes', () => {
    const previous = archive(previousManifest);
    const candidate = archive(candidateManifest, {
      'midi-qol.js': 'F'.repeat(64),
      'midi-qol.js.map': '1'.repeat(64),
      'module.json': '2'.repeat(64),
    });
    expect(() => assertBrowserOnlyArchiveDelta(previous, candidate, CANDIDATE_VERSION)).not.toThrow();
  });

  test('rejects a changed non-browser asset, archive entry, or manifest behavior', () => {
    const previous = archive(previousManifest);
    const changedCss = archive(candidateManifest, {
      'midi-qol.js': 'F'.repeat(64),
      'css/module.css': '9'.repeat(64),
    });
    expect(() => assertBrowserOnlyArchiveDelta(previous, changedCss, CANDIDATE_VERSION))
      .toThrow('non-browser module resource');

    const addedFile = archive(candidateManifest, {
      'midi-qol.js': 'F'.repeat(64),
      'new-runtime-file.js': '8'.repeat(64),
    });
    expect(() => assertBrowserOnlyArchiveDelta(previous, addedFile, CANDIDATE_VERSION))
      .toThrow('adds or removes files');

    const changedBehavior = { ...candidateManifest, esmodules: ['different-entry.js'] };
    expect(() => assertBrowserUpdateManifests(previousManifest, changedBehavior, CANDIDATE_VERSION))
      .toThrow('manifest semantics');
  });

  test('requires this round\'s exact local.8 candidate', () => {
    for (const version of ['14.6.0-beta.4338eeab.local.7', '14.6.0-beta.4338eeab.local.9']) {
      expect(() => assertBrowserUpdateManifests(previousManifest, {
        ...candidateManifest, version,
      }, version)).toThrow('requires 14.6.0-beta.4338eeab.local.8');
    }
  });
});

test('bounds a stalled ServerNext response body with the request timeout', async () => {
  const originalFetch = globalThis.fetch;
  let requestSignal: AbortSignal | undefined;
  globalThis.fetch = (async (_input, init) => {
    requestSignal = init?.signal as AbortSignal;
    return {
      ok: true,
      arrayBuffer: () => new Promise<ArrayBuffer>((_resolve, reject) => {
        const abortBody = () => reject(requestSignal?.reason ?? new Error('Request aborted.'));
        if (requestSignal?.aborted) abortBody();
        else requestSignal?.addEventListener('abort', abortBody, { once: true });
      }),
    } as unknown as Response;
  }) as typeof fetch;

  const startedAt = performance.now();
  try {
    await expect(fetchServedBundleSha256(50)).rejects.toThrow();
    expect(requestSignal?.aborted).toBe(true);
    expect(performance.now() - startedAt).toBeLessThan(1000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

describe('single-file atomic replacement primitive', () => {
  test('replaces only the intended file and returns its final hash without creating a backup', async () => {
    const root = resolve(tmpdir(), `midi-qol-browser-update-${crypto.randomUUID()}`);
    ownedRoots.push(root);
    await mkdir(root, { recursive: true });
    const path = resolve(root, 'midi-qol.js');
    await writeFile(path, 'old bundle');
    const beforeHash = createHash('sha256').update('old bundle').digest('hex').toUpperCase();
    const expectedAfterHash = createHash('sha256').update('new bundle').digest('hex').toUpperCase();

    await expect(replaceFileAtomically(path, '0'.repeat(64), new TextEncoder().encode('wrong'))).rejects.toThrow('changed');
    await expect(replaceFileAtomically(path, beforeHash, new TextEncoder().encode('new bundle')))
      .resolves.toBe(expectedAfterHash);
    expect(await readFile(path, 'utf8')).toBe('new bundle');
    expect(await readdir(root)).toEqual(['midi-qol.js']);
  });
});
