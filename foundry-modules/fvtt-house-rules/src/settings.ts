import { MODULE_ID, SCHEMA_VERSION, SETTING } from "./constants";
import { isAuthority, type ActiveUser } from "./core/authority";

type Runtime = Record<string, any>;

function gameRuntime(): Runtime | null {
  const runtime = globalThis as Runtime;
  return runtime.game?.settings ? runtime : null;
}

/** World settings are persistent state too: only the deterministic active GM may write them. */
function currentIsAuthority(): boolean {
  const runtime = gameRuntime();
  const currentUserId = runtime?.game?.user?.id;
  const users = runtime?.game?.users ? Array.from(runtime.game.users) as ActiveUser[] : [];
  return isAuthority(currentUserId, users);
}

function register(key: string, data: Record<string, unknown>): void {
  const runtime = gameRuntime();
  runtime?.game.settings.register(MODULE_ID, key, data);
}

export function registerSettings(): void {
  register(SETTING.schemaVersion, { scope: "world", config: false, type: Number, default: 0 });
  register(SETTING.setupSeen, { scope: "world", config: false, type: Boolean, default: false });

  for (const key of [
    SETTING.potion,
    SETTING.hpGamble,
    SETTING.lowAbility,
    SETTING.ammo,
    SETTING.stealth,
    SETTING.naturalOne,
    SETTING.naturalTwenty
  ]) {
    register(key, {
      name: `FVTT_HOUSE_RULES.Settings.${key}.Name`,
      hint: `FVTT_HOUSE_RULES.Settings.${key}.Hint`,
      scope: "world",
      config: true,
      restricted: true,
      type: Boolean,
      default: false
    });
  }

  register(SETTING.lowAbilityThreshold, {
    name: "FVTT_HOUSE_RULES.Settings.lowAbilityThreshold.Name",
    hint: "FVTT_HOUSE_RULES.Settings.lowAbilityThreshold.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    default: 4,
    range: { min: 0, max: 10, step: 1 }
  });
  register(SETTING.consequenceMultiplier, {
    name: "FVTT_HOUSE_RULES.Settings.consequenceMultiplier.Name",
    hint: "FVTT_HOUSE_RULES.Settings.consequenceMultiplier.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    default: 0.5,
    choices: { "0.5": "0.5", "1": "1" }
  });
  register(SETTING.consequenceOtherTable, {
    name: "FVTT_HOUSE_RULES.Settings.consequenceOtherTable.Name",
    hint: "FVTT_HOUSE_RULES.Settings.consequenceOtherTable.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: ""
  });
  register(SETTING.stealthRogueLevel, {
    name: "FVTT_HOUSE_RULES.Settings.stealthRogueLevel.Name",
    hint: "FVTT_HOUSE_RULES.Settings.stealthRogueLevel.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    default: 7,
    range: { min: 1, max: 20, step: 1 }
  });
}

export function setting<T>(key: string): T | undefined {
  return gameRuntime()?.game.settings.get(MODULE_ID, key) as T | undefined;
}

export async function migrateWorldSchema(): Promise<boolean> {
  const runtime = gameRuntime();
  if (!runtime || !currentIsAuthority()) return false;
  const current = setting<number>(SETTING.schemaVersion) ?? 0;
  if (current > SCHEMA_VERSION) return false;
  if (current < SCHEMA_VERSION) await runtime.game.settings.set(MODULE_ID, SETTING.schemaVersion, SCHEMA_VERSION);
  return true;
}

/** All modifying rules are intentionally off. This only creates a GM-facing first-run entry point. */
export async function announceFirstRun(): Promise<void> {
  const runtime = gameRuntime();
  if (!runtime || !currentIsAuthority() || setting<boolean>(SETTING.setupSeen)) return;
  runtime.ui?.notifications?.info(runtime.game.i18n.localize("FVTT_HOUSE_RULES.FirstRun"));
  await runtime.game.settings.set(MODULE_ID, SETTING.setupSeen, true);
}
