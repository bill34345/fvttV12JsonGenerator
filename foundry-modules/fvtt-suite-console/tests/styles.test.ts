import { expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

it('keeps multiline commands readable under the Core inline-code styles without changing the host', () => {
  const dom = new JSDOM('<!doctype html><head></head><body><code id="outside"></code><div class="fvtt-suite-console"><div class="handbook-root"><pre class="command"><code></code></pre></div></div></body>');
  const { document } = dom.window;
  const hostStyle = document.createElement('style');
  // Relevant Core 14.368 inline-code behavior, not a copy of its stylesheet.
  hostStyle.textContent = 'code { display: inline-block; white-space: nowrap; word-break: keep-all; padding: 1px 4px; margin: -1px 0; }';
  const moduleStyle = document.createElement('style');
  moduleStyle.textContent = readFileSync(new URL('../src/styles/suite-handbook.css', import.meta.url), 'utf8');
  document.head.append(hostStyle, moduleStyle);
  const code = document.querySelector<HTMLElement>('.command > code')!;
  const command = 'bun run web:build\nbun run web:start';
  code.textContent = command;
  const actual = dom.window.getComputedStyle(code);
  expect(actual.display).toBe('block');
  expect(actual.whiteSpace).toBe('pre-wrap');
  expect(actual.overflowWrap).toBe('anywhere');
  expect(actual.wordBreak).toBe('break-word');
  expect(actual.padding).toBe('0px');
  expect(code.textContent).toBe(command);
  const outside = dom.window.getComputedStyle(document.getElementById('outside')!);
  expect(outside.whiteSpace).toBe('nowrap');
  expect(outside.display).toBe('inline-block');
  dom.window.close();
});
