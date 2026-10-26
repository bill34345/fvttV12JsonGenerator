import { createHash } from 'node:crypto';
import { CUSTOM_CONDITION_IDS } from '@fvtt-json-generator/contracts/conditions';
import { isSourceCandidateReview, isSourceCandidateCounters, sourceOperationStructureErrors } from '@fvtt-json-generator/models/source-operations';
import {NORMALIZED_MONSTER_EMPTY_PATHS,type IntakeFinding,type IntakeValidationResult} from './types';

type Data = Record<string, unknown>;
const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
const COLLECTIONS = ['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions', 'mythicActions'];
const PERIODS = ['day', 'longRest', 'shortRest', 'dawn'];
const DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
const STATUSES = ['dead', 'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'];
const object = (value: unknown): value is Data => !!value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const safeId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(value);
const member = (value: unknown, choices: readonly string[]): boolean => typeof value === 'string' && choices.includes(value);
const pointer = (value: unknown): value is string => typeof value === 'string' && /^\/(?:[^~/]|~[01])*(?:\/(?:[^~/]|~[01])*)*$/u.test(value)
  && !value.split('/').some(part => ['__proto__', 'constructor', 'prototype'].includes(part));
const escapePointer = (value: string): string => value.replace(/~/gu, '~0').replace(/\//gu, '~1');
function dice(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 200 || !/^\s*\d+(?:d\d+)?(?:\s*[+-]\s*\d+(?:d\d+)?)*\s*$/iu.test(value)) return false;
  return (value.match(/\d+(?:d\d+)?/giu) ?? []).every(term => term.toLowerCase().split('d')
    .every(part => Number.isSafeInteger(Number(part)) && Number(part) >= (term.toLowerCase().includes('d') ? 1 : 0)));
}

/** Default import boundary: validate data and reference integrity, never infer
 * rules, facts, omissions, classifications or numerical correctness from prose.
 * Existing AI uncertainties remain AI findings, with their original severity. */
export function validateMonsterIntakeStructure(
  source: string,
  value: unknown,
  options: { coverageRange?: { start: number; end: number } } = {},
): IntakeValidationResult {
  const findings: IntakeFinding[] = [];
  const fail = (code: string, path: string, message: string, origin: IntakeFinding['origin'] = 'schema') => {
    findings.push({ id: `${code.toLowerCase()}:${path}`, code, path, message, origin, blocking: true });
  };
  const invalid = (path: string, message: string) => fail('INVALID_STRUCTURE', path, message);
  const shape = (entry: unknown, path: string, keys: readonly string[]): entry is Data => {
    if (!object(entry)) { invalid(path, 'Expected a plain object.'); return false; }
    for (const key of Object.keys(entry)) if (!keys.includes(key)) fail('UNKNOWN_PROPERTY', `${path}/${escapePointer(key)}`, 'Unsupported field in the closed import contract.');
    return true;
  };
  const number = (entry: unknown, path: string, minimum = Number.MIN_SAFE_INTEGER, integer = true, maximum = Number.MAX_SAFE_INTEGER) => {
    if (typeof entry !== 'number' || !Number.isFinite(entry) || Math.abs(entry) > Number.MAX_SAFE_INTEGER || entry < minimum || entry > maximum || integer && !Number.isSafeInteger(entry)) invalid(path, 'Expected a finite safe number in the supported range.');
  };
  const string = (entry: unknown, path: string, nonempty = true) => {
    if (typeof entry !== 'string' || nonempty && !entry.trim()) invalid(path, nonempty ? 'Expected a nonempty string.' : 'Expected a string.');
  };
  const enumeration = (entry: unknown, path: string, choices: readonly string[]) => { if (!member(entry, choices)) invalid(path, 'Unsupported enum value.'); };
  const boolean = (entry: unknown, path: string) => { if (typeof entry !== 'boolean') invalid(path, 'Expected a boolean.'); };
  const array = (entry: unknown, path: string, check: (entry: unknown, path: string) => void, minimum = 0, maximum = 4096) => {
    if (!Array.isArray(entry) || entry.length < minimum || entry.length > maximum) { invalid(path, 'Expected an array within the supported size.'); return; }
    entry.forEach((item, index) => check(item, `${path}/${index}`));
  };
  const strings = (entry: unknown, path: string, choices?: readonly string[]) => array(entry, path, (item, at) => choices ? enumeration(item, at, choices) : string(item, at));
  const optional = (entry: Data, key: string, path: string, check: (entry: unknown, path: string) => void) => {
    if (entry[key] !== undefined) check(entry[key], `${path}/${key}`);
  };
  const id = (entry: unknown, path: string) => { if (!safeId(entry)) invalid(path, 'Expected a portable identifier using letters, numbers, underscore or hyphen.'); };
  const featureId = (entry: unknown,path:string) => {if(typeof entry!=='string'||!/^\w{16}$/u.test(entry))invalid(path,'Expected a 16-character feature reference accepted by the renderer/parser.');};
  const formula = (entry: unknown, path: string) => { if (!dice(entry)) fail('INVALID_DICE_FORMULA', path, 'Expected a bounded numeric or dice expression.'); };
  const distance = (entry: unknown, path: string) => number(entry, path, 0, false);
  const positive = (entry: unknown, path: string) => number(entry, path, 1);
  const range = options.coverageRange ?? { start: 0, end: source.length };
  if (!object(range) || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end < range.start || range.end > source.length) invalid('/coverageRange', 'Candidate scope must be inside the submitted source.');
  const evidence = (entry: unknown, path: string, extra: readonly string[] = []) => {
    if (!shape(entry, path, ['start', 'end', 'quote', ...extra])) return;
    if (!Number.isSafeInteger(entry.start) || !Number.isSafeInteger(entry.end) || (entry.start as number) < range.start || (entry.end as number) <= (entry.start as number) || (entry.end as number) > range.end) {
      fail('EVIDENCE_OUT_OF_RANGE', path, 'Evidence must be located inside this candidate source scope.', 'evidence'); return;
    }
    if (typeof entry.quote !== 'string' || source.slice(entry.start as number, entry.end as number) !== entry.quote) fail('EVIDENCE_MISMATCH', path, 'Evidence quote does not match its exact source offsets.', 'evidence');
  };
  const evidenceList = (entry: unknown, path: string) => array(entry, path, evidence);
  const recharge = (entry: unknown, path: string) => {
    if (!Array.isArray(entry) || entry.length !== 2 || entry.some(n => !Number.isSafeInteger(n) || n < 1 || n > 6) || entry[1] !== 6 || entry[0] > entry[1]) invalid(path, 'Recharge requires an ordered d6 threshold pair ending at 6.');
  };
  const uses = (entry: unknown, path: string) => {
    if (!shape(entry, path, ['max', 'period'])) return;
    positive(entry.max, `${path}/max`); enumeration(entry.period, `${path}/period`, PERIODS);
  };
  const candidate = (entry: Data, path: string) => {
    if (entry.candidateReview !== undefined && !isSourceCandidateReview(entry.candidateReview)) invalid(`${path}/candidateReview`, 'Invalid inert candidate review metadata.');
    if (entry.candidateCounters !== undefined && !isSourceCandidateCounters(entry.candidateCounters)) invalid(`${path}/candidateCounters`, 'Invalid inert candidate counters.');
  };
  const attack = (entry: unknown, path: string) => {
    if (!shape(entry, path, ['type', 'toHit', 'reach', 'range', 'longRange'])) return;
    enumeration(entry.type, `${path}/type`, ['mwak', 'rwak', 'msak', 'rsak']); number(entry.toHit, `${path}/toHit`);
    for (const key of ['reach', 'range', 'longRange']) optional(entry, key, path, distance);
    if (entry.longRange !== undefined && (entry.range === undefined || (entry.longRange as number) < (entry.range as number))) invalid(`${path}/longRange`, 'Long range requires a normal range and cannot be shorter.');
  };
  const damage = (entry: unknown, path: string) => {
    if (!shape(entry, path, ['formula', 'type', 'types', 'relationship', 'condition'])) return;
    formula(entry.formula, `${path}/formula`); enumeration(entry.type, `${path}/type`, DAMAGE_TYPES);
    enumeration(entry.relationship, `${path}/relationship`, ['base', 'additional', 'replacement', 'conditional']);
    optional(entry, 'condition', path, string);
    if (entry.types !== undefined) {
      strings(entry.types, `${path}/types`, DAMAGE_TYPES);
      if (!Array.isArray(entry.types) || entry.types.length < 2 || new Set(entry.types).size !== entry.types.length || !entry.types.includes(entry.type)) invalid(`${path}/types`, 'Damage choices must be distinct and contain the selected damage type.');
    }
  };
  const healing = (entry: unknown, path: string) => {
    if (!shape(entry, path, ['formula', 'type', 'target'])) return;
    formula(entry.formula, `${path}/formula`); enumeration(entry.type, `${path}/type`, ['healing', 'temphp']);
    if (entry.target !== undefined && shape(entry.target, `${path}/target`, ['type', 'count', 'special'])) {
      enumeration(entry.target.type, `${path}/target/type`, ['self', 'creature']);
      if (entry.target.count !== 1) invalid(`${path}/target/count`, 'Healing targets one recipient.');
      string(entry.target.special, `${path}/target/special`, false);
    }
  };
  const area = (entry: unknown, path: string) => {
    if (!shape(entry, path, ['shape', 'radius'])) return;
    enumeration(entry.shape, `${path}/shape`, ['sphere', 'radius', 'cone', 'line', 'cube', 'cylinder', 'rectangle']);
    distance(entry.radius, `${path}/radius`);
    if (entry.radius === 0) invalid(`${path}/radius`, 'Area size must be positive.');
  };
  const statuses = (entry: unknown, path: string, choices: readonly string[] = STATUSES) => {
    strings(entry, path, choices);
    if (Array.isArray(entry) && new Set(entry).size !== entry.length) invalid(path, 'Statuses must be distinct.');
  };
  const featureIds = new Set<string>();
  const feature = (entry: unknown, path: string) => {
    if (!shape(entry, path, ['candidateReview', 'candidateCounters', 'sourceFeatureId', 'sourceOperations', 'sourceContext', 'executionMode', 'nativeRuleText', 'manualRemainder', 'spellUseRecords', 'gmTriggeredSave', 'nativeFailureStatuses', 'name', 'englishName', 'sourceQualifier', 'description', 'evidence', 'activityType', 'activationType', 'activationCondition', 'range', 'targetSpecial', 'attack', 'damage', 'healing', 'save', 'aoe', 'appliedConditions', 'recharge', 'uses', 'legendaryCost'])) return;
    candidate(entry, path); string(entry.name, `${path}/name`); string(entry.description, `${path}/description`);
    for (const key of ['englishName', 'sourceQualifier', 'nativeRuleText', 'manualRemainder', 'activationCondition', 'targetSpecial']) optional(entry, key, path, string);
    optional(entry, 'sourceContext', path, strings); optional(entry, 'evidence', path, evidenceList);
    if (entry.sourceFeatureId !== undefined) {
      featureId(entry.sourceFeatureId, `${path}/sourceFeatureId`);
      if (typeof entry.sourceFeatureId === 'string') {
        if (featureIds.has(entry.sourceFeatureId)) invalid(`${path}/sourceFeatureId`, 'Feature identifiers must be unique.');
        featureIds.add(entry.sourceFeatureId);
      }
    }
    optional(entry, 'activityType', path, (e, p) => enumeration(e, p, ['attack', 'save', 'damage', 'heal', 'utility']));
    optional(entry, 'activationType', path, (e, p) => enumeration(e, p, ['action', 'bonus', 'reaction', 'legendary', 'special']));
    optional(entry, 'executionMode', path, (e, p) => enumeration(e, p, ['gm-manual', 'native-with-gm']));
    if(entry.executionMode==='native-with-gm'){
      string(entry.nativeRuleText,`${path}/nativeRuleText`);string(entry.manualRemainder,`${path}/manualRemainder`);
      if(Array.isArray(entry.appliedConditions)&&entry.appliedConditions.length)invalid(`${path}/appliedConditions`,'Mixed native/GM features cannot carry embedded condition effects; keep the basic operation and complete GM consequence.');
    }
    if(entry.uses!==undefined&&entry.recharge!==undefined)invalid(path,'A feature cannot carry both an independent use pool and recharge.');
    optional(entry, 'range', path, distance); optional(entry, 'attack', path, attack);
    optional(entry, 'damage', path, (e, p) => array(e, p, damage, 1, 12)); optional(entry, 'healing', path, healing);
    optional(entry, 'aoe', path, area); optional(entry, 'uses', path, uses); optional(entry, 'recharge', path, recharge); optional(entry, 'legendaryCost', path, positive);
    optional(entry, 'save', path, (e, p) => {
      if (!shape(e, p, ['dc', 'ability', 'condition', 'dcSourceKind', 'outcome'])) return;
      positive(e.dc, `${p}/dc`); enumeration(e.ability, `${p}/ability`, ABILITIES); optional(e, 'condition', p, string);
      optional(e, 'dcSourceKind', p, (v, at) => enumeration(v, at, ['spellcasting', 'literal'])); optional(e, 'outcome', p, (v, at) => enumeration(v, at, ['none', 'half', 'full']));
    });
    optional(entry, 'appliedConditions', path, (e, p) => array(e, p, (condition, at) => {
      if (!shape(condition, at, ['statuses', 'escapeDc', 'condition', 'duration', 'staged'])) return;
      statuses(condition.statuses, `${at}/statuses`, [...STATUSES, 'exhaustion', 'exhausted', 'diseased', ...CUSTOM_CONDITION_IDS]); optional(condition, 'escapeDc', at, positive); optional(condition, 'condition', at, string); optional(condition, 'duration', at, string); optional(condition, 'staged', at, boolean);
    }));
    optional(entry, 'spellUseRecords', path, (e, p) => array(e, p, (record, at) => {
      if (!shape(record, at, ['name', 'max', 'period'])) return;
      string(record.name, `${at}/name`); positive(record.max, `${at}/max`); enumeration(record.period, `${at}/period`, ['day']);
    }));
    optional(entry, 'nativeFailureStatuses', path, statuses);
    optional(entry, 'gmTriggeredSave', path, (e, p) => {
      if (!shape(e, p, ['dc', 'ability', 'trigger', 'sourceText', 'failureStatuses'])) return;
      positive(e.dc, `${p}/dc`); enumeration(e.ability, `${p}/ability`, ABILITIES); string(e.trigger, `${p}/trigger`); string(e.sourceText, `${p}/sourceText`); statuses(e.failureStatuses, `${p}/failureStatuses`);
    });
    if (entry.sourceOperations !== undefined) {
      for (const field of ['attack', 'save', 'damage', 'healing', 'aoe', 'range', 'targetSpecial', 'appliedConditions', 'spellUseRecords', 'gmTriggeredSave', 'nativeFailureStatuses']) {
        if (entry[field] !== undefined) fail('CONFLICTING_SOURCE_OPERATION_CARRIER', `${path}/${field}`, 'Source operations exclusively own the executable fields of their carrier.');
      }
      if (entry.activityType !== undefined && entry.activityType !== 'utility') fail('CONFLICTING_SOURCE_OPERATION_CARRIER', `${path}/activityType`, 'A source-operation carrier uses Utility; each child declares its own activity type.');
      for (const error of sourceOperationStructureErrors(entry.sourceOperations)) invalid(`${path}/sourceOperations/${error}`, 'Invalid supported operation structure.');
      if (Array.isArray(entry.sourceOperations)) entry.sourceOperations.forEach((op, index) => {
        if (object(op) && op.evidence !== undefined) evidence(op.evidence, `${path}/sourceOperations/${index}/evidence`);
      });
      if (entry.executionMode !== 'native-with-gm') invalid(`${path}/executionMode`, 'Independent source operations require the explicit GM execution boundary.');
    }
    if (entry.executionMode === 'gm-manual' && (entry.activityType !== 'utility' || ['attack', 'save', 'damage', 'healing', 'aoe', 'range', 'targetSpecial', 'appliedConditions', 'sourceOperations', 'gmTriggeredSave', 'nativeFailureStatuses'].some(key => entry[key] !== undefined))) invalid(path, 'Manual features cannot carry executable native mechanics.');
    if ((entry.gmTriggeredSave !== undefined || entry.nativeFailureStatuses !== undefined) && entry.executionMode !== 'native-with-gm') invalid(`${path}/executionMode`, 'GM native mechanics require the explicit execution boundary.');
    if (entry.sourceOperations === undefined && (entry.activityType === 'attack' && entry.attack === undefined || entry.activityType === 'save' && entry.save === undefined || entry.activityType === 'damage' && entry.damage === undefined || entry.activityType === 'heal' && entry.healing === undefined)) invalid(`${path}/activityType`, 'The selected activity requires its typed mechanics.');
  };

  const groupIds = new Set<string>(), spellIds = new Set<string>();
  const spellRefs: Array<{ groupId: unknown; group: Data; ref: Data; path: string; usage: unknown }> = [];
  const spellGroup = (entry: unknown, path: string) => {
    if (!shape(entry, path, ['candidateReview', 'candidateCounters', 'manualGrants', 'activationType', 'recharge', 'legendaryCost', 'groupId', 'featureName', 'featureEnglishName', 'description', 'evidence', 'ability', 'abilityEvidence', 'casterLevel', 'casterLevelEvidence', 'saveDc', 'saveDcEvidence', 'attackBonus', 'attackBonusEvidence', 'componentWaivers', 'usageGroups'])) return;
    candidate(entry, path); id(entry.groupId, `${path}/groupId`);
    if (typeof entry.groupId === 'string') { if (groupIds.has(entry.groupId) || spellIds.has(entry.groupId)) invalid(`${path}/groupId`, 'Spellcasting identifiers must be unique.'); groupIds.add(entry.groupId); }
    string(entry.featureName, `${path}/featureName`); optional(entry, 'featureEnglishName', path, string); string(entry.description, `${path}/description`);
    enumeration(entry.ability, `${path}/ability`, ABILITIES); evidenceList(entry.evidence, `${path}/evidence`); evidenceList(entry.abilityEvidence, `${path}/abilityEvidence`);
    for (const key of ['casterLevelEvidence', 'saveDcEvidence', 'attackBonusEvidence', 'manualGrants']) optional(entry, key, path, evidenceList);
    optional(entry, 'casterLevel', path, positive); optional(entry, 'saveDc', path, positive); optional(entry, 'attackBonus', path, number);
    optional(entry, 'activationType', path, (e, p) => enumeration(e, p, ['action', 'bonus', 'reaction', 'legendary'])); optional(entry, 'recharge', path, recharge); optional(entry, 'legendaryCost', path, positive);
    array(entry.componentWaivers, `${path}/componentWaivers`, (waiver, at) => {
      if (!shape(waiver, at, ['component', 'evidence'])) return;
      enumeration(waiver.component, `${at}/component`, ['material']); evidenceList(waiver.evidence, `${at}/evidence`);
    });
    array(entry.usageGroups, `${path}/usageGroups`, (usage, at) => {
      if (!object(usage)) { invalid(at, 'Expected a spell usage group.'); return; }
      const daily = member(usage.usage, ['daily-each', 'daily-shared']), slots = usage.usage === 'prepared-slots';
      shape(usage, at, ['usage', 'evidence', 'spellRefs', ...(daily ? ['count'] : []), ...(slots ? ['level', 'levelEvidence', 'slots', 'slotsEvidence'] : [])]);
      enumeration(usage.usage, `${at}/usage`, ['at-will', '1/day-each', 'daily-each', 'daily-shared', 'prepared-cantrip', 'prepared-slots']); evidenceList(usage.evidence, `${at}/evidence`);
      if (daily) positive(usage.count, `${at}/count`);
      if (slots) { number(usage.level, `${at}/level`, 1, true, 9); positive(usage.slots, `${at}/slots`); evidenceList(usage.levelEvidence, `${at}/levelEvidence`); evidenceList(usage.slotsEvidence, `${at}/slotsEvidence`); }
      array(usage.spellRefs, `${at}/spellRefs`, (ref, refPath) => {
        if (!shape(ref, refPath, ['refId', 'identifier', 'originalName', 'englishName', 'chineseName', 'aliases', 'restrictions', 'evidence', 'reuseOf'])) return;
        id(ref.refId, `${refPath}/refId`);
        // This is a spell lookup name as well as a slug, not a document ID.
        string(ref.identifier, `${refPath}/identifier`);
        if (typeof ref.refId === 'string') { if (spellIds.has(ref.refId) || groupIds.has(ref.refId)) invalid(`${refPath}/refId`, 'Spellcasting identifiers must be unique.'); spellIds.add(ref.refId); }
        string(ref.originalName, `${refPath}/originalName`); optional(ref, 'englishName', refPath, string); optional(ref, 'chineseName', refPath, string); strings(ref.aliases, `${refPath}/aliases`); evidenceList(ref.evidence, `${refPath}/evidence`);
        optional(ref, 'reuseOf', refPath, (reuse, p) => { if (!shape(reuse, p, ['groupId', 'refId'])) return; id(reuse.groupId, `${p}/groupId`); id(reuse.refId, `${p}/refId`); });
        array(ref.restrictions, `${refPath}/restrictions`, (restriction, p) => {
          if (!shape(restriction, p, ['kind', 'text', 'value', 'evidence'])) return;
          enumeration(restriction.kind, `${p}/kind`, ['target', 'summoning', 'casting', 'other']); string(restriction.text, `${p}/text`); evidenceList(restriction.evidence, `${p}/evidence`);
          if (restriction.value !== undefined && !['string', 'number', 'boolean'].includes(typeof restriction.value)) invalid(`${p}/value`, 'Restriction values must be scalar data.');
          if (typeof restriction.value === 'number') number(restriction.value, `${p}/value`, Number.MIN_SAFE_INTEGER, false);
        });
        spellRefs.push({ groupId: entry.groupId, group: entry, ref, path: refPath, usage: usage.usage });
      }, 1);
    });
  };

  // Values/candidates/proposals are inert JSON data too: no functions, special
  // objects, cycles, nonfinite numbers or prototype-bearing keys may hide there.
  const ancestors = new Set<object>();
  let nodes = 0;
  const data = (entry: unknown, path: string, depth: number): boolean => {
    if (++nodes > 100000 || depth > 64) { invalid(path, 'Import data exceeds the supported nesting or size.'); return false; }
    if (entry === null || entry === undefined || typeof entry === 'string' || typeof entry === 'boolean') return true;
    if (typeof entry === 'number') { if (!Number.isFinite(entry) || Math.abs(entry) > Number.MAX_SAFE_INTEGER) invalid(path, 'Expected a finite safe JSON number.'); return true; }
    if ((!object(entry) && !Array.isArray(entry)) || ancestors.has(entry)) { invalid(path, 'Expected inert acyclic JSON data.'); return false; }
    ancestors.add(entry);
    let valid = true;
    for (const [key, child] of Object.entries(entry)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) { invalid(`${path}/${key}`, 'Prototype keys are not permitted.'); valid = false; }
      else if (!data(child, `${path}/${escapePointer(key)}`, depth + 1)) valid = false;
    }
    ancestors.delete(entry);
    return valid;
  };
  if (!data(value, '', 0) || !shape(value, '', ['schemaVersion', 'source', 'creature', 'claims', 'coverage', 'uncertainties', 'normalizedEmptyFields'])) return { findings, blocking: findings, warnings: [] };
  if(value.normalizedEmptyFields!==undefined){
    array(value.normalizedEmptyFields,'/normalizedEmptyFields',(entry,path)=>enumeration(entry,path,NORMALIZED_MONSTER_EMPTY_PATHS),0,NORMALIZED_MONSTER_EMPTY_PATHS.length);
    if(Array.isArray(value.normalizedEmptyFields))for(const path of new Set(value.normalizedEmptyFields))if(typeof path==='string'&&NORMALIZED_MONSTER_EMPTY_PATHS.includes(path as typeof NORMALIZED_MONSTER_EMPTY_PATHS[number])){
      findings.push({id:'normalized-empty:'+path,code:'EMPTY_FIELD_NORMALIZED',path,
        message:'提取结果未提供此栏，已按空容器继续；这不代表已确认原文没有此项，请核对来源。',blocking:false,origin:'schema'});
    }
  }
  if (value.schemaVersion !== 1) fail('UNSUPPORTED_SCHEMA_VERSION', '/schemaVersion', 'schemaVersion must be 1.');
  if (shape(value.source, '/source', ['sha256', 'length'])) {
    if (value.source.sha256 !== createHash('sha256').update(source).digest('hex')) fail('SOURCE_HASH_MISMATCH', '/source/sha256', 'IR identity does not match the submitted source.', 'evidence');
    if (value.source.length !== source.length) fail('SOURCE_LENGTH_MISMATCH', '/source/length', 'IR length does not match the submitted UTF-16 source.', 'evidence');
  }
  const creature = value.creature;
  if (shape(creature, '/creature', ['candidateReview', 'sourceResourcePools', 'identity', 'abilities', 'attributes', 'saves', 'skills', 'defenses', 'senses', 'languages', 'biography', 'legendary', 'spellcasting', ...COLLECTIONS])) {
    candidate(creature, '/creature');
    if (shape(creature.identity, '/creature/identity', ['name', 'englishName', 'size', 'swarmSize', 'creatureType', 'creatureTypeCustom', 'sourceSize', 'alignment'])) {
      string(creature.identity.name, '/creature/identity/name'); enumeration(creature.identity.size, '/creature/identity/size', SIZES); string(creature.identity.creatureType, '/creature/identity/creatureType');
      optional(creature.identity, 'swarmSize', '/creature/identity', (e, p) => enumeration(e, p, SIZES));
      for (const key of ['englishName', 'creatureTypeCustom', 'sourceSize', 'alignment']) optional(creature.identity, key, '/creature/identity', string);
    }
    if (shape(creature.abilities, '/creature/abilities', ABILITIES)) for (const ability of ABILITIES) number(creature.abilities[ability], `/creature/abilities/${ability}`, 1, true, 30);
    if (shape(creature.attributes, '/creature/attributes', ['ac', 'acKind', 'acNote', 'initiative', 'hp', 'movement', 'cr', 'xp', 'proficiencyBonus'])) {
      const attributes = creature.attributes;
      number(attributes.ac, '/creature/attributes/ac', 0); number(attributes.cr, '/creature/attributes/cr', 0, false);
      optional(attributes, 'acKind', '/creature/attributes', (e, p) => enumeration(e, p, ['flat', 'natural', 'default'])); optional(attributes, 'acNote', '/creature/attributes', string); optional(attributes, 'initiative', '/creature/attributes', number);
      optional(attributes, 'xp', '/creature/attributes', (e, p) => number(e, p, 0)); optional(attributes, 'proficiencyBonus', '/creature/attributes', (e, p) => number(e, p, 0));
      if (shape(attributes.hp, '/creature/attributes/hp', ['value', 'formula'])) { positive(attributes.hp.value, '/creature/attributes/hp/value'); optional(attributes.hp, 'formula', '/creature/attributes/hp', formula); }
      if (shape(attributes.movement, '/creature/attributes/movement', ['walk', 'climb', 'fly', 'swim', 'burrow', 'hover'])) { for (const key of ['walk', 'climb', 'fly', 'swim', 'burrow']) optional(attributes.movement, key, '/creature/attributes/movement', distance); optional(attributes.movement, 'hover', '/creature/attributes/movement', boolean); }
    }
    if (shape(creature.saves, '/creature/saves', ABILITIES)) for (const [key, entry] of Object.entries(creature.saves)) number(entry, `/creature/saves/${key}`);
    if (!object(creature.skills)) invalid('/creature/skills', 'Expected a skill bonus record.');
    else for (const [key, entry] of Object.entries(creature.skills)) { if (!text(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) invalid(`/creature/skills/${escapePointer(key)}`, 'Invalid skill key.'); number(entry, `/creature/skills/${escapePointer(key)}`); }
    if (shape(creature.defenses, '/creature/defenses', ['resistances', 'immunities', 'vulnerabilities', 'vulnerabilitiesCustom', 'conditionImmunities'])) {
      for (const key of ['resistances', 'immunities', 'vulnerabilities', 'conditionImmunities']) strings(creature.defenses[key], `/creature/defenses/${key}`);
      optional(creature.defenses,'vulnerabilitiesCustom','/creature/defenses',(entry,path)=>string(entry,path,false));
    }
    if (shape(creature.senses, '/creature/senses', ['darkvision', 'blindsight', 'tremorsense', 'truesight', 'passivePerception', 'special'])) { for (const key of ['darkvision', 'blindsight', 'tremorsense', 'truesight', 'passivePerception']) optional(creature.senses, key, '/creature/senses', distance); optional(creature.senses, 'special', '/creature/senses', string); }
    if (shape(creature.languages, '/creature/languages', ['values', 'custom'])) { strings(creature.languages.values, '/creature/languages/values'); optional(creature.languages, 'custom', '/creature/languages', string); }
    optional(creature, 'biography', '/creature', (e, p) => string(e, p, false));
    optional(creature, 'legendary', '/creature', (entry, path) => {
      if (!shape(entry, path, ['max', 'lairMax', 'recovery', 'resistanceMax', 'resistanceLairMax', 'preamble', 'evidence'])) return;
      positive(entry.max, `${path}/max`); optional(entry, 'lairMax', path, positive); optional(entry, 'recovery', path, (e, p) => enumeration(e, p, ['own-turn-start'])); string(entry.preamble, `${path}/preamble`); evidenceList(entry.evidence, `${path}/evidence`);
      if (entry.lairMax !== undefined && entry.lairMax !== (entry.max as number) + 1) invalid(`${path}/lairMax`, 'Native lair capacity is the base capacity plus one.');
      optional(entry,'resistanceMax',path,positive);
      if(entry.lairMax!==undefined&&entry.resistanceMax!==undefined&&entry.resistanceLairMax===undefined)
        invalid(`${path}/resistanceLairMax`,'Native lair mode increases both legendary action and resistance capacities; an explicit resistance lair capacity is required.');
      if(entry.resistanceLairMax!==undefined){
        if(entry.resistanceMax===undefined)positive(entry.resistanceMax,`${path}/resistanceMax`);
        positive(entry.resistanceLairMax,`${path}/resistanceLairMax`);
        if(entry.lairMax===undefined||entry.recovery!=='own-turn-start'||entry.resistanceLairMax!==(entry.resistanceMax as number)+1)
          invalid(`${path}/resistanceLairMax`,'The native resistance lair ledger requires both explicit capacities and the existing lair mode.');
      }
    });
    for (const collection of COLLECTIONS) if (collection !== 'mythicActions' || creature[collection] !== undefined) array(creature[collection], `/creature/${collection}`, feature);
    optional(creature, 'spellcasting', '/creature', (e, p) => array(e, p, spellGroup));
    for (const entry of spellRefs) if (object(entry.ref.reuseOf)) {
      const reuse = entry.ref.reuseOf, target = spellRefs.find(other => other.groupId === reuse.groupId && other.ref.refId === reuse.refId);
      const profile = (group: Data) => JSON.stringify([group.ability, group.saveDc, group.attackBonus,
        Array.isArray(group.componentWaivers) ? group.componentWaivers.map(waiver => object(waiver) ? waiver.component : null) : null]);
      const identity = (spell: Data) => JSON.stringify([spell.identifier, spell.originalName, spell.englishName, spell.chineseName, spell.aliases,
        Array.isArray(spell.restrictions) ? spell.restrictions.map(restriction => object(restriction) ? [restriction.kind, restriction.text, restriction.value] : null) : null]);
      if (!target || target.groupId === entry.groupId || target.ref.reuseOf !== undefined || entry.usage !== 'at-will' || target.usage !== 'at-will'
        || entry.group.recharge !== undefined || target.group.recharge !== undefined || profile(entry.group) !== profile(target.group) || identity(entry.ref) !== identity(target.ref)) invalid(`${entry.path}/reuseOf`, 'Spell reuse requires one other at-will definition with the same identity and profile, without chained links or extra resource pools.');
    }
    const usedMembers = new Set<string>(), poolIds = new Set<string>();
    optional(creature, 'sourceResourcePools', '/creature', (e, p) => array(e, p, (pool, path) => {
      if (!shape(pool, path, ['id', 'name', 'max', 'period', 'members', 'evidence'])) return;
      id(pool.id, `${path}/id`); string(pool.name, `${path}/name`); positive(pool.max, `${path}/max`); enumeration(pool.period, `${path}/period`, PERIODS); evidenceList(pool.evidence, `${path}/evidence`);
      if (typeof pool.id === 'string') { if (poolIds.has(pool.id)) invalid(`${path}/id`, 'Pool identifiers must be unique.'); poolIds.add(pool.id); }
      array(pool.members, `${path}/members`, (entry, at) => {
        if (!shape(entry, at, ['collection', 'index', 'featureId', 'cost'])) return;
        enumeration(entry.collection, `${at}/collection`, COLLECTIONS); number(entry.index, `${at}/index`, 0); featureId(entry.featureId, `${at}/featureId`);
        if (entry.cost !== 1) invalid(`${at}/cost`, 'Shared native pools support a fixed cost of one.');
        const collection = typeof entry.collection === 'string' ? creature[entry.collection] : undefined;
        const feature = Array.isArray(collection) && Number.isSafeInteger(entry.index) ? collection[entry.index as number] : undefined;
        if (!object(feature) || feature.sourceFeatureId !== entry.featureId || usedMembers.has(String(entry.featureId))) invalid(at, 'Pool member must refer to one unique existing feature.');
        else {
          usedMembers.add(String(entry.featureId));
          if (!object(feature.uses) || feature.uses.max !== pool.max || feature.uses.period !== pool.period || feature.recharge !== undefined) invalid(at, 'Member counter must agree with its single shared native pool.');
        }
      }, 2);
    }));
  }

  const resolve = (path: unknown): boolean => {
    if (!pointer(path) || path !== '/creature' && !path.startsWith('/creature/')) return false;
    let current: unknown = value;
    for (const part of path.slice(1).split('/').map(part => part.replace(/~1/gu, '/').replace(/~0/gu, '~'))) {
      if ((!object(current) && !Array.isArray(current)) || !Object.hasOwn(current, part)) return false;
      current = (current as Data)[part];
    }
    return true;
  };
  const claimPaths = new Set<string>();
  array(value.claims, '/claims', (claim, path) => {
    if (!shape(claim, path, ['path', 'valueKind', 'evidence', 'confidence', 'value', 'decisionId'])) return;
    if (!resolve(claim.path)) fail('INVALID_CLAIM_PATH', `${path}/path`, 'Claim must reference an existing creature field.');
    if (typeof claim.path === 'string') claimPaths.add(claim.path);
    enumeration(claim.valueKind, `${path}/valueKind`, ['explicit', 'derived', 'preserved-literal', 'user-confirmed']); enumeration(claim.confidence, `${path}/confidence`, ['high', 'medium', 'low']); evidenceList(claim.evidence, `${path}/evidence`); optional(claim, 'decisionId', path, id);
  });
  array(value.coverage, '/coverage', (entry, path) => {
    if (!object(entry)) { invalid(path, 'Expected a coverage record.'); return; }
    evidence(entry, path, ['classification', 'claimPaths', 'reason']); enumeration(entry.classification, `${path}/classification`, ['mechanical', 'narrative', 'ignored-with-reason']);
    array(entry.claimPaths, `${path}/claimPaths`, (reference, at) => { if (typeof reference !== 'string' || !claimPaths.has(reference)) invalid(at, 'Coverage references an unknown claim path.'); });
    optional(entry, 'reason', path, string);
    if (entry.classification === 'ignored-with-reason' && !text(entry.reason)) invalid(`${path}/reason`, 'An ignored coverage record requires a reason.');
  });
  const uncertaintyIds = new Set<string>();
  array(value.uncertainties, '/uncertainties', (entry, path) => {
    if (!shape(entry, path, ['id', 'code', 'path', 'message', 'blocking', 'evidence', 'candidates'])) return;
    // Finding IDs may be existing colon/slash based stable IDs, unlike executable IDs.
    string(entry.id, `${path}/id`); string(entry.code, `${path}/code`); string(entry.message, `${path}/message`); boolean(entry.blocking, `${path}/blocking`); evidenceList(entry.evidence, `${path}/evidence`);
    if (!pointer(entry.path)) invalid(`${path}/path`, 'Expected a JSON Pointer.');
    if (typeof entry.id === 'string') { if (uncertaintyIds.has(entry.id)) invalid(`${path}/id`, 'Uncertainty identifiers must be unique.'); uncertaintyIds.add(entry.id); }
    if (entry.candidates !== undefined && !Array.isArray(entry.candidates)) invalid(`${path}/candidates`, 'Candidates must be an array of inert data.');
    if (text(entry.id) && text(entry.code) && pointer(entry.path) && text(entry.message) && typeof entry.blocking === 'boolean') findings.push({ id: entry.id, code: entry.code, path: entry.path, message: entry.message, blocking: entry.blocking, origin: 'ai-review', evidence: entry.evidence as IntakeFinding['evidence'], ...(entry.candidates === undefined ? {} : { candidates: entry.candidates as unknown[] }) });
  });
  return { findings, blocking: findings.filter(f => f.blocking), warnings: findings.filter(f => !f.blocking) };
}
