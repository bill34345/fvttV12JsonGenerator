import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { handleApiRequest, TEMP_WEB_DIR } from '../api';
import { resetJobsForTests } from '../jobs/jobStore';
import { resetRateLimitForTests } from '../security/rateLimit';

const SAMPLE_SOURCE = resolve(
  process.cwd(),
  'obsidian/dnd数据转fvttjson/input/alyxian-aboleth__底栖魔鱼“阿利克辛”.md',
);
const TEMP_TEST_DIR = resolve(process.cwd(), 'temp/web-tests');

beforeEach(() => {
  delete Bun.env.FVTT_WEB_ENABLE_PATH_MODE;
  resetJobsForTests();
  resetRateLimitForTests();
});

afterEach(() => {
  delete Bun.env.FVTT_WEB_ENABLE_PATH_MODE;
  delete Bun.env.TRANSLATION_API_KEY;
  delete Bun.env.OPENAI_API_KEY;
  resetJobsForTests();
  resetRateLimitForTests();
  rmSync(TEMP_TEST_DIR, { recursive: true, force: true });
  rmSync(TEMP_WEB_DIR, { recursive: true, force: true });
});

describe('web API', () => {
  it('returns local defaults', async () => {
    const response = await handleApiRequest(new Request('http://localhost/api/files/defaults'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.fvttVersion).toBe('12');
    expect(body.data.effectProfile).toBe('core');
    expect(body.data.outputDir).toContain('temp');
    expect(body.data.pathModeEnabled).toBe(false);
  });

  it('keeps workspace path mode disabled unless explicitly enabled', async () => {
    const response = await post('/api/files/read', { path: SAMPLE_SOURCE });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('PATH_MODE_DISABLED');
  });

  it('converts a workspace path to an explicit output file', async () => {
    Bun.env.FVTT_WEB_ENABLE_PATH_MODE = '1';
    const outputPath = join(TEMP_TEST_DIR, 'alyxian-output.json');
    const response = await post('/api/convert/path', {
      sourcePath: SAMPLE_SOURCE,
      outputPath,
      fvttVersion: '12',
      effectProfile: 'core',
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.kind).toBe('actor');
    expect(body.data.name).toContain('Alyxian');
    expect(body.data.itemCount).toBeGreaterThan(0);
    expect(body.data.outputPath).toBe(outputPath);
    expect(body.data.verification.actor.name).toBe(body.data.name);
    expect(existsSync(outputPath)).toBe(true);
  });

  it('reads a workspace markdown file for preview', async () => {
    Bun.env.FVTT_WEB_ENABLE_PATH_MODE = '1';
    const response = await post('/api/files/read', { path: SAMPLE_SOURCE });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.path).toBe(SAMPLE_SOURCE);
    expect(body.data.content).toContain('Alyxian');
  });

  it('converts uploaded markdown without writing the vault manifest', async () => {
    const manifestPath = resolve(process.cwd(), 'obsidian/dnd数据转fvttjson/.fvtt-sync-manifest.json');
    const before = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf-8') : null;
    const source = readFileSync(SAMPLE_SOURCE, 'utf-8');

    const response = await post('/api/convert/upload', {
      fileName: 'alyxian-upload.md',
      content: source,
      fvttVersion: '12',
      effectProfile: 'modded-v12',
    });
    const body = await response.json();
    const after = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf-8') : null;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.kind).toBe('actor');
    expect(body.data.effectProfile).toBe('modded-v12');
    expect(body.data.outputPath).toContain('temp');
    expect(after).toBe(before);
  });

  it('verifies source and actor JSON supplied inline', async () => {
    const source = readFileSync(SAMPLE_SOURCE, 'utf-8');
    const conversion = await (await post('/api/convert/upload', { fileName: 'inline.md', content: source })).json();

    const response = await post('/api/verify', {
      sourceContent: source,
      actorJson: conversion.data.rawJson,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.actor.name).toBe(conversion.data.name);
    expect(body.data.items.length).toBeGreaterThan(0);
  });

  it('keeps item markdown on the item generation route', async () => {
    Bun.env.FVTT_WEB_ENABLE_PATH_MODE = '1';
    const itemPath = resolve(process.cwd(), 'obsidian/dnd数据转fvttjson/input/items/骑士之盾.md');

    const response = await post('/api/convert/path', {
      sourcePath: itemPath,
      outputPath: join(TEMP_TEST_DIR, 'item.json'),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.kind).toBe('item');
    expect(body.data.verification).toBeNull();
  });

  it('rejects paths outside the workspace with a stable API error', async () => {
    Bun.env.FVTT_WEB_ENABLE_PATH_MODE = '1';
    const response = await post('/api/convert/path', {
      sourcePath: resolve(process.cwd(), '..', 'outside.md'),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('PATH_OUTSIDE_WORKSPACE');
    expect(body.error.detail).toBeUndefined();
  });

  it('rejects non-markdown uploads', async () => {
    const response = await post('/api/convert/upload', {
      fileName: 'payload.json',
      content: '{}',
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INVALID_UPLOAD_TYPE');
  });

  it('returns deploy-facing capabilities', async () => {
    const response = await handleApiRequest(new Request('http://localhost/api/capabilities'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.publicAccess).toBe(true);
    expect(body.data.limits.collectionUploadMb).toBe(20);
  });

  it('converts a single upload with a server download URL', async () => {
    const source = readFileSync(SAMPLE_SOURCE, 'utf-8');
    const response = await post('/api/convert/single', {
      fileName: 'single.md',
      content: source,
      fvttVersion: '12',
      effectProfile: 'core',
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.downloadUrl).toContain('/api/jobs/');

    const download = await handleApiRequest(new Request(`http://localhost${body.data.downloadUrl}`));
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toContain('application/json');
  });

  it('runs a monster collection job and downloads a zip', async () => {
    const collection = readFileSync(
      resolve(process.cwd(), 'obsidian/dnd数据转fvttjson/crawls/goddessfantasy/board-2318/plaintext/monsters.md'),
      'utf-8',
    );
    const firstTwoBlocks = collection.split(/\n(?=# \*\*)/).slice(0, 2).join('\n');
    const create = await post('/api/jobs', {
      type: 'monster-collection',
      fileName: 'monsters.md',
      content: firstTwoBlocks,
      options: {
        fvttVersion: '12',
        effectProfile: 'core',
      },
    });
    const created = await create.json();

    expect(create.status).toBe(200);
    expect(created.ok).toBe(true);

    const job = await waitForJob(created.data.id);
    expect(['succeeded', 'partial']).toContain(job.status);
    expect(job.files.length).toBeGreaterThan(0);

    const zip = await handleApiRequest(new Request(`http://localhost/api/jobs/${job.id}/download.zip`));
    const bytes = new Uint8Array(await zip.arrayBuffer());
    expect(zip.status).toBe(200);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it('fails translate-json clearly when the VPS has no translation key', async () => {
    const create = await post('/api/jobs', {
      type: 'translate-json',
      fileName: 'actor.json',
      content: '{"name":"Acolyte"}',
    });
    const created = await create.json();

    expect(create.status).toBe(200);
    const job = await waitForJob(created.data.id);
    expect(job.status).toBe('failed');
    expect(job.error.message).toContain('TRANSLATION_API_KEY');
  });
});

function post(path: string, body: unknown): Promise<Response> {
  return handleApiRequest(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

async function waitForJob(id: string): Promise<any> {
  for (let i = 0; i < 30; i++) {
    const response = await handleApiRequest(new Request(`http://localhost/api/jobs/${id}`));
    const body = await response.json();
    if (body.data.status === 'succeeded' || body.data.status === 'partial' || body.data.status === 'failed') {
      return body.data;
    }
    await Bun.sleep(50);
  }
  throw new Error(`Job did not finish: ${id}`);
}
