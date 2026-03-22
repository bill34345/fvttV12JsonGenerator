# Local Reference Index

This project keeps high-value Foundry and dnd5e references under [`references/`](I:/OpenCode/fvttV12JsonGenerator/references).

## Foundry V12

- Core API curated snapshot:
  [`references/foundry-v12-api-core/`](I:/OpenCode/fvttV12JsonGenerator/references/foundry-v12-api-core)
- Plain-text extracts for the curated snapshot:
  [`references/foundry-v12-api-core-text/`](I:/OpenCode/fvttV12JsonGenerator/references/foundry-v12-api-core-text)
- Resumable wider mirror:
  [`references/foundry-v12-api/`](I:/OpenCode/fvttV12JsonGenerator/references/foundry-v12-api)
- Machine-readable file index:
  [`references/indexes/foundry-v12-api-core-index.json`](I:/OpenCode/fvttV12JsonGenerator/references/indexes/foundry-v12-api-core-index.json)
- Machine-readable token index:
  [`references/indexes/foundry-v12-api-core-token-index.json`](I:/OpenCode/fvttV12JsonGenerator/references/indexes/foundry-v12-api-core-token-index.json)

Recommended first pages:

- [`index.html`](I:/OpenCode/fvttV12JsonGenerator/references/foundry-v12-api-core/index.html)
- [`client.Actor.html`](I:/OpenCode/fvttV12JsonGenerator/references/foundry-v12-api-core/classes/client.Actor.html)
- [`client.Item.html`](I:/OpenCode/fvttV12JsonGenerator/references/foundry-v12-api-core/classes/client.Item.html)
- [`foundry.abstract.Document.html`](I:/OpenCode/fvttV12JsonGenerator/references/foundry-v12-api-core/classes/foundry.abstract.Document.html)
- [`foundry.abstract.DataModel.html`](I:/OpenCode/fvttV12JsonGenerator/references/foundry-v12-api-core/classes/foundry.abstract.DataModel.html)
- [`client.TokenDocument.html`](I:/OpenCode/fvttV12JsonGenerator/references/foundry-v12-api-core/classes/client.TokenDocument.html)

## dnd5e 4.3.9

- Locked source tree:
  [`references/dnd5e-4.3.9/repo/`](I:/OpenCode/fvttV12JsonGenerator/references/dnd5e-4.3.9/repo)
- Machine-readable file index:
  [`references/indexes/dnd5e-4.3.9-file-index.json`](I:/OpenCode/fvttV12JsonGenerator/references/indexes/dnd5e-4.3.9-file-index.json)
- Machine-readable token index:
  [`references/indexes/dnd5e-4.3.9-token-index.json`](I:/OpenCode/fvttV12JsonGenerator/references/indexes/dnd5e-4.3.9-token-index.json)
- Release JSON:
  [`release-4.3.9.json`](I:/OpenCode/fvttV12JsonGenerator/references/dnd5e-4.3.9/release-4.3.9.json)
- Release HTML snapshot:
  [`release-4.3.9.html`](I:/OpenCode/fvttV12JsonGenerator/references/dnd5e-4.3.9/release-4.3.9.html)
- Release notes markdown:
  [`RELEASE_NOTES.md`](I:/OpenCode/fvttV12JsonGenerator/references/dnd5e-4.3.9/RELEASE_NOTES.md)
- Published manifest:
  [`system.json`](I:/OpenCode/fvttV12JsonGenerator/references/dnd5e-4.3.9/system.json)

Recommended search entry points inside the dnd5e source tree:

- `system.json`
- `template.json`
- `module/`
- `data/`
- `templates/`

## Usage Order

When implementing or reviewing Foundry output:

1. Check `references/dnd5e-4.3.9/system.json`.
2. Check `references/indexes/dnd5e-4.3.9-token-index.json` to narrow candidate files before opening source files.
3. Check `references/indexes/foundry-v12-api-core-token-index.json` to find the right API page.
4. Read `references/foundry-v12-api-core-text/` before opening raw HTML when possible.
5. Only if local references are insufficient, browse the web.

## Refresh Command

Regenerate local indexes and text extracts:

- `bun run src/tools/referenceIndex.ts`
