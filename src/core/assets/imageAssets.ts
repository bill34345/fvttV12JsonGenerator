import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import type { ParsedNPC } from '../../config/mapping';
import type { ImageTokenCrop } from './tokenCrop';

export type { ImageTokenCrop } from './tokenCrop';

const execFileAsync = promisify(execFile);

export type ImageAssetMode = 'none' | 'ssh';
export type ImageAssetStage = 'config' | 'download' | 'actor' | 'token' | 'upload' | 'verify';

export interface ImageAssetWarning {
  stage: ImageAssetStage;
  sourceUrl?: string;
  displayName?: string;
  message: string;
}

export interface ImageFetchResult {
  buffer: Buffer;
  contentType?: string;
}

export interface PublicImageExpectation {
  width?: number;
  height?: number;
  format?: string;
}

export interface ImageAssetUploader {
  ensureDir(remotePath: string): Promise<void>;
  uploadFile(localPath: string, remotePath: string): Promise<void>;
}

export interface ImageAssetOptions {
  mode: ImageAssetMode;
  localRoot?: string;
  sshTarget?: string;
  remoteRoot?: string;
  publicBaseUrl?: string;
  allowHttp?: boolean;
  actorDir?: string;
  tokenDir?: string;
  tokenFramePath?: string;
  tokenSize?: number;
  tokenFormat?: 'webp';
  tokenCropOverrides?: Record<string, ImageTokenCrop>;
  fetchImage?: (url: string) => Promise<ImageFetchResult>;
  uploader?: ImageAssetUploader;
  verifyPublicImage?: (url: string, expected?: PublicImageExpectation) => Promise<boolean>;
}

export interface ImageAssetContext {
  slug: string;
  displayName: string;
  localRoot?: string;
}

export interface ImageAssetResult {
  actorUrl?: string;
  tokenUrl?: string;
  localActorPath?: string;
  localTokenPath?: string;
  warnings: ImageAssetWarning[];
}

const ACTOR_FORMATS = new Set(['png', 'jpeg', 'webp']);

export async function processParsedNpcImage(
  parsed: ParsedNPC,
  options: ImageAssetOptions,
  context: ImageAssetContext,
): Promise<ImageAssetResult> {
  const warnings: ImageAssetWarning[] = [];
  const sourceUrl = typeof parsed.img === 'string' ? parsed.img.trim() : '';
  if (!sourceUrl || options.mode === 'none') {
    return { warnings };
  }

  try {
    validateImageOptions(options);
  } catch (error) {
    return {
      warnings: [warning('config', sourceUrl, context.displayName, error)],
    };
  }

  const actorDir = options.actorDir ?? 'actors';
  const tokenDir = options.tokenDir ?? 'tokens';
  const tokenSize = options.tokenSize ?? 1024;
  const tokenFormat = options.tokenFormat ?? 'webp';
  const localRoot = context.localRoot ?? options.localRoot;
  if (!localRoot) {
    return {
      warnings: [warning('config', sourceUrl, context.displayName, 'localRoot is required')],
    };
  }

  const urlHash = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 8);
  const slug = sanitizeSlug(context.slug || context.displayName || 'actor');
  const actorBaseName = `${slug}__${urlHash}`;
  const tokenFileName = `${actorBaseName}.${tokenFormat}`;
  const tokenCropOverride = resolveTokenCropOverride(options.tokenCropOverrides, slug, urlHash);
  const localActorDir = join(localRoot, actorDir);
  const localTokenDir = join(localRoot, tokenDir);
  mkdirSync(localActorDir, { recursive: true });
  mkdirSync(localTokenDir, { recursive: true });

  let actorExt = extFromUrl(sourceUrl);
  let actorPath = actorExt ? join(localActorDir, `${actorBaseName}.${actorExt}`) : '';
  let imageBuffer: Buffer | undefined;

  try {
    if (!actorPath || !existsSync(actorPath)) {
      const fetched = await (options.fetchImage ?? fetchImage)(sourceUrl);
      imageBuffer = fetched.buffer;
      const metadata = await sharp(imageBuffer).metadata();
      actorExt = actorExtFromFormat(metadata.format);
      actorPath = join(localActorDir, `${actorBaseName}.${actorExt}`);

      if (!existsSync(actorPath)) {
        if (metadata.format && ACTOR_FORMATS.has(metadata.format)) {
          writeFileSync(actorPath, imageBuffer);
        } else {
          await sharp(imageBuffer).webp({ quality: 92 }).toFile(actorPath);
        }
      }
    }
  } catch (error) {
    return {
      warnings: [warning('download', sourceUrl, context.displayName, error)],
    };
  }

  const tokenPath = join(localTokenDir, tokenFileName);
  try {
    if (tokenCropOverride || !existsSync(tokenPath)) {
      await createTokenImage(actorPath, tokenPath, options.tokenFramePath!, tokenSize, tokenCropOverride);
    }
  } catch (error) {
    warnings.push(warning('token', sourceUrl, context.displayName, error));
  }

  const uploader = options.uploader ?? new SshImageAssetUploader(options.sshTarget!);
  const remoteActorDir = joinRemote(options.remoteRoot!, actorDir);
  const remoteTokenDir = joinRemote(options.remoteRoot!, tokenDir);
  const actorFileName = actorPath.split(/[\\/]/).pop()!;
  const actorUrl = joinUrl(options.publicBaseUrl!, actorDir, actorFileName);
  const tokenUrl = joinUrl(options.publicBaseUrl!, tokenDir, tokenFileName);

  let verifiedActorUrl: string | undefined;
  let verifiedTokenUrl: string | undefined;

  try {
    await uploader.ensureDir(remoteActorDir);
    await uploadAndVerify({
      uploader,
      localPath: actorPath,
      remotePath: joinRemote(remoteActorDir, actorFileName),
      publicUrl: actorUrl,
      verifier: options.verifyPublicImage ?? verifyPublicImage,
      expected: {},
    });
    verifiedActorUrl = actorUrl;
  } catch (error) {
    warnings.push(warning('upload', sourceUrl, context.displayName, error));
  }

  if (existsSync(tokenPath)) {
    try {
      await uploader.ensureDir(remoteTokenDir);
      await uploadAndVerify({
        uploader,
        localPath: tokenPath,
        remotePath: joinRemote(remoteTokenDir, tokenFileName),
        publicUrl: tokenUrl,
        verifier: options.verifyPublicImage ?? verifyPublicImage,
        expected: { width: tokenSize, height: tokenSize, format: tokenFormat },
        forceUpload: Boolean(tokenCropOverride),
      });
      verifiedTokenUrl = tokenUrl;
    } catch (error) {
      warnings.push(warning('upload', sourceUrl, context.displayName, error));
    }
  }

  return {
    actorUrl: verifiedActorUrl,
    tokenUrl: verifiedTokenUrl,
    localActorPath: actorPath,
    localTokenPath: existsSync(tokenPath) ? tokenPath : undefined,
    warnings,
  };
}

export class SshImageAssetUploader implements ImageAssetUploader {
  private readonly timeoutMs = 30_000;

  public constructor(private readonly sshTarget: string) {}

  public async ensureDir(remotePath: string): Promise<void> {
    const command = `[void](New-Item -ItemType Directory -Force -Path '${escapePowerShellSingleQuoted(remotePath)}')`;
    await execFileAsync('ssh', [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      '-o',
      'ServerAliveInterval=5',
      '-o',
      'ServerAliveCountMax=2',
      this.sshTarget,
      ...buildWindowsPowerShellEncodedArgs(command),
    ], { timeout: this.timeoutMs });
  }

  public async uploadFile(localPath: string, remotePath: string): Promise<void> {
    await execFileAsync('scp', [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      '-o',
      'ServerAliveInterval=5',
      '-o',
      'ServerAliveCountMax=2',
      localPath,
      `${this.sshTarget}:${remotePath}`,
    ], { timeout: this.timeoutMs });
  }
}

async function createTokenImage(
  sourcePath: string,
  tokenPath: string,
  framePath: string,
  size: number,
  cropOverride?: ImageTokenCrop,
): Promise<void> {
  const frameMeta = await sharp(framePath).metadata();
  if (!frameMeta.hasAlpha) {
    throw new Error(`token frame must have alpha channel: ${framePath}`);
  }
  const sourceMeta = await sharp(sourcePath).metadata();
  const sourceExtract =
    calculateOverrideExtract(sourceMeta.width, sourceMeta.height, cropOverride)
    ?? calculateTokenSourceExtract(sourceMeta.width, sourceMeta.height, sourceMeta.hasAlpha);

  const frame = await sharp(framePath)
    .resize(size, size, { fit: 'fill' })
    .png()
    .toBuffer();

  mkdirSync(dirname(tokenPath), { recursive: true });
  let tokenSource = sharp(sourcePath);
  if (sourceExtract) {
    tokenSource = tokenSource.extract(sourceExtract);
  }

  const sourceLayer = await tokenSource
    .resize({
      width: size,
      height: size,
      fit: cropOverride?.fit ?? 'cover',
      position: sharp.strategy.attention,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.42}" fill="white"/></svg>`,
  );
  const clippedSourceLayer = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: sourceLayer, left: 0, top: 0 },
      { input: mask, left: 0, top: 0, blend: 'dest-in' },
    ])
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: clippedSourceLayer, left: 0, top: 0 },
      { input: frame, gravity: 'center' },
    ])
    .webp({ quality: 92 })
    .toFile(tokenPath);
}

function calculateOverrideExtract(
  width: number | undefined,
  height: number | undefined,
  crop: ImageTokenCrop | undefined,
): { left: number; top: number; width: number; height: number } | undefined {
  if (!width || !height || !crop) return undefined;
  const left = Math.max(0, Math.min(width - 1, Math.round(crop.left * width)));
  const top = Math.max(0, Math.min(height - 1, Math.round(crop.top * height)));
  const cropWidth = Math.max(1, Math.min(width - left, Math.round(crop.width * width)));
  const cropHeight = Math.max(1, Math.min(height - top, Math.round(crop.height * height)));
  return { left, top, width: cropWidth, height: cropHeight };
}

function resolveTokenCropOverride(
  overrides: Record<string, ImageTokenCrop> | undefined,
  slug: string,
  urlHash: string,
): ImageTokenCrop | undefined {
  if (!overrides) return undefined;
  return overrides[`${slug}__${urlHash}`] ?? overrides[urlHash];
}

function calculateTokenSourceExtract(
  width: number | undefined,
  height: number | undefined,
  hasAlpha: boolean | undefined,
): { left: number; top: number; width: number; height: number } | undefined {
  if (!width || !height) return undefined;
  if (!hasAlpha) return undefined;
  if (height <= width * 1.25) return undefined;

  const side = width;
  const extraHeight = height - side;
  return {
    left: 0,
    top: Math.max(0, Math.min(height - side, Math.round(extraHeight * 0.25))),
    width: side,
    height: side,
  };
}

async function uploadAndVerify(input: {
  uploader: ImageAssetUploader;
  localPath: string;
  remotePath: string;
  publicUrl: string;
  verifier: (url: string, expected?: PublicImageExpectation) => Promise<boolean>;
  expected: PublicImageExpectation;
  forceUpload?: boolean;
}): Promise<void> {
  if (input.forceUpload || !(await input.verifier(input.publicUrl, input.expected))) {
    await input.uploader.uploadFile(input.localPath, input.remotePath);
  }

  if (!(await input.verifier(input.publicUrl, input.expected))) {
    throw new Error(`public image verification failed: ${input.publicUrl}`);
  }
}

async function fetchImage(url: string): Promise<ImageFetchResult> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while downloading ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    contentType: response.headers.get('content-type') ?? undefined,
  };
}

async function verifyPublicImage(url: string, expected?: PublicImageExpectation): Promise<boolean> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return false;

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('image/')) return false;

    const buffer = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(buffer).metadata();
    if (expected?.width !== undefined && metadata.width !== expected.width) return false;
    if (expected?.height !== undefined && metadata.height !== expected.height) return false;
    if (expected?.format !== undefined && metadata.format !== expected.format) return false;
    return true;
  } catch {
    return false;
  }
}

function validateImageOptions(options: ImageAssetOptions): void {
  if (options.mode !== 'ssh') {
    throw new Error(`unsupported image mode: ${options.mode}`);
  }
  if (!options.sshTarget) throw new Error('sshTarget is required');
  if (!options.remoteRoot) throw new Error('remoteRoot is required');
  if (!options.publicBaseUrl) throw new Error('publicBaseUrl is required');
  if (!options.allowHttp && options.publicBaseUrl.toLowerCase().startsWith('http://')) {
    throw new Error('HTTP image URLs require --image-allow-http');
  }
  if (!options.tokenFramePath) throw new Error('tokenFramePath is required');
  if (!existsSync(options.tokenFramePath)) {
    throw new Error(`token frame not found: ${options.tokenFramePath}`);
  }
}

function warning(stage: ImageAssetStage, sourceUrl: string, displayName: string, error: unknown): ImageAssetWarning {
  return {
    stage,
    sourceUrl,
    displayName,
    message: error instanceof Error ? error.message : String(error),
  };
}

function extFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    const ext = extname(pathname).replace(/^\./, '').toLowerCase();
    if (ext === 'jpg') return 'jpg';
    if (ext === 'jpeg') return 'jpg';
    if (ext === 'png') return 'png';
    if (ext === 'webp') return 'webp';
    return undefined;
  } catch {
    return undefined;
  }
}

function actorExtFromFormat(format: string | undefined): string {
  if (format === 'jpeg') return 'jpg';
  if (format === 'png') return 'png';
  if (format === 'webp') return 'webp';
  return 'webp';
}

function sanitizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'actor';
}

function joinRemote(...parts: string[]): string {
  return parts
    .map((part, index) => {
      const normalized = part.replace(/\\/g, '/');
      return index === 0 ? normalized.replace(/\/+$/g, '') : normalized.replace(/^\/+|\/+$/g, '');
    })
    .filter(Boolean)
    .join('/');
}

function joinUrl(...parts: string[]): string {
  return parts
    .map((part, index) => (index === 0 ? part.replace(/\/+$/g, '') : part.replace(/^\/+|\/+$/g, '')))
    .filter(Boolean)
    .join('/');
}

export function buildWindowsPowerShellEncodedArgs(command: string): string[] {
  return [
    'powershell',
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    Buffer.from(command, 'utf16le').toString('base64'),
  ];
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}
