import { legacyNextInputPath } from '../../../../tests/helpers/legacy-next-inputs.mjs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const EXPECTED_COMMIT = '4338eeab85041cd71b76ede36818e2265cbf06ae';
const EXPECTED_CANDIDATE_VERSION = '14.6.0-beta.4338eeab.local.9';
const EXPECTED_WORKFLOW_BLOB = '1ad0a13ef98bb571be58d48e45e832a0ddb05046';
const EXPECTED_WORKFLOW_SHA256 = '5b803b312c52d574a8f4d84dd420b3030eaca78d2ed7ca4fdff9f9fca64b34fc';
const EXPECTED_BASE_EFFECT_PATCH_SHA256 = '3bfbe35bf569faaee6952fd2cb7abba67f5ead47365abe7dd987720456ffde79';
const EXPECTED_RESTORED_ITEM_PATCH_SHA256 = '48cf9838b3e40afd0d9d1f30b280fbd9fed00bc2e4163496fea4bbaf035ca26b';
const EXPECTED_UNAVAILABLE_DAMAGE_TARGET_PATCH_SHA256 = '28dcadb396461d0a67d4e901ae2fa842d0a1704eded147ca2d3420742db847b4';
const WORKFLOW_PATH = 'src/module/Workflow.ts';
const DAMAGE_APPLICATION_ELEMENT_MIDI_PATH = 'src/module/ChatClasses/DamageApplicationElementMidi.ts';
const ROLL_FINISHED_BOUNDARY = '__local3_workflow_source_test_boundary__';

const moduleRoot = resolve(import.meta.dir, '../..');
const workspaceRoot = resolve(moduleRoot, '../..');
const sourceRoot = legacyNextInputPath(resolve(workspaceRoot, '.local/midi-qol/source'));
const workflowPath = resolve(sourceRoot, WORKFLOW_PATH);
const upstreamLockPath = resolve(moduleRoot, 'upstream.lock.json');
const baseEffectPatchPath = resolve(moduleRoot, 'patches/0001-dnd5e6-active-effect-base-type.patch');
const restoredItemPatchPath = resolve(moduleRoot, 'patches/0002-dnd5e6-restored-workflow-item.patch');
const unavailableDamageTargetPatchPath = resolve(moduleRoot, 'patches/0003-dnd5e6-unavailable-damage-target.patch');

type EntryPoint = 'template' | 'summon' | 'transform';
type ConstructorField = '_id' | 'type' | 'system';
type TypeScriptApi = any;

export interface PreparedWorkflowSource {
  sourceText: string;
  sourceSha256: string;
  commit: string;
  workflowBlob: string;
  candidateVersion: string;
  typescript: TypeScriptApi;
}

function fail(message: string): never {
  throw new Error(message);
}

function normalizeEol(value: string): string {
  return value.replace(/\r\n/gu, '\n');
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function gitOutput(...args: string[]): string {
  try {
    return execFileSync('git', ['-C', sourceRoot, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return fail(`Cannot verify prepared Midi-QOL source with local Git (${args.join(' ')}): ${details}`);
  }
}

function git(...args: string[]): string {
  return gitOutput(...args).trim();
}

function loadTypeScript(): TypeScriptApi {
  try {
    // Resolve from the prepared upstream checkout, so this does not depend on a root node_modules tree.
    return createRequire(resolve(sourceRoot, 'package.json'))('typescript');
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return fail(`Cannot resolve TypeScript from the prepared Midi-QOL source at ${sourceRoot}: ${details}`);
  }
}

function walk(node: any, visit: (node: any) => void): void {
  visit(node);
  node.forEachChild((child: any) => walk(child, visit));
}

function propertyName(property: any, sourceFile: any): string | undefined {
  if (!property.name) return undefined;
  if (typeof property.name.text === 'string') return property.name.text;
  return property.name.getText(sourceFile).replace(/^['"]|['"]$/gu, '');
}

function exactlyOne<T>(items: T[], label: string): T {
  if (items.length !== 1) return fail(`Expected one ${label} in the locked Workflow source; found ${items.length}.`);
  return items[0]!;
}

function workflowClass(sourceFile: any, ts: TypeScriptApi): any {
  return exactlyOne(sourceFile.statements.filter((statement: any) =>
    ts.isClassDeclaration(statement) && statement.name?.text === 'Workflow'), 'Workflow class');
}

function methodByName(classNode: any, methodName: string, sourceFile: any, ts: TypeScriptApi): any {
  return exactlyOne(classNode.members.filter((member: any) =>
    ts.isMethodDeclaration(member) && member.name?.getText(sourceFile).replace(/^['"]|['"]$/gu, '') === methodName),
  `Workflow.${methodName} method`);
}

function getterByName(classNode: any, getterName: string, sourceFile: any, ts: TypeScriptApi): any {
  return exactlyOne(classNode.members.filter((member: any) =>
    ts.isGetAccessorDeclaration(member) && member.name?.getText(sourceFile).replace(/^['"]|['"]$/gu, '') === getterName),
  `Workflow.${getterName} getter`);
}

function callsCreateActiveEffect(node: any, sourceFile: any, ts: TypeScriptApi): boolean {
  let found = false;
  walk(node, (current) => {
    if (!ts.isCallExpression(current) || !ts.isPropertyAccessExpression(current.expression)) return;
    if (current.expression.name.text !== 'createEmbeddedDocuments') return;
    if (current.arguments[0]?.getText(sourceFile) === '"ActiveEffect"') found = true;
  });
  return found;
}

function entryObject(sourceText: string, entry: EntryPoint, ts: TypeScriptApi): { sourceFile: any; object: any } {
  const sourceFile = ts.createSourceFile(WORKFLOW_PATH, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const classNode = workflowClass(sourceFile, ts);

  if (entry === 'template') {
    const method = methodByName(classNode, 'setupTemplateCleanup', sourceFile, ts);
    const candidates: any[] = [];
    walk(method.body, (node) => {
      if (ts.isVariableDeclaration(node)
        && node.name?.getText(sourceFile) === 'effectData'
        && node.initializer
        && ts.isObjectLiteralExpression(node.initializer)) {
        candidates.push(node.initializer);
      }
    });
    const object = exactlyOne(candidates, 'template cleanup effectData constructor');
    if (!callsCreateActiveEffect(method, sourceFile, ts)) {
      fail('Workflow.setupTemplateCleanup no longer submits its ActiveEffect constructor.');
    }
    return { sourceFile, object };
  }

  const method = methodByName(classNode, 'WorkflowState_RollFinished', sourceFile, ts);
  const marker = entry === 'summon' ? 'autoRemoveSummonedCreature' : 'autoUndoTransformations';
  const branches: any[] = [];
  walk(method.body, (node) => {
    if (ts.isIfStatement(node) && node.expression.getText(sourceFile).includes(marker)) branches.push(node);
  });
  const branch = exactlyOne(branches, `${entry} cleanup branch`);
  const assignments: any[] = [];
  walk(branch, (node) => {
    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isIdentifier(node.left)
      && node.left.text === 'effectData'
      && ts.isObjectLiteralExpression(node.right)) {
      assignments.push(node.right);
    }
  });
  const object = exactlyOne(assignments, `${entry} cleanup effectData constructor`);
  if (!callsCreateActiveEffect(branch, sourceFile, ts)) {
    fail(`Workflow.WorkflowState_RollFinished ${entry} branch no longer submits an ActiveEffect constructor.`);
  }
  return { sourceFile, object };
}

function targetProperty(object: any, field: ConstructorField, sourceFile: any, ts: TypeScriptApi): any {
  return exactlyOne(object.properties.filter((property: any) => propertyName(property, sourceFile) === field),
    `${field} property in the local.3 constructor patch shape`);
}

function lineRange(sourceText: string, node: any, sourceFile: any): { start: number; end: number } {
  const start = sourceText.lastIndexOf('\n', node.getStart(sourceFile) - 1) + 1;
  const lineEnd = sourceText.indexOf('\n', node.end);
  return { start, end: lineEnd < 0 ? sourceText.length : lineEnd + 1 };
}

function removeLine(sourceText: string, range: { start: number; end: number }): string {
  return sourceText.slice(0, range.start) + sourceText.slice(range.end);
}

function assertConstructorPatchShape(sourceText: string, entry: EntryPoint, ts: TypeScriptApi): void {
  const { sourceFile, object } = entryObject(sourceText, entry, ts);
  const idProperty = targetProperty(object, '_id', sourceFile, ts);
  const typeProperty = targetProperty(object, 'type', sourceFile, ts);
  const systemProperty = targetProperty(object, 'system', sourceFile, ts);
  if (idProperty.initializer?.getText(sourceFile) !== 'foundry.utils.randomID()') {
    fail(`Workflow ${entry} constructor no longer has the exact local.3 _id: foundry.utils.randomID() field.`);
  }
  if (typeProperty.initializer?.getText(sourceFile) !== '"base"') {
    fail(`Workflow ${entry} constructor no longer has the exact local.3 type: "base" field.`);
  }
  if (systemProperty.initializer?.getText(sourceFile).replace(/\s/gu, '') !== '{changes:[]}') {
    fail(`Workflow ${entry} constructor no longer has the exact local.3 system: { changes: [] } field.`);
  }
}

function sourceWithoutLocal3Fields(sourceText: string, ts: TypeScriptApi): string {
  let source = sourceText;
  const entries: EntryPoint[] = ['template', 'summon', 'transform'];
  const ranges: Array<{ start: number; end: number }> = [];
  for (const entry of entries) {
    const { sourceFile, object } = entryObject(source, entry, ts);
    const idProperty = targetProperty(object, '_id', sourceFile, ts);
    const typeProperty = targetProperty(object, 'type', sourceFile, ts);
    const systemProperty = targetProperty(object, 'system', sourceFile, ts);
    if (idProperty.initializer?.getText(sourceFile) !== 'foundry.utils.randomID()'
      || typeProperty.initializer?.getText(sourceFile) !== '"base"'
      || systemProperty.initializer?.getText(sourceFile).replace(/\s/gu, '') !== '{changes:[]}') {
      fail(`Cannot compare ${entry} against its locked Git blob: local.3 fields have drifted.`);
    }
    ranges.push(
      lineRange(source, idProperty, sourceFile),
      lineRange(source, typeProperty, sourceFile),
      lineRange(source, systemProperty, sourceFile),
    );
  }
  ranges.sort((left, right) => right.start - left.start);
  for (const range of ranges) source = removeLine(source, range);
  return source;
}

function getterText(sourceText: string, name: 'activity' | 'item', ts: TypeScriptApi): string {
  const sourceFile = ts.createSourceFile(WORKFLOW_PATH, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const getter = getterByName(workflowClass(sourceFile, ts), name, sourceFile, ts);
  return sourceText.slice(getter.getStart(sourceFile), getter.end);
}

function expectedLocal5ActivityGetter(upstreamSource: string, ts: TypeScriptApi): string {
  const upstreamGetter = getterText(upstreamSource, 'activity', ts);
  const oldBranch = `    if (this.chatCard) {\n      // @ts-expect-error no dnd5e-types\n      this.#activity = this.chatCard.getAssociatedActivity() as Activity;\n      // Apply scaling (stored on message, not on item) — same as dnd5e's _fetchActivity()\n      if (this.#activity) {\n        const scaling = this.chatCard.getFlag("dnd5e", "scaling");\n        if (scaling) {\n          const item = this.#activity.item.clone({ flags: { dnd5e: { scaling } } }, { keepId: true });\n          // @ts-expect-error no dnd5e-types\n          this.#activity = item.system.activities.get(this.#activity.id);\n        }\n      }\n    }`;
  const newBranch = `    if (this.chatCard) {\n      if (Number.parseInt(game.system.version, 10) >= 6) {\n        this.#activity = (this.chatCard as Dnd5eChatMessage | undefined)?.getAssociatedActivity?.({ scaled: true }) as Activity;\n      } else {\n        // @ts-expect-error no dnd5e-types\n        this.#activity = this.chatCard.getAssociatedActivity() as Activity;\n        // Apply scaling (stored on message, not on item) — same as dnd5e's _fetchActivity()\n        if (this.#activity) {\n          const scaling = this.chatCard.getFlag("dnd5e", "scaling");\n          if (scaling) {\n            const item = this.#activity.item.clone({ flags: { dnd5e: { scaling } } }, { keepId: true });\n            // @ts-expect-error no dnd5e-types\n            this.#activity = item.system.activities.get(this.#activity.id);\n          }\n        }\n      }\n    }`;
  if (upstreamGetter.split(oldBranch).length !== 2) {
    fail('The locked upstream Workflow.activity getter no longer has the legacy scaled chat-card branch.');
  }
  return upstreamGetter.replace(oldBranch, newBranch);
}

function expectedLocal5ItemGetter(upstreamSource: string, ts: TypeScriptApi): string {
  const upstreamGetter = getterText(upstreamSource, 'item', ts);
  const oldPrefix = `    if (this.itemCardUuid && saveToChatCard) {\n      const itemUuid = this.chatCard?.getFlag("dnd5e", "item")?.uuid;`;
  const newPrefix = `    if (this.itemCardUuid && saveToChatCard) {\n      if (Number.parseInt(game.system.version, 10) >= 6) {\n        const associatedItem = this.#activity?.item\n          ?? (this.chatCard as Dnd5eChatMessage | undefined)?.getAssociatedItem?.({ scaled: true });\n        if (associatedItem) {\n          this.#item = associatedItem;\n          return this.#item;\n        }\n      }\n      const itemUuid = this.chatCard?.getFlag("dnd5e", "item")?.uuid;`;
  if (upstreamGetter.split(oldPrefix).length !== 2) {
    fail('The locked upstream Workflow.item getter no longer has the legacy flags lookup insertion point.');
  }
  return upstreamGetter.replace(oldPrefix, newPrefix);
}

function replaceGetter(sourceText: string, name: 'activity' | 'item', replacementSource: string, ts: TypeScriptApi): string {
  const localSourceFile = ts.createSourceFile(WORKFLOW_PATH, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const localGetter = getterByName(workflowClass(localSourceFile, ts), name, localSourceFile, ts);
  const replacementSourceFile = ts.createSourceFile(WORKFLOW_PATH, replacementSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const replacementGetter = getterByName(workflowClass(replacementSourceFile, ts), name, replacementSourceFile, ts);
  return sourceText.slice(0, localGetter.getStart(localSourceFile))
    + replacementSource.slice(replacementGetter.getStart(replacementSourceFile), replacementGetter.end)
    + sourceText.slice(localGetter.end);
}

function sourceWithoutLocal5Changes(sourceText: string, upstreamSource: string, ts: TypeScriptApi): string {
  if (getterText(sourceText, 'activity', ts) !== expectedLocal5ActivityGetter(upstreamSource, ts)) {
    fail('Prepared Workflow.activity getter differs from the exact dnd5e 6+ scaled association branch; unrelated getter edits are not allowed.');
  }
  if (getterText(sourceText, 'item', ts) !== expectedLocal5ItemGetter(upstreamSource, ts)) {
    fail('Prepared Workflow.item getter differs from the exact dnd5e 6+ association insertion; unrelated getter edits are not allowed.');
  }
  const localImport = 'RollProcessConfig, RollDialogConfig, Dnd5eChatMessage } from "../globals.js";';
  const upstreamImport = 'RollProcessConfig, RollDialogConfig } from "../globals.js";';
  if (sourceText.split(localImport).length !== 2) {
    fail('Prepared Workflow.ts must add only the Dnd5eChatMessage type to the existing globals import.');
  }
  const sourceWithoutTypeImport = sourceText.replace(localImport, upstreamImport);
  const withoutActivityPatch = replaceGetter(sourceWithoutTypeImport, 'activity', upstreamSource, ts);
  const withoutGetterPatches = replaceGetter(withoutActivityPatch, 'item', upstreamSource, ts);
  return sourceWithoutLocal3Fields(withoutGetterPatches, ts);
}

function sourceWithoutLocal9Changes(sourceText: string): string {
  let source = sourceText;
  const changes: Array<[string, string]> = [
    ['    const deferDamageExpiry = Number.parseInt(game.system.version, 10) === 6 && configSettings.autoApplyDamage === "none";\n', ''],
    ['wasDamaged && !deferDamageExpiry && expireList.includes("isDamaged")', 'wasDamaged && expireList.includes("isDamaged")'],
    ['!deferDamageExpiry && expireList.includes(`isDamaged`) && (wasDamaged || dt.type === "healing")',
      'expireList.includes(`isDamaged`) && (wasDamaged || dt.type === "healing")'],
    ['      if ((expiredEffects?.length ?? 0) > 0\n        && !(Number.parseInt(game.system.version, 10) === 6 && configSettings.autoApplyDamage === "none" && healedDamaged === "isDamaged")) {',
      '      if ((expiredEffects?.length ?? 0) > 0) {'],
  ];
  for (const [added, old] of changes) {
    if (source.split(added).length !== 2) fail(`Local.9 Workflow expiry change drifted: ${added.trim()}`);
    source = source.replace(added, old);
  }
  return source;
}

export async function loadPreparedWorkflowSource(): Promise<PreparedWorkflowSource> {
  let sourceBuffer: Buffer;
  try {
    sourceBuffer = await readFile(workflowPath);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return fail(`Prepared Midi-QOL Workflow source is missing at ${workflowPath}: ${details}. Prepare the locked source before running these tests; missing source is never skipped.`);
  }

  let lock: any;
  try {
    lock = JSON.parse(await readFile(upstreamLockPath, 'utf8'));
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return fail(`Cannot read the Midi-QOL upstream lock at ${upstreamLockPath}: ${details}`);
  }
  if (lock.commit !== EXPECTED_COMMIT || lock.candidateVersion !== EXPECTED_CANDIDATE_VERSION) {
    fail(`Midi-QOL lock identity drifted: expected ${EXPECTED_COMMIT} / ${EXPECTED_CANDIDATE_VERSION}, found ${lock.commit} / ${lock.candidateVersion}.`);
  }

  const head = git('rev-parse', 'HEAD');
  if (head !== EXPECTED_COMMIT) fail(`Prepared Midi-QOL source HEAD must be ${EXPECTED_COMMIT}; found ${head}.`);
  const workflowBlob = git('rev-parse', `${EXPECTED_COMMIT}:${WORKFLOW_PATH}`);
  if (workflowBlob !== EXPECTED_WORKFLOW_BLOB) {
    fail(`Locked upstream Workflow blob drifted: expected ${EXPECTED_WORKFLOW_BLOB}; found ${workflowBlob}.`);
  }

  const baseEffectPatchBuffer = await readFile(baseEffectPatchPath).catch((error) => {
    const details = error instanceof Error ? error.message : String(error);
    return fail(`Locked local.3 ActiveEffect patch is missing at ${baseEffectPatchPath}: ${details}`);
  });
  const baseEffectPatchSha256 = sha256(baseEffectPatchBuffer);
  const restoredItemPatchBuffer = await readFile(restoredItemPatchPath).catch((error) => {
    const details = error instanceof Error ? error.message : String(error);
    return fail(`Locked local.4 restored-item patch is missing at ${restoredItemPatchPath}: ${details}`);
  });
  const restoredItemPatchSha256 = sha256(restoredItemPatchBuffer);
  const unavailableDamageTargetPatchBuffer = await readFile(unavailableDamageTargetPatchPath).catch((error) => {
    const details = error instanceof Error ? error.message : String(error);
    return fail(`Locked local.6 unavailable-target patch is missing at ${unavailableDamageTargetPatchPath}: ${details}`);
  });
  const unavailableDamageTargetPatchSha256 = sha256(unavailableDamageTargetPatchBuffer);
  const lockedPatches = lock.patches ?? [];
  if (baseEffectPatchSha256 !== EXPECTED_BASE_EFFECT_PATCH_SHA256
    || String(lockedPatches[0]?.path) !== 'patches/0001-dnd5e6-active-effect-base-type.patch'
    || String(lockedPatches[0]?.sha256).toLowerCase() !== EXPECTED_BASE_EFFECT_PATCH_SHA256) {
    fail(`Local.3 ActiveEffect patch identity drifted: expected SHA-256 ${EXPECTED_BASE_EFFECT_PATCH_SHA256}; found ${baseEffectPatchSha256}.`);
  }
  if (restoredItemPatchSha256 !== EXPECTED_RESTORED_ITEM_PATCH_SHA256
    || String(lockedPatches[1]?.path) !== 'patches/0002-dnd5e6-restored-workflow-item.patch'
    || String(lockedPatches[1]?.sha256).toLowerCase() !== EXPECTED_RESTORED_ITEM_PATCH_SHA256) {
    fail(`Local.4 restored-item patch identity drifted: expected SHA-256 ${EXPECTED_RESTORED_ITEM_PATCH_SHA256}; found ${restoredItemPatchSha256}.`);
  }
  if (unavailableDamageTargetPatchSha256 !== EXPECTED_UNAVAILABLE_DAMAGE_TARGET_PATCH_SHA256
    || String(lockedPatches[2]?.path) !== 'patches/0003-dnd5e6-unavailable-damage-target.patch'
    || String(lockedPatches[2]?.sha256).toLowerCase() !== EXPECTED_UNAVAILABLE_DAMAGE_TARGET_PATCH_SHA256
    || lockedPatches.length !== 6) {
    fail(`Local.6 unavailable-target patch identity drifted: expected SHA-256 ${EXPECTED_UNAVAILABLE_DAMAGE_TARGET_PATCH_SHA256}; found ${unavailableDamageTargetPatchSha256}.`);
  }

  const enchantmentPatchPath = 'patches/0004-dnd5e6-enchantment-clone-id.patch';
  const enchantmentPatchHash = '316be603e37b7e97bc6eae4f20c3105f0a9392249b4b3692265da10143d671f4';
  if (sha256(await readFile(resolve(moduleRoot, enchantmentPatchPath))) !== enchantmentPatchHash
    || lockedPatches[3]?.path !== enchantmentPatchPath
    || String(lockedPatches[3]?.sha256).toLowerCase() !== enchantmentPatchHash) {
    fail('Local.7 enchantment clone patch identity drifted.');
  }

  const manualDamagePatchPath = 'patches/0006-manual-isdamaged-after-apply.patch';
  const manualDamagePatchHash = 'f00e76823cfa3111774a999a2d9a610320d2a50d52bb8d4c8d450d68dbb1d510';
  if (sha256(await readFile(resolve(moduleRoot, manualDamagePatchPath))) !== manualDamagePatchHash
    || lockedPatches[5]?.path !== manualDamagePatchPath
    || String(lockedPatches[5]?.sha256).toLowerCase() !== manualDamagePatchHash) {
    fail('Local.9 manual isDamaged patch identity drifted.');
  }

  const sourceText = normalizeEol(sourceBuffer.toString('utf8'));
  const sourceSha256 = sha256(sourceText);
  if (sourceSha256 !== EXPECTED_WORKFLOW_SHA256) {
    fail(`Prepared Workflow.ts local.9 SHA-256 mismatch: expected ${EXPECTED_WORKFLOW_SHA256}; found ${sourceSha256}. Rebuild the locked local.9 candidate before treating source tests as passed.`);
  }

  const metadata = JSON.parse(await readFile(resolve(sourceRoot, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(resolve(sourceRoot, 'package/module.json'), 'utf8'));
  if (metadata.version !== EXPECTED_CANDIDATE_VERSION || manifest.id !== 'midi-qol'
    || manifest.version !== EXPECTED_CANDIDATE_VERSION) {
    fail(`Prepared Midi-QOL package identity drifted: package=${metadata.version}, manifest=${manifest.id}@${manifest.version}.`);
  }
  const packageLockSha256 = sha256(await readFile(resolve(sourceRoot, 'package-lock.json')));
  if (packageLockSha256 !== String(lock.packageLockSha256).toLowerCase()) {
    fail(`Prepared Midi-QOL package-lock SHA-256 mismatch: expected ${String(lock.packageLockSha256).toLowerCase()}; found ${packageLockSha256}.`);
  }

  const changedPaths = git('diff', '--name-only').split(/\r?\n/u).filter(Boolean).sort();
  const expectedChangedPaths = [
    'package.json',
    'package/module.json',
    WORKFLOW_PATH,
    DAMAGE_APPLICATION_ELEMENT_MIDI_PATH,
    'src/module/patching.ts',
  ].sort();
  if (JSON.stringify(changedPaths) !== JSON.stringify(expectedChangedPaths)) {
    fail(`Prepared source tracked changes must be candidate metadata plus ${WORKFLOW_PATH}; found: ${changedPaths.join(', ') || '(none)'}.`);
  }

  const typescript = loadTypeScript();
  const upstreamWorkflow = normalizeEol(gitOutput('show', `${EXPECTED_COMMIT}:${WORKFLOW_PATH}`));
  for (const entry of ['template', 'summon', 'transform'] as const) {
    assertConstructorPatchShape(sourceText, entry, typescript);
  }
  const upstreamRestored = sourceWithoutLocal5Changes(sourceWithoutLocal9Changes(sourceText), upstreamWorkflow, typescript);
  if (upstreamRestored !== upstreamWorkflow) {
    fail('Prepared Workflow.ts differs from its locked Git blob outside the locked local.3, local.5, and local.9 changes.');
  }

  return {
    sourceText,
    sourceSha256,
    commit: head,
    workflowBlob,
    candidateVersion: metadata.version,
    typescript,
  };
}

export function mutateConstructorField(
  sourceText: string,
  entry: EntryPoint,
  field: ConstructorField,
  typescript: TypeScriptApi,
): string {
  const { sourceFile, object } = entryObject(sourceText, entry, typescript);
  const property = targetProperty(object, field, sourceFile, typescript);
  return removeLine(sourceText, lineRange(sourceText, property, sourceFile));
}

export function mutateActivityGetterToLockedUpstream(sourceText: string, typescript: TypeScriptApi): string {
  const upstreamWorkflow = normalizeEol(gitOutput('show', `${EXPECTED_COMMIT}:${WORKFLOW_PATH}`));
  return replaceGetter(sourceText, 'activity', upstreamWorkflow, typescript);
}

export function mutateItemGetterToLockedUpstream(sourceText: string, typescript: TypeScriptApi): string {
  const upstreamWorkflow = normalizeEol(gitOutput('show', `${EXPECTED_COMMIT}:${WORKFLOW_PATH}`));
  return replaceGetter(sourceText, 'item', upstreamWorkflow, typescript);
}

export function createWorkflowHarness(sourceText: string, dependencies: Record<string, unknown>, typescript: TypeScriptApi): any {
  const sourceFile = typescript.createSourceFile(WORKFLOW_PATH, sourceText, typescript.ScriptTarget.Latest, true, typescript.ScriptKind.TS);
  const classNode = workflowClass(sourceFile, typescript);
  const setupMethod = methodByName(classNode, 'setupTemplateCleanup', sourceFile, typescript);
  const rollFinishedMethod = methodByName(classNode, 'WorkflowState_RollFinished', sourceFile, typescript);
  const rollBody: any = rollFinishedMethod.body;
  const transformBranch = exactlyOne<any>(rollBody.statements.filter((statement: any) =>
    typescript.isIfStatement(statement) && statement.expression.getText(sourceFile).includes('autoUndoTransformations')) as any[],
  'top-level transform cleanup boundary');
  const summonBranch = exactlyOne<any>(rollBody.statements.filter((statement: any) =>
    typescript.isIfStatement(statement) && statement.expression.getText(sourceFile).includes('autoRemoveSummonedCreature')) as any[],
  'top-level summon cleanup branch');
  const selfTarget = exactlyOne<any>(rollBody.statements.filter((statement: any) =>
    typescript.isVariableStatement(statement) && statement.getText(sourceFile).includes('let selfTarget = this.token ?? getOrCreateTokenForActor(this.actor)')) as any[],
  'RollFinished selfTarget setup');
  if (!(selfTarget.end < summonBranch.getStart(sourceFile) && summonBranch.end < transformBranch.getStart(sourceFile))) {
    fail('WorkflowState_RollFinished summon/transform entry points no longer follow the expected source order.');
  }

  const rollMethodPrefix = sourceText.slice(rollFinishedMethod.getStart(sourceFile), transformBranch.end);
  const wrapperSource = `class WorkflowSourceHarness {\n${setupMethod.getText(sourceFile)}\n${rollMethodPrefix}\nreturn "${ROLL_FINISHED_BOUNDARY}";\n}\n}`;
  const transpiled = typescript.transpileModule(wrapperSource, {
    reportDiagnostics: true,
    compilerOptions: {
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.None,
    },
  });
  const diagnostics = (transpiled.diagnostics ?? []).filter((diagnostic: any) =>
    diagnostic.category === typescript.DiagnosticCategory.Error);
  if (diagnostics.length > 0) {
    const messages = diagnostics.map((diagnostic: any) => typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    fail(`Could not transpile actual Workflow methods for the source harness: ${messages.join('; ')}`);
  }

  const dependencyNames = Object.keys(dependencies);
  if (dependencyNames.some((name) => !/^[A-Za-z_$][\w$]*$/u.test(name))) fail('Workflow test dependency names must be simple JavaScript identifiers.');
  const factory = new Function(...dependencyNames, `${transpiled.outputText}\nreturn WorkflowSourceHarness;`);
  const WorkflowHarness = factory(...dependencyNames.map((name) => dependencies[name]));
  return new WorkflowHarness();
}

export function assertLocal3ConstructorShape(effectData: any, entry: EntryPoint): void {
  if (typeof effectData?._id !== 'string' || !/^[A-Za-z0-9]{16}$/u.test(effectData._id)) {
    fail(`Workflow ${entry} local.3 constructor must pass a fresh 16-character _id.`);
  }
  if (effectData?.type !== 'base') {
    fail(`Workflow ${entry} local.3 constructor must pass the top-level type: "base" field.`);
  }
  if (effectData?.system?.type !== undefined || Object.keys(effectData?.system ?? {}).length !== 1
    || !Array.isArray(effectData.system.changes) || effectData.system.changes.length !== 0) {
    fail(`Workflow ${entry} local.3 constructor must pass the changes-only system: { changes: [] } field.`);
  }
}

export const workflowSourceTestBoundary = ROLL_FINISHED_BOUNDARY;
