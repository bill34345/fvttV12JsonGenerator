import { sha256 } from '../../../src/core/spell-resolution';
import { assertNativeCacheProjectionMatches } from './native-cache-lifecycle';

export interface ConditionalDamagePlan {
  expected: Record<string, any>;
  updates: Record<string, unknown>;
  sourceRule?: string;
  manualActivityId?: string;
}

/** A deliberately closed 2024 source grammar. This does not decide whether
 * a creature is Charmed, disobeyed a command, or has already taken damage today.
 * Only an owned cache is adapted; its selected Compendium source stays intact.
 */
export function planSpellConditionalDamage(
  nativeSource: Record<string, any>,
  cacheSource: Record<string, any>,
  options: { systemVersion?: string; preserveExisting?: boolean; midiVersion?: string } = {},
): ConditionalDamagePlan {
  const expected = structuredClone(cacheSource);
  const updates: Record<string, unknown> = {};
  const unchanged = { expected, updates };
  if(options.systemVersion!=='5.3.3')return unchanged;
  if (nativeSource.type !== 'spell' || nativeSource.system?.source?.rules !== '2024') return unchanged;

  const texts = [nativeSource.flags?.babele?.originalPayload?.description, nativeSource.system?.description?.value]
    .filter((value): value is string => typeof value === 'string');
  const paragraphs = [...new Set(texts.flatMap(text => text.replace(/<\/p\s*>/giu, '\n')
    .split(/\r?\n/u).map(value => value.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim()).filter(Boolean)))];
  const candidates = paragraphs.filter(text => /^While Charmed, the creature takes /iu.test(text)
    && /directly counter to your command/iu.test(text));
  if (!candidates.length) return unchanged;
  if (candidates.length !== 1) throw Error('Conditional Spell damage requires one complete unambiguous source rule.');
  const rule = candidates[0]!;
  const match = /^While Charmed, the creature takes \[\[\/damage ([1-9]\d*)d([1-9]\d*) type=(psychic)\]\] damage if it acts in a manner directly counter to your command\. It takes this damage no more than once each day\.$/iu.exec(rule);
  if (!match) throw Error('Unreviewed conditional Spell damage wording must remain blocked for GM review.');
  if (options.midiVersion !== undefined && options.midiVersion !== '14.0.11') {
    throw Error('Conditional Spell damage isolation requires the reviewed Midi14.0.11 adapter.');
  }
  const sourceUuid = nativeSource._stats?.compendiumSource;
  if (typeof sourceUuid !== 'string' || !/^Compendium\.[\w-]+\.[\w-]+\.Item\.[A-Za-z0-9]{16}$/u.test(sourceUuid)) {
    throw Error('Conditional Spell damage requires the exact selected Compendium provenance.');
  }
  const nativeActivities = nativeSource.system?.activities;
  if (!record(nativeActivities) || Object.keys(nativeActivities).length !== 1) {
    throw Error('Conditional Spell damage requires one reviewed native Save Activity.');
  }
  const [saveId, nativeSave] = Object.entries(nativeActivities)[0]!;
  const part = nativeSave?.damage?.parts?.[0];
  if (!/^[A-Za-z0-9]{16}$/u.test(saveId) || nativeSave?.type !== 'save'
    || nativeSave.damage?.parts?.length !== 1 || part?.number !== Number(match[1])
    || part?.denomination !== Number(match[2]) || part?.custom?.enabled === true || part?.bonus
    || part?.types?.length !== 1 || part.types[0] !== match[3]!.toLowerCase()
    || part.scaling?.mode || nativeSave.damage.onSave !== 'none'
    || !Array.isArray(nativeSave.save?.ability) || nativeSave.save.ability.length !== 1 || nativeSave.save.ability[0] !== 'wis'
    || !Array.isArray(nativeSave.effects) || nativeSave.effects.length !== 1
    || !nativeSource.effects?.some((effect:any)=>effect._id===nativeSave.effects[0]?._id
      &&effect.type==='base'&&effect.transfer===false&&effect.statuses?.includes('charmed'))) {
    throw Error('Conditional Spell damage does not match its complete source dice and Save structure.');
  }
  const current = expected.system?.activities?.[saveId];
  if (!record(current)) throw Error('Owned conditional Spell lost its source Save Activity.');
  assertProjection({ type: 'save', save: nativeSave.save, effects: nativeSave.effects }, current);
  const manualId = sha256(JSON.stringify(['resolver-conditional-damage-v1', sourceUuid, saveId, rule])).slice(0, 16);
  const note = '<p>GM manual conditional damage: this damage is not part of casting the spell. '
    + 'The GM decides whether the complete source condition is satisfied and tracks its per-creature daily limit.</p><p>'
    + escapeHtml(rule) + '</p>';
  const manual: Record<string, any> = {
    _id: manualId, type: 'damage', name: 'GM：违令条件伤害 / Conditional damage', sort: (nativeSave.sort ?? 0) + 100000,
    // Native 5.3.3 StringField has an own undefined default in live toObject().
    // Store the complete proven rule as its displayed Trigger explanation;
    // no Midi useCondition or automatic trigger is introduced.
    activation: { type: 'special', value: null, condition: rule, override: true },
    consumption: { spellSlot: false, targets: [], scaling: { allowed: false, max: '' } },
    uses: { max: '', spent: 0, recovery: [] },
    description: { chatFlavor: note },
    duration: { units: 'inst', override: true, concentration: false },
    range:{override:true,units:'spec',special:'GM: resolve the complete source condition; the casting range does not limit later conditional damage.'},
    target: { override: true, prompt: false, affects: { type: 'creature', count: '1', choice: false, special: '' },
      template:{type:'',count:'',size:'',width:'',height:'',units:'ft',contiguous:false,stationary:false} },
    effects:[],
    damage: { critical: { allow: false, bonus: '' }, parts: structuredClone(nativeSave.damage.parts) },
  };
  if (options.midiVersion) setIndependentMidi(manual);
  const existingManual = expected.system.activities[manualId];
  const remainingParts = current.damage?.parts;
  if (Array.isArray(remainingParts) && remainingParts.length === 0 && existingManual) {
    // Keep user text elsewhere, but never accept damage, consumption, linkage,
    // or timing changes to the executable conditional operation.
    assertCompleteManualProjection(manual, existingManual, options.midiVersion!==undefined);
    const saveDamage=structuredClone(nativeSave.damage);saveDamage.parts=[];
    assertProjection(saveDamage,current.damage);
    assertProjection(current.damage,saveDamage);
    if (options.midiVersion) assertIndependentMidi(current);
    return { ...unchanged, sourceRule: rule, manualActivityId: manualId };
  }
  if (existingManual) throw Error('Conditional damage Activity identity collides with an existing cache Activity.');
  assertProjection(nativeSave.damage, current.damage);
  assertProjection(current.damage,nativeSave.damage);
  if (options.preserveExisting) {
    throw Error('Keep cannot silently separate an existing mixed conditional Spell; choose Overwrite after review.');
  }
  current.damage.parts = [];
  updates[`system.activities.${saveId}.damage.parts`] = [];
  const flavor = current.description?.chatFlavor ?? '';
  if (typeof flavor !== 'string') throw Error('Conditional Spell source usage notes must remain native text.');
  current.description ??= {};
  current.description.chatFlavor = flavor ? flavor + '\n' + note : note;
  updates[`system.activities.${saveId}.description.chatFlavor`] = current.description.chatFlavor;
  if (options.midiVersion) {
    setIndependentMidi(current);
    if(current.otherActivityId!==undefined)updates[`system.activities.${saveId}.otherActivityId`] = current.otherActivityId;
    for (const key of ['otherActivityCompatible', 'triggeredActivityId'] as const) {
      updates[`system.activities.${saveId}.midiProperties.${key}`] = current.midiProperties[key];
    }
  }
  expected.system.activities[manualId] = manual;
  updates[`system.activities.${manualId}`] = manual;
  return { expected, updates, sourceRule: rule, manualActivityId: manualId };
}

function setIndependentMidi(activity: Record<string, any>): void {
  // Midi Damage has no otherActivityId schema. A Save may retain this field
  // from its official source; undefined and none both disable the getter.
  if('otherActivityId'in activity)activity.otherActivityId = 'none';
  activity.midiProperties = { ...activity.midiProperties, otherActivityCompatible: false, triggeredActivityId: 'none' };
  if(activity.type==='damage')activity.midiProperties.automationOnly=false;
  if (activity.type === 'damage') activity.midiProperties.removeChatButtons = 'none';
}

function assertIndependentMidi(activity: Record<string, any>): void {
  if (activity.otherActivityId !== undefined&&activity.otherActivityId !== 'none' || activity.midiProperties?.otherActivityCompatible !== false
    || activity.midiProperties?.triggeredActivityId !== 'none') {
    throw Error('Conditional Spell Save must not automatically link another Activity.');
  }
}

/** Exact5.3.3/Midi14.0.11 source defaults, not an arbitrary extra-field drop.
 * Compare in both directions so adding effects, a template, consumption,
 * damage scaling, a macro, or a Midi trigger cannot hide behind sparse input.
 */
function assertCompleteManualProjection(expected:Record<string,any>,actual:Record<string,any>,midi:boolean):void{
  const defaults:Record<string,any>={
    activation:{type:'',value:null,condition:'',override:false},effects:[],flags:{},
    range:{override:false,units:'self',special:''},
    visibility:{level:{},requireAttunement:false,requireIdentification:false,requireMagic:false},
  };
  if(midi)Object.assign(defaults,{
    useConditionText:'',useConditionReason:'',effectConditionText:'',macroData:{name:'',command:''},
    ignoreTraits:{idi:false,idr:false,idv:false,ida:false,idm:false},isOverTimeFlag:false,
    overTimeProperties:{saveRemoves:true,rollAs:'target',preRemoveConditionText:'',postRemoveConditionText:''},
    regionBehavior:{enabled:false,dispositionFilter:-1,excludeSource:true,oncePerTurn:true,wallRestriction:'none',regionVisibility:2,attachToken:'default',rules:[]},
    regionLight:{enabled:false,dim:0,bright:0,color:null,alpha:0.5,luminosity:0.5,animationType:'',animationSpeed:5,animationIntensity:5},
    midiProperties:{ignoreTraits:[],triggeredActivityId:'none',triggeredActivityConditionText:'',triggeredActivityTargets:'targets',triggeredActivityRollAs:'self',triggeredActivityConsume:true,triggeredActivityConfigure:true,autoConsume:false,forceConsumeDialog:'default',forceRollDialog:'default',forceDamageDialog:'default',confirmTargets:'default',autoTargetType:'any',autoTargetAction:'default',automationOnly:false,otherActivityCompatible:true,otherActivityAsParentType:true,identifier:'',displayActivityName:false,rollMode:'default',chooseEffects:false,toggleEffect:false,ignoreFullCover:false,removeChatButtons:'default',magicEffect:false,magicDamage:false,noConcentrationCheck:false,skipConcentrationCheck:false,autoCEEffects:'default'},
  });
  const wanted=mergeDefaults(defaults,expected),received=mergeDefaults(defaults,actual);
  for(const value of [wanted,received]){
    delete value.img;delete value.sort;
    if(value.otherActivityId==='none')delete value.otherActivityId;
    if(Array.isArray(value.damage?.parts))value.damage.parts=value.damage.parts.map((part:any)=>mergeDefaults({bonus:'',custom:{enabled:false,formula:''},scaling:{mode:'',number:1,formula:''}},part));
  }
  assertProjection(wanted,received);assertProjection(received,wanted);
}

function mergeDefaults(defaults:Record<string,any>,value:Record<string,any>):Record<string,any>{
  const result=structuredClone(defaults);
  for(const[key,entry]of Object.entries(value))result[key]=record(entry)&&record(result[key])?mergeDefaults(result[key],entry):structuredClone(entry);
  return result;
}

function record(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertProjection(expected:unknown,actual:unknown):void{
  // The shared hash projects Document top-level keys. Nest field-level data
  // under system so damage/Midi fields are not mistaken for unknown metadata.
  assertNativeCacheProjectionMatches({system:{conditional:expected}},{system:{conditional:actual}},'source-conditional-complete-activity');
}

function escapeHtml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}
