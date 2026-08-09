# AI Item Intake: TXT to Foundry V14 Item JSON

## What this path accepts

`--intake-items` is the formal path for a natural-language TXT or irregular Item Markdown. It is intentionally separate from `--ingest-items` and `--ingest-items-json`, which remain strict-format compatibility commands.

The supported target is exactly Foundry VTT `14.364`, dnd5e `5.3.3`, and effect profile `core`. The command refuses another target or profile before the AI provider is called.

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

- Explicit `AC +N` only: a transfer Active Effect with `system.attributes.ac.formula`, `type: add`, `phase: initial`.
- A light ability with explicit action, bright radius and dim outer radius: a zero-cost `utility` Activity which applies a non-transfer Actor effect. Disabling or deleting that Actor effect extinguishes the light.
- Shared Item uses with explicit recovery. `recoverAll` at `dawn` is represented on the Item uses pool.
- A uniquely resolved spell: a `cast` Activity consuming `itemUses`, with `spellSlot: false`. The submitted identifier and English name must case-insensitively select the same spell in the manifest-pinned dnd5e `5.3.3` source catalog; ambiguous, missing, or mismatched references are rejected and are never changed into Utility Activities.

For example, the dormant Jewel of Three Prayers contract has AC `+1`, an action to apply `bright: 15` / `dim: 30` light with no charge cost, a three-charge dawn-recovery pool, and a one-charge `Invisibility` cast. `dim: 30` is the outer edge of dim light, not an additional 30 feet after the bright radius.

## Provider configuration and review

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

Static parser/generator/verifier and CLI/Web isolation tests cover the exact Jewel contract. The Foundry 14.364 local-lab activity lifecycle is a separate acceptance layer: do not promote this path from **Partial** to a runtime **Pass** until import, applied light effect, effect disable/remove, charge exhaustion, no-spell-slot consumption, and dawn recovery have all been observed in a disposable world. No production world is part of this workflow.
