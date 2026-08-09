import { announceFirstRun, migrateWorldSchema, registerSettings } from "./settings";
import { installHouseRulesApi, installHouseRulesRuntime } from "./runtime";

const Hooks = (globalThis as Record<string, any>).Hooks;

Hooks?.once?.("init", () => registerSettings());
Hooks?.once?.("ready", async () => {
  await migrateWorldSchema();
  installHouseRulesApi();
  installHouseRulesRuntime();
  await announceFirstRun();
});
