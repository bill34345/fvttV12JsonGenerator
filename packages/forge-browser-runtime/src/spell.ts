
import { createBundledIconResolutionSession } from '@fvtt-json-generator/assets-icons/icon-browser';
import { generateSpellArtifact as generateSpell, type SpellArtifact } from '@fvtt-json-generator/workflows/spell-generation';
import type { NativeDocumentProjection } from '@fvtt-json-generator/workflows/native-projection';

export { verifySavedSpellArtifact, type SpellArtifact } from '@fvtt-json-generator/workflows/spell-generation';

export function generateSpellArtifact(content: string, nativeProjection?: NativeDocumentProjection): Promise<SpellArtifact> {
  const icons = createBundledIconResolutionSession('14', { mode: 'safe' });
  return generateSpell(content, nativeProjection, icons.resolver);
}
