# FVTT Target-World Spell Resolver Design

**Date:** 2026-07-18
**Status:** Approved in conversation; awaiting written-spec review
**Target:** Foundry VTT `14.364`, dnd5e `5.3.3`

## Goal

Make generated monster spellcasting use real spells from the destination FVTT world instead of placeholder Spell items, fake IDs, or UUIDs copied from another world.

The project continues to generate Actor JSON through its Markdown parser/generator workflow. The Actor carries a portable spell manifest. A small companion FVTT module resolves that manifest against the spell compendiums that are actually enabled in the destination world, then creates native dnd5e Cast Activities and embedded spell items.

Completion requires both deterministic verification and real Foundry runtime acceptance. A generated file, passing test, or successful import is not sufficient if the spells cannot actually be opened and cast.

## Confirmed Current Failure

The current generator is not portable or semantically complete:

- `src/core/generator/activity.ts` contains a hard-coded 2014 SRD UUID for Invisibility and falls back to a utility placeholder.
- `src/core/generator/actor-legacy.ts` creates level-0 placeholder Spell items when a spell is unknown.
- `src/core/mapper/spells.ts` assumes `Compendium.dnd5e.spells` and can manufacture deterministic hash IDs when the legacy database cannot be parsed.
- The accepted Rat Warlock Actor contains a spellcasting description feature but no ten functional Spell items. Its earlier accepted status is therefore a false green for spell functionality and must be reopened append-only in the hardening ledger.

The new path must replace these semantics for AI Intake and portable v14 Actors. The legacy mapper may remain for compatibility, but it cannot be used as acceptance evidence for the target-world resolver.

## Approved Product Decisions

- Build an FVTT companion module. A static Actor JSON file alone cannot safely know which spell packs and UUIDs exist in the destination world.
- Keep normal Foundry Actor JSON import. The module reacts only to Actors carrying a valid project spell manifest.
- All enabled and readable dnd5e Item compendiums participate automatically. There is no source trust prompt or allowlist gate.
- A spell document is a 2024 candidate only when `type === "spell"` and `system.source.rules === "2024"`.
- Prefer 2024 spells. Search 2014 only when no 2024 spell has the same stable identifier, exact normalized English name, or explicit alias.
- Use official Monster Manual-style spellcasting: preserve the source spellcasting trait, add real native Cast Activities, and immediately embed/cache the resolved spells on the Actor.
- Resolve the whole Actor before writing. Spell hydration is all-or-nothing.
- If module-managed content was edited manually, show a diff and ask whether to preserve it, overwrite it, or cancel. Closing the prompt means cancel.
- The module may update only content it previously created. It must not modify unrelated Actor items, activities, effects, compendiums, or Actors without a manifest.
- Disabling or uninstalling the module must leave the hydrated Actor and its native dnd5e spells usable.
- First release is version-locked to Foundry `14.364` and dnd5e `5.3.3`. Other versions fail closed.
- AI never writes or repairs final Actor JSON and never copies spell rules into the portable manifest.

## Architecture

```text
raw TXT / irregular Markdown
  -> AI Intake extracts source-evidenced spell references
  -> deterministic standard Markdown renderer
  -> existing parser/generator
  -> portable Actor JSON with versioned spellManifest
  -> normal import into destination FVTT world
  -> companion module detects only the flagged Actor
  -> index enabled destination-world spell compendiums
  -> deterministic 2024-first resolution and full preflight
  -> needs_review OR atomic native dnd5e hydration
  -> runtime verification and audit report
```

### Project-side core

Create a pure, Foundry-independent boundary under `src/core/spell-resolution/` for:

- manifest types, validation, and serialization;
- candidate/index types;
- deterministic matching and priority rules;
- ambiguity, missing-spell, fallback, and conflict findings;
- hydration-plan types;
- stable hashing and idempotency decisions;
- machine-readable audit reports.

This core must be testable in Bun without a Foundry process, browser globals, installed premium packs, or network access.

### Generator integration

AI Intake IR and standard Markdown gain structured spellcasting data. The existing parser/generator emits a versioned manifest under:

```text
flags.fvtt-json-generator-spell-resolver.spellManifest
```

The generator also marks the source-generated spellcasting feature with a stable spellcasting group ID so the companion module can add activities without matching an item by display name.

The portable Actor contains no target-world spell UUID, fake spell ID, empty placeholder Spell item, or copied premium spell description.

### Companion module

Create tracked module source under `src/foundry/monster-spell-resolver/` with module ID:

```text
fvtt-json-generator-spell-resolver
```

The module provides:

- Foundry hook adapter;
- destination-world source index;
- Actor-level resolver service;
- native dnd5e hydrator;
- review/diff UI;
- status badge and Actor context actions;
- rollback and audit storage;
- Chinese and English localization.

Build output is a generated installable module directory/ZIP under ignored `dist/`. Source, tests, manifest template, localization, and build scripts remain tracked.

## Portable Manifest Contract

```ts
interface SpellManifest {
  schemaVersion: 1;
  manifestId: string;
  sourceSha256: string;
  rulesPreference: "2024";
  spellcastingGroups: SpellcastingGroup[];
}

interface SpellcastingGroup {
  groupId: string;
  featureItemKey: string;
  ability?: "str" | "dex" | "con" | "int" | "wis" | "cha";
  saveDc?: number;
  attackBonus?: number;
  spellRefs: SpellRef[];
}

interface SpellRef {
  refId: string;
  identifier: string;
  originalName: string;
  englishName?: string;
  chineseName?: string;
  aliases: string[];
  expectedLevel?: number;
  expectedSchool?: string;
  sourceBookHint?: string;
  method: "innate" | "prepared" | "pact" | "at-will";
  uses?: {
    value: number;
    recovery: "day" | "shortRest" | "longRest";
    shared: boolean;
  };
  castingLevel?: number;
  ignoresMaterialComponents?: boolean;
  restrictions: PreservedRestriction[];
  evidence: EvidenceRef[];
}
```

`restrictions` preserves source facts such as self-only casting, limited summoned creature types, and stated beam counts. A restriction that cannot be expressed faithfully by the supported native dnd5e schema remains visible description and a report entry; the system must not invent automation.

Manifest validation rejects duplicate IDs, unsupported recovery values, illegal uses, invalid evidence, contradictory spellcasting totals, missing identifiers/names, and unknown schema versions.

## Destination-World Discovery

On `ready` and whenever the enabled package set changes, the module builds a lightweight index from all enabled, readable dnd5e Item compendiums.

- `flags.dnd5e.types` containing `spell` is a positive performance hint.
- A missing type hint does not exclude a pack. This is required for modules such as `dnd-heroes-faerun`, whose `options` pack contains spells without a manifest type hint.
- A missing or explicitly empty type hint does not prove the pack contains no spells. Because the approved product rule is that every enabled source participates, the resolver still indexes the real `type` field of every readable dnd5e Item pack.
- Index only metadata required for matching: ID, UUID, name, type, `system.identifier`, `system.source.rules`, source book, level, and school.
- Fetch a full spell document only after a candidate is selected.
- Never write to a compendium.

Local full-pack inspection confirms the required behavior:

| Package | Pack | Spell count | `rules=2024` |
| --- | --- | ---: | ---: |
| `dnd-players-handbook` 2.1.0 | `spells` | 391 | 391 |
| `dnd-heroes-faerun` 1.1.0 | `options` | 19 | 19 |
| `dnd-forge-artificer` 1.1.0 | `options` | 5 | 5 |
| `dnd-ravenloft-horrors-within` 1.0.1 | `options` | 1 | 1 |

The index is based on real Spell document fields rather than package naming, publisher inference, or a hard-coded list of future modules.

## Matching and Source Priority

Resolution order is deterministic:

1. Reuse a still-valid saved mapping for the same logical spell and rules version.
2. Prefer a candidate matching an explicit source-book hint.
3. Match exact `system.identifier` among 2024 candidates.
4. If the identifier has no match, match an exact normalized English name or explicit alias among 2024 candidates.
5. Use expected level, school, and source book only to reject contradictory candidates, never to promote a fuzzy match to automatic acceptance.
6. Fuzzy matches may be displayed as suggestions but require GM selection.
7. If a same-name 2024 candidate exists but has contradictory fields, return `needs_review`; do not bypass it with 2014.
8. Search 2014 only when no 2024 candidate shares the identifier, exact normalized English name, or alias.
9. A unique 2014 fallback may resolve automatically but must be visibly marked on the Actor and in the report.
10. A spell with no `system.source.rules` is not automatically classified as 2024 or 2014.

Default tie-breaking for otherwise equivalent 2024 candidates is:

```text
saved concrete mapping
  -> manifest source-book match
  -> dnd-players-handbook
  -> dnd5e.spells24
  -> remaining enabled 2024 sources
```

All remaining sources still participate automatically. An expansion-only spell resolves normally. If multiple remaining sources produce indistinguishable candidates, the GM chooses once and that concrete mapping is saved. Source priority is configurable, but changing it only marks affected hydrated Actors stale; it does not rewrite them automatically.

## Trigger and Status Model

The module listens for Actor creation/import and relevant Actor updates, but immediately exits unless all of the following are true:

- current user is GM;
- Actor has a valid resolver manifest;
- target versions are supported;
- the Actor is not already inside a resolver transaction;
- the same manifest/candidate/config hash has not already been applied.

No world-wide Actor scan runs on startup. A GM can explicitly re-run resolution from a flagged Actor.

Actor status values are:

```text
pending
resolving
needs_review
hydrated
stale
incompatible
failed
failed-recovery-required
```

## Atomic Hydration

Hydration has a read-only preflight and a separately applied plan.

Preflight must resolve every SpellRef, validate every selected full Spell document, detect module-owned content edits, and calculate the complete create/update/remove set without changing the Actor.

Only a complete plan may apply. The hydrator then:

- embeds real selected Spell documents using public Foundry document APIs;
- preserves target-world compendium provenance;
- creates native dnd5e 5.3.3 Cast Activities on the group-linked source spellcasting feature; each Activity retains the selected target-world Compendium UUID, while its eagerly embedded native cache carries `flags.dnd5e.cachedFor` and `_stats.compendiumSource` exactly as dnd5e expects;
- applies source-derived uses, casting level, attack bonus, save DC, material handling, and literal restrictions without modifying the source compendium Spell;
- tags every managed Spell and Activity with manifest ID, group ID, ref ID, transaction ID, source UUID, and generated-content hash;
- writes the final status and resolution report only after all changes succeed.

The implementation must follow the locked dnd5e 5.3.3 Cast Activity and cached-spell behavior. It must not introduce a custom Activity type or runtime macro dependency.

## Manual-Edit Conflict Policy

On re-resolution, compare each managed document's current projection with its generation hash.

If a managed Spell or Activity was edited, show:

- last generated value;
- current value;
- proposed replacement;
- affected SpellRef and source evidence.

The GM chooses:

- **Keep manual:** preserve the current structurally valid content and mark it protected for this SpellRef;
- **Overwrite:** replace it with the new deterministic result;
- **Cancel:** make no Actor changes.

Closing the dialog is Cancel. There is no global "always overwrite" option.

## Rollback and Idempotency

Foundry does not provide a database transaction spanning multiple embedded documents. The module therefore uses compensating rollback:

1. acquire an Actor-local mutex and transaction ID;
2. save a minimal before-snapshot of only module-managed content and relevant flags;
3. apply the complete plan;
4. on failure, restore the snapshot and remove newly created managed documents;
5. report `failed` when recovery succeeds;
6. report `failed-recovery-required` with exact residual differences when recovery also fails.

Keep only the most recent successful undo snapshot. Reapplying the same manifest, selected source UUIDs, module configuration, and manual-conflict decisions is a no-op and must not duplicate Spells or Activities.

## Non-Interference Hard Gate

The companion module must:

- ignore Actors without its manifest;
- manage only embedded documents bearing its ownership flags and only its own flagged Activity entries inside a project-generated spellcasting feature that explicitly opts in with the matching group ID;
- never mutate compendiums;
- never monkey-patch Foundry or dnd5e prototypes;
- never register a custom Activity type;
- never require a module-specific macro for hydrated Actors to function;
- never use name-only matching to select an Actor feature or delete an Item;
- never run a background world migration;
- never convert a module error into partial success;
- preserve unrelated Actor items, activities, effects, flags, ownership, and folders byte-for-byte where Foundry permits;
- leave hydrated native Spell items usable when the resolver is disabled or uninstalled.

These rules must be added append-only to `.ruler/AGENTS.md` and the generated root `AGENTS.md`, with a focused module-directory `AGENTS.md`. Existing user-owned dirty changes must be preserved and staged separately.

## UI and GM Workflow

Normal path:

1. GM imports project Actor JSON through Foundry's normal import.
2. Resolver detects the manifest and preflights all spells.
3. Unique valid matches hydrate automatically.
4. A concise notification reports the resolved count.
5. Actor sheet displays a green hydrated status.

Review path:

- automatically open once per new manifest/finding hash;
- show missing, ambiguous, fallback, or manual-edit findings per spell;
- show candidate package, source book, rules version, level, and UUID;
- show source evidence and a complete change preview;
- enable Apply only when every blocking issue has a decision;
- cancel atomically.

Actor header/context actions:

- Resolve or Re-resolve Spells;
- View Resolution Report;
- View Sources;
- Undo Last Hydration;
- Export Diagnostic Report.

World settings:

- discovered source packs and counts by rules version;
- source priority order;
- rebuild index;
- debug logging toggle.

There is no trust-source prompt and no world-wide rewrite control. GM controls are hidden from players. UI is Chinese-first with English localization, and long names, UUIDs, evidence, and errors wrap or scroll.

## Error Handling

- Invalid or unknown manifest schema: `incompatible`, no mutation.
- Unsupported Foundry/dnd5e version: `incompatible`, no mutation.
- Missing or unreadable compendium: `needs_review`, no mutation.
- Ambiguous candidates: `needs_review`, no mutation.
- Invalid selected Spell document: `needs_review`, no mutation.
- Actor permission loss or document update failure: rollback and `failed`.
- Rollback mismatch: `failed-recovery-required`, retain diagnostic evidence.
- Disabled source after hydration: keep embedded Spell; mark stale only when re-resolution is requested or source inventory changes.

Logs and reports record IDs, UUIDs, versions, timings, findings, and projections. They do not copy API credentials, hidden data, or full premium spell descriptions into tracked project evidence.

## Test Strategy

### Default zero-network tests

- manifest schema, serialization, evidence, duplicate-ID, and hash validation;
- compendium discovery with present, missing, misleading, and empty `flags.dnd5e.types`;
- 2024 classification from the real document field rather than package name;
- PHB, `spells24`, expansion-only, duplicate-source, unknown-rules, and 2014-fallback matching;
- exact identifier, exact alias, normalized English name, close negative, and fuzzy suggestion behavior;
- saved mapping invalidation and source-priority changes;
- all-or-nothing planning;
- manual keep/overwrite/cancel decisions;
- idempotency, hook recursion prevention, apply failure, rollback success, and rollback failure;
- preservation of unrelated Actor content;
- generator structural tests proving no fake UUID or placeholder Spell is emitted;
- v14/core and v14/modded-v14 Actor structure regression;
- module build, localization, and package-manifest validation.

Parser/generator rules require positive corpus coverage, a close negative, an unrelated Actor, structural assertions, and `bun run audit:anti-overfit`.

### Local Foundry runtime acceptance

Use only the project-local `server-mirror`, never production.

1. Install and enable the generated companion module in the disposable v14 test world.
2. Regenerate the Rat Warlock through AI Intake, standard Markdown, and the project Actor workflow.
3. Import the Actor through Foundry's public import path.
4. Verify exactly ten real spells resolve:
   - Eldritch Blast;
   - Mage Armor;
   - Minor Illusion;
   - Thaumaturgy;
   - Augury;
   - Burning Hands;
   - Conjure Animals;
   - Faerie Fire;
   - Invisibility;
   - Misty Step.
5. Verify at-will versus independent 1/day uses, DC 12, attack +4, ignored material components, and Mage Armor self-only through native fields. Verify Conjure Animals' Giant Rat qualifier and Eldritch Blast's two-ray instruction remain visible literal restrictions when the selected 2024 Spell schema cannot enforce them; the resolver must not pretend those restrictions were automated.
6. Open the embedded Spell sheets and inspect actual native Activities.
7. Execute at least one attack spell, one save spell, and one utility spell; inspect chat cards, uses, target/range, and resulting Actor state.
8. Verify PHB wins an otherwise equivalent PHB/`spells24` duplicate.
9. Resolve an expansion-only 2024 Spell from `dnd-heroes-faerun` without a trust prompt or hard-coded spell UUID.
10. Re-run resolution and prove no duplicate Spell or Activity is created.
11. Manually edit one managed Activity and verify Keep, Overwrite, and Cancel behavior.
12. Plant an apply failure and prove full rollback; plant rollback failure and prove the residual-difference report.
13. Disable the resolver and confirm the hydrated Rat Warlock's embedded spells still open and cast.
14. Confirm an unrelated existing Actor is unchanged before and after all module tests.

Export/read back the hydrated Actor and compare source-relevant projections with the original text, intake IR, standard Markdown, pre-hydration Actor, and post-hydration Actor. Passing import or finding ten Item documents is not semantic acceptance.

### Final mechanical gates

- focused core/generator/module tests;
- full `bun test --max-concurrency 4`;
- production and all-project typechecks;
- coverage gate;
- `bun run audit:anti-overfit:all`;
- Foundry Lab tests;
- module build and package validation;
- `bun run web:build` if Intake/Web contracts change;
- `bun run ci:verify`.

## Delivery and Installation

The implementation produces:

- tracked module source and tests;
- an ignored installable module ZIP;
- a local installation script that copies only the generated module into the project `server-mirror`;
- a short Chinese installation/update/uninstall guide;
- a resolver diagnostic report format;
- local Foundry semantic acceptance evidence.

Online production installation is a later explicit operation. The first implementation and acceptance use only the local mirror. No production world, module folder, or setting may be inspected or changed without separate authorization.

## Documentation and Ledger Changes

Implementation must:

- append a new spell-resolution finding to the hardening ExecPlan without rewriting the earlier AI Intake closure history;
- explicitly reopen the Rat Warlock spell acceptance claim while preserving its prior non-spell Intake evidence;
- document the new recommended spell path and mark placeholder/legacy spell mapping as non-portable;
- add the non-interference hard gate to project and module instructions;
- record exact Foundry, dnd5e, PHB, Heroes of Faerun, and other tested source package versions;
- separate mechanical verification from semantic runtime acceptance.

No finding closes until both the generated data projection and live spell-use behavior are recorded.

## Out of Scope

- Foundry v12 companion-module support in the first release;
- Foundry v13 support;
- OCR or image/PDF intake;
- Item spell resolution;
- automatic world-wide migration of historical Actors;
- automatic rewriting of Actors without a project manifest;
- creating, translating, or redistributing official/premium spell rules;
- proving a module is official from its package name;
- modifying production or installing the module online during implementation;
- arbitrary fuzzy auto-matching;
- custom macros or new Activity types for resolved spells.

## Versioned Sources Checked

- Local Foundry application: `.local/foundry-v14/app/14.364`.
- Local dnd5e system: `.local/foundry-v14/data/server-mirror/Data/systems/dnd5e`, version `5.3.3`.
- Local official packages: `dnd-players-handbook` `2.1.0`, `dnd-heroes-faerun` `1.1.0`, `dnd-forge-artificer` `1.1.0`, and `dnd-ravenloft-horrors-within` `1.0.1`.
- dnd5e Compendium Browser: <https://github.com/foundryvtt/dnd5e/wiki/Compendium-Browser>.
- dnd5e Module Registration: <https://github.com/foundryvtt/dnd5e/wiki/Module-Registration>.
- dnd5e Cast Activity: <https://github.com/foundryvtt/dnd5e/wiki/Activity-Type-Cast>.
- Foundry `fromUuid`: <https://foundryvtt.com/api/v14/functions/foundry.utils.fromUuid.html>.

## Written-Spec Review Gate

After this document is committed, the user reviews it once. On approval, use `superpowers:writing-plans` to create:

```text
docs/superpowers/plans/2026-07-18-fvtt-target-world-spell-resolver.md
```

The implementation plan must use TDD, exact file paths, focused commits, the project-local Foundry mirror, and explicit mechanical plus semantic acceptance gates.
