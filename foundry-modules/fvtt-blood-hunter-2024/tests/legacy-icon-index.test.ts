import { expect, test } from 'bun:test';
import { BLOOD_HUNTER_DND6_TARGET, compileBloodHunterV14Package, EXPECTED_BLOOD_HUNTER_SOURCE_SHA256 } from '../../../packages/blood-hunter-v14/src/index.ts';
import { buildLegacyIconIndex } from '../legacyIconIndex.ts';

test('legacy icon source generation rejects unapproved bytes before source lookup', () => {
  expect(() => buildLegacyIconIndex(new TextEncoder().encode('{}'), {} as any)).toThrow('SHA-256');
});

const sourcePath = process.env.FVTT_OPS_BLOOD_HUNTER_SOURCE;
test.skipIf(!sourcePath)('locked real source generates the eight reviewed legacy identities without changing canonical content', async () => {
  const raw = new Uint8Array(await Bun.file(sourcePath!).arrayBuffer());
  const pkg = compileBloodHunterV14Package({ source: raw, target: BLOOD_HUNTER_DND6_TARGET });
  const before = JSON.stringify(pkg);
  const index = buildLegacyIconIndex(raw, pkg);
  expect(index.sourceSha256).toBe(EXPECTED_BLOOD_HUNTER_SOURCE_SHA256);
  expect(index.canonicalLogicalHash).toBe(pkg.logicalHash);
  const expected = [
    ['classes.html', '血猎手_bloodhunter2024', '25d112d765d4a190'],
    ['classFeature', '鲜血秘法_血猎手_bloodhunter2024_1_bloodhunter2024', '0548c972c5a53a72'],
    ['classFeature', '武器精通_血猎手_bloodhunter2024_1_bloodhunter2024', undefined],
    ['optionalfeatures.html', '印记血咒_bloodhunter2024', '29e9177d83089997'],
    ['optionalfeatures.html', '焦虑血咒_bloodhunter2024', 'e38f30d285e285a9'],
    ['classFeature', '猩红仪式_血猎手_bloodhunter2024_2_bloodhunter2024', 'b504a69b128fed23'],
    ['classFeature', '战斗风格_血猎手_bloodhunter2024_2_bloodhunter2024', '32adb50a01da4387'],
    ['optionalfeatures.html', '烈焰血仪_bloodhunter2024', '90bcddb0c1c173a2'],
  ];
  for (const [page, urlIdentity, canonicalId] of expected) {
    const matches = index.entries.filter((entry) => entry.page === page && entry.urlIdentity === urlIdentity);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.canonicalId).toBe(canonicalId);
    expect(matches[0]!.img).toStartWith('icons/');
  }
  const mastery = index.entries.find((entry) => entry.sourceName === '武器精通')!;
  expect(mastery.route).toBe('source-presentation-registry');
  expect(mastery.img).toBe('icons/weapons/swords/sword-runed-glowing.webp');
  expect(index.entries.find((entry) => entry.sourceName === '战斗风格')!.route).toBe('source-backed-fighting-style-marker');
  expect(JSON.stringify(pkg)).toBe(before);
});
