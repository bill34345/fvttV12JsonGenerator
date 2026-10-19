/** World-document lifecycle only; never part of a portable spell manifest.
 * Missing phase preserves the existing behavior of non-Forge/legacy Actors. */
export const FORGE_IMPORT_FLAG_SCOPE = 'fvtt-json-forge';
export const FORGE_SPELL_IMPORT_PHASE = 'spellImportPhase';
export function isForgeSpellImportPending(actor: any): boolean {
  return actor?.flags?.[FORGE_IMPORT_FLAG_SCOPE]?.[FORGE_SPELL_IMPORT_PHASE] === 'pending';
}
