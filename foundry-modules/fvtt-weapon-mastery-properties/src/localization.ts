import {
  officialMasteryRule,
  type WeaponMasteryId,
} from '@fvtt-json-generator/contracts/weapon-properties';

/**
 * Resolve a module-owned localization key without making pure/unit-test callers
 * depend on a live Foundry game object. Foundry's language files remain the
 * single source of localized text; the fallback is deliberately English.
 */
export function localizeWmp(globals: any, key: string, fallback: string): string {
  const value = globals?.game?.i18n?.localize?.(key);
  return typeof value === 'string' && value.trim() && value !== key ? value : fallback;
}

export function formatWmp(
  globals: any,
  key: string,
  fallback: string,
  values: Record<string, string | number> = {},
): string {
  const formatter = globals?.game?.i18n?.format;
  if (typeof formatter === 'function') {
    try {
      const value = formatter.call(globals.game.i18n, key, values);
      if (typeof value === 'string' && value.trim() && value !== key) return value;
    } catch {
      // Fall back to localize plus bounded placeholder replacement below.
    }
  }
  const localized = localizeWmp(globals, key, fallback);
  return localized.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/gu, (_match, name: string) => String(values[name] ?? `{${name}}`));
}

export function localizeMasteryLabel(globals: any, kind: WeaponMasteryId): string {
  return localizeWmp(globals, `FVTTWMP.Masteries.${kind}`, officialMasteryRule(kind).label);
}
