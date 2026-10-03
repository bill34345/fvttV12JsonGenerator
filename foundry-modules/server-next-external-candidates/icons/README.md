# ServerNext missing icon reference repair

The current 6.0.5 world inventory contains 73 document image references to 11
missing Plutonium paths. This repair changes those image fields through normal
Foundry document updates. It neither installs nor enables Plutonium, opens paid
packs, tests paid content, nor changes rules, effects or granted abilities.

The private frozen plan binds each current document ID, name and old image.
`repair-runtime.js` checks all destinations and their hashes before the first
write, compares the complete affected owner sources with a precise image and
modification-metadata allowlist, and verifies unchanged world document IDs.
An existing retained error Actor is explicitly protected. A partial operation
must be resumed from its readback receipt rather than replayed wholesale.

These are explicit replacement images, not a claim that the missing original
bytes have been recovered. Existing Foundry `icons/svg/` assets are referenced
in place, never copied into this repository. Two same-named Game-icons assets
live under a separate Data/assets path; preserve [attribution](ATTRIBUTION.md).

Current execution and acceptance are recorded only in the
[migration handoff](../../../docs/plan/server-next-migration-handoff-20260927.md).
Source syntax and file availability do not replace runtime update, readback,
reload, UI image observation, error collection and owned Macro cleanup evidence.
