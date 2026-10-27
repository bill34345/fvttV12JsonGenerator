import { describe, expect, test } from 'bun:test';
import {
  buildForgeActorRequest,
  convertFinalActorSource,
} from '@fvtt-json-generator/forge-browser-runtime';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import {
  createCreatureBlueprint,
  decodeCreatureBlueprint,
  deriveCreatureBlueprint,
  diffCreatureBlueprintFields,
  parseCreatureBlueprintSource,
  renderCreatureBlueprintSource,
  type CreatureBlueprintV1,
} from '@fvtt-json-generator/forge-browser-runtime/creature-blueprint';

const SOURCE_ID = 'actor:v1:123e4567-e89b-42d3-a456-426614174000' as CreatureBlueprintV1['sourceId'];
const DERIVED_SOURCE_ID = 'actor:v1:123e4567-e89b-42d3-a456-426614174001' as CreatureBlueprintV1['sourceId'];

function authoredBlueprint(): CreatureBlueprintV1 {
  const base = createCreatureBlueprint(SOURCE_ID);
  return decodeCreatureBlueprint({
    ...base,
    name: 'Authoring Sentinel',
    ac: 17,
    hp: 42,
    speed: 35,
    abilities: { str: 18, dex: 14, con: 16, int: 10, wis: 12, cha: 8 },
    cr: 2,
    components: [
      {
        type: 'attack',
        name: 'Longbow',
        mode: 'ranged',
        hitBonus: 7,
        range: 150,
        damage: { formula: '1d8+4', type: 'piercing' },
      },
      {
        type: 'save',
        name: 'Flame Pulse',
        ability: 'dex',
        dc: 15,
        range: 60,
        damage: { formula: '4d6', type: 'fire' },
        success: 'half',
      },
    ],
  });
}

describe('Forge creature blueprint model', () => {
  test('actor source limits: nine components and a ninth-component shape change survive the formal workflow',async()=>{
    const original=authoredBlueprint();
    const longName='Long ability name '.repeat(40).trim();expect(longName.length).toBeGreaterThan(512);
    const parent=decodeCreatureBlueprint({...original,name:longName,components:Array.from({length:9},(_,index)=>({
      ...original.components[0],name:index===8?longName:`Attack ${index+1}`}))});
    const child=deriveCreatureBlueprint(parent,`${longName} variant`,DERIVED_SOURCE_ID);
    child.components[8]={type:'save',name:`${longName} save`,ability:'dex',dc:15,range:60,damage:{formula:'4d6',type:'fire'},success:'half'};
    child.lineage!.changes=diffCreatureBlueprintFields(parent,child);
    expect(child.lineage!.changes.some(change=>change.path==='/components/8')).toBe(true);
    const source=renderCreatureBlueprintSource(child);expect(parseCreatureBlueprintSource(source)).toEqual(child);
    const response=await convertFinalActorSource(buildForgeActorRequest({content:source,displayName:child.name,
      requestId:'nine-component-source',fvttVersion:'14.364',systemVersion:'5.3.3',sourceId:child.sourceId}));
    if(!('result'in response)||!response.result.artifact)throw Error('The complete blueprint must generate an Actor.');
    const items=response.result.artifact.items as any[];
    expect(response.result.artifact.name).toBe(child.name);
    expect(items.map(item=>item.name)).toEqual(child.components.map(component=>component.name));
    expect(Object.values(items[8]!.system.activities)[0]).toMatchObject({type:'save',save:{dc:{formula:'15'}}});
  });
  test('actor source limits: a blueprint larger than 256KiB preserves all components through rendering, reading and generation',async()=>{
    const original=authoredBlueprint(),blueprint=decodeCreatureBlueprint({...original,components:Array.from({length:600},(_,index)=>({
      ...original.components[0],name:`Attack-${String(index).padStart(4,'0')}-${'x'.repeat(80)}`}))});
    const source=renderCreatureBlueprintSource(blueprint);expect(new TextEncoder().encode(source).byteLength).toBeGreaterThan(256*1024);
    expect(parseCreatureBlueprintSource(source)).toEqual(blueprint);
    const response=await convertFinalActorSource(buildForgeActorRequest({content:source,displayName:blueprint.name,
      requestId:'large-blueprint-source',fvttVersion:'14.364',systemVersion:'5.3.3',sourceId:blueprint.sourceId}));
    if(!('result'in response)||!response.result.artifact)throw Error('The large blueprint must generate an Actor.');
    const items=response.result.artifact.items as any[];
    expect(items.map(item=>item.name)).toEqual(blueprint.components.map(component=>component.name));
    expect(items.every(item=>Object.values(item.system.activities).some((activity:any)=>activity.type==='attack'))).toBe(true);
  });
  test('actor source limits: lineage retains complete component arrays and more than thirty-two changes',()=>{
    const original=authoredBlueprint(),extended=deriveCreatureBlueprint(original,'Extended abilities',DERIVED_SOURCE_ID);
    extended.components=Array.from({length:40},(_,index)=>({...original.components[0],name:`Attack ${index+1}`}));
    extended.lineage!.changes=diffCreatureBlueprintFields(original,extended);
    expect(parseCreatureBlueprintSource(renderCreatureBlueprintSource(extended))).toEqual(extended);
    const changed=deriveCreatureBlueprint(extended,'Renamed abilities');
    for(const component of changed.components)component.name+=' changed';
    changed.lineage!.changes=diffCreatureBlueprintFields(extended,changed);
    expect(changed.lineage!.changes.length).toBeGreaterThan(32);
    expect(changed.lineage!.changes.some(change=>change.path==='/components/39/name')).toBe(true);
    expect(parseCreatureBlueprintSource(renderCreatureBlueprintSource(changed))).toEqual(changed);
  });
  test('records attack-to-save replacement as one reversible component change', () => {
    const parent = createCreatureBlueprint(SOURCE_ID);
    const child = deriveCreatureBlueprint(parent, '替换能力', DERIVED_SOURCE_ID);
    child.components[0] = { type: 'save', name: '寒霜', ability: 'dex', dc: 12, range: 30, damage: { formula: '1d6', type: 'cold' }, success: 'none' };
    child.lineage!.changes = diffCreatureBlueprintFields(parent, child);
    const changes = child.lineage!.changes.filter((change) => change.path.startsWith('/components'));
    expect(changes as unknown).toEqual([{ path: '/components/0', before: parent.components[0], after: child.components[0] }]);
    expect(parseCreatureBlueprintSource(renderCreatureBlueprintSource(child))).toEqual(child);
  });

  test('does not invent one point of damage for nonpositive attack or save averages', async () => {
    const blueprint = authoredBlueprint();
    for (const component of blueprint.components) component.damage.formula = '1d4-5';
    const source = renderCreatureBlueprintSource(blueprint);
    expect(source).toContain('0（1d4-5）');
    expect(source).not.toContain('1（1d4-5）');
    expect(parseCreatureBlueprintSource(source)).toEqual(blueprint);
    const response = await convertFinalActorSource(buildForgeActorRequest({
      content: source, displayName: blueprint.name, requestId: 'zero-average',
      fvttVersion: '14.364', systemVersion: '5.3.3',
    }));
    expect('result' in response && response.result.status).toBe('accepted');
    if (!('result' in response) || !('artifact' in response.result)) throw new Error('Missing generated artifact.');
    const artifact = response.result.artifact as Record<string, any>;
    for (const item of artifact.items) {
      const activity = Object.values(item.system.activities)[0] as any;
      expect(activity.description.chatFlavor).toContain('0（1d4-5）');
      const damage = activity.damage.parts[0];
      expect(damage.custom?.formula || `${damage.number}d${damage.denomination}${damage.bonus}`).toBe('1d4-5');
    }
  });

  test('renders a stable Chinese YAML source and round-trips through the strict parser', () => {
    const blueprint = createCreatureBlueprint(SOURCE_ID);
    const source = renderCreatureBlueprintSource(blueprint);

    expect(source).not.toContain('layout: creature');
    expect(source).toContain('# forge-creature-blueprint-v1:');
    expect(source).toContain('动作:');
    expect(parseCreatureBlueprintSource(source)).toEqual(blueprint);
    expect(renderCreatureBlueprintSource(parseCreatureBlueprintSource(source))).toBe(source);
    expect(parseCreatureBlueprintSource(source.replace(/\n/gu, '\r\n'))).toEqual(blueprint);
  });

  test('runs the authored attack and save through the formal Forge pipeline', async () => {
    const blueprint = authoredBlueprint();
    const source = renderCreatureBlueprintSource(blueprint);
    const response = await convertFinalActorSource(buildForgeActorRequest({
      content: source,
      displayName: blueprint.name,
      requestId: 'creature-blueprint-formal-pipeline',
      fvttVersion: '14.364',
      systemVersion: '5.3.3',
      sourceId: blueprint.sourceId,
    }));

    if (!('result' in response) || response.result.status !== 'accepted' || !('artifact' in response.result)) {
      throw new Error(`Expected accepted formal blueprint response: ${JSON.stringify(response)}`);
    }

    const actor = response.result.artifact as Record<string, any>;
    expect(actor.name).toBe(blueprint.name);
    expect(actor.system.attributes.ac.flat).toBe(blueprint.ac);
    expect(actor.system.attributes.hp.value).toBe(blueprint.hp);
    expect(actor.system.attributes.movement.walk).toBe(blueprint.speed);
    expect(actor.system.details.cr).toBe(blueprint.cr);
    expect(actor.system.details.type.value).toBe(blueprint.type);
    expect(actor.system.traits.size).toBe('med');
    expect(actor.system.abilities.str.value).toBe(blueprint.abilities.str);

    const attack = (actor.items as Array<Record<string, any>>).find((item) => item.name === 'Longbow');
    const attackActivity = Object.values(attack?.system.activities ?? {}).find((activity: any) => activity.type === 'attack') as Record<string, any> | undefined;
    expect(attackActivity).toMatchObject({
      attack: { bonus: '7' },
      damage: { parts: [{ number: 1, denomination: 8, bonus: '4', types: ['piercing'] }] },
      range: { value: 150 },
      target: { affects: { count: 1, type: 'creature' } },
    });

    const save = (actor.items as Array<Record<string, any>>).find((item) => item.name === 'Flame Pulse');
    const saveActivity = Object.values(save?.system.activities ?? {}).find((activity: any) => activity.type === 'save') as Record<string, any> | undefined;
    expect(saveActivity).toMatchObject({
      save: { ability: ['dex'], dc: { formula: '15' } },
      damage: { onSave: 'half', parts: [{ number: 4, denomination: 6, types: ['fire'] }] },
      range: { value: 60 },
      target: { affects: { count: 1, type: 'creature' } },
    });
    expect(saveActivity?.target?.template?.type ?? '').not.toBe('sphere');
  });

  test('derives a distinct source with immediate parent hash and field-level changes', () => {
    const parent = createCreatureBlueprint(SOURCE_ID);
    const derived = deriveCreatureBlueprint(parent, 'Elite Guard', DERIVED_SOURCE_ID);

    expect(derived.sourceId).toBe(DERIVED_SOURCE_ID);
    expect(derived.lineage).toEqual({
      parentSourceId: SOURCE_ID,
      parentSourceHash: hashSource(renderCreatureBlueprintSource(parent)),
      changes: [{ path: '/name', before: 'Guard', after: 'Elite Guard' }],
    });
    expect(parseCreatureBlueprintSource(renderCreatureBlueprintSource(derived))).toEqual(derived);
  });

  test('rejects metadata/body tampering and unsafe single-line names', () => {
    const source = renderCreatureBlueprintSource(createCreatureBlueprint(SOURCE_ID));
    const metadata = source.split('\n').find((line) => line.startsWith('# forge-creature-blueprint-v1:'))!;
    const tamperedMetadata = metadata.replace('"name":"Guard"', '"name":"Tampered"');

    expect(() => parseCreatureBlueprintSource(source.replace(metadata, tamperedMetadata))).toThrow(/does not match/u);
    expect(() => parseCreatureBlueprintSource(source.replace('名称: "Guard"', '名称: "Tampered"'))).toThrow(/does not match/u);
    expect(() => parseCreatureBlueprintSource(source.replace(metadata, ''))).toThrow(/exactly one/u);
    expect(() => decodeCreatureBlueprint({ ...createCreatureBlueprint(SOURCE_ID), name: 'Guard\nInjected' })).toThrow(/single-line/u);
  });

  test('rejects unknown keys, unsupported component types, numeric limits, and dice outside the native contract', () => {
    const base = createCreatureBlueprint(SOURCE_ID);
    expect(() => decodeCreatureBlueprint({ ...base, unexpected: true })).toThrow(/unknown key/u);
    expect(() => decodeCreatureBlueprint({ ...base, ac: 101 })).toThrow(/blueprint\.ac/u);
    expect(decodeCreatureBlueprint({
      ...base,
      components: Array.from({ length: 9 }, () => base.components[0]),
    }).components).toHaveLength(9);
    expect(() => decodeCreatureBlueprint({
      ...base,
      components: [{ ...base.components[0], type: 'spell' }],
    })).toThrow(/unsupported component/u);
    for (const formula of ['101d20', '1d3', '1d6+101', '1d6 + 1']) {
      expect(() => decodeCreatureBlueprint({
        ...base,
        components: [{ ...base.components[0], damage: { formula, type: 'piercing' } }],
      })).toThrow(/dice formula/u);
    }
  });
});
