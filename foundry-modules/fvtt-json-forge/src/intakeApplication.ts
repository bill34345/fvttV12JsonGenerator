import {
  BROWSER_GENERATOR_VERSION,
  buildForgeActorRequest,
  convertFinalActorSource,
} from '@fvtt-json-generator/forge-browser-runtime';
import {
  analyzeBrowserActorSourceWithAi,
  BROWSER_AI_WAIT_CYCLE_MS,
  BROWSER_AI_WAIT_CYCLES_BEFORE_DECISION,
  createBrowserAiProvider,
  generateAndReviewBrowserActorIntake,
  repairBrowserActorIntake,
  type BrowserActorGenerationResult,
  type BrowserActorIntakeAnalysis,
  type IntakeProviderActivity,
  type IntakeRequestWaitStatus,
} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {
  analyzeBrowserItemSourceWithAi,
  createBrowserItemAiProvider,
  generateAndReviewBrowserItemIntake,
  repairBrowserItemIntake,
  type BrowserItemGenerationResult,
  type BrowserItemIntakeAnalysis,
} from '@fvtt-json-generator/forge-browser-runtime/item-intake';
import { analyzePlaintextActorSource, type BrowserPlaintextActorAnalysis } from '@fvtt-json-generator/forge-browser-runtime/plaintext';
import {
  createForgeIntakeSnapshot,
  sameForgeIntakeSnapshot,
  transitionForgeIntakeReviewStatus,
  type ForgeIntakeMode,
  type ForgeIntakeReviewBundleInput,
  type ForgeIntakeReviewStatus,
  type ForgeIntakeSnapshot,
} from '@fvtt-json-generator/forge-browser-runtime/intake-review';
import {
  FORGE_INTAKE_REVIEW_BUNDLE_MAX_UTF8_BYTES,
  buildForgeIntakeReviewBundleV2,
  createForgeIntakeRecoveryLineage,
  decodeForgeIntakeReviewBundleText,
  serializeForgeIntakeReviewBundleV2,
  type ForgeIntakeReviewBundleV2,
  type ForgeIntakeReviewRecoveryLineage,
  type ImportedForgeIntakeReviewRecord,
} from '@fvtt-json-generator/forge-browser-runtime/intake-review-import';
import {
  FORGE_SOURCE_LIBRARY_MAX_UTF8_BYTES,
  ManagedForgeSourceLibrary,
  assertConfiguredSecretsAbsent,
  importedReviewFromLibrary,
  searchForgeSourceLibrary,
  serializeForgeSourceLibrary,
  serializeForgeSourceLibrarySource,
  type ForgeSourceLibraryV1,
} from '@fvtt-json-generator/forge-browser-runtime/source-library';
import { IndexedDbForgeSourceLibraryStore } from '@fvtt-json-generator/forge-browser-runtime/source-library-indexed-db';
import {
  FORGE_BATCH_COLLECTION_MAX_ZIP_BYTES,
  decodeForgeBatchCollectionText,
  decodeForgeBatchCollectionZip,
  encodeForgeBatchCollectionZip,
  type ForgeBatchCollectionV1,
} from '@fvtt-json-generator/forge-browser-runtime/batch-collection';
import {
  ManagedForgeBatchQueue,
  batchQueueEntry,
  createForgeBatchApplyManifest,
  decodeForgeBatchQueueText,
  serializeForgeBatchQueue,
  type ForgeBatchApplyCandidate,
  type ForgeBatchQueueV1,
  type ForgeBatchJobV1,
} from '@fvtt-json-generator/forge-browser-runtime/batch-queue';
import { IndexedDbForgeBatchQueueStore } from '@fvtt-json-generator/forge-browser-runtime/batch-queue-indexed-db';
import {
  decodeForgeActorResponse,
  decodeForgeItemResponse,
  hashArtifact,
  type ForgeActorResponse,
  type ForgeItemResponse,
} from '@fvtt-json-generator/forge-gateway-protocol';
import { buildForgeItemRequest, convertFinalItemSource } from '@fvtt-json-generator/forge-browser-runtime';
import { claimForgeAiJob, releaseForgeAiJob } from './aiJobGate';
import { createAcceptedForgeItem } from './itemRuntime';
import {
  assertExactRuntime,
  assertGm,
  createAcceptedForgeActor,
  EXPECTED_FOUNDRY_VERSION,
  EXPECTED_SYSTEM_VERSION,
} from './runtime';
import {
  clearApiKey,
  clientSettingsProfileId,
  readClientSettings,
  saveClientSettings,
  clearAllApiKeys,
  type ForgeClientSettings,
} from './settings';
import {
  getForgeProviderPreset,
  inferForgeProviderId,
  normalizeForgeProviderConnection,
  resolveForgeProviderCapabilities,
  testForgeProviderConnection,
  type ForgeProviderConnectionStatus,
  type ForgeProviderId,
  type ForgeProviderProtocol,
  type ForgeProviderReasoning,
  type ForgeStructuredOutputMode,
} from '@fvtt-json-generator/forge-browser-runtime/provider-connections';

type IntakeAnalysis = BrowserPlaintextActorAnalysis | BrowserActorIntakeAnalysis | BrowserItemIntakeAnalysis;
type IntakeGeneration = BrowserActorGenerationResult | BrowserItemGenerationResult | PlaintextGenerationResult;
type IntakeResponse = ForgeActorResponse | ForgeItemResponse;

interface PlaintextGenerationResult {
  status: 'accepted' | 'needs_review' | 'failed';
  finalSource?: string;
  finalSourceHash?: string;
  response?: ForgeActorResponse;
  findings: Array<{ id: string; code: string; path: string; message: string; blocking: boolean; origin: string; evidence?: Array<{ start: number; end: number; quote: string }> }>;
}

interface ReviewHistoryEntry {
  sequence: number;
  action: 'reject' | 'repair' | 'regenerate';
  attemptId: string;
  resultingStatus: ForgeIntakeReviewStatus;
}

export interface ForgeIntakeApplicationEnvironment {
  game: any;
  ui?: any;
  foundry?: any;
  window?: { addEventListener?: (event: string, callback: (event: any) => void) => void; removeEventListener?: (event: string, callback: (event: any) => void) => void };
  hooks?: { on?: (event: string, callback: (...args: any[]) => void) => unknown; off?: (event: string, id: unknown) => void };
  services?: Partial<ForgeIntakeApplicationServices>;
  sourceLibrary?: ManagedForgeSourceLibrary;
  batchQueue?: ManagedForgeBatchQueue;
}

export interface ForgeIntakeApplicationServices {
  analyzePlaintextActorSource: typeof analyzePlaintextActorSource;
  analyzeBrowserActorSourceWithAi: typeof analyzeBrowserActorSourceWithAi;
  repairBrowserActorIntake: typeof repairBrowserActorIntake;
  generateAndReviewBrowserActorIntake: typeof generateAndReviewBrowserActorIntake;
  createBrowserAiProvider: typeof createBrowserAiProvider;
  analyzeBrowserItemSourceWithAi: typeof analyzeBrowserItemSourceWithAi;
  repairBrowserItemIntake: typeof repairBrowserItemIntake;
  generateAndReviewBrowserItemIntake: typeof generateAndReviewBrowserItemIntake;
  createBrowserItemAiProvider: typeof createBrowserItemAiProvider;
  testForgeProviderConnection: typeof testForgeProviderConnection;
  convertFinalActorSource: typeof convertFinalActorSource;
  convertFinalItemSource: typeof convertFinalItemSource;
  createAcceptedForgeActor: typeof createAcceptedForgeActor;
  createAcceptedForgeItem: typeof createAcceptedForgeItem;
  readReviewBundleFile(file: File): Promise<string>;
  downloadReviewBundle(fileName: string, content: string): void;
  downloadBinaryFile(fileName: string, content: Uint8Array, type: string): void;
}

const DEFAULT_SERVICES: ForgeIntakeApplicationServices = {
  analyzePlaintextActorSource,
  analyzeBrowserActorSourceWithAi,
  repairBrowserActorIntake,
  generateAndReviewBrowserActorIntake,
  createBrowserAiProvider,
  analyzeBrowserItemSourceWithAi,
  repairBrowserItemIntake,
  generateAndReviewBrowserItemIntake,
  createBrowserItemAiProvider,
  testForgeProviderConnection,
  convertFinalActorSource,
  convertFinalItemSource,
  createAcceptedForgeActor,
  createAcceptedForgeItem,
  readReviewBundleFile,
  downloadReviewBundle,
  downloadBinaryFile,
};

export function createForgeIntakeApplicationClass(environment: ForgeIntakeApplicationEnvironment): any {
  const foundryGlobal = environment.foundry ?? (globalThis as any).foundry;
  const ApplicationV2 = foundryGlobal?.applications?.api?.ApplicationV2;
  const HandlebarsApplicationMixin = foundryGlobal?.applications?.api?.HandlebarsApplicationMixin;
  if (!ApplicationV2 || typeof HandlebarsApplicationMixin !== 'function') throw new Error('Foundry 14 ApplicationV2 and HandlebarsApplicationMixin are required.');
  const Base = HandlebarsApplicationMixin(ApplicationV2);
  return class ForgeIntakeApplication extends Base {
    static DEFAULT_OPTIONS = {
      id: 'fvtt-json-forge-intake',
      classes: ['fvtt-json-forge', 'forge-intake-window'],
      position: { width: 900, height: 900 },
      window: { title: 'Forge Intake', resizable: true },
    };
    static PARTS = { form: { template: 'modules/fvtt-json-forge/templates/forge-intake.hbs' } };

    private status: ForgeIntakeReviewStatus = 'empty';
    private analysis?: IntakeAnalysis;
    private generation?: IntakeGeneration;
    private response?: IntakeResponse;
    private snapshot?: ForgeIntakeSnapshot;
    private reviewSource = '';
    private requestId = '';
    private attemptId = '';
    private attemptSequence = 0;
    private history: ReviewHistoryEntry[] = [];
    private staleFinding?: ReturnType<typeof staleFinding>;
    private stageProgress: Array<{ stage: string; status: string; message?: string }> = [];
    private controller?: AbortController;
    private revision = 0;
    private creating = false;
    private importing = false;
    private importRevision = 0;
    private importedReview?: ImportedForgeIntakeReviewRecord;
    private recoveredFrom?: ForgeIntakeReviewRecoveryLineage;
    private libraryState?: Readonly<ForgeSourceLibraryV1>;
    private libraryLoading = false;
    private libraryMutation = false;
    private libraryQuery = '';
    private libraryUnsubscribe?: () => void;
    private batchState?: Readonly<ForgeBatchQueueV1>;
    private batchLoading = false;
    private batchMutation = false;
    private batchRunning = false;
    private batchApplying = false;
    private batchStopRequested = false;
    private batchRecovered = false;
    private activeBatchJobId?: string;
    private batchUnsubscribe?: () => void;
    private readonly batchResponses = new Map<string, { mode: ForgeIntakeMode; rawSourceHash: ForgeIntakeSnapshot['rawSourceHash']; response: IntakeResponse }>();
    private settings: ForgeClientSettings = readClientSettings();
    private connectionProbe?: Awaited<ReturnType<typeof testForgeProviderConnection>>;
    private connectionProbeRevision = -1;
    private connectionProbeIdentity = '';
    private connectionCredentialRevision = 0;
    private providerActivity?: IntakeProviderActivity;
    private readonly services = { ...DEFAULT_SERVICES, ...(environment.services ?? {}) };
    private readonly ownsSourceLibrary = environment.sourceLibrary === undefined;
    private readonly sourceLibrary = environment.sourceLibrary ?? new ManagedForgeSourceLibrary(
      new IndexedDbForgeSourceLibraryStore(sourceLibraryScope(environment.game)),
    );
    private readonly ownsBatchQueue = environment.batchQueue === undefined;
    private readonly batchQueue = environment.batchQueue ?? new ManagedForgeBatchQueue(
      new IndexedDbForgeBatchQueueStore(sourceLibraryScope(environment.game)),
    );
    private readonly availabilityHooks: Array<{ event: string; id: unknown }> = [];
    private pageGuardRegistered = false;
    private readonly guardPageTeardown = (event: any) => {
      if (!this.creating && !this.batchApplying) return;
      event?.preventDefault?.();
      if (event) event.returnValue = '';
    };

    async _prepareContext() { return {}; }

    private aiProviderOptions(form: ReturnType<typeof readForm>, controller: AbortController) {
      return providerOptions(form, {
        cycleMs: BROWSER_AI_WAIT_CYCLE_MS,
        cyclesBeforeDecision: BROWSER_AI_WAIT_CYCLES_BEFORE_DECISION,
        onDecision: async (status: IntakeRequestWaitStatus) => {
          const decision = await this.promptAiWaitDecision(status);
          if (decision === 'stop' && this.controller === controller) this.cancel();
          return decision;
        },
      }, (activity) => {
        if (this.controller !== controller) return;
        this.providerActivity = activity;
        const root = this.element as HTMLElement | undefined;
        if (root) this.renderResult(root);
      });
    }

    private async promptAiWaitDecision(status: IntakeRequestWaitStatus): Promise<'continue' | 'stop'> {
      const dialog = foundryGlobal?.applications?.api?.DialogV2;
      if (!dialog?.wait) {
        this.notify('error', 'Foundry 14 DialogV2 不可用；当前请求不会被系统自动结束，将继续等待。');
        return 'continue';
      }
      const elapsed = formatDuration(status.elapsedMs);
      const sinceProgress = formatDuration(Math.max(0, Date.now() - status.lastObservableProgressAtMs));
      const httpState = status.responseHeadersReceived
        ? `已收到 HTTP ${status.httpStatus ?? '未知'} 响应头；响应正文尚未结束。`
        : 'HTTP 请求仍处于 pending；尚未收到响应头。';
      const activityState = status.providerActivity ?? status.aiActivity;
      const activityMessage = activityState === 'reported_reasoning'
        ? 'Provider 最近报告仍在推理。'
        : activityState === 'reported_output'
          ? 'Provider 最近报告仍在输出。'
          : activityState === 'reported_in_progress'
            ? 'Provider 已报告请求仍在处理。'
            : '请求尚未结束，远端活动未知。';
      const transportMessage = status.transport === 'stream_open'
        ? 'SSE stream 已打开。'
        : status.transport === 'pending'
          ? '浏览器尚未报告网络错误。'
          : `浏览器传输状态：${status.transport ?? '未知'}。`;
      let detachSettledClose: () => void = () => undefined;
      const choose = (decision: 'continue' | 'stop') => {
        detachSettledClose();
        return decision;
      };
      try {
        const result = await dialog.wait({
          window: { title: 'AI 请求仍在等待' },
          modal: true,
          rejectClose: false,
          content: `<p>当前请求已等待 ${elapsed}，完成 ${status.completedCycles} 个 180 秒观察周期（第 ${status.decisionRound} 次人工确认）。</p>
            <p><strong>请求状态：</strong>${httpState}</p>
            <p><strong>最近可观察进展：</strong>${sinceProgress} 前。</p>
            <p><strong>连接状态：</strong>${transportMessage}浏览器无法证明底层 TCP 一直存活。</p>
            <p><strong>Provider 活动：</strong>${activityMessage}浏览器无法证明远端模型是否仍在思考。${status.lastEventType ? ` 最近事件：${escapeHtml(status.lastEventType)}。` : ''}</p>
            <p>继续等待会保留同一个请求，不会重发。只有明确选择“结束请求”才会取消。</p>`,
          render: (_event: unknown, activeDialog: any) => {
            const close = () => { void activeDialog.close(); };
            detachSettledClose = () => status.requestSettledSignal.removeEventListener('abort', close);
            if (status.requestSettledSignal.aborted) close();
            else status.requestSettledSignal.addEventListener('abort', close, { once: true });
          },
          close: () => {
            detachSettledClose();
            return null;
          },
          buttons: [
            { action: 'continue', label: '继续等待', default: true, callback: () => choose('continue') },
            { action: 'stop', label: '结束请求', callback: () => choose('stop') },
          ],
        });
        return result === 'stop' ? 'stop' : 'continue';
      } catch {
        this.notify('error', 'AI 等待确认弹框失败；当前请求不会被系统自动结束，将继续等待。');
        return 'continue';
      } finally {
        detachSettledClose();
      }
    }

    _onRender(_context: unknown, _options: unknown) {
      const root = this.element as HTMLElement | undefined;
      if (!root) return;
      const invalidate = () => this.invalidateReview(root);
      const invalidateConnection = () => {
        this.connectionProbe = undefined;
        this.connectionProbeRevision = -1;
        this.connectionProbeIdentity = '';
        invalidate();
      };
      const connectionFields = new Set(['provider', 'endpoint', 'protocol', 'region', 'model', 'reviewModel', 'reasoning', 'structuredOutput', 'authScheme', 'useSeparateReviewModel']);
      for (const name of ['source', 'displayName', 'mode', 'provider', 'endpoint', 'protocol', 'region', 'model', 'reviewModel', 'reasoning', 'structuredOutput', 'authScheme', 'apiKey', 'useSeparateReviewModel']) {
        const input = root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        if (!input) continue;
        if (name === 'apiKey') input.oninput = () => { this.connectionCredentialRevision += 1; invalidateConnection(); };
        else if (name === 'endpoint') input.oninput = () => { input.dataset.forgeEndpointOverride = 'true'; invalidateConnection(); };
        else if (connectionFields.has(name)) input.onchange = invalidateConnection;
        else input.oninput = invalidate;
      }
      this.fillSettings(root);
      this.refreshAiVisibility(root);
      this.refreshProviderUi(root);
      const mode = root.querySelector('[name="mode"]') as HTMLSelectElement | null;
      if (mode) {
        mode.onchange = () => { this.refreshAiVisibility(root); this.invalidateReview(root); };
      }
      const provider = root.querySelector('[name="provider"]') as HTMLSelectElement | null;
      if (provider) provider.onchange = () => {
        invalidateConnection();
        this.refreshProviderUi(root, true);
        this.loadProviderProfileKey(root);
      };
      const protocol = root.querySelector('[name="protocol"]') as HTMLSelectElement | null;
      if (protocol) protocol.onchange = () => { invalidateConnection(); this.refreshProviderUi(root); };
      const region = root.querySelector('[name="region"]') as HTMLSelectElement | null;
      if (region) region.onchange = () => { invalidateConnection(); this.refreshProviderUi(root); };
      const model = root.querySelector('[name="model"]') as HTMLInputElement | null;
      if (model) model.oninput = () => { invalidateConnection(); this.refreshProviderUi(root); };
      this.bind(root, 'analyze', () => void this.analyze(root));
      this.bind(root, 'repair', () => void this.repair(root));
      this.bind(root, 'generate', () => void this.generate(root));
      this.bind(root, 'regenerate', () => void this.regenerate(root));
      this.bind(root, 'reject', () => this.reject(root));
      this.bind(root, 'cancel', () => this.cancel());
      this.bind(root, 'clear', () => this.clear(root));
      this.bind(root, 'export', () => this.exportBundle(root));
      this.bind(root, 'import', () => void this.importBundle(root));
      this.bind(root, 'start-new-attempt', () => this.startNewAttempt(root));
      this.bind(root, 'library-refresh', () => void this.refreshLibrary(root, true));
      this.bind(root, 'library-save', () => void this.saveToLibrary(root));
      this.bind(root, 'library-export', () => this.exportLibrary(root));
      this.bind(root, 'library-import', () => void this.importLibrary(root));
      this.bind(root, 'batch-refresh', () => void this.refreshBatch(root, true));
      this.bind(root, 'batch-import', () => void this.importBatchFile(root));
      this.bind(root, 'batch-export', () => this.exportBatchQueue(root));
      this.bind(root, 'batch-run', () => void this.runBatch(root));
      this.bind(root, 'batch-stop', () => this.stopBatch());
      this.bind(root, 'batch-apply', () => void this.applyBatch(root));
      const importFile = root.querySelector('[name="reviewBundleFile"]') as HTMLInputElement | null;
      if (importFile) importFile.onchange = () => this.renderResult(root);
      const libraryFile = root.querySelector('[name="sourceLibraryFile"]') as HTMLInputElement | null;
      if (libraryFile) libraryFile.onchange = () => this.renderLibrary(root);
      const librarySearch = root.querySelector('[name="sourceLibrarySearch"]') as HTMLInputElement | null;
      if (librarySearch) librarySearch.oninput = () => {
        this.libraryQuery = librarySearch.value;
        this.renderLibrary(root);
      };
      const batchFile = root.querySelector('[name="batchCollectionFile"]') as HTMLInputElement | null;
      if (batchFile) batchFile.onchange = () => this.renderBatch(root);
      this.bind(root, 'clear-key', () => {
        if (this.importedReview) return;
        try { assertGm(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
        this.settings = clearApiKey();
        this.connectionCredentialRevision += 1;
        this.connectionProbe = undefined;
        this.connectionProbeRevision = -1;
        this.fillSettings(root);
        this.invalidateReview(root);
        this.notify('info', 'API Key 已清除。');
      });
      this.bind(root, 'clear-all-keys', () => {
        if (this.importedReview) return;
        try { assertGm(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
        this.settings = clearAllApiKeys();
        this.connectionCredentialRevision += 1;
        this.connectionProbe = undefined;
        this.connectionProbeRevision = -1;
        this.fillSettings(root);
        this.invalidateReview(root);
        this.notify('info', '所有已保存 API Key 已清除。');
      });
      this.bind(root, 'toggle-key', () => this.toggleApiKeyVisibility(root));
      this.bind(root, 'toggle-endpoint', () => this.toggleEndpointOverride(root));
      this.bind(root, 'test-connection', () => void this.testConnection(root));
      this.bind(root, 'create', () => void this.create(root));
      this.registerAvailabilityHooks();
      this.registerPageGuard();
      this.renderResult(root);
      if (!this.libraryUnsubscribe) this.libraryUnsubscribe = this.sourceLibrary.subscribe(() => {
        const activeRoot = this.element as HTMLElement | undefined;
        if (activeRoot && !this.libraryMutation) void this.refreshLibrary(activeRoot, false);
      });
      void this.refreshLibrary(root, false);
      if (!this.batchUnsubscribe) this.batchUnsubscribe = this.batchQueue.subscribe(() => {
        const activeRoot = this.element as HTMLElement | undefined;
        if (activeRoot && !this.batchMutation && !this.batchRunning && !this.batchApplying) void this.refreshBatch(activeRoot, false);
      });
      void this.refreshBatch(root, false);
    }

    async close(options?: unknown) {
      if (this.creating || this.batchApplying) {
        this.notify('error', 'Document 正在提交并回读；完成前不能关闭 Forge Intake。');
        return this;
      }
      this.batchStopRequested = true;
      this.cancel();
      if (this.activeBatchJobId) {
        try { this.batchState = await this.batchQueue.interruptJob(this.activeBatchJobId, undefined, () => this.assertLibraryAuthority()); }
        catch { /* hard reload recovery will convert any remaining running record */ }
      }
      this.importRevision += 1;
      this.importing = false;
      this.unregisterAvailabilityHooks();
      this.unregisterPageGuard();
      this.libraryUnsubscribe?.();
      this.libraryUnsubscribe = undefined;
      if (this.ownsSourceLibrary) this.sourceLibrary.close();
      this.batchUnsubscribe?.();
      this.batchUnsubscribe = undefined;
      if (this.ownsBatchQueue) this.batchQueue.close();
      return super.close(options);
    }

    private async analyze(root: HTMLElement): Promise<void> {
      if (this.busy() || this.importedReview || this.batchRunning || this.batchApplying) return;
      if (this.status !== 'empty') {
        this.notify('error', '当前 attempt 已存在；请使用 Regenerate 开启新 attempt，或 Clear 清空。');
        return;
      }
      await this.runAnalysis(root, false);
    }

    private async runAnalysis(root: HTMLElement, regenerated: boolean): Promise<void> {
      if (this.importedReview) return;
      const form = readForm(root);
      if (!form.source.trim()) return void this.notify('error', '来源文本不能为空。');
      if (this.recoveredFrom && !form.displayName) return void this.notify('error', '恢复草稿必须由 GM 确认非空显示名称后才能 Analyze。');
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      const ai = form.mode !== 'plaintext-actor';
      if (ai && (!form.endpoint || !form.model || (form.authScheme !== 'none' && !form.apiKey))) return void this.notify('error', 'AI Intake 需要 HTTPS endpoint、提取模型和对应认证凭据。');
      if (ai && !this.connectionReady(form)) return void this.notify('error', '请先在步骤 1 完成当前 Provider、协议、模型和 API Key 的连接测试；任一字段变化后必须重新测试。');
      if (ai && !claimForgeAiJob(this)) return void this.notify('error', '已有 Forge AI Intake 任务正在运行；Actor 与 Item AI 共用一个活动任务上限。');
      this.attemptSequence += 1;
      this.requestId = randomRequestId(form.mode);
      this.attemptId = `${this.requestId}:attempt-${this.attemptSequence}`;
      this.reviewSource = form.source;
      this.snapshot = makeSnapshot(form, environment.game);
      this.analysis = undefined;
      this.generation = undefined;
      this.response = undefined;
      this.staleFinding = undefined;
      this.stageProgress = [];
      this.providerActivity = undefined;
      this.status = regenerated
        ? transitionForgeIntakeReviewStatus(transitionForgeIntakeReviewStatus(this.status, 'regenerate'), 'regeneration_started')
        : transitionForgeIntakeReviewStatus(this.status, 'analyze');
      const controller = new AbortController();
      const revision = ++this.revision;
      this.controller = controller;
      this.renderResult(root);
      try {
        let nextAnalysis: IntakeAnalysis;
        if (form.mode === 'plaintext-actor') {
          nextAnalysis = this.services.analyzePlaintextActorSource(form.source);
        } else if (form.mode === 'ai-monster') {
          const provider = this.services.createBrowserAiProvider(this.aiProviderOptions(form, controller), controller.signal);
          this.settings = saveClientSettings(form);
          nextAnalysis = await this.services.analyzeBrowserActorSourceWithAi(
            actorInput(form, this.requestId, environment.game, (stage) => this.updateStage(root, controller, revision, stage)),
            provider,
            controller.signal,
            this.attemptId,
          );
        } else {
          const provider = this.services.createBrowserItemAiProvider(this.aiProviderOptions(form, controller), controller.signal);
          this.settings = saveClientSettings(form);
          nextAnalysis = await this.services.analyzeBrowserItemSourceWithAi(
            itemInput(form, this.requestId, environment.game, (stage) => this.updateStage(root, controller, revision, stage)),
            provider,
            controller.signal,
            this.attemptId,
          );
        }
        if (!this.isCurrent(controller, revision)) return;
        this.analysis = nextAnalysis;
        const resultStatus = nextAnalysis.status;
        this.status = transitionForgeIntakeReviewStatus(this.status,
          resultStatus === 'ready_to_generate' ? 'analysis_ready' : resultStatus === 'needs_review' ? 'analysis_needs_review' : 'analysis_failed');
      } catch (error) {
        if (!controller.signal.aborted && this.isCurrent(controller, revision)) {
          this.status = transitionForgeIntakeReviewStatus(this.status, 'analysis_failed');
          this.notify('error', messageOf(error));
          this.focusError(root);
        }
      } finally {
        if (this.controller === controller) this.controller = undefined;
        if (ai) releaseForgeAiJob(this);
        this.renderResult(root);
      }
    }

    private async repair(root: HTMLElement): Promise<void> {
      if (this.busy() || this.importedReview || this.batchRunning || this.batchApplying || this.status !== 'needs_review' || !this.snapshotCurrent(root)) return;
      if (((this.analysis as any)?.repairCount ?? 0) >= 1) {
        this.notify('error', '当前 attempt 已用完一次 bounded repair；请修改来源或 Regenerate。');
        return;
      }
      const form = readForm(root);
      if (form.mode === 'plaintext-actor') return void this.notify('error', 'Plaintext audit finding 不能由 provider repair；请修改来源并 Regenerate。');
      if (!claimForgeAiJob(this)) return void this.notify('error', '已有 Forge AI Intake 任务正在运行。');
      const controller = new AbortController();
      const revision = ++this.revision;
      this.controller = controller;
      this.status = transitionForgeIntakeReviewStatus(this.status, 'repair');
      this.renderResult(root);
      try {
        let nextAnalysis: BrowserActorIntakeAnalysis | BrowserItemIntakeAnalysis;
        if (form.mode === 'ai-monster') {
          const provider = this.services.createBrowserAiProvider(this.aiProviderOptions(form, controller), controller.signal);
          const current = this.generation && isActorGeneration(this.generation) ? this.generation : this.analysis as BrowserActorIntakeAnalysis;
          nextAnalysis = await this.services.repairBrowserActorIntake(actorInput(form, this.requestId, environment.game), current, provider, controller.signal);
        } else {
          const provider = this.services.createBrowserItemAiProvider(this.aiProviderOptions(form, controller), controller.signal);
          const current = this.generation && isItemGeneration(this.generation) ? this.generation : this.analysis as BrowserItemIntakeAnalysis;
          nextAnalysis = await this.services.repairBrowserItemIntake(itemInput(form, this.requestId, environment.game), current, provider, controller.signal);
        }
        if (!this.isCurrent(controller, revision)) return;
        this.analysis = nextAnalysis;
        this.generation = undefined;
        this.response = undefined;
        const result = nextAnalysis;
        this.status = transitionForgeIntakeReviewStatus(this.status,
          result.status === 'ready_to_generate' ? 'repair_ready' : result.status === 'needs_review' ? 'repair_needs_review' : 'repair_failed');
        this.history.push({ sequence: this.history.length + 1, action: 'repair', attemptId: this.attemptId, resultingStatus: this.status });
      } catch (error) {
        if (!controller.signal.aborted && this.isCurrent(controller, revision)) {
          this.status = transitionForgeIntakeReviewStatus(this.status, 'repair_failed');
          this.notify('error', messageOf(error));
          this.focusError(root);
        }
      } finally {
        if (this.controller === controller) this.controller = undefined;
        releaseForgeAiJob(this);
        this.renderResult(root);
      }
    }

    private async generate(root: HTMLElement, fromBatch = false): Promise<void> {
      if (this.busy() || this.importedReview || (!fromBatch && (this.batchRunning || this.batchApplying)) || this.status !== 'ready_to_generate' || !this.snapshotCurrent(root) || !this.analysis) return;
      const form = readForm(root);
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      const ai = form.mode !== 'plaintext-actor';
      if (ai && !claimForgeAiJob(this)) return void this.notify('error', '已有 Forge AI Intake 任务正在运行。');
      const controller = new AbortController();
      const revision = ++this.revision;
      this.controller = controller;
      this.status = transitionForgeIntakeReviewStatus(this.status, 'generate');
      this.renderResult(root);
      try {
        let nextGeneration: IntakeGeneration;
        if (form.mode === 'plaintext-actor') {
          nextGeneration = await this.generatePlaintext(form, this.analysis as BrowserPlaintextActorAnalysis);
        } else if (form.mode === 'ai-monster') {
          const provider = this.services.createBrowserAiProvider(this.aiProviderOptions(form, controller), controller.signal);
          nextGeneration = await this.services.generateAndReviewBrowserActorIntake(
            actorInput(form, this.requestId, environment.game), this.analysis as BrowserActorIntakeAnalysis, provider, controller.signal,
          );
        } else {
          const provider = this.services.createBrowserItemAiProvider(this.aiProviderOptions(form, controller), controller.signal);
          nextGeneration = await this.services.generateAndReviewBrowserItemIntake(
            itemInput(form, this.requestId, environment.game), this.analysis as BrowserItemIntakeAnalysis, provider, controller.signal,
          );
        }
        if (!this.isCurrent(controller, revision)) return;
        this.generation = nextGeneration;
        this.response = nextGeneration.response;
        this.status = transitionForgeIntakeReviewStatus(this.status,
          nextGeneration.status === 'accepted' ? 'generation_accepted' : nextGeneration.status === 'needs_review' ? 'generation_needs_review' : 'generation_failed');
      } catch (error) {
        if (!controller.signal.aborted && this.isCurrent(controller, revision)) {
          this.status = transitionForgeIntakeReviewStatus(this.status, 'generation_failed');
          this.notify('error', messageOf(error));
          this.focusError(root);
        }
      } finally {
        if (this.controller === controller) this.controller = undefined;
        if (ai) releaseForgeAiJob(this);
        this.renderResult(root);
      }
    }

    private async generatePlaintext(form: ReturnType<typeof readForm>, analysis: BrowserPlaintextActorAnalysis): Promise<PlaintextGenerationResult> {
      if (analysis.status !== 'ready_to_generate' || !analysis.canonicalSource) {
        return { status: 'needs_review', findings: analysis.findings };
      }
      const request = buildForgeActorRequest({
        content: analysis.canonicalSource,
        displayName: form.displayName || form.sourceName,
        requestId: this.requestId,
        fvttVersion: environment.game.version,
        systemVersion: environment.game.system.version,
      });
      const response = await this.services.convertFinalActorSource(request);
      const status = actorResponseStatus(response);
      return {
        status,
        finalSource: request.source.content,
        finalSourceHash: request.source.utf8Sha256,
        ...(status === 'accepted' ? { response } : {}),
        findings: status === 'accepted'
          ? analysis.findings
          : [...analysis.findings, ...formalActorResponseFindings(response)],
      };
    }

    private async regenerate(root: HTMLElement): Promise<void> {
      if (this.busy() || this.importedReview || this.batchRunning || this.batchApplying || !['needs_review', 'failed', 'rejected'].includes(this.status)) return;
      const priorAttempt = this.attemptId;
      this.response = undefined;
      this.analysis = undefined;
      this.generation = undefined;
      this.staleFinding = undefined;
      await this.runAnalysis(root, true);
      if (this.attemptId !== priorAttempt) {
        this.history.push({ sequence: this.history.length + 1, action: 'regenerate', attemptId: priorAttempt, resultingStatus: this.status });
      }
    }

    private reject(root: HTMLElement): void {
      if (this.busy() || this.importedReview || this.batchRunning || this.batchApplying || !['needs_review', 'failed'].includes(this.status)) return;
      this.status = transitionForgeIntakeReviewStatus(this.status, 'reject');
      this.response = undefined;
      this.history.push({ sequence: this.history.length + 1, action: 'reject', attemptId: this.attemptId, resultingStatus: this.status });
      this.renderResult(root);
    }

    private clear(root: HTMLElement): void {
      if (this.creating || this.importing || this.batchRunning || this.batchApplying) return;
      if (this.importedReview) {
        this.importedReview = undefined;
        const importFile = root.querySelector('[name="reviewBundleFile"]') as HTMLInputElement | null;
        if (importFile) importFile.value = '';
        this.renderResult(root);
        return;
      }
      this.cancel();
      this.status = this.status === 'committing_and_reading_back' ? this.status : transitionForgeIntakeReviewStatus(this.status, 'clear');
      this.analysis = undefined;
      this.generation = undefined;
      this.response = undefined;
      this.snapshot = undefined;
      this.reviewSource = '';
      this.requestId = '';
      this.attemptId = '';
      this.history = [];
      this.staleFinding = undefined;
      this.stageProgress = [];
      this.providerActivity = undefined;
      this.recoveredFrom = undefined;
      const source = root.querySelector('[name="source"]') as HTMLTextAreaElement | null;
      const displayName = root.querySelector('[name="displayName"]') as HTMLInputElement | null;
      if (source) source.value = '';
      if (displayName) displayName.value = '';
      this.renderResult(root);
    }

    private exportBundle(root: HTMLElement): void {
      try {
        if (this.importedReview) {
          const serialized = serializeForgeIntakeReviewBundleV2(this.importedReview.bundle);
          assertSafeReviewExport(serialized, readForm(root));
          this.services.downloadReviewBundle(`forge-intake-imported-${safeName(this.importedReview.bundle.attemptId)}.json`, serialized);
          this.notify('info', '只读 review bundle 已按规范化 V2 重新导出。');
          return;
        }
        if (!this.snapshot || !this.analysis || !this.requestId || !this.attemptId) return;
        const bundle = this.buildBundle(readForm(root));
        const serialized = serializeForgeIntakeReviewBundleV2(bundle);
        assertSafeReviewExport(serialized, readForm(root));
        this.services.downloadReviewBundle(`forge-intake-${bundle.mode}-${safeName(bundle.attemptId)}.json`, serialized);
        this.notify('info', 'Review bundle 已导出；不含 API Key、Authorization 或完整 endpoint。');
      } catch (error) {
        this.notify('error', messageOf(error));
        this.focusError(root);
      }
    }

    private buildBundle(form: ReturnType<typeof readForm>) {
      const analysis: any = this.analysis;
      const generation: any = this.generation;
      const responseResult: any = this.response && 'result' in this.response ? this.response.result : undefined;
      const ir = analysis?.ir;
      const candidate = analysis?.candidate;
      const findings = allFindings(this.analysis, this.generation, this.staleFinding);
      const provider = analysis?.provider ?? generation?.provider;
      const evidence = analysis?.evidence ?? (ir ? {
        source: ir.source,
        claims: ir.claims ?? [],
        coverage: ir.coverage ?? [],
        uncertainties: ir.uncertainties ?? [],
      } : undefined);
      const input: ForgeIntakeReviewBundleInput = {
        objectKind: form.mode === 'ai-item' ? 'item' : 'actor',
        mode: form.mode,
        requestId: this.requestId,
        attemptId: this.attemptId,
        status: this.status,
        rawSource: this.reviewSource,
        rawSourceHash: this.snapshot!.rawSourceHash,
        ...(candidate ? { candidate } : {}),
        ...(evidence ? { evidence } : {}),
        deterministicFindings: findings.filter((entry: any) => entry.origin !== 'ai-review'),
        aiReviewFindings: findings.filter((entry: any) => entry.origin === 'ai-review'),
        ...(generation?.review?.verdict ? { reviewVerdict: generation.review.verdict } : {}),
        ...(provider ? { provider: {
          name: provider.providerName,
          extractionModel: provider.extractionModel,
          reviewModel: provider.reviewModel,
          protocol: form.protocol,
          region: form.region,
          reasoning: form.reasoning,
          structuredOutput: form.structuredOutput,
          promptVersions: provider.promptVersions,
        } } : {}),
        calls: generation?.calls ?? analysis?.calls,
        repairCount: analysis?.repairCount ?? 0,
        ...(generation?.finalSource ? { canonicalSource: generation.finalSource } : {}),
        ...(generation?.finalSource && responseResult?.sourceIdentity ? { sourceIdentity: {
          sourceId: responseResult.sourceIdentity.sourceId,
          finalSourceHash: generation.finalSourceHash,
        } } : {}),
        target: responseResult?.target ? {
          generatorVersion: responseResult.target.generatorVersion,
          fvttVersion: responseResult.target.fvttRuntimeVersion,
          systemId: responseResult.target.systemId,
          systemVersion: responseResult.target.systemVersionObserved,
          generatorProfile: responseResult.target.generatorProfile,
          effectProfile: responseResult.target.effectProfile,
          iconMode: responseResult.target.iconMode,
        } : {
          generatorVersion: BROWSER_GENERATOR_VERSION,
          fvttVersion: this.snapshot!.target.fvttVersion,
          systemId: 'dnd5e',
          systemVersion: this.snapshot!.target.systemVersion,
          generatorProfile: 'v14',
          effectProfile: this.snapshot!.target.effectProfile,
          iconMode: this.snapshot!.target.iconMode,
        },
        ...(responseResult ? { candidateResponse: {
          requestId: this.response!.requestId,
          status: responseResult.status,
          ...('artifactHash' in responseResult ? { artifactHash: responseResult.artifactHash } : {}),
          verificationStatus: responseResult.verification.status,
          diagnostics: responseResult.diagnostics,
          semanticSummary: form.mode === 'ai-item'
            ? { item: responseResult.itemDocument, verification: responseResult.itemVerification }
            : { actor: responseResult.actorVerification?.actor, items: responseResult.actorVerification?.items },
        } } : {}),
        history: this.history,
      };
      return buildForgeIntakeReviewBundleV2(input, {
        ...(form.displayName ? { sourceLabel: form.displayName } : {}),
        ...(this.recoveredFrom ? { recoveredFrom: this.recoveredFrom } : {}),
      });
    }

    private async importBundle(root: HTMLElement): Promise<void> {
      if (this.busy() || this.batchRunning || this.batchApplying) return;
      try { assertGm(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      const input = root.querySelector('[name="reviewBundleFile"]') as HTMLInputElement | null;
      const file = input?.files?.[0];
      if (!file) return void this.notify('error', '请选择一个 review bundle JSON 文件。');
      const revision = ++this.importRevision;
      this.importing = true;
      this.renderResult(root);
      try {
        const text = await this.services.readReviewBundleFile(file);
        const imported = decodeForgeIntakeReviewBundleText(text);
        if (revision !== this.importRevision) return;
        assertGm(environment.game);
        this.importedReview = imported;
        this.notify('info', `Review bundle 已作为只读历史记录导入；历史状态为 ${imported.bundle.status}，不能直接创建。`);
      } catch (error) {
        this.notify('error', safeUntrustedMessage(error));
        this.focusError(root);
      } finally {
        if (revision === this.importRevision) this.importing = false;
        this.renderResult(root);
      }
    }

    private startNewAttempt(root: HTMLElement): void {
      if (this.busy() || this.batchRunning || this.batchApplying || !this.importedReview) return;
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      if (!importedTargetCompatible(this.importedReview)) {
        this.notify('error', '导入记录的 target 与当前 Foundry 14.364 / dnd5e 5.3.3 安全边界不兼容，不能开启新 attempt。');
        return;
      }
      const imported = this.importedReview;
      this.cancel();
      this.status = 'empty';
      this.analysis = undefined;
      this.generation = undefined;
      this.response = undefined;
      this.snapshot = undefined;
      this.reviewSource = '';
      this.requestId = '';
      this.attemptId = '';
      this.history = [];
      this.staleFinding = undefined;
      this.stageProgress = [];
      this.providerActivity = undefined;
      this.recoveredFrom = createForgeIntakeRecoveryLineage(imported);
      this.importedReview = undefined;
      const source = root.querySelector('[name="source"]') as HTMLTextAreaElement | null;
      const displayName = root.querySelector('[name="displayName"]') as HTMLInputElement | null;
      const mode = root.querySelector('[name="mode"]') as HTMLSelectElement | null;
      if (source) source.value = imported.bundle.rawSource;
      if (displayName) displayName.value = imported.bundle.sourceLabel ?? imported.bundle.candidate?.label ?? '';
      if (mode) mode.value = imported.bundle.mode;
      const importFile = root.querySelector('[name="reviewBundleFile"]') as HTMLInputElement | null;
      if (importFile) importFile.value = '';
      this.refreshAiVisibility(root);
      this.refreshProviderUi(root);
      this.renderResult(root);
      this.notify('info', '已建立恢复草稿。请确认显示名称、当前 target 与 AI 连接，然后从 Analyze 开启全新 attempt。');
    }

    private async refreshLibrary(root: HTMLElement, notify: boolean): Promise<void> {
      if (this.libraryLoading || this.libraryMutation) return;
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) {
        if (notify) this.notify('error', messageOf(error));
        return;
      }
      this.libraryLoading = true;
      this.renderLibrary(root);
      try {
        const loaded = await this.sourceLibrary.load();
        this.assertLibraryAuthority();
        this.libraryState = loaded;
        if (notify) this.notify('info', 'Source library 已从当前浏览器重新加载。');
      } catch (error) {
        this.notify('error', safeLibraryMessage(error));
      } finally {
        this.libraryLoading = false;
        this.renderLibrary(root);
      }
    }

    private async saveToLibrary(root: HTMLElement): Promise<void> {
      if (this.busy() || this.libraryMutation) return;
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      const form = readForm(root);
      const forbiddenValues = [form.apiKey, form.endpoint];
      this.libraryMutation = true;
      this.renderLibrary(root);
      try {
        if (this.importedReview) {
          this.libraryState = await this.sourceLibrary.saveReview(
            this.importedReview,
            this.importedReview.bundle.sourceLabel,
            forbiddenValues,
            () => this.assertLibraryAuthority(),
          );
          this.notify('info', '当前只读 review 与其来源已保存到 client-local source library。');
        } else if (this.analysis && this.snapshot && this.requestId && this.attemptId && this.snapshotCurrent(root)) {
          const bundle = this.buildBundle(form);
          const imported = decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(bundle));
          this.libraryState = await this.sourceLibrary.saveReview(imported, form.displayName, forbiddenValues, () => this.assertLibraryAuthority());
          this.notify('info', '当前来源与规范化 review record 已保存到 client-local source library。');
        } else {
          if (!form.source.trim()) throw new Error('要保存的来源不能为空。');
          this.libraryState = await this.sourceLibrary.saveSource({
            objectKind: form.mode === 'ai-item' ? 'item' : 'actor',
            mode: form.mode,
            sourceLabel: form.displayName,
            rawSource: form.source,
            forbiddenValues,
            beforeCommit: () => this.assertLibraryAuthority(),
          });
          this.notify('info', '当前来源已保存到 client-local source library；没有伪造或自动生成 review record。');
        }
      } catch (error) {
        this.notify('error', safeLibraryMessage(error));
        this.focusError(root);
      } finally {
        this.libraryMutation = false;
        this.renderLibrary(root);
      }
    }

    private exportLibrary(root: HTMLElement): void {
      try {
        assertGm(environment.game);
        assertExactRuntime(environment.game);
        if (!this.libraryState) throw new Error('Source library 尚未加载。');
        const serialized = serializeForgeSourceLibrary(this.libraryState);
        assertSafeLibraryExport(serialized, readForm(root));
        this.services.downloadReviewBundle('fvtt-json-forge-source-library-v1.json', serialized);
        this.notify('info', '完整 source library 已导出；这是未加密的安全投影文件。');
      } catch (error) {
        this.notify('error', safeLibraryMessage(error));
      }
    }

    private async importLibrary(root: HTMLElement): Promise<void> {
      if (this.busy() || this.libraryMutation) return;
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      const input = root.querySelector('[name="sourceLibraryFile"]') as HTMLInputElement | null;
      const file = input?.files?.[0];
      if (!file) return void this.notify('error', '请选择一个 source library JSON 文件。');
      this.libraryMutation = true;
      this.renderLibrary(root);
      try {
        const text = await readSourceLibraryFile(file);
        this.assertLibraryAuthority();
        const form = readForm(root);
        this.libraryState = await this.sourceLibrary.importText(
          text,
          [form.apiKey, form.endpoint],
          () => this.assertLibraryAuthority(),
        );
        if (input) input.value = '';
        this.notify('info', 'Source library 文件已通过 strict decoder 原子合并。');
      } catch (error) {
        this.notify('error', safeLibraryMessage(error));
        this.focusError(root);
      } finally {
        this.libraryMutation = false;
        this.renderLibrary(root);
      }
    }

    private openLibrarySource(root: HTMLElement, id: string): void {
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      if (this.busy() || this.libraryMutation || !this.libraryWorkspaceEmpty(root)) {
        this.notify('error', '打开 library 来源前请先 Clear 当前工作区，避免覆盖未保存状态。');
        return;
      }
      const sourceRecord = this.libraryState?.sources.find((source) => source.id === id);
      if (!sourceRecord) return void this.notify('error', 'Source library 记录已不存在，请刷新。');
      this.resetWorkspaceState();
      const source = root.querySelector('[name="source"]') as HTMLTextAreaElement | null;
      const displayName = root.querySelector('[name="displayName"]') as HTMLInputElement | null;
      const mode = root.querySelector('[name="mode"]') as HTMLSelectElement | null;
      if (source) source.value = sourceRecord.rawSource;
      if (displayName) displayName.value = sourceRecord.sourceLabel;
      if (mode) mode.value = sourceRecord.mode;
      this.refreshAiVisibility(root);
      this.refreshProviderUi(root);
      this.renderResult(root);
      this.notify('info', 'Library 来源已作为未分析草稿打开；没有调用 Provider 或恢复旧 identity。');
    }

    private openLibraryReview(root: HTMLElement, id: string): void {
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      if (this.busy() || this.libraryMutation || !this.libraryWorkspaceEmpty(root)) {
        this.notify('error', '打开历史 review 前请先 Clear 当前工作区，避免覆盖未保存状态。');
        return;
      }
      const review = this.libraryState?.reviews.find((entry) => entry.id === id);
      if (!review) return void this.notify('error', 'Source library review 已不存在，请刷新。');
      this.resetWorkspaceState();
      this.importedReview = importedReviewFromLibrary(review);
      this.renderResult(root);
      this.notify('info', `历史 review 已作为 E1 只读记录打开；历史状态为 ${review.status}，不能直接创建。`);
    }

    private exportLibrarySource(root: HTMLElement, id: string): void {
      try {
        assertGm(environment.game);
        assertExactRuntime(environment.game);
        const source = this.libraryState?.sources.find((entry) => entry.id === id);
        if (!source) throw new Error('Source library 记录已不存在，请刷新。');
        const serialized = serializeForgeSourceLibrarySource(source);
        assertSafeLibraryExport(serialized, readForm(root));
        this.services.downloadReviewBundle(`forge-source-${safeName(source.rawSourceHash)}.json`, serialized);
      } catch (error) { this.notify('error', safeLibraryMessage(error)); }
    }

    private exportLibraryReview(root: HTMLElement, id: string): void {
      try {
        assertGm(environment.game);
        assertExactRuntime(environment.game);
        const review = this.libraryState?.reviews.find((entry) => entry.id === id);
        if (!review) throw new Error('Source library review 已不存在，请刷新。');
        const serialized = serializeForgeIntakeReviewBundleV2(review.bundle);
        assertSafeLibraryExport(serialized, readForm(root));
        this.services.downloadReviewBundle(`forge-review-${safeName(review.id)}.json`, serialized);
      } catch (error) { this.notify('error', safeLibraryMessage(error)); }
    }

    private async deleteLibrarySource(root: HTMLElement, id: string): Promise<void> {
      if (this.libraryMutation) return;
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      const source = this.libraryState?.sources.find((entry) => entry.id === id);
      if (!source) return void this.notify('error', 'Source library 记录已不存在，请刷新。');
      const reviewCount = this.libraryState?.reviews.filter((review) => review.sourceRecordId === id).length ?? 0;
      if (!await this.confirmLibraryDelete(`删除来源“${source.sourceLabel || source.rawSourceHash}”及其 ${reviewCount} 条 review record？`)) return;
      try { this.assertLibraryAuthority(); } catch (error) { return void this.notify('error', messageOf(error)); }
      this.libraryMutation = true;
      this.renderLibrary(root);
      try {
        this.libraryState = await this.sourceLibrary.deleteSource(id, () => this.assertLibraryAuthority());
        this.notify('info', 'Source library 来源及其关联 review 已删除。');
      } catch (error) { this.notify('error', safeLibraryMessage(error)); }
      finally { this.libraryMutation = false; this.renderLibrary(root); }
    }

    private async deleteLibraryReview(root: HTMLElement, id: string): Promise<void> {
      if (this.libraryMutation) return;
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      const review = this.libraryState?.reviews.find((entry) => entry.id === id);
      if (!review) return void this.notify('error', 'Source library review 已不存在，请刷新。');
      if (!await this.confirmLibraryDelete(`删除历史 review ${review.attemptId}？来源记录会保留。`)) return;
      try { this.assertLibraryAuthority(); } catch (error) { return void this.notify('error', messageOf(error)); }
      this.libraryMutation = true;
      this.renderLibrary(root);
      try {
        this.libraryState = await this.sourceLibrary.deleteReview(id, () => this.assertLibraryAuthority());
        this.notify('info', 'Source library review 已删除，来源仍保留。');
      } catch (error) { this.notify('error', safeLibraryMessage(error)); }
      finally { this.libraryMutation = false; this.renderLibrary(root); }
    }

    private async confirmLibraryDelete(message: string): Promise<boolean> {
      const dialog = foundryGlobal?.applications?.api?.DialogV2;
      if (typeof dialog?.confirm !== 'function') {
        this.notify('error', 'Foundry 14 DialogV2.confirm 不可用；为避免误删，删除已取消。');
        return false;
      }
      try {
        return await dialog.confirm({ window: { title: '确认删除 Source Library 记录' }, content: `<p>${escapeHtml(message)}</p>`, modal: true }) === true;
      } catch {
        return false;
      }
    }

    private assertLibraryAuthority(): void {
      assertGm(environment.game);
      assertExactRuntime(environment.game);
    }

    private libraryWorkspaceEmpty(root: HTMLElement): boolean {
      const form = readForm(root);
      return !this.importedReview && !this.analysis && !this.generation && !this.response && this.status === 'empty' && !form.source.trim();
    }

    private resetWorkspaceState(): void {
      this.cancel();
      this.status = 'empty';
      this.analysis = undefined;
      this.generation = undefined;
      this.response = undefined;
      this.snapshot = undefined;
      this.reviewSource = '';
      this.requestId = '';
      this.attemptId = '';
      this.history = [];
      this.staleFinding = undefined;
      this.stageProgress = [];
      this.providerActivity = undefined;
      this.recoveredFrom = undefined;
      this.importedReview = undefined;
    }

    private async create(root: HTMLElement): Promise<void> {
      if (this.busy() || this.batchRunning || this.batchApplying || !this.isApplyable(root) || !this.response || !this.snapshot) return;
      const mode = readForm(root).mode;
      this.status = transitionForgeIntakeReviewStatus(this.status, 'commit');
      this.creating = true;
      this.renderResult(root);
      try {
        assertGm(environment.game);
        assertExactRuntime(environment.game);
        if (!this.isApplyable(root)) throw new Error('Review snapshot 或 accepted gate 在提交前已失效。');
        if (mode === 'ai-item') {
          const result = await this.services.createAcceptedForgeItem({ game: environment.game, response: this.response as ForgeItemResponse });
          this.notify('info', result.status === 'existing' ? `已复用 Item：${result.uuid}` : `Item 创建并回读成功：${result.uuid}`);
        } else {
          const result = await this.services.createAcceptedForgeActor({
            game: environment.game,
            response: this.response as ForgeActorResponse,
            ...(mode === 'ai-monster' ? { rawSourceHash: this.snapshot.rawSourceHash } : {}),
          });
          this.notify('info', result.status === 'existing' ? `已复用 Actor：${result.uuid}` : `Actor 创建并回读成功：${result.uuid}`);
        }
      } catch (error) {
        this.notify('error', messageOf(error));
      } finally {
        this.creating = false;
        this.status = transitionForgeIntakeReviewStatus(this.status, 'commit_finished');
        this.renderResult(root);
      }
    }

    private isApplyable(root: HTMLElement): boolean {
      if (this.importedReview) return false;
      if (!['accepted', 'committing_and_reading_back'].includes(this.status) || !this.response || !this.snapshotCurrent(root) || !isCurrentRuntime(environment.game)) return false;
      if (allFindings(this.analysis, this.generation, this.staleFinding).some((entry) => entry.blocking)) return false;
      const mode = readForm(root).mode;
      return mode === 'ai-item'
        ? acceptedItemResponse(this.response as ForgeItemResponse)
        : acceptedActorResponse(this.response as ForgeActorResponse);
    }

    private connectionReady(form: ReturnType<typeof readForm>): boolean {
      return form.mode === 'plaintext-actor'
        || (this.connectionProbe?.status === 'connected'
          && this.connectionProbeRevision === this.connectionCredentialRevision
          && this.connectionProbeIdentity === connectionIdentity(form));
    }

    private invalidateReview(root: HTMLElement): void {
      if (this.creating) return;
      this.controller?.abort();
      this.revision += 1;
      this.response = undefined;
      if (this.status !== 'empty') {
        this.status = 'needs_review';
        this.staleFinding = staleFinding();
      }
      this.renderResult(root);
    }

    private snapshotCurrent(root: HTMLElement): boolean {
      if (!this.snapshot) return false;
      try { return sameForgeIntakeSnapshot(this.snapshot, makeSnapshot(readForm(root), environment.game)); } catch { return false; }
    }

    private cancel(): void {
      if (this.creating || !this.controller) return;
      this.controller?.abort();
      this.revision += 1;
      this.providerActivity = {
        phase: 'stopped',
        transport: 'closed',
        providerActivity: 'unknown',
        elapsedMs: this.providerActivity?.elapsedMs ?? 0,
        lastEventAtMs: Date.now(),
        lastEventType: 'stopped',
        outputCharactersReceived: this.providerActivity?.outputCharactersReceived ?? 0,
      };
      if (this.status === 'analyzing') this.status = transitionForgeIntakeReviewStatus(this.status, 'analysis_failed');
      else if (this.status === 'generating_and_reviewing') this.status = transitionForgeIntakeReviewStatus(this.status, 'generation_failed');
      else if (this.status === 'repairing') this.status = transitionForgeIntakeReviewStatus(this.status, 'repair_failed');
      this.staleFinding = cancelledFinding();
      const root = this.element as HTMLElement | undefined;
      if (root) this.renderResult(root);
    }

    private busy(): boolean { return Boolean(this.controller || this.creating || this.importing); }
    private isCurrent(controller: AbortController, revision: number): boolean { return this.controller === controller && this.revision === revision && !controller.signal.aborted; }
    private updateStage(root: HTMLElement, controller: AbortController, revision: number, stage: { stage: string; status: string; message?: string }): void {
      if (!this.isCurrent(controller, revision)) return;
      const index = this.stageProgress.findIndex((entry) => entry.stage === stage.stage);
      if (index >= 0) this.stageProgress[index] = stage;
      else this.stageProgress.push(stage);
      this.renderResult(root);
    }

    private renderResult(root: HTMLElement): void {
      this.renderLibrary(root);
      const form = readForm(root);
      if (this.importedReview) {
        this.renderImportedReview(root, form);
        return;
      }
      const responseResult: any = this.response && 'result' in this.response ? this.response.result : undefined;
      const findings = allFindings(this.analysis, this.generation, this.staleFinding);
      const currentStep = form.mode !== 'plaintext-actor' && !this.connectionReady(form)
        ? 'connection'
        : this.analysis || this.generation || this.response || this.status !== 'empty' ? 'review' : 'input';
      const dataset = ((root as any).dataset ??= {});
      dataset.currentStep = currentStep;
      const indicators = typeof (root as any).querySelectorAll === 'function' ? root.querySelectorAll('[data-step-indicator]') : [];
      for (const indicator of indicators) {
        const element = indicator as HTMLElement;
        element.dataset.active = element.dataset.stepIndicator === currentStep ? 'true' : 'false';
      }
      text(root, 'status', this.creating
        ? '状态：正在提交并重新读取核对（不可取消）。'
        : this.providerActivity?.phase === 'stopped' ? `状态：${this.status}（用户已结束请求，不是系统 timeout）` : `状态：${this.status}`);
      text(root, 'human-summary', humanSummary(this.status, this.analysis, this.generation, this.response, this.isApplyable(root)));
      html(root, 'stages', stageList(this.analysis, this.generation, this.stageProgress).map((entry: any) => `<li>${escapeHtml(entry.stage)}：${escapeHtml(entry.status)}${entry.message ? ` — ${escapeHtml(entry.message)}` : ''}</li>`).join(''));
      const diagnostics = root.querySelector('[data-diagnostics]') as HTMLElement | null;
      if (diagnostics) diagnostics.hidden = findings.length === 0 && !(responseResult?.diagnostics?.length);
      html(root, 'diagnostic-list', [
        ...(responseResult?.diagnostics ?? []).map((entry: any) => `[${entry.severity}] ${entry.code}: ${entry.message}`),
        ...findings.map((entry) => `[${entry.origin}] ${entry.code}: ${entry.message}`),
      ].map((entry) => `<li>${escapeHtml(entry)}</li>`).join(''));
      const candidate = (this.analysis as any)?.candidate ?? (this.analysis as any)?.candidates ?? [];
      const ir = (this.analysis as any)?.ir ?? (this.analysis as any)?.creature;
      text(root, 'candidate', candidate ? JSON.stringify(candidate, null, 2) : '');
      text(root, 'evidence', ir ? JSON.stringify(ir, null, 2) : JSON.stringify((this.analysis as any)?.evidence ?? {}, null, 2));
      text(root, 'metadata', JSON.stringify({
        requestId: this.requestId,
        attemptId: this.attemptId,
        snapshotId: this.snapshot?.snapshotId,
        provider: (this.analysis as any)?.provider ?? (this.generation as any)?.provider,
        calls: (this.generation as any)?.calls ?? (this.analysis as any)?.calls,
        repairCount: (this.analysis as any)?.repairCount ?? 0,
        reviewVerdict: (this.generation as any)?.review?.verdict,
        history: this.history,
      }, null, 2));
      text(root, 'canonical', (this.generation as any)?.finalSource ?? (this.analysis as any)?.canonicalSource ?? '');
      text(root, 'raw-source', this.reviewSource);
      text(root, 'preview', responseResult ? JSON.stringify(form.mode === 'ai-item'
        ? { item: responseResult.itemDocument, verification: responseResult.itemVerification }
        : { actor: responseResult.actorVerification?.actor, items: responseResult.actorVerification?.items }, null, 2) : '');
      text(root, 'json', responseResult && 'artifact' in responseResult ? JSON.stringify(responseResult.artifact, null, 2) : '');
      const previewSection = root.querySelector('[data-preview-section]') as HTMLElement | null;
      if (previewSection) previewSection.hidden = !this.analysis;
      const activityCard = root.querySelector('[data-activity-card]') as HTMLElement | null;
      if (activityCard) activityCard.hidden = form.mode === 'plaintext-actor' || (!this.controller && !this.providerActivity);
      if (this.providerActivity) {
        const activity = this.providerActivity;
        const activityLabel = providerActivityLabel(activity);
        text(root, 'activity-summary', `${activityLabel} · ${activity.transport === 'stream_open' ? 'SSE stream 已打开' : activity.transport} · 已等待 ${formatDuration(activity.elapsedMs)}`);
        text(root, 'activity-detail', `${activity.lastEventType ? `最近事件：${activity.lastEventType}。` : '尚未收到语义事件。'} 最近活动距今 ${formatDuration(Math.max(0, Date.now() - activity.lastEventAtMs))}。输出字符 ${activity.outputCharactersReceived}。${activity.providerActivity === 'reported_reasoning' ? ' Provider 报告正在推理；原始 reasoning 不会显示或保存。' : ''}`);
      } else {
        text(root, 'activity-summary', '尚未开始请求。');
        text(root, 'activity-detail', '');
      }
      const batchWorkspaceLocked = this.batchRunning || this.batchApplying;
      setDisabled(root, 'analyze', batchWorkspaceLocked || this.busy() || this.status !== 'empty');
      setDisabled(root, 'repair', batchWorkspaceLocked || this.busy() || this.status !== 'needs_review' || form.mode === 'plaintext-actor' || !this.snapshotCurrent(root) || ((this.analysis as any)?.repairCount ?? 0) >= 1);
      setDisabled(root, 'generate', batchWorkspaceLocked || this.busy() || this.status !== 'ready_to_generate' || !this.snapshotCurrent(root));
      setDisabled(root, 'regenerate', batchWorkspaceLocked || this.busy() || !['needs_review', 'failed', 'rejected'].includes(this.status));
      setDisabled(root, 'reject', batchWorkspaceLocked || this.busy() || !['needs_review', 'failed'].includes(this.status));
      setDisabled(root, 'cancel', this.creating || !this.controller);
      setDisabled(root, 'export', batchWorkspaceLocked || !this.analysis || !this.snapshot);
      setDisabled(root, 'import', batchWorkspaceLocked || this.busy() || !selectedImportFile(root));
      setDisabled(root, 'start-new-attempt', true);
      for (const action of ['test-connection', 'clear-key', 'clear-all-keys', 'toggle-key', 'toggle-endpoint']) setDisabled(root, action, this.creating);
      setDisabled(root, 'create', batchWorkspaceLocked || !this.isApplyable(root));
      const running = Boolean(this.controller || this.creating);
      const actionButtons = typeof (root as any).querySelectorAll === 'function' ? root.querySelectorAll('[data-action]') : [];
      for (const button of actionButtons) {
        const action = (button as HTMLElement).dataset.action;
        (button as HTMLElement).hidden = action === 'cancel' ? !this.controller : running;
      }
      const actionGroups = typeof (root as any).querySelectorAll === 'function' ? root.querySelectorAll('[data-action-group]') : [];
      for (const group of actionGroups) (group as HTMLElement).hidden = running;
      for (const name of ['source', 'displayName', 'mode', 'provider', 'endpoint', 'protocol', 'region', 'model', 'reviewModel', 'reasoning', 'structuredOutput', 'authScheme', 'apiKey', 'persistApiKey', 'useSeparateReviewModel']) {
        const input = root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        if (input) input.disabled = this.creating;
      }
      const importFile = root.querySelector('[name="reviewBundleFile"]') as HTMLInputElement | null;
      if (importFile) importFile.disabled = this.busy();
      const connectionStatus = root.querySelector('[data-connection-status]') as HTMLElement | null;
      if (connectionStatus && !this.creating) {
        connectionStatus.textContent = this.connectionProbe && this.connectionReady(form)
          ? this.connectionProbe.message
          : form.mode === 'plaintext-actor' ? '' : this.connectionProbe?.status !== 'connected' && this.connectionProbe?.message
            ? this.connectionProbe.message
            : this.connectionProbe ? '连接配置已变化，需要重新测试。' : connectionStatus.textContent || '未测试连接。';
      }
    }

    private renderImportedReview(root: HTMLElement, form: ReturnType<typeof readForm>): void {
      const imported = this.importedReview!;
      const bundle = imported.bundle;
      const compatible = importedTargetCompatible(imported);
      const dataset = ((root as any).dataset ??= {});
      dataset.currentStep = 'review';
      const indicators = typeof (root as any).querySelectorAll === 'function' ? root.querySelectorAll('[data-step-indicator]') : [];
      for (const indicator of indicators) {
        const element = indicator as HTMLElement;
        element.dataset.active = element.dataset.stepIndicator === 'review' ? 'true' : 'false';
      }
      text(root, 'status', `导入的只读历史状态：${bundle.status}`);
      text(root, 'human-summary', bundle.status === 'accepted' || bundle.status === 'committing_and_reading_back'
        ? '历史记录显示 accepted，但不含可提交的完整 response/artifact，不能直接 Confirm Create。请显式开启新 attempt 并重新 Analyze、Generate 与验证。'
        : `历史记录显示 ${bundle.status}。这是只读证据，不会恢复旧请求、自动调用 Provider 或写世界 Document。`);
      html(root, 'stages', '');
      const importedFindings = [...bundle.deterministicFindings, ...bundle.aiReviewFindings];
      const responseDiagnostics = bundle.candidateResponse?.diagnostics ?? [];
      const diagnostics = root.querySelector('[data-diagnostics]') as HTMLElement | null;
      if (diagnostics) diagnostics.hidden = importedFindings.length === 0 && responseDiagnostics.length === 0;
      html(root, 'diagnostic-list', [
        ...responseDiagnostics.map((entry) => `[history:${entry.severity}] ${entry.code}: ${entry.message}`),
        ...importedFindings.map((entry) => `[history:${entry.origin}] ${entry.code}: ${entry.message}`),
      ].map((entry) => `<li>${escapeHtml(entry)}</li>`).join(''));
      text(root, 'candidate', JSON.stringify(bundle.candidate ?? {}, null, 2));
      text(root, 'evidence', JSON.stringify(bundle.evidence ?? {}, null, 2));
      text(root, 'metadata', JSON.stringify({
        importedReadOnly: true,
        originalSchema: imported.originalSchema,
        originalVersion: imported.originalVersion,
        normalizedBundleHash: imported.normalizedBundleHash,
        sourceLabel: bundle.sourceLabel,
        requestId: bundle.requestId,
        attemptId: bundle.attemptId,
        rawSourceHash: bundle.rawSourceHash,
        provider: bundle.provider,
        calls: bundle.calls,
        repairCount: bundle.repairCount,
        reviewVerdict: bundle.reviewVerdict,
        history: bundle.history,
        target: bundle.target,
        recoveredFrom: bundle.recoveredFrom,
        compatibleWithCurrentRecoveryTarget: compatible,
      }, null, 2));
      text(root, 'canonical', bundle.canonicalSource ?? '');
      text(root, 'raw-source', bundle.rawSource);
      text(root, 'preview', JSON.stringify(bundle.candidateResponse ?? {}, null, 2));
      text(root, 'json', '历史 bundle 不包含可提交的完整 Actor/Item artifact。');
      const previewSection = root.querySelector('[data-preview-section]') as HTMLElement | null;
      if (previewSection) previewSection.hidden = false;
      const activityCard = root.querySelector('[data-activity-card]') as HTMLElement | null;
      if (activityCard) activityCard.hidden = true;
      for (const action of ['analyze', 'repair', 'generate', 'regenerate', 'reject', 'cancel', 'create']) setDisabled(root, action, true);
      for (const action of ['test-connection', 'clear-key', 'clear-all-keys', 'toggle-key', 'toggle-endpoint']) setDisabled(root, action, true);
      setDisabled(root, 'export', this.importing);
      setDisabled(root, 'import', this.importing || !selectedImportFile(root));
      setDisabled(root, 'start-new-attempt', this.importing || !compatible || !isCurrentRuntime(environment.game));
      for (const name of ['source', 'displayName', 'mode', 'provider', 'endpoint', 'protocol', 'region', 'model', 'reviewModel', 'reasoning', 'structuredOutput', 'authScheme', 'apiKey', 'persistApiKey', 'useSeparateReviewModel']) {
        const input = root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        if (input) input.disabled = true;
      }
      const importFile = root.querySelector('[name="reviewBundleFile"]') as HTMLInputElement | null;
      if (importFile) importFile.disabled = this.importing;
      const actionButtons = typeof (root as any).querySelectorAll === 'function' ? root.querySelectorAll('[data-action]') : [];
      for (const button of actionButtons) (button as HTMLElement).hidden = (button as HTMLElement).dataset.action === 'cancel';
      const actionGroups = typeof (root as any).querySelectorAll === 'function' ? root.querySelectorAll('[data-action-group]') : [];
      for (const group of actionGroups) (group as HTMLElement).hidden = false;
      const connectionStatus = root.querySelector('[data-connection-status]') as HTMLElement | null;
      if (connectionStatus) connectionStatus.textContent = form.mode === 'plaintext-actor' ? '' : '导入不会测试或复用历史 Provider 连接。';
    }

    private renderLibrary(root: HTMLElement): void {
      const summary = root.querySelector('[data-library-summary]') as HTMLElement | null;
      const list = root.querySelector('[data-library-list]') as HTMLElement | null;
      let authorized = true;
      try { this.assertLibraryAuthority(); } catch { authorized = false; }
      if (!authorized) {
        if (summary) summary.textContent = 'Source library 仅对当前精确 runtime 的 GM 可见。';
        if (list) list.innerHTML = '<p>Library metadata 已隐藏。</p>';
        for (const action of ['library-refresh', 'library-save', 'library-export', 'library-import']) setDisabled(root, action, true);
        const file = root.querySelector('[name="sourceLibraryFile"]') as HTMLInputElement | null;
        const search = root.querySelector('[name="sourceLibrarySearch"]') as HTMLInputElement | null;
        if (file) file.disabled = true;
        if (search) search.disabled = true;
        return;
      }
      const state = this.libraryState;
      if (summary) summary.textContent = this.libraryLoading
        ? 'Source library 加载中…'
        : state
          ? `client-local · revision ${state.revision} · ${state.sources.length} 个来源 · ${state.reviews.length} 条 review · 未加密`
          : 'Source library 尚未加载；记录只保存在当前浏览器和当前 world/GM scope。';
      if (list) {
        if (!state) list.innerHTML = '<p>暂无可显示记录。</p>';
        else {
          const results = searchForgeSourceLibrary(state, this.libraryQuery);
          const visible = results.slice(0, 100);
          list.innerHTML = visible.length === 0
            ? '<p>没有匹配的来源或 review record。</p>'
            : visible.map(({ source, reviews }) => `<article class="forge-library-entry">
                <header><strong>${escapeHtml(source.sourceLabel || '(未命名来源)')}</strong><span>${escapeHtml(source.objectKind)} · ${escapeHtml(source.mode)} · rev ${source.revision}</span></header>
                <code>${escapeHtml(source.rawSourceHash)}</code>
                <div class="forge-library-entry-actions">
                  <button type="button" data-library-open-source="${escapeHtml(source.id)}">打开来源草稿</button>
                  <button type="button" data-library-export-source="${escapeHtml(source.id)}">导出来源</button>
                  <button type="button" data-library-delete-source="${escapeHtml(source.id)}">删除来源与 ${reviews.length} 条 review</button>
                </div>
                ${reviews.length === 0 ? '<p>尚无历史 review record。</p>' : `<ol>${reviews.map((review) => `<li>
                  <span>${escapeHtml(review.status)} · ${escapeHtml(review.attemptId)} · ${escapeHtml(review.savedAt)}</span>
                  <span class="forge-library-entry-actions">
                    <button type="button" data-library-open-review="${escapeHtml(review.id)}">打开只读 review</button>
                    <button type="button" data-library-export-review="${escapeHtml(review.id)}">导出 review</button>
                    <button type="button" data-library-delete-review="${escapeHtml(review.id)}">删除 review</button>
                  </span>
                </li>`).join('')}</ol>`}
              </article>`).join('') + (results.length > visible.length ? `<p>仅显示前 ${visible.length} 条；请缩小搜索范围。</p>` : '');
        }
      }
      const form = readForm(root);
      setDisabled(root, 'library-refresh', this.libraryLoading || this.libraryMutation);
      setDisabled(root, 'library-save', this.libraryLoading || this.libraryMutation || this.busy() || (!this.importedReview && !form.source.trim()));
      setDisabled(root, 'library-export', this.libraryLoading || this.libraryMutation || !state);
      setDisabled(root, 'library-import', this.libraryLoading || this.libraryMutation || this.busy() || !selectedLibraryFile(root));
      const file = root.querySelector('[name="sourceLibraryFile"]') as HTMLInputElement | null;
      const search = root.querySelector('[name="sourceLibrarySearch"]') as HTMLInputElement | null;
      if (file) file.disabled = this.libraryLoading || this.libraryMutation || this.busy();
      if (search) search.disabled = this.libraryLoading || this.libraryMutation;
      const dynamicActions: Array<[string, (id: string) => void]> = [
        ['data-library-open-source', (id) => this.openLibrarySource(root, id)],
        ['data-library-export-source', (id) => this.exportLibrarySource(root, id)],
        ['data-library-delete-source', (id) => void this.deleteLibrarySource(root, id)],
        ['data-library-open-review', (id) => this.openLibraryReview(root, id)],
        ['data-library-export-review', (id) => this.exportLibraryReview(root, id)],
        ['data-library-delete-review', (id) => void this.deleteLibraryReview(root, id)],
      ];
      if (typeof (root as any).querySelectorAll === 'function') for (const [attribute, action] of dynamicActions) {
        for (const element of root.querySelectorAll(`[${attribute}]`)) {
          const id = (element as HTMLElement).getAttribute(attribute);
          (element as HTMLButtonElement).disabled = this.libraryLoading || this.libraryMutation;
          (element as HTMLElement).onclick = id ? () => action(id) : null;
        }
      }
    }

    private async refreshBatch(root: HTMLElement, notify: boolean): Promise<void> {
      if (this.batchLoading || this.batchMutation || this.batchRunning || this.batchApplying) return;
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) {
        if (notify) this.notify('error', messageOf(error));
        return;
      }
      this.batchLoading = true;
      this.renderBatch(root);
      try {
        const loaded = this.batchRecovered
          ? await this.batchQueue.load()
          : await this.batchQueue.recoverInterrupted(() => this.assertLibraryAuthority());
        this.assertLibraryAuthority();
        this.batchState = loaded;
        this.batchRecovered = true;
        if (notify) this.notify('info', 'Batch queue 已从当前 world/GM scope 重新加载；未自动重发任何 Provider 请求。');
      } catch (error) {
        this.notify('error', safeLibraryMessage(error));
      } finally {
        this.batchLoading = false;
        this.renderBatch(root);
      }
    }

    private async importBatchFile(root: HTMLElement): Promise<void> {
      if (this.busy() || this.batchMutation || this.batchRunning || this.batchApplying) return;
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      const input = root.querySelector('[name="batchCollectionFile"]') as HTMLInputElement | null;
      const file = input?.files?.[0];
      if (!file) return void this.notify('error', '请选择一个 Forge Collection JSON、ZIP 或 portable queue JSON。');
      if (Number.isFinite(file.size) && file.size > FORGE_BATCH_COLLECTION_MAX_ZIP_BYTES) return void this.notify('error', 'Batch 文件不能超过 64 MiB。');
      this.batchMutation = true;
      this.renderBatch(root);
      try {
        const form = readForm(root);
        const forbiddenValues = [form.apiKey, form.endpoint];
        const name = file.name.toLocaleLowerCase('en-US');
        if (name.endsWith('.zip')) {
          if (typeof file.arrayBuffer !== 'function') throw new Error('当前浏览器不能读取所选 ZIP。');
          const collection = await decodeForgeBatchCollectionZip(await file.arrayBuffer(), forbiddenValues);
          this.assertLibraryAuthority();
          this.batchState = await this.batchQueue.importCollection(collection, forbiddenValues, () => this.assertLibraryAuthority());
          this.notify('info', `Collection ZIP 已严格导入：${collection.entries.length} 个独立 job；没有自动 Analyze 或 world apply。`);
        } else {
          if (typeof file.text !== 'function') throw new Error('当前浏览器不能读取所选 JSON。');
          const text = await file.text();
          this.assertLibraryAuthority();
          let schema: unknown;
          try { schema = JSON.parse(text)?.schema; } catch { throw new Error('Batch JSON 无法解析。'); }
          if (schema === 'fvtt-json-forge-batch-collection') {
            const collection = decodeForgeBatchCollectionText(text, forbiddenValues);
            this.batchState = await this.batchQueue.importCollection(collection, forbiddenValues, () => this.assertLibraryAuthority());
            this.notify('info', `Collection JSON 已严格导入：${collection.entries.length} 个独立 job。`);
          } else if (schema === 'fvtt-json-forge-batch-queue') {
            this.batchState = await this.batchQueue.importQueueText(text, forbiddenValues, () => this.assertLibraryAuthority());
            this.notify('info', 'Portable queue 已严格、原子合并；running/applying 状态会在恢复门禁中变为 interrupted。');
          } else throw new Error('Batch JSON schema 不受支持。');
        }
        this.batchState = await this.batchQueue.recoverInterrupted(() => this.assertLibraryAuthority());
        if (input) input.value = '';
      } catch (error) {
        this.notify('error', safeLibraryMessage(error));
        this.focusError(root);
      } finally {
        this.batchMutation = false;
        this.renderBatch(root);
      }
    }

    private exportBatchQueue(root: HTMLElement): void {
      try {
        assertGm(environment.game); assertExactRuntime(environment.game);
        if (!this.batchState) throw new Error('Batch queue 尚未加载。');
        const form = readForm(root);
        const serialized = serializeForgeBatchQueue(this.batchState, [form.apiKey, form.endpoint]);
        this.services.downloadReviewBundle('fvtt-json-forge-batch-queue-v1.json', serialized);
        this.notify('info', 'Portable batch queue 已导出；不含 Key、完整 response/artifact 或活跃请求。');
      } catch (error) { this.notify('error', safeLibraryMessage(error)); }
    }

    private async exportBatchCollectionZip(root: HTMLElement, collectionId: string): Promise<void> {
      try {
        assertGm(environment.game); assertExactRuntime(environment.game);
        const collection = this.batchState?.collections.find((entry) => entry.id === collectionId);
        if (!collection) throw new Error('Batch collection 不存在。');
        const form = readForm(root);
        const bytes = await encodeForgeBatchCollectionZip(collection, [form.apiKey, form.endpoint]);
        this.assertLibraryAuthority();
        this.services.downloadBinaryFile(`forge-collection-${safeName(collection.label || collection.id)}.zip`, bytes, 'application/zip');
        this.notify('info', `Collection ZIP 已导出：${collection.entries.length} 个来源；不含完整 artifact 或凭据。`);
      } catch (error) { this.notify('error', safeLibraryMessage(error)); }
    }

    private batchJobRunnable(job: Readonly<ForgeBatchJobV1>): boolean {
      return ['pending', 'interrupted', 'needs_review', 'failed', 'rejected', 'apply_failed'].includes(job.status)
        || (job.status === 'accepted' && !this.batchResponses.has(job.id));
    }

    private batchJobCancellable(job: Readonly<ForgeBatchJobV1>): boolean {
      return ['pending', 'interrupted', 'accepted', 'needs_review', 'failed', 'rejected'].includes(job.status);
    }

    private async runBatch(root: HTMLElement): Promise<void> {
      if (this.batchRunning || this.batchApplying || this.batchMutation || this.busy()) return;
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      if (!this.batchState) return void this.notify('error', 'Batch queue 尚未加载。');
      if (!this.libraryWorkspaceEmpty(root)) return void this.notify('error', '开始 batch runner 前请先 Clear 当前单对象工作台，避免覆盖未保存审阅。');
      const eligible = this.batchState.jobs.filter((job) => this.batchJobRunnable(job));
      if (eligible.length === 0) return void this.notify('error', 'Batch queue 没有可启动或恢复的 job。');
      this.batchRunning = true;
      this.batchStopRequested = false;
      this.renderBatch(root);
      let completed = 0;
      try {
        for (const queued of eligible) {
          if (this.batchStopRequested) break;
          this.assertLibraryAuthority();
          const current = await this.batchQueue.load();
          const job = current.jobs.find((entry) => entry.id === queued.id);
          if (!job || !this.batchJobRunnable(job)) continue;
          const entry = batchQueueEntry(current, job);
          this.loadBatchEntry(root, entry, job.latestReview);
          const form = readForm(root);
          if (form.mode !== 'plaintext-actor' && !this.connectionReady(form)) {
            this.notify('info', `Batch job ${entry.sourceLabel || job.id} 需要当前已测试的 AI 连接；本轮跳过该 pending job、继续处理后续可运行项，且没有产生请求。`);
            continue;
          }
          this.batchState = await this.batchQueue.startJob(job.id, () => this.assertLibraryAuthority());
          this.activeBatchJobId = job.id;
          this.renderBatch(root);
          await this.runAnalysis(root, false);
          if (this.batchStopRequested || !this.analysis || !this.snapshot) {
            this.batchState = await this.batchQueue.interruptJob(job.id, 'GM 停止或页面状态中断了当前 job；不会自动重发 Provider 请求。', () => this.assertLibraryAuthority());
            this.batchResponses.delete(job.id);
            break;
          }
          if (this.status === 'ready_to_generate') await this.generate(root, true);
          if (this.batchStopRequested) {
            this.batchState = await this.batchQueue.interruptJob(job.id, 'GM 停止了 batch runner；不会自动重发 Provider 请求。', () => this.assertLibraryAuthority());
            this.batchResponses.delete(job.id);
            break;
          }
          const currentForm = readForm(root);
          const bundle = this.buildBundle(currentForm);
          const imported = decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(bundle));
          this.batchState = await this.batchQueue.settleJob(job.id, imported, [currentForm.apiKey, currentForm.endpoint], () => this.assertLibraryAuthority());
          if (bundle.status === 'accepted' && this.response && this.snapshot) {
            this.batchResponses.set(job.id, { mode: currentForm.mode, rawSourceHash: this.snapshot.rawSourceHash, response: this.response });
          } else this.batchResponses.delete(job.id);
          try {
            this.libraryState = await this.sourceLibrary.saveReview(imported, entry.sourceLabel, [currentForm.apiKey, currentForm.endpoint], () => this.assertLibraryAuthority());
          } catch (error) {
            this.notify('error', `Job 已结算，但复制到 Source Library 失败：${safeLibraryMessage(error)}`);
          }
          completed += 1;
          this.activeBatchJobId = undefined;
          this.renderBatch(root);
        }
      } catch (error) {
        if (this.activeBatchJobId) {
          try { this.batchState = await this.batchQueue.interruptJob(this.activeBatchJobId, 'Batch runner 发生错误；不会自动重试。', () => this.assertLibraryAuthority()); }
          catch { /* preserve the primary error; reload recovery remains fail-closed */ }
        }
        this.notify('error', safeLibraryMessage(error));
      } finally {
        this.activeBatchJobId = undefined;
        this.batchRunning = false;
        this.batchStopRequested = false;
        this.renderResult(root);
        this.renderBatch(root);
      }
      this.notify('info', `Batch runner 已停止：本轮结算 ${completed} 项；未自动 apply 世界 Document。`);
    }

    private stopBatch(): void {
      if (!this.batchRunning) return;
      this.batchStopRequested = true;
      this.cancel();
      this.notify('info', '已请求停止 batch runner；当前请求会中断，后续 job 不会启动。');
    }

    private loadBatchEntry(
      root: HTMLElement,
      entry: Readonly<ForgeBatchCollectionV1['entries'][number]>,
      latestReview?: Readonly<ForgeIntakeReviewBundleV2>,
    ): void {
      this.resetWorkspaceState();
      const source = root.querySelector('[name="source"]') as HTMLTextAreaElement | null;
      const displayName = root.querySelector('[name="displayName"]') as HTMLInputElement | null;
      const mode = root.querySelector('[name="mode"]') as HTMLSelectElement | null;
      if (source) source.value = entry.rawSource;
      if (displayName) displayName.value = entry.sourceLabel;
      if (mode) mode.value = entry.mode;
      const review = latestReview ?? entry.review;
      if (review) this.recoveredFrom = createForgeIntakeRecoveryLineage(decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(review)));
      this.refreshAiVisibility(root);
      this.refreshProviderUi(root);
      this.renderResult(root);
    }

    private openBatchJob(root: HTMLElement, id: string): void {
      if (this.batchRunning || this.batchApplying || this.busy()) return;
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      const job = this.batchState?.jobs.find((entry) => entry.id === id);
      if (!job || !this.batchState) return void this.notify('error', 'Batch job 不存在。');
      const entry = batchQueueEntry(this.batchState, job);
      if (job.latestReview) {
        this.resetWorkspaceState();
        this.importedReview = decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(job.latestReview));
        this.renderResult(root);
        this.notify('info', `已打开 batch job 的只读历史状态 ${job.status}；不能直接创建。`);
      } else {
        this.loadBatchEntry(root, entry);
        this.notify('info', '已把 batch source 打开为无 identity 的草稿；没有自动 Analyze。');
      }
    }

    private async cancelBatchJob(root: HTMLElement, id: string): Promise<void> {
      if (this.batchRunning || this.batchApplying || this.batchMutation || this.busy()) return;
      const job = this.batchState?.jobs.find((entry) => entry.id === id);
      if (!job || !this.batchJobCancellable(job)) return;
      this.batchMutation = true;
      try {
        this.batchState = await this.batchQueue.cancelJob(id, () => this.assertLibraryAuthority());
        this.batchResponses.delete(id);
        this.notify('info', 'Job 已取消；不会参与 runner，除非 GM 显式恢复为 pending。');
      } catch (error) { this.notify('error', safeLibraryMessage(error)); }
      finally { this.batchMutation = false; this.renderBatch(root); }
    }

    private async requeueBatchJob(root: HTMLElement, id: string): Promise<void> {
      if (this.batchRunning || this.batchApplying || this.batchMutation || this.busy()) return;
      const job = this.batchState?.jobs.find((entry) => entry.id === id);
      if (!job || job.status !== 'cancelled') return;
      this.batchMutation = true;
      try {
        this.batchState = await this.batchQueue.requeueJob(id, () => this.assertLibraryAuthority());
        this.notify('info', 'Job 已恢复为 pending；仍需 GM 显式启动 runner。');
      } catch (error) { this.notify('error', safeLibraryMessage(error)); }
      finally { this.batchMutation = false; this.renderBatch(root); }
    }

    private async deleteBatchCollection(root: HTMLElement, id: string): Promise<void> {
      if (this.batchRunning || this.batchApplying || this.batchMutation) return;
      const collection = this.batchState?.collections.find((entry) => entry.id === id);
      if (!collection) return;
      const count = this.batchState?.jobs.filter((job) => job.collectionId === id).length ?? 0;
      if (!await this.confirmLibraryDelete(`删除 collection “${collection.label || collection.id}”及其 ${count} 个 queue job？该 client-local 删除不可恢复。`)) return;
      this.batchMutation = true;
      try {
        this.batchState = await this.batchQueue.removeCollection(id, () => this.assertLibraryAuthority());
        for (const job of [...this.batchResponses.keys()]) if (!this.batchState.jobs.some((entry) => entry.id === job)) this.batchResponses.delete(job);
        this.notify('info', 'Collection 与其 queue job 已删除。');
      } catch (error) { this.notify('error', safeLibraryMessage(error)); }
      finally { this.batchMutation = false; this.renderBatch(root); }
    }

    private async applyBatch(root: HTMLElement): Promise<void> {
      if (this.batchRunning || this.batchApplying || this.batchMutation || this.busy()) return;
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      if (!this.batchState) return;
      const candidates = this.batchApplyCandidates(this.batchState);
      if (candidates.length === 0) return void this.notify('error', '当前 session 没有同时具备完整 response 与 persisted accepted proof 的 batch job。历史 accepted 必须重新执行后才能 apply。');
      let manifest;
      try { manifest = createForgeBatchApplyManifest(this.batchState, candidates); }
      catch (error) { return void this.notify('error', safeLibraryMessage(error)); }
      if (!await this.confirmBatchApply(manifest)) return;
      const before = await this.batchQueue.load();
      this.assertLibraryAuthority();
      if (before.revision !== manifest.queueRevision) return void this.notify('error', 'Queue 在确认期间已变化；apply manifest 已失效，请重新确认。');
      this.batchApplying = true;
      this.renderBatch(root);
      let completed = 0;
      try {
        for (const candidate of manifest.items) {
          const volatile = this.batchResponses.get(candidate.jobId);
          if (!volatile) continue;
          this.assertLibraryAuthority();
          let began = false;
          try {
            const latest = await this.batchQueue.load();
            this.assertLibraryAuthority();
            createForgeBatchApplyManifest(latest, [candidate]);
            this.batchState = await this.batchQueue.beginApply(candidate.jobId, () => this.assertLibraryAuthority());
            began = true;
            const result = volatile.mode === 'ai-item'
              ? await this.services.createAcceptedForgeItem({ game: environment.game, response: volatile.response as ForgeItemResponse })
              : await this.services.createAcceptedForgeActor({ game: environment.game, response: volatile.response as ForgeActorResponse, ...(volatile.mode === 'ai-monster' ? { rawSourceHash: volatile.rawSourceHash } : {}) });
            this.batchState = await this.batchQueue.finishApply(candidate.jobId, {
              status: result.status,
              objectKind: candidate.objectKind,
              uuid: result.uuid,
              sourceId: candidate.sourceId,
              sourceHash: candidate.sourceHash,
              artifactHash: candidate.artifactHash,
            }, () => this.assertLibraryAuthority());
            completed += 1;
          } catch (error) {
            if (began) {
              try { this.batchState = await this.batchQueue.finishApply(candidate.jobId, { status: 'failed', objectKind: candidate.objectKind, message: safeLibraryMessage(error) }, () => this.assertLibraryAuthority()); }
              catch { /* reload recovery will expose an interrupted applying record */ }
            }
            this.notify('error', `Batch apply ${candidate.jobId} 失败：${safeLibraryMessage(error)}`);
          }
          this.renderBatch(root);
        }
      } finally {
        this.batchApplying = false;
        this.renderBatch(root);
      }
      this.notify('info', `Batch apply 已逐项结算 ${completed}/${manifest.items.length}；没有宣称多 Document 原子事务。`);
    }

    private batchApplyCandidates(state: Readonly<ForgeBatchQueueV1>): ForgeBatchApplyCandidate[] {
      const candidates: ForgeBatchApplyCandidate[] = [];
      for (const job of state.jobs) {
        const volatile = this.batchResponses.get(job.id);
        if (!volatile || job.status !== 'accepted' || job.latestReview?.status !== 'accepted') continue;
        const decoded = volatile.mode === 'ai-item'
          ? decodeForgeItemResponse(volatile.response as ForgeItemResponse)
          : decodeForgeActorResponse(volatile.response as ForgeActorResponse);
        if (!decoded.ok || !('result' in decoded.value) || decoded.value.result.status !== 'accepted' || !decoded.value.result.artifactHash) continue;
        const result = decoded.value.result;
        candidates.push({
          jobId: job.id,
          objectKind: volatile.mode === 'ai-item' ? 'item' : 'actor',
          sourceId: result.sourceIdentity.sourceId,
          sourceHash: result.sourceIdentity.sourceHash,
          artifactHash: result.artifactHash,
          documentId: hashArtifact({ sourceId: result.sourceIdentity.sourceId }).slice(0, 16),
          target: {
            fvttVersion: result.target.fvttRuntimeVersion,
            systemId: 'dnd5e',
            systemVersion: result.target.systemVersionObserved,
            generatorProfile: 'v14',
            effectProfile: 'core',
            iconMode: 'off',
          },
        });
      }
      return candidates;
    }

    private async confirmBatchApply(manifest: Readonly<{ id: string; items: readonly ForgeBatchApplyCandidate[] }>): Promise<boolean> {
      const dialog = foundryGlobal?.applications?.api?.DialogV2;
      const summary = manifest.items.map((item) => `<li>${escapeHtml(item.objectKind)} · ${escapeHtml(item.sourceId)} → ${escapeHtml(item.documentId)} · ${escapeHtml(item.artifactHash)}</li>`).join('');
      if (!dialog?.confirm) return false;
      try {
        return await dialog.confirm({
          window: { title: '确认 accepted-only Batch Apply' },
          content: `<p>Manifest <code>${escapeHtml(manifest.id)}</code> 包含 ${manifest.items.length} 项。每项将单独重验并调用既有 Actor/Item adapter；这不是跨 Document 原子事务。</p><ol>${summary}</ol>`,
          modal: true,
        }) === true;
      } catch { return false; }
    }

    private renderBatch(root: HTMLElement): void {
      const summary = root.querySelector('[data-batch-summary]') as HTMLElement | null;
      const list = root.querySelector('[data-batch-list]') as HTMLElement | null;
      let authorized = true;
      try { this.assertLibraryAuthority(); } catch { authorized = false; }
      if (!authorized) {
        if (summary) summary.textContent = 'Batch queue 仅对当前精确 runtime 的 GM 可见。';
        if (list) list.innerHTML = '<p>Queue metadata 已隐藏。</p>';
        for (const action of ['batch-refresh', 'batch-import', 'batch-export', 'batch-run', 'batch-stop', 'batch-apply']) setDisabled(root, action, true);
        const file = root.querySelector('[name="batchCollectionFile"]') as HTMLInputElement | null;
        if (file) file.disabled = true;
        return;
      }
      const state = this.batchState;
      if (summary) summary.textContent = this.batchLoading
        ? 'Batch queue 加载中…'
        : state
          ? `client-local · revision ${state.revision} · ${state.collections.length} collections · ${state.jobs.length} jobs · running/applying 重开后会变为 interrupted`
          : 'Batch queue 尚未加载。';
      if (list) {
        if (!state || state.collections.length === 0) list.innerHTML = '<p>暂无 Collection 或 queue job。</p>';
        else list.innerHTML = state.collections.map((collection) => {
          const jobs = state.jobs.filter((job) => job.collectionId === collection.id).sort((left, right) => left.ordinal - right.ordinal);
          return `<article class="forge-library-entry forge-batch-entry">
            <header><strong>${escapeHtml(collection.label || '(未命名 Collection)')}</strong><span>${jobs.length} jobs</span></header>
            <code>${escapeHtml(collection.id)}</code>
            <div class="forge-library-entry-actions">
              <button type="button" data-batch-export-collection="${escapeHtml(collection.id)}">导出 ZIP</button>
              <button type="button" data-batch-delete-collection="${escapeHtml(collection.id)}">删除 Collection 与 jobs</button>
            </div>
            <ol>${jobs.map((job) => {
              const entry = batchQueueEntry(state, job);
              const lifecycleAction = job.status === 'cancelled'
                ? `<button type="button" data-batch-requeue-job="${escapeHtml(job.id)}">恢复为 pending</button>`
                : this.batchJobCancellable(job)
                  ? `<button type="button" data-batch-cancel-job="${escapeHtml(job.id)}">取消此 job</button>`
                  : '';
              return `<li><span><strong>${escapeHtml(entry.sourceLabel || '(未命名)')}</strong> · ${escapeHtml(entry.objectKind)} · ${escapeHtml(entry.mode)} · ${escapeHtml(job.status)} · attempt ${job.attemptCount}${job.applyResult?.uuid ? ` · ${escapeHtml(job.applyResult.uuid)}` : ''}</span>
                ${job.lastError ? `<small>${escapeHtml(job.lastError)}</small>` : ''}
                <span class="forge-library-entry-actions"><button type="button" data-batch-open-job="${escapeHtml(job.id)}">${job.latestReview ? '打开只读 review' : '打开来源草稿'}</button>${lifecycleAction}</span></li>`;
            }).join('')}</ol>
          </article>`;
        }).join('');
      }
      const eligible = state?.jobs.some((job) => this.batchJobRunnable(job)) ?? false;
      const applyable = state ? this.batchApplyCandidates(state).length > 0 : false;
      setDisabled(root, 'batch-refresh', this.batchLoading || this.batchMutation || this.batchRunning || this.batchApplying);
      setDisabled(root, 'batch-import', this.batchLoading || this.batchMutation || this.batchRunning || this.batchApplying || !selectedBatchFile(root));
      setDisabled(root, 'batch-export', this.batchLoading || this.batchMutation || !state);
      setDisabled(root, 'batch-run', this.batchLoading || this.batchMutation || this.batchRunning || this.batchApplying || !eligible);
      setDisabled(root, 'batch-stop', !this.batchRunning);
      setDisabled(root, 'batch-apply', this.batchLoading || this.batchMutation || this.batchRunning || this.batchApplying || !applyable);
      const file = root.querySelector('[name="batchCollectionFile"]') as HTMLInputElement | null;
      if (file) file.disabled = this.batchRunning || this.batchApplying || this.batchMutation;
      const dynamic: Array<[string, (id: string) => void]> = [
        ['data-batch-open-job', (id) => this.openBatchJob(root, id)],
        ['data-batch-cancel-job', (id) => void this.cancelBatchJob(root, id)],
        ['data-batch-requeue-job', (id) => void this.requeueBatchJob(root, id)],
        ['data-batch-export-collection', (id) => void this.exportBatchCollectionZip(root, id)],
        ['data-batch-delete-collection', (id) => void this.deleteBatchCollection(root, id)],
      ];
      if (typeof (root as any).querySelectorAll === 'function') for (const [attribute, action] of dynamic) for (const element of root.querySelectorAll(`[${attribute}]`)) {
        const id = (element as HTMLElement).getAttribute(attribute);
        (element as HTMLButtonElement).disabled = this.batchRunning || this.batchApplying || this.batchMutation;
        (element as HTMLElement).onclick = id ? () => action(id) : null;
      }
    }

    private fillSettings(root: HTMLElement): void {
      for (const [key, value] of Object.entries(this.settings)) {
        const fieldName = key === 'providerId' ? 'provider' : key;
        const input = root.querySelector(`[name="${fieldName}"]`) as HTMLInputElement | null;
        if (!input || (globalThis as any).document?.activeElement === input) continue;
        if (input.type === 'checkbox') input.checked = value === true;
        else input.value = String(value);
      }
    }
    private loadProviderProfileKey(root: HTMLElement): void {
      const form = readForm(root);
      const profileId = clientSettingsProfileId({
        providerId: form.providerId,
        region: form.region,
        endpoint: form.endpoint,
        protocol: form.protocol,
      });
      const apiKey = this.settings.savedApiKeys[profileId] ?? '';
      const key = root.querySelector('[name="apiKey"]') as HTMLInputElement | null;
      if (key && key.value !== apiKey) {
        key.value = apiKey;
        this.connectionCredentialRevision += 1;
      }
      this.settings = { ...this.settings, apiKey, persistApiKey: Boolean(apiKey) };
    }
    private refreshAiVisibility(root: HTMLElement): void {
      const panel = root.querySelector('[data-ai-settings]') as HTMLElement | null;
      if (panel) panel.hidden = readForm(root).mode === 'plaintext-actor';
    }
    private refreshProviderUi(root: HTMLElement, providerChanged = false): void {
      if (readForm(root).mode === 'plaintext-actor') return;
      const form = readForm(root);
      let connection;
      try {
        connection = normalizeForgeProviderConnection({
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
        });
      } catch {
        connection = undefined;
      }
      const providerId = form.providerId;
      const preset = getForgeProviderPreset(providerId);
      const providerSelect = root.querySelector('[name="provider"]') as HTMLSelectElement | null;
      if (providerSelect && providerSelect.value !== providerId) providerSelect.value = providerId;
      const protocolSelect = root.querySelector('[name="protocol"]') as HTMLSelectElement | null;
      if (protocolSelect) {
        const current = providerChanged ? preset.defaultProtocol : form.protocol;
        setOptions(protocolSelect, preset.protocols.map((protocol) => ({ value: protocol, label: protocolLabel(protocol) })), current);
        protocolSelect.disabled = preset.protocols.length < 2;
      }
      const endpoint = root.querySelector('[name="endpoint"]') as HTMLInputElement | null;
      if (endpoint && endpoint.dataset.forgeEndpointOverride !== 'true' && (providerChanged || !endpoint.value || endpoint.dataset.forgePreset === providerId)) {
        const region = preset.regions?.find((entry) => entry.id === form.region);
        endpoint.value = region?.baseUrl ?? preset.defaultBaseUrl;
        endpoint.dataset.forgePreset = providerId;
        if (providerChanged) endpoint.dataset.forgeEndpointOverride = 'false';
      }
      const model = root.querySelector('[name="model"]') as HTMLInputElement | null;
      if (model && (!model.value || providerChanged)) {
        model.value = preset.recommendedModels[0] ?? '';
        model.dataset.forgePreset = providerId;
      }
      const effectiveModel = model?.value.trim() || preset.recommendedModels[0] || '';
      const effectiveProtocol = (protocolSelect?.value || form.protocol) as ForgeProviderProtocol;
      const capabilities = resolveForgeProviderCapabilities(providerId, effectiveProtocol, effectiveModel);
      const reasoning = root.querySelector('[name="reasoning"]') as HTMLSelectElement | null;
      if (reasoning) {
        setOptions(reasoning, capabilities.reasoning.map((value) => ({ value, label: value === 'auto' ? 'Auto' : value })), form.reasoning);
        reasoning.hidden = capabilities.reasoning.length <= 1;
      }
      const structured = root.querySelector('[name="structuredOutput"]') as HTMLSelectElement | null;
      if (structured) setOptions(structured, capabilities.structuredOutput.map((value) => ({ value, label: value })), form.structuredOutput);
      const auth = root.querySelector('[name="authScheme"]') as HTMLSelectElement | null;
      if (auth) setOptions(auth, preset.authSchemes.map((value) => ({ value, label: value })), form.authScheme);
      const region = root.querySelector('[name="region"]') as HTMLSelectElement | null;
      if (region) {
        setOptions(region, (preset.regions ?? []).map((entry) => ({ value: entry.id, label: entry.label })), form.region);
        region.hidden = (preset.regions?.length ?? 0) === 0;
      }
      const review = root.querySelector('[name="reviewModel"]') as HTMLInputElement | null;
      const separate = root.querySelector('[name="useSeparateReviewModel"]') as HTMLInputElement | null;
      const reviewField = root.querySelector('[data-review-model-field]') as HTMLElement | null;
      if (reviewField) reviewField.hidden = separate?.checked !== true;
      if (review) review.hidden = false;
      const endpointCustomized = endpoint && preset.defaultBaseUrl && endpoint.value.trim() !== preset.defaultBaseUrl;
      const endpointOverride = endpoint?.dataset.forgeEndpointOverride === 'true';
      if (endpoint) endpoint.readOnly = providerId !== 'custom' && !endpointCustomized && !endpointOverride;
      const endpointToggle = root.querySelector('[data-action="toggle-endpoint"]') as HTMLButtonElement | null;
      if (endpointToggle) endpointToggle.textContent = endpointOverride ? '使用官方 endpoint' : '自定义 endpoint';
      const link = root.querySelector('[data-provider-docs]') as HTMLAnchorElement | null;
      if (link) link.href = preset.docsUrl ?? '#';
      const status = root.querySelector('[data-connection-summary]') as HTMLElement | null;
      if (status) {
        const keyState = form.apiKey ? 'Key 已设置' : 'Key 未设置';
        const protocolState = preset.protocols.length > 1 ? `协议 ${effectiveProtocol}` : `协议 ${preset.defaultProtocol}`;
        status.textContent = `${preset.label} · ${protocolState} · 模型 ${effectiveModel || '未选择'} · ${keyState}`;
      }
      renderModelOptions(root, this.connectionProbe?.models ?? preset.recommendedModels);
      if (separate) separate.onchange = () => { if (review) review.hidden = separate.checked !== true; this.invalidateReview(root); };
      if (connection && form.reasoning !== connection.reasoning) {
        const reasoningInput = root.querySelector('[name="reasoning"]') as HTMLSelectElement | null;
        if (reasoningInput) reasoningInput.value = connection.reasoning;
      }
    }
    private toggleApiKeyVisibility(root: HTMLElement): void {
      if (this.importedReview) return;
      try { assertGm(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      const key = root.querySelector('[name="apiKey"]') as HTMLInputElement | null;
      const toggle = root.querySelector('[data-action="toggle-key"]') as HTMLButtonElement | null;
      if (!key) return;
      key.type = key.type === 'password' ? 'text' : 'password';
      if (toggle) toggle.setAttribute('aria-label', key.type === 'password' ? '显示 API Key' : '隐藏 API Key');
    }
    private toggleEndpointOverride(root: HTMLElement): void {
      if (this.importedReview) return;
      try { assertGm(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      const endpoint = root.querySelector('[name="endpoint"]') as HTMLInputElement | null;
      if (!endpoint) return;
      const next = endpoint.dataset.forgeEndpointOverride !== 'true';
      endpoint.dataset.forgeEndpointOverride = next ? 'true' : 'false';
      if (!next) {
        const form = readForm(root);
        const preset = getForgeProviderPreset(form.providerId);
        endpoint.value = preset.regions?.find((entry) => entry.id === form.region)?.baseUrl ?? preset.defaultBaseUrl;
      }
      this.refreshProviderUi(root);
      this.invalidateReview(root);
    }
    private async testConnection(root: HTMLElement): Promise<void> {
      if (this.importedReview) return;
      if (this.busy()) return;
      const form = readForm(root);
      if (form.mode === 'plaintext-actor') return;
      this.connectionProbe = undefined;
      this.connectionProbeRevision = -1;
      this.connectionProbeIdentity = '';
      const status = root.querySelector('[data-connection-status]') as HTMLElement | null;
      if (status) status.textContent = '连接测试中…';
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
        });
        this.connectionProbe = result;
        this.connectionProbeRevision = result.status === 'connected' ? this.connectionCredentialRevision : -1;
        this.connectionProbeIdentity = result.status === 'connected' ? connectionIdentity(form) : '';
        renderModelOptions(root, result.models);
        if (status) status.textContent = result.message;
        if (result.status === 'connected') this.notify('info', result.message);
        else this.notify('error', result.message);
      } catch (error) {
        if (status) status.textContent = '浏览器无法完成连接测试。';
        this.notify('error', messageOf(error));
        status?.focus?.();
      }
      this.renderResult(root);
    }
    private bind(root: HTMLElement, action: string, handler: () => void): void {
      const elements = typeof (root as any).querySelectorAll === 'function'
        ? root.querySelectorAll(`[data-action="${action}"]`)
        : [root.querySelector(`[data-action="${action}"]`)].filter(Boolean);
      for (const element of elements) (element as HTMLElement).onclick = handler;
    }
    private registerAvailabilityHooks(): void {
      if (this.availabilityHooks.length > 0) return;
      const hooks = environment.hooks ?? (globalThis as any).Hooks;
      if (typeof hooks?.on !== 'function') return;
      const refresh = () => {
        const root = this.element as HTMLElement | undefined;
        if (!root) return;
        this.renderResult(root);
        this.renderBatch(root);
      };
      for (const event of ['updateUser', 'updateSetting']) this.availabilityHooks.push({ event, id: hooks.on(event, refresh) });
    }
    private unregisterAvailabilityHooks(): void {
      const hooks = environment.hooks ?? (globalThis as any).Hooks;
      if (typeof hooks?.off === 'function') for (const hook of this.availabilityHooks) hooks.off(hook.event, hook.id);
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
    private focusError(root: HTMLElement): void {
      const target = root.querySelector('[data-diagnostics]') as HTMLElement | null
        ?? root.querySelector('[data-status]') as HTMLElement | null;
      target?.focus?.();
    }
    private notify(level: 'info' | 'error', message: string): void { environment.ui?.notifications?.[level]?.(message); }
  };
}

function setOptions(select: HTMLSelectElement, options: Array<{ value: string; label: string }>, preferred: string): void {
  const document = (globalThis as any).document as Document | undefined;
  if (!document?.createElement) return;
  const current = preferred || select.value;
  select.replaceChildren(...options.map((entry) => {
    const option = document.createElement('option');
    option.value = entry.value;
    option.textContent = entry.label;
    return option;
  }));
  select.value = options.some((entry) => entry.value === current) ? current : (options[0]?.value ?? '');
}

function renderModelOptions(root: HTMLElement, models: readonly string[]): void {
  const list = root.querySelector('[data-model-options]') as HTMLDataListElement | null;
  const document = (globalThis as any).document as Document | undefined;
  if (!list || !document?.createElement) return;
  list.replaceChildren(...[...new Set(models)].map((model) => {
    const option = document.createElement('option');
    option.value = model;
    return option;
  }));
}

function protocolLabel(protocol: ForgeProviderProtocol): string {
  if (protocol === 'openai-chat') return 'OpenAI Chat Completions';
  if (protocol === 'openai-responses') return 'OpenAI Responses API';
  return 'Anthropic Messages';
}

function readForm(root: HTMLElement) {
  const value = (name: string) => (root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null)?.value ?? '';
  const mode = value('mode') as ForgeIntakeMode;
  const endpoint = value('endpoint').trim();
  const providerId = (value('provider') || inferForgeProviderId(endpoint)) as ForgeProviderId;
  const preset = getForgeProviderPreset(providerId);
  return {
    mode,
    source: value('source'),
    sourceName: value('displayName').trim() || 'Forge Intake source',
    displayName: value('displayName').trim(),
    endpoint,
    model: value('model').trim(),
    reviewModel: value('reviewModel').trim(),
    apiKey: value('apiKey'),
    persistApiKey: (root.querySelector('[name="persistApiKey"]') as HTMLInputElement | null)?.checked === true,
    providerId,
    protocol: (value('protocol') || preset.defaultProtocol) as ForgeProviderProtocol,
    authScheme: (value('authScheme') || preset.authSchemes[0] || 'bearer') as ForgeClientSettings['authScheme'],
    region: value('region').trim(),
    reasoning: (value('reasoning') || 'auto') as ForgeProviderReasoning,
    structuredOutput: (value('structuredOutput') || 'prompt_fallback') as ForgeStructuredOutputMode,
    useSeparateReviewModel: (root.querySelector('[name="useSeparateReviewModel"]') as HTMLInputElement | null)?.checked === true,
  };
}

function makeSnapshot(form: ReturnType<typeof readForm>, game: any): ForgeIntakeSnapshot {
  return createForgeIntakeSnapshot({
    source: form.source,
    displayName: form.displayName,
    mode: form.mode,
    objectKind: form.mode === 'ai-item' ? 'item' : 'actor',
    endpoint: form.mode === 'plaintext-actor' ? '' : form.endpoint,
    model: form.mode === 'plaintext-actor' ? '' : form.model,
    reviewModel: form.mode === 'plaintext-actor' ? '' : form.useSeparateReviewModel ? (form.reviewModel || form.model) : form.model,
    providerId: form.mode === 'plaintext-actor' ? '' : form.providerId,
    protocol: form.mode === 'plaintext-actor' ? '' : form.protocol,
    region: form.mode === 'plaintext-actor' ? '' : form.region,
    reasoning: form.mode === 'plaintext-actor' ? 'auto' : form.reasoning,
    structuredOutput: form.mode === 'plaintext-actor' ? 'prompt_fallback' : form.structuredOutput,
    fvttVersion: game.version,
    systemVersion: game.system.version,
    effectProfile: 'core',
    iconMode: 'off',
  });
}

function providerOptions(
  form: ReturnType<typeof readForm>,
  waitPolicy: NonNullable<Parameters<typeof createBrowserAiProvider>[0]['waitPolicy']>,
  onActivity?: NonNullable<Parameters<typeof createBrowserAiProvider>[0]['onActivity']>,
) {
  const connection = normalizeForgeProviderConnection({
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
  });
  return {
    apiKey: connection.apiKey,
    baseUrl: connection.baseUrl,
    model: connection.model,
    reviewModel: connection.reviewModel,
    providerId: connection.providerId,
    protocol: connection.protocol,
    authScheme: connection.authScheme,
    region: connection.region,
    reasoning: connection.reasoning,
    structuredOutput: connection.structuredOutput,
    waitPolicy,
    ...(onActivity ? { onActivity } : {}),
  };
}

function connectionIdentity(form: ReturnType<typeof readForm>): string {
  return JSON.stringify({
    providerId: form.providerId,
    endpoint: form.endpoint,
    protocol: form.protocol,
    authScheme: form.authScheme,
    region: form.region,
    model: form.model,
    reviewModel: form.useSeparateReviewModel ? (form.reviewModel || form.model) : form.model,
    useSeparateReviewModel: form.useSeparateReviewModel,
    reasoning: form.reasoning,
    structuredOutput: form.structuredOutput,
  });
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} 分 ${seconds} 秒`;
}
function providerActivityLabel(activity: IntakeProviderActivity): string {
  if (activity.phase === 'streaming_reasoning') return 'Provider 报告正在推理';
  if (activity.phase === 'streaming_output') return 'Provider 报告正在输出';
  if (activity.phase === 'completed') return 'Provider 已完成响应';
  if (activity.phase === 'failed') return 'Provider 响应失败';
  if (activity.phase === 'stopped') return '请求已由用户结束';
  if (activity.phase === 'validating') return '正在验证最终结构化响应';
  return '请求已发送，等待 Provider 活动';
}
function humanSummary(status: ForgeIntakeReviewStatus, analysis: IntakeAnalysis | undefined, generation: IntakeGeneration | undefined, response: IntakeResponse | undefined, applyable: boolean): string {
  if (!analysis && status === 'empty') return '填写输入后运行 Analyze；AI 模式需要先在步骤 1 测试当前连接。';
  if (status === 'analyzing') return 'AI 正在分析。请查看步骤 2 的活动卡；系统不会因为观察周期结束而自动重发请求。';
  if (status === 'ready_to_generate') return '分析已通过，可以生成候选；此时仍不会写入世界。';
  if (status === 'generating_and_reviewing') return '候选正在生成并复核；完成后请阅读 Findings 和证据。';
  if (status === 'accepted' && applyable) return '结果已 accepted，满足当前 snapshot 的创建门禁，可以 Confirm Create。';
  if (status === 'needs_review') return '结果需要人工审阅或一次 bounded repair；存在阻断 Finding 时不能创建。';
  if (status === 'rejected') return '结果已 Reject；可修改来源或 Regenerate 开启新 attempt。';
  if (status === 'failed') return '当前 attempt 失败；请先阅读 Findings，再决定是否 Regenerate。';
  if (response || generation) return '结果已生成，请按顺序查看摘要、时间线、Findings 和 evidence。';
  return '当前结果尚未满足创建门禁。';
}
function actorInput(form: ReturnType<typeof readForm>, requestId: string, game: any, onStage?: (stage: any) => void) {
  return { source: form.source, sourceName: form.sourceName, displayName: form.displayName, requestId, fvttVersion: game.version, systemVersion: game.system.version, onStage };
}
function itemInput(form: ReturnType<typeof readForm>, requestId: string, game: any, onStage?: (stage: any) => void) {
  return { source: form.source, sourceName: form.sourceName, displayName: form.displayName, requestId, fvttVersion: game.version, systemVersion: game.system.version, onStage };
}
function isActorGeneration(value: IntakeGeneration): value is BrowserActorGenerationResult { return 'evidence' in value && 'analysis' in value; }
function isItemGeneration(value: IntakeGeneration): value is BrowserItemGenerationResult { return 'formalStatus' in value && 'analysis' in value && !('evidence' in value); }
function actorResponseStatus(response: ForgeActorResponse): 'accepted' | 'needs_review' | 'failed' { return 'result' in response ? response.result.status : 'failed'; }

function formalActorResponseFindings(response: ForgeActorResponse): PlaintextGenerationResult['findings'] {
  if ('error' in response) {
    return [{
      id: `forge-intake:formal:${response.error.code}`,
      code: response.error.code,
      path: '/formal-workflow',
      message: response.error.message,
      blocking: true,
      origin: 'formal-workflow',
      evidence: [],
    }];
  }
  const findings = response.result.diagnostics.map((diagnostic, index) => ({
    id: `forge-intake:formal:${diagnostic.code}:${index}`,
    code: diagnostic.code,
    path: diagnostic.path,
    message: diagnostic.message,
    blocking: diagnostic.severity !== 'info',
    origin: 'formal-workflow',
    evidence: diagnostic.evidence ?? [],
  }));
  if (findings.length > 0) return findings;
  return [{
    id: `forge-intake:formal:${response.result.status}`,
    code: response.result.status === 'needs_review' ? 'FORGE_NEEDS_REVIEW' : 'FORGE_WORKFLOW_FAILED',
    path: '/formal-workflow',
    message: `Formal Actor workflow returned ${response.result.status} without a diagnostic.`,
    blocking: true,
    origin: 'formal-workflow',
    evidence: [],
  }];
}

function acceptedActorResponse(response: ForgeActorResponse): boolean {
  const decoded = decodeForgeActorResponse(response);
  if (!decoded.ok || !('result' in decoded.value)) return false;
  const result = decoded.value.result;
  return result.status === 'accepted' && result.verification.status === 'accepted' && Boolean(result.artifact && result.artifactHash)
    && result.diagnostics.length === 0 && result.actorVerification.warnings.length === 0
    && result.target.fvttRuntimeVersion === EXPECTED_FOUNDRY_VERSION && result.target.systemVersionObserved === EXPECTED_SYSTEM_VERSION;
}
function acceptedItemResponse(response: ForgeItemResponse): boolean {
  const decoded = decodeForgeItemResponse(response);
  if (!decoded.ok || !('result' in decoded.value)) return false;
  const result = decoded.value.result;
  return result.status === 'accepted' && result.verification.status === 'accepted' && Boolean(result.artifact && result.artifactHash)
    && !result.diagnostics.some((entry) => entry.severity === 'warning' || entry.severity === 'error')
    && result.target.fvttRuntimeVersion === EXPECTED_FOUNDRY_VERSION && result.target.systemVersionObserved === EXPECTED_SYSTEM_VERSION;
}
function isCurrentRuntime(game: any): boolean { try { assertGm(game); assertExactRuntime(game); return true; } catch { return false; } }
function allFindings(analysis?: IntakeAnalysis, generation?: IntakeGeneration, stale?: ReturnType<typeof staleFinding>) {
  const entries = [...((analysis as any)?.findings ?? []), ...((generation as any)?.findings ?? []), ...(stale ? [stale] : [])];
  return [...new Map(entries.map((entry: any) => [`${entry.id}\u0000${entry.code}\u0000${entry.path}`, entry])).values()] as any[];
}
function stageList(analysis: any, generation: any, progress: any[]) { return generation?.stages ?? analysis?.stages ?? progress; }
function staleFinding() { return { id: 'forge-intake:STALE_SNAPSHOT', code: 'STALE_SNAPSHOT', path: '/snapshot', message: '来源、模式、显示名、Provider、endpoint、协议、区域、model/reasoning 或 target 已变化；旧结果已过期。', blocking: true, origin: 'semantic', evidence: [] }; }
function cancelledFinding() { return { id: 'forge-intake:INTAKE_CANCELLED', code: 'INTAKE_CANCELLED', path: '/intake', message: 'Intake request was cancelled before world submission.', blocking: true, origin: 'semantic', evidence: [] }; }
function randomRequestId(mode: ForgeIntakeMode): string { return `forge-intake-${mode}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; }
function safeName(value: string): string { return value.replace(/[^a-zA-Z0-9._-]/gu, '-').slice(0, 120); }
function messageOf(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function safeUntrustedMessage(error: unknown): string { return escapeHtml(messageOf(error)).slice(0, 1_000); }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!)); }
function text(root: HTMLElement, key: string, value: string): void { const element = root.querySelector(`[data-${key}]`) as HTMLElement | null; if (element) element.textContent = value; }
function html(root: HTMLElement, key: string, value: string): void { const element = root.querySelector(`[data-${key}]`) as HTMLElement | null; if (element) element.innerHTML = value; }
function setDisabled(root: HTMLElement, action: string, disabled: boolean): void {
  const elements = typeof (root as any).querySelectorAll === 'function'
    ? root.querySelectorAll(`[data-action="${action}"]`)
    : [root.querySelector(`[data-action="${action}"]`)].filter(Boolean);
  for (const element of elements) (element as HTMLButtonElement).disabled = disabled;
}

function selectedImportFile(root: HTMLElement): File | undefined {
  return (root.querySelector('[name="reviewBundleFile"]') as HTMLInputElement | null)?.files?.[0];
}

function selectedLibraryFile(root: HTMLElement): File | undefined {
  return (root.querySelector('[name="sourceLibraryFile"]') as HTMLInputElement | null)?.files?.[0];
}

function selectedBatchFile(root: HTMLElement): File | undefined {
  return (root.querySelector('[name="batchCollectionFile"]') as HTMLInputElement | null)?.files?.[0];
}

function importedTargetCompatible(imported: ImportedForgeIntakeReviewRecord): boolean {
  const target = imported.bundle.target;
  return Boolean(target
    && target.fvttVersion === EXPECTED_FOUNDRY_VERSION
    && target.systemId === 'dnd5e'
    && target.systemVersion === EXPECTED_SYSTEM_VERSION
    && target.generatorProfile === 'v14'
    && target.effectProfile === 'core'
    && target.iconMode === 'off');
}

async function readReviewBundleFile(file: File): Promise<string> {
  if (Number.isFinite(file.size) && file.size > FORGE_INTAKE_REVIEW_BUNDLE_MAX_UTF8_BYTES) {
    throw new Error(`Review bundle 文件不能超过 ${FORGE_INTAKE_REVIEW_BUNDLE_MAX_UTF8_BYTES} bytes。`);
  }
  if (typeof file.text !== 'function') throw new Error('当前浏览器不能读取所选 review bundle。');
  return await file.text();
}

async function readSourceLibraryFile(file: File): Promise<string> {
  if (Number.isFinite(file.size) && file.size > FORGE_SOURCE_LIBRARY_MAX_UTF8_BYTES) {
    throw new Error(`Source library 文件不能超过 ${FORGE_SOURCE_LIBRARY_MAX_UTF8_BYTES} bytes。`);
  }
  if (typeof file.text !== 'function') throw new Error('当前浏览器不能读取所选 source library。');
  return await file.text();
}

function downloadReviewBundle(fileName: string, content: string): void {
  const urlApi = (globalThis as any).URL;
  const document = (globalThis as any).document;
  if (!urlApi?.createObjectURL || !document?.createElement) throw new Error('当前浏览器不能下载 review bundle。');
  const url = urlApi.createObjectURL(new Blob([content], { type: 'application/json' }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  } finally {
    urlApi.revokeObjectURL(url);
  }
}

function downloadBinaryFile(fileName: string, content: Uint8Array, type: string): void {
  const urlApi = (globalThis as any).URL;
  const document = (globalThis as any).document;
  if (!urlApi?.createObjectURL || !document?.createElement) throw new Error('当前浏览器不能下载 batch 文件。');
  const copy = new Uint8Array(content.byteLength);
  copy.set(content);
  const url = urlApi.createObjectURL(new Blob([copy.buffer], { type }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  } finally {
    urlApi.revokeObjectURL(url);
  }
}

function assertSafeReviewExport(content: string, form: ReturnType<typeof readForm>): void {
  const forbidden = [/"apiKey"\s*:/iu, /"authorization"\s*:/iu, /Bearer\s+\S+/iu, /"rawResponse"\s*:/iu, /"endpoint"\s*:/iu];
  if (forbidden.some((pattern) => pattern.test(content))) throw new Error('Review bundle safety scan rejected a credential or internal provider field.');
  for (const secret of [form.apiKey, form.endpoint]) {
    if (secret && content.includes(secret)) throw new Error('Review bundle safety scan found a configured secret value.');
  }
}

function assertSafeLibraryExport(content: string, form: ReturnType<typeof readForm>): void {
  assertConfiguredSecretsAbsent(content, [form.apiKey, form.endpoint]);
}

function safeLibraryMessage(error: unknown): string {
  const message = messageOf(error).replace(/[A-Za-z]:\\[^\s"']+/gu, '<local path>').slice(0, 1_000);
  return escapeHtml(message);
}

function sourceLibraryScope(game: any): string {
  const worldId = typeof game?.world?.id === 'string' ? game.world.id.trim() : '';
  const userId = typeof game?.user?.id === 'string' ? game.user.id.trim() : '';
  if (!worldId || !userId) throw new Error('Source library requires a resolved Foundry world ID and GM user ID.');
  return `${worldId}:${userId}`;
}
