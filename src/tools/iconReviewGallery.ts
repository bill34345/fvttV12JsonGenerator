import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { IconReviewEntry, IconReviewReport } from '../core/icons/types';

const ROOT = resolve(import.meta.dir, '../..');
const CORE_PUBLIC_ROOT = resolve(ROOT, '.local/foundry-v14/app/14.364/public');
const DND5E_ROOT = resolve(ROOT, '.local/foundry-v14/data/server-mirror/Data/systems/dnd5e');

export function resolveInstalledIconPath(iconPath: string): string {
  if (iconPath.startsWith('icons/')) {
    return resolve(CORE_PUBLIC_ROOT, iconPath);
  }
  if (iconPath.startsWith('systems/dnd5e/')) {
    return resolve(DND5E_ROOT, iconPath.slice('systems/dnd5e/'.length));
  }
  throw new Error(`Unsupported icon path in v14 review report: ${iconPath}`);
}

export function renderIconReviewGallery(report: IconReviewReport): string {
  const cards = report.entries.map(renderEntry).join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Foundry v14 图标审阅</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #111827; color: #e5e7eb; }
    body { margin: 0; padding: 24px; }
    h1 { margin: 0 0 8px; }
    .summary { color: #9ca3af; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(280px,1fr)); gap: 16px; }
    article { display: grid; grid-template-columns: 88px 1fr; gap: 14px; padding: 14px; border: 1px solid #374151; border-radius: 10px; background: #1f2937; }
    img { width: 88px; height: 88px; object-fit: contain; border-radius: 8px; background: #0f172a; }
    h2 { font-size: 16px; margin: 0 0 4px; }
    p { font-size: 12px; margin: 3px 0; overflow-wrap: anywhere; }
    .fallback { border-color: #92400e; }
    .exact { border-color: #166534; }
    .high { border-color: #1d4ed8; }
    .missing { border-color: #b91c1c; }
    code { color: #c4b5fd; }
  </style>
</head>
<body>
  <h1>Foundry v14 图标审阅</h1>
  <div class="summary">Foundry ${escapeHtml(report.target.foundryVersion)} · dnd5e ${escapeHtml(report.target.systemVersion)} · ${report.summary.total} 项 · 精确 ${report.summary.exact} · 语义 ${report.summary.semantic} · 回退 ${report.summary.fallback}</div>
  <main class="grid">${cards}</main>
</body>
</html>
`;
}

export function writeIconReviewGallery(
  reportPath: string,
  outputPath: string,
): { outputPath: string; missing: string[] } {
  const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as IconReviewReport;
  const missing = report.entries
    .map((entry) => entry.selectedPath)
    .filter((path) => !existsSync(resolveInstalledIconPath(path)));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderIconReviewGallery(report), 'utf-8');
  return { outputPath, missing: [...new Set(missing)].sort() };
}

function renderEntry(entry: IconReviewEntry): string {
  const installedPath = resolveInstalledIconPath(entry.selectedPath);
  const exists = existsSync(installedPath);
  const title = entry.englishName
    ? `${entry.itemName} (${entry.englishName})`
    : entry.itemName;
  const reason = entry.reasons.join(' ');
  return `<article class="${escapeHtml(entry.confidence)}${exists ? '' : ' missing'}">
    <img src="${escapeHtml(pathToFileURL(installedPath).href)}" alt="${escapeHtml(title)}">
    <div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(entry.actorName ?? '独立 Item')} · ${escapeHtml(entry.itemType)}</p>
      <p><strong>${escapeHtml(entry.source)}</strong> / ${escapeHtml(entry.confidence)}</p>
      <p><code>${escapeHtml(entry.selectedPath)}</code></p>
      <p>${escapeHtml(reason)}</p>
    </div>
  </article>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!);
}

if (import.meta.main) {
  const reportPath = cliValue('--report');
  if (!reportPath) {
    throw new Error('Usage: bun run src/tools/iconReviewGallery.ts --report <icon-review.json> [--output <gallery.html>]');
  }
  const outputPath = cliValue('--output') ?? reportPath.replace(/\.json$/iu, '.html');
  const result = writeIconReviewGallery(resolve(reportPath), resolve(outputPath));
  if (result.missing.length > 0) {
    throw new Error(`Gallery contains unavailable installed icon paths:\n${result.missing.join('\n')}`);
  }
  console.log(`Icon review gallery: ${result.outputPath}`);
}

function cliValue(flag: string): string | undefined {
  const index = Bun.argv.indexOf(flag);
  return index >= 0 ? Bun.argv[index + 1] : undefined;
}
