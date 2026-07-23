import { analyzeWorld, type AuditAnalysis } from "./inventory";
import type { WorldSnapshot } from "./model";

export const AUDIT_TARGET = {
  worldId: "cor-cotn",
  foundry: "14.364",
  dnd5e: "5.3.3",
} as const;

export const USER_DECISION_VALUES = [
  "Keep",
  "Delete",
  "Archive",
  "Restore Reference",
  "Needs Review",
] as const;

export const WORKBOOK_SHEET_NAMES = [
  "Overview",
  "Actors",
  "Unused Actor Candidates",
  "Broken Token Actor Refs",
  "Journals",
  "Journal Pages",
  "Scenes",
  "World Items",
  "Macros and Tables",
  "Playlists and Combats",
  "Chat and Fog",
  "Settings and Modules",
  "Compendiums and Adventures",
  "Assets",
  "Chapter Classification",
  "User Decisions",
] as const;

export type AuditBaselineStatus = "pending-runtime-sampling" | "partial" | "complete";
export type AuditBaselineLayerStatus = "pending" | "blocked" | "measured";

export interface AuditBaselineLayer {
  status: AuditBaselineLayerStatus;
  metrics: Record<string, string | number | boolean>;
  note?: string;
}

export interface AuditBaseline {
  status: AuditBaselineStatus;
  target: typeof AUDIT_TARGET;
  sourceTreeHash: string;
  remoteAccessed: false;
  performanceLayers: {
    disk: AuditBaselineLayer;
    initialization: AuditBaselineLayer;
    canvasGpu: AuditBaselineLayer;
    continuousRuntime: AuditBaselineLayer;
  };
  blockers: string[];
}

export interface AuditValidation {
  collectionKeyCrossChecks: Array<{
    name: string;
    levelKeys: number;
    topLevel: number;
    embedded: number;
    matchesParentArrays: boolean;
  }>;
  duplicateIds: Array<Record<string, unknown>>;
  danglingFolders: number;
  unresolvedReferences: number;
}

export interface TrackedSummaryProjection {
  target: typeof AUDIT_TARGET;
  remoteAccessed: false;
  sourceTreeUnchanged: boolean;
  disk: {
    totalBytes: number;
    collectionBytes: Array<{ collection: string; bytes: number }>;
  };
  collections: Array<{
    name: string;
    count: number;
    levelKeys: number;
    embedded: number;
    bytes: number;
    matchesParentArrays: boolean;
  }>;
  actors: {
    total: number;
    withoutSceneReference: number;
    withoutAnyDetectedReference: number;
    unusedCandidates: number;
    brokenTokenActorReferences: number;
  };
  journals: {
    total: number;
    pages: number;
    languageCounts: Array<{ label: string; count: number }>;
    pageTypeCounts: Array<{ label: string; count: number }>;
    moduleOwnerCounts: Array<{ label: string; count: number }>;
  };
  chapters: {
    categories: Array<{ label: string; count: number }>;
    confidence: Array<{ label: string; count: number }>;
  };
  packaging: {
    adventureRows: number;
    compendiumRows: number;
  };
  performance: {
    baselineStatus: string;
    layers: readonly ["disk", "initialization", "canvas-gpu", "continuous-runtime"];
  };
  decisions: {
    automaticDeletion: false;
    allowedValues: typeof USER_DECISION_VALUES;
  };
  validation: AuditValidation;
}

export interface WorkbookSource {
  allowedUserDecisions: typeof USER_DECISION_VALUES;
  sheets: Record<(typeof WORKBOOK_SHEET_NAMES)[number], Array<Record<string, unknown>>>;
}

export interface AuditReport {
  inventory: Record<string, unknown>;
  references: AuditAnalysis["references"];
  chapterClassification: AuditAnalysis["chapters"];
  baseline: AuditBaseline;
  unresolvedMarkdown: string;
  summaryMarkdown: string;
  workbookSource: WorkbookSource;
  trackedSummary: TrackedSummaryProjection;
  validation: AuditValidation;
}

export function createPendingBaseline(snapshot: WorldSnapshot): AuditBaseline {
  return {
    status: "pending-runtime-sampling",
    target: AUDIT_TARGET,
    sourceTreeHash: snapshot.sourceTreeHashBefore,
    remoteAccessed: false,
    performanceLayers: {
      disk: {
        status: "measured",
        metrics: {
          sourceTreeBytes: snapshot.sourceTree.reduce((total, entry) => total + entry.bytes, 0),
          collectionCount: Object.keys(snapshot.collectionBytes).length,
        },
      },
      initialization: {
        status: "pending",
        metrics: {},
        note: "Task 4 runtime initialization sampling has not been supplied.",
      },
      canvasGpu: {
        status: "pending",
        metrics: {},
        note: "Task 4 active Scene Canvas/GPU sampling has not been supplied.",
      },
      continuousRuntime: {
        status: "pending",
        metrics: {},
        note: "Task 4 continuous-runtime sampling has not been supplied.",
      },
    },
    blockers: ["Task 4 runtime sampling has not been supplied."],
  };
}

export function validateAuditBaseline(value: unknown, snapshot: WorldSnapshot): AuditBaseline {
  if (!isRecord(value)) throw new Error("Baseline must be a JSON object");
  assertExactRecordKeys(
    value,
    ["status", "target", "sourceTreeHash", "remoteAccessed", "performanceLayers", "blockers"],
    "Baseline",
  );
  if (!["pending-runtime-sampling", "partial", "complete"].includes(String(value.status))) {
    throw new Error("Baseline status must be pending-runtime-sampling, partial, or complete");
  }
  if (
    !isRecord(value.target)
    || value.target.worldId !== AUDIT_TARGET.worldId
    || value.target.foundry !== AUDIT_TARGET.foundry
    || value.target.dnd5e !== AUDIT_TARGET.dnd5e
  ) {
    throw new Error("Baseline target must be cor-cotn / Foundry 14.364 / dnd5e 5.3.3");
  }
  assertExactRecordKeys(value.target, ["worldId", "foundry", "dnd5e"], "Baseline target");
  if (value.sourceTreeHash !== snapshot.sourceTreeHashBefore) {
    throw new Error("Baseline sourceTreeHash must match the current verified snapshot");
  }
  if (value.remoteAccessed !== false) {
    throw new Error("Baseline remoteAccessed must be false");
  }
  if (!isRecord(value.performanceLayers)) {
    throw new Error("Baseline performanceLayers must contain all four performance layers");
  }

  const layerNames = ["disk", "initialization", "canvasGpu", "continuousRuntime"] as const;
  if (
    Object.keys(value.performanceLayers).sort(compareOrdinal).join("\0")
    !== [...layerNames].sort(compareOrdinal).join("\0")
  ) {
    throw new Error("Baseline performanceLayers must contain exactly disk, initialization, canvasGpu, and continuousRuntime");
  }
  const performanceLayers = {} as AuditBaseline["performanceLayers"];
  for (const name of layerNames) {
    performanceLayers[name] = validateBaselineLayer(value.performanceLayers[name], name);
  }
  if (!Array.isArray(value.blockers) || value.blockers.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error("Baseline blockers must be an array of non-empty strings");
  }

  const status = value.status as AuditBaselineStatus;
  const measuredCount = layerNames.filter((name) => performanceLayers[name].status === "measured").length;
  if (status === "complete" && (measuredCount !== layerNames.length || value.blockers.length !== 0)) {
    throw new Error("Complete baseline requires every performance layer measured and no blockers");
  }
  if (status === "partial" && (measuredCount === 0 || measuredCount === layerNames.length || value.blockers.length === 0)) {
    throw new Error("Partial baseline requires some measured layers, some incomplete layers, and blockers");
  }
  if (status === "pending-runtime-sampling" && (measuredCount === layerNames.length || value.blockers.length === 0)) {
    throw new Error("Pending baseline requires incomplete runtime sampling and blockers");
  }

  return {
    status,
    target: AUDIT_TARGET,
    sourceTreeHash: snapshot.sourceTreeHashBefore,
    remoteAccessed: false,
    performanceLayers,
    blockers: [...value.blockers],
  };
}

export function createTrackedSummaryProjection(
  snapshot: WorldSnapshot,
  analysis: AuditAnalysis = analyzeWorld(snapshot),
  baseline: AuditBaseline = createPendingBaseline(snapshot),
): TrackedSummaryProjection {
  const validation = createAuditValidation(snapshot, analysis);
  const crossChecks = new Map(validation.collectionKeyCrossChecks.map((row) => [row.name, row]));
  const collectionRows = Object.entries(analysis.overview)
    .filter(([name, count]) => name.endsWith(".topLevel") && typeof count === "number")
    .map(([key, count]) => {
      const name = key.slice(0, -".topLevel".length);
      const crossCheck = crossChecks.get(name);
      if (!crossCheck || crossCheck.topLevel !== count) {
        throw new Error(`Collection summary does not reconcile with key classifications: ${name}`);
      }
      return {
        name,
        count: count as number,
        levelKeys: crossCheck.levelKeys,
        embedded: crossCheck.embedded,
        bytes: snapshot.collectionBytes[name] ?? 0,
        matchesParentArrays: crossCheck.matchesParentArrays,
      };
    })
    .sort((left, right) => compareOrdinal(left.name, right.name));
  if (
    collectionRows.length !== validation.collectionKeyCrossChecks.length
    || collectionRows.some((row) => !crossChecks.has(row.name))
  ) {
    throw new Error("Collection summary keys do not match the snapshot collection classifications");
  }
  const languageCounts = countRows(analysis.journalPages, "language");
  const pageTypeCounts = countRows(analysis.journalPages, "type");
  const moduleOwnerCounts = countRows(analysis.journalPages, "moduleOwner");
  const categoryCounts = countValues(analysis.chapters.map((row) => row.category));
  const confidenceCounts = countValues(analysis.chapters.map((row) => row.confidence));
  const collectionBytes = Object.entries(snapshot.collectionBytes)
    .map(([collection, bytes]) => ({ collection, bytes }))
    .sort((left, right) => compareOrdinal(left.collection, right.collection));

  return {
    target: AUDIT_TARGET,
    remoteAccessed: false,
    sourceTreeUnchanged: snapshot.sourceTreeHashBefore === snapshot.sourceTreeHashAfter,
    disk: {
      totalBytes: snapshot.sourceTree.reduce((total, entry) => total + entry.bytes, 0),
      collectionBytes,
    },
    collections: collectionRows,
    actors: {
      total: analysis.actors.length,
      withoutSceneReference: analysis.actors.filter((row) => row.noSceneToken === true).length,
      withoutAnyDetectedReference: analysis.actors.filter((row) => (
        Array.isArray(row.usageStatuses) && row.usageStatuses.includes("no-detected-reference")
      )).length,
      unusedCandidates: analysis.unusedActorCandidates.length,
      brokenTokenActorReferences: analysis.brokenTokenActorRefs.length,
    },
    journals: {
      total: analysis.journals.length,
      pages: analysis.journalPages.length,
      languageCounts,
      pageTypeCounts,
      moduleOwnerCounts,
    },
    chapters: {
      categories: categoryCounts,
      confidence: confidenceCounts,
    },
    packaging: {
      adventureRows: analysis.compendiumsAndAdventures.filter((row) => row.kind === "Adventure").length,
      compendiumRows: analysis.compendiumsAndAdventures.filter((row) => row.kind !== "Adventure").length,
    },
    performance: {
      baselineStatus: baseline.status,
      layers: ["disk", "initialization", "canvas-gpu", "continuous-runtime"],
    },
    decisions: {
      automaticDeletion: false,
      allowedValues: USER_DECISION_VALUES,
    },
    validation,
  };
}

export function createAuditReport(
  snapshot: WorldSnapshot,
  analysis: AuditAnalysis,
  baseline: AuditBaseline,
): AuditReport {
  const trackedSummary = createTrackedSummaryProjection(snapshot, analysis, baseline);
  const validation = trackedSummary.validation;
  const inventory = {
    target: AUDIT_TARGET,
    remoteAccessed: false,
    sourceTreeHashBefore: snapshot.sourceTreeHashBefore,
    sourceTreeHashAfter: snapshot.sourceTreeHashAfter,
    collectionBytes: sortRecord(snapshot.collectionBytes),
    overview: analysis.overview,
    actors: analysis.actors,
    unusedActorCandidates: analysis.unusedActorCandidates,
    brokenTokenActorRefs: analysis.brokenTokenActorRefs,
    journals: analysis.journals,
    journalPages: analysis.journalPages,
    scenes: analysis.scenes,
    worldItems: analysis.worldItems,
    macrosAndTables: analysis.macrosAndTables,
    playlistsAndCombats: analysis.playlistsAndCombats,
    chatAndFog: analysis.chatAndFog,
    settingsAndModules: analysis.settingsAndModules,
    compendiumsAndAdventures: analysis.compendiumsAndAdventures,
    assets: analysis.assets,
    folders: analysis.folders,
  };

  return {
    inventory,
    references: analysis.references,
    chapterClassification: analysis.chapters,
    baseline,
    unresolvedMarkdown: renderUnresolvedMarkdown(analysis),
    summaryMarkdown: renderSummaryMarkdown(trackedSummary),
    workbookSource: createWorkbookSource(analysis, trackedSummary),
    trackedSummary,
    validation,
  };
}

export function createAuditValidation(
  snapshot: WorldSnapshot,
  analysis: AuditAnalysis,
): AuditValidation {
  const collections = [...new Set([
    ...snapshot.records.map((record) => record.collection),
    ...Object.keys(snapshot.collectionBytes),
  ])].sort(compareOrdinal);
  const collectionKeyCrossChecks = collections.map((name) => {
    const records = snapshot.records.filter((record) => record.collection === name);
    const topLevel = records.filter((record) => record.namespace === name).length;
    const embedded = records.length - topLevel;
    const hasMismatch = analysis.unresolved.some((entry) => (
      entry.startsWith(`${name}.`) && entry.includes("embedded count mismatch")
    ));
    return {
      name,
      levelKeys: records.length,
      topLevel,
      embedded,
      matchesParentArrays: !hasMismatch,
    };
  });

  const duplicateIds: Array<Record<string, unknown>> = [];
  const ids = new Map<string, number>();
  for (const record of snapshot.records) {
    const id = typeof record.value._id === "string"
      ? record.value._id
      : record.key.split("!")[2]?.split(".").at(-1) ?? "";
    const key = `${record.namespace}\0${id}`;
    ids.set(key, (ids.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...ids].sort(([left], [right]) => compareOrdinal(left, right))) {
    if (count < 2) continue;
    const [namespace = "", id = ""] = key.split("\0");
    duplicateIds.push({ namespace, id, count });
  }

  return {
    collectionKeyCrossChecks,
    duplicateIds,
    danglingFolders: analysis.unresolved.filter((entry) => (
      /folder/i.test(entry) && /missing|cycle|wrong-type/i.test(entry)
    )).length,
    unresolvedReferences: analysis.references.filter((edge) => !edge.verifiedTarget).length,
  };
}

function createWorkbookSource(
  analysis: AuditAnalysis,
  trackedSummary: TrackedSummaryProjection,
): WorkbookSource {
  const overview = [
    ...trackedSummary.collections.map((row) => ({
      category: "collection",
      collection: row.name,
      topLevel: row.count,
      levelKeys: row.levelKeys,
      embedded: row.embedded,
      bytes: row.bytes,
      matchesParentArrays: row.matchesParentArrays,
    })),
    ...Object.entries(analysis.overview)
      .filter(([metric]) => !metric.endsWith(".topLevel"))
      .map(([metric, value]) => ({ category: "aggregate", metric, value }))
      .sort((left, right) => compareOrdinal(left.metric, right.metric)),
  ];
  const unusedActorCandidates = analysis.unusedActorCandidates.map((row) => ({
    ...row,
    referenceEvidence: "no-detected-reference",
    recommendation: "Needs Review",
    risk: "static analysis cannot prove dynamic name lookup or runtime generation is absent",
  }));
  const userDecisions = [
    ...analysis.unusedActorCandidates.map((row) => ({
      category: "Unused Actor Candidate",
      id: row["id"] ?? "",
      name: row["name"] ?? "",
      evidence: "no-detected-reference",
      suggestedAction: "Needs Review",
    })),
    ...analysis.brokenTokenActorRefs.map((row) => ({
      category: "Broken Token Actor Reference",
      id: row.actorId ?? row.id ?? "",
      name: row.tokenName ?? row.name ?? "",
      evidence: "broken-reference-target",
      suggestedAction: "Restore Reference",
    })),
  ];
  const sheets: WorkbookSource["sheets"] = {
    "Overview": withDecision(overview),
    "Actors": withDecision(analysis.actors),
    "Unused Actor Candidates": withDecision(unusedActorCandidates),
    "Broken Token Actor Refs": withDecision(analysis.brokenTokenActorRefs),
    "Journals": withDecision(analysis.journals),
    "Journal Pages": withDecision(analysis.journalPages),
    "Scenes": withDecision(analysis.scenes),
    "World Items": withDecision(analysis.worldItems),
    "Macros and Tables": withDecision(analysis.macrosAndTables),
    "Playlists and Combats": withDecision(analysis.playlistsAndCombats),
    "Chat and Fog": withDecision(analysis.chatAndFog),
    "Settings and Modules": withDecision(analysis.settingsAndModules),
    "Compendiums and Adventures": withDecision(analysis.compendiumsAndAdventures),
    "Assets": withDecision(analysis.assets),
    "Chapter Classification": withDecision(analysis.chapters),
    "User Decisions": withDecision(userDecisions),
  };
  return { allowedUserDecisions: USER_DECISION_VALUES, sheets };
}

function renderSummaryMarkdown(summary: TrackedSummaryProjection): string {
  const collectionRows = summary.collections.length > 0
    ? summary.collections.map((row) => (
      `| ${row.name} | ${row.count} | ${row.levelKeys} | ${row.embedded} | ${row.bytes} | ${row.matchesParentArrays ? "是" : "否"} |`
    )).join("\n")
    : "| （无） | 0 | 0 | 0 | 0 | 是 |";
  const byteRows = summary.disk.collectionBytes.length > 0
    ? summary.disk.collectionBytes.map((row) => `| ${row.collection} | ${row.bytes} |`).join("\n")
    : "| （无） | 0 |";
  const languageRows = formatCounts(summary.journals.languageCounts);
  const pageTypeRows = formatCounts(summary.journals.pageTypeCounts);
  const moduleOwnerRows = formatCounts(summary.journals.moduleOwnerCounts);
  const chapterCategories = formatCounts(summary.chapters.categories);
  const chapterConfidence = formatCounts(summary.chapters.confidence);
  const validationRows = summary.validation.collectionKeyCrossChecks.length > 0
    ? summary.validation.collectionKeyCrossChecks.map((row) => (
      `| ${row.name} | ${row.levelKeys} | ${row.topLevel} | ${row.embedded} | ${row.matchesParentArrays ? "是" : "否"} |`
    )).join("\n")
    : "| （无） | 0 | 0 | 0 | 是 |";

  return `# cor-cotn 世界体量与引用审计摘要

## 1. 审计范围与版本

本地只读目标为 \`${summary.target.worldId}\`，Foundry \`${summary.target.foundry}\`，dnd5e \`${summary.target.dnd5e}\`。远程访问：否。源世界树在快照前后${summary.sourceTreeUnchanged ? "一致" : "不一致"}。

## 2. 世界集合与磁盘体量

源树磁盘总量：${summary.disk.totalBytes} bytes。

| 集合 | 顶层数量 | LevelDB keys | 内嵌 | 磁盘 bytes | 与父数组匹配 |
| --- | ---: | ---: | ---: | ---: | --- |
${collectionRows}

| 数据集合 | 磁盘 bytes |
| --- | ---: |
${byteRows}

磁盘体量不等同于浏览器 JavaScript 堆或活动场景负载。

## 3. Actor 引用与候选边界

Actor 共 ${summary.actors.total} 个；其中 ${summary.actors.withoutSceneReference} 个为“无 Scene 引用”，${summary.actors.withoutAnyDetectedReference} 个为“无任何检测到的引用”，最终候选表共 ${summary.actors.unusedCandidates} 个。前两者语义不同：没有地图 Token 不代表没有 Journal、Macro、User 或其他引用。候选只提供证据和复核入口，不自动删除。

## 4. Token/Actor 完整性风险

检测到 ${summary.actors.brokenTokenActorReferences} 条 Token 指向缺失 Actor 的完整性风险。这些记录与未使用 Actor 候选分表，优先考虑恢复引用或人工确认。

## 5. Journal、页面、语言与模块

Journal 共 ${summary.journals.total} 个，页面 ${summary.journals.pages} 个。语言标签：${languageRows}；页面类型：${pageTypeRows}；模块归属：${moduleOwnerRows}。\`Latin-only\`、\`no-text\`、图片/PDF/视频页与模块自定义页不能被统称为“英文正文”，模块依赖也不能由语言标签替代。

## 6. 章节归属与置信度

章节类别：${chapterCategories}。置信度：${chapterConfidence}。高置信只来自明确文件夹/名称、Scene-Journal 结构化链接或 Actor 的章节 Scene 使用；低置信文本证据仍需人工复核。

## 7. Adventure、Compendium 与 Module 取舍

当前 Adventure 行 ${summary.packaging.adventureRows}，其他 Compendium/pack 行 ${summary.packaging.compendiumRows}。每章 Adventure 最适合一起保存 Scene、Actor、Journal 等关联对象；普通 Compendium 适合公共 Actor/Item，但跨类型引用更脆弱；独立 Module 适合长期分发和版本管理，但制作与升级成本最高。本阶段不创建或迁移任何一种载体。

## 8. 性能层与基线

基线状态：\`${summary.performance.baselineStatus}\`。性能判断分为四层：磁盘体量、客户端初始化、活动 Scene 的 Canvas/GPU 负担、持续运行期间的累积风险。静态体量不能替代 Task 4 的冷启动和运行时采样。

## 9. 决策优先级

1. 先复核断裂 Token/Actor 引用，决定 Restore Reference 或 Needs Review。
2. 再检查仅有 \`no-detected-reference\` 证据的候选，结合玩家内容和动态脚本风险。
3. 最后评估 Chat、Fog、素材和章节打包；任何 Delete/Archive 都必须由用户填写决策栏。

允许的用户决定：${summary.decisions.allowedValues.join("、")}。报告不自动删除任何世界对象。

## 10. 未决项与静态分析限制

静态扫描不能证明动态名称查找绝对安全，也不能证明第三方模块私有序列化或运行时生成对象不存在。完整明细见本地 \`unresolved.md\`。

## 11. 机械验证

| 集合 | LevelDB keys | 顶层 | 内嵌 | 与父数组匹配 |
| --- | ---: | ---: | ---: | --- |
${validationRows}

- 重复 ID：${summary.validation.duplicateIds.length}
- 悬空/异常 Folder：${summary.validation.danglingFolders}
- 未解析引用：${summary.validation.unresolvedReferences}
- 源树哈希一致：${summary.sourceTreeUnchanged ? "是" : "否"}
- remoteAccessed：false
`;
}

function renderUnresolvedMarkdown(analysis: AuditAnalysis): string {
  const rows = analysis.unresolved.length > 0
    ? analysis.unresolved.map((entry) => `- ${entry}`).join("\n")
    : "- 当前静态层没有额外诊断。";
  return `# cor-cotn 世界审计未决项

静态扫描不能证明动态名称查找绝对安全，也不能覆盖所有第三方模块私有序列化、运行时生成对象或脚本分支。

${rows}
`;
}

function withDecision<T extends object>(rows: T[]): Array<Record<string, unknown>> {
  return rows.map((row) => ({ ...row, "User Decision": "" }));
}

function countRows(
  rows: Array<Record<string, unknown>>,
  field: string,
): Array<{ label: string; count: number }> {
  return countValues(rows.map((row) => {
    const value = row[field];
    return typeof value === "string" && value.length > 0 ? value : "unspecified";
  }));
}

function countValues(values: string[]): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => compareOrdinal(left.label, right.label));
}

function formatCounts(rows: Array<{ label: string; count: number }>): string {
  return rows.length > 0 ? rows.map((row) => `${row.label}=${row.count}`).join("，") : "无";
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => compareOrdinal(left, right)),
  );
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateBaselineLayer(value: unknown, name: string): AuditBaselineLayer {
  if (!isRecord(value) || !["pending", "blocked", "measured"].includes(String(value.status))) {
    throw new Error(`Baseline ${name} layer has an invalid status`);
  }
  assertAllowedRecordKeys(value, ["status", "metrics", "note"], `Baseline ${name} layer`);
  if (!isRecord(value.metrics)) {
    throw new Error(`Baseline ${name} layer metrics must be an object`);
  }
  const metrics: Record<string, string | number | boolean> = {};
  for (const [key, metric] of Object.entries(value.metrics)) {
    if (
      !key
      || !["string", "number", "boolean"].includes(typeof metric)
      || (typeof metric === "number" && !Number.isFinite(metric))
    ) {
      throw new Error(`Baseline ${name} layer contains malformed metrics`);
    }
    metrics[key] = metric as string | number | boolean;
  }
  const status = value.status as AuditBaselineLayerStatus;
  const note = typeof value.note === "string" ? value.note.trim() : "";
  if (status === "measured" && Object.keys(metrics).length === 0) {
    throw new Error(`Baseline ${name} measured layer requires metrics`);
  }
  if (status !== "measured" && (Object.keys(metrics).length !== 0 || !note)) {
    throw new Error(`Baseline ${name} incomplete layer requires an empty metrics object and a note`);
  }
  return { status, metrics, ...(note ? { note } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactRecordKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compareOrdinal);
  const sortedExpected = [...expected].sort(compareOrdinal);
  if (actual.join("\0") !== sortedExpected.join("\0")) {
    throw new Error(`${label} must contain exactly: ${expected.join(", ")}`);
  }
}

function assertAllowedRecordKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  const extra = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (extra.length > 0) {
    throw new Error(`${label} contains unsupported fields: ${extra.sort(compareOrdinal).join(", ")}`);
  }
}
