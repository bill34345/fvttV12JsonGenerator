import { asArray, asRecord, clone, htmlFromEntries, normalizeName, sha256, stableId, stringValue } from './internals';
import { BLOOD_HUNTER_MODULE_ID, BLOOD_HUNTER_MODULE_VERSION } from './constants';
import {
  BLOOD_HUNTER_CLASS_NAME,
  BLOOD_HUNTER_SOURCE,
  EXPECTED_BLOOD_HUNTER_SOURCE_SHA256,
  assertBloodHunterSourceBytes,
  collectBloodHunterFeatures,
  identityForFeature,
  itemIdForSourceKey,
  sourceKeyForDocument,
  validateBloodHunterEnrichedSource,
  type CollectedBloodHunterFeature,
} from './source';
import { validateNativeBloodHunterPackage } from './validator';
import type {
  BloodHunterAutomation,
  CoverageActivitySemantic,
  CoverageEffectSemantic,
  CoverageSemanticSummary,
  BloodHunterCoverageLedgerEntry,
  BloodHunterEnrichedSource,
  BloodHunterFeatureGroup,
  BloodHunterSideData,
  BloodHunterV14CompileOptions,
  BloodHunterV14CompileTarget,
  GrantGraphNode,
  GrantMode,
  GrantType,
  JsonObject,
  NativeBloodHunterPackage,
  NativeItemSource,
  NativeReferenceContract,
} from './types';

export { BLOOD_HUNTER_MODULE_ID, BLOOD_HUNTER_MODULE_VERSION } from './constants';
export const BLOOD_HUNTER_V14_TARGET: BloodHunterV14CompileTarget = {
  foundry: '14.364',
  dnd5e: '5.3.3',
  effectProfile: 'modded-v14',
};

const ITEM_ICON = 'icons/svg/book.svg';
const CLASS_IDENTIFIER = 'blood-hunter';
const DUSK_RITE_ENGLISH = 'Rite of the Dawn';
const MODULE_PACKS = { class: 'classes', subclass: 'subclasses', feat: 'features' } as const;
const ASI_FIXED = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 } as const;
const FIGHTING_STYLE_UUIDS = [
  'Compendium.dnd5e.feats24.Item.phbfstArchery000',
  'Compendium.dnd5e.feats24.Item.phbfstDefense000',
  'Compendium.dnd5e.feats24.Item.phbfstGreatWeapo',
  'Compendium.dnd5e.feats24.Item.phbfstTwoWeaponF',
] as const;
const EPIC_BOON_UUID = 'Compendium.dnd5e.feats24.Item.phbBoonofTruesig';

interface Destination {
  canonicalDocumentId?: string;
  advancementId?: string;
  ownerDocumentId: string;
  level: number;
  mode: GrantMode;
  automation: BloodHunterAutomation;
  containerRoute?: {
    kind: 'subclass-level-grants';
    ownerDocumentIds: string[];
    advancementIds: string[];
  };
}

interface AdvanceOptions {
  value?: JsonObject;
  hint?: string;
  classRestriction?: 'primary' | 'secondary';
}

/**
 * Backward-compatible object compile. Callers that need source provenance must
 * use the second overload so the original UTF-8 bytes are checked before parse.
 */
export function compileBloodHunterV14Package(source: BloodHunterEnrichedSource): NativeBloodHunterPackage;
export function compileBloodHunterV14Package(options: BloodHunterV14CompileOptions): NativeBloodHunterPackage;
export function compileBloodHunterV14Package(input: BloodHunterEnrichedSource | BloodHunterV14CompileOptions): NativeBloodHunterPackage {
  const { source, sourceSha256 } = resolveCompileInput(input);
  const sourceValidation = validateBloodHunterEnrichedSource(source);
  if (!sourceValidation.ok) throw new Error(`BloodHunter2024 source 被拒绝: ${sourceValidation.findings.map((finding) => finding.code).join(', ')}`);

  const collected = collectBloodHunterFeatures(source);
  const classEntry = source.class[0]!;
  const classId = itemIdForSourceKey('class', sourceKeyForDocument('class', classEntry));
  const subclassItems = source.subclass
    .map((entry) => buildSubclassDocument(entry, source))
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const subclassIdByShortName = new Map(source.subclass.map((entry) => [entry.shortName!, itemIdForSourceKey('subclass', sourceKeyForDocument('subclass', entry))]));
  const subclassIdentifierBySourceName = new Map<string, string>();
  for (const sourceSubclass of source.subclass) {
    const itemId = itemIdForSourceKey('subclass', sourceKeyForDocument('subclass', sourceSubclass));
    const item = subclassItems.find((candidate) => candidate._id === itemId);
    const identifier = stringValue(item?.system.identifier);
    if (!identifier) throw new Error(`subclass 缺少 canonical identifier: ${sourceSubclass.name}`);
    for (const sourceName of [sourceSubclass.name, sourceSubclass.ENG_name]) {
      if (sourceName) subclassIdentifierBySourceName.set(sourceName, identifier);
    }
  }

  const canonicalFeatures: NativeItemSource[] = [];
  const canonicalIdBySourceKey = new Map<string, string>();
  const sourceAliases = new Map<string, string[]>();
  const duskOptional = collected.find((feature) => feature.group === 'optionalfeature' && isDuskRite(feature));
  if (!duskOptional) throw new Error('BloodHunter2024 source 缺少 canonical 破晓血仪 optionalfeature。');

  for (const feature of collected) {
    if (isContainerFeature(feature)) continue;
    if (feature.group === 'subclassFeature' && isDuskRite(feature)) continue;
    const id = itemIdForSourceKey('feat', feature.sourceKey);
    canonicalIdBySourceKey.set(feature.sourceKey, id);
    canonicalFeatures.push(buildFeatureDocument(feature, id, subclassIdentifierBySourceName));
  }
  const duskId = canonicalIdBySourceKey.get(duskOptional.sourceKey);
  if (!duskId) throw new Error('破晓血仪 canonical document 未生成。');
  for (const feature of collected.filter((candidate) => candidate.group === 'subclassFeature' && isDuskRite(candidate))) {
    canonicalIdBySourceKey.set(feature.sourceKey, duskId);
    sourceAliases.set(duskId, [...(sourceAliases.get(duskId) ?? []), feature.sourceKey]);
  }

  const mutagenicWarrior = buildMutagenicWarriorDocument();
  canonicalFeatures.push(mutagenicWarrior);
  for (const item of canonicalFeatures) {
    const metadata = bloodHunterMetadata(item);
    const aliases = sourceAliases.get(item._id);
    if (aliases?.length) metadata.sourceAliases = aliases;
  }

  const classItem = buildClassDocument(classEntry, classId, source);
  const itemsById = new Map<string, NativeItemSource>([
    [classItem._id, classItem] as const,
    ...subclassItems.map((item) => [item._id, item] as const),
    ...canonicalFeatures.map((item) => [item._id, item] as const),
  ]);
  const pactMagic = collected.find((feature) => feature.group === 'subclassFeature' && isPactMagic(feature));
  const profaneSoulId = subclassIdByShortName.get('渎魂');
  if (!pactMagic || !profaneSoulId) throw new Error('缺少渎魂契约魔法 source/subclass。');
  const profaneSoul = itemsById.get(profaneSoulId)!;
  const profaneDescription = asRecord(profaneSoul.system.description);
  profaneDescription.value = `${String(profaneDescription.value ?? '')}<hr><h3>契约魔法（GM 辅助）</h3>${decorateFeatureDescription(pactMagic, htmlFromEntries(pactMagic.entry.entries))}`;
  profaneSoul.system.description = profaneDescription;
  addPactMagicScales(profaneSoul.system);
  const graph: GrantGraphNode[] = [];
  const destinations = new Map<string, Destination>();
  const subclassGrantIds = new Map<string, Map<number, string>>();

  const addAdvancement = (
    owner: NativeItemSource,
    type: GrantType,
    level: number,
    title: string,
    configuration: JsonObject,
    mode: GrantMode,
    references: NativeReferenceContract[],
    options: AdvanceOptions = {},
  ): string => {
    const id = stableId('advancement', owner._id, type, String(level), title, sha256(configuration), sha256(references));
    putAdvancement(owner, id, type, level, title, configuration, options);
    graph.push({ id, ownerDocumentId: owner._id, ownerKind: owner.type === 'class' ? 'class' : 'subclass', level, type, mode, references: clone(references) });
    return id;
  };

  addClassTraits(classItem, addAdvancement);
  for (const scale of asArray<JsonObject>(source.foundryClass?.[0]?.advancement)) {
    const configuration = clone(asRecord(scale.configuration));
    if (!asRecord(configuration.distance).units) configuration.distance = { units: '' };
    const title = stringValue(scale.title) ?? 'Blood Hunter Scale';
    addAdvancement(classItem, 'ScaleValue', 1, title, configuration, 'native', []);
  }
  if (graph.filter((node) => node.ownerDocumentId === classId && node.type === 'ScaleValue').length === 0) {
    throw new Error('BloodHunter2024 缺少 ScaleValue advancement。');
  }

  // Fixed source features share one concrete ItemGrant per owner + level.
  for (const [level, features] of groupFixedFeatures(collected, 'classFeature', canonicalIdBySourceKey)) {
    const references = features.map((feature) => nativeReference(itemsById.get(canonicalIdBySourceKey.get(feature.sourceKey)!)!, feature.entry.name));
    const advancementId = addAdvancement(classItem, 'ItemGrant', level, '职业特性', itemGrantConfiguration(references), 'grant', references);
    for (const feature of features) {
      const documentId = canonicalIdBySourceKey.get(feature.sourceKey)!;
      destinations.set(feature.sourceKey, destination(documentId, advancementId, classId, level, 'grant', automationForItem(itemsById.get(documentId)!)));
    }
  }

  const mutantId = subclassIdByShortName.get('突变');
  if (!mutantId) throw new Error('缺少突变子职 document。');
  const bloodCurseReferences = optionalReferencesByType(collected, 'BC', canonicalIdBySourceKey, itemsById);
  const riteReferences = optionalReferencesByType(collected, 'CR', canonicalIdBySourceKey, itemsById);
  const mutagenReferences = optionalReferencesByType(collected, 'MTGN', canonicalIdBySourceKey, itemsById);
  if (bloodCurseReferences.length !== 14 || riteReferences.length !== 7 || mutagenReferences.length !== 21) {
    throw new Error(`optional pools drifted: BC=${bloodCurseReferences.length}, CR=${riteReferences.length}, MTGN=${mutagenReferences.length}`);
  }
  const bloodCurseChoice = addAdvancement(classItem, 'ItemChoice', 1, '血咒', itemChoiceConfiguration(choiceDeltas(source, 'BC'), bloodCurseReferences), 'choice', bloodCurseReferences);
  const riteChoice = addAdvancement(classItem, 'ItemChoice', 2, '猩红仪式', itemChoiceConfiguration(choiceDeltas(source, 'CR'), riteReferences), 'choice', riteReferences);
  const mutagenChoice = addAdvancement(itemsById.get(mutantId)!, 'ItemChoice', 3, '诱变剂配方', itemChoiceConfiguration({ 3: 4, 7: 1, 11: 1, 15: 1, 18: 1 }, mutagenReferences), 'choice', mutagenReferences);

  for (const feature of collected.filter((candidate) => candidate.group === 'classFeature' && !canonicalIdBySourceKey.has(candidate.sourceKey))) {
    if (isSubclassSelector(feature)) {
      const references = subclassItems.map((item) => nativeReference(item, item.name));
      const advancementId = addAdvancement(classItem, 'Subclass', feature.entry.level!, feature.entry.name, {}, 'choice', references, { value: { document: null, uuid: null } });
      destinations.set(feature.sourceKey, destination(undefined, advancementId, classId, feature.entry.level!, 'choice', 'native'));
      continue;
    }
    if (isAsi(feature)) {
      const advancementId = addAdvancement(classItem, 'AbilityScoreImprovement', feature.entry.level!, feature.entry.name, asiConfiguration(null), 'choice', []);
      destinations.set(feature.sourceKey, destination(undefined, advancementId, classId, feature.entry.level!, 'choice', 'native'));
      continue;
    }
    if (isEpicBoon(feature)) {
      const reference = dnd5eReference(EPIC_BOON_UUID, 'Blood Hunter level 19 epic boon recommendation');
      const advancementId = addAdvancement(classItem, 'AbilityScoreImprovement', feature.entry.level!, feature.entry.name, asiConfiguration(EPIC_BOON_UUID), 'choice', [reference]);
      destinations.set(feature.sourceKey, destination(undefined, advancementId, classId, feature.entry.level!, 'choice', 'native'));
      continue;
    }
    if (isWeaponMastery(feature)) {
      const configuration = { mode: 'mastery', allowReplacements: false, grants: [], choices: [{ count: 2, pool: ['weapon:*'] }] };
      const advancementId = addAdvancement(classItem, 'Trait', feature.entry.level!, feature.entry.name, configuration, 'native', [], { value: { chosen: [] }, classRestriction: 'primary' });
      destinations.set(feature.sourceKey, destination(undefined, advancementId, classId, feature.entry.level!, 'native', 'native'));
      continue;
    }
    if (isFightingStyle(feature)) {
      const references = [
        ...FIGHTING_STYLE_UUIDS.map((uuid) => dnd5eReference(uuid, 'Blood Hunter fighting style option')),
        nativeReference(mutagenicWarrior, 'Blood Hunter custom Mutagenic Warrior fighting style option'),
      ];
      const advancementId = addAdvancement(classItem, 'ItemChoice', feature.entry.level!, feature.entry.name, itemChoiceConfiguration({ [feature.entry.level!]: 1 }, references, 'fightingStyle'), 'choice', references);
      destinations.set(feature.sourceKey, destination(undefined, advancementId, classId, feature.entry.level!, 'choice', 'assisted'));
      continue;
    }
    if (!isSubclassFeatureContainer(feature)) throw new Error(`未路由的 class container: ${feature.entry.name}`);
  }

  for (const subclass of subclassItems) {
    const shortName = source.subclass.find((entry) => itemIdForSourceKey('subclass', sourceKeyForDocument('subclass', entry)) === subclass._id)?.shortName;
    if (!shortName) throw new Error(`无法反查 subclass owner ${subclass._id}`);
    for (const [level, features] of groupFixedFeatures(collected.filter((feature) => feature.entry.subclassShortName === shortName), 'subclassFeature', canonicalIdBySourceKey)) {
      const references = features.map((feature) => nativeReference(itemsById.get(canonicalIdBySourceKey.get(feature.sourceKey)!)!, feature.entry.name));
      const advancementId = addAdvancement(subclass, 'ItemGrant', level, '子职特性', itemGrantConfiguration(references), 'grant', references);
      const byLevel = subclassGrantIds.get(shortName) ?? new Map<number, string>();
      byLevel.set(level, advancementId);
      subclassGrantIds.set(shortName, byLevel);
      for (const feature of features) {
        const documentId = canonicalIdBySourceKey.get(feature.sourceKey)!;
        destinations.set(feature.sourceKey, destination(documentId, advancementId, subclass._id, level, 'grant', automationForItem(itemsById.get(documentId)!)));
      }
    }
    for (const level of [3, 7, 11, 15, 18]) {
      if (!subclassGrantIds.get(shortName)?.get(level)) throw new Error(`${subclass.name} 缺少 ${level} 级真实 ItemGrant。`);
    }
  }

  for (const feature of collected.filter((candidate) => candidate.group === 'subclassFeature' && !canonicalIdBySourceKey.has(candidate.sourceKey))) {
    const shortName = feature.entry.subclassShortName!;
    const ownerId = subclassIdByShortName.get(shortName)!;
    if (isSubclassTitle(feature)) {
      destinations.set(feature.sourceKey, destination(ownerId, undefined, ownerId, feature.entry.level!, 'container', 'native'));
      continue;
    }
    if (isMutagenContainer(feature)) {
      destinations.set(feature.sourceKey, destination(undefined, mutagenChoice, ownerId, feature.entry.level!, 'choice', 'native'));
      continue;
    }
    if (isPactMagic(feature)) {
      destinations.set(feature.sourceKey, destination(ownerId, undefined, ownerId, feature.entry.level!, 'container', 'assisted'));
      continue;
    }
    throw new Error(`未路由的 subclass container: ${feature.entry.name}`);
  }

  const duskSubclass = collected.find((feature) => feature.group === 'subclassFeature' && isDuskRite(feature));
  if (!duskSubclass || !destinations.get(duskSubclass.sourceKey)) throw new Error('破晓血仪 subclass grant 未生成。');
  destinations.set(duskOptional.sourceKey, destinations.get(duskSubclass.sourceKey)!);

  for (const feature of collected.filter((candidate) => candidate.group === 'optionalfeature' && !isDuskRite(candidate))) {
    const documentId = canonicalIdBySourceKey.get(feature.sourceKey);
    if (!documentId) throw new Error(`optional feature 缺少 canonical document: ${feature.entry.name}`);
    const type = featureType(feature);
    const choice = type === 'BC' ? bloodCurseChoice : type === 'CR' ? riteChoice : mutagenChoice;
    const owner = type === 'MTGN' ? mutantId : classId;
    const level = type === 'BC' ? 1 : type === 'CR' ? 2 : 3;
    destinations.set(feature.sourceKey, destination(documentId, choice, owner, level, 'choice', automationForItem(itemsById.get(documentId)!)));
  }

  for (const feature of collected.filter((candidate) => candidate.group === 'classFeature' && isSubclassFeatureContainer(candidate))) {
    const level = feature.entry.level!;
    const routes = source.subclass.map((subclass) => ({
      ownerDocumentId: subclassIdByShortName.get(subclass.shortName!)!,
      advancementId: subclassGrantIds.get(subclass.shortName!)?.get(level),
    }));
    if (routes.some((route) => !route.advancementId)) throw new Error(`${level} 级子职 container 无法路由到四个真实 ItemGrant。`);
    destinations.set(feature.sourceKey, {
      ownerDocumentId: classId,
      level,
      mode: 'container',
      automation: 'native',
      containerRoute: {
        kind: 'subclass-level-grants',
        ownerDocumentIds: routes.map((route) => route.ownerDocumentId),
        advancementIds: routes.map((route) => route.advancementId!),
      },
    });
  }

  const ledger = collected.map((feature) => buildCoverageEntry(feature, destinations.get(feature.sourceKey), itemsById));
  if (ledger.length !== 94) throw new Error(`coverage ledger 必须为 94 项，当前为 ${ledger.length}。`);

  const sourceActivityCount = collected.reduce((total, feature) => total + asArray<JsonObject>(feature.sideData?.activities).length, 0);
  const activityIds = canonicalFeatures.flatMap((item) => Object.keys(asRecord(item.system.activities)));
  const deduplicatedActivityCount = new Set(activityIds).size;
  const activitySummary = {
    sourceActivityCount,
    canonicalActivityCount: activityIds.length,
    deduplicatedActivityCount,
    differenceReason: sourceActivityCount === deduplicatedActivityCount
      ? '所有锁定源 Activity 均由 canonical document 保留；破晓血仪的 source alias 共享同一 canonical feat，未额外复制 Activity。'
      : 'canonical 去重仅合并共享同一 feature document 的 source alias；其余 Activity 不因计数目标而删除。',
  };
  const externalReferences = graph.flatMap((node) => node.references).filter((reference) => reference.classification === 'external-rule');
  const packageWithoutHash: Omit<NativeBloodHunterPackage, 'logicalHash'> = {
    moduleId: BLOOD_HUNTER_MODULE_ID,
    version: BLOOD_HUNTER_MODULE_VERSION,
    target: { foundry: '14.364', dnd5e: '5.3.3', rules: '2024', effectProfile: 'modded-v14' },
    classes: [classItem],
    subclasses: subclassItems,
    features: canonicalFeatures.sort((left, right) => left._id.localeCompare(right._id, 'en')),
    grantGraph: graph.sort((left, right) => left.id.localeCompare(right.id, 'en')),
    externalReferences: externalReferences.sort((left, right) => left.referenceKey.localeCompare(right.referenceKey, 'en')),
    coverageLedger: ledger.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey, 'en')),
    activitySummary,
    ...(sourceSha256 ? { sourceSha256 } : {}),
  };
  const output: NativeBloodHunterPackage = { ...packageWithoutHash, logicalHash: sha256(packageWithoutHash) };
  const validation = validateNativeBloodHunterPackage(output);
  if (!validation.ok) throw new Error(`native package compiler postcondition failed: ${validation.findings.map((finding) => finding.code).join(', ')}`);
  return output;
}

function resolveCompileInput(input: BloodHunterEnrichedSource | BloodHunterV14CompileOptions): { source: BloodHunterEnrichedSource; sourceSha256?: string } {
  if (!asRecord(input) || !('target' in input) || !('source' in input)) return { source: input as BloodHunterEnrichedSource };
  const options = input as BloodHunterV14CompileOptions;
  if (options.target?.foundry !== BLOOD_HUNTER_V14_TARGET.foundry
    || options.target?.dnd5e !== BLOOD_HUNTER_V14_TARGET.dnd5e
    || options.target?.effectProfile !== BLOOD_HUNTER_V14_TARGET.effectProfile) {
    throw new Error('Blood Hunter compiler target 必须精确为 Foundry 14.364 / dnd5e 5.3.3 / modded-v14。');
  }
  assertBloodHunterSourceBytes(options.source);
  const text = typeof options.source === 'string' ? options.source : new TextDecoder('utf-8', { fatal: true }).decode(options.source);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`锁定 BloodHunter2024 source 不是有效 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { source: parsed as BloodHunterEnrichedSource, sourceSha256: EXPECTED_BLOOD_HUNTER_SOURCE_SHA256 };
}

function buildClassDocument(entry: BloodHunterEnrichedSource['class'][number], id: string, source: BloodHunterEnrichedSource): NativeItemSource {
  const sourceKey = sourceKeyForDocument('class', entry);
  const document: NativeItemSource = {
    _id: id,
    name: entry.name,
    type: 'class',
    img: ITEM_ICON,
    system: {
      identifier: CLASS_IDENTIFIER,
      levels: 1,
      description: { value: buildClassDescription(entry, source), chat: '' },
      source: { custom: BLOOD_HUNTER_SOURCE, rules: '2024', revision: 1, license: '', book: '' },
      startingEquipment: bloodHunterStartingEquipment(),
      advancement: {},
      spellcasting: { progression: 'none', ability: '', preparation: { formula: '' } },
      wealth: '155',
      primaryAbility: { value: ['dex', 'int'], all: true },
      hd: { denomination: 'd10', spent: 0, additional: '' },
    },
    effects: [],
    flags: {},
  };
  attachMetadata(document, sourceKey, { source: BLOOD_HUNTER_SOURCE, group: 'class', normalizedName: normalizeName(entry.ENG_name ?? entry.name) }, 'native');
  return document;
}

function buildClassDescription(entry: BloodHunterEnrichedSource['class'][number], source: BloodHunterEnrichedSource): string {
  const fluff = asArray<BloodHunterEnrichedSource['class'][number]>(source.classFluff)
    .filter((item) => item.name === entry.name && item.source === BLOOD_HUNTER_SOURCE)
    .map((item) => htmlFromEntries(item.entries));
  const core = '<h3>血猎手核心职业特性</h3><table class="core-class-traits"><tbody>'
    + '<tr><th>主属性</th><td>敏捷和智力</td></tr><tr><th>生命骰</th><td>每级 D10</td></tr>'
    + '<tr><th>豁免熟练</th><td>敏捷、智力</td></tr><tr><th>技能熟练</th><td>从运动、体操、奥秘、历史、洞悉、调查、宗教、生存中选择三项</td></tr>'
    + '<tr><th>武器熟练</th><td>简易和军用武器</td></tr><tr><th>护甲训练</th><td>轻甲、中甲和盾牌</td></tr>'
    + '<tr><th>工具熟练</th><td>炼金工具</td></tr><tr><th>起始装备</th><td>选择 A：鳞甲、短剑、轻弩、20 支弩矢、弩矢匣、炼金工具、探索套组和 8 GP；或 B：155 GP。</td></tr>'
    + '</tbody></table><h3>多职业</h3><p>获得生命骰、轻甲训练、军用武器、炼金工具，以及从职业技能列表选择一项技能。</p>';
  return [core, ...fluff, htmlFromEntries(entry.entries)].filter((part) => part.length > 0).join('');
}

function bloodHunterStartingEquipment(): JsonObject[] {
  const root = stableId('starting-equipment', CLASS_IDENTIFIER, 'root');
  const entry = (type: string, key: string, count: number | null, group: string, sort: number): JsonObject => ({
    type, key, count, requiresProficiency: false, _id: stableId('starting-equipment', CLASS_IDENTIFIER, type, key, String(sort)), group, sort,
  });
  return [
    { type: 'AND', requiresProficiency: false, _id: root, group: '', sort: 100000 },
    entry('linked', 'Compendium.dnd5e.equipment24.Item.phbarmScaleMail0', null, root, 200000),
    entry('linked', 'Compendium.dnd5e.equipment24.Item.phbwepShortsword', null, root, 300000),
    entry('linked', 'Compendium.dnd5e.equipment24.Item.phbwepLightCross', null, root, 400000),
    entry('linked', 'Compendium.dnd5e.equipment24.Item.phbamoBolts00000', 20, root, 500000),
    entry('linked', 'Compendium.dnd5e.equipment24.Item.phbagCaseCrossbo', null, root, 600000),
    entry('linked', 'Compendium.dnd5e.equipment24.Item.phbtulAlchemists', null, root, 700000),
    entry('linked', 'Compendium.dnd5e.equipment24.Item.phbagExplorersPa', null, root, 800000),
    entry('currency', 'gp', 8, root, 900000),
  ];
}

function buildSubclassDocument(entry: BloodHunterEnrichedSource['subclass'][number], source: BloodHunterEnrichedSource): NativeItemSource {
  const sourceKey = sourceKeyForDocument('subclass', entry);
  const id = itemIdForSourceKey('subclass', sourceKey);
  const container = source.subclassFeature.find((feature) => feature.subclassShortName === entry.shortName
    && (feature.ENG_name === entry.ENG_name || feature.name === entry.name));
  const description = [htmlFromEntries(entry.entries), htmlFromEntries(container?.entries)]
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index)
    .join('');
  if (!description) throw new Error(`subclass container description is required: ${entry.name}`);
  const document: NativeItemSource = {
    _id: id,
    name: entry.name,
    type: 'subclass',
    img: ITEM_ICON,
    system: {
      identifier: normalizeName(entry.ENG_name ?? entry.name),
      classIdentifier: CLASS_IDENTIFIER,
      levels: 1,
      description: { value: description, chat: '' },
      source: { custom: BLOOD_HUNTER_SOURCE, rules: '2024', revision: 1, license: '', book: '' },
      advancement: {},
      spellcasting: { progression: 'none', ability: '', preparation: { formula: '' } },
    },
    effects: [],
    flags: {},
  };
  attachMetadata(document, sourceKey, {
    source: BLOOD_HUNTER_SOURCE,
    group: 'subclass',
    className: BLOOD_HUNTER_CLASS_NAME,
    subclassShortName: stringValue(entry.shortName),
    normalizedName: normalizeName(entry.ENG_name ?? entry.name),
  }, 'native');
  return document;
}

function buildFeatureDocument(feature: CollectedBloodHunterFeature, id: string, subclassIdentifierBySourceName: ReadonlyMap<string, string>): NativeItemSource {
  const side = feature.sideData;
  const effects = projectEffects(side?.effects);
  const effectIdBySideId = new Map(effects.map((effect) => [String(effect._id), String(effect._id)]));
  const activities = projectActivities(side?.activities, effectIdBySideId);
  const sourcePrerequisites = asArray<JsonObject>(feature.entry.prerequisite);
  const prerequisites = projectFeaturePrerequisites(feature, sourcePrerequisites, subclassIdentifierBySourceName);
  const sideSystem = clone(asRecord(side?.system));
  delete sideSystem.activities;
  delete sideSystem.advancement;
  const system: JsonObject = {
    ...sideSystem,
    identifier: normalizeName(feature.entry.ENG_name ?? feature.entry.name),
    description: { value: decorateFeatureDescription(feature, htmlFromEntries(feature.entry.entries)), chat: '' },
    source: { custom: BLOOD_HUNTER_SOURCE, rules: '2024' },
    activities,
    prerequisites,
  };
  if (!system.uses) system.uses = { spent: 0, max: '', recovery: [] };
  applyFeatureSemantics(feature, system, effects);
  const document: NativeItemSource = {
    _id: id,
    name: feature.entry.name,
    type: 'feat',
    img: ITEM_ICON,
    system,
    effects,
    flags: clone(asRecord(side?.flags)),
  };
  attachMetadata(document, feature.sourceKey, feature.sourceIdentity, deriveAutomation(feature, side, activities, effects));
  bloodHunterMetadata(document).prerequisiteProjection = {
    sourcePresent: sourcePrerequisites.length > 0,
    sourceHash: sha256(sourcePrerequisites),
    projected: clone(prerequisites),
  };
  return document;
}

function buildMutagenicWarriorDocument(): NativeItemSource {
  const sourceKey = `${BLOOD_HUNTER_SOURCE}|synthetic|${CLASS_IDENTIFIER}|mutagenic-warrior`;
  const id = itemIdForSourceKey('synthetic-feat', sourceKey);
  const document: NativeItemSource = {
    _id: id,
    name: '诱变武者',
    type: 'feat',
    img: ITEM_ICON,
    system: {
      identifier: 'mutagenic-warrior',
      description: { value: '<p><strong>来源：血猎手「战斗风格」的自定义选项。</strong>你学习突变者子职中的两种诱变剂公式；每次长休后可用炼金工具配制一种已知诱变剂，并以附赠动作饮用。配制品在下一次长休后惰性，效果持续到短休或长休结束。</p><p><strong>辅助边界：</strong>公式学习、配制选择和现有诱变剂替换需要 GM/玩家确认；本 feat 不伪造为自动子职解锁。</p>', chat: '' },
      source: { custom: BLOOD_HUNTER_SOURCE, rules: '2024' },
      activities: {},
      prerequisites: { items: [], level: null, repeatable: false },
      uses: { spent: 0, max: '', recovery: [] },
    },
    effects: [],
    flags: {},
  };
  attachMetadata(document, sourceKey, {
    source: BLOOD_HUNTER_SOURCE,
    group: 'classFeature',
    className: BLOOD_HUNTER_CLASS_NAME,
    level: 2,
    normalizedName: 'mutagenic-warrior',
  }, 'assisted');
  bloodHunterMetadata(document).synthetic = {
    origin: '血猎手「战斗风格」源文本中的 Mutagenic Warrior 自定义选项。',
    boundary: '诱变剂公式学习、配制和替换为 GM-assisted。',
  };
  return document;
}

function projectFeaturePrerequisites(
  feature: CollectedBloodHunterFeature,
  sourcePrerequisites: JsonObject[],
  subclassIdentifierBySourceName: ReadonlyMap<string, string>,
): JsonObject {
  const items = new Set<string>();
  let projectedLevel: number | null = null;
  for (const [index, prerequisite] of sourcePrerequisites.entries()) {
    const levelRequirement = asRecord(prerequisite.level);
    const level = levelRequirement.level;
    if (!Number.isInteger(level) || Number(level) < 1) {
      throw new Error(`unsupported prerequisite level: ${feature.sourceKey}[${index}]`);
    }
    if (projectedLevel !== null && projectedLevel !== level) {
      throw new Error(`conflicting prerequisite levels: ${feature.sourceKey}`);
    }
    projectedLevel = Number(level);

    const classRequirement = asRecord(levelRequirement.class);
    const className = stringValue(classRequirement.ENG_name) ?? stringValue(classRequirement.name);
    if (className && className !== 'Blood Hunter' && className !== BLOOD_HUNTER_CLASS_NAME) {
      throw new Error(`prerequisite class drifted: ${feature.sourceKey}`);
    }

    const subclassRequirement = asRecord(levelRequirement.subclass);
    const subclassSourceName = stringValue(subclassRequirement.ENG_name) ?? stringValue(subclassRequirement.name);
    if (subclassSourceName) {
      const identifier = subclassIdentifierBySourceName.get(subclassSourceName);
      if (!identifier) throw new Error(`prerequisite subclass unresolved: ${feature.sourceKey} -> ${subclassSourceName}`);
      items.add(identifier);
    }
  }
  return { items: [...items], level: projectedLevel, repeatable: false };
}

function applyFeatureSemantics(feature: CollectedBloodHunterFeature, system: JsonObject, effects: JsonObject[]): void {
  if (isCorrosion(feature)) {
    for (const effect of effects) {
      const duration = asRecord(effect.duration);
      delete duration.expiry;
      effect.duration = duration;
      const flags = asRecord(effect.flags);
      flags.fvttJsonGenerator = { ...asRecord(flags.fvttJsonGenerator), assistedTurnEndConSave: true, amplifiedRepeatDamage: '4d6 necrotic after failed turn-end save' };
      effect.flags = flags;
    }
  }
  if (isTimedMutagen(feature)) {
    for (const effect of effects) {
      const duration = asRecord(effect.duration);
      duration.seconds = 3600;
      effect.duration = duration;
      const flags = asRecord(effect.flags);
      const dae = asRecord(flags.dae);
      dae.specialDuration = [...new Set([...asArray<string>(dae.specialDuration), 'shortRest', 'longRest'])];
      flags.dae = dae;
      effect.flags = flags;
    }
  }
  if (isHybridTransformation(feature)) {
    system.uses = { spent: 0, max: '1 + floor(@classes.blood-hunter.levels / 11)', recovery: [{ period: 'sr', type: 'recoverAll' }] };
    addLocalScaleValue(system, 'hybrid-transformations', '混种变形次数（18级无限需 GM 辅助）', {
      3: { value: 1 }, 11: { value: 2 },
    });
  }
  if (isPactMagic(feature)) {
    addPactMagicScales(system);
  }
}

function addPactMagicScales(system: JsonObject): void {
  const values: Array<[string, string, JsonObject]> = [
    ['profane-soul-cantrips', '渎魂已知戏法（GM 辅助）', { 3: { value: 2 }, 10: { value: 3 } }],
    ['profane-soul-spells-known', '渎魂已知法术（GM 辅助）', { 3: { value: 2 }, 5: { value: 3 }, 7: { value: 4 }, 9: { value: 5 }, 11: { value: 6 }, 13: { value: 7 }, 15: { value: 8 }, 17: { value: 9 }, 19: { value: 10 }, 20: { value: 11 } }],
    ['profane-soul-slots', '渎魂契约位（GM 辅助）', { 3: { value: 1 }, 6: { value: 2 } }],
    ['profane-soul-slot-level', '渎魂契约位环阶（GM 辅助）', { 3: { value: 1 }, 7: { value: 2 }, 13: { value: 3 }, 19: { value: 4 } }],
  ];
  for (const [identifier, title, scale] of values) addLocalScaleValue(system, identifier, title, scale);
}

function addLocalScaleValue(system: JsonObject, identifier: string, title: string, scale: JsonObject): void {
  const advancements = asRecord(system.advancement);
  const id = stableId('feature-scale', CLASS_IDENTIFIER, identifier);
  advancements[id] = {
    _id: id,
    type: 'ScaleValue',
    configuration: { identifier, type: 'number', distance: { units: '' }, scale },
    value: {},
    level: 3,
    title,
    hint: '该数值显示完整血猎手等级表；dnd5e 原生 pact progression 不表达此子职覆盖，按说明由 GM 辅助配置。',
    flags: {},
  };
  system.advancement = advancements;
}

function decorateFeatureDescription(feature: CollectedBloodHunterFeature, description: string): string {
  if (isPactMagic(feature)) {
    return `${description}<p><strong>GM 步骤（辅助）：</strong>按下表以完整血猎手等级设置戏法、已知法术、契约位和法术位环阶；短休或长休恢复全部契约位。不要把标准魔契师 pact progression 当作该子职表的自动等价物。</p>`;
  }
  if (isCorrosion(feature)) {
    return `${description}<p><strong>辅助结算：</strong>中毒不会在 sourceEnd 自动消失；目标在每个自己回合结束时进行体质豁免，成功结束，增幅版本在施加时及每次失败时各造成 4d6 暗蚀伤害。</p>`;
  }
  if (isMobileMutagen(feature)) {
    return `${description}<p><strong>辅助边界：</strong>受擒与束缚免疫由 Effect 表达；11级的麻痹免疫需 GM 在达到等级后确认，不能由静态 Effect 可靠动态声明。</p>`;
  }
  if (isHybridTransformation(feature)) {
    return `${description}<p><strong>次数边界：</strong>3级每短休/长休 1 次，11级 2 次；18级无限使用不能由有限 uses 字段可靠表示，达到18级后由 GM 忽略该次数上限。</p>`;
  }
  if (isSanguineMastery(feature)) {
    return `${description}<p><strong>辅助边界：</strong>短休恢复所有惩戒烙印 uses 属于跨 Item 修改；当前 package 提供可见规则说明，但 GM 需在短休后恢复该特性的 uses。</p>`;
  }
  if (isDuskRite(feature)) {
    return `${description}<p><strong>边界：</strong>光耀附加伤害由附魔 Effect 自动提供；20尺明亮光照、持握武器期间的黯蚀抗性，以及命中不死生物的额外血法骰均保留为明确辅助步骤。</p>`;
  }
  return description;
}

function addClassTraits(classItem: NativeItemSource, addAdvancement: (owner: NativeItemSource, type: GrantType, level: number, title: string, configuration: JsonObject, mode: GrantMode, references: NativeReferenceContract[], options?: AdvanceOptions) => string): void {
  addAdvancement(classItem, 'HitPoints', 1, '生命值', {}, 'native', []);
  const trait = (title: string, grants: string[], choices: JsonObject[], restriction: 'primary' | 'secondary' = 'primary') => addAdvancement(
    classItem,
    'Trait',
    1,
    title,
    { mode: 'default', allowReplacements: false, grants, choices },
    'native',
    [],
    { value: { chosen: [] }, classRestriction: restriction },
  );
  trait('豁免熟练', ['saves:dex', 'saves:int'], []);
  trait('技能熟练', [], [{ count: 3, pool: ['skills:ath', 'skills:acr', 'skills:arc', 'skills:his', 'skills:ins', 'skills:inv', 'skills:rel', 'skills:sur'] }]);
  trait('武器熟练', ['weapon:sim', 'weapon:mar'], []);
  trait('护甲训练', ['armor:lgt', 'armor:med', 'armor:shl'], []);
  trait('工具熟练', ['tool:alchemist'], []);
  trait('多职业：武器熟练', ['weapon:mar'], [], 'secondary');
  trait('多职业：护甲训练', ['armor:lgt'], [], 'secondary');
  trait('多职业：工具熟练', ['tool:alchemist'], [], 'secondary');
  trait('多职业：技能熟练', [], [{ count: 1, pool: ['skills:ath', 'skills:acr', 'skills:arc', 'skills:his', 'skills:ins', 'skills:inv', 'skills:rel', 'skills:sur'] }], 'secondary');
}

function groupFixedFeatures(features: CollectedBloodHunterFeature[], group: BloodHunterFeatureGroup, canonicalIdBySourceKey: ReadonlyMap<string, string>): Array<[number, CollectedBloodHunterFeature[]]> {
  const result = new Map<number, CollectedBloodHunterFeature[]>();
  for (const feature of features) {
    if (feature.group !== group || !canonicalIdBySourceKey.has(feature.sourceKey)) continue;
    const level = feature.entry.level;
    if (level === undefined || !Number.isInteger(level)) continue;
    const atLevel = result.get(level) ?? [];
    atLevel.push(feature);
    result.set(level, atLevel);
  }
  return [...result.entries()].sort(([left], [right]) => left - right).map(([level, members]) => [level, members.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey, 'en'))]);
}

function putAdvancement(owner: NativeItemSource, id: string, type: GrantType, level: number, title: string, configuration: JsonObject, options: AdvanceOptions): void {
  const advances = asRecord(owner.system.advancement);
  advances[id] = {
    _id: id,
    type,
    configuration: clone(configuration),
    value: clone(options.value ?? defaultAdvancementValue(type)),
    level,
    title,
    hint: options.hint ?? '',
    flags: {},
    ...(options.classRestriction ? { classRestriction: options.classRestriction } : {}),
  };
  owner.system.advancement = advances;
}

function defaultAdvancementValue(type: GrantType): JsonObject {
  if (type === 'ItemChoice') return { added: {}, replaced: {} };
  if (type === 'Trait') return { chosen: [] };
  if (type === 'Subclass') return { document: null, uuid: null };
  return {};
}

function asiConfiguration(recommendation: string | null): JsonObject {
  return { cap: 2, fixed: clone(ASI_FIXED), locked: [], points: 2, recommendation, max: null };
}

function itemGrantConfiguration(references: readonly NativeReferenceContract[]): JsonObject {
  if (references.length === 0) throw new Error('持久 ItemGrant 不能为空。');
  return { items: references.map((reference) => ({ uuid: reference.uuid, optional: false })), optional: false, spell: null };
}

function itemChoiceConfiguration(choices: Record<number, number>, references: readonly NativeReferenceContract[], subtype = ''): JsonObject {
  if (references.length === 0) throw new Error('持久 ItemChoice pool 不能为空。');
  return {
    allowDrops: true,
    choices: Object.fromEntries(Object.entries(choices).map(([level, count]) => [level, { count, replacement: true }])),
    pool: references.map((reference) => reference.uuid),
    restriction: { level: '', list: [], subtype, type: 'feat' },
    spell: null,
    type: 'feat',
  };
}

function nativeReference(item: NativeItemSource, purpose: string): NativeReferenceContract {
  return {
    referenceKey: `module:${item._id}`,
    classification: 'native',
    uuid: moduleItemUuid(item),
    targetDocumentId: item._id,
    resolution: 'direct-uuid',
    source: 'module',
    purpose,
  };
}

function dnd5eReference(uuid: string, purpose: string): NativeReferenceContract {
  const targetDocumentId = uuid.split('.').at(-1)!;
  return {
    referenceKey: `dnd5e:${targetDocumentId}`,
    classification: 'native',
    uuid,
    targetDocumentId,
    resolution: 'direct-uuid',
    source: 'dnd5e',
    purpose,
  };
}

function moduleItemUuid(item: NativeItemSource): string {
  return `Compendium.${BLOOD_HUNTER_MODULE_ID}.${MODULE_PACKS[item.type]}.Item.${item._id}`;
}

function optionalReferencesByType(features: CollectedBloodHunterFeature[], type: string, canonicalIdBySourceKey: ReadonlyMap<string, string>, itemsById: ReadonlyMap<string, NativeItemSource>): NativeReferenceContract[] {
  const seen = new Set<string>();
  const result: NativeReferenceContract[] = [];
  for (const feature of features.filter((candidate) => candidate.group === 'optionalfeature' && featureType(candidate) === type)) {
    const id = canonicalIdBySourceKey.get(feature.sourceKey);
    const item = id ? itemsById.get(id) : undefined;
    if (!id || !item || seen.has(id)) continue;
    seen.add(id);
    result.push(nativeReference(item, feature.entry.name));
  }
  return result.sort((left, right) => left.targetDocumentId.localeCompare(right.targetDocumentId, 'en'));
}

function choiceDeltas(source: BloodHunterEnrichedSource, type: string): Record<number, number> {
  const progression = asArray<JsonObject>(source.class[0]?.optionalfeatureProgression)
    .find((entry) => asArray<string>(entry.featureType).includes(type))?.progression;
  if (Array.isArray(progression)) {
    const result: Record<number, number> = {};
    let previous = 0;
    progression.forEach((value, index) => {
      const count = typeof value === 'number' ? value : 0;
      if (count > previous) result[index + 1] = count - previous;
      previous = count;
    });
    return result;
  }
  const progressionRecord = asRecord(progression);
  if (Object.keys(progressionRecord).length > 0) {
    const result: Record<number, number> = {};
    let previous = 0;
    for (const [level, value] of Object.entries(progressionRecord).sort(([left], [right]) => Number(left) - Number(right))) {
      const count = typeof value === 'number' ? value : 0;
      if (count > previous) result[Number(level)] = count - previous;
      previous = count;
    }
    return result;
  }
  throw new Error(`缺少 ${type} optionalfeature progression。`);
}

function projectEffects(value: JsonObject[] | undefined): JsonObject[] {
  return asArray<JsonObject>(value).map((effect) => {
    const next = clone(effect);
    const foundryId = stringValue(next.foundryId);
    if (foundryId) {
      next._id = foundryId;
      delete next.foundryId;
    }
    if (!stringValue(next._id)) throw new Error('side-data effect 缺少 foundryId/_id，无法投影为 Foundry Item source。');
    next.changes = asArray<JsonObject>(next.changes).map((change, index) => {
      const projected = clone(change);
      projected.mode = projectActiveEffectMode(projected.mode, `${String(next._id)}/changes/${index}`);
      return projected;
    });
    return next;
  });
}

const ACTIVE_EFFECT_MODES: Record<string, number> = {
  CUSTOM: 0,
  MULTIPLY: 1,
  ADD: 2,
  DOWNGRADE: 3,
  UPGRADE: 4,
  OVERRIDE: 5,
};
const ACTIVE_EFFECT_MODE_LABELS = ['CUSTOM', 'MULTIPLY', 'ADD', 'DOWNGRADE', 'UPGRADE', 'OVERRIDE'] as const;

function projectActiveEffectMode(value: unknown, path: string): number {
  if (Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 5) return Number(value);
  if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(ACTIVE_EFFECT_MODES, value.toUpperCase())) return ACTIVE_EFFECT_MODES[value.toUpperCase()]!;
  throw new Error(`INVALID_ACTIVE_EFFECT_MODE: ${path} -> ${String(value)}`);
}

function projectActivities(value: JsonObject[] | undefined, effectIds: ReadonlyMap<string, string>): JsonObject {
  const result: JsonObject = {};
  for (const activity of asArray<JsonObject>(value)) {
    const next = clone(activity);
    const id = stringValue(next._id);
    if (!id) throw new Error('side-data activity 缺少 _id。');
    if (result[id]) throw new Error(`重复 activity _id: ${id}`);
    const references = asArray<JsonObject>(next.effects).map((reference) => {
      const projected = clone(reference);
      const foundryId = stringValue(projected.foundryId);
      if (foundryId) {
        if (!effectIds.has(foundryId)) throw new Error(`activity ${id} 引用了悬空 effect ${foundryId}`);
        projected._id = effectIds.get(foundryId)!;
        delete projected.foundryId;
      }
      if (!stringValue(projected._id)) throw new Error(`activity ${id} effect reference 缺少 _id。`);
      return projected;
    });
    if (references.length > 0) next.effects = references;
    else delete next.effects;
    result[id] = next;
  }
  return result;
}

function attachMetadata(document: NativeItemSource, sourceKey: string, sourceIdentity: ReturnType<typeof identityForFeature> | { source: string; group: 'class' | 'subclass' | 'classFeature'; className?: string; subclassShortName?: string; level?: number; normalizedName: string }, automation: BloodHunterAutomation): void {
  const flags = asRecord(document.flags);
  const generator = asRecord(flags.fvttJsonGenerator);
  generator.bloodHunter2024 = {
    sourceKey,
    sourceIdentity: clone(sourceIdentity),
    canonicalId: document._id,
    moduleVersion: BLOOD_HUNTER_MODULE_VERSION,
    automation,
    logicalHash: sha256({ name: document.name, type: document.type, system: document.system, effects: document.effects, sourceKey, automation }),
  };
  flags.fvttJsonGenerator = generator;
  document.flags = flags;
}

function bloodHunterMetadata(document: NativeItemSource): JsonObject {
  return asRecord(asRecord(asRecord(document.flags).fvttJsonGenerator).bloodHunter2024);
}

function deriveAutomation(feature: CollectedBloodHunterFeature, side: BloodHunterSideData | undefined, activities: JsonObject, effects: JsonObject[]): BloodHunterAutomation {
  if (isPactMagic(feature) || isCorrosion(feature) || isMobileMutagen(feature) || isHybridTransformation(feature) || isSanguineMastery(feature)) return 'assisted';
  const declared = stringValue(asRecord(asRecord(side?.flags).fvttJsonGenerator).automation);
  if (declared === 'automatic' || declared === 'assisted' || declared === 'native' || declared === 'external-rule') return declared;
  if (Object.keys(activities).length > 0) return 'assisted';
  return effects.length > 0 ? 'automatic' : 'native';
}

function automationForItem(item: NativeItemSource): BloodHunterAutomation {
  const automation = stringValue(bloodHunterMetadata(item).automation);
  if (automation === 'automatic' || automation === 'assisted' || automation === 'native' || automation === 'external-rule') return automation;
  throw new Error(`Item ${item._id} 缺少 automation metadata。`);
}

function destination(canonicalDocumentId: string | undefined, advancementId: string | undefined, ownerDocumentId: string, level: number, mode: GrantMode, automation: BloodHunterAutomation): Destination {
  return { canonicalDocumentId, advancementId, ownerDocumentId, level, mode, automation };
}

function buildCoverageEntry(feature: CollectedBloodHunterFeature, target: Destination | undefined, itemsById: ReadonlyMap<string, NativeItemSource>): BloodHunterCoverageLedgerEntry {
  if (!target || (!target.canonicalDocumentId && !target.advancementId && !target.containerRoute)) throw new Error(`coverage feature 无归宿: ${feature.sourceKey}`);
  const item = target.canonicalDocumentId ? itemsById.get(target.canonicalDocumentId) : undefined;
  const activities = asRecord(item?.system.activities);
  const effects = item?.effects ?? [];
  const renderedSource = htmlFromEntries(feature.entry.entries);
  const sourceSummary = readableSummary(renderedSource, `${feature.entry.name}：源条目由 ${feature.group} 授予结构定义。`);
  const activitySemantics = Object.entries(activities)
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([id, activity]) => activitySemantic(id, asRecord(activity), target.automation));
  const effectSemantics = effects
    .map((effect) => effectSemantic(asRecord(effect), target.automation))
    .sort((left, right) => left.id.localeCompare(right.id, 'en'));
  const noActivityRationale = activitySemantics.length === 0
    ? `${feature.entry.name} 没有源 Activity；规则通过 ${target.mode} 授予、原生 Advancement 或被动规则文本生效，不伪造可点击动作。源摘要：${sourceSummary}`
    : undefined;
  const noEffectRationale = effectSemantics.length === 0
    ? `${feature.entry.name} 没有源 Effect；效果由规则文本、选择或授予结构表达，不伪造 ActiveEffect。`
    : undefined;
  const semanticSummary = coverageSemanticSummary(feature, target, itemsById, activitySemantics, effectSemantics, sourceSummary);
  const review = reviewForFeature(feature, target, activitySemantics, effectSemantics, semanticSummary);
  return {
    sourceKey: feature.sourceKey,
    sourceIdentity: clone(feature.sourceIdentity),
    sourceLocator: { group: feature.group, index: feature.sourceIndex, sourceKey: feature.sourceKey },
    sourceText: { summary: sourceSummary, renderedHash: sha256(renderedSource) },
    textHash: feature.textHash,
    ...(target.canonicalDocumentId ? { canonicalDocumentId: target.canonicalDocumentId } : {}),
    ...(target.advancementId ? { advancementId: target.advancementId } : {}),
    grant: {
      ownerDocumentId: target.ownerDocumentId,
      level: target.level,
      mode: target.mode,
      ...(target.containerRoute ? { containerRoute: clone(target.containerRoute) } : {}),
    },
    automation: target.automation,
    activities: {
      count: activitySemantics.length,
      ids: activitySemantics.map((semantic) => semantic.id),
      semantics: activitySemantics,
      passive: activitySemantics.length === 0,
      ...(noActivityRationale ? { noActivityRationale } : {}),
    },
    effects: {
      count: effectSemantics.length,
      ids: effectSemantics.map((semantic) => semantic.id),
      semantics: effectSemantics,
      passive: effectSemantics.length === 0,
      ...(noEffectRationale ? { noEffectRationale } : {}),
    },
    semanticSummary,
    unautomatedBoundary: boundaryForAutomation(target.automation),
    review,
  };
}

function activitySemantic(id: string, activity: JsonObject, fallback: BloodHunterAutomation): CoverageActivitySemantic {
  const classification = classifyActivity(activity, fallback);
  const effectIds = asArray<JsonObject>(activity.effects).map((reference) => String(reference._id)).sort();
  const chatFlavor = stringValue(asRecord(activity.description).chatFlavor);
  return {
    id,
    name: stringValue(activity.name) ?? `Activity ${id}`,
    type: stringValue(activity.type) ?? 'unknown',
    activation: selectFields(activity.activation, ['type', 'value', 'condition']),
    range: selectFields(activity.range, ['value', 'units', 'special']),
    target: selectFields(activity.target, ['template', 'affects', 'prompt']),
    duration: selectFields(activity.duration, ['value', 'units', 'concentration']),
    uses: selectFields(activity.uses, ['spent', 'max', 'recovery']),
    consumption: selectFields(activity.consumption, ['targets', 'scaling', 'spellSlot']),
    save: selectFields(activity.save, ['ability', 'dc']),
    damage: selectFields(activity.damage, ['onSave', 'critical', 'parts']),
    healing: selectFields(activity.healing, ['parts']),
    formula: stringValue(asRecord(activity.roll).formula) ?? stringValue(activity.formula) ?? null,
    effectIds,
    classification,
    boundary: chatFlavor ? readableSummary(chatFlavor, boundaryForAutomation(classification), 260) : boundaryForAutomation(classification),
  };
}

function effectSemantic(effect: JsonObject, fallback: BloodHunterAutomation): CoverageEffectSemantic {
  const classification = classifyEffect(effect, fallback);
  const changes = asArray<JsonObject>(effect.changes).map((change) => {
    const mode = Number(change.mode);
    return {
      key: stringValue(change.key) ?? '(missing key)',
      mode,
      modeLabel: ACTIVE_EFFECT_MODE_LABELS[mode] ?? 'INVALID',
      value: change.value === undefined || change.value === null ? '' : String(change.value),
    };
  });
  return {
    id: String(effect._id),
    name: stringValue(effect.name) ?? `Effect ${String(effect._id)}`,
    type: stringValue(effect.type) ?? 'base',
    transfer: effect.transfer === true,
    disabled: effect.disabled === true,
    duration: selectFields(effect.duration, ['seconds', 'rounds', 'turns', 'startTime', 'startRound', 'startTurn', 'expiry']),
    changes,
    statuses: asArray<string>(effect.statuses).map(String).sort(),
    classification,
    boundary: effectBoundary(effect, classification, changes.map((change) => change.key)),
  };
}

function coverageSemanticSummary(
  feature: CollectedBloodHunterFeature,
  target: Destination,
  itemsById: ReadonlyMap<string, NativeItemSource>,
  activities: CoverageActivitySemantic[],
  effects: CoverageEffectSemantic[],
  sourceSummary: string,
): CoverageSemanticSummary {
  const boundary = boundaryForAutomation(target.automation);
  if (target.containerRoute) return {
    kind: 'container', classification: target.automation, boundary,
    summary: `${feature.entry.name} 在 ${target.level} 级路由到 ${target.containerRoute.ownerDocumentIds.length} 个子职各自的真实 ItemGrant。`,
  };
  if (!target.canonicalDocumentId) {
    const owner = itemsById.get(target.ownerDocumentId);
    const advancement = target.advancementId ? asRecord(asRecord(owner?.system.advancement)[target.advancementId]) : {};
    return {
      kind: 'advancement', classification: target.automation, boundary,
      summary: advancementSummary(feature.entry.name, advancement, target),
    };
  }
  if (activities.length === 0 && effects.length === 0) return {
    kind: 'passive-document', classification: target.automation, boundary,
    summary: `${feature.entry.name} 是由 ${target.mode} 路由授予的被动规则文档；无 Activity/Effect。${sourceSummary}`,
  };
  return {
    kind: 'document-mechanics', classification: target.automation, boundary,
    summary: `${feature.entry.name}：Activity ${activities.map((semantic) => `${semantic.name}[${semantic.type}/${semantic.classification}]`).join('、') || '无'}；Effect ${effects.map((semantic) => `${semantic.name}[${semantic.type}/${semantic.classification}]`).join('、') || '无'}。`,
  };
}

function advancementSummary(name: string, advancement: JsonObject, target: Destination): string {
  const type = stringValue(advancement.type) ?? target.mode;
  const title = stringValue(advancement.title) ?? name;
  const configuration = asRecord(advancement.configuration);
  if (type === 'ItemChoice') return `${title}：${target.level}级 ItemChoice，直接 pool ${asArray(configuration.pool).length} 个 UUID，升级 replacement 由 choices 持久化。`;
  if (type === 'ItemGrant') return `${title}：${target.level}级 ItemGrant，授予 ${asArray(configuration.items).length} 个直接 UUID。`;
  if (type === 'Trait') return `${title}：${target.level}级 Trait/${String(configuration.mode ?? 'default')}，grants ${asArray(configuration.grants).length} 项、choices ${asArray(configuration.choices).length} 组。`;
  if (type === 'AbilityScoreImprovement') return `${title}：${target.level}级 AbilityScoreImprovement，points ${String(configuration.points ?? '')}、cap ${String(configuration.cap ?? '')}。`;
  if (type === 'Subclass') return `${title}：${target.level}级原生 Subclass 选择 Advancement。`;
  return `${title}：${target.level}级 ${type} Advancement，由持久对象直接表达。`;
}

function reviewForFeature(feature: CollectedBloodHunterFeature, target: Destination, activities: CoverageActivitySemantic[], effects: CoverageEffectSemantic[], semantic: CoverageSemanticSummary): BloodHunterCoverageLedgerEntry['review'] {
  const name = feature.entry.name;
  if (isCorrosion(feature)) return { status: 'adjusted', notes: '腐蚀血咒：中毒只由目标回合末成功体质豁免结束；Activity 明确初始/增幅/失血结算，Effect 删除 sourceEnd；4d6 失败重复伤害需 GM 辅助。' };
  if (isTimedMutagen(feature)) return { status: 'adjusted', notes: `${name}：饮用 Activity 连接对应诱变剂 Effect；Effect 明确为 3600 秒，同时保留短休/长休边界。` };
  if (isMobileMutagen(feature)) return { status: 'assisted', notes: '灵活移动：受擒和束缚免疫写入 Effect；11级麻痹免疫不以静态 Effect 冒充动态可靠自动化，升级时由 GM 确认。' };
  if (isHybridTransformation(feature)) return { status: 'assisted', notes: '混种变形：可见 uses/Scale 明确 3级1次、11级2次；18级无限使用超出有限 uses 的可靠表达，已明确转为 GM 辅助。' };
  if (isSanguineMastery(feature)) return { status: 'assisted', notes: '胸有成竹：血法骰双掷保留为可见辅助；短休恢复另一 Item「惩戒烙印」的全部 uses 是跨 Item 操作，不能静默宣称原生完成。' };
  if (isPactMagic(feature)) return { status: 'assisted', notes: '契约魔法：可见 ScaleValue 逐列记录完整血猎手等级的戏法、已知法术、法术位和环阶；标准 pact progression 不等价，GM 按表配置并在休息恢复。' };
  if (isDuskRite(feature)) return { status: 'assisted', notes: `破晓血仪：Activity 分别为 ${activities.map((activity) => `${activity.name}[${activity.classification}]`).join('、')}；Effect 分别为 ${effects.map((effect) => `${effect.name}[${effect.changes.map((change) => `${change.key}:${change.modeLabel}`).join(',') || 'status'}]`).join('、')}。光照、持握抗性、对不死额外骰保留辅助边界。` };
  if (target.containerRoute) return { status: 'pass', notes: `${name}：这是 ${target.level} 级的子职触发条目，明确路由到四个子职各自的真实 ItemGrant，不生成空占位 ItemGrant。` };
  if (isWeaponMastery(feature)) return { status: 'pass', notes: '武器精通：使用 dnd5e Trait/mastery，直接提供 weapon:* 的两项选择；不伪装为 feat ItemChoice。' };
  if (isFightingStyle(feature)) return { status: 'assisted', notes: '战斗风格：直接 pool 四个锁定 dnd5e fighting-style UUID 与模块 synthetic「诱变武者」；后者的公式和配制选择保留 GM 辅助。' };
  if (isEpicBoon(feature)) return { status: 'pass', notes: '传奇恩惠：使用完整 AbilityScoreImprovement schema，并精确推荐真实视觉之恩惠 UUID。' };
  const status: BloodHunterCoverageLedgerEntry['review']['status'] = target.automation === 'assisted' || target.automation === 'external-rule' ? 'assisted' : 'pass';
  return { status, notes: `${name}：${semantic.summary} 边界：${semantic.boundary}` };
}

function classifyActivity(activity: JsonObject, fallback: BloodHunterAutomation): BloodHunterAutomation {
  const declared = declaredAutomation(activity);
  if (declared) return declared;
  const text = `${String(activity.name ?? '')} ${String(asRecord(activity.description).chatFlavor ?? '')}`;
  if (/辅助|手动|提示|按原文|GM|确认|不能可靠|请/.test(text)) return 'assisted';
  return fallback;
}

function classifyEffect(effect: JsonObject, fallback: BloodHunterAutomation): BloodHunterAutomation {
  const declared = declaredAutomation(effect);
  if (declared) return declared;
  const generator = asRecord(asRecord(effect.flags).fvttJsonGenerator);
  if (generator.assistedTurnEndConSave === true || generator.removeWhenRiteWeaponNotHeld === true || /辅助|手动|提示/.test(String(effect.name ?? ''))) return 'assisted';
  if (asArray(effect.changes).length > 0 || asArray(effect.statuses).length > 0) return 'automatic';
  return fallback;
}

function declaredAutomation(value: JsonObject): BloodHunterAutomation | undefined {
  const declared = stringValue(asRecord(asRecord(value.flags).fvttJsonGenerator).automation);
  return declared === 'automatic' || declared === 'assisted' || declared === 'native' || declared === 'external-rule' ? declared : undefined;
}

function effectBoundary(effect: JsonObject, classification: BloodHunterAutomation, changeKeys: string[]): string {
  const generator = asRecord(asRecord(effect.flags).fvttJsonGenerator);
  if (generator.assistedTurnEndConSave === true) return '目标回合末体质豁免与失败重复伤害需辅助结算；Effect 不使用 sourceEnd 自动移除。';
  if (generator.removeWhenRiteWeaponNotHeld === true) return '仅持握血仪武器时有效；不再持握时由 GM/玩家移除。';
  const statuses = asArray<string>(effect.statuses);
  if (changeKeys.length > 0 || statuses.length > 0) return `应用 change keys ${changeKeys.join(', ') || '无'}；statuses ${statuses.join(', ') || '无'}；持续时间按 ledger duration。`;
  return boundaryForAutomation(classification);
}

function selectFields(value: unknown, keys: readonly string[]): JsonObject {
  const source = asRecord(value);
  const selected: JsonObject = {};
  for (const key of keys) if (source[key] !== undefined) selected[key] = clone(source[key]);
  return selected;
}

function readableSummary(value: string, fallback: string, maxLength = 320): string {
  const plain = value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  const summary = plain || fallback;
  return summary.length <= maxLength ? summary : `${summary.slice(0, maxLength - 1)}…`;
}

function boundaryForAutomation(automation: BloodHunterAutomation): string {
  if (automation === 'automatic') return '仅已投影的稳定 Activity/Effect 自动执行；条件和目标仍以源文本为准。';
  if (automation === 'assisted') return '该条目保留了明确的 GM/玩家操作边界，详见 review.notes。';
  if (automation === 'external-rule') return '该条目依赖外部规则步骤，详见 review.notes。';
  return '以原生 dnd5e document 或 advancement 表达；没有额外 Activity 自动化。';
}

function isContainerFeature(feature: CollectedBloodHunterFeature): boolean {
  return feature.group === 'classFeature' && (isSubclassSelector(feature) || isSubclassFeatureContainer(feature) || isAsi(feature) || isFightingStyle(feature) || isWeaponMastery(feature) || isEpicBoon(feature))
    || feature.group === 'subclassFeature' && (isSubclassTitle(feature) || isPactMagic(feature) || isMutagenContainer(feature));
}

function isDuskRite(feature: CollectedBloodHunterFeature): boolean { return feature.entry.ENG_name === DUSK_RITE_ENGLISH || feature.entry.name === '破晓血仪'; }
function isSubclassSelector(feature: CollectedBloodHunterFeature): boolean { return feature.entry.ENG_name === 'Blood Hunter Subclass' || feature.entry.name === '血猎手子职'; }
function isSubclassFeatureContainer(feature: CollectedBloodHunterFeature): boolean { return feature.entry.ENG_name === 'Subclass Feature' || feature.entry.name === '子职特性'; }
function isAsi(feature: CollectedBloodHunterFeature): boolean { return feature.entry.ENG_name === 'Ability Score Improvement' || feature.entry.name === '属性值提升'; }
function isFightingStyle(feature: CollectedBloodHunterFeature): boolean { return feature.entry.ENG_name === 'Fighting Style' || feature.entry.name === '战斗风格'; }
function isWeaponMastery(feature: CollectedBloodHunterFeature): boolean { return feature.entry.ENG_name === 'Weapon Mastery' || feature.entry.name === '武器精通'; }
function isEpicBoon(feature: CollectedBloodHunterFeature): boolean { return feature.entry.ENG_name === 'Epic Boon' || feature.entry.name === '传奇恩惠'; }
function isSubclassTitle(feature: CollectedBloodHunterFeature): boolean { return feature.entry.ENG_name?.startsWith('Order of the ') === true || feature.entry.name.endsWith('结社'); }
function isPactMagic(feature: CollectedBloodHunterFeature): boolean { return feature.entry.ENG_name === 'Pact Magic' || feature.entry.name === '契约魔法'; }
function isMutagenContainer(feature: CollectedBloodHunterFeature): boolean { return feature.entry.ENG_name === 'Mutagens' || feature.entry.name === '诱变剂'; }
function isCorrosion(feature: CollectedBloodHunterFeature): boolean { return feature.entry.ENG_name === 'Blood Curse of Corrosion' || feature.entry.name === '腐蚀血咒'; }
function isTimedMutagen(feature: CollectedBloodHunterFeature): boolean { return feature.group === 'optionalfeature' && (feature.entry.ENG_name === 'Aether' || feature.entry.ENG_name === 'Alluring' || feature.entry.name === '升腾' || feature.entry.name === '幻惑'); }
function isMobileMutagen(feature: CollectedBloodHunterFeature): boolean { return feature.group === 'optionalfeature' && (feature.entry.ENG_name === 'Mobile' || feature.entry.name === '灵活移动'); }
function isHybridTransformation(feature: CollectedBloodHunterFeature): boolean { return feature.entry.ENG_name === 'Hybrid Transformation' || feature.entry.name === '混种变形'; }
function isSanguineMastery(feature: CollectedBloodHunterFeature): boolean { return feature.entry.ENG_name === 'Sanguine Mastery' || feature.entry.name === '胸有成竹'; }
function featureType(feature: CollectedBloodHunterFeature): string | undefined { const value = feature.entry.featureType; return Array.isArray(value) ? value[0] : value; }
