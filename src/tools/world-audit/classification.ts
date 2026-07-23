import {
  isSecretSettingKey,
  isSensitiveFieldPath,
  type AuditDocument,
  type ReferenceEdge,
} from "./references";

export type UsageStatus =
  | "used-structured"
  | "used-uuid"
  | "possible-script-reference"
  | "player-protected"
  | "chapter-shared"
  | "broken-reference-target"
  | "no-detected-reference"
  | "manual-review-required";

export interface ChapterClassification {
  documentUuid: string;
  category:
    | "explicit-chapter"
    | "chapter-shared"
    | "world-common"
    | "player-content"
    | "test-temporary"
    | "unclassified";
  chapterLabels: string[];
  confidence: "high" | "medium" | "low" | "none";
  evidence: Array<{ kind: string; value: string }>;
}

export const USAGE_STATUS_ORDER: UsageStatus[] = [
  "used-structured",
  "used-uuid",
  "possible-script-reference",
  "player-protected",
  "chapter-shared",
  "broken-reference-target",
  "no-detected-reference",
  "manual-review-required",
];

export interface ChapterClassificationInput {
  documents: AuditDocument[];
  references: ReferenceEdge[];
  folderPathsByDocumentUuid: Map<string, string>;
  playerProtectedActorUuids: Set<string>;
}

interface MutableClassification {
  documentUuid: string;
  highLabels: Set<string>;
  lowLabels: Set<string>;
  evidence: Array<{ kind: string; value: string }>;
  playerContent: boolean;
  worldCommon: boolean;
  testTemporary: boolean;
}

export function classifyWorldChapters(input: ChapterClassificationInput): ChapterClassification[] {
  const documents = [...input.documents].sort((left, right) => compareOrdinal(left.uuid, right.uuid));
  const mutable = new Map<string, MutableClassification>();
  for (const document of documents) {
    const secretSetting = document.collection === "settings"
      && isSecretSettingKey(stringValue(document.value.key) ?? document.id);
    const name = secretSetting ? "" : stringValue(document.value.name) ?? "";
    const folderPath = input.folderPathsByDocumentUuid.get(document.uuid) ?? "";
    const classification: MutableClassification = {
      documentUuid: document.uuid,
      highLabels: new Set<string>(),
      lowLabels: new Set<string>(),
      evidence: [],
      playerContent: input.playerProtectedActorUuids.has(document.uuid),
      worldCommon: /\b(?:world|global|common|shared)\b/i.test(`${name} ${folderPath}`),
      testTemporary: /\b(?:test|testing|temporary|temp|scratch|deprecated)\b/i.test(`${name} ${folderPath}`),
    };
    if (!secretSetting) {
      addChapterMatches(classification, folderPath, "explicit-folder", "high");
      addChapterMatches(classification, name, "explicit-name", "high");
    }
    if (classification.highLabels.size === 0 && document.collection !== "users" && !secretSetting) {
      addLowTextMatches(classification, document.value);
    }
    mutable.set(document.uuid, classification);
  }

  const sceneLabels = new Map<string, Set<string>>();
  for (const document of documents.filter((candidate) => candidate.collection === "scenes")) {
    const labels = mutable.get(document.uuid)?.highLabels ?? new Set<string>();
    sceneLabels.set(document.uuid, new Set(labels));
  }

  for (const scene of documents.filter((candidate) => candidate.collection === "scenes")) {
    const labels = sceneLabels.get(scene.uuid) ?? new Set<string>();
    if (labels.size === 0) continue;
    for (const token of records(scene.value.tokens)) {
      const actorId = stringValue(token.actorId);
      if (!actorId) continue;
      addPropagatedLabels(
        mutable.get(`Actor.${actorId}`),
        labels,
        "actor-in-classified-scene",
        scene.uuid,
      );
    }
  }

  for (const edge of input.references) {
    if (
      edge.evidence !== "structured-field"
      || !edge.sourceUuid.startsWith("Scene.")
      || !edge.targetUuid.startsWith("JournalEntry.")
    ) {
      continue;
    }
    const labels = sceneLabels.get(edge.sourceUuid) ?? new Set<string>();
    if (labels.size === 0) continue;
    addPropagatedLabels(
      mutable.get(edge.targetUuid),
      labels,
      "scene-journal-link",
      edge.sourceUuid,
    );
    for (const [uuid, candidate] of mutable) {
      if (uuid.startsWith(`${edge.targetUuid}.JournalEntryPage.`)) {
        addPropagatedLabels(candidate, labels, "scene-journal-link", edge.sourceUuid);
      }
    }
  }

  return [...mutable.values()]
    .map(finalizeClassification)
    .sort((left, right) => compareOrdinal(left.documentUuid, right.documentUuid));
}

function finalizeClassification(classification: MutableClassification): ChapterClassification {
  const highLabels = [...classification.highLabels].sort(compareOrdinal);
  const lowLabels = [...classification.lowLabels].sort(compareOrdinal);
  const evidence = deduplicateEvidence(classification.evidence);
  if (classification.playerContent) {
    return {
      documentUuid: classification.documentUuid,
      category: "player-content",
      chapterLabels: highLabels.length > 0 ? highLabels : lowLabels,
      confidence: highLabels.length > 0 ? "high" : lowLabels.length > 0 ? "low" : "none",
      evidence,
    };
  }
  if (highLabels.length > 1) {
    return {
      documentUuid: classification.documentUuid,
      category: "chapter-shared",
      chapterLabels: highLabels,
      confidence: "high",
      evidence,
    };
  }
  if (highLabels.length === 1) {
    return {
      documentUuid: classification.documentUuid,
      category: "explicit-chapter",
      chapterLabels: highLabels,
      confidence: "high",
      evidence,
    };
  }
  if (classification.testTemporary) {
    return {
      documentUuid: classification.documentUuid,
      category: "test-temporary",
      chapterLabels: lowLabels,
      confidence: lowLabels.length > 0 ? "low" : "none",
      evidence,
    };
  }
  if (classification.worldCommon) {
    return {
      documentUuid: classification.documentUuid,
      category: "world-common",
      chapterLabels: lowLabels,
      confidence: lowLabels.length > 0 ? "low" : "none",
      evidence,
    };
  }
  if (lowLabels.length > 0) {
    return {
      documentUuid: classification.documentUuid,
      category: "explicit-chapter",
      chapterLabels: lowLabels,
      confidence: "low",
      evidence,
    };
  }
  return {
    documentUuid: classification.documentUuid,
    category: "unclassified",
    chapterLabels: [],
    confidence: "none",
    evidence,
  };
}

function addChapterMatches(
  target: MutableClassification,
  value: string,
  kind: string,
  confidence: "high" | "low",
): void {
  for (const label of extractChapterLabels(value)) {
    (confidence === "high" ? target.highLabels : target.lowLabels).add(label);
    target.evidence.push({ kind, value: label });
  }
}

function addLowTextMatches(target: MutableClassification, value: unknown): void {
  visitStrings(value, "", (fieldPath, text) => {
    if (/^(?:name|folder)$/.test(fieldPath)) return;
    if (isSensitiveFieldPath(fieldPath)) return;
    for (const label of extractChapterLabels(text)) {
      target.lowLabels.add(label);
      target.evidence.push({ kind: "text-inference", value: `${fieldPath}: ${label}` });
    }
  });
}

function addPropagatedLabels(
  target: MutableClassification | undefined,
  labels: Set<string>,
  kind: string,
  sourceUuid: string,
): void {
  if (!target) return;
  for (const label of labels) {
    target.highLabels.add(label);
    target.evidence.push({ kind, value: `${sourceUuid}: ${label}` });
  }
}

function extractChapterLabels(value: string): string[] {
  const matches = new Set<string>();
  for (const match of value.matchAll(/\b(?:chapter|ch\.?)\s+([0-9]+|[ivxlcdm]+)\b/gi)) {
    const number = match[1];
    if (number) matches.add(`Chapter ${normalizeRomanOrNumber(number)}`);
  }
  for (const match of value.matchAll(/第\s*([一二三四五六七八九十百0-9]+)\s*[章节]/g)) {
    const number = match[1];
    if (number) matches.add(`第${number}章`);
  }
  return [...matches].sort(compareOrdinal);
}

function normalizeRomanOrNumber(value: string): string {
  return /^\d+$/.test(value) ? String(Number(value)) : value.toUpperCase();
}

function deduplicateEvidence(
  evidence: Array<{ kind: string; value: string }>,
): Array<{ kind: string; value: string }> {
  const unique = new Map<string, { kind: string; value: string }>();
  for (const item of evidence) unique.set(`${item.kind}\0${item.value}`, item);
  return [...unique.values()].sort((left, right) => compareOrdinal(
    `${left.kind}\0${left.value}`,
    `${right.kind}\0${right.value}`,
  ));
}

function visitStrings(
  value: unknown,
  path: string,
  visit: (path: string, value: string) => void,
): void {
  if (typeof value === "string") {
    visit(path, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visitStrings(entry, `${path}[${index}]`, visit));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    visitStrings(entry, path ? `${path}.${key}` : key, visit);
  }
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
