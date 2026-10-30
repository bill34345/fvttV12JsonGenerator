# FVTT 工具合集 · 统一操作手册

这是合集的只读手册入口。GM 可以在 Foundry 内搜索工具用途、阅读准备与步骤、查看版本限制和原始说明；既有工具仍独立使用。

## 打开与阅读

1. 在当前世界的模块管理中启用“FVTT 工具合集 · 统一操作手册”。
2. 以 GM 身份打开 **游戏设置 → 配置设置 → 模组设置 → 统一操作手册 → 打开手册**。
3. 按用途浏览，或输入关键词搜索。打开条目后使用“开始前准备 / 操作步骤 / 产物 / 适用范围 / 原始说明”定位。
4. 窄窗口可使用“目录”按钮打开分类。主题按钮只改变当前手册窗口，不保存 Foundry 设置。
5. 复制命令只取得文字；浏览器限制剪贴板时，界面会选择命令并提示 Ctrl+C。手册不执行命令，也不启动其他模块操作。
6. 工具列表和条目显示当前世界的“已启用 / 未启用 / 未安装 / 状态未知”及实际安装版本；“刷新状态”重读当前客户端。安装或启停模块后，按 Foundry 提示重载页面。

重复打开会聚焦同一个手册窗口。关闭/重开或重绘会释放旧监听器和待执行搜索；复制的异步结果不会修改已关闭或替换的内容。

## 当前范围

- 技术模块 ID：`fvtt-suite-console`，版本 `0.3.0`。
- 窗口代码只接纳精确 Foundry `14.368`；运行结果以本批执行总账为准。它不调用 dnd5e 数据接口，不把阅读条目视为对应工具已兼容。
- 入口与公开 API 都要求 GM。手册正文是随包快照，阅读无需 AI、CDN 或在线搜索。
- H3增加只读安装/启用状态与首个Deck可选帮助消费者；后续本地候选已接通框选Token同步、法术解析器和聊天内存保护的可选帮助，实际接受范围仍按各条目说明。工具启动按钮、收费与公开发行继续按后续计划。
- Deck面板/副屏工具栏的“帮助”会定位本手册的Deck条目；合集停用或接口不可用时，Deck使用自己的随包说明，继续独立使用。
- 模块启用是安装准备，会改变正常模块配置。打开、浏览、搜索、主题与复制本身不写世界文档或 Foundry 设置。
- Foundry 模块 ZIP 使用用户条目投影；完整 `工具手册.html` 在 release 目录独立交付，不进入模块 ZIP。两者均由同源手册构建。

## 开发与构建

在仓库根目录使用根 README 指定的本地开发运行时 Bun 1.3.14：

```powershell
bun run test:suite-console
bun run build:suite-console
bun run release:suite-console
bun run verify-release:suite-console
```

构建先检查手册人工 review 是否有效，再导出 Foundry 投影，把正文编入浏览器脚本。模块产物位于 `foundry-modules/fvtt-suite-console/dist/module`；`build-identity.json`记录投影、正文、脚本、样式和离线 HTML 身份。在仓库根目录运行 `bun run release:suite-console` 会生成确定性模块 ZIP、独立 manifest、独立完整 HTML、校验和与本地交付候选清单；它不安装模块、不访问世界。

当前本地验收只使用已核对的 ServerNext。Forge占用的5.3.3 Server Mirror不能被安装器、浏览器或服务操作触碰。首次安装复用根 `foundry:ops lab install-server-next-owned-module` 的预览/拒绝覆盖门禁，已有目标不会自动替换。没有备份、自动推送或生产安装。

完成构建、目标与运行者核对后，首次安装预览为：

```powershell
$env:FVTT_OPS_LAB_ROOT = "F:/FoundryLab/foundry-v14"
bun run foundry:ops lab install-server-next-owned-module --module-id=fvtt-suite-console --version=0.3.0
```

在本次本地测试安装授权范围内加入`--apply`才写入新的模块目录；预览、安装文件与菜单启用/运行接受分开记录。已有目标拒绝覆盖，候选更新须先核对本任务已安装完整树及维护范围。

内容维护规则见 [手册维护](../../docs/runbooks/handbook-maintenance.md)，计划与实际验收见 [统一手册子计划](../../docs/plans/2026-10-11-fvtt-suite-refactor/modules/fvtt-suite-console.md)。

## 可选帮助 API

GM 可调用 `game.modules.get("fvtt-suite-console").api.openHelp({entryId, section})`；`entryId`是稳定手册 ID，`section`可选prepare/steps/outputs/limits/sources。未指定条目时沿用窗口当前页。`closeHelp()`只关闭手册。可选消费者先检查模块已启用、api.moduleId和`apiVersion===1`及函数存在，再调用公开接口；Deck及上述本地候选均保留独立说明。框选Token同步与聊天内存保护的玩家入口直接使用本模块随包说明，不调用GM-only合集窗口。
