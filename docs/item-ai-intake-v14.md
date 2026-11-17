# AI Item Intake: TXT to Foundry V14 Item JSON

## What this path accepts

`--intake-items` is the formal path for a natural-language TXT or irregular Item Markdown. It is intentionally separate from `--ingest-items` and `--ingest-items-json`, which remain strict-format compatibility commands.

The supported target is Foundry VTT V14, native dnd5e 6, and effect profile `core`. The generated artifact records Core `14.370` and dnd5e `6.0.6`; the CLI and Web use this same target. The command refuses another target or profile before the AI provider is called. Generation works offline and does not require a Foundry `nativeProjection` receiver.

```powershell
bun run src/index.ts --intake-items "F:\source\item.txt" `
  --vault "obsidian/dnd数据转fvttjson" `
  --fvtt-version 14 `
  --effect-profile core
```

`--dry-run` validates input limits and target selection but does not call a provider or promote files. A run contains at most 50 Item candidates and 200,000 JavaScript UTF-16 characters.

## Acceptance boundary

The provider returns an evidence-bearing `ItemIntakeIR`, not Foundry JSON. Every candidate field and ability has an exact source range. The project then validates the ranges, claims and candidate boundary, renders an Item Markdown `item-mechanics` YAML contract, invokes the normal Item parser/generator, and verifies the generated JSON field by field.

Only a fully `accepted` run promotes Markdown to `input/items/` and JSON to `output/items/`. Source text, IR, deterministic diagnostics, provider audit, rendered Markdown and review material stay in `.local/item-intake-runs/<run-id>/`. Candidate JSON is not a formal output and is not offered by the Web job unless the item is accepted.

The current core contract supports:

- Explicit bonuses to armor class, all saving throws, or a movement mode, and resistance to a named damage type. These use native transfer effects with equipment and attunement gates. Additional eligibility, such as wearing no armor or qualifying only against spells, stays in the source and GM notes.
- A one-bottle healing potion with an action or bonus action, an explicit healing roll and a self or creature target. When the source allows either recipient, select the drinker within the stated range, including the user. The native Heal card rolls healing, which is applied through the normal Foundry controls. Using it consumes one bottle from the stack.
- Native Attack, fixed-DC Save, and reaction Utility for explicitly sourced rolls, range, cost, trigger, duration or area that the system can represent. Pushes, size-dependent prone, and attack prevention or exclusion remain GM rulings from the source. A fixed +1 to +3 attack and damage bonus projects through the native weapon bonus for a sourced longsword, spear, dagger or quarterstaff.
- A light ability with explicit action, bright radius and dim outer radius: a zero-cost `utility` Activity which applies a non-transfer Actor effect. Disabling or deleting that Actor effect extinguishes the light.
- Shared Item uses and individual Cast uses each have their own capacity and recovery. Recovery may be long rest (`lr`), short rest (`sr`), dawn, dusk or day, with full recovery or a source-evidenced numeric or simple dice formula. An empty recovery array represents a finite pool with no automatic recovery.
- An explicit final-charge destruction rule with one die and one exact result puts a clickable native roll in the Item description and summarizes the condition in Forge preview. The GM rolls when the last charge was spent and handles destruction on the stated result. The existing recharge remains available whenever the item survives.
- A uniquely resolved spell uses a native `cast` Activity linked to the pinned dnd5e `6.0.6` 2024 `spells24` catalog. It spends the stated `itemUses` or `activityUses`. An at-will spell spends neither, and these Casts leave the Actor's spell slots alone. The source may specify the base level, fixed save DC, an activation override, and a one-charge-per-additional-level rule with a stated total cap. A list of charged spells produces one Cast per option. Item Intake checks explicitly priced casting clauses, lists and Spell/Charge Cost tables against the candidate individually. A missing Cast, an unreadable spell-cost row or a changed price appears as a blocking finding with the spell and source excerpt. The cost table may state a level cap after the base charge cost; a listed Cast can start above one charge when each extra level costs one more charge. Base cost, remaining charges and the stated maximum level govern scaling. Item charge recovery excludes other abilities' rest limits, spell-slot recovery and conditional die results. In Foundry, a named Cast defaults to the 2024 locked catalog and can also resolve spells from readable Item compendia. When the compendia offer the same name in both editions, 2024 takes priority. A 2014 spell or a spell without an edition marker can still be used, with a notice shown in Forge. A spell-cost row can request a fixed damage variant, for example Arms of Hadar (psychic damage version). When an available same-name compendium Spell has one native damage type and source text, Forge drafts a companion Spell with the new type and shows it alongside the Item in the preview. One confirmation creates the companion Spells, verifies their UUIDs, and creates the linked Item. A spell-cost row can also use an explicit Foundry Item @UUID to select an existing variant or edition, including a world Spell. Forge reads that exact Document and checks its identity and any stated damage variant. These bindings need a caller that can read the Foundry documents. The selected spell supplies the activation where no override is specified for a priced option. The standalone CLI continues to use the locked catalog. Learning a spell and mentioning a spell in the description remain separate from granting a Cast.
- A named standard Spell Scroll links one locked 2024 spell at its base level using native Cast. The scroll's standard fixed DC and attack bonus come from its level. It consumes one scroll, spends no spell slot, bypasses spell components, and has no upcasting. A generic Spell Scroll with a stated level stays unbound. List eligibility, higher-level checks, interruptions and copying stay in the source and GM review.
- Ring of Spell Storing keeps its five-level capacity and the GM's initial inventory roll formula. An unspecified inventory starts empty. A currently stored spell with source-backed slot level, save DC, attack bonus and original casting ability gets its own native Cast and single use, without wearer slots or recovery. The GM manages new storage, capacity adjudication, and formulas requiring the original ability modifier. In natural-language input, give each listed spell its own line starting with “Currently stores” or “当前储有” and include those four values.
- Boots of Speed uses a native self-Enchant toggle, with bonus-action activation, a linked movement multiplier and a cumulative seconds pool with long-rest recovery. The GM records seconds in the Item's uses and stops the effect at the remaining budget. Disadvantage on opportunity attacks stays in the source for the GM to apply.
- A figurine with a fixed NPC and an exact source `@UUID[Compendium.…Actor.…]{name}` link uses a native Summon activity. The supported shape records the Magic action, unoccupied-space range, maximum hours, and cooldown days after reversion. Forge verifies the NPC link in the receiving world. One use is consumed to summon. The GM restores it after the literal cooldown and applies reversion and placement restrictions from the source.
- For a Bag of Tricks-style item, add a heading such as `### 1d8 Creature`, an ordered list of `1. @UUID[Compendium.…Actor.…]{name}` results, and a separate `@Embed[Compendium.…RollTable.… rollable]` line. Include the source Magic action, throwing range, shared daily use limit and the next-dawn or 0 HP expiry. Forge reads the table and NPCs from the receiving world and compares every die result to its numbered Summon profile. During play, roll the table in the description and choose the matching profile in the native Summon activity. The GM handles commands, initiative order and when a creature vanishes.
- Containers can carry an explicit count, weight and volume limit in combination. The container's own weight and weightless contents are recorded separately. Handling time, rupture, air and other special rules stay in the source. The standard capacity contract requires dnd5e 6.
- Native Enchant templates support listed +1/+2/+3 weapon tiers and the single-resistance alternatives of rare, attuned Armor of Resistance. Forge shows the source options and eligible base item category. The GM makes the choice when applying the template in Foundry. An armor template grants only the selected rider to the base armor.
- Ring, wand, rod, staff, wondrous item, shield, weapon, potion, scroll and container labels map to their native Item categories. An unrecognized category requires correction before adoption.
- The preview shows source-linked spells, charges, healing and damage rolls, passive bonuses, fixed save DC, and reaction triggers supported by the activity. The full source is retained. Caster qualifications and consequences such as destruction after the last charge may need GM adjudication and appear as source notes.

For example, the dormant Jewel of Three Prayers contract has AC `+1`, an action to apply `bright: 15` / `dim: 30` light with no charge cost, a three-charge dawn-recovery pool, and a one-charge `Invisibility` cast. `dim: 30` is the outer edge of dim light, not an additional 30 feet after the bright radius.

In Forge, an Item with explicit Dormant, Awakened, or Exalted progression headings offers a stage picker before generating the candidate. AI Intake extracts base mechanics from the first stage and keeps the complete canonical source. Each selected stage is an independent Item with the applicable charge ceiling, AC bonus, inherited abilities, and source text through that stage. The GM selects which card is in use and handles the stage change and remaining charges.

## Provider configuration and review

In Forge Item's AI workspace, choose a text-layer PDF, enter the Item name as it appears in the file, and optionally give its physical page numbers. Analyze reads that entry in its original language and sends the resulting Markdown through ordinary Item Intake. For a screenshot or an image-only scan, provide a text source or a PDF with a text layer.

Before creation, review the Item icon. Forge can preselect a single associated PDF illustration, and you can choose a detected image or crop a region on the page. With no matching illustration, the preview starts with the default icon. Both Item entry points can select an existing Foundry image or accept a local PNG, JPEG, or WebP. Changing the icon does not run the model again. Forge uploads local image content at creation and checks the icon path it reads back.

Item Intake reuses the existing `MONSTER_INTAKE_*` configuration and `--intake-doctor`; this is shared provider plumbing only. It does not run the Monster IR or compatibility normalizer.

```powershell
bun run src/index.ts --intake-doctor
```

If a run needs decisions, use its bundle rather than editing generated JSON:

```powershell
bun run src/index.ts --resume-item-intake ".local/item-intake-runs/<run-id>" `
  --decisions ".local/item-intake-runs/<run-id>/decisions.json" `
  --vault "obsidian/dnd数据转fvttjson"
```

For this first Item contract, the only decision that can be resumed is an explicit `replace` for a `target-conflict:*` promotion finding; the prior files are copied into the run bundle before replacement. Evidence and mechanics findings are intentionally not overrideable by a decisions file: correct the TXT/Markdown and start a new Intake run instead.

The legacy `--enable-ai-normalize` hook is not Item Intake. It only assists strict project Markdown and, if unavailable or failed, returns no normalized mechanics so the original source is parsed; it can no longer silently manufacture `abilities: []`.

## Runtime status

The focused regression suite checks source interpretation, native fields, candidate review, and Item creation and readback against representative fixtures. Validate the corresponding activity and resource behavior in your receiving Foundry version before relying on it in play. The earlier Foundry 14.364 / dnd5e 5.3.3 lifecycle evidence retains its original version.
