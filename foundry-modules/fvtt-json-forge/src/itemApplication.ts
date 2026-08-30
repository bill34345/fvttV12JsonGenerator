import {
  BROWSER_MAX_CONCURRENT_ACTOR_JOBS,
  buildForgeItemRequest,
  convertFinalItemSource,
} from '@fvtt-json-generator/forge-browser-runtime';
import {
  decodeForgeItemResponse,
  type ForgeItemRequest,
  type ForgeItemResponse,
} from '@fvtt-json-generator/forge-gateway-protocol';
import {
  assertExactRuntime,
  assertGm,
  EXPECTED_FOUNDRY_VERSION,
  EXPECTED_SYSTEM_VERSION,
} from './runtime';
import {
  createAcceptedForgeItem,
  type ForgeItemCreateResult,
} from './itemRuntime';

export interface ForgeItemApplicationEnvironment {
  game: any;
  ui?: any;
  foundry?: any;
  window?: { addEventListener?: (event: string, callback: (event: any) => void) => void; removeEventListener?: (event: string, callback: (event: any) => void) => void };
  hooks?: { on?: (event: string, callback: (...args: any[]) => void) => unknown; off?: (event: string, id: unknown) => void };
  services?: Partial<ForgeItemApplicationServices>;
}

export interface ForgeItemApplicationServices {
  convertFinalItemSource: typeof convertFinalItemSource;
  createAcceptedForgeItem: typeof createAcceptedForgeItem;
}

interface ItemPreviewSnapshot {
  source: string;
  displayName: string;
  mode: string;
}

const DEFAULT_SERVICES: ForgeItemApplicationServices = {
  convertFinalItemSource,
  createAcceptedForgeItem,
};

const activeItemGenerationOwners = new Set<object>();

export function createForgeItemApplicationClass(environment: ForgeItemApplicationEnvironment): any {
  const foundryGlobal = environment.foundry ?? (globalThis as any).foundry;
  const ApplicationV2 = foundryGlobal?.applications?.api?.ApplicationV2;
  const HandlebarsApplicationMixin = foundryGlobal?.applications?.api?.HandlebarsApplicationMixin;
  if (!ApplicationV2 || typeof HandlebarsApplicationMixin !== 'function') {
    throw new Error('Foundry 14 ApplicationV2 and HandlebarsApplicationMixin are required.');
  }
  const Base = HandlebarsApplicationMixin(ApplicationV2);
  return class ForgeItemApplication extends Base {
    static DEFAULT_OPTIONS = {
      id: 'fvtt-json-forge-item',
      classes: ['fvtt-json-forge', 'forge-item-window'],
      position: { width: 760, height: 820 },
      window: { title: 'Forge Item', resizable: true },
    };

    static PARTS = {
      form: { template: 'modules/fvtt-json-forge/templates/forge-item.hbs' },
    };

    private response?: ForgeItemResponse;
    private previewSnapshot?: ItemPreviewSnapshot;
    private controller?: AbortController;
    private generationRevision = 0;
    private creating = false;
    private readonly availabilityHooks: Array<{ event: string; id: unknown }> = [];
    private pageGuardRegistered = false;
    private readonly services: ForgeItemApplicationServices = { ...DEFAULT_SERVICES, ...(environment.services ?? {}) };
    private readonly guardPageTeardown = (event: any) => {
      if (!this.creating) return;
      event?.preventDefault?.();
      if (event) event.returnValue = '';
    };

    async _prepareContext() { return {}; }

    _onRender(_context: unknown, _options: unknown) {
      const root = this.element as HTMLElement | undefined;
      if (!root) return;
      const invalidatePreview = () => {
        if (this.creating) return;
        this.generationRevision += 1;
        this.controller?.abort();
        this.response = undefined;
        this.previewSnapshot = undefined;
        this.renderResult(root);
      };
      const source = root.querySelector('[name="source"]') as HTMLTextAreaElement | null;
      const displayName = root.querySelector('[name="displayName"]') as HTMLInputElement | null;
      const mode = root.querySelector('[name="mode"]') as HTMLSelectElement | null;
      if (source) source.oninput = invalidatePreview;
      if (displayName) displayName.oninput = invalidatePreview;
      if (mode) mode.onchange = invalidatePreview;
      this.registerAvailabilityHooks();
      this.registerPageGuard();
      this.bind(root, '[data-action="generate"]', () => void this.generate(root));
      this.bind(root, '[data-action="cancel"]', () => this.cancel());
      this.bind(root, '[data-action="clear"]', () => this.clear(root));
      this.bind(root, '[data-action="create"]', () => void this.create());
      this.renderResult(root);
    }

    async close(options?: unknown) {
      if (this.creating) {
        this.notify('error', 'Item 正在提交并回读；完成前不能关闭 Forge 窗口。');
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
        this.notify('error', itemMessageOf(error));
        return;
      }
      const snapshot = readSnapshot(root);
      if (!snapshot.source.trim()) {
        this.notify('error', '来源文本不能为空。');
        return;
      }
      if (snapshot.mode !== 'structured') {
        this.notify('error', 'Forge Item 只支持正式 structured Item 来源。');
        return;
      }
      if (!claimItemGeneration(this)) {
        this.notify('error', `已有 Forge Item 生成任务正在运行；当前模块最多允许 ${BROWSER_MAX_CONCURRENT_ACTOR_JOBS} 个活动任务。`);
        return;
      }
      this.response = undefined;
      this.previewSnapshot = undefined;
      const controller = new AbortController();
      const revision = ++this.generationRevision;
      this.controller = controller;
      try {
        this.renderResult(root);
        const request = buildForgeItemRequest({
          content: snapshot.source,
          displayName: snapshot.displayName || 'Forge Item',
          requestId: randomRequestId(),
          fvttVersion: environment.game.version,
          systemVersion: environment.game.system.version,
        });
        const finalSnapshot = { ...snapshot, source: request.source.content };
        const sourceInput = root.querySelector('[name="source"]') as HTMLTextAreaElement | null;
        if (sourceInput && sourceInput.value !== finalSnapshot.source) sourceInput.value = finalSnapshot.source;
        const response = await this.services.convertFinalItemSource(request);
        assertItemResponseMatchesRequest(response, request);
        if (!this.isCurrentGeneration(controller, revision) || !sameSnapshot(finalSnapshot, readSnapshot(root))) return;
        this.response = response;
        this.previewSnapshot = finalSnapshot;
        this.renderResult(root);
      } catch (error) {
        if (this.isCurrentGeneration(controller, revision) && !controller.signal.aborted) this.notify('error', itemMessageOf(error));
      } finally {
        if (this.controller === controller) {
          this.controller = undefined;
          this.renderResult(root);
        }
        releaseItemGeneration(this);
      }
    }

    private cancel(): void {
      if (this.creating) return;
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
      this.previewSnapshot = undefined;
      this.renderResult(root);
    }

    private async create(): Promise<void> {
      if (!this.response || this.creating) return;
      const root = this.element as HTMLElement | undefined;
      if (!root || !this.previewSnapshot || !sameSnapshot(this.previewSnapshot, readSnapshot(root))) {
        this.notify('error', 'Item preview 已过期；请按当前来源重新生成。');
        return;
      }
      if (!isItemApplyable(this.response) || !isCurrentItemGmRuntime(environment.game)) {
        this.notify('error', '只有当前 GM 在精确支持版本下生成的 accepted Item 才能创建。');
        return;
      }
      this.creating = true;
      this.renderResult(root);
      try {
        assertGm(environment.game);
        assertExactRuntime(environment.game);
        if (!sameSnapshot(this.previewSnapshot, readSnapshot(root)) || !isItemApplyable(this.response)) {
          throw new Error('Item preview 在提交前已失效。');
        }
        const result: ForgeItemCreateResult = await this.services.createAcceptedForgeItem({
          game: environment.game,
          response: this.response,
        });
        this.notify('info', result.status === 'existing'
          ? `已找到相同来源和 artifact 的 Item：${result.uuid}`
          : `Item 创建并重新读取核对成功：${result.uuid}`);
      } catch (error) {
        this.notify('error', itemMessageOf(error));
      } finally {
        this.creating = false;
        const currentRoot = this.element as HTMLElement | undefined;
        if (currentRoot) this.renderResult(currentRoot);
      }
    }

    private renderResult(root: HTMLElement): void {
      const result = this.response && 'result' in this.response ? this.response.result : undefined;
      const snapshotCurrent = Boolean(this.previewSnapshot && sameSnapshot(this.previewSnapshot, readSnapshot(root)));
      const status = root.querySelector('[data-status]') as HTMLElement | null;
      const diagnostics = root.querySelector('[data-diagnostics]') as HTMLElement | null;
      const diagnosticList = root.querySelector('[data-diagnostic-list]') as HTMLElement | null;
      const preview = root.querySelector('[data-preview]') as HTMLElement | null;
      const previewText = root.querySelector('[data-preview-text]') as HTMLElement | null;
      const json = root.querySelector('[data-json]') as HTMLElement | null;
      const finalSource = root.querySelector('[data-final-source]') as HTMLElement | null;
      const generate = root.querySelector('[data-action="generate"]') as HTMLButtonElement | null;
      const cancel = root.querySelector('[data-action="cancel"]') as HTMLButtonElement | null;
      const create = root.querySelector('[data-action="create"]') as HTMLButtonElement | null;
      const source = root.querySelector('[name="source"]') as HTMLTextAreaElement | null;
      const displayName = root.querySelector('[name="displayName"]') as HTMLInputElement | null;
      const mode = root.querySelector('[name="mode"]') as HTMLSelectElement | null;
      if (status) status.textContent = this.creating
        ? '状态：正在提交并重新读取核对（不可取消）。'
        : result ? `状态：${result.status}` : '尚未生成。';
      const messages = (result?.diagnostics ?? []).map((entry) => `[${entry.severity}] ${entry.code}: ${entry.message}`);
      if (diagnostics) diagnostics.hidden = messages.length === 0;
      if (diagnosticList) diagnosticList.innerHTML = messages.map((message) => `<li>${escapeHtml(message)}</li>`).join('');
      if (preview) preview.hidden = !result;
      if (previewText) previewText.textContent = result
        ? JSON.stringify({ item: result.itemDocument, verification: result.itemVerification }, null, 2)
        : '';
      if (json) json.textContent = result && 'artifact' in result ? JSON.stringify(result.artifact, null, 2) : '';
      if (finalSource) finalSource.textContent = this.response && 'result' in this.response
        ? JSON.stringify(this.response.result.sourceIdentity, null, 2)
        : '';
      if (generate) generate.disabled = Boolean(this.controller || this.creating);
      if (cancel) cancel.disabled = this.creating || !this.controller;
      if (source) source.disabled = this.creating;
      if (displayName) displayName.disabled = this.creating;
      if (mode) mode.disabled = this.creating;
      if (create) create.disabled = this.creating
        || !snapshotCurrent
        || !isItemApplyable(this.response)
        || !isCurrentItemGmRuntime(environment.game);
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

function isItemApplyable(response?: ForgeItemResponse): boolean {
  if (!response) return false;
  const decoded = decodeForgeItemResponse(response);
  if (!decoded.ok || !('result' in decoded.value)) return false;
  const result = decoded.value.result;
  return result.status === 'accepted'
    && result.verification.status === 'accepted'
    && Boolean(result.artifact && result.artifactHash)
    && !result.diagnostics.some((entry) => entry.severity === 'warning' || entry.severity === 'error')
    && result.target.fvttRuntimeVersion === EXPECTED_FOUNDRY_VERSION
    && result.target.generatorProfile === 'v14'
    && result.target.systemId === 'dnd5e'
    && result.target.systemVersionObserved === EXPECTED_SYSTEM_VERSION
    && result.target.effectProfile === 'core'
    && result.target.iconMode === 'off';
}

function assertItemResponseMatchesRequest(response: ForgeItemResponse, request: ForgeItemRequest): void {
  if (response.requestId !== request.requestId) throw new Error('Forge Item response requestId does not match the active generation.');
  if (!('result' in response)) return;
  if (
    response.result.sourceIdentity.sourceId !== request.source.sourceId
    || response.result.sourceIdentity.sourceHash !== request.source.utf8Sha256
  ) {
    throw new Error('Forge Item response source identity does not match the active final source.');
  }
}

function isCurrentItemGmRuntime(game: any): boolean {
  try {
    assertGm(game);
    assertExactRuntime(game);
    return true;
  } catch {
    return false;
  }
}

function readSnapshot(root: HTMLElement): ItemPreviewSnapshot {
  return {
    source: inputValue(root, 'source'),
    displayName: inputValue(root, 'displayName').trim(),
    mode: inputValue(root, 'mode').trim(),
  };
}

function sameSnapshot(left: ItemPreviewSnapshot, right: ItemPreviewSnapshot): boolean {
  return left.source === right.source && left.displayName === right.displayName && left.mode === right.mode;
}

function inputValue(root: HTMLElement, name: string): string {
  const element = root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  return element?.value ?? '';
}

function claimItemGeneration(owner: object): boolean {
  if (activeItemGenerationOwners.has(owner)) return true;
  if (activeItemGenerationOwners.size >= BROWSER_MAX_CONCURRENT_ACTOR_JOBS) return false;
  activeItemGenerationOwners.add(owner);
  return true;
}

function releaseItemGeneration(owner: object): void {
  activeItemGenerationOwners.delete(owner);
}

function randomRequestId(): string {
  return `forge-item-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function itemMessageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replaceAll('Forge Actor', 'Forge Item');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}
