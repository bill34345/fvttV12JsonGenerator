# Project-Local Foundry v14 Mirror Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a project-local Foundry VTT 14.364 laboratory with a clean dnd5e 5.3.3 acceptance world and an evidence-backed mirror of the production world's 88 active modules.

**Architecture:** Keep all runtime, package, license, inventory, and evidence data under the repository's ignored `.local/foundry-v14` tree. Add tracked Bun/TypeScript and PowerShell utilities under `scripts/foundry-lab` for safe path resolution, runtime bootstrap, remote inventory, package classification/acquisition, parity checks, and isolated launch. Validate mechanics first in `core-test`, then module coexistence and real workflows in `server-mirror`, and use the production URL only for final comparison.

**Tech Stack:** Bun 1.3.x, TypeScript 5.9.x, Windows PowerShell 5.1, OpenSSH 9.5, Node.js 24.17.0 portable runtime, Foundry VTT Node 14.364, dnd5e 5.3.3, Chrome browser control, Bun test.

## Global Constraints

- Workspace root: `I:\OpenCode\fvttV12JsonGenerator`.
- Runtime root: `I:\OpenCode\fvttV12JsonGenerator\.local\foundry-v14`.
- Foundry archive: `D:\Download\FoundryVTT-Node-14.364.zip`.
- Foundry target: `14.364`; Node target: `24.17.0`; dnd5e target: `5.3.3`.
- Production SSH target: `Administrator@49.232.12.153`; production data path: `E:\Bill\fvtt_v13\data`.
- Production evidence baseline: 249 module folders, 191 world-visible modules, 88 active modules.
- Local listeners bind to `127.0.0.1`; `core-test` uses port `30000`; `server-mirror` uses port `30001`.
- The existing global Node.js 25.4.0 installation must not be replaced.
- `.local/` stays ignored; no license, password, SSH key, authenticated URL, premium archive, raw world DB, or full module inventory is committed.
- Multiple installations are allowed, but only one hosted instance may be accessible to users other than the owner; the local laboratory remains loopback-only while the public server is online. Source: `https://foundryvtt.com/article/license/`.
- Do not run `Update All`, change production module settings, stop production, or copy a live world database during inventory/bootstrap tasks.
- Any final Actor JSON must be regenerated through the project workflow and verified under `docs/generated-actor-verification.md`.
- If two attempts in a row fail, stop and report the root cause, evidence, and one narrow next fix.

---

## Planned File Structure

| File | Responsibility |
| --- | --- |
| `scripts/foundry-lab/types.ts` | Shared inventory, classification, parity, and command-result types |
| `scripts/foundry-lab/config.ts` | Exact versions, paths, ports, SSH target, and path containment guards |
| `scripts/foundry-lab/process.ts` | Strict subprocess execution with redacted errors and dry-run support |
| `scripts/foundry-lab/bootstrap.ts` | Validate archives, download/verify Node, extract Foundry, and create data roots |
| `scripts/foundry-lab/remoteInventory.ts` | Execute read-only UTF-8 inventory PowerShell over SSH and persist raw ignored evidence |
| `scripts/foundry-lab/classify.ts` | Reconcile active modules with disk manifests and assign package classes |
| `scripts/foundry-lab/acquire.ts` | Download exact public archives and selectively transfer server-only packages |
| `scripts/foundry-lab/parity.ts` | Compare production and local IDs, versions, dependencies, and hashes |
| `scripts/foundry-lab/launch.ts` | Launch the selected local profile with explicit Node, data path, host, and port |
| `scripts/foundry-lab/cli.ts` | Stable command surface for bootstrap, inventory, classify, acquire, parity, and launch |
| `scripts/foundry-lab/README.md` | Operator runbook, safety boundaries, and expected outputs |
| `scripts/foundry-lab/__tests__/*.test.ts` | Bun tests for every pure rule and dry-run command boundary |
| `package.json` | Add `foundry:lab` and focused test scripts |
| `docs/acceptance/foundry-v14-module-parity.md` | Sanitized module parity summary |
| `docs/acceptance/foundry-v14-module-compatibility.md` | Evidence-backed compatibility/conflict report |
| `docs/acceptance/v14-live-runtime-smoke-test.md` | Existing Actor runtime checklist updated with actual results |

---

### Task 1: Add Foundry Lab Configuration and Safety Boundaries

**Files:**
- Create: `scripts/foundry-lab/types.ts`
- Create: `scripts/foundry-lab/config.ts`
- Create: `scripts/foundry-lab/process.ts`
- Create: `scripts/foundry-lab/__tests__/config.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `FoundryLabConfig`, `ModuleInventoryEntry`, `ActiveModuleEntry`, `PackageClass`, `ClassifiedPackage`, `CommandResult`.
- Produces: `createLabConfig(repoRoot?: string): FoundryLabConfig`.
- Produces: `assertInsideLabRoot(config: FoundryLabConfig, target: string): void`.
- Produces: `runCommand(command: string, args: string[], options: RunCommandOptions): Promise<CommandResult>`.

- [ ] **Step 1: Write the failing configuration tests**

```ts
// scripts/foundry-lab/__tests__/config.test.ts
import { describe, expect, it } from 'bun:test';
import { dirname, resolve } from 'node:path';
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
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
bun test scripts/foundry-lab/__tests__/config.test.ts
```

Expected: FAIL because `../config` does not exist.

- [ ] **Step 3: Implement the shared types and exact configuration**

```ts
// scripts/foundry-lab/types.ts
export type PackageClass = 'upstream-exact' | 'account-protected' | 'server-only' | 'manual-review';

export interface ModuleInventoryEntry {
  folder: string;
  id: string | null;
  title: string | null;
  version: string | null;
  compatibility: { minimum?: string | number; verified?: string | number; maximum?: string | number };
  manifest: string | null;
  download: string | null;
  requires: string[];
  conflicts: string[];
  protected: boolean;
  persistentStorage: boolean;
  manifestSha256: string | null;
  parseError: string | null;
}

export interface ActiveModuleEntry {
  id: string;
  title: string;
  version: string;
}

export interface ClassifiedPackage {
  active: ActiveModuleEntry;
  disk: ModuleInventoryEntry | null;
  packageClass: PackageClass;
  reasons: string[];
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  commandLine: string;
}
```

```ts
// scripts/foundry-lab/config.ts
import { isAbsolute, relative, resolve } from 'node:path';

export interface FoundryLabConfig {
  repoRoot: string;
  labRoot: string;
  appRoot: string;
  nodeRoot: string;
  cacheRoot: string;
  inventoryRoot: string;
  evidenceRoot: string;
  foundryZip: string;
  sshTarget: string;
  remoteDataPath: string;
  versions: { foundry: '14.364'; node: '24.17.0'; dnd5e: '5.3.3' };
  profiles: {
    coreTest: { id: 'core-test'; dataPath: string; host: '127.0.0.1'; port: 30000 };
    serverMirror: { id: 'server-mirror'; dataPath: string; host: '127.0.0.1'; port: 30001 };
  };
}

export function createLabConfig(repoRoot = process.cwd()): FoundryLabConfig {
  const root = resolve(repoRoot);
  const labRoot = resolve(root, '.local/foundry-v14');
  return {
    repoRoot: root,
    labRoot,
    appRoot: resolve(labRoot, 'app/14.364'),
    nodeRoot: resolve(labRoot, 'runtime/node-v24.17.0-win-x64'),
    cacheRoot: resolve(labRoot, 'cache/packages'),
    inventoryRoot: resolve(labRoot, 'inventory'),
    evidenceRoot: resolve(labRoot, 'evidence'),
    foundryZip: resolve('D:/Download/FoundryVTT-Node-14.364.zip'),
    sshTarget: 'Administrator@49.232.12.153',
    remoteDataPath: 'E:/Bill/fvtt_v13/data',
    versions: { foundry: '14.364', node: '24.17.0', dnd5e: '5.3.3' },
    profiles: {
      coreTest: { id: 'core-test', dataPath: resolve(labRoot, 'data/core-test'), host: '127.0.0.1', port: 30000 },
      serverMirror: { id: 'server-mirror', dataPath: resolve(labRoot, 'data/server-mirror'), host: '127.0.0.1', port: 30001 },
    },
  };
}

export function assertInsideLabRoot(config: FoundryLabConfig, target: string): void {
  const candidate = resolve(target);
  const rel = relative(config.labRoot, candidate);
  if (!isAbsolute(candidate) || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Target escapes Foundry lab root: ${candidate}`);
  }
}
```

```ts
// scripts/foundry-lab/process.ts
import { spawn } from 'node:child_process';
import type { CommandResult } from './types';

export interface RunCommandOptions {
  cwd: string;
  timeoutMs?: number;
  dryRun?: boolean;
  redact?: string[];
}

export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions,
): Promise<CommandResult> {
  const commandLine = [command, ...args].join(' ');
  if (options.dryRun) return { exitCode: 0, stdout: '', stderr: '', commandLine };

  return await new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill(), options.timeoutMs ?? 30_000);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      const redacted = (value: string) => (options.redact ?? []).reduce(
        (text, secret) => secret ? text.replaceAll(secret, '<redacted>') : text,
        value,
      );
      resolveResult({ exitCode: code ?? 1, stdout: redacted(stdout), stderr: redacted(stderr), commandLine });
    });
  });
}
```

Add to `package.json`:

```json
{
  "scripts": {
    "foundry:lab": "bun run scripts/foundry-lab/cli.ts",
    "test:foundry-lab": "bun test scripts/foundry-lab/__tests__"
  }
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `bun test scripts/foundry-lab/__tests__/config.test.ts`
Expected: `2 pass, 0 fail`.

- [ ] **Step 5: Commit the configuration boundary**

```powershell
git add package.json scripts/foundry-lab/types.ts scripts/foundry-lab/config.ts scripts/foundry-lab/process.ts scripts/foundry-lab/__tests__/config.test.ts
git commit -m "chore: add Foundry lab safety configuration"
```

---

### Task 2: Bootstrap Foundry 14.364 and Isolated Node 24.17.0

**Files:**
- Create: `scripts/foundry-lab/bootstrap.ts`
- Create: `scripts/foundry-lab/__tests__/bootstrap.test.ts`
- Create: `scripts/foundry-lab/cli.ts`

**Interfaces:**
- Consumes: `FoundryLabConfig`, `assertInsideLabRoot`, `runCommand`.
- Produces: `BootstrapReport` and `bootstrapLab(config, options): Promise<BootstrapReport>`.
- Produces CLI: `bun run foundry:lab bootstrap [--apply]`.

- [ ] **Step 1: Write failing bootstrap-plan tests**

```ts
// scripts/foundry-lab/__tests__/bootstrap.test.ts
import { describe, expect, it } from 'bun:test';
import { createLabConfig } from '../config';
import { buildBootstrapPlan } from '../bootstrap';

describe('Foundry lab bootstrap', () => {
  it('uses exact approved archives and never writes outside .local', () => {
    const config = createLabConfig('I:/OpenCode/fvttV12JsonGenerator');
    const plan = buildBootstrapPlan(config);
    expect(plan.nodeArchiveUrl).toBe('https://nodejs.org/dist/v24.17.0/node-v24.17.0-win-x64.zip');
    expect(plan.nodeChecksumUrl).toBe('https://nodejs.org/dist/v24.17.0/SHASUMS256.txt');
    expect(plan.foundryZip).toBe('D:\\Download\\FoundryVTT-Node-14.364.zip');
    expect(plan.directories.every((path) => path.startsWith(config.labRoot))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `bun test scripts/foundry-lab/__tests__/bootstrap.test.ts`
Expected: FAIL because `buildBootstrapPlan` does not exist.

- [ ] **Step 3: Implement dry-run-first bootstrap**

Implement `buildBootstrapPlan` with these exact outputs:

```ts
import { dirname, resolve } from 'node:path';
import { assertInsideLabRoot, type FoundryLabConfig } from './config';

export interface BootstrapPlan {
  foundryZip: string;
  nodeArchiveUrl: string;
  nodeChecksumUrl: string;
  nodeArchivePath: string;
  nodeChecksumPath: string;
  directories: string[];
}

export interface BootstrapOptions {
  apply: boolean;
}

export interface BootstrapReport {
  ok: boolean;
  apply: boolean;
  foundryVersion: string | null;
  nodeVersion: string | null;
  actions: Array<{ kind: 'mkdir' | 'download' | 'verify' | 'extract'; target: string; status: 'planned' | 'done' | 'failed' }>;
  errors: string[];
}

export function buildBootstrapPlan(config: FoundryLabConfig): BootstrapPlan {
  const directories = [
    config.appRoot,
    dirname(config.nodeRoot),
    config.cacheRoot,
    config.inventoryRoot,
    config.evidenceRoot,
    config.profiles.coreTest.dataPath,
    config.profiles.serverMirror.dataPath,
  ];
  directories.forEach((path) => assertInsideLabRoot(config, path));
  return {
    foundryZip: config.foundryZip,
    nodeArchiveUrl: 'https://nodejs.org/dist/v24.17.0/node-v24.17.0-win-x64.zip',
    nodeChecksumUrl: 'https://nodejs.org/dist/v24.17.0/SHASUMS256.txt',
    nodeArchivePath: resolve(config.cacheRoot, 'node-v24.17.0-win-x64.zip'),
    nodeChecksumPath: resolve(config.cacheRoot, 'node-v24.17.0-SHASUMS256.txt'),
    directories,
  };
}
```

`bootstrapLab` must:

1. default to dry-run unless `--apply` is present;
2. create only the planned directories;
3. inspect `package.json` inside the Foundry zip and require `version === "14.364.0"` and `engines.node === ">=24.13.1 <25.0.0"`;
4. download the Node archive and official checksum list only when missing;
5. verify the Node archive SHA-256 against `SHASUMS256.txt` before extraction;
6. use PowerShell `Expand-Archive -LiteralPath ... -DestinationPath ...` for both archives;
7. run the isolated `node.exe --version` and require `v24.17.0`;
8. read extracted Foundry `package.json` and require `14.364.0`;
9. write `.local/foundry-v14/inventory/bootstrap-report.json`.

Extract the Node archive into `dirname(config.nodeRoot)` because the official zip already contains the top-level `node-v24.17.0-win-x64` folder. Extract Foundry directly into `config.appRoot` because the Foundry archive contains application files at its root.

The CLI branch must be exact:

```ts
const [command, ...args] = process.argv.slice(2);
const apply = args.includes('--apply');
if (command === 'bootstrap') {
  const report = await bootstrapLab(createLabConfig(), { apply });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
throw new Error(`Unsupported foundry:lab command: ${command ?? '<missing>'}`);
```

- [ ] **Step 4: Verify dry-run and focused tests**

Run:

```powershell
bun test scripts/foundry-lab/__tests__/bootstrap.test.ts
bun run foundry:lab bootstrap
```

Expected:

- test: `1 pass, 0 fail`;
- CLI: JSON plan with `apply: false` and no `.local/foundry-v14/app/14.364/main.js` created.

- [ ] **Step 5: Apply bootstrap and verify the actual runtime**

Run:

```powershell
bun run foundry:lab bootstrap --apply
& '.\.local\foundry-v14\runtime\node-v24.17.0-win-x64\node.exe' --version
```

Expected:

- report contains `ok: true`, `foundryVersion: "14.364.0"`, and `nodeVersion: "v24.17.0"`;
- isolated Node prints `v24.17.0`;
- no files under `.local/foundry-v14` appear in `git status --short`.

- [ ] **Step 6: Commit bootstrap automation only**

```powershell
git add scripts/foundry-lab/bootstrap.ts scripts/foundry-lab/cli.ts scripts/foundry-lab/__tests__/bootstrap.test.ts
git commit -m "feat: bootstrap isolated Foundry v14 lab"
```

---

### Task 3: Capture Production Disk and Active-Module Inventories

**Files:**
- Create: `scripts/foundry-lab/remoteInventory.ts`
- Create: `scripts/foundry-lab/__tests__/remoteInventory.test.ts`
- Modify: `scripts/foundry-lab/cli.ts`
- Create at runtime only: `.local/foundry-v14/inventory/production-disk.json`
- Create at runtime only: `.local/foundry-v14/inventory/production-active.json`

**Interfaces:**
- Produces: `buildRemoteInventoryCommand(dataPath: string): string`.
- Produces: `captureRemoteInventory(config): Promise<ModuleInventoryEntry[]>`.
- Produces CLI: `bun run foundry:lab inventory --apply`.

- [ ] **Step 1: Write failing UTF-8 and read-only command tests**

```ts
import { describe, expect, it } from 'bun:test';
import { buildRemoteInventoryCommand } from '../remoteInventory';

describe('remote Foundry inventory', () => {
  it('reads module manifests as UTF-8 without mutating production', () => {
    const command = buildRemoteInventoryCommand('E:/Bill/fvtt_v13/data');
    expect(command).toContain('[IO.File]::ReadAllText($manifestPath, [Text.UTF8Encoding]::new($false))');
    expect(command).toContain('Get-FileHash -Algorithm SHA256');
    expect(command).not.toMatch(/Remove-Item|Set-Content|Add-Content|Move-Item|Copy-Item|Compress-Archive/);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `bun test scripts/foundry-lab/__tests__/remoteInventory.test.ts`
Expected: FAIL because `buildRemoteInventoryCommand` does not exist.

- [ ] **Step 3: Implement the remote read-only inventory**

The generated PowerShell must enumerate `Data/modules/*/module.json` and return one compact JSON array with these fields:

```powershell
$moduleRoot = Join-Path 'E:/Bill/fvtt_v13/data' 'Data/modules'
$result = foreach ($folder in Get-ChildItem -LiteralPath $moduleRoot -Directory) {
  $manifestPath = Join-Path $folder.FullName 'module.json'
  if (-not (Test-Path -LiteralPath $manifestPath)) {
    [pscustomobject]@{ folder=$folder.Name; id=$null; title=$null; version=$null; compatibility=@{}; manifest=$null; download=$null; requires=@(); conflicts=@(); protected=$false; persistentStorage=$false; manifestSha256=$null; parseError='module.json missing' }
    continue
  }
  try {
    $text = [IO.File]::ReadAllText($manifestPath, [Text.UTF8Encoding]::new($false))
    $json = $text | ConvertFrom-Json
    [pscustomobject]@{
      folder=$folder.Name
      id=$json.id
      title=$json.title
      version=[string]$json.version
      compatibility=$json.compatibility
      manifest=$json.manifest
      download=$json.download
      requires=@($json.relationships.requires | ForEach-Object { $_.id })
      conflicts=@($json.relationships.conflicts | ForEach-Object { $_.id })
      protected=[bool]$json.protected
      persistentStorage=[bool]$json.persistentStorage
      manifestSha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $manifestPath).Hash.ToLowerInvariant()
      parseError=$null
    }
  } catch {
    [pscustomobject]@{ folder=$folder.Name; id=$null; title=$null; version=$null; compatibility=@{}; manifest=$null; download=$null; requires=@(); conflicts=@(); protected=$false; persistentStorage=$false; manifestSha256=$null; parseError=$_.Exception.Message }
  }
}
$result | ConvertTo-Json -Depth 12 -Compress
```

Encode this command as UTF-16LE and invoke:

```powershell
$encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remoteInventoryCommand))
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes Administrator@49.232.12.153 powershell -NoProfile -NonInteractive -EncodedCommand $encodedCommand
```

Persist stdout only after it parses as a JSON array and contains exactly `249` entries. Do not treat the count alone as correctness; preserve parse errors per entry.

- [ ] **Step 4: Capture the current active set through the existing Chrome session**

Use the already logged-in page `http://49.232.12.153:8080/game`, open/read the Module Management dialog without changing controls, and extract checked module rows as:

```ts
const checkedModuleRows = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
  .map((input) => {
    const lines = (input.closest('li')?.innerText ?? '').split(/\n+/).map((value) => value.trim()).filter(Boolean);
    return { id: input.getAttribute('name') ?? '', title: lines[0] ?? '', version: lines[1] ?? '' };
  })
  .filter((entry) => entry.id !== '');
const activeSnapshot = {
  capturedAt: new Date().toISOString(),
  coreVersion: '14.364',
  systemId: 'dnd5e',
  systemVersion: '5.3.3',
  modules: checkedModuleRows,
};
```

Write the actual 88-entry result to `.local/foundry-v14/inventory/production-active.json`. Verify `modules.length === 88` and include MIDI-QOL `14.0.9`, DAE `14.0.12`, and Item Macro `3.0.1`.

- [ ] **Step 5: Run inventory tests and the live capture**

Run:

```powershell
bun test scripts/foundry-lab/__tests__/remoteInventory.test.ts
bun run foundry:lab inventory --apply
```

Expected:

- test passes;
- disk inventory count is `249`;
- active inventory count is `88`;
- no production file timestamp changes;
- inventories remain ignored by Git.

- [ ] **Step 6: Commit inventory automation**

```powershell
git add scripts/foundry-lab/remoteInventory.ts scripts/foundry-lab/cli.ts scripts/foundry-lab/__tests__/remoteInventory.test.ts
git commit -m "feat: capture Foundry production inventory"
```

---

### Task 4: Classify Active Packages and Generate the Transfer Plan

**Files:**
- Create: `scripts/foundry-lab/classify.ts`
- Create: `scripts/foundry-lab/__tests__/classify.test.ts`
- Modify: `scripts/foundry-lab/cli.ts`
- Create at runtime only: `.local/foundry-v14/inventory/package-plan.json`

**Interfaces:**
- Consumes: `ModuleInventoryEntry[]`, `ActiveModuleEntry[]`.
- Produces: `classifyActivePackages(disk, active): ClassifiedPackage[]`.
- Produces CLI: `bun run foundry:lab classify`.

- [ ] **Step 1: Write positive and negative classification tests**

```ts
import { describe, expect, it } from 'bun:test';
import { classifyActivePackages } from '../classify';

const active = (id: string, version = '1.0.0') => ({ id, title: id, version });
const disk = (overrides: Record<string, unknown>) => ({
  folder: 'sample', id: 'sample', title: 'sample', version: '1.0.0', compatibility: {},
  manifest: 'https://example.test/module.json', download: 'https://example.test/1.0.0.zip',
  requires: [], conflicts: [], protected: false, persistentStorage: false,
  manifestSha256: 'abc', parseError: null, ...overrides,
});

describe('active package classification', () => {
  it('classifies an exact public release for local download', () => {
    expect(classifyActivePackages([disk({})], [active('sample')])[0].packageClass).toBe('upstream-exact');
  });

  it('routes protected content through the authorized account', () => {
    expect(classifyActivePackages([disk({ protected: true })], [active('sample')])[0].packageClass).toBe('account-protected');
  });

  it('requires server transfer when no download exists', () => {
    expect(classifyActivePackages([disk({ download: null, manifest: null })], [active('sample')])[0].packageClass).toBe('server-only');
  });

  it('does not guess when disk and active versions differ', () => {
    expect(classifyActivePackages([disk({ version: '2.0.0' })], [active('sample', '1.0.0')])[0].packageClass).toBe('manual-review');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `bun test scripts/foundry-lab/__tests__/classify.test.ts`
Expected: FAIL because `classifyActivePackages` does not exist.

- [ ] **Step 3: Implement stable classification priority**

Use this exact order:

```ts
export function classifyActivePackages(
  diskEntries: ModuleInventoryEntry[],
  activeEntries: ActiveModuleEntry[],
): ClassifiedPackage[] {
  const byId = new Map(diskEntries.filter((entry) => entry.id).map((entry) => [entry.id!, entry]));
  return activeEntries.map((active) => {
    const disk = byId.get(active.id) ?? null;
    const reasons: string[] = [];
    let packageClass: PackageClass;
    if (!disk || disk.parseError || disk.version !== active.version) {
      packageClass = 'manual-review';
      reasons.push(!disk ? 'active module missing from disk inventory' : disk.parseError ?? 'active and disk versions differ');
    } else if (disk.protected) {
      packageClass = 'account-protected';
      reasons.push('manifest marks package as protected');
    } else if (disk.download && /^https:\/\//i.test(disk.download)) {
      packageClass = 'upstream-exact';
      reasons.push('exact installed manifest exposes HTTPS download');
    } else {
      packageClass = 'server-only';
      reasons.push('no usable exact download URL');
    }
    return { active, disk, packageClass, reasons };
  }).sort((a, b) => a.active.id.localeCompare(b.active.id));
}
```

- [ ] **Step 4: Run tests and classify the actual 88 modules**

Run:

```powershell
bun test scripts/foundry-lab/__tests__/classify.test.ts
bun run foundry:lab classify
```

Expected:

- `4 pass, 0 fail`;
- output total equals `88`;
- class totals also sum to `88`;
- every `manual-review` entry contains a concrete reason;
- no package archive is downloaded by this command.

- [ ] **Step 5: Commit classification logic**

```powershell
git add scripts/foundry-lab/classify.ts scripts/foundry-lab/cli.ts scripts/foundry-lab/__tests__/classify.test.ts
git commit -m "feat: classify Foundry mirror packages"
```

---

### Task 5: Acquire and Install Exact System and Module Packages

**Files:**
- Create: `scripts/foundry-lab/acquire.ts`
- Create: `scripts/foundry-lab/__tests__/acquire.test.ts`
- Modify: `scripts/foundry-lab/cli.ts`
- Modify: `scripts/foundry-lab/README.md`

**Interfaces:**
- Produces: `buildAcquisitionActions(classified): AcquisitionAction[]`.
- Produces: `acquirePackages(config, classified, { apply }): Promise<AcquisitionReport>`.
- Produces CLI: `bun run foundry:lab acquire [--apply]`.

Use these exact result types:

```ts
export type AcquisitionAction =
  | { kind: 'download'; id: string; expectedVersion: string; url: string; destination: string }
  | { kind: 'authorized-manual-install'; id: string; expectedVersion: string; reason: string }
  | { kind: 'scp-directory'; id: string; expectedVersion: string; remoteFolder: string; destination: string }
  | { kind: 'manual-review'; id: string; expectedVersion: string; reason: string };

export interface AcquisitionReport {
  apply: boolean;
  actions: Array<AcquisitionAction & { status: 'planned' | 'installed' | 'unresolved' | 'failed'; error?: string }>;
  installed: number;
  unresolved: number;
  failed: number;
  complete: boolean;
}
```

- [ ] **Step 1: Write failing acquisition safety tests**

Test that:

```ts
const classified = (packageClass: PackageClass): ClassifiedPackage => ({
  active: { id: 'sample', title: 'Sample', version: '1.0.0' },
  disk: {
    folder: 'sample', id: 'sample', title: 'Sample', version: '1.0.0', compatibility: {},
    manifest: 'https://example.test/module.json', download: 'https://example.test/sample-1.0.0.zip',
    requires: [], conflicts: [], protected: packageClass === 'account-protected', persistentStorage: false,
    manifestSha256: 'abc', parseError: null,
  },
  packageClass,
  reasons: [],
});
const publicPackage = classified('upstream-exact');
const protectedPackage = classified('account-protected');
const serverOnlyPackage = classified('server-only');

expect(buildAcquisitionActions([publicPackage])).toEqual([
  expect.objectContaining({ kind: 'download', id: 'sample', expectedVersion: '1.0.0' }),
]);
expect(buildAcquisitionActions([protectedPackage])).toEqual([
  expect.objectContaining({ kind: 'authorized-manual-install', id: 'sample' }),
]);
expect(buildAcquisitionActions([serverOnlyPackage])).toEqual([
  expect.objectContaining({ kind: 'scp-directory', id: 'sample' }),
]);
expect(() => validateArchiveIdentity({ expectedId: 'sample', expectedVersion: '1.0.0' }, {
  id: 'sample', version: '2.0.0',
})).toThrow('Package identity mismatch');
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `bun test scripts/foundry-lab/__tests__/acquire.test.ts`
Expected: FAIL because acquisition functions do not exist.

- [ ] **Step 3: Implement dry-run acquisition and exact identity verification**

Rules:

- default is dry-run;
- download `upstream-exact` archives into `.local/foundry-v14/cache/packages/<id>/<version>/`;
- reject HTTP URLs, redirects to non-HTTPS URLs, HTML error pages, empty archives, and archives whose `module.json` ID/version differ;
- install into `.local/foundry-v14/data/server-mirror/Data/modules/<id>` only after verification;
- install dnd5e `5.3.3` into both profile data paths from `references/dnd5e-5.3.3/system.json`'s fixed download URL;
- leave `account-protected` entries as explicit manual/account actions; never substitute public lookalikes;
- transfer only `server-only` entries with `scp -r` from `Administrator@49.232.12.153:E:/Bill/fvtt_v13/data/Data/modules/<folder>`;
- after the base package is installed, selectively copy `Data/modules/<folder>/storage` for every active manifest with `persistentStorage: true`, regardless of package class, and verify the copied storage tree by relative path, size, and SHA-256;
- do not compress or delete anything on production in the first pass;
- hold `manual-review` packages out of installation.

After every install, read the local UTF-8 manifest and require exact ID/version. Write `.local/foundry-v14/inventory/acquisition-report.json` with per-package status.

- [ ] **Step 4: Run focused tests and acquisition dry-run**

Run:

```powershell
bun test scripts/foundry-lab/__tests__/acquire.test.ts
bun run foundry:lab acquire
```

Expected:

- tests pass;
- dry-run lists actions without network or filesystem mutation;
- total action count equals `88` plus two dnd5e profile installs;
- protected/manual packages remain unresolved rather than silently skipped.

- [ ] **Step 5: Apply public and server-only acquisition**

Run: `bun run foundry:lab acquire --apply`.

Expected:

- all reachable public archives pass ID/version validation;
- server upload bandwidth is used only for `server-only` directories;
- protected packages are listed with their required authorized channel;
- failures are per-package and do not corrupt already verified installs.

- [ ] **Step 6: Install protected packages through authorized interfaces**

Use the local Foundry setup UI and the user's authenticated package accounts for official D&D content, JB2A Patreon, TheRipper93, and other protected packages. Do not paste license keys or account tokens into tracked scripts or chat. After installation, rerun local manifest inventory and match exact production ID/version.

- [ ] **Step 7: Commit acquisition automation and runbook**

```powershell
git add scripts/foundry-lab/acquire.ts scripts/foundry-lab/cli.ts scripts/foundry-lab/README.md scripts/foundry-lab/__tests__/acquire.test.ts
git commit -m "feat: acquire exact Foundry mirror packages"
```

---

### Task 6: Add Parity Reporting and Isolated Profile Launch

**Files:**
- Create: `scripts/foundry-lab/parity.ts`
- Create: `scripts/foundry-lab/launch.ts`
- Create: `scripts/foundry-lab/__tests__/parity.test.ts`
- Create: `scripts/foundry-lab/__tests__/launch.test.ts`
- Modify: `scripts/foundry-lab/cli.ts`
- Create: `docs/acceptance/foundry-v14-module-parity.md`

**Interfaces:**
- Produces: `compareModuleParity(active, local): ParityReport`.
- Produces: `buildLaunchCommand(config, profile): { command: string; args: string[] }`.
- Produces CLI: `bun run foundry:lab parity` and `bun run foundry:lab launch <core-test|server-mirror>`.

- [ ] **Step 1: Write failing parity and launch tests**

Parity tests must cover exact match, missing package, extra package, version mismatch, missing required dependency, and unresolved protected package. Launch tests must assert:

```ts
const config = createLabConfig('I:/OpenCode/fvttV12JsonGenerator');
expect(buildLaunchCommand(config, 'core-test')).toEqual({
  command: resolve(config.nodeRoot, 'node.exe'),
  args: [
    resolve(config.appRoot, 'main.js'),
    '--dataPath', config.profiles.coreTest.dataPath,
    '--hostname', '127.0.0.1',
    '--port', '30000',
    '--noupnp',
  ],
});
```

The server-mirror test must use port `30001` and its own data path.

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```powershell
bun test scripts/foundry-lab/__tests__/parity.test.ts scripts/foundry-lab/__tests__/launch.test.ts
```

Expected: FAIL because parity and launch functions do not exist.

- [ ] **Step 3: Implement parity and loopback-only launch**

`ParityReport` must contain:

```ts
interface ParityReport {
  expected: number;
  exact: string[];
  missing: string[];
  extra: string[];
  versionMismatch: Array<{ id: string; expected: string; actual: string }>;
  missingDependencies: Array<{ id: string; dependency: string }>;
  unresolved: Array<{ id: string; reason: string }>;
  pass: boolean;
}
```

`pass` is true only when all 88 expected IDs have exact versions, dependencies are present, and unresolved is empty. Extra inactive packages are reported but do not fail the active-set parity gate unless they become active.

Launch must:

- check that the selected port is free;
- check `node.exe`, `main.js`, and the selected data path exist;
- bind only `127.0.0.1`;
- immediately query `Get-NetTCPConnection -State Listen -LocalPort <selected port>` after startup and require the listener address to be `127.0.0.1` or `::1`; if it is `0.0.0.0` or `::`, stop the local process before license activation or world launch and report that loopback isolation failed;
- never include an admin key or license value on the command line;
- stream logs into `.local/foundry-v14/evidence/<profile>/server.log`;
- print `http://127.0.0.1:<port>/`.

- [ ] **Step 4: Run tests and generate the first parity report**

Run:

```powershell
bun test scripts/foundry-lab/__tests__/parity.test.ts scripts/foundry-lab/__tests__/launch.test.ts
bun run foundry:lab parity
```

Expected: tests pass. The real parity report may be partial while authorized/manual packages remain; it must state exact gaps and must not claim equivalence.

- [ ] **Step 5: Launch and mechanically verify both profiles one at a time**

Run:

```powershell
bun run foundry:lab launch core-test
bun run foundry:lab launch server-mirror
```

Expected for each profile:

- Foundry UI reports `14.364`;
- dnd5e reports `5.3.3` after system installation;
- URL is loopback-only;
- profile data paths are distinct;
- no second local profile is started on the other's port.

- [ ] **Step 6: Commit parity/launch automation and sanitized report**

```powershell
git add scripts/foundry-lab/parity.ts scripts/foundry-lab/launch.ts scripts/foundry-lab/cli.ts scripts/foundry-lab/__tests__/parity.test.ts scripts/foundry-lab/__tests__/launch.test.ts docs/acceptance/foundry-v14-module-parity.md
git commit -m "feat: verify and launch Foundry mirror profiles"
```

---

### Task 7: Run Module Compatibility and Conflict Acceptance

**Files:**
- Create: `docs/acceptance/foundry-v14-module-compatibility.md`
- Modify: `scripts/foundry-lab/README.md`

**Interfaces:**
- Consumes: exact parity report, local server logs, browser console logs, screenshots, and module group results.
- Produces: evidence-backed compatibility matrix with `Pass`, `Fail`, `Partial`, or `Not Tested` per module family.

- [ ] **Step 1: Establish a no-module baseline**

In `core-test`, create a disposable dnd5e world and verify:

- Foundry `14.364` and dnd5e `5.3.3` are shown in the UI;
- an Actor can be created, opened, edited, rolled, and exported;
- no third-party module script appears in browser console logs;
- the Foundry server log has no blocking error.

Record evidence before enabling mirror modules.

- [ ] **Step 2: Enable dependency/library and sheet modules**

Enable libraries first (`lib-wrapper`, `socketlib`, DFreds libraries, Scene Packer, Portal), then actor-sheet/UI modules (Tidy 5e Sheets, Token Action HUD, 5e resources). Reload and exercise one NPC and one PC sheet. Record exact errors and module IDs.

- [ ] **Step 3: Enable automation/effect modules**

Enable MIDI-QOL `14.0.9`, DAE `14.0.12`, Item Macro `3.0.1`, Automated Conditions 5e, DFreds Convenient Effects, Simple Cover 5e, and Vision 5e. Verify attack, save, damage, condition application/removal, overtime behavior, and manual fallback.

- [ ] **Step 4: Enable animation/media modules**

Enable Automated Animations, dnd5e Animations, Sequencer, JB2A Patreon, Token Magic FX, FXMaster, Share Media, Chat Media, and PSFX. Verify one melee, one ranged, one save-based effect, and one media share without duplicate animations or broken roll completion.

- [ ] **Step 5: Enable scene/token/world utility modules**

Enable Levels, Multilevel Tokens, Monk's Active Tiles, drawing/grid/tile/wall tools, calendars, journals, search, targeting, token controls, localization, and content packages in dependency-safe groups. Check scene load, token movement, walls, tiles, calendar UI, journals, compendia, and localization.

- [ ] **Step 6: Enable the exact complete 88-module set**

Reload the world and collect:

- browser console warnings/errors;
- server log warnings/errors;
- module support/issues panel;
- at least one representative workflow from every group;
- memory/FPS/initial-load observations as informational evidence.

Do not mark the complete set `Pass` if a workflow only loads but cannot be used.

- [ ] **Step 7: Restore production-equivalent world settings only after the clean mirror baseline**

After the clean 88-module mirror starts and group checks are recorded, request explicit approval for a short production maintenance window. Return the production instance to Setup, create a Foundry built-in backup of the active world, verify the backup exists and has non-zero size, copy only that backup archive into `.local/foundry-v14/evidence/production-world-backup`, restore it into `server-mirror`, and relaunch locally. Do not copy or edit the live LevelDB files directly. Keep the raw backup ignored and do not expose player/user data in tracked reports.

- [ ] **Step 8: Bisect every blocking conflict**

For each failure, disable half of the suspected group, reproduce, and continue until the smallest responsible set is identified. Record:

Start the observed-conflict section with this empty table and add rows only for failures actually reproduced during the current run:

```markdown
| Symptom | Minimal enabled set | Reproduction | Console/server evidence | Result |
| --- | --- | --- | --- | --- |
```

- [ ] **Step 9: Write and review the compatibility report**

The final report must distinguish:

- declared compatibility from tested behavior;
- installed from active;
- coexistence from feature correctness;
- proven conflict from suspicious old-looking version numbers;
- production-only uncertainty from local reproduction.

- [ ] **Step 10: Commit the report and runbook changes**

```powershell
git add docs/acceptance/foundry-v14-module-compatibility.md scripts/foundry-lab/README.md
git commit -m "docs: record Foundry v14 module compatibility"
```

---

### Task 8: Complete Foundry v14 Actor Runtime Acceptance

**Files:**
- Modify: `docs/acceptance/v14-live-runtime-smoke-test.md`
- Modify: `docs/acceptance/v14-source-json-full-review.md`
- Runtime outputs only: `obsidian/dnd数据转fvttjson/output/v14-acceptance`
- Runtime outputs only: `obsidian/dnd数据转fvttjson/output/v14-modded-acceptance`

**Interfaces:**
- Consumes: the approved project CLI, `core-test`, `server-mirror`, and the compatibility baseline.
- Produces: completed live-runtime acceptance decision and evidence references.

- [ ] **Step 1: Regenerate both acceptance batches through the project workflow**

Run:

```powershell
bun run src/tools/v14AcceptanceSuite.ts --effect-profile core --out-dir "obsidian/dnd数据转fvttjson/output/v14-acceptance" --report "docs/acceptance/v14-core-batch-verification.md"
bun run src/tools/v14AcceptanceSuite.ts --effect-profile modded-v14 --out-dir "obsidian/dnd数据转fvttjson/output/v14-modded-acceptance" --report "docs/acceptance/v14-modded-batch-verification.md"
```

Expected per profile: 6 samples, 6 passed schema checks, 0 failures, 0 actor verification warnings.

- [ ] **Step 2: Import and exercise all core Actors**

In `core-test`, import all six core outputs. For each Actor, open the sheet and embedded Items, run the specified Activities from `v14-live-runtime-smoke-test.md`, verify chat cards and console logs, re-export, and compare source-relevant fields.

- [ ] **Step 3: Import and exercise all modded-v14 Actors**

In `server-mirror`, import all six modded outputs. Confirm all core interactions still work with the 88-module set enabled.

- [ ] **Step 4: Verify the Bleeding Guardian automation contract**

Confirm:

- Bleeding Bite applies exactly one bleeding effect after the source-defined successful workflow;
- target turn start rolls exactly `1d6` piercing damage once;
- initial `1d8 + 3` hit damage is not reused as overtime damage;
- unrelated Actors do not receive `midi-qol.OverTime`;
- Times Up is not required;
- disabling MIDI-QOL leaves the Actor and Item usable manually.

- [ ] **Step 5: Run full mechanical verification**

Run:

```powershell
bun test
bun run audit:anti-overfit
git diff --check
```

Expected: all tests pass, anti-overfit passes, and diff check reports no whitespace errors. If a known unrelated baseline failure occurs, isolate and document it rather than relabeling it as success.

- [ ] **Step 6: Update the runtime acceptance decision**

Change the checklist rows only when backed by current screenshots/logs/re-exports. The overall status is `Pass` only if every required gate passes; otherwise use `Partial` or `Fail` and list exact gaps.

- [ ] **Step 7: Commit final acceptance evidence**

```powershell
git add docs/acceptance/v14-live-runtime-smoke-test.md docs/acceptance/v14-source-json-full-review.md docs/acceptance/v14-core-batch-verification.md docs/acceptance/v14-modded-batch-verification.md
git commit -m "test: complete Foundry v14 runtime acceptance"
```

---

## Final Completion Gate

Before claiming the task complete, freshly verify all of the following:

```powershell
bun run test:foundry-lab
bun test
bun run audit:anti-overfit
bun run foundry:lab parity
git diff --check
git status --short
```

Required semantic evidence:

- local core-test actual import/interaction results;
- local server-mirror actual 88-module startup and functional group results;
- exact unresolved premium/private/manual packages, if any;
- minimal reproductions for every claimed conflict;
- production comparison without modifying production settings;
- explicit separation of mechanical validation from semantic acceptance.
