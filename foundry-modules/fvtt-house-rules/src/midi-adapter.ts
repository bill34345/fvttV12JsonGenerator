type Runtime = Record<string, any>;

export interface CriticalAdapterStatus {
  supported: boolean;
  reason: "unsupported-system" | "missing-hook-api" | "missing-die-class" | "missing-modifier-registry" | "missing-tooltip-api" | "ready-for-runtime-validation";
}

/** Optional modules share this dice interface; their release labels are not capabilities. */
export function inspectCriticalAdapter(globals: Runtime = globalThis): CriticalAdapterStatus {
  if (globals.game?.system?.id !== "dnd5e") return { supported: false, reason: "unsupported-system" };
  if (typeof globals.Hooks?.on !== "function") return { supported: false, reason: "missing-hook-api" };
  const DieClass = globals.foundry?.dice?.terms?.Die;
  if (typeof DieClass !== "function") return { supported: false, reason: "missing-die-class" };
  const modifiers = DieClass.MODIFIERS;
  if (!modifiers || typeof modifiers !== "object" || Array.isArray(modifiers)) {
    return { supported: false, reason: "missing-modifier-registry" };
  }
  if (typeof DieClass.prototype?.getTooltipData !== "function") return { supported: false, reason: "missing-tooltip-api" };
  return { supported: true, reason: "ready-for-runtime-validation" };
}
