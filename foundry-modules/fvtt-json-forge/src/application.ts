import {
  BROWSER_MAX_CONCURRENT_ACTOR_JOBS,
  buildForgeActorRequest,
  convertFinalActorSource,
} from '@fvtt-json-generator/forge-browser-runtime';
import {
  convertRawActorSourceWithAi,
  createBrowserAiProvider,
  type BrowserActorIntakeResult,
  type BrowserActorIntakeStageResult,
} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {
  decodeForgeActorResponse,
  type ForgeActorResponse,
} from '@fvtt-json-generator/forge-gateway-protocol';
import {
  assertExactRuntime,
  assertGm,
  createAcceptedForgeActor,
  EXPECTED_FOUNDRY_VERSION,
  EXPECTED_SYSTEM_VERSION,
  type ForgeActorCreateResult,
} from './runtime';
import { readForgeSessionSettings, subscribeForgeSessionSettings } from './settings';
import { claimForgeAiJob, releaseForgeAiJob } from './aiJobGate';
import { createForgePaneBase, type ForgePaneBinding, type ForgePaneState } from './workspacePane';
import { renderActorStatblock, renderBlueprintDraftStatblock } from './actorStatblock';
import {
  createBlueprintComponent,
  createEmptyBlueprintDraft,
  describeBlueprintDiff,
  readBlueprintDraft,
  renderBlueprintComponents,
  writeBlueprintDraft,
  type BlueprintComponentDraft,
  type BlueprintDraft,
} from './creatureBlueprintEditor';
import {
  ManagedForgeSourceLibrary,
  searchForgeSourceLibrary,
  type ForgeSourceLibrarySearchResult,
  type ForgeSourceLibraryV1,
} from '@fvtt-json-generator/forge-browser-runtime/source-library';
import { IndexedDbForgeSourceLibraryStore } from '@fvtt-json-generator/forge-browser-runtime/source-library-indexed-db';
import {
  createCreatureBlueprint,
  decodeCreatureBlueprint,
  deriveCreatureBlueprint,
  diffCreatureBlueprintFields,
  parseCreatureBlueprintSource,
  renderCreatureBlueprintSource,
  type CreatureBlueprintV1,
} from '@fvtt-json-generator/forge-browser-runtime/creature-blueprint';

type ForgeActorMode = 'structured' | 'blueprint' | 'ai';

export interface ForgeApplicationEnvironment {
  game: any;
  ui?: any;
  foundry?: any;
  window?: { addEventListener?: (event: string, callback: (event: any) => void) => void; removeEventListener?: (event: string, callback: (event: any) => void) => void };
  hooks?: { on?: (event: string, callback: (...args: any[]) => void) => unknown; off?: (event: string, id: unknown) => void };
  sourceLibrary?: ManagedForgeSourceLibrary;
  pane?: ForgePaneBinding;
  services?: Partial<ForgeApplicationServices>;
}

export interface ForgeApplicationServices {
  convertFinalActorSource: typeof convertFinalActorSource;
  convertRawActorSourceWithAi: typeof convertRawActorSourceWithAi;
  createBrowserAiProvider: typeof createBrowserAiProvider;
  createAcceptedForgeActor: typeof createAcceptedForgeActor;
  /** Core browser-runtime blueprint contracts are injected to keep this UI testable. */
  createCreatureBlueprint: typeof createCreatureBlueprint;
  decodeCreatureBlueprint: typeof decodeCreatureBlueprint;
  renderCreatureBlueprintSource: typeof renderCreatureBlueprintSource;
  parseCreatureBlueprintSource: typeof parseCreatureBlueprintSource;
  deriveCreatureBlueprint: typeof deriveCreatureBlueprint;
  diffCreatureBlueprintFields: typeof diffCreatureBlueprintFields;
}

const DEFAULT_SERVICES: ForgeApplicationServices = {
  convertFinalActorSource,
  convertRawActorSourceWithAi,
  createBrowserAiProvider,
  createAcceptedForgeActor,
  createCreatureBlueprint,
  decodeCreatureBlueprint,
  renderCreatureBlueprintSource,
  parseCreatureBlueprintSource,
  deriveCreatureBlueprint,
  diffCreatureBlueprintFields,
};

const activeGenerationOwners = new Set<object>();

export function createForgeActorApplicationClass(environment: ForgeApplicationEnvironment): any {
  const foundryGlobal = environment.foundry ?? (globalThis as any).foundry;
  const ApplicationV2 = foundryGlobal?.applications?.api?.ApplicationV2;
  const HandlebarsApplicationMixin = foundryGlobal?.applications?.api?.HandlebarsApplicationMixin;
  if (!ApplicationV2 || typeof HandlebarsApplicationMixin !== 'function') {
    throw new Error('Foundry 14 ApplicationV2 and HandlebarsApplicationMixin are required.');
  }
  const Base = environment.pane ? createForgePaneBase() : HandlebarsApplicationMixin(ApplicationV2);
  return class ForgeActorApplication extends Base {
    static DEFAULT_OPTIONS = {
      id: 'fvtt-json-forge-actor',
      classes: ['fvtt-json-forge', 'forge-actor-window'],
      position: { width: 1440, height: 900 },
      window: { title: 'Forge · 生物工作台', resizable: true },
    };

    static PARTS = {
      form: { template: 'modules/fvtt-json-forge/templates/forge-actor.hbs' },
    };

    private response?: ForgeActorResponse;
    private intake?: BrowserActorIntakeResult;
    private stageProgress: BrowserActorIntakeStageResult[] = [];
    private controller?: AbortController;
    private generationRevision = 0;
    private sourceSnapshot?: string;
    private creating = false;
    private readingFile = false;
    private statusMessage = '';
    private errorMessage = '';
    private created?: ForgeActorCreateResult;
    private unsubscribeConnection?: () => void;
    private connectionSettingsIdentity = '';
    private blueprintDraft: BlueprintDraft = createEmptyBlueprintDraft();
    private blueprintCore?: CreatureBlueprintV1;
    private blueprintParentCore?: CreatureBlueprintV1;
    private blueprintInitialized = false;
    private blueprintSource = '';
    private blueprintSourceRevision = -1;
    private blueprintGenerationSnapshot?: string;
    private blueprintDirty = false;
    private blueprintLibraryState?: Readonly<ForgeSourceLibraryV1>;
    private blueprintLibraryLoading = false;
    private blueprintLibraryMutation = false;
    private blueprintLibraryQuery = '';
    private blueprintLibraryUnsubscribe?: () => void;
    private readonly ownsSourceLibrary: boolean;
    private sourceLibrary?: ManagedForgeSourceLibrary;
    private boundSourceLibraryScope?: string;
    private blueprintOperationRevision = 0;
    private blueprintTab: 'basic' | 'abilities' | 'variant' | 'review' = 'basic';
    private activeMode?: ForgeActorMode;
    private readonly modeDrafts: Record<'structured' | 'ai', { source: string; displayName: string }> = {
      structured: { source: '', displayName: '' },
      ai: { source: '', displayName: '' },
    };
    private readonly availabilityHooks: Array<{ event: string; id: unknown }> = [];
    private pageGuardRegistered = false;
    private readonly guardPageTeardown = (event: any) => {
      if (!this.creating) return;
      event?.preventDefault?.();
      if (event) event.returnValue = '';
    };
    private readonly services: ForgeApplicationServices = { ...DEFAULT_SERVICES, ...(environment.services ?? {}) };

    constructor(...args: any[]) {
      super(...args);
      this.sourceLibrary = environment.sourceLibrary;
      this.ownsSourceLibrary = environment.sourceLibrary === undefined;
    }

    async _prepareContext() {
      return {};
    }

    workspaceState(): ForgePaneState {
      return { stage: this.created ? 'created' : this.response ? 'review' : 'input',
        locked: this.creating || this.blueprintLibraryMutation };
    }

    invalidateWorkspaceCandidate(): boolean {
      if (this.workspaceState().locked) return false;
      this.cancel();
      this.created = undefined;
      this.statusMessage = this.response?'已保留此前生成的 Actor；编辑内容将用于下一次生成。':'';
      this.errorMessage = '';
      const root = this.element as HTMLElement | undefined;
      if (root) this.renderResult(root);
      return true;
    }

    private normalizeMode(value: string): ForgeActorMode {
      return value === 'blueprint' || value === 'ai' ? value : 'structured';
    }

    private captureModeDraft(root: HTMLElement, mode = this.activeMode): void {
      if (mode !== 'structured' && mode !== 'ai') return;
      this.modeDrafts[mode] = {
        source: inputValue(root, 'source'),
        displayName: inputValue(root, 'displayName'),
      };
    }

    private restoreModeDraft(root: HTMLElement, mode: 'structured' | 'ai'): void {
      const source = root.querySelector('[name="source"]') as HTMLTextAreaElement | null;
      const displayName = root.querySelector('[name="displayName"]') as HTMLInputElement | null;
      if (source) source.value = this.modeDrafts[mode].source;
      if (displayName) displayName.value = this.modeDrafts[mode].displayName;
    }

    private activateBlueprintDraft(root: HTMLElement): void {
      if (!this.blueprintInitialized) {
        const displayName = valueOf(root, 'displayName');
        try {
          const initial = this.services.createCreatureBlueprint();
          this.blueprintCore = initial;
          this.blueprintDraft = coreToBlueprintDraft(initial);
          if (displayName) this.blueprintDraft.name = displayName;
        } catch {
          this.blueprintDraft = createEmptyBlueprintDraft();
          this.blueprintDraft.name = displayName;
        }
        this.blueprintInitialized = true;
        this.blueprintDirty = false;
        writeBlueprintDraft(root, this.blueprintDraft, false);
      }
      this.renderBlueprintEditor(root, true);
    }

    private bindBlueprintEditor(root: HTMLElement, invalidate: () => void): void {
      for (const name of [
        'blueprintSize', 'blueprintType', 'blueprintAlignment', 'blueprintArmorClass', 'blueprintHitPoints',
        'blueprintSpeed', 'blueprintCr', 'blueprintScore-str', 'blueprintScore-dex', 'blueprintScore-con',
        'blueprintScore-int', 'blueprintScore-wis', 'blueprintScore-cha', 'blueprintVariantName',
      ]) {
        const input = root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        if (!input) continue;
        const update = () => {
          if (valueOf(root, 'mode') !== 'blueprint') return;
          this.blueprintDraft = readBlueprintDraft(root, this.blueprintDraft);
          this.blueprintDirty = true;
          invalidate();
          this.renderBlueprintEditor(root);
        };
        input.oninput = update;
        input.onchange = update;
      }
      renderBlueprintComponents(
        root,
        this.blueprintDraft.components,
        (componentId, patch) => {
          if (valueOf(root, 'mode') !== 'blueprint') return;
          const component = this.blueprintDraft.components.find((entry) => entry.id === componentId);
          if (!component) return;
          Object.assign(component, patch);
          this.blueprintDirty = true;
          invalidate();
          this.renderBlueprintEditor(root);
        },
        (componentId) => {
          if (valueOf(root, 'mode') !== 'blueprint') return;
          this.blueprintDraft.components = this.blueprintDraft.components.filter((entry) => entry.id !== componentId);
          this.blueprintDirty = true;
          invalidate();
          this.renderBlueprintEditor(root, true);
        },
        true,
      );
    }

    private renderBlueprintEditor(root: HTMLElement, rebuildComponents = false): void {
      if (valueOf(root, 'mode') !== 'blueprint') return;
      const editor = root.querySelector('[data-blueprint-editor]') as HTMLElement | null;
      if (!editor) return;
      writeBlueprintDraft(root, this.blueprintDraft);
      renderBlueprintComponents(root, this.blueprintDraft.components, (componentId, patch) => {
        const component = this.blueprintDraft.components.find((entry) => entry.id === componentId);
        if (!component) return;
        Object.assign(component, patch);
        this.blueprintDirty = true;
        this.invalidateCurrentPreview(root);
        this.renderBlueprintEditor(root);
      }, (componentId) => {
        this.blueprintDraft.components = this.blueprintDraft.components.filter((entry) => entry.id !== componentId);
        this.blueprintDirty = true;
        this.invalidateCurrentPreview(root);
        this.renderBlueprintEditor(root, true);
      }, rebuildComponents);
      const parent = root.querySelector('[data-blueprint-parent]') as HTMLElement | null;
      const variant = root.querySelector('[data-blueprint-variant]') as HTMLElement | null;
      const variantUnavailable = !this.blueprintInitialized || !this.blueprintCore;
      if (variant) variant.hidden = variantUnavailable;
      const variantEmpty = root.querySelector('[data-blueprint-variant-empty]') as HTMLElement | null;
      if (variantEmpty) variantEmpty.hidden = !variantUnavailable;
      if (parent) {
        parent.hidden = !this.blueprintDraft.parent;
        parent.textContent = this.blueprintDraft.parent
          ? `父来源：${this.blueprintDraft.parent.name || this.blueprintDraft.parent.sourceId}`
          : '';
      }
      const diff = root.querySelector('[data-blueprint-diff]') as HTMLElement | null;
      if (diff) {
        diff.hidden = !this.blueprintDraft.parent;
        diff.textContent = describeBlueprintDiff(this.blueprintDraft);
      }
      const source = root.querySelector('[data-blueprint-source]') as HTMLTextAreaElement | null;
      if (source) source.value = this.blueprintSource;
      this.renderBlueprintLibrary(root);
      this.renderResult(root);
    }

    private selectBlueprintTab(root: HTMLElement, tab: typeof this.blueprintTab, focus = false): void {
      this.blueprintTab = tab;
      if (typeof root.querySelectorAll !== 'function') return;
      for (const button of root.querySelectorAll<HTMLButtonElement>('[data-blueprint-tab]')) {
        const selected = button.dataset.blueprintTab === tab;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
        if (selected && focus) button.focus();
      }
      for (const panel of root.querySelectorAll<HTMLElement>('[data-blueprint-panel]')) {
        panel.hidden = panel.dataset.blueprintPanel !== tab;
      }
    }

    private invalidateCurrentPreview(root: HTMLElement): void {
      if (this.creating) return;
      this.generationRevision += 1;
      this.blueprintGenerationSnapshot = undefined;
      this.controller?.abort();
      this.blueprintSourceRevision = -1;
      this.renderResult(root);
      this.updateBlueprintSource(root);
    }

    private addBlueprintComponent(root: HTMLElement, kind: 'attack' | 'save', invalidate: () => void): void {
      if (valueOf(root, 'mode') !== 'blueprint' || this.creating) return;
      this.blueprintDraft.components.push(createBlueprintComponent(kind));
      this.blueprintDirty = true;
      invalidate();
      this.renderBlueprintEditor(root, true);
    }

    private deriveBlueprint(root: HTMLElement): void {
      if (valueOf(root, 'mode') !== 'blueprint' || this.creating) return;
      const name = valueOf(root, 'blueprintVariantName') || valueOf(root, 'displayName');
      if (!name) return void this.notify('error', '请先填写新变体名称。');
      try {
        const parent = this.toCoreBlueprint(root);
        const derived = this.services.deriveCreatureBlueprint(parent, name);
        this.blueprintParentCore = parent;
        this.blueprintCore = derived;
        this.blueprintDraft = coreToBlueprintDraft(derived);
        this.blueprintInitialized = true;
        this.blueprintDirty = true;
        writeBlueprintDraft(root, this.blueprintDraft, false);
        this.invalidateCurrentPreview(root);
        this.renderBlueprintEditor(root, true);
        this.notify('info', '已派生独立蓝图来源；请重新生成预览。');
      } catch (error) {
        this.notify('error', messageOf(error));
      }
    }

    private updateBlueprintSource(root: HTMLElement): void {
      if (valueOf(root, 'mode') !== 'blueprint') return;
      const source = root.querySelector('[data-blueprint-source]') as HTMLTextAreaElement | null;
      if (!source) return;
      try {
        this.blueprintDraft = readBlueprintDraft(root, this.blueprintDraft);
        const core = this.toCoreBlueprint(root);
        this.blueprintCore = core;
        this.blueprintSource = this.services.renderCreatureBlueprintSource(core);
        this.blueprintSourceRevision = this.generationRevision;
        source.value = this.blueprintSource;
      } catch {
        this.blueprintSource = '';
        this.blueprintSourceRevision = -1;
        this.blueprintGenerationSnapshot = undefined;
        source.value = '';
      }
    }

    private toCoreBlueprint(root: HTMLElement): CreatureBlueprintV1 {
      const draft = readBlueprintDraft(root, this.blueprintDraft);
      this.blueprintDraft = draft;
      const current = asRecord(this.blueprintCore);
      let sourceId = typeof current.sourceId === 'string' ? current.sourceId : draft.sourceId;
      if (!sourceId) sourceId = asRecord(this.services.createCreatureBlueprint()).sourceId;
      const components = draft.components.map((component) => componentToCore(component));
      const candidate: Record<string, unknown> = {
        schema: current.schema,
        version: current.version,
        sourceId,
        name: draft.name,
        size: draft.size,
        type: draft.type,
        alignment: draft.alignment,
        ac: parseBlueprintInteger(draft.armorClass, '护甲等级'),
        hp: parseBlueprintInteger(draft.hitPoints, '生命值'),
        speed: parseBlueprintInteger(draft.speed, '速度'),
        abilities: Object.fromEntries(Object.entries(draft.abilities).map(([key, value]) => [key, parseBlueprintInteger(value, `能力值 ${key}`)])),
        cr: parseChallengeRating(draft.challengeRating),
        components,
      };
      const lineage = asRecord(current.lineage);
      if (Object.keys(lineage).length > 0) {
        const reconstructedParent = reconstructLineageParent(current);
        const parent = this.blueprintParentCore ?? (reconstructedParent ? this.services.decodeCreatureBlueprint(reconstructedParent) : undefined);
        if (parent) {
          const candidateCore = this.services.decodeCreatureBlueprint(candidate);
          const changes = this.services.diffCreatureBlueprintFields(parent, candidateCore);
          candidate.lineage = {
            parentSourceId: lineage.parentSourceId,
            parentSourceHash: lineage.parentSourceHash,
            changes,
          };
        } else throw new TypeError('无法安全恢复蓝图父来源差异；请从父来源重新派生。');
      }
      const decoded = this.services.decodeCreatureBlueprint(candidate);
      if (decoded.lineage) {
        this.blueprintDraft.parent = {
          sourceId: decoded.lineage.parentSourceId,
          sourceHash: decoded.lineage.parentSourceHash,
          name: this.blueprintDraft.parent?.name ?? '',
        };
        this.blueprintDraft.diff = formatLineageChanges(decoded.lineage.changes);
      } else {
        this.blueprintDraft.parent = undefined;
        this.blueprintDraft.diff = undefined;
      }
      return decoded;
    }

    private prepareBlueprintSource(root: HTMLElement): string {
      const textarea = root.querySelector('[data-blueprint-source]') as HTMLTextAreaElement | null;
      try {
        const core = this.toCoreBlueprint(root);
        const source = this.services.renderCreatureBlueprintSource(core);
        this.blueprintCore = core;
        this.blueprintSource = source;
        this.blueprintSourceRevision = this.generationRevision;
        if (textarea) textarea.value = source;
        return source;
      } catch (error) {
        this.blueprintSource = '';
        this.blueprintSourceRevision = -1;
        this.blueprintGenerationSnapshot = undefined;
        if (textarea) textarea.value = '';
        throw error;
      }
    }

    _onRender(_context: unknown, _options: unknown) {
      const root = this.element as HTMLElement | undefined;
      if (!root) return;
      const mode = root.querySelector('[name="mode"]') as HTMLSelectElement | null;
      const blueprintEditor = root.querySelector('[data-blueprint-editor]') as HTMLElement | null;
      const hadActiveMode = this.activeMode !== undefined;
      const resolvedMode = this.normalizeMode(this.activeMode ?? mode?.value ?? 'structured');
      this.activeMode = resolvedMode;
      if (mode) mode.value = resolvedMode;
      const refreshModeVisibility = () => {
        if (blueprintEditor && mode) blueprintEditor.hidden = mode.value !== 'blueprint';
        root.setAttribute?.('data-mode', mode?.value ?? 'structured');
        const library = root.querySelector('[data-blueprint-library]') as HTMLElement | null;
        if (library) library.hidden = mode?.value !== 'blueprint';
        const tabs = root.querySelector('[data-blueprint-tabs]') as HTMLElement | null;
        if (tabs) tabs.hidden = mode?.value !== 'blueprint';
        const notes = root.querySelector('[data-nonblueprint-notes]') as HTMLElement | null;
        if (notes) notes.hidden = mode?.value === 'blueprint';
        const structuredSource = root.querySelector('[data-structured-source]') as HTMLElement | null;
        if (structuredSource && mode) structuredSource.hidden = mode.value === 'blueprint';
        const structuredFile = root.querySelector('[data-structured-file]') as HTMLElement | null;
        if (structuredFile && mode) structuredFile.hidden = mode.value === 'blueprint';
        this.selectBlueprintTab(root, this.blueprintTab);
      };
      const invalidatePreview = () => {
        if (this.creating) return;
        this.generationRevision += 1;
        this.blueprintOperationRevision += 1;
        this.controller?.abort();
        this.created = undefined;
        this.readingFile = false;
        this.statusMessage = this.response?'已保留此前生成的 Actor；编辑内容将用于下一次生成。':'';
        this.errorMessage = '';
        this.renderResult(root);
        if (valueOf(root, 'mode') === 'blueprint') this.updateBlueprintSource(root);
      };
      if (mode) mode.onchange = () => {
        const previousMode = this.activeMode;
        if (previousMode) this.captureModeDraft(root, previousMode);
        this.activeMode = this.normalizeMode(mode.value);
        if (this.activeMode === 'blueprint') this.activateBlueprintDraft(root);
        else if (this.activeMode === 'structured' || this.activeMode === 'ai') this.restoreModeDraft(root, this.activeMode);
        refreshModeVisibility();
        invalidatePreview();
      };
      const source = root.querySelector('[name="source"]') as HTMLTextAreaElement | null;
      const displayName = root.querySelector('[name="displayName"]') as HTMLInputElement | null;
      if (source) source.oninput = () => {
        if (mode?.value !== 'blueprint') this.captureModeDraft(root, this.activeMode);
        invalidatePreview();
      };
      if (displayName) displayName.oninput = () => {
        if (mode?.value === 'blueprint') {
          this.blueprintDraft.name = displayName.value;
          this.blueprintDirty = true;
        } else this.captureModeDraft(root, this.activeMode);
        invalidatePreview();
      };
      this.bindBlueprintEditor(root, invalidatePreview);
      refreshModeVisibility();
      if (mode?.value === 'blueprint') this.activateBlueprintDraft(root);
      else if (hadActiveMode && (resolvedMode === 'structured' || resolvedMode === 'ai')) this.restoreModeDraft(root, resolvedMode);
      else this.captureModeDraft(root, resolvedMode);
      const sourceFile = root.querySelector('[name="sourceFile"]') as HTMLInputElement | null;
      if (sourceFile) sourceFile.onchange = () => this.readSourceFile(root, sourceFile);
      this.registerAvailabilityHooks();
      this.registerPageGuard();
      this.connectionSettingsIdentity = workspaceConnectionIdentity(readForgeSessionSettings());
      if (!this.unsubscribeConnection) this.unsubscribeConnection = subscribeForgeSessionSettings(() => {
        const activeRoot = this.element as HTMLElement | undefined;
        const nextIdentity = workspaceConnectionIdentity(readForgeSessionSettings());
        if (nextIdentity === this.connectionSettingsIdentity) return;
        this.connectionSettingsIdentity = nextIdentity;
        if (activeRoot) this.invalidateWorkspaceCandidate();
      });
      this.bind(root, '[data-action="generate"]', () => void this.generate(root));
      this.bind(root, '[data-action="cancel"]', () => this.cancel());
      this.bind(root, '[data-action="clear"]', () => this.clear(root));
      this.bind(root, '[data-action="create"]', () => void this.create());
      this.bind(root, '[data-action="open-created"]', () => void this.openCreated());
      this.bind(root, '[data-action="blueprint-add-attack"]', () => this.addBlueprintComponent(root, 'attack', invalidatePreview));
      this.bind(root, '[data-action="blueprint-add-save"]', () => this.addBlueprintComponent(root, 'save', invalidatePreview));
      this.bind(root, '[data-action="blueprint-derive"]', () => this.deriveBlueprint(root));
      this.bind(root, '[data-action="blueprint-library-refresh"]', () => void this.refreshBlueprintLibrary(root, true));
      this.bind(root, '[data-action="blueprint-library-load"]', () => void this.loadBlueprintFromLibrary(root));
      this.bind(root, '[data-action="blueprint-library-save"]', () => void this.saveBlueprintToLibrary(root));
      this.bind(root, '[data-action="blueprint-download"]', () => this.downloadBlueprintSource(root));
      this.bind(root, '[data-action="blueprint-new"]', () => {
        if (this.blueprintWorkspaceDirty(root)) {
          this.notify('error', '新建蓝图前请先保存或点击底部“清除”，避免覆盖未保存编辑。');
          return;
        }
        this.clear(root);
        this.selectBlueprintTab(root, 'basic', true);
      });
      const tabOrder = ['basic', 'abilities', 'variant', 'review'] as const;
      for (const tab of tabOrder) {
        const button = root.querySelector(`[data-blueprint-tab="${tab}"]`) as HTMLButtonElement | null;
        if (!button) continue;
        button.onclick = () => this.selectBlueprintTab(root, tab);
        button.onkeydown = (event) => {
          const current = tabOrder.indexOf(tab);
          const next = event.key === 'ArrowRight' ? (current + 1) % tabOrder.length
            : event.key === 'ArrowLeft' ? (current + tabOrder.length - 1) % tabOrder.length
              : event.key === 'Home' ? 0 : event.key === 'End' ? tabOrder.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault();
          this.selectBlueprintTab(root, tabOrder[next]!, true);
        };
      }
      const librarySearch = root.querySelector('[name="blueprintLibrarySearch"]') as HTMLInputElement | null;
      if (librarySearch) librarySearch.oninput = () => {
        this.blueprintLibraryQuery = librarySearch.value;
        this.renderBlueprintLibrary(root);
      };
      const librarySelect = root.querySelector('[name="blueprintLibrarySelect"]') as HTMLSelectElement | null;
      if (librarySelect) librarySelect.onchange = () => this.renderBlueprintLibrary(root);
      this.renderResult(root);
      if (mode?.value === 'blueprint') this.renderBlueprintEditor(root);
      if (mode?.value === 'blueprint' && !this.blueprintLibraryState) void this.refreshBlueprintLibrary(root, false);
    }

    async close(options?: unknown) {
      if (this.creating) {
        this.notify('error', 'Actor 正在提交并回读；完成前不能关闭 Forge 窗口。');
        return this;
      }
      this.cancel();
      this.unregisterAvailabilityHooks();
      this.unregisterPageGuard();
      this.unsubscribeConnection?.();
      this.unsubscribeConnection = undefined;
      this.blueprintLibraryUnsubscribe?.();
      this.blueprintLibraryUnsubscribe = undefined;
      if (this.ownsSourceLibrary) this.sourceLibrary?.close();
      return super.close(options);
    }

    private async readSourceFile(root: HTMLElement, input: HTMLInputElement): Promise<void> {
      if (this.creating) return;
      const file = input.files?.[0];
      if (!file) return;
      this.generationRevision += 1;
      const revision = this.generationRevision;
      this.controller?.abort();
      this.created = undefined;
      this.errorMessage = '';
      this.statusMessage = `正在读取 ${file.name || '资料文件'}…`;
      this.readingFile = true;
      this.renderResult(root);
      try {
        if (!isSupportedSourceFile(file)) throw new Error('请选择 Markdown（.md）或 TXT（.txt）文件。');
        if (typeof file.text !== 'function') throw new Error('当前浏览器不能读取所选来源文件。');
        const sourceText = await file.text();
        if (this.generationRevision !== revision || this.creating) return;
        root = (this.element as HTMLElement | undefined) ?? root;
        const source = root.querySelector('[name="source"]') as HTMLTextAreaElement | null;
        const displayName = root.querySelector('[name="displayName"]') as HTMLInputElement | null;
        if (source) {
          source.value = sourceText;
        }
        if (displayName && !displayName.value.trim()) displayName.value = sourceFileBaseName(file.name);
        this.captureModeDraft(root);
        this.errorMessage = '';
        this.statusMessage = `已读取 ${file.name || '来源文件'}，请检查内容后生成预览。`;
      } catch (error) {
        if (this.generationRevision !== revision || this.creating) return;
        this.errorMessage = messageOf(error);
        this.statusMessage = '文件读取失败，请重新选择来源文件。';
        this.notify('error', this.errorMessage);
      } finally {
        if (this.generationRevision === revision) this.readingFile = false;
        if (this.generationRevision === revision && !this.creating) this.renderResult(root);
      }
    }

    private async generate(root: HTMLElement): Promise<void> {
      if (this.controller || this.creating || this.readingFile || environment.pane?.active() === false) return;
      const mode = valueOf(root, 'mode');
      if (mode === 'ai') {
        this.notify('error', '普通文本 AI 请从 Actor 工作台运行；候选生成不会自动请求付费审核。');
        return;
      }
      let source = valueOf(root, 'source');
      const displayName = valueOf(root, 'displayName') || 'Forge Actor';
      if (mode === 'blueprint') {
        try {
          source = this.prepareBlueprintSource(root);
        } catch (error) {
          this.notify('error', messageOf(error));
          return;
        }
      }
      if (!source.trim()) {
        this.notify('error', '来源文本不能为空。');
        return;
      }
      if (!claimGeneration(this)) {
        this.notify('error', `已有 Forge Actor 生成任务正在运行；当前模块最多允许 ${BROWSER_MAX_CONCURRENT_ACTOR_JOBS} 个活动任务。`);
        return;
      }
      if (mode === 'ai' && !claimForgeAiJob(this)) {
        releaseGeneration(this);
        this.notify('error', '已有 Forge AI Intake 任务正在运行；Actor 与 Item AI 共用一个活动任务上限。');
        return;
      }
      const priorResponse=this.response,priorIntake=this.intake,priorSnapshot=this.sourceSnapshot;
      this.stageProgress = [];
      this.created = undefined;
      this.statusMessage = '正在生成预览…';
      this.errorMessage = '';
      const controller = new AbortController();
      const revision = ++this.generationRevision;
      this.controller = controller;
      try {
        setBusy(root, true);
        if (mode === 'ai') {
          // AI generation belongs to the Intake workspace. Keep this branch
          // only for callers that explicitly set the legacy mode; the
          // standard import template has no editable connection fields.
          const apiSettings = readForgeSessionSettings();
          if (!apiSettings.apiKey || !apiSettings.endpoint || !apiSettings.model) {
            throw new Error('普通文本 AI 请从 Actor 工作台运行，并先在 AI 连接设置中完成配置。');
          }
          const provider = this.services.createBrowserAiProvider({
            apiKey: apiSettings.apiKey,
            baseUrl: apiSettings.endpoint,
            model: apiSettings.model,
            reviewModel: apiSettings.model,
          }, controller.signal);
          const intake = await this.services.convertRawActorSourceWithAi({
            source,
            sourceName: displayName,
            displayName,
            requestId: randomRequestId(),
            fvttVersion: environment.game.version,
            systemVersion: environment.game.system.version,
            onStage: (stage) => {
              if (!this.isCurrentGeneration(controller, revision)) return;
              const index = this.stageProgress.findIndex((entry) => entry.stage === stage.stage);
              if (index >= 0) this.stageProgress[index] = stage;
              else this.stageProgress.push(stage);
              this.renderResult(root);
            },
          }, provider, controller.signal);
          if (controller.signal.aborted) return;
          if (!this.isCurrentGeneration(controller, revision)) return;
          this.intake = intake;
          this.response = intake.response;
          this.sourceSnapshot = JSON.stringify({ mode, source, displayName });
          this.statusMessage = '';
        } else {
          const request = buildForgeActorRequest({
            content: source,
            displayName,
            requestId: randomRequestId(),
            fvttVersion: environment.game.version,
            systemVersion: environment.game.system.version,
          });
          const response = await this.services.convertFinalActorSource(request);
          if (!this.isCurrentGeneration(controller, revision)) return;
          if('result'in response&&response.result.artifact){
            this.response=response;this.intake=undefined;this.sourceSnapshot=JSON.stringify({mode,source,displayName});
          }else if(priorResponse){
            this.response=priorResponse;this.intake=priorIntake;this.sourceSnapshot=priorSnapshot;
            this.errorMessage='本次未产生新的 Actor；此前完整产物保留。';
          }else this.response=response;
          this.statusMessage = '';
          if (mode === 'blueprint') {
            this.blueprintGenerationSnapshot = source;
            this.blueprintDirty = false;
          }
        }
        if (!this.isCurrentGeneration(controller, revision)) return;
        this.renderResult(root);
      } catch (error) {
        if (this.isCurrentGeneration(controller, revision) && !controller.signal.aborted) {
          this.errorMessage = messageOf(error);
          this.statusMessage = '生成未完成，请检查来源后重试。';
          this.notify('error', this.errorMessage);
        }
      } finally {
        const ownsController = this.controller === controller;
        if (ownsController) {
          this.controller = undefined;
          setBusy(root, false);
          this.renderResult(root);
        }
        releaseGeneration(this);
        if (mode === 'ai') releaseForgeAiJob(this);
      }
    }

    private cancel(): void {
      this.controller?.abort();
      this.generationRevision += 1;
      this.readingFile = false;
      this.blueprintGenerationSnapshot = undefined;
      this.blueprintOperationRevision += 1;
    }

    private isCurrentGeneration(controller: AbortController, revision: number): boolean {
      return this.controller === controller && this.generationRevision === revision;
    }

    private clear(root: HTMLElement): void {
      if (this.creating) return;
      this.cancel();
      const source = root.querySelector('[name="source"]') as HTMLTextAreaElement | null;
      const displayName = root.querySelector('[name="displayName"]') as HTMLInputElement | null;
      if (source) source.value = '';
      if (displayName) displayName.value = '';
      const sourceFile = root.querySelector('[name="sourceFile"]') as HTMLInputElement | null;
      if (sourceFile) sourceFile.value = '';
      this.created = undefined;
      this.statusMessage = '';
      this.errorMessage = '';
      const currentMode = this.normalizeMode(valueOf(root, 'mode'));
      if (currentMode === 'structured' || currentMode === 'ai') this.modeDrafts[currentMode] = { source: '', displayName: '' };
      this.blueprintDraft = createEmptyBlueprintDraft();
      this.blueprintParentCore = undefined;
      this.blueprintSource = '';
      this.blueprintSourceRevision = -1;
      this.blueprintGenerationSnapshot = undefined;
      this.blueprintDirty = false;
      if (valueOf(root, 'mode') === 'blueprint') {
        try {
          this.blueprintCore = this.services.createCreatureBlueprint();
          const defaults = coreToBlueprintDraft(this.blueprintCore);
          this.blueprintDraft.sourceId = defaults.sourceId;
          this.blueprintDraft.components = defaults.components;
          this.blueprintInitialized = true;
        } catch {
          this.blueprintCore = undefined;
          this.blueprintInitialized = false;
        }
        writeBlueprintDraft(root, this.blueprintDraft, false);
      } else {
        this.blueprintCore = undefined;
        this.blueprintInitialized = false;
      }
      this.response = undefined;
      this.intake = undefined;
      this.stageProgress = [];
      this.renderResult(root);
      this.renderBlueprintEditor(root, true);
    }

    private async create(): Promise<void> {
      if (!this.response || this.creating || environment.pane?.active() === false) return;
      if (!isApplyable(this.response, this.intake)) {
        this.notify('error', '当前没有已生成的 Actor 产物。');
        return;
      }
      const root = this.element as HTMLElement | undefined;
      this.creating = true;
      if (root) this.renderResult(root);
      try {
        assertGm(environment.game);
        assertExactRuntime(environment.game);
        const result = await this.services.createAcceptedForgeActor({
          game: environment.game,
          response: this.response,
          rawSourceHash: this.intake?.rawSourceHash,
        });
        this.created = result;
        this.errorMessage = '';
        this.statusMessage = result.readbackWarnings?.length?'Actor 已保留，部分录入值需要核对，请查看下方提示。':result.status === 'existing'
          ? '已找到相同来源和 artifact，可打开已有角色卡。'
          : 'Actor 已创建并完成回读核对，可打开角色卡。';
        this.notify('info', result.readbackWarnings?.length?`Actor 已保留，录入值存在差异：${result.uuid}`:result.status === 'existing'
          ? `已找到相同来源和 artifact 的 Actor：${result.uuid}`
          : `Actor 创建并重新读取核对成功：${result.uuid}`);
      } catch (error) {
        this.errorMessage = messageOf(error);
        this.statusMessage = '创建未完成，请根据错误检查后重试。';
        this.notify('error', messageOf(error));
      } finally {
        this.creating = false;
        const currentRoot = this.element as HTMLElement | undefined;
        if (currentRoot) {
          this.renderResult(currentRoot);
          this.renderBlueprintLibrary(currentRoot);
        }
      }
    }

    private ensureBlueprintSourceLibrary(): ManagedForgeSourceLibrary {
      this.assertBlueprintLibraryAuthority();
      if (this.sourceLibrary) return this.sourceLibrary;
      this.sourceLibrary = new ManagedForgeSourceLibrary(new IndexedDbForgeSourceLibraryStore(sourceLibraryScope(environment.game)));
      this.blueprintLibraryUnsubscribe = this.sourceLibrary.subscribe(() => {
        const activeRoot = this.element as HTMLElement | undefined;
        if (activeRoot && !this.blueprintLibraryMutation && valueOf(activeRoot, 'mode') === 'blueprint') {
          void this.refreshBlueprintLibrary(activeRoot, false);
        }
      });
      return this.sourceLibrary;
    }

    private async refreshBlueprintLibrary(root: HTMLElement, notify: boolean): Promise<void> {
      if (this.blueprintLibraryLoading || this.blueprintLibraryMutation) return;
      try { this.assertBlueprintLibraryAuthority(); }
      catch (error) { if (notify) this.notify('error', messageOf(error)); return; }
      const operation = ++this.blueprintOperationRevision;
      this.blueprintLibraryLoading = true;
      this.renderBlueprintLibrary(root);
      try {
        const state = await this.ensureBlueprintSourceLibrary().load();
        this.assertBlueprintLibraryAuthority();
        if (operation !== this.blueprintOperationRevision) return;
        this.blueprintLibraryState = state;
        if (notify) this.notify('info', '蓝图来源库已刷新。');
      } catch (error) {
        if (operation === this.blueprintOperationRevision) this.notify('error', messageOf(error));
      } finally {
        if (operation === this.blueprintOperationRevision) {
          this.blueprintLibraryLoading = false;
          this.renderBlueprintLibrary(root);
        } else this.blueprintLibraryLoading = false;
      }
    }

    private renderBlueprintLibrary(root: HTMLElement): void {
      const status = root.querySelector('[data-blueprint-library-status]') as HTMLElement | null;
      const select = root.querySelector('[name="blueprintLibrarySelect"]') as HTMLSelectElement | null;
      if (!status || !select) return;
      if (this.blueprintLibraryLoading) status.textContent = '蓝图来源库加载中…';
      else if (!this.blueprintLibraryState) status.textContent = '尚未加载；只读取当前 world/GM scope 的 blueprint 来源。';
      else status.textContent = `已加载 ${this.blueprintLibraryEntries().length} 个可用蓝图来源。`;
      const entries = this.blueprintLibraryEntries();
      const selected = select.value;
      select.innerHTML = entries.map(({ source, blueprint }) => `<option value="${escapeHtml(source.id)}">${escapeHtml(blueprint.name)} · ${escapeHtml(source.updatedAt)}</option>`).join('');
      if (entries.some(({ source }) => source.id === selected)) select.value = selected;
      const disabled = this.creating || this.blueprintLibraryLoading || this.blueprintLibraryMutation || !isCurrentGmRuntime(environment.game);
      select.disabled = disabled;
      const search = root.querySelector('[name="blueprintLibrarySearch"]') as HTMLInputElement | null;
      if (search) search.disabled = disabled;
      const cards = root.querySelector('[data-blueprint-library-cards]') as HTMLElement | null;
      if (cards) {
        cards.innerHTML = entries.length
          ? entries.map(({ source, blueprint }) => {
            const active = source.id === select.value;
            return `<button type="button" class="forge-library-card" data-blueprint-library-card="${escapeHtml(source.id)}" aria-pressed="${active}"${active ? ' data-selected="true"' : ''}><strong>${escapeHtml(blueprint.name)}</strong><small>${escapeHtml(String(blueprint.type ?? '生物'))} · CR ${escapeHtml(String(blueprint.cr ?? '—'))}</small></button>`;
          }).join('')
          : '<p class="forge-library-empty">尚无匹配的蓝图。保存当前来源后即可在这里重新载入。</p>';
        for (const card of cards.querySelectorAll<HTMLButtonElement>('[data-blueprint-library-card]')) {
          card.disabled = disabled;
          card.onclick = () => {
            select.value = card.dataset.blueprintLibraryCard ?? '';
            for (const other of cards.querySelectorAll<HTMLButtonElement>('[data-blueprint-library-card]')) {
              const active = other === card;
              other.setAttribute('aria-pressed', String(active));
              if (active) other.setAttribute('data-selected', 'true');
              else other.removeAttribute('data-selected');
            }
            const load = root.querySelector('[data-action="blueprint-library-load"]') as HTMLButtonElement | null;
            if (load) load.disabled = !select.value;
          };
        }
      }
      const newButton = root.querySelector('[data-action="blueprint-new"]') as HTMLButtonElement | null;
      if (newButton) newButton.disabled = this.creating || !isCurrentGmRuntime(environment.game);
      for (const action of ['blueprint-library-refresh', 'blueprint-library-load', 'blueprint-library-save', 'blueprint-download']) {
        const button = root.querySelector(`[data-action="${action}"]`) as HTMLButtonElement | null;
        if (button) button.disabled = disabled || (action === 'blueprint-library-load' && !select.value) || (action === 'blueprint-download' && !this.blueprintSource);
      }
    }

    private blueprintLibraryEntries(): Array<{ source: ForgeSourceLibrarySearchResult['source']; blueprint: any }> {
      if (!this.blueprintLibraryState) return [];
      return searchForgeSourceLibrary(this.blueprintLibraryState, this.blueprintLibraryQuery)
        .filter(({ source }) => source.objectKind === 'actor' && source.mode === 'plaintext-actor')
        .flatMap(({ source }) => {
          try {
            return [{ source, blueprint: this.services.parseCreatureBlueprintSource(source.rawSource) }];
          } catch {
            return [];
          }
        });
    }

    private async loadBlueprintFromLibrary(root: HTMLElement): Promise<void> {
      if (this.blueprintLibraryMutation || this.blueprintLibraryLoading) return;
      if (this.blueprintWorkspaceDirty(root)) {
        this.notify('error', '载入蓝图前请先点击“清除”，避免覆盖未保存编辑。');
        return;
      }
      try { this.assertBlueprintLibraryAuthority(); }
      catch (error) { this.notify('error', messageOf(error)); return; }
      const select = root.querySelector('[name="blueprintLibrarySelect"]') as HTMLSelectElement | null;
      const selectedId = select?.value;
      const entry = this.blueprintLibraryEntries().find(({ source }) => source.id === selectedId);
      if (!entry) return void this.notify('error', '请选择一个可用的蓝图来源。');
      const operation = ++this.blueprintOperationRevision;
      try {
        const parsed = this.services.parseCreatureBlueprintSource(entry.source.rawSource);
        this.assertBlueprintLibraryAuthority();
        if (operation !== this.blueprintOperationRevision || this.blueprintWorkspaceDirty(root)) return;
        this.cancel();
        this.blueprintCore = parsed;
        this.blueprintParentCore = undefined;
        this.blueprintDraft = coreToBlueprintDraft(parsed);
        this.blueprintInitialized = true;
        this.blueprintDirty = false;
        this.blueprintSource = entry.source.rawSource;
        this.blueprintSourceRevision = this.generationRevision;
        writeBlueprintDraft(root, this.blueprintDraft, false);
        this.renderBlueprintEditor(root, true);
        this.renderResult(root);
        this.notify('info', '蓝图已载入；请重新生成预览。');
      } catch (error) {
        this.notify('error', messageOf(error));
      }
    }

    private async saveBlueprintToLibrary(root: HTMLElement): Promise<void> {
      if (this.blueprintLibraryMutation || this.blueprintLibraryLoading) return;
      try {
        this.assertBlueprintLibraryAuthority();
        const source = this.prepareBlueprintSource(root);
        this.services.parseCreatureBlueprintSource(source);
        const operation = ++this.blueprintOperationRevision;
        this.blueprintLibraryMutation = true;
        this.renderBlueprintLibrary(root);
        const state = await this.ensureBlueprintSourceLibrary().saveSource({
          objectKind: 'actor',
          mode: 'plaintext-actor',
          sourceLabel: this.blueprintDraft.name,
          rawSource: source,
          beforeCommit: () => {
            this.assertBlueprintLibraryAuthority();
            if (operation !== this.blueprintOperationRevision) throw new Error('蓝图编辑已变化；旧保存已取消，请重新保存当前草稿。');
            if (this.currentBlueprintSource(root) !== source) throw new Error('蓝图编辑已变化；旧保存已取消，请重新保存当前草稿。');
          },
        });
        if (operation === this.blueprintOperationRevision) {
          this.blueprintLibraryState = state;
          this.blueprintDirty = false;
          this.notify('info', '当前蓝图来源已保存。历史 accepted 结果不会保存。');
        }
      } catch (error) {
        this.notify('error', messageOf(error));
      } finally {
        this.blueprintLibraryMutation = false;
        this.renderBlueprintLibrary(root);
      }
    }

    private downloadBlueprintSource(root: HTMLElement): void {
      try {
        const source = this.prepareBlueprintSource(root);
        this.services.parseCreatureBlueprintSource(source);
        downloadTextFile(`${safeDownloadName(this.blueprintDraft.name || 'creature-blueprint')}.md`, source, 'text/markdown;charset=utf-8');
      } catch (error) {
        this.blueprintSource = '';
        this.blueprintSourceRevision = -1;
        this.notify('error', messageOf(error));
      }
    }

    private assertBlueprintLibraryAuthority(): void {
      assertGm(environment.game);
      assertExactRuntime(environment.game);
      const scope = sourceLibraryScope(environment.game);
      if (this.boundSourceLibraryScope && this.boundSourceLibraryScope !== scope) {
        throw new Error('蓝图来源库 scope 已变化；请重新打开 Forge Actor 窗口。');
      }
      this.boundSourceLibraryScope ??= scope;
    }

    private currentBlueprintSource(root: HTMLElement): string {
      const core = this.toCoreBlueprint(root);
      return this.services.renderCreatureBlueprintSource(core);
    }

    private blueprintWorkspaceDirty(root: HTMLElement): boolean {
      if (this.blueprintDirty || this.response) return true;
      if (!this.blueprintSource) return false;
      try {
        return this.currentBlueprintSource(root) !== this.blueprintSource;
      } catch {
        return true;
      }
    }

    private async openCreated(): Promise<void> {
      const created = this.created;
      if (!created) return;
      try {
        assertGm(environment.game);
        assertExactRuntime(environment.game);
        await openDocumentSheet(created.actor, created.uuid, environment);
      } catch (error) {
        this.notify('error', messageOf(error));
      }
    }

    private renderResult(root: HTMLElement): void {
      root = (this.element as HTMLElement | undefined) ?? root;
      environment.pane?.changed();
      const status = root.querySelector('[data-status]') as HTMLElement | null;
      const stages = root.querySelector('[data-stages]') as HTMLElement | null;
      const diagnostics = root.querySelector('[data-diagnostics]') as HTMLElement | null;
      const diagnosticList = root.querySelector('[data-diagnostic-list]') as HTMLElement | null;
      const preview = root.querySelector('[data-preview]') as HTMLElement | null;
      const statblock = root.querySelector('[data-statblock]') as HTMLElement | null;
      const previewText = root.querySelector('[data-preview-text]') as HTMLElement | null;
      const json = root.querySelector('[data-json]') as HTMLElement | null;
      const intakeEvidence = root.querySelector('[data-intake-evidence]') as HTMLElement | null;
      const finalSource = root.querySelector('[data-final-source]') as HTMLElement | null;
      const create = root.querySelector('[data-action="create"]') as HTMLButtonElement | null;
      const openCreated = root.querySelector('[data-action="open-created"]') as HTMLButtonElement | null;
      const createdDocument = root.querySelector('[data-created-document]') as HTMLElement | null;
      const createdSummary = root.querySelector('[data-created-summary]') as HTMLElement | null;
      const error = root.querySelector('[data-error]') as HTMLElement | null;
      const result = this.response && 'result' in this.response ? this.response.result : undefined;
      const responseStatus = this.intake?.status ?? result?.status;
      const generate = root.querySelector('[data-action="generate"]') as HTMLButtonElement | null;
      const cancel = root.querySelector('[data-action="cancel"]') as HTMLButtonElement | null;
      const source = root.querySelector('[name="source"]') as HTMLTextAreaElement | null;
      const displayName = root.querySelector('[name="displayName"]') as HTMLInputElement | null;
      const mode = root.querySelector('[name="mode"]') as HTMLSelectElement | null;
      if (status) {
        status.textContent = this.creating
          ? '状态：正在提交并重新读取核对（不可取消）。'
          : this.statusMessage ? `状态：${this.statusMessage}`
            : responseStatus ? `状态：${responseStatus}` : '尚未生成。';
      }
      if (error) {
        error.hidden = !this.errorMessage;
        error.textContent = this.errorMessage;
      }
      if (stages) {
        stages.innerHTML = (this.intake?.stages ?? this.stageProgress).map((stage) => `<li>${escapeHtml(stage.stage)}：${escapeHtml(stage.status)}${stage.message ? ` — ${escapeHtml(stage.message)}` : ''}</li>`).join('');
      }
      const messages = [
        ...(this.created?.readbackWarnings??[]),
        ...(result?.diagnostics ?? []).map((entry) => `[${entry.severity}] ${entry.code}: ${entry.message}`),
        ...(this.intake?.findings ?? []).map((entry) => `[${entry.origin}] ${entry.code}: ${entry.message}`),
      ];
      if (diagnostics) diagnostics.hidden = messages.length === 0;
      if (diagnosticList) diagnosticList.innerHTML = messages.map((message) => `<li>${escapeHtml(message)}</li>`).join('');
      const formalArtifact = Boolean(result && 'artifact' in result && result.artifact);
      if (preview) preview.hidden = !formalArtifact;
      if (statblock) {
        if (formalArtifact && result && 'artifact' in result) statblock.innerHTML = renderActorStatblock(result.artifact);
        else if (mode?.value === 'blueprint') statblock.innerHTML = renderBlueprintDraftStatblock(readBlueprintDraft(root, this.blueprintDraft));
        else statblock.innerHTML = '<p class="forge-preview-empty">填写来源并生成预览后，角色数据会显示在这里。</p>';
      }
      const previewHeading = root.querySelector('#forge-preview-heading') as HTMLElement | null;
      const previewDescription = root.querySelector('.forge-preview-header p') as HTMLElement | null;
      const previewBadge = root.querySelector('[data-preview-badge]') as HTMLElement | null;
      if (previewHeading) previewHeading.textContent = formalArtifact ? '2024 格式 · 正式候选' : mode?.value === 'blueprint' ? '2024 格式 · 草稿视图' : 'Actor 预览';
      if (previewDescription) previewDescription.textContent = formalArtifact
        ? '展示生成的原始 Actor；需 dnd5e 计算的最终数值以原生角色卡为准。'
        : mode?.value === 'blueprint' ? '随当前编辑内容更新。草稿尚未经过正式生成验证。'
          : '填写来源并生成后，在这里审阅候选 Actor。';
      if (previewBadge) previewBadge.textContent = formalArtifact
        ? responseStatus === 'accepted' ? '验证通过' : `候选：${responseStatus ?? '待审阅'}`
        : mode?.value === 'blueprint' ? '尚未验证' : '等待生成';
      if (previewText && result && 'actorVerification' in result) previewText.textContent = JSON.stringify(buildSafePreview(result), null, 2);
      if (json && result && 'artifact' in result) json.textContent = JSON.stringify(result.artifact, null, 2);
      if (intakeEvidence) intakeEvidence.textContent = this.intake?.evidence
        ? JSON.stringify({
          rawSourceHash: this.intake.rawSourceHash,
          finalSourceHash: this.intake.finalSourceHash,
          evidence: this.intake.evidence,
        }, null, 2)
        : '';
      if (finalSource) finalSource.textContent = valueOf(root, 'mode') === 'blueprint'
        ? this.blueprintSource
        : this.intake?.finalSource ?? '';
      if (generate) generate.disabled = Boolean(this.controller || this.creating);
      if (cancel) cancel.disabled = this.creating || !this.controller;
      if (source) source.disabled = this.creating;
      if (displayName) displayName.disabled = this.creating;
      if (mode) mode.disabled = this.creating;
      const blueprintEditor = root.querySelector('[data-blueprint-editor]') as HTMLElement | null;
      if (blueprintEditor && typeof blueprintEditor.querySelectorAll === 'function') blueprintEditor.querySelectorAll('input, select, textarea, button').forEach((element) => {
        (element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement).disabled = this.creating;
      });
      const blueprintLibrary = root.querySelector('[data-blueprint-library]') as HTMLElement | null;
      if (this.creating && blueprintLibrary && typeof blueprintLibrary.querySelectorAll === 'function') blueprintLibrary.querySelectorAll('input, select, button').forEach((element) => {
        (element as HTMLInputElement | HTMLSelectElement | HTMLButtonElement).disabled = true;
      });
      if (create) create.disabled = this.creating
        || !isApplyable(this.response, this.intake)
        || !isCurrentGmRuntime(environment.game);
      if (createdDocument) createdDocument.hidden = !this.created;
      if (createdSummary && this.created) createdSummary.textContent = this.created.readbackWarnings?.length
        ? `角色已保留，以下录入值需要核对：${this.created.readbackWarnings.join('；')}`:this.created.status === 'existing'
        ? '已找到相同来源的现有生物，可以打开角色卡继续检查。'
        : '已通过回读核对，可以打开角色卡继续检查。';
      if (openCreated) openCreated.disabled = !this.created || this.creating || !isCurrentGmRuntime(environment.game);
      const sourceFile = root.querySelector('[name="sourceFile"]') as HTMLInputElement | null;
      if (sourceFile) sourceFile.disabled = this.creating || this.readingFile;
      if (source) source.disabled = this.creating || this.readingFile;
      if (generate) generate.disabled = Boolean(this.controller || this.creating || this.readingFile);
    }

    private registerAvailabilityHooks(): void {
      if (this.availabilityHooks.length > 0) return;
      const hooks = environment.hooks ?? (globalThis as any).Hooks;
      if (typeof hooks?.on !== 'function') return;
      const refresh = () => {
        const root = this.element as HTMLElement | undefined;
        if (root) this.renderResult(root);
      };
      for (const event of ['updateUser', 'updateSetting']) {
        this.availabilityHooks.push({ event, id: hooks.on(event, refresh) });
      }
    }

    private unregisterAvailabilityHooks(): void {
      const hooks = environment.hooks ?? (globalThis as any).Hooks;
      if (typeof hooks?.off === 'function') {
        for (const hook of this.availabilityHooks) hooks.off(hook.event, hook.id);
      }
      this.availabilityHooks.length = 0;
    }

    private registerPageGuard(): void {
      if (this.pageGuardRegistered) return;
      const browserWindow = environment.window ?? (globalThis as any).window;
      if (typeof browserWindow?.addEventListener !== 'function') return;
      browserWindow.addEventListener('beforeunload', this.guardPageTeardown);
      this.pageGuardRegistered = true;
    }

    private unregisterPageGuard(): void {
      if (!this.pageGuardRegistered) return;
      const browserWindow = environment.window ?? (globalThis as any).window;
      browserWindow?.removeEventListener?.('beforeunload', this.guardPageTeardown);
      this.pageGuardRegistered = false;
    }

    private bind(root: HTMLElement, selector: string, handler: () => void): void {
      const element = root.querySelector(selector) as HTMLElement | null;
      if (element) element.onclick = handler;
    }

    private notify(level: 'info' | 'error', message: string): void {
      environment.ui?.notifications?.[level]?.(message);
    }
  };
}

function claimGeneration(owner: object): boolean {
  if (activeGenerationOwners.has(owner)) return true;
  if (activeGenerationOwners.size >= BROWSER_MAX_CONCURRENT_ACTOR_JOBS) return false;
  activeGenerationOwners.add(owner);
  return true;
}

function releaseGeneration(owner: object): void {
  activeGenerationOwners.delete(owner);
}

function isCurrentGmRuntime(game: any): boolean {
  try {
    assertGm(game);
    assertExactRuntime(game);
    return true;
  } catch {
    return false;
  }
}

function isApplyable(response: ForgeActorResponse | undefined, _intake?: BrowserActorIntakeResult): boolean {
  return !!response&&'result'in response&&!!response.result.artifact;
}

function buildSafePreview(result: Extract<ForgeActorResponse, { result: unknown }>['result']): unknown {
  if (!result || !('actorVerification' in result)) return undefined;
  return {
    actor: {
      ...result.actorVerification.actor,
      abilities: safeAbilities('artifact' in result ? result.artifact : undefined),
    },
    items: result.actorVerification.items,
  };
}

function coreToBlueprintDraft(value: unknown): BlueprintDraft {
  const core = asRecord(value);
  const abilities = asRecord(core.abilities);
  const components = Array.isArray(core.components) ? core.components : [];
  const lineage = asRecord(core.lineage);
  return {
    sourceId: typeof core.sourceId === 'string' ? core.sourceId : undefined,
    name: typeof core.name === 'string' ? core.name : '',
    size: typeof core.size === 'string' ? core.size : 'medium',
    type: typeof core.type === 'string' ? core.type : 'humanoid',
    alignment: typeof core.alignment === 'string' ? core.alignment : 'neutral',
    armorClass: scalarString(core.ac),
    hitPoints: scalarString(core.hp),
    speed: scalarString(core.speed),
    challengeRating: formatChallengeRatingString(core.cr),
    abilities: {
      str: scalarString(abilities.str), dex: scalarString(abilities.dex), con: scalarString(abilities.con),
      int: scalarString(abilities.int), wis: scalarString(abilities.wis), cha: scalarString(abilities.cha),
    },
    components: components.map((entry, index) => coreComponentToDraft(entry, index)),
    parent: typeof lineage.parentSourceId === 'string'
      ? { sourceId: lineage.parentSourceId, sourceHash: typeof lineage.parentSourceHash === 'string' ? lineage.parentSourceHash : '', name: '' }
      : undefined,
    diff: Array.isArray(lineage.changes) ? formatLineageChanges(lineage.changes) : undefined,
  };
}

function coreComponentToDraft(value: unknown, index: number): BlueprintComponentDraft {
  const component = asRecord(value);
  const damage = asRecord(component.damage);
  const kind = component.type === 'save' ? 'save' : 'attack';
  return {
    id: `component-${index + 1}`,
    kind,
    name: typeof component.name === 'string' ? component.name : kind === 'attack' ? '新攻击' : '新豁免',
    mode: typeof component.mode === 'string' ? component.mode : 'melee',
    ability: typeof component.ability === 'string' ? component.ability : 'con',
    attackBonus: scalarString(component.hitBonus),
    range: scalarString(component.range),
    damageFormula: typeof damage.formula === 'string' ? damage.formula : '',
    damageType: typeof damage.type === 'string' ? damage.type : '',
    dc: scalarString(component.dc),
    onSave: typeof component.success === 'string' ? component.success : 'half',
  };
}

function componentToCore(component: BlueprintComponentDraft): Record<string, unknown> {
  const damage = {
    formula: component.damageFormula,
    type: component.damageType,
  };
  if (component.kind === 'save') {
    return {
      type: 'save',
      name: component.name,
      ability: component.ability,
      dc: parseBlueprintInteger(component.dc, '豁免 DC'),
      range: parseBlueprintInteger(component.range, '豁免范围'),
      damage,
      success: component.onSave,
    };
  }
  return {
    type: 'attack',
    name: component.name,
    mode: component.mode,
    hitBonus: parseBlueprintInteger(component.attackBonus, '命中加值'),
    range: parseBlueprintInteger(component.range, '攻击范围'),
    damage,
  };
}

function parseBlueprintInteger(value: string, label: string): number {
  if (!/^\d+$/u.test(value)) throw new TypeError(`${label}必须是整数。`);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new TypeError(`${label}超出支持范围。`);
  return number;
}

function parseChallengeRating(value: string): number {
  const normalized = value.trim();
  if (normalized === '1/8') return 0.125;
  if (normalized === '1/4') return 0.25;
  if (normalized === '1/2') return 0.5;
  if (!/^\d+(?:\.0+)?$/u.test(normalized)) throw new TypeError('挑战等级必须是 0、1/8、1/4、1/2 或整数。');
  const result = Number(normalized);
  if (!Number.isInteger(result) || result < 0 || result > 30) throw new TypeError('挑战等级必须在 0 到 30 之间。');
  return result;
}

function scalarString(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value : '';
}

function formatChallengeRatingString(value: unknown): string {
  if (value === 0.125) return '1/8';
  if (value === 0.25) return '1/4';
  if (value === 0.5) return '1/2';
  return scalarString(value);
}

function formatLineageChanges(value: unknown[]): string {
  return value.map((entry) => {
    const change = asRecord(entry);
    return `${typeof change.path === 'string' ? change.path : '?'}: ${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`;
  }).join('\n');
}

function reconstructLineageParent(current: Record<string, any>): Record<string, any> | undefined {
  const lineage = asRecord(current.lineage);
  if (typeof lineage.parentSourceId !== 'string' || !Array.isArray(lineage.changes)) return undefined;
  const parent = JSON.parse(JSON.stringify(current)) as Record<string, any>;
  delete parent.lineage;
  parent.sourceId = lineage.parentSourceId;
  for (const entry of lineage.changes) {
    const change = asRecord(entry);
    if (typeof change.path !== 'string' || !isSafeBlueprintPath(change.path)) return undefined;
    if (!setBlueprintPath(parent, change.path, change.before)) return undefined;
  }
  return parent;
}

function isSafeBlueprintPath(path: string): boolean {
  return /^\/(?:name|size|type|alignment|ac|hp|speed|cr|abilities(?:\/(?:str|dex|con|int|wis|cha))?|components(?:\/\d+(?:\/(?:type|name|mode|ability|hitBonus|dc|range|success|damage\/(?:formula|type))?)?)?)$/u.test(path);
}

function setBlueprintPath(root: Record<string, any>, path: string, value: unknown): boolean {
  const parts = path.slice(1).split('/');
  let cursor: any = root;
  for (const part of parts.slice(0, -1)) {
    if (cursor === null || typeof cursor !== 'object' || !Object.hasOwn(cursor, part)) return false;
    cursor = cursor[part];
  }
  if (cursor === null || typeof cursor !== 'object') return false;
  const key = parts.at(-1);
  if (!key) return false;
  if (value === null) delete cursor[key];
  else cursor[key] = value;
  return true;
}

function safeAbilities(artifact: unknown): Record<string, Record<string, number>> {
  const actor = asRecord(artifact);
  const system = asRecord(actor.system);
  const abilities = asRecord(system.abilities);
  const result: Record<string, Record<string, number>> = {};
  for (const key of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) {
    const value = asRecord(abilities[key]);
    const summary: Record<string, number> = {};
    for (const field of ['value', 'mod', 'save'] as const) {
      if (typeof value[field] === 'number' && Number.isFinite(value[field])) summary[field] = value[field];
    }
    result[key] = summary;
  }
  return result;
}

function valueOf(root: HTMLElement, name: string): string {
  return inputValue(root, name).trim();
}

function inputValue(root: HTMLElement, name: string): string {
  const element = root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  return element?.value ?? '';
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function isSupportedSourceFile(file: File): boolean {
  const name = typeof file.name === 'string' ? file.name.trim() : '';
  if (/\.(?:md|txt)$/iu.test(name)) return true;
  return !name.includes('.') && ['text/plain', 'text/markdown'].includes(file.type);
}

function sourceFileBaseName(name: string): string {
  const base = name.replace(/\.(?:md|txt)$/iu, '').trim();
  return base || '未命名生物';
}

async function openDocumentSheet(document: unknown, uuid: string, environment: ForgeApplicationEnvironment): Promise<void> {
  const directSheet = (document as { sheet?: { render?: (force?: boolean) => unknown } } | undefined)?.sheet;
  if (typeof directSheet?.render === 'function') {
    await directSheet.render(true);
    return;
  }
  const fromUuid = (environment as any).fromUuid ?? (environment.game as any)?.fromUuid ?? (globalThis as any).fromUuid;
  if (typeof fromUuid === 'function') {
    const resolved = await fromUuid(uuid);
    const resolvedSheet = resolved?.sheet;
    if (typeof resolvedSheet?.render === 'function') {
      await resolvedSheet.render(true);
      return;
    }
  }
  throw new Error('创建成功，但无法打开 Actor 角色卡。');
}

function setBusy(root: HTMLElement, busy: boolean): void {
  const generate = root.querySelector('[data-action="generate"]') as HTMLButtonElement | null;
  const cancel = root.querySelector('[data-action="cancel"]') as HTMLButtonElement | null;
  if (generate) generate.disabled = busy;
  if (cancel) cancel.disabled = !busy;
}

function randomRequestId(): string {
  return `forge-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { name?: unknown }).name === 'AbortError');
}

function sourceLibraryScope(game: any): string {
  const worldId = typeof game?.world?.id === 'string' ? game.world.id.trim() : '';
  const userId = typeof game?.user?.id === 'string' ? game.user.id.trim() : '';
  if (!worldId || !userId) throw new Error('蓝图来源库需要当前 world ID 和 GM user ID。');
  return `${worldId}:${userId}`;
}

function workspaceConnectionIdentity(settings: ReturnType<typeof readForgeSessionSettings>): string {
  return JSON.stringify({
    providerId: settings.providerId,
    endpoint: settings.endpoint.trim(),
    protocol: settings.protocol,
    authScheme: settings.authScheme,
    region: settings.region,
    model: settings.model,
    reviewModel: settings.reviewModel,
    useSeparateReviewModel: settings.useSeparateReviewModel,
    reasoning: settings.reasoning,
    structuredOutput: settings.structuredOutput,
  });
}

function safeDownloadName(value: string): string {
  const normalized = value.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 80);
  return normalized || 'creature-blueprint';
}

function downloadTextFile(fileName: string, content: string, type: string): void {
  const urlApi = (globalThis as any).URL;
  const document = (globalThis as any).document;
  if (!urlApi?.createObjectURL || !document?.createElement) throw new Error('当前浏览器不能下载文件。');
  const url = urlApi.createObjectURL(new Blob([content], { type }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  } finally {
    urlApi.revokeObjectURL(url);
  }
}
