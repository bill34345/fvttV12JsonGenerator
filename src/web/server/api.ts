import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import type { EffectProfile } from '../../core/generator/effectProfileApplier';
import {
  DEFAULT_VAULT_PATH,
  convertMarkdownPathToOutput,
  type ConversionResult,
  type FvttTargetVersion,
} from '../../core/workflow/singleFileConversion';
import { buildActorVerificationSummaryFromValues } from '../../tools/actorVerification';
import { createZipBuffer } from './download/zip';
import {
  cleanupExpiredJobs,
  createJob,
  getJob,
  runningJobsForIp,
  runningJobsTotal,
  type WebJob,
  type WebJobType,
} from './jobs/jobStore';
import { runJob, startJob, type WebJobRequest } from './jobs/jobRunner';
import { getWebImageAssetPreset } from './imageAssetPreset';
import { resolveWorkspacePath, TEMP_WEB_DIR, WORKSPACE_ROOT } from './paths';
import { checkShortRateLimit, getClientIp } from './security/rateLimit';
import { assertEffectProfileForTarget, parseFvttTargetVersion } from '../../core/foundryTarget';
import {
  getWebSecurityConfig,
  isAuthorizedApiRequest,
  type WebSecurityConfig,
} from './security/config';

export { TEMP_WEB_DIR, WORKSPACE_ROOT } from './paths';

type ApiSuccess<T> = { ok: true; data: T };
type ApiFailure = { ok: false; error: { code: string; message: string; detail?: string } };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

interface ConvertBody {
  fileName?: string;
  content?: string;
  fvttVersion?: FvttTargetVersion;
  effectProfile?: EffectProfile;
}

interface ConvertPathBody {
  sourcePath?: string;
  outputPath?: string;
  fvttVersion?: FvttTargetVersion;
  effectProfile?: EffectProfile;
}

interface VerifyBody {
  sourcePath?: string;
  sourceContent?: string;
  actorPath?: string;
  actorJson?: unknown;
}

interface ReadFileBody {
  path?: string;
}

const singleUploadLimitBytes = 5 * 1024 * 1024;
const collectionUploadLimitBytes = 20 * 1024 * 1024;
const publicJobTypes = new Set<WebJobType>([
  'monster-collection',
  'item-collection',
  'vault-sync',
  'translate-json',
  'ingest-plaintext',
  'ingest-plaintext-actors',
  'ingest-items',
  'goddessfantasy-board-crawl',
  'records-to-plaintext',
]);

cleanupExpiredJobs();

export interface ApiRequestContext {
  remoteAddress?: string | null;
  securityConfig?: WebSecurityConfig;
}

export async function handleApiRequest(
  request: Request,
  context: ApiRequestContext = {},
): Promise<Response> {
  const url = new URL(request.url);
  const pathModeEnabled = isPathModeEnabled();

  try {
    const securityConfig = context.securityConfig ?? getWebSecurityConfig();
    if (!isAuthorizedApiRequest(request, securityConfig)) {
      return jsonFailure(401, 'AUTH_REQUIRED', 'Authentication is required.');
    }
    const clientIp = getClientIp(request, {
      remoteAddress: context.remoteAddress,
      trustedProxies: securityConfig.trustedProxies,
    });

    if (request.method !== 'GET' && !checkShortRateLimit(clientIp, {
      clientLimit: securityConfig.shortRequestsPerMinute,
      globalLimit: securityConfig.globalShortRequestsPerMinute,
    })) {
      throw userError('RATE_LIMITED', '请求过于频繁，请稍后再试。', 429);
    }

    if (request.method === 'GET' && url.pathname === '/api/capabilities') {
      const imagePreset = getWebImageAssetPreset();
      return jsonSuccess({
        pathModeEnabled,
        translationConfigured: Boolean(Bun.env.TRANSLATION_API_KEY || Bun.env.OPENAI_API_KEY),
        goddessFantasyCookieConfigured: Boolean(Bun.env.GODDESSFANTASY_COOKIE),
        goddessFantasyLoginConfigured: Boolean(Bun.env.GODDESSFANTASY_USERNAME && Bun.env.GODDESSFANTASY_PASSWORD),
        imageAssetsConfigured: imagePreset.imageAssetsConfigured,
        imageMode: imagePreset.imageMode,
        imageSshTarget: imagePreset.imageSshTarget,
        imageRemoteRoot: imagePreset.imageRemoteRoot,
        imagePublicBaseUrl: imagePreset.imagePublicBaseUrl,
        imageAllowHttp: imagePreset.imageAllowHttp,
        imageActorDir: imagePreset.imageActorDir,
        imageTokenDir: imagePreset.imageTokenDir,
        imageTokenFrame: imagePreset.imageTokenFrame,
        imageTokenFrameConfigured: imagePreset.imageTokenFrameConfigured,
        imageTokenSize: imagePreset.imageTokenSize,
        imageTokenFormat: imagePreset.imageTokenFormat,
        limits: {
          singleUploadMb: 5,
          collectionUploadMb: 20,
          requestBodyMb: securityConfig.maxRequestBodyBytes / 1024 / 1024,
          shortRequestsPerMinute: securityConfig.shortRequestsPerMinute,
          globalShortRequestsPerMinute: securityConfig.globalShortRequestsPerMinute,
          longJobsPerIp: securityConfig.longJobsPerClient,
          globalLongJobs: securityConfig.globalLongJobs,
          tempRetentionHours: securityConfig.retentionMs / 60 / 60 / 1000,
          maxRetainedJobs: securityConfig.maxRetainedJobs,
        },
        publicAccess: securityConfig.publicMode,
        authenticationRequired: securityConfig.publicMode,
        deploymentMode: securityConfig.publicMode ? 'public' : 'local',
      });
    }

    if (request.method === 'GET' && url.pathname === '/api/files/defaults') {
      return jsonSuccess({
        workspaceRoot: pathModeEnabled ? WORKSPACE_ROOT : '',
        vaultPath: pathModeEnabled ? resolveWorkspacePath(DEFAULT_VAULT_PATH) : '',
        inputDir: pathModeEnabled ? resolveWorkspacePath(join(DEFAULT_VAULT_PATH, 'input')) : '',
        outputDir: pathModeEnabled ? resolveWorkspacePath(join(DEFAULT_VAULT_PATH, 'output')) : TEMP_WEB_DIR,
        effectProfile: 'core' satisfies EffectProfile,
        fvttVersion: '12' satisfies FvttTargetVersion,
        sampleSourcePath: pathModeEnabled
          ? resolveWorkspacePath(join(DEFAULT_VAULT_PATH, 'input', 'alyxian-aboleth__底栖魔鱼“阿利克辛”.md'))
          : '',
        pathModeEnabled,
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/files/read') {
      if (!pathModeEnabled) throw userError('PATH_MODE_DISABLED', '服务器路径模式未启用。');
      const body = await readJsonBody<ReadFileBody>(request, securityConfig.maxRequestBodyBytes);
      if (!body.path) throw userError('MISSING_PATH', 'path is required.');
      return jsonSuccess({
        path: resolveWorkspacePath(body.path),
        content: readWorkspaceText(body.path),
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/convert/path') {
      if (!pathModeEnabled) throw userError('PATH_MODE_DISABLED', '服务器路径模式未启用。');
      const body = await readJsonBody<ConvertPathBody>(request, securityConfig.maxRequestBodyBytes);
      if (!body.sourcePath) throw userError('MISSING_SOURCE_PATH', 'sourcePath is required.');
      assertApiWorkspacePath(body.sourcePath);
      if (body.outputPath) assertApiWorkspacePath(body.outputPath);

      const fvttVersion = normalizeFvttVersion(body.fvttVersion);
      const result = await convertMarkdownPathToOutput({
        sourcePath: body.sourcePath,
        outputPath: body.outputPath,
        vaultPath: DEFAULT_VAULT_PATH,
        fvttVersion,
        effectProfile: normalizeEffectProfile(body.effectProfile, fvttVersion),
      });
      return jsonSuccess(result);
    }

    if (request.method === 'POST' && (url.pathname === '/api/convert/single' || url.pathname === '/api/convert/upload')) {
      const body = await readJsonBody<ConvertBody>(request, securityConfig.maxRequestBodyBytes);
      validateUpload(body.fileName, body.content, singleUploadLimitBytes, ['.md', '.markdown', '.txt']);
      const fvttVersion = normalizeFvttVersion(body.fvttVersion);
      const job = createJob('single-convert', clientIp);
      await runJob(job, {
        type: 'single-convert',
        fileName: body.fileName,
        content: body.content,
        options: {
          fvttVersion,
          effectProfile: normalizeEffectProfile(body.effectProfile, fvttVersion),
        },
      });
      const finished = getRequiredJob(job.id);
      if (finished.status === 'failed') {
        throw userError(finished.error?.code ?? 'CONVERT_FAILED', finished.error?.message ?? '转换失败。');
      }
      return jsonSuccess(toSingleConversionPayload(finished));
    }

    if (request.method === 'POST' && url.pathname === '/api/jobs') {
      const body = await readJsonBody<WebJobRequest>(request, securityConfig.maxRequestBodyBytes);
      if (!publicJobTypes.has(body.type)) {
        throw userError('INVALID_JOB_TYPE', `Unsupported job type: ${String(body.type)}`);
      }
      cleanupExpiredJobs(securityConfig.retentionMs, securityConfig.maxRetainedJobs);
      if (runningJobsForIp(clientIp) >= securityConfig.longJobsPerClient) {
        throw userError(
          'JOB_CONCURRENCY_LIMIT',
          `同一客户端只能同时运行 ${securityConfig.longJobsPerClient} 个长任务。`,
          429,
        );
      }
      if (runningJobsTotal() >= securityConfig.globalLongJobs) {
        throw userError('GLOBAL_JOB_CONCURRENCY_LIMIT', 'Server long-job capacity is currently full.', 429);
      }
      validateJobInput(body);
      const job = createJob(body.type, clientIp);
      startJob(job, body);
      return jsonSuccess(publicJob(getRequiredJob(job.id)));
    }

    const jobMatch = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]{36})$/i);
    if (request.method === 'GET' && jobMatch?.[1]) {
      return jsonSuccess(publicJob(getRequiredJob(jobMatch[1])));
    }

    const downloadMatch = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]{36})\/download\/([^/]+)$/i);
    if (request.method === 'GET' && downloadMatch?.[1] && downloadMatch[2]) {
      const job = getRequiredJob(downloadMatch[1]);
      const fileId = decodeURIComponent(downloadMatch[2]);
      const file = job.files.find((item) => item.id === fileId);
      if (!file || !existsSync(file.path)) {
        throw userError('DOWNLOAD_NOT_FOUND', '下载文件不存在。', 404);
      }
      return new Response(Bun.file(file.path), {
        headers: {
          'content-type': file.contentType,
          'content-disposition': contentDisposition(file.fileName),
        },
      });
    }

    const zipMatch = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]{36})\/download\.zip$/i);
    if (request.method === 'GET' && zipMatch?.[1]) {
      const job = getRequiredJob(zipMatch[1]);
      const files = job.files.filter((file) => existsSync(file.path));
      if (files.length === 0) {
        throw userError('NO_DOWNLOADABLE_FILES', '这个任务没有可下载产物。', 404);
      }
      const zip = createZipBuffer(files.map((file) => ({ path: file.path, fileName: file.fileName })));
      return new Response(new Uint8Array(zip), {
        headers: {
          'content-type': 'application/zip',
          'content-disposition': contentDisposition(`${job.type}-${job.id}.zip`),
        },
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/verify') {
      const body = await readJsonBody<VerifyBody>(request, securityConfig.maxRequestBodyBytes);
      const source = body.sourceContent ?? (body.sourcePath ? readWorkspaceText(body.sourcePath) : undefined);
      const actor = body.actorJson ?? (body.actorPath ? JSON.parse(readWorkspaceText(body.actorPath)) : undefined);
      if (!source) throw userError('MISSING_SOURCE', 'sourcePath or sourceContent is required.');
      if (!actor) throw userError('MISSING_ACTOR', 'actorPath or actorJson is required.');
      if (body.sourcePath) assertApiWorkspacePath(body.sourcePath);
      if (body.actorPath) assertApiWorkspacePath(body.actorPath);

      return jsonSuccess(
        buildActorVerificationSummaryFromValues({
          source,
          actor,
          sourcePath: body.sourcePath,
          actorPath: body.actorPath,
        }),
      );
    }

    return jsonFailure(404, 'NOT_FOUND', `No API route for ${request.method} ${url.pathname}`);
  } catch (error) {
    if (error instanceof ApiUserError) {
      return jsonFailure(error.status, error.code, error.message);
    }

    const message = Bun.env.FVTT_WEB_EXPOSE_ERRORS === '1' && error instanceof Error
      ? error.message
      : 'Internal server error.';
    return jsonFailure(500, 'INTERNAL_ERROR', message);
  }
}

function toSingleConversionPayload(job: WebJob): ConversionResult & { downloadUrl: string; jobId: string } {
  const summary = job.summary ?? {};
  return {
    kind: summary.kind as ConversionResult['kind'],
    name: String(summary.name ?? ''),
    itemCount: Number(summary.itemCount ?? 0),
    warnings: job.warnings,
    verification: (summary.verification ?? null) as ConversionResult['verification'],
    rawJson: summary.rawJson,
    outputPath: typeof summary.outputPath === 'string' ? summary.outputPath : undefined,
    fvttVersion: normalizeFvttVersion(typeof summary.fvttVersion === 'string' ? summary.fvttVersion : undefined),
    effectProfile: summary.effectProfile === 'modded-v12' || summary.effectProfile === 'modded-v14'
      ? summary.effectProfile
      : 'core',
    downloadUrl: job.files[0]?.downloadUrl ?? '',
    jobId: job.id,
  };
}

function publicJob(job: WebJob): Omit<WebJob, 'clientIp'> {
  const { clientIp: _clientIp, ...rest } = job;
  return {
    ...rest,
    files: job.files.map((file) => ({
      ...file,
      path: '',
    })),
  };
}

function getRequiredJob(id: string): WebJob {
  const job = getJob(id);
  if (!job) throw userError('JOB_NOT_FOUND', '任务不存在。', 404);
  return job;
}

function validateJobInput(body: WebJobRequest): void {
  const type = body.type;
  const needsMarkdown = type === 'monster-collection' || type === 'item-collection' || type.startsWith('ingest-');
  const needsJson = type === 'translate-json' || type === 'records-to-plaintext';

  if (needsMarkdown) {
    validateUpload(body.fileName, body.content, collectionUploadLimitBytes, ['.md', '.markdown', '.txt']);
  }
  if (needsJson) {
    validateUpload(body.fileName, body.content, collectionUploadLimitBytes, ['.json']);
  }
  if (type === 'goddessfantasy-board-crawl') {
    const boardUrl = body.options?.boardUrl;
    if (typeof boardUrl !== 'string' || !/^https?:\/\//i.test(boardUrl)) {
      throw userError('MISSING_BOARD_URL', '爬站任务需要有效的 boardUrl。');
    }
    const crawlMode = body.options?.crawlMode;
    if (crawlMode !== undefined && crawlMode !== 'full' && crawlMode !== 'incremental') {
      throw userError('INVALID_CRAWL_MODE', 'crawlMode 必须是 full 或 incremental。');
    }
  }
}

function readWorkspaceText(path: string): string {
  assertApiWorkspacePath(path);
  return readFileSync(resolveWorkspacePath(path), 'utf-8');
}

function assertApiWorkspacePath(path: string): void {
  const resolved = resolveWorkspacePath(path);
  const rel = relative(WORKSPACE_ROOT, resolved);
  if (rel.startsWith('..') || isAbsolutePath(rel)) {
    throw userError('PATH_OUTSIDE_WORKSPACE', `Path is outside workspace: ${path}`);
  }
}

function isAbsolutePath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/') || path.startsWith('\\');
}

function normalizeFvttVersion(value: unknown): FvttTargetVersion {
  try {
    return parseFvttTargetVersion(value ?? '12');
  } catch {
    throw userError('INVALID_FVTT_VERSION', `Unsupported fvttVersion: ${String(value)}`);
  }
}

function normalizeEffectProfile(value: EffectProfile | undefined, fvttVersion: FvttTargetVersion = '12'): EffectProfile {
  if (value === undefined) return 'core';
  if (value !== 'core' && value !== 'modded-v12' && value !== 'modded-v14') {
    throw userError('INVALID_EFFECT_PROFILE', `Unsupported effectProfile: ${value}`);
  }
  try {
    assertEffectProfileForTarget(fvttVersion, value);
  } catch (error) {
    throw userError('INVALID_EFFECT_PROFILE', error instanceof Error ? error.message : String(error));
  }
  return value;
}

function validateUpload(
  fileName: string | undefined,
  content: string | undefined,
  maxBytes: number,
  allowedExtensions: string[],
): void {
  if (!content) throw userError('MISSING_CONTENT', 'content is required.');
  const extension = extname(fileName ?? allowedExtensions[0] ?? '').toLowerCase();
  if (extension && !allowedExtensions.includes(extension)) {
    throw userError('INVALID_UPLOAD_TYPE', `只接受这些文件类型：${allowedExtensions.join(', ')}`);
  }

  const byteLength = new TextEncoder().encode(content).byteLength;
  if (byteLength > maxBytes) {
    throw userError('UPLOAD_TOO_LARGE', `上传文件超过 ${Math.floor(maxBytes / 1024 / 1024)} MB 限制。`);
  }
}

function contentDisposition(fileName: string): string {
  const safe = basename(fileName).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') || 'download';
  return `attachment; filename="${encodeURIComponent(safe)}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

function jsonSuccess<T>(data: T): Response {
  return json({ ok: true, data });
}

function jsonFailure(status: number, code: string, message: string, detail?: string): Response {
  return json({ ok: false, error: { code, message, detail } }, { status });
}

function json(value: ApiResponse<unknown>, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init?.headers ?? {}),
    },
  });
}

async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength.trim())) {
      throw userError('INVALID_CONTENT_LENGTH', 'Content-Length must be a non-negative integer.');
    }
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength)) {
      throw userError('INVALID_CONTENT_LENGTH', 'Content-Length is outside the supported range.');
    }
    if (parsedLength > maxBytes) {
      throw userError('REQUEST_BODY_TOO_LARGE', 'Request body exceeds the 25 MiB server limit.', 413);
    }
  }
  const text = await request.text();
  if (!text.trim()) return {} as T;
  return JSON.parse(text) as T;
}

export function isPathModeEnabled(): boolean {
  return Bun.env.FVTT_WEB_ENABLE_PATH_MODE === '1';
}

function userError(code: string, message: string, status = 400): ApiUserError {
  return new ApiUserError(code, message, status);
}

class ApiUserError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
