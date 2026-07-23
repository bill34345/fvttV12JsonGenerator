import { readdirSync, readFileSync } from "node:fs";
import {
  classifyWorldChapters,
  USAGE_STATUS_ORDER,
  type ChapterClassification,
  type UsageStatus,
} from "./classification";
import type { LevelRecord, TreeEntry, WorldSnapshot } from "./model";
import {
  extractWorldReferences,
  isSecretSettingKey,
  isSensitiveFieldPath,
  type AuditDocument,
  type ReferenceEdge,
} from "./references";

export type { ReferenceEvidence, ReferenceEdge } from "./references";
export type { ChapterClassification, UsageStatus } from "./classification";

export interface AuditAnalysis {
  overview: Record<string, number | string | boolean>;
  actors: Array<Record<string, unknown>>;
  journals: Array<Record<string, unknown>>;
  journalPages: Array<Record<string, unknown>>;
  scenes: Array<Record<string, unknown>>;
  worldItems: Array<Record<string, unknown>>;
  macrosAndTables: Array<Record<string, unknown>>;
  playlistsAndCombats: Array<Record<string, unknown>>;
  chatAndFog: Array<Record<string, unknown>>;
  settingsAndModules: Array<Record<string, unknown>>;
  compendiumsAndAdventures: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  folders: Array<Record<string, unknown>>;
  brokenTokenActorRefs: Array<Record<string, unknown>>;
  references: ReferenceEdge[];
  chapters: ChapterClassification[];
  unresolved: string[];
  unusedActorCandidates: Array<Record<string, unknown>>;
}

interface FolderResolution {
  folderRows: Array<Record<string, unknown>>;
  folderPathsByDocumentUuid: Map<string, string>;
}

interface EmbeddedDescriptor {
  collection: string;
  property: string;
  documentName: string;
  children?: EmbeddedDescriptor[];
}

interface EmbeddedNamespaceSummary {
  parentArray: number;
  materializedChildren: number;
  embeddedKeys: number;
  orphanEmbeddedKeys: number;
  missingEmbeddedKeys: number;
}

interface EmbeddedParentNode {
  identity: string;
  namespace: string;
  idPath: string[];
  value: Record<string, unknown>;
  childIdentities: Set<string>;
}

interface MaterializedEmbeddedGraph {
  records: LevelRecord[];
  nodesByIdentity: Map<string, EmbeddedParentNode>;
  reachableIdentities: Set<string>;
}

const COLLECTION_DOCUMENT_NAMES: Record<string, string> = {
  actors: "Actor",
  adventures: "Adventure",
  cards: "Cards",
  combats: "Combat",
  folders: "Folder",
  items: "Item",
  journal: "JournalEntry",
  macros: "Macro",
  messages: "ChatMessage",
  playlists: "Playlist",
  scenes: "Scene",
  settings: "Setting",
  tables: "RollTable",
  users: "User",
};

const COLLECTION_FOLDER_TYPES: Record<string, string> = {
  actors: "Actor",
  cards: "Cards",
  items: "Item",
  journal: "JournalEntry",
  macros: "Macro",
  playlists: "Playlist",
  scenes: "Scene",
  tables: "RollTable",
};

const EMBEDDED_DESCRIPTORS: EmbeddedDescriptor[] = [
  { collection: "actors", property: "items", documentName: "Item", children: [
    { collection: "actors.items", property: "effects", documentName: "ActiveEffect" },
  ] },
  { collection: "actors", property: "effects", documentName: "ActiveEffect" },
  { collection: "items", property: "effects", documentName: "ActiveEffect" },
  { collection: "journal", property: "pages", documentName: "JournalEntryPage" },
  { collection: "scenes", property: "tokens", documentName: "Token" },
  { collection: "scenes", property: "notes", documentName: "Note" },
  { collection: "scenes", property: "walls", documentName: "Wall" },
  { collection: "scenes", property: "lights", documentName: "AmbientLight" },
  { collection: "scenes", property: "tiles", documentName: "Tile" },
  { collection: "scenes", property: "drawings", documentName: "Drawing" },
  { collection: "scenes", property: "regions", documentName: "Region" },
  { collection: "scenes", property: "templates", documentName: "MeasuredTemplate" },
  { collection: "scenes", property: "sounds", documentName: "AmbientSound" },
  { collection: "playlists", property: "sounds", documentName: "PlaylistSound" },
  { collection: "tables", property: "results", documentName: "TableResult" },
  { collection: "combats", property: "combatants", documentName: "Combatant" },
  { collection: "cards", property: "cards", documentName: "Card", children: [
    { collection: "cards.cards", property: "faces", documentName: "CardFace" },
  ] },
];

const EMBEDDED_DOCUMENT_NAMES: Record<string, string> = Object.fromEntries(
  flattenDescriptors(EMBEDDED_DESCRIPTORS).map((descriptor) => [
    `${descriptor.collection}.${descriptor.property}`,
    descriptor.documentName,
  ]),
);

const EMBEDDED_OVERVIEW_DESCRIPTORS: EmbeddedDescriptor[] = [
  ...flattenDescriptors(EMBEDDED_DESCRIPTORS),
  { collection: "scenes.tokens", property: "delta", documentName: "ActorDelta" },
  { collection: "scenes.tokens.delta", property: "items", documentName: "Item" },
  { collection: "scenes.tokens.delta", property: "effects", documentName: "ActiveEffect" },
];

const KNOWN_EMBEDDED_NAMESPACES = new Set(
  EMBEDDED_OVERVIEW_DESCRIPTORS.map(
    (descriptor) => `${descriptor.collection}.${descriptor.property}`,
  ),
);

const ASSET_EXTENSION = /\.(?:apng|avif|bmp|flac|gif|glb|gltf|jpeg|jpg|m4a|mp3|mp4|oga|ogg|ogv|otf|png|svg|ttf|wav|webm|webp|woff2?)(?:[?#].*)?$/i;

export function analyzeWorld(snapshot: WorldSnapshot): AuditAnalysis {
  const unresolved = new Set<string>();
  const graph = buildMaterializedEmbeddedGraph(snapshot.records);
  const materializedRecords = graph.records;
  const topRecords = materializedRecords
    .filter((record) => record.namespace === record.collection)
    .sort(compareRecords);
  const topDocuments = topRecords.map(topRecordToDocument);
  const allDocuments = normalizeDocuments(
    topRecords,
    materializedRecords,
    graph.reachableIdentities,
  );
  const overview = buildOverview(
    topRecords,
    materializedRecords,
    graph.nodesByIdentity,
    graph.reachableIdentities,
    unresolved,
  );
  for (const collection of Object.keys(snapshot.collectionBytes)) {
    overview[`${collection}.topLevel`] ??= 0;
  }
  const { folderRows, folderPathsByDocumentUuid } = resolveFolders(topDocuments, unresolved);
  const { playerProtectedActorUuids, ownershipSummaries, userRoleSummary } = summarizeOwnership(topDocuments);
  const referenceExtraction = extractWorldReferences(allDocuments);
  const chapters = classifyWorldChapters({
    documents: allDocuments,
    references: referenceExtraction.references,
    folderPathsByDocumentUuid,
    playerProtectedActorUuids,
  });
  const chaptersByUuid = new Map(chapters.map((chapter) => [chapter.documentUuid, chapter]));
  const incomingByTarget = groupIncomingReferences(referenceExtraction.references);
  const sceneActorIds = collectSceneActorIds(topDocuments);
  const brokenTokenActorRefs = collectBrokenTokenActorReferences(topDocuments);

  overview.topLevelDocuments = topRecords.length;
  overview.referenceEdges = referenceExtraction.references.length;
  overview.brokenTokenActorReferences = brokenTokenActorRefs.length;
  overview.userRoles = formatCounts(userRoleSummary);
  overview.sourceSnapshotVerified = snapshot.sourceTreeHashBefore === snapshot.sourceTreeHashAfter;

  const actors = topDocuments
    .filter((document) => document.collection === "actors")
    .map((document) => {
      const incoming = incomingByTarget.get(document.uuid) ?? [];
      const chapter = chaptersByUuid.get(document.uuid) ?? emptyChapter(document.uuid);
      const statuses = actorUsageStatuses({
        incoming,
        playerProtected: playerProtectedActorUuids.has(document.uuid),
        chapter,
        duplicateNameTarget: referenceExtraction.duplicateNameTargets.has(document.uuid),
      });
      return {
        id: document.id,
        uuid: document.uuid,
        name: stringValue(document.value.name) ?? "",
        type: stringValue(document.value.type) ?? "",
        folderPath: folderPathsByDocumentUuid.get(document.uuid) ?? "",
        ownershipSummary: ownershipSummaries.get(document.uuid) ?? "none",
        usageStatuses: statuses,
        noSceneToken: !sceneActorIds.has(document.id),
        chapter,
      };
    })
    .sort(compareRowsByUuid);

  const unusedActorCandidates = actors
    .filter((actor) => {
      const statuses = actor.usageStatuses as UsageStatus[];
      return statuses.length === 1 && statuses[0] === "no-detected-reference";
    })
    .map((actor) => ({
      id: actor.id,
      uuid: actor.uuid,
      name: actor.name,
      noSceneToken: actor.noSceneToken,
    }));

  const journals = topDocuments
    .filter((document) => document.collection === "journal")
    .map((document) => basicDocumentRow(document, folderPathsByDocumentUuid, chaptersByUuid))
    .sort(compareRowsByUuid);
  const journalPages = collectJournalPages(topDocuments, chaptersByUuid);
  const scenes = topDocuments
    .filter((document) => document.collection === "scenes")
    .map((document) => sceneRow(document, folderPathsByDocumentUuid, chaptersByUuid))
    .sort(compareRowsByUuid);
  const worldItems = collectWorldItems(topDocuments, folderPathsByDocumentUuid, chaptersByUuid);
  const macrosAndTables = collectBasicRows(topDocuments, ["macros", "tables"], folderPathsByDocumentUuid, chaptersByUuid);
  const playlistsAndCombats = collectBasicRows(topDocuments, ["playlists", "combats"], folderPathsByDocumentUuid, chaptersByUuid);
  const chatAndFog = collectBasicRows(topDocuments, ["messages", "fog"], folderPathsByDocumentUuid, chaptersByUuid);
  const settingsAndModules = collectSettingsAndModules(topDocuments, userRoleSummary);
  const compendiumsAndAdventures = collectPacksAndAdventures(snapshot, topDocuments, unresolved);
  const assets = collectAssets(snapshot.snapshotTree, allDocuments);

  return {
    overview: sortRecord(overview),
    actors,
    journals,
    journalPages,
    scenes,
    worldItems,
    macrosAndTables,
    playlistsAndCombats,
    chatAndFog,
    settingsAndModules,
    compendiumsAndAdventures,
    assets,
    folders: folderRows,
    brokenTokenActorRefs,
    references: referenceExtraction.references,
    chapters,
    unresolved: [...unresolved].sort(compareOrdinal),
    unusedActorCandidates,
  };
}

/**
 * Reconstruct Foundry 14's normalized embedded-document view without mutating
 * the verified LevelDB records. Parent fields contain child IDs while the child
 * documents live in namespaced sublevels; this mirrors Foundry's
 * EmbeddedCollectionField.expandEmbedded behavior.
 *
 * anti-overfit: allow schema-derived - Foundry 14 stores embedded documents by
 * namespace plus complete parent/child key paths, independent of document names.
 */
export function materializeFoundryEmbeddedRecords(records: LevelRecord[]): LevelRecord[] {
  return buildMaterializedEmbeddedGraph(records).records;
}

function buildMaterializedEmbeddedGraph(records: LevelRecord[]): MaterializedEmbeddedGraph {
  // Expanded object memberships have no LevelRecord of their own. Give them
  // the same complete-path identity as raw records so either form can remain a
  // traversable parent for raw descendants without promoting orphan sublevels.
  const rawByIdentity = new Map<string, LevelRecord>();
  const parentsWithRawChildren = new Set<string>();
  for (const record of records) {
    const identity = recordIdentity(record.namespace, recordIdPath(record));
    if (!rawByIdentity.has(identity)) rawByIdentity.set(identity, record);
    if (record.namespace === record.collection) continue;
    const namespaceParts = record.namespace.split(".");
    const parentNamespace = namespaceParts.slice(0, -1).join(".");
    const idPath = recordIdPath(record);
    parentsWithRawChildren.add(recordIdentity(parentNamespace, idPath.slice(0, -1)));
  }

  const nodesByIdentity = new Map<string, EmbeddedParentNode>();
  const materializeNode = (
    namespace: string,
    idPath: string[],
    sourceValue: Record<string, unknown>,
  ): EmbeddedParentNode => {
    const identity = recordIdentity(namespace, idPath);
    const cached = nodesByIdentity.get(identity);
    if (cached) return cached;

    const node: EmbeddedParentNode = {
      identity,
      namespace,
      idPath: [...idPath],
      value: { ...sourceValue },
      childIdentities: new Set<string>(),
    };
    nodesByIdentity.set(identity, node);

    const resolveChild = (
      property: string,
      id: string,
      inlineValue: Record<string, unknown> | undefined,
    ): EmbeddedParentNode | undefined => {
      const childNamespace = `${namespace}.${property}`;
      const childIdPath = [...idPath, id];
      const childIdentity = recordIdentity(childNamespace, childIdPath);
      const raw = rawByIdentity.get(childIdentity);
      if (raw) {
        return materializeNode(raw.namespace, recordIdPath(raw), raw.value);
      }
      if (
        inlineValue
        && (
          KNOWN_EMBEDDED_NAMESPACES.has(childNamespace)
          || parentsWithRawChildren.has(childIdentity)
        )
      ) {
        return materializeNode(childNamespace, childIdPath, inlineValue);
      }
      return undefined;
    };

    for (const [property, current] of Object.entries(sourceValue)) {
      const childNamespace = `${namespace}.${property}`;
      const knownEmbeddedProperty = KNOWN_EMBEDDED_NAMESPACES.has(childNamespace);

      if (Array.isArray(current)) {
        const hasGraphMembership = knownEmbeddedProperty || current.some((entry) => {
          const id = typeof entry === "string"
            ? entry
            : isRecord(entry)
              ? stringValue(entry._id)
              : undefined;
          if (!id) return false;
          const childIdentity = recordIdentity(childNamespace, [...idPath, id]);
          return rawByIdentity.has(childIdentity) || parentsWithRawChildren.has(childIdentity);
        });
        if (!hasGraphMembership) continue;

        const seen = new Set<string>();
        node.value[property] = current.flatMap((entry) => {
          const id = typeof entry === "string"
            ? entry
            : isRecord(entry)
              ? stringValue(entry._id)
              : undefined;
          if (!id) return [isRecord(entry) ? { ...entry } : entry];
          if (seen.has(id)) return [];
          seen.add(id);
          const child = resolveChild(property, id, isRecord(entry) ? entry : undefined);
          if (child) {
            node.childIdentities.add(child.identity);
            return [child.value];
          }
          return isRecord(entry) ? [{ ...entry }] : [entry];
        });
        continue;
      }

      if (typeof current === "string") {
        const child = resolveChild(property, current, undefined);
        if (child) {
          node.childIdentities.add(child.identity);
          node.value[property] = child.value;
        }
        continue;
      }

      if (isRecord(current)) {
        const id = stringValue(current._id);
        if (!id) continue;
        const child = resolveChild(property, id, current);
        if (child) {
          node.childIdentities.add(child.identity);
          node.value[property] = child.value;
        }
      }
    }
    return node;
  };

  const materializedRecords = records.map((record) => ({
    ...record,
    value: materializeNode(record.namespace, recordIdPath(record), record.value).value,
  }));

  const reachableIdentities = new Set<string>();
  const queue: EmbeddedParentNode[] = [];
  for (const record of materializedRecords.filter(
    (candidate) => candidate.namespace === candidate.collection,
  )) {
    const identity = recordIdentity(record.namespace, recordIdPath(record));
    const node = nodesByIdentity.get(identity);
    if (!node || reachableIdentities.has(identity)) continue;
    reachableIdentities.add(identity);
    queue.push(node);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const parent = queue[index]!;
    for (const childIdentity of parent.childIdentities) {
      if (reachableIdentities.has(childIdentity)) continue;
      const child = nodesByIdentity.get(childIdentity);
      if (!child) continue;
      reachableIdentities.add(childIdentity);
      queue.push(child);
    }
  }

  return {
    records: materializedRecords,
    nodesByIdentity,
    reachableIdentities,
  };
}

function normalizeDocuments(
  topRecords: LevelRecord[],
  records: LevelRecord[],
  reachableIdentities: Set<string>,
): AuditDocument[] {
  const documents = new Map<string, AuditDocument>();
  for (const record of topRecords) {
    const document = topRecordToDocument(record);
    documents.set(document.uuid, document);
    appendParentArrayDocuments(document, EMBEDDED_DESCRIPTORS, documents);
  }
  for (const record of records.filter((candidate) => candidate.namespace !== candidate.collection)) {
    if (!reachableIdentities.has(recordIdentity(record.namespace, recordIdPath(record)))) continue;
    const document = embeddedRecordToDocument(record);
    if (document) documents.set(document.uuid, document);
  }
  return [...documents.values()].sort((left, right) => compareOrdinal(left.uuid, right.uuid));
}

function topRecordToDocument(record: LevelRecord): AuditDocument {
  const id = recordId(record);
  return {
    collection: record.collection,
    id,
    uuid: `${COLLECTION_DOCUMENT_NAMES[record.collection] ?? titleCase(record.collection)}.${id}`,
    value: record.value,
  };
}

function embeddedRecordToDocument(record: LevelRecord): AuditDocument | undefined {
  const rootId = record.parentIds[0];
  const ownId = stringValue(record.value._id) ?? record.key.split("!")[2]?.split(".").at(-1);
  if (!rootId || !ownId) return undefined;
  const rootName = COLLECTION_DOCUMENT_NAMES[record.collection] ?? titleCase(record.collection);
  let uuid = `${rootName}.${rootId}`;
  const allIds = [...record.parentIds.slice(1), ownId];
  for (const [index, path] of record.embeddedPath.entries()) {
    const namespace = [record.collection, ...record.embeddedPath.slice(0, index + 1)].join(".");
    uuid += `.${EMBEDDED_DOCUMENT_NAMES[namespace] ?? titleCase(singular(path))}.${allIds[index] ?? ownId}`;
  }
  return {
    collection: `embedded:${record.namespace}`,
    id: ownId,
    uuid,
    value: record.value,
  };
}

function appendParentArrayDocuments(
  parent: AuditDocument,
  descriptors: EmbeddedDescriptor[],
  documents: Map<string, AuditDocument>,
): void {
  for (const descriptor of descriptors.filter((candidate) => candidate.collection === parent.collection)) {
    for (const embedded of records(parent.value[descriptor.property])) {
      const id = stringValue(embedded._id);
      if (!id) continue;
      const document: AuditDocument = {
        collection: `embedded:${descriptor.collection}.${descriptor.property}`,
        id,
        uuid: `${parent.uuid}.${descriptor.documentName}.${id}`,
        value: embedded,
      };
      if (!documents.has(document.uuid)) documents.set(document.uuid, document);
      if (descriptor.children) {
        appendNestedDocuments(document, descriptor.children, documents);
      }
    }
  }
}

function appendNestedDocuments(
  parent: AuditDocument,
  descriptors: EmbeddedDescriptor[],
  documents: Map<string, AuditDocument>,
): void {
  for (const descriptor of descriptors) {
    for (const embedded of records(parent.value[descriptor.property])) {
      const id = stringValue(embedded._id);
      if (!id) continue;
      const document: AuditDocument = {
        collection: `embedded:${descriptor.collection}.${descriptor.property}`,
        id,
        uuid: `${parent.uuid}.${descriptor.documentName}.${id}`,
        value: embedded,
      };
      if (!documents.has(document.uuid)) documents.set(document.uuid, document);
      if (descriptor.children) appendNestedDocuments(document, descriptor.children, documents);
    }
  }
}

function buildOverview(
  topRecords: LevelRecord[],
  records: LevelRecord[],
  nodesByIdentity: Map<string, EmbeddedParentNode>,
  reachableIdentities: Set<string>,
  unresolved: Set<string>,
): Record<string, number | string | boolean> {
  const overview: Record<string, number | string | boolean> = {};
  const topCounts = countBy(topRecords, (record) => record.collection);
  const collections = [...new Set(records.map((record) => record.collection))].sort(compareOrdinal);
  for (const collection of collections) {
    overview[`${collection}.topLevel`] = topCounts.get(collection) ?? 0;
  }
  for (const descriptor of EMBEDDED_OVERVIEW_DESCRIPTORS) {
    const namespace = `${descriptor.collection}.${descriptor.property}`;
    const summary = summarizeEmbeddedNamespace(
      records,
      nodesByIdentity,
      reachableIdentities,
      descriptor,
    );
    if (summary.parentArray === 0 && summary.embeddedKeys === 0) continue;
    overview[`${namespace}.parentArray`] = summary.parentArray;
    overview[`${namespace}.materializedChildren`] = summary.materializedChildren;
    overview[`${namespace}.embeddedKeys`] = summary.embeddedKeys;
    overview[`${namespace}.orphanEmbeddedKeys`] = summary.orphanEmbeddedKeys;
    overview[`${namespace}.missingEmbeddedKeys`] = summary.missingEmbeddedKeys;
    if (summary.orphanEmbeddedKeys > 0 || summary.missingEmbeddedKeys > 0) {
      unresolved.add(
        `${namespace} embedded count mismatch: parent array=${summary.parentArray}, `
        + `materialized children=${summary.materializedChildren}, embedded keys=${summary.embeddedKeys}, `
        + `orphan embedded keys=${summary.orphanEmbeddedKeys}, missing embedded keys=${summary.missingEmbeddedKeys}`,
      );
    }
  }
  return overview;
}

function summarizeEmbeddedNamespace(
  allRecords: LevelRecord[],
  nodesByIdentity: Map<string, EmbeddedParentNode>,
  reachableIdentities: Set<string>,
  descriptor: EmbeddedDescriptor,
): EmbeddedNamespaceSummary {
  const namespace = `${descriptor.collection}.${descriptor.property}`;
  const embeddedRecords = allRecords.filter((record) => record.namespace === namespace);
  const embeddedIdentities = new Set(
    embeddedRecords.map((record) => recordIdentity(record.namespace, recordIdPath(record))),
  );
  const parents = [...nodesByIdentity.values()].filter(
    (node) => node.namespace === descriptor.collection
      && reachableIdentities.has(node.identity),
  );
  const membershipIdentities = new Set<string>();
  let parentArray = 0;
  let materializedChildren = 0;
  let missingEmbeddedKeys = 0;

  for (const parent of parents) {
    const value = parent.value[descriptor.property];
    const memberships = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    for (const membership of memberships) {
      parentArray += 1;
      const id = typeof membership === "string"
        ? membership
        : isRecord(membership)
          ? stringValue(membership._id)
          : undefined;
      if (isRecord(membership)) materializedChildren += 1;
      if (!id) continue;
      const identity = recordIdentity(namespace, [...parent.idPath, id]);
      membershipIdentities.add(identity);
      if (typeof membership === "string" && !embeddedIdentities.has(identity)) {
        missingEmbeddedKeys += 1;
      }
    }
  }

  return {
    parentArray,
    materializedChildren,
    embeddedKeys: embeddedRecords.length,
    orphanEmbeddedKeys: embeddedRecords.filter(
      (record) => !membershipIdentities.has(
        recordIdentity(record.namespace, recordIdPath(record)),
      ),
    ).length,
    missingEmbeddedKeys,
  };
}

function resolveFolders(
  documents: AuditDocument[],
  unresolved: Set<string>,
): FolderResolution {
  const folderDocuments = documents.filter((document) => document.collection === "folders");
  const foldersById = new Map(folderDocuments.map((document) => [document.id, document]));
  const folderPathsByDocumentUuid = new Map<string, string>();
  const pathCache = new Map<string, string>();

  const resolveFolder = (folder: AuditDocument): string => {
    const cached = pathCache.get(folder.id);
    if (cached !== undefined) return cached;
    const segments: string[] = [];
    const seen = new Set<string>();
    let current: AuditDocument | undefined = folder;
    while (current) {
      if (seen.has(current.id)) {
        unresolved.add(`Folder cycle detected for ${folder.id} at ${current.id}`);
        break;
      }
      seen.add(current.id);
      segments.unshift(stringValue(current.value.name) ?? current.id);
      const parentId = stringValue(current.value.folder);
      if (!parentId) break;
      const parent = foldersById.get(parentId);
      if (!parent) {
        unresolved.add(`Folder ${current.id} has missing parent ${parentId}`);
        break;
      }
      const currentType = stringValue(current.value.type);
      const parentType = stringValue(parent.value.type);
      if (currentType && parentType && currentType !== parentType) {
        unresolved.add(
          `Folder ${current.id} has wrong-type parent ${parentId}: ${currentType} -> ${parentType}`,
        );
        break;
      }
      current = parent;
    }
    const path = segments.join(" / ");
    pathCache.set(folder.id, path);
    return path;
  };

  const folderRows = folderDocuments.map((folder) => {
    const path = resolveFolder(folder);
    folderPathsByDocumentUuid.set(folder.uuid, path);
    return {
      id: folder.id,
      uuid: folder.uuid,
      name: stringValue(folder.value.name) ?? "",
      type: stringValue(folder.value.type) ?? "",
      parentId: stringValue(folder.value.folder) ?? "",
      path,
    };
  }).sort(compareRowsByUuid);

  for (const document of documents.filter((candidate) => !candidate.collection.startsWith("embedded:"))) {
    if (document.collection === "folders") continue;
    const folderId = stringValue(document.value.folder);
    if (!folderId) continue;
    const folder = foldersById.get(folderId);
    if (!folder) {
      unresolved.add(`Document ${document.uuid} (${document.id}) points at missing folder ${folderId}`);
      continue;
    }
    const expectedType = COLLECTION_FOLDER_TYPES[document.collection];
    const actualType = stringValue(folder.value.type);
    if (expectedType && actualType && expectedType !== actualType) {
      unresolved.add(
        `Document ${document.uuid} points at wrong-type folder ${folderId}: expected ${expectedType}, found ${actualType}`,
      );
      continue;
    }
    folderPathsByDocumentUuid.set(document.uuid, resolveFolder(folder));
  }
  return { folderRows, folderPathsByDocumentUuid };
}

function summarizeOwnership(documents: AuditDocument[]): {
  playerProtectedActorUuids: Set<string>;
  ownershipSummaries: Map<string, string>;
  userRoleSummary: Map<string, number>;
} {
  const users = documents.filter((document) => document.collection === "users");
  const boundActorIds = new Set(
    users.map((user) => stringValue(user.value.character)).filter(isPresent),
  );
  const userRoleSummary = new Map<string, number>();
  for (const user of users) {
    const role = String(numberValue(user.value.role) ?? "unknown");
    userRoleSummary.set(role, (userRoleSummary.get(role) ?? 0) + 1);
  }
  const playerProtectedActorUuids = new Set<string>();
  const ownershipSummaries = new Map<string, string>();
  for (const actor of documents.filter((document) => document.collection === "actors")) {
    const ownership = isRecord(actor.value.ownership) ? actor.value.ownership : {};
    const counts = new Map<string, number>();
    let hasPlayerOwner = false;
    for (const levelValue of Object.values(ownership)) {
      const level = numberValue(levelValue);
      if (level === undefined) continue;
      const key = String(level);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (level >= 3) hasPlayerOwner = true;
    }
    ownershipSummaries.set(actor.uuid, formatCounts(counts));
    if (hasPlayerOwner || boundActorIds.has(actor.id)) playerProtectedActorUuids.add(actor.uuid);
  }
  return { playerProtectedActorUuids, ownershipSummaries, userRoleSummary };
}

function groupIncomingReferences(references: ReferenceEdge[]): Map<string, ReferenceEdge[]> {
  const grouped = new Map<string, ReferenceEdge[]>();
  for (const edge of references) {
    if (!edge.verifiedTarget) continue;
    const current = grouped.get(edge.targetUuid);
    if (current) current.push(edge);
    else grouped.set(edge.targetUuid, [edge]);
  }
  return grouped;
}

function actorUsageStatuses(input: {
  incoming: ReferenceEdge[];
  playerProtected: boolean;
  chapter: ChapterClassification;
  duplicateNameTarget: boolean;
}): UsageStatus[] {
  const statuses = new Set<UsageStatus>();
  if (input.incoming.some((edge) => ["structured-field", "explicit-document-id"].includes(edge.evidence))) {
    statuses.add("used-structured");
  }
  if (input.incoming.some((edge) => edge.evidence === "uuid-link")) statuses.add("used-uuid");
  if (input.incoming.some((edge) => ["possible-script-name", "possible-setting-string"].includes(edge.evidence))) {
    statuses.add("possible-script-reference");
  }
  if (input.playerProtected) statuses.add("player-protected");
  if (input.chapter.category === "chapter-shared") statuses.add("chapter-shared");
  if (input.duplicateNameTarget) statuses.add("manual-review-required");
  if (statuses.size === 0) statuses.add("no-detected-reference");
  return USAGE_STATUS_ORDER.filter((status) => statuses.has(status));
}

function collectSceneActorIds(documents: AuditDocument[]): Set<string> {
  const ids = new Set<string>();
  for (const scene of documents.filter((document) => document.collection === "scenes")) {
    for (const token of records(scene.value.tokens)) {
      const actorId = stringValue(token.actorId);
      if (actorId) ids.add(actorId);
    }
  }
  return ids;
}

function collectBrokenTokenActorReferences(
  documents: AuditDocument[],
): Array<Record<string, unknown>> {
  const actorIds = new Set(
    documents.filter((document) => document.collection === "actors").map((document) => document.id),
  );
  const broken: Array<Record<string, unknown>> = [];
  for (const scene of documents.filter((document) => document.collection === "scenes")) {
    for (const token of records(scene.value.tokens)) {
      const actorId = stringValue(token.actorId);
      if (!actorId || actorIds.has(actorId)) continue;
      const delta = isRecord(token.delta) ? token.delta : {};
      broken.push({
        sceneId: scene.id,
        sceneUuid: scene.uuid,
        sceneName: stringValue(scene.value.name) ?? "",
        tokenId: stringValue(token._id) ?? "",
        tokenName: stringValue(token.name) ?? "",
        actorId,
        actorLink: Boolean(token.actorLink),
        deltaItemCount: records(delta.items).length,
        deltaEffectCount: records(delta.effects).length,
        deltaStructure: summarizeStructure(delta),
      });
    }
  }
  return broken.sort((left, right) => compareOrdinal(
    `${String(left.sceneUuid)}\0${String(left.tokenId)}`,
    `${String(right.sceneUuid)}\0${String(right.tokenId)}`,
  ));
}

function collectJournalPages(
  documents: AuditDocument[],
  chaptersByUuid: Map<string, ChapterClassification>,
): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const journal of documents.filter((document) => document.collection === "journal")) {
    for (const page of records(journal.value.pages)) {
      const pageId = stringValue(page._id);
      if (!pageId) continue;
      const uuid = `${journal.uuid}.JournalEntryPage.${pageId}`;
      const content = pageText(page);
      rows.push({
        id: pageId,
        uuid,
        journalId: journal.id,
        name: stringValue(page.name) ?? "",
        type: stringValue(page.type) ?? "",
        language: classifyLanguage(content),
        moduleOwner: journalPageModuleOwner(page),
        chapter: chaptersByUuid.get(uuid) ?? emptyChapter(uuid),
      });
    }
  }
  return rows.sort(compareRowsByUuid);
}

function journalPageModuleOwner(page: Record<string, unknown>): string {
  const pageType = stringValue(page.type) ?? "";
  const customType = /^([a-z0-9][a-z0-9_-]*)\.[a-z0-9][a-z0-9_.-]*$/i.exec(pageType)?.[1];
  if (customType) return customType.toLowerCase();

  const flags = isRecord(page.flags) ? page.flags : {};
  const moduleFlag = Object.keys(flags)
    .filter(isSafePackageId)
    .filter((key) => !["core", "dnd5e", "foundry", "world"].includes(key.toLowerCase()))
    .sort(compareOrdinal)[0];
  if (moduleFlag) return moduleFlag;

  const stats = isRecord(page._stats) ? page._stats : {};
  for (const field of ["moduleId", "packageId"]) {
    const packageId = stringValue(stats[field]);
    if (packageId && isSafePackageId(packageId) && !["core", "dnd5e", "world"].includes(packageId.toLowerCase())) {
      return packageId;
    }
  }
  for (const field of ["compendiumSource", "sourceId"]) {
    const source = stringValue(stats[field]);
    const packageId = /^Compendium\.([a-z0-9][a-z0-9_-]*)\./i.exec(source ?? "")?.[1];
    if (packageId && !["core", "dnd5e", "world"].includes(packageId.toLowerCase())) return packageId;
  }

  return ["text", "image", "pdf", "video"].includes(pageType.toLowerCase()) ? "core" : "unspecified";
}

function isSafePackageId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]*$/i.test(value);
}

function sceneRow(
  document: AuditDocument,
  folderPaths: Map<string, string>,
  chapters: Map<string, ChapterClassification>,
): Record<string, unknown> {
  const value = document.value;
  const tokens = records(value.tokens);
  const paths = collectAssetPaths(value);
  const backgroundPath = nestedString(value, ["background", "src"]) ?? stringValue(value.img) ?? "";
  const foregroundPath = nestedString(value, ["foreground", "src"]) ?? stringValue(value.foreground) ?? "";
  return {
    ...basicDocumentRow(document, folderPaths, chapters),
    tokenCount: tokens.length,
    wallCount: records(value.walls).length,
    lightCount: records(value.lights).length,
    tileCount: records(value.tiles).length,
    drawingCount: records(value.drawings).length,
    regionCount: records(value.regions).length,
    templateCount: records(value.templates).length,
    soundCount: records(value.sounds).length,
    noteCount: records(value.notes).length,
    tokenDeltaItemCount: tokens.reduce(
      (total, token) => total + records(isRecord(token.delta) ? token.delta.items : undefined).length,
      0,
    ),
    tokenDeltaEffectCount: tokens.reduce(
      (total, token) => total + records(isRecord(token.delta) ? token.delta.effects : undefined).length,
      0,
    ),
    pixelWidth: numberValue(value.width) ?? 0,
    pixelHeight: numberValue(value.height) ?? 0,
    backgroundPath,
    foregroundPath,
    videoPaths: paths.filter((path) => /\.(?:mp4|ogv|webm)(?:[?#].*)?$/i.test(path)),
    audioPaths: paths.filter((path) => /\.(?:flac|m4a|mp3|oga|ogg|wav)(?:[?#].*)?$/i.test(path)),
    gpuRisk: estimateGpuRisk(value),
  };
}

function collectWorldItems(
  documents: AuditDocument[],
  folderPaths: Map<string, string>,
  chapters: Map<string, ChapterClassification>,
): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = documents
    .filter((document) => document.collection === "items")
    .map((document) => ({
      ...basicDocumentRow(document, folderPaths, chapters),
      "Document Kind": "Item",
    }));
  for (const card of documents.filter((document) => document.collection === "cards")) {
    const embeddedCards = records(card.value.cards);
    rows.push({
      ...basicDocumentRow(card, folderPaths, chapters),
      "Document Kind": "Card",
      embeddedCardCount: embeddedCards.length,
      embeddedFaceCount: embeddedCards.reduce(
        (total, embeddedCard) => total + records(embeddedCard.faces).length,
        0,
      ),
    });
  }
  return rows.sort(compareRowsByUuid);
}

function collectBasicRows(
  documents: AuditDocument[],
  collections: string[],
  folderPaths: Map<string, string>,
  chapters: Map<string, ChapterClassification>,
): Array<Record<string, unknown>> {
  const allowed = new Set(collections);
  return documents
    .filter((document) => allowed.has(document.collection))
    .map((document) => ({
      ...basicDocumentRow(document, folderPaths, chapters),
      collection: document.collection,
    }))
    .sort(compareRowsByUuid);
}

function collectSettingsAndModules(
  documents: AuditDocument[],
  userRoles: Map<string, number>,
): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  const moduleStates = new Map<string, boolean>();
  for (const document of documents.filter((candidate) => candidate.collection === "settings")) {
    const key = stringValue(document.value.key) ?? document.id;
    if (isSecretSettingKey(key)) continue;
    rows.push({
      id: document.id,
      uuid: document.uuid,
      key,
      valueType: describeType(document.value.value),
      valueSize: serializedByteSize(document.value.value),
    });
    if (key !== "core.moduleConfiguration") continue;
    const configuration = parseModuleConfiguration(document.value.value);
    for (const [moduleId, enabled] of Object.entries(configuration).sort(([left], [right]) => compareOrdinal(left, right))) {
      if (typeof enabled === "boolean") moduleStates.set(moduleId, enabled);
    }
  }
  for (const [moduleId, enabled] of [...moduleStates].sort(([left], [right]) => compareOrdinal(left, right))) {
    rows.push({
      id: moduleId,
      uuid: `Module.${moduleId}`,
      kind: "Module Activation",
      enabled,
    });
  }
  if (moduleStates.size > 0) {
    const enabledCount = [...moduleStates.values()].filter(Boolean).length;
    rows.push({
      id: "module-activation-summary",
      uuid: "Summary.module-activation",
      kind: "Module Activation Summary",
      moduleCount: moduleStates.size,
      enabledCount,
      disabledCount: moduleStates.size - enabledCount,
    });
  }
  rows.push({
    id: "user-role-summary",
    uuid: "Summary.user-roles",
    kind: "User Role Summary",
    roles: formatCounts(userRoles),
  });
  return rows.sort(compareRowsByUuid);
}

function collectPacksAndAdventures(
  snapshot: WorldSnapshot,
  documents: AuditDocument[],
  unresolved: Set<string>,
): Array<Record<string, unknown>> {
  const physicalPacks = new Set<string>();
  for (const entry of snapshot.snapshotTree) {
    const normalized = normalizePath(entry.relativePath);
    const match = /^packs\/([^/]+)\//.exec(normalized);
    if (match?.[1]) physicalPacks.add(match[1]);
  }
  try {
    for (const entry of readdirSync(joinPath(snapshot.snapshotWorldRoot, "packs"), { withFileTypes: true })) {
      if (entry.isDirectory()) physicalPacks.add(entry.name);
    }
  } catch {
    // TreeEntry evidence remains authoritative when the copied packs directory is absent.
  }
  const declaredPacks = readDeclaredPacks(snapshot.snapshotWorldRoot);
  const rows: Array<Record<string, unknown>> = [];
  const claimedDirectories = new Set<string>();
  for (const declaration of declaredPacks.sort((left, right) => compareOrdinal(left.name, right.name))) {
    const physicalDirectory = packNameFromPath(declaration.path) || declaration.name;
    claimedDirectories.add(physicalDirectory);
    const physical = physicalPacks.has(physicalDirectory);
    if (!physical) {
      unresolved.add(
        `Declared pack is missing physical directory: ${declaration.name} (${physicalDirectory})`,
      );
    }
    rows.push({
      uuid: `Pack.${declaration.name}`,
      pack: declaration.name,
      label: declaration.label,
      type: declaration.type,
      path: declaration.path,
      physicalDirectory,
      declared: true,
      physical,
      sampleInspected: false,
      ...(isAdventureSample(declaration.name, physicalDirectory)
        ? { sampleInspectionStatus: "pending-record-inspection" }
        : {}),
      modified: false,
    });
  }
  for (const physicalDirectory of [...physicalPacks].sort(compareOrdinal)) {
    if (claimedDirectories.has(physicalDirectory)) continue;
    unresolved.add(`Undeclared pack directory: ${physicalDirectory}`);
    rows.push({
      uuid: `Pack.${physicalDirectory}`,
      pack: physicalDirectory,
      label: "",
      type: "",
      path: `packs/${physicalDirectory}`,
      physicalDirectory,
      declared: false,
      physical: true,
      sampleInspected: false,
      ...(isAdventureSample(physicalDirectory, physicalDirectory)
        ? { sampleInspectionStatus: "pending-record-inspection" }
        : {}),
      modified: false,
    });
  }
  for (const adventure of documents.filter((document) => document.collection === "adventures")) {
    rows.push({
      id: adventure.id,
      uuid: adventure.uuid,
      name: stringValue(adventure.value.name) ?? "",
      kind: "Adventure",
      modified: false,
    });
  }
  return rows.sort(compareRowsByUuid);
}

function collectAssets(
  treeEntries: TreeEntry[],
  documents: AuditDocument[],
): Array<Record<string, unknown>> {
  const referenced = new Set<string>();
  for (const document of documents) {
    const secretSetting = document.collection === "settings"
      && isSecretSettingKey(stringValue(document.value.key) ?? document.id);
    const assetSource = secretSetting
      ? {}
      : document.collection === "users"
      ? { avatar: document.value.avatar }
      : document.value;
    for (const path of collectAssetPaths(assetSource)) referenced.add(normalizeAssetReference(path));
  }
  const rows = new Map<string, Record<string, unknown>>();
  for (const entry of treeEntries) {
    const path = normalizePath(entry.relativePath);
    if (!isWorldLocalAssetFile(path)) continue;
    rows.set(path, {
      path,
      bytes: entry.bytes,
      sha256: entry.sha256,
      scope: "world-local",
      referenced: referenced.has(path),
      unreferencedCandidate: !referenced.has(path),
    });
  }
  for (const path of referenced) {
    const scope = assetScope(path);
    if (scope === "world-local") {
      if (!rows.has(path)) {
        rows.set(path, {
          path,
          bytes: 0,
          sha256: "",
          scope,
          referenced: true,
          missingFromCopiedWorld: true,
          unreferencedCandidate: false,
        });
      }
      continue;
    }
    rows.set(path, {
      path,
      bytes: 0,
      sha256: "",
      scope,
      referenced: true,
      unreferencedCandidate: false,
    });
  }
  return [...rows.values()].sort((left, right) => compareOrdinal(String(left.path), String(right.path)));
}

function basicDocumentRow(
  document: AuditDocument,
  folderPaths: Map<string, string>,
  chapters: Map<string, ChapterClassification>,
): Record<string, unknown> {
  return {
    id: document.id,
    uuid: document.uuid,
    name: stringValue(document.value.name) ?? "",
    type: stringValue(document.value.type) ?? "",
    folderPath: folderPaths.get(document.uuid) ?? "",
    chapter: chapters.get(document.uuid) ?? emptyChapter(document.uuid),
  };
}

function classifyLanguage(html: string): "CJK-present" | "mixed" | "Latin-only" | "no-text" | "other-text" {
  const text = decodeBasicEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  if (!text) return "no-text";
  const hasCjk = /[\u2e80-\u2fff\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/u.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  if (hasCjk && hasLatin) return "mixed";
  if (hasCjk) return "CJK-present";
  if (hasLatin) return "Latin-only";
  return "other-text";
}

function pageText(page: Record<string, unknown>): string {
  if (isRecord(page.text)) return stringValue(page.text.content) ?? "";
  return stringValue(page.content) ?? "";
}

function estimateGpuRisk(scene: Record<string, unknown>): string {
  const width = numberValue(scene.width) ?? 0;
  const height = numberValue(scene.height) ?? 0;
  const complexity = records(scene.walls).length
    + records(scene.lights).length * 4
    + records(scene.tiles).length * 2
    + records(scene.tokens).length * 2
    + records(scene.regions).length * 2;
  const pixels = width * height;
  const level = pixels > 32_000_000 || complexity > 250
    ? "high"
    : pixels > 12_000_000 || complexity > 100
      ? "medium"
      : "low";
  return `${level} estimate`;
}

function collectAssetPaths(value: unknown): string[] {
  const paths = new Set<string>();
  visitStrings(value, "", (fieldPath, text) => {
    if (isSensitiveFieldPath(fieldPath)) return;
    for (const candidate of text.split(/[\s"'()<>]+/)) {
      const cleaned = candidate.replace(/[),.;]+$/, "");
      if (ASSET_EXTENSION.test(cleaned)) paths.add(cleaned);
    }
  });
  return [...paths].sort(compareOrdinal);
}

function isWorldLocalAssetFile(path: string): boolean {
  if (!ASSET_EXTENSION.test(path)) return false;
  if (/^(?:data|modules|packs|shared|systems)\//i.test(path)) return false;
  if (/(?:^|\/)(?:audit|audit-output|world-audit)(?:\/|$)/i.test(path)) return false;
  if (/^(?:world\.json)$/i.test(path)) return false;
  if (/\.(?:ldb|log)$/i.test(path) || /(?:^|\/)(?:CURRENT|LOCK|LOG|MANIFEST-\d+)$/i.test(path)) return false;
  return true;
}

function normalizeAssetReference(path: string): string {
  let normalized = normalizePath(path).replace(/^[./]+/, "").replace(/[?#].*$/, "");
  const worldsMatch = /^worlds\/[^/]+\/(.+)$/i.exec(normalized);
  if (worldsMatch?.[1]) normalized = worldsMatch[1];
  return normalized;
}

function assetScope(path: string): "external-module" | "external-system" | "external-shared" | "world-local" {
  if (/^modules\//i.test(path)) return "external-module";
  if (/^systems\//i.test(path)) return "external-system";
  if (/^shared\//i.test(path)) return "external-shared";
  return "world-local";
}

function readDeclaredPacks(snapshotWorldRoot: string): Array<{
  name: string;
  label: string;
  path: string;
  type: string;
}> {
  try {
    const metadata = JSON.parse(readFileSync(joinPath(snapshotWorldRoot, "world.json"), "utf8")) as unknown;
    if (!isRecord(metadata) || !Array.isArray(metadata.packs)) return [];
    return metadata.packs.filter(isRecord).map((pack) => ({
      name: stringValue(pack.name) ?? packNameFromPath(stringValue(pack.path) ?? ""),
      label: stringValue(pack.label) ?? "",
      path: stringValue(pack.path) ?? "",
      type: stringValue(pack.type) ?? "",
    })).filter((pack) => pack.name.length > 0);
  } catch {
    return [];
  }
}

function packNameFromPath(path: string): string {
  return normalizePath(path).replace(/\/+$/, "").split("/").filter(Boolean).at(-1) ?? "";
}

function isAdventureSample(logicalName: string, physicalDirectory: string): boolean {
  return logicalName === "Adventure-BxzlyiYWyXYyz9XI"
    || physicalDirectory === "Adventure-BxzlyiYWyXYyz9XI";
}

function joinPath(root: string, child: string): string {
  return root.replace(/[\\/]+$/, "") + (root.includes("\\") ? "\\" : "/") + child;
}

function emptyChapter(documentUuid: string): ChapterClassification {
  return {
    documentUuid,
    category: "unclassified",
    chapterLabels: [],
    confidence: "none",
    evidence: [],
  };
}

function summarizeStructure(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareOrdinal(left, right)).map(
    ([key, entry]) => [key, Array.isArray(entry) ? { kind: "array", count: entry.length } : { kind: describeType(entry) }],
  ));
}

function describeType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function nestedString(value: Record<string, unknown>, path: string[]): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return stringValue(current);
}

function visitStrings(
  value: unknown,
  path: string,
  visit: (fieldPath: string, value: string) => void,
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

function parseModuleConfiguration(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function serializedByteSize(value: unknown): number {
  const serialized = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  return Buffer.byteLength(serialized, "utf8");
}

function sortRecord(
  record: Record<string, number | string | boolean>,
): Record<string, number | string | boolean> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => compareOrdinal(left, right)));
}

function countBy<T>(values: T[], key: (value: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const group = key(value);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return counts;
}

function formatCounts(counts: Map<string, number>): string {
  if (counts.size === 0) return "none";
  return [...counts].sort(([left], [right]) => compareOrdinal(left, right))
    .map(([key, count]) => `${key}:${count}`)
    .join(", ");
}

function flattenDescriptors(descriptors: EmbeddedDescriptor[]): EmbeddedDescriptor[] {
  return descriptors.flatMap((descriptor) => [
    descriptor,
    ...flattenDescriptors(descriptor.children ?? []),
  ]);
}

function recordId(record: LevelRecord): string {
  return stringValue(record.value._id) ?? record.key.split("!")[2]?.split(".").at(-1) ?? "";
}

function recordIdPath(record: LevelRecord): string[] {
  return record.key.split("!")[2]?.split(".").filter(Boolean) ?? [];
}

function recordIdentity(namespace: string, idPath: string[]): string {
  return `${namespace}\0${idPath.join(".")}`;
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

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function singular(value: string): string {
  return value.endsWith("ies") ? `${value.slice(0, -3)}y` : value.replace(/s$/, "");
}

function titleCase(value: string): string {
  return value.length > 0 ? value[0]!.toUpperCase() + value.slice(1) : value;
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (match, digits: string) => decodeNumericEntity(match, digits, 16))
    .replace(/&#([0-9]+);/g, (match, digits: string) => decodeNumericEntity(match, digits, 10))
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'");
}

function decodeNumericEntity(match: string, digits: string, radix: number): string {
  const codePoint = Number.parseInt(digits, radix);
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return match;
  }
}

function compareRecords(left: LevelRecord, right: LevelRecord): number {
  return compareOrdinal(left.key, right.key);
}

function compareRowsByUuid(left: Record<string, unknown>, right: Record<string, unknown>): number {
  return compareOrdinal(String(left.uuid ?? ""), String(right.uuid ?? ""));
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
