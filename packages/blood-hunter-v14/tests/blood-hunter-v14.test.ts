import { describe, expect, test } from 'bun:test';

import {
  BLOOD_HUNTER_V14_TARGET,
  EXPECTED_BLOOD_HUNTER_SOURCE_SHA256,
  assertBloodHunterSourceBytes,
  compileBloodHunterV14Package,
  planNativeBloodHunterMigration,
  validateNativeBloodHunterPackage,
  type BloodHunterEnrichedSource,
  type ExistingFoundryItemLike,
  type NativeBloodHunterPackage,
} from '../src';
import { makeBloodHunter2024Fixture } from './fixture';

const STRICT_ID = /^[A-Za-z0-9]{16}$/;
const MODULE_ITEM_UUID = /^Compendium\.fvtt-blood-hunter-2024\.(classes|subclasses|features)\.Item\.([A-Za-z0-9]{16})$/;
const DND5E_ITEM_UUID = /^Compendium\.dnd5e\.[A-Za-z0-9-]+\.Item\.([A-Za-z0-9]{16})$/;
const FIGHTING_STYLE_UUIDS = [
  'Compendium.dnd5e.feats24.Item.phbfstArchery000',
  'Compendium.dnd5e.feats24.Item.phbfstDefense000',
  'Compendium.dnd5e.feats24.Item.phbfstGreatWeapo',
  'Compendium.dnd5e.feats24.Item.phbfstTwoWeaponF',
] as const;

describe('Blood Hunter v14 native compiler', () => {
  test('compiles the complete 22/30/42 source deterministically into 1/4/76/94 and preserves the fixture activity accounting', () => {
    const source = makeBloodHunter2024Fixture();
    const before = structuredClone(source);
    const first = compileBloodHunterV14Package(source);
    const second = compileBloodHunterV14Package(structuredClone(source));

    expect(source).toEqual(before);
    expect(first).toEqual(second);
    expect(first.moduleId).toBe('fvtt-blood-hunter-2024');
    expect(first.version).toBe('1.0.0');
    expect(first.target).toEqual({ foundry: '14.364', dnd5e: '5.3.3', rules: '2024', effectProfile: 'modded-v14' });
    expect(first.classes).toHaveLength(1);
    expect(first.subclasses).toHaveLength(4);
    expect(first.features).toHaveLength(76); // 75 source canonical feats + synthetic Mutagenic Warrior.
    expect(first.coverageLedger).toHaveLength(94);
    expect(first.activitySummary).toEqual({
      sourceActivityCount: 5,
      canonicalActivityCount: 5,
      deduplicatedActivityCount: 5,
      differenceReason: expect.any(String),
    });
    expect(validateNativeBloodHunterPackage(first)).toEqual({ ok: true, findings: [] });
  });

  test('uses strict sixteen-character ASCII IDs everywhere Foundry persists or references an ID', () => {
    const output = compileBloodHunterV14Package(makeBloodHunter2024Fixture());
    const documents = allDocuments(output);
    const persistentIds = [
      ...documents.map((item) => item._id),
      ...documents.flatMap((item) => Object.keys(advancements(item))),
      ...documents.flatMap((item) => Object.keys(activities(item))),
      ...documents.flatMap((item) => item.effects.map((effect) => String(effect._id))),
      ...output.grantGraph.map((node) => node.id),
      ...output.grantGraph.flatMap((node) => node.references.map((reference) => reference.targetDocumentId)),
    ];
    expect(persistentIds).not.toHaveLength(0);
    expect(persistentIds.every((id) => STRICT_ID.test(id))).toBe(true);

    const malformed = structuredClone(output);
    malformed.features[0]!._id = 'prefix_bad_id_123';
    const invalidActivity = malformed.features.find((item) => Object.keys(activities(item)).length > 0)!;
    const activityId = Object.keys(activities(invalidActivity))[0]!;
    activities(invalidActivity)[activityId]!._id = 'activity_bad';
    invalidActivity.effects[0]!._id = 'effect_bad';
    const invalidAdvancementOwner = malformed.classes[0]!;
    const advancementId = Object.keys(advancements(invalidAdvancementOwner))[0]!;
    advancements(invalidAdvancementOwner)[advancementId]!._id = 'advance_bad';
    const invalidReference = malformed.grantGraph.find((node) => node.references.length > 0)!.references[0]!;
    invalidReference.targetDocumentId = 'reference_bad';
    const codes = findingCodes(malformed);
    expect(codes).toEqual(expect.arrayContaining([
      'INVALID_DOCUMENT_ID',
      'INVALID_ACTIVITY_ID',
      'INVALID_TOP_LEVEL_EFFECT_ID',
      'INVALID_ADVANCEMENT_ID',
      'INVALID_REFERENCE_CONTRACT',
    ]));
  });

  test('locks the raw UTF-8 input entrypoint and rejects a mismatched compile target before parsing', () => {
    const fixtureBytes = new TextEncoder().encode(JSON.stringify(makeBloodHunter2024Fixture()));
    expect(() => assertBloodHunterSourceBytes(fixtureBytes)).toThrow(EXPECTED_BLOOD_HUNTER_SOURCE_SHA256);
    expect(() => assertBloodHunterSourceBytes(JSON.stringify(makeBloodHunter2024Fixture()))).toThrow(EXPECTED_BLOOD_HUNTER_SOURCE_SHA256);
    expect(() => compileBloodHunterV14Package({
      source: fixtureBytes,
      target: { ...BLOOD_HUNTER_V14_TARGET, foundry: '14.365' } as any,
    })).toThrow('target');
    expect(() => compileBloodHunterV14Package({ source: fixtureBytes, target: BLOOD_HUNTER_V14_TARGET })).toThrow(EXPECTED_BLOOD_HUNTER_SOURCE_SHA256);
  });

  test('writes complete native class, subclass, grant, choice, ASI, scale, and trait objects rather than builder placeholders', () => {
    const source = makeBloodHunter2024Fixture();
    const output = compileBloodHunterV14Package(source);
    const classItem = output.classes[0]!;
    const classSystem = classItem.system as Record<string, any>;
    expect(classSystem.identifier).toBe('blood-hunter');
    expect(classSystem.levels).toBe(1);
    expect(classSystem.description.value).toEqual(expect.any(String));
    expect(classSystem.description.value.length).toBeGreaterThan(100);
    expect(classSystem.hd).toMatchObject({ denomination: 'd10' });
    expect(classSystem.primaryAbility).toMatchObject({ value: ['dex', 'int'] });
    expect(classSystem.wealth).toBe('155');
    expect(classSystem.startingEquipment).toHaveLength(9);
    const equipmentRoots = classSystem.startingEquipment.filter((entry: any) => entry.type === 'AND' && entry.group === '');
    expect(equipmentRoots).toHaveLength(1);
    const equipmentRootId = equipmentRoots[0]._id;
    const equipmentChildren = classSystem.startingEquipment.filter((entry: any) => entry._id !== equipmentRootId);
    expect(equipmentChildren).toHaveLength(8);
    expect(equipmentChildren.every((entry: any) => entry.group === equipmentRootId)).toBe(true);
    expect(classSystem.startingEquipment.some((entry: any) => entry.type === 'OR')).toBe(false);
    expect(equipmentChildren.filter((entry: any) => entry.type === 'linked')).toHaveLength(7);
    expect(equipmentChildren.filter((entry: any) => entry.type === 'currency')).toEqual([
      expect.objectContaining({ key: 'gp', count: 8, group: equipmentRootId }),
    ]);

    const classAdvancements = Object.values(advancements(classItem));
    expect(classAdvancements.some((advancement: any) => advancement.type === 'HitPoints')).toBe(true);
    const traits = classAdvancements.filter((advancement: any) => advancement.type === 'Trait') as any[];
    const traitGrants = traits.flatMap((trait) => trait.configuration.grants);
    expect(traitGrants).toEqual(expect.arrayContaining([
      'saves:dex', 'saves:int', 'weapon:sim', 'weapon:mar', 'armor:lgt', 'armor:med', 'armor:shl', 'tool:alchemist',
    ]));
    expect(traits.some((trait) => trait.configuration.choices.some((choice: any) => choice.count === 3))).toBe(true);
    expect(traits.some((trait) => trait.classRestriction === 'secondary')).toBe(true);

    for (const subclass of output.subclasses) {
      const system = subclass.system as Record<string, any>;
      expect(system).toMatchObject({ classIdentifier: 'blood-hunter', levels: 1 });
      expect(system.identifier).toEqual(expect.any(String));
      expect(system.description.value.length).toBeGreaterThan(0);
      const shortName = (metadata(subclass).sourceIdentity as Record<string, any>).subclassShortName;
      const sourceContainer = source.subclassFeature.find((feature) => feature.subclassShortName === shortName && feature.ENG_name?.startsWith('Order of the '))!;
      expect(system.description.value).toContain(sourceContainer.ENG_name);
    }

    const ownerAndLevel = new Set<string>();
    for (const node of output.grantGraph) {
      const advancement = advancementFor(output, node.ownerDocumentId, node.id);
      if (node.type === 'ItemGrant') {
        expect(advancement.configuration.items).toHaveLength(node.references.length);
        expect(advancement.configuration.items.length).toBeGreaterThan(0);
        const key = `${node.ownerDocumentId}:${node.level}`;
        expect(ownerAndLevel.has(key)).toBe(false);
        ownerAndLevel.add(key);
      }
      if (node.type === 'ItemChoice') {
        expect(advancement.configuration.pool).toEqual(node.references.map((reference: any) => reference.uuid));
        expect(Object.values(advancement.configuration.choices).every((choice: any) => choice.replacement === true)).toBe(true);
      }
      if (node.type === 'Subclass') expect(advancement).toMatchObject({ configuration: {}, value: { document: null, uuid: null } });
      if (node.type === 'ScaleValue') expect(Object.keys(advancement.configuration.scale).length).toBeGreaterThan(0);
      if (node.type === 'Trait') expect(advancement.configuration).toMatchObject({ mode: expect.any(String), grants: expect.any(Array), choices: expect.any(Array) });
    }

    for (const subclass of output.subclasses) {
      const ownIdentity = metadata(subclass).sourceIdentity as Record<string, unknown>;
      for (const level of [3, 7, 11, 15, 18]) {
        const grants = output.grantGraph.filter((node) => node.ownerDocumentId === subclass._id && node.type === 'ItemGrant' && node.level === level);
        expect(grants).toHaveLength(1);
        expect(grants[0]!.references.length).toBeGreaterThan(0);
        for (const reference of grants[0]!.references) {
          const target = output.features.find((item) => item._id === reference.targetDocumentId)!;
          const targetIdentity = metadata(target).sourceIdentity as Record<string, unknown>;
          if (targetIdentity.subclassShortName !== undefined) expect(String(targetIdentity.subclassShortName)).toBe(String(ownIdentity.subclassShortName));
        }
      }
    }

    const containerRoutes = output.coverageLedger.filter((entry) => entry.grant.containerRoute);
    expect(containerRoutes).toHaveLength(4);
    for (const entry of containerRoutes) {
      expect(entry.grant.containerRoute).toMatchObject({ kind: 'subclass-level-grants' });
      expect(entry.grant.containerRoute!.ownerDocumentIds).toHaveLength(4);
      expect(entry.grant.containerRoute!.advancementIds).toHaveLength(4);
    }
  });

  test('uses the official fighting-style UUIDs, a synthetic assisted Mutagenic Warrior, Trait/mastery, and full ASI schemas', () => {
    const output = compileBloodHunterV14Package(makeBloodHunter2024Fixture());
    const classItem = output.classes[0]!;
    const classAdvancements = Object.values(advancements(classItem)) as any[];
    const mastery = classAdvancements.find((advancement) => advancement.type === 'Trait' && advancement.configuration.mode === 'mastery');
    expect(mastery).toMatchObject({ configuration: { choices: [{ count: 2, pool: ['weapon:*'] }] } });

    const fighting = classAdvancements.find((advancement) => advancement.type === 'ItemChoice' && advancement.configuration.restriction.subtype === 'fightingStyle');
    expect(fighting.configuration.pool).toEqual(expect.arrayContaining(FIGHTING_STYLE_UUIDS));
    const syntheticUuid = fighting.configuration.pool.find((uuid: string) => MODULE_ITEM_UUID.test(uuid));
    expect(syntheticUuid).toEqual(expect.any(String));
    const syntheticId = MODULE_ITEM_UUID.exec(syntheticUuid)![2]!;
    const synthetic = output.features.find((item) => item._id === syntheticId)!;
    expect(metadata(synthetic)).toMatchObject({ automation: 'assisted', synthetic: { origin: expect.any(String), boundary: expect.any(String) } });

    const asi = classAdvancements.filter((advancement) => advancement.type === 'AbilityScoreImprovement');
    expect(asi).toHaveLength(5);
    for (const advancement of asi) {
      expect(advancement.configuration).toMatchObject({
        cap: 2,
        fixed: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
        locked: [],
        points: 2,
        max: null,
      });
      expect('recommendation' in advancement.configuration).toBe(true);
    }
    const epic = asi.find((advancement) => advancement.configuration.recommendation !== null)!;
    expect(epic.configuration).toMatchObject({
      recommendation: 'Compendium.dnd5e.feats24.Item.phbBoonofTruesig', points: 2, cap: 2, max: null,
    });
  });

  test('writes direct canonical module UUID pools at the source levels with replacement:true', () => {
    const output = compileBloodHunterV14Package(makeBloodHunter2024Fixture());
    const choices = output.grantGraph.filter((node) => node.type === 'ItemChoice').map((node) => ({ node, advancement: advancementFor(output, node.ownerDocumentId, node.id) }));
    const optionPools = choices.filter(({ advancement }) => ['14', '7', '21'].includes(String(advancement.configuration.pool?.length)));
    expect(optionPools.map(({ advancement }) => advancement.configuration.pool.length).sort((a: number, b: number) => a - b)).toEqual([7, 14, 21]);
    for (const { node, advancement } of optionPools) {
      expect(node.references.every((reference) => reference.source === 'module' && MODULE_ITEM_UUID.test(reference.uuid))).toBe(true);
      expect(advancement.configuration.pool.every((uuid: string) => MODULE_ITEM_UUID.test(uuid))).toBe(true);
      expect(Object.values(advancement.configuration.choices).every((choice: any) => choice.replacement === true)).toBe(true);
    }
    const poolAt = (level: number) => optionPools.find(({ node }) => node.level === level)!;
    expect(poolAt(1).advancement.configuration.pool).toHaveLength(14);
    expect(poolAt(2).advancement.configuration.pool).toHaveLength(7);
    expect(poolAt(3).advancement.configuration.pool).toHaveLength(21);
  });

  test('projects source blood-curse prerequisites to canonical subclass identifiers without shrinking the fourteen-item pool', () => {
    const output = compileBloodHunterV14Package(makeBloodHunter2024Fixture());
    const expected: Record<string, { subclass: string; level: number }> = {
      'blood-curse-of-corrosion': { subclass: 'order-of-the-mutant', level: 15 },
      'blood-curse-of-the-exorcist': { subclass: 'order-of-the-ghostslayer', level: 15 },
      'blood-curse-of-the-howl': { subclass: 'order-of-the-lycan', level: 18 },
      'blood-curse-of-the-souleater': { subclass: 'order-of-the-profane-soul', level: 18 },
    };
    for (const [curseName, requirement] of Object.entries(expected)) {
      const curse = featureByEnglish(output, curseName, 'optionalfeature');
      const subclass = output.subclasses.find((item) => (metadata(item).sourceIdentity as Record<string, unknown>).normalizedName === requirement.subclass)!;
      expect(subclass).toBeDefined();
      expect(curse.system.prerequisites).toEqual({
        items: [subclass.system.identifier],
        level: requirement.level,
        repeatable: false,
      });
    }
    expect(featureByEnglish(output, 'blood-curse-of-the-anxious', 'optionalfeature').system.prerequisites).toEqual({
      items: [], level: null, repeatable: false,
    });
    const curseChoice = output.grantGraph.find((node) => node.type === 'ItemChoice' && node.level === 1 && node.references.length === 14)!;
    expect(curseChoice.references).toHaveLength(14);
    expect(curseChoice.references.every((reference) => {
      const item = output.features.find((candidate) => candidate._id === reference.targetDocumentId);
      return item !== undefined && (metadata(item).sourceIdentity as Record<string, unknown>).group === 'optionalfeature';
    })).toBe(true);
  });

  test('renders supported 5etools inline tags readably, preserves safe HTML, and fails closed for unknown tags', () => {
    const source = makeBloodHunter2024Fixture();
    source.classFeature.find((entry) => entry.ENG_name === 'Hemocraft')!.entries = [
      '别名 {@item 弩矢（20支）|XPHB|20支弩箭}；骰式 {@dice 4d6}；{@i 选择A或B：}；状态 {@condition 中毒}；筛选 {@filter 已知血咒|optionalfeatures|Feature Type=血咒}。<strong>安全HTML</strong>',
    ];
    const output = compileBloodHunterV14Package(source);
    const hemocraft = featureByEnglish(output, 'hemocraft', 'classFeature');
    const description = String((hemocraft.system as any).description.value);
    expect(description).not.toContain('{@');
    expect(description).toContain('20支弩箭');
    expect(description).not.toContain('弩矢（20支）|XPHB');
    expect(description).toContain('<code>4d6</code>');
    expect(description).toContain('<em>选择A或B：</em>');
    expect(description).toContain('data-5etools-tag="condition">中毒</span>');
    expect(description).toContain('data-5etools-tag="filter">已知血咒</span>');
    expect(description).toContain('<strong>安全HTML</strong>');
    expect(allDocuments(output).every((item) => !String((item.system.description as any)?.value ?? '').includes('{@'))).toBe(true);

    const unknown = makeBloodHunter2024Fixture();
    unknown.classFeature.find((entry) => entry.ENG_name === 'Hemocraft')!.entries = ['{@unknown 不得静默吞字}'];
    expect(() => compileBloodHunterV14Package(unknown)).toThrow('UNSUPPORTED_5ETOOLS_INLINE_TAG');
  });

  test('projects Dusk Rite once with five activities and two effects, and records per-entry review boundaries', () => {
    const output = compileBloodHunterV14Package(makeBloodHunter2024Fixture());
    const dawn = output.features.find((item) => Object.keys(activities(item)).length === 5 && item.effects.length === 2)!;
    expect(dawn).toBeDefined();
    expect(Object.keys(activities(dawn))).toHaveLength(5);
    expect(dawn.effects).toHaveLength(2);
    expect(dawn.effects.flatMap((effect) => effect.changes as any[]).every((change) => Number.isInteger(change.mode) && change.mode === 2)).toBe(true);
    expect(dawn.effects.every((effect) => STRICT_ID.test(String(effect._id)))).toBe(true);
    expect(Object.values(activities(dawn)).flatMap((activity: any) => activity.effects ?? []).every((effect: any) => effect._id && STRICT_ID.test(effect._id))).toBe(true);
    expect(output.coverageLedger).toHaveLength(94);
    expect(output.coverageLedger.every((entry) => entry.review.notes.length > 0 && entry.review.notes !== entry.unautomatedBoundary)).toBe(true);
    const dawnReviews = output.coverageLedger.filter((entry) => entry.canonicalDocumentId === dawn._id);
    expect(dawnReviews).toHaveLength(2);
    expect(dawnReviews.every((entry) => entry.review.status === 'assisted' && entry.review.notes.includes('Activity'))).toBe(true);
    for (const ledger of dawnReviews) {
      expect(ledger.activities.semantics).toHaveLength(5);
      expect(ledger.activities.semantics.every((semantic) => semantic.id && semantic.name && semantic.type && semantic.boundary && semantic.classification)).toBe(true);
      expect(ledger.effects.semantics).toHaveLength(2);
      expect(ledger.effects.semantics.flatMap((semantic) => semantic.changes).map((change) => ({ mode: change.mode, modeLabel: change.modeLabel }))).toEqual([
        { mode: 2, modeLabel: 'ADD' }, { mode: 2, modeLabel: 'ADD' },
      ]);
      expect(ledger.activities.semantics.flatMap((semantic) => semantic.effectIds).every((id) => ledger.effects.ids.includes(id))).toBe(true);
    }
  });

  test('records bounded, auditable mechanics for curse, rite, mutagen, and true passive coverage entries', () => {
    const output = compileBloodHunterV14Package(withSemanticSideData());
    expect(output.coverageLedger).toHaveLength(94);
    expect(output.coverageLedger.every((entry) => entry.sourceLocator.sourceKey === entry.sourceKey && entry.sourceLocator.index >= 0)).toBe(true);
    expect(output.coverageLedger.every((entry) => entry.sourceText.summary.length > 0 && /^[a-f0-9]{64}$/.test(entry.sourceText.renderedHash))).toBe(true);
    expect(output.coverageLedger.every((entry) => entry.semanticSummary.summary.length > 0 && entry.semanticSummary.boundary.length > 0)).toBe(true);
    expect(output.coverageLedger.every((entry) => entry.activities.count > 0 || entry.activities.passive && Boolean(entry.activities.noActivityRationale))).toBe(true);
    expect(output.coverageLedger.every((entry) => entry.effects.count > 0 || entry.effects.passive && Boolean(entry.effects.noEffectRationale))).toBe(true);

    const corrosion = ledgerByEnglish(output, 'blood-curse-of-corrosion', 'optionalfeature');
    expect(corrosion.activities.semantics[0]).toMatchObject({ type: 'utility', activation: { type: 'bonus', value: 1 }, effectIds: ['corrosionEffect1'] });
    expect(corrosion.effects.semantics[0]).toMatchObject({ classification: 'assisted', changes: [{ key: 'statuses.poisoned', mode: 0, modeLabel: 'CUSTOM', value: 'true' }] });

    const ordinaryCurse = ledgerByEnglish(output, 'blood-curse-of-the-anxious', 'optionalfeature');
    expect(ordinaryCurse.activities.semantics[0]).toMatchObject({ type: 'save', save: { ability: ['wis'] }, effectIds: ['anxiousEffect001'] });
    expect(ordinaryCurse.effects.semantics[0]).toMatchObject({ statuses: ['frightened'], changes: [{ mode: 5, modeLabel: 'OVERRIDE' }] });

    const rite = ledgerByEnglish(output, 'rite-of-the-flame', 'optionalfeature');
    expect(rite.activities.semantics[0]).toMatchObject({ type: 'enchant', effectIds: ['flameEffect00001'] });
    expect(rite.effects.semantics[0]).toMatchObject({ type: 'enchantment', changes: [{ key: 'system.damage.parts', mode: 2, modeLabel: 'ADD' }] });

    const mutagen = ledgerByEnglish(output, 'aether', 'optionalfeature');
    expect(mutagen.activities.semantics[0]).toMatchObject({ type: 'utility', effectIds: ['aetherEffect0001'] });
    expect(mutagen.effects.semantics[0]).toMatchObject({ changes: [{ key: 'system.attributes.movement.fly', mode: 5, modeLabel: 'OVERRIDE', value: '30' }] });

    const passive = ledgerByEnglish(output, 'extra-attack', 'classFeature');
    expect(passive.activities).toMatchObject({ count: 0, semantics: [], passive: true, noActivityRationale: expect.any(String) });
    expect(passive.effects).toMatchObject({ count: 0, semantics: [], passive: true, noEffectRationale: expect.any(String) });
    expect(passive.semanticSummary.kind).toBe('passive-document');
  });

  test('applies each reviewed semantic correction without silently claiming unsupported automation', () => {
    const output = compileBloodHunterV14Package(withSemanticSideData());
    const corrosion = featureByEnglish(output, 'blood-curse-of-corrosion', 'optionalfeature');
    expect(corrosion.effects).toHaveLength(1);
    expect(corrosion.effects[0]!.duration).not.toMatchObject({ expiry: 'sourceEnd' });
    expect(corrosion.effects[0]!.flags).toMatchObject({ fvttJsonGenerator: { assistedTurnEndConSave: true, amplifiedRepeatDamage: '4d6 necrotic after failed turn-end save' } });
    expect(ledgerByEnglish(output, 'blood-curse-of-corrosion', 'optionalfeature').review.status).toBe('adjusted');

    for (const name of ['aether', 'alluring']) {
      const mutagen = featureByEnglish(output, name, 'optionalfeature');
      expect(mutagen.effects[0]!.duration).toMatchObject({ seconds: 3600 });
      expect(mutagen.effects[0]!.flags).toMatchObject({ dae: { specialDuration: ['shortRest', 'longRest'] } });
      expect(ledgerByEnglish(output, name, 'optionalfeature').review.status).toBe('adjusted');
    }

    const mobile = featureByEnglish(output, 'mobile', 'optionalfeature');
    expect(metadata(mobile).automation).toBe('assisted');
    expect(String((mobile.system as any).description.value)).toContain('GM');
    const hybrid = featureByEnglish(output, 'hybrid-transformation', 'subclassFeature');
    expect(hybrid.system).toMatchObject({ uses: { max: '1 + floor(@classes.blood-hunter.levels / 11)' } });
    expect(Object.values((hybrid.system as any).advancement).some((advancement: any) => advancement.configuration.identifier === 'hybrid-transformations')).toBe(true);
    expect(metadata(hybrid).automation).toBe('assisted');

    const sanguine = featureByEnglish(output, 'sanguine-mastery', 'classFeature');
    expect(metadata(sanguine).automation).toBe('assisted');
    expect(String((sanguine.system as any).description.value)).toContain('GM');
    const profaneSoul = output.subclasses.find((item) => String(metadata(item).sourceKey).endsWith('|order-of-the-profane-soul'))!;
    expect(profaneSoul).toBeDefined();
    expect(String((profaneSoul.system as any).description.value)).toContain('GM');
    expect(Object.values(advancements(profaneSoul)).filter((advancement: any) => advancement.type === 'ScaleValue')).toHaveLength(4);
    expect(ledgerByEnglish(output, 'pact-magic', 'subclassFeature').review.status).toBe('assisted');
  });

  test('validator detects independently malformed persisted advancement objects instead of only graph breakage', () => {
    const cases: Array<{ code: string; mutate: (output: NativeBloodHunterPackage) => void }> = [
      { code: 'EMPTY_OR_INVALID_ITEM_GRANT', mutate: (output) => firstAdvancement(output, 'ItemGrant').configuration.items = [] },
      { code: 'INVALID_ITEM_GRANT_UUID', mutate: (output) => firstAdvancement(output, 'ItemGrant').configuration.items[0].uuid = 'Compendium.fvtt-blood-hunter-2024.features.Item.invalid' },
      { code: 'EMPTY_OR_INVALID_ITEM_CHOICE', mutate: (output) => firstAdvancement(output, 'ItemChoice').configuration.pool = [] },
      { code: 'INVALID_ITEM_CHOICE_UUID', mutate: (output) => firstAdvancement(output, 'ItemChoice').configuration.pool[0] = 'Compendium.dnd5e.feats24.Item.invalid' },
      { code: 'INVALID_SUBCLASS_ADVANCEMENT', mutate: (output) => firstAdvancement(output, 'Subclass').value.uuid = 'Compendium.dnd5e.classes24.Item.phbbarbarian000' },
      { code: 'ASI_SCHEMA_MISMATCH', mutate: (output) => firstAdvancement(output, 'AbilityScoreImprovement').configuration.fixed.dex = 1 },
      { code: 'INVALID_SCALE_VALUE', mutate: (output) => firstAdvancement(output, 'ScaleValue').configuration.scale = {} },
      { code: 'INVALID_TRAIT_ADVANCEMENT', mutate: (output) => firstAdvancement(output, 'Trait').configuration.grants = {} },
      { code: 'PERSISTENCE_GRAPH_MISMATCH', mutate: (output) => output.grantGraph = output.grantGraph.filter((node) => node.type !== 'ItemGrant') },
      { code: 'UNEXPECTED_EXTERNAL_REFERENCE', mutate: (output) => output.externalReferences.push(structuredClone(output.grantGraph.find((node) => node.references.length > 0)!.references[0]!)) },
      { code: 'CLASS_STARTING_EQUIPMENT_MISMATCH', mutate: restoreBrokenStartingEquipmentShape },
      { code: 'SOURCE_PREREQUISITE_DROPPED', mutate: (output) => featureByEnglish(output, 'blood-curse-of-corrosion', 'optionalfeature').system.prerequisites = { items: [], level: null, repeatable: false } },
      { code: 'COVERAGE_ACTIVITY_SEMANTICS_MISMATCH', mutate: (output) => ledgerByEnglish(output, 'rite-of-the-dawn', 'optionalfeature').activities.semantics = [] },
      { code: 'COVERAGE_EFFECT_SEMANTICS_MISMATCH', mutate: (output) => ledgerByEnglish(output, 'rite-of-the-dawn', 'optionalfeature').effects.semantics = [] },
      { code: 'INVALID_ACTIVE_EFFECT_CHANGE_MODE', mutate: (output) => (featureByEnglish(output, 'rite-of-the-dawn', 'optionalfeature').effects[0]!.changes as any[])[0]!.mode = 'ADD' },
    ];
    for (const { code, mutate } of cases) {
      const output = structuredClone(compileBloodHunterV14Package(makeBloodHunter2024Fixture()));
      mutate(output);
      expect(findingCodes(output)).toContain(code);
    }
  });

  test('maps every Foundry ActiveEffect mode label to its locked numeric constant', () => {
    const source = makeBloodHunter2024Fixture();
    const rite = source.optionalfeature.find((entry) => entry.ENG_name === 'Rite of the Roar')!;
    const labels = ['CUSTOM', 'MULTIPLY', 'ADD', 'DOWNGRADE', 'UPGRADE', 'OVERRIDE'] as const;
    const ids = ['modeCustom000001', 'modeMultiply0001', 'modeAdd000000001', 'modeDowngrade001', 'modeUpgrade00001', 'modeOverride0001'];
    source.foundryOptionalfeature!.push({
      name: rite.name,
      source: rite.source,
      effects: labels.map((mode, index) => ({
        foundryId: ids[index],
        name: `Mode ${mode}`,
        type: 'base',
        disabled: false,
        transfer: false,
        changes: [{ key: `flags.test.${mode.toLowerCase()}`, mode, value: String(index) }],
      })),
    });

    const output = compileBloodHunterV14Package(source);
    const projected = featureByEnglish(output, 'rite-of-the-roar', 'optionalfeature');
    expect(projected.effects.flatMap((effect) => effect.changes as any[]).map((change) => change.mode)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test('fails closed for source drift and output graph violations', () => {
    const wrongSubclass = makeBloodHunter2024Fixture();
    wrongSubclass.subclass[0]!.shortName = 'wrong-subclass';
    expect(() => compileBloodHunterV14Package(wrongSubclass)).toThrow('SUBCLASS_DRIFT');

    const output = compileBloodHunterV14Package(makeBloodHunter2024Fixture());
    const arrayAdvancement = structuredClone(output);
    arrayAdvancement.classes[0]!.system.advancement = [];
    expect(findingCodes(arrayAdvancement)).toContain('ARRAY_ADVANCEMENT');

    const dangling = structuredClone(output);
    dangling.grantGraph.find((node) => node.references.length > 0)!.references[0]!.uuid = 'Compendium.fvtt-blood-hunter-2024.features.Item.aaaaaaaaaaaaaaaa';
    expect(findingCodes(dangling)).toEqual(expect.arrayContaining(['DANGLING_NATIVE_REFERENCE', 'REFERENCE_ID_MISMATCH']));

    const badMode = makeBloodHunter2024Fixture();
    (badMode.foundryOptionalfeature![0]!.effects![0]!.changes as any[])[0]!.mode = 'NOT_A_FOUNDRY_MODE';
    expect(() => compileBloodHunterV14Package(badMode)).toThrow('INVALID_ACTIVE_EFFECT_MODE');
    const badNumericMode = makeBloodHunter2024Fixture();
    (badNumericMode.foundryOptionalfeature![0]!.effects![0]!.changes as any[])[0]!.mode = 6;
    expect(() => compileBloodHunterV14Package(badNumericMode)).toThrow('INVALID_ACTIVE_EFFECT_MODE');
  });

  test('disambiguates same-name source features without collapsing them', () => {
    const source = makeBloodHunter2024Fixture();
    source.classFeature[6]!.name = source.classFeature[0]!.name;
    source.classFeature[6]!.ENG_name = source.classFeature[0]!.ENG_name;
    const output = compileBloodHunterV14Package(source);
    const collisions = output.features.filter((item) => String(metadata(item).sourceKey).includes('|hemocraft'));
    expect(collisions).toHaveLength(2);
    expect(new Set(collisions.map((item) => item._id)).size).toBe(2);
  });
});

describe('Blood Hunter pure migration planner', () => {
  test('marks Callum old Dusk Rite for update, strictly matches exact examples, rejects a near miss, and ignores unrelated input', () => {
    const output = compileBloodHunterV14Package(makeBloodHunter2024Fixture());
    const dawn = output.features.find((item) => Object.keys(activities(item)).length === 5)!;
    const dawnIdentity = output.coverageLedger.find((entry) => entry.sourceIdentity.group === 'subclassFeature' && entry.sourceIdentity.normalizedName === 'rite-of-the-dawn')!.sourceIdentity;
    const anxious = featureByEnglish(output, 'blood-curse-of-the-anxious', 'optionalfeature');
    const callumOldDawn: ExistingFoundryItemLike = {
      _id: 'callum-dawn', name: 'old dawn', type: 'feat', system: { source: { custom: 'BloodHunter2024' }, activities: {} }, effects: [],
      legacyIdentity: { source: 'BloodHunter2024', className: dawnIdentity.className, subclassShortName: dawnIdentity.subclassShortName, level: dawnIdentity.level, name: 'Rite of the Dawn' },
    };
    const oldAnxious: ExistingFoundryItemLike = {
      _id: 'callum-anxious', name: 'old anxious', type: 'feat', system: { source: { custom: 'BloodHunter2024' }, activities: {} }, effects: [],
      legacyIdentity: { source: 'BloodHunter2024', name: 'Blood Curse of the Anxious' },
    };
    const nearMiss: ExistingFoundryItemLike = {
      _id: 'near-dawn', name: 'old dawn', type: 'feat', system: { source: { custom: 'BloodHunter2024' } },
      legacyIdentity: { source: 'BloodHunter2024', className: dawnIdentity.className, subclassShortName: dawnIdentity.subclassShortName, level: 4, name: 'Rite of the Dawn' },
    };
    const unrelated: ExistingFoundryItemLike = { _id: 'unrelated', name: 'Not Blood Hunter', type: 'feat', system: { source: { custom: 'XPHB' } } };
    const before = structuredClone([callumOldDawn, oldAnxious, nearMiss, unrelated]);
    const plan = planNativeBloodHunterMigration(output, [callumOldDawn, oldAnxious, nearMiss, unrelated]);

    expect([callumOldDawn, oldAnxious, nearMiss, unrelated]).toEqual(before);
    expect(plan.actions.find((entry) => entry.canonicalId === dawn._id)).toMatchObject({ action: 'update', existingItemIds: ['callum-dawn'] });
    expect(plan.actions.find((entry) => entry.canonicalId === anxious._id)).toMatchObject({ action: 'update', existingItemIds: ['callum-anxious'] });
    expect(plan.actions.some((entry) => entry.existingItemIds.includes('near-dawn'))).toBe(false);
    expect(plan.actions.some((entry) => entry.existingItemIds.includes('unrelated'))).toBe(false);
    expect(plan.mergePolicy.preservePaths).toEqual(expect.arrayContaining(['system.uses.spent', 'system.levels', 'system.advancement.*.value']));
    expect(plan.actions.every((entry) => STRICT_ID.test(entry.targetItem._id))).toBe(true);
  });

  test('turns a strict legacy same-name collision into conflict instead of choosing a canonical document', () => {
    const source = makeBloodHunter2024Fixture();
    source.optionalfeature[1]!.name = source.optionalfeature[0]!.name;
    source.optionalfeature[1]!.ENG_name = source.optionalfeature[0]!.ENG_name;
    const output = compileBloodHunterV14Package(source);
    const legacy: ExistingFoundryItemLike = {
      _id: 'ambiguous-hemocraft', name: 'Blood Curse of the Anxious', type: 'feat', system: { source: { custom: 'BloodHunter2024' } },
      legacyIdentity: { source: 'BloodHunter2024', name: 'Blood Curse of the Anxious' },
    };
    const plan = planNativeBloodHunterMigration(output, [legacy]);
    expect(plan.actions).toContainEqual(expect.objectContaining({
      action: 'conflict', canonicalId: 'legacy-name-ambiguity', existingItemIds: ['ambiguous-hemocraft'],
    }));
  });
});

function allDocuments(output: NativeBloodHunterPackage) {
  return [...output.classes, ...output.subclasses, ...output.features];
}

function advancements(item: NativeBloodHunterPackage['classes'][number]): Record<string, any> {
  return (item.system.advancement ?? {}) as Record<string, any>;
}

function activities(item: NativeBloodHunterPackage['features'][number]): Record<string, any> {
  return (item.system.activities ?? {}) as Record<string, any>;
}

function metadata(item: NativeBloodHunterPackage['features'][number]): Record<string, any> {
  return (item.flags as any).fvttJsonGenerator.bloodHunter2024;
}

function advancementFor(output: NativeBloodHunterPackage, ownerId: string, advancementId: string): any {
  const owner = allDocuments(output).find((item) => item._id === ownerId)!;
  return advancements(owner)[advancementId]!;
}

function firstAdvancement(output: NativeBloodHunterPackage, type: string): any {
  return Object.values(allDocuments(output).flatMap((item) => Object.values(advancements(item))) as any[]).find((advancement: any) => advancement.type === type)!;
}

function findingCodes(output: NativeBloodHunterPackage): string[] {
  return validateNativeBloodHunterPackage(output).findings.map((finding) => finding.code);
}

function featureByEnglish(output: NativeBloodHunterPackage, english: string, group?: string) {
  const item = output.features.find((candidate) => {
    const identity = metadata(candidate).sourceIdentity as Record<string, unknown>;
    return identity.normalizedName === english && (group === undefined || identity.group === group);
  });
  if (!item) throw new Error(`Missing feature ${english}/${group ?? '*'}`);
  return item;
}

function ledgerByEnglish(output: NativeBloodHunterPackage, english: string, group?: string) {
  const entry = output.coverageLedger.find((candidate) => candidate.sourceIdentity.normalizedName === english && (group === undefined || candidate.sourceIdentity.group === group));
  if (!entry) throw new Error(`Missing ledger entry ${english}/${group ?? '*'}`);
  return entry;
}

function withSemanticSideData(): BloodHunterEnrichedSource {
  const source = makeBloodHunter2024Fixture();
  const optional = (english: string) => source.optionalfeature.find((entry) => entry.ENG_name === english)!;
  const subclass = (english: string) => source.subclassFeature.find((entry) => entry.ENG_name === english)!;
  const classFeature = (english: string) => source.classFeature.find((entry) => entry.ENG_name === english)!;
  const effect = (id: string, duration: Record<string, unknown>, flags: Record<string, unknown> = {}, changes: Array<Record<string, unknown>> = [], statuses: string[] = [], type = 'base') => ({
    foundryId: id, name: id, type, disabled: false, transfer: false, changes, statuses, duration, flags,
  });
  const sideActivity = (id: string, name: string, type: string, effectId?: string, extra: Record<string, unknown> = {}) => ({
    _id: id, name, type,
    activation: { type: 'bonus', value: 1, condition: '', override: false },
    consumption: { targets: [], scaling: { allowed: false, max: '' }, spellSlot: false },
    description: { chatFlavor: `${name} fixture mechanics.` },
    duration: { value: '', units: 'inst', concentration: false, override: false },
    range: { value: '30', units: 'ft', special: '', override: false },
    target: { template: {}, affects: { count: '1', type: 'creature', choice: false, special: '' }, prompt: true, override: false },
    uses: { spent: 0, recovery: [], max: '' },
    ...(effectId ? { effects: [{ foundryId: effectId }] } : {}),
    ...extra,
  });
  const optionalSide = (english: string, sideEffect: Record<string, unknown>, sideActivities: Array<Record<string, unknown>> = []) => {
    const entry = optional(english);
    return { name: entry.name, source: entry.source, effects: [sideEffect], activities: sideActivities };
  };
  source.foundryOptionalfeature!.push(
    optionalSide('Blood Curse of Corrosion', effect('corrosionEffect1', { expiry: 'sourceEnd' }, {}, [{ key: 'statuses.poisoned', mode: 'CUSTOM', value: 'true' }], ['poisoned']), [
      sideActivity('corrosionAct0001', '腐蚀血咒', 'utility', 'corrosionEffect1'),
    ]),
    optionalSide('Blood Curse of the Anxious', effect('anxiousEffect001', { expiry: 'sourceEnd' }, {}, [{ key: 'flags.midi-qol.disadvantage.save.wis', mode: 'OVERRIDE', value: 'true' }], ['frightened']), [
      sideActivity('anxiousAct000001', '焦虑血咒', 'save', 'anxiousEffect001', { save: { ability: ['wis'], dc: { calculation: 'int', formula: '' } }, damage: { onSave: 'none', parts: [] } }),
    ]),
    optionalSide('Rite of the Flame', effect('flameEffect00001', {}, { fvttJsonGenerator: { automation: 'automatic' } }, [{ key: 'system.damage.parts', mode: 'ADD', value: '[["1d6","fire"]]' }], [], 'enchantment'), [
      sideActivity('flameAct00000001', '激活烈焰血仪', 'enchant', 'flameEffect00001'),
    ]),
    optionalSide('Aether', effect('aetherEffect0001', { seconds: 12 }, { dae: { specialDuration: ['shortRest'] }, fvttJsonGenerator: { automation: 'automatic' } }, [{ key: 'system.attributes.movement.fly', mode: 'OVERRIDE', value: '30' }]), [
      sideActivity('aetherAct0000001', '饮用诱变剂：升腾', 'utility', 'aetherEffect0001'),
    ]),
    optionalSide('Alluring', effect('allureEffect0001', { seconds: 12 }, { dae: { specialDuration: ['shortRest'] } }, [{ key: 'system.abilities.cha.check.roll.mode', mode: 'MULTIPLY', value: '2' }])),
    optionalSide('Mobile', effect('mobileEffect0001', {}, { fvttJsonGenerator: { automation: 'automatic' } }, [{ key: 'system.traits.ci.value', mode: 'ADD', value: 'grappled' }])),
  );
  const hybrid = subclass('Hybrid Transformation');
  source.foundrySubclassFeature!.push({
    name: hybrid.name, source: hybrid.source, className: hybrid.className, subclassShortName: hybrid.subclassShortName, level: hybrid.level,
    effects: [effect('hybridEffect0001', {}, {}, [{ key: 'system.attributes.ac.bonus', mode: 4, value: '1' }])],
  });
  const sanguine = classFeature('Sanguine Mastery');
  source.foundryClassFeature!.push({ name: sanguine.name, source: sanguine.source, className: sanguine.className, level: sanguine.level, flags: { fvttJsonGenerator: { automation: 'native' } } });
  return source;
}

function restoreBrokenStartingEquipmentShape(output: NativeBloodHunterPackage): void {
  const system = output.classes[0]!.system as Record<string, any>;
  const root = system.startingEquipment[0]._id;
  const optionA = 'aaaaaaaaaaaaaaaa';
  const optionB = 'bbbbbbbbbbbbbbbb';
  for (const entry of system.startingEquipment.slice(1)) entry.group = optionA;
  system.startingEquipment.splice(1, 0, { type: 'OR', requiresProficiency: false, _id: optionA, group: root, sort: 150000 });
  system.startingEquipment.push(
    { type: 'OR', requiresProficiency: false, _id: optionB, group: root, sort: 1000000 },
    { type: 'currency', key: 'gp', count: 155, requiresProficiency: false, _id: 'cccccccccccccccc', group: optionB, sort: 1100000 },
  );
}
