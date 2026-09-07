import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startWebServer } from '../index';
import { getWebSecurityConfig } from '../security/config';

test('real Web listener serves built assets and SPA routes, rejects malformed paths, and stops', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fvtt-server-lifecycle-'));
  const webRoot = join(root, 'web'); mkdirSync(webRoot);
  writeFileSync(join(root, 'private.txt'), 'outside-root-secret');
  writeFileSync(join(webRoot, 'index.html'), '<main>workbench</main>');
  const formats = { js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bin: 'application/octet-stream' };
  for (const extension of Object.keys(formats)) writeFileSync(join(webRoot, `asset.${extension}`), `asset:${extension}`);
  const server = startWebServer({ securityConfig: { ...getWebSecurityConfig({}), port: 0 }, webRoot, env: {} });
  const base = server.url.toString();
  try {
    for (const [extension, type] of Object.entries(formats)) {
      const response = await fetch(`${base}asset.${extension}`);
      expect(response.headers.get('content-type')).toContain(type);
      expect(await response.text()).toBe(`asset:${extension}`);
    }
    for (const route of ['', 'jobs/example', '%2e%2e%2fprivate.txt']) {
      const response = await fetch(base + route);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('<main>workbench</main>');
    }
    expect((await fetch(base + '%ZZ')).status).toBe(400);
    expect((await fetch(base + 'api/capabilities')).status).toBe(200);
    expect((await fetch(base + 'api/nonexistent')).status).toBe(404);
    expect((await fetch(base + 'api/ai-companion/connect', { headers: { upgrade: 'websocket' } })).status).toBe(403);
  } finally {
    await server.stop(true);
    rmSync(root, { recursive: true });
  }
  await expect(fetch(base, { signal: AbortSignal.timeout(500) })).rejects.toThrow();
});

test('real Web listener preserves public authentication and reports a missing build', async () => {
  const root = mkdtempSync(join(tmpdir(), 'fvtt-server-lifecycle-'));
  const token = 'local-test-token-'.repeat(3);
  const config = getWebSecurityConfig({ FVTT_WEB_PUBLIC_MODE: '1', FVTT_WEB_AUTH_TOKEN: token, FVTT_WEB_SESSION_SECRET: 'local-session-secret-'.repeat(3) });
  const server = startWebServer({ securityConfig: { ...config, port: 0 }, webRoot: root, env: {} });
  const base = server.url.toString();
  try {
    expect((await fetch(base + 'api/capabilities')).status).toBe(401);
    expect((await fetch(base + 'api/capabilities', { headers: { authorization: `Bearer ${token}` } })).status).toBe(200);
    const response = await fetch(base);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain('web build not found');
  } finally { await server.stop(true); rmSync(root, { recursive: true }); }
});
