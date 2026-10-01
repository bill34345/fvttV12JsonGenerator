# House Rules 0.1.2 apply diagnostic Macro

This is a separate fixture from `server-next-potion-0.1.2-macro.json`. The prior Macro files and README remain unchanged so their recorded hashes remain valid. `server-next-potion-0.1.2-diagnostic.json` is a Foundry Script Macro import document whose `command` exactly matches `server-next-potion-0.1.2-diagnostic.js`.

The Macro requires the active GM, exact ServerNext URL/world/Foundry/dnd5e pair, active House Rules 0.1.2, potion feature and authority. It refuses a pre-existing Actor ID or prefix. Its only fixture is Actor `SN-HR-POTION-012-DIAG-20260924-Actor` (`SnHrPt012240924B`) with `flags.world.codexServerNextMigration.fixture=house-rules-potion-0.1.2-diagnostic` and one explicitly tagged embedded Consumable with empty original Activities.

It calls the public potion API for preview and apply once, then reports apply return class (`applied_true`, `null`, `undefined`, `other`), current Activity count/keys/types, snapshot presence/schema, original-empty status, equality between snapshot applied Activities and current Activities, and any caught error class/stage. Only when all apply checks pass does it attempt restore. On any apply or snapshot failure it leaves the Item untouched for UI Export Data and readback. It never deletes or retries, and reports only the Actor returned by this invocation's create. Result output is a concise task-owned ChatMessage when the Actor exists, plus a notification; it contains no item or spell text.

Cleanup after UI inspection must use the exact returned Actor ID and verify its `world.codexServerNextMigration` marker. The embedded Item is removed with that Actor. The separately created Macro and result ChatMessage should each be cleaned only by their own exact ID.
