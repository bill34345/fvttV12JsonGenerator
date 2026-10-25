import { isForgeCoreVersionSupported } from './mirror-core-compatibility';
import { iconReviewPresentation } from './iconReviewPresentation';
import { captureIntakeCandidate, revalidateIntakeCandidate, IndexedDbIntakeCandidateStore,
  type IntakeCandidateRecord, type IntakeCandidateStore } from './intakeCandidateRecovery';
import { createForgePaneBase, type ForgePaneBinding, type ForgePaneState } from './workspacePane';
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
  generateBrowserActorIntakeCandidate,
  reviewBrowserActorIntakeCandidate,
  approveBrowserActorIntakeCandidateForGm,
  assertCurrentBrowserActorIntakeCandidate,
  repairBrowserActorIntake,
  type BrowserActorGenerationResult,
  type BrowserActorIntakeInput,
  type BrowserActorIntakeAnalysis,
  type IntakeProviderActivity,
  type IntakeRequestWaitStatus,
} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {
  analyzeBrowserItemSourceWithAi,
  createBrowserItemAiProvider,
  generateBrowserItemIntakeCandidate,
  reviewBrowserItemIntakeCandidate,
  approveBrowserItemIntakeCandidateForGm,
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
  FORGE_INTAKE_REVIEW_RAW_SOURCE_MAX_UTF8_BYTES,
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
  hashSource,
  isUsableActorCandidateArtifact,
  type ForgeActorResponse,
  type ForgeItemResponse,
} from '@fvtt-json-generator/forge-gateway-protocol';
import { buildForgeItemRequest, convertFinalItemSource } from '@fvtt-json-generator/forge-browser-runtime';
import { claimForgeAiJob, releaseForgeAiJob } from './aiJobGate';
import { createForgeEncounterApplicationClass } from './encounterApplication';
import { createAcceptedForgeItem } from './itemRuntime';
import {
  assertExactRuntime,
  assertGm,
  createAcceptedForgeActor,
  createReviewedForgeActorCandidate,
  forgeActorCandidateReviewHash,
  EXPECTED_FOUNDRY_VERSION,
  EXPECTED_SYSTEM_VERSION,
} from './runtime';
import {
  clearApiKey,
  clientSettingsProfileId,
  readLocalIntakeSettings,
  clearAllApiKeys,
  type ForgeClientSettings,
} from './settings';
import * as forgeSettingsModule from './settings';
import {
  getForgeProviderPreset,
  inferForgeProviderId,
  normalizeBaseUrlIdentity,
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
type ForgeIntakeForm = {
  mode: ForgeIntakeMode;
  source: string;
  sourceName: string;
  displayName: string;
  endpoint: string;
  model: string;
  reviewModel: string;
  apiKey: string;
  persistApiKey: boolean;
  autoCorrect: boolean;
  providerId: ForgeProviderId;
  protocol: ForgeProviderProtocol;
  authScheme: ForgeClientSettings['authScheme'];
  region: string;
  reasoning: ForgeProviderReasoning;
  structuredOutput: ForgeStructuredOutputMode;
  useSeparateReviewModel: boolean;
};

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
  pane?: ForgePaneBinding;
  game: any;
  ui?: any;
  foundry?: any;
  window?: { addEventListener?: (event: string, callback: (event: any) => void) => void; removeEventListener?: (event: string, callback: (event: any) => void) => void };
  hooks?: { on?: (event: string, callback: (...args: any[]) => void) => unknown; off?: (event: string, id: unknown) => void };
  services?: Partial<ForgeIntakeApplicationServices>;
  initialMode?: ForgeIntakeMode;
  directoryKind?: 'Actor' | 'Item';
  openConnectionSettings?: () => unknown;
  openStructuredImport?: () => unknown;
  sourceLibrary?: ManagedForgeSourceLibrary;
  batchQueue?: ManagedForgeBatchQueue;
  candidateStore?: IntakeCandidateStore;
}

export interface ForgeIntakeApplicationServices {
  analyzePlaintextActorSource: typeof analyzePlaintextActorSource;
  analyzeBrowserActorSourceWithAi: typeof analyzeBrowserActorSourceWithAi;
  repairBrowserActorIntake: typeof repairBrowserActorIntake;
  generateBrowserActorIntakeCandidate: typeof generateBrowserActorIntakeCandidate;
  reviewBrowserActorIntakeCandidate: typeof reviewBrowserActorIntakeCandidate;
  approveBrowserActorIntakeCandidateForGm: typeof approveBrowserActorIntakeCandidateForGm;
  createBrowserAiProvider: typeof createBrowserAiProvider;
  analyzeBrowserItemSourceWithAi: typeof analyzeBrowserItemSourceWithAi;
  repairBrowserItemIntake: typeof repairBrowserItemIntake;
  generateBrowserItemIntakeCandidate: typeof generateBrowserItemIntakeCandidate;
  reviewBrowserItemIntakeCandidate: typeof reviewBrowserItemIntakeCandidate;
  approveBrowserItemIntakeCandidateForGm: typeof approveBrowserItemIntakeCandidateForGm;
  createBrowserItemAiProvider: typeof createBrowserItemAiProvider;
  testForgeProviderConnection: typeof testForgeProviderConnection;
  convertFinalActorSource: typeof convertFinalActorSource;
  convertFinalItemSource: typeof convertFinalItemSource;
  createAcceptedForgeActor: typeof createAcceptedForgeActor;
  createReviewedForgeActorCandidate: typeof createReviewedForgeActorCandidate;
  createAcceptedForgeItem: typeof createAcceptedForgeItem;
  readReviewBundleFile(file: File): Promise<string>;
  downloadReviewBundle(fileName: string, content: string): void;
  downloadBinaryFile(fileName: string, content: Uint8Array, type: string): void;
  /** Client-local session settings are intentionally separate from world data. */
  readForgeSessionSettings?: () => unknown;
  saveForgeSessionSettings?: (value: Partial<ForgeClientSettings>) => unknown;
  subscribeForgeSessionSettings?: (callback: (settings?: unknown) => void) => unknown;
  isForgeSessionConnectionReady?: (settings?: unknown) => unknown;
}

const DEFAULT_SERVICES: ForgeIntakeApplicationServices = {
  analyzePlaintextActorSource,
  analyzeBrowserActorSourceWithAi,
  repairBrowserActorIntake,
  generateBrowserActorIntakeCandidate,
  reviewBrowserActorIntakeCandidate,
  approveBrowserActorIntakeCandidateForGm,
  createBrowserAiProvider,
  analyzeBrowserItemSourceWithAi,
  repairBrowserItemIntake,
  generateBrowserItemIntakeCandidate,
  reviewBrowserItemIntakeCandidate,
  approveBrowserItemIntakeCandidateForGm,
  createBrowserItemAiProvider,
  testForgeProviderConnection,
  convertFinalActorSource,
  convertFinalItemSource,
  createAcceptedForgeActor,
  createReviewedForgeActorCandidate,
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
  const Base = environment.pane ? createForgePaneBase() : HandlebarsApplicationMixin(ApplicationV2);
  return class ForgeIntakeApplication extends Base {
    static DEFAULT_OPTIONS = {
      id: 'fvtt-json-forge-intake',
      classes: ['fvtt-json-forge', 'forge-intake-window'],
      position: { width: 860, height: 760 },
      window: { title: environment.directoryKind === 'Item' ? 'Forge · 物品工作台' : 'Forge · 生物工作台', resizable: true },
    };
    static PARTS = { form: { template: 'modules/fvtt-json-forge/templates/forge-intake.hbs' } };

    private status: ForgeIntakeReviewStatus = 'empty';
    // Navigation is independent of acceptance. Returning to the source alone
    // must not discard a valid result or manufacture a fresh review attempt.
    private editingSource = false;
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
    private reviewingCandidate = false;
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
    private readonly batchResponses = new Map<string, { mode: ForgeIntakeMode; rawSourceHash: ForgeIntakeSnapshot['rawSourceHash']; response?: IntakeResponse; candidate?: BrowserActorGenerationResult | BrowserItemGenerationResult; input?: ReturnType<typeof actorInput> }>();
    private readonly candidateStore = environment.candidateStore ?? new IndexedDbIntakeCandidateStore(sourceLibraryScope(environment.game));
    private recoveryLoad?: Promise<void>;
    private savedCandidates: Record<string, IntakeCandidateRecord> = {};
    private recoveryBusy = false;
    private readonly hasDirectoryContext = environment.directoryKind !== undefined;
    private readonly directoryKind: 'Actor' | 'Item' = environment.directoryKind === 'Item' ? 'Item' : 'Actor';
    private readonly initialMode: ForgeIntakeMode = resolveDirectoryMode(environment.initialMode, this.directoryKind);
    private settings: ForgeClientSettings = readLocalIntakeSettings((environment.window??(globalThis as any).window)?.location?.hostname??'');
    private sessionSettingsRaw: unknown = this.settings;
    private readonly sessionApi = resolveSessionSettingsApi(environment);
    private sessionUnsubscribe?: () => void;
    private sessionInitialized = false;
    private sessionChangePending = false;
    private activeRequestForm?: ReturnType<typeof readForm>;
    private sourceFileRevision = 0;
    private modeInitialized = false;
    private createdDocument?: { objectKind: 'actor' | 'item'; uuid: string; document: any; status: 'created' | 'existing'; readbackWarnings?:string[] };
    private connectionProbe?: Awaited<ReturnType<typeof testForgeProviderConnection>>;
    private connectionProbeRevision = -1;
    private connectionProbeIdentity = '';
    private connectionCredentialRevision = 0;
    private modelReviewCredentialRevision = -1;
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

    workspaceState(): ForgePaneState {
      return { stage: this.createdDocument ? 'created' : this.editingSource ? 'input'
        : this.analysis || this.generation || this.response || this.status !== 'empty' ? 'review' : 'input',
      locked: this.creating || this.batchApplying || this.batchRunning || this.importing };
    }

    invalidateWorkspaceCandidate(): boolean {
      if (this.workspaceState().locked) return false;
      this.cancel();
      this.createdDocument = undefined;
      const root = this.element as HTMLElement | undefined;
      if (root) this.invalidateReview(root);
      return true;
    }

    async _prepareContext() {
      const isItemDirectory = this.directoryKind === 'Item';
      return {
        directoryTitle: isItemDirectory ? '物品工作台' : '生物工作台',
        isActorDirectory: !isItemDirectory,
        isItemDirectory,
        initialMode: this.initialMode,
      };
    }

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

    private encounterAiProviderOptions(controller: AbortController) {
      const root = this.element as HTMLElement | undefined;
      if (!root || root.isConnected === false) throw new Error('请重新打开 Forge 工作台并确认 AI 连接设置。');
      const current = this.sessionApi.readForgeSessionSettings?.();
      const form = readForm(root);
      const effective = current === undefined ? form : { ...form, ...coerceForgeSessionSettings(current, this.settings) };
      if (!connectionConfigured(effective)) throw new Error('请先在 Forge · AI 连接中填写 Provider、模型和认证信息。');
      let sessionReady = false;
      try { sessionReady = this.sessionApi.isForgeSessionConnectionReady?.(current) === true; } catch { /* stale session cannot authorize a request */ }
      const inlineReady = this.connectionProbe?.status === 'connected'
        && this.connectionProbeRevision === this.connectionCredentialRevision
        && this.connectionProbeIdentity === connectionIdentity(effective);
      if (!sessionReady && !inlineReady) throw new Error('当前 AI 连接尚未测试或已失效；请打开 Forge · AI 连接测试当前模型后重试。');
      return this.aiProviderOptions(effective, controller);
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
            <p>已接收 ${status.receivedBytes ?? 0} 字节；维持连接信号 ${status.keepAliveCount ?? 0} 次。${status.lastDataAtMs === undefined ? '尚未观察到回复数据。' : '收到数据只表示连接有活动，不能证明模型已经开始生成。'}</p>
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
      this.initializeSessionSettings(root);
      this.initializeDirectoryMode(root);
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
        if (name === 'apiKey') input.oninput = () => this.onCredentialChanged(root);
        else if (name === 'endpoint') input.oninput = () => { input.dataset.forgeEndpointOverride = 'true'; invalidateConnection(); };
        else if (connectionFields.has(name)) input.onchange = invalidateConnection;
        else input.oninput = invalidate;
      }
      this.fillSettings(root);
      this.refreshAiVisibility(root);
      this.refreshProviderUi(root);
      const mode = root.querySelector('[name="mode"]') as HTMLSelectElement | null;
      if (mode) {
        mode.onchange = () => {
          if (!this.isDirectoryMode(mode.value as ForgeIntakeMode)) {
            mode.value = this.initialMode;
            this.notify('error', this.directoryKind === 'Item' ? 'Item 工作台只支持 AI 物品整理。' : 'Actor 工作台不支持当前物品模式。');
          }
          this.refreshAiVisibility(root);
          this.invalidateReview(root);
        };
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
      this.bind(root, 'connection-open', () => this.openConnectionSettings());
      this.bind(root, 'structured-open', () => this.openStructuredImport());
      this.bind(root, 'encounter-open', () => {
        if (this.directoryKind !== 'Actor' || this.busy() || this.batchApplying) return;
        try { assertGm(environment.game); assertExactRuntime(environment.game);
          const Encounter = createForgeEncounterApplicationClass({ ...environment, foundry: foundryGlobal,
            getAiOptions:controller=>this.encounterAiProviderOptions(controller),
            openAiConnection:()=>this.openConnectionSettings(),
            getAiWaitPolicy:controller=>({
              cycleMs:BROWSER_AI_WAIT_CYCLE_MS,
              cyclesBeforeDecision:BROWSER_AI_WAIT_CYCLES_BEFORE_DECISION,
              onDecision:async(status: IntakeRequestWaitStatus)=>{
                const decision=await this.promptAiWaitDecision(status);
                if(decision==='stop')controller.abort();
                return decision;
              },
            }) });
          new Encounter().render(true);
        } catch (error) { this.notify('error', messageOf(error)); }
      });
      this.bind(root, 'repair', () => void this.repair(root));
      this.bind(root,'download-actor',()=>{
        const form=readForm(root),candidate=this.generation as BrowserActorGenerationResult|undefined;
        const response=candidate?.candidateResponse??this.response;
        if(form.mode==='ai-item'||!this.snapshotCurrent(root)||!response||!('result'in response)||!('artifact'in response.result)||!response.result.artifact)return;
        this.services.downloadReviewBundle(`forge-actor-${safeName(this.attemptId)}.json`,JSON.stringify(response.result.artifact,null,2));
      });
      this.bind(root, 'generate', () => void this.generate(root));
      this.bind(root, 'model-review', () => void this.reviewCandidate(root));
      this.bind(root, 'regenerate', () => void this.regenerate(root));
      this.bind(root, 'reject', () => this.reject(root));
      this.bind(root, 'cancel', () => this.cancel());
      this.bind(root, 'clear', () => this.clear(root));
      this.bind(root, 'edit-source', () => this.editSource(root));
      this.bind(root, 'resume-review', () => this.resumeReview(root));
      this.bind(root, 'open-created', () => this.openCreatedDocument());
      this.bind(root, 'refresh-result', () => this.renderResult(root));
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
      this.bind(root, 'restore-candidate', () => void this.restoreSingleCandidate(root));
      this.bind(root, 'clear-candidate-cache', () => void this.clearCandidateCache(root));
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
      const sourceFile = root.querySelector('[name="sourceFile"]') as HTMLInputElement | null;
      if (sourceFile) sourceFile.onchange = () => void this.readSourceFile(root, sourceFile);
      this.bind(root, 'clear-key', () => {
        if (this.importedReview) return;
        try { assertGm(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
        this.settings = clearApiKey();
        this.fillSettings(root);
        this.onCredentialChanged(root);
        this.notify('info', 'API Key 已清除。');
      });
      this.bind(root, 'clear-all-keys', () => {
        if (this.importedReview) return;
        try { assertGm(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
        this.settings = clearAllApiKeys();
        this.fillSettings(root);
        this.onCredentialChanged(root);
        this.notify('info', '所有已保存 API Key 已清除。');
      });
      this.bind(root, 'toggle-key', () => this.toggleApiKeyVisibility(root));
      this.bind(root, 'toggle-endpoint', () => this.toggleEndpointOverride(root));
      this.bind(root, 'test-connection', () => void this.testConnection(root));
      this.bind(root, 'create', () => void this.create(root));
      this.registerSessionSettings(root);
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
      this.sourceFileRevision += 1;
      this.cancel();
      if (this.activeBatchJobId) {
        try { this.batchState = await this.batchQueue.interruptJob(this.activeBatchJobId, undefined, () => this.assertLibraryAuthority()); }
        catch { /* hard reload recovery will convert any remaining running record */ }
      }
      this.importRevision += 1;
      this.importing = false;
      this.unregisterAvailabilityHooks();
      this.unregisterPageGuard();
      this.sessionUnsubscribe?.();
      this.sessionUnsubscribe = undefined;
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
      if (!this.isDirectoryMode(form.mode)) {
        return void this.notify('error', this.directoryKind === 'Item' ? 'Item 工作台只支持 AI 物品整理。' : 'Actor 工作台只支持生物来源。');
      }
      const ai = form.mode !== 'plaintext-actor';
      if (ai && !connectionConfigured(form)) return void this.notify('error', '请先点击“AI 连接设置”，完成 Provider、模型和认证配置。');
      if (ai && !this.connectionReady(form)) return void this.notify('error', 'AI 连接尚未测试或已失效，请点击“AI 连接设置”重新测试。');
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
      this.editingSource = false;
      this.status = regenerated
        ? transitionForgeIntakeReviewStatus(transitionForgeIntakeReviewStatus(this.status, 'regenerate'), 'regeneration_started')
        : transitionForgeIntakeReviewStatus(this.status, 'analyze');
      const controller = new AbortController();
      const revision = ++this.revision;
      this.controller = controller;
      this.activeRequestForm = form;
      (root as any).__forgeIntakeRequestForm = form;
      this.sessionChangePending = false;
      this.renderResult(root);
      try {
        let nextAnalysis: IntakeAnalysis;
        if (form.mode === 'plaintext-actor') {
          nextAnalysis = this.services.analyzePlaintextActorSource(form.source);
        } else if (form.mode === 'ai-monster') {
          const provider = this.services.createBrowserAiProvider(this.aiProviderOptions(form, controller), controller.signal);
          nextAnalysis = await this.services.analyzeBrowserActorSourceWithAi(
            actorInput(form, this.requestId, environment.game, (stage) => this.updateStage(root, controller, revision, stage)),
            provider,
            controller.signal,
            this.attemptId,
          );
        } else {
          const provider = this.services.createBrowserItemAiProvider(this.aiProviderOptions(form, controller), controller.signal);
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
        if (this.controller === controller) {
          this.controller = undefined;
          this.finishSessionRequest(root);
        }
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
      if (!this.isDirectoryMode(form.mode)) return void this.notify('error', '当前工作台不支持这个 Intake 类型。');
      if (!claimForgeAiJob(this)) return void this.notify('error', '已有 Forge AI Intake 任务正在运行。');
      const controller = new AbortController();
      const revision = ++this.revision;
      this.controller = controller;
      this.activeRequestForm = form;
      (root as any).__forgeIntakeRequestForm = form;
      this.sessionChangePending = false;
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
        if (this.controller === controller) {
          this.controller = undefined;
          this.finishSessionRequest(root);
        }
        releaseForgeAiJob(this);
        this.renderResult(root);
      }
    }

    private async generate(root: HTMLElement, fromBatch = false): Promise<void> {
      if (this.busy() || this.importedReview || (!fromBatch && (this.batchRunning || this.batchApplying)) || !(this.status==='ready_to_generate'||this.status==='needs_review'&&readForm(root).mode==='ai-monster'&&!!(this.analysis as BrowserActorIntakeAnalysis)?.ir) || !this.snapshotCurrent(root) || !this.analysis) return;
      const form = readForm(root);
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      if (!this.isDirectoryMode(form.mode)) return void this.notify('error', '当前工作台不支持这个 Intake 类型。');
      const ai = form.mode !== 'plaintext-actor';
      if (ai && !claimForgeAiJob(this)) return void this.notify('error', '已有 Forge AI Intake 任务正在运行。');
      const controller = new AbortController();
      const revision = ++this.revision;
      this.controller = controller;
      this.activeRequestForm = form;
      (root as any).__forgeIntakeRequestForm = form;
      this.sessionChangePending = false;
      this.status = transitionForgeIntakeReviewStatus(this.status, 'generate');
      this.renderResult(root);
      try {
        let nextGeneration: IntakeGeneration;
        if (form.mode === 'plaintext-actor') {
          nextGeneration = await this.generatePlaintext(form, this.analysis as BrowserPlaintextActorAnalysis);
        } else if (form.mode === 'ai-monster') {
          const provider = this.services.createBrowserAiProvider(this.aiProviderOptions(form, controller), controller.signal);
          nextGeneration = await this.services.generateBrowserActorIntakeCandidate(
            actorInput(form, this.requestId, environment.game), this.analysis as BrowserActorIntakeAnalysis, provider, controller.signal,
          );
        } else {
          const provider = this.services.createBrowserItemAiProvider(this.aiProviderOptions(form, controller), controller.signal);
          nextGeneration = await this.services.generateBrowserItemIntakeCandidate(
            itemInput(form, this.requestId, environment.game), this.analysis as BrowserItemIntakeAnalysis, provider, controller.signal,
          );
        }
        if (!this.isCurrent(controller, revision)) return;
        this.generation = nextGeneration;
        this.modelReviewCredentialRevision = this.connectionCredentialRevision;
        this.response = nextGeneration.response;
        this.status = transitionForgeIntakeReviewStatus(this.status,
          nextGeneration.status === 'ready_for_gm_review' ? 'generation_ready_for_gm_review' : nextGeneration.status === 'accepted' ? 'generation_accepted' : nextGeneration.status === 'needs_review' ? 'generation_needs_review' : 'generation_failed');
        if (!fromBatch) await this.saveCandidate(root, 'single');
      } catch (error) {
        if (!controller.signal.aborted && this.isCurrent(controller, revision)) {
          this.status = transitionForgeIntakeReviewStatus(this.status, 'generation_failed');
          this.notify('error', messageOf(error));
          this.focusError(root);
        }
      } finally {
        if (this.controller === controller) {
          this.controller = undefined;
          this.finishSessionRequest(root);
        }
        if (ai) releaseForgeAiJob(this);
        this.renderResult(root);
      }
    }

    private async reviewCandidate(root: HTMLElement): Promise<void> {
      if (this.busy() || this.importedReview || this.batchRunning || this.batchApplying || this.createdDocument
        || this.status !== 'ready_for_gm_review' || !this.snapshotCurrent(root) || !this.generation
        || !['ai-monster', 'ai-item'].includes(readForm(root).mode)) return;
      const form = readForm(root);
      if ((this.generation as BrowserActorGenerationResult | BrowserItemGenerationResult).modelReviewStatus !== 'not_requested') return;
      if (this.modelReviewCredentialRevision !== this.connectionCredentialRevision) return;
      if (!this.connectionReady(form)) return void this.notify('error', 'AI 审核需要当前已测试的连接。');
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      if (!claimForgeAiJob(this)) return void this.notify('error', '已有 Forge AI Intake 任务正在运行。');
      const controller = new AbortController();
      const revision = ++this.revision;
      this.controller = controller;
      this.reviewingCandidate = true;
      this.activeRequestForm = form;
      (root as any).__forgeIntakeRequestForm = form;
      this.renderResult(root);
      try {
        const generation = this.generation;
        const reviewed = form.mode === 'ai-item'
          ? await this.services.reviewBrowserItemIntakeCandidate(
            itemInput(form, this.requestId, environment.game), generation as BrowserItemGenerationResult,
            this.services.createBrowserItemAiProvider(this.aiProviderOptions(form, controller), controller.signal), controller.signal,
          )
          : await this.services.reviewBrowserActorIntakeCandidate(
            actorInput(form, this.requestId, environment.game), generation as BrowserActorGenerationResult,
            this.services.createBrowserAiProvider(this.aiProviderOptions(form, controller), controller.signal), controller.signal,
          );
        if (!this.isCurrent(controller, revision)) return;
        this.generation = reviewed;
        this.response = reviewed.response;
        this.status = reviewed.status === 'ready_for_gm_review'
          ? 'ready_for_gm_review' : reviewed.status === 'accepted' ? 'accepted' : 'needs_review';
        await this.saveCandidate(root, 'single');
      } catch (error) {
        if (!controller.signal.aborted && this.isCurrent(controller, revision)) {
          this.notify('error', messageOf(error));
        }
      } finally {
        this.reviewingCandidate = false;
        if (this.controller === controller) {
          this.controller = undefined;
          this.finishSessionRequest(root);
        }
        releaseForgeAiJob(this);
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
      // runAnalysis replaces the attempt only after its preflight succeeds.
      // Keep the previous findings available if connection or source checks fail.
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
      this.sourceFileRevision += 1;
      if (this.importedReview) {
        this.importedReview = undefined;
        const importFile = root.querySelector('[name="reviewBundleFile"]') as HTMLInputElement | null;
        if (importFile) importFile.value = '';
        this.renderResult(root);
        return;
      }
      this.cancel();
      this.status = this.status === 'committing_and_reading_back' ? this.status : transitionForgeIntakeReviewStatus(this.status, 'clear');
      void this.forgetCandidate('single');
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
      this.createdDocument = undefined;
      this.editingSource = false;
      const source = root.querySelector('[name="source"]') as HTMLTextAreaElement | null;
      const displayName = root.querySelector('[name="displayName"]') as HTMLInputElement | null;
      const sourceFile = root.querySelector('[name="sourceFile"]') as HTMLInputElement | null;
      if (source) setSourceValue(source, '');
      if (displayName) displayName.value = '';
      if (sourceFile) sourceFile.value = '';
      this.renderResult(root);
      source?.focus?.();
    }

    private editSource(root: HTMLElement): void {
      if (this.busy() || this.importedReview || this.createdDocument || this.batchRunning || this.batchApplying) return;
      this.editingSource = true;
      this.renderResult(root);
      (root.querySelector('[name="source"]') as HTMLElement | null)?.focus?.();
    }

    private resumeReview(root: HTMLElement): void {
      if (this.busy() || this.importedReview || this.createdDocument || this.status === 'empty' || this.batchRunning || this.batchApplying) return;
      this.editingSource = false;
      this.renderResult(root);
      (root.querySelector('[data-status]') as HTMLElement | null)?.focus?.();
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
      const previewResponse = this.response ?? (this.generation as BrowserActorGenerationResult | BrowserItemGenerationResult | undefined)?.candidateResponse;
      const responseResult: any = previewResponse && 'result' in previewResponse ? previewResponse.result : undefined;
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
        deterministicFindings: generation?.deterministicFindings ?? findings.filter((entry: any) => entry.origin !== 'ai-review'),
        aiReviewFindings: generation?.modelReviewFindings ?? findings.filter((entry: any) => entry.origin === 'ai-review'),
        ...(generation?.review?.verdict ? { reviewVerdict: generation.review.verdict } : {}),
        ...(generation?.modelReviewStatus ? { modelReviewStatus: generation.modelReviewStatus } : {}),
        ...(generation?.candidateHash ? { candidateHash: generation.candidateHash } : {}),
        ...(generation?.gmApproval ? { gmApproval: generation.gmApproval } : {}),
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
          requestId: previewResponse!.requestId,
          status: responseResult.status,
          ...('artifactHash' in responseResult ? { artifactHash: responseResult.artifactHash } : 'artifact'in responseResult&&responseResult.artifact?{artifactHash:hashArtifact(responseResult.artifact)}:{}),
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
        this.notify('error', '导入记录的 target 与当前 Foundry 14.364 或 14.368 / dnd5e 5.3.3 安全边界不兼容，不能开启新 attempt。');
        return;
      }
      if (!this.isDirectoryMode(this.importedReview.bundle.mode)
        || (this.directoryKind === 'Item' && this.importedReview.bundle.objectKind !== 'item')
        || (this.directoryKind === 'Actor' && this.importedReview.bundle.objectKind !== 'actor')) {
        this.notify('error', this.directoryKind === 'Item'
          ? 'Item 工作台只能从 Item 审核记录开启新一轮。'
          : 'Actor 工作台只能从 Actor 审核记录开启新一轮。');
        return;
      }
      const imported = this.importedReview;
      this.sourceFileRevision += 1;
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
      this.createdDocument = undefined;
      this.editingSource = true;
      const source = root.querySelector('[name="source"]') as HTMLTextAreaElement | null;
      const displayName = root.querySelector('[name="displayName"]') as HTMLInputElement | null;
      const mode = root.querySelector('[name="mode"]') as HTMLSelectElement | null;
      if (source) setSourceValue(source, imported.bundle.rawSource);
      if (displayName) displayName.value = imported.bundle.sourceLabel ?? imported.bundle.candidate?.label ?? '';
      if (mode) mode.value = imported.bundle.mode;
      const importFile = root.querySelector('[name="reviewBundleFile"]') as HTMLInputElement | null;
      if (importFile) importFile.value = '';
      this.refreshAiVisibility(root);
      this.refreshProviderUi(root);
      this.renderResult(root);
      const options = root.querySelector('[data-input-options]') as HTMLDetailsElement | null;
      if (options) options.open = true;
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
      if (!this.isDirectoryMode(sourceRecord.mode)
        || (this.directoryKind === 'Item' && sourceRecord.objectKind !== 'item')
        || (this.directoryKind === 'Actor' && sourceRecord.objectKind !== 'actor')) {
        return void this.notify('error', this.directoryKind === 'Item' ? 'Item 工作台不能打开 Actor 来源。' : 'Actor 工作台不能打开 Item 来源。');
      }
      this.resetWorkspaceState();
      const source = root.querySelector('[name="source"]') as HTMLTextAreaElement | null;
      const displayName = root.querySelector('[name="displayName"]') as HTMLInputElement | null;
      const mode = root.querySelector('[name="mode"]') as HTMLSelectElement | null;
      if (source) setSourceValue(source, sourceRecord.rawSource);
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
      if (!this.isDirectoryMode(review.bundle.mode)
        || (this.directoryKind === 'Item' && review.bundle.objectKind !== 'item')
        || (this.directoryKind === 'Actor' && review.bundle.objectKind !== 'actor')) {
        return void this.notify('error', this.directoryKind === 'Item' ? 'Item 工作台不能打开 Actor review。' : 'Actor 工作台不能打开 Item review。');
      }
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
      this.sourceFileRevision += 1;
      this.cancel();
      this.status = 'empty';
      this.editingSource = false;
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
      this.createdDocument = undefined;
    }

    private async create(root: HTMLElement): Promise<void> {
      if (environment.pane?.active() === false) return;
      if (this.busy() || this.batchRunning || this.batchApplying || this.createdDocument || !this.isApplyable(root) || !this.snapshot) return;
      const mode = readForm(root).mode;
      this.creating = true;
      this.renderResult(root);
      try {
        assertGm(environment.game);
        assertExactRuntime(environment.game);
        if (!this.isApplyable(root)) throw new Error('Review snapshot 或 accepted gate 在提交前已失效。');
        if (this.status === 'ready_for_gm_review' && this.generation) {
          const form = readForm(root);
          const approved = mode === 'ai-item'
            ? this.services.approveBrowserItemIntakeCandidateForGm(itemInput(form, this.requestId, environment.game), this.generation as BrowserItemGenerationResult, environment.game.user.id)
            : this.services.approveBrowserActorIntakeCandidateForGm(actorInput(form, this.requestId, environment.game), this.generation as BrowserActorGenerationResult, environment.game.user.id);
          if (!approved.response || approved.status!=='accepted'&&!approved.gmApproval) throw new Error('当前候选缺少 GM 确认证明。');
          this.generation = approved;
          this.response = approved.response;
          this.status = transitionForgeIntakeReviewStatus(this.status, approved.status==='accepted'?'gm_approve':'gm_approve_candidate');
        }
        if (!this.response) throw new Error('缺少已确认的正式 response。');
        this.status = transitionForgeIntakeReviewStatus(this.status, 'commit');
        if (mode === 'ai-item') {
          const result = await this.services.createAcceptedForgeItem({ game: environment.game, response: this.response as ForgeItemResponse });
          this.createdDocument = { objectKind: 'item', uuid: result.uuid, document: result.item, status: result.status };
          this.notify('info', result.status === 'existing' ? `已复用 Item：${result.uuid}` : `Item 创建并回读成功：${result.uuid}`);
        } else {
          const response=this.response as ForgeActorResponse;
          const reviewed=(this.generation as BrowserActorGenerationResult|undefined)?.gmApproval;
          const result = reviewed&&'result'in response&&response.result.status!=='accepted'
          ? await this.services.createReviewedForgeActorCandidate({game:environment.game,response,rawSourceHash:this.snapshot.rawSourceHash,
            reviewApproval:{gmId:reviewed.gmId,sourceHash:reviewed.finalSourceHash,artifactHash:reviewed.artifactHash,findingsHash:forgeActorCandidateReviewHash(response)}})
          : await this.services.createAcceptedForgeActor({
            game: environment.game,
            response: this.response as ForgeActorResponse,
            ...(mode === 'ai-monster' ? { rawSourceHash: this.snapshot.rawSourceHash } : {}),
          });
          this.createdDocument = { objectKind: 'actor', uuid: result.uuid, document: result.actor, status: result.status, readbackWarnings:result.readbackWarnings };
          this.notify('info', `${result.status==='existing'?'已复用':'已创建'} Actor：${result.uuid}${result.readbackWarnings?.length?'；部分录入值需要核对，请查看 Forge 完成页。':''}`);
        }
        await this.forgetCandidate('single');
      } catch (error) {
        this.notify('error', messageOf(error));
      } finally {
        this.creating = false;
        this.sessionChangePending = false;
        root = (this.element as HTMLElement | undefined) ?? root;
        (root as any).__forgeSessionSettings = this.settings;
        if (this.status === 'committing_and_reading_back') this.status = transitionForgeIntakeReviewStatus(this.status,
          this.generation?.status==='ready_for_gm_review'&&(this.generation as BrowserActorGenerationResult).gmApproval?'commit_candidate_finished':'commit_finished');
        this.renderResult(root);
      }
    }

    private isApplyable(root: HTMLElement): boolean {
      if (this.importedReview || this.createdDocument) return false;
      if (!['ready_for_gm_review', 'reviewed_candidate','accepted', 'committing_and_reading_back'].includes(this.status) || !this.snapshotCurrent(root) || !isCurrentRuntime(environment.game)) return false;
      if (this.status === 'ready_for_gm_review' && this.generation?.status !== 'ready_for_gm_review') return false;
      const localFindings = [...((this.analysis as any)?.findings ?? []),
        ...(readForm(root).mode === 'plaintext-actor'
          ? (this.generation?.findings ?? [])
          : ((this.generation as BrowserActorGenerationResult | BrowserItemGenerationResult | undefined)?.deterministicFindings ?? [])),
        ...(this.staleFinding ? [this.staleFinding] : [])];
      if (localFindings.some((entry) => entry.blocking) && !(readForm(root).mode==='ai-monster'&&(this.generation as BrowserActorGenerationResult)?.candidateAvailable)) return false;
      const mode = readForm(root).mode;
      const response = this.response ?? (this.generation as BrowserActorGenerationResult | BrowserItemGenerationResult | undefined)?.candidateResponse;
      if (!response) return false;
      return mode === 'ai-item'
        ? acceptedItemResponse(response as ForgeItemResponse)
        : acceptedActorResponse(response as ForgeActorResponse) || mode==='ai-monster'&&!!(this.generation as BrowserActorGenerationResult)?.candidateAvailable
          &&'result'in response&&'artifact'in response.result&&!!response.result.artifact;
    }

    private connectionReady(form: ReturnType<typeof readForm>): boolean {
      if (form.mode === 'plaintext-actor') return true;
      if (!this.isDirectoryMode(form.mode)) return false;
      if (this.sessionApi.isForgeSessionConnectionReady) {
        try {
          const result = this.sessionApi.isForgeSessionConnectionReady(this.sessionSettingsRaw ?? this.settings);
          if (result === true) return true;
          if (result && typeof result === 'object' && 'ready' in (result as Record<string, unknown>) && (result as { ready?: unknown }).ready === true) return true;
        } catch { /* fall back to the legacy inline probe below */ }
      }
      return this.connectionProbe?.status === 'connected'
        && this.connectionProbeRevision === this.connectionCredentialRevision
        && this.connectionProbeIdentity === connectionIdentity(form);
    }

    private openConnectionSettings(): void {
      if (this.busy() || this.creating) return;
      try {
        const result = environment.openConnectionSettings?.();
        if (result === undefined && !environment.openConnectionSettings) this.notify('error', 'AI 连接设置入口当前不可用，请从模块设置打开 Forge 连接设置。');
      } catch (error) { this.notify('error', messageOf(error)); }
    }

    private openStructuredImport(): void {
      if (this.busy() || this.creating) return;
      try {
        const result = environment.openStructuredImport?.();
        if (result === undefined && !environment.openStructuredImport) this.notify('error', '标准资料导入入口当前不可用，请从目录工具打开 Forge Actor/Item 导入。');
      } catch (error) { this.notify('error', messageOf(error)); }
    }

    private async readSourceFile(root: HTMLElement, input: HTMLInputElement): Promise<void> {
      if (this.busy() || this.creating) return;
      const file = input.files?.[0];
      if (!file) return;
      // Selecting a file is itself a source change. Invalidate the old
      // accepted result before awaiting File.text(), then capture a new
      // revision so a later manual edit/clear can win the race.
      this.invalidateReview(root);
      const revision = ++this.sourceFileRevision;
      const name = typeof file.name === 'string' ? file.name : '';
      if (name && !/\.(?:md|txt)$/iu.test(name)) {
        input.value = '';
        this.notify('error', '来源文件只支持 Markdown（.md）或纯文本（.txt）。');
        return;
      }
      try {
        if (Number.isFinite(file.size) && file.size > FORGE_INTAKE_REVIEW_RAW_SOURCE_MAX_UTF8_BYTES) {
          throw new Error(`来源文件不能超过 ${FORGE_INTAKE_REVIEW_RAW_SOURCE_MAX_UTF8_BYTES} bytes。`);
        }
        if (typeof file.text !== 'function') throw new Error('当前浏览器不能读取所选来源文件。');
        const source = await file.text();
        root = (this.element as HTMLElement | undefined) ?? root;
        if (revision !== this.sourceFileRevision || input.files?.[0] !== file || this.busy() || this.creating || root.isConnected === false) return;
        const textarea = root.querySelector('[name="source"]') as HTMLTextAreaElement | null;
        if (!textarea) return;
        setSourceValue(textarea, source);
        const displayName = root.querySelector('[name="displayName"]') as HTMLInputElement | null;
        if (displayName && !displayName.value.trim() && name) displayName.value = name.replace(/\.(?:md|txt)$/iu, '');
        (textarea.oninput as any)?.();
        this.notify('info', `已读取来源文件：${name || '未命名文件'}。`);
      } catch (error) {
        if (revision !== this.sourceFileRevision) return;
        this.notify('error', messageOf(error));
      }
    }

    private initializeSessionSettings(root: HTMLElement): void {
      if (!this.sessionInitialized) {
        this.sessionInitialized = true;
        try {
          const raw = this.sessionApi.readForgeSessionSettings?.();
          if (raw !== undefined) this.applySessionSettings(raw);
        } catch (error) { this.notify('error', `无法读取 AI 连接设置：${messageOf(error)}`); }
      }
      (root as any).__forgeSessionSettings = this.settings;
      (root as any).__forgeIntakeRequestForm = this.activeRequestForm;
      (root as any).__forgeIntakeInitialMode = this.initialMode;
    }

    private registerSessionSettings(root: HTMLElement): void {
      if (this.sessionUnsubscribe || !this.sessionApi.subscribeForgeSessionSettings) return;
      try {
        const unsubscribe = this.sessionApi.subscribeForgeSessionSettings((next) => {
          const activeRoot = this.element as HTMLElement | undefined;
          if (activeRoot) this.onSessionSettingsChanged(activeRoot, next);
        });
        if (typeof unsubscribe === 'function') this.sessionUnsubscribe = unsubscribe as () => void;
        else if (unsubscribe && typeof unsubscribe === 'object' && typeof (unsubscribe as any).unsubscribe === 'function') {
          this.sessionUnsubscribe = () => (unsubscribe as any).unsubscribe();
        }
      } catch (error) { this.notify('error', `无法订阅 AI 连接设置：${messageOf(error)}`); }
    }

    private onSessionSettingsChanged(root: HTMLElement, next?: unknown): void {
      let raw = next;
      try { if (raw === undefined) raw = this.sessionApi.readForgeSessionSettings?.(); } catch (error) {
        this.notify('error', `无法刷新 AI 连接设置：${messageOf(error)}`);
        return;
      }
      if (raw === undefined) return;
      const previous = this.settings;
      this.applySessionSettings(raw);
      const changed = sessionConnectionIdentity(previous) !== sessionConnectionIdentity(this.settings);
      const credentialChanged = previous.apiKey !== this.settings.apiKey;
      (root as any).__forgeSessionSettings = this.settings;
      if (!changed) {
        if (credentialChanged) {
          this.fillSettings(root);
          this.onCredentialChanged(root);
        }
        else this.renderResult(root);
        return;
      }
      if (this.busy() || this.creating) {
        this.sessionChangePending = true;
        if (this.controller) {
          this.controller.abort();
          this.revision += 1;
        }
        this.renderResult(root);
        return;
      }
      this.invalidateReview(root);
    }

    private onCredentialChanged(root: HTMLElement): void {
      this.connectionCredentialRevision += 1;
      this.connectionProbe = undefined;
      this.connectionProbeRevision = -1;
      this.connectionProbeIdentity = '';
      if (this.controller) {
        this.controller.abort();
        this.revision += 1;
        // A paid review has not replaced the locally verified candidate yet.
        // Other in-flight Provider work has no completed candidate to preserve.
        if (!this.reviewingCandidate) this.sessionChangePending = true;
      }
      this.renderResult(root);
    }

    private applySessionSettings(raw: unknown): void {
      this.sessionSettingsRaw = raw;
      this.settings = coerceForgeSessionSettings(raw, this.settings);
    }

    private initializeDirectoryMode(root: HTMLElement): void {
      const mode = root.querySelector('[name="mode"]') as HTMLSelectElement | null;
      if (!mode) return;
      const allowed = this.allowedModes();
      if (!this.modeInitialized) {
        mode.value = this.initialMode;
        this.modeInitialized = true;
      }
      if (!allowed.includes(mode.value as ForgeIntakeMode)) mode.value = allowed[0] ?? this.initialMode;
      (root as any).__forgeIntakeModeInitialized = true;
    }

    private allowedModes(): ForgeIntakeMode[] {
      if (!this.hasDirectoryContext) return ['ai-monster', 'plaintext-actor', 'ai-item'];
      return this.directoryKind === 'Item' ? ['ai-item'] : ['ai-monster', 'plaintext-actor'];
    }

    private isDirectoryMode(mode: ForgeIntakeMode): boolean { return this.allowedModes().includes(mode); }

    private finishSessionRequest(root: HTMLElement): void {
      root = (this.element as HTMLElement | undefined) ?? root;
      this.activeRequestForm = undefined;
      (root as any).__forgeIntakeRequestForm = undefined;
      if (this.sessionChangePending) {
        this.sessionChangePending = false;
        (root as any).__forgeSessionSettings = this.settings;
        this.invalidateReview(root);
      }
    }

    private invalidateReview(root: HTMLElement): void {
      if (this.creating) return;
      this.sourceFileRevision += 1;
      this.controller?.abort();
      this.revision += 1;
      this.response = undefined;
      if (this.status !== 'empty') {
        this.status = 'needs_review';
        this.staleFinding = staleFinding();
      }
      this.editingSource = true;
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
      if (!this.reviewingCandidate) this.staleFinding = cancelledFinding();
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
      this.renderRecovery(root);
      root = (this.element as HTMLElement | undefined) ?? root;
      environment.pane?.changed();
      this.renderLibrary(root);
      const form = readForm(root);
      if (this.importedReview) {
        this.renderImportedReview(root, form);
        return;
      }
      const previewResponse = this.response ?? (this.generation as BrowserActorGenerationResult | BrowserItemGenerationResult | undefined)?.candidateResponse;
      const responseResult: any = previewResponse && 'result' in previewResponse ? previewResponse.result : undefined;
      const findings = allFindings(this.analysis, this.generation, this.staleFinding);
      const currentStep = this.createdDocument
        ? 'created'
        : this.editingSource ? 'input'
          : this.analysis || this.generation || this.response || this.status !== 'empty' ? 'review' : 'input';
      const connectionSummary = root.querySelector('[data-connection-summary]') as HTMLElement | null;
      if (connectionSummary) connectionSummary.textContent = connectionSummaryMessage(form, this.connectionReady(form));
      text(root, 'status', this.creating
        ? '状态：正在提交并重新读取核对（不可取消）。'
        : this.providerActivity?.phase === 'stopped' ? `请求已停止 · ${reviewStatusLabel(this.status)}` : reviewStatusLabel(this.status));
      text(root, 'human-summary', humanSummary(this.status, this.analysis, this.generation, previewResponse, this.isApplyable(root)));
      text(root, 'icon-review', responseResult ? iconReviewPresentation([responseResult.iconReview]) : '');
      html(root, 'stages', stageList(this.analysis, this.generation, this.stageProgress).map((entry: any) => `<li>${escapeHtml(entry.stage)}：${escapeHtml(entry.status)}${entry.message ? ` — ${escapeHtml(entry.message)}` : ''}</li>`).join(''));
      const diagnostics = root.querySelector('[data-diagnostics]') as HTMLElement | null;
      const modelReviewError = (this.generation as BrowserActorGenerationResult | BrowserItemGenerationResult | undefined)?.modelReviewError;
      if (diagnostics) diagnostics.hidden = findings.length === 0 && !(responseResult?.diagnostics?.length) && !modelReviewError;
      const issueMarkup=renderIssueList([...findings,...(responseResult?.diagnostics??[]),
        ...spellResolutionIssues(this.createdDocument?.document),
        ...(this.createdDocument?.readbackWarnings??[]).map((message,index)=>({code:'FOUNDRY_READBACK_DIFFERENCE',path:`/readback/${index}`,message})),
        ...(modelReviewError?[{code:'AI_REVIEW_FAILED',message:`AI 审核未完成：${modelReviewError}`}]:[])],(this.analysis as any)?.ir);
      html(root, 'diagnostic-list', issueMarkup);
      html(root, 'completion-issues', issueMarkup);
      const completion=root.querySelector('[data-completion-diagnostics]') as HTMLElement|null;
      if(completion)completion.hidden=!issueMarkup;
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
        modelReviewStatus: (this.generation as any)?.modelReviewStatus ?? 'not_requested',
        providerObservation: this.providerActivity,
        gmApproval: (this.generation as any)?.gmApproval,
        history: this.history,
      }, null, 2));
      text(root, 'canonical', (this.generation as any)?.finalSource ?? (this.analysis as any)?.canonicalSource ?? '');
      text(root, 'raw-source', this.reviewSource);
      text(root, 'preview', responseResult ? JSON.stringify(form.mode === 'ai-item'
        ? { item: responseResult.itemDocument, verification: responseResult.itemVerification }
        : { actor: responseResult.actorVerification?.actor, items: responseResult.actorVerification?.items }, null, 2) : '');
      html(root, 'human-preview', responseResult ? humanPreview(form, responseResult) : analysisPreview(this.analysis));
      text(root, 'json', responseResult && 'artifact' in responseResult ? JSON.stringify(responseResult.artifact, null, 2) : '');
      const previewSection = root.querySelector('[data-preview-section]') as HTMLElement | null;
      if (previewSection) previewSection.hidden = !this.analysis && !this.generation && !this.response;
      const activityCard = root.querySelector('[data-activity-card]') as HTMLElement | null;
      if (activityCard) activityCard.hidden = currentStep !== 'review' || form.mode === 'plaintext-actor' || (!this.controller && !this.providerActivity);
      if (this.providerActivity) {
        const activity = this.providerActivity;
        const activityLabel = providerActivityLabel(activity);
        text(root, 'activity-summary', `${activityLabel} · 已等待 ${formatDuration(activity.elapsedMs)}`);
        text(root, 'activity-detail', providerObservationText(activity));
      } else {
        text(root, 'activity-summary', this.controller ? '正在处理资料…' : '尚未开始请求。');
        text(root, 'activity-detail', '');
      }
      const batchWorkspaceLocked = this.batchRunning || this.batchApplying;
      setDisabled(root, 'analyze', batchWorkspaceLocked || this.busy() || this.status !== 'empty'
        || !form.source.trim() || !this.connectionReady(form));
      setDisabled(root, 'repair', batchWorkspaceLocked || this.busy() || this.status !== 'needs_review' || form.mode === 'plaintext-actor' || !this.analysis || !this.connectionReady(form) || !this.snapshotCurrent(root) || ((this.analysis as any)?.repairCount ?? 0) >= 1);
      setDisabled(root, 'generate', batchWorkspaceLocked || this.busy() || !(this.status==='ready_to_generate'||this.status==='needs_review'&&form.mode==='ai-monster'&&!!(this.analysis as BrowserActorIntakeAnalysis)?.ir) || !this.connectionReady(form) || !this.snapshotCurrent(root));
      setDisabled(root, 'model-review', batchWorkspaceLocked || this.busy() || this.status !== 'ready_for_gm_review' || !this.snapshotCurrent(root)
        || this.modelReviewCredentialRevision !== this.connectionCredentialRevision
        || !this.connectionReady(form) || !this.generation || (this.generation as BrowserActorGenerationResult | BrowserItemGenerationResult).modelReviewStatus !== 'not_requested');
      setDisabled(root, 'regenerate', batchWorkspaceLocked || this.busy() || !form.source.trim() || !this.connectionReady(form) || !['needs_review', 'failed', 'rejected'].includes(this.status));
      setDisabled(root, 'reject', batchWorkspaceLocked || this.busy() || !['needs_review', 'failed'].includes(this.status));
      setDisabled(root, 'cancel', this.creating || !this.controller);
      setDisabled(root, 'export', batchWorkspaceLocked || !this.analysis || !this.snapshot);
      setDisabled(root,'download-actor',batchWorkspaceLocked||this.busy()||!this.snapshotCurrent(root)||form.mode==='ai-item'||!previewResponse||!('result'in previewResponse)||!('artifact'in previewResponse.result)||!previewResponse.result.artifact);
      setDisabled(root, 'import', batchWorkspaceLocked || this.busy() || !selectedImportFile(root));
      setDisabled(root, 'start-new-attempt', true);
      for (const action of ['test-connection', 'clear-key', 'clear-all-keys', 'toggle-key', 'toggle-endpoint']) setDisabled(root, action, this.creating);
      setDisabled(root, 'create', batchWorkspaceLocked || !this.isApplyable(root));
      for (const name of ['source', 'sourceFile', 'displayName', 'mode', 'provider', 'endpoint', 'protocol', 'region', 'model', 'reviewModel', 'reasoning', 'structuredOutput', 'authScheme', 'apiKey', 'persistApiKey', 'useSeparateReviewModel']) {
        const input = root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        if (input) input.disabled = this.creating;
      }
      const importFile = root.querySelector('[name="reviewBundleFile"]') as HTMLInputElement | null;
      if (importFile) importFile.disabled = this.busy();
      const connectionStatus = root.querySelector('[data-connection-status]') as HTMLElement | null;
      if (connectionStatus && !this.creating) {
        connectionStatus.textContent = connectionStatusMessage(form, this.connectionReady(form), this.sessionChangePending, this.connectionProbe?.message);
      }
      this.renderCreatedDocument(root);
      this.renderWorkspaceStep(root, currentStep);
      this.renderWorkspaceActions(root, form, currentStep);
    }

    private renderWorkspaceStep(root: HTMLElement, step: 'input' | 'review' | 'created'): void {
      const dataset = ((root as any).dataset ??= {});
      const changed = dataset.currentStep !== step;
      dataset.currentStep = step;
      const workspace = root.querySelector('.forge-workspace') as HTMLElement | null;
      if (workspace) workspace.dataset.currentStep = step;
      for (const name of ['input', 'review', 'created']) {
        const panel = root.querySelector(`[data-step="${name}"]`) as HTMLElement | null;
        if (panel) panel.hidden = name !== step;
        const indicator = root.querySelector(`[data-step-indicator="${name}"]`) as HTMLElement | null;
        if (indicator) {
          indicator.dataset.active = name === step ? 'true' : 'false';
          if (name === step) indicator.setAttribute?.('aria-current', 'step');
          else indicator.removeAttribute?.('aria-current');
        }
      }
      const advanced = root.querySelector('[data-advanced-workspace]') as HTMLElement | null;
      if (advanced) advanced.hidden = step === 'created';
      const progress = root.querySelector('[data-review-progress]') as HTMLElement | null;
      if (progress) progress.hidden = step !== 'review' || Boolean(this.importedReview);
      if (changed) {
        const scroll = root.querySelector('[data-workspace-scroll]') as HTMLElement | null;
        if (scroll) scroll.scrollTop = 0;
        const target = root.querySelector(step === 'created' ? '[data-created-document]' : step === 'review' ? '[data-status]' : '[name="source"]') as HTMLElement | null;
        target?.focus?.({ preventScroll: true });
      }
    }

    private renderWorkspaceActions(root: HTMLElement, form: ReturnType<typeof readForm>, step: 'input' | 'review' | 'created'): void {
      const busy = this.busy();
      const locked = busy || this.batchRunning || this.batchApplying;
      const imported = Boolean(this.importedReview);
      const retry = ['needs_review', 'failed', 'rejected'].includes(this.status);
      const stale = this.staleFinding?.code === 'STALE_SNAPSHOT';
      const repairable = this.status === 'needs_review' && form.mode !== 'plaintext-actor'
        && Boolean(this.analysis) && this.snapshotCurrent(root) && ((this.analysis as any)?.repairCount ?? 0) < 1;
      const visible = new Set<string>();
      let primary = '';
      let hint = '';
      if (this.controller) {
        visible.add('cancel');
        hint = '正在处理资料。你可以结束当前请求。';
      } else if (this.creating) hint = '正在创建并回读核对，完成后可打开条目。';
      else if (this.importing) hint = '正在读取历史审核记录…';
      else if (imported) {
        visible.add('clear');
        visible.add('export');
        visible.add('start-new-attempt');
        primary = 'start-new-attempt';
        hint = '历史记录仅供查看。恢复资料后需重新分析和审核。';
      } else if (step === 'created') {
        visible.add('open-created');
        visible.add('clear');
        primary = 'open-created';
        hint = '条目已在目录中，可打开检查或继续导入下一份资料。';
      } else if (step === 'input') {
        visible.add('clear');
        if (this.status === 'empty') { visible.add('analyze'); primary = 'analyze'; }
        else {
          visible.add('resume-review');
          if (retry) { visible.add('regenerate'); primary = 'regenerate'; }
          else primary = 'resume-review';
        }
        hint = stale
          ? '资料或设置已变更，请重新分析。旧审核结果无法用于创建。'
          : this.status !== 'empty' ? '资料已保留。未作修改时，可直接返回已有结果。'
            : '粘贴完整规则或读取文件，先分析，再由你确认创建。';
        if (!this.connectionReady(form)) hint = 'AI 分析需要先配置并测试连接。标准资料可直接导入，无需 AI。';
      } else {
        visible.add('edit-source');
        if (this.status === 'ready_to_generate'||this.status==='needs_review'&&form.mode==='ai-monster'&&!!(this.analysis as BrowserActorIntakeAnalysis)?.ir) { visible.add('generate'); primary = 'generate'; }
        else if (this.status === 'accepted' || this.status === 'ready_for_gm_review') { visible.add('create'); primary = 'create'; }
        else if (repairable) { visible.add('repair'); primary = 'repair'; }
        else if (retry) { visible.add('regenerate'); primary = 'regenerate'; }
        if (this.status === 'ready_for_gm_review' && form.mode !== 'plaintext-actor'
          && this.modelReviewCredentialRevision === this.connectionCredentialRevision
          && (this.generation as BrowserActorGenerationResult | BrowserItemGenerationResult | undefined)?.modelReviewStatus === 'not_requested') visible.add('model-review');
        if (this.analysis && this.snapshot) visible.add('export');
        const candidateResponse=(this.generation as BrowserActorGenerationResult|undefined)?.candidateResponse??this.response;
        if(form.mode!=='ai-item'&&candidateResponse&&'result'in candidateResponse&&'artifact'in candidateResponse.result&&candidateResponse.result.artifact)visible.add('download-actor');
        if (['needs_review', 'failed'].includes(this.status)) visible.add('reject');
        hint = stale ? '资料或设置已变更，需重新分析。'
          : this.status === 'ready_to_generate' ? '核对识别的资料后，继续生成候选；此步不会请求付费模型审核或创建条目。'
            : this.status === 'ready_for_gm_review' ? '候选已保留；请核对来源和下方问题。AI 审核由独立按钮发起并可能产生额外 API 费用；GM 可确认采用待审候选。'
            : this.status === 'accepted' ? '核对预览后确认创建到当前目录。'
              : '先查看需要处理的问题，可返回编辑资料。';
      }
      for (const action of ['analyze', 'generate', 'model-review', 'create', 'repair', 'regenerate', 'reject', 'cancel', 'clear', 'export', 'download-actor', 'start-new-attempt', 'edit-source', 'resume-review', 'open-created']) {
        const button = root.querySelector(`[data-action="${action}"]`) as HTMLButtonElement | null;
        if (!button) continue;
        button.hidden = !visible.has(action);
        button.dataset.primary = primary === action ? 'true' : 'false';
      }
      setDisabled(root, 'edit-source', locked || imported || Boolean(this.createdDocument));
      setDisabled(root, 'resume-review', locked || imported || this.status === 'empty');
      setDisabled(root, 'open-created', locked || !this.createdDocument);
      setDisabled(root, 'clear', locked || (!imported && step === 'input' && this.status === 'empty' && !form.source && !form.displayName));
      for (const action of ['connection-open', 'structured-open', 'encounter-open']) setDisabled(root, action, locked || imported);
      const clear = root.querySelector('[data-action="clear"]') as HTMLButtonElement | null;
      if (clear) clear.textContent = imported ? '返回当前工作台' : step === 'created' ? '继续导入' : '清空资料';
      const open = root.querySelector('[data-action="open-created"]') as HTMLButtonElement | null;
      if (open) open.textContent = this.directoryKind === 'Item' ? '打开物品卡' : '打开生物卡';
      const create = root.querySelector('[data-action="create"]') as HTMLButtonElement | null;
      if (create) create.textContent = (this.generation as BrowserActorGenerationResult | BrowserItemGenerationResult | undefined)?.modelReviewStatus === 'needs_review'
        || (this.generation as BrowserActorGenerationResult | BrowserItemGenerationResult | undefined)?.modelReviewStatus === 'failed'
        ? 'GM确认创建（仍有AI提示）' : 'GM确认创建';
      const more = root.querySelector('[data-workspace-more]') as HTMLElement | null;
      if (more) more.hidden = !visible.has('export') && !visible.has('reject');
      text(root, 'workspace-hint', hint);
    }

    private renderCreatedDocument(root: HTMLElement): void {
      const container = root.querySelector('[data-created-document]') as HTMLElement | null;
      if (!container) return;
      const created = this.createdDocument;
      if (!created) {
        container.hidden = true;
        container.innerHTML = '';
        return;
      }
      const label = created.objectKind === 'item' ? '物品' : '生物';
      const counts = worldDocumentCounts(environment.game);
      container.hidden = false;
      container.innerHTML = `<h2>${escapeHtml(created.document?.name || `${label}已准备好`)}</h2>
        <p>${created.status === 'existing' ? '已找到并复用目录中的已有条目。' : `${label}已创建到目录，并完成回读核对。`}</p>
        <details><summary>创建记录</summary><p><code>${escapeHtml(created.uuid)}</code>${counts ? ` · ${escapeHtml(counts)}` : ''}</p></details>`;
    }

    private openCreatedDocument(): void {
      const document = this.createdDocument?.document as any;
      const sheet = document?.sheet;
      if (typeof sheet?.render !== 'function') {
        this.notify('error', '条目已创建，但当前 Foundry 没有可打开的卡片。');
        return;
      }
      try {
        void Promise.resolve(sheet.render(true)).catch((error) => this.notify('error', `打开卡片失败：${messageOf(error)}`));
      } catch (error) { this.notify('error', `打开卡片失败：${messageOf(error)}`); }
    }

    private renderImportedReview(root: HTMLElement, form: ReturnType<typeof readForm>): void {
      const imported = this.importedReview!;
      text(root, 'icon-review', iconReviewPresentation([]));
      const bundle = imported.bundle;
      const compatible = importedTargetCompatible(imported);
      const connectionSummary = root.querySelector('[data-connection-summary]') as HTMLElement | null;
      if (connectionSummary) connectionSummary.textContent = '历史审核记录 · 只读';
      text(root, 'status', `导入的只读历史状态：${bundle.status}`);
      text(root, 'human-summary', `历史流程状态：${bundle.status}。${bundle.candidateResponse ? `正式检查结论：${bundle.candidateResponse.status}。` : ''}${bundle.gmApproval ? '保留 GM 本次采用记录；采用不改变正式检查结论。' : ''}这是只读证据，不含可提交的完整 response/artifact，不能直接 Confirm Create。请显式开启新 attempt 并重新 Analyze、Generate 与验证；不会自动调用 Provider 或写世界 Document。`);
      html(root, 'stages', '');
      const importedFindings = [...bundle.deterministicFindings, ...bundle.aiReviewFindings];
      const responseDiagnostics = bundle.candidateResponse?.diagnostics ?? [];
      const diagnostics = root.querySelector('[data-diagnostics]') as HTMLElement | null;
      if (diagnostics) diagnostics.hidden = importedFindings.length === 0 && responseDiagnostics.length === 0;
      html(root, 'diagnostic-list',renderIssueList([...importedFindings,...responseDiagnostics]));
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
      html(root, 'human-preview', '<p>这是历史审核记录，只读显示，不包含可直接创建的完整 Document。</p>');
      text(root, 'json', '历史 bundle 不包含可提交的完整 Actor/Item artifact。');
      const previewSection = root.querySelector('[data-preview-section]') as HTMLElement | null;
      if (previewSection) previewSection.hidden = false;
      const createdDocument = root.querySelector('[data-created-document]') as HTMLElement | null;
      if (createdDocument) { createdDocument.hidden = true; createdDocument.replaceChildren?.(); }
      const activityCard = root.querySelector('[data-activity-card]') as HTMLElement | null;
      if (activityCard) activityCard.hidden = true;
      for (const action of ['analyze', 'repair', 'generate', 'regenerate', 'reject', 'cancel', 'create']) setDisabled(root, action, true);
      for (const action of ['test-connection', 'clear-key', 'clear-all-keys', 'toggle-key', 'toggle-endpoint']) setDisabled(root, action, true);
      setDisabled(root, 'export', this.importing);
      setDisabled(root, 'import', this.importing || !selectedImportFile(root));
      setDisabled(root, 'start-new-attempt', this.importing || !compatible || !isCurrentRuntime(environment.game));
      for (const name of ['source', 'sourceFile', 'displayName', 'mode', 'provider', 'endpoint', 'protocol', 'region', 'model', 'reviewModel', 'reasoning', 'structuredOutput', 'authScheme', 'apiKey', 'persistApiKey', 'useSeparateReviewModel']) {
        const input = root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        if (input) input.disabled = true;
      }
      const importFile = root.querySelector('[name="reviewBundleFile"]') as HTMLInputElement | null;
      if (importFile) importFile.disabled = this.importing;
      const connectionStatus = root.querySelector('[data-connection-status]') as HTMLElement | null;
      if (connectionStatus) connectionStatus.textContent = form.mode === 'plaintext-actor' ? '' : '导入不会测试或复用历史 Provider 连接。';
      this.renderWorkspaceStep(root, 'review');
      this.renderWorkspaceActions(root, form, 'review');
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

    private loadCandidates(): Promise<void> {
      return this.recoveryLoad ??= this.candidateStore.load().then(records => { this.savedCandidates = records; })
        .catch(error => { this.notify('info', `完整候选恢复不可用：${safeLibraryMessage(error)} 可继续使用当前结果，或清除本地恢复副本后重新准备。`); });
    }

    private async saveCandidate(root: HTMLElement, key: string): Promise<void> {
      const form = readForm(root), generation = this.generation;
      if (form.mode === 'plaintext-actor' || generation?.status !== 'ready_for_gm_review' || !this.snapshotCurrent(root)) return;
      const revision = this.revision;
      try {
        const record = captureIntakeCandidate(form.mode === 'ai-item' ? itemInput(form, this.requestId, environment.game)
          : actorInput(form, this.requestId, environment.game), form.mode, this.buildBundle(form), generation, [form.apiKey, form.endpoint], Date.now(),
          key === 'single' ? undefined : this.batchState?.jobs.find(job => job.id === key)?.attemptCount);
        await this.loadCandidates();
        await this.candidateStore.put(key, record, () => {
          this.assertLibraryAuthority();
          if (this.revision !== revision || !this.snapshotCurrent(root)) throw Error('候选已变更，未保存旧恢复副本。');
        });
        this.savedCandidates[key] = record;
      } catch (error) { this.notify('info', `完整候选未保存：${safeLibraryMessage(error)} 当前页面候选仍可使用。`); }
      this.renderRecovery(root);
    }

    private async forgetCandidate(key: string): Promise<void> {
      try { await this.loadCandidates(); await this.candidateStore.clear(key, () => this.assertLibraryAuthority()); delete this.savedCandidates[key]; }
      catch (error) { this.notify('info', `清除候选恢复副本失败：${safeLibraryMessage(error)}`); }
    }

    private renderRecovery(root: HTMLElement): void {
      const restore = root.querySelector('[data-action="restore-candidate"]') as HTMLButtonElement | null;
      if (restore) restore.disabled = this.recoveryBusy || !this.savedCandidates.single || !this.isDirectoryMode(this.savedCandidates.single.mode)
        || !this.libraryWorkspaceEmpty(root) || this.busy() || this.batchRunning || this.batchApplying;
      const clear = root.querySelector('[data-action="clear-candidate-cache"]') as HTMLButtonElement | null;
      if (clear) clear.disabled = this.recoveryBusy || this.busy() || this.batchRunning || this.batchApplying;
    }

    private async restoreSingleCandidate(root: HTMLElement): Promise<void> {
      if (this.recoveryBusy || this.busy() || this.batchRunning || this.batchApplying || !this.libraryWorkspaceEmpty(root)) return;
      this.recoveryBusy = true; this.renderRecovery(root);
      const revision = this.revision;
      try {
        this.assertLibraryAuthority(); await this.loadCandidates();
        const saved = this.savedCandidates.single;
        if (!saved || !this.isDirectoryMode(saved.mode)) throw Error('当前工作台没有可恢复的单条候选。');
        const record = await revalidateIntakeCandidate(saved, { fvttVersion: environment.game.version, systemVersion: environment.game.system.version });
        this.assertLibraryAuthority();
        if (this.revision !== revision || !this.libraryWorkspaceEmpty(root)) throw Error('工作区已改变，未覆盖当前草稿。');
        for (const [name, value] of Object.entries({ mode: record.mode, source: record.input.source, displayName: record.input.displayName ?? '' })) {
          const field = root.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
          if (field) { if(name==='source')setSourceValue(field,value);else field.value=value; }
        }
        this.analysis = record.candidate.analysis; this.generation = record.candidate; this.response = undefined;
        this.requestId = record.input.requestId; this.attemptId = record.bundle.attemptId;
        this.reviewSource = record.input.source; this.snapshot = makeSnapshot(readForm(root), environment.game);
        this.status = 'ready_for_gm_review'; this.modelReviewCredentialRevision = this.connectionCredentialRevision;
        this.history = [...record.bundle.history]; this.editingSource = false;
        this.refreshAiVisibility(root); this.renderResult(root);
        this.notify('info', '完整候选已通过当前代码本地重验；未请求模型，仍须 GM 重新确认。');
      } catch (error) { this.notify('error', `候选未恢复：${safeLibraryMessage(error)}`); }
      finally { this.recoveryBusy = false; this.renderRecovery(root); }
    }

    private async clearCandidateCache(root: HTMLElement): Promise<void> {
      if (this.recoveryBusy || this.busy() || this.batchRunning || this.batchApplying) return;
      this.recoveryBusy = true; this.renderRecovery(root);
      try {
        this.assertLibraryAuthority();
        const confirm = foundryGlobal?.applications?.api?.DialogV2?.confirm;
        if (!confirm || !await confirm({ window: { title: '清除候选恢复副本' }, content: '<p>清除当前世界、当前 GM 的单条及批量候选恢复副本？来源库、队列和世界文档仍保留。刷新后需显式重新准备。</p>' })) return;
        await this.loadCandidates(); await this.candidateStore.reset(() => this.assertLibraryAuthority()); this.savedCandidates = {};
        this.notify('info', '本地候选恢复副本已清除。');
      } catch (error) { this.notify('error', safeLibraryMessage(error)); }
      finally { this.recoveryBusy = false; this.renderRecovery(root); }
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
        await this.loadCandidates();
        for (const job of loaded.jobs) {
          const saved = this.savedCandidates[job.id];
          if (!saved || this.batchResponses.has(job.id) || !['ready_for_gm_review','accepted','reviewed_candidate','interrupted','apply_failed'].includes(job.status)) continue;
          try {
            if (!this.directoryEntryAllowed(batchQueueEntry(this.batchState!, job))) continue;
            if (saved.queueAttempt !== job.attemptCount) throw Error('保存候选属于旧 attempt；请显式重新准备。');
            const record = await revalidateIntakeCandidate(saved, { fvttVersion: environment.game.version, systemVersion: environment.game.system.version });
            this.assertLibraryAuthority();
            this.batchState = await this.batchQueue.restoreReadyJob(job.id, record.bundle, record.queueAttempt!, () => this.assertLibraryAuthority());
            this.batchResponses.set(job.id, { mode: record.mode, rawSourceHash: record.bundle.rawSourceHash,
              candidate: record.candidate, input: record.input });
          } catch (error) { this.notify('info', `完整候选未恢复：${safeLibraryMessage(error)} 原来源和队列仍保留；没有自动请求模型。`); }
        }
        this.renderRecovery(root);
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
      if (!this.batchJobDirectoryAllowed(job)) return false;
      return ['pending', 'interrupted', 'needs_review', 'failed', 'rejected', 'apply_failed'].includes(job.status)
        || (['accepted', 'ready_for_gm_review', 'reviewed_candidate'].includes(job.status) && !this.batchResponses.has(job.id));
    }

    private batchJobDirectoryAllowed(job: Readonly<ForgeBatchJobV1>): boolean {
      try {
        const entry = this.batchState && batchQueueEntry(this.batchState, job);
        return Boolean(entry && this.directoryEntryAllowed(entry));
      } catch { return false; }
    }

    private directoryEntryAllowed(entry: Readonly<ForgeBatchCollectionV1['entries'][number]>): boolean {
      if (!this.hasDirectoryContext) return true;
      return this.directoryKind === 'Item'
        ? entry.objectKind === 'item' && entry.mode === 'ai-item'
        : entry.objectKind === 'actor' && (entry.mode === 'ai-monster' || entry.mode === 'plaintext-actor');
    }

    private batchJobCancellable(job: Readonly<ForgeBatchJobV1>): boolean {
      return ['pending', 'interrupted', 'ready_for_gm_review', 'reviewed_candidate', 'accepted', 'needs_review', 'failed', 'rejected'].includes(job.status);
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
          if (!this.loadBatchEntry(root, entry, job.latestReview)) continue;
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
          if (this.status === 'ready_to_generate' || (this.status === 'needs_review' && form.mode === 'ai-monster'
            && !!(this.analysis as BrowserActorIntakeAnalysis).ir)) await this.generate(root, true);
          if (this.batchStopRequested) {
            this.batchState = await this.batchQueue.interruptJob(job.id, 'GM 停止了 batch runner；不会自动重发 Provider 请求。', () => this.assertLibraryAuthority());
            this.batchResponses.delete(job.id);
            break;
          }
          const currentForm = readForm(root);
          const bundle = this.buildBundle(currentForm);
          const imported = decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(bundle));
          this.batchState = await this.batchQueue.settleJob(job.id, imported, [currentForm.apiKey, currentForm.endpoint], () => this.assertLibraryAuthority());
          if (this.snapshot && ((bundle.status === 'accepted' && this.response)
            || (bundle.status === 'ready_for_gm_review' && this.generation?.status === 'ready_for_gm_review'))) {
            this.batchResponses.set(job.id, {
              mode: currentForm.mode, rawSourceHash: this.snapshot.rawSourceHash,
              ...(this.response ? { response: this.response } : {}),
              ...(this.generation && this.generation.status === 'ready_for_gm_review'
                ? { candidate: this.generation as BrowserActorGenerationResult | BrowserItemGenerationResult,
                  input: currentForm.mode === 'ai-item'
                    ? itemInput(currentForm, this.requestId, environment.game)
                    : actorInput(currentForm, this.requestId, environment.game) } : {}),
            });
            await this.saveCandidate(root, job.id);
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
    ): boolean {
      if (!this.directoryEntryAllowed(entry)) {
        this.notify('error', this.directoryKind === 'Item' ? 'Item 工作台不能处理 Actor batch job。' : 'Actor 工作台不能处理 Item batch job。');
        return false;
      }
      this.resetWorkspaceState();
      const source = root.querySelector('[name="source"]') as HTMLTextAreaElement | null;
      const displayName = root.querySelector('[name="displayName"]') as HTMLInputElement | null;
      const mode = root.querySelector('[name="mode"]') as HTMLSelectElement | null;
      if (source) setSourceValue(source, entry.rawSource);
      if (displayName) displayName.value = entry.sourceLabel;
      if (mode) mode.value = entry.mode;
      const review = latestReview ?? entry.review;
      if (review) this.recoveredFrom = createForgeIntakeRecoveryLineage(decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(review)));
      this.refreshAiVisibility(root);
      this.refreshProviderUi(root);
      this.renderResult(root);
      return true;
    }

    private openBatchJob(root: HTMLElement, id: string): void {
      if (this.batchRunning || this.batchApplying || this.busy()) return;
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      const job = this.batchState?.jobs.find((entry) => entry.id === id);
      if (!job || !this.batchState) return void this.notify('error', 'Batch job 不存在。');
      const entry = batchQueueEntry(this.batchState, job);
      if (!this.directoryEntryAllowed(entry)) {
        return void this.notify('error', this.directoryKind === 'Item' ? 'Item 工作台不能打开 Actor batch job。' : 'Actor 工作台不能打开 Item batch job。');
      }
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
        await this.forgetCandidate(id);
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
        const removedJobs = this.batchState?.jobs.filter(job => job.collectionId === id).map(job => job.id) ?? [];
        this.batchState = await this.batchQueue.removeCollection(id, () => this.assertLibraryAuthority());
        for (const job of [...this.batchResponses.keys()]) if (!this.batchState.jobs.some((entry) => entry.id === job)) this.batchResponses.delete(job);
        for (const job of removedJobs) await this.forgetCandidate(job);
        this.notify('info', 'Collection 与其 queue job 已删除。');
      } catch (error) { this.notify('error', safeLibraryMessage(error)); }
      finally { this.batchMutation = false; this.renderBatch(root); }
    }

    private async applyBatch(root: HTMLElement): Promise<void> {
      if (this.batchRunning || this.batchApplying || this.batchMutation || this.busy()) return;
      try { assertGm(environment.game); assertExactRuntime(environment.game); } catch (error) { return void this.notify('error', messageOf(error)); }
      if (!this.batchState) return;
      const candidates = this.batchApplyCandidates(this.batchState);
      if (candidates.length === 0) return void this.notify('error', '当前 session 没有完整的本地有效候选。历史记录必须重新执行后才能创建。');
      const confirmation = { id: hashSource(JSON.stringify({ revision: this.batchState.revision, candidates })), queueRevision: this.batchState.revision, items: candidates };
      if (!await this.confirmBatchApply(confirmation)) return;
      const before = await this.batchQueue.load();
      this.assertLibraryAuthority();
      if (before.revision !== confirmation.queueRevision) return void this.notify('error', 'Queue 在确认期间已变化；批量确认已失效，请重新确认。');
      this.batchApplying = true;
      this.renderBatch(root);
      let completed = 0;
      try {
        for (const candidate of confirmation.items) {
          const volatile = this.batchResponses.get(candidate.jobId);
          if (!volatile) continue;
          this.assertLibraryAuthority();
          let began = false;
          try {
            const latest = await this.batchQueue.load();
            this.assertLibraryAuthority();
            if (!this.batchApplyCandidates(latest, candidate.jobId).some((current) => JSON.stringify(current) === JSON.stringify(candidate))) {
              throw new Error('当前候选与确认清单已不一致，必须重新准备并确认。');
            }
            const queued = latest.jobs.find((entry) => entry.id === candidate.jobId);
            if (queued?.status === 'ready_for_gm_review') {
              if (!volatile.candidate || !volatile.input) throw new Error('缺少当前 session 的完整候选；历史记录不可直接创建。');
              const approved = volatile.mode === 'ai-item'
                ? this.services.approveBrowserItemIntakeCandidateForGm(volatile.input, volatile.candidate as BrowserItemGenerationResult, environment.game.user.id)
                : this.services.approveBrowserActorIntakeCandidateForGm(volatile.input, volatile.candidate as BrowserActorGenerationResult, environment.game.user.id);
              if (!approved.response || (approved.status !== 'accepted' && (volatile.mode !== 'ai-monster' || !approved.gmApproval))) throw new Error('Batch 候选未通过本地 GM 确认门禁。');
              if (!queued.latestReview || !approved.gmApproval) throw new Error('缺少当前候选的来源记录或 GM 审批证明。');
              const approvedBundle = { ...queued.latestReview,
                status: approved.status === 'accepted' ? 'accepted' as const : 'reviewed_candidate' as const,
                gmApproval: approved.gmApproval };
              const imported = decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(approvedBundle));
              const currentForm = readForm(root);
              this.batchState = await this.batchQueue.approveReadyJob(candidate.jobId, imported,
                [currentForm.apiKey, currentForm.endpoint], () => this.assertLibraryAuthority());
              volatile.candidate = approved;
              volatile.response = approved.response;
            }
            createForgeBatchApplyManifest(await this.batchQueue.load(), [candidate]);
            this.batchState = await this.batchQueue.beginApply(candidate.jobId, () => this.assertLibraryAuthority());
            began = true;
            const reviewed = volatile.candidate?.gmApproval;
            const actorResponse = volatile.response as ForgeActorResponse;
            const result = volatile.mode === 'ai-item'
              ? await this.services.createAcceptedForgeItem({ game: environment.game, response: volatile.response as ForgeItemResponse })
              : reviewed && 'result' in actorResponse && actorResponse.result.status !== 'accepted'
                ? await this.services.createReviewedForgeActorCandidate({ game: environment.game, response: actorResponse,
                  rawSourceHash: volatile.rawSourceHash, reviewApproval: { gmId: reviewed.gmId,
                    sourceHash: reviewed.finalSourceHash, artifactHash: reviewed.artifactHash,
                    findingsHash: forgeActorCandidateReviewHash(actorResponse) } })
                : await this.services.createAcceptedForgeActor({ game: environment.game, response: actorResponse, ...(volatile.mode === 'ai-monster' ? { rawSourceHash: volatile.rawSourceHash } : {}) });
            this.batchState = await this.batchQueue.finishApply(candidate.jobId, {
              status: result.status,
              objectKind: candidate.objectKind,
              uuid: result.uuid,
              sourceId: candidate.sourceId,
              sourceHash: candidate.sourceHash,
              artifactHash: candidate.artifactHash,
              ...('readbackWarnings'in result&&result.readbackWarnings?.length?{readbackWarnings:result.readbackWarnings}:{}),
            }, () => this.assertLibraryAuthority());
            completed += 1;
            await this.forgetCandidate(candidate.jobId);
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
      this.notify('info', `Batch apply 已逐项结算 ${completed}/${confirmation.items.length}；没有宣称多 Document 原子事务。`);
    }

    private batchApplyCandidates(state: Readonly<ForgeBatchQueueV1>, onlyJobId?: string): ForgeBatchApplyCandidate[] {
      const candidates: ForgeBatchApplyCandidate[] = [];
      for (const job of state.jobs) {
        if (onlyJobId && job.id !== onlyJobId) continue;
        const volatile = this.batchResponses.get(job.id);
        if (!volatile || !['accepted', 'ready_for_gm_review', 'reviewed_candidate'].includes(job.status)
          || !job.latestReview || job.latestReview.status !== job.status) continue;
        let source: Readonly<ForgeBatchCollectionV1['entries'][number]>;
        try { source = batchQueueEntry(state, job); } catch { continue; }
        if (!this.directoryEntryAllowed(source)) continue;
        if (volatile.mode !== source.mode || volatile.rawSourceHash !== source.rawSourceHash || job.latestReview.rawSourceHash !== source.rawSourceHash) continue;
        if (job.status === 'ready_for_gm_review' && (!volatile.candidate || !volatile.input
          || volatile.candidate.status !== 'ready_for_gm_review'
          || volatile.input.source !== source.rawSource
          || volatile.candidate.candidateHash !== job.latestReview.candidateHash)) continue;
        const response = volatile.response ?? volatile.candidate?.candidateResponse;
        if (!response) continue;
        const decoded = volatile.mode === 'ai-item'
          ? decodeForgeItemResponse(response as ForgeItemResponse)
          : decodeForgeActorResponse(response as ForgeActorResponse);
        if (!decoded.ok || !('result' in decoded.value)) continue;
        const result = decoded.value.result;
        const artifact = 'artifact' in result ? result.artifact : undefined;
        const artifactHash = artifact ? hashArtifact(artifact) : undefined;
        if (!artifactHash) continue;
        if (result.status === 'accepted') {
          if (result.artifactHash !== artifactHash) continue;
        } else {
          if (volatile.mode !== 'ai-monster' || !volatile.candidate || !volatile.input
            || !isUsableActorCandidateArtifact(artifact)) continue;
          try { assertCurrentBrowserActorIntakeCandidate(volatile.input, volatile.candidate as BrowserActorGenerationResult); }
          catch { continue; }
        }
        const proof = job.latestReview;
        if (proof.candidateResponse?.artifactHash !== artifactHash || proof.candidateResponse.status !== result.status
          || proof.sourceIdentity?.sourceId !== result.sourceIdentity.sourceId
          || proof.sourceIdentity.finalSourceHash !== result.sourceIdentity.sourceHash) continue;
        candidates.push({
          jobId: job.id,
          objectKind: volatile.mode === 'ai-item' ? 'item' : 'actor',
          sourceId: result.sourceIdentity.sourceId,
          sourceHash: result.sourceIdentity.sourceHash,
          artifactHash,
          documentId: hashArtifact({ sourceId: result.sourceIdentity.sourceId }).slice(0, 16),
          target: {
            fvttVersion: result.target.fvttRuntimeVersion,
            systemId: 'dnd5e',
            systemVersion: result.target.systemVersionObserved,
            generatorProfile: 'v14',
            effectProfile: 'core',
            iconMode: result.target.iconMode,
          },
        });
      }
      return candidates;
    }

    private async confirmBatchApply(manifest: Readonly<{ id: string; items: readonly ForgeBatchApplyCandidate[] }>): Promise<boolean> {
      const dialog = foundryGlobal?.applications?.api?.DialogV2;
      const summary = manifest.items.map((item) => {
        const job = this.batchState?.jobs.find((job) => job.id === item.jobId);
        const review=job?.latestReview;
        const label=job&&this.batchState?batchQueueEntry(this.batchState,job).sourceLabel:item.objectKind;
        const ir=(this.batchResponses.get(item.jobId)?.candidate as BrowserActorGenerationResult|undefined)?.analysis?.ir;
        const findings = [...(review?.deterministicFindings ?? []), ...(review?.aiReviewFindings ?? []),
          ...(review?.candidateResponse?.diagnostics ?? [])];
        return `<li><strong>${escapeHtml(ir?.creature?.identity?.name??label)}</strong>
          <strong>正式检查：${escapeHtml(review?.candidateResponse?.status ?? 'unknown')}</strong>
          ${findings.length ? `<ul>${renderIssueList(findings,ir)}</ul>` : '<p>当前检查没有发现疑点。</p>'}</li>`;
      }).join('');
      if (!dialog?.confirm) return false;
      try {
        return await dialog.confirm({
          window: { title: 'GM 确认批量创建' },
          content: `<p>将创建 ${manifest.items.length} 个条目。下列内容疑点不会阻止 AI 角色创建；创建完成后仍可在 Forge 批量记录中查看。采用不会标为 accepted，不会请求额外 AI 审核。</p><ol>${summary}</ol>`,
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
          ? `client-local · revision ${state.revision} · ${state.collections.length} collections · ${state.jobs.length} jobs · running/applying 重开后会变为 interrupted；缺少本地候选的待审任务需点击“开始／继续批量处理”重新准备，不会自动请求模型`
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
              const actorId=job.applyResult?.objectKind==='actor'?job.applyResult.uuid?.replace(/^Actor\./u,''):undefined;
              const actor=actorId?environment.game.actors?.get?.(actorId):undefined;
              const spellIssues=actor?.flags?.['fvtt-json-forge']?.sourceId===job.latestReview?.sourceIdentity?.sourceId?spellResolutionIssues(actor):[];
              const lifecycleAction = job.status === 'cancelled'
                ? `<button type="button" data-batch-requeue-job="${escapeHtml(job.id)}">恢复为 pending</button>`
                : this.batchJobCancellable(job)
                  ? `<button type="button" data-batch-cancel-job="${escapeHtml(job.id)}">取消此 job</button>`
                  : '';
              return `<li><span><strong>${escapeHtml(entry.sourceLabel || '(未命名)')}</strong> · ${escapeHtml(entry.objectKind)} · ${escapeHtml(entry.mode)} · ${escapeHtml(job.status)} · attempt ${job.attemptCount}${job.applyResult?.uuid ? ` · ${escapeHtml(job.applyResult.uuid)}` : ''}</span>
                ${job.lastError ? `<small>${escapeHtml(job.lastError)}</small>` : ''}
                ${job.latestReview?renderBatchIssues(job.latestReview):''}
                ${spellIssues.length?`<section class="forge-findings forge-diagnostics"><strong>角色已创建，施法录入提示</strong><ul>${renderIssueList(spellIssues)}</ul></section>`:''}
                ${job.applyResult?.readbackWarnings?.length?`<section class="forge-findings forge-diagnostics"><strong>已创建，录入值需要核对</strong><ul>${renderIssueList(job.applyResult.readbackWarnings.map((message,index)=>({code:'FOUNDRY_READBACK_DIFFERENCE',path:`/readback/${index}`,message})))}</ul></section>`:''}
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
      (root as any).__forgeSessionSettings = this.settings;
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

function connectionConfigured(form: ReturnType<typeof readForm>): boolean {
  return Boolean(form.endpoint && form.model && (form.authScheme === 'none' || form.apiKey));
}

function connectionStatusMessage(
  form: ReturnType<typeof readForm>,
  ready: boolean,
  pending: boolean,
  probeMessage?: string,
): string {
  if (form.mode === 'plaintext-actor') return '纯文本审阅无需 AI 连接。';
  if (pending) return 'AI 连接设置已更新；当前请求完成后会重新检查结果。';
  if (!connectionConfigured(form)) return '尚未完成 AI 连接配置，请点击“连接设置”。';
  if (ready) return probeMessage || 'AI 连接已测试，可以开始分析。';
  return probeMessage || 'AI 连接尚未测试，请点击“连接设置”。';
}

function connectionSummaryMessage(form: ReturnType<typeof readForm>, ready: boolean): string {
  if (form.mode === 'plaintext-actor') return '纯文本审阅 · 无需 AI';
  if (!connectionConfigured(form)) return 'AI 连接未配置';
  const preset = getForgeProviderPreset(form.providerId);
  return `${preset.label} · ${form.model || '未选择模型'} · ${ready ? '已测试' : '待测试'}`;
}

function resolveDirectoryMode(mode: ForgeIntakeMode | undefined, directoryKind: 'Actor' | 'Item'): ForgeIntakeMode {
  if (directoryKind === 'Item') return 'ai-item';
  return mode === 'plaintext-actor' ? 'plaintext-actor' : 'ai-monster';
}

function worldDocumentCounts(game: any): string {
  const actorCount = collectionCount(game?.actors);
  const itemCount = collectionCount(game?.items);
  if (actorCount === undefined && itemCount === undefined) return '';
  return `世界中 Actor ${actorCount ?? '未知'} · Item ${itemCount ?? '未知'}`;
}

function collectionCount(collection: any): number | undefined {
  if (Array.isArray(collection?.contents)) return collection.contents.length;
  if (typeof collection?.size === 'number') return collection.size;
  return undefined;
}

function analysisPreview(analysis: IntakeAnalysis | undefined): string {
  if (!analysis) return '';
  const candidates = analysis.candidate ? [analysis.candidate] : analysis.candidates;
  const labels = candidates.slice(0, 6).map((candidate) => escapeHtml(candidate.label));
  const candidate = analysis.candidate;
  const quote = candidate && 'quote' in candidate && typeof candidate.quote === 'string'
    ? candidate.quote.trim().slice(0, 700) : '';
  const sections = 'creature' in analysis && analysis.creature
    ? Object.keys(analysis.creature.sections).filter((name) => analysis.creature!.sections[name]?.trim()) : [];
  return `<dl><dt>识别对象</dt><dd>${labels.join('、') || '尚未识别到独立条目'}${candidates.length > 6 ? ` 等 ${candidates.length} 个` : ''}</dd>
    ${sections.length ? `<dt>已读取内容</dt><dd>${sections.map(escapeHtml).join('、')}</dd>` : ''}</dl>
    ${quote ? `<details class="forge-analysis-excerpt"><summary>查看识别的来源片段</summary><blockquote>${escapeHtml(quote)}</blockquote></details>` : ''}`;
}

function humanPreview(form: ReturnType<typeof readForm>, responseResult: any): string {
  if (!responseResult) return `<p>${form.mode === 'ai-item' ? '输入物品资料后，点击“分析资料”。' : '输入生物资料后，点击“分析资料”。'}</p>`;
  if (form.mode === 'ai-item') return humanItemPreview(responseResult);
  return humanActorPreview(responseResult);
}

function humanActorPreview(result: any): string {
  const actor = result?.actorVerification?.actor ?? result?.actor ?? {};
  // actorVerification.actor is a compact verification projection (hp/ac/cr
  // at the top level), while artifact fallbacks use Foundry's system paths.
  const system = actor?.system ?? {};
  const projection = actor?.hp || actor?.ac || actor?.cr !== undefined ? actor : undefined;
  const attributes = system?.attributes ?? {};
  const hp = projection?.hp ?? attributes?.hp ?? {};
  const ac = projection?.ac ?? attributes?.ac ?? {};
  const details = system?.details ?? {};
  const items = Array.isArray(result?.actorVerification?.items) ? result.actorVerification.items : (Array.isArray(actor?.items) ? actor.items : []);
  const name = actor?.name || '未命名生物';
  const hpText = hp?.max !== undefined || hp?.value !== undefined ? `${hp?.value ?? hp?.max ?? '—'} / ${hp?.max ?? '—'}` : '未提供';
  const acText = ac?.value ?? ac?.flat ?? '未提供';
  const crText = projection?.cr ?? details?.cr?.value ?? details?.cr ?? '未提供';
  const itemNames = items.map((item: any) => item?.name).filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 8);
  return `<dl><dt>生物</dt><dd>${escapeHtml(String(name))}</dd><dt>HP</dt><dd>${escapeHtml(String(hpText))}</dd><dt>AC</dt><dd>${escapeHtml(String(acText))}</dd><dt>CR</dt><dd>${escapeHtml(String(crText))}</dd><dt>能力</dt><dd>${itemNames.length > 0 ? escapeHtml(itemNames.join('、')) : '已生成，展开来源依据查看详情'}</dd></dl>`;
}

function humanItemPreview(result: any): string {
  try {
    const item = result?.itemDocument ?? result?.item ?? {};
    const system = item && typeof item === 'object' ? item.system ?? {} : {};
    const rawDescription = system && typeof system === 'object' && system.description !== undefined
      ? system.description
      : item && typeof item === 'object' ? item.description : '';
    const description = richTextToPlainText(rawDescription);
    const type = item && typeof item === 'object' ? item.type ?? system?.type ?? '未提供' : '未提供';
    const name = item && typeof item === 'object' ? item.name : undefined;
    return `<dl><dt>物品</dt><dd>${escapeHtml(String(name || '未命名物品'))}</dd><dt>类型</dt><dd>${escapeHtml(String(type))}</dd><dt>描述</dt><dd>${escapeHtml(description || '未提供')}</dd></dl>`;
  } catch {
    return '<p>物品结果已生成，请展开技术详情查看。</p>';
  }
}

function richTextToPlainText(value: unknown): string {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('value' in record) return richTextToPlainText(record.value);
    if ('text' in record) return richTextToPlainText(record.text);
  }
  if (typeof value !== 'string') return value == null ? '' : String(value);
  return value.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 600);
}

const loadedSourceValues=new WeakMap<object,{raw:string;display:string}>();
function setSourceValue(field:{value:string},raw:string):void{
  field.value=raw;
  loadedSourceValues.set(field,{raw,display:field.value});
}
function readSourceValue(field:{value:string}|null):string{
  if(!field)return'';
  const loaded=loadedSourceValues.get(field);
  return loaded&&loaded.display===field.value?loaded.raw:field.value;
}

function readForm(root: HTMLElement, sessionSettings?: Partial<ForgeClientSettings>): ForgeIntakeForm {
  const requestSettings = (root as any).__forgeIntakeRequestForm as Partial<ForgeIntakeForm> | undefined;
  const session = sessionSettings ?? (root as any).__forgeSessionSettings as Partial<ForgeClientSettings> | undefined ?? {};
  const configured = requestSettings ?? session;
  const configuredRecord = configured as Partial<Record<keyof ForgeClientSettings, unknown>>;
  const input = (name: string) => root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  const value = (name: string, setting?: keyof ForgeClientSettings) => {
    const field = input(name);
    if (requestSettings && setting && Object.prototype.hasOwnProperty.call(requestSettings, setting)) {
      const requested = (requestSettings as Partial<Record<keyof ForgeClientSettings, unknown>>)[setting];
      if (typeof requested === 'string') return requested;
    }
    if (field) return field.value ?? '';
    const fallback = setting ? configuredRecord[setting] : undefined;
    return typeof fallback === 'string' ? fallback : '';
  };
  const mode = (requestSettings?.mode || value('mode') || (root as any).__forgeIntakeInitialMode || 'ai-monster') as ForgeIntakeMode;
  const endpoint = value('endpoint', 'endpoint').trim();
  const providerId = (value('provider', 'providerId') || inferForgeProviderId(endpoint)) as ForgeProviderId;
  const preset = getForgeProviderPreset(providerId);
  const checked = (name: string, setting: keyof ForgeClientSettings): boolean => {
    const field = input(name) as HTMLInputElement | null;
    if (requestSettings && Object.prototype.hasOwnProperty.call(requestSettings, setting)) return (requestSettings as Partial<Record<keyof ForgeClientSettings, unknown>>)[setting] === true;
    return field ? field.checked === true : configuredRecord[setting] === true;
  };
  return {
    mode,
    source: readSourceValue(input('source')),
    sourceName: value('displayName').trim() || 'Forge Intake source',
    displayName: value('displayName').trim(),
    endpoint,
    model: value('model', 'model').trim(),
    reviewModel: value('model', 'model').trim(),
    apiKey: value('apiKey', 'apiKey'),
    persistApiKey: checked('persistApiKey', 'persistApiKey'),
    autoCorrect: checked('autoCorrect','autoCorrect'),
    providerId,
    protocol: (value('protocol', 'protocol') || preset.defaultProtocol) as ForgeProviderProtocol,
    authScheme: (value('authScheme', 'authScheme') || preset.authSchemes[0] || 'bearer') as ForgeClientSettings['authScheme'],
    region: value('region', 'region').trim(),
    reasoning: (value('reasoning', 'reasoning') || 'auto') as ForgeProviderReasoning,
    structuredOutput: (value('structuredOutput', 'structuredOutput') || 'prompt_fallback') as ForgeStructuredOutputMode,
    useSeparateReviewModel: false,
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
    reviewModel: form.mode === 'plaintext-actor' ? '' : form.model,
    providerId: form.mode === 'plaintext-actor' ? '' : form.providerId,
    protocol: form.mode === 'plaintext-actor' ? '' : form.protocol,
    region: form.mode === 'plaintext-actor' ? '' : form.region,
    reasoning: form.mode === 'plaintext-actor' ? 'auto' : form.reasoning,
    structuredOutput: form.mode === 'plaintext-actor' ? 'prompt_fallback' : form.structuredOutput,
    fvttVersion: game.version,
    systemVersion: game.system.version,
    effectProfile: 'core',
    iconMode: 'safe',
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
    autoCorrect: form.autoCorrect,
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
    reviewModel: form.model,
    useSeparateReviewModel: false,
    reasoning: form.reasoning,
    structuredOutput: form.structuredOutput,
    autoCorrect: form.autoCorrect,
  });
}

function sessionConnectionIdentity(settings: ForgeClientSettings): string {
  return JSON.stringify({
    providerId: settings.providerId,
    endpoint: normalizeBaseUrlIdentity(settings.endpoint),
    protocol: settings.protocol,
    authScheme: settings.authScheme,
    region: settings.region,
    model: settings.model,
    reviewModel: settings.reviewModel,
    useSeparateReviewModel: settings.useSeparateReviewModel,
    reasoning: settings.reasoning,
    structuredOutput: settings.structuredOutput,
    autoCorrect: settings.autoCorrect,
  });
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} 分 ${seconds} 秒`;
}
function providerActivityLabel(activity: IntakeProviderActivity): string {
  if (activity.failureReason) return requestFailureLabel(activity.failureReason);
  if (activity.phase === 'receiving_response') return '已经接通，正在接收回复';
  if (activity.phase === 'streaming_reasoning') return 'Provider 报告正在推理';
  if (activity.phase === 'streaming_output') return 'Provider 报告正在输出';
  if (activity.phase === 'completed') return 'Provider 已完成响应';
  if (activity.phase === 'failed') return 'Provider 响应失败';
  if (activity.phase === 'stopped') return '请求已由用户结束';
  if (activity.phase === 'validating') return '正在验证最终结构化响应';
  return '请求已发送，等待 Provider 活动';
}
function requestFailureLabel(reason: NonNullable<IntakeProviderActivity['failureReason']>): string {
  return ({ deadline_exceeded:'达到明确设置的等待上限', user_cancelled:'请求已主动取消',
    connection_failed:'尚未接通，连接失败', response_interrupted:'回复接收中断，未拿到完整答案',
    provider_incomplete:'服务端表示答案尚未完成', invalid_json:'回信格式无法读取', invalid_encoding:'回信文字编码无法读取',
    empty_response:'回信没有答案内容',unexpected_response:'回信结构无法识别',provider_error:'服务端返回了错误信息',http_error:'服务端拒绝或未能处理请求' })[reason];
}
function providerObservationText(activity: IntakeProviderActivity): string {
  const parts = [activity.responseHeadersAtMs ? '已经收到服务端回应。' : '还在等待服务端回应。'];
  if (activity.lastDataAtMs !== undefined) parts.push(`最后收到数据是在 ${formatDuration(Math.max(0, Date.now()-activity.lastDataAtMs))} 前；累计 ${activity.receivedBytes ?? 0} 字节。`);
  else parts.push('尚未观察到回复数据。');
  if (activity.keepAliveCount) parts.push(`收到 ${activity.keepAliveCount} 次维持连接的信号；这不能证明模型已开始生成。`);
  if (activity.bodyCompletedAtMs !== undefined) parts.push('回复接收已结束。');
  if (activity.providerActivity === 'reported_reasoning') parts.push('服务端报告正在推理；不显示或保存推理正文。');
  if (activity.failureReason) parts.push(requestFailureLabel(activity.failureReason)+'。');
  if (activity.failureEvidenceStatus) parts.push(({saved:'失败回信现场已保存。',metadata_only:'仅保存错误信息；适配器未提供回复正文。',save_failed:'失败现场保存失败；不要把当前记录当作完整现场。',not_configured:'未配置私有回信保存器，回复正文未保存。'})[activity.failureEvidenceStatus]);
  return parts.join(' ');
}
function humanSummary(status: ForgeIntakeReviewStatus, analysis: IntakeAnalysis | undefined, generation: IntakeGeneration | undefined, response: IntakeResponse | undefined, applyable: boolean): string {
  if (!analysis && status === 'empty') return '输入资料后点击“分析资料”。AI 模式需要先配置并测试 AI 连接。';
  if (status === 'analyzing') return '正在分析资料。请查看活动卡；请求不会因为观察周期结束而自动重发。';
  if (status === 'ready_to_generate') return '分析已通过，可以生成候选；不会自动请求付费模型审核。';
  if (status === 'generating_and_reviewing') return '候选正在生成并进行本地校验；不会自动请求付费模型审核。';
  if (status === 'ready_for_gm_review' && applyable) {
    const candidate = generation as BrowserActorGenerationResult | BrowserItemGenerationResult | undefined;
    const modelStatus = candidate?.modelReviewStatus;
    const localNeedsReview = candidate?.formalStatus === 'needs_review' || candidate?.formalStatus === 'failed'
      || candidate && 'intakeVerificationStatus' in candidate && candidate.intakeVerificationStatus === 'needs_review'
      || candidate?.deterministicFindings?.some(finding => finding.blocking)
      || analysis?.findings.some(finding => finding.blocking);
    if (localNeedsReview) {
      const modelSummary = modelStatus === 'accepted' ? 'AI 审核已通过'
        : modelStatus === 'needs_review' || modelStatus === 'failed' ? 'AI 审核有提示或失败' : 'AI 尚未审核';
      return `生成已完成，发现需要核对的地方。${modelSummary}。这些问题不会阻止生成或创建，请查看下方具体位置；提示只保留在 Forge 中。`;
    }
    return modelStatus === 'needs_review' || modelStatus === 'failed'
      ? '本地校验通过；AI 审核有提示或失败。请阅读具体提示，GM 仍可人工确认创建。'
      : modelStatus === 'accepted' ? '本地校验与 AI 审核已通过；仍需 GM 核对并确认创建。'
        : '本地校验通过；AI 尚未审核。GM 可人工核对并确认创建，也可明确请求额外付费审核。';
  }
  if (status === 'accepted' && applyable) return '本地校验已通过，可以由 GM 确认创建。';
  if (status === 'needs_review') return '发现需要核对的地方；请查看具体提示。已有 AI 角色资料仍可继续生成。';
  if (status === 'rejected') return '本次结果未采用；可以修改来源后重新分析。';
  if (status === 'failed') return '本轮处理失败；请先查看需要核对的内容，再决定是否重新分析。';
  if (response || generation) return '结果已生成，请按顺序查看摘要、时间线、需要核对的内容和来源依据。';
  return '当前结果尚未满足创建条件。';
}
function actorInput(form: ReturnType<typeof readForm>, requestId: string, game: any, onStage?: (stage: any) => void):Omit<BrowserActorIntakeInput,'sourceId'> {
  return { source: form.source, sourceName: form.sourceName, displayName: form.displayName, requestId, fvttVersion: game.version, systemVersion: game.system.version, autoCorrect:form.autoCorrect, onStage };
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
    && isForgeCoreVersionSupported(result.target.fvttRuntimeVersion) && result.target.systemVersionObserved === EXPECTED_SYSTEM_VERSION;
}
function acceptedItemResponse(response: ForgeItemResponse): boolean {
  const decoded = decodeForgeItemResponse(response);
  if (!decoded.ok || !('result' in decoded.value)) return false;
  const result = decoded.value.result;
  return result.status === 'accepted' && result.verification.status === 'accepted' && Boolean(result.artifact && result.artifactHash)
    && !result.diagnostics.some((entry) => entry.severity === 'warning' || entry.severity === 'error')
    && isForgeCoreVersionSupported(result.target.fvttRuntimeVersion) && result.target.systemVersionObserved === EXPECTED_SYSTEM_VERSION;
}
function isCurrentRuntime(game: any): boolean { try { assertGm(game); assertExactRuntime(game); return true; } catch { return false; } }
type DisplayIssue={code:string;path?:string;message:string;evidence?:readonly {quote:string}[]};
function spellResolutionIssues(actor:any):DisplayIssue[]{
  const resolution=actor?.flags?.['fvtt-json-generator-spell-resolver']?.spellResolution;
  if(!resolution)return[];
  const manifest=actor?.flags?.['fvtt-json-generator-spell-resolver']?.spellManifest;
  const restrictions=Array.isArray(resolution.report?.literalRestrictions)?resolution.report.literalRestrictions:[];
  const notes:DisplayIssue[]=restrictions.map((restriction:any)=>{
    const group=manifest?.spellcastingGroups?.find((g:any)=>g.groupId===restriction.groupId);
    const ref=group?.spellRefs?.find((r:any)=>r.refId===restriction.refId);
    const name=ref?.chineseName??ref?.englishName??ref?.originalName??restriction.refId;
    return{code:'SPELL_RESTRICTION_MANUAL',path:`/spell-resolution/${restriction.groupId}/${restriction.refId}`,
      message:`${name}：已按 AI 给出的参数录入施法活动；这项文字限定需要 GM 处理：${restriction.text}`};
  });
  if(!['failed','needs_review'].includes(resolution.status))return notes;
  const diagnostic=resolution.failureDiagnostic;
  const position=Number.isInteger(diagnostic?.selectionIndex)?`第 ${diagnostic.selectionIndex}/${diagnostic.selectionCount} 项`:'部分法术';
  return[...notes,{code:'SPELL_RESOLUTION_INCOMPLETE',path:'/spell-resolution',
    message:`原生施法未完成，${position}未能解析。角色和完整施法文字已保留；请核对法术活动是否可用。`,
    evidence:typeof resolution.error==='string'?[{quote:resolution.error}]:[]}];
}
function renderIssueList(entries:readonly DisplayIssue[],ir?:any):string{
  const unique=[...new Map(entries.map(entry=>[entry.code+'\0'+entry.path,entry])).values()];
  const operationSummaries=unique.filter(entry=>entry.code==='SOURCE_OPERATION_REVIEW');
  const operationCodes=new Set(['SOURCE_OPERATION_FACT_CONFLICT','SOURCE_OPERATION_INVENTORY_CONFLICT','MIXED_FEATURE_SOURCE_CONFLICT','SOURCE_BASIC_OPERATION_OMITTED']);
  const parentSummary=(entry:DisplayIssue)=>operationCodes.has(entry.code)?operationSummaries.find(summary=>summary.path&&(entry.path===summary.path||entry.path?.startsWith(summary.path+'/'))):undefined;
  const labels:Record<string,string>={languages:'语言',attributes:'基础数值',hp:'生命值',ac:'护甲等级',saveDc:'施法豁免 DC',
    usageGroups:'可施放法术与次数',sourceOperations:'动作活动',damage:'伤害',attack:'攻击',identity:'基本信息'};
  const messages:Record<string,string>={
    SOURCE_OPERATION_FACT_CONFLICT:'程序未能将这项动作的字段与原文逐项对应，生成结果仍保留，请核对。',
    MIXED_FEATURE_SOURCE_CONFLICT:'这项动作的原文引用未完全匹配，生成结果仍保留，请核对。',
    SOURCE_BASIC_OPERATION_OMITTED:'程序未能确认这项动作是否完整录入，请对照原文核对活动和伤害。',
    SOURCE_BASE_STATIC_CONFLICT:'程序未能确认这个基础字段与原文一致，请对照下方来源核对。',
    SPELL_SAVE_DC_EVIDENCE_MISMATCH:'程序未能将施法豁免 DC 与对应来源明确匹配，已保留 AI 给出的值。',
    SPELL_NOT_EXPLICITLY_GRANTED:'程序未能将这些法术与原文的施法条目明确匹配，已保留生成结果。',
    GEN_SOURCE_CANDIDATE_REVIEW_REQUIRED:'来源检查仍有疑点；生成结果已保留。',
  };
  return unique.filter(entry=>(entry.code!=='GEN_SOURCE_CANDIDATE_REVIEW_REQUIRED'||unique.length===1)&&!parentSummary(entry)).map(entry=>{
    const parts=(entry.path??'').split('/').filter(Boolean);
    let current=ir,location='';
    for(const part of parts){current=current?.[part];if(current&&typeof current==='object')location=current.name??current.featureName??location;}
    const field=[...parts].reverse().find(part=>labels[part]);
    location=[location,field?labels[field]:''].filter(Boolean).join(' · ')||'生成内容';
    const quote=entry.evidence?.map(ref=>ref.quote).filter(Boolean).join('\n');
    const related=unique.filter(other=>parentSummary(other)===entry);
    return `<li><strong>${escapeHtml(location)}</strong>：${escapeHtml(messages[entry.code]??entry.message)}
      ${quote?`<blockquote>${escapeHtml(quote.slice(0,900))}${quote.length>900?'…':''}</blockquote>`:''}
      <details><summary>检查详情${related.length?`（${related.length+1}项）`:''}</summary><small>${escapeHtml(entry.code)} · ${escapeHtml(entry.path??'')}</small><p>${escapeHtml(entry.message)}</p>
      ${related.map(other=>`<p>${escapeHtml(other.code)} · ${escapeHtml(other.path??'')}：${escapeHtml(other.message)}</p>`).join('')}</details></li>`;
  }).join('');
}
function renderBatchIssues(review:Readonly<ForgeIntakeReviewBundleV2>):string{
  const list=renderIssueList([...review.deterministicFindings,...review.aiReviewFindings,...(review.candidateResponse?.diagnostics??[])]);
  return list?`<section class="forge-findings forge-diagnostics"><strong>内容疑点与未匹配项（已保留生成结果）</strong><ul>${list}</ul></section>`:'';
}
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
    && isForgeCoreVersionSupported(target.fvttVersion)
    && target.systemId === 'dnd5e'
    && target.systemVersion === EXPECTED_SYSTEM_VERSION
    && target.generatorProfile === 'v14'
    && target.effectProfile === 'core'
    && (target.iconMode === 'off' || target.iconMode === 'safe'));
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

interface ForgeSessionSettingsApi {
  readForgeSessionSettings?: () => unknown;
  saveForgeSessionSettings?: (value: Partial<ForgeClientSettings>) => unknown;
  subscribeForgeSessionSettings?: (callback: (settings?: unknown) => void) => unknown;
  isForgeSessionConnectionReady?: (settings?: unknown) => unknown;
}

function resolveSessionSettingsApi(environment: ForgeIntakeApplicationEnvironment): ForgeSessionSettingsApi {
  const exported = forgeSettingsModule as unknown as ForgeSessionSettingsApi;
  const provided = environment.services ?? {};
  const hostname = (environment.window ?? (globalThis as any).window)?.location?.hostname ?? '';
  return {
    readForgeSessionSettings: provided.readForgeSessionSettings ?? exported.readForgeSessionSettings
      ?? (() => readLocalIntakeSettings(hostname)),
    saveForgeSessionSettings: provided.saveForgeSessionSettings ?? exported.saveForgeSessionSettings,
    subscribeForgeSessionSettings: provided.subscribeForgeSessionSettings ?? exported.subscribeForgeSessionSettings,
    isForgeSessionConnectionReady: provided.isForgeSessionConnectionReady ?? exported.isForgeSessionConnectionReady,
  };
}

function coerceForgeSessionSettings(raw: unknown, fallback: ForgeClientSettings): ForgeClientSettings {
  const root = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const nested = root.settings && typeof root.settings === 'object'
    ? root.settings as Record<string, unknown>
    : root.config && typeof root.config === 'object'
      ? root.config as Record<string, unknown>
      : root;
  const result = { ...fallback };
  const stringKeys: Array<keyof ForgeClientSettings> = [
    'providerId', 'protocol', 'authScheme', 'region', 'reasoning', 'structuredOutput', 'autoCorrect',
    'endpoint', 'model', 'reviewModel', 'apiKey',
  ];
  for (const key of stringKeys) if (typeof nested[key] === 'string') (result[key] as string) = (nested[key] as string).trim();
  for (const key of ['persistApiKey', 'useSeparateReviewModel'] as const) if (typeof nested[key] === 'boolean') result[key] = nested[key];
  if (nested.savedApiKeys && typeof nested.savedApiKeys === 'object' && !Array.isArray(nested.savedApiKeys)) {
    result.savedApiKeys = Object.fromEntries(Object.entries(nested.savedApiKeys as Record<string, unknown>).filter(([, value]) => typeof value === 'string')) as Record<string, string>;
  }
  result.reviewModel = result.model;
  result.useSeparateReviewModel = false;
  return result;
}

function sourceLibraryScope(game: any): string {
  const worldId = typeof game?.world?.id === 'string' ? game.world.id.trim() : '';
  const userId = typeof game?.user?.id === 'string' ? game.user.id.trim() : '';
  if (!worldId || !userId) throw new Error('Source library requires a resolved Foundry world ID and GM user ID.');
  return `${worldId}:${userId}`;
}

function reviewStatusLabel(status: ForgeIntakeReviewStatus): string {
  const labels: Record<ForgeIntakeReviewStatus, string> = {
    empty: '等待输入资料', analyzing: '正在分析资料…', ready_to_generate: '资料已分析，可以生成候选',
    generating_and_reviewing: '正在生成并本地校验…', repairing: '正在修正问题…', regenerating: '正在重新分析…',
    ready_for_gm_review: '候选可用，请核对问题并决定采用',reviewed_candidate:'GM 已确认采用待审候选；检查问题保留',
    accepted: '本地校验通过，可以确认创建', needs_review: '有问题需要核对', failed: '本次未完成，请检查问题说明',
    rejected: '已不采用本次结果', committing_and_reading_back: '正在创建并核对结果…',
  };
  return labels[status];
}
