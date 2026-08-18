import { describe, expect, it } from 'bun:test';

import { CompanionHub } from '../companionHub';

describe('CompanionHub', () => {
  it('bridges an Intake HTTP request without forwarding an API key', async () => {
    const hub = new CompanionHub({ requestTimeoutMs: 1_000 });
    const messages: string[] = [];
    const socket = {
      send(value: string) {
        messages.push(value);
      },
      close() {},
    };
    hub.open('companion-1', socket, [{ model: 'gpt-5.6-luna', reasoningEffort: 'xhigh' }]);
    const gate = JSON.parse(messages[0]!) as Record<string, unknown>;
    expect(gate.type).toBe('gate');
    hub.message('companion-1', JSON.stringify({
      type: 'gate-result',
      protocolVersion: 1,
      connectionId: 'companion-1',
      ok: true,
    }));
    const client = hub.request('companion-1');
    const responsePromise = client('https://companion.invalid/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: '{"model":"gpt-5.5"}',
    });
    const request = JSON.parse(await waitForMessage(messages, 2)) as Record<string, unknown>;
    expect(request.type).toBe('request');
    expect(request.url).toBe('/chat/completions');
    expect(JSON.stringify(request)).not.toContain('Bearer secret');
    hub.message('companion-1', JSON.stringify({
      type: 'response', protocolVersion: 1, requestId: request.requestId, status: 200,
      body: { choices: [{ message: { content: '{"ok":true}' } }] },
    }));
    const response = await responsePromise;
    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual({ choices: [{ message: { content: '{"ok":true}' } }] });
  });
});

async function waitForMessage(messages: string[], count: number): Promise<string> {
  for (let index = 0; index < 50; index += 1) {
    if (messages.length >= count) return messages[count - 1]!;
    await Bun.sleep(1);
  }
  throw new Error('Companion message was not sent.');
}
