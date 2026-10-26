# Foundry JSON transfer without native file dialogs

Use this runbook when Codex controls the user's existing Chrome through the
ChatGPT/Codex extension and a Foundry import or export stalls at a Windows file
picker or download dialog.

## 当前 Forge 候选 JSON：免保存窗口导出

已有导出授权时由工具完成取出、保存及核对，不要求用户处理下载或系统保存窗口。

1. 在正常 Forge 工作台选择当前候选，展开“技术详情 → 生成 JSON”。该区域与“下载 Actor JSON 候选”使用同一份 `response.result.artifact` 和同一 `JSON.stringify(..., null, 2)`。
2. 用当前官方 Chrome 连接器读取页面已展示的完整 `pre[data-json]` 文本。读取受单次长度限制时分段取得并按顺序拼接；确认未截断，不读取浏览器内部状态或注入页面脚本。
3. 由本地文件工具将该原文以 UTF-8 写入本次证据目录或用户指定位置。记录对象／候选身份、文件名、字节数和 SHA-256；不重新生成、不改写字段或重新排版。
4. 读回实际文件，与取得的完整文本比对；核对解析后的对象、候选身份和完整内容。读取失败只补取缺失内容，不重跑已完成的生成、创建或战斗验证。

这条路线验证的是正式候选内容的无窗口导出。专门验收浏览器“下载”按钮时，另记真实按钮与文件落盘证据；不要将两者混写。下载事件超时本身不证明文件没有生成，也不自动转交用户代操作。

本流程不依赖 `chrome://downloads`、原生保存窗口、CDP 注入或原型替换，不新建下载代理或服务。以下旧版原生 Document 导入说明保留其历史用途；其中的执行通道必须服从当前工具权限，不能仅因旧文档列过某方法就使用它。

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

历史上曾通过 `document.exportToJSON()` 取得其生成的 Blob，完成无需用户处理保存窗口的验收，见 [2026-07-16 记录](../remediation/2026-07-15-project-hardening/EXECPLAN.md)。当时临时拦截浏览器下载的脚本不作为当前执行入口，不能用它绕过现行 Chrome 工具限制。

当前 Forge 候选采用本页顶部的可见完整 JSON 路线。其他原生 Document 导出须使用该应用现有且获准的导出接口，取得准确原文后由文件工具保存；不得把 `toObject()` 快照冒充包含迁移／导出来源信息的原生 `exportToJSON()` 结果。

## Historical native import/export acceptance and cleanup

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
