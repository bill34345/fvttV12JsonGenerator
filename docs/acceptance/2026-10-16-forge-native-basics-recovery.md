# Forge 原生基础操作恢复：本轮限定验收

本轮来源与原生功能 **PASS**：复杂规则不再使已核实的普通攻击、伤害、豁免、范围与资源整体降成纯文字。真实 Steam Mephit 中文卡、保存 Cloaker 的正式重放和原生卡面、实际正常掷骰，以及锥形／自身中心半径模板均已有证据。整体 Forge 的任意来源首次成功率仍为 Partial。普通模块文件与最终浏览器重载收尾均已通过。

工作树为 `I:\OpenCode\fvttV12JsonGenerator-worktrees\20261006-111625-bettermonsters-eye-deep-sample`，分支 `codex/20261006-111625-bettermonsters-eye-deep-sample`，起始 HEAD `f79c25fbac747a7e08f98c48779f052c3db68599`。以下证据路径均在该工作树 `.local/forge-native-basics-20261016/` 下。未提交、合并、推送、重启服务或操作生产。

## 验收结果与边界

按用户直接纠正，Mod负责来源正确的原生字段、卡面、正常掷骰入口和效应范围；Foundry／Midi的命中、豁免结果比较、伤害应用和HP结算不列为本轮重复验收。Forge自己实现的状态或控制器仍按其功能验收。复杂能力的原生部分与完整GM剩余规则共用Item，不把听觉、排除种类、附着、幻象等条件变成无条件效果。

| 来源 | 本轮核对的原生结果 | 关键证据 |
| --- | --- | --- |
| SRD5.1 Steam Mephit，真实正常DeepSeek生产链及中文批准导入 | Claws+2、1d4挥砍加1d4火焰；Breath DEX10、1d8火焰、成功减半、15尺锥形、充能6；Innate1/日。Death Burst完整触发规则保留GM | `normal-deepseek-run-1/receipt.json`、`parent-source-review.json`；`browser-native-steam-v2/before-gameplay-readback.json`；`browser-native-gameplay-v2/steam-claws-result-r7.json`、`steam-gameplay-results-r8.json`、`steam-breath-controlled-save-r9.json` |
| 保存SRD5.1／2014 Cloaker，当前正式重放及正常导入 | Bite+6、2d6+3穿刺、触及5；Tail+6、1d8+3挥砍、触及10；Moan WIS13、自身中心半径60；Phantasms1/1、短休恢复、消耗1；附着／恐慌／幻象规则全文保留 | `saved-replay-r3/`；`browser-native-gameplay-v2/cloaker-native-card-r11.json`；`native-area-v3/parent-imported-moan-r13.json`、`r14-native-area-result.json`、`parent-radius-adjudication.json` |

真实DeepSeek新来源运行有5次HTTP请求，均成功，首轮原始回复与产物保留。使用既有正式provider factory/generator的本地runner，再走真实浏览器审核、中文批准及导入；**不是完整浏览器来源输入／连接配置E2E**。范围修订为保存来源重放，无额外模型调用；当前代码重新接受了实际Steam来源包与原DeepSeek中文草稿，不靠重发请求刷成功。

主控亲自查看了Steam实际卡片像素、用户两张截图、来源PDF和生成结果，并独立通过Mirror读取实际原生字段。同一独立Chrome执行器为Luna／medium聊天 `01a142ad-0656-79f1-80ea-975431d99aa4`，实际turn_context已核对。浏览器确实查看了图像；没有导出本地截图的步骤明确记录为null。

## 修复范围遗漏，并核清原生尺寸

主控在r11后发现Moan只有range60/ft，没有模板；官方5.3.3 `cloaker.yml`为self/radius60。新增回归先得到4FAIL，再修复来源绑定的自身中心半径；其他点／目标／盟友中心不猜成自身，verifier拒绝形状、尺寸、单位和自身起点漂移。

r14从新Actor `ec401f2668e39a0b`、唯一选中Token `F2chWVoyNPexOiVA`正常使用Moan一次，生成模板 `VZKBNcubAjab6ge0`，刷新后保留；没有点击目标Save或结算战斗。模板来源绑定相同Actor、Item、Activity及Token。

执行器因中心距离65.000001尺最初判为Partial，该原报告保留。主控比对实际安装与锁定5.3.3的 `module/canvas/ability-template.mjs` 后修正判断：radius设置adjustedSize=true，原生公式为 `baseDistance + max(token.width, token.height) × grid.distance / 2`。大型Token宽2格，每格5尺，所以**中心距离65尺，自占格边缘向外仍是60尺**。1300.00002像素与此一致；没有改几何数据或重复使用能力。安装sourcemap中的该文件与锁定源码规范化后逐字相同。见 `native-area-v3/installed-template-source-match.json`、`parent-radius-adjudication.json`。

## 防回退与保留

65个定向回归、207个分步测试、287个生成器测试、554个整合测试通过；package类型检查及9个受影响来源的anti-overfit通过。此前未受范围修改影响的旧Save／资源／TE／CC局部检查结果复用，不称全仓CI或完整旧状态运行矩阵本轮重测。手册已人工核对范围与验收边界并生成页面。

初始缺基础操作、范围4FAIL、r12测试工具缺空translationReport被正确拒绝、r13无法可靠选中重叠Token的记录全部保留。工具故障没有抹去已通过的生成／导入证据；r13以后只修临时测试工具，业务包与来源未改。

旧坏中文Cloaker `de90efe95ace5d75`、前一恢复卡 `3880ed5710d6d2ab`、真实中文Steam `e3ed422dba6afee5` 和范围修正版 `ec401f2668e39a0b` 全部保留。旧Actor／Macro指纹差异数组为空；worldTime仍21085811，activeScene仍 `EBJYd289N5uyTmlC`。只查看独立测试场景，不切换世界activeScene。保留测试Token、模板、原始失败和证据。

最初4个、本轮2个辅助文件均按安装清单移除；普通模块16文件与业务构建匹配，辅助URL为404。纯业务index SHA-256为 `f358aa3c48d82d88a9dbcd8f51945e42c51f4b07905bb29a167918469439bf2d`；ZIP为 `96b06621705948a13b79e51b8bab29e20f0e472eb100511c192256df3be3c968`，未发布。旧接受边界ZIP和失败构建保留。

r15在同一Chrome标签刷新后确认全部测试按钮消失，普通Forge生物／物品入口及两个工作台均能正常打开和关闭，浏览器错误列表为空；没有输入、生成、导入或世界文档写入。最终回执为 `native-area-v3/r15-client-restoration.json`，用户页面继续保留并已标记handoff。该纯模块重载不要求重测已通过的原生功能。

## 明确限制

保证限来源绑定语法与本轮样例，不代表任意PDF首次成功或复杂规则全自动化。规则版本元数据仍继承既有模板／世界设置，未新增按原文自动判断2014／2024；不改写保存原文，也不把用户MM2024截图的不同数值套到SRD5.1。原始PDF断词连字符继续保留在作者英文中，未为显示清理而改写来源。自由译义仍须GM核对。
