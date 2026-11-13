import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPdfLayoutPage, extractBrowserPdfSource, findPdfTargetPages, orderPdfLayoutLines, type PdfJsEngine } from '@fvtt-json-generator/forge-browser-runtime/pdf-source';
import { FORGE_PDF_ENGINE_VERSION, type BrowserPdfSource, type PdfRawTextItem } from '@fvtt-json-generator/forge-browser-runtime/pdf-types';

const assets = pathToFileURL(resolve('packages/forge-browser-runtime/node_modules/pdfjs-dist/build') + '/').href;
async function realEngine(): Promise<PdfJsEngine> {
  const pdfjs: PdfJsEngine = await import(new URL('pdf.mjs', assets).href);
  return { ...pdfjs, getDocument(options: any) {
    const packageRoot = new URL('../', assets);
    return pdfjs.getDocument({ ...options, useWorkerFetch: false,
      cMapUrl: fileURLToPath(new URL('cmaps/', packageRoot)).replace(/\\/g, '/'),
      standardFontDataUrl: fileURLToPath(new URL('standard_fonts/', packageRoot)).replace(/\\/g, '/') });
  } };
}

function textItem(str: string, x: number, y: number, width: number, size = 10): PdfRawTextItem {
  return { str, transform: [size, 0, 0, size, x, y], width, height: size, dir: 'ltr', fontName: 'f1', hasEOL: false };
}
function pdf(content: string): Uint8Array {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let output = '%PDF-1.4\n'; const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(output.length); output += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const start = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) output += `${String(offset).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new TextEncoder().encode(output);
}

describe('Forge browser PDF source', () => {
  test('real pinned PDF.js reads PDF bytes, hashes the untouched file and preserves raw items', async () => {
    const bytes = pdf('BT /F1 18 Tf 30 740 Td (Tide Stalker) Tj ET\nBT /F1 10 Tf 30 720 Td (AC 14 HP 27) Tj ET');
    const before = bytes.slice();
    const source = await extractBrowserPdfSource({ name: 'tide.pdf', data: bytes }, { assetBaseUrl: assets, engine: await realEngine() });
    expect(source.engineVersion).toBe(FORGE_PDF_ENGINE_VERSION);
    expect(source.sourceSha256).toBe(createHash('sha256').update(before).digest('hex'));
    expect(bytes).toEqual(before);
    expect(source.pages[0]!.lines.map(line => line.text)).toEqual(['Tide Stalker', 'AC 14 HP 27']);
    expect(source.pages[0]!.rawItems.some(item => item.str === 'AC 14 HP 27')).toBe(true);
    expect(source.pages[0]!.lines.every(line => Object.values(line.bbox).every(Number.isFinite))).toBe(true);
    expect(source.pages[0]!.lines[0]!.bold).toBeNull();
    expect(findPdfTargetPages(source, 'Tide Stalker')).toEqual([1]);
  });

  test('unknown font metrics keep finite derived coordinates and independent columns', () => {
    const items = [textItem('Left first', 40, 700, 210), textItem('Right first', 330, 700, 210),
      textItem('Left second', 40, 680, 210), textItem('Right second', 330, 680, 210),
      textItem('Left third', 40, 660, 210), textItem('Right third', 330, 660, 210), textItem('Con 15 +2 +6', 245, 740, 65)];
    const frozen = structuredClone(items);
    const page = buildPdfLayoutPage({ pageNumber: 4, width: 600, height: 800, rotation: 0, transform: [1, 0, 0, -1, 0, 800],
      rawItems: items, rawStyles: { f1: { fontFamily: 'sans-serif', ascent: null, descent: null, vertical: null } } });
    expect(page.rawItems).toEqual(frozen);
    expect(page.lines).toHaveLength(7);
    expect(page.lines.every(line => Object.values(line.bbox).every(Number.isFinite))).toBe(true);
    const ordered = orderPdfLayoutLines(page.lines, page.width).map(line => line.text);
    expect(ordered).toEqual(['Con 15 +2 +6', 'Left first', 'Left second', 'Left third', 'Right first', 'Right second', 'Right third']);
    expect(page.lines[0]!.id).toBe('p4-l1');
  });

  test('Chinese and mixed text keep source strings and lineage without pretending glyph accuracy', () => {
    const items = [textItem('畸变', 40, 740, 20), textItem('源石虫', 60, 740, 30), textItem('HP 9', 40, 720, 30)];
    const page = buildPdfLayoutPage({ pageNumber: 72, width: 600, height: 800, rotation: 0, transform: [1, 0, 0, -1, 0, 800], rawItems: items, rawStyles: {} });
    expect(page.lines.map(line => line.text)).toEqual(['畸变源石虫', 'HP 9']);
    expect(page.lines[0]!.language).toBe('zh-CN');
    expect(page.lines[0]!.itemIndexes).toEqual([0, 1]);
    expect(page.warnings).toContain('text-items-not-glyphs');
    const source: BrowserPdfSource = { schemaVersion: 1, sourceName: 'source.pdf', sourceSha256: '0'.repeat(64), engine: 'pdfjs', engineVersion: FORGE_PDF_ENGINE_VERSION, pageCount: 80, pages: [page] };
    expect(findPdfTargetPages(source, '畸变源石虫')).toEqual([72]);
    expect(findPdfTargetPages(source, '畸变源石虫', [73])).toEqual([]);
  });

  test('invalid signatures, physical pages and caller cancellation fail before model processing', async () => {
    await expect(extractBrowserPdfSource({ name: 'fake.pdf', data: new TextEncoder().encode('not PDF') }, { assetBaseUrl: assets })).rejects.toThrow('不是 PDF');
    const controller = new AbortController(); controller.abort(new DOMException('Stopped', 'AbortError'));
    await expect(extractBrowserPdfSource({ name: 'source.pdf', data: pdf('') }, { assetBaseUrl: assets, signal: controller.signal })).rejects.toThrow('Stopped');
    await expect(extractBrowserPdfSource({ name: 'source.pdf', data: pdf('') }, { assetBaseUrl: assets, engine: await realEngine(), pages: [2] })).rejects.toThrow('页码无效');
  });
});
