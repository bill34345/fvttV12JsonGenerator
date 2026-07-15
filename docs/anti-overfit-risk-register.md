# Anti-Overfit Risk Register

This register tracks known parser/generator patterns that need later generalization. New exceptions must link to source text, a schema rule, a corpus rule, or explicit user authorization.

## Known Risks

- `src/core/generator/actor-special.ts`: action-name predicates such as Scuttling Serpentmaw venom and triggered AC utilities should be replaced with source-derived parsing or explicit exception records.
- `src/core/generator/actor-effects.ts`: Swallow-related OverTime flags contain fixed damage, save DC, and save ability values. These should be parsed from source text or disabled when not derivable.
- `src/core/parser/item-parser.ts`: bullet save parsing has historically defaulted to one save ability. It should parse the target ability from text or leave it unset/literal when not derivable.

## Exception Format

Use this inline format near any intentionally narrow rule:

```ts
// anti-overfit: allow explicit-exception - user approved legacy import compatibility
```

Allowed source kinds are `schema-derived`, `source-derived`, `corpus-derived`, and `explicit-exception`.

## Review Checklist

- The rule source is classified before implementation.
- The implementation has at least three positives, one close negative, and one unrelated actor/item check.
- Generated actor changes are verified through the CLI and checked against source markdown.
- `bun run audit:anti-overfit` passes or every finding has a documented source kind and reason.
- `bun run audit:anti-overfit:all` must report a nonzero production-source count. Git discovery failures and a zero-source `--all` result are hard failures; an empty corpus is never a passing audit.
- Explicit-file audits remain available without Git discovery when a caller supplies concrete source paths.
