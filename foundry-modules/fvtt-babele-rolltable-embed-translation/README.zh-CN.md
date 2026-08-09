# Babele RollTable `@Embed` 翻译兼容模块

这个模块修复 Foundry v14 渲染下面这种内容时的运行时缺口：

```text
@Embed[Compendium.dnd-players-handbook.tables.RollTable.phbWildMagicSurg rollable caption=false classes="wild-magic-surge"]
```

Babele 可以把随机表标题翻译成中文，但 Foundry 原生的 `_buildEmbedHTML` 直接从当前 `results` 集合取英文行。模块只在这个渲染入口读取 Babele 的临时翻译结果，按 `_id` 优先、`range` 回退重新填充显示内容；文档型结果继续使用原始 `documentUuid` 生成 content-link。

它不会修改随机表、角色、特性、Item、Journal 或世界设置。翻译源仍然由现有的 `dnd-simplified-chinese-babele-patch` 提供。

## 本地验证

```text
bun run build:fvtt-babele-rolltable-embed-translation
bun run test:fvtt-babele-rolltable-embed-translation
bun run install:fvtt-babele-rolltable-embed-translation
bun run verify-install:fvtt-babele-rolltable-embed-translation
```

安装后要重启本地 Server Mirror，并在实际 UI 中检查：

- 狂野魔法浪涌：25 行范围和 25 行中文结果，骰子按钮仍可用；
- 困惑术行为：5 个结果全部存在，文档型的“基本方位”仍为原 UUID 的 content-link；
- 重复打开/渲染不改变源表，也不写入世界文档。
