# Babele RollTable `@Embed` 翻译兼容模块

这个模块修复 Foundry v14 渲染下面这种内容时的运行时缺口：

```text
@Embed[Compendium.dnd-players-handbook.tables.RollTable.phbWildMagicSurg rollable caption=false classes="wild-magic-surge"]
```

Babele 可以把随机表标题翻译成中文，但 Foundry 原生的 `_buildEmbedHTML` 直接从当前 `results` 集合取英文行。模块只在这个渲染入口读取 Babele 的临时翻译结果，按 `_id` 优先、`range` 回退重新填充显示内容；文档型结果继续使用原始 `documentUuid` 生成 content-link。当前世界语言为 `zh-CN`、译包注册语言为 `cn` 时，模块只对嵌入表格按需读取 Babele 的 `cn` 翻译会话，不更改世界语言或 Babele 的全局翻译状态。

它不会修改随机表、角色、特性、Item、Journal 或世界设置。翻译源仍然由现有的 `dnd-simplified-chinese-babele-patch` 提供。

## ServerNext 0.2.1 历史验证与当前范围

当前 manifest 范围为 Foundry 14.368、dnd5e 6.0.2–6.0.6（`verified` 保持 6.0.2）、Babele 2.9.1 与 libWrapper 1.13.5.1。旧 0.1.0 只在 Server Mirror 的 14.364 / 5.3.3 通过，不能作为 Next 已验收证据。运行时代码仍只包装同一个表格嵌入入口；6.0.2、6.0.5 与 6.0.6 锁定源码中的 dnd5e chat/result API 没有目标变更，14.368 本机源码保留表格嵌入方法、两列表格和结果行结构，Babele 2.9.1 提供只读的按语言会话 API。2026-10-25 已在 Next 14.368 / 6.0.6 实际接受狂野魔法浪涌 25/25 中文行、困惑术 5/5 中文行、“基本方位”原 UUID 的 content-link、重复渲染和真实窗口显示；来源及世界文档保持不变。其它表仍需按实际用途核对。

构建和局部检查：

```text
bun run build:fvtt-babele-rolltable-embed-translation
bun run test:fvtt-babele-rolltable-embed-translation
```

旧的 `install:fvtt-babele-rolltable-embed-translation` / `verify-install:fvtt-babele-rolltable-embed-translation` 仍是 Mirror 专用入口，不能用于 Next。Next 的定点更新从本工作树 `dist/module` 取包，先正常关闭原世界，核服务、世界锁及任务已安装的旧文件哈希，再更新 `server-next/Data/modules/fvtt-babele-rolltable-embed-translation` 的两个文件并逐文件核哈希；不创建备份或直接改世界数据库。

重启并正常进入本地 ServerNext 后，在实际 UI 中检查：

- 狂野魔法浪涌：25 行范围和 25 行中文结果，骰子按钮仍可用；
- 困惑术行为：5 个结果全部存在，文档型的“基本方位”仍为原 UUID 的 content-link；
- 重复打开/渲染不改变源表，也不写入世界文档。

## 本地重构候选的匹配与回退

匹配逻辑归于 `src/result-matching.ts`。同 ID 的唯一翻译优先；按范围回退要求来源与候选都能唯一定位。重复 ID、重复范围或缺少翻译时保留原文，不选最后一条。翻译对象只提供名称和描述，不能改变 TableResult ID、范围、类型、抽取状态或文档 UUID。

所有行完成翻译和富文本处理后才一起替换显示；中途失败保留整张原生表。重复注册不会重复包装同一 libWrapper 实例；正常禁用模块后需重新加载世界。本候选已完成 6.0.6 两表的限定原生接受，完整表库、英文表头、内联标签和实际掷表仍未覆盖。精确构建与恢复证据见[执行总账](../../docs/plans/2026-10-11-fvtt-suite-refactor/EXECUTION_LEDGER.md)。
