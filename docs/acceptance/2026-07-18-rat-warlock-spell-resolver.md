# Rat Warlock Target-World Spell Resolver Acceptance

Date executed: 2026-07-19 (plan dated 2026-07-18)

Verdict: **Pass for the documented local target only** — Foundry VTT `14.364`, dnd5e `5.3.3`, and the project-local disposable world `fvtt-v14-module-matrix`. This is not a Foundry v12 resolver claim, a production installation, or a world-wide migration claim.

## Accepted project artifacts

- Raw fixture: `src/core/intake/__tests__/fixtures/rat-warlock.raw.txt`, SHA-256 `55dc6bc354df07095308c7c75bf17cf3a09e72c96e8d38141714007c750dcdc0`.
- Exact accepted Intake bundle: `.local/intake-runs/2026-07-19T04-53-50-113Z-feb8d83c`.
- Promoted Markdown: `obsidian/dnd数据转fvttjson/input/warlock-of-the-rat-god.md`, SHA-256 `65e4b6295d20b0a3b36e1ec2cea04424bf51d427671cf25c60a1b923d57ae0a0`.
- CLI/workflow Actor: `obsidian/dnd数据转fvttjson/output/warlock-of-the-rat-god.json`, SHA-256 `a8d9a96cd2bd3b6d9fc05dff2d2b905fe7ae3db1406969ea3d3733378ac6a2a1`.
- Manifest ID: `intake-55dc6bc354df0709-warlock-of-the-rat-god-innate-spellcasting-448`.

The workflow emitted deterministic English-slug filenames rather than the Chinese example filenames in the plan. The file contents and Actor display name remain bilingual; no artifact was renamed or hand-authored to imitate the example.

The accepted bundle reports one accepted creature, one independent review, zero repair calls, zero findings, ten spell references, and target-world status `pending`. The portable Actor contains four non-Spell items, no embedded Spell, no Cast Activity, no placeholder spell, and no destination-world UUID.

## Source-to-portable semantic review

The raw source, Intake IR, promoted Markdown, and Actor manifest were read together. The following source meaning is retained:

- spellcasting ability Charisma, save DC 12, and spell attack +4;
- four at-will grants: Eldritch Blast, Mage Armor, Minor Illusion, and Thaumaturgy;
- six independent one-per-day grants: Augury, Burning Hands, Conjure Animals, Faerie Fire, Invisibility, and Misty Step;
- the material-component waiver;
- Mage Armor is self-only;
- Eldritch Blast retains the literal two-ray instruction;
- Conjure Animals retains the literal Giant Rat restriction.

No spell level, school, destination package, destination UUID, damage body, effect body, or other official spell rule was invented in the portable manifest. The two-ray and Giant Rat clauses remain disclosed literal restrictions where native dnd5e Cast data cannot truthfully automate the source-specific instruction.

Fresh commands:

```powershell
bun run verify:intake -- --source "src/core/intake/__tests__/fixtures/rat-warlock.raw.txt" --ir ".local/intake-runs/2026-07-19T04-53-50-113Z-feb8d83c/creatures/warlock-of-the-rat-god/intake-ir.json" --markdown "obsidian/dnd数据转fvttjson/input/warlock-of-the-rat-god.md" --actor "obsidian/dnd数据转fvttjson/output/warlock-of-the-rat-god.json"
bun run verify:actor -- --source "obsidian/dnd数据转fvttjson/input/warlock-of-the-rat-god.md" --actor "obsidian/dnd数据转fvttjson/output/warlock-of-the-rat-god.json"
```

Both commands passed; the Actor verifier returned no warnings.

## Local destination inventory and selection

The full runtime acceptance indexed 1,070 candidates across every enabled readable Item pack. The installed source versions used in that run were:

- dnd5e `5.3.3`;
- dnd-players-handbook `2.1.0`;
- dnd-heroes-faerun `1.1.0`;
- local acceptance harness `0.0.1`, used only to prove the isolated 2014-only fallback and removed after the run.

The runtime proved all of these distinct resolver rules:

- a real expansion-only 2024 spell from dnd-heroes-faerun was discovered without a resolver package/UUID special case;
- a same-key 2024 spell beat a 2014 candidate;
- the configured PHB source beat the equivalent dnd5e `spells24` source;
- the isolated same-key 2014 spell was selected only when no supported same-key 2024 spell existed, and the fallback was visible in the report.

For the Rat Actor, all ten selections were automatic 2024 selections from `Compendium.dnd5e.spells24`. The selected UUIDs and the exact Activity/cache linkage are retained in ignored evidence, not copied with premium spell bodies into this repository.

## Native document and spell-use acceptance

The imported Rat Actor moved from `pending` to `hydrated` only after all ten refs preflighted and the Actor-local transaction validated. Runtime readback found exactly:

- 10 resolver-owned native dnd5e Cast Activities;
- 10 resolver-owned cached Spell Items;
- 10 unique `flags.dnd5e.cachedFor` links;
- matching Activity `spell.uuid`, cached Spell `_stats.compendiumSource`, selected UUID, logical ref, group, and feature linkage;
- no placeholder or duplicate Spell.

Native use was exercised in the local world:

- Eldritch Blast used the attack workflow with the source +4 override, while the two-ray instruction remained visible;
- a save spell used the DC 12 override;
- a utility spell opened and cast through native dnd5e behavior, with Mage Armor retaining its self-only boundary;
- a one-per-day Activity spent only its own use, a second use was natively unavailable/warned, and the other one-per-day Activities remained available;
- an at-will Activity remained reusable without a daily expenditure;
- material-component ignoring was present in native Cast data;
- the Giant Rat clause remained visible and was not falsely represented as complete 2024 Conjure Animals automation.

After disabling the resolver and restarting, the already-created cached Spells still opened and used through native dnd5e sheet, Cast Activity, and chat behavior. The resolver is therefore an import/hydration companion, not a runtime dependency of the resulting native spells.

## Conflict, idempotency, recovery, and non-interference

The same real local run proved:

- an identical explicit re-resolution made no Actor document writes and preserved the exact Actor JSON hash;
- Keep preserved a manual Activity edit and marked it protected;
- Overwrite restored deterministic generated content;
- Cancel and dialog close were exact zero-mutation outcomes;
- an injected mid-apply failure restored the complete managed before-state with no residual difference;
- an injected rollback failure produced `failed-recovery-required` plus exact residual paths;
- the unrelated Actor `0Ih2UbP1nbnT9jMf` remained byte-for-byte equal at SHA-256 `af9d3c77b576678cdca55e0ea46a246f8df5a91f74a7a3939f27cd31fe96949b`.

The final lifecycle implementation replaced timing stability windows with exact public `createItem` / `updateActiveEffect` correlation. A fresh Chrome rerun exposed and rejected an initial false failure: Foundry emits no `updateActiveEffect` when dnd5e computes changes identical to the existing enchantment. The accepted implementation treats that path as a no-op only after the Activity write and an exact current-versus-expected changes comparison; mismatches still require the exact Actor, Item, Effect, user, and changes Hook.

The latest build hash is `8b8b90d252045ff61cbe691646b556dc2304c87b54615a231b44cc5ac4dc9638`. It was reinstalled and verified, then Chrome created a fresh Rat Actor that reached `hydrated` with 10 refs, 10 automatic 2024 selections, 10 Cast Activities, and 10 one-to-one cached Spells. This latest smoke is the runtime check for commits `ad922bd` and `d5921f0`; the broader behavior matrix is the preceding full acceptance run.

## Evidence and cleanup

Ignored/local evidence:

- `.local/spell-resolver-acceptance/2026-07-19-rat-warlock/runtime-final-runtime.json`
- `.local/spell-resolver-acceptance/2026-07-19-rat-warlock/runtime-final-disabled.json`
- `.local/spell-resolver-acceptance/2026-07-19-rat-warlock/runtime-evidence.json`
- `.local/spell-resolver-acceptance/2026-07-19-rat-warlock/runtime-latest-lifecycle-smoke.json`

Cleanup was inspected offline after the final Chrome run:

- no acceptance Actor or message remains;
- the resolver and harness are absent from world module configuration;
- resolver world settings are absent;
- module-configuration SHA-256 is restored to `c5cea8dd24eab7b5b34816c1f08fc1bd870e602381e73f5b44e637d050fa3241`;
- `options.json` is restored to the original `cor-cotn` configuration and SHA-256 `59e91f8d57553d9e23907d0108b11729907c7bdeb2ae80e1b1aad9b6029dcd81`;
- port 30001 is stopped;
- production Foundry was not inspected or changed.

## Exact-online recovery follow-up

On 2026-08-01, the user explicitly confirmed that the repaired module had already been installed in the original online Foundry environment, the previously failed Rat Warlock had been recovered/cleaned and reimported, the final result was correct, and the residual content plus recovery error state had disappeared.

This is user-operated external semantic acceptance. The agent did not repeat the online write or independently capture a new server-side artifact during that confirmation turn. It closes the specific recovery/retry gap without claiming bulk migration or support for arbitrary future Foundry/dnd5e/module versions.

## Remaining support boundary

Accepted support is intentionally narrow: portable AI Intake plus target-world resolution in Foundry `14.364` / dnd5e `5.3.3`. OCR/PDF ingestion, a v12 resolver, production deployment, bulk/world-wide migration, arbitrary later Foundry/dnd5e versions, and full automation of literal source-specific restrictions remain unsupported until separately implemented and accepted.
