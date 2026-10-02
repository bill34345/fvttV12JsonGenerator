import { describe, expect, test } from 'bun:test';
import {
  buildWeaponPreview,
  configurationFromForm,
  copyOfficialMasteryPreset,
  createWeaponManagerApplicationClass,
} from '../src/manager.ts';
import { officialMasteryRule, parseWeaponConfiguration, type WeaponConfiguration } from '@fvtt-json-generator/contracts/weapon-properties';

function setup(options: { gm?: boolean; dependencies?: () => any } = {}) {
  const weapon = {
    uuid: 'Item.sword',
    id: 'sword',
    name: 'Sword <script>alert(1)</script>',
    type: 'weapon',
    system: { damage: { base: { formula: '1d6 + @mod' } } },
  };
  const worldWeapon = { uuid: 'Item.world', id: 'world', name: 'World axe', type: 'weapon', system: { damage: { base: { formula: '1d8' } } } };
  const actor = { uuid: 'Actor.hero', id: 'hero', name: 'Hero', items: [weapon] };
  const calls: Array<[any, WeaponConfiguration]> = [];
  const errors: string[] = [];
  const configurations = new Map<string, WeaponConfiguration>();
  const api: any = {
    configuration: (item: any) => configurations.get(item.uuid),
    configure: async (item: any, configuration: WeaponConfiguration) => {
      calls.push([item, structuredClone(configuration)]);
      configurations.set(item.uuid, structuredClone(configuration));
    },
    dependencies: options.dependencies,
  };
  const globals: any = {
    foundry: { applications: { api: { ApplicationV2: class { async render() { return this; } } } } },
    game: {
      user: { isGM: options.gm !== false, targets: new Set() },
      items: { contents: [worldWeapon] },
    },
    canvas: { tokens: { controlled: [{ actor }] } },
    ui: { notifications: { error: (message: string) => errors.push(message) } },
  };
  const Application = createWeaponManagerApplicationClass(api, globals);
  const manager: any = new Application({ api });
  return { api, actor, weapon, worldWeapon, calls, errors, globals, Application, manager };
}

describe('weapon mastery manager configuration', () => {
  test('saves a typed mastery and one Deadly property without a JSON editor', async () => {
    const { calls, Application, manager } = setup();

    await Application.onSubmit.call(manager, undefined, undefined, { object: {
      itemUuid: 'Item.sword', enabled: 'on', mastery: 'dnd2024.slow', grantMastery: 'on',
      propertyKind: 'deadly', propertyDice: '2', propertyDie: '8',
    } });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toMatchObject({ enabled: true, mastery: 'dnd2024.slow', grantMastery: true });
    expect(calls[0]?.[1].rules).toEqual([expect.objectContaining({ kind: 'deadly', params: { dice: 2, die: 8 } })]);
    expect(parseWeaponConfiguration(calls[0]?.[1])).not.toBeNull();
  });

  test('blocks non-GM writes before calling the runtime facade', async () => {
    const { calls, errors, Application, manager } = setup({ gm: false });

    await Application.onSubmit.call(manager, undefined, undefined, { object: {
      itemUuid: 'Item.sword', enabled: 'on', mastery: 'native', grantMastery: false, propertyKind: 'none',
    } });

    expect(calls).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('GMs');
  });

  test('copies an immutable official preset into a namespaced rule and preserves a hostile label as text', async () => {
    const official = officialMasteryRule('graze');
    const label = '<img src=x onerror=alert(1)>';
    const copy = copyOfficialMasteryPreset('graze', label);

    expect(copy.ruleId).toMatch(/^homebrew\.graze\./);
    expect(copy.ruleId).not.toBe(official.ruleId);
    expect(copy.label).toBe(label);
    (copy.params as any).distance = 99;
    expect(official.params).toEqual({});

    const template = await Bun.file(new URL('../src/templates/weapon-manager.hbs', import.meta.url)).text();
    expect(template).not.toContain('{{{');
    expect(template).not.toContain('<textarea');
  });

  test('keeps only one added property when changing Deadly to Fatal', () => {
    const deadly = configurationFromForm({ enabled: true, mastery: 'native', grantMastery: false, propertyKind: 'deadly', propertyDice: 2, propertyDie: 8 });
    const fatal = configurationFromForm({ enabled: true, mastery: 'native', grantMastery: false, propertyKind: 'fatal', propertyDie: 10 }, deadly);

    expect(deadly.rules.filter((rule) => !['cleave', 'graze', 'nick', 'push', 'sap', 'slow', 'topple', 'vex'].includes(rule.kind))).toHaveLength(1);
    expect(fatal.rules.filter((rule) => !['cleave', 'graze', 'nick', 'push', 'sap', 'slow', 'topple', 'vex'].includes(rule.kind))).toEqual([
      expect.objectContaining({ kind: 'fatal', params: { dice: 1, die: 10 } }),
    ]);
  });

  test('surfaces dependency readiness errors and prevents saving while dependencies are unavailable', async () => {
    const fixture = setup({ dependencies: () => ({ ready: false, missing: [{ id: 'fvtt-custom-conditions', message: 'API 0.1.1 is required' }] }) });
    const context = await fixture.manager._prepareContext();
    expect(context.dependency).toEqual({ ready: false, issues: ['API 0.1.1 is required'] });

    await fixture.Application.onSubmit.call(fixture.manager, undefined, undefined, { object: {
      itemUuid: 'Item.sword', enabled: 'on', mastery: 'native', grantMastery: false, propertyKind: 'none',
    } });
    expect(fixture.calls).toHaveLength(0);
    expect(fixture.errors[0]).toContain('API 0.1.1 is required');
  });

  test('renders ordinary and critical formulas in human terms for Fatal', () => {
    const config = configurationFromForm({ enabled: true, mastery: 'native', grantMastery: false, propertyKind: 'fatal', propertyDie: 10 });
    const preview = buildWeaponPreview({ system: { damage: { base: { formula: '1d6 + @mod' } } } }, config);

    expect(preview.ordinary).toContain('普通命中 / Ordinary hit: 1d6 + @mod');
    expect(preview.critical).toContain('重击 / Critical hit: 2d10 + @mod + 1d10');
  });
});
