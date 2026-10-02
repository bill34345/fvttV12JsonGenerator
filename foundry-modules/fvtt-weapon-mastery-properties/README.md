# Weapon Mastery & Properties

`fvtt-weapon-mastery-properties` is an independent, locally executed Foundry module for D&D 2024 weapon masteries and explicitly configured weapon properties. It uses `fvtt-custom-conditions` for temporary effects and `fvtt-trigger-engine` for event coordination. It does not require `fvtt-house-rules`.

Target: Foundry **14.364**, dnd5e **5.3.3**. Both dependencies must expose their version 1 weapon-effect/external-event APIs. Accepted dependency versions are 0.1.1 or later in the 0.1 series, plus exactly 0.2.0; 0.2.1 and later are outside this compatibility gate. Different Foundry/system versions are rejected. Resume from the [single main checklist](../../docs/reviews/2026-09-25-weapon-mastery-user-report.md), then the [one active-case plan](../../docs/plans/weapon-mastery-active-case.md) when needed. A successful build is not gameplay acceptance.

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

When a player applies damage, Slow and Vex wait for the active GM to match the attack and damage messages to the actual Actor update. Ambiguous matches remain pending for GM review. Local acceptance includes a real SY player attack and damage application with online-GM Slow settlement, plus separately recorded Midi/native Vex two-hit, consumption and regrant evidence. Representative cross-client runs and automated authorization/concurrency checks do not imply every player, Actor and Token combination was tested manually. The main checklist records exact evidence and build identities. This is an accepted local delivery candidate, not a production release.

## Verification boundary

Rule tests, configuration tests, artifact checks, source generation, and authenticated local Foundry behavior are separate evidence layers. A reminder card does not prove Nick's extra-attack allowance, and displayed damage does not prove target damage or effect consumption. Production and long-session acceptance are outside local test results.

## Frozen build and repeatable acceptance

Run the explicit build before install or verification. The build writes dist/build-identity.json; install, patch, verify-artifact, and verify-install consume that frozen artifact without rebuilding. Source/configuration/lockfile/dependency changes require a new build. The browser API exposes buildId for the loaded candidate. API-driven and UI acceptance stay distinct; retain owned fixtures across the batch and reset case state before reuse. See the CoTN runbook and custom-module-development runbook under docs/runbooks.

The Cleave test uses a Large 2x2 source and two non-overlapping Medium targets so both are within the weapon's actual reach under the world's existing diagonal metric. Other cases restore the source to Medium 1x1. The harness shows measured `cleaveGeometry` and blocks an out-of-reach or unmeasurable setup before attacking; it does not widen weapon reach or change world grid settings.
