import {
  discoverForgeProviderModels,
  FORGE_PROVIDER_PRESETS,
  getForgeProviderPreset,
  normalizeBaseUrlIdentity,
  normalizeForgeProviderConnection,
  resolveForgeProviderCapabilities,
  testForgeProviderConnection,
  type ForgeProviderAuthScheme,
  type ForgeProviderId,
  type ForgeProviderProtocol,
  type ForgeProviderReasoning,
  type ForgeStructuredOutputMode,
} from '@fvtt-json-generator/forge-browser-runtime/provider-connections';
import {
  assertExactRuntime,
  assertGm,
} from './runtime';
import {
  invalidateForgeSessionConnectionTest,
  clearAllForgeSessionApiKeys,
  isForgeSessionConnectionReady,
  markForgeSessionConnectionTested,
  readForgeSessionSettings,
  saveForgeSessionSettings,
  subscribeForgeSessionSettings,
  type ForgeClientSettings,
} from './settings';
import { mountForgeModelPicker } from './modelPicker';

export interface ForgeConnectionApplicationEnvironment {
  game: any;
  ui?: any;
  foundry?: any;
  hooks?: { on?: (event: string, callback: (...args: any[]) => void) => unknown; off?: (event: string, id: unknown) => void };
  services?: Partial<ForgeConnectionApplicationServices>;
}

export interface ForgeConnectionApplicationServices {
  testForgeProviderConnection: typeof testForgeProviderConnection;
  discoverForgeProviderModels: typeof discoverForgeProviderModels;
}

const DEFAULT_SERVICES: ForgeConnectionApplicationServices = {
  testForgeProviderConnection,
  discoverForgeProviderModels,
};

const PROVIDER_OPTIONS = FORGE_PROVIDER_PRESETS.map(preset => ({ value: preset.id, label: preset.label }));

export function createForgeConnectionApplicationClass(environment: ForgeConnectionApplicationEnvironment): any {
  const foundryGlobal = environment.foundry ?? (globalThis as any).foundry;
  const ApplicationV2 = foundryGlobal?.applications?.api?.ApplicationV2;
  const HandlebarsApplicationMixin = foundryGlobal?.applications?.api?.HandlebarsApplicationMixin;
  if (!ApplicationV2 || typeof HandlebarsApplicationMixin !== 'function') {
    throw new Error('Foundry 14 ApplicationV2 and HandlebarsApplicationMixin are required.');
  }
  const Base = HandlebarsApplicationMixin(ApplicationV2);
  return class ForgeConnectionApplication extends Base {
    static DEFAULT_OPTIONS = {
      id: 'fvtt-json-forge-connection',
      classes: ['fvtt-json-forge', 'forge-connection-window'],
      position: { width: 680, height: 680 },
      window: { title: 'Forge · AI连接', resizable: true },
    };

    static PARTS = {
      form: { template: 'modules/fvtt-json-forge/templates/forge-connection.hbs' },
    };

    private settings: ForgeClientSettings = readForgeSessionSettings();
    private testing = false;
    private testController?: AbortController;
    private testRevision = 0;
    private testedDraftIdentity = '';
    private statusOverride?: { kind: 'success' | 'error' | 'info' | 'pending'; message: string };
    private modelPicker?: ReturnType<typeof mountForgeModelPicker>;
    private modelPickerRoot?: HTMLElement;
    private unsubscribeSession?: () => void;
    private readonly services: ForgeConnectionApplicationServices = { ...DEFAULT_SERVICES, ...(environment.services ?? {}) };

    async _prepareContext() {
      return {};
    }

    _onRender(_context: unknown, _options: unknown): void {
      const root = this.element as HTMLElement | undefined;
      if (!root) return;
      const form = root.querySelector<HTMLFormElement>('[data-connection-form]');
      if (form) form.onsubmit = event => event.preventDefault();
      this.settings = readForgeSessionSettings();
      if (!this.unsubscribeSession) {
        this.unsubscribeSession = subscribeForgeSessionSettings(() => {
          if (this.testing) return;
          const currentRoot = this.element as HTMLElement | undefined;
          if (!currentRoot) return;
          this.statusOverride = undefined;
          this.testedDraftIdentity = '';
          this.modelPicker?.reset();
          this.settings = readForgeSessionSettings();
          this.fillSettings(currentRoot);
          this.refreshProviderUi(currentRoot);
          this.renderStatus(currentRoot);
        });
      }
      this.fillSettings(root);
      this.bindInputEvents(root);
      if (this.modelPickerRoot !== root.querySelector('[data-model-field]')) {
        this.modelPicker?.reset();
        this.modelPickerRoot = root.querySelector<HTMLElement>('[data-model-field]') ?? undefined;
        this.modelPicker = mountForgeModelPicker(root, signal => this.loadModels(root, signal));
      }
      this.bind(root, 'test-connection', () => void this.testConnection(root));
      this.bind(root, 'save', () => this.save(root));
      this.bind(root, 'toggle-key', () => this.toggleSecret(root, 'apiKey', 'toggle-key'));
      this.bind(root, 'toggle-endpoint', () => this.toggleEndpoint(root));
      this.bind(root, 'clear-key', () => this.clearKey(root));
      this.bind(root, 'clear-all-keys', () => this.clearAllKeys(root));
      this.refreshProviderUi(root);
      this.renderStatus(root);
    }

    async close(options?: unknown): Promise<unknown> {
      this.modelPicker?.reset();
      this.testController?.abort();
      this.testController = undefined;
      this.testing = false;
      this.testRevision += 1;
      const root = this.element as HTMLElement | undefined;
      if (root) this.renderStatus(root);
      this.unsubscribeSession?.();
      this.unsubscribeSession = undefined;
      return super.close(options);
    }

    private bindInputEvents(root: HTMLElement): void {
      const fields = ['provider', 'model', 'apiKey', 'endpoint', 'protocol', 'authScheme', 'region', 'reasoning', 'structuredOutput', 'autoCorrect'];
      for (const name of fields) {
        const input = root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement | null;
        if (!input) continue;
        const eventName = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
        const handler = () => {
          if (this.testing) return;
          if (name === 'provider') {
            this.applyProviderDefaults(root);
          }
          if (['provider', 'endpoint', 'protocol', 'authScheme', 'region'].includes(name)) {
            // Credentials belong to a provider profile. A field edit that
            // changes that profile must never silently reuse the old key.
            const key = root.querySelector('[name="apiKey"]') as HTMLInputElement | null;
            if (key) key.value = '';
          }
          if (['provider', 'endpoint', 'protocol', 'authScheme', 'region', 'apiKey'].includes(name)) this.modelPicker?.reset();
          this.invalidateDraft(root);
          this.refreshProviderUi(root);
          this.renderStatus(root);
        };
        if (eventName === 'change') input.onchange = handler;
        else input.oninput = handler;
      }
    }

    private applyProviderDefaults(root: HTMLElement): void {
      const provider = inputValue(root, 'provider') as ForgeProviderId;
      const preset = getForgeProviderPreset(provider);
      const endpoint = root.querySelector('[name="endpoint"]') as HTMLInputElement | null;
      const protocol = root.querySelector('[name="protocol"]') as HTMLSelectElement | null;
      const authScheme = root.querySelector('[name="authScheme"]') as HTMLSelectElement | null;
      const region = root.querySelector('[name="region"]') as HTMLSelectElement | null;
      const model = root.querySelector('[name="model"]') as HTMLInputElement | null;
      if (endpoint) {
        endpoint.value = preset.regions?.[0]?.baseUrl ?? preset.defaultBaseUrl;
        endpoint.dataset.forgeEndpointOverride = 'false';
      }
      if (protocol) protocol.value = preset.defaultProtocol;
      if (authScheme) authScheme.value = preset.authSchemes[0] ?? 'bearer';
      if (region) region.value = preset.regions?.[0]?.id ?? '';
      if (model) model.value = '';
    }

    private invalidateDraft(root: HTMLElement): void {
      this.testedDraftIdentity = '';
      this.statusOverride = undefined;
      this.testRevision += 1;
      if (isForgeSessionConnectionReady() && sameConnection(readConnectionForm(root), readForgeSessionSettings())) {
        invalidateForgeSessionConnectionTest();
      }
    }

    private async loadModels(root: HTMLElement, signal: AbortSignal): ReturnType<typeof discoverForgeProviderModels> {
      try {
        assertGm(environment.game);
        assertExactRuntime(environment.game);
        const form = readConnectionForm(root);
        const preset = getForgeProviderPreset(form.providerId);
        const publicCatalog = form.providerId === 'openrouter'
          && normalizeBaseUrlIdentity(form.endpoint) === preset.defaultBaseUrl;
        if (!publicCatalog && !form.apiKey && form.authScheme !== 'none') {
          return { status: 'authentication', models: [], message: '填入 API Key 后可刷新列表，也可直接填写模型 ID。' };
        }
        const connection = normalizeForgeProviderConnection({
          providerId: form.providerId, baseUrl: form.endpoint, protocol: form.protocol,
          authScheme: form.authScheme, region: form.region, apiKey: form.apiKey,
        });
        return await this.services.discoverForgeProviderModels(connection, { signal });
      } catch {
        return { status: 'configuration', models: [], message: '请检查 Provider、区域和 HTTPS 地址后再刷新列表。' };
      }
    }

    private async testConnection(root: HTMLElement): Promise<void> {
      if (this.testing) return;
      try {
        assertGm(environment.game);
        assertExactRuntime(environment.game);
      } catch (error) {
        this.setStatus(root, 'error', messageOf(error));
        return;
      }
      const form = readConnectionForm(root);
      const identity = connectionIdentity(form);
      const revision = ++this.testRevision;
      const controller = new AbortController();
      this.testController = controller;
      this.testing = true;
      this.modelPicker?.close();
      this.renderStatus(root);
      try {
        const result = await this.services.testForgeProviderConnection({
          providerId: form.providerId,
          baseUrl: form.endpoint,
          protocol: form.protocol,
          authScheme: form.authScheme,
          region: form.region,
          model: form.model,
          reviewModel: form.reviewModel,
          useSeparateReviewModel: form.useSeparateReviewModel,
          reasoning: form.reasoning,
          structuredOutput: form.structuredOutput,
          apiKey: form.apiKey,
        }, { signal: controller.signal, loadModels: false });
        if (this.testController !== controller || this.testRevision !== revision) return;
        if (identity !== connectionIdentity(readConnectionForm(root))) {
          this.testedDraftIdentity = '';
          this.setStatus(root, 'info', '测试期间配置发生变化；本次结果已丢弃，请重新测试当前配置。');
          return;
        }
        if (result.status === 'connected') {
          this.testedDraftIdentity = identity;
          const current = readForgeSessionSettings();
          if (sameConnection(form, current)) markForgeSessionConnectionTested();
          this.setStatus(root, 'success', sameConnection(form, current)
            ? '连接测试通过，当前配置已验证，可供 Forge Intake 使用。'
            : '连接测试通过；请点击“保存配置”后供其他 Forge 窗口使用。');
          environment.ui?.notifications?.info?.(result.message);
        } else {
          this.testedDraftIdentity = '';
          const current = readForgeSessionSettings();
          if (sameConnection(form, current)) invalidateForgeSessionConnectionTest();
          this.setStatus(root, 'error', result.message);
          environment.ui?.notifications?.error?.(result.message);
        }
      } catch (error) {
        if (this.testController !== controller || this.testRevision !== revision) return;
        this.testedDraftIdentity = '';
        const current = readForgeSessionSettings();
        if (sameConnection(form, current)) invalidateForgeSessionConnectionTest();
        this.setStatus(root, 'error', messageOf(error));
        environment.ui?.notifications?.error?.(messageOf(error));
      } finally {
        if (this.testController === controller) {
          this.testController = undefined;
          this.testing = false;
          this.refreshProviderUi(root);
          this.renderStatus(root);
        }
      }
    }

    private save(root: HTMLElement): void {
      try {
        assertGm(environment.game);
        assertExactRuntime(environment.game);
        const form = readConnectionForm(root);
        const testedDraftMatches = this.testedDraftIdentity === connectionIdentity(form);
        const saved = saveForgeSessionSettings(form);
        this.settings = saved;
        if (testedDraftMatches && connectionIdentity(saved) === connectionIdentity(form)) {
          markForgeSessionConnectionTested();
          this.setStatus(root, 'success', '配置已保存，连接测试仍然有效；Forge Intake 可以直接使用。');
        } else {
          this.testedDraftIdentity = '';
          this.setStatus(root, 'info', '配置已保存。请测试当前连接后再开始 AI Intake。');
        }
        this.fillSettings(root);
        this.refreshProviderUi(root);
        this.renderStatus(root);
        environment.ui?.notifications?.info?.('Forge AI 连接配置已保存。');
      } catch (error) {
        this.setStatus(root, 'error', messageOf(error));
        environment.ui?.notifications?.error?.(messageOf(error));
      }
    }

    private clearKey(root: HTMLElement): void {
      if (this.testing) return;
      const saved = saveForgeSessionSettings({ apiKey: '', persistApiKey: false });
      this.settings = saved;
      this.testedDraftIdentity = '';
      invalidateForgeSessionConnectionTest();
      this.fillSettings(root);
      this.renderStatus(root);
      environment.ui?.notifications?.info?.('当前 API Key 已清除。');
    }

    private clearAllKeys(root: HTMLElement): void {
      if (this.testing) return;
      const saved = clearAllForgeSessionApiKeys();
      this.settings = saved;
      this.testedDraftIdentity = '';
      invalidateForgeSessionConnectionTest();
      this.fillSettings(root);
      this.renderStatus(root);
      environment.ui?.notifications?.info?.('所有已保存 API Key 已清除。');
    }

    private toggleSecret(root: HTMLElement, name: string, action: string): void {
      const input = root.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
      const button = root.querySelector(`[data-action="${action}"]`) as HTMLButtonElement | null;
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      if (button) {
        const label = input.type === 'password' ? '显示' : '隐藏';
        button.textContent = label;
        button.setAttribute('aria-label', label + ' API Key');
      }
    }

    private toggleEndpoint(root: HTMLElement): void {
      const endpoint = root.querySelector('[name="endpoint"]') as HTMLInputElement | null;
      const button = root.querySelector('[data-action="toggle-endpoint"]') as HTMLButtonElement | null;
      const provider = inputValue(root, 'provider') as ForgeProviderId;
      if (!endpoint) return;
      const enabled = endpoint.dataset.forgeEndpointOverride === 'true';
      const nextOverride = !enabled;
      endpoint.dataset.forgeEndpointOverride = nextOverride ? 'true' : 'false';
      endpoint.readOnly = provider !== 'custom' && !nextOverride;
      if (!nextOverride && provider !== 'custom') {
        const preset = getForgeProviderPreset(provider);
        endpoint.value = preset.regions?.find(region => region.id === inputValue(root, 'region'))?.baseUrl ?? preset.defaultBaseUrl;
      }
      if (button) button.textContent = endpoint.readOnly ? '自定义 endpoint' : '使用官方 endpoint';
      const key = root.querySelector('[name="apiKey"]') as HTMLInputElement | null;
      if (key) key.value = '';
      this.modelPicker?.reset();
      this.invalidateDraft(root);
      this.renderStatus(root);
    }

    private fillSettings(root: HTMLElement): void {
      const settings = this.settings;
      setValue(root, 'provider', settings.providerId);
      setValue(root, 'model', settings.model);
      setValue(root, 'apiKey', settings.apiKey);
      setChecked(root, 'persistApiKey', settings.persistApiKey);
      setChecked(root, 'autoCorrect', settings.autoCorrect);
      setValue(root, 'endpoint', settings.endpoint);
      const endpoint = root.querySelector<HTMLInputElement>('[name="endpoint"]');
      if (endpoint) delete endpoint.dataset.forgeEndpointOverride;
      setValue(root, 'protocol', settings.protocol);
      setValue(root, 'authScheme', settings.authScheme);
      setValue(root, 'region', settings.region);
      setValue(root, 'reasoning', settings.reasoning);
      setValue(root, 'structuredOutput', settings.structuredOutput);
    }

    private refreshProviderUi(root: HTMLElement): void {
      const provider = inputValue(root, 'provider') as ForgeProviderId;
      const preset = getForgeProviderPreset(provider);
      const model = inputValue(root, 'model');
      const protocol = inputValue(root, 'protocol') as ForgeProviderProtocol || preset.defaultProtocol;
      const capabilities = resolveForgeProviderCapabilities(provider, protocol, model);
      populateSelect(root, 'provider', PROVIDER_OPTIONS, provider, false);
      populateSelect(root, 'protocol', preset.protocols.map((value) => ({ value, label: protocolLabel(value) })), protocol, false);
      populateSelect(root, 'authScheme', preset.authSchemes.map((value) => ({ value, label: authSchemeLabel(value) })), inputValue(root, 'authScheme'), false);
      populateSelect(root, 'region', (preset.regions ?? []).map((value) => ({ value: value.id, label: value.label })), inputValue(root, 'region'), true, '默认');
      populateSelect(root, 'reasoning', capabilities.reasoning.map((value) => ({ value, label: value === 'auto' ? 'Auto' : value })), inputValue(root, 'reasoning') || 'auto', false);
      populateSelect(root, 'structuredOutput', capabilities.structuredOutput.map((value) => ({ value, label: structuredOutputLabel(value) })), inputValue(root, 'structuredOutput'), false);
      const endpoint = root.querySelector('[name="endpoint"]') as HTMLInputElement | null;
      const endpointToggle = root.querySelector('[data-action="toggle-endpoint"]') as HTMLButtonElement | null;
      const regionalEndpoint = preset.regions?.find(region => region.id === inputValue(root, 'region'))?.baseUrl ?? preset.defaultBaseUrl;
      if (endpoint && provider !== 'custom') {
        const override = endpoint.dataset.forgeEndpointOverride ?? String(Boolean(endpoint.value.trim())
          && ![preset.defaultBaseUrl, ...(preset.regions ?? []).map(region => region.baseUrl)]
            .some(base => normalizeBaseUrlIdentity(base) === normalizeBaseUrlIdentity(endpoint.value)));
        endpoint.dataset.forgeEndpointOverride = override;
        endpoint.readOnly = override !== 'true';
        if (endpoint.readOnly) endpoint.value = regionalEndpoint;
      } else if (endpoint) {
        endpoint.readOnly = false;
      }
      if (endpointToggle) endpointToggle.textContent = endpoint?.readOnly ? '自定义 endpoint' : '使用官方 endpoint';
      const docs = root.querySelector('[data-provider-docs]') as HTMLAnchorElement | null;
      if (docs) {
        docs.hidden = !preset.docsUrl;
        if (preset.docsUrl) docs.href = preset.docsUrl;
        else docs.removeAttribute?.('href');
      }
      if (endpointToggle) endpointToggle.hidden = provider === 'custom';
      const modelHelp = root.querySelector<HTMLElement>('#forge-model-help');
      if (modelHelp) {
        const publicCatalog = provider === 'openrouter' && normalizeBaseUrlIdentity(endpoint?.value ?? '') === preset.defaultBaseUrl;
        modelHelp.textContent = publicCatalog || inputValue(root, 'authScheme') === 'none'
          ? '打开下拉查询模型，也可以直接填入模型 ID。'
          : '输入 API Key 后可查询模型，也可以直接填入模型 ID。';
      }
    }

    private renderStatus(root: HTMLElement): void {
      const status = root.querySelector('[data-connection-status]') as HTMLElement | null;
      const save = root.querySelector('[data-action="save"]') as HTMLButtonElement | null;
      const test = root.querySelector('[data-action="test-connection"]') as HTMLButtonElement | null;
      const current = readForgeSessionSettings();
      const form = readConnectionForm(root);
      const same = sameConnection(form, current);
      const ready = same && isForgeSessionConnectionReady();
      if (status && !this.testing) {
        if (this.statusOverride) setStatusElement(status, this.statusOverride.kind, this.statusOverride.message);
        else if (ready) setStatusElement(status, 'success', '连接已验证，可供 Forge Intake 使用。');
        else if (this.testedDraftIdentity === connectionIdentity(form)) setStatusElement(status, 'success', same
          ? '连接测试通过，点击“保存配置”后供其他 Forge 窗口使用。'
          : '连接测试通过；当前配置尚未保存。');
        else if (form.authScheme !== 'none' && !form.apiKey) setStatusElement(status, 'info', '输入 API Key 后，选择或填写模型 ID。');
        else if (!form.model.trim()) setStatusElement(status, 'info', '选择或填写模型 ID，再保存并测试连接。');
        else if (!same) setStatusElement(status, 'info', '配置尚未保存，可先测试，也可保存后再测试。');
        else setStatusElement(status, 'info', '尚未测试当前连接。');
      } else if (status && this.testing) {
        setStatusElement(status, 'pending', '正在测试连接并验证结构化输出…');
      }
      if (save) save.disabled = this.testing || !form.model.trim();
      if (test) test.disabled = this.testing || !form.model.trim() || (form.authScheme !== 'none' && !form.apiKey);
      for (const name of ['provider', 'model', 'apiKey', 'endpoint', 'protocol', 'authScheme', 'region', 'reasoning', 'structuredOutput', 'persistApiKey', 'autoCorrect']) {
        const input = root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement | null;
        if (input) input.disabled = this.testing;
      }
      for (const action of ['toggle-key', 'toggle-endpoint', 'clear-key', 'clear-all-keys']) {
        const button = root.querySelector(`[data-action="${action}"]`) as HTMLButtonElement | null;
        if (button) button.disabled = this.testing;
      }
      this.modelPicker?.draw();
    }

    private setStatus(root: HTMLElement, kind: 'success' | 'error' | 'info' | 'pending', message: string): void {
      const status = root.querySelector('[data-connection-status]') as HTMLElement | null;
      this.statusOverride = { kind, message };
      if (status) setStatusElement(status, kind, message);
    }

    private bind(root: HTMLElement, action: string, handler: () => void): void {
      const elements = typeof (root as any).querySelectorAll === 'function'
        ? root.querySelectorAll(`[data-action="${action}"]`)
        : [root.querySelector(`[data-action="${action}"]`)].filter(Boolean);
      for (const element of elements) (element as HTMLElement).onclick = handler;
    }
  };
}

function readConnectionForm(root: HTMLElement): ForgeClientSettings {
  const providerId = (inputValue(root, 'provider') || 'openai') as ForgeProviderId;
  const preset = getForgeProviderPreset(providerId);
  return {
    ...readForgeSessionSettings(),
    providerId,
    endpoint: inputValue(root, 'endpoint'),
    protocol: (inputValue(root, 'protocol') || preset.defaultProtocol) as ForgeProviderProtocol,
    authScheme: (inputValue(root, 'authScheme') || preset.authSchemes[0] || 'bearer') as ForgeProviderAuthScheme,
    region: inputValue(root, 'region'),
    reasoning: (inputValue(root, 'reasoning') || 'auto') as ForgeProviderReasoning,
    structuredOutput: (inputValue(root, 'structuredOutput') || 'prompt_fallback') as ForgeStructuredOutputMode,
    autoCorrect: checkedValue(root, 'autoCorrect'),
    useSeparateReviewModel: false,
    model: inputValue(root, 'model'),
    reviewModel: inputValue(root, 'model'),
    apiKey: inputValue(root, 'apiKey'),
    persistApiKey: checkedValue(root, 'persistApiKey'),
  };
}

function connectionIdentity(value: Pick<ForgeClientSettings, 'providerId' | 'endpoint' | 'protocol' | 'authScheme' | 'region' | 'reasoning' | 'structuredOutput' | 'autoCorrect' | 'useSeparateReviewModel' | 'model' | 'reviewModel' | 'apiKey'>): string {
  try {
    const normalized = normalizeForgeProviderConnection({
      providerId: value.providerId,
      baseUrl: value.endpoint,
      protocol: value.protocol,
      authScheme: value.authScheme,
      region: value.region,
      reasoning: value.reasoning,
      structuredOutput: value.structuredOutput,
      useSeparateReviewModel: value.useSeparateReviewModel,
      model: value.model,
      reviewModel: value.reviewModel,
      apiKey: value.apiKey,
    });
    return JSON.stringify({
      providerId: normalized.providerId,
      endpoint: normalized.endpointIdentity,
      protocol: normalized.protocol,
      authScheme: normalized.authScheme,
      region: normalized.region,
      reasoning: normalized.reasoning,
      structuredOutput: normalized.structuredOutput,
      autoCorrect: value.autoCorrect,
      useSeparateReviewModel: normalized.useSeparateReviewModel,
      model: normalized.model,
      reviewModel: normalized.reviewModel,
      apiKey: normalized.apiKey,
    });
  } catch {
    return JSON.stringify({
      providerId: value.providerId,
      endpoint: value.endpoint.trim(),
      protocol: value.protocol,
      authScheme: value.authScheme,
      region: value.region.trim(),
      reasoning: value.reasoning,
      structuredOutput: value.structuredOutput,
      autoCorrect: value.autoCorrect,
      useSeparateReviewModel: value.useSeparateReviewModel,
      model: value.model.trim(),
      reviewModel: value.reviewModel.trim(),
      apiKey: value.apiKey,
    });
  }
}

function sameConnection(left: ForgeClientSettings, right: ForgeClientSettings): boolean {
  return connectionIdentity(left) === connectionIdentity(right);
}

function inputValue(root: HTMLElement, name: string): string {
  const input = root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  return input?.value ?? '';
}

function checkedValue(root: HTMLElement, name: string): boolean {
  return (root.querySelector(`[name="${name}"]`) as HTMLInputElement | null)?.checked === true;
}

function setValue(root: HTMLElement, name: string, value: string): void {
  const input = root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement | null;
  if (input && input.value !== value) input.value = value;
}

function setChecked(root: HTMLElement, name: string, value: boolean): void {
  const input = root.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
  if (input) input.checked = value;
}

function populateSelect(
  root: HTMLElement,
  name: string,
  options: readonly { value: string; label: string }[],
  preferred: string,
  allowEmpty: boolean,
  emptyLabel = '默认',
): void {
  const select = root.querySelector(`[name="${name}"]`) as HTMLSelectElement | null;
  if (!select) return;
  const document = (globalThis as any).document as Document | undefined;
  if (!document?.createElement || typeof (select as any).replaceChildren !== 'function') return;
  const choices = allowEmpty ? [{ value: '', label: emptyLabel }, ...options] : [...options];
  select.replaceChildren(...choices.map((entry) => {
    const option = document.createElement('option');
    option.value = entry.value;
    option.textContent = entry.label;
    return option;
  }));
  select.value = choices.some((entry) => entry.value === preferred) ? preferred : (choices[0]?.value ?? '');
}

function setStatusElement(element: HTMLElement, kind: string, message: string): void {
  element.textContent = message;
  element.dataset.statusKind = kind;
  element.setAttribute('aria-busy', kind === 'pending' ? 'true' : 'false');
}

function protocolLabel(protocol: ForgeProviderProtocol): string {
  if (protocol === 'openai-chat') return 'OpenAI Chat Completions';
  if (protocol === 'openai-responses') return 'OpenAI Responses API';
  return 'Anthropic Messages';
}

function authSchemeLabel(value: ForgeProviderAuthScheme): string {
  if (value === 'x-api-key') return 'x-api-key';
  if (value === 'api-key') return 'api-key';
  if (value === 'none') return '无需认证';
  return 'Bearer';
}

function structuredOutputLabel(value: ForgeStructuredOutputMode): string {
  if (value === 'json_schema') return 'JSON Schema';
  if (value === 'json_object') return 'JSON Object';
  if (value === 'provider_schema') return 'Provider Schema';
  return '严格 Prompt JSON fallback';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
