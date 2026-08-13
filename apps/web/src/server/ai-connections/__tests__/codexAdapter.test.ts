import { describe, expect, it } from 'bun:test';

import { CodexCliAdapter } from '../codexAdapter';

describe('Codex CLI adapter', () => {
  it('uses ephemeral read-only no-rules execution and extracts the strict result envelope', async () => {
    let command: string[] = [];
    const adapter = new CodexCliAdapter({
      tempRoot: 'C:/Users/Public/fvtt-codex-adapter-test',
      spawn: ((args: string[]) => {
        command = args;
        return fakeProcess(`${JSON.stringify({
          type: 'item.completed',
          item: { type: 'agent_message', text: JSON.stringify({ result: JSON.stringify({ ok: true }) }) },
        })}\n`);
      }) as unknown as typeof Bun.spawn,
    });
    const result = await adapter.run({ model: 'gpt-5.5', messages: [{ role: 'user', content: 'data' }] });

    expect(result.content).toBe('{"ok":true}');
    expect(command).toContain('--ephemeral');
    expect(command).toContain('--ignore-rules');
    expect(command).toContain('--sandbox');
    expect(command).toContain('read-only');
    expect(command).toContain('--disable');
    expect(command).toContain('shell_tool');
    expect(command).toContain('browser_use');
    expect(command).toContain('computer_use');
    expect(command).toContain('model_reasoning_effort="xhigh"');
  });

  it('fails closed when any tool-shaped event appears', async () => {
    const adapter = new CodexCliAdapter({
      tempRoot: 'C:/Users/Public/fvtt-codex-adapter-test',
      spawn: ((_: string[]) => fakeProcess('{"type":"item.started","item":{"type":"command_execution"}}\n')) as unknown as typeof Bun.spawn,
    });
    await expect(adapter.run({ model: 'gpt-5.5', messages: [{ role: 'user', content: 'data' }] })).rejects.toThrow('zero-tool');
  });

  it('fails closed for tool call envelopes without a typed item', async () => {
    const adapter = new CodexCliAdapter({
      tempRoot: 'C:/Users/Public/fvtt-codex-adapter-test',
      spawn: ((_: string[]) => fakeProcess('{"tool_calls":[{"name":"shell"}]}\n')) as unknown as typeof Bun.spawn,
    });
    await expect(adapter.run({ model: 'gpt-5.5', messages: [{ role: 'user', content: 'data' }] })).rejects.toThrow('zero-tool');
  });
});

function fakeProcess(stdout: string, exitCode = 0): ReturnType<typeof Bun.spawn> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(stdout));
      controller.close();
    },
  });
  return {
    stdout: stream,
    stderr: new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } }),
    stdin: { write() {}, end() {} },
    exited: Promise.resolve(exitCode),
    kill() {},
  } as unknown as ReturnType<typeof Bun.spawn>;
}
