// Task-owned repair logic. No filesystem, Foundry globals, or implicit writes.
export const TARGETS = Object.freeze([
  { actorId: 'D90ARiSHc6gQix80', itemIds: ['JKYf8f2QRtTInPTg'] },
  { actorId: 'AYV4B8wS4WSAjWAp', itemIds: ['tmZVAnBOqiCBzj65'] },
  { actorId: 'aMZwC9ORkpZpdlkc', itemIds: ['Oqs0HDVs0QOmvzb9', 'uzVbpCQgQkhTJHWP'] },
  { actorId: 'MkOcySfY7k3A1AAl', itemIds: ['V5QhgpThojOk76m8'] },
  { actorId: 'mPCqZoTgUrq2E4FL', itemIds: ['lD2rOPRef3624n1L', 'SK5GP9LvoSDk0BIB'] },
]);
export const DIAGNOSTIC = Object.freeze({ actorId: 'LN5PLqTTdx0l7o7w', itemIds: ['f8e17a7b397a98b7'] });
export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function canonicalMetadata(value) {
  const result = structuredClone(value);
  function visit(v) {
    if (!v || typeof v !== 'object') return;
    if (v._stats && typeof v._stats === 'object') {
      delete v._stats.modifiedTime;
      delete v._stats.lastModifiedBy;
    }
    for (const child of Object.values(v)) visit(child);
  }
  visit(result);
  return result;
}
export function canonical(value) {
  const result = canonicalMetadata(value);
  function visit(v) {
    if (!v || typeof v !== 'object') return;
    // Exact v7 evidence: the stored Swim Speed change has no ID; dnd5e 6.0.2
    // generates one per hydration. Both login samples differ ONLY at this leaf.
    // Keep every other field and every Actor/Item/ActiveEffect document ID exact.
    if (v._id === 'Oqs0HDVs0QOmvzb9' && v.type === 'race' && Array.isArray(v.effects)) {
      const effect = v.effects.find(e => e._id === 'SIoBMgJ64YgbJ1eS');
      const changes = effect?.system?.changes;
      if (Array.isArray(changes) && changes.length === 1 && /^[A-Za-z0-9]{16}$/.test(changes[0]._id ?? '')) delete changes[0]._id;
    }
    for (const child of Object.values(v)) visit(child);
  }
  visit(result);
  return result;
}
export function assertTarget(actorId, itemId) {
  if (!TARGETS.some(t => t.actorId === actorId && t.itemIds.includes(itemId))) throw new Error('Outside authorized player Item allowlist');
}
export function origins(source) {
  return [...new Set([source?._stats?.compendiumSource, source?.flags?.core?.sourceId, source?.flags?.['scene-packer']?.sourceId].filter(x => typeof x === 'string' && x.length))];
}
export function sourceHints(source) {
  const flags = source?.flags ?? {};
  const pick = (value, keys) => Object.fromEntries(keys.filter(k => value?.[k] !== undefined).map(k => [k, structuredClone(value[k])]));
  return {
    flagNamespaces: Object.keys(flags).sort(),
    stats: pick(source?._stats, ['compendiumSource', 'duplicateSource']),
    systemSource: pick(source?.system?.source, ['book', 'custom', 'page', 'license', 'rules', 'revision']),
    plutonium: pick(flags.plutonium, ['page', 'source', 'hash', 'propDroppable', 'name', 'group', 'className', 'classSource', 'subclassShortName', 'level']),
    plutoniumCN: pick(flags['plutonium-cn'], ['page', 'source', 'hash', 'propDroppable', 'name', 'group', 'className', 'classSource', 'subclassShortName', 'level']),
    scenePacker: pick(flags['scene-packer'], ['sourceId', 'hash']),
    importerFieldNames: { plutonium: Object.keys(flags.plutonium ?? {}), plutoniumCN: Object.keys(flags['plutonium-cn'] ?? {}), scenePacker: Object.keys(flags['scene-packer'] ?? {}) },
    bloodHunter: pick(flags.fvttJsonGenerator?.bloodHunter2024, ['canonicalId', 'sourceIdentity', 'sourceKey', 'logicalHash']),
    dnd5e: pick(flags.dnd5e, ['sourceId', 'advancementOrigin']),
    ddbimporter: pick(flags.ddbimporter, ['id', 'entityTypeId', 'definitionId', 'is2014', 'is2024']),
    originalName: typeof flags.babele?.originalName === 'string' ? flags.babele.originalName : undefined,
  };
}
export function identityKeys(source) {
  const hints = sourceHints(source);
  const keys = [];
  for (const [namespace, p] of [['plutonium', hints.plutonium], ['plutonium-cn', hints.plutoniumCN]]) {
    if ([p.page, p.source, p.hash].every(v => typeof v === 'string' && v.length)) keys.push(`${namespace}:${stable({ page: p.page, source: p.source, hash: p.hash, type: source.type })}`);
  }
  if (typeof hints.scenePacker.sourceId === 'string' && /^(Actor|Item|Compendium)\./.test(hints.scenePacker.sourceId)) keys.push(`scene-packer:${stable({ sourceId: hints.scenePacker.sourceId, type: source.type })}`);
  const identity = hints.bloodHunter.sourceIdentity;
  if (identity?.source && identity?.normalizedName) keys.push(`bloodHunter:${stable(identity)}`);
  return keys;
}
export function contentIdentity(source) {
  // Read-only candidate discovery only. Exact content equality is not automatic approval.
  return canonical({ name: source.name, type: source.type, system: source.system, effects: source.effects ?? [] });
}
export function topLevelItem(uuid) {
  return typeof uuid === 'string' && (/^Item\.[A-Za-z0-9_-]+$/.test(uuid) || /^Compendium\.[^.]+\.[^.]+\.Item\.[A-Za-z0-9_-]+$/.test(uuid));
}
export function brokenGrants(source) {
  if (Array.isArray(source?.system?.advancement)) throw new Error('Unexpected legacy advancement array; no implicit migration');
  const rows = [];
  for (const [advancementId, advancement] of Object.entries(source?.system?.advancement ?? {})) {
    if (advancement.type !== 'ItemGrant') continue;
    const items = advancement.configuration?.items;
    if (!Array.isArray(items)) continue;
    items.forEach((entry, index) => {
      if (typeof entry?.uuid === 'string' && entry.uuid.startsWith('Actor.') && entry.uuid.includes('.Item.')) {
        rows.push({ advancementId, index, uuid: entry.uuid, title: advancement.title ?? '', level: advancement.level });
      }
    });
  }
  return rows;
}
export function selectOrigin(referencedSource, candidates) {
  const proof = origins(referencedSource).filter(topLevelItem);
  const matches = candidates.filter(c => proof.includes(c.uuid) && topLevelItem(c.uuid) && c.documentName === 'Item');
  const unique = [...new Map(matches.map(c => [c.uuid, c])).values()];
  if (unique.length !== 1) throw new Error(unique.length ? 'Ambiguous canonical sources' : 'No resolvable canonical provenance; name matching forbidden');
  return unique[0];
}
export function projectRepair(actorId, source, mappings) {
  assertTarget(actorId, source._id);
  if (!Array.isArray(mappings) || !mappings.length) throw new Error('No approved mappings');
  const candidate = structuredClone(source);
  const changes = { _id: source._id };
  const seen = new Set();
  for (const map of mappings) {
    const key = `${map.advancementId}:${map.index}`;
    if (seen.has(key)) throw new Error('Duplicate mapping');
    seen.add(key);
    if (!topLevelItem(map.to) || map.from === map.to) throw new Error('Invalid canonical Item destination');
    const libraryProof = map.proofKind === 'AUTHORIZED_EXISTING_FEATURE_COPY'
      && map.authorization === 'USER_APPROVED_SOURCE_LIBRARY_20260929'
      && map.from.startsWith(`Actor.${actorId}.Item.`)
      && /^Item\.[a-f0-9]{16}$/.test(map.to)
      && /^[a-f0-9]{64}$/.test(map.referencedHash ?? '');
    if (map.contentReviewed !== true || !map.evidence || !(libraryProof || map.provenance?.includes(map.to))) throw new Error('Missing reviewed content/provenance evidence');
    const adv = candidate.system?.advancement?.[map.advancementId];
    if (adv?.type !== 'ItemGrant' || !Number.isInteger(map.index) || map.index < 0) throw new Error('Not an ItemGrant mapping');
    const entry = adv.configuration?.items?.[map.index];
    if (!entry || entry.uuid !== map.from) throw new Error('Stale grant reference');
    if (!brokenGrants(source).some(r => r.advancementId === map.advancementId && r.index === map.index)) throw new Error('Source is not an invalid embedded Item reference');
    entry.uuid = map.to;
    changes[`system.advancement.${map.advancementId}.configuration.items`] = structuredClone(adv.configuration.items);
  }
  if (brokenGrants(candidate).length) throw new Error('Unresolved embedded grant references; refuse partial Item repair');
  return { candidate, changes };
}
export function assertUnchanged(actual, expected) {
  if (stable(canonical(actual)) !== stable(canonical(expected))) throw new Error('Unexpected source change');
}
export function assertFresh(actualHash, expectedHash) {
  if (!expectedHash || actualHash !== expectedHash) throw new Error('Source changed since approval');
}

// New operational source templates, explicitly authorized on 2026-09-29.
// Do not claim that these newly created documents are the original upstream source.
export function sourceTemplate(original, mapping, folderId, batch, creatorUserId) {
  if (original.type !== 'feat' || mapping.proofKind !== 'AUTHORIZED_EXISTING_FEATURE_COPY'
      || mapping.authorization !== 'USER_APPROVED_SOURCE_LIBRARY_20260929'
      || !/^Item\.[a-f0-9]{16}$/.test(mapping.to)
      || mapping.from.split('.').at(-1) !== original._id) throw new Error('Unapproved source template');
  const result = structuredClone(original);
  result._id = mapping.to.slice(5);
  result.folder = folderId;
  result.sort = 0;
  result.ownership = { default: 0 };
  if (creatorUserId) {
    if (!/^[A-Za-z0-9]{16}$/.test(creatorUserId)) throw new Error('Invalid source creator ID');
    result.ownership[creatorUserId] = 3;
  }
  delete result._stats;
  // The template is not itself an ability already granted to an Actor.
  if (result.flags?.dnd5e) {
    delete result.flags.dnd5e.advancementOrigin;
    delete result.flags.dnd5e.sourceId;
  }
  result.flags ??= {};
  result.flags.world ??= {};
  result.flags.world.nextItemRepairSource = { batch, originUuid: mapping.from, originHash: mapping.referencedHash };
  // Prevent _preCreate from deriving an invalid identifier from a translated name.
  if (!result.system.identifier) result.system.identifier = `legacy-grant-${result._id}`;
  return result;
}

export function libraryIdentity(source) {
  const result = structuredClone(source);
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    delete value._stats;
    for (const child of Object.values(value)) visit(child);
  }
  visit(result);
  return result;
}
