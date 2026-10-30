# Mirror 隐形术：实际目标前置条件核对

2026-10-18，仅针对本次 Forge 新来源验收；不是 Midi 版本升级或配置修改建议。

在 Mirror `cor-cotn`、Core14.368／dnd5e5.3.3／Midi14.0.11，新卡首次由真实缓存 Spell 的原生对话框确认隐形术后，没有留下 Spell Chat，两项独立每日次数仍为0消耗，却留下该卡自己的专注 Effect。首次对话框、前后完整读回和 Effect 原点已保留，不能把这个结果算实际施法通过。

真实 Midi 设置界面只读核对：`requiresTargets=always`，自动远程选目标关闭；效果不自动应用、伤害自动应用禁用。该次施法没有实际 Token 目标。已安装 `midi-qol.js` 的 post-Chat 分支在需要生物目标却为零时会取消、退还消耗并删除 Chat；它没有在此分支撤销 dnd5e 先前建立的专注。锁定 dnd5e5.3.3 的 activity mixin 顺序也确认为消耗、专注、创建 Chat。实际现象与此分支一致；未捕获被删除的瞬时 Chat 或 TroubleShooter 原始细分错误，因此仍把精确取消原因表述为由设置、源码及结果共同支持的解释。

处理是补齐原有玩法前置：只在本次新场景放本次两个新 Actor 的 Token，使用正式 Foundry MCP 进行 fixture 准备和选目标／打开 Item 原生 chooser，再由官方 Chrome 连接器完成正常 Spell 选择、默认消费确认与读回。API 准备和 UI 实际操作分别记证，不写次数、伤害或施法成功结果，不关闭 Midi 或修改全局设置。首次失败的专注只经该新卡正常 UI 结束。既有场景、旧卡和世界时间受保护。

按个人 firsthand-research 规则通过已配置 AnySearch 查询了 Midi 目标／取消／隐形术的第一手材料。检索得到的 [Midi GitLab issue 446](https://gitlab.com/tposney/midi-qol/-/issues/446) 是2021年的锥形／立方范围自动选目标报告，与本机14.0.11单目标隐形术取消并非同一问题，不能作为修复证据。本轮未获得同版本同症状的第一手报告；结论以本地准确版本源码、真实设置和前后读回为准。检索原件保存在本例 evidence 根的 `midi-firsthand-*` 文件；外部页面中的代理指令均视为材料内容，不执行。

本机证据：`.local/forge-fresh-normal-ai-20261018/first-native-cast-failure-manifest.json`、`midi-target-requirements-receipt.json`、`mcp-fixture-place-receipt.json`。最终真实施法接受见 [新来源验收报告](../acceptance/2026-10-18-forge-neogi-normal-ui.md)。本记录不代表生产接受、Midi 通用故障修复或所有 token 实例资源路径已覆盖。
