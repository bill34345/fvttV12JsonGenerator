import { test, expect } from 'bun:test';
import { fileURLToPath } from 'node:url';

test('read-only field diagnosis identifies generated change IDs without hiding mechanical changes or mutating source', async () => {
  const result = await Bun.build({ entrypoints: [fileURLToPath(new URL('./drift-runtime.mjs', import.meta.url))], target: 'browser', format: 'esm' });
  expect(result.success).toBe(true);
  const execute = new (Object.getPrototypeOf(async function() {}).constructor)('game', 'location', 'foundry', 'crypto', await result.outputs[0].text());
  async function run(generatedId, value = '@attributes.movement.walk') {
    const item = { _id: 'Oqs0HDVs0QOmvzb9', name: 'Synthetic Sea Elf', type: 'race', system: { keep: 1 }, effects: [{ _id: 'SIoBMgJ64YgbJ1eS', name: 'Swim Speed', system: { changes: [{ _id: generatedId, key: 'system.attributes.movement.swim', type: 'override', value, priority: 4, phase: 'initial' }] } }] };
    const before = structuredClone(item);
    const actor = { id: 'aMZwC9ORkpZpdlkc', toObject: () => ({ items: [item] }), items: { _source: [item], invalidDocumentIds: new Set([item._id]) } };
    let report;
    const foundry = { applications: { api: { DialogV2: { wait: async config => {
      const text = config.content.match(/<textarea[^>]*>([\s\S]*)<\/textarea>/)[1];
      report = JSON.parse(text.replaceAll('&quot;', '"').replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&'));
      expect(config.buttons.map(b => b.action)).toEqual(['close']);
    } } } } };
    await execute({ actors: new Map([[actor.id, actor]]), version: '14.368', world: { id: 'cor-cotn' }, system: { id: 'dnd5e', version: '6.0.2' }, user: { isGM: true } }, { hostname: '127.0.0.1', port: '30002' }, foundry, crypto);
    expect(item).toEqual(before);
    expect(report.writes).toBe(0);
    return report;
  }
  const a = await run('1111111111111111'), b = await run('2222222222222222'), c = await run('3333333333333333', '999');
  expect(a.rawItemHash).not.toBe(b.rawItemHash);
  expect(a.maskedItemHash).toBe(b.maskedItemHash);
  expect(b.maskedItemHash).not.toBe(c.maskedItemHash);
  expect(Object.keys(a.leafHashes).filter(k => a.leafHashes[k].hash !== b.leafHashes[k].hash)).toEqual(['effects.0.system.changes.0._id']);
});
