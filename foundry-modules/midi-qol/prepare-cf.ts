import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { workflowFingerprints } from './bundle-identity';
import { loadLock, sha256, sourceRoot, distRoot, run, workspaceRoot, verifyArchive } from './tooling';
import { CF_MACRO_NAME, CF_ACTIVITY_ID, makeCfItemData, assertCfActivity } from './cf-fixture.mjs';

const output = resolve(import.meta.dir, 'dist/cf-fixture');
const lock = await loadLock();
const result = JSON.parse(await readFile(resolve(distRoot, 'build-result.json'), 'utf8'));
if (result.candidateVersion !== lock.candidateVersion || result.upstreamCommit !== lock.commit
  || result.zipSha256 !== await sha256(result.zipPath)) throw new Error('Build evidence mismatch.');
await verifyArchive(result.zipPath, lock.candidateVersion);
const bundle = (await run('tar', ['-xOf', result.zipPath, 'midi-qol/midi-qol.js'], workspaceRoot)).stdout;
const ts = createRequire(resolve(sourceRoot, 'package.json'))('typescript');
const clientBuild = { candidateVersion: lock.candidateVersion, upstreamCommit: lock.commit,
  zipSha256: result.zipSha256, bundleSha256: createHash('sha256').update(bundle).digest('hex').toUpperCase(),
  ...workflowFingerprints(bundle, ts) };
const data = makeCfItemData();
assertCfActivity(data.system.activities[CF_ACTIVITY_ID]);
const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, 'cf-macro-entry.mjs')], target: 'browser', format: 'esm', minify: false,
  define: { __CF_BUILD__: JSON.stringify(clientBuild) } });
if (!build.success || build.outputs.length !== 1) throw new Error(build.logs.map(String).join('\n'));
const command = await build.outputs[0]!.text();
// Macro commands are compiled by Foundry as async functions.
new (Object.getPrototypeOf(async function () {}).constructor)(command);
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'cf-macro.js'), command);
await writeFile(resolve(output, 'cf-macro.json'), JSON.stringify({ name: CF_MACRO_NAME, type: 'script', scope: 'global', img: 'icons/svg/aura.svg', command, ownership: { default: 0 } }, null, 2));
await writeFile(resolve(output, 'cf-item-input.json'), JSON.stringify(data, null, 2));
await writeFile(resolve(output, 'client-build.json'), JSON.stringify(clientBuild, null, 2));
console.log(JSON.stringify({ output, name: CF_MACRO_NAME, precheck: 'PASS', commandSha256: createHash('sha256').update(command).digest('hex'),
  duration: data.system.activities[CF_ACTIVITY_ID].duration, target: data.system.activities[CF_ACTIVITY_ID].target,
  runtimeReadback: 'Required after native Document creation; no world has been modified by this build.' }, null, 2));
