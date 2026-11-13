import { expect, test } from 'bun:test';
import { compileBloodHunterV14Package } from '../src/index';
import { makeBloodHunter2024Fixture } from './fixture';

test('Brand of Castigation has a target-applied non-transferring native effect, retaining its source activity identity and resource consumption', () => {
  const source = makeBloodHunter2024Fixture();
  source.foundryClassFeature!.push({ name: '惩戒烙印', source: 'BloodHunter2024', className: '血猎手', classSource: 'BloodHunter2024', level: 6, activities: [{ _id: 'brandActivity001', name: '施加惩戒烙印', type: 'utility', activation: { type: 'special', value: null }, consumption: { targets: [{ type: 'itemUses', target: '', value: '1' }] }, target: { affects: { type: 'creature', count: '1' }, prompt: true } }], system: { uses: { max: '2', spent: 0 } } });
  const pkg = compileBloodHunterV14Package(source);
  const brand = pkg.features.find(item => item.system.identifier === 'brand-of-castigation')!;
  const effect = brand.effects.find(entry => (entry.flags as any)?.['fvtt-blood-hunter-2024']?.castigationBrand)!;
  expect(effect.transfer).toBe(false);
  expect(effect.system).toEqual({ changes: [] });
  expect(effect.changes).toBeUndefined();
  const activity = Object.values(brand.system.activities as any)[0] as any;
  expect(activity.effects).toEqual([{ _id: effect._id }]);
  expect(activity.consumption.targets).toEqual([{ type: 'itemUses', target: '', value: '1' }]);
  expect(activity.description.chatFlavor).toContain('10尺');
  expect(brand.system.uses).toEqual({ max: '2', spent: 0 });
});
