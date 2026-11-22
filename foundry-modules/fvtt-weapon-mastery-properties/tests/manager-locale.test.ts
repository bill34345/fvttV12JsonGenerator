import { describe, expect, test } from 'bun:test';
import { buildWeaponPreview, configurationFromForm, masteryDisplayLabel } from '../src/manager.ts';

const zhMasteries = {
  cleave: '横扫',
  graze: '擦掠',
  nick: '迅击',
  push: '推离',
  sap: '削弱',
  slow: '缓速',
  topple: '失衡',
  vex: '侵扰',
} as const;

const chineseLocale: Record<string, string> = await Bun.file(new URL('../src/lang/zh-CN.json', import.meta.url)).json();

function localizedGlobals(): any {
  return { game: { i18n: { localize: (key: string) => chineseLocale[key] ?? key } } };
}

describe('weapon mastery user-facing localization', () => {
  test('uses the DND5e 不全书 Chinese terms for all official masteries', () => {
    const globals = localizedGlobals();
    for (const [kind, label] of Object.entries(zhMasteries)) {
      expect(masteryDisplayLabel(kind as keyof typeof zhMasteries, globals)).toBe(label);
    }
  });

  test('falls back to the persisted English mastery name without Foundry i18n', () => {
    expect(masteryDisplayLabel('vex', {})).toBe('Vex');
    expect(masteryDisplayLabel('slow', {})).toBe('Slow');
  });

  test('localizes the manager preview without changing configuration IDs', () => {
    const globals = localizedGlobals();
    const configuration = configurationFromForm({
      enabled: true,
      mastery: 'dnd2024.vex',
      grantMastery: true,
      propertyKind: 'criticalBleeding',
      propertyFormula: '1d6',
      propertyMode: 'damage',
      propertyDamageType: 'slashing',
      propertyEndOnHealing: true,
    });
    const preview = buildWeaponPreview({ system: { damage: { base: { formula: '1d6 + @mod' } } } }, configuration, globals);

    expect(configuration.mastery).toBe('dnd2024.vex');
    expect(preview.ordinary).toBe('普通命中: 1d6 + @mod');
    expect(preview.critical).toContain('重击: 2d6 + @mod; 1d6 流血 (伤害)');
  });
});
