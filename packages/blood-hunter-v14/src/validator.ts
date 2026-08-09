import { asArray, asRecord, findForbiddenKey, sha256, stringValue } from './internals';
import { BLOOD_HUNTER_MODULE_ID, BLOOD_HUNTER_MODULE_VERSION } from './constants';
import { EXPECTED_BLOOD_HUNTER_SOURCE_SHA256 } from './source';
import type { BloodHunterCoverageLedgerEntry, BloodHunterValidationFinding, BloodHunterValidationResult, GrantGraphNode, JsonObject, NativeBloodHunterPackage, NativeItemSource, NativeReferenceContract } from './types';

const FORBIDDEN_SIDE_DATA_KEYS = new Set(['foundryClassFeature', 'foundrySubclassFeature', 'foundryOptionalfeature']);
const STRICT_ID = /^[A-Za-z0-9]{16}$/;
const MODULE_UUID = /^Compendium\.fvtt-blood-hunter-2024\.(classes|subclasses|features)\.Item\.([A-Za-z0-9]{16})$/;
const DND5E_UUID = /^Compendium\.dnd5e\.[A-Za-z0-9-]+\.Item\.([A-Za-z0-9]{16})$/;
const FIGHTING_STYLE_UUIDS = [
  'Compendium.dnd5e.feats24.Item.phbfstArchery000',
  'Compendium.dnd5e.feats24.Item.phbfstDefense000',
  'Compendium.dnd5e.feats24.Item.phbfstGreatWeapo',
  'Compendium.dnd5e.feats24.Item.phbfstTwoWeaponF',
] as const;
const EPIC_BOON_UUID = 'Compendium.dnd5e.feats24.Item.phbBoonofTruesig';
const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const ACTIVE_EFFECT_MODE_LABELS = ['CUSTOM', 'MULTIPLY', 'ADD', 'DOWNGRADE', 'UPGRADE', 'OVERRIDE'] as const;

export function validateNativeBloodHunterPackage(value: unknown): BloodHunterValidationResult {
  const findings: BloodHunterValidationFinding[] = [];
  const add = (code: string, path: string, message: string): void => { findings.push({ code, path, message }); };
  if (!asRecord(value) || Array.isArray(value)) {
    add('INVALID_PACKAGE', '/', 'NativeBloodHunterPackage 必须是对象。');
    return { ok: false, findings };
  }
  const pkg = value as NativeBloodHunterPackage;
  if (pkg.moduleId !== BLOOD_HUNTER_MODULE_ID || pkg.version !== BLOOD_HUNTER_MODULE_VERSION) add('MODULE_IDENTITY_MISMATCH', '/', 'moduleId/version 必须锁定为 fvtt-blood-hunter-2024@1.0.0。');
  if (pkg.target?.foundry !== '14.364' || pkg.target?.dnd5e !== '5.3.3' || pkg.target?.rules !== '2024' || pkg.target?.effectProfile !== 'modded-v14') add('TARGET_VERSION_MISMATCH', '/target', '目标必须锁定 Foundry 14.364 / dnd5e 5.3.3 / 2024 / modded-v14。');
  if (pkg.sourceSha256 !== undefined && pkg.sourceSha256 !== EXPECTED_BLOOD_HUNTER_SOURCE_SHA256) add('SOURCE_HASH_MISMATCH', '/sourceSha256', 'byte-verified package 必须记录锁定 BloodHunter2024 SHA-256。');
  if (!Array.isArray(pkg.classes) || pkg.classes.length !== 1) add('CLASS_COUNT_MISMATCH', '/classes', '必须只有一个 class document。');
  if (!Array.isArray(pkg.subclasses) || pkg.subclasses.length !== 4) add('SUBCLASS_COUNT_MISMATCH', '/subclasses', '必须恰有四个 subclass documents。');
  if (!Array.isArray(pkg.features) || pkg.features.length !== 76) add('FEATURE_COUNT_MISMATCH', '/features', '必须为 75 个源 canonical feat 加 synthetic「诱变武者」，共 76 项。');
  if (!Array.isArray(pkg.coverageLedger) || pkg.coverageLedger.length !== 94) add('COVERAGE_LEDGER_COUNT_MISMATCH', '/coverageLedger', 'coverage ledger 必须恰有 94 项。');

  const documents = [...asArray<NativeItemSource>(pkg.classes), ...asArray<NativeItemSource>(pkg.subclasses), ...asArray<NativeItemSource>(pkg.features)];
  const ids = new Set<string>();
  const documentById = new Map<string, NativeItemSource>();
  const advancementById = new Map<string, { item: NativeItemSource; advancement: JsonObject }>();
  for (const [index, item] of documents.entries()) {
    validateItem(item, `/documents/${index}`, ids, documentById, advancementById, add);
  }
  validateClassDocument(pkg.classes?.[0], '/classes/0', add);
  for (const [index, item] of asArray<NativeItemSource>(pkg.subclasses).entries()) validateSubclassDocument(item, `/subclasses/${index}`, add);
  validateFeaturePrerequisites(pkg, add);

  const graph = asArray<GrantGraphNode>(pkg.grantGraph);
  const graphIds = new Set<string>();
  const graphNodeCounts = new Map<string, number>();
  for (const [index, node] of graph.entries()) {
    const path = `/grantGraph/${index}`;
    if (!isStrictId(node.id) || graphIds.has(node.id)) add('INVALID_GRANT_NODE_ID', `${path}/id`, 'grant graph node id 必须唯一且为严格16位 ASCII 字母数字。');
    graphIds.add(node.id);
    graphNodeCounts.set(node.id, (graphNodeCounts.get(node.id) ?? 0) + 1);
    if (!ids.has(node.ownerDocumentId)) add('DANGLING_GRANT_OWNER', `${path}/ownerDocumentId`, 'grant owner document 不存在。');
    const persisted = advancementById.get(node.id);
    if (!persisted || persisted.item._id !== node.ownerDocumentId) add('GRAPH_PERSISTENCE_MISMATCH', path, 'grant graph 必须指向 owner 的同一持久 advancement。');
    for (const [referenceIndex, reference] of asArray<NativeReferenceContract>(node.references).entries()) {
      validateReference(reference, `${path}/references/${referenceIndex}`, documentById, add);
    }
    if (persisted) validateGraphPersistence(node, persisted.advancement, path, add);
  }
  for (const [id, persisted] of advancementById) {
    const type = stringValue(persisted.advancement.type);
    if ((type === 'ItemGrant' || type === 'ItemChoice') && graphNodeCounts.get(id) !== 1) {
      add('PERSISTENCE_GRAPH_MISMATCH', `/documents/${persisted.item._id}/system/advancement/${id}`, '每个持久 ItemGrant/ItemChoice 必须恰好有一个同 id 的 grant graph 节点。');
    }
  }
  for (const [index, reference] of asArray<NativeReferenceContract>(pkg.externalReferences).entries()) {
    validateReference(reference, `/externalReferences/${index}`, documentById, add);
    add('UNEXPECTED_EXTERNAL_REFERENCE', `/externalReferences/${index}`, '当前 Blood Hunter v14 包不允许遗留 external-rule 或 builder 注入引用；持久引用必须直接写入有效 UUID。');
  }

  validateExpectedPools(pkg, graph, add);
  validateSubclassGrants(pkg, graph, advancementById, add);
  validateSemanticAdvancements(pkg, advancementById, add);
  validateCoverageLedger(pkg, ids, graphIds, advancementById, documentById, add);
  validateActivitySummary(pkg, documents, add);

  const withoutHash = { ...pkg };
  delete (withoutHash as Partial<NativeBloodHunterPackage>).logicalHash;
  if (!/^[a-f0-9]{64}$/.test(pkg.logicalHash ?? '') || pkg.logicalHash !== sha256(withoutHash)) add('LOGICAL_HASH_MISMATCH', '/logicalHash', 'logicalHash 与 package 内容不一致。');
  return { ok: findings.length === 0, findings };
}

function validateItem(item: NativeItemSource, path: string, ids: Set<string>, documentById: Map<string, NativeItemSource>, advancementById: Map<string, { item: NativeItemSource; advancement: JsonObject }>, add: AddFinding): void {
  if (!isStrictId(item?._id) || ids.has(item._id)) add('INVALID_DOCUMENT_ID', `${path}/_id`, 'Item _id 必须唯一且为严格16位 ASCII 字母数字。');
  if (item?._id) {
    ids.add(item._id);
    documentById.set(item._id, item);
  }
  const forbidden = findForbiddenKey(item, FORBIDDEN_SIDE_DATA_KEYS);
  if (forbidden) add('FORBIDDEN_SIDE_DATA_LEAK', `${path}${forbidden}`, '输出 Item 不得保留 Plutonium foundry*Feature side data。');
  const metadata = asRecord(asRecord(asRecord(item?.flags).fvttJsonGenerator).bloodHunter2024);
  for (const key of ['sourceKey', 'canonicalId', 'moduleVersion', 'automation']) {
    if (!stringValue(metadata[key])) add('MISSING_BLOOD_HUNTER_METADATA', `${path}/flags/fvttJsonGenerator/bloodHunter2024/${key}`, '每个 Item 必须有完整 Blood Hunter canonical metadata。');
  }
  if (metadata.canonicalId !== item?._id || metadata.moduleVersion !== BLOOD_HUNTER_MODULE_VERSION) add('INVALID_BLOOD_HUNTER_METADATA', `${path}/flags/fvttJsonGenerator/bloodHunter2024`, 'canonical metadata 与 Item identity 不一致。');

  const advancements = item?.system?.advancement;
  if (Array.isArray(advancements)) add('ARRAY_ADVANCEMENT', `${path}/system/advancement`, 'dnd5e 5.3.3 system.advancement 必须是 _id 为 key 的对象。');
  if (advancements !== undefined && !asRecord(advancements)) add('INVALID_ADVANCEMENT_CONTAINER', `${path}/system/advancement`, 'system.advancement 必须是对象。');
  for (const [id, advancement] of Object.entries(asRecord(advancements))) {
    const advancementObject = asRecord(advancement);
    if (advancementObject._id !== id || !isStrictId(id)) add('INVALID_ADVANCEMENT_ID', `${path}/system/advancement/${id}`, 'advancement key 和 _id 必须相等，并且为严格16位 ASCII 字母数字。');
    if (advancementById.has(id)) add('DUPLICATE_ADVANCEMENT_ID', `${path}/system/advancement/${id}`, '所有持久 advancement id 必须全包唯一。');
    advancementById.set(id, { item, advancement: advancementObject });
    validateAdvancement(advancementObject, `${path}/system/advancement/${id}`, add);
  }

  const activities = item?.system?.activities;
  if (Array.isArray(activities)) add('ARRAY_ACTIVITIES', `${path}/system/activities`, 'system.activities 必须是 _id 为 key 的对象。');
  const effectIds = new Set(asArray<JsonObject>(item?.effects).map((effect) => String(effect._id)));
  for (const [id, activity] of Object.entries(asRecord(activities))) {
    const activityObject = asRecord(activity);
    if (activityObject._id !== id || !isStrictId(id)) add('INVALID_ACTIVITY_ID', `${path}/system/activities/${id}`, 'Activity key 和 _id 必须相等，并且为严格16位 ASCII 字母数字。');
    for (const [referenceIndex, effect] of asArray<JsonObject>(activityObject.effects).entries()) {
      if (!isStrictId(effect._id) || effect.foundryId !== undefined || !effectIds.has(String(effect._id))) add('INVALID_ACTIVITY_EFFECT_REFERENCE', `${path}/system/activities/${id}/effects/${referenceIndex}`, 'activity effect reference 必须使用存在的严格16位原生 _id。');
    }
  }
  for (const [index, effect] of asArray<JsonObject>(item?.effects).entries()) {
    if (!isStrictId(effect._id) || effect.foundryId !== undefined) add('INVALID_TOP_LEVEL_EFFECT_ID', `${path}/effects/${index}`, '顶层 Effect _id 必须为严格16位 ASCII 字母数字，且不可保留 foundryId。');
    for (const [changeIndex, change] of asArray<JsonObject>(effect.changes).entries()) {
      if (!Number.isInteger(change.mode) || Number(change.mode) < 0 || Number(change.mode) > 5) add('INVALID_ACTIVE_EFFECT_CHANGE_MODE', `${path}/effects/${index}/changes/${changeIndex}/mode`, 'ActiveEffect change.mode 必须是 Foundry CONST.ACTIVE_EFFECT_MODES 的整数0..5。');
    }
  }
}

function validateAdvancement(advancement: JsonObject, path: string, add: AddFinding): void {
  const type = stringValue(advancement.type);
  const configuration = asRecord(advancement.configuration);
  if (!type || !Number.isInteger(advancement.level) || !stringValue(advancement.title) && advancement.title !== '') add('INCOMPLETE_ADVANCEMENT', path, '持久 advancement 必须有 type、integer level、configuration、title 和 value。');
  if (!asRecord(advancement.value)) add('INCOMPLETE_ADVANCEMENT_VALUE', `${path}/value`, '持久 advancement value 必须是对象。');
  if (type === 'ItemGrant') {
    const items = asArray<JsonObject>(configuration.items);
    if (items.length === 0 || items.some((item) => !stringValue(item.uuid) || typeof item.optional !== 'boolean')) add('EMPTY_OR_INVALID_ITEM_GRANT', `${path}/configuration/items`, '每个持久 ItemGrant 至少含一个直接 UUID items 条目。');
    for (const [index, item] of items.entries()) {
      if (!isDirectItemUuid(stringValue(item.uuid))) add('INVALID_ITEM_GRANT_UUID', `${path}/configuration/items/${index}/uuid`, 'ItemGrant configuration.items 必须直接使用模块或 dnd5e Compendium Item UUID，且终端 ID 为严格16位。');
    }
  }
  if (type === 'ItemChoice') {
    const pool = asArray<string>(configuration.pool);
    const choices = asRecord(configuration.choices);
    if (pool.length === 0 || Object.keys(choices).length === 0) add('EMPTY_OR_INVALID_ITEM_CHOICE', `${path}/configuration`, '每个持久 ItemChoice 必须有非空 pool 和 choices。');
    for (const [index, uuid] of pool.entries()) {
      if (!isDirectItemUuid(uuid)) add('INVALID_ITEM_CHOICE_UUID', `${path}/configuration/pool/${index}`, 'ItemChoice configuration.pool 必须直接使用模块或 dnd5e Compendium Item UUID，且终端 ID 为严格16位。');
    }
    for (const [level, choice] of Object.entries(choices)) {
      const candidate = asRecord(choice);
      if (!Number.isInteger(Number(level)) || typeof candidate.replacement !== 'boolean' || candidate.replacement !== true) add('ITEM_CHOICE_REPLACEMENT_MISMATCH', `${path}/configuration/choices/${level}`, 'ItemChoice 选择必须使用整数等级和 replacement:true。');
    }
  }
  if (type === 'Subclass') {
    const value = asRecord(advancement.value);
    if (!asRecord(advancement.configuration) || value.document !== null || value.uuid !== null) add('INVALID_SUBCLASS_ADVANCEMENT', path, 'Subclass 必须使用 dnd5e 5.3.3 的 configuration:{} / value:{document:null,uuid:null} 结构。');
  }
  if (type === 'AbilityScoreImprovement') validateAsiConfiguration(configuration, `${path}/configuration`, add);
  if (type === 'ScaleValue' && (!stringValue(configuration.identifier) || !stringValue(configuration.type) || Object.keys(asRecord(configuration.scale)).length === 0)) add('INVALID_SCALE_VALUE', `${path}/configuration`, 'ScaleValue 必须有 identifier、type 和非空 scale。');
  if (type === 'Trait' && (!stringValue(configuration.mode) || !Array.isArray(configuration.grants) || !Array.isArray(configuration.choices))) add('INVALID_TRAIT_ADVANCEMENT', `${path}/configuration`, 'Trait 必须有 mode、grants 和 choices。');
}

function validateClassDocument(item: NativeItemSource | undefined, path: string, add: AddFinding): void {
  const system = asRecord(item?.system);
  if (item?.type !== 'class' || system.identifier !== 'blood-hunter' || system.levels !== 1 || !stringValue(asRecord(system.description).value)) add('INCOMPLETE_CLASS_DOCUMENT', path, 'class 必须有 identifier、levels=1 和非空核心职业说明。');
  if (asRecord(system.hd).denomination !== 'd10' || !sameArray(asArray<string>(asRecord(system.primaryAbility).value), ['dex', 'int'])) add('CLASS_CORE_TRAITS_MISMATCH', path, 'class 必须有 d10 和 Dex+Int primary ability。');
  const startingEquipment = asArray<JsonObject>(system.startingEquipment);
  const roots = startingEquipment.filter((entry) => entry.type === 'AND' && entry.group === '');
  const rootId = stringValue(roots[0]?._id);
  const children = startingEquipment.filter((entry) => entry !== roots[0]);
  const linked = children.filter((entry) => entry.type === 'linked');
  const currency = children.filter((entry) => entry.type === 'currency');
  const validStartingEquipment = system.wealth === '155'
    && startingEquipment.length === 9
    && roots.length === 1
    && rootId !== undefined
    && children.length === 8
    && children.every((entry) => entry.group === rootId)
    && startingEquipment.every((entry) => entry.type !== 'OR')
    && linked.length === 7
    && currency.length === 1
    && currency[0]?.key === 'gp'
    && currency[0]?.count === 8;
  if (!validStartingEquipment) add('CLASS_STARTING_EQUIPMENT_MISMATCH', `${path}/system/startingEquipment`, '起始装备必须是唯一顶层 AND，七个 linked 与 8 GP 直接归组于该 root；155 GP 只由 system.wealth 表达。');
  const traits = Object.values(asRecord(system.advancement)).filter((advancement) => asRecord(advancement).type === 'Trait').map(asRecord);
  const hasTrait = (needle: string) => traits.some((trait) => asRecord(trait.configuration).grants && asArray<string>(asRecord(trait.configuration).grants).includes(needle));
  if (!hasTrait('saves:dex') || !hasTrait('saves:int') || !hasTrait('weapon:sim') || !hasTrait('weapon:mar') || !hasTrait('armor:lgt') || !hasTrait('armor:med') || !hasTrait('armor:shl') || !hasTrait('tool:alchemist')) add('CLASS_PROFICIENCY_TRAITS_MISMATCH', `${path}/system/advancement`, 'class 必须含 Dex/Int saves、轻/中甲/盾、简易/军用武器和炼金工具 Trait。');
  if (!traits.some((trait) => asArray<JsonObject>(asRecord(trait.configuration).choices).some((choice) => choice.count === 3 && asArray<string>(choice.pool).length === 8))) add('CLASS_SKILL_TRAIT_MISMATCH', `${path}/system/advancement`, 'class 必须有三项技能选择。');
}

function validateSubclassDocument(item: NativeItemSource, path: string, add: AddFinding): void {
  const system = asRecord(item.system);
  if (item.type !== 'subclass' || system.classIdentifier !== 'blood-hunter' || system.levels !== 1 || !stringValue(system.identifier) || !stringValue(asRecord(system.description).value)) add('INCOMPLETE_SUBCLASS_DOCUMENT', path, 'subclass 必须有 classIdentifier、levels、identifier 和非空 source container 描述。');
}

function validateFeaturePrerequisites(pkg: NativeBloodHunterPackage, add: AddFinding): void {
  const subclassIdentifiers = new Set(asArray<NativeItemSource>(pkg.subclasses).map((item) => stringValue(item.system.identifier)).filter((identifier): identifier is string => identifier !== undefined));
  for (const [index, item] of asArray<NativeItemSource>(pkg.features).entries()) {
    const path = `/features/${index}/system/prerequisites`;
    const prerequisites = asRecord(item.system.prerequisites);
    const items = asArray<string>(prerequisites.items);
    const level = prerequisites.level;
    if (!Array.isArray(prerequisites.items)
      || items.some((identifier) => !stringValue(identifier) || !subclassIdentifiers.has(identifier))
      || new Set(items).size !== items.length
      || level !== null && (!Number.isInteger(level) || Number(level) < 1)
      || prerequisites.repeatable !== false) {
      add('INVALID_FEAT_PREREQUISITES', path, 'feat prerequisites 必须是有效 subclass identifiers 的无重复 items 数组、整数或 null level，以及 repeatable:false。');
    }

    const metadata = bloodHunterMetadata(item);
    const projection = asRecord(metadata.prerequisiteProjection);
    const synthetic = asRecord(metadata.synthetic);
    if (stringValue(synthetic.origin)) continue;
    if (typeof projection.sourcePresent !== 'boolean' || !/^[a-f0-9]{64}$/.test(String(projection.sourceHash ?? '')) || Object.keys(asRecord(projection.projected)).length === 0) {
      add('MISSING_SOURCE_PREREQUISITE_CONTRACT', `/features/${index}/flags/fvttJsonGenerator/bloodHunter2024/prerequisiteProjection`, '每个源 canonical feat 必须记录其 prerequisite 投影契约。');
      continue;
    }
    const projected = asRecord(projection.projected);
    if (sha256(prerequisites) !== sha256(projected)
      || projection.sourcePresent === true && asArray(projected.items).length === 0 && projected.level === null) {
      add('SOURCE_PREREQUISITE_DROPPED', path, '源 prerequisite 必须完整保留为对应 subclass identifier、原等级和 repeatable:false。');
    }
  }
}

function validateReference(reference: NativeReferenceContract, path: string, documents: ReadonlyMap<string, NativeItemSource>, add: AddFinding): void {
  if (!stringValue(reference.referenceKey) || reference.classification !== 'native' || reference.resolution !== 'direct-uuid' || !isStrictId(reference.targetDocumentId) || !stringValue(reference.uuid) || !['module', 'dnd5e'].includes(reference.source)) add('INVALID_REFERENCE_CONTRACT', path, 'reference 必须是直接 UUID native contract，并含严格16位 terminal document id。');
  const moduleMatch = MODULE_UUID.exec(reference.uuid ?? '');
  const dnd5eMatch = DND5E_UUID.exec(reference.uuid ?? '');
  if (!moduleMatch && !dnd5eMatch) add('INVALID_REFERENCE_UUID', `${path}/uuid`, 'reference UUID 必须是模块或 dnd5e Compendium Item UUID。');
  const terminalId = moduleMatch?.[2] ?? dnd5eMatch?.[1];
  if (terminalId !== reference.targetDocumentId) add('REFERENCE_ID_MISMATCH', path, 'reference.targetDocumentId 必须等于 UUID 的16位 terminal id。');
  if (reference.source === 'module') {
    const target = documents.get(reference.targetDocumentId);
    if (!target || reference.uuid !== moduleUuidFor(target)) add('DANGLING_NATIVE_REFERENCE', path, '模块 reference 必须直接指向 package 内 document 的正确 pack UUID。');
  }
  if (reference.source === 'dnd5e' && !dnd5eMatch) add('DND5E_REFERENCE_MISMATCH', path, 'dnd5e reference 必须使用 Compendium.dnd5e.*.Item.<16-id>。');
}

function validateGraphPersistence(node: GrantGraphNode, advancement: JsonObject, path: string, add: AddFinding): void {
  const configuration = asRecord(advancement.configuration);
  const referenced = node.references.map((reference) => reference.uuid).sort();
  if (node.type === 'ItemGrant') {
    const persisted = asArray<JsonObject>(configuration.items).map((item) => String(item.uuid)).sort();
    if (!sameArray(persisted, referenced)) add('ITEM_GRANT_GRAPH_MISMATCH', path, 'ItemGrant configuration.items 必须与 graph 的直接 UUID references 完全一致。');
  }
  if (node.type === 'ItemChoice') {
    const persisted = asArray<string>(configuration.pool).map(String).sort();
    if (!sameArray(persisted, referenced)) add('ITEM_CHOICE_GRAPH_MISMATCH', path, 'ItemChoice configuration.pool 必须与 graph 的直接 UUID references 完全一致。');
  }
  if (node.type === 'AbilityScoreImprovement' && node.references.length > 0 && asRecord(advancement.configuration).recommendation !== node.references[0]?.uuid) add('ASI_GRAPH_MISMATCH', path, 'Epic Boon 的 recommendation 必须与其直接 dnd5e UUID reference 一致。');
}

function validateExpectedPools(pkg: NativeBloodHunterPackage, graph: GrantGraphNode[], add: AddFinding): void {
  const expectedPools: Array<[string, number]> = [['血咒', 14], ['猩红仪式', 7], ['诱变剂配方', 21]];
  for (const [title, count] of expectedPools) {
    const node = graph.find((candidate) => candidate.type === 'ItemChoice' && advancementTitle(pkg, candidate) === title);
    if (!node || node.references.length !== count || node.references.some((reference) => reference.source !== 'module')) add('OPTION_POOL_MISMATCH', '/grantGraph', `${title} ItemChoice 必须含 ${count} 个 canonical 模块 UUID references。`);
  }
}

function validateSubclassGrants(pkg: NativeBloodHunterPackage, graph: GrantGraphNode[], advancements: ReadonlyMap<string, { item: NativeItemSource; advancement: JsonObject }>, add: AddFinding): void {
  for (const subclass of asArray<NativeItemSource>(pkg.subclasses)) {
    const nodes = graph.filter((node) => node.ownerDocumentId === subclass._id && node.type === 'ItemGrant');
    for (const level of [3, 7, 11, 15, 18]) {
      const node = nodes.find((candidate) => candidate.level === level);
      const itemCount = node ? asArray<JsonObject>(asRecord(advancements.get(node.id)?.advancement.configuration).items).length : 0;
      if (!node || itemCount === 0) add('SUBCLASS_GRANT_LEVEL_MISMATCH', `/subclasses/${subclass._id}/system/advancement`, `${subclass.name} 在 ${level} 级必须有非空、真实的 ItemGrant。`);
      if (node && node.references.some((reference) => {
        const target = pkg.features.find((feature) => feature._id === reference.targetDocumentId);
        const identity = asRecord(asRecord(asRecord(asRecord(target?.flags).fvttJsonGenerator).bloodHunter2024).sourceIdentity);
        const subclassIdentity = asRecord(asRecord(asRecord(asRecord(subclass.flags).fvttJsonGenerator).bloodHunter2024).sourceIdentity);
        return identity.subclassShortName !== undefined && identity.subclassShortName !== subclassIdentity.subclassShortName;
      })) add('CROSS_SUBCLASS_GRANT', `/grantGraph/${node.id}`, `${subclass.name} 不得授予其他子职特性。`);
    }
  }
}

function validateSemanticAdvancements(pkg: NativeBloodHunterPackage, advancements: ReadonlyMap<string, { item: NativeItemSource; advancement: JsonObject }>, add: AddFinding): void {
  const classItem = pkg.classes[0];
  if (!classItem) return;
  const classAdvancements = Object.values(asRecord(classItem.system.advancement)).map(asRecord);
  for (const advancement of classAdvancements.filter((candidate) => candidate.type === 'AbilityScoreImprovement')) validateAsiConfiguration(asRecord(advancement.configuration), '/classes/0/system/advancement', add);
  const mastery = classAdvancements.find((candidate) => candidate.type === 'Trait' && candidate.title === '武器精通');
  const masteryConfiguration = asRecord(mastery?.configuration);
  if (!mastery || masteryConfiguration.mode !== 'mastery' || asArray<JsonObject>(masteryConfiguration.choices)[0]?.count !== 2 || !asArray<string>(asArray<JsonObject>(masteryConfiguration.choices)[0]?.pool).includes('weapon:*')) add('WEAPON_MASTERY_SCHEMA_MISMATCH', '/classes/0/system/advancement', '武器精通必须是 Trait/mastery，count 2，pool weapon:*。');
  const fighting = classAdvancements.find((candidate) => candidate.type === 'ItemChoice' && candidate.title === '战斗风格');
  const fightingPool = asArray<string>(asRecord(fighting?.configuration).pool);
  if (!fighting || FIGHTING_STYLE_UUIDS.some((uuid) => !fightingPool.includes(uuid)) || !fightingPool.some((uuid) => MODULE_UUID.test(uuid))) add('FIGHTING_STYLE_SCHEMA_MISMATCH', '/classes/0/system/advancement', '战斗风格必须有四个锁定 official UUID 和 synthetic 模块 feat。');
  const boon = classAdvancements.find((candidate) => candidate.type === 'AbilityScoreImprovement' && candidate.title === '传奇恩惠');
  const boonConfiguration = asRecord(boon?.configuration);
  if (!boon || boonConfiguration.recommendation !== EPIC_BOON_UUID || boonConfiguration.points !== 2 || boonConfiguration.cap !== 2 || boonConfiguration.max !== null) add('EPIC_BOON_SCHEMA_MISMATCH', '/classes/0/system/advancement', '传奇恩惠必须使用 points2/cap2/max null 和精确推荐 UUID。');
  const synthetic = pkg.features.find((item) => item.name === '诱变武者');
  if (!synthetic || !stringValue(asRecord(bloodHunterMetadata(synthetic).synthetic).origin) || bloodHunterMetadata(synthetic).automation !== 'assisted') add('MUTAGENIC_WARRIOR_SYNTHETIC_MISMATCH', '/features', '诱变武者必须是带来源和辅助边界的稳定 synthetic feat。');
  const profaneSoul = pkg.subclasses.find((item) => item.name === '渎魂结社');
  if (!profaneSoul || !String(asRecord(profaneSoul.system.description).value ?? '').includes('契约魔法（GM 辅助）') || Object.values(asRecord(profaneSoul.system.advancement)).filter((advancement) => asRecord(advancement).type === 'ScaleValue').length !== 4) add('PACT_MAGIC_BOUNDARY_MISMATCH', '/subclasses/渎魂结社', '契约魔法必须在渎魂 subclass 以可见四个 ScaleValue 和 assisted boundary 表达完整血猎手等级表。');
  const corrosion = pkg.features.find((item) => item.name === '腐蚀血咒');
  if (corrosion && corrosion.effects.some((effect) => asRecord(asRecord(effect).duration).expiry === 'sourceEnd')) add('CORROSION_EXPIRY_MISMATCH', '/features', '腐蚀血咒不得使用 sourceEnd 自动结束。');
  for (const name of ['升腾', '幻惑']) {
    const item = pkg.features.find((candidate) => candidate.name === name);
    if (item && asArray<JsonObject>(item.effects).some((effect) => asRecord(asRecord(effect).duration).seconds !== 3600)) add('MUTAGEN_DURATION_MISMATCH', `/features/${name}`, `${name} 的 Effect 必须明确 seconds=3600。`);
  }
  const mobile = pkg.features.find((item) => item.name === '灵活移动');
  if (mobile && bloodHunterMetadata(mobile).automation !== 'assisted') add('MOBILE_ASSISTANCE_MISMATCH', '/features/灵活移动', '灵活移动的11级麻痹免疫必须保持 assisted。');
  const hybrid = pkg.features.find((item) => item.name === '混种变形');
  if (hybrid && (!stringValue(asRecord(hybrid.system.uses).max) || bloodHunterMetadata(hybrid).automation !== 'assisted')) add('HYBRID_USES_MISMATCH', '/features/混种变形', '混种变形必须有明确 uses 且18级无限边界标为 assisted。');
  const mastery20 = pkg.features.find((item) => item.name === '胸有成竹');
  if (mastery20 && bloodHunterMetadata(mastery20).automation !== 'assisted') add('SANGUINE_MASTERY_ASSISTANCE_MISMATCH', '/features/胸有成竹', '胸有成竹的跨 Item 短休恢复必须保持 assisted。');
  const dawn = pkg.features.filter((item) => item.name === '破晓血仪');
  if (dawn.length !== 1 || Object.keys(asRecord(dawn[0]?.system.activities)).length !== 5 || asArray<JsonObject>(dawn[0]?.effects).length !== 2) add('DUSK_RITE_CANONICAL_MISMATCH', '/features/破晓血仪', '破晓血仪必须只有一个 canonical feat、5 Activity、2 Effect。');
}

function validateCoverageLedger(
  pkg: NativeBloodHunterPackage,
  ids: ReadonlySet<string>,
  graphIds: ReadonlySet<string>,
  advancements: ReadonlyMap<string, { item: NativeItemSource; advancement: JsonObject }>,
  documents: ReadonlyMap<string, NativeItemSource>,
  add: AddFinding,
): void {
  for (const [index, entry] of asArray<BloodHunterCoverageLedgerEntry>(pkg.coverageLedger).entries()) {
    const path = `/coverageLedger/${index}`;
    if (!stringValue(entry.sourceKey) || !stringValue(entry.textHash)) add('INVALID_COVERAGE_IDENTITY', path, 'coverage ledger 必须有 sourceKey 与 textHash。');
    const locator = asRecord(entry.sourceLocator);
    if (!['classFeature', 'subclassFeature', 'optionalfeature'].includes(String(locator.group)) || !Number.isInteger(locator.index) || Number(locator.index) < 0 || locator.sourceKey !== entry.sourceKey) add('INVALID_COVERAGE_SOURCE_LOCATOR', `${path}/sourceLocator`, 'coverage sourceLocator 必须稳定记录 group/index/sourceKey。');
    const sourceText = asRecord(entry.sourceText);
    if (!stringValue(sourceText.summary) || !/^[a-f0-9]{64}$/.test(String(sourceText.renderedHash ?? ''))) add('INVALID_COVERAGE_SOURCE_TEXT', `${path}/sourceText`, 'coverage 必须有有界可读源摘要与 rendered text hash。');
    if (!stringValue(entry.canonicalDocumentId) && !stringValue(entry.advancementId) && !entry.grant?.containerRoute) add('ORPHAN_COVERAGE', path, 'coverage ledger 必须映射到 document、advancement 或明确 container route。');
    if (entry.canonicalDocumentId && (!isStrictId(entry.canonicalDocumentId) || !ids.has(entry.canonicalDocumentId))) add('DANGLING_COVERAGE_DOCUMENT', `${path}/canonicalDocumentId`, 'coverage document 不存在或 id 非法。');
    if (entry.advancementId && (!isStrictId(entry.advancementId) || !graphIds.has(entry.advancementId))) add('DANGLING_COVERAGE_ADVANCEMENT', `${path}/advancementId`, 'coverage advancement 不存在或 id 非法。');
    if (!entry.grant || !ids.has(entry.grant.ownerDocumentId) || !Number.isInteger(entry.grant.level)) add('INVALID_COVERAGE_GRANT', `${path}/grant`, 'coverage grant owner/level 无效。');
    if (entry.grant?.containerRoute) {
      const route = entry.grant.containerRoute;
      if (route.kind !== 'subclass-level-grants' || route.ownerDocumentIds.length !== 4 || route.advancementIds.length !== 4 || route.ownerDocumentIds.some((id) => !isStrictId(id) || !ids.has(id)) || route.advancementIds.some((id) => !isStrictId(id) || !graphIds.has(id) || asArray<JsonObject>(asRecord(advancements.get(id)?.advancement.configuration).items).length === 0)) add('INVALID_CONTAINER_ROUTE', `${path}/grant/containerRoute`, 'class subclass-feature container 必须路由到四个真实、非空子职 ItemGrant。');
    }
    if (!['automatic', 'assisted', 'native', 'external-rule'].includes(entry.automation)) add('INVALID_COVERAGE_AUTOMATION', `${path}/automation`, 'automation 分类无效。');
    validateCoverageMechanics(entry, path, entry.canonicalDocumentId ? documents.get(entry.canonicalDocumentId) : undefined, add);
    const semanticSummary = asRecord(entry.semanticSummary);
    if (!['document-mechanics', 'passive-document', 'advancement', 'container'].includes(String(semanticSummary.kind))
      || !stringValue(semanticSummary.summary)
      || !['automatic', 'assisted', 'native', 'external-rule'].includes(String(semanticSummary.classification))
      || !stringValue(semanticSummary.boundary)) add('INVALID_COVERAGE_SEMANTIC_SUMMARY', `${path}/semanticSummary`, '每条 ledger 必须有非空、可审查的 document/passive/advancement/container 语义摘要。');
    if (!entry.review || !['pass', 'adjusted', 'assisted'].includes(entry.review.status) || !stringValue(entry.review.notes) || entry.review.notes === entry.unautomatedBoundary) add('INVALID_COVERAGE_REVIEW', `${path}/review`, '每条 ledger 必须有非空且独立的语义 review/status/notes，不能只复制自动化通用句。');
  }
}

function validateCoverageMechanics(entry: BloodHunterCoverageLedgerEntry, path: string, document: NativeItemSource | undefined, add: AddFinding): void {
  const activities = asRecord(entry.activities);
  const activityIds = asArray<string>(activities.ids);
  const activitySemantics = asArray<JsonObject>(activities.semantics);
  const actualActivities = asRecord(document?.system.activities);
  const actualActivityIds = Object.keys(actualActivities).sort();
  if (!Number.isInteger(activities.count)
    || activities.count !== activityIds.length
    || activities.count !== activitySemantics.length
    || !sameStringSet(activityIds, activitySemantics.map((semantic) => String(semantic.id)))
    || !sameStringSet(activityIds, actualActivityIds)) add('COVERAGE_ACTIVITY_SEMANTICS_MISMATCH', `${path}/activities`, 'Activity count、ids、semantics 与 canonical document 必须完全一致。');
  if (activities.passive !== (activityIds.length === 0) || activityIds.length === 0 && !stringValue(activities.noActivityRationale)) add('INVALID_COVERAGE_PASSIVE_ACTIVITY', `${path}/activities`, 'A0 条目必须 passive:true 并给出 no-activity rationale；有 Activity 时 passive 必须为 false。');

  const effects = asRecord(entry.effects);
  const effectIds = asArray<string>(effects.ids);
  const effectSemantics = asArray<JsonObject>(effects.semantics);
  const actualEffects = asArray<JsonObject>(document?.effects);
  const actualEffectIds = actualEffects.map((effect) => String(effect._id)).sort();
  if (!Number.isInteger(effects.count)
    || effects.count !== effectIds.length
    || effects.count !== effectSemantics.length
    || !sameStringSet(effectIds, effectSemantics.map((semantic) => String(semantic.id)))
    || !sameStringSet(effectIds, actualEffectIds)) add('COVERAGE_EFFECT_SEMANTICS_MISMATCH', `${path}/effects`, 'Effect count、ids、semantics 与 canonical document 必须完全一致。');
  if (effects.passive !== (effectIds.length === 0) || effectIds.length === 0 && !stringValue(effects.noEffectRationale)) add('INVALID_COVERAGE_PASSIVE_EFFECT', `${path}/effects`, 'E0 条目必须 passive:true 并给出 no-effect rationale；有 Effect 时 passive 必须为 false。');

  for (const [semanticIndex, semantic] of activitySemantics.entries()) {
    const semanticPath = `${path}/activities/semantics/${semanticIndex}`;
    if (!isStrictId(semantic.id) || !stringValue(semantic.name) || !stringValue(semantic.type)
      || !['automatic', 'assisted', 'native', 'external-rule'].includes(String(semantic.classification)) || !stringValue(semantic.boundary)
      || !['activation', 'range', 'target', 'duration', 'uses', 'consumption', 'save', 'damage', 'healing', 'formula', 'effectIds'].every((key) => key in semantic)
      || !Array.isArray(semantic.effectIds)) add('INVALID_COVERAGE_ACTIVITY_SEMANTIC', semanticPath, '每个 Activity semantic 必须含完整机械字段、classification 与 boundary。');
    const actual = asRecord(actualActivities[String(semantic.id)]);
    const actualReferences = asArray<JsonObject>(actual.effects).map((reference) => String(reference._id)).sort();
    const semanticReferences = asArray<string>(semantic.effectIds).map(String).sort();
    if (!sameArray(actualReferences, semanticReferences) || semanticReferences.some((id) => !effectIds.includes(id))) add('COVERAGE_ACTIVITY_EFFECT_REFERENCE_MISMATCH', `${semanticPath}/effectIds`, 'Activity semantic effectIds 必须与 canonical Activity 引用及 ledger Effect ids 一致。');
  }

  for (const [semanticIndex, semantic] of effectSemantics.entries()) {
    const semanticPath = `${path}/effects/semantics/${semanticIndex}`;
    if (!isStrictId(semantic.id) || !stringValue(semantic.name) || !stringValue(semantic.type)
      || typeof semantic.transfer !== 'boolean' || typeof semantic.disabled !== 'boolean'
      || !Array.isArray(semantic.changes) || !Array.isArray(semantic.statuses)
      || !['automatic', 'assisted', 'native', 'external-rule'].includes(String(semantic.classification)) || !stringValue(semantic.boundary)) add('INVALID_COVERAGE_EFFECT_SEMANTIC', semanticPath, '每个 Effect semantic 必须含身份、状态、duration、changes、classification 与 boundary。');
    const actual = actualEffects.find((effect) => effect._id === semantic.id);
    const actualChanges = asArray<JsonObject>(actual?.changes).map((change) => `${String(change.key)}\u0000${String(change.mode)}\u0000${String(change.value ?? '')}`).sort();
    const semanticChanges = asArray<JsonObject>(semantic.changes).map((change, changeIndex) => {
      const mode = Number(change.mode);
      if (!stringValue(change.key) || !Number.isInteger(mode) || mode < 0 || mode > 5 || change.modeLabel !== ACTIVE_EFFECT_MODE_LABELS[mode] || typeof change.value !== 'string') add('INVALID_COVERAGE_EFFECT_CHANGE_SEMANTIC', `${semanticPath}/changes/${changeIndex}`, 'Effect change semantic 必须记录 key、numeric mode、modeLabel 与 value。');
      return `${String(change.key)}\u0000${String(change.mode)}\u0000${String(change.value ?? '')}`;
    }).sort();
    if (!sameArray(actualChanges, semanticChanges)) add('COVERAGE_EFFECT_CHANGE_MISMATCH', `${semanticPath}/changes`, 'Effect semantic changes 必须与 canonical Effect 完全一致。');
  }
}

function validateActivitySummary(pkg: NativeBloodHunterPackage, documents: NativeItemSource[], add: AddFinding): void {
  const summary = pkg.activitySummary;
  const activityIds = documents.flatMap((item) => Object.keys(asRecord(item.system.activities)));
  if (!summary || !Number.isInteger(summary.sourceActivityCount) || !Number.isInteger(summary.canonicalActivityCount) || !Number.isInteger(summary.deduplicatedActivityCount) || !stringValue(summary.differenceReason)) add('INVALID_ACTIVITY_SUMMARY', '/activitySummary', '必须记录 source/canonical/deduplicated Activity 计数和差异原因。');
  else if (summary.canonicalActivityCount !== activityIds.length || summary.deduplicatedActivityCount !== new Set(activityIds).size) add('ACTIVITY_SUMMARY_MISMATCH', '/activitySummary', 'Activity summary 必须与实际 canonical documents 一致。');
}

function validateAsiConfiguration(configuration: JsonObject, path: string, add: AddFinding): void {
  if (configuration.cap !== 2 || configuration.points !== 2 || configuration.max !== null || !Array.isArray(configuration.locked) || !ABILITIES.every((ability) => asRecord(configuration.fixed)[ability] === 0) || !('recommendation' in configuration)) add('ASI_SCHEMA_MISMATCH', path, 'AbilityScoreImprovement 必须包含六属性0、points2、cap2、locked[]、recommendation 和 max:null。');
}

function advancementTitle(pkg: NativeBloodHunterPackage, node: GrantGraphNode): string | undefined {
  const item = [...pkg.classes, ...pkg.subclasses].find((candidate) => candidate._id === node.ownerDocumentId);
  return stringValue(asRecord(asRecord(asRecord(item?.system).advancement)[node.id]).title);
}

function moduleUuidFor(item: NativeItemSource): string {
  const pack = item.type === 'class' ? 'classes' : item.type === 'subclass' ? 'subclasses' : 'features';
  return `Compendium.${BLOOD_HUNTER_MODULE_ID}.${pack}.Item.${item._id}`;
}

function bloodHunterMetadata(item: NativeItemSource): JsonObject { return asRecord(asRecord(asRecord(item.flags).fvttJsonGenerator).bloodHunter2024); }
function isStrictId(value: unknown): value is string { return typeof value === 'string' && STRICT_ID.test(value); }
function isDirectItemUuid(value: unknown): boolean { return typeof value === 'string' && (MODULE_UUID.test(value) || DND5E_UUID.test(value)); }
function sameStringSet(left: readonly string[], right: readonly string[]): boolean { return sameArray([...left].sort(), [...right].sort()); }
function sameArray(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
type AddFinding = (code: string, path: string, message: string) => void;
