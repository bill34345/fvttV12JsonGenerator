import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { handleApiRequest } from '../../api';
import { jobDir, resetJobsForTests } from '../../jobs/jobStore';
import { getWebSecurityConfig } from '../../security/config';
import { createAiConnectionsRuntime } from '../runtime';

afterEach(() => resetJobsForTests());

describe('AI connection API integration', () => {
  it('mounts the connection API and requires an explicit connection for AI jobs', async () => {
    const securityConfig = getWebSecurityConfig({});
    const aiRuntime = createAiConnectionsRuntime(securityConfig.aiConnections);
    const initial = await handleApiRequest(new Request('http://localhost/api/ai-connections'), { securityConfig, aiRuntime });
    expect(initial.status).toBe(200);
    expect(initial.headers.get('set-cookie')).toContain('HttpOnly');

    const missing = await handleApiRequest(new Request('http://localhost/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'ai-monster-intake', fileName: 'sample.txt', content: 'sample' }),
    }), { securityConfig, aiRuntime });
    const body = await missing.json();
    expect(missing.status).toBe(400);
    expect(body.error.code).toBe('AI_CONNECTION_REQUIRED');
  });

  it('pins the opaque connection to the job without persisting the BYOK secret', async () => {
    const securityConfig = getWebSecurityConfig({});
    const aiRuntime = createAiConnectionsRuntime(securityConfig.aiConnections, {
      fetcher: async () => new Response('{}', { status: 500 }),
    });
    const bootstrap = await getSession(securityConfig, aiRuntime);
    const created = await handleApiRequest(stateRequest('/api/ai-connections/byok', bootstrap, {
      apiKey: 'sk-must-not-persist', baseUrl: 'https://api.openai.com/v1', model: 'test-model', reviewModel: 'test-review', reasoningEffort: 'high',
    }), { securityConfig, aiRuntime });
    const connection = (await created.json()).data;

    const started = await handleApiRequest(stateRequest('/api/jobs', bootstrap, {
      type: 'ai-item-intake', fileName: 'item.txt', content: '测试物品', aiConnectionId: connection.id,
      options: { fvttVersion: '14', effectProfile: 'core', iconMode: 'off' },
    }), { securityConfig, aiRuntime });
    const job = (await started.json()).data;
    expect(started.status).toBe(200);
    expect(job.aiConnectionId).toBe(connection.id);
    expect(JSON.stringify(job)).not.toContain('sk-must-not-persist');

    const persistedPath = join(jobDir(job.id), 'result.json');
    expect(existsSync(persistedPath)).toBe(true);
    expect(readFileSync(persistedPath, 'utf8')).not.toContain('sk-must-not-persist');
  });

  it('does not let another anonymous session inspect an AI job', async () => {
    const securityConfig = getWebSecurityConfig({});
    const aiRuntime = createAiConnectionsRuntime(securityConfig.aiConnections);
    const owner = await getSession(securityConfig, aiRuntime);
    const created = await handleApiRequest(stateRequest('/api/ai-connections/byok', owner, {
      apiKey: 'sk-owner-only', baseUrl: 'https://api.openai.com/v1', model: 'test-model', reviewModel: 'test-model', reasoningEffort: 'high',
    }), { securityConfig, aiRuntime });
    const connection = (await created.json()).data;
    const started = await handleApiRequest(stateRequest('/api/jobs', owner, {
      type: 'ai-item-intake', fileName: 'item.txt', content: '测试物品', aiConnectionId: connection.id,
      options: { fvttVersion: '14', effectProfile: 'core', iconMode: 'off' },
    }), { securityConfig, aiRuntime });
    const job = (await started.json()).data;
    const attacker = await getSession(securityConfig, aiRuntime);
    const inspected = await handleApiRequest(new Request(`http://localhost/api/jobs/${job.id}`, {
      headers: { cookie: attacker.cookie },
    }), { securityConfig, aiRuntime });
    expect(inspected.status).toBe(404);
  });
});

async function getSession(securityConfig: ReturnType<typeof getWebSecurityConfig>, aiRuntime: ReturnType<typeof createAiConnectionsRuntime>) {
  const response = await handleApiRequest(new Request('http://localhost/api/ai-connections'), { securityConfig, aiRuntime });
  const body = await response.clone().json();
  return { cookie: response.headers.get('set-cookie')!.split(';', 1)[0]!, csrf: body.data.csrfToken as string };
}

function stateRequest(path: string, session: { cookie: string; csrf: string }, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { cookie: session.cookie, origin: 'http://localhost', 'x-fvtt-csrf': session.csrf, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
