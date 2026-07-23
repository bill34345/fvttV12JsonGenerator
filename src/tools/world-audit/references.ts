export type ReferenceEvidence =
  | "structured-field"
  | "uuid-link"
  | "explicit-document-id"
  | "possible-script-name"
  | "possible-setting-string";

export interface ReferenceEdge {
  sourceUuid: string;
  targetUuid: string;
  evidence: ReferenceEvidence;
  fieldPath: string;
  verifiedTarget: boolean;
}

export interface AuditDocument {
  collection: string;
  id: string;
  uuid: string;
  value: Record<string, unknown>;
}

export interface ReferenceExtraction {
  references: ReferenceEdge[];
  duplicateNameTargets: Set<string>;
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

const UUID_DOCUMENT_NAMES = new Set([
  ...Object.values(COLLECTION_DOCUMENT_NAMES),
  "ActiveEffect",
  "AmbientLight",
  "AmbientSound",
  "Card",
  "CardFace",
  "Combatant",
  "Drawing",
  "JournalEntryPage",
  "MeasuredTemplate",
  "Note",
  "PlaylistSound",
  "Region",
  "TableResult",
  "Tile",
  "Token",
  "Wall",
]);

const UUID_CORE_PATTERN =
  `(?:Compendium\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+(?:\\.(?:${[...UUID_DOCUMENT_NAMES].sort().join("|")})\\.[A-Za-z0-9_-]+)?|(?:${[...UUID_DOCUMENT_NAMES].sort().join("|")})\\.[A-Za-z0-9_-]+(?:\\.(?:${[...UUID_DOCUMENT_NAMES].sort().join("|")})\\.[A-Za-z0-9_-]+)*)`;
const UUID_PATTERN = new RegExp(
  `(?<![A-Za-z0-9_.-])${UUID_CORE_PATTERN}(?![A-Za-z0-9_.-])`,
  "g",
);
const WRAPPED_UUID_PATTERN = /@?UUID\[([^\]]*)\]/g;
const TYPED_LINK_WRAPPER_PATTERN = /@([A-Za-z][A-Za-z0-9]*)\[([^\]]*)](?:\{([^}]*)})?/g;
const LEGACY_WORLD_LINK_DOCUMENT_NAMES = new Set([
  "Actor",
  "Cards",
  "Item",
  "Scene",
  "JournalEntry",
  "Macro",
  "RollTable",
]);
const VALID_LEGACY_WORLD_ID_PATTERN = /^[A-Za-z0-9]{16}$/;
const POSSIBLE_ID_PATTERN = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{16}(?![A-Za-z0-9_-])/g;

export function extractWorldReferences(documents: AuditDocument[]): ReferenceExtraction {
  const sortedDocuments = [...documents].sort((left, right) => compareOrdinal(left.uuid, right.uuid));
  const uuidIndex = new Set(sortedDocuments.map((document) => document.uuid));
  const byCollectionAndId = new Map<string, AuditDocument>();
  const byId = new Map<string, AuditDocument[]>();
  const byName = new Map<string, AuditDocument[]>();
  const edges: ReferenceEdge[] = [];
  const duplicateNameTargets = new Set<string>();

  for (const document of sortedDocuments) {
    byCollectionAndId.set(`${document.collection}:${document.id}`, document);
    appendMapArray(byId, document.id, document);
    const name = stringValue(document.value.name);
    if (name) appendMapArray(byName, name, document);
  }

  const addTarget = (
    sourceUuid: string,
    target: AuditDocument | undefined,
    fallbackUuid: string,
    evidence: ReferenceEvidence,
    fieldPath: string,
  ): void => {
    edges.push({
      sourceUuid,
      targetUuid: target?.uuid ?? fallbackUuid,
      evidence,
      fieldPath,
      verifiedTarget: target !== undefined || uuidIndex.has(fallbackUuid),
    });
  };

  const addCollectionId = (
    sourceUuid: string,
    collection: string,
    id: unknown,
    evidence: ReferenceEvidence,
    fieldPath: string,
  ): void => {
    const identifier = stringValue(id);
    if (!identifier) return;
    const target = byCollectionAndId.get(`${collection}:${identifier}`);
    addTarget(
      sourceUuid,
      target,
      `${COLLECTION_DOCUMENT_NAMES[collection] ?? collection}.${identifier}`,
      evidence,
      fieldPath,
    );
  };

  for (const document of sortedDocuments) {
    const secretSetting = document.collection === "settings"
      && isSecretSettingKey(stringValue(document.value.key) ?? document.id);
    extractStructuredReferences(
      document,
      addCollectionId,
      addTarget,
      !secretSetting && document.collection !== "users",
    );
    if (document.collection === "users" || secretSetting) continue;
    visitStrings(document.value, "", (fieldPath, value) => {
      if (isSensitiveFieldPath(fieldPath)) return;
      if (isEmbeddedArrayPath(document.collection, fieldPath)) return;
      if (!isStructuredUuidField(fieldPath)) {
        for (const uuid of extractUuids(value)) {
          addTarget(document.uuid, undefined, uuid, "uuid-link", fieldPath);
        }
      }

      if (isNameMatchingField(document.collection, fieldPath)) {
        for (const [name, matches] of byName) {
          if (!containsExactName(value, name)) continue;
          for (const match of matches) {
            addTarget(document.uuid, match, match.uuid, "possible-script-name", fieldPath);
            if (matches.length > 1) duplicateNameTargets.add(match.uuid);
          }
        }
      }

      if (isPossibleIdentifierField(document.collection, fieldPath)) {
        for (const identifier of value.match(POSSIBLE_ID_PATTERN) ?? []) {
          const matches = byId.get(identifier) ?? [];
          if (matches.length === 0) {
            addTarget(document.uuid, undefined, `Unresolved.${identifier}`, "possible-setting-string", fieldPath);
          } else {
            for (const match of matches) {
              addTarget(document.uuid, match, match.uuid, "possible-setting-string", fieldPath);
              if (matches.length > 1) duplicateNameTargets.add(match.uuid);
            }
          }
        }
      }
    });
  }

  return {
    references: deduplicateAndSort(edges),
    duplicateNameTargets,
  };
}

type AddCollectionId = (
  sourceUuid: string,
  collection: string,
  id: unknown,
  evidence: ReferenceEvidence,
  fieldPath: string,
) => void;

type AddTarget = (
  sourceUuid: string,
  target: AuditDocument | undefined,
  fallbackUuid: string,
  evidence: ReferenceEvidence,
  fieldPath: string,
) => void;

function extractStructuredReferences(
  document: AuditDocument,
  addCollectionId: AddCollectionId,
  addTarget: AddTarget,
  allowValueTraversal: boolean,
): void {
  const value = document.value;
  if (document.collection === "scenes") {
    const sceneId = document.id;
    for (const [index, token] of records(value.tokens).entries()) {
      addCollectionId(document.uuid, "actors", token.actorId, "structured-field", `tokens[${index}].actorId`);
    }
    addCollectionId(document.uuid, "journal", value.journal, "structured-field", "journal");
    const journalId = stringValue(value.journal);
    const pageId = stringValue(value.journalEntryPage);
    if (pageId) {
      const pageUuid = journalId
        ? `JournalEntry.${journalId}.JournalEntryPage.${pageId}`
        : `JournalEntryPage.${pageId}`;
      addTarget(document.uuid, undefined, pageUuid, "structured-field", "journalEntryPage");
    }
    addCollectionId(document.uuid, "playlists", value.playlist, "structured-field", "playlist");
    const playlistId = stringValue(value.playlist);
    const soundId = stringValue(value.playlistSound);
    if (soundId) {
      addTarget(
        document.uuid,
        undefined,
        playlistId ? `Playlist.${playlistId}.PlaylistSound.${soundId}` : `PlaylistSound.${soundId}`,
        "structured-field",
        "playlistSound",
      );
    }
    for (const [index, note] of records(value.notes).entries()) {
      const documentName = stringValue(note.documentName);
      const documentId = note.documentId;
      const genericCollection = collectionForDocumentName(documentName);
      const entryId = note.entryId ?? (genericCollection === "journal" ? documentId : undefined);
      const page = note.pageId ?? note.journalEntryPage;
      addCollectionId(document.uuid, "journal", entryId, "structured-field", `notes[${index}].entryId`);
      if (genericCollection && stringValue(documentId)) {
        addCollectionId(
          document.uuid,
          genericCollection,
          documentId,
          "structured-field",
          `notes[${index}].documentId`,
        );
      }
      const entry = stringValue(entryId);
      const pageIdentifier = stringValue(page);
      if (pageIdentifier) {
        addTarget(
          document.uuid,
          undefined,
          entry
            ? `JournalEntry.${entry}.JournalEntryPage.${pageIdentifier}`
            : `JournalEntryPage.${pageIdentifier}`,
          "structured-field",
          `notes[${index}].pageId`,
        );
      }
    }
  }

  if (document.collection === "users") {
    addCollectionId(document.uuid, "actors", value.character, "structured-field", "character");
  }

  if (document.collection === "combats") {
    addCollectionId(document.uuid, "scenes", value.scene, "structured-field", "scene");
    const sceneId = stringValue(value.scene);
    for (const [index, combatant] of records(value.combatants).entries()) {
      addCollectionId(document.uuid, "actors", combatant.actorId, "structured-field", `combatants[${index}].actorId`);
      const tokenId = stringValue(combatant.tokenId);
      if (tokenId) {
        addTarget(
          document.uuid,
          undefined,
          sceneId ? `Scene.${sceneId}.Token.${tokenId}` : `Token.${tokenId}`,
          "structured-field",
          `combatants[${index}].tokenId`,
        );
      }
    }
  }

  if (document.collection === "tables") {
    for (const [index, result] of records(value.results).entries()) {
      const resultUuid = stringValue(result.documentUuid);
      if (resultUuid) {
        addTarget(document.uuid, undefined, resultUuid, "explicit-document-id", `results[${index}].documentUuid`);
        continue;
      }
      const collection = collectionForDocumentName(stringValue(result.documentCollection));
      const id = result.documentId;
      if (collection && stringValue(id)) {
        addCollectionId(document.uuid, collection, id, "explicit-document-id", `results[${index}].documentId`);
      }
    }
  }

  if (document.collection === "cards") {
    for (const card of records(value.cards)) {
      const cardId = stringValue(card._id);
      if (!cardId) continue;
      const cardUuid = `${document.uuid}.Card.${cardId}`;
      addTarget(document.uuid, undefined, cardUuid, "structured-field", "cards");
      for (const face of records(card.faces)) {
        const faceId = stringValue(face._id);
        if (!faceId) continue;
        addTarget(
          cardUuid,
          undefined,
          `${cardUuid}.CardFace.${faceId}`,
          "structured-field",
          "faces",
        );
      }
    }
  }

  if (document.collection === "folders") {
    addCollectionId(document.uuid, "folders", value.folder, "structured-field", "folder");
  } else {
    addCollectionId(document.uuid, "folders", value.folder, "structured-field", "folder");
  }

  if (!allowValueTraversal) return;
  visitEntries(value, "", (fieldPath, fieldValue) => {
    if (isSensitiveFieldPath(fieldPath)) return;
    if (isEmbeddedArrayPath(document.collection, fieldPath)) return;
    const leaf = fieldPath.split(".").at(-1) ?? "";
    if (leaf === "origin" && typeof fieldValue === "string") {
      for (const uuid of extractUuids(fieldValue)) {
        addTarget(document.uuid, undefined, uuid, "structured-field", fieldPath);
      }
    }
    if (
      ["compendiumSource", "sourceId", "documentUuid"].includes(leaf)
      && typeof fieldValue === "string"
      && extractUuids(fieldValue).length > 0
    ) {
      for (const uuid of extractUuids(fieldValue)) {
        addTarget(document.uuid, undefined, uuid, "explicit-document-id", fieldPath);
      }
    }
  });
}

function extractUuids(value: string): string[] {
  const found = new Set<string>();
  const wrapperSpans: Array<{ start: number; end: number }> = [];
  for (const match of value.matchAll(WRAPPED_UUID_PATTERN)) {
    if (match.index !== undefined) {
      wrapperSpans.push({ start: match.index, end: match.index + match[0].length });
    }
    const candidate = match[1];
    if (candidate && isValidFoundryUuid(candidate)) found.add(candidate);
  }
  for (const match of value.matchAll(TYPED_LINK_WRAPPER_PATTERN)) {
    if (match.index !== undefined) {
      wrapperSpans.push({ start: match.index, end: match.index + match[0].length });
    }
    const documentName = match[1];
    const targetAndHash = match[2] ?? "";
    const hashIndex = targetAndHash.indexOf("#");
    const target = hashIndex === -1 ? targetAndHash : targetAndHash.slice(0, hashIndex);
    const hash = hashIndex === -1 ? undefined : targetAndHash.slice(hashIndex + 1);
    // anti-overfit: allow schema-derived - Foundry 14.364 TextEditor legacy
    // links use @Type[id] syntax. Canonicalize only the linkable world
    // Document types that map to audited top-level collections, and only when
    // the target passes Foundry's exact 16-character alphanumeric ID rule.
    if (
      documentName
      && LEGACY_WORLD_LINK_DOCUMENT_NAMES.has(documentName)
      && VALID_LEGACY_WORLD_ID_PATTERN.test(target)
      && (hash === undefined || hash.length > 0)
    ) {
      found.add(`${documentName}.${target}`);
    }
  }
  let standaloneText = value;
  for (const span of [...wrapperSpans].sort((left, right) => right.start - left.start)) {
    standaloneText = `${standaloneText.slice(0, span.start)}${" ".repeat(span.end - span.start)}${standaloneText.slice(span.end)}`;
  }
  for (const match of standaloneText.matchAll(UUID_PATTERN)) {
    if (isValidFoundryUuid(match[0])) found.add(match[0]);
  }
  return [...found].sort(compareOrdinal);
}

function isValidFoundryUuid(candidate: string): boolean {
  const parts = candidate.split(".");
  if (parts[0] === "Compendium") {
    if (parts.length === 4) {
      return parts.slice(1).every((part) => /^[A-Za-z0-9_-]+$/.test(part));
    }
    return parts.length === 5
      && parts.slice(1, 3).every((part) => /^[A-Za-z0-9_-]+$/.test(part))
      && UUID_DOCUMENT_NAMES.has(parts[3] ?? "")
      && /^[A-Za-z0-9_-]+$/.test(parts[4] ?? "");
  }
  if (parts.length < 2 || parts.length % 2 !== 0) return false;
  for (let index = 0; index < parts.length; index += 2) {
    if (!UUID_DOCUMENT_NAMES.has(parts[index] ?? "")) return false;
    if (!/^[A-Za-z0-9_-]+$/.test(parts[index + 1] ?? "")) return false;
  }
  return true;
}

function isNameMatchingField(collection: string, fieldPath: string): boolean {
  if (collection === "macros" && fieldPath === "command") return true;
  if (collection === "settings") return true;
  return /(?:^|\.)(?:command|script|config|configuration)$/i.test(fieldPath);
}

function isPossibleIdentifierField(collection: string, fieldPath: string): boolean {
  return isNameMatchingField(collection, fieldPath)
    || collection === "settings"
    || /(?:^|\.)flags(?:\.|$)/i.test(fieldPath);
}

function containsExactName(haystack: string, name: string): boolean {
  if (!name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "u").test(haystack);
}

function collectionForDocumentName(documentName: string | undefined): string | undefined {
  if (!documentName) return undefined;
  if (COLLECTION_DOCUMENT_NAMES[documentName]) return documentName;
  const entry = Object.entries(COLLECTION_DOCUMENT_NAMES)
    .find(([collection, candidate]) => candidate === documentName || collection === documentName.toLowerCase());
  return entry?.[0];
}

function isStructuredUuidField(fieldPath: string): boolean {
  const leaf = fieldPath.split(".").at(-1) ?? "";
  return ["compendiumSource", "documentUuid", "origin", "sourceId"].includes(leaf);
}

export function isSensitiveFieldPath(fieldPath: string): boolean {
  const tokens = fieldPath
    .replace(/([a-z0-9])([A-Z])/g, "$1.$2")
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean);
  const compact = tokens.join("");
  if (tokens.some((token) => [
    "auth",
    "authentication",
    "authorization",
    "credential",
    "credentials",
    "password",
    "salt",
    "secret",
  ].includes(token))) {
    return true;
  }
  return [
    "accesstoken",
    "apikey",
    "authtoken",
    "bearertoken",
    "clientsecret",
    "oauthtoken",
    "passwordhash",
    "passwordsalt",
    "refreshtoken",
    "sessioncredential",
    "sessiontoken",
  ].some((marker) => compact.includes(marker));
}

export function isSecretSettingKey(key: string): boolean {
  return isSensitiveFieldPath(key);
}

function isEmbeddedArrayPath(collection: string, fieldPath: string): boolean {
  const embeddedRoots: Record<string, string[]> = {
    actors: ["effects", "items"],
    cards: ["cards"],
    combats: ["combatants"],
    items: ["effects"],
    journal: ["pages"],
    playlists: ["sounds"],
    scenes: ["drawings", "lights", "notes", "regions", "sounds", "templates", "tiles", "tokens", "walls"],
    tables: ["results"],
  };
  return (embeddedRoots[collection] ?? []).some((root) => fieldPath.startsWith(`${root}[`));
}

function deduplicateAndSort(edges: ReferenceEdge[]): ReferenceEdge[] {
  const unique = new Map<string, ReferenceEdge>();
  for (const edge of edges) {
    const key = [edge.sourceUuid, edge.targetUuid, edge.evidence, edge.fieldPath].join("\0");
    const previous = unique.get(key);
    if (!previous || (!previous.verifiedTarget && edge.verifiedTarget)) unique.set(key, edge);
  }
  return [...unique.values()].sort((left, right) => compareOrdinal(
    [left.sourceUuid, left.targetUuid, left.evidence, left.fieldPath].join("\0"),
    [right.sourceUuid, right.targetUuid, right.evidence, right.fieldPath].join("\0"),
  ));
}

function visitStrings(
  value: unknown,
  path: string,
  visit: (fieldPath: string, value: string) => void,
): void {
  visitEntries(value, path, (fieldPath, entry) => {
    if (typeof entry === "string") visit(fieldPath, entry);
  });
}

function visitEntries(
  value: unknown,
  path: string,
  visit: (fieldPath: string, value: unknown) => void,
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visitEntries(entry, `${path}[${index}]`, visit));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    const fieldPath = path ? `${path}.${key}` : key;
    visit(fieldPath, entry);
    visitEntries(entry, fieldPath, visit);
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

function appendMapArray<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
