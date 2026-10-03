# DAE 14.0.14 ServerNext phase-chain candidate

Scope: Core14.368 / dnd5e6.0.5 / local ServerNext. This candidate corrects the
released `daeShouldApplyChange` phase interceptor so an eligible change still
passes through the native suppression and condition checks and records its
native `applied` marker. DAE phase selection and original change data remain
unchanged. The same candidate also skips status reconciliation for compendium
Actor templates, both when scheduling and when executing reconciliation. This
preserves their authored effects; world Actor reconciliation keeps its original
behavior. It does not patch Foundry or dnd5e prototypes directly.

Released input: <https://gitlab.com/tposney/dae/-/raw/v14/package/dae-v14.0.14.zip>,
SHA-256 `82118247402d56da085144db0cd96cb6d61a79e2c88a72218111705ce2cc37de`.
The unmodified released `module/dae.js` has
SHA-256 `140e7714e8bb9f324ec95d9be67e9742907744663fdb40555a89394041294527`.
The accepted local `14.0.14+servernext.1` script includes both patches and has
SHA-256 `3411dfc47e44255ead045c621402791697c5d0f70b329e708e3c6a06f87defac`.
The upstream hash is an input gate, not the identity of the installed candidate.
Source/author: Tim Posney and DAE contributors. MIT license:
<https://gitlab.com/tposney/dae/-/raw/v14/LICENSE>. Preserve that notice in any
candidate distribution. The local candidate must use a distinct version and
must not retain an official automatic-update URL that silently replaces it.

Run the focused source-contract checks through the package script:
`bun run --cwd foundry-modules/server-next-external-candidates test:dae`.
The compendium-template cases use
`bun run --cwd foundry-modules/server-next-external-candidates test:dae-compendium-status`.
The tests execute the exact installed Core and dnd5e method bodies with bounded
interface fixtures. They do not create a world, open LevelDB, start services or
test paid content. Real startup/no-new-error acceptance remains separate.

The build expects the locked archive, pristine extracted package, and author
license under the ignored `.local/next-finish-20261002/dae-upstream` input path.
It rejects an already patched package. The current migration ledger records the
accepted local installation and classpack source-effect recovery; these files
are source checkpoints and do not include the upstream archive or a portable
Foundry installation.
