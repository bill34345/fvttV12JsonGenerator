# Milestone 16: Source-Derived Actor Resource Semantics

## Goal

Add a generalized, source-authored resource contract for NPC Actor generation so bounded counters, shared consumption, recovery, variable spending, resource-scaled damage/area, resource transitions, and resource-derived tiers remain operable in Foundry v12/dnd5e 4.3.9 and Foundry v14/dnd5e 5.3.3.

The first accepted real corpus is:

- Tainted Shellcreeper: Shell Overload;
- Urchin Spikeshooter: Spikes;
- Caelian Sea Snail: Shell Resonance;
- Red Kelp Colony: Bloom Energy.

The implementation must not recognize those creature or action names as mechanics. Names may only be used as explicit source references inside the resource contract.

## Rule classification

- Resource definitions, carrier references, operation labels, bindings, costs, recovery, scaling and tiers: `source-derived`, because they are explicitly declared in the source Markdown frontmatter.
- Item `system.uses`, Activity `consumption.targets`, consumption scaling, damage scaling, target formulas and 16-character cross-document IDs: `schema-derived`, checked against the locked dnd5e 4.3.9 and 5.3.3 sources.
- No creature/action-name inference and no explicit exceptions.

## Scope

### Parser and canonical contract

- [x] Add strict typed parsing for one `资源机制` frontmatter block.
- [x] Fail closed on duplicate IDs, invalid bounds, missing carrier/action references, invalid recovery, invalid fixed/variable costs, unsafe formulas, invalid tier coverage, or transitions that reference unknown resources.
- [x] Preserve resources, bindings, transitions and derived tiers on `ParsedNPC`.
- [x] Publish each resource mechanic into canonical mechanics coverage.

### Actor projection

- [x] Give every resource carrier and referenced consuming Item a stable 16-character `_id`.
- [x] Project resource counters to the carrier Item's native `system.uses`.
- [x] Generate source-declared management Activities for gain, spend, clear and restore operations.
- [x] Link fixed consumers to the carrier through native `itemUses`.
- [x] Clone an explicitly named supplemental Activity for optional variable spending so the unspent base Activity remains distinct.
- [x] Use native consumption scaling for variable spend and native damage/target formulas for source-declared scaling.
- [x] Generate explicit resource-transition Activities, including bounded recovery of a target Item's uses.
- [x] Preserve resource-derived tier mappings as visible, source-derived toggle Effects plus machine-readable flags when core Foundry cannot evaluate another Item's remaining uses in Actor AC roll data.

### Verification

- [x] Validate Actor Item IDs, cross-Item consumption targets and resource flags.
- [x] Fail if a declared resource, binding, transition or tier is not projected.
- [x] Add fixture-backed positives for at least three resources, one close negative without a resource contract, and one unrelated Actor control.
- [x] Assert v12 and v14 structures with `assertEqualStructure()` or stricter explicit shape checks.
- [x] Run focused tests, production typecheck, full bounded tests, anti-overfit audit, reference verification and `git diff --check`.

### Real workflow acceptance

- [x] Add explicit resource contracts to the four real Markdown inputs.
- [x] Regenerate v12/core and v14/core JSON only through the project CLI.
- [x] Run Actor verification on every output.
- [x] Manually compare all four regenerated Actors with their source Markdown.
- [x] Record native/manual boundaries honestly: fixed and variable consumption must be native; trigger recognition and AC tier switching may remain GM-confirmed in core, but must be visible and operable without an external paper counter.

### Runtime acceptance

- [x] Imported all four v14/core outputs into the disposable local Foundry 14.364 / dnd5e 5.3.3 mirror.
- [x] Fixed spend: Urchin Spike changed Combat Spikes from 12 to 11.
- [x] Variable spend/scaling: Tainted Shellcreeper gained two Shell Overload, then the amount-scaled Psychic Reverberations consumed both layers.
- [x] Bounded gain/recovery: Red Kelp stopped at three Bloom Energy; the transition consumed all three and restored Algal Bloom from 0/1 to 1/1 in one native consumption transaction.
- [x] Manual AC tier: the first runtime pass exposed that v14 `initial`-phase `ac.flat` changes do not affect already-derived natural AC. The generalized projector now emits a v14 `final`-phase override of `system.attributes.ac.value` while preserving the v12 `ac.flat` projection. After CLI regeneration and reimport, the ordinary chat Effect card changed Urchin AC 20 to 18.
- [x] Temporary Actors, Token and messages were deleted, the local mirror world option was restored to `cor-cotn`, port 30001 was stopped, and production was not accessed.

## Acceptance boundaries

- JSON parsing, test success and verifier acceptance are mechanical gates only.
- Core-operable is accepted only when the generated Actor visibly carries the right current/max resource and provides the source-declared operations/consumption paths.
- Automatic detection of spell misses, successful saves, damage thresholds or nearby spellcasting is not claimed in `core`.
- Automatic Urchin AC switching is not claimed until a locked runtime/module implementation observes resource changes. Core output must instead expose the exact tier mapping and toggleable effects.
- Runtime acceptance is bounded to the representative resource operations above. It does not prove automatic trigger recognition or automatic tier switching.

## Recovery

- Do not hand-edit generated JSON.
- If a real output fails, fix the source contract/parser/projector/verifier, rerun the CLI and repeat semantic review.
- Preserve unrelated dirty-worktree files and use path-scoped diffs.
