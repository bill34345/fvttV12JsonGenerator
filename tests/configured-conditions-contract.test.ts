import { describe, expect, test } from 'bun:test';
import { configuredConditionFingerprint, decodeConfiguredConditionCatalog, decodeConfiguredConditionDefinition, type ConfiguredConditionDefinition } from '../packages/contracts/src/configured-conditions';
import { decodeStatusLifecycleParameters } from '../packages/contracts/src/status-lifecycle';

const definition = (): ConfiguredConditionDefinition => ({ schemaVersion: 1, id: 'configured.frost-mark', name: '霜印 Frost Mark', description: '减速并笨拙', aliases: ['霜印', 'Frost Mark'],
  components: [{ kind: 'movement-reduction', feet: 10 }, { kind: 'builtin-condition', conditionId: 'clumsy', params: {} }] });
const lifecycle = () => ({ trigger: 'attack-hit', status: 'configured.frost-mark', definition: definition(), duration: { value: 1, unit: 'minute' },
  repeatSave: { ability: 'con', dc: 13, timing: 'target-turn-end', optional: true } });

describe('configured condition data boundary', () => {
  test('normalizes a reusable mechanism composition and binds its stable ID in the existing lifecycle', () => {
    expect(decodeConfiguredConditionDefinition(definition())).toEqual(definition());
    const decoded = decodeStatusLifecycleParameters(lifecycle());
    expect(decoded.definition).toEqual(definition());
    expect(configuredConditionFingerprint(decoded.definition!)).toBe(configuredConditionFingerprint(definition()));
    const changed = definition(); changed.components[0] = { kind: 'movement-reduction', feet: 5 };
    expect(configuredConditionFingerprint(changed)).not.toBe(configuredConditionFingerprint(definition()));
    expect(() => decodeStatusLifecycleParameters({ ...lifecycle(), definition: undefined })).toThrow();
    const { definition: _, ...withoutSnapshot } = lifecycle();
    expect(() => decodeStatusLifecycleParameters(withoutSnapshot)).toThrow();
    expect(() => decodeStatusLifecycleParameters({ ...lifecycle(), status: 'configured.other' })).toThrow();
    expect(() => decodeStatusLifecycleParameters({ ...lifecycle(), status: 'blinded' })).toThrow();
  });
  test('rejects commands, arbitrary effect paths, aliases that shadow known states and ambiguous catalog names', () => {
    expect(() => decodeConfiguredConditionDefinition({ ...definition(), command: 'unsafe' })).toThrow();
    for (const component of [{ kind: 'script', command: 'unsafe' }, { kind: 'movement-reduction', feet: 10, path: 'system.attributes.hp.value' },
      { kind: 'builtin-condition', conditionId: 'clumsy', params: { command: 'unsafe' } }, { kind: 'movement-reduction', feet: -1 }]) {
      expect(() => decodeConfiguredConditionDefinition({ ...definition(), components: [component] })).toThrow();
    }
    for (const alias of ['blinded', '目盲', 'Clumsy', '<script>']) expect(() => decodeConfiguredConditionDefinition({ ...definition(), aliases: [alias] })).toThrow();
    expect(() => decodeConfiguredConditionCatalog([definition(), { ...definition(), id: 'configured.another' }])).toThrow();
    expect(() => decodeConfiguredConditionCatalog([definition(), definition()])).toThrow();
    expect(() => decodeConfiguredConditionDefinition({ ...definition(), name: 'Blinded' })).toThrow();
    expect(() => decodeConfiguredConditionCatalog([definition(), { ...definition(), id: 'configured.another', aliases: ['Other mark'] }])).toThrow();
    expect(decodeConfiguredConditionCatalog([{ ...definition(), name: 'Frost Mark' }])).toHaveLength(1);
  });
  test('never invokes getters and rejects sparse or augmented arrays', () => {
    let invoked = 0;
    const malicious = { ...definition() };
    Object.defineProperty(malicious, 'components', { enumerable: true, get() { invoked++; return []; } });
    expect(() => decodeConfiguredConditionDefinition(malicious)).toThrow();
    const aliases: any[] = ['Frost Mark']; Object.defineProperty(aliases, '0', { enumerable: true, get() { invoked++; return 'Frost Mark'; } });
    expect(() => decodeConfiguredConditionDefinition({ ...definition(), aliases })).toThrow();
    expect(() => decodeConfiguredConditionDefinition({ ...definition(), components: Array(1) })).toThrow();
    const augmented = Object.assign(['Frost Mark'], { command: 'unsafe' });
    expect(() => decodeConfiguredConditionDefinition({ ...definition(), aliases: augmented })).toThrow();
    expect(invoked).toBe(0);
  });
});
