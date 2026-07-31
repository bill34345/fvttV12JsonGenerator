import { describe, expect, test } from 'bun:test';
import { renderIconReviewGallery, resolveInstalledIconPath } from '../iconReviewGallery';
import type { IconReviewReport } from '../../core/icons/types';

describe('v14 icon review gallery', () => {
  test('maps tracked logical paths to the locked local runtime without copying artwork', () => {
    expect(resolveInstalledIconPath('icons/creatures/abilities/wings-birdlike-blue.webp'))
      .toContain('.local\\foundry-v14\\app\\14.364\\public\\icons\\creatures\\abilities');
    expect(resolveInstalledIconPath('systems/dnd5e/icons/svg/items/feature.svg'))
      .toContain('.local\\foundry-v14\\data\\server-mirror\\Data\\systems\\dnd5e\\icons\\svg\\items');
    expect(() => resolveInstalledIconPath('modules/example/icon.webp')).toThrow('Unsupported icon path');
  });

  test('renders review provenance and escapes untrusted names', () => {
    const report: IconReviewReport = {
      schemaVersion: 1,
      target: { foundryVersion: '14.364', systemId: 'dnd5e', systemVersion: '5.3.3' },
      mode: 'safe',
      summary: { total: 1, override: 0, existing: 0, exact: 1, semantic: 0, fallback: 0 },
      entries: [{
        actorName: '<Nightgaunt>',
        itemName: '飞掠',
        englishName: 'Flyby',
        itemType: 'feat',
        previousPath: 'icons/svg/mystery-man.svg',
        selectedPath: 'icons/creatures/abilities/wings-birdlike-blue.webp',
        source: 'compendium-exact',
        confidence: 'exact',
        reasons: ['Exact Compendium match.'],
        alternatives: [],
      }],
    };
    const html = renderIconReviewGallery(report);

    expect(html).toContain('飞掠 (Flyby)');
    expect(html).toContain('&lt;Nightgaunt&gt;');
    expect(html).toContain('compendium-exact');
    expect(html).toContain('file:///');
    expect(html).not.toContain('<Nightgaunt>');
  });
});
