export const FORGE_ITEM_SOURCE_ID_PREFIX = 'item:v1:' as const;

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export type ForgeItemSourceId = string & { readonly __forgeItemSourceId: unique symbol };

export function isForgeItemSourceId(value: unknown): value is ForgeItemSourceId {
  return typeof value === 'string'
    && value.startsWith(FORGE_ITEM_SOURCE_ID_PREFIX)
    && UUID_V4_PATTERN.test(value.slice(FORGE_ITEM_SOURCE_ID_PREFIX.length));
}
