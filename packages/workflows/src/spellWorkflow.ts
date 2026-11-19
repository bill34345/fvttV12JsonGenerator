
import { parseSpellSource } from '@fvtt-json-generator/parser/spell-source';
import { generateSpellDocument } from '@fvtt-json-generator/generation/spell';
import { verifyGeneratedSpell } from '@fvtt-json-generator/generation/verification';
import type { GenerationIconResolver } from '@fvtt-json-generator/generation/ports';
import { projectNativeDocument, type NativeDocumentProjection } from './nativeProjection';

/** Verify the same artifact and source that the caller will preview and download. */
export async function generateSpellArtifact(content: string, nativeProjection?: NativeDocumentProjection, iconResolver?: GenerationIconResolver) {
  const source = parseSpellSource(content);
  const item: ReturnType<typeof generateSpellDocument> & { img?: string } = generateSpellDocument(source);
  iconResolver?.resolveStandaloneItem(item);
  let verification = verifyGeneratedSpell(source, item);
  if (verification.status !== 'failed' && nativeProjection) {
    const native = await projectNativeDocument(nativeProjection, 'Item', item);
    verification = verifyGeneratedSpell(source, native);
  }
  return { fileName: source.identifier + '.json', source, item, verification };
}

export type SpellArtifact = Awaited<ReturnType<typeof generateSpellArtifact>>;

export function verifySavedSpellArtifact(artifact: SpellArtifact, output: unknown) {
  return verifyGeneratedSpell(artifact.source, output, { saved: true });
}
