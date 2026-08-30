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
} from './runtime';
import {
  clearApiKey,
  readClientSettings,
  saveClientSettings,
  type ForgeClientSettings,
} from './settings';
import { claimForgeAiJob, releaseForgeAiJob } from './aiJobGate';

export interface ForgeApplicationEnvironment {
  game: any;
  ui?: any;
  foundry?: any;
  window?: { addEventListener?: (event: string, callback: (event: any) => void) => void; removeEventListener?: (event: string, callback: (event: any) => void) => void };
  hooks?: { on?: (event: string, callback: (...args: any[]) => void) => unknown; off?: (event: string, id: unknown) => void };
  services?: Partial<ForgeApplicationServices>;
}

export interface ForgeApplicationServices {
  convertFinalActorSource: typeof convertFinalActorSource;
  convertRawActorSourceWithAi: typeof convertRawActorSourceWithAi;
  createBrowserAiProvider: typeof createBrowserAiProvider;
  createAcceptedForgeActor: typeof createAcceptedForgeActor;
}

const DEFAULT_SERVICES: ForgeApplicationServices = {
  convertFinalActorSource,
  convertRawActorSourceWithAi,
  createBrowserAiProvider,
  createAcceptedForgeActor,
};

const activeGenerationOwners = new Set<object>();

export function createForgeActorApplicationClass(environment: ForgeApplicationEnvironment): any {
  const foundryGlobal = environment.foundry ?? (globalThis as any).foundry;
  const ApplicationV2 = foundryGlobal?.applications?.api?.ApplicationV2;
  const HandlebarsApplicationMixin = foundryGlobal?.applications?.api?.HandlebarsApplicationMixin;
  if (!ApplicationV2 || typeof HandlebarsApplicationMixin !== 'function') {
    throw new Error('Foundry 14 ApplicationV2 and HandlebarsApplicationMixin are required.');
  }
  const Base = HandlebarsApplicationMixin(ApplicationV2);
  return class ForgeActorApplication extends Base {
    static DEFAULT_OPTIONS = {
      id: 'fvtt-json-forge-actor',
      classes: ['fvtt-json-forge', 'forge-actor-window'],
      position: { width: 760, height: 820 },
      window: { title: 'Forge Actor', resizable: true },
    };

    static PARTS = {
      form: { template: 'modules/fvtt-json-forge/templates/forge-actor.hbs' },
    };

    private response?: ForgeActorResponse;
    private intake?: BrowserActorIntakeResult;
    private stageProgress: BrowserActorIntakeStageResult[] = [];
    private controller?: AbortController;
    private generationRevision = 0;
    private creating = false;
    private readonly availabilityHooks: Array<{ event: string; id: unknown }> = [];
    private pageGuardRegistered = false;
    private readonly guardPageTeardown = (event: any) => {
      if (!this.creating) return;
      event?.preventDefault?.();
      if (event) event.returnValue = '';
    };
    private settings: ForgeClientSettings = readClientSettings();
    private readonly services: ForgeApplicationServices = { ...DEFAULT_SERVICES, ...(environment.services ?? {}) };

    async _prepareContext() {
      return {};
    }

    _onRender(_context: unknown, _options: unknown) {
      const root = this.element as HTMLElement | undefined;
      if (!root) return;
      const mode = root.querySelector('[name="mode"]') as HTMLSelectElement | null;
      const aiSettings = root.querySelector('[data-ai-settings]') as HTMLElement | null;
      const refreshAiVisibility = () => {
        if (aiSettings && mode) aiSettings.hidden = mode.value !== 'ai';
      };
      const invalidatePreview = () => {
        if (this.creating) return;
        this.generationRevision += 1;
        this.controller?.abort();
        this.response = undefined;
        this.intake = undefined;
        this.stageProgress = [];
        this.renderResult(root);
      };
      if (mode) mode.onchange = () => {
        refreshAiVisibility();
        invalidatePreview();
      };
      const source = root.querySelector('[name="source"]') as HTMLTextAreaElement | null;
      const displayName = root.querySelector('[name="displayName"]') as HTMLInputElement | null;
      if (source) source.oninput = invalidatePreview;
      if (displayName) displayName.oninput = invalidatePreview;
      refreshAiVisibility();
      this.registerAvailabilityHooks();
      this.registerPageGuard();
      this.fillSettings(root);
      this.bind(root, '[data-action="generate"]', () => void this.generate(root));
      this.bind(root, '[data-action="cancel"]', () => this.cancel());
      this.bind(root, '[data-action="clear"]', () => this.clear(root));
      this.bind(root, '[data-action="clear-key"]', () => {
        this.settings = clearApiKey();
        this.fillSettings(root);
        this.notify('info', 'API Key 已清除。');
      });
      this.bind(root, '[data-action="create"]', () => void this.create());
      this.renderResult(root);
    }

    async close(options?: unknown) {
      if (this.creating) {
        this.notify('error', 'Actor 正在提交并回读；完成前不能关闭 Forge 窗口。');
        return this;
      }
      this.cancel();
      this.unregisterAvailabilityHooks();
      this.unregisterPageGuard();
      return super.close(options);
    }

    private async generate(root: HTMLElement): Promise<void> {
      if (this.controller || this.creating) return;
      try {
        assertGm(environment.game);
        assertExactRuntime(environment.game);
      } catch (error) {
        this.notify('error', messageOf(error));
        return;
      }
      const mode = valueOf(root, 'mode');
      const source = valueOf(root, 'source');
      const displayName = valueOf(root, 'displayName') || 'Forge Actor';
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
      this.response = undefined;
      this.intake = undefined;
      this.stageProgress = [];
      const controller = new AbortController();
      const revision = ++this.generationRevision;
      this.controller = controller;
      try {
        setBusy(root, true);
        if (mode === 'ai') {
          const apiSettings = readApiSettings(root, this.settings);
          if (!apiSettings.apiKey || !apiSettings.endpoint || !apiSettings.model) {
            throw new Error('普通文本模式需要 HTTPS endpoint、提取模型和 API Key。');
          }
          const provider = this.services.createBrowserAiProvider({
            apiKey: apiSettings.apiKey,
            baseUrl: apiSettings.endpoint,
            model: apiSettings.model,
            reviewModel: apiSettings.reviewModel || apiSettings.model,
          }, controller.signal);
          this.settings = saveApiSettings(root, apiSettings);
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
          this.response = response;
        }
        if (!this.isCurrentGeneration(controller, revision)) return;
        this.renderResult(root);
      } catch (error) {
        if (this.isCurrentGeneration(controller, revision) && !controller.signal.aborted) this.notify('error', messageOf(error));
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
      this.response = undefined;
      this.intake = undefined;
      this.stageProgress = [];
      this.renderResult(root);
    }

    private async create(): Promise<void> {
      if (!this.response || this.creating) return;
      if (!isApplyable(this.response, this.intake)) {
        this.notify('error', '只有完整 Forge 与 AI Intake 均为 accepted 的结果才能创建 Actor。');
        return;
      }
      this.creating = true;
      const root = this.element as HTMLElement | undefined;
      if (root) this.renderResult(root);
      try {
        assertGm(environment.game);
        assertExactRuntime(environment.game);
        const result = await this.services.createAcceptedForgeActor({
          game: environment.game,
          response: this.response,
          rawSourceHash: this.intake?.rawSourceHash,
        });
        this.notify('info', result.status === 'existing'
          ? `已找到相同来源和 artifact 的 Actor：${result.uuid}`
          : `Actor 创建并重新读取核对成功：${result.uuid}`);
      } catch (error) {
        this.notify('error', messageOf(error));
      } finally {
        this.creating = false;
        const currentRoot = this.element as HTMLElement | undefined;
        if (currentRoot) this.renderResult(currentRoot);
      }
    }

    private renderResult(root: HTMLElement): void {
      const status = root.querySelector('[data-status]') as HTMLElement | null;
      const stages = root.querySelector('[data-stages]') as HTMLElement | null;
      const diagnostics = root.querySelector('[data-diagnostics]') as HTMLElement | null;
      const diagnosticList = root.querySelector('[data-diagnostic-list]') as HTMLElement | null;
      const preview = root.querySelector('[data-preview]') as HTMLElement | null;
      const previewText = root.querySelector('[data-preview-text]') as HTMLElement | null;
      const json = root.querySelector('[data-json]') as HTMLElement | null;
      const intakeEvidence = root.querySelector('[data-intake-evidence]') as HTMLElement | null;
      const finalSource = root.querySelector('[data-final-source]') as HTMLElement | null;
      const create = root.querySelector('[data-action="create"]') as HTMLButtonElement | null;
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
          : responseStatus ? `状态：${responseStatus}` : '尚未生成。';
      }
      if (stages) {
        stages.innerHTML = (this.intake?.stages ?? this.stageProgress).map((stage) => `<li>${escapeHtml(stage.stage)}：${escapeHtml(stage.status)}${stage.message ? ` — ${escapeHtml(stage.message)}` : ''}</li>`).join('');
      }
      const messages = [
        ...(result?.diagnostics ?? []).map((entry) => `[${entry.severity}] ${entry.code}: ${entry.message}`),
        ...(this.intake?.findings ?? []).map((entry) => `[${entry.origin}] ${entry.code}: ${entry.message}`),
      ];
      if (diagnostics) diagnostics.hidden = messages.length === 0;
      if (diagnosticList) diagnosticList.innerHTML = messages.map((message) => `<li>${escapeHtml(message)}</li>`).join('');
      if (preview) preview.hidden = !result || !('artifact' in result);
      if (previewText && result && 'actorVerification' in result) previewText.textContent = JSON.stringify(buildSafePreview(result), null, 2);
      if (json && result && 'artifact' in result) json.textContent = JSON.stringify(result.artifact, null, 2);
      if (intakeEvidence) intakeEvidence.textContent = this.intake?.evidence
        ? JSON.stringify({
          rawSourceHash: this.intake.rawSourceHash,
          finalSourceHash: this.intake.finalSourceHash,
          evidence: this.intake.evidence,
        }, null, 2)
        : '';
      if (finalSource) finalSource.textContent = this.intake?.finalSource ?? '';
      if (generate) generate.disabled = Boolean(this.controller || this.creating);
      if (cancel) cancel.disabled = this.creating || !this.controller;
      if (source) source.disabled = this.creating;
      if (displayName) displayName.disabled = this.creating;
      if (mode) mode.disabled = this.creating;
      if (create) create.disabled = this.creating
        || !isApplyable(this.response, this.intake)
        || !isCurrentGmRuntime(environment.game);
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

    private fillSettings(root: HTMLElement): void {
      for (const [key, value] of Object.entries(this.settings)) {
        const input = root.querySelector(`[name="${key}"]`) as HTMLInputElement | null;
        if (input && (globalThis as any).document?.activeElement !== input) {
          if (input.type === 'checkbox') input.checked = value === true;
          else input.value = String(value);
        }
      }
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

function readApiSettings(root: HTMLElement, previous: ForgeClientSettings): ForgeClientSettings {
  const apiKey = inputValue(root, 'apiKey');
  return {
    ...previous,
    endpoint: valueOf(root, 'endpoint'),
    model: valueOf(root, 'model'),
    reviewModel: valueOf(root, 'reviewModel'),
    apiKey,
    persistApiKey: checkedValue(root, 'persistApiKey'),
  };
}

function saveApiSettings(root: HTMLElement, settings: ForgeClientSettings): ForgeClientSettings {
  return saveClientSettings({
    ...settings,
    endpoint: valueOf(root, 'endpoint'),
    model: valueOf(root, 'model'),
    reviewModel: valueOf(root, 'reviewModel'),
    apiKey: inputValue(root, 'apiKey'),
    persistApiKey: checkedValue(root, 'persistApiKey'),
  });
}

function isApplyable(response: ForgeActorResponse | undefined, intake?: BrowserActorIntakeResult): boolean {
  if (!response) return false;
  if (intake && (
    intake.status !== 'accepted'
    || intake.response !== response
    || intake.findings.some((finding) => finding.blocking)
  )) return false;
  const decoded = decodeForgeActorResponse(response);
  if (!decoded.ok || !('result' in decoded.value)) return false;
  const result = decoded.value.result;
  return result.status === 'accepted'
    && Boolean(result.artifact && result.artifactHash)
    && result.verification.status === 'accepted'
    && result.diagnostics.length === 0
    && result.actorVerification.warnings.length === 0;
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

function checkedValue(root: HTMLElement, name: string): boolean {
  const element = root.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
  return element?.type === 'checkbox' && element.checked === true;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
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
