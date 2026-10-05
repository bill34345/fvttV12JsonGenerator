import { expect, test } from 'bun:test';
import { adaptMirrorForgeSource } from '../mirrorForgeOverlay';

test('Forge source adaptation keeps exact current-runtime artifact binding and rejects drift', () => {
  const source = `if (game.version !== EXPECTED_FOUNDRY_VERSION) throw new Error(\`Forge Actor requires Foundry \${EXPECTED_FOUNDRY_VERSION}.\`);
const expected = { fvttRuntimeVersion: EXPECTED_FOUNDRY_VERSION, };
function assertResponseTarget(target, game) { return target.fvttRuntimeVersion === game.version; }`;
  const adapted = adaptMirrorForgeSource('foundry-modules/fvtt-json-forge/src/runtime.ts', source);
  expect(adapted).toContain('!isForgeCoreVersionSupported(game.version)');
  expect(adapted).toContain('fvttRuntimeVersion: game.version');
  expect(adapted).toContain('target.fvttRuntimeVersion === game.version');
  expect(() => adaptMirrorForgeSource('foundry-modules/fvtt-json-forge/src/runtime.ts', source.replace('game.version !== EXPECTED_FOUNDRY_VERSION', 'true'))).toThrow('source drift');
  expect(adaptMirrorForgeSource('foundry-modules/fvtt-json-forge/src/creatureBlueprintEditor.ts', 'existing approved UI')).toBe('existing approved UI');
});
