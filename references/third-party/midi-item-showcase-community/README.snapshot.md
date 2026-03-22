# midi-item-showcase-community Snapshot

Source link:
- GitHub README: <https://github.com/txm3278/midi-item-showcase-community>

What the module is:
- A collection of midi automation examples and patterns, not a replacement for midi-qol.

What matters for this project:
- The README shows activity-level `Midi-QOL` configuration patterns such as:
  - `Identifier`
  - `Automation Only`
  - `Other Activity Compatible`
  - `On Use Macros`
- The showcased coating example uses a primary activity plus a secondary compatible activity and relies on midi-qol wiring to connect them.

Implementation guidance captured from the examples:
- Primary and follow-up activities should carry stable identifiers.
- Follow-up activities that exist only for automation should be marked automation-only and other-activity-compatible.
- On-use macros are used as the bridge between the primary workflow and the follow-up activity.

Why this repo uses it:
- It provides concrete modeling examples for multi-activity items.
- It confirms that the `primary activity -> macro -> follow-up activity` pattern is a normal midi-qol setup.
