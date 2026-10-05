# Weapon Mastery & Properties

`fvtt-weapon-mastery-properties` is an independent, locally executed Foundry module for D&D 2024 weapon masteries and explicitly configured weapon properties. It uses `fvtt-custom-conditions` for temporary effects and `fvtt-trigger-engine` for event coordination. It does not require `fvtt-house-rules`.

The historical accepted target is Foundry **14.364** / dnd5e **5.3.3**. The exact **14.368 / 6.0.5** candidate adds native effect/message adapters; scoped real Next acceptance now includes readiness, native Slow writer, Fatal dice, one native attack/Midi card ancestry, actual HP/Slow application from that saved card, and pre-attack cancellation with exact r84 case restoration; this does not extend every mastery branch or production acceptance. Both dependencies expose version 1 APIs and versions 0.1.1 or later in the 0.1 series, plus exactly 0.2.0; later versions and crossed pairs remain rejected. Next additionally requires CC's positive native6 writer capability and, when enabled, exact Midi **14.6.0-beta.4338eeab.local.10**. Same-card type4 needs matching activity/item/source/target, attack and damage rolls, and actual HP evidence; unproven local10 type0 cards are rejected. Current Next progress is in the [four-module migration report](../../docs/reviews/2026-10-05-next-four-modules-progress.md); historical 5.3.3 evidence stays in the [main checklist](../../docs/reviews/2026-09-25-weapon-mastery-user-report.md). Builds and unit checks do not establish gameplay acceptance.

The scope is Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex, plus Deadly, Fatal and critical bleeding. Official rule identities remain distinct from copied custom variants. Sources, targets, stacking groups and one-use effect consumption are explicit. Existing weapons are not automatically modified.

## Development

From the repository root, use the package scripts:

```text
bun run test:weapon-mastery-properties
bun run build:weapon-mastery-properties
bun run typecheck:foundry-modules
```

Installation uses the guarded local Lab installer after checking the shared service's identity and availability. Do not restart a shared service, edit a running world database, or copy another module's private runtime to make a test pass.

## Data boundary

Module configuration lives under `flags.fvtt-weapon-mastery-properties.weapon` and is validated by the browser-safe `contracts/weapon-properties` schema. The official `system.mastery` field remains native. Character mastery proficiency is separate from weapon proficiency; explicit GM grants support configured NPCs. A translated label never grants a mechanic.

Generated fixed damage uses one literal Activity part and an exact source binding instead of also adding the Item base or an inferred ability modifier. Native inferred weapons keep their native base. Fatal resolves either unambiguous form. Editing a generated damage part invalidates its binding; update the source and regenerate rather than allowing the runtime to guess which rider is the base.

Deadly can be represented by an Attack Activity's native `damage.critical.bonus`. Exact Fatal and temporary effect lifecycle require the module. Official weapon properties are not PF2e system data, and the module does not change the D&D critical-hit threshold or action economy to PF2e rules.

The candidate Cleave flow asks the GM to choose a legal second target, then makes a separate attack and damage roll. Positive attack ability modifiers are excluded from the second damage roll; negative modifiers remain. Nick uses the existing Light extra attack, including when the first Light weapon has no module configuration. Midi fast-forward attacks still show a confirmation dialog so that the final mastery and offhand choice can be checked before a one-use effect is started.

With Midi enabled, the candidate public `WMP.api.use` starts one attack using the existing prepared nonce and forwards the specified target to Midi. A specified target needs an available Token on the current canvas; an Actor without that Token is rejected. The result can remain pending while damage follows the workflow's existing settings, so a returned attack does not prove HP loss. Cancelling releases an unstarted effect without opening a fallback attack. This entry rejects `message.systemCard`, which prevents Midi from automatically starting an attack. Real Next verification remains bound to the current migration report.

When a player applies damage, Slow and Vex wait for the active GM to match the attack and damage messages to the actual Actor update. Ambiguous matches remain pending for GM review. Local acceptance includes a real SY player attack and damage application with online-GM Slow settlement, plus separately recorded Midi/native Vex two-hit, consumption and regrant evidence. Representative cross-client runs and automated authorization/concurrency checks do not imply every player, Actor and Token combination was tested manually. The main checklist records exact evidence and build identities. This is an accepted local delivery candidate, not a production release.

## Verification boundary

Rule tests, configuration tests, artifact checks, source generation, and authenticated local Foundry behavior are separate evidence layers. A reminder card does not prove Nick's extra-attack allowance, and displayed damage does not prove target damage or effect consumption. Production and long-session acceptance are outside local test results.

## Frozen build and repeatable acceptance

Run the explicit build before install or verification. The build writes dist/build-identity.json; install, patch, verify-artifact, and verify-install consume that frozen artifact without rebuilding. Source/configuration/lockfile/dependency changes require a new build. The browser API exposes buildId for the loaded candidate. API-driven and UI acceptance stay distinct; retain owned fixtures across the batch and reset case state before reuse. See the CoTN runbook and custom-module-development runbook under docs/runbooks.

The Cleave test uses a Large 2x2 source and two non-overlapping Medium targets so both are within the weapon's actual reach under the world's existing diagonal metric. Other cases restore the source to Medium 1x1. The harness shows measured `cleaveGeometry` and blocks an out-of-reach or unmeasurable setup before attacking; it does not widen weapon reach or change world grid settings.
