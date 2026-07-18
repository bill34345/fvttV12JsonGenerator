# Monster Spell Resolver Rules

## Target-World Spell Resolver Hard Gate

- Only Actors carrying a valid resolver manifest are eligible.
- Only module-owned embedded Spells and module-owned Cast Activities in an explicitly linked generated feature may be changed.
- Never mutate compendiums, patch Foundry/dnd5e prototypes, delete by name, or run an automatic world-wide migration.
- Hydration is Actor-level all-or-nothing with compensating rollback.
- Manual edits require Keep, Overwrite, or Cancel; closing the review is Cancel.
- Runtime acceptance uses the project-local Foundry mirror first. Production requires separate authorization.

Before changing runtime schema behavior, inspect the exact Foundry and dnd5e versioned references named in the root `AGENTS.md`; do not infer schemas, flags, hooks, or document behavior from memory or from a different target version.
