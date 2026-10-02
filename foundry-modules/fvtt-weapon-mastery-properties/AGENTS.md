# Weapon Mastery & Properties module

## Scope

This directory is the owner of the standalone `fvtt-weapon-mastery-properties`
module. Its supported runtime is Foundry `14.364` with dnd5e `5.3.3` exactly.

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

Official mastery IDs and parameters come from the locked dnd5e 5.3.3
`content24` Weapon Masteries appendix. Do not infer a mastery from localized
text or a weapon name. House properties use their configured rule ID and keep
their identity separate from official masteries and the existing `slowed`
condition.

## Verification

Use the package scripts for focused tests, typecheck, deterministic build, and
artifact verification. Do not install, start, stop, or modify a Foundry Lab
while working on pure core code unless the parent task explicitly coordinates
that operation.
