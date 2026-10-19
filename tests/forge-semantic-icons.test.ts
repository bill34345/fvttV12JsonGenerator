import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildForgeActorRequest, buildForgeItemRequest, convertFinalActorSource, convertFinalItemSource } from '@fvtt-json-generator/forge-browser-runtime';
import { createBundledIconResolutionSession } from '@fvtt-json-generator/assets-icons/icon-browser';
import { V14IconResolver } from '../packages/assets-icons/src/icons/resolver';
import { decodeForgeActorRequest, decodeForgeActorResponse, decodeForgeItemRequest, decodeForgeItemResponse, hashArtifact } from '@fvtt-json-generator/forge-gateway-protocol';
import { assertResponseTarget } from '../foundry-modules/fvtt-json-forge/src/runtime';
import { normalizeForgeItemArtifact } from '../packages/forge-browser-runtime/src/artifact';
import type { ForgeSourceId, ForgeItemSourceId, JsonObject } from '@fvtt-json-generator/forge-gateway-protocol';

const source = readFileSync(new URL('./fixtures/forge-semantic-icons.md', import.meta.url), 'utf8');

function withoutVisuals(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutVisuals);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'img').map(([key, entry]) => [key, withoutVisuals(entry)]));
  return value;
}

describe('Forge content icons through the formal workflow', () => {
  test('uses distinct content icons across action categories without changing source mechanics', async () => {
    const request = buildForgeActorRequest({ content: source, displayName: 'Icon Acceptance Beast',
      requestId: 'semantic-icons', fvttVersion: '14.368', systemVersion: '5.3.3',
      sourceId: 'actor:v1:123e4567-e89b-42d3-a456-426614174099' as ForgeSourceId });
    expect(request.resolvedTarget.iconMode).toBe('safe');
    const safe = await convertFinalActorSource(request);
    const off = await convertFinalActorSource({ ...request, resolvedTarget: { ...request.resolvedTarget, iconMode: 'off' } });
    expect(decodeForgeActorResponse(safe).ok).toBe(true);
    expect(decodeForgeActorResponse(off).ok).toBe(true);
    if (!('result' in safe) || safe.result.status !== 'accepted' || !('result' in off) || off.result.status !== 'accepted') {
      throw new Error(`Formal icon fixtures must be accepted: ${JSON.stringify({ safe, off })}`);
    }
    expect(safe.result.target.iconMode).toBe('safe');
    expect(off.result.target.iconMode).toBe('off');
    expect(safe.result.artifactHash).toBe(hashArtifact(safe.result.artifact));
    expect(safe.result.artifactHash).not.toBe(off.result.artifactHash);
    expect(withoutVisuals(safe.result.artifact)).toEqual(withoutVisuals(off.result.artifact));
    expect(safe.result.actorVerification).toEqual(off.result.actorVerification);
    expect(safe.result.verification).toEqual(off.result.verification);
    const items = safe.result.artifact.items as Array<Record<string, any>>;
    const find = (name: string) => items.find((item) => item.name.includes(name))!;
    expect(find('Claw').img).toMatch(/claw/u);
    expect(find('Fireball').img).toMatch(/fireball/u);
    expect(find('Bite').img).toMatch(/(?:fang|teeth|bite)/u);
    expect(find('Tail').img).toMatch(/tail/u);
    expect(find('Borrowed Face').img).toBe('icons/magic/symbols/mask-metal-silver-white.webp');
    expect(find('Fellowship').img).toBe('icons/skills/social/diplomacy-unity-alliance.webp');
    expect(new Set(items.map((item) => item.img)).size).toBeGreaterThanOrEqual(4);
    const activity = (item: Record<string, any>) => Object.values(item.system.activities)[0] as Record<string, any>;
    expect(activity(find('Fireball')).type).toBe('attack');
    expect(activity(find('Fireball')).damage.parts[0].types).toEqual(['fire']);
    expect(activity(find('Bite')).activation.type).toBe('bonus');
    expect(activity(find('Tail')).activation.type).toBe('legendary');
    for (const item of items) {
      for (const entry of Object.values(item.system.activities) as Array<Record<string, any>>) expect(entry.img).toBeTruthy();
    }
    assertResponseTarget(safe.result.target, { version: '14.368', system: { id: 'dnd5e', version: '5.3.3' } });
    assertResponseTarget(off.result.target, { version: '14.368', system: { id: 'dnd5e', version: '5.3.3' } });
  });

  test('supports safe Item projection while historical off requests remain valid', async () => {
    const content = readFileSync(new URL('../obsidian/dnd数据转fvttjson/input/items/骑士之盾.md', import.meta.url), 'utf8');
    const request = buildForgeItemRequest({ content, displayName: 'Shield', requestId: 'semantic-item',
      fvttVersion: '14.368', systemVersion: '5.3.3', sourceId: 'item:v1:123e4567-e89b-42d3-a456-426614174099' as ForgeItemSourceId });
    const safe = await convertFinalItemSource(request);
    const off = await convertFinalItemSource({ ...request, resolvedTarget: { ...request.resolvedTarget, iconMode: 'off' } });
    expect(decodeForgeItemResponse(safe).ok).toBe(true);
    expect(decodeForgeItemResponse(off).ok).toBe(true);
    if (!('result' in safe) || safe.result.status !== 'accepted' || !('result' in off) || off.result.status !== 'accepted') throw new Error('Shield must remain formally accepted.');
    expect(safe.result.target.iconMode).toBe('safe');
    const safeActivities = Object.values((safe.result.artifact.system as any).activities) as Array<Record<string, any>>;
    const bash = safeActivities.find((entry) => entry.name.includes('Forceful Bash'))!;
    expect(bash.img).toBe('systems/dnd5e/icons/svg/damage/force.svg');
    expect(bash.img).not.toBe(safe.result.artifact.img);
    // Item/Activity IDs include their complete visual content. Re-normalizing the
    // image-free artifacts also proves all remapped effect origins remain equal.
    expect(normalizeForgeItemArtifact(withoutVisuals(safe.result.artifact) as JsonObject, '14'))
      .toEqual(normalizeForgeItemArtifact(withoutVisuals(off.result.artifact) as JsonObject, '14'));
    expect(safe.result.artifactHash).toBe(hashArtifact(safe.result.artifact));
  });

  test('keeps v12 off and rejects safe for unsupported profiles and unverified browser inputs', () => {
    const options = { content: source, displayName: 'Legacy', requestId: 'legacy-icons', fvttVersion: '12.331', systemVersion: '4.3.9' };
    const actor = buildForgeActorRequest(options);
    expect(actor.resolvedTarget.iconMode).toBe('off');
    expect(decodeForgeActorRequest({ ...actor, resolvedTarget: { ...actor.resolvedTarget, iconMode: 'safe' } }).ok).toBe(false);
    const item = buildForgeItemRequest(options);
    expect(item.resolvedTarget.iconMode).toBe('off');
    expect(decodeForgeItemRequest({ ...item, resolvedTarget: { ...item.resolvedTarget, iconMode: 'safe' } }).ok).toBe(false);
    expect(() => createBundledIconResolutionSession('12', { mode: 'safe' })).toThrow();
    expect(() => createBundledIconResolutionSession('14', { mode: 'safe', overridePath: 'unverified.json' })).toThrow();
    expect(createBundledIconResolutionSession('12').report()).toBeNull();
  });
});

describe('Forge fuzzy content icons', () => {
  const catalog = require('../references/foundry-v14-icons/catalog.json');
  const files = new Set<string>(catalog.files.map((entry: { path: string }) => entry.path));

  function resolve(items: Array<Record<string, any>>) {
    const actor = { name: 'Generic Test Creature', items: structuredClone(items) };
    const session = createBundledIconResolutionSession('14', { mode: 'safe' });
    session.resolver?.resolveActor(actor);
    return { actor, report: session.report()! };
  }

  test('manual handling boilerplate cannot select movement for unrelated source rules', () => {
    const rules = ['The creature senses hidden creatures within 60 feet.', 'The creature has advantage on saving throws against spells.',
      'It makes two weapon attacks.', 'It can teleport 30 feet to an unoccupied space.'];
    const items = rules.map((sourceText, index) => ({name: `Unknown Rule ${index}`,type: 'feat',img: 'icons/svg/mystery-man.svg',
      flags: {fvttJsonGenerator: {manualRule: {mode: 'gm-manual',sourceText}}},
      system: {description: {value: 'GM手动能力：不自动造成伤害、进行豁免、施加效果或移动棋子。'},
        activities: {one: {type: 'utility',description: {chatFlavor: 'GM手动能力：不自动移动棋子。'}}}},effects: []}));
    const {actor,report} = resolve(items);
    const expected = ['icons/magic/perception/eye-ringed-glow-angry-large-teal.webp', 'icons/magic/defensive/armor-shield-barrier-steel.webp',
      'icons/skills/melee/strike-weapons-orange.webp', 'icons/magic/movement/portal-vortex-orange.webp'];
    actor.items.forEach((item,index) => {
      expect(item.img).toBe(expected[index]);
      expect(item.system.activities.one.img).toBe(item.img);
    });
    expect(actor.items.map(withoutVisuals)).toEqual(items.map(withoutVisuals));
    expect(report.entries).toHaveLength(8);
  });
  test('generated manual artwork follows source sensing, anatomy and flight, and rejects a negative movement cue', () => {
    const inputs = [
      {name:'Hidden Scent',source:'The creature can determine, by smell, whether creatures are nearby.',path:'icons/magic/perception/eye-ringed-glow-angry-large-teal.webp'},
      {name:'Taloned Paws',source:'Melee Attack Roll: +7. This attack has Disadvantage if it is not Flying.',path:'icons/creatures/claws/claw-curved-jagged-gray.webp'},
      {name:'Poor Flyer',source:'At the end of its turn while Flying it falls Prone.',path:'icons/creatures/abilities/wings-birdlike-blue.webp'},
      {name:'Unknown Burst',source:'It emits a burst of colored light. It cannot use this ability while flying.',path:'icons/magic/light/explosion-star-glow-yellow.webp'},
      {name:'Unknown Pulse',source:'It emits a burst of colored light. It can’t use this ability while flying.',path:'icons/magic/symbols/cog-glowing-green.webp'},
    ];
    const items=inputs.map(({name,source})=>({name,type:'feat',img:'icons/magic/fire/projectile-wave-arrow.webp',
      flags:{fvttJsonGenerator:{manualRule:{mode:'gm-manual',sourceText:source}}},system:{description:{value:'GM不自动移动棋子。'},
        activities:{one:{type:'utility',img:'icons/magic/fire/projectile-wave-arrow.webp',description:{chatFlavor:'GM不自动移动棋子。'}}}}}));
    const {actor}=resolve(items);
    actor.items.forEach((item,index)=>{expect(item.img).toBe(inputs[index]!.path);expect(item.system.activities.one.img).toBe(item.img);
      if(index>=3){expect(item.img).not.toBe('icons/magic/movement/portal-vortex-orange.webp');expect(item.img).not.toBe('icons/creatures/abilities/wings-birdlike-blue.webp');}});
    expect(actor.items.map(withoutVisuals)).toEqual(items.map(withoutVisuals));
  });

  test('chooses verified content or functional category images for English, Chinese, renamed and sparse traits', () => {
    const inputs = [
      { name: 'Unfamiliar Name', type: 'feat', img: catalog.typeDefaults.feat, system: { description: { value: 'It senses hidden creatures nearby.' }, activities: {} } },
      { name: '反制护身', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { description: { value: '它对法术豁免具有优势。' }, activities: {} } },
      { name: 'Arbitrary Label', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'attack' } } } },
      { name: 'Unknown Passive', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: {} } },
    ];
    const { actor, report } = resolve(inputs);
    expect(actor.items.every((item) => files.has(item.img) && item.img !== catalog.typeDefaults.feat)).toBe(true);
    expect(report.entries.every((entry) => entry.source !== 'type-default')).toBe(true);
    expect(report.summary.fallback).toBe(0);
    expect(actor.items.map(withoutVisuals)).toEqual(inputs.map(withoutVisuals));
    expect(resolve(inputs).actor.items.map((item) => item.img)).toEqual(actor.items.map((item) => item.img));
  });

  test('keeps activity damage local and includes Item base damage only when includeBase is true', () => {
    const base = { name: 'Neutral Strike', type: 'weapon', img: 'icons/svg/sword.svg', system: {
      damage: { parts: [{ types: ['fire'] }] }, activities: {
        mixed: { name: 'Neutral Hit', type: 'attack', damage: { includeBase: true, parts: [{ types: ['cold'] }] } },
        cold: { name: 'Neutral Hit', type: 'attack', damage: { includeBase: false, parts: [{ types: ['cold'] }] } },
        flame: { name: 'Neutral Hit', type: 'attack', damage: { includeBase: false, parts: [{ types: ['fire'] }] } },
      },
    } };
    const { actor, report } = resolve([base]);
    const activities = actor.items[0]!.system.activities;
    expect(activities.cold.img).toBe('icons/magic/water/orb-ice-glow.webp');
    expect(activities.flame.img).toBe('icons/magic/fire/orb-vortex.webp');
    expect(activities.mixed.img).not.toBe(activities.cold.img);
    expect(activities.mixed.img).not.toBe(activities.flame.img);
    expect(files.has(activities.mixed.img)).toBe(true);
    expect(report.entries.every((entry) => entry.source !== 'type-default')).toBe(true);
    expect(withoutVisuals(actor.items[0])).toEqual(withoutVisuals(base));
  });

  test('uses only locked dnd5e 5.3.3 weapon damage.base, excluding versatile and sibling parts', () => {
    const input = { name: 'Neutral Launcher', type: 'weapon', img: 'icons/svg/sword.svg', system: {
      damage: {
        base: { number: 1, denomination: 6, types: ['fire'] },
        versatile: { number: 1, denomination: 8, types: ['cold'] },
      },
      activities: {
        base: { name: 'Main Shot', type: 'attack', attack: { type: { value: 'ranged', classification: 'weapon' } },
          range: { value: 20, long: 60, units: 'ft' }, damage: { includeBase: true, parts: [] } },
        independent: { name: 'Other Shot', type: 'attack', attack: { type: { value: 'ranged', classification: 'weapon' } },
          range: { value: 20, long: 60, units: 'ft' }, damage: { includeBase: false, parts: [{ types: ['cold'] }] } },
      },
    } };
    const { actor } = resolve([input]);
    const activities = actor.items[0]!.system.activities;
    expect(activities.base.img).toBe('icons/magic/fire/orb-vortex.webp');
    expect(activities.independent.img).toBe('icons/magic/water/orb-ice-glow.webp');
    expect(withoutVisuals(actor.items[0])).toEqual(withoutVisuals(input));
  });

  test('does not inherit base elemental damage for an attack with includeBase false', () => {
    const input = { name: 'Neutral Pulse', type: 'weapon', img: 'icons/svg/sword.svg', system: {
      damage: { base: { types: ['fire'] }, versatile: { types: ['cold'] } },
      activities: { noBase: { type: 'attack', attack: { type: { value: 'ranged', classification: 'weapon' } },
        range: { value: 30, units: 'ft' }, damage: { includeBase: false, parts: [] } } },
    } };
    const { actor } = resolve([input]);
    expect(actor.items[0]!.img).toBe('icons/magic/fire/orb-vortex.webp');
    expect(actor.items[0]!.system.activities.noBase.img).toBe('icons/skills/melee/strike-weapons-orange.webp');
    expect(withoutVisuals(actor.items[0])).toEqual(withoutVisuals(input));
  });

  test('represents a ranged physical attack with an elemental rider as a physical projectile', () => {
    const input = { name: 'Barbed Shot', type: 'weapon', img: 'icons/svg/sword.svg', system: {
      damage: { parts: [{ types: ['piercing'] }] }, activities: {
        combined: { name: 'Barbed Shot', type: 'attack', attack: { type: { value: 'ranged', classification: 'weapon' } },
          range: { value: 20, long: 60, units: 'ft' }, damage: { includeBase: true, parts: [{ types: ['necrotic'] }] } },
        rider: { name: 'Necrotic Pulse', type: 'damage', damage: { includeBase: false, parts: [{ types: ['necrotic'] }] } },
      },
    } };
    const { actor } = resolve([input]);
    expect(actor.items[0]!.system.activities.combined.img).toBe('icons/skills/ranged/arrow-barbed-flying-gray.webp');
    expect(actor.items[0]!.system.activities.rider.img).toBe('icons/magic/death/hand-withered-gray.webp');
    expect(withoutVisuals(actor.items[0])).toEqual(withoutVisuals(input));
  });

  test('uses each activity description without leaking a sibling theme', () => {
    const input = { name: 'Changing Presence', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: {
      terror: { name: 'First Effect', type: 'save', description: { chatFlavor: 'The target becomes frightened for 1 minute.' } },
      travel: { name: 'Second Effect', type: 'utility', description: { chatFlavor: 'The creature dives and swims away underwater.' } },
    } } };
    const { actor } = resolve([input]);
    expect(actor.items[0]!.system.activities.terror.img).toBe('icons/magic/control/fear-fright-mask-orange.webp');
    expect(actor.items[0]!.system.activities.travel.img).toBe('icons/magic/water/waves-water-blue.webp');
    expect(withoutVisuals(actor.items[0])).toEqual(withoutVisuals(input));
  });

  test('inherits parent content image and preserves explicit overrides', () => {
    const item = { name: 'Claw', type: 'feat', img: catalog.typeDefaults.feat,
      system: { activities: { a: { type: 'utility', img: catalog.typeDefaults.feat } } } };
    const { actor, report } = resolve([item]);
    expect(actor.items[0]!.system.activities.a.img).toBe(actor.items[0]!.img);
    expect(report.entries.find((entry) => entry.itemName.includes(' / '))?.source).toBe('semantic');
    const explicit = { name: 'Claw', type: 'feat', img: 'icons/svg/aura.svg', system: { activities: {} } };
    expect(resolve([explicit]).actor.items[0]!.img).toBe('icons/svg/aura.svg');
    const reviewed: any[] = [];
    const resolver = new V14IconResolver({ catalog, overrides: { schemaVersion: 1, target: catalog.target,
      entries: [{ selector: { itemType: 'feat', name: 'Claw' }, img: 'icons/svg/aura.svg' }] }, review: reviewed, fuzzyContent: true });
    const overrideItem = structuredClone(item);
    resolver.resolveStandaloneItem(overrideItem);
    expect(overrideItem.img).toBe('icons/svg/aura.svg');
    expect(reviewed[0]?.source).toBe('override');
  });

  test('errors when a selected category asset is unavailable', () => {
    const reduced = { ...catalog, files: catalog.files.filter((entry: { path: string }) => entry.path !== 'icons/magic/symbols/cog-glowing-green.webp') };
    const resolver = new V14IconResolver({ catalog: reduced, overrides: { schemaVersion: 1, target: catalog.target, entries: [] }, review: [], fuzzyContent: true });
    expect(() => resolver.resolveStandaloneItem({ name: 'Unexplained Passive', type: 'feat', img: catalog.typeDefaults.feat, system: { activities: {} } })).toThrow(/catalog|asset/i);
  });

  test('keeps the direct resolver conservative without the Forge session choice', () => {
    const entries: any[] = [];
    const item = { name: 'Unexplained Passive', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: {} } };
    new V14IconResolver({ catalog, overrides: { schemaVersion: 1, target: catalog.target, entries: [] }, review: entries })
      .resolveStandaloneItem(item);
    expect(item.img).toBe(catalog.typeDefaults.feat);
    expect(entries[0]?.source).toBe('type-default');
  });
});
