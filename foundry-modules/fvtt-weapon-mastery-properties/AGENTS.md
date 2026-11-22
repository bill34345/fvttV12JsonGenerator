# Weapon Mastery & Properties module

## Scope

This directory owns the standalone `fvtt-weapon-mastery-properties` module.
For runtime admission, read `src/adapters/dependencies.ts`. Choose the adapter
using both Core and dnd5e versions. The dnd5e 6 path requires CC's positive
`weaponEffects.capabilities.native6Effects === 1`. Read native identities from
message `system` and require the matching attack, target and actual damage
before settling a damage-dependent rule. Check the module README and the
[support matrix](../../docs/acceptance/current-support-matrix.md) for accepted
behavior by version, build and role. Keep the manifest verified value tied to
its reviewed range.

The browser entry must remain browser safe. `src/core` contains pure,
source-driven eligibility, critical-damage, and settlement helpers. It may
consume the versioned browser-safe weapon-properties contract, but it must not
import Node, Bun, filesystem, Foundry document mutation, another module's
private implementation, or generator internals.

Every settlement carries a stable rule identity and source/target/attack
identity. The runtime adapter is responsible for GM authority, idempotency,
document writes, distance conversion, saving throws, and condition lifecycle.
Pure helpers fail closed when an attack, source, target, turn, size, or damage
context is missing. Cleave child attacks carry a parent ID and cannot generate
another Cleave child.

Use the locked dnd5e Weapon Masteries data for rule IDs and parameters. For
Chinese labels, use the 2024 translation cited in `README.zh-CN.md`. Identify
rules by stable ID. Keep house properties and the existing `slowed` condition
distinct from official masteries.

## Verification

Use the package scripts for focused tests, typecheck, deterministic build, and
artifact verification. Do not install, start, stop, or modify a Foundry Lab
while working on pure core code unless the parent task explicitly coordinates
that operation.

## Mirror Core patch continuation (2026-10-03)

The user authorized Mirror Foundry `14.368` with dnd5e `5.3.3`. Runtime gates now include this exact pair while preserving the previous supported pairs; this does not accept other Core/system combinations. Record actual new-Core behavior separately from legacy tests and historical Next evidence. Current maintenance and acceptance: [Mirror patch review](../../docs/reviews/2026-10-03-foundry-14-365-mirror-upgrade-and-tile-arsenal.md). The new pair overrides older exact-364-only wording for this scoped continuation; existing authority and data protections remain applicable.
