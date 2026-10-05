# ServerNext Babele 表格嵌入翻译候选（2026-09-27）

## 当前状态

本团独立模块 `fvtt-babele-rolltable-embed-translation` 已调整到 ServerNext `0.2.1`：Foundry 14.368、dnd5e 6.0.2、Babele 2.9.1、libWrapper 1.13.5.1。2026-09-28 正常客户端已读回模块启用、25 行狂野魔法浪涌中文结果、5 行困惑术结果和原 UUID 的“基本方位”链接；这三项为 **PASS**。重复打开后的逐行复核未完成，不能据此宣称所有随机表都通过。Mirror 旧版未修改。

## 为什么仍需此模块

[9月26日原世界只读渲染](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/module-activation-20260926/babele-embed-readonly.json>)显示：dnd-players-handbook的狂野魔法浪涌表标题已中文化，原生嵌入行仍是英文。Next现有中文译包的 dnd-players-handbook.tables.json 有狂野魔法浪涌25个范围对应的中文结果；困惑术行为有4个结果文本翻译，另有文档型结果需通过原UUID保留内容链接。官方Babele 2.9.1已启用，但其自身没有包装RollTable嵌入渲染。旧判断详见[正式替代与本地补丁复查](./2026-09-26-server-next-official-replacement-and-local-patches.md)。

## 锁定目标静态核对

- 本机Foundry 14.368的 client/documents/roll-table.mjs 保留 RollTable._buildEmbedHTML(config, options)：从当前results生成两列表格，templates/tables/embed.hbs的tbody每行第二个单元格承载结果。该入口与本模块现有wrapper和替换单元格方式吻合。
- Next安装的Babele 2.9.1仍有 translatedCompendiumFor、translationsFor、rollbackDocument；libWrapper 1.13.5.1已装。Babele和libWrapper的实际客户端启用状态由前批83 active读回支持。
- 初装的 `0.2.0` 在真实 Wild Magic Surge `@Embed` 里仍显示英文，故判语义 **FAIL**。当前核心语言值为 `zh-CN`，中文译包向 Babele 注册的源语言是 `cn`；Babele 2.9.1 的按语言 `sessionFor()` 是不应用到 Foundry 全局运行时的会话。`0.2.1` 只在 `zh-CN` 且当前语言没有相应翻译时按需读取 `cn` 会话，并在 Babele 重初始化时清除缓存；没有改核心语言、译包或世界资料。
- 旧 Mirror 安装入口对新源码在任何写入前明确拒绝。Next 先正常关闭世界并核 23 个锁、精确 PID/端口/dataPath、任务已装 `0.2.0` 两文件哈希，再无备份更新这两个文件；未编辑世界数据库。

## 已执行检查

| 检查 | 结果 |
|---|---|
| 局部结果对齐及语言会话测试 | 7 PASS / 0 FAIL；覆盖按 ID 优先、范围回退、文档 UUID 保留、`zh-CN` 下 `cn` 回退与会话缓存。 |
| 模块 typecheck | PASS。 |
| 模块 build | PASS；`dist/module` 仅 `module.json` 与 `scripts/index.js`，manifest 为 0.2.1，ZIP SHA-256 `C3A4EA4B65FE1E80E8953CD8ED80EFD824C40A7C750713396E3663E56D696601`。 |
| 旧Mirror安装入口无apply预览 | 按预期提前拒绝0.2.0；没有安装或备份。 |
| Next 更新与重启 | PASS；[停服前门禁](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/babele-next-20260928/pre-update-gate-0.2.1.json>)、[两文件更新回执](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/babele-next-20260928/update-receipt-0.2.1.json>)；新 PID 39832、唯一 loopback 30002、原世界 14.368/dnd5e 6.0.2。 |
| 模块启用与真实表格 | PASS；普通模块管理显示 0.2.1 勾选、84 active。Wild Magic Surge `@Embed` 为 25 行中文，范围 1—4 至 97—100；[Chrome 截图](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/babele-next-20260928/wild-magic-embed-0.2.1.png>)。Confusion Behavior 为 5 行，4 行中文文本与一个“基本方位” `content-link`；该链接 `data-uuid` 为 `Compendium.dnd-players-handbook.tables.RollTable.phbgenCardinalDi`；[Chrome 截图](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/babele-next-20260928/confusion-embed-0.2.1.png>)。 |
| 源表与错误边界 | 原始 Confusion Behavior 表在一次嵌入渲染后仍显示英文，符合只改显示预期；未做重复打开后的源资料逐字哈希。当前 Chrome 日志未见本模块警告；有 2 条旧类 Pixi 调用栈溢出，不能称全世界零错误。 |

## 下一道真实验收

当前三个代表性 UI 场景已经通过，后续仅补重复渲染后的源资料对照与受影响的错误复查。此轮浏览器由主任务通过官方 Chrome 接口执行，因为宿主未提供给既有独立 Luna 任务发消息/接收回调的线程工具；不能记作独立任务报告，也不能把模块通过扩写成 ServerNext 全迁移通过。

本轮结束时 GM 已正常登出，但设置页和主菜单的 Return to Setup 在重新登录后均未关闭世界；[11:23 状态回执](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/babele-next-20260928/post-e2e-service-state.json>)仍为 PID39832、`active=true, users=0`。未强停服务、未编辑运行中的世界数据库。本轮 Foundry 测试服务从10:37持续到11:23，超过项目约定的30分钟短时上限；后续不得把继续运行当作新的测试时长或在世界仍活动时离线安装。

待判断本地化：此项是本团必要补丁，除非后续Babele正式版在同一目标原生证明中文结果。新候选复查从Babele正式发布、目标Foundry方法/模板、中文译包与真实客户端渲染开始；版本声明和测试通过都不能替代运行验收。
