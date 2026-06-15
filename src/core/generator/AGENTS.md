# Generator Anti-Overfit Rules

## Required Rule Source

- Every new generator inference rule must be classified before implementation:
  - `schema-derived`: required by Foundry, dnd5e, or a supported module schema.
  - `source-derived`: directly parsed from actor/item markdown, YAML, or structured input.
  - `corpus-derived`: generalized from multiple source examples and guarded by counterexamples.
  - `explicit-exception`: explicitly approved by the user and documented at the call site.
- Do not infer mechanics from an action name alone. Names can locate text, but damage, save DCs, save abilities, AC, uses, recovery, and effects must come from source text, structured input, schema, or explicit configuration.
- Do not add creature-specific or single-action mechanics branches. If a narrow exception is unavoidable, add an `anti-overfit: allow explicit-exception - <reason>` comment and a risk-register entry.

## Test Requirements

- New generator rules require at least three positive examples, one close negative, and one unrelated actor/item check.
- Structural output changes must assert the generated JSON shape, not only parser internals.
- Acceptance checks must inspect real generated actor JSON against source markdown using `docs/generated-actor-verification.md` when actor output changes.

## Fixed Mechanics

- Fixed DC, damage, AC, uses, recovery, conditions, temp HP, or module flags must be parsed from the source or supplied by explicit config.
- If a value cannot be derived safely, keep the literal source value instead of inventing a formula.
- If multiple native formulas match, use a documented stable order or keep the literal value. Do not add semantic tie-breakers for the current sample.

## Required Audit

- Run `bun run audit:anti-overfit` before finishing generator changes.
- Treat audit findings as blockers unless the code is generalized or documented with a valid `anti-overfit: allow <source-kind> - <reason>` exception.
