import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { FORGE_PDF_ENGINE_VERSION, type BrowserPdfSource, type PdfLayoutPage, type PdfRawTextItem, type PdfRawTextStyle, type PdfSourceLine } from './pdfTypes';

export type PdfJsEngine = Pick<typeof import('pdfjs-dist'), 'getDocument' | 'GlobalWorkerOptions' | 'Util' | 'version'>;
export type PdfJsArtEngine = PdfJsEngine & Pick<typeof import('pdfjs-dist'), 'OPS' | 'ImageKind'>;
export interface ExtractBrowserPdfOptions {
  assetBaseUrl: string;
  pages?: number[];
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  engine?: PdfJsEngine;
}

export async function extractBrowserPdfSource(input: { name: string; data: Uint8Array }, options: ExtractBrowserPdfOptions): Promise<BrowserPdfSource> {
  if (!input.name.trim() || !input.data.byteLength) throw new TypeError('请选择有内容的 PDF 文件。');
  if (!new TextDecoder('latin1').decode(input.data.subarray(0, 1024)).includes('%PDF-')) throw new TypeError('所选文件不是 PDF。');
  const sourceSha256 = sha256(input.data);
  options.signal?.throwIfAborted();
  const base = assetBase(options.assetBaseUrl);
  const moduleUrl = new URL('pdf.mjs', base).href;
  const engine: PdfJsEngine = options.engine ?? await import(moduleUrl);
  if (engine.version !== FORGE_PDF_ENGINE_VERSION) throw new Error(`PDF 读取组件版本不一致：需要 ${FORGE_PDF_ENGINE_VERSION}。`);
  engine.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.mjs', base).href;
  const loading = engine.getDocument({ data: input.data.slice(), cMapUrl: new URL('cmaps/', base).href, cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', base).href, wasmUrl: new URL('wasm/', base).href,
    useWasm: false, useWorkerFetch: true, disableFontFace: true, useSystemFonts: false, stopAtErrors: false });
  let destruction: Promise<void> | undefined;
  const destroy = () => destruction ??= loading.destroy();
  const abort = () => { void destroy(); };
  options.signal?.addEventListener('abort', abort, { once: true });
  loading.onPassword = () => { void destroy(); };
  try {
    const document = await loading.promise;
    options.signal?.throwIfAborted();
    const pages = pageNumbers(options.pages, document.numPages);
    const source: BrowserPdfSource = { schemaVersion: 1, engine: 'pdfjs', engineVersion: FORGE_PDF_ENGINE_VERSION,
      sourceName: input.name, sourceSha256, pageCount: document.numPages, pages: [] };
    for (const pageNumber of pages) {
      options.signal?.throwIfAborted();
      options.onProgress?.(`正在读取 PDF 第 ${pageNumber}/${document.numPages} 页。`);
      const page = await document.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent({ disableNormalization: true });
        const rawItems: PdfRawTextItem[] = content.items.filter((item): item is import('pdfjs-dist/types/src/display/api').TextItem => 'str' in item)
          .map(item => ({ str: item.str, dir: item.dir, transform: [...item.transform], width: item.width, height: item.height,
            fontName: item.fontName, hasEOL: item.hasEOL }));
        const rawStyles = Object.fromEntries(Object.entries(content.styles).map(([name, style]) => [name,
          { fontFamily: style.fontFamily, ascent: Number.isFinite(style.ascent) ? style.ascent : null,
            descent: Number.isFinite(style.descent) ? style.descent : null, vertical: typeof style.vertical === 'boolean' ? style.vertical : null }]));
        source.pages.push(buildPdfLayoutPage({ pageNumber, width: viewport.width, height: viewport.height, rotation: page.rotate,
          transform: viewport.transform, rawItems, rawStyles }));
      } finally { page.cleanup(); }
    }
    return source;
  } catch (error) {
    options.signal?.throwIfAborted();
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', abort);
    await destroy();
  }
}

interface PositionedItem { index: number; item: PdfRawTextItem; x: number; y: number; baseline: number; width: number; height: number; size: number }

export function buildPdfLayoutPage(input: { pageNumber: number; width: number; height: number; rotation: number; transform: number[];
  rawItems: PdfRawTextItem[]; rawStyles: Record<string, PdfRawTextStyle> }): PdfLayoutPage {
  const positioned = input.rawItems.map((item, index) => positionItem(item, index, input.transform, input.rawStyles[item.fontName]));
  const groups: Array<{ baseline: number; size: number; items: PositionedItem[] }> = [];
  for (const item of positioned.filter(value => value.item.str.trim()).sort((a, b) => a.baseline - b.baseline || a.x - b.x)) {
    const group = groups.findLast(value => Math.abs(value.baseline - item.baseline) <= Math.max(1.25, Math.min(value.size, item.size) * 0.35));
    if (group) { group.items.push(item); group.baseline = median(group.items.map(value => value.baseline)); }
    else groups.push({ baseline: item.baseline, size: item.size, items: [item] });
  }
  const lines: PdfSourceLine[] = [];
  for (const group of groups) {
    const items = group.items.sort((a, b) => a.x - b.x);
    const threshold = Math.max(6, median(items.map(item => item.size)) * 0.85);
    let region: PositionedItem[] = [];
    for (const item of items) {
      const previous = region.at(-1);
      if (previous && item.x - (previous.x + previous.width) > threshold) { lines.push(sourceLine(region)); region = []; }
      region.push(item);
    }
    if (region.length) lines.push(sourceLine(region));
  }
  lines.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  lines.forEach((line, index) => { line.id = `p${input.pageNumber}-l${index + 1}`; });
  const warnings = ['font-weight-unavailable', 'text-items-not-glyphs'];
  if (!lines.length) warnings.push('no-text-layer');
  if (input.rawItems.some(item => item.dir !== 'ltr' || Math.abs(item.transform[1] ?? 0) > 0.01)) warnings.push('non-horizontal-or-ltr-text');
  return { pageNumber: input.pageNumber, width: input.width, height: input.height, rotation: input.rotation, warnings, lines,
    rawItems: input.rawItems, rawStyles: input.rawStyles };
}

export function findPdfTargetPages(source: BrowserPdfSource, target: string, restrict?: number[]): number[] {
  const key = normalizePdfText(target), exact = new Set<number>(), partial = new Set<number>();
  for (const page of source.pages) {
    if (restrict && !restrict.includes(page.pageNumber)) continue;
    const typical = median(page.lines.map(line => line.fontSize));
    for (const [index, line] of page.lines.entries()) {
      const name = normalizePdfText(line.text), heading = line.bold === true || line.fontSize >= typical * 1.12;
      if (name === key || heading && name.endsWith(key) && name.length <= key.length + 3) exact.add(page.pageNumber);
      if (heading && name.includes(key) && name.length < key.length * 2 + 16) partial.add(page.pageNumber);
      const next = page.lines[index + 1];
      if (next && Math.abs(next.bbox.x - line.bbox.x) < 25 && Math.abs(next.bbox.y - line.bbox.y) < 40 && normalizePdfText(line.text + next.text) === key) exact.add(page.pageNumber);
    }
  }
  return [...new Set([...exact, ...partial])].sort((a, b) => a - b);
}

/** Body starts determine columns; raw line IDs and raw item order never change. */
export function orderPdfLayoutLines(lines: PdfSourceLine[], width: number): PdfSourceLine[] {
  const body = lines.filter(line => line.bbox.width >= width * 0.18 && line.bbox.width <= width * 0.65);
  const clusters: Array<{ x: number; members: number[] }> = [];
  for (const line of [...body].sort((a, b) => a.bbox.x - b.bbox.x)) {
    const previous = clusters.at(-1);
    if (previous && line.bbox.x - previous.x <= Math.max(16, width * 0.04)) { previous.members.push(line.bbox.x); previous.x = median(previous.members); }
    else clusters.push({ x: line.bbox.x, members: [line.bbox.x] });
  }
  const starts = clusters.filter(cluster => cluster.members.length >= 3).map(cluster => cluster.x);
  if (starts.length < 2 || starts.at(-1)! - starts[0]! < width * 0.18) return [...lines];
  const column = (line: PdfSourceLine) => starts.reduce((best, value, index) => value <= line.bbox.x + Math.max(12, width * 0.02) ? index : best, 0);
  const firstBodyY = Math.min(...body.map(line => line.bbox.y));
  const header = lines.filter(line => line.bbox.width > width * 0.65 && line.bbox.y <= firstBodyY);
  const headerIds = new Set(header.map(line => line.id));
  return [...header, ...lines.filter(line => !headerIds.has(line.id)).sort((a, b) => column(a) - column(b) || a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x)];
}

export function normalizePdfText(value: string): string { return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); }
export function pdfPageHeadings(page: PdfLayoutPage): string[] {
  const typical = median(page.lines.map(line => line.fontSize));
  return page.lines.filter(line => line.bold === true || line.fontSize > typical * 1.12).map(line => line.text).slice(0, 12);
}

function assetBase(value: string): URL {
  const base = new URL(value.endsWith('/') ? value : value + '/');
  if (!['http:', 'https:', 'file:'].includes(base.protocol)) throw new TypeError('PDF 组件地址无效。');
  return base;
}

function pageNumbers(selected: number[] | undefined, count: number): number[] {
  if (selected && (!selected.length || selected.some(page => !Number.isSafeInteger(page) || page < 1 || page > count))) throw new TypeError('PDF 物理页码无效。');
  return selected ? [...new Set(selected)].sort((a, b) => a - b) : Array.from({ length: count }, (_, index) => index + 1);
}

function positionItem(item: PdfRawTextItem, index: number, viewport: number[], style?: PdfRawTextStyle): PositionedItem {
  const matrix = multiply(viewport, item.transform), size = Math.hypot(matrix[2]!, matrix[3]!) || item.height || 10;
  const axisLength = Math.hypot(matrix[0]!, matrix[1]!) || size;
  const scale = Math.hypot(viewport[0]!, viewport[1]!) || 1;
  const advance = item.width * scale, dx = matrix[0]! / axisLength * advance, dy = matrix[1]! / axisLength * advance;
  const ascent = style?.ascent ?? 0.8, descent = style?.descent ?? -0.2;
  const points = [ascent, descent].flatMap(offset => [
    [matrix[4]! + matrix[2]! * offset, matrix[5]! + matrix[3]! * offset],
    [matrix[4]! + matrix[2]! * offset + dx, matrix[5]! + matrix[3]! * offset + dy],
  ]);
  const xs = points.map(point => point[0]!), ys = points.map(point => point[1]!);
  return { item, index, x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys), baseline: matrix[5]!, size };
}

function multiply(a: number[], b: number[]): number[] {
  return [a[0]! * b[0]! + a[2]! * b[1]!, a[1]! * b[0]! + a[3]! * b[1]!,
    a[0]! * b[2]! + a[2]! * b[3]!, a[1]! * b[2]! + a[3]! * b[3]!,
    a[0]! * b[4]! + a[2]! * b[5]! + a[4]!, a[1]! * b[4]! + a[3]! * b[5]! + a[5]!];
}

function sourceLine(items: PositionedItem[]): PdfSourceLine {
  let text = '';
  for (const [index, item] of items.entries()) {
    const previous = items[index - 1];
    if (previous && text && !/\s$/u.test(text) && !/^\s/u.test(item.item.str)
      && item.x - previous.x - previous.width > Math.min(item.size, previous.size) * 0.15
      && !/[\u3400-\u9fff]$/u.test(text) && !/^[\u3400-\u9fff]/u.test(item.item.str)) text += ' ';
    text += item.item.str;
  }
  const x = Math.min(...items.map(item => item.x)), y = Math.min(...items.map(item => item.y));
  const cjk = /[\u3400-\u9fff]/u.test(text), latin = /[A-Za-z]/u.test(text);
  return { id: '', text: text.trim(), bbox: { x, y, width: Math.max(...items.map(item => item.x + item.width)) - x,
    height: Math.max(...items.map(item => item.y + item.height)) - y }, fontSize: median(items.map(item => item.size)), bold: null,
    itemIndexes: items.map(item => item.index), method: 'native-pdf-text', language: cjk ? latin ? 'mixed' : 'zh-CN' : latin ? 'en' : 'unknown', confidence: null };
}

function median(values: number[]): number { const sorted = values.filter(value => value > 0).sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 10; }
