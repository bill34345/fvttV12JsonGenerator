import { describe, expect, test } from 'bun:test';
import { planSpellConditionalDamage as nativePlan } from '../spell-conditional-damage';
import { conditionalRule, conditionalSpellFixture } from './conditional-spell-fixture';

const planSpellConditionalDamage=(native:Record<string,any>,cache:Record<string,any>,options:Parameters<typeof nativePlan>[2]={})=>nativePlan(native,cache,{systemVersion:'5.3.3',...options});

describe('source-conditional Spell damage isolation', () => {
  test.each([undefined,'6.0.2','6.0.5'])('does not expand the reviewed5.3.3 adaptation to runtime %s',systemVersion=>{
    const source=conditionalSpellFixture();expect(nativePlan(source,source,{systemVersion}).updates).toEqual({});
  });
  test('preserves native Save, effects and complete source while separating conditional dice, independent of name', () => {
    const native = conditionalSpellFixture(), before = structuredClone(native);
    native.name = 'A differently localized name';
    const { expected, updates, manualActivityId } = planSpellConditionalDamage(native, native);
    const save = expected.system.activities.dnd5eactivity000, damage = expected.system.activities[manualActivityId!];
    expect(save.save).toEqual(before.system.activities.dnd5eactivity000.save);
    expect(save.effects).toEqual(before.system.activities.dnd5eactivity000.effects);
    expect(save.damage.parts).toEqual([]);
    expect(damage).toMatchObject({ type: 'damage', activation: { type: 'special' }, consumption: { spellSlot: false, targets: [] }, uses: { max: '', recovery: [], spent: 0 }, damage: { critical: { allow: false } } });
    expect(damage.damage.parts).toEqual(before.system.activities.dnd5eactivity000.damage.parts);
    expect(damage.save).toBeUndefined(); expect(damage.effects).toEqual([]);
    expect(damage.description.chatFlavor).toContain(conditionalRule);
    expect(damage.activation.condition).toBe(conditionalRule);
    expect(save.description.chatFlavor).toStartWith('Native Save note\n');
    expect(save.description.chatFlavor).toContain('not part of casting');
    expect(expected.system.description).toEqual(before.system.description);
    expect(expected.effects).toEqual(before.effects); expect(expected.flags).toEqual(before.flags);
    expect(native.system).toEqual(before.system); expect(native.effects).toEqual(before.effects);
    expect(Object.keys(updates)).toHaveLength(3);
  });

  test('locked Midi activities cannot become Other/triggered damage, but retain an explicit GM damage button', () => {
    const native = conditionalSpellFixture();
    const plan = planSpellConditionalDamage(native, native, { midiVersion: '14.0.11' });
    for (const activity of Object.values(plan.expected.system.activities) as any[]) {
      expect(activity.otherActivityId??'none').toBe('none');
      expect(activity.midiProperties.otherActivityCompatible).toBe(false);
      expect(activity.midiProperties.triggeredActivityId).toBe('none');
    }
    expect(plan.expected.system.activities[plan.manualActivityId!].midiProperties.removeChatButtons).toBe('none');
    expect(() => planSpellConditionalDamage(native, native, { midiVersion: '14.0.12' })).toThrow('reviewed Midi');
  });

  test('a translated source uses its preserved original conditional paragraph, not a guessed translated name', () => {
    const native = conditionalSpellFixture();
    native.flags.babele = { originalPayload: { description: native.system.description.value } };
    native.system.description.value = '<p>完整中文规则保留，违令时由GM处理条件伤害。</p>';
    const plan = planSpellConditionalDamage(native, native);
    expect(plan.manualActivityId).toBeDefined();
    expect(plan.expected.system.description.value).toBe(native.system.description.value);
    expect(plan.expected.flags.babele).toEqual(native.flags.babele);
  });

  test.each(['dice', 'type', 'scaling', 'second part', 'unknown condition', 'provenance', 'additional activity'])('%s fails before planning any cache write', kind => {
    const native = conditionalSpellFixture(), save = native.system.activities.dnd5eactivity000;
    if (kind === 'dice') save.damage.parts[0].number = 6;
    if (kind === 'type') save.damage.parts[0].types = ['fire'];
    if (kind === 'scaling') save.damage.parts[0].scaling.mode = 'whole';
    if (kind === 'second part') save.damage.parts.push(structuredClone(save.damage.parts[0]));
    if (kind === 'unknown condition') native.system.description.value = native.system.description.value.replace('each day', 'each round');
    if (kind === 'provenance') native._stats.compendiumSource = 'Actor.untrusted.Item.phbsplGeas000000';
    if (kind === 'additional activity') native.system.activities.SecondActivity01 = structuredClone(save);
    expect(() => planSpellConditionalDamage(native, native)).toThrow();
  });

  test('does not infer conditional behavior for an unrelated or 2014 Spell', () => {
    const native = conditionalSpellFixture(); native.system.description.value = '<p>The target takes 5d10 psychic damage.</p>';
    expect(planSpellConditionalDamage(native, native).updates).toEqual({});
    const legacy = conditionalSpellFixture(); legacy.system.source.rules = '2014';
    expect(planSpellConditionalDamage(legacy, legacy).updates).toEqual({});
  });

  test('Keep never silently migrates the existing mixed activity; already safe cache is idempotent and preserves user notes', () => {
    const native = conditionalSpellFixture();
    expect(() => planSpellConditionalDamage(native, native, { preserveExisting: true })).toThrow('choose Overwrite');
    const first = planSpellConditionalDamage(native, native, { midiVersion: '14.0.11' });
    first.expected.system.description.value += '<p>GM note</p>';
    const kept = planSpellConditionalDamage(native, first.expected, { preserveExisting: true, midiVersion: '14.0.11' });
    expect(kept.updates).toEqual({}); expect(kept.expected).toEqual(first.expected);
    first.expected.system.activities[first.manualActivityId!].consumption.targets.push({ type: 'activityUses', value: '1' });
    expect(() => planSpellConditionalDamage(native, first.expected, { preserveExisting: true, midiVersion: '14.0.11' })).toThrow(/projection/i);
  });

  test('does not accept a changed Save or reintroduced automatic linkage on a previously split cache', () => {
    const native = conditionalSpellFixture(), first = planSpellConditionalDamage(native, native, { midiVersion: '14.0.11' });
    first.expected.system.activities.dnd5eactivity000.save.ability = ['con'];
    expect(() => planSpellConditionalDamage(native, first.expected, { midiVersion: '14.0.11' })).toThrow(/projection/i);
    first.expected.system.activities.dnd5eactivity000.save.ability = ['wis'];
    first.expected.system.activities.dnd5eactivity000.otherActivityId = first.manualActivityId;
    expect(() => planSpellConditionalDamage(native, first.expected, { midiVersion: '14.0.11' })).toThrow('automatically link');
  });
  test.each(['onSave','critical','scaling'])('Keep rejects changed Save.damage.%s after isolation',key=>{
    const native=conditionalSpellFixture(),first=planSpellConditionalDamage(native,native);
    first.expected.system.activities.dnd5eactivity000.damage[key]=key==='onSave'?'half':{allow:true,mode:'whole'};
    expect(()=>planSpellConditionalDamage(native,first.expected,{preserveExisting:true})).toThrow(/projection/i);
  });
  test.each(['dice','type','critical','target','activation','trigger','consumption','addedEffect','addedTemplate','extraScaling','extraMacro','range'])('Keep rejects changed executable manual %s',key=>{
    const native=conditionalSpellFixture(),first=planSpellConditionalDamage(native,native,{midiVersion:'14.0.11'});
    const manual=first.expected.system.activities[first.manualActivityId!];
    if(key==='dice')manual.damage.parts[0].number=6;
    if(key==='type')manual.damage.parts[0].types=['fire'];
    if(key==='critical')manual.damage.critical.allow=true;
    if(key==='target')manual.target.affects.type='self';
    if(key==='activation')manual.activation.type='action';
    if(key==='trigger')manual.midiProperties.triggeredActivityId='dnd5eactivity000';
    if(key==='consumption')manual.consumption.spellSlot=true;
    if(key==='addedEffect')manual.effects=[{_id:'SourceEffect0001'}];
    if(key==='addedTemplate')manual.target.template={type:'sphere',size:'20',units:'ft'};
    if(key==='extraScaling')manual.damage.parts[0].scaling.formula='1d10';
    if(key==='extraMacro')manual.macroData={name:'Unsafe manual edit',command:'bad()'};
    if(key==='range')manual.range={override:false,units:'ft',value:'60'};
    expect(()=>planSpellConditionalDamage(native,first.expected,{preserveExisting:true,midiVersion:'14.0.11'})).toThrow(/projection/i);
  });
  test('Keep accepts only the explicit inert native defaults, not added executable fields',()=>{
    const native=conditionalSpellFixture(),first=planSpellConditionalDamage(native,native,{midiVersion:'14.0.11'}),manual=first.expected.system.activities[first.manualActivityId!];
    Object.assign(manual,{img:'systems/dnd5e/icons/svg/activity/damage.svg',visibility:{level:{},requireAttunement:false,requireIdentification:false,requireMagic:false},flags:{},macroData:{name:'',command:''}});
    manual.damage.parts[0].scaling.formula='';
    expect(planSpellConditionalDamage(native,first.expected,{preserveExisting:true,midiVersion:'14.0.11'}).updates).toEqual({});
    manual.effects=[{_id:'SourceEffect0001'}];
    expect(()=>planSpellConditionalDamage(native,first.expected,{preserveExisting:true,midiVersion:'14.0.11'})).toThrow(/projection/i);
  });
  test.each(['missing','undefined','null','empty','changed'] as const)('complete manual source condition rejects %s even when JSON serialization would hide undefined',kind=>{
    const native=conditionalSpellFixture(),first=planSpellConditionalDamage(native,native,{midiVersion:'14.0.11'});
    const activation=first.expected.system.activities[first.manualActivityId!].activation;
    expect(activation.condition).toBe(conditionalRule);
    if(kind==='missing')delete activation.condition;
    if(kind==='undefined')activation.condition=undefined;
    if(kind==='null')activation.condition=null;
    if(kind==='empty')activation.condition='';
    if(kind==='changed')activation.condition=conditionalRule.replace('each day','each turn');
    expect(()=>planSpellConditionalDamage(native,first.expected,{preserveExisting:true,midiVersion:'14.0.11'})).toThrow('/system/conditional/activation/condition');
    if(kind==='undefined'){
      expect(Object.hasOwn(activation,'condition')).toBe(true);
      const roundTrip=JSON.parse(JSON.stringify(first.expected));
      expect(Object.hasOwn(roundTrip.system.activities[first.manualActivityId!].activation,'condition')).toBe(false);
      expect(()=>planSpellConditionalDamage(native,roundTrip,{preserveExisting:true,midiVersion:'14.0.11'})).toThrow('/system/conditional/activation/condition');
    }
  });
  test('preserves the native Save own undefined condition while the GM Activity retains its explicit complete source rule',()=>{
    const native=conditionalSpellFixture();native.system.activities.dnd5eactivity000.activation.condition=undefined;
    const first=planSpellConditionalDamage(native,native,{midiVersion:'14.0.11'});
    const save=first.expected.system.activities.dnd5eactivity000,manual=first.expected.system.activities[first.manualActivityId!];
    expect(Object.hasOwn(save.activation,'condition')).toBe(true);expect(save.activation.condition).toBeUndefined();
    expect(manual.activation.condition).toBe(conditionalRule);
    expect(planSpellConditionalDamage(native,first.expected,{preserveExisting:true,midiVersion:'14.0.11'}).updates).toEqual({});
    expect(native.system.activities.dnd5eactivity000.damage.parts).toHaveLength(1);
    expect(manual.useConditionText).toBeUndefined();
    expect(manual.midiProperties.triggeredActivityId).toBe('none');
  });
  test('conditional damage uses the native Special range, retaining the separate original60ft casting range',()=>{
    const source=conditionalSpellFixture();source.system.range={value:'60',units:'ft'};source.system.activities.dnd5eactivity000.range={override:false,units:'self'};
    const plan=planSpellConditionalDamage(source,source);
    expect(plan.expected.system.range).toEqual({value:'60',units:'ft'});
    expect(plan.expected.system.activities.dnd5eactivity000.range).toEqual({override:false,units:'self'});
    expect(plan.expected.system.activities[plan.manualActivityId!].range).toMatchObject({override:true,units:'spec'});
    expect(plan.expected.system.activities[plan.manualActivityId!].range.value).toBeUndefined();
  });
});
