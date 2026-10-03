import { loadPreparedWorkflowSource, type PreparedWorkflowSource } from './real-workflow-source';
import { readPinnedDnd5eSource } from './pinned-dnd5e-source.mjs';

const WORKFLOW_PATH = 'src/module/Workflow.ts';

type TypeScriptApi = any;

interface HarnessOptions {
  version: string;
  id?: string;
  itemCardUuid?: string;
  itemImplementation?: any;
  activity?: any;
  chatCard?: any;
  workflowOptions?: Record<string, unknown>;
  saveToChatCard?: boolean;
  sourceText?: string;
  itemByUuid?: Map<string, any>;
  actorByUuid?: Map<string, any>;
}

export interface RestoredWorkflowScenario {
  workflow: any;
  errors: string[];
  diagnostics: Error[];
  uuidLookups: Array<string | undefined>;
  createNativeChatMessage(options: Record<string, any>): any;
}

function fail(message: string): never {
  throw new Error(message);
}

function exactlyOne(items: any[], label: string): any {
  if (items.length !== 1) return fail(`Expected one ${label}; found ${items.length}.`);
  return items[0]!;
}

function memberName(member: any, sourceFile: any): string | undefined {
  return member.name?.getText(sourceFile).replace(/^#/, '').replace(/^['"]|['"]$/gu, '');
}

function workflowClass(sourceFile: any, ts: TypeScriptApi): any {
  return exactlyOne(sourceFile.statements.filter((statement: any) =>
    ts.isClassDeclaration(statement) && statement.name?.text === 'Workflow'), 'locked Midi-QOL Workflow class');
}

function workflowGetter(sourceText: string, name: 'activity' | 'actor' | 'item' | 'onUseMacros', ts: TypeScriptApi): string {
  const sourceFile = ts.createSourceFile(WORKFLOW_PATH, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const classNode = workflowClass(sourceFile, ts);
  const getter = exactlyOne(classNode.members.filter((member: any) =>
    ts.isGetAccessorDeclaration(member) && member.name?.getText(sourceFile) === name), `Workflow.${name} getter`);
  return sourceText.slice(getter.getStart(sourceFile), getter.end);
}

function workflowSetter(sourceText: string, name: 'onUseMacros', ts: TypeScriptApi): string {
  const sourceFile = ts.createSourceFile(WORKFLOW_PATH, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const classNode = workflowClass(sourceFile, ts);
  const setter = exactlyOne(classNode.members.filter((member: any) =>
    ts.isSetAccessorDeclaration(member) && member.name?.getText(sourceFile) === name), `Workflow.${name} setter`);
  return sourceText.slice(setter.getStart(sourceFile), setter.end);
}

function nativeClassMethod(sourceText: string, classNode: any, methodName: string, sourceFile: any, ts: TypeScriptApi): string {
  const method = exactlyOne(classNode.members.filter((member: any) =>
    ts.isMethodDeclaration(member) && memberName(member, sourceFile) === methodName), `ChatMessage5e.${methodName}`);
  return sourceText.slice(method.getStart(sourceFile), method.end);
}

let nativeMethodsPromise: Promise<string[]> | undefined;

async function loadNativeDnd5eMethods(typescript: TypeScriptApi): Promise<string[]> {
  if (!nativeMethodsPromise) {
    nativeMethodsPromise = (async () => {
      const sourceBuffer = readPinnedDnd5eSource();
      const sourceText = sourceBuffer.toString('utf8');
      const sourceFile = typescript.createSourceFile('dnd5e.mjs', sourceText, typescript.ScriptTarget.Latest, true, typescript.ScriptKind.JS);
      const classNode = exactlyOne(sourceFile.statements.filter((statement: any) =>
        typescript.isClassDeclaration(statement) && statement.name?.text === 'ChatMessage5e'), 'pinned dnd5e ChatMessage5e class');
      const methods = [
        nativeClassMethod(sourceText, classNode, 'getAssociatedActivity', sourceFile, typescript),
        nativeClassMethod(sourceText, classNode, 'getAssociatedItem', sourceFile, typescript),
        nativeClassMethod(sourceText, classNode, 'getAssociatedActor', sourceFile, typescript),
        nativeClassMethod(sourceText, classNode, 'getStoredItemData', sourceFile, typescript),
      ];
      return methods;
    })();
  }
  return await nativeMethodsPromise;
}

export async function createRestoredWorkflowScenario(
  options: HarnessOptions,
  preparedSource?: PreparedWorkflowSource,
): Promise<RestoredWorkflowScenario> {
  const prepared: PreparedWorkflowSource = preparedSource ?? await loadPreparedWorkflowSource();
  const sourceText = options.sourceText ?? prepared.sourceText;
  const typescript = prepared.typescript;
  const nativeMethods = await loadNativeDnd5eMethods(typescript);
  const errors: string[] = [];
  const diagnostics: Error[] = [];
  const uuidLookups: Array<string | undefined> = [];
  const itemByUuid = options.itemByUuid ?? new Map<string, any>();
  const actorByUuid = options.actorByUuid ?? new Map<string, any>();
  const game = {
    system: { version: options.version },
    actors: { get: (uuid: string) => actorByUuid.get(uuid) },
  };
  const fromUuidSync = (uuid: string | undefined) => {
    uuidLookups.push(uuid);
    return uuid === undefined ? undefined : itemByUuid.get(uuid);
  };
  class SnapshotItem {
    data: any;
    parent: any;
    constructor(data: any, config: any) {
      this.data = data;
      this.parent = config.parent;
    }
    scaledClone(scaling: unknown) {
      return { snapshot: true, data: this.data, parent: this.parent, scaling };
    }
  }
  const Item = { implementation: options.itemImplementation ?? SnapshotItem };
  const nativeClassSource = `class NativeChatMessageHarness {\n    constructor(options) { Object.assign(this, options); }\n    getFlag(scope, key) {\n      let value = this.flags?.[scope];\n      for (const part of key.split(".")) value = value?.[part];\n      return value;\n    }\n    getAssociatedToken() { return this.token; }\n    getOriginatingMessage() { return this.originatingMessage ?? this; }\n    ${nativeMethods.join('\n    ')}\n  }\n  return NativeChatMessageHarness;`;
  const NativeChatMessageHarness = new Function('fromUuidSync', 'Item', 'game', nativeClassSource)(fromUuidSync, Item, game);

  class OnUseMacros {
    items: unknown[] = [];
    getMacros() { return []; }
  }
  const configSettings = { allowUseMacro: true };
  const factoryNames = ['game', 'saveToChatCard', 'fromUuidSync', 'TroubleShooter', 'error', 'configSettings', 'MODULE_ID', 'OnUseMacros'];
  const factoryValues = [
    game,
    options.saveToChatCard ?? true,
    fromUuidSync,
    { recordError: (diagnostic: Error) => diagnostics.push(diagnostic) },
    (message: string) => errors.push(message),
    configSettings,
    'midi-qol',
    OnUseMacros,
  ];
  const workflowClassSource = `class RestoredWorkflowHarness {\n    #item;\n    #activity;\n    #onUseMacros;\n    constructor(options) {\n      this.#activity = options.activity;\n      this.itemCardUuid = options.itemCardUuid ?? "ChatMessage.restored";\n      this.chatCard = options.chatCard;\n      this.workflowOptions = options.workflowOptions ?? {};\n      this.id = options.id ?? "workflow-restored-test";\n      this.midiFlags = options.midiFlags ?? {};\n    }\n    ${workflowGetter(sourceText, 'activity', typescript)}\n    ${workflowGetter(sourceText, 'actor', typescript)}\n    ${workflowGetter(sourceText, 'item', typescript)}\n    ${workflowGetter(sourceText, 'onUseMacros', typescript)}\n    ${workflowSetter(sourceText, 'onUseMacros', typescript)}\n    cacheItem(value) { this.#item = value; }\n  }\n  return RestoredWorkflowHarness;`;
  const transpiled = typescript.transpileModule(workflowClassSource, {
    reportDiagnostics: true,
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.None },
  });
  const syntaxErrors = (transpiled.diagnostics ?? []).filter((diagnostic: any) =>
    diagnostic.category === typescript.DiagnosticCategory.Error);
  if (syntaxErrors.length > 0) {
    const messages = syntaxErrors.map((diagnostic: any) => typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    fail(`Could not transpile the actual Workflow getters for regression tests: ${messages.join('; ')}`);
  }
  const workflowFactory = new Function(...factoryNames, `${transpiled.outputText}\nreturn RestoredWorkflowHarness;`);
  const WorkflowHarness = workflowFactory(...factoryValues);
  const workflow = new WorkflowHarness({
    activity: options.activity,
    chatCard: options.chatCard,
    itemCardUuid: options.itemCardUuid,
    workflowOptions: options.workflowOptions,
    id: options.id,
  });

  return {
    workflow,
    errors,
    diagnostics,
    uuidLookups,
    createNativeChatMessage(messageOptions: Record<string, any>) {
      return new NativeChatMessageHarness(messageOptions);
    },
  };
}
