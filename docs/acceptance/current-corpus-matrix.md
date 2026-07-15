# Current Acceptance Corpus Matrix

**Snapshot date:** 2026-07-15
**Scope:** source parsing, CLI/workflow generation, target-schema projection, profile isolation, and unrelated-regression controls in the current tracked repository. This matrix does not upgrade local Foundry runtime, authenticated crawling, or production-equivalent module-coexistence claims.

## Reproducible commands

Focused corpus command:

```powershell
bun test src/core/generator/__tests__/item-source-semantics.test.ts src/core/generator/__tests__/effectProfile.test.ts src/core/generator/__tests__/actor_bilingual_integration.test.ts src/core/generator/__tests__/foundry-v14-target.test.ts src/core/parser/__tests__/english-frontmatter.test.ts src/core/parser/__tests__/yaml.test.ts tests/acceptance/alyxian-aboleth.acceptance.test.ts tests/acceptance/generic-riders.acceptance.test.ts tests/acceptance/laughing-hand.acceptance.test.ts tests/acceptance/scuttling-serpentmaw.acceptance.test.ts tests/acceptance/slithering-bloodfin.acceptance.test.ts --max-concurrency 4
```

2026-07-15 result: **148 pass, 0 fail, 656 expectations across 11 files**.

Aggregate command:

```powershell
bun run ci:verify
```

2026-07-15 latest result: **743 pass, 0 fail, 2,932 expectations**; 87.55% line / 88.41% function production coverage, 109-source anti-overfit, 1,605-path repository hygiene, locked dnd5e 5.3.3 references, Web build, and zero-network Actor smoke all passed. The earlier 738-test result remains in dated milestone evidence.

## Executable matrix

| ID | Language / document | Real source or fixture | Target / profile | Semantic projection and close control | Executable evidence | 2026-07-15 outcome |
|---|---|---|---|---|---|---|
| C-01 | Chinese + English Item metadata | Inline exact rarity/action/recovery corpus in `item-source-semantics.test.ts` | Parser | Exact Chinese/English rarity, reaction, and dawn-recovery phrases project structurally; descriptive `稀有`, `反应`, and dawn prose remain negative. | `src/core/generator/__tests__/item-source-semantics.test.ts` | Pass |
| C-02 | Chinese + English equipment | Three inline shield/extra-AC positives | Item parser/generator | Explicit shield base AC plus additional magical AC becomes base 2 + magical 2; a plain AC value does not become a magical bonus. | `src/core/generator/__tests__/item-source-semantics.test.ts` | Pass |
| C-03 | Chinese + English Item Activity | Three duration/concentration/aura positives | Item parser/generator | Exact minutes/rounds, concentration, radius, and range project into Activity fields; neighboring descriptive time/concentration prose remains neutral. | `src/core/generator/__tests__/item-source-semantics.test.ts` | Pass |
| C-04 | Chinese + English attack ability | Three explicit ability/modifier positives | Item parser/generator | Source-backed Strength/Dexterity/Wisdom attacks normalize native damage modifiers; an ability prerequisite alone cannot select the attack ability. | `src/core/generator/__tests__/item-source-semantics.test.ts` | Pass |
| C-05 | Chinese bilingual standalone Item | `src/core/parser/__tests__/fixtures/shield-of-the-cavalier.md` | Foundry v12 / core schema | Shield identity, `veryRare`, armor, weight, Forceful Bash damage/prone linkage, and Protective Field reaction/dawn/duration/concentration/radius are asserted structurally. | `src/core/generator/__tests__/item-source-semantics.test.ts` v12 case | Pass |
| C-06 | Chinese bilingual standalone Item | Same Shield fixture | Foundry v14 / core schema | Same source mechanics survive the v14 Activity and equipment schema; v12 and v14 are separate assertions rather than inferred compatibility. | `src/core/generator/__tests__/item-source-semantics.test.ts` v14 case | Pass |
| C-07 | Chinese bilingual unrelated Item | `obsidian/dnd数据转fvttjson/input/items/三祷之坠.md` | Foundry v12 | Jewel identity, legendary rarity, three stages, and first-stage semantics remain unchanged by Shield repairs. | `src/core/generator/__tests__/item-source-semantics.test.ts` unrelated-Jewel case | Pass |
| C-08 | English + Chinese Actor condition duration | Inline same-clause/following-sentence positives plus `dae-until-damaged-warden.md` | Foundry v14 / core + modded-v14 | A neutral `untilDamaged` hint is source-derived; core has no DAE flag and modded-v14 has exactly one DAE `isDamaged` flag. | `src/core/generator/__tests__/effectProfile.test.ts` | Pass |
| C-09 | English condition close negatives | Neighboring-damage prose and mixed frightened/poisoned duration inputs | Effect extraction | Damage prose without a duration cannot create the hint; in a mixed sentence only the status before the matching duration receives it. Stone Fist remains effect-free. | `src/core/generator/__tests__/effectProfile.test.ts` | Pass |
| C-10 | Chinese plaintext Actor module profiles | `tests/fixtures/plaintext/月蚀矿腐化生物数据.md` | Foundry v12 / core + modded-v12; mapping checks for modded-v14 | Explicit bleeding formula/type may create OverTime automation; bare condition mentions, Swallow placeholders, neighboring flags, and core output remain negative controls. | `src/core/generator/__tests__/effectProfile.test.ts` | Pass |
| C-11 | Chinese plaintext complex Actor | `tests/fixtures/plaintext/月蚀矿腐化生物数据.md` | Foundry v12 / modded-v12 workflow | Slithering Bloodfin preserves type, saves, senses, traits, actions/reactions, ranges, recovery, descriptions, icons, branch damage, and source-only effect boundaries. | `tests/acceptance/slithering-bloodfin.acceptance.test.ts` | Pass |
| C-12 | English generic rider snippets | `tests/fixtures/riders/*.md` | Foundry v12 / modded-v12 | Grapple/restraint, replacement damage, marks, reaction denial, save penalties, overrides, linked attacks, summons, gated statuses, immunity branches, and hit-dice outcomes are extracted without creature-name matching. | `tests/acceptance/generic-riders.acceptance.test.ts` | Pass |
| C-13 | Chinese/English plaintext compound riders | Tracked plaintext collection selected by `scuttling-serpentmaw.acceptance.test.ts` | Foundry v12 / modded-v12 workflow | Venom riders retain their own uses/effects and attack damage types; optional poison/bleed and generic zero-HP healing are explicit negative controls. | `tests/acceptance/scuttling-serpentmaw.acceptance.test.ts` | Pass |
| C-14 | English Obsidian Actor | `obsidian/dnd数据转fvttjson/input/*the-laughing-hand*.md` | Foundry v12 / modded-v12 | Real Laughing Hand and Shadow Hound mechanics are generated from source; conditional prone is not replaced by an unconditional grapple effect. | `tests/acceptance/laughing-hand.acceptance.test.ts` | Pass |
| C-15 | English bestiary Markdown parser | `src/core/parser/__tests__/fixtures/english-bestiary-*.md` plus inline blocks | Parser route | Frontmatter, actions, bonus actions, reactions, legendary/lair actions, wrapped titles, spellcasting, and biography boundaries are preserved. Unknown layout fields are an explicit tolerance control. | `src/core/parser/__tests__/english-frontmatter.test.ts` | Pass |
| C-16 | Chinese YAML/Markdown parser | Inline YAML and `yaml-legacy-actions.md` | Parser route | Stats, lair initiative, Markdown action bridging, HP values/formulas, and legacy action routing are preserved; unknown fields fail closed. | `src/core/parser/__tests__/yaml.test.ts` | Pass |
| C-17 | English/Chinese bilingual Actor generation | Inline English Actor, English bestiary fixtures, and wrapped-trait fixture | Foundry v12/v13 generation | Explicit/local translations produce bilingual identity while failed or ambient translation cannot alter output; Chinese routing, title boundaries, activation sections, and narrative non-features remain stable. | `src/core/generator/__tests__/actor_bilingual_integration.test.ts` | Pass |
| C-18 | Cross-version Actor/Item schema | Characterized generator inputs | Foundry v12 default + v14 explicit | v14 metadata, senses/resources, saves, equipment, spells, effects, and Activity placement are asserted while v12 schema remains a separate negative/control branch. Neutral templates contain no reference-item mechanics. | `src/core/generator/__tests__/foundry-v14-target.test.ts` | Pass |
| C-19 | Complex plaintext Actor | Tracked plaintext collection selected by `alyxian-aboleth.acceptance.test.ts` | Foundry v12 workflow | Legendary resources/costs, daily uses, aura/save metadata, range/concentration, recharge saves, disease/vulnerability riders, target prerequisites, teleport swap, and area saves remain structured. | `tests/acceptance/alyxian-aboleth.acceptance.test.ts` | Pass |

## CLI semantic samples

These are generated through `src/index.ts`, not hand-authored JSON:

| Sample | Commands / artifacts | Semantic inspection | Outcome |
|---|---|---|---|
| Shield v12 + v14 | Source-identical Shield input through `src/index.ts --fvtt-version 12/14 --effect-profile core` | Both outputs match source identity, rarity, attunement, armor base/magical bonus, weight, descriptions, two Activities, Forceful Bash damage/prone linkage, and Protective Field reaction, duration, concentration, radius, dawn use, and self-Activity consumption. | Pass at CLI/source/schema and live import/behavior/readback layers; downloaded UI re-export comparison remains open. |
| Damage-Bound Warden core + modded-v14 | `dae-until-damaged-warden.md` through `src/index.ts --fvtt-version 14 --effect-profile core/modded-v14`; then `bun run verify:actor` for each output | Actor identity/stats/type and both attacks match source; normalized Actors differ only by the one source-matched DAE flag and volatile nested IDs; both verifier reports have zero warnings. | Pass at CLI/source/schema and locked runtime layers: modded removes after later damage, core retains. |

## What this matrix does not prove

- It does not prove arbitrary Markdown outside the represented syntax corpus is parsed correctly.
- It does not by itself prove the live Shield or `isDamaged` results; those are separately accepted and linked from `current-support-matrix.md` and the M9 runtime evidence.
- The Shield's supported UI re-export/download comparison remains open even though import, equip, execution, use depletion, concentration, prone, and runtime readback passed.
- It does not cover an authenticated live GoddessFantasy crawl, because credentials/session use was not authorized.
- It does not establish exact production-equivalent coexistence for the full valid module package set or authorize production deployment changes.

The matrix therefore supports bounded confidence in the listed parser, generator, CLI, and schema projections. It must not be cited as a broad runtime or production support claim.
