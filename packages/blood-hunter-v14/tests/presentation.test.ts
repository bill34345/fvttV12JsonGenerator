import { expect, test } from 'bun:test';
import { compileBloodHunterV14Package } from '../src/index';
import { makeBloodHunter2024Fixture } from './fixture';

test('compiled class, subclasses and canonical features have bilingual names and individual Foundry icons', () => {
  const pkg = compileBloodHunterV14Package(makeBloodHunter2024Fixture());
  for (const item of [...pkg.classes, ...pkg.subclasses, ...pkg.features]) {
    expect(item.name).toMatch(/[\u3400-\u9fff].* [A-Za-z]/);
    expect(item.img).toMatch(/^icons\/.+\.webp$/);
    expect(item.img).not.toBe('icons/svg/book.svg');
    for (const effect of item.effects) expect(effect.img).toBe(item.img);
  }
});

test('preserves the explicit Hemocraft resource identifier and the stable canonical identity', () => {
  const source = makeBloodHunter2024Fixture();
  const before = compileBloodHunterV14Package(source);
  source.foundryClassFeature!.push({ source: 'BloodHunter2024', name: '鲜血秘法', className: '血猎手', classSource: 'BloodHunter2024', level: 1, system: { identifier: 'blood-maledict' } });
  const after = compileBloodHunterV14Package(source);
  const first = before.features.find((item) => item.system.identifier === 'hemocraft')!;
  const resource = after.features.find((item) => item.system.identifier === 'blood-maledict')!;
  expect(resource).toBeDefined();
  expect(resource._id).toBe(first._id);
  expect(resource.flags.fvttJsonGenerator).toMatchObject({ bloodHunter2024: { canonicalId: first._id } });
});
