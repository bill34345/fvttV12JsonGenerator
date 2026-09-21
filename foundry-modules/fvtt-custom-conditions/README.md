# FVTT Custom Conditions

`fvtt-custom-conditions` is a GM-managed custom status module for Foundry VTT 14.364 and dnd5e 5.3.3. It depends on `fvtt-trigger-engine` for generic Actor and Combat lifecycle events.

The module registers nineteen custom conditions. Parameterized instances store their formula, damage type, DC, timing, stacking policy, and end rules in `flags.fvtt-custom-conditions.condition`. Generated Item ActiveEffects are templates; applying one creates a new Actor instance so manual operation and generated monster data use the same schema.

Install both modules, then open Custom Conditions from the module settings or Token controls. GM users can apply, edit, disable, and remove conditions without changing code. Bloodied remains native to dnd5e; Drakkenheim Madness and Contamination are outside this release.

Build and test with `bun run build:custom-conditions`, `bun run test:custom-conditions`, and `bun run typecheck:foundry-modules`.

Bleeding and Burning select the strongest formula globally per Actor and condition, including different origins and Burning damage types. Compare deterministic expected values; ties retain the existing instance. Both default to turn end. Generated parameters come from the source feature, not CR or the attack's immediate damage.

Immobilized and Frozen block voluntary dragging and keyboard movement, including non-GM position edits through the Token HUD or configuration. GM coordinate edits and API-driven forced movement remain available for adjudication and do not consume Dazed's movement choice.

E2E defaults to server-mirror, world `fvtt-v14-module-matrix`, port 30001, Foundry 14.364 / dnd5e 5.3.3. Runtime evidence covers core condition rules, generated templates, settlement/removal, reload without repeated damage, and the Sickened, canceled-attack, and voluntary-movement fixes. Mouse dragging and player HUD elevation edits have direct evidence; keyboard hold remains untested because of browser-tool input limitations. Current acceptance and usage are documented in the repository's `docs/reviews/2026-09-21-custom-conditions-release-readiness.md` and `docs/runbooks/custom-conditions-and-trigger-engine-usage.md`.
