import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import sharp from 'sharp';
import type { TokenReviewItem } from './tokenReview';

export interface TokenReviewContactSheetOptions {
  items: TokenReviewItem[];
  outPath: string;
  title?: string;
  maxItems?: number;
}

export async function writeTokenReviewContactSheet(options: TokenReviewContactSheetOptions): Promise<string> {
  const items = options.items.slice(0, options.maxItems ?? 12);
  const tileSize = 260;
  const labelHeight = 92;
  const gap = 18;
  const columns = Math.max(1, Math.min(4, items.length || 1));
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const titleHeight = options.title ? 52 : 0;
  const width = columns * tileSize + (columns + 1) * gap;
  const height = titleHeight + rows * (tileSize + labelHeight) + (rows + 1) * gap;
  const composites: Parameters<ReturnType<typeof sharp>['composite']>[0] = [];

  if (options.title) {
    composites.push({
      input: labelSvg(width, titleHeight, options.title, '', 26),
      left: 0,
      top: 0,
    });
  }

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) continue;
    const left = gap + (index % columns) * (tileSize + gap);
    const top = titleHeight + gap + Math.floor(index / columns) * (tileSize + labelHeight + gap);
    const token = item.localTokenPath
      ? await sharp(item.localTokenPath).resize(tileSize, tileSize, { fit: 'contain', background: '#222222' }).png().toBuffer()
      : placeholderSvg(tileSize, tileSize, 'missing token');
    composites.push({ input: token, left, top });
    composites.push({
      input: labelSvg(
        tileSize,
        labelHeight,
        item.displayName,
        `${item.status}: ${item.reasons.slice(0, 2).join(', ') || 'ok'}`,
        17,
      ),
      left,
      top: top + tileSize,
    });
  }

  mkdirSync(dirname(options.outPath), { recursive: true });
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#222222ff',
    },
  })
    .composite(composites)
    .png()
    .toFile(options.outPath);
  return options.outPath;
}

function labelSvg(width: number, height: number, title: string, subtitle: string, titleSize: number): Buffer {
  const safeTitle = escapeXml(title);
  const safeSubtitle = escapeXml(subtitle);
  return Buffer.from([
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`,
    '<rect width="100%" height="100%" fill="#111"/>',
    `<text x="${width / 2}" y="${Math.min(height - 22, Math.max(26, titleSize + 8))}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${titleSize}" fill="#fff">${truncate(safeTitle, 28)}</text>`,
    safeSubtitle
      ? `<text x="${width / 2}" y="${height - 24}" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#ccc">${truncate(safeSubtitle, 48)}</text>`
      : '',
    '</svg>',
  ].join(''));
}

function placeholderSvg(width: number, height: number, label: string): Buffer {
  return Buffer.from([
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`,
    '<rect width="100%" height="100%" fill="#333"/>',
    `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#ddd">${escapeXml(label)}</text>`,
    '</svg>',
  ].join(''));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
