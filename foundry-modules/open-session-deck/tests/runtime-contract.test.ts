import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildModule } from '../build.ts';

describe('runtime distribution boundary', () => {
  test('ships a blank-window presentation surface without socket or second-client code', async () => {
    const result = await buildModule();
    const browser = await readFile(resolve(result.moduleRoot, 'scripts/index.js'), 'utf8');
    const surfaceSource = await readFile(resolve(import.meta.dir, '../src/surfaces.ts'), 'utf8');
    expect(surfaceSource).toContain("window.open('', POPOUT_NAME");
    expect(browser).not.toContain('game.socket');
    expect(browser).not.toContain('new WebSocket');
    expect(browser).not.toContain('/join');
  });
});
