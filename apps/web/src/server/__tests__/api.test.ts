import { afterEach, beforeEach, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { handleApiRequest, TEMP_WEB_DIR } from '../api';
import {
  cleanupExpiredJobs,
  createJob,
  getJob,
  jobDir,
  jobInputDir,
  resetJobsForTests,
  runningJobsTotal,
  updateJob,
} from '../jobs/jobStore';
import { resetRateLimitForTests } from '../security/rateLimit';

const SAMPLE_SOURCE = resolve(
  process.cwd(),
  'obsidian/dnd数据转fvttjson/input/alyxian-aboleth__底栖魔鱼“阿利克辛”.md',
);
const TEMP_TEST_DIR = resolve(process.cwd(), 'temp/web-tests');

setDefaultTimeout(30_000);

beforeEach(() => {
  delete Bun.env.FVTT_WEB_PUBLIC_MODE;
  delete Bun.env.FVTT_WEB_HOST;
  delete Bun.env.FVTT_WEB_AUTH_TOKEN;
  delete Bun.env.FVTT_WEB_SESSION_SECRET;
  delete Bun.env.FVTT_WEB_TRUSTED_PROXIES;
  delete Bun.env.FVTT_WEB_SHORT_REQUEST_LIMIT;
  delete Bun.env.FVTT_WEB_GLOBAL_SHORT_REQUEST_LIMIT;
  delete Bun.env.FVTT_WEB_LONG_JOBS_PER_CLIENT;
  delete Bun.env.FVTT_WEB_GLOBAL_LONG_JOBS;
  delete Bun.env.FVTT_WEB_JOB_RETENTION_HOURS;
  delete Bun.env.FVTT_WEB_MAX_RETAINED_JOBS;
  delete Bun.env.FVTT_WEB_ENABLE_PATH_MODE;
  delete Bun.env.FVTT_WEB_CRAWL_OUT_DIR;
  delete Bun.env.GODDESSFANTASY_COOKIE;
  delete Bun.env.MONSTER_INTAKE_AUTH_MODE;
  delete Bun.env.MONSTER_INTAKE_API_KEY;
  delete Bun.env.MONSTER_INTAKE_BASE_URL;
  delete Bun.env.MONSTER_INTAKE_CODEX_OAUTH_BASE_URL;
  resetJobsForTests();
  resetRateLimitForTests();
});

afterEach(() => {
  delete Bun.env.FVTT_WEB_PUBLIC_MODE;
  delete Bun.env.FVTT_WEB_HOST;
  delete Bun.env.FVTT_WEB_AUTH_TOKEN;
  delete Bun.env.FVTT_WEB_SESSION_SECRET;
  delete Bun.env.FVTT_WEB_TRUSTED_PROXIES;
  delete Bun.env.FVTT_WEB_SHORT_REQUEST_LIMIT;
  delete Bun.env.FVTT_WEB_GLOBAL_SHORT_REQUEST_LIMIT;
  delete Bun.env.FVTT_WEB_LONG_JOBS_PER_CLIENT;
  delete Bun.env.FVTT_WEB_GLOBAL_LONG_JOBS;
  delete Bun.env.FVTT_WEB_JOB_RETENTION_HOURS;
  delete Bun.env.FVTT_WEB_MAX_RETAINED_JOBS;
  delete Bun.env.FVTT_WEB_ENABLE_PATH_MODE;
  delete Bun.env.TRANSLATION_API_KEY;
  delete Bun.env.OPENAI_API_KEY;
  delete Bun.env.FVTT_WEB_IMAGE_SSH_TARGET;
  delete Bun.env.FVTT_WEB_IMAGE_REMOTE_ROOT;
  delete Bun.env.FVTT_WEB_IMAGE_PUBLIC_BASE_URL;
  delete Bun.env.FVTT_WEB_IMAGE_ALLOW_HTTP;
  delete Bun.env.FVTT_WEB_IMAGE_TOKEN_FRAME;
  delete Bun.env.FVTT_WEB_CRAWL_OUT_DIR;
  delete Bun.env.GODDESSFANTASY_COOKIE;
  delete Bun.env.MONSTER_INTAKE_AUTH_MODE;
  delete Bun.env.MONSTER_INTAKE_API_KEY;
  delete Bun.env.MONSTER_INTAKE_BASE_URL;
  delete Bun.env.MONSTER_INTAKE_CODEX_OAUTH_BASE_URL;
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
    expect(body.data.fvttVersion).toBe('14');
    expect(body.data.effectProfile).toBe('core');
    expect(body.data.iconMode).toBe('off');
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
    expect(body.data.status).toBe('accepted');
    expect(body.data.verification.status).toBe('accepted');
    expect(body.data.actorVerification.actor.name).toBe(body.data.name);
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
    const manifestPath = resolve(
      process.cwd(),
      'obsidian/dnd数据转fvttjson/.fvtt-sync-manifest.json',
    );
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

  it('accepts Foundry v14 for uploaded markdown conversion', async () => {
    const source = readFileSync(SAMPLE_SOURCE, 'utf-8');

    const response = await post('/api/convert/upload', {
      fileName: 'alyxian-v14.md',
      content: source,
      fvttVersion: '14',
      effectProfile: 'core',
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.kind).toBe('actor');
    expect(body.data.fvttVersion).toBe('14');
  });

  it('exposes v14 safe icon results as an audit artifact without warnings', async () => {
    const source = readFileSync(SAMPLE_SOURCE, 'utf-8');

    const response = await post('/api/convert/upload', {
      fileName: 'alyxian-v14-icons.md',
      content: source,
      fvttVersion: '14',
      effectProfile: 'core',
      iconMode: 'safe',
    });
    const body = await response.json();
    const job = getJob(body.data.jobId);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.iconReview?.mode).toBe('safe');
    expect(body.data.iconReview?.summary.total).toBeGreaterThan(0);
    expect(body.data.iconReviewPath).toEndWith('.icon-review.json');
    expect(body.data.warnings).toEqual([]);
    expect(job?.files.map((file) => file.fileName)).toContain('alyxian-v14-icons.icon-review.json');
  });

  it('fails closed when safe icon mode is requested for v12', async () => {
    const source = readFileSync(SAMPLE_SOURCE, 'utf-8');

    const response = await post('/api/convert/upload', {
      fileName: 'alyxian-v12-icons.md',
      content: source,
      fvttVersion: '12',
      effectProfile: 'core',
      iconMode: 'safe',
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('JOB_FAILED');
  });

  it('accepts Foundry v14 modded profile for uploaded markdown conversion', async () => {
    const source = readFileSync(SAMPLE_SOURCE, 'utf-8');

    const response = await post('/api/convert/upload', {
      fileName: 'alyxian-v14-modded.md',
      content: source,
      fvttVersion: '14',
      effectProfile: 'modded-v14',
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.kind).toBe('actor');
    expect(body.data.fvttVersion).toBe('14');
    expect(body.data.effectProfile).toBe('modded-v14');
  });

  it('verifies source and actor JSON supplied inline', async () => {
    const source = readFileSync(SAMPLE_SOURCE, 'utf-8');
    const conversion = await (
      await post('/api/convert/upload', {
        fileName: 'inline.md',
        content: source,
      })
    ).json();

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
    expect(body.data.verification.status).toBe('accepted');
    expect(body.data.actorVerification).toBeNull();
    expect(body.data.diagnostics).toEqual([]);
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

  it('detects standard Actor and Item Markdown without starting a job', async () => {
    const actorResponse = await post('/api/conversions/detect', {
      fileName: 'actor.md',
      content: readFileSync(
        resolve(process.cwd(), 'obsidian/dnd数据转fvttjson/input/bonebreaker-dorokor.md'),
        'utf-8',
      ),
    });
    const actorBody = await actorResponse.json();
    const itemResponse = await post('/api/conversions/detect', {
      fileName: 'item.md',
      content: readFileSync(
        resolve(process.cwd(), 'obsidian/dnd数据转fvttjson/input/items/骑士之盾.md'),
        'utf-8',
      ),
    });
    const itemBody = await itemResponse.json();

    expect(actorBody.data).toMatchObject({
      route: 'single',
      contentKind: 'actor',
      confidence: 'high',
      usesAi: false,
    });
    expect(itemBody.data).toMatchObject({
      route: 'single',
      contentKind: 'item',
      confidence: 'high',
      usesAi: false,
    });
    expect(runningJobsTotal()).toBe(0);
  });

  it('detects collections and keeps AI-only input as an explicit recommendation', async () => {
    const collectionResponse = await post('/api/conversions/detect', {
      fileName: 'monsters.md',
      content: readFileSync(resolve(process.cwd(), 'tests/fixtures/collection-input.md'), 'utf-8'),
    });
    const collectionBody = await collectionResponse.json();
    const rawResponse = await post('/api/conversions/detect', {
      fileName: 'raw.txt',
      content: [
        'Ash Drake',
        'Armor Class 17',
        'Hit Points 120',
        'Challenge 8',
        'STR: 20 DEX: 12 CON: 18 INT: 6 WIS: 13 CHA: 9',
        '## Actions',
      ].join('\n'),
    });
    const rawBody = await rawResponse.json();

    expect(collectionBody.data.route).toBe('monster-collection');
    expect(collectionBody.data.itemCount).toBeGreaterThan(1);
    expect(rawBody.data).toMatchObject({
      route: 'ai-monster-intake',
      contentKind: 'actor',
      usesAi: true,
    });
    expect(runningJobsTotal()).toBe(0);
  });

  it('returns needs-review instead of guessing an ambiguous text route', async () => {
    const response = await post('/api/conversions/detect', {
      fileName: 'notes.txt',
      content: '这是一段还没有整理完成的资料。',
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      route: 'needs-review',
      contentKind: 'unknown',
      confidence: 'low',
      usesAi: false,
    });
    expect(runningJobsTotal()).toBe(0);
  });

  it('accepts binary document uploads, validates the signature, and keeps the source in the job sandbox', async () => {
    const form = new FormData();
    form.append(
      'file',
      new File([minimalPdfBytes()], '../../tiny.pdf', {
        type: 'application/pdf',
      }),
    );
    form.append('extractOnly', 'true');
    form.append('engine', 'native');

    const response = await handleApiRequest(
      new Request('http://localhost/api/documents/convert', {
        method: 'POST',
        body: form,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.type).toBe('document-convert');
    expect(body.data.files.every((file: { path: string }) => file.path === '')).toBe(true);

    const job = await waitForJob(body.data.id);
    expect(job.type).toBe('document-convert');
    expect(job.summary?.pageCount).toBe(1);
    expect(existsSync(join(jobInputDir(job.id), 'tiny.pdf'))).toBe(true);
  });

  it('rejects a PDF upload whose binary signature is not PDF', async () => {
    const form = new FormData();
    form.append('file', new File(['not a pdf'], 'bad.pdf', { type: 'application/pdf' }));

    const response = await handleApiRequest(
      new Request('http://localhost/api/documents/convert', {
        method: 'POST',
        body: form,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INVALID_DOCUMENT_SIGNATURE');
  });

  it('rejects a PNG upload whose binary signature is actually PDF', async () => {
    const form = new FormData();
    form.append('file', new File([minimalPdfBytes()], 'wrong.png', { type: 'image/png' }));

    const response = await handleApiRequest(
      new Request('http://localhost/api/documents/convert', {
        method: 'POST',
        body: form,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INVALID_DOCUMENT_SIGNATURE');
  });

  it('returns deploy-facing capabilities', async () => {
    const response = await handleApiRequest(new Request('http://localhost/api/capabilities'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.publicAccess).toBe(false);
    expect(body.data.authenticationRequired).toBe(false);
    expect(body.data.deploymentMode).toBe('local');
    expect(body.data.monsterIntakeAuthMode).toBe(null);
    expect(body.data.limits.collectionUploadMb).toBe(20);
    expect(body.data.limits.requestBodyMb).toBe(25);
    expect(body.data.limits.globalShortRequestsPerMinute).toBe(100);
    expect(body.data.limits.globalLongJobs).toBe(4);
    expect(body.data.limits.maxRetainedJobs).toBe(100);
    expect(body.data.imageMode).toBe('ssh');
    expect(body.data.imageAssetsConfigured).toBe(false);
    expect(body.data.imageSshTarget).toBe('');
    expect(body.data.imagePublicBaseUrl).toBe('');
    expect(body.data.imageAllowHttp).toBe(false);
    expect(body.data.imageTokenSize).toBe(1024);
    expect(body.data.imageTokenFormat).toBe('webp');
    expect(body.data.imageTokenFrameConfigured).toBe(true);
  });

  it('requires the configured bearer token before public-mode API work', async () => {
    Bun.env.FVTT_WEB_PUBLIC_MODE = '1';
    Bun.env.FVTT_WEB_AUTH_TOKEN = '0123456789abcdef0123456789abcdef';
    Bun.env.FVTT_WEB_SESSION_SECRET = 'abcdef0123456789abcdef0123456789';

    const missing = await handleApiRequest(new Request('http://localhost/api/capabilities'));
    const missingBody = await missing.json();
    expect(missing.status).toBe(401);
    expect(missingBody.error.code).toBe('AUTH_REQUIRED');

    const wrong = await handleApiRequest(
      new Request('http://localhost/api/capabilities', {
        headers: { authorization: 'Bearer wrong-token' },
      }),
    );
    expect(wrong.status).toBe(401);

    const accepted = await handleApiRequest(
      new Request('http://localhost/api/capabilities', {
        headers: { authorization: 'Bearer 0123456789abcdef0123456789abcdef' },
      }),
    );
    const acceptedBody = await accepted.json();
    expect(accepted.status).toBe(200);
    expect(acceptedBody.data.publicAccess).toBe(true);
    expect(acceptedBody.data.authenticationRequired).toBe(true);
    expect(acceptedBody.data.deploymentMode).toBe('public');
  });

  it('does not let forged forwarded headers split a direct client rate bucket', async () => {
    Bun.env.FVTT_WEB_SHORT_REQUEST_LIMIT = '1';
    Bun.env.FVTT_WEB_GLOBAL_SHORT_REQUEST_LIMIT = '10';

    const first = await handleApiRequest(
      new Request('http://localhost/api/not-a-route', {
        method: 'POST',
        headers: { 'x-forwarded-for': '198.51.100.10' },
      }),
      { remoteAddress: '203.0.113.8' },
    );
    const second = await handleApiRequest(
      new Request('http://localhost/api/not-a-route', {
        method: 'POST',
        headers: { 'x-forwarded-for': '198.51.100.11' },
      }),
      { remoteAddress: '203.0.113.8' },
    );
    const secondBody = await second.json();

    expect(first.status).toBe(404);
    expect(second.status).toBe(429);
    expect(secondBody.error.code).toBe('RATE_LIMITED');
  });

  it('rejects an oversized declared body before materializing request text', async () => {
    let textCalled = false;
    const request = {
      method: 'POST',
      url: 'http://localhost/api/convert/upload',
      headers: new Headers({
        'content-type': 'application/json',
        'content-length': String(25 * 1024 * 1024 + 1),
      }),
      async text() {
        textCalled = true;
        return '{}';
      },
    } as Request;

    const response = await handleApiRequest(request, {
      remoteAddress: '127.0.0.1',
    });
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error.code).toBe('REQUEST_BODY_TOO_LARGE');
    expect(textCalled).toBe(false);
  });

  it('rejects malformed content-length before reading the body', async () => {
    let textCalled = false;
    const request = {
      method: 'POST',
      url: 'http://localhost/api/convert/upload',
      headers: new Headers({
        'content-type': 'application/json',
        'content-length': 'not-a-number',
      }),
      async text() {
        textCalled = true;
        return '{}';
      },
    } as Request;

    const response = await handleApiRequest(request, {
      remoteAddress: '127.0.0.1',
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_CONTENT_LENGTH');
    expect(textCalled).toBe(false);
  });

  it('enforces a global long-job cap across client identities', async () => {
    Bun.env.FVTT_WEB_GLOBAL_LONG_JOBS = '1';
    const blocker = createJob('monster-collection', '198.51.100.1');
    updateJob(blocker.id, { status: 'running' });

    const response = await handleApiRequest(
      new Request('http://localhost/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'monster-collection',
          fileName: 'second.md',
          content: '# **Second Creature**',
        }),
      }),
      { remoteAddress: '198.51.100.2' },
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.code).toBe('GLOBAL_JOB_CONCURRENCY_LIMIT');
  });

  it('keeps active jobs while removing expired and excess terminal jobs', () => {
    const active = createJob('monster-collection', 'active-client');
    updateJob(active.id, { status: 'running' });
    const expired = createJob('monster-collection', 'expired-client');
    updateJob(expired.id, { status: 'succeeded' });
    const older = createJob('monster-collection', 'older-client');
    updateJob(older.id, { status: 'succeeded' });
    const newest = createJob('monster-collection', 'newest-client');
    updateJob(newest.id, { status: 'succeeded' });

    const nowSeconds = Date.now() / 1000;
    utimesSync(join(jobDir(expired.id), 'result.json'), nowSeconds - 10_000, nowSeconds - 10_000);
    utimesSync(join(jobDir(older.id), 'result.json'), nowSeconds - 100, nowSeconds - 100);
    utimesSync(join(jobDir(newest.id), 'result.json'), nowSeconds - 10, nowSeconds - 10);

    const removed = cleanupExpiredJobs(1_000_000, 1);

    expect(removed).toBe(2);
    expect(getJob(active.id)?.status).toBe('running');
    expect(getJob(expired.id)).toBeUndefined();
    expect(getJob(older.id)).toBeUndefined();
    expect(getJob(newest.id)?.status).toBe('succeeded');
  });

  it('does not treat a persisted pre-restart running status as a live process job', () => {
    const stale = createJob('monster-collection', 'stale-client');
    updateJob(stale.id, { status: 'running' });
    expect(runningJobsTotal()).toBe(1);

    resetJobsForTests({ preserveFiles: true });
    expect(getJob(stale.id)?.status).toBe('running');
    expect(runningJobsTotal()).toBe(0);
  });

  it('defaults a single upload to Foundry v14/core and returns a server download URL', async () => {
    const source = readFileSync(SAMPLE_SOURCE, 'utf-8');
    const response = await post('/api/convert/single', {
      fileName: 'single.md',
      content: source,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.fvttVersion).toBe('14');
    expect(body.data.effectProfile).toBe('core');
    expect(body.data.downloadUrl).toContain('/api/jobs/');

    const download = await handleApiRequest(
      new Request(`http://localhost${body.data.downloadUrl}`),
    );
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toContain('application/json');
    const actor = await download.json();
    expect(actor._stats.coreVersion).toBe('14.364');
    expect(actor._stats.systemVersion).toBe('5.3.3');
  });

  it('keeps ordinary Web conversion offline when ambient translation credentials exist', async () => {
    const previousFetch = globalThis.fetch;
    Bun.env.TRANSLATION_API_KEY = 'ambient-key-must-not-opt-in';
    Bun.env.TRANSLATION_BASE_URL = 'https://translation.invalid/v1';
    Bun.env.TRANSLATION_CACHE_FILE = join(TEMP_TEST_DIR, 'translation-cache.json');
    let networkCalls = 0;

    try {
      globalThis.fetch = (async () => {
        networkCalls += 1;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '<think>provider reasoning</think>网络翻译',
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }) as unknown as typeof fetch;

      const response = await post('/api/convert/single', {
        fileName: 'deterministic.md',
        content: [
          '---',
          'layout: creature',
          'name: Deterministic Web Fixture',
          'armor_class: 12',
          'hit_points: 10 (3d6)',
          '---',
          '### Actions',
          '**Deterministic Strike.** Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.',
        ].join('\n'),
        fvttVersion: '14',
        effectProfile: 'core',
      });
      const body = await response.json();
      const download = await handleApiRequest(
        new Request(`http://localhost${body.data.downloadUrl}`),
      );
      const actor = await download.json();

      expect(response.status).toBe(200);
      expect(networkCalls).toBe(0);
      expect(actor.name).toBe('Deterministic Web Fixture');
      expect(actor.items.map((item: { name: string }) => item.name)).toContain(
        'Deterministic Strike',
      );
    } finally {
      globalThis.fetch = previousFetch;
      delete Bun.env.TRANSLATION_BASE_URL;
      delete Bun.env.TRANSLATION_CACHE_FILE;
    }
  });

  it('runs a monster collection job and downloads a zip', async () => {
    const firstTwoBlocks = [
      '# **Archive Test Wight**',
      '',
      '_Medium Undead, Neutral Evil_',
      '',
      '**Armor Class**: 14',
      '**Hit Points**: 45 (6d8+18)',
      '**Speed**: 30 ft.',
      '**Challenge**: 3 (700 XP) Proficiency Bonus +2',
      '',
      '### Actions',
      '',
      '- **Life Drain**: Melee Weapon Attack: +4 to hit, reach 5 ft. Hit: 8 (1d8+4) necrotic damage.',
      '',
      '# **Archive Test Ooze**',
      '',
      '_Large Ooze, Unaligned_',
      '',
      '**Armor Class**: 8',
      '**Hit Points**: 52 (7d10+14)',
      '**Speed**: 20 ft., climb 20 ft.',
      '**Challenge**: 2 (450 XP) Proficiency Bonus +2',
      '',
      '### Actions',
      '',
      '- **Pseudopod**: Melee Weapon Attack: +4 to hit, reach 5 ft. Hit: 9 (2d6+2) bludgeoning damage.',
    ].join('\n');
    const create = await post('/api/jobs', {
      type: 'monster-collection',
      fileName: 'monsters.md',
      content: firstTwoBlocks,
      options: {
        fvttVersion: '14',
        effectProfile: 'modded-v14',
      },
    });
    const created = await create.json();

    expect(create.status).toBe(200);
    expect(created.ok).toBe(true);

    const job = await waitForJob(created.data.id);
    expect(['succeeded', 'partial']).toContain(job.status);
    expect(job.summary.fvttVersion).toBe('14');
    expect(job.summary.effectProfile).toBe('modded-v14');
    expect(job.files.length).toBeGreaterThan(0);

    const zip = await handleApiRequest(
      new Request(`http://localhost/api/jobs/${job.id}/download.zip`),
    );
    const bytes = new Uint8Array(await zip.arrayBuffer());
    expect(zip.status).toBe(200);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it('rejects removed legacy plaintext Actor jobs', async () => {
    const response = await post('/api/jobs', {
      type: 'ingest-plaintext-actors',
      fileName: 'no-image.md',
      content: '# legacy plaintext',
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INVALID_JOB_TYPE');
  });

  it('labels records plaintext output as an audit artifact that cannot feed JSON generation', async () => {
    const recordsPath = resolve(
      process.cwd(),
      'src/core/crawl/__tests__/fixtures/goddessfantasy-records.json',
    );
    const create = await post('/api/jobs', {
      type: 'records-to-plaintext',
      fileName: 'records.json',
      content: readFileSync(recordsPath, 'utf-8'),
      options: { contentType: 'monster', dryRun: true },
    });
    const created = await create.json();

    expect(create.status).toBe(200);
    const job = await waitForJob(created.data.id);
    expect(job.status).toBe('succeeded');
    expect(job.summary?.artifactRole).toBe('audit-only');
    expect(job.summary?.feedsJsonGeneration).toBe(false);
  });

  it('passes server-preset image assets to vault sync jobs only when enabled', async () => {
    configureImageAssetTestPreset();
    const vaultPath = join(TEMP_TEST_DIR, 'vault');
    const inputDir = join(vaultPath, 'input');
    mkdirSync(inputDir, { recursive: true });
    writeFileSync(
      join(inputDir, 'no-image.md'),
      readFileSync(resolve(process.cwd(), 'templates/npc-example.md'), 'utf-8'),
    );

    const create = await post('/api/jobs', {
      type: 'vault-sync',
      options: {
        vaultPath,
        fvttVersion: '12',
        effectProfile: 'core',
        imageAssetsEnabled: true,
      },
    });
    const created = await create.json();

    expect(create.status).toBe(200);
    expect(created.ok).toBe(true);

    const job = await waitForJob(created.data.id);
    expect(job.status).toBe('succeeded');
    expect(job.summary.imageMode).toBe('ssh');
    expect(job.summary.imagePublicBaseUrl).toBe('https://assets.example.invalid/imgSource');
    expect(job.summary.imageWarnings).toBe(0);
    expect(job.files.some((file: any) => file.fileName.endsWith('.json'))).toBe(true);
  });

  it('rejects invalid GoddessFantasy crawl mode with a stable error', async () => {
    const response = await post('/api/jobs', {
      type: 'goddessfantasy-board-crawl',
      options: {
        boardUrl: 'https://www.goddessfantasy.net/bbs/index.php?board=2318.0',
        crawlMode: 'refresh-old',
      },
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INVALID_CRAWL_MODE');
  });

  it('runs GoddessFantasy incremental crawl jobs in the fixed crawl output flow', async () => {
    const outDir = join(TEMP_TEST_DIR, 'crawl-incremental');
    const requestedPrintTopics: string[] = [];
    const server = createCrawlFixtureServer(['100', '101', '102'], requestedPrintTopics);

    try {
      Bun.env.FVTT_WEB_CRAWL_OUT_DIR = outDir;
      Bun.env.GODDESSFANTASY_COOKIE = 'PHPSESSID=test';
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        join(outDir, 'records.json'),
        `${JSON.stringify([crawlRecordFixture('100'), crawlRecordFixture('101')], null, 2)}\n`,
        'utf-8',
      );

      const create = await post('/api/jobs', {
        type: 'goddessfantasy-board-crawl',
        options: {
          boardUrl: crawlBoardUrl(server.port!),
          crawlMode: 'incremental',
          contentType: 'monster',
          maxBoardPages: 1,
          skipAuthProbe: true,
          requestDelayMs: 0,
        },
      });
      const created = await create.json();
      const job = await waitForJob(created.data.id);

      expect(job.status).toBe('succeeded');
      expect(job.summary.mode).toBe('incremental');
      expect(job.summary.topicsReused).toBe(2);
      expect(job.summary.topicsCrawled).toBe(1);
      expect(job.summary.recordsAfter).toBe(3);
      expect(requestedPrintTopics).toEqual(['102']);
      expect(job.files.some((file: any) => file.fileName === 'records.json')).toBe(true);
    } finally {
      server.stop(true);
    }
  });

  it('runs GoddessFantasy full crawl jobs without reusing old records', async () => {
    const outDir = join(TEMP_TEST_DIR, 'crawl-full');
    const requestedPrintTopics: string[] = [];
    const server = createCrawlFixtureServer(['100', '101'], requestedPrintTopics);

    try {
      Bun.env.FVTT_WEB_CRAWL_OUT_DIR = outDir;
      Bun.env.GODDESSFANTASY_COOKIE = 'PHPSESSID=test';
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        join(outDir, 'records.json'),
        `${JSON.stringify([crawlRecordFixture('100')], null, 2)}\n`,
        'utf-8',
      );

      const create = await post('/api/jobs', {
        type: 'goddessfantasy-board-crawl',
        options: {
          boardUrl: crawlBoardUrl(server.port!),
          crawlMode: 'full',
          contentType: 'monster',
          maxBoardPages: 1,
          skipAuthProbe: true,
          requestDelayMs: 0,
        },
      });
      const created = await create.json();
      const job = await waitForJob(created.data.id);

      expect(job.status).toBe('succeeded');
      expect(job.summary.mode).toBe('full');
      expect(job.summary.topicsReused).toBe(0);
      expect(job.summary.topicsCrawled).toBe(2);
      expect(job.summary.recordsBefore).toBe(0);
      expect(job.summary.recordsAfter).toBe(2);
      expect(requestedPrintTopics.sort()).toEqual(['100', '101']);
    } finally {
      server.stop(true);
    }
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

function configureImageAssetTestPreset(): void {
  Bun.env.FVTT_WEB_IMAGE_SSH_TARGET = 'test-user@example.invalid';
  Bun.env.FVTT_WEB_IMAGE_REMOTE_ROOT = 'X:/FoundryAssets';
  Bun.env.FVTT_WEB_IMAGE_PUBLIC_BASE_URL = 'https://assets.example.invalid/imgSource';
  Bun.env.FVTT_WEB_IMAGE_ALLOW_HTTP = '0';
}

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
    if (
      body.data.status === 'succeeded' ||
      body.data.status === 'partial' ||
      body.data.status === 'failed'
    ) {
      return body.data;
    }
    await Bun.sleep(50);
  }
  throw new Error(`Job did not finish: ${id}`);
}

function createCrawlFixtureServer(
  topicIds: string[],
  requestedPrintTopics: string[],
): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.search.includes('action=printpage')) {
        const topicId = url.search.match(/topic=(\d+)/)?.[1] ?? 'unknown';
        requestedPrintTopics.push(topicId);
        return htmlResponse(
          [
            '<html><body><div id="posts">',
            `<div class="postheader">标题: 【怪物】Topic ${topicId} 作者: Tester 于 2026-06-20</div>`,
            `<div class="postbody">Topic ${topicId} Medium aberration AC 12 HP 22</div>`,
            '</div></body></html>',
          ].join(''),
        );
      }
      return htmlResponse(
        [
          '<html><body>',
          ...topicIds.map((topicId) =>
            [
              '<div class="windowbg"><span class="subject">',
              `<a href="${url.origin}/bbs/index.php?topic=${topicId}.0">【怪物】Topic ${topicId}</a>`,
              '</span></div>',
            ].join(''),
          ),
          '</body></html>',
        ].join(''),
      );
    },
  });
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function crawlBoardUrl(port: number): string {
  return `http://127.0.0.1:${port}/bbs/index.php?board=2318.0`;
}

function crawlRecordFixture(topicId: string): Record<string, unknown> {
  return {
    site: 'goddessfantasy',
    boardId: '2318',
    topicId,
    title: `Topic ${topicId}`,
    url: `https://example.test/bbs/index.php?topic=${topicId}.0`,
    classification: {
      contentType: 'monster',
      classificationSource: 'title-prefix',
      matchedPrefix: '【怪物】',
    },
    printUrl: `https://example.test/bbs/index.php?action=printpage;topic=${topicId}.0`,
    rawHtmlPath: `html/topic-${topicId}.print.html`,
    crawledAt: '2026-06-20T00:00:00.000Z',
    imageUrls: [],
    posts: [
      {
        index: 0,
        title: `Topic ${topicId}`,
        author: 'Tester',
        postedAt: '2026-06-20',
        text: `Topic ${topicId} AC 12 HP 22`,
        imageUrls: [],
      },
    ],
  };
}

function minimalPdfBytes(): ArrayBuffer {
  const content =
    'BT /F1 12 Tf 10 80 Td (Fixture document text for native extraction validation. This page intentionally contains enough text to avoid OCR fallback. The document input route is being tested.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf).buffer as ArrayBuffer;
}
