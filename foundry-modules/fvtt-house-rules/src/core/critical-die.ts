export const CRITICAL_MAX_MODIFIER = "critmax" as const;

type AnyRecord = Record<string, any>;
type ModifierMap = Record<string, unknown>;

const TOOLTIP_PATCH = Symbol.for("fvtt-house-rules.critical-max-tooltip");
const CRITICAL_MAX_PATTERN = /^critmax([1-9][0-9]*)$/iu;
const NATIVE_DIE_FACES = new Set([4, 6, 8, 10, 12, 20]);

export type CriticalMaxLocalizer = (key: string, fallback: string) => string;

export interface CriticalMaxTooltipData {
  formula?: string;
  rolls?: Array<{ result?: string; classes?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export function criticalMaxModifier(faces: number): string | null {
  return Number.isInteger(faces) && faces >= 2 ? `${CRITICAL_MAX_MODIFIER}${faces}` : null;
}

export function parseCriticalMaxModifier(modifier: unknown, faces: unknown): number | null {
  if (typeof modifier !== "string" || typeof faces !== "number" || !Number.isInteger(faces) || faces < 2) return null;
  const match = CRITICAL_MAX_PATTERN.exec(modifier);
  if (!match || Number(match[1]) !== faces) return null;
  return faces;
}

export function criticalMaxTarget(modifiers: unknown, faces: unknown): number | null {
  const values = Array.isArray(modifiers)
    ? modifiers
    : modifiers instanceof Set
      ? [...modifiers]
      : null;
  if (!values) return null;
  for (const modifier of values) {
    const target = parseCriticalMaxModifier(modifier, faces);
    if (target !== null) return target;
  }
  return null;
}

/** Apply the effective count while deliberately preserving the raw face. */
export function applyCriticalMaxResult(result: AnyRecord, faces: number): boolean {
  if (!result || typeof result.result !== "number" || !Number.isFinite(result.result)) return false;
  result.count = faces;
  return true;
}

function criticalMaxModifierHandler(this: AnyRecord, modifier: string): boolean | void {
  const target = parseCriticalMaxModifier(modifier, this?.faces);
  // Keep the whole critical damage pool in one DiceTerm. Foundry preserves
  // result order inside that term, so results[0] is the physical first die;
  // applying the modifier to a split/reconstructed term can make the UI and
  // downstream dnd5e modifiers observe a different die as the first one.
  if (target === null || !Array.isArray(this.results) || this.results.length < 1) return false;
  return applyCriticalMaxResult(this.results[0], target) ? undefined : false;
}

/** Register only the namespaced behavior used by this module. */
export function installCriticalMaxModifier(DieClass: AnyRecord): boolean {
  const modifiers = DieClass?.MODIFIERS as ModifierMap | undefined;
  if (!modifiers || Array.isArray(modifiers)) return false;
  const existing = modifiers[CRITICAL_MAX_MODIFIER];
  if (existing !== undefined && existing !== criticalMaxModifierHandler) return false;
  modifiers[CRITICAL_MAX_MODIFIER] = criticalMaxModifierHandler;
  return modifiers[CRITICAL_MAX_MODIFIER] === criticalMaxModifierHandler;
}

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function localized(localize: CriticalMaxLocalizer, key: string, fallback: string): string {
  const value = localize(key, fallback);
  return typeof value === "string" && value !== key ? value : fallback;
}

function nativeDieClass(faces: number): string | null {
  return NATIVE_DIE_FACES.has(faces) ? `d${faces}` : null;
}

export function criticalMaxTooltipMarkup(
  effective: number,
  raw: number,
  localize: CriticalMaxLocalizer
): string {
  const combinedLabel = localized(
    localize,
    "FVTT_HOUSE_RULES.CriticalMax.Combined",
    `Original die result: ${raw}; critical damage counts this die as ${effective}`
  )
    .replaceAll("{original}", String(raw))
    .replaceAll("{effective}", String(effective));
  const dieClass = nativeDieClass(effective);
  const stackClass = ["fvtt-house-rules-critmax-stack", dieClass].filter(Boolean).join(" ");
  return `<span class="${stackClass}" data-original="${escapeHtml(raw)}" data-effective="${escapeHtml(effective)}" data-tooltip="${escapeHtml(combinedLabel)}" role="img" aria-label="${escapeHtml(combinedLabel)}"></span>`;
}

export function decorateCriticalMaxTooltipData(
  term: AnyRecord,
  data: CriticalMaxTooltipData,
  localize: CriticalMaxLocalizer
): CriticalMaxTooltipData {
  const target = criticalMaxTarget(term?.modifiers, term?.faces);
  // getTooltipData emits one roll item per result. The critical-max modifier
  // belongs to the DiceTerm, but its contract is specifically result[0].
  // Decorate only the corresponding first item and leave every later die
  // native, including any extra dice created by a special modifier.
  const result = Array.isArray(term?.results) && term.results.length > 0 ? term.results[0] : null;
  const tooltipRoll = Array.isArray(data?.rolls) && data.rolls.length > 0 ? data.rolls[0] : null;
  if (target === null || !result || !tooltipRoll || typeof result.result !== "number"
    || !Number.isFinite(result.result) || typeof result.count !== "number" || result.count !== target) return data;

  tooltipRoll.classes = "fvtt-house-rules-critmax-primary";
  tooltipRoll.result = criticalMaxTooltipMarkup(result.count, result.result, localize);
  return data;
}

/** Wrap Foundry's tooltip data method without changing the Roll or its results. */
export function installCriticalMaxTooltip(DieClass: AnyRecord, localize: CriticalMaxLocalizer): boolean {
  const prototype = DieClass?.prototype as AnyRecord | undefined;
  if (!prototype) return false;
  const original = prototype?.getTooltipData;
  if (typeof original !== "function") return false;
  if (Object.prototype.hasOwnProperty.call(original, TOOLTIP_PATCH)) return true;

  const wrapped = function(this: AnyRecord, ...args: unknown[]): CriticalMaxTooltipData {
    const data = original.apply(this, args) as CriticalMaxTooltipData;
    return decorateCriticalMaxTooltipData(this, data, localize);
  };
  Object.defineProperty(wrapped, TOOLTIP_PATCH, { value: true });
  try {
    Object.defineProperty(prototype, "getTooltipData", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: wrapped
    });
    return prototype.getTooltipData === wrapped;
  } catch {
    return false;
  }
}

export function installCriticalMaxDieIntegration(
  DieClass: AnyRecord,
  localize: CriticalMaxLocalizer
): boolean {
  return installCriticalMaxModifier(DieClass) && installCriticalMaxTooltip(DieClass, localize);
}
