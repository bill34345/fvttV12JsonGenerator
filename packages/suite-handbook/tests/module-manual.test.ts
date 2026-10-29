import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { renderModuleManual, type ModuleManual } from '../src/index';

test('independent module text and commands stay inert without changing the host or input', () => {
  const dom = new JSDOM('<title>World</title><main id="host">Keep this</main>', { url: 'https://example.invalid/game#scene' });
  const manual: ModuleManual = {
    title: '<img src=x onerror=alert(1)>', summary: '说明', when: '阅读时', requires: ['条件'],
    steps: [{ title: '检查', text: '<script>throw new Error()</script>', command: 'game.messages.deleteAll()' }],
    outputs: ['只读说明'], limits: ['不执行命令'],
  };
  const original = JSON.stringify(manual);
  const body = dom.window.document.body.innerHTML;
  const url = dom.window.location.href;
  try {
    const article = renderModuleManual(dom.window.document, manual);
    expect(article.isConnected).toBeFalse();
    expect(article.ownerDocument).toBe(dom.window.document);
    expect(article.textContent).toContain(manual.title);
    expect(article.textContent).toContain(manual.steps[0]!.text);
    expect(article.querySelector('pre code')!.textContent).toBe(manual.steps[0]!.command!);
    expect(article.querySelector('img, script, form, button, input, a')).toBeNull();
    expect(dom.window.document.body.innerHTML).toBe(body);
    expect(dom.window.document.title).toBe('World');
    expect(dom.window.location.href).toBe(url);
    expect(dom.window.localStorage.length).toBe(0);
    expect(JSON.stringify(manual)).toBe(original);
  } finally { dom.window.close(); }
});
