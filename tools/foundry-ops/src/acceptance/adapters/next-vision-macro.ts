import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { exactPath, fileIdentity, readJson, record, sha256, workspaceIdentity } from '../files';
import { AcceptanceError, type ExternalBatchBinding, type FileIdentity, type AcceptanceStatus } from '../model';

const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const thread = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

/** Inspect the existing candidate contract, never run its scripts or touch its runtime. */
export function inspectNextVmSource(sourcePath: string): { ok: true; binding: ExternalBatchBinding; files: FileIdentity[]; offline: 'PASS'; runtime: 'NOT_EXECUTED'; historicalPreflight: string } {
  const sourceContract = fileIdentity(sourcePath);
  const source = record(readJson(sourceContract.absolutePath));
  if (!nonempty(source.dispatchId) || !nonempty(source.stage) || !thread(source.parentThreadId) || !thread(source.childThreadId)
    || !nonempty(source.worktree) || !nonempty(source.evidenceRoot) || !nonempty(source.parentContinuation)) throw new AcceptanceError('precondition', 'Unsupported source batch contract identity.');
  const sourceWorkspace = workspaceIdentity(source.worktree);
  const evidenceRoot = exactPath(source.evidenceRoot);
  exactPath(sourceContract.absolutePath, evidenceRoot);
  const target = record(source.target);
  for (const key of ['origin', 'dataPath', 'world', 'foundry', 'system', 'systemVersion']) if (!nonempty(target[key])) throw new AcceptanceError('precondition', `Missing declared target ${key}.`);
  const origin = new URL(target.origin as string);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port || origin.username || origin.password
    || origin.pathname !== '/' || origin.search || origin.hash || target.system !== 'dnd5e') throw new AcceptanceError('precondition', 'Expected the declared local dnd5e target.');
  // Lexical normalization only: offline preparation does not open the data directory.
  if (!/^[A-Za-z]:[\\/]/.test(target.dataPath as string)) throw new AcceptanceError('precondition', 'Absolute declared dataPath required.');
  const files = new Map<string, FileIdentity>([[sourceContract.absolutePath, sourceContract]]);
  const add = (path: string, root: string, expected?: unknown) => {
    const identity = fileIdentity(path, root);
    if (expected !== undefined && (!digest(expected) || identity.sha256 !== expected.toLowerCase())) throw new AcceptanceError('evidence', `Source candidate hash mismatch: ${identity.absolutePath}`);
    files.set(identity.absolutePath, identity);
    return identity;
  };
  if (!Array.isArray(source.candidates) || source.candidates.length !== 2) throw new AcceptanceError('precondition', 'Expected exactly the Vision5e and Item Macro candidates.');
  const candidates: ExternalBatchBinding['candidates'] = [];
  for (const value of source.candidates) {
    const candidate = record(value);
    if (!['vision-5e', 'itemacro'].includes(String(candidate.id)) || candidates.some(item => item.id === candidate.id)
      || !nonempty(candidate.version) || !nonempty(candidate.source) || !Array.isArray(candidate.files) || candidate.files.length === 0) throw new AcceptanceError('precondition', 'Invalid candidate manifest.');
    const root = exactPath(candidate.source, sourceWorkspace.absoluteRoot);
    const declared: string[] = [];
    for (const value of candidate.files) {
      const file = record(value);
      if (!nonempty(file.path)) throw new AcceptanceError('precondition', 'Missing relative resource path.');
      const identity = add(join(root, file.path), root, file.sha256);
      const rel = relative(root, identity.absolutePath).split(sep).join('/');
      if (rel !== file.path || declared.includes(rel)) throw new AcceptanceError('precondition', 'Resource paths must be unique normalized relative paths.');
      declared.push(rel);
    }
    const actual: string[] = [];
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = exactPath(join(directory, entry.name), root);
        if (entry.isDirectory()) walk(path);
        else if (entry.isFile()) actual.push(relative(root, path).split(sep).join('/'));
        else throw new AcceptanceError('precondition', 'Candidate resource must be an ordinary file or directory.');
      }
    };
    walk(root); actual.sort();
    if (JSON.stringify(actual) !== JSON.stringify(declared.sort())) throw new AcceptanceError('evidence', 'Candidate resource inventory is incomplete or contains extra files.');
    const manifest = record(readJson(join(root, 'module.json')));
    if (manifest.id !== candidate.id || manifest.version !== candidate.version) throw new AcceptanceError('evidence', 'Candidate manifest identity mismatch.');
    add(join(dirname(root), `${basename(root)}.zip`), sourceWorkspace.absoluteRoot, candidate.archiveSha256);
    candidates.push({ id: String(candidate.id), version: candidate.version });
  }
  const tool = record(source.tool);
  if (!nonempty(tool.name) || !nonempty(tool.importJson) || !nonempty(tool.itemMacroCommandFile) || !digest(tool.commandSha256) || !digest(tool.itemMacroCommandSha256)) throw new AcceptanceError('precondition', 'Missing prepared tool identities.');
  add(tool.importJson, evidenceRoot);
  const macro = record(readJson(tool.importJson));
  const flags = record(record(macro.flags).world);
  if (macro.type !== 'script' || macro.name !== tool.name || !nonempty(macro.command) || flags.nextVMDispatch !== source.dispatchId
    || sha256(macro.command) !== tool.commandSha256.toLowerCase() || [...macro.command].length !== tool.commandCharacters) throw new AcceptanceError('evidence', 'Prepared macro serialization or batch binding mismatch.');
  if (!macro.command.startsWith(`const dispatchId=${JSON.stringify(source.dispatchId)},`)) throw new AcceptanceError('evidence', 'Prepared macro code uses another batch.');
  for (const [expression, value] of [['location.hostname', origin.hostname], ['location.port', origin.port], ['game.world.id', target.world], ['game.version', target.foundry], ['game.system.version', target.systemVersion]]) {
    if (!macro.command.includes(`${expression}!==${JSON.stringify(value)}`)) throw new AcceptanceError('evidence', `Prepared macro target gate mismatch: ${expression}`);
  }
  // The existing Python producer hashes read_text() (universal newlines), then writes a Windows text file.
  // Keep the exact byte identity as well as checking its declared text checksum.
  const itemCommandFile = add(tool.itemMacroCommandFile, evidenceRoot);
  const itemCommandText = readFileSync(itemCommandFile.absolutePath, 'utf8').replace(/\r\n?/g, '\n');
  if (sha256(itemCommandText) !== tool.itemMacroCommandSha256.toLowerCase()) throw new AcceptanceError('evidence', 'Prepared Item Macro text checksum mismatch.');
  const idText = /^const ids=\{([^}]+)\};$/m.exec(macro.command)?.[1];
  const fixtureIds = Object.fromEntries([...(idText ?? '').matchAll(/([A-Za-z][A-Za-z0-9]*):"([A-Za-z0-9]{16})"/g)].map(match => [match[1]!, match[2]!]));
  const roles = ['observer', 'target', 'scene', 'folder', 'player', 'observerToken', 'near', 'far', 'item', 'activity', 'weapon', 'poisonActivity', 'inaudible', 'magical'];
  if (!idText || Object.keys(fixtureIds).length !== roles.length || roles.some(role => !fixtureIds[role]) || new Set(Object.values(fixtureIds)).size !== roles.length
    || idText.replace(/([A-Za-z][A-Za-z0-9]*):"([A-Za-z0-9]{16})"/g, '').replaceAll(',', '').trim()) throw new AcceptanceError('precondition', 'Unsupported fixture ID declaration; do not evaluate source code to recover it.');
  const cleanup = record(source.cleanupAllowlist);
  if (JSON.stringify(cleanup.actors) !== JSON.stringify([fixtureIds.observer, fixtureIds.target]) || cleanup.scene !== fixtureIds.scene || cleanup.folder !== fixtureIds.folder || cleanup.player !== fixtureIds.player
    || JSON.stringify(cleanup.tokens) !== JSON.stringify([fixtureIds.observerToken, fixtureIds.near, fixtureIds.far])
    || JSON.stringify(cleanup.items) !== JSON.stringify([fixtureIds.item, fixtureIds.weapon]) || JSON.stringify(cleanup.effects) !== JSON.stringify([fixtureIds.inaudible, fixtureIds.magical])) throw new AcceptanceError('evidence', 'Cleanup ownership does not match the prepared fixture.');
  if (fileIdentity(sourceContract.absolutePath).sha256 !== sourceContract.sha256) throw new AcceptanceError('evidence', 'Source contract changed during inspection.');
  return { ok: true, binding: {
    consumer: 'server-next-vision-macro', sourceContract, sourceDispatchId: source.dispatchId, sourceWorkspace,
    parentThreadId: source.parentThreadId, childThreadId: source.childThreadId, sourceStage: source.stage,
    parentContinuation: source.parentContinuation, runtimeAuthority: 'NONE',
    target: Object.fromEntries(['origin', 'dataPath', 'world', 'foundry', 'system', 'systemVersion'].map(key => [key, target[key]])) as ExternalBatchBinding['target'], candidates, fixtureIds, itemCommandSha256: tool.itemMacroCommandSha256.toLowerCase(),
  }, files: [...files.values()], offline: 'PASS', runtime: 'NOT_EXECUTED', historicalPreflight: typeof source.offline === 'string' ? source.offline : 'UNAVAILABLE' };
}

export function assessNextVmReadback(batch: ExternalBatchBinding, contextValue: unknown, text: string) {
  const context = record(contextValue);
  const normalizePath = (value: unknown) => typeof value === 'string' ? value.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase() : '';
  for (const [key, expected] of Object.entries(batch.target)) {
    const matches = key === 'dataPath' ? normalizePath(context[key]) === normalizePath(expected) : context[key] === expected;
    if (!matches) throw new AcceptanceError('evidence', `External receipt target mismatch: ${key}`);
  }
  let outer: Record<string, unknown>;
  try { outer = record(JSON.parse(text)); } catch { throw new AcceptanceError('evidence', 'Native receipt is empty or invalid JSON.'); }
  if (outer.dispatchId !== batch.sourceDispatchId) throw new AcceptanceError('evidence', 'External receipt source dispatch mismatch.');
  const raw = record(outer.readback ?? outer);
  if (raw.dispatchId !== batch.sourceDispatchId || raw.world !== batch.target.world || raw.core !== batch.target.foundry || raw.system !== batch.target.systemVersion) throw new AcceptanceError('evidence', 'External readback environment mismatch.');
  const modules = record(raw.modules);
  for (const candidate of batch.candidates) {
    const module = record(modules[candidate.id]);
    if (module.version !== candidate.version || module.active !== true) throw new AcceptanceError('evidence', `External receipt candidate mismatch: ${candidate.id}`);
  }
  const statuses: Record<string, AcceptanceStatus> = { senses: 'INCOMPLETE', command: 'INCOMPLETE', manualApi: 'INCOMPLETE', activityApi: 'INCOMPLETE' };
  const ids = batch.fixtureIds;
  const actors = raw.actorIds ? record(raw.actorIds) : undefined;
  if (raw.phase === 'prepared' && (!actors || actors.observer !== ids.observer || actors.target !== ids.target)) throw new AcceptanceError('evidence', 'External receipt fixture mismatch.');
  const operations = raw.operations ? record(raw.operations) : {};
  const operation = (name: string) => {
    const value = operations[name];
    if (!value) return undefined;
    const entry = record(value);
    return entry.status === 'completed' && entry.result ? record(entry.result) : undefined;
  };
  const senses = operation('senses');
  if (senses) {
    const steps = [senses.before, senses.ninety, senses.restored];
    if (steps.every(step => step && typeof step === 'object' && !Array.isArray(step))) {
      const numbers = steps.map(step => record(step));
      if (numbers.every(step => typeof step.actor === 'number' && typeof step.token === 'number')) statuses.senses = numbers.every((step, index) => step.actor === [60, 90, 60][index] && step.token === [60, 90, 60][index]) ? 'PASS' : 'FAIL';
    }
  }
  const item = raw.macroItem ? record(raw.macroItem) : undefined;
  if (item && item.id !== ids.item) throw new AcceptanceError('evidence', 'External receipt Item identity mismatch.');
  if (item && typeof item.command === 'string') statuses.command = sha256(item.command) === batch.itemCommandSha256 || (!item.command.endsWith('\n') && sha256(`${item.command}\n`) === batch.itemCommandSha256) ? 'PASS' : 'FAIL';
  for (const [name, key] of [['manual-api', 'manualApi'], ['activity-api', 'activityApi']] as const) {
    const result = operation(name);
    if (!result || typeof result.added !== 'number' || !result.record || !item || !Array.isArray(item.records)) continue;
    const observed = record(result.record);
    const matching = item.records.filter(value => {
      const entry = record(value);
      return ['kind', 'eventType', 'activityId', 'marker', 'positional'].every(key => entry[key] === observed[key]);
    });
    const expected = name === 'manual-api' ? observed.kind === 'manual' && observed.eventType === 'next-vm-api' && observed.positional === 42 && observed.marker === 'manual-api'
      : observed.kind === 'activity' && observed.activityId === ids.activity && observed.marker === 'activity-api';
    statuses[key] = result.added === 1 && matching.length === 1 && expected ? 'PASS' : 'FAIL';
  }
  // These are reference data observations. UI, loaded hashes, role/reload and complete cleanup are not supplied by this readback.
  return { observations: statuses, evidence: 'INCOMPLETE' as const, behavior: 'INCOMPLETE' as const, cleanup: 'NOT_EXECUTED' as const,
    runtime: 'NOT_EXECUTED' as const, sourcePhase: typeof raw.phase === 'string' ? raw.phase : 'UNKNOWN', sourceError: typeof outer.error === 'string' ? outer.error : null,
    reason: 'Imported reference only; current scope has no runtime authority. Native readback does not prove UI, loaded build hashes, role/reload or the full cleanup allowlist.' };
}
