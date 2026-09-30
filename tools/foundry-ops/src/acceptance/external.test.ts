import { afterEach, beforeEach, expect, test as bunTest } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { assessNextVmReadback, inspectNextVmSource } from './adapters/next-vision-macro';
import { captureExternalReceipt, dispatchExternalBatch, externalReadiness, importExternalReceipt, prepareExternalBatch } from './external';
import { readJson, sha256 } from './files';
import { executeAcceptance, prepareAcceptance, requireReady } from './workflow';
import { runAcceptanceCli } from './cli';
import type { AcceptanceRequest } from './model';

const test = (name: string, run: () => void | Promise<void>) => bunTest(name, run, 20000);
let sandbox: string, root: string, owner: string, sourcePath: string, inputPath: string, rawPath: string, contextPath: string;
let source: Record<string, any>;
const names = ['observer', 'target', 'scene', 'folder', 'player', 'observerToken', 'near', 'far', 'item', 'activity', 'weapon', 'poisonActivity', 'inaudible', 'magical'];
const ids = Object.fromEntries(names.map((name, index) => [name, index.toString(16).padStart(16, 'F')]));
const itemCommand = 'const fixture = 1;\nreturn true;\n';
const target = { origin: 'http://127.0.0.1:30002', dataPath: 'F:/fixture/data/server-next', world: 'fixture-world', foundry: '14.368', system: 'dnd5e', systemVersion: '6.0.2' };
const sourceDispatchId = 'SYNTHETIC-VM-BATCH';

function json(path: string, value: unknown) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); }
function git(path: string, ...args: string[]) {
  const result = spawnSync('git', ['-C', path, ...args], { encoding: 'utf8', timeout: 5000, windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr);
}
function repo(path: string) {
  mkdirSync(join(path, '.ruler'), { recursive: true }); mkdirSync(join(path, 'docs/runbooks'), { recursive: true });
  for (const name of ['AGENTS.md', '.ruler/AGENTS.md', 'docs/runbooks/development-feedback-loop.md']) writeFileSync(join(path, name), 'synthetic fixture policy\n');
  git(path, 'init', '-b', 'codex/fixture'); git(path, 'config', 'user.email', 'fixture@example.invalid'); git(path, 'config', 'user.name', 'Fixture');
  git(path, 'add', '--', 'AGENTS.md', '.ruler/AGENTS.md', 'docs/runbooks/development-feedback-loop.md'); git(path, 'commit', '-m', 'fixture');
}
function saveSource() { json(sourcePath, source); }
function native() {
  const manual = { kind: 'manual', eventType: 'next-vm-api', activityId: null, marker: 'manual-api', positional: 42 };
  const activity = { kind: 'activity', eventType: null, activityId: ids.activity, marker: 'activity-api', positional: null };
  // Field mapping is from the existing readback(), senses(), manualAPI(), activityAPI() and item-command.js.
  // These are synthetic protocol vectors, never runtime acceptance evidence.
  return { dispatchId: sourceDispatchId, phase: 'prepared', world: target.world, core: target.foundry, system: target.systemVersion,
    modules: { 'vision-5e': { version: '3.2.2+fixture', active: true }, itemacro: { version: '3.0.1+fixture', active: true } },
    actorIds: { observer: ids.observer, target: ids.target }, macroItem: { id: ids.item, command: itemCommand, records: [manual, activity] },
    operations: { senses: { status: 'completed', result: { before: { actor: 60, token: 60 }, ninety: { actor: 90, token: 90 }, restored: { actor: 60, token: 60 }, pass: false } },
      'manual-api': { status: 'completed', result: { added: 1, record: manual, pass: false } }, 'activity-api': { status: 'completed', result: { added: 1, record: activity, pass: false } } } };
}
async function prepare() { return prepareExternalBatch(inputPath); }

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'fvtt-external-acceptance-'));
  root = join(sandbox, 'tool-worktree'); owner = join(sandbox, 'source-worktree'); repo(root); repo(owner);
  const evidence = join(sandbox, 'evidence'); mkdirSync(evidence);
  const dist = join(owner, 'dist'); mkdirSync(dist);
  const candidates = ['vision-5e', 'itemacro'].map((id, index) => {
    const directory = join(dist, id); mkdirSync(directory);
    const version = index === 0 ? '3.2.2+fixture' : '3.0.1+fixture';
    json(join(directory, 'module.json'), { id, version });
    writeFileSync(join(directory, 'script.js'), '// Synthetic resource bytes\n');
    writeFileSync(join(dist, `${id}.zip`), 'synthetic archive identity, never installed');
    return { id, version, source: directory, archiveSha256: sha256(readFileSync(join(dist, `${id}.zip`))), files: ['module.json', 'script.js'].map(path => ({ path, sha256: sha256(readFileSync(join(directory, path))) })) };
  });
  const command = `const dispatchId=${JSON.stringify(sourceDispatchId)},macro=this;\nconst ids={${names.map(name => `${name}:${JSON.stringify(ids[name])}`).join(',')}};\nif(location.hostname!=="127.0.0.1"||location.port!=="30002"||game.world.id!=="fixture-world"||game.version!=="14.368"||game.system.version!=="6.0.2")throw Error("fixture");\n`;
  const macroPath = join(evidence, 'macro.json'), itemPath = join(evidence, 'item-command.js');
  json(macroPath, { name: 'Synthetic Controls', type: 'script', command, flags: { world: { nextVMDispatch: sourceDispatchId } } });
  writeFileSync(itemPath, itemCommand.replaceAll('\n', '\r\n'));
  source = { dispatchId: sourceDispatchId, stage: 'PREPARED_NOT_DISPATCHED', activationGate: 'fixture paused', parentContinuation: 'PAUSED_BY_USER',
    parentThreadId: '11111111-1111-4111-8111-111111111111', childThreadId: '22222222-2222-4222-8222-222222222222', worktree: owner, evidenceRoot: evidence, target, candidates,
    tool: { name: 'Synthetic Controls', importJson: macroPath, commandSha256: sha256(command), commandCharacters: command.length, itemMacroCommandFile: itemPath, itemMacroCommandSha256: sha256(itemCommand) },
    cleanupAllowlist: { actors: [ids.observer, ids.target], scene: ids.scene, folder: ids.folder, player: ids.player, tokens: [ids.observerToken, ids.near, ids.far], items: [ids.item, ids.weapon], effects: [ids.inaudible, ids.magical] }, offline: 'Historical fixture label only; not a current test result.' };
  sourcePath = join(evidence, 'source.json'); saveSource(); inputPath = join(root, 'request.json');
  json(inputPath, { workspaceRoot: root, sourceContractPath: sourcePath, authority: { source: 'Owned synthetic offline test', scope: 'offline-batch-preparation' } });
  rawPath = join(sandbox, 'native.json'); contextPath = join(sandbox, 'context.json'); json(rawPath, native()); json(contextPath, target);
});
afterEach(() => {
  const absolute = resolve(sandbox);
  if (dirname(absolute) !== resolve(tmpdir()) || !absolute.split(/[\\/]/).at(-1)?.startsWith('fvtt-external-acceptance-')) throw new Error('Unowned temporary root');
  rmSync(absolute, { recursive: true, force: false });
});

test('source inspection preserves callback ownership, candidate identity and both checksum meanings', () => {
  const before = readFileSync(sourcePath);
  const inspection = inspectNextVmSource(sourcePath);
  expect(inspection).toMatchObject({ ok: true, offline: 'PASS', runtime: 'NOT_EXECUTED' });
  expect(inspection.binding.parentThreadId).toBe(source.parentThreadId);
  expect(inspection.binding.runtimeAuthority).toBe('NONE');
  expect(inspection.files.find(file => file.absolutePath.endsWith('item-command.js'))!.sha256).not.toBe(inspection.binding.itemCommandSha256);
  expect(readFileSync(sourcePath)).toEqual(before);
});
test('changed candidate bytes, undeclared resources and wrong declared target fail inspection', () => {
  const path = join(source.candidates[0].source, 'script.js'); const before = readFileSync(path); writeFileSync(path, 'different');
  expect(() => inspectNextVmSource(sourcePath)).toThrow('hash mismatch'); writeFileSync(path, before);
  const extra = join(source.candidates[0].source, 'extra.js'); writeFileSync(extra, 'extra');
  expect(() => inspectNextVmSource(sourcePath)).toThrow('extra files'); rmSync(extra, { force: false });
  source.target = { ...target, origin: 'http://127.0.0.1:30001' }; saveSource();
  expect(() => inspectNextVmSource(sourcePath)).toThrow('target gate mismatch');
});
test('wrong macro serialization, text content and cleanup ownership are rejected', () => {
  const path = source.tool.itemMacroCommandFile; const before = readFileSync(path); writeFileSync(path, `${itemCommand}changed`);
  expect(() => inspectNextVmSource(sourcePath)).toThrow('text checksum mismatch'); writeFileSync(path, before);
  source.cleanupAllowlist.actors = ['foreign']; saveSource(); expect(() => inspectNextVmSource(sourcePath)).toThrow('Cleanup ownership');
});
test('missing fixture roles are rejected even when file checksums match', () => {
  const path = source.tool.importJson; const macro: any = readJson(path);
  macro.command = macro.command.replace('observer:', 'other:').replace('target:', 'otherTarget:');
  source.tool.commandSha256 = sha256(macro.command); source.tool.commandCharacters = macro.command.length;
  source.cleanupAllowlist.actors = [null, null]; json(path, macro); saveSource();
  expect(() => inspectNextVmSource(sourcePath)).toThrow('Unsupported fixture ID');
});
test('source resource traversal and junctions cannot escape the explicit source root', () => {
  source.candidates[0].files[1].path = '../outside'; saveSource();
  expect(() => inspectNextVmSource(sourcePath)).toThrow('escapes');
  source.candidates[0].files[1].path = 'script.js'; saveSource();
  const link = join(source.candidates[0].source, 'linked'); symlinkSync(root, link, process.platform === 'win32' ? 'junction' : 'dir');
  expect(() => inspectNextVmSource(sourcePath)).toThrow('unsafe symlink'); unlinkSync(link);
});
test('offline preparation binds external sources and blocks the actual dispatch callback', async () => {
  const before = readFileSync(sourcePath); const contract = await prepare();
  expect(contract.readonlySources!.length).toBeGreaterThan(8);
  expect(requireReady(contract.contractAbsolutePath).request.authority.scope).toBe('local-file-checks');
  expect(externalReadiness(contract.contractAbsolutePath)).toMatchObject({ offlineReady: true, dispatchable: false, parentContinuation: 'PAUSED_BY_USER' });
  let calls = 0;
  await expect(dispatchExternalBatch(contract.contractAbsolutePath, async () => { calls++; })).rejects.toThrow('no runtime authority');
  expect(calls).toBe(0); expect(readFileSync(sourcePath)).toEqual(before);
  expect(existsSync(join(dirname(contract.contractAbsolutePath), 'dispatch-claim.json'))).toBe(false);
});
test('source contract and source workspace drift reject old prepared contracts', async () => {
  const contract = await prepare(); const before = readFileSync(sourcePath); source.stage = 'CHANGED'; saveSource();
  expect(() => externalReadiness(contract.contractAbsolutePath)).toThrow('Read-only source changed'); writeFileSync(sourcePath, before);
  git(owner, 'switch', '-c', 'codex/changed'); expect(() => externalReadiness(contract.contractAbsolutePath)).toThrow('Source worktree identity');
});
test('capture and repeated import keep raw bytes, stable receipt ID and incomplete runtime status', async () => {
  const contract = await prepare(); const rawBytes = readFileSync(rawPath);
  const captured = captureExternalReceipt(contract.contractAbsolutePath, rawPath, contextPath);
  const first = importExternalReceipt(contract.contractAbsolutePath, captured.envelopePath);
  expect(first).toMatchObject({ behavior: 'INCOMPLETE', evidence: 'INCOMPLETE', runtime: 'NOT_EXECUTED', cleanup: 'NOT_EXECUTED', parentReview: 'PENDING', purpose: 'REFERENCE_ONLY' });
  expect(first.observations).toEqual({ senses: 'PASS', command: 'PASS', manualApi: 'PASS', activityApi: 'PASS' });
  expect(importExternalReceipt(contract.contractAbsolutePath, captured.envelopePath)).toEqual(first);
  expect(readFileSync(rawPath)).toEqual(rawBytes);
  expect(captureExternalReceipt(contract.contractAbsolutePath, rawPath, contextPath).envelopePath).toBe(captured.envelopePath);
});
test('partial original writes resume by readback without overwrite or data replay', async () => {
  const contract = await prepare(); const captured = captureExternalReceipt(contract.contractAbsolutePath, rawPath, contextPath);
  const bytes = readFileSync(captured.envelopePath), envelope: any = readJson(captured.envelopePath);
  const directory = join(dirname(contract.contractAbsolutePath), 'imports', sha256(bytes)); mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'envelope.json'), bytes); writeFileSync(join(directory, 'native.json'), envelope.raw.text);
  const imported = importExternalReceipt(contract.contractAbsolutePath, captured.envelopePath);
  expect(imported.purpose).toBe('REFERENCE_ONLY'); expect(readFileSync(join(directory, 'envelope.json'))).toEqual(bytes);
  expect(importExternalReceipt(contract.contractAbsolutePath, captured.envelopePath).receiptId).toBe(imported.receiptId);
});
test('data classification ignores pass labels and derives numeric/ledger outcomes', () => {
  const binding = inspectNextVmSource(sourcePath).binding; const raw = native();
  raw.operations.senses.result.ninety.token = 80; raw.operations.senses.result.pass = true;
  raw.operations['manual-api'].result.added = 2; raw.operations['manual-api'].result.pass = true;
  const assessment = assessNextVmReadback(binding, target, JSON.stringify(raw));
  expect(assessment.observations.senses).toBe('FAIL'); expect(assessment.observations.manualApi).toBe('FAIL'); expect(assessment.behavior).toBe('INCOMPLETE');
});
test('missing fields, cleaned labels and record key order cannot manufacture full acceptance', () => {
  const binding = inspectNextVmSource(sourcePath).binding;
  const raw: any = native(); raw.operations['manual-api'].result.record = Object.fromEntries(Object.entries(raw.operations['manual-api'].result.record).reverse());
  expect(assessNextVmReadback(binding, target, JSON.stringify(raw)).observations.manualApi).toBe('PASS');
  delete raw.operations.senses.result.ninety;
  expect(assessNextVmReadback(binding, target, JSON.stringify(raw)).observations.senses).toBe('INCOMPLETE');
  raw.phase = 'cleaned'; raw.scene = null; raw.player = null; raw.actorIds = { observer: null, target: null }; raw.macroItem = null;
  expect(assessNextVmReadback(binding, target, JSON.stringify(raw)).cleanup).toBe('NOT_EXECUTED');
});
test('empty output, wrong target, wrong candidate and wrong source dispatch fail before capture', async () => {
  const contract = await prepare();
  for (const text of ['', '{}', JSON.stringify({ ...native(), dispatchId: 'old' })]) {
    writeFileSync(rawPath, text); expect(() => captureExternalReceipt(contract.contractAbsolutePath, rawPath, contextPath)).toThrow();
  }
  json(rawPath, native()); json(contextPath, { ...target, origin: 'http://127.0.0.1:30001' });
  expect(() => captureExternalReceipt(contract.contractAbsolutePath, rawPath, contextPath)).toThrow('target mismatch');
  json(contextPath, target); const raw = native(); raw.modules.itemacro.version = 'wrong'; json(rawPath, raw);
  expect(() => captureExternalReceipt(contract.contractAbsolutePath, rawPath, contextPath)).toThrow('candidate mismatch');
  expect(existsSync(join(dirname(contract.contractAbsolutePath), 'captures'))).toBe(false);
});
test('wrong run, revision, source hash, and altered raw bytes are rejected at import', async () => {
  const contract = await prepare(); const captured = captureExternalReceipt(contract.contractAbsolutePath, rawPath, contextPath);
  const original = readFileSync(captured.envelopePath); const envelope: any = readJson(captured.envelopePath);
  for (const key of ['runId', 'dispatchId', 'contractRevision', 'sourceContractSha256', 'contractSha256']) {
    json(captured.envelopePath, { ...envelope, binding: { ...envelope.binding, [key]: 'old' } });
    expect(() => importExternalReceipt(contract.contractAbsolutePath, captured.envelopePath)).toThrow('Old or wrong');
  }
  json(captured.envelopePath, { ...envelope, raw: { ...envelope.raw, text: '{}' } });
  expect(() => importExternalReceipt(contract.contractAbsolutePath, captured.envelopePath)).toThrow('Native receipt bytes');
  writeFileSync(captured.envelopePath, original);
  expect(existsSync(join(dirname(contract.contractAbsolutePath), 'imports'))).toBe(false);
});
test('another common run cannot import the first run envelope', async () => {
  const first = await prepare(); const captured = captureExternalReceipt(first.contractAbsolutePath, rawPath, contextPath); const second = await prepare();
  expect(() => importExternalReceipt(second.contractAbsolutePath, captured.envelopePath)).toThrow('Old or wrong');
});
test('failed preflight denies import even when source identity is otherwise valid', async () => {
  const first = await prepare(); const generated: AcceptanceRequest = { ...first.request, preflight: [{ id: 'fail', argv: [process.execPath, '-e', 'process.exit(1)'], timeoutMs: 3000 }] };
  const failingInput = join(root, 'failed.json'); json(failingInput, generated); const failed = await prepareAcceptance(failingInput);
  expect(() => captureExternalReceipt(failed.contractAbsolutePath, rawPath, contextPath)).toThrow('Preflight failed');
});
test('offline local execution does not grant runtime authority after it completes', async () => {
  const contract = await prepare(); const receipt = await executeAcceptance(contract.contractAbsolutePath);
  expect(receipt.runId).toBe(contract.runId); expect(externalReadiness(contract.contractAbsolutePath).dispatchable).toBe(false);
});
test('CLI distinguishes local success from runtime ready and reference import exit codes', async () => {
  const output: string[] = []; const code = await runAcceptanceCli(['prepare-batch', `--input=${inputPath}`], text => output.push(text));
  expect(code).toBe(0); const path = JSON.parse(output[0]!).contractAbsolutePath;
  expect(await runAcceptanceCli(['ready-batch', `--contract=${path}`], text => output.push(text))).toBe(2);
  const captured = captureExternalReceipt(path, rawPath, contextPath);
  expect(await runAcceptanceCli(['import-receipt', `--contract=${path}`, `--input=${captured.envelopePath}`], text => output.push(text))).toBe(2);
  expect(JSON.parse(output.at(-1)!).purpose).toBe('REFERENCE_ONLY');
});
