# Slithering Bloodfin Acceptance Gate

`Slithering Bloodfin` is the only blocking acceptance fixture for the next repair phase.
No implementation may be called "usable" until this checklist passes in both layers:

1. Repository acceptance tests are green.
2. Foundry manual import QA is green.

## Semantic Source of Truth

Use these sources in this order:

1. `obsidian/dnd数据转fvttjson/input/月蚀矿腐化生物数据.md`
2. `obsidian/dnd数据转fvttjson/input/slithering-bloodfin__滑行血鳍.md`
3. Do not treat the current generated JSON as truth.

## Repository Acceptance Assertions

- Actor metadata:
  - actor type is `npc`
  - creature type is mapped to Foundry-usable `aberration`, not left as raw Chinese text
  - initiative total `+6` is represented as Dex `+2` plus init bonus `+4`
  - Dex save total `+6` is structurally represented, not left only in text
  - blindsight is `100 ft`
  - passive perception resolves to `14`
- Traits:
  - exactly three trait items exist: `Blood Frenzy`, `Wriggly`, `Death Burst`
  - trait activation policy is fixed:
    - `Blood Frenzy` = none
    - `Wriggly` = special
    - `Death Burst` = special
  - trait activities are utility placeholders, not attack/save/damage stubs
- Actions:
  - `Multiattack` is a utility placeholder, not an attack or damage item
  - `Bite` is attack-first, not damage-only
  - `Tail Crash` contains a primary attack activity and is not reduced to a save-only item
  - `Tail Crash` branch effects are not collapsed into a single malformed save payload
- Bonus actions and reactions:
  - `Swallow` is a bonus action
  - `Swallow` does not inject unconditional `prone`
  - `Slippery` is a reaction
  - `Pelagic Screech` is a reaction
  - `Pelagic Screech` preserves the `bloodied only` gate as structured activation logic, not prose only
  - `Pelagic Screech` includes full `1/day` resource semantics, including recovery metadata
- Effects:
  - every generated effect has an icon
  - icons use `systems/dnd5e/icons/svg/statuses/*.svg`
  - placeholder or missing effect icons are not accepted
- Description rendering:
  - trait/action/reaction descriptions preserve structure from markdown
  - a single flattened `<p>...</p>` blob is not accepted

## Foundry Manual Import QA

- Import `slithering-bloodfin__滑行血鳍.json` with no schema or sheet errors.
- Traits appear in the Traits section:
  - `Blood Frenzy`
  - `Wriggly`
  - `Death Burst`
- Actions appear in the Actions section:
  - `Multiattack`
  - `Bite`
  - `Tail Crash`
- Bonus Actions contains `Swallow`.
- Reactions contains `Slippery` and `Pelagic Screech`.
- `Bite` is shown as an attack, not a damage-only entry.
- `Tail Crash` is usable and no longer appears as a malformed save-only item.
- `Swallow` remains a bonus action and does not apply `Prone` as a default side effect.
- `Pelagic Screech` shows `1/day`, consumes correctly, and recovers correctly.
- The token / detection UI shows `blindsight 100 ft`.
- Effect icons display as proper dnd5e status icons.
- Descriptions remain readable with paragraph/list structure.
