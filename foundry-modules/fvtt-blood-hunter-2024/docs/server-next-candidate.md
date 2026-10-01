# ServerNext dnd5e 6.0.2 候选边界

**2026-09-26 最新结论（以下旧ZIP、PID和待验描述是历史过程）：**旧人物更新已在合成测试人物上完成留底、副本、原人物应用、再次预览0更新和重载。正式来源构建修复了2级官方战斗风格缺项，仅新目标增加原文“战斗风格”基础特性，特性数77（旧目标76）；最新ZIP SHA-256 `33FEAE2507820423FC92921F509BC4ED4D40F5A685F4545223A2A699549169F8`，世界关闭、锁释放后只替换本团包，18文件匹配。新测试人物正常升2级，五个风格全出现并选择箭术；烈焰血仪实际扣血3，匕首火焰附魔重登保持，伤害掷骰3穿刺+4火焰。临时棋子清除，原场景棋子保留。完整证据见[新人物修复与实用](../../../docs/reviews/2026-09-26-blood-hunter-new-character-fighting-style.md)。本轮关键行为通过，不代表全部高等级能力。

历史快照（2026-09-25，当时尚未完成验收）：`MODULE_BUILD_PASS`、`INSTALLED`、`RUNTIME_PARTIAL`。旧 Lab 安装器仍精确指向 server-mirror，不用于本轮；当时的候选已在世界关闭时离线装入 ServerNext，游戏里看到职业1/子职4/特性76。当前精确目标已换为上方77特性修正版，旧人物更新和指定关键行为的最终结果以上方2026-09-26结论为准。

2026-09-23 从 ServerNext 已安装 dnd5e 6.0.2 的 `feats24`、`equipment24` LevelDB 只读副本核对，现有 12 个外部 Item UUID 全部存在，且 Fighting Style 四项和 Epic Boon 的 subtype 符合原引用用途。未对正在运行的 pack 或世界写入。已安装 `dnd5e-compiled.mjs.map` 显示 Advancement 基础字段为 `name/img`，ItemChoice pool 条目为 `{uuid, sort?}`，旧 `title/icon` 与字符串 pool 由其迁移函数转换。该 source map SHA-256 为 `E266E1A748F97A538144E55D9E66BCFEE4AAF2B664AA8F7F25759FFBB5C80C99`，`system.json` SHA-256 为 `2EB8B17F71F8CD84229C5ECB9C21E50F763DEF4A730F58BA3239AF6A25DB60A2`。package 候选直接生成新形态，并通过双目标校验；旧目标的编译输出保留。

2026-09-24 又从 dnd5e [官方仓库](https://github.com/foundryvtt/dnd5e)克隆 `release-6.0.2` 到 `F:\FoundryLab\reference-cache\dnd5e\6.0.2\repo`：HEAD 精确为 `c9f6f2d37e7f5dd87bb007c577e829338e9d4ce9`，`system.json` 为 6.0.2，Git 工作树 clean、6,679 个 tracked 文件、23 个 `_source` pack 目录。七个 equipment24 和五个 feats24 外部 Item ID 在 `_source` 各有**唯一** `_id` 定义；逐 ID 路径与 SHA-256 已落盘到[参考源码证据](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/blood-hunter-reference-source-20260924/reference-source.json>)。这补齐了**参考源码可用性**，但 `_source` 原始 YAML 保留部分旧字段形态，不能替代已安装 dnd5e 6.0.2 DataModel/source map 证明新 schema，也不代表模块已构建。

2026-09-25 用户授权只读检查 `F:\FoundryLab\foundry-v14\data\server-mirror\Data\assets\homebrew\blood-hunter-2024.activities.json` 这一份精确旧源。文件 492,145 字节，SHA-256 与锁定值 `3526E4F2F28A81052843D0FFE71FCCA54F49015E2AB5037F7F1DA7423BE6FB65` 一致。没有修改 Mirror。构建器新增显式 `--target=server-next`，使用该原始字节及 dnd5e 6.0.2 参考源生成三包确定性 ZIP；**当前** SHA-256 `984BC729EB08D2963F3B52F26935805C534C9E906056ECD96DB1A77B4FAACC5C`，logical hash `ec7406ab9afa41882f576bc4b0c4aad1676ea5cc3add2d28d3ad4a58b11ef512`。输出有 1 个职业、4 个子职、76 个特性、94 条审查记录、117 个动作。新目标把60项Advancement形状及58个Effect中的72条变化投影为目标字段；4个ItemChoice已转换，授予图与覆盖记录保持原来源语义。游戏内容包与人物迁移文件的81个最终文档逐项相同。

独立审查发现最初候选在转换 Advancement 后未更新职业和四个子职的逐条内容指纹，旧角色预览会误判为无需升级。现已随投影重新计算这些指纹，并增加“旧职业/子职 → 新契约需要更新、更新后再预览保持不变”的回归。旧 ZIP 指纹 `2D008052...` 已失效，不能安装。

随后查出上一个 `88134EDE...` 构建的三个游戏合集包已把 58 个效果的 72 条变化写入当前 Foundry 要求的 `system.changes`，但浏览器人物迁移所读取的 `migration-contract.json` 仍把它们放在旧的顶层 `changes`。当前 14.368 核心的 ActiveEffect 顶层 schema 没有 `changes`，dnd5e 6.0.2 的效果应用代码读取 `effect.system.changes`；故旧迁移契约不能用于角色搬迁。现已让迁移契约与合集包使用同一效果投影，并对**真实构建**逐条比较：81 个文档完全相同，58 个效果全部有 `system.changes`、没有顶层 `changes`，共 72 条变化，117 个动作保持不变。`88134EDE...` 也已失效，不能再安装。

独立复核又发现 `733AC969...` 的效果已转换，但特性自身的内容指纹仍是转换前的值。真实源的效果专用特性“幻惑”（ID `05f48e10ec753fab`）会被旧人物预览误判为无需更新。现已在最终效果投影后重算每个条目的内容指纹，并让入包 Item 与迁移契约使用相同最终文档。锁定真实源的专项检查显示“幻惑”首次预览为 `update`，模拟应用后再次预览为 `keep`；指纹由旧 `52d1f967...` 变为新 `08179fa4...`。`733AC969...` 也作废，只有上文当前 `984BC729...` 是新候选。

当前代码的 package 19 项、模块 28 项测试（真实源专项检查已启用）及两处类型检查通过。主任务先在 ServerNext 装入早期候选；审查发现迁移数据的效果旧字段和内容标记问题后，正常关世界并核23锁，精确停PID67768，只替换本任务新装的模块目录为最终ZIP `984BC729EB08D2963F3B52F26935805C534C9E906056ECD96DB1A77B4FAACC5C` 对应的18文件，逐个核对，再以PID69192恢复原世界。**最终修正版已安装，但目标世界内旧人物更新、动作和效果尚未完成验收**。游戏核心 schema 对照只能证明旧字段会被忽略，不能替代真实人物验收。当前 dnd5e 6.0.2 的基础及 `damage/save/enchant/heal/utility` Activity schema 仍接收本包使用的核心 `activation/consumption/description/duration/effects/range/target/uses` 和各类型专属字段；Midi 与 Item Macro 扩展字段的实际执行依赖目标世界内验收，静态检查不能替代。
