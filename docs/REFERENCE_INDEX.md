# Versioned Reference Cache

Large upstream source trees, generated indexes, API mirrors, fonts, icons, and tokens are local verification inputs. They are not runtime dependencies and are not stored in Git.

## Tracked evidence

- `references/reference-cache-manifest.json` pins each automatically acquired component to an immutable revision and records its license.
- `references/dnd5e-5.3.3/system.json` records fixed-line published metadata.
- `references/dnd5e-6-current/system.json` records the current acquired stable 6.x metadata; the `dnd5e-current-6` manifest revision/target follows reviewed official releases, not a permanent minor-version cap. Installation/runtime acceptance is separate; see [version-following workflow](runbooks/dnd5e-version-following.md).
- `references/dnd5e-5.3.3/release-5.3.3.html` and `release-5.3.0.html` preserve the small release-note evidence used by the v14 work.
- `references/foundry-v14-api-notes/` preserves the small official Foundry release-note snapshots and their acceptance hashes.
- Generated v14 Item JSON uses the small locked templates under `references/item-templates/dnd5e-5.3.3`; it does not read the full upstream source tree.

## Local layout

The ignored cache root defaults to `.local/references/`. Set
`FVTT_REFERENCE_CACHE_ROOT` to move this rebuildable/reference-only tree to a
dedicated directory without moving the Foundry Lab or tracked provenance.

| Path | Purpose |
| --- | --- |
| `.local/references/dnd5e/5.3.3/repo` | Fixed 5.x source checkout pinned by the manifest |
| `.local/references/dnd5e/6.0.5/repo` | Current acquired stable 6.x source checkout; advance manifest revision/target on the next reviewed release |
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

# First acquisition only: all targets must be absent. Existing-cache updates follow the runbook.
bun run references bootstrap

# Offline validation; never modifies the cache
bun run references verify

# Rebuild generated indexes under .local/references
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

The current bootstrap implementation moves an existing target aside before replacement. It must not be used to refresh an existing shared cache under this project’s no-backup rule. First acquisition into absent targets remains distinct. For an existing source repository, fetch the fixed official tag and add a new versioned checkout using its Git objects; preserve the old checkout HEAD. See the version-following workflow above.

`references verify` reports four distinct states: `ok`, `missing`, `mismatch`, and `git-error`. `mismatch` is used only when Git successfully reads `HEAD` and the revision differs. Missing Git, unsafe-directory/ownership failures, access errors, and other unreadable-checkout failures are reported as `git-error` with the Git command, exit status, and diagnostic text; they never masquerade as a revision mismatch.

## Locked v14 evidence

- Foundry generated metadata: `14.364`
- Foundry runtime acceptance: `14.364`
- dnd5e: `5.3.3`, revision `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`
- MIDI-QOL: `14.0.11`（当前锁定；`14.0.9` 的旧验收记录保留为历史证据）
- DAE: `14.0.12`
- Foundry release `14.361` snapshot SHA-256: `580F327078CAFBD6A767405ABD8AA6E9057F2E431BAD50219F60B93A6B5114CC`

Full production-module coexistence is not accepted. These references support schema and narrow runtime verification only.
