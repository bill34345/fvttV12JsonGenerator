# 死亡天使：2026.08.06 CHM 新来源试验

当前状态：**本次死亡天使的来源链、实际卡面／普通投掷／独立次数，以及普通模块恢复重载全部通过**。范围限原生基础操作与完整GM规则共存；原冻结候选的第一次试验失败，不称新来源盲测首轮成功。法术部分只配置三个独立 GM 使用记录，原生 Cast 未实现。

来源为本地《DND五版不全书》26.08.06 的 `其他/beyond drops/26.6/死亡天使.htm`，GBK HTML 原件 SHA-256 `146bf3efda5dda6427d55c9dc85602134910321cd4ea3b4183c1bbf11fcd12d6`。原文为中文，英文名称来自同一页，保持 source 语言，不额外翻译。证据根为现有 Forge 工作树 `.local/forge-angel-of-death-chm-20261016/`；未提交、合并或推送。

## 真实试验与修复

- f358 未修改候选在来源切分阶段报 `UNLABELLED_MECHANICS /source/913`，HTTP0，无候选或卡片。`normal-deepseek-run-2/` 原件保留。run1 为行尾哈希前置守卫失败，同样无模型调用。
- 修复中文闭合粗体标题与数字标签、基础枚举、数据行类型锚定；背景“巨型镰刀”不再覆盖中型天族。支持来源明确同值近战／远程、单份骰式的类型择一，以及明确每项 N/日的 GM 使用记录。无怪物名称机制分支。
- `normal-deepseek-run-3/` 使用现有正式 provider factory → generation workflow，实际 DeepSeek 请求1次、零重试／修复；来源核验、正式生成、package 准备与父任务18项逐源核对通过。不是浏览器来源输入／连接配置完整 E2E。该来源已用于修复，不能标 blind holdout。
- `verify:intake` 使用真实提交的 LF 文本、同一 IR、正式 Markdown 和 Actor 返回 accepted/findings空；第一次误传 raw CRLF 的失败保留，没有改 IR、来源内容或最终 JSON。`verify:actor` warnings/sourceIntegrityErrors均空。

## 需要在真实卡面确认的结果

| 来源要求 | 生成结果／运行边界 |
| --- | --- |
| 中型天族，中立，AC19、HP187(25d8+75)、CR14、XP11500、PB5 | 正式字段一致；六属性22/22/17/16/20/15，敏捷豁免+11、感知豁免+10，先攻+11，洞悉与察觉+10 |
| 步行40、飞行40、真实视觉120、被动察觉20；抗性／免疫／语言 | IR、正式字段、实际原生卡面与客户端导入读回一致 |
| 刈魂之镰+11；触及10或射程120 | 同一武器 Item 下 melee/ranged 两个 Activity，远程范围显式override120，均使用明确共同能力与伤害 |
| 2d8+6挥砍，加3d8暗蚀或光耀，由天使选择 | base2d8+属性6；追加仅一份3d8，types=[necrotic,radiant]。原生伤害对话框已分别选择暗蚀／光耀并正常投掷 |
| 此攻击降至0HP后CON18，失败死亡／囚魂 | 完整GM条件与后果，无无条件Save／效果；本怪物没有新增无条件豁免范围模板 |
| 三项法术各自1/日 | 同一施法Item下三个明确命名的“GM施法记录”，各Activity uses1/day、activityUses自身消耗，父Item无共享次数。正常分别使用死亡法阵和位面转移后，spent为1/1/0、剩余0/0/1；刷新和父任务独立Mirror原生读回一致。day/recoverAll为来源与源码／结构核对，未重复测休息框架 |
| WIS施法、DC18、免材料、易容24h、迷踪步免所有成分 | 同一完整GM正文保留。Actor施法属性未填、未解析法术UUID或实际Cast；不能声称默认法术等价实现 |
| 魔法抗性、三次多重攻击、附赠迷踪步 | 来源全文保留为GM能力，不伪造额外攻击、法术效果或棋子移动 |

验收仅看来源字段、卡面、正常投掷、类型选择和独立使用次数；不重新测试 Foundry/Midi 的命中判断、DC成败、扣血或休息框架。旧卡、旧修改与失败原件保持。

## 防回退与构建

本轮74项基础操作、212项分步来源、132项parser、287项generation、77项raw contracts、554项正式encounter检查通过；typecheck、anti-overfit72来源通过。架构检查先捕获新增type-only循环，移回action领域类型后通过；类型边界调整前后16个业务文件逐字一致，复用真实模型和行为证据，不重复请求。手册已按用户可见结果与边界更新。

纯业务 index SHA-256 `c1f83ded37e26257cc36ed8fe0e445c8caf8d83b15a4170aacf7910d6b47a17b`，离线ZIP `2296805bbed16dbc48cf0820f25da22f61e6257d2e24cc420e8ea61deb29ee1a`，未发布。之前接受ZIP已以确定性字节重建并与原SHA `96b066…` 完全一致，存于 `native/accepted-before-chm-0.5.1.zip`；构建清理dist的事实和重建方法保留，未触碰旧失败原件。

Mirror `14.368/dnd5e5.3.3/cor-cotn/30001` 的PID39712、运行者和dataPath均在安装前核对；不重启服务、不触碰生产。原生验收完成后，两个精确拥有的临时文件已移除，HTTP均404；模块恢复16个纯业务文件并与构建逐字相同。最后普通入口重载也已通过。

## 实际浏览器与父任务复核

实际独立执行聊天仍为用户指定的Luna/medium，Chrome3/tab651345940。原“无app terminal不能验证模型”的阻断收据保留；父任务通过该聊天自身的session_meta/latest turn_context核清实际模型、effort与权限，执行器续轮再次核验后完成原批次。没有更换浏览器或安全执行通道。

普通审核仅导入一张新Actor `e7cf8d4533d0ef35`，名为“死亡天使 (Angel of Death)”；linked测试Token `TqjrZnByznHmbypR` 保留在既有inactive场景 `mEKTcvdeHtjVkmUc`。五个来源Item均保留。同一魂镰的近战／远程普通UI投掷分别成功；追加伤害分别选择暗蚀／光耀，都是一份3d8，没有将择一写成两份相加。两次独立GM法术记录分别正常扣次，刷新后保留。无目标，不点击Apply，不执行CON18或处死／囚魂测试，不测试法术结算。

执行器保存 `native/browser/before-use-readback.json`、`after-use-readback.json` 与 `after-reload-readback.json`，这些为从正常helper可见DOM读取后的精简字段收据，不伪称完整原始Actor／聊天导出。父任务亲自查看交回标签中的新卡截图与AX，确认+11、2d8+6／3d8、AC19、HP187、属性及五Item；随后通过只读Mirror MCP独立取得完整原生魂镰与施法Item系统数据，保存 `native/mirror-*-readback.json`，确认双模式、类型选项、条件Save未执行及三项spent1/1/0。

执行器及父任务均实际查看卡面像素；当前截图未导出为本地文件。执行器本轮console为NOT_CAPTURED，不称零错误。旧Actor/Macro指纹差异为空、worldTime21085811与activeScene `EBJYd289N5uyTmlC` 均与基线一致；所有新旧卡与测试Token、原始失败和模型证据继续保留。

最后纯业务重载收据为 `native/browser/final-ordinary-client-restoration.json`：同一Chrome标签刷新后辅助按钮消失，普通生物与物品工作台分别正常打开／关闭，无输入、生成、模型请求或业务写入。正常角色目录重新打开新卡，攻击列、类型选择及0/1、0/1、1/1次数保持；新卡在原标签保留供用户查看。

本次重载观察到 `AI Map Generation service failed to start ... Check ComfyUI installation` 通知，两个Forge工作台仍可打开。这里只记录实际通知，不对该独立地图服务做诊断或重启，不声称整个世界console零错误。工作树HEAD仍为原 `f79c25f…`、索引为空，未提交、合并或推送。
