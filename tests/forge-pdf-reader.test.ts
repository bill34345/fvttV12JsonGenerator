import { describe, expect, test } from 'bun:test';
import { readBrowserPdfMonster, renderPdfReadingMarkdown } from '@fvtt-json-generator/forge-browser-runtime/pdf-reader';
import { FORGE_PDF_ENGINE_VERSION, type BrowserPdfSource, type PdfLayoutPage, type PdfReaderModel, type PdfSourceLine } from '@fvtt-json-generator/forge-browser-runtime/pdf-types';

function line(id: string, text: string, x = 40, y = 40): PdfSourceLine {
  return { id, text, bbox: { x, y, width: 220, height: 12 }, fontSize: 12, bold: null,
    itemIndexes: [], method: 'native-pdf-text', language: 'en', confidence: null };
}
function page(number: number, lines: PdfSourceLine[]): PdfLayoutPage {
  return { pageNumber: number, width: 600, height: 800, rotation: 0, warnings: [], rawItems: [], rawStyles: {}, lines };
}
const source: BrowserPdfSource = { schemaVersion: 1, engine: 'pdfjs', engineVersion: FORGE_PDF_ENGINE_VERSION,
  sourceName: 'source.pdf', sourceSha256: 'a'.repeat(64), pageCount: 4,
  pages: [page(1, [line('p1-l1', 'Tide Stalker'), line('p1-l2', 'AC 14 HP 27'), line('p1-l3', 'Bite. Hit: 7 (2d6) Piercing damage.')]),
    page(4, [line('p4-l1', 'Definition. The condition ends after 1 minute.')])] };
const prose = '# Tide Stalker\nAC 14 HP 27\nBite. Hit: 7 (2d6) Piercing damage.';
function answer(markdown = prose, additionalPages: number[] = []) {
  return JSON.stringify({ notFound: false, additionalPages, monsters: [{ name: 'Tide Stalker', markdown,
    sourceLineIds: ['p1-l1', 'p1-l2', 'p1-l3'], doubts: [] }] });
}

describe('Forge PDF original-language reader', () => {
  test('one reconstruction uses original-language context and has no audit or automatic correction call', async () => {
    const requests: any[] = [];
    const result = await readBrowserPdfMonster({ source, monster: 'Tide Stalker' }, { model: { async complete(request) {
      requests.push(request); return { content: answer(), model: 'fixture' };
    } } });
    expect(requests).toHaveLength(1);
    expect(requests[0].instruction).toContain('Do not summarize, translate');
    expect(JSON.parse(requests[0].input).sourcePages[0].lines[0].id).toBe('p1-l1');
    expect(result.status).toBe('completed');
    expect(result.outputs[0]!.markdown).toBe(prose);
    expect(result.outputs[0]!.pageNumbers).toEqual([1]);
    expect(result.sourcePageNumbers).toEqual([1]);
    expect(result.calls.map(call => call.phase)).toEqual(['reconstruct']);
    expect(renderPdfReadingMarkdown(result)).toContain('"sha256":"' + source.sourceSha256 + '"');
  });

  test('numeric drift and invalid citations report doubts while obtained Markdown remains deliverable', async () => {
    const markdown = prose.replace('2d6', '3d6');
    const result = await readBrowserPdfMonster({ source, monster: 'Tide Stalker' }, { model: { async complete() {
      const result = JSON.parse(answer(markdown)); result.monsters[0].sourceLineIds.push('p99-l1'); return { content: JSON.stringify(result) };
    } } });
    expect(result.status).toBe('with_doubts');
    expect(result.outputs[0]!.markdown).toBe(markdown);
    expect(result.outputs[0]!.sourceLineIds).toContain('p99-l1');
    expect(result.doubts.join(' ')).toContain('3d6');
  });

  test('only explicitly requested same-book context causes a second pass, and failure preserves the first reading', async () => {
    let calls = 0;
    const result = await readBrowserPdfMonster({ source, monster: 'Tide Stalker' }, { model: { async complete(request) {
      calls++;
      if (calls === 1) return { content: answer(prose, [4]) };
      expect(JSON.parse(request.input).sourcePages.some((page: any) => page.pageNumber === 4)).toBe(true);
      throw Error('Provider stopped');
    } } });
    expect(calls).toBe(2);
    expect(result.status).toBe('with_doubts');
    expect(result.outputs[0]!.markdown).toBe(prose);
    expect(result.failures).toContain('Provider stopped');
    expect(result.responses).toHaveLength(1);
    expect(result.sourcePageNumbers).toEqual([1, 4]);
  });

  test('unavailable context and an empty retry do not destroy previously obtained text', async () => {
    let calls = 0;
    const result = await readBrowserPdfMonster({ source, monster: 'Tide Stalker' }, { model: { async complete() {
      calls++;
      return { content: calls === 1 ? answer(prose, [4, 3]) : JSON.stringify({ notFound: false, additionalPages: [], monsters: [] }) };
    } } });
    expect(result.outputs[0]!.markdown).toBe(prose);
    expect(result.status).toBe('with_doubts');
    expect(result.doubts.join(' ')).toContain('第 3 页');
  });

  test('an empty context reply remains a doubt even when the requested page was available', async () => {
    let calls = 0;
    const result = await readBrowserPdfMonster({ source, monster: 'Tide Stalker' }, { model: { async complete() {
      return { content: ++calls === 1 ? answer(prose, [4]) : JSON.stringify({ notFound: false, additionalPages: [], monsters: [] }) };
    } } });
    expect(result.outputs[0]!.markdown).toBe(prose);
    expect(result.status).toBe('with_doubts');
    expect(result.doubts.join(' ')).toContain('未提供新的生物正文');
  });

  test('a context reply with only blank creature bodies preserves the first complete reading', async () => {
    let calls = 0;
    const result = await readBrowserPdfMonster({ source, monster: 'Tide Stalker' }, { model: { async complete() {
      return { content: ++calls === 1 ? answer(prose, [4]) : answer(' \n\t ') };
    } } });
    expect(calls).toBe(2);
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]!.markdown).toBe(prose);
    expect(result.outputs[0]!.sourceLineIds).toEqual(['p1-l1', 'p1-l2', 'p1-l3']);
    expect(result.status).toBe('with_doubts');
    expect(result.doubts.join(' ')).toContain('未提供新的生物正文');
    expect(result.responses).toHaveLength(2);
  });

  test('a context reply updates its matching variant without deleting omitted variants', async () => {
    let calls = 0;
    const elderMarkdown = prose.replace('# Tide Stalker', '# Tide Stalker Elder');
    const updatedMarkdown = prose + '\nDefinition. The condition ends after 1 minute.';
    const result = await readBrowserPdfMonster({ source, monster: 'Tide Stalker' }, { model: { async complete() {
      if (++calls === 1) {
        const value = JSON.parse(answer(prose, [4]));
        value.monsters.push({ ...value.monsters[0], name: 'Tide Stalker Elder', markdown: elderMarkdown });
        return { content: JSON.stringify(value) };
      }
      const value = JSON.parse(answer(updatedMarkdown));
      value.monsters[0].name = 'TIDE STALKER';
      value.monsters[0].sourceLineIds.push('p4-l1');
      return { content: JSON.stringify(value) };
    } } });
    expect(calls).toBe(2);
    expect(result.outputs.map(output => output.name)).toEqual(['TIDE STALKER', 'Tide Stalker Elder']);
    expect(result.outputs[0]!.markdown).toBe(updatedMarkdown);
    expect(result.outputs[0]!.pageNumbers).toEqual([1, 4]);
    expect(result.outputs[1]!.markdown).toBe(elderMarkdown);
    expect(result.outputs[1]!.pageNumbers).toEqual([1]);
    expect(renderPdfReadingMarkdown(result)).toContain(elderMarkdown);
  });

  test('unsupplied source IDs remain visible without claiming a verified source page', async () => {
    const result = await readBrowserPdfMonster({ source, monster: 'Tide Stalker' }, { model: { async complete() {
      const value = JSON.parse(answer()); value.monsters[0].sourceLineIds.push('p4-l1'); return { content: JSON.stringify(value) };
    } } });
    expect(result.status).toBe('with_doubts');
    expect(result.outputs[0]!.sourceLineIds).toContain('p4-l1');
    expect(result.outputs[0]!.pageNumbers).toEqual([1]);
  });

  test('not-found targets do not call a model and no-text pages explain the unsupported scan', async () => {
    const model: PdfReaderModel = { async complete() { throw Error('Unexpected model call'); } };
    const missing = await readBrowserPdfMonster({ source, monster: 'Unknown' }, { model });
    expect(missing.status).toBe('not_found');
    expect(missing.sourcePageNumbers).toEqual([]);
    const result = await readBrowserPdfMonster({ source: { ...source, pages: [page(1, [])] }, monster: 'Unknown' }, { model });
    expect(result.doubts.join(' ')).toContain('扫描型');
  });

  test('all returned matching variants and malformed response text are retained', async () => {
    const result = await readBrowserPdfMonster({ source, monster: 'Tide Stalker' }, { model: { async complete() {
      const value = JSON.parse(answer()); value.monsters.push({ ...value.monsters[0], name: 'Tide Stalker Elder' });
      return { content: JSON.stringify(value) };
    } } });
    expect(result.outputs.map(output => output.name)).toEqual(['Tide Stalker', 'Tide Stalker Elder']);
    const malformed = await readBrowserPdfMonster({ source, monster: 'Tide Stalker' }, { model: { async complete() { return { content: '{bad reply' }; } } });
    expect(malformed.status).toBe('failed');
    expect(malformed.responses[0]!.content).toBe('{bad reply');
  });

  test('each returned creature receives a source heading without duplicating an existing heading', async () => {
    const result = await readBrowserPdfMonster({ source, monster: 'Tide Stalker' }, { model: { async complete() {
      const value = JSON.parse(answer());
      value.monsters.push({ ...value.monsters[0], name: 'Tide Stalker Elder', markdown: 'AC 14 HP 27' });
      return { content: JSON.stringify(value) };
    } } });
    const markdown = renderPdfReadingMarkdown(result);
    expect(markdown.match(/^# Tide Stalker$/gmu)).toHaveLength(1);
    expect(markdown.match(/^# Tide Stalker Elder$/gmu)).toHaveLength(1);
    expect(markdown).toContain('AC 14 HP 27');
    expect(markdown.indexOf('# Tide Stalker Elder')).toBeGreaterThan(markdown.indexOf('# Tide Stalker'));
  });
});
