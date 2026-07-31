import { isAbsolute, parse, relative, resolve, sep } from 'node:path';
import type { AssetCategory, AssetRebuildability, AssetRetention } from './model';

export type MigrationPlanStatus =
  | 'target-required'
  | 'target-not-empty'
  | 'ready-for-copy-authorization';

export interface AssetInventorySummaryRoot {
  id: string;
  category: AssetCategory;
  displayPath: string;
  source: string;
  expectedVersion: string | null;
  rebuildability: AssetRebuildability;
  retention: AssetRetention;
  exists: boolean;
  fileCount: number;
  directoryCount: number;
  totalBytes: number;
  rootSha256: string;
  issueCount: number;
  packageCount: number;
}

export interface AssetInventorySummary {
  schemaVersion: 1;
  generatedAt: string;
  complete: boolean;
  categories: Array<{
    category: AssetCategory;
    fileCount: number;
    totalBytes: number;
    roots: AssetInventorySummaryRoot[];
  }>;
}

export interface MigrationBatch {
  id: 'recovery-critical' | 'retained-evidence' | 'runtime' | 'rebuildable-last';
  purpose: string;
  categories: AssetCategory[];
  fileCount: number;
  totalBytes: number;
  roots: Array<{
    id: string;
    source: string;
    destination: string | null;
    category: AssetCategory;
    retention: AssetRetention;
    rebuildability: AssetRebuildability;
    fileCount: number;
    totalBytes: number;
    rootSha256: string;
  }>;
}

export interface LabMigrationPlan {
  schemaVersion: 1;
  generatedAt: string;
  planOnly: true;
  copyAuthorized: false;
  deletionAuthorized: false;
  source: {
    labRoot: string;
    inventorySummary: string;
    inventoryGeneratedAt: string;
    fileCount: number;
    totalBytes: number;
    rootCount: number;
  };
  target: {
    labRoot: string | null;
    state: 'unselected' | 'missing' | 'empty' | 'non-empty';
  };
  status: MigrationPlanStatus;
  batches: MigrationBatch[];
  gates: string[];
  compatibilityWindow: string[];
  rollback: string[];
  recoverySampling: string[];
  exclusions: string[];
}

const BATCHES: ReadonlyArray<Pick<MigrationBatch, 'id' | 'purpose' | 'categories'>> = [
  {
    id: 'recovery-critical',
    purpose: '先保护不可替代的世界和恢复备份，同时保持当前目录完全不变。',
    categories: ['worlds', 'backups'],
  },
  {
    id: 'retained-evidence',
    purpose: '确认恢复材料已有独立副本后，再复制需要保留的验收证据和实验环境内归档。',
    categories: ['evidence', 'archives'],
  },
  {
    id: 'runtime',
    purpose: '恢复材料受到保护后，再复制锁定版本的程序、模组和游戏系统。',
    categories: ['app-binaries', 'modules', 'systems'],
  },
  {
    id: 'rebuildable-last',
    purpose: '最后处理可重建缓存和临时材料；是否保留仍需单独判断。',
    categories: ['scratch-cache'],
  },
];

export function buildLabMigrationPlan(options: {
  generatedAt: string;
  sourceLabRoot: string;
  inventorySummaryPath: string;
  inventory: AssetInventorySummary;
  targetLabRoot?: string;
  targetState?: 'missing' | 'empty' | 'non-empty';
}): LabMigrationPlan {
  if (!options.inventory.complete) {
    throw new Error('Migration planning requires a complete accepted asset inventory.');
  }
  const sourceLabRoot = resolve(options.sourceLabRoot);
  const targetLabRoot = options.targetLabRoot ? resolve(options.targetLabRoot) : null;
  const roots = options.inventory.categories
    .flatMap((category) => category.roots)
    .filter((root) => root.displayPath === '$FVTT_OPS_LAB_ROOT'
      || root.displayPath.startsWith('$FVTT_OPS_LAB_ROOT/'));
  if (roots.some((root) => root.issueCount > 0)) {
    throw new Error('Migration planning requires zero inventory issues in every registered lab root.');
  }

  const batches = BATCHES.map((batch): MigrationBatch => {
    const batchRoots = roots.filter((root) => batch.categories.includes(root.category));
    return {
      ...batch,
      categories: [...batch.categories],
      fileCount: batchRoots.reduce((total, root) => total + root.fileCount, 0),
      totalBytes: batchRoots.reduce((total, root) => total + root.totalBytes, 0),
      roots: batchRoots.map((root) => ({
        id: root.id,
        source: root.displayPath,
        destination: targetLabRoot ? resolveTargetDisplayPath(root.displayPath) : null,
        category: root.category,
        retention: root.retention,
        rebuildability: root.rebuildability,
        fileCount: root.fileCount,
        totalBytes: root.totalBytes,
        rootSha256: root.rootSha256,
      })),
    };
  });
  const targetState = targetLabRoot ? options.targetState ?? 'missing' : 'unselected';
  const status: MigrationPlanStatus = !targetLabRoot
    ? 'target-required'
    : targetState === 'non-empty'
      ? 'target-not-empty'
      : 'ready-for-copy-authorization';

  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt,
    planOnly: true,
    copyAuthorized: false,
    deletionAuthorized: false,
    source: {
      labRoot: sourceLabRoot,
      inventorySummary: resolve(options.inventorySummaryPath),
      inventoryGeneratedAt: options.inventory.generatedAt,
      fileCount: roots.reduce((total, root) => total + root.fileCount, 0),
      totalBytes: roots.reduce((total, root) => total + root.totalBytes, 0),
      rootCount: roots.length,
    },
    target: { labRoot: targetLabRoot, state: targetState },
    status,
    batches,
    gates: [
      '选择目标目录或生成本方案，都不等于授权复制。',
      '复制前必须重新盘点来源，并要求文件数、字节数和每个根目录的内容指纹与本方案一致。',
      '必须严格按完整分类清单列出的文件逐批复制，继续排除隐私目录、链接和未登记内容。',
      '每次只复制一批到专用空目录，绝不与无关的非空目录混合。',
      '每批结束后重新盘点目标，要求每个根目录的文件数、字节数和内容指纹完全一致。',
      '全部批次对账且另行授权的恢复抽样通过前，不得切换 FVTT_OPS_LAB_ROOT。',
      '本方案及兼容窗口期间，不得删除、移动或改作他用当前来源目录。',
    ],
    compatibilityWindow: [
      '目标复制并验证后，继续完整保留当前来源目录，不对它写入。',
      '只通过设置 FVTT_OPS_LAB_ROOT 做一次有明确时限的本地验收；不重写旧目录。',
      '从目标目录核对 Foundry 版本、dnd5e 版本、模组清单、选中世界和证据目录。',
      '用户单独验收新目录并另行授权退役前，旧目录始终保留。',
    ],
    rollback: [
      '如果启动过短时本地 Foundry，先停止它。',
      '取消 FVTT_OPS_LAB_ROOT、FVTT_OPS_EVIDENCE_ROOT 和 FVTT_OPS_BACKUP_ROOT 的外置设置。',
      '只从未改动的来源目录重新启动，并确认原先世界和程序版本。',
      '保留未通过验收的目标副本用于诊断；回滚过程本身不删除它。',
    ],
    recoverySampling: [
      '通过另行批准的操作手册，至少选择一份关键世界备份。',
      '把恢复样本复制到来源和目标活动世界之外的一次性目录。',
      '用精确文件数、字节数和 SHA-256 内容指纹，把恢复样本与清单或来源根目录对账。',
      '任何 Foundry 启动或打开世界验收都是另一次短时本地操作；本方案不包含长时间监测。',
    ],
    exclusions: [
      '$FVTT_OPS_LAB_ROOT 之外的 .local 顶层条目不在本方案内。',
      '因隐私排除的凭据、Cookie、浏览器档案、OAuth 状态和 Foundry Config 内容，不会被本方案盘点或复制。',
      '单独登记的旧归档 $REPO_ROOT/.local/cor-cotn.7z 不会放入目标实验环境根目录。',
      '不访问生产服务器或生产数据。',
    ],
  };
}

export function assertExternalMigrationTarget(repoRoot: string, sourceLabRoot: string, target: string): string {
  const candidate = resolve(target);
  if (!isAbsolute(candidate) || relative(parse(candidate).root, candidate) === '') {
    throw new Error(`Migration target must be a specific absolute directory: ${candidate}`);
  }
  for (const [label, protectedRoot] of [
    ['repository', resolve(repoRoot)],
    ['source lab', resolve(sourceLabRoot)],
  ] as const) {
    if (pathsOverlap(protectedRoot, candidate)) {
      throw new Error(`Migration target must be outside the ${label} root: ${candidate}`);
    }
  }
  return candidate;
}

function pathsOverlap(left: string, right: string): boolean {
  return isInside(left, right) || isInside(right, left);
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function resolveTargetDisplayPath(sourceDisplayPath: string): string {
  if (sourceDisplayPath === '$FVTT_OPS_LAB_ROOT') return '$TARGET_FVTT_OPS_LAB_ROOT';
  return sourceDisplayPath.replace('$FVTT_OPS_LAB_ROOT/', '$TARGET_FVTT_OPS_LAB_ROOT/');
}
