import {
  FORGE_SOURCE_ID_FIELD,
  isForgeSourceId,
} from '@fvtt-json-generator/contracts';

/** Validate and consume the one Forge-owned frontmatter field shared by Actor parsers. */
export function validateForgeSourceMetadata(value: unknown): void {
  if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, FORGE_SOURCE_ID_FIELD)) return;
  if (!isForgeSourceId(value[FORGE_SOURCE_ID_FIELD])) {
    throw new Error(`InvalidField: '${FORGE_SOURCE_ID_FIELD}' must be a canonical Forge UUID v4 source ID`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
