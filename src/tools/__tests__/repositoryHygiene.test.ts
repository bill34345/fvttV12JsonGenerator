import { describe, expect, it } from 'bun:test';
import {
  executeRepositoryHygiene,
  inspectTrackedArtifactPaths,
} from '../repositoryHygiene';

describe('repository hygiene gate', () => {
  it('classifies every prohibited artifact boundary while allowing named source and fixture paths', () => {
    const findings = inspectTrackedArtifactPaths([
      'AGENTS.md',
      'obsidian/dnd数据转fvttjson/input/white-tusk-shaman.md',
      'src/core/generator/__tests__/fixtures/white-tusk-shaman.md',
      'docs/acceptance/locked-evidence.json',
      'obsidian\\dnd数据转fvttjson\\output\\white-tusk-shaman.json',
      'obsidian/dnd数据转fvttjson/output_backup/white-tusk-shaman.old.json',
      'obsidian/dnd数据转fvttjson/.fvtt-sync-manifest.json',
      'obsidian/dnd数据转fvttjson/.obsidian/plugins/dataview/main.js',
      '.sisyphus/plans/old-agent-plan.md',
      '.gemini/settings.json',
      '.qwen/settings.json',
      '.superpowers/sdd/session.json',
      'docs/superpowers/plans/internal-plan.md',
      'docs/runbooks/FVTT-REMOTE-OPERATIONS-HANDOFF.zh-CN.md',
      'references/foundry-v12-api/classes/client.Actor.html',
      'references/foundry-v12-api-core/index.html',
      'references/foundry-v12-api-core-text/classes/client.Actor.txt',
      'obsidian/dnd数据转fvttjson/images/generated-monsters/local-candidate.png',
      'data/need_tran/pending-actor.json',
      'data/local-source.docx',
      '.env',
      '.local/foundry-v14/data/options.json',
      'secrets/session.cookies',
      'debug-parser.ts',
      'temp-items/shield.json',
      'temp-dragon.json',
      'output/dragon.json',
      'output.json',
      'test_regex.js',
      'verify.ts',
    ]);

    expect(findings.map((finding) => [finding.path, finding.rule])).toEqual([
      ['obsidian/dnd数据转fvttjson/output/white-tusk-shaman.json', 'disposable-generated-output'],
      ['obsidian/dnd数据转fvttjson/output_backup/white-tusk-shaman.old.json', 'generated-backup'],
      ['obsidian/dnd数据转fvttjson/.fvtt-sync-manifest.json', 'runtime-manifest'],
      ['obsidian/dnd数据转fvttjson/.obsidian/plugins/dataview/main.js', 'local-workspace-state'],
      ['.sisyphus/plans/old-agent-plan.md', 'agent-tool-state'],
      ['.gemini/settings.json', 'agent-tool-state'],
      ['.qwen/settings.json', 'agent-tool-state'],
      ['.superpowers/sdd/session.json', 'agent-tool-state'],
      ['docs/superpowers/plans/internal-plan.md', 'agent-tool-state'],
      ['docs/runbooks/FVTT-REMOTE-OPERATIONS-HANDOFF.zh-CN.md', 'private-operations-state'],
      ['references/foundry-v12-api/classes/client.Actor.html', 'upstream-reference-cache'],
      ['references/foundry-v12-api-core/index.html', 'upstream-reference-cache'],
      ['references/foundry-v12-api-core-text/classes/client.Actor.txt', 'upstream-reference-cache'],
      ['obsidian/dnd数据转fvttjson/images/generated-monsters/local-candidate.png', 'generated-local-media'],
      ['data/need_tran/pending-actor.json', 'local-content-workspace'],
      ['data/local-source.docx', 'local-content-workspace'],
      ['.env', 'credential-or-session-path'],
      ['.local/foundry-v14/data/options.json', 'local-runtime-state'],
      ['secrets/session.cookies', 'credential-or-session-path'],
      ['debug-parser.ts', 'unclassified-root-scratch'],
      ['temp-items/shield.json', 'unclassified-root-scratch'],
      ['temp-dragon.json', 'unclassified-root-scratch'],
      ['output/dragon.json', 'unclassified-root-scratch'],
      ['output.json', 'unclassified-root-scratch'],
      ['test_regex.js', 'unclassified-root-scratch'],
      ['verify.ts', 'unclassified-root-scratch'],
    ]);
  });

  it('passes a nonzero clean tracked tree and reports the checked path count', () => {
    const result = executeRepositoryHygiene({
      collectTrackedPaths: () => [
        'AGENTS.md',
        'src/tools/repositoryHygiene.ts',
        'src/tools/__tests__/fixtures/golden-item.json',
      ],
    });

    expect(result).toEqual({
      exitCode: 0,
      stdout: ['repository hygiene passed (3 tracked paths checked)'],
      stderr: [],
      findings: [],
    });
  });

  it('allows only the explicitly approved Rat Warlock generated acceptance artifact', () => {
    const findings = inspectTrackedArtifactPaths([
      'obsidian/dnd数据转fvttjson/output/warlock-of-the-rat-god.json',
      'obsidian/dnd数据转fvttjson/output/another-rat-warlock.json',
    ]);

    expect(findings.map((finding) => [finding.path, finding.rule])).toEqual([
      ['obsidian/dnd数据转fvttjson/output/another-rat-warlock.json', 'disposable-generated-output'],
    ]);
  });

  it('allows only stable Species acceptance JSONs inside the vault output tree', () => {
    const findings = inspectTrackedArtifactPaths([
      'obsidian/dnd数据转fvttjson/output/species/accepted-ledger.json',
      'obsidian/dnd数据转fvttjson/output/species/ogre.json',
      'obsidian/dnd数据转fvttjson/output/species/Ogre.json',
      'obsidian/dnd数据转fvttjson/output/species/ogre/review.json',
      'obsidian/dnd数据转fvttjson/output/items/ogre.json',
    ]);

    expect(findings.map((finding) => [finding.path, finding.rule])).toEqual([
      ['obsidian/dnd数据转fvttjson/output/species/Ogre.json', 'disposable-generated-output'],
      ['obsidian/dnd数据转fvttjson/output/species/ogre/review.json', 'disposable-generated-output'],
      ['obsidian/dnd数据转fvttjson/output/items/ogre.json', 'disposable-generated-output'],
    ]);
  });

  it('fails closed for prohibited paths, zero tracked paths, and Git collection errors', () => {
    const prohibited = executeRepositoryHygiene({
      collectTrackedPaths: () => ['src/index.ts', 'output/actor.json'],
    });
    expect(prohibited.exitCode).toBe(1);
    expect(prohibited.stderr.join('\n')).toContain('unclassified-root-scratch');
    expect(prohibited.stderr.join('\n')).toContain('output/actor.json');

    const zero = executeRepositoryHygiene({ collectTrackedPaths: () => [] });
    expect(zero).toEqual(expect.objectContaining({
      exitCode: 1,
      stderr: ['repository hygiene failed: zero tracked paths were discovered'],
    }));

    const gitError = executeRepositoryHygiene({
      collectTrackedPaths: () => {
        throw new Error('git ls-files failed (exit 128): not a git repository');
      },
    });
    expect(gitError).toEqual(expect.objectContaining({
      exitCode: 1,
      stderr: ['repository hygiene failed: git ls-files failed (exit 128): not a git repository'],
    }));
  });
});
