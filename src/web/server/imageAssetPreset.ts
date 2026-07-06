import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ImageAssetOptions, ImageTokenCrop } from '../../core/assets/imageAssets';

export interface WebImageAssetPreset {
  imageAssetsConfigured: boolean;
  imageMode: 'ssh';
  imageSshTarget: string;
  imageRemoteRoot: string;
  imagePublicBaseUrl: string;
  imageAllowHttp: boolean;
  imageActorDir: string;
  imageTokenDir: string;
  imageTokenFrame: string;
  imageTokenFrameConfigured: boolean;
  imageTokenSize: number;
  imageTokenFormat: 'webp';
}

export function getWebImageAssetPreset(): WebImageAssetPreset {
  const imageTokenFrame = resolve(Bun.env.FVTT_WEB_IMAGE_TOKEN_FRAME ?? 'references/fifthed_border_medium.png');
  const imageSshTarget = Bun.env.FVTT_WEB_IMAGE_SSH_TARGET ?? 'Administrator@49.232.12.153';
  const imageRemoteRoot = Bun.env.FVTT_WEB_IMAGE_REMOTE_ROOT ?? 'E:/Bill/imgSource';
  const imagePublicBaseUrl = Bun.env.FVTT_WEB_IMAGE_PUBLIC_BASE_URL ?? 'http://49.232.12.153/imgSource';
  const imageAllowHttp = Bun.env.FVTT_WEB_IMAGE_ALLOW_HTTP === '0' ? false : true;
  const imageTokenSize = parsePositiveInt(Bun.env.FVTT_WEB_IMAGE_TOKEN_SIZE, 1024);
  const imageTokenFrameConfigured = existsSync(imageTokenFrame);

  return {
    imageAssetsConfigured: Boolean(imageSshTarget && imageRemoteRoot && imagePublicBaseUrl && imageTokenFrameConfigured),
    imageMode: 'ssh',
    imageSshTarget,
    imageRemoteRoot,
    imagePublicBaseUrl,
    imageAllowHttp,
    imageActorDir: Bun.env.FVTT_WEB_IMAGE_ACTOR_DIR ?? 'actors',
    imageTokenDir: Bun.env.FVTT_WEB_IMAGE_TOKEN_DIR ?? 'tokens',
    imageTokenFrame,
    imageTokenFrameConfigured,
    imageTokenSize,
    imageTokenFormat: 'webp',
  };
}

export function buildWebImageAssetOptions(options: Record<string, unknown> | undefined): ImageAssetOptions | undefined {
  if (options?.imageAssetsEnabled !== true) return undefined;

  const preset = getWebImageAssetPreset();
  return {
    mode: 'ssh',
    sshTarget: preset.imageSshTarget,
    remoteRoot: preset.imageRemoteRoot,
    publicBaseUrl: preset.imagePublicBaseUrl,
    allowHttp: preset.imageAllowHttp,
    actorDir: preset.imageActorDir,
    tokenDir: preset.imageTokenDir,
    tokenFramePath: preset.imageTokenFrame,
    tokenSize: preset.imageTokenSize,
    tokenFormat: preset.imageTokenFormat,
    tokenCropOverrides: parseTokenCropOverrides(options.imageTokenCrops),
  };
}

export function imageAssetWarningsForResult(
  options: Record<string, unknown> | undefined,
  workflowWarnings: Array<{ displayName?: string; stage?: string; message: string }>,
): string[] {
  if (options?.imageAssetsEnabled !== true) return [];

  const preset = getWebImageAssetPreset();
  const warnings: string[] = [];
  if (!preset.imageAssetsConfigured) {
    warnings.push('图片资产服务器预设未完整配置；JSON 会继续生成，但图片 URL 不会写入。');
  }

  for (const warning of workflowWarnings) {
    const subject = warning.displayName ?? 'image';
    const stage = warning.stage ? `[${warning.stage}] ` : '';
    warnings.push(`${subject} ${stage}${warning.message}`);
  }
  return warnings;
}

function parseTokenCropOverrides(value: unknown): Record<string, ImageTokenCrop> | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('imageTokenCrops must be an object keyed by 8-character source URL hashes.');
  }

  const result: Record<string, ImageTokenCrop> = {};
  for (const [hash, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[a-f0-9]{8}$/i.test(hash)) {
      throw new Error(`Invalid imageTokenCrops key: ${hash}`);
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Invalid imageTokenCrops entry for ${hash}`);
    }
    const crop = entry as Partial<ImageTokenCrop>;
    for (const field of ['left', 'top', 'width', 'height'] as const) {
      const numberValue = crop[field];
      if (typeof numberValue !== 'number' || !Number.isFinite(numberValue) || numberValue < 0 || numberValue > 1) {
        throw new Error(`Invalid imageTokenCrops.${hash}.${field}: expected a number from 0 to 1.`);
      }
    }
    if (crop.width <= 0 || crop.height <= 0) {
      throw new Error(`Invalid imageTokenCrops.${hash}: width and height must be greater than 0.`);
    }
    if (crop.left + crop.width > 1 || crop.top + crop.height > 1) {
      throw new Error(`Invalid imageTokenCrops.${hash}: crop rectangle must stay inside the source image.`);
    }
    if (crop.fit !== undefined && crop.fit !== 'cover' && crop.fit !== 'contain') {
      throw new Error(`Invalid imageTokenCrops.${hash}.fit: expected cover or contain.`);
    }

    result[hash.toLowerCase()] = {
      left: crop.left,
      top: crop.top,
      width: crop.width,
      height: crop.height,
      fit: crop.fit,
    };
  }

  return result;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
