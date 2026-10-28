import {test, expect} from 'bun:test';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {planSpellHydration, hashSourceInventoryMetadata, RESOLVER_MODULE_ID, type PortableSpellManifest, type SpellCandidateMetadata} from '../src/core/spell-resolution';
import {buildCastActivitySource} from '../foundry-modules/monster-spell-resolver/src/cast-activity';

const frozenRoot = process.env.FORGE_CHM_FROZEN_ROOT;
const outputRoot = process.env.FORGE_CHM_FIX_EVIDENCE;

test.skipIf(!frozenRoot || !outputRoot)('CHM final manifest reaches the real hydration planner for daily and rest recovery', () => {
  const actor = JSON.parse(readFileSync(join(outputRoot!, 'night-hag/actor.json'), 'utf8'));
  const previous = JSON.parse(readFileSync(join(frozenRoot!, 'chrome/actors-created.json'), 'utf8'));
  const original = actor.flags[RESOLVER_MODULE_ID].spellManifest as PortableSpellManifest;
  const savedActor = previous.actors.find((value: any) => value.flags?.[RESOLVER_MODULE_ID]?.spellManifest?.manifestId === original.manifestId);
  const candidates: SpellCandidateMetadata[] = savedActor.items.filter((item: any) => item.type === 'spell').map((item: any) => {
    const uuid = item._stats.compendiumSource as string, parts = uuid.split('.');
    return {id: parts[4]!, uuid, packageId: parts[1]!, packId: parts[2]!, name: item.name,
      identifier: item.system.identifier, rules: item.system.source.rules, sourceBook: item.system.source.book,
      level: item.system.level, school: item.system.school};
  });
  expect(candidates).toHaveLength(12);
  const results = [];
  for (const recovery of ['longRest', 'shortRest', 'day'] as const) {
    const manifest = structuredClone(original);
    for (const ref of manifest.spellcastingGroups[0]!.spellRefs) ref.uses!.recovery = recovery;
    const before = structuredClone(manifest);
    const result = planSpellHydration({manifest, candidates, sourceInventoryHash: hashSourceInventoryMetadata(candidates)});
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw Error(JSON.stringify(result.findings));
    expect(result.plan.selections).toHaveLength(12);
    expect(result.report.findings).toEqual([]);
    expect(manifest).toEqual(before);
    const activities = result.plan.selections.map(selection => {
      const group = manifest.spellcastingGroups.find(value => value.groupId === selection.groupId)!;
      const ref = group.spellRefs.find(value => value.refId === selection.refId)!;
      return buildCastActivitySource({manifestId: manifest.manifestId, group, ref,
        selectedUuid: selection.uuid, featureId: 'Feature000000001'}).activity;
    });
    expect(activities.slice(0, 6).map(activity => activity.uses?.recovery[0].period)).toEqual(Array(6).fill({longRest:'lr',shortRest:'sr',day:'day'}[recovery]));
    expect(activities.find(activity => activity.name.includes('Magic Missile'))!.spell.level).toBe(4);
    results.push({recovery, provenance: recovery === 'longRest' ? 'unchanged frozen-reply final manifest' : 'explicit recovery variant for planner compatibility', plan: result.plan, activities});
  }
  writeFileSync(join(outputRoot!, 'spell-plan-results.json'), JSON.stringify({externalRequests: 0, candidatesFrom: 'prior actual Mirror readback; metadata only, no cached Spell imported', results}, null, 2) + '\n');
});
