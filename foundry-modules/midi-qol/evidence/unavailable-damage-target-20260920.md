# Damage tray target validation — local.6

## Evidence and cause boundary

After local.5 reload, Chrome reported two errors while older cards entered the viewport: `DamageApplicationElementMidi.calculateDamage` received undefined, called through the superclass `buildTargetListEntry` before Midi's existing post-super Actor guard. This is separate from the fixed manual-Damage item restoration failure, which has now passed its preserved-card runtime retest. The damage component was not changed by patches 0001 or 0002; observing the error after reload does not mean local.5 introduced it.

The exact historical card/UUID causing each log is not yet identified. A pinned-source reproduction confirms two supported failure mechanisms: `TargetsField.resolve` returns only an Actor for an off-scene target with no active Token, and a TokenDocument can exist without an Actor. `RecordedTargetsElement` accepts either Actor or Token, but the native damage builder assumes Token.actor and Token.getGroupingKey. Its Apply loop also operates on Token.actor. Fixing only calculateDamage, returning zero, or inventing an Actor-only actionable row would be incorrect.

The official ten-branch/MR audit found no applicable fix. The dnd6 branch retains the post-super guard, other relevant V14 source lacks a matching pre-check, and no open MR matched this target-building change. Audit evidence: batch6K `upstream-damage-render-audit.json`.

## Independent patch 0003

For dnd5e 6+, validate TokenDocument and its Actor before entering the superclass. Unavailable targets get a plain text, aria-disabled row with no option, checkbox, action button or calculated total. No Actor/Token is guessed or modified. Valid targets continue through the original builder; genuine damage-calculation errors still propagate. 5.x control flow is untouched. Localization has an English fallback if not initialized; no asset or language-file update is required.

Patch SHA-256: `28DCADB396461D0A67D4E901AE2FA842D0A1704EDED147CA2D3420742DB847B4`.

## Verification and deployment

67 tests passed with 259 assertions; module tooling TypeScript and pristine/candidate TypeScript checks passed. Tests execute the hash-verified native resolver, recorded-target builder, damage parent builder/grouping/Apply loop and Midi builder/calculator, with explicit DOM and Actor shims. Mixed unavailable/valid targets preserve the valid calculation/application; invalid rows never enter Apply; changing to the target scene restores the exact Token path. Text escaping, missing documents/localization, genuine calculation failure and a negative control removing patch 0003 are covered. The original failure reproduces in the negative control.

Astra found no apply blocker. Local.6 ZIP SHA-256: `5EBDE9D568F195A283612CB92EB6E26351969C88159641B5D842E88D51FFE879`; deployed disk/HTTP bundle SHA-256: `734B6F7C0405EFA152B231A30D9131BD4436179383C68549BB2BB8D5ECFB2AE1`. Only bundle/map/manifest were replaced; PID stayed 11188. Server restart, world/pack changes, commit, merge and push were not performed.

Workflow's four fingerprints remain unchanged from local.5; the added DamageApplicationElementMidi.buildTargetListEntry fingerprint is mandatory to prove local.6 is executing. Browser acceptance must still verify real old-card rendering, non-actionable unavailable rows, valid-target behavior, and absence of new related Console errors. Overall G remains open until that evidence and the other pending checks are reviewed.
