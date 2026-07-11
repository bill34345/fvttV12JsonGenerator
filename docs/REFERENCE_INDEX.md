# Versioned Reference Cache

Large upstream source trees, generated indexes, API mirrors, fonts, icons, and tokens are local verification inputs. They are not runtime dependencies and are not stored in Git.

## Tracked evidence

- `references/reference-cache-manifest.json` pins each automatically acquired component to an immutable revision and records its license.
- `references/dnd5e-5.3.3/system.json` records the published dnd5e package metadata.
- `references/dnd5e-5.3.3/release-5.3.3.html` and `release-5.3.0.html` preserve the small release-note evidence used by the v14 work.
- `references/foundry-v14-api-notes/` preserves the small official Foundry release-note snapshots and their acceptance hashes.
- Generated v14 Item JSON uses the small locked templates under `references/item-templates/dnd5e-5.3.3`; it does not read the full upstream source tree.

## Local layout

The ignored cache root is `.local/references/`:

| Path | Purpose |
| --- | --- |
| `.local/references/dnd5e/5.3.3/repo` | Immutable dnd5e source checkout pinned by the manifest |
| `.local/references/foundry/14.361/api-core` | Curated Foundry v14 API pages retained for local review |
| `.local/references/foundry/14.361/api-core-text` | Text extracts retained from the previous local snapshot |
| `.local/references/indexes` | Rebuildable file and token indexes |
| `.local/references/generated-text` | Rebuildable API text extracts |

The older v12/dnd5e 4.3.9 tracked references remain available until they receive a separate migration. Removing the v14 inputs must not change v12 or v13 output.

## Commands

```powershell
# Show the immutable acquisition plan without writing files
bun run references bootstrap --dry-run

# Acquire into a staging directory, verify the exact revision, then atomically install
bun run references bootstrap

# Offline validation; never modifies the cache
bun run references verify

# Rebuild generated indexes under .local/references
bun run src/tools/referenceIndex.ts
```

The bootstrap command never replaces a valid existing cache until the staged clone has checked out the exact revision. A failed clone, checkout, or revision check leaves the existing target untouched.

## Locked v14 evidence

- Foundry generated metadata: `14.361`
- Foundry runtime acceptance: `14.364`
- dnd5e: `5.3.3`, revision `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`
- MIDI-QOL: `14.0.9`
- DAE: `14.0.12`
- Foundry release `14.361` snapshot SHA-256: `580F327078CAFBD6A767405ABD8AA6E9057F2E431BAD50219F60B93A6B5114CC`

Full production-module coexistence is not accepted. These references support schema and narrow runtime verification only.
