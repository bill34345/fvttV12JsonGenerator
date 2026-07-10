import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { assertInsideLabRoot, createLabConfig } from '../config';

describe('Foundry lab configuration', () => {
  it('pins the approved project-local layout and versions', () => {
    const repo = resolve('I:/OpenCode/fvttV12JsonGenerator');
    const config = createLabConfig(repo);

    expect(config.versions).toEqual({ foundry: '14.364', node: '24.17.0', dnd5e: '5.3.3' });
    expect(config.labRoot).toBe(resolve(repo, '.local/foundry-v14'));
    expect(config.profiles.coreTest.port).toBe(30000);
    expect(config.profiles.serverMirror.port).toBe(30001);
    expect(config.profiles.coreTest.host).toBe('127.0.0.1');
    expect(config.sshTarget).toBe('Administrator@49.232.12.153');
  });

  it('rejects destructive targets outside the ignored lab root', () => {
    const config = createLabConfig('I:/OpenCode/fvttV12JsonGenerator');
    expect(() => assertInsideLabRoot(config, config.labRoot)).not.toThrow();
    expect(() => assertInsideLabRoot(config, 'I:/OpenCode/fvttV12JsonGenerator/src')).toThrow(
      'Target escapes Foundry lab root',
    );
    expect(() => assertInsideLabRoot(config, 'I:/')).toThrow('Target escapes Foundry lab root');
  });
});
