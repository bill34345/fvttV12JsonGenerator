import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { loadTokenCropOverrides } from './imageAssetOptions';
import type { ImageTokenCrop } from './imageAssets';
import { writeTokenReviewContactSheet } from './tokenReviewContactSheet';
import { extractVisualHints, type VisualHints } from './visualHints';

export type TokenReviewStatus = 'ok' | 'needs_review' | 'failed';

export type TokenReviewReason =
  | 'shared-source-without-slug-crop'
  | 'duplicate-token-image'
  | 'extreme-source-aspect-ratio'
  | 'unconfirmed-token'
  | 'missing-token'
  | 'token-unreadable'
  | 'weak-visual-hints';

export interface TokenReviewItem {
  slug: string;
  displayName: string;
  actorJsonPath: string;
  sourceImageUrl?: string;
  sourceHash?: string;
  tokenUrl?: string;
  localTokenPath?: string;
  cropKey?: string;
  cropStatus: 'slug-specific' | 'source-hash' | 'missing';
  visualHints: VisualHints;
  reasons: TokenReviewReason[];
  status: TokenReviewStatus;
}

export interface TokenReviewResult {
  generatedAt: string;
  items: TokenReviewItem[];
  summary: {
    total: number;
    ok: number;
    needsReview: number;
    failed: number;
  };
  artifacts?: TokenReviewArtifactPaths;
}

export interface TokenReviewArtifactPaths {
  jsonPath: string;
  markdownPath: string;
  contactSheetPath?: string;
  needsReviewSheetPath?: string;
}

export interface TokenReviewOptions {
  vaultPath: string;
  crawlDir: string;
  tokenCropsPath?: string;
  confirmationPath?: string;
  outDir?: string;
  dryRun?: boolean;
  now?: Date;
}

export interface TokenReviewInput {
  generatedAt?: string;
  items: Array<Omit<TokenReviewItem, 'reasons' | 'status'> & {
    tokenImageHash?: string;
    sourceAspectRatio?: number;
    confirmed?: boolean;
  }>;
}

interface PlaintextManifestItem {
  topicId?: string;
  title?: string;
  fileName?: string;
  heading?: string;
  chineseName?: string;
  englishName?: string;
}

interface CrawlRecord {
  topicId?: string | number;
  title?: string;
  posts?: Array<{ text?: string }>;
}

interface ConfirmationManifest {
  confirmed?: Record<string, { confirmedAt?: string; reviewer?: string; note?: string }>;
}

const EMPTY_HINTS: VisualHints = {
  positionHints: [],
  appearanceHints: [],
  captionHints: [],
  weakHints: [],
};

export async function runTokenReview(options: TokenReviewOptions): Promise<TokenReviewResult> {
  const vaultPath = resolve(options.vaultPath);
  const crawlDir = resolve(options.crawlDir);
  const outputDir = join(vaultPath, 'output');
  const assetsDir = join(outputDir, 'assets', 'goddessfantasy');
  const actors = loadActorJsons(outputDir);
  const manifestItems = loadPlaintextManifestItems(crawlDir);
  const records = loadRecords(crawlDir);
  const tokenCropKeys = new Set(Object.keys(loadOptionalTokenCrops(options.tokenCropsPath ?? join(crawlDir, 'plaintext', 'token-crops.json'))));
  const confirmations = loadConfirmations(options.confirmationPath ?? join(crawlDir, 'plaintext', 'token-review-confirmed.json'));
  const reviewItems = [];

  for (const actor of actors) {
    const tokenUrl = stringOrUndefined(actor.data.prototypeToken?.texture?.src);
    const actorImg = stringOrUndefined(actor.data.img);
    if (!tokenUrl && !actorImg) continue;

    const parsed = parseTokenAssetKey(tokenUrl ?? actorImg ?? '');
    const fallbackSlug = slugFromFileName(actor.path);
    const slug = parsed?.slug ?? fallbackSlug;
    const sourceHash = parsed?.hash ?? parseTokenAssetKey(actorImg ?? '')?.hash;
    const tokenFileName = tokenUrl ? basename(new URL(tokenUrl).pathname) : undefined;
    const actorImageFileName = actorImg ? basename(new URL(actorImg).pathname) : undefined;
    const localTokenPath = tokenFileName ? join(assetsDir, 'tokens', tokenFileName) : undefined;
    const localActorImagePath = actorImageFileName ? join(assetsDir, 'actors', actorImageFileName) : undefined;
    const cropKey = sourceHash ? resolveCropKey(tokenCropKeys, slug, sourceHash) : undefined;
    const manifest = manifestItems.find((item) => slugFromManifestFile(item.fileName) === slug);
    const record = records.find((entry) => String(entry.topicId) === String(manifest?.topicId ?? ''));
    const visualHints = record?.posts?.[0]?.text
      ? extractVisualHints(record.posts[0].text, {
        topicId: String(record.topicId ?? ''),
        chineseName: manifest?.chineseName,
        englishName: manifest?.englishName,
      })
      : EMPTY_HINTS;

    reviewItems.push({
      slug,
      displayName: actor.data.name ?? manifest?.heading ?? slug,
      actorJsonPath: actor.path,
      sourceImageUrl: actorImg,
      sourceHash,
      tokenUrl,
      localTokenPath: localTokenPath && existsSync(localTokenPath) ? localTokenPath : undefined,
      cropKey,
      cropStatus: cropKey?.includes('__') ? 'slug-specific' : cropKey ? 'source-hash' : 'missing',
      visualHints,
      tokenImageHash: localTokenPath && existsSync(localTokenPath) ? await fileImageHash(localTokenPath) : undefined,
      sourceAspectRatio: localActorImagePath && existsSync(localActorImagePath) ? await imageAspectRatio(localActorImagePath) : undefined,
      confirmed: cropKey ? Boolean(confirmations.confirmed?.[cropKey]) : false,
    });
  }

  const result = classifyTokenReviewItems({
    generatedAt: (options.now ?? new Date()).toISOString(),
    items: reviewItems,
  });

  if (!options.dryRun) {
    result.artifacts = await writeTokenReviewArtifacts(result, {
      outDir: options.outDir ?? join(assetsDir, 'token-review'),
    });
  }

  return result;
}

export function classifyTokenReviewItems(input: TokenReviewInput): TokenReviewResult {
  const sourceCounts = countBy(input.items.map((item) => item.sourceHash).filter((hash): hash is string => Boolean(hash)));
  const tokenHashCounts = countBy(input.items.map((item) => item.tokenImageHash).filter((hash): hash is string => Boolean(hash)));
  const items = input.items.map((item): TokenReviewItem => {
    const reasons: TokenReviewReason[] = [];

    if (!item.tokenUrl || !item.localTokenPath) reasons.push('missing-token');
    if (item.tokenUrl && !item.tokenImageHash) reasons.push('token-unreadable');
    if (item.sourceHash && sourceCounts.get(item.sourceHash)! > 1 && item.cropStatus !== 'slug-specific') {
      reasons.push('shared-source-without-slug-crop');
    }
    if (item.tokenImageHash && tokenHashCounts.get(item.tokenImageHash)! > 1) reasons.push('duplicate-token-image');
    if (item.sourceAspectRatio && (item.sourceAspectRatio > 2.2 || item.sourceAspectRatio < 0.45)) {
      reasons.push('extreme-source-aspect-ratio');
    }
    if (!item.confirmed) reasons.push('unconfirmed-token');
    const onlyWeakCaptions = item.visualHints.captionHints.length === 0
      || item.visualHints.captionHints.every((hint) => item.visualHints.weakHints.includes(hint));
    if (
      item.visualHints.positionHints.length === 0
      && item.visualHints.appearanceHints.length === 0
      && onlyWeakCaptions
      && item.visualHints.weakHints.length > 0
    ) {
      reasons.push('weak-visual-hints');
    }

    const uniqueReasons = Array.from(new Set(reasons));
    const failed = uniqueReasons.includes('missing-token') || uniqueReasons.includes('token-unreadable');
    return {
      slug: item.slug,
      displayName: item.displayName,
      actorJsonPath: item.actorJsonPath,
      sourceImageUrl: item.sourceImageUrl,
      sourceHash: item.sourceHash,
      tokenUrl: item.tokenUrl,
      localTokenPath: item.localTokenPath,
      cropKey: item.cropKey,
      cropStatus: item.cropStatus,
      visualHints: item.visualHints,
      reasons: uniqueReasons,
      status: failed ? 'failed' : uniqueReasons.length > 0 ? 'needs_review' : 'ok',
    };
  });

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    items,
    summary: {
      total: items.length,
      ok: items.filter((item) => item.status === 'ok').length,
      needsReview: items.filter((item) => item.status === 'needs_review').length,
      failed: items.filter((item) => item.status === 'failed').length,
    },
  };
}

export async function writeTokenReviewArtifacts(
  result: TokenReviewResult,
  options: { outDir: string },
): Promise<TokenReviewArtifactPaths> {
  mkdirSync(options.outDir, { recursive: true });
  const jsonPath = join(options.outDir, 'token-review.json');
  const markdownPath = join(options.outDir, 'token-review.md');
  writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf-8');
  writeFileSync(markdownPath, renderTokenReviewMarkdown(result), 'utf-8');

  const contactSheetPath = join(options.outDir, 'contact-sheet-001.png');
  await writeTokenReviewContactSheet({
    items: result.items,
    outPath: contactSheetPath,
    title: 'Token Review',
  });

  let needsReviewSheetPath: string | undefined;
  const needsReview = result.items.filter((item) => item.status !== 'ok');
  if (needsReview.length > 0) {
    needsReviewSheetPath = join(options.outDir, 'needs-review-sheet-001.png');
    await writeTokenReviewContactSheet({
      items: needsReview,
      outPath: needsReviewSheetPath,
      title: 'Needs Review',
    });
  }

  return {
    jsonPath,
    markdownPath,
    contactSheetPath,
    needsReviewSheetPath,
  };
}

function renderTokenReviewMarkdown(result: TokenReviewResult): string {
  const lines = [
    '# Token Review',
    '',
    `Generated: ${result.generatedAt}`,
    '',
    `Total: ${result.summary.total}`,
    `OK: ${result.summary.ok}`,
    `Needs review: ${result.summary.needsReview}`,
    `Failed: ${result.summary.failed}`,
    '',
  ];

  for (const item of result.items.filter((entry) => entry.status !== 'ok')) {
    lines.push(`## ${item.displayName}`);
    lines.push('');
    lines.push(`- Status: ${item.status}`);
    lines.push(`- Slug: ${item.slug}`);
    lines.push(`- Reasons: ${item.reasons.join(', ') || 'none'}`);
    lines.push(`- Crop: ${item.cropKey ?? 'none'} (${item.cropStatus})`);
    if (item.tokenUrl) lines.push(`- Token: ${item.tokenUrl}`);
    if (item.sourceImageUrl) lines.push(`- Source image: ${item.sourceImageUrl}`);
    if (item.visualHints.positionHints.length > 0) lines.push(`- Position hints: ${item.visualHints.positionHints.join(' / ')}`);
    if (item.visualHints.appearanceHints.length > 0) lines.push(`- Appearance hints: ${item.visualHints.appearanceHints.join(' / ')}`);
    if (item.visualHints.captionHints.length > 0) lines.push(`- Caption hints: ${item.visualHints.captionHints.join(' / ')}`);
    if (item.visualHints.weakHints.length > 0) lines.push(`- Weak hints: ${item.visualHints.weakHints.join(' / ')}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function loadActorJsons(outputDir: string): Array<{ path: string; data: any }> {
  if (!existsSync(outputDir)) return [];
  return readdirSync(outputDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const actorPath = join(outputDir, file);
      return {
        path: actorPath,
        data: JSON.parse(readFileSync(actorPath, 'utf-8')),
      };
    });
}

function loadPlaintextManifestItems(crawlDir: string): PlaintextManifestItem[] {
  const manifestPath = join(crawlDir, 'plaintext', 'manifest.json');
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { items?: PlaintextManifestItem[] };
  return Array.isArray(manifest.items) ? manifest.items : [];
}

function loadRecords(crawlDir: string): CrawlRecord[] {
  const recordsPath = join(crawlDir, 'records.json');
  if (!existsSync(recordsPath)) return [];
  const records = JSON.parse(readFileSync(recordsPath, 'utf-8')) as CrawlRecord[];
  return Array.isArray(records) ? records : [];
}

function loadOptionalTokenCrops(path: string): Record<string, ImageTokenCrop> {
  if (!existsSync(path)) return {};
  return loadTokenCropOverrides(path);
}

function loadConfirmations(path: string): ConfirmationManifest {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf-8')) as ConfirmationManifest;
}

function parseTokenAssetKey(urlOrPath: string): { slug: string; hash: string } | undefined {
  try {
    const fileName = basename(new URL(urlOrPath).pathname);
    const match = /^(.+)__([a-f0-9]{8})\.[^.]+$/i.exec(fileName);
    if (!match) return undefined;
    return { slug: match[1].toLowerCase(), hash: match[2].toLowerCase() };
  } catch {
    const match = /^(.+)__([a-f0-9]{8})\.[^.]+$/i.exec(basename(urlOrPath));
    return match ? { slug: match[1].toLowerCase(), hash: match[2].toLowerCase() } : undefined;
  }
}

function resolveCropKey(cropKeys: Set<string>, slug: string, sourceHash: string): string | undefined {
  const slugKey = `${slug}__${sourceHash}`.toLowerCase();
  if (cropKeys.has(slugKey)) return slugKey;
  if (cropKeys.has(sourceHash.toLowerCase())) return sourceHash.toLowerCase();
  return undefined;
}

async function fileImageHash(path: string): Promise<string | undefined> {
  try {
    const buffer = await sharp(path).resize(128, 128, { fit: 'cover' }).raw().toBuffer();
    return createHash('sha256').update(buffer).digest('hex');
  } catch {
    return undefined;
  }
}

async function imageAspectRatio(path: string): Promise<number | undefined> {
  try {
    const metadata = await sharp(path).metadata();
    if (!metadata.width || !metadata.height) return undefined;
    return metadata.height / metadata.width;
  } catch {
    return undefined;
  }
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function slugFromFileName(path: string): string {
  return basename(path, '.json').split('__')[0].toLowerCase();
}

function slugFromManifestFile(fileName: string | undefined): string | undefined {
  if (!fileName) return undefined;
  const withoutExt = basename(fileName, '.md');
  return withoutExt.replace(/^\d+__/, '').toLowerCase();
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
