import { describe, expect, it } from 'bun:test';
import { requireGitText, runGitCommand } from '../gitCommand';

describe('git command execution', () => {
  it('reports a missing Git executable instead of returning empty output', () => {
    const executor = () => ({
      status: null,
      stdout: '',
      stderr: '',
      error: { code: 'ENOENT', message: 'spawnSync git ENOENT' },
    });

    const result = runGitCommand(['ls-files'], { executor });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      command: 'git ls-files',
      status: null,
      errorCode: 'ENOENT',
    }));
    expect(() => requireGitText(['ls-files'], { executor })).toThrow(
      'git ls-files failed (spawn error ENOENT): spawnSync git ENOENT',
    );
  });

  it('preserves a non-repository Git diagnostic and exit status', () => {
    const executor = () => ({
      status: 128,
      stdout: '',
      stderr: 'fatal: not a git repository (or any parent up to mount point)',
    });

    const result = runGitCommand(['diff', 'HEAD'], { executor });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      status: 128,
      stderr: 'fatal: not a git repository (or any parent up to mount point)',
    }));
    expect(() => requireGitText(['diff', 'HEAD'], { executor })).toThrow(
      /git diff HEAD failed \(exit 128\).*not a git repository/,
    );
  });
});
