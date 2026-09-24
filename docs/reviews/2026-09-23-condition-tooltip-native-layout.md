# CoTN 自定义状态与伤势悬停卡视觉对齐

日期：2026-09-23。目标环境：server-mirror 的 `cor-cotn`，Foundry 14.364 / dnd5e 5.3.3，Token Action HUD Core 2.1.1 / DnD5e 2.1.0。

## 截图问题与分层结论

用户对照的原生“受擒 Grappled”悬停卡是浅色规则卡：标题靠左、状态类别在右、正文在下。此前 Custom Conditions“无助”卡则是黑色效果面板，64px 图标居中、标题下移，底部重复“无助”，正文夹有未译的 `Critical Hit`。**这项视觉效果在此前组合验收中没有通过**；名称/描述存在和 DOM tooltip 配置通过，不能代替规则卡外观验收。

本地精确版本的 dnd5e 模板 `Data/systems/dnd5e/templates/journal/page-rule-tooltip.hbs` 使用 `content → header(h2 + pill.condition) → description`。同版本 `dnd5e.css` 的 `.effect-tooltip` 将提示框固定为300px、图标64px且居中；`.rule-tooltip` 则限制最大450px并分开左右标题/类别。TAH DnD5e 对有规则文档引用的原生状态使用 `rule-tooltip`；本模块没有伪造系统规则文档，而是在已有 `tokenActionHudCorePreRender` 扩展入口中提供自有说明。

Foundry 14 的 TooltipManager 默认添加 `theme-dark`，原生 dnd5e 富提示渲染另行移除该类。本模块直接提供 HTML，追加 `theme-light` 不保证清掉黑底。因此两个模块各自使用限于自有 tooltip 标记类的纸纹、金色边框和深色文字变量；不修改 Foundry、dnd5e 或第三方 TAH 的源码和全局样式。

## 候选变更与权限边界

Custom Conditions 的完整提示改为同一规则卡结构：中英双语标题（仅翻译不同的语言下并列）、本地化状态类别、已转义正文及可选骰式。提示框内不再重复状态名或放大状态图标；图标仍显示在 HUD 按钮。中文说明中的 `Action`、`Bonus Action`、`Reaction`、`Critical Hit`、`Speed`、`weapon attack` 改用与本地 dnd5e 中文术语一致的表达，保持原规则含义。伤势模块的完整提示采用相同标题/类别/正文结构；原有伤势层数事实和 HUD 角标不变。两模块仍尊重 TAH 的 `full`、`nameOnly`、`none` 设置。

候选只修改当前开发 worktree 中的两个自有模块、各自聚焦测试及同步文档。本地 `cor-cotn` 的运行中世界 LevelDB、真实角色、其他模组、serverNext 30002 和生产均不属于此视觉修订的改动范围。现成 SVG 的选型、许可与包内署名见 [现成状态图标选型](2026-09-23-existing-condition-icons.md)，这次没有新绘制或替换图标。

## 验收状态与复查

聚焦测试已核对规则卡类与层级、无提示框大图标/重复名称、中文及英文、HTML 转义、骰式与角标、三个 tooltip 模式。Custom Conditions **56 PASS / 0 FAIL**，伤势模块 **81 PASS / 0 FAIL**；模块类型检查、两个模块构建及 `git diff --check` 通过。Astra 只读复审指出残留 `theme-dark` 会使状态 pill 成为深底深字；已在 Custom Conditions 的专属 marker CSS 中补浅色卡底与 pill 边框变量，复查后无剩余源码阻断项。这些结果不替代真实视觉。

安装前再次核对30001 PID32196、`--dataPath=F:\FoundryLab\foundry-v14\data\server-mirror`、`cor-cotn`、Foundry14.364/dnd5e5.3.3及独立30002。按相同 manifest 和逐文件哈希，仅更新两个自有模块：Custom Conditions的 `lang/zh-CN.json`、`scripts/index.js`、`styles/custom-conditions.css`；伤势模块的 `scripts/index.js`、`styles/module.css`。预览和前后SHA-256见 `F:/FoundryLab/foundry-v14/evidence/condition-tooltip-20260923/update-preview.json` 与 `update-verified.json`。两个 `verify-install` 均通过；30001仍常驻CoTN，没有改LevelDB、重启服务、创建备份或触碰30002。

两次独立 Chrome 预检因服务短时离线和连接状态变化未执行视觉项，原始阻塞记录保留在 `F:/FoundryLab/foundry-v14/evidence/condition-tooltip-20260923/chrome/`。主任务核对数据目录没有活进程或监听后，以原 Node24.17.0、Foundry14.364和连续的`--dataPath=F:\FoundryLab\foundry-v14\data\server-mirror`恢复常驻30001；启动及校验见同目录 `service-recovery-20260923-145202/launch.json`、`verified.json`。没有触碰30002。

恢复后的 GPT-6 Luna 独立 Chrome 任务在真实CoTN的77项启用模组组合中完成**视觉 PASS_WITH_LIMITS**。原生 Grappled、自定义 Helpless、伤势三张卡均是浅色纸纹、左标题右状态标签、深色正文、2px金边，且提示框内图标数均为0。三者的背景为`rgb(241,235,232)`并加载dnd5e的`texture-gray1.webp`/`texture-gray2.webp`；正文为`rgb(25,24,19)`，正文对纸张计算对比度15.06:1，标签文字对底色16.25:1。Helpless显示“无助 Helpless”与“任何命中你的攻击均视为重击。”，不再夹原来的`Critical Hit`。首轮伤势卡正文仍含`episode`，这是随后单独处理的中文文案缺口，不能把首轮截图说成已汉化。完整/仅名称/无提示三档经UI切换并恢复`full/1500ms`；伤势2/3、Jinxed4、Valor6角标在实际HUD仍可见。测试Actor`ZKA7fkMG357hnKZa`及Token`K79FBgnaaMoKKejT`已通过Foundry UI清理，返回暂停的`landing page`；30001保持常驻，中文与IFS internal/已启用/复活提示开/管理NPC关及77项组合保留。

证据文件：`F:/FoundryLab/foundry-v14/evidence/condition-tooltip-20260923/chrome/recovered-visual-20260923-154230.md`及同名JSON。截图仅在外部Chrome任务的CUA会话内联，工具没有提供本地截图保存接口；报告保留了DOM类名、计算样式、尺寸、文本和清理ID。纯移动鼠标、不点击的独立悬停动作仍是 **NOT_EXECUTED**；该工具没有单独的pointer-move操作，点击后指针停留产生的可见规则卡作为视觉证据单独记录。

中文文案收尾：仅将伤势状态说明中的两处 `episode` 译为“伤势过程/这一过程”，不改变状态机或其他文字。伤势模块聚焦测试现为 **82 PASS / 0 FAIL**，含读取真实中文语言包并检查触发与恢复语义的回归；类型检查和构建通过。确认server-mirror仍是PID13956/CoTN后，只更新伤势模块 `lang/zh-CN.json`，Custom Conditions逐文件哈希不变；预览与前后哈希见 `F:/FoundryLab/foundry-v14/evidence/condition-tooltip-20260923/injury-copy-20260923-154723/update-preview.json` 和 `update-verified.json`，两模块 `verify-install` 均通过。后续同一GPT-6 Luna外部Chrome任务重载CoTN，在真实TAH伤势动作的完整 tooltip payload 中读到“开启一次伤势过程；在这一过程中恢复到正生命值会增加1层伤势”、类别“状态”和0/3角标，没有`episode`；服务、中文、77项组合、IFS internal及TAH full/1500ms保持，页面留在暂停的`landing page`。证据为 `F:/FoundryLab/foundry-v14/evidence/condition-tooltip-20260923/chrome/injury-copy-followup-20260923-160015.md` 及同名JSON。此次窄范围文案读回没有新拍悬停卡截图，纸纹外观仍依据前一轮真实视觉证据，不能把DOM payload读回当成一张新的视觉截图。

新候选复查：先核对锁定版本的系统模板、CSS、TooltipManager 与 TAH 扩展接口；若系统升级，重新比较真实渲染和类名，不能凭当前版本的静态检查推断兼容。本文不评价新的第三方模块或本地化候选；模块健康状态继续以 `docs/acceptance/foundry-v14-module-health.md` 的实际运行证据为准。
