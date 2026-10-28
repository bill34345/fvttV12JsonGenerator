import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { buildModule } from '../build.ts';

describe('runtime distribution boundary', () => {
  test('ships a script-free popout document without socket or second-client code', async () => {
    const result = await buildModule();
    const browser = await readFile(resolve(result.moduleRoot, 'scripts/index.js'), 'utf8');
    const shell = new JSDOM(await readFile(resolve(result.moduleRoot, 'templates/popout.html'), 'utf8')).window.document;
    expect(shell.scripts.length).toBe(0);
    expect(shell.querySelector('iframe')).toBeNull();
    expect(shell.body.childElementCount).toBe(0);
    expect(browser).not.toContain('game.socket');
    expect(browser).not.toContain('new WebSocket');
    expect(browser).not.toContain('/join');
  }, 15_000);
});
