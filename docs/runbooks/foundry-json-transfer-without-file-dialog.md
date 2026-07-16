# Foundry JSON transfer without native file dialogs

Use this runbook when Codex controls the user's existing Chrome through the
ChatGPT/Codex extension and a Foundry import or export stalls at a Windows file
picker or download dialog.

## Why the Chrome permission is not a complete fix

Chrome's **Allow access to file URLs** setting controls whether an extension may
run on `file://` pages. It does not guarantee that an extension-connected
automation session may submit an arbitrary local path through
`DOM.setFileInputFiles`.

The limitation is reproducible outside this project:

- [Playwright MCP issue 1481](https://github.com/microsoft/playwright-mcp/issues/1481)
  reports `DOM.setFileInputFiles: Not allowed` only in extension mode; the same
  `setInputFiles` call succeeds in a normal non-extension Playwright browser.
- [OpenAI Codex issue 21597](https://github.com/openai/codex/issues/21597)
  reports the same Chrome-plugin upload failure and file-picker hang.
- The normal Playwright contract remains
  [`FileChooser.setFiles`](https://playwright.dev/docs/api/class-filechooser),
  but it depends on the browser transport being allowed to perform the file
  injection.

Do not keep asking the user to toggle the permission when the observed error is
`DOM.setFileInputFiles: Not allowed`. Treat that as an extension-transport
boundary.

## Preferred route for Foundry

Foundry already exposes the supported document workflows needed here:

- `ClientDocument#importFromJSON(json)` parses the JSON, runs
  `constructor.fromImport`, applies migrations and strict construction, converts
  from compendium form, preserves destination-only fields, and updates the world
  Document.
- `ClientDocument#exportToJSON()` calls `toCompendium`, adds `_stats.exportSource`,
  serializes the result, and passes it to `foundry.utils.saveDataToFile`.

The pinned Foundry 14.364 implementations live at
`.local/foundry-v14/app/14.364/client/documents/abstract/client-document.mjs`.
Use these public client methods; do not write LevelDB directly.

### Import without a file chooser

1. Read the project-generated JSON as UTF-8 in the controlling runtime.
2. Pass the JSON text, not its local path, into the page through the tab's
   permitted CDP `Runtime.evaluate` capability.
3. For a new world Document, create a disposable placeholder of the correct
   type and call `placeholder.importFromJSON(jsonText)`.
4. If import fails, delete the placeholder in `catch` before returning the
   error.

Equivalent page-side operation:

```js
const placeholder = await Item.create({
  name: "[Codex transfer placeholder]",
  type: "equipment"
});
try {
  await placeholder.importFromJSON(jsonText);
  return {id: placeholder.id, uuid: placeholder.uuid, name: placeholder.name};
} catch (error) {
  await placeholder.delete();
  throw error;
}
```

This is the same import method invoked after Foundry's Import Data dialog reads
the selected `File`. It bypasses only the operating-system picker.

### Export without a download or Save As dialog

Call `document.exportToJSON()` unchanged. Immediately around that call, install
a temporary `HTMLAnchorElement.prototype.dispatchEvent` wrapper that:

1. recognizes the detached JSON download anchor created by
   `foundry.utils.saveDataToFile`;
2. prevents the native download;
3. fetches the generated `blob:` URL and returns its exact text and filename;
4. restores the original prototype in `finally`.

Equivalent page-side operation:

```js
let captured;
const originalDispatch = HTMLAnchorElement.prototype.dispatchEvent;
HTMLAnchorElement.prototype.dispatchEvent = function (event) {
  if (this.download?.endsWith(".json") && this.href?.startsWith("blob:")) {
    event.preventDefault();
    captured = fetch(this.href).then(async response => ({
      filename: this.download,
      type: response.headers.get("content-type"),
      data: await response.text()
    }));
    return true;
  }
  return originalDispatch.call(this, event);
};
try {
  document.exportToJSON();
  if (!captured) throw new Error("Foundry did not dispatch a JSON export");
  return await captured;
} finally {
  HTMLAnchorElement.prototype.dispatchEvent = originalDispatch;
}
```

Save the returned bytes to an ignored evidence or requested output path. The
wrapper must be restored even when export fails. Verify that no native dialog
appeared and that the prototype is back to its native implementation.

## Acceptance and cleanup

An import/export round trip is complete only when all of the following hold:

- Foundry's public import and export methods both ran successfully.
- The exported JSON parses and has the expected document type.
- Source-relevant semantics match the CLI artifact. Compare identity,
  descriptions, rarity/attunement, armor/type/properties, Activities, damage,
  ranges, uses/recovery, consumption, and linked effects as applicable.
- Version, timestamp, user ID, export source, generated document ID, and
  schema-default expansion are classified separately as migration/runtime
  volatility instead of being mistaken for source drift.
- Disposable Documents are deleted, the local Foundry process is stopped, and
  the original `server-mirror/Config/options.json` world is restored.

For a non-Foundry site that genuinely requires local path injection, use a
normal non-extension Playwright Chrome/Edge session. Do not claim that the
existing Chrome extension session can perform an operation that upstream still
rejects.
