# Versioned Reference Cache

Large upstream source trees, generated indexes, API mirrors, fonts, icons, and tokens are local verification inputs. They are not runtime dependencies and are not stored in Git.

## Tracked evidence

- `references/reference-cache-manifest.json` pins each automatically acquired component to an immutable revision and records its license.
- `references/dnd5e-5.3.3/system.json` records historical published metadata; 5.3.3 is no longer an active acquisition component or a new-generation target.
- `references/dnd5e-6-current/system.json` records the current acquired stable 6.x metadata; the `dnd5e-current-6` manifest revision/target follows reviewed official releases, not a permanent minor-version cap. Installation/runtime acceptance is separate; see [version-following workflow](runbooks/dnd5e-version-following.md).
- `references/dnd5e-5.3.3/release-5.3.3.html` and `release-5.3.0.html` preserve the small release-note evidence used by the v14 work.
- `references/foundry-v14-api-notes/` preserves the small official Foundry release-note snapshots and their acceptance hashes.
- Current v14 Item generation builds a neutral native 6 document from project source and the shared `14.370 / 6.0.6` target, without requiring a full upstream checkout. The small locks/templates under `references/item-templates/dnd5e-5.3.3` remain historical schema evidence; their source identity must not be renamed to 6.0.6.

## Historical creature-authoring research

- [2026-09-22 creature, villain and Item authoring research](reviews/2026-09-22-creature-item-authoring-opportunities.md) retains fixed external sources, capability limits and license distinctions. Actor blueprints and readable previews are already implemented; Item recipes and broader villain/lair ideas remain research proposals.
- [2026-09-24 D&D 2024 statblock presentation sources](reviews/2026-09-24-dnd2024-statblock-preview-reference.md) retains official SRD/conversion-guide references, field order and the rule against inventing missing values. The renderer is already in the unified Forge workbench; visual style is separate from rules and runtime acceptance.

Both records distinguish their original dated snapshots from the implementation status reviewed on 2026-10-08. Archiving them does not introduce commands, dependencies, installs or new development commitments.

## Local layout

The ignored cache root defaults to `.local/references/`. Set
`FVTT_REFERENCE_CACHE_ROOT` to move this rebuildable/reference-only tree to a
dedicated directory without moving the Foundry Lab or tracked provenance.

| Path | Purpose |
| --- | --- |
| `.local/references/dnd5e/5.3.3/repo` | Historical 5.x checkout, retained read-only outside the active manifest |
| `.local/references/dnd5e/6.0.6/repo` | Active `dnd5e-current-6` checkout at `87e94dbd9f930135e0694cd7e7d49f210603cd2c`; advance manifest revision/target on the next reviewed release |
| `.local/references/foundry/14.361/api-core` | Curated Foundry v14 API pages retained for local review |
| `.local/references/foundry/14.361/api-core-text` | Text extracts retained from the previous local snapshot |
| `.local/references/indexes` | Rebuildable file and token indexes |
| `.local/references/generated-text` | Rebuildable API text extracts |
| `references/foundry-v12-api*` | Legacy local-only v12 API mirror compatibility paths |

The small dnd5e 4.3.9 locks/templates remain tracked. The older v12 Foundry API
HTML/text mirrors remain available in the existing local
`references/foundry-v12-api*` compatibility paths, but those large upstream
copies are ignored and are no longer repository content. Removing or rebuilding
local reference inputs must not change v12 or v13 output.

## Commands

```powershell
# Show the immutable acquisition plan without writing files
bun run references bootstrap --dry-run

# Acquire absent targets, or reuse an existing exact and completely clean Git checkout.
bun run references bootstrap

# Offline validation; never modifies the cache
bun run references verify

# Rebuild generated indexes under the configured reference cache
bun run src/tools/referenceIndex.ts
```

PowerShell example for an external cache:

```powershell
$env:FVTT_REFERENCE_CACHE_ROOT = 'J:\fvtt-reference-cache'
bun run references verify
bun run src/tools/referenceIndex.ts
```

The manifest continues to use the legacy `.local/references/...` logical path
as a portable tracked identifier. The tools map that prefix under the configured
cache root, reject absolute or escaping manifest targets, and keep dry-run
bootstrap read-only.

`references bootstrap` reuses an existing target only when it is an ordinary directory and its own Git root after native realpath resolution, its origin exactly matches the manifest source, its HEAD equals the locked revision, and its Git working tree is complete and clean. Tracked changes or missing files, untracked files, and ignored files all reject reuse. Successful reuse does not contact the network, clone a candidate, change the directory, or modify the Git index. This is a Git-identity/working-tree check, not a full-tree SHA-256 comparison.

Any mismatch leaves the existing target in place and reports an error; bootstrap does not move it aside or create a backup. For an absent target, bootstrap clones into a new random staging directory, checks out the fixed revision, validates HEAD and moves it into the still-absent target. Failure cleans only that newly created staging directory. A version upgrade uses a new versioned checkout after reviewing the official release and manifest; preserve the old checkout HEAD. See the version-following workflow above.

`references verify` reports four distinct states: `ok`, `missing`, `mismatch`, and `git-error`. `mismatch` is used only when Git successfully reads `HEAD` and the revision differs. Missing Git, unsafe-directory/ownership failures, access errors, and other unreadable-checkout failures are reported as `git-error` with the Git command, exit status, and diagnostic text; they never masquerade as a revision mismatch.

## Current target and historical v14 evidence

Current generation identity is Core `14.370` / dnd5e `6.0.6`. The second development environment at `server-mirror / 30001` has its own actual runtime identity, currently dnd5e `6.0.6+local.3`; the local tooltip, activity-template-expiry and inventory-resize patches are maintained under `foundry-modules/server-next-external-candidates/system-runtime`. Compare official source, patch locks and actual installed files when a change involves those behaviors. Current source and runtime acceptance are recorded in the [unification review](reviews/2026-11-06-core14-dnd6-unification.md), not inferred from a checkout or a passing static test.

The following exact versions and hash describe historical evidence and are retained unchanged:

- Foundry generated metadata: `14.364`
- Foundry runtime acceptance: `14.364`
- dnd5e: `5.3.3`, revision `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`
- MIDI-QOL: `14.0.11`（该历史目标；`14.0.9` 的更早验收记录仍保留原身份）
- DAE: `14.0.12`
- Foundry release `14.361` snapshot SHA-256: `580F327078CAFBD6A767405ABD8AA6E9057F2E431BAD50219F60B93A6B5114CC`

Those records support their own schema and narrow runtime observations. They do not establish current 6.x functionality, full production-module coexistence, or permission to update another instance. Current v14 modded generation references MIDI-QOL `14.6.7` and DAE `14.6.5`; actual module dependencies and API admission remain consumer-specific.
