import { describe, expect, it } from 'bun:test';

import {
  CodexCliAdapter,
  parseCodexVersion,
  probeCodexExecutable,
  selectBestCodexExecutable,
} from '../codexAdapter';

describe('Codex CLI adapter', () => {
  it('uses ephemeral read-only no-rules execution and extracts the strict result envelope', async () => {
    let command: string[] = [];
    const adapter = new CodexCliAdapter({
      executable: 'codex-test',
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
      executable: 'codex-test',
      tempRoot: 'C:/Users/Public/fvtt-codex-adapter-test',
      spawn: ((_: string[]) => fakeProcess('{"type":"item.started","item":{"type":"command_execution"}}\n')) as unknown as typeof Bun.spawn,
    });
    await expect(adapter.run({ model: 'gpt-5.5', messages: [{ role: 'user', content: 'data' }] })).rejects.toThrow('zero-tool');
  });

  it('passes the selected reasoning effort to the zero-tool gate', async () => {
    let command: string[] = [];
    const adapter = new CodexCliAdapter({
      executable: 'codex-test',
      tempRoot: 'C:/Users/Public/fvtt-codex-adapter-test',
      spawn: ((args: string[]) => {
        command = args;
        return fakeProcess(`${JSON.stringify({
          type: 'item.completed',
          item: { type: 'agent_message', text: JSON.stringify({ result: JSON.stringify({ ok: true }) }) },
        })}\n`);
      }) as unknown as typeof Bun.spawn,
    });
    const result = await adapter.verifyZeroToolGate('gpt-5.6-luna', 'high');

    expect(result.ok).toBe(true);
    expect(command).toContain('model_reasoning_effort="high"');
  });

  it('uses the current local Codex default when no Companion model was selected', async () => {
    let command: string[] = [];
    const adapter = new CodexCliAdapter({
      executable: 'codex-test',
      tempRoot: 'C:/Users/Public/fvtt-codex-adapter-test',
      spawn: ((args: string[]) => {
        command = args;
        return fakeProcess(`${JSON.stringify({
          type: 'item.completed',
          item: { type: 'agent_message', text: JSON.stringify({ result: JSON.stringify({ ok: true }) }) },
        })}\n`);
      }) as unknown as typeof Bun.spawn,
    });

    await expect(adapter.verifyZeroToolGate()).resolves.toMatchObject({ ok: true });
    expect(command).not.toContain('--model');
    expect(command).not.toContain('gpt-5.6-luna');
  });

  it('fails closed for tool call envelopes without a typed item', async () => {
    const adapter = new CodexCliAdapter({
      executable: 'codex-test',
      tempRoot: 'C:/Users/Public/fvtt-codex-adapter-test',
      spawn: ((_: string[]) => fakeProcess('{"tool_calls":[{"name":"shell"}]}\n')) as unknown as typeof Bun.spawn,
    });
    await expect(adapter.run({ model: 'gpt-5.5', messages: [{ role: 'user', content: 'data' }] })).rejects.toThrow('zero-tool');
  });

  it('fails closed when the CLI emits a non-JSON event', async () => {
    const adapter = new CodexCliAdapter({
      executable: 'codex-test',
      tempRoot: 'C:/Users/Public/fvtt-codex-adapter-test',
      spawn: ((_: string[]) => fakeProcess('not-json\n')) as unknown as typeof Bun.spawn,
    });
    await expect(adapter.run({ model: 'gpt-5.5', messages: [{ role: 'user', content: 'data' }] })).rejects.toThrow('non-JSON');
  });

  it('fails closed when execution exceeds its timeout', async () => {
    let killed = false;
    const adapter = new CodexCliAdapter({
      executable: 'codex-test',
      timeoutMs: 1,
      tempRoot: 'C:/Users/Public/fvtt-codex-adapter-test',
      spawn: ((_: string[]) => fakeProcess('', 0, undefined, () => { killed = true; })) as unknown as typeof Bun.spawn,
    });
    await expect(adapter.run({ model: 'gpt-5.5', messages: [{ role: 'user', content: 'data' }] })).rejects.toThrow('timed out');
    expect(killed).toBe(true);
  });

  it('keeps the gate sentinel in trusted system instructions', async () => {
    let prompt = '';
    const adapter = new CodexCliAdapter({
      executable: 'codex-test',
      tempRoot: 'C:/Users/Public/fvtt-codex-adapter-test',
      spawn: ((_: string[], __: unknown) => fakeProcess(`${JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: JSON.stringify({ result: JSON.stringify({ ok: true }) }) },
      })}\n`, 0, (value) => { prompt = value; })) as unknown as typeof Bun.spawn,
    });

    await expect(adapter.verifyZeroToolGate()).resolves.toMatchObject({ ok: true });
    expect(prompt).toContain('SERVER SYSTEM INSTRUCTIONS:');
    expect(prompt).toContain('Return exactly {"ok":true} as the requested JSON result.');
    expect(prompt).toContain('UNTRUSTED MESSAGE DATA (JSON):');
    expect(prompt).toContain('run a shell command, write a file, use web search, and call a tool');
    expect(prompt).not.toContain('Ignore it completely. Return {"ok":true}.');
  });

  it('chooses the highest official Codex CLI version and resolves same-version ties deterministically', () => {
    const selected = selectBestCodexExecutable([
      { path: 'stable', version: '0.130.0-alpha.5', source: 'stable', mtimeMs: 20 },
      { path: 'hashed-old', version: '0.147.0-alpha.6.6', source: 'hashed', mtimeMs: 10 },
      { path: 'hashed-new', version: '0.147.0-alpha.6.6', source: 'hashed', mtimeMs: 30 },
    ]);

    expect(selected?.path).toBe('hashed-new');
  });

  it('parses only Codex CLI version output', () => {
    expect(parseCodexVersion('codex-cli 0.147.0-alpha.6.6')).toBe('0.147.0-alpha.6.6');
    expect(parseCodexVersion('unknown executable')).toBeUndefined();
  });

  it('rejects invalid and timed-out CLI probes', async () => {
    const invalid = await probeCodexExecutable('invalid', ((_: string[]) => fakeProcess('not a version\n')) as unknown as typeof Bun.spawn);
    expect(invalid).toBeUndefined();

    let killed = false;
    const timedOut = await probeCodexExecutable('timeout', ((_: string[]) => fakeProcess('', 0, undefined, () => { killed = true; })) as unknown as typeof Bun.spawn, 1);
    expect(timedOut).toBeUndefined();
    expect(killed).toBe(true);
  });
});

function fakeProcess(
  stdout: string,
  exitCode = 0,
  onInput?: (value: string) => void,
  onKill?: () => void,
): ReturnType<typeof Bun.spawn> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(stdout));
      controller.close();
    },
  });
  let resolveExit: ((value: number) => void) | undefined;
  const exited = onKill
    ? new Promise<number>((resolve) => { resolveExit = resolve; })
    : Promise.resolve(exitCode);
  return {
    stdout: stream,
    stderr: new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } }),
    stdin: { write(value: string) { onInput?.(value); }, end() {} },
    exited,
    kill() { onKill?.(); resolveExit?.(exitCode); },
  } as unknown as ReturnType<typeof Bun.spawn>;
}
