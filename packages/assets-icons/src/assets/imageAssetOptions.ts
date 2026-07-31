import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ImageAssetOptions, ImageTokenCrop } from './imageAssets';
import { hasCompleteNormalizedCropRect } from './tokenCrop';

export function buildImageAssetOptionsFromCli(options: {
  imageMode?: unknown;
  imageSshTarget?: unknown;
  imageRemoteRoot?: unknown;
  imagePublicBaseUrl?: unknown;
  imageAllowHttp?: unknown;
  imageActorDir?: unknown;
  imageTokenDir?: unknown;
  imageTokenFrame?: unknown;
  imageTokenSize?: unknown;
  imageTokenFormat?: unknown;
  imageTokenCrops?: unknown;
}): ImageAssetOptions | undefined {
  const mode = String(options.imageMode ?? 'none');
  if (mode === 'none') {
    return undefined;
  }
  if (mode !== 'ssh') {
    throw new Error(`Unsupported --image-mode: ${mode}. Use none or ssh.`);
  }

  const tokenFormat = String(options.imageTokenFormat ?? 'webp');
  if (tokenFormat !== 'webp') {
    throw new Error(`Unsupported --image-token-format: ${tokenFormat}. Use webp.`);
  }

  const tokenSize = Number.parseInt(String(options.imageTokenSize ?? '1024'), 10);
  if (!Number.isFinite(tokenSize) || tokenSize <= 0) {
    throw new Error(`Invalid --image-token-size: ${String(options.imageTokenSize)}`);
  }

  const publicBaseUrl = String(options.imagePublicBaseUrl ?? '');
  if (publicBaseUrl.toLowerCase().startsWith('http://') && !options.imageAllowHttp) {
    throw new Error('HTTP image URLs require --image-allow-http.');
  }

  return {
    mode: 'ssh',
    sshTarget: stringOrUndefined(options.imageSshTarget),
    remoteRoot: stringOrUndefined(options.imageRemoteRoot),
    publicBaseUrl,
    allowHttp: Boolean(options.imageAllowHttp),
    actorDir: stringOrUndefined(options.imageActorDir) ?? 'actors',
    tokenDir: stringOrUndefined(options.imageTokenDir) ?? 'tokens',
    tokenFramePath: options.imageTokenFrame ? resolve(String(options.imageTokenFrame)) : undefined,
    tokenSize,
    tokenFormat,
    tokenCropOverrides: options.imageTokenCrops
      ? loadTokenCropOverrides(resolve(String(options.imageTokenCrops)))
      : undefined,
  };
}

export function loadTokenCropOverrides(path: string): Record<string, ImageTokenCrop> {
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  const result: Record<string, ImageTokenCrop> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isTokenCropKey(key)) {
      throw new Error(`Invalid token crop key in ${path}: ${key}. Expected <sha8> or <slug>__<sha8>.`);
    }
    if (!value || typeof value !== 'object') {
      throw new Error(`Invalid token crop entry for ${key} in ${path}`);
    }
    const crop = value as Partial<ImageTokenCrop>;
    for (const field of ['left', 'top', 'width', 'height'] as const) {
      const numberValue = crop[field];
      if (typeof numberValue !== 'number' || !Number.isFinite(numberValue) || numberValue < 0 || numberValue > 1) {
        throw new Error(`Invalid token crop ${key}.${field} in ${path}: expected a number from 0 to 1`);
      }
    }
    if (!hasCompleteNormalizedCropRect(crop)) {
      throw new Error(`Invalid token crop entry for ${key} in ${path}`);
    }
    if (crop.width <= 0 || crop.height <= 0) {
      throw new Error(`Invalid token crop ${key} in ${path}: width and height must be greater than 0`);
    }
    if (crop.left + crop.width > 1 || crop.top + crop.height > 1) {
      throw new Error(`Invalid token crop ${key} in ${path}: crop rectangle must stay inside the source image`);
    }
    if (crop.fit !== undefined && crop.fit !== 'cover' && crop.fit !== 'contain') {
      throw new Error(`Invalid token crop ${key}.fit in ${path}: expected cover or contain`);
    }
    result[key.toLowerCase()] = {
      left: crop.left,
      top: crop.top,
      width: crop.width,
      height: crop.height,
      fit: crop.fit,
    };
  }
  return result;
}

function isTokenCropKey(key: string): boolean {
  return /^[a-f0-9]{8}$/i.test(key) || /^[a-z0-9]+(?:-[a-z0-9]+)*__[a-f0-9]{8}$/i.test(key);
}

function stringOrUndefined(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value);
  return text.length > 0 ? text : undefined;
}
