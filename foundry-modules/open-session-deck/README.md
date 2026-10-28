# Open Session Deck

Open Session Deck is a GM-only Foundry VTT dashboard for a second display. It renders from the GM's existing authenticated browser session, so the popout does not load another Foundry client, Canvas, login, or module socket.

The popout first loads the module's static HTML shell, then the existing GM session renders its shared snapshot. Relative images and styles keep the GM page's base URL. The shell contains no scripts or world connection; if it cannot finish loading, the module reports a visible error.

## Supported runtime

- Foundry VTT `14.364` with dnd5e `5.3.3` (runtime accepted)
- Foundry VTT `14.368` with dnd5e `5.3.3` (existing Mirror compatibility candidate; see the scoped acceptance records)
- Foundry VTT `14.368` with dnd5e `6.0.2` (historical static migration candidate; in-world acceptance pending)
- Foundry VTT `14.368` with dnd5e `6.0.5` (native exhaustion panel slice accepted; remaining commands and GM/player matrix untested)
- Foundry VTT `14.368` with dnd5e `6.0.6` (bounded GM panel/popout, TempHP busy/disabled, stale target removal and player-entry denial accepted; remaining commands and the full matrix untested)

Other versions, crossed version pairs, and systems fail closed. Daggerheart support is planned for a later release and is not claimed by this release.

The 6.0.5 and 6.0.6 adapter path reads exhaustion from dnd5e's `dnd5eexhaustion0` Active Effect (the 16-character ID produced by `staticID`) and adjusts it with the native `toggleStatusEffect` API. On 2026-10-01 the same owned Actor's 6.0.5 panel and native readback passed 3→4→3, normal GM reload and exact fixture cleanup. The 6.0.6 pair has scoped real GM HP/exhaustion, panel/same-session popout, TempHP busy/disabled, stale target removal and player-entry denial evidence. General stale branches, other GM commands and the full matrix remain unaccepted; see the [current suite ledger](../../docs/plans/2026-10-11-fvtt-suite-refactor/EXECUTION_LEDGER.md). Historical scope remains in see the [bounded restoration review](../../docs/reviews/2026-10-01-next-605-custom-module-restoration.md).

## Features

- Shared in-Foundry panel and same-session browser popout
- Campaign ledger presentation with leather, bookcloth and paper, compact rosters and a shared bottom operation dock across both columns
- World-level Actor-folder party source with optional descendant folders
- Direct current/base/effective/temporary HP, maximum and AC modifiers, inspiration, exhaustion, statuses, concentration, and death saves
- Permanent row checkboxes select one or multiple PCs/NPCs from the party and encounter; suitable existing operations show their actual eligible-target count
- Character names open a lightweight inspection popover without changing batch targets; the shared dock replaces the former party-bottom and expanded NPC editors
- Decimal initiative editing and swapping, private individual or missing-NPC rolls, and GM visibility control
- Progressive first-round friendly initiative reveal in the official player Combat Tracker; hostile combatants hidden by default
- Active encounter overview, previous/next turn, and main-canvas token location
- English and Simplified Chinese UI

Player initiative concealment is ordinary UI presentation and is not claimed as secrecy against clients inspecting document data. The module does not include a separate player dashboard, action automation, a second map, AI features, or custom networking.

## Help

The Help button in the panel and same-session popout opens this module's entry in an active Suite handbook with a matching help API. If Suite is absent, disabled or unavailable, Deck opens its own bundled read-only help. Both surfaces use the single `docs/manual.json` entry source. Deck 0.2.0 exposes a GM-checked `api.openHelp()`; help does not save preferences or execute game commands. The bounded H3 acceptance is tracked in the [suite ledger](../../docs/plans/2026-10-11-fvtt-suite-refactor/EXECUTION_LEDGER.md).

## Column widths

Drag the divider between party and encounter in either surface. The split survives snapshot refreshes and closing/reopening that surface, stays separate between panel and popout, and resets when Foundry reloads. Double-click or press Enter on the focused divider to reset; arrow keys adjust, Shift increases the step, and Home/End select the allowed endpoints.

The initial main panel is at most 1360×860 with an approximately 55:45 split and 32 pixels of clearance inside the current browser. Names and status icons stay on one line; long names and excess statuses use ellipses with complete hover text. When the panel or popout has less than 960 CSS pixels of content width inside its frame, the party/encounter tabs replace the divider. Widening the browser keeps a narrow panel in tabbed mode. The bottom operation dock spans the available surface width. Expand Current runtime in the lower right to read the actual version pair, support state and current scene name.

Status names follow the interface language instead of exposing internal IDs; vision detection markers are not listed as character conditions. Party and encounter headings share the same column widths as their scrolling rows, with sticky headings and centered HP labels/readouts.

## Undo

The panel and same-session popout share a last-in-first-out undo history on the current GM page. Numerical values, conditions, concentration, death saves, initiative, visibility and combat turn changes run immediately without browser confirmation dialogs. A batch occupies one history entry. Restoration includes native dependent documents, resource recovery, expired effects, movement history and world time observed during the operation.

Undo requires active libWrapper and the active GM page. Active Trigger Engine and Custom Conditions modules must also provide completion waiting and combat rewind integration. Existing actions still work without those prerequisites. History is in memory and clears when Foundry reloads. Only the recorded differences are restored; a subsequent edit to the same data blocks undo instead of overwriting that edit. Failed restoration retains unfinished changes for retry. Roll chat remains a historical record. Arbitrary third-party scripts, external services, audio and other external side effects are outside the reversible document scope. View selection, windows, roster settings and density are not recorded.

Encounter shortcuts are individual icons with localized tooltips: arrows swap initiative and the native users-cog icon rolls private initiative for unrolled NPCs. Each row exposes visibility without selection. Unrolled initiative shows the native configured d20 icon; after rolling it becomes an editable number. Select combatants with their checkboxes to mark or clear defeat in the bottom Encounter group, updating the native combatant flag and actor overlay together with undo. Existing private-roll and NPC hiding behavior remains unchanged.

Roster portraits display at about28×32 with16px single-line names, explicit ellipses and full-name tooltips; common action targets remain34px. A browser2D canvas creates64×64 WebP thumbnails on the first read. Blob derivatives persist in this browser and are validated against source metadata on the next GM page. Both surfaces share the cache. Completion patches only matching images, preserving input and dialog state. Original files and Actor paths stay intact, with no shared PIXI texture changes. A cold miss still reads the source; unsupported image sources fall back to their original display.

Roster statuses display as single-line icons with localized hover names. A narrower status track gives more width to names; headers and rows share the same tracks in both surfaces. Overflow omits whole icons with an ellipsis whose tooltip lists every status and death-save count. The death-save summary is also an icon; status-picker labels remain visible. Death-save controls are in the bottom More values group for eligible selected characters. HP, temporary HP and current-turn titles do not grow default roster rows.

Party names include a compact, always-visible Heroic Inspiration indicator and exhaustion level within the existing row height. Hover text explains both. The amount input sits in the same row and group as Damage and Heal, wrapping as one unit when needed; temporary HP uses the value on the right of a connected control, applied by its left-hand Temporary HP button.

## Select and operate on creatures

Use the permanent checkboxes in either roster to choose one creature or a batch; the header checkbox selects the corresponding list. Clicking a name opens an anchored inspection popover with character-sheet and token-location actions, without changing checked targets. A creature shown in both rosters remains one target. With no checked targets the dock collapses.

The dock has five groups: Life (amount-based damage/healing and a separate temporary-HP value), Status (explicit add/remove), Resources (Heroic Inspiration, exhaustion and concentration), Encounter (show/hide and defeat/restore), and More values. More values opens AC modifier, Maximum HP modifier and Death saves; the Maximum HP modifier menu also contains Set current HP. Base maximum HP, maximum-HP modifier and AC modifier readouts are in the name's inspection popover. Roster HP and inspection HP show the effective maximum. Each operation applies to eligible targets and reports that count. Heroic Inspiration and death saves apply only to eligible characters; exhaustion applies to PCs and NPCs within the system's level bounds. State actions explicitly give/remove or start/end rather than flipping a mixed selection.

Actor value and condition operations apply once per Actor UUID, so selecting the same linked Actor more than once does not repeat damage. Unlinked NPC Token actors remain independent. Encounter operations apply per selected Combatant; a party Actor without a corresponding encounter participant is not included in those operations. A batch is one undo entry.

The selected-target strip never wraps. Targets that do not fit are collected behind a +N overflow control, where the complete selected list can be inspected and individual targets removed. The count, Clear and Undo remain available. Changing the current acting creature, including changes made in Foundry's native Combat Tracker, clears all checked targets. Ordinary HP or status refreshes preserve them. This interaction is shared by the main panel and popout.

## Development

The inline current HP input sets an absolute value and preserves separate temporary HP. Damage and healing buttons continue to use native calculations. New undo behavior has scoped runtime acceptance on14.368/6.0.6, including ending concentration and undoing across the panel and popout. Other versions and the complete multi-GM matrix remain untested.

```text
bun run test:open-session-deck
bun run build:open-session-deck
bun run typecheck:foundry-modules
```

Build and install verification do not prove in-world behavior. Runtime acceptance requires an authenticated GM/player test in the exact supported Foundry and dnd5e versions.

Licensed under the MIT License. No dnd5e or Daggerheart artwork, logos, or rules text is redistributed. Bundled Noto Serif SC fonts use SIL Open Font License 1.1; the original license is included at `assets/fonts/noto-serif-sc/OFL.txt`. Fonts load from local module assets.

The interface uses desktop operation sizes: body and common action labels are about14–17px, with primary controls about32–36px high. More values retains AC and maximum-HP adjustments for eligible selected targets. Lists scroll independently while the selected-target strip and operation dock remain available. The unified dock, expanded batch scope and turn-selection reset require their own scoped runtime acceptance; earlier runtime results do not establish those new interactions.


## Read-only creature inspection

Name clicks open an avatar-free popover without changing batch targets. It shows HP, AC, prepared Passive Perception/Insight/Investigation, ordinary spell slots and separate Pact Magic slots, finite ability/class pools, equipment charges, and consumable/ammunition quantities. Shared pools appear once; stack quantity and charges remain separate. Depleted resources stay visible with zero, while absent pools produce no empty rows. Base HP, modifiers and death saves remain in Other readouts.

Sections are expanded by default. The content scrolls within a height limit while sheet/location actions remain at the bottom. All added resource readouts are display-only; open the native sheet to consume or recover them. Missing prepared values are not inferred as zero, and independently stored third-party counters are not synthesized. Runtime acceptance for these new readouts targets local Next14.368/dnd5e6.0.6 only.
