export const FORGE_SOURCE_ID_FIELD = 'forge-source-id' as const;
export const FORGE_SOURCE_ID_PREFIX = 'actor:v1:' as const;

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export type ForgeSourceId = string & { readonly __forgeSourceId: unique symbol };

export function isForgeSourceId(value: unknown): value is ForgeSourceId {
  return typeof value === 'string'
    && value.startsWith(FORGE_SOURCE_ID_PREFIX)
    && UUID_V4_PATTERN.test(value.slice(FORGE_SOURCE_ID_PREFIX.length));
}
