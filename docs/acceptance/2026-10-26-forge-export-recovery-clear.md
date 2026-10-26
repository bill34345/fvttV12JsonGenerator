# Forge：免保存窗口导出与恢复记录清除

用户授权：“导出沿用免保存窗口的方式，不要再让我点击；修好‘清除本地恢复副本’的确认窗口调用，把按钮名称和清除范围说清楚。沿用当前 worktree，只验证这两处，不重跑已通过的测试，不调用新模型，不提交、合并或推送。”

## 修改

- 导出复用已有“技术详情 → 生成JSON”中的完整Actor JSON，增加可复制保存的说明。该文本与下载处理器使用同一正式候选及相同序列化方式；工具读取完整原文、保存UTF-8并核对，不触发下载按钮或系统保存窗口，不新增导出API、代理或服务。
- 修正清除入口：通过所属`DialogV2`对象调用`confirm`，保留其内部`this.wait`；只有明确返回`true`才清除。
- 按钮改为“清除全部候选恢复记录”。按钮旁和确认框明确：当前浏览器、当前世界、当前GM的全部单条及批量恢复记录；当前页面结果、Actor、Item、来源库和队列保留。清除后的记录不能用于刷新恢复。

只修改Forge界面/应用调用、两项局部测试及其现有安全包装入口，另同步README、免窗口导出runbook和工具手册。生成器、提取、AI复核、法术、战斗和恢复格式未改。

## 验证

新增安全入口`bun run test:forge-export-recovery-clear`只运行两项新增测试：2通过、49断言、106过滤、0失败。先用严格确认窗口调用对象复现旧错，再核对取消/确认、实际Memory store范围以及可见JSON与下载内容的UTF-8字节一致。没有重跑此前生成或战斗测试。Forge模块类型检查、构建及手册build/check通过。

在现有Mirror PID20308、Core14.368/dnd5e5.3.3/cor-cotn验证。只安装`index.js`及`forge-intake.hbs`；最终脚本SHA256为`876b263f3ca7317c89bc7d67920a6c58b0c252fad9a8059318b10bd7614560ea`，服务未重启。官方Chrome执行器复用既有身份与用户页面，新增唯一隔离任务页；没有使用原生保存窗口、内部下载页或CDP注入。

准备只使用前批仍在7天有效期内、同目标的原始`stage2-ui/v2-record.json`。经模块现有存储接口放入本批单条/批量恢复记录，再通过正常“恢复上次单条候选”载入；没有请求模型、创建世界Actor或重测生成结果。

| 验证点 | 实际结果 |
| --- | --- |
| 免窗口导出 | 从正常页面已显示的`pre[data-json]`读取并保存`actor-export.json`，67,503字节。与原始正式候选的序列化结果逐字节相同，SHA256为`513f7a619e6d882ecaee5d6ba63b2919174e96ab7971b1fc4add0196878fb8fc`。无用户点击、无下载/Save As操作。 |
| 取消清除 | 真实确认窗口正常出现，点“否”后两条恢复记录及其完整checksum不变。 |
| 确认清除 | 再次打开同一确认窗口，点“是”后当前范围恢复记录为空。 |
| 保留范围 | 取消与确认后，当前候选hash、可见JSON字节/hash均不变；世界、来源库、队列与原始基线一致。GM确认创建和下载入口仍可用，但没有点击这些入口。 |
| 模型调用 | 任务页外部请求防护未捕获任何模型尝试，实际新模型调用0，AI复核保持关闭。 |

这是正式候选内容的免窗口导出验证，不冒充浏览器原生下载按钮的新增验收。已通过的生成、创建和战斗结果继续复用。

## 证据

目录：`H:/CodexData/visualizations/2026/10/25/01a1720b-4563-7511-82df-e8cb00ed7e53/forge-export-recovery-clear-20261026/`。

- `worker-final.json`、`worker-green.log`、`worker-red-confirm.log`：限定改动与局部检查。
- `install.json`、`fixture-preparation.json`：实际安装清单与未改动原草稿身份。
- `actor-export.json`、`export-byte-verification.json`：工具保存的准确原文及独立字节对照。
- `before-clear.json`、`cancel.json`、`confirmed.json`：实际存储、可见JSON及世界/来源库/队列基线。
- `confirm-dialog.png`：真实确认窗口及清除范围文案。

产品外的地图生成服务启动警告、MCP连接提示不归入本次两处验证，也未因此修改其它模块或重跑测试。没有提交、合并或推送。

最终清理通过：本批两条恢复记录为空，任务Macro`35Vl74cpwJqpp7dF`已删除，临时请求拦截已恢复，ownedtab651351376已关闭；原用户页面保留。世界与来源库/队列的完整hash均与准备前相同。前批63份证据及本次使用的原始v2草稿hash未变。最终收据为`final-cleanup.json`、`tabs-final.json`和主控独立核对的`parent-final-verification.json`。
