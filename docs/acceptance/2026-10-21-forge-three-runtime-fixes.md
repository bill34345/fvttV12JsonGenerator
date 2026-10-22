# Forge三项剩余实机问题：原因、修复与验收

状态：**三项行为、最终业务重载及精确清理限定PASS**。当前入口：[当前MD](../plans/2026-10-20-forge-ab-current-state.md)。

同一2024 P2法师/P3成年绿龙的冻结回复和正式包，本轮新增生成Provider请求0、不改最终JSON、不改原始首轮1/3及失败。环境为本地Mirror Core14.368/dnd5e5.3.3/Midi14.0.11、cor-cotn、80模块；只安装resolver候选ff0b315db4916ec12b40f30a29141a521fbbaa7fd5d14494b82394ac0863d3d9，Forge92a2ef738957e9e4c121ca73e31cf52eefbf8291c9bcd58097524e1968da62d4保持。未提交/合并/push/生产，未推广6.x或新来源。

## 毒雾模板与伤害显示

原因：前批主动取消模板，Midi等待必要模板；当时不能据flags里的骰数宣称正常卡面显示。当前正常UI放置20ft球Region0J5Mz25oN52tIlMd，中心1000,1000/半径约400px（100px=5ft），90ft内可见落点，精确UUID关联消息yiFxzMOmi9GPIe6Y。聊天卡实际显示2d6毒素总5、一次传奇消费，父控实际看过noxious-template-damage-visible.png。

边界：currentAction=Completed/itemUseComplete=true但suspended=true仍保留。执行器误重复Save点击产生19/20，两条原件均保留，不称一次点击完整结算；autoCheckSaves=none，独立Save不自动回填Midi。目标HP10/10、AC16/effects[]在该阶段保持，未ApplyHP，不把伤害骰值5视为成功豁免者受伤。AC−2/冷却与完整原文留GM。本轮未改毒雾生成规则、伤害骰式或全局设置。

## 迷踪步次数保存

原因：定位器fill/type两次均没有change、没有Item写请求，不能证明写后覆盖。正常重新开卡恢复3后，官方Chrome AX真实输入2/Tab产生trusted=true change，64ms内preUpdateItem→updateItem将WorldActor.fc05b24a7edae217.Item.2bGqUILwZDYvo58j.spent0→1。重开显示2/3，防护魔法仍3/3，完整重载后同Item max3/spent1保持。父控看过misty-reopened.png并独立核原生事件/数据。

没有新增产品监听器或自动消费，不通过API写目标数冒充UI保存。前批具体事件无法恢复，不倒推当时操作；当前正常提交与持久化已验证，完整GM规则/手动扣次边界保持。

## Geas提前条件伤害

原因：官方2024Geas同一Save同时带WIS豁免、Charmed和5d10 psychic；原文要求被魅惑且违令、一日每目标最多一次。Midi GM自动伤害always将这部分作为施法伤害。仅在真实5.3.3、准确owned缓存、完整条件和原生结构可证明时，保留原Save/DC/Charmed/source/全文，把伤害分到独立GM活动。Compendium、portable及最终JSON不改，背景不自动迁移。

已有混合缓存正常Resolve进入来源绑定维护Review，Keep禁用/无决定不Apply；Cancel整个Actor不变。明确Overwrite后才更新，真实人工冲突仍逐ref审核。最终同cache x4ACgU3Dypeps8Tq保留两活动：dnd5eactivity000 Save无施法伤害；73d232e2a348c419 GM伤害保留完整源条件、5d10 psychic、特殊范围、无Effect/自动链/新资源池或第二次Cast成本。原parentCast2be7916944ea486b完整保持CHA/DC17/免材料/每日1次。

实际行为：从World Actor原Cast进入，选择原Save、正常确认一次，唯一消息xJTHN2aaK2I4Ur8U无伤害配置及骰；world/synthetic父Cast均spent1/max1。Guard唯一Save XhFO7H3ZaaHKQfgY自然1，对DC17失败，未强制/重掷；未自动Charm。随后GM主动点原卡core applyEffect，准确synthetic Guard获得源EffectkBp6soz1Db06XnVv，原origin指向cache源效果、duration2592000秒=30天/statuses[charmed]；DAE伴随通用图标另记，WorldGuard.effects[]。

GM另明确裁定违令及当日首次后，从独立GM入口一次掷出Dhg5FImqdRJ9baeD=5d10总31，无额外消耗组；world/synthetic父Cast仍spent1，目标HP10/10，未ApplyHP。父控实际查看用途选择、伤害配置、完整条件与31三图。违令和每日每目标限制仍GM判断，不是自动条件执行。GM活动为特殊范围；卡底仍原法术60ft施法摘要，本轮未实际验证远距伤害或等待30天自然到期。

### 两次真实Apply失败与修复

04:26:17.860Z第一次Apply严格读回拒绝，回滚把原CharmEffect origin从所选Compendium重定到准确owned cache UUID。04:53:03.530Z诊断候选第二次失败明确为source-conditional-complete-activity /activation/condition；这次窄origin补偿已实际恢复，所报cache残差仅6个Item/Effect创建/修改时间。两份failed-native、原日志和中间测试失败全部保留，不编造未取到的stack。

原生只读constructor/updateSource前后Actor SHA相等，原planned字段未清洗，反证空Formula假说。进一步live内存Object.hasOwn/typeof证明condition为own undefined，JSON会省略；比较器假定空串，离线序列化DTO因此掩盖现场差异。pure helper精确同路径复现，JSON roundtrip后PASS。最终显式写完整匹配rule到原生Trigger说明，不增加Midi自动条件；缺失/undefined/null/空/改文仍拒绝，完整hash谓词不变。

回滚仅在5.3.3、准确Cast/cache/selected来源、同Effect身份及完整业务相等时用公共API恢复已证明origin重定；其他来源/Actor/效果内容/补偿拒绝仍失败。完整raw残差比较只排_stats.createdTime/modifiedTime/lastModifiedBy，原snapshot保留全量，未知字段、版本、其他位置同名字段仍拒绝。两次现场准备只用严格原Actor SHA、准确origin/原resolver namespace公共ForcedReplacement与完整业务EDD994...前后证明；未删重建Actor，不能算产品通过。后面的正常Apply/施法/GM伤害才是产品行为证据。

## 检查、重载与证据

503项通过、0失败、2174断言/17文件，resolver类型/build与最终增量审查通过。既有模块类型/架构门复用；后续两处内部字段/比较调整未改依赖边界，不重跑无关全仓CI。父控独立17项毒雾/迷踪步、12项Geas维护、15项施法/GM/重载核对，实际检查5张业务截图。

最终业务重载三WorldActor/三syntheticActor完整JSON相等、ownedScene/Region及原activeScene/10Combat/80模块全文相等，全部次数保留，worldtime21085811/pausedtrue。六消息内容/flags/骰式/骰面/total保持；raw唯一差为Geas Save骰动画results[0].indexThrow从0变成省略，原差异保留，不称raw消息完全相等。原客户端snapshot已在P2/228时按实时CAS恢复原29d5...，revision229，后续重载保持，无重上传包。

证据根`.local/forge-three-runtime-20261021/`：三份worker收据/503最终日志、审查、精确安装收据、parent-misty-noxious-acceptance.json、parent-geas-maintenance-acceptance.json、parent-geas-native-acceptance.json及chrome全部原件。工具加载、字段录入、返回排序与导出修复单列，不抹掉有效业务/原失败。另观察到一次psfx音效资源加载失败，原官方工具回执仍在会话中；单独文件是回执转录，未在重载前另存原日志，不为补日志重演业务，也不因此扩修音效模块。

最终精确清理已完成：临时清理工具先canonical拆native对象导致两条伤害消息假哈希失败；实际完整JSON投影逐字段相等，修为同原audit的完整JSON投影，expectedSHA和白名单不改，31项fresh preflight全通过后才删除。6任务消息/3Token/3Actor/ownedScene与Region/控制宏精确删除；helper最后删除后的callback实际读回，由父控26项断言证明原318Actor/180Item/94Macro/67Scene、原activeScene7Token与10Combat全文、80模块、原视图/时间/暂停/空选择及原checkpoint字节恢复。原318Actor与94Macro全体body未逐个快照，不宣称全世界body字节相等。只关闭owned651348161释放辅助Hook/DOM/global，用户blank/Harness/其他页及Chrome/Foundry服务保留。原前置失败及最终读回均留存，未为工具修复重跑业务。

收尾检查：直接受影响3条手册及共享支持矩阵影响的另3条已逐项人工复核；首次build/check的stale失败保留，最终33项handbook build/check通过，实际生成HTML的相关条目/条件/次数/限制已读回，未修改界面代码。382份历史/原始新批回复证据与2份正式包SHA保持；136既有文件中121未变，15项变化均在本次明确范围。最终15个源码hash匹配；worker清单漏列transaction.ts的取证缺口已用最终独立审查c77...来源补齐，原保护失败报告保留，未改源码或重跑业务。最终汇总与保护收据为`.local/forge-three-runtime-20261021/final-receipt.json`、`final-protection-complete.json`；原误报保留在`final-protection-readback.json`。
