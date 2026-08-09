import {
  applyActorMigrationPlan,
  canonicalJson,
  clone,
  planActorMigration,
  validateMigratedActorProjection,
} from './migration.ts';
import type {
  ActorLike,
  ActorMigrationPlan,
  ConflictDecision,
  MigrationContract,
  ProjectionValidation,
} from './contracts.ts';

export const MODULE_ID = 'fvtt-blood-hunter-2024' as const;
export const MODULE_VERSION = '1.0.0' as const;
export const MIGRATION_APP_TITLE = '血猎手 2024：角色迁移';
export const MIGRATION_CONTRACT_URL = `modules/${MODULE_ID}/data/migration-contract.json`;

export interface FoundryActorDocument extends ActorLike {
  toObject?: (source?: boolean) => ActorLike;
  update?: (data: JsonUpdate) => Promise<FoundryActorDocument>;
  delete?: () => Promise<void>;
}

export interface JsonUpdate {
  items: unknown[];
}

export interface MigrationProof {
  actorId: string;
  actorName: string;
  copyId: string;
  backup: ActorLike;
  backupFileName: string;
  migratedData: ActorLike;
  plan: ActorMigrationPlan;
  validation: ProjectionValidation;
}

export interface RuntimeDependencies {
  root?: Record<string, any>;
  createActor?: (data: ActorLike) => Promise<FoundryActorDocument>;
  saveJsonBackup?: (data: ActorLike, fileName: string) => Promise<void>;
}

export function rootObject(): Record<string, any> {
  return globalThis as unknown as Record<string, any>;
}

export function isGM(root: Record<string, any> = rootObject()): boolean {
  return root.game?.user?.isGM === true;
}

export function assertGM(root: Record<string, any> = rootObject()): void {
  if (!isGM(root)) throw new Error('血猎手角色迁移仅允许 GM 使用。');
}

export async function loadMigrationContract(url = MIGRATION_CONTRACT_URL, fetcher: typeof fetch = fetch): Promise<MigrationContract> {
  const response = await fetcher(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`血猎手迁移契约加载失败：HTTP ${response.status}`);
  const contract = await response.json() as MigrationContract;
  if (contract.moduleId !== MODULE_ID || contract.version !== MODULE_VERSION || contract.schemaVersion !== 1) throw new Error('血猎手迁移契约身份或版本不匹配。');
  if (!Array.isArray(contract.documents) || !Array.isArray(contract.fixedGrantDocumentIds)) throw new Error('血猎手迁移契约缺少 canonical documents/fixed grants。');
  return contract;
}

export function actorToData(actor: FoundryActorDocument | ActorLike): ActorLike {
  if (typeof actor.toObject === 'function') return clone(actor.toObject(false));
  return clone(actor);
}

export function previewActorMigration(actor: FoundryActorDocument | ActorLike, contract: MigrationContract): ActorMigrationPlan {
  assertGM();
  return planActorMigration(actorToData(actor), contract);
}

export function migrationConflictsResolved(
  plan: ActorMigrationPlan | undefined,
  decisions: Record<string, ConflictDecision>,
): boolean {
  return Boolean(plan) && (plan?.conflicts ?? []).every((conflict) => {
    const decision = decisions[`${conflict.itemId}:${conflict.path}`];
    return decision === 'Keep' || decision === 'Overwrite';
  });
}

export async function createMigratedCopy(
  actor: FoundryActorDocument,
  contract: MigrationContract,
  plan: ActorMigrationPlan,
  decisions: Record<string, ConflictDecision> = {},
  dependencies: RuntimeDependencies = {},
): Promise<MigrationProof> {
  const root = dependencies.root ?? rootObject();
  assertGM(root);
  const before = actorToData(actor);
  if (String(before._id ?? before.id ?? '') !== plan.actorId || String(before.name ?? '') !== plan.actorName) throw new Error('Preview 的 Actor 已变化，必须重新 Preview。');
  if (canonicalJson(before) !== plan.actorSnapshot) throw new Error('Preview 后 Actor 内容已变化，必须重新 Preview。');
  const migratedData = applyActorMigrationPlan(before, plan, decisions);
  const validation = validateMigratedActorProjection(before, migratedData, contract);
  if (!validation.ok) throw new Error(`迁移副本验证失败：${validation.findings.map((finding) => finding.code).join(', ')}`);
  const actorId = String(before._id ?? before.id ?? 'unknown');
  const actorName = String(before.name ?? 'Actor');
  const backup = clone(before);
  const backupFileName = `blood-hunter-2024-${actorId}-backup.json`;
  await (dependencies.saveJsonBackup ?? ((data, fileName) => saveJsonBackup(data, fileName, root)))(backup, backupFileName);
  const copyData = clone(migratedData);
  delete copyData._id;
  delete copyData.id;
  copyData.name = `${actorName}（血猎手迁移副本）`;
  const createActor = dependencies.createActor ?? (async (data: ActorLike) => {
    const created = await root.game?.actors?.create(data);
    if (!created) throw new Error('Foundry Actor Document API 未创建迁移副本。');
    return created as FoundryActorDocument;
  });
  const copy = await createActor(copyData);
  const copyDataAfterCreate = actorToData(copy);
  const copyValidation = validateMigratedActorProjection(before, copyDataAfterCreate, contract);
  if (!copyValidation.ok) throw new Error(`迁移副本写入后验证失败：${copyValidation.findings.map((finding) => finding.code).join(', ')}`);
  return {
    actorId,
    actorName,
    copyId: String(copyDataAfterCreate._id ?? copyDataAfterCreate.id ?? ''),
    backup,
    backupFileName,
    migratedData: copyDataAfterCreate,
    plan,
    validation: copyValidation,
  };
}

export async function applyOriginalMigration(
  actor: FoundryActorDocument,
  contract: MigrationContract,
  proof: MigrationProof,
  exactNameConfirmation: string,
  decisions: Record<string, ConflictDecision> = {},
  dependencies: RuntimeDependencies = {},
): Promise<{ actor: FoundryActorDocument; validation: ProjectionValidation; rolledBack: false }> {
  const root = dependencies.root ?? rootObject();
  assertGM(root);
  if (exactNameConfirmation !== String(actor.name ?? '')) throw new Error('Apply original 需要输入与 Actor 名字完全一致的确认文字。');
  const before = actorToData(actor);
  const actorId = String(before._id ?? before.id ?? '');
  if (actorId !== proof.actorId || String(before.name ?? '') !== proof.actorName) throw new Error('Actor 已变化，不能使用旧的副本/备份证明；请重新 Preview 和 Create migrated copy。');
  if (canonicalJson(before) !== canonicalJson(proof.backup)) throw new Error('创建迁移副本后 Actor 内容已变化；必须重新 Preview 和 Create migrated copy。');
  const copyValidation = validateMigratedActorProjection(proof.backup, proof.migratedData, contract);
  if (!copyValidation.ok) throw new Error('迁移副本验证不再通过，Apply original 已停止。');
  const latestPlan = planActorMigration(before, contract);
  const migratedData = applyActorMigrationPlan(before, latestPlan, decisions);
  const expectedProjection = validateMigratedActorProjection(before, migratedData, contract);
  if (!expectedProjection.ok) throw new Error(`Apply 前投影验证失败：${expectedProjection.findings.map((finding) => finding.code).join(', ')}`);
  const backup = clone(before);
  await (dependencies.saveJsonBackup ?? ((data, fileName) => saveJsonBackup(data, fileName, root)))(backup, `blood-hunter-2024-${actorId}-apply-backup.json`);
  if (typeof actor.update !== 'function') throw new Error('Foundry Actor Document API 不可用，不能 Apply original。');
  try {
    await actor.update({ items: migratedData.items ?? [] });
    const after = actorToData(actor);
    const validation = validateMigratedActorProjection(before, after, contract);
    if (!validation.ok) throw new Error(`Apply 后验证失败：${validation.findings.map((finding) => finding.code).join(', ')}`);
    return { actor, validation, rolledBack: false };
  } catch (error) {
    try {
      await actor.update({ items: before.items ?? [] });
      const restored = actorToData(actor);
      const rollbackValidation = validateMigratedActorProjection(before, restored, contract);
      if (!rollbackValidation.ok || canonicalJson(restored.items) !== canonicalJson(before.items)) throw new Error('补偿回滚后的 Actor projection 仍不等于 Apply 前状态。');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Blood Hunter Apply original 失败，补偿回滚也失败；需要人工恢复 JSON backup。');
    }
    throw new Error(`Blood Hunter Apply original 已失败并回滚：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function saveJsonBackup(data: ActorLike, fileName: string, root: Record<string, any>): Promise<void> {
  const serialized = JSON.stringify(data, null, 2);
  if (typeof root.saveDataToFile === 'function') {
    await root.saveDataToFile(serialized, 'application/json', fileName);
    return;
  }
  if (!root.document?.createElement || !root.URL?.createObjectURL || typeof root.Blob !== 'function') throw new Error('Foundry/browser JSON backup API 不可用；Apply original 已停止。');
  const blob = new root.Blob([serialized], { type: 'application/json' });
  const url = root.URL.createObjectURL(blob);
  try {
    const link = root.document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
  } finally {
    root.URL.revokeObjectURL(url);
  }
}

type ApplicationConstructor = new (...args: any[]) => any;

function applicationV2Constructor(root: Record<string, any>): ApplicationConstructor | undefined {
  const candidate = root.foundry?.applications?.api?.ApplicationV2;
  return typeof candidate === 'function' ? candidate as ApplicationConstructor : undefined;
}

// Foundry 14 validates setting menus against its ApplicationV2 hierarchy.
// Keep a test-only inert base for Node imports, then fail closed before menu
// registration unless the actual v14 constructor was available at evaluation.
const ApplicationV2Base = applicationV2Constructor(rootObject()) ?? class {};

function createBloodHunterMigrationApp(ApplicationV2Base: ApplicationConstructor): ApplicationConstructor {
  return class BloodHunterMigrationApp extends ApplicationV2Base {
    static DEFAULT_OPTIONS = {
      id: 'fvtt-blood-hunter-2024-migration',
      classes: ['fvtt-blood-hunter-2024-migration'],
      window: { title: MIGRATION_APP_TITLE, resizable: true },
      position: { width: 720, height: 'auto' },
    };

    private contract?: MigrationContract;
    private plan?: ActorMigrationPlan;
    private proof?: MigrationProof;
    private decisions: Record<string, ConflictDecision> = {};

    async loadContract(): Promise<MigrationContract> {
    this.contract ??= await loadMigrationContract();
    return this.contract;
    }

    close(options?: Record<string, unknown>): Promise<unknown> {
    for (const conflict of this.plan?.conflicts ?? []) this.decisions[`${conflict.itemId}:${conflict.path}`] = 'Cancel';
    return super.close(options);
    }

    async preview(actor: FoundryActorDocument): Promise<ActorMigrationPlan> {
    const contract = await this.loadContract();
    // Every Preview establishes a fresh decision boundary. A choice made for
    // an earlier Actor snapshot must never silently authorize a later plan.
    this.decisions = {};
    this.plan = previewActorMigration(actor, contract);
    this.proof = undefined;
    return this.plan;
    }

    async createCopy(actor: FoundryActorDocument, dependencies: RuntimeDependencies = {}): Promise<MigrationProof> {
    const contract = await this.loadContract();
    if (!this.plan) this.plan = previewActorMigration(actor, contract);
    this.proof = await createMigratedCopy(actor, contract, this.plan, this.decisions, dependencies);
    return this.proof;
    }

    async apply(actor: FoundryActorDocument, exactNameConfirmation: string, dependencies: RuntimeDependencies = {}): Promise<unknown> {
    if (!this.proof) throw new Error('必须先 Create migrated copy 并生成 JSON backup。');
    const contract = await this.loadContract();
    return applyOriginalMigration(actor, contract, this.proof, exactNameConfirmation, this.decisions, dependencies);
    }

    setConflictDecision(itemId: string, path: string, decision: ConflictDecision): void {
    this.decisions[`${itemId}:${path}`] = decision;
    }

    async _renderHTML(): Promise<HTMLElement> {
    assertGM();
    const root = document.createElement('section');
    root.className = 'fvtt-blood-hunter-2024-migration';
    root.innerHTML = `
      <h2>${MIGRATION_APP_TITLE}</h2>
      <p>Preview 只读。必须先创建迁移副本和 JSON backup；Apply original 还需要输入精确 Actor 名称。</p>
      <label>Actor ID 或精确名称 <input name="actor" type="text" /></label>
      <label>Apply original 精确确认 <input name="confirmation" type="text" /></label>
      <div class="bh-status" data-role="status">尚未选择 Actor。</div>
      <div class="bh-conflicts" data-role="conflicts"></div>
      <div class="bh-actions">
        <button type="button" data-action="preview">Preview</button>
        <button type="button" data-action="copy" disabled>Create migrated copy</button>
        <button type="button" data-action="apply" disabled>Apply original</button>
      </div>`;
    this.attachListeners(root);
    return root;
    }

    _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
    }

    private attachListeners(root: HTMLElement): void {
    const game = rootObject().game;
    const findActor = (): FoundryActorDocument => {
      const value = String((root.querySelector('[name="actor"]') as HTMLInputElement | null)?.value ?? '');
      const byId = game?.actors?.get?.(value) as FoundryActorDocument | undefined;
      const byName = byId ?? game?.actors?.contents?.find((candidate: FoundryActorDocument) => candidate.name === value) as FoundryActorDocument | undefined;
      if (!byName) throw new Error('找不到精确 Actor；迁移不会扫描或修改其他 Actor。');
      return byName;
    };
    const status = root.querySelector('[data-role="status"]');
    const conflictsRoot = root.querySelector('[data-role="conflicts"]');
    const copyButton = root.querySelector('[data-action="copy"]') as HTMLButtonElement | null;
    const applyButton = root.querySelector('[data-action="apply"]') as HTMLButtonElement | null;
    root.querySelector('[data-action="preview"]')?.addEventListener('click', async () => {
      try {
        const plan = await this.preview(findActor());
        if (status) status.textContent = plan.eligible ? `Preview 完成：${plan.actions.filter((action) => action.action === 'update' || action.action === 'add').length} 项将迁移，${plan.conflicts.length} 项冲突。` : 'Actor 不满足 Blood Hunter 身份边界。';
        const refreshCopyState = () => {
          if (copyButton) copyButton.disabled = !plan.eligible || !migrationConflictsResolved(plan, this.decisions);
        };
        refreshCopyState();
        if (applyButton) applyButton.disabled = true;
        if (conflictsRoot) this.renderConflicts(conflictsRoot, plan.conflicts, refreshCopyState);
      } catch (error) { if (status) status.textContent = error instanceof Error ? error.message : String(error); }
    });
    root.querySelector('[data-action="copy"]')?.addEventListener('click', async () => {
      try {
        const proof = await this.createCopy(findActor());
        if (status) status.textContent = `副本已验证：${proof.copyId}；JSON backup 已生成：${proof.backupFileName}。`;
        if (applyButton) applyButton.disabled = false;
      } catch (error) { if (status) status.textContent = error instanceof Error ? error.message : String(error); }
    });
    root.querySelector('[data-action="apply"]')?.addEventListener('click', async () => {
      try {
        const actor = findActor();
        const confirmation = String((root.querySelector('[name="confirmation"]') as HTMLInputElement | null)?.value ?? '');
        await this.apply(actor, confirmation);
        if (status) status.textContent = '原 Actor 已应用并完成投影验证。';
      } catch (error) { if (status) status.textContent = error instanceof Error ? error.message : String(error); }
    });
    }

    private renderConflicts(
    root: Element,
    conflicts: Array<{ itemId: string; path: string; reason: string }>,
    onDecision?: () => void,
    ): void {
    root.innerHTML = '';
    for (const conflict of conflicts) {
      const row = document.createElement('div');
      row.className = 'bh-conflict';
      row.innerHTML = `<p>${conflict.itemId} · ${conflict.path}: ${conflict.reason}</p><button type="button" data-decision="Keep">Keep</button><button type="button" data-decision="Overwrite">Overwrite</button><button type="button" data-decision="Cancel">Cancel</button>`;
      for (const button of Array.from(row.querySelectorAll('button'))) button.addEventListener('click', () => {
        this.setConflictDecision(conflict.itemId, conflict.path, button.getAttribute('data-decision') as ConflictDecision);
        onDecision?.();
      });
      root.append(row);
    }
    }
  };
}

// Export an inert-base variant for Node-side contract tests. The registered
// Foundry menu below is always created from the ApplicationV2 resolved during
// init, so it cannot inherit this test fallback in a real v14 runtime.
export const BloodHunterMigrationApp = createBloodHunterMigrationApp(ApplicationV2Base);

export function registerBloodHunterRuntime(root: Record<string, any> = rootObject()): void {
  const hooks = root.Hooks;
  if (!hooks || typeof hooks.once !== 'function') return;
  hooks.once('init', () => {
    const settings = root.game?.settings;
    if (settings && typeof settings.registerMenu === 'function') {
      const ApplicationV2 = applicationV2Constructor(root);
      if (!ApplicationV2) {
        root.console?.error?.('Blood Hunter migration menu was not registered because Foundry 14 ApplicationV2 was unavailable during module initialization.');
        return;
      }
      const menuType = createBloodHunterMigrationApp(ApplicationV2);
      try {
        settings.registerMenu(MODULE_ID, 'migration', {
          name: MIGRATION_APP_TITLE,
          label: '打开角色迁移',
          hint: 'GM-only；打开后才读取你明确选择的 Actor。',
          icon: 'fas fa-vial',
          type: menuType,
          restricted: true,
        });
      } catch (error) {
        root.console?.error?.('Blood Hunter migration menu registration failed; the module will remain loaded without this menu.', error);
      }
    }
  });
}
