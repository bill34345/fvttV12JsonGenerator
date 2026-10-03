# ServerNext external candidates

The original builds below retain the historical `NEXT-EXT-20260929-01` target,
Foundry14.368 / dnd5e6.0.2. Current ServerNext follows the stable6.x policy and
is now on6.0.5. Do not reuse old runtime contracts or the6.0.2-only launcher for
the current service. Already-accepted behavior is reused when still applicable.
Current migration status remains only in `docs/plan/server-next-migration-handoff-20260927.md`.

The2026-10-02 [DAE phase-chain candidate](./dae/README.md) is a separate narrow
14.0.14+servernext.1 correction on Core14.368/dnd5e6.0.5. It restores native
conditions/suppression/applied-marker handling after DAE phase routing. Use
`bun run --cwd foundry-modules/server-next-external-candidates test:dae` for the
9 source-contract cases and `build:dae` only with the locked release input and
author license prepared. Installed-file proof and actual startup/no-new-error
acceptance are separate; paid package validation is excluded by the user.

- Convenient Effects 9.2.7 uses unchanged official package files. Its archive in `dist` is a locally repacked transport; original release archive and digest are preserved in `upstream` and `upstream-lock.json`.
- Droppables 6.2.1+servernext.1 builds fixed upstream commit with one functional patch: literal string namespace. Local source/package/manifest versions agree. Original source manifest was 1.2.5 because upstream release workflow substitutes the release tag after build.
- Clocks 1.3.3+servernext.1 replaces its only GSAP call with native Element.animate, and removes the missing script declaration. Package allowlist follows the source release workflow's existing paths; the source has no `images` directory. MIT licenses are included in both local packages.
- Local manifests retain author/source URLs, but remove official manifest/download update links and show a local title/version. They are not unmodified upstream releases.

`acquire.py` records complete release bodies and verifies public asset SHA-256. Once `upstream-lock.json` exists it fetches those exact releases, never silently chooses a different candidate. `patch.py` requires exact source preimages and preserves functional unified diffs. In `sources/drop`, use `npm ci --ignore-scripts --no-audit --no-fund` then `npm run build` (upstream TypeScript + Vite production build). `assemble.py` packages into `dist`, verifies declared resources and records file hashes. It refuses arbitrary replacement; after a partial failure inspect its precise output before recovery.

`npm test` runs package-owned Node tests against the actual built namespace/animation code and the persistent UI Macro's target, ownership, partial-write and reload behavior. These tests are not browser acceptance.

`install-next.py` accepts only three absent allowlisted packages, checks exact target and offline process/listener state, checks world LOCK handles without writing database contents, verifies dependency hashes, then records every installed file. It never replaces an existing directory. A partial failure requires readback; do not blindly rerun. No Mirror or system files are changed.

`acceptance-macro.js` is imported through normal Macro UI as a new, named batch tool. It stores its ledger on its own Macro document, creates only explicitly flagged fixtures, rejects collisions, resumes partial preparation without duplicate documents, and restores settings/cleans exact owned IDs once. User-visible actions remain real UI tests. It never calls module drag handlers to manufacture success. Delete the tool itself through UI only after saving cleanup evidence.

`launch-next.ps1` is a prepared, bounded service operation for the executor, gated by its actual host Full Access receipt. It leaves the verified resident service running; existing lock directories are not cleared. On startup failure preserve the exact process/log state and send a blocker callback.

The [DND5E classpack candidate](./classpack/README.md) is a separate approved content adaptation for dnd5e6.0.5. It preserves the v4.3.4 pack/document identities, applies source-established link repairs, and uses explicit source-preserving native API migration with backend verification. Missing custom summons/helpers remain deferred. Use the classpack README and the unique migration ledger for current gates; code/file/source evidence and real UI/reload/cleanup acceptance remain distinct.
