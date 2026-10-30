# Forge 特性内容图标

## 目标和边界

用户要求新生成怪物和物品的能力图标反映内容，例如爪击使用爪子、火焰投射使用火球。沿用当前 Forge 分支 f79c25fbac747a7e08f98c48779f052c3db68599；不合并 master，不推送。图标通过正式 generation workflow 投影，只改 Item.img 及各 activity.img，不凭图标或名称新增机制，不改 Actor 肖像与 Token，不额外调用付费模型。

现状：共享 assets-icons 已有 verified v14 catalog 和 safe resolver，但 Forge browser runtime Actor/Item 的 request、workflow 和 response 均固定 iconMode off。catalog 来源是 Foundry 14.364 / dnd5e 5.3.3，当前已支持 Mirror 14.368 / dnd5e 5.3.3；新使用的路径须核对实际文件与 HTTP。CLI/Web 未要求图标的默认 off 继续保留。旧 off 请求和恢复记录仍须兼容。

## 实施

- 复用共享安全 resolver，移出其对 Node 文件加载工具的纯 selector 依赖。匹配只使用已验证目录；结合名称与结构化效果选择明确视觉，不明确时使用类型默认图标。
- 提供浏览器可用的已验证图标数据/会话入口，接到 Actor 和 Item 正式投影；v14 Forge 新请求标记 safe，历史 off 和不支持 safe 的版本保留原行为。审核身份、哈希与恢复必须绑定实际 iconMode。
- 同步模块说明及手册，检查中文投影不改变选图结果。

## 验证选择及原因

- resolver 局部测试：新增中英文内容匹配、身体攻击/元素投射/治疗等正例，名称近似或冲突的反例、已有指定图标与无关机制不变；验证图标路径来自 catalog。
- Forge Actor/Item runtime 与模块测试：实际正式来源生成、safe/off 兼容、解码与 artifact/source verifier，生成前后除 img 外的机制等价；浏览器打包及禁用导入扫描证明没有引入 Node、远程资源或额外模型调用。
- 类型与架构检查：本次新增跨 package 浏览器入口和协议 mode 支持，执行受影响类型与依赖边界检查。
- 本地 Foundry 14.368 / dnd5e 5.3.3：在授权独立 Chrome 执行任务中查看最终图标和原生 Actor/Item，确认图标加载、动作类别及实际规则。限定本轮独有 fixture，精确清理；不重复已验证的付费审核与恢复流程。
- 手册人工核对、review、build、check；现有检查结果只在本次改动未影响的层级复用。

## 进度

当前：通用正文图标补齐及CR7已批准包的一次导入/刷新验收完成，本例12项均内容匹配、0默认，刷新ID/名称/路径与加载保持。未知或含糊内容仍允许回退，不宣称任意特性均唯一匹配。本轮未提交、合并或推送。下列保留实施轨迹，最新实际样本见文末。

- 已核对候选分支 clean，master 不变。
- 正在检查共享 resolver、catalog、Forge 请求/响应和浏览器依赖边界。
- Activity 图标字段已对照 tracked reference manifest 的 dnd5e 5.3.3 提交 965ad2d0cf5d063dac675ba078b5bd3c3c0dd449，读取本机 reference cache 的 module/data/activity/base-activity.mjs:45-52，img 为图片 FilePathField；Mirror 5.3.3 模板亦读取 source.img / activity img。物品的多活动图标纳入同一正式投影和机械不变检查。
- 首轮正式 Actor/Item 图标生成通过；Item 的内容派生 ID 及 effect origin 随 img 合理改变，移除视觉字段后经公开 normalize 再投影完全等价。协议/来源/批量首轮 76 项通过，旧报告 total 只按 Item 数的断言及 UI 导出固定 off 的断言已更新到新契约；不是机制失败。
- 首轮 Forge 470 PASS / 1 FAIL，唯一失败是旧导出断言期待 off；类型检查发现新增测试的两个 SourceId 缺少品牌类型标注，已修复。后续只复验这些断言及新 resolver 改动触及的正式生成、bundle、应用入口。
- 独立审查发现 equipment/consumable 活动沿用父类型会跳过内容图标、无名多活动跳过明确伤害结构，已由同一 resolver writer 修复；正式物品层补真实来源回归，不能以 feat 模拟代替装备行为。
- 共享 resolver 最终 17/17 PASS、94 断言；中英文身体攻击、火冰吐息、治疗、十种单一伤害类型、装备/消耗品及无名多活动、相近/冲突/混合伤害回退均有回归。审查已定点复验修复。
- 正式 Forge 最终 `bun run test:fvtt-json-forge` 474 PASS / 0 FAIL，34 文件、4205 断言；含实际浏览器 bundle、Forbidden Import、Actor/Item 创建边界、活动丢图拒绝及精确 cleanup。`typecheck:all` PASS；同轮 package typecheck 与 architecture:verify（1301 modules / 3065 dependencies）在依赖图未变的后续视觉规则修改中复用。局部 anti-overfit 10 个 source PASS。
- 独立 Item 回读新增 Item.img 与每个已声明 activity.img 比较，嵌入 Actor 的 Item.img 亦加入原回读投影；与旧 off 活动没有 img 的产物兼容。实测丢图反例只清理本次创建的 Item，已有对象不变。
- CLI safe 与正式 Actor/Item 定点最终 5/5 PASS；协议与 review/batch 的相关已通过检查复用，只有新版报告条目计数、safe 导出和已验证 force.svg 路径的旧断言作定点修正。CLI/Web 默认 off 已核实际实现。
- 正式 Actor 来源 verifier：HP45 / AC14 / CR2 / 5能力，warnings=0，sourceIntegrityErrors=0。火球为来源定义的远程单体 1d10 火焰攻击，选图没有套用同名法术机制。来源、响应、artifact 与期望清单在 `.local/forge-semantic-icons-20261011/`。
- 已人工核对 5 个手册条目并生成根 HTML；`handbook:check` 33 项 PASS。
- 已按原 Mirror 安装机制仅更新 scripts/index.js（r5），无服务操作/备份/数据库编辑；candidate / installed / HTTP 16 文件完全相同，JS SHA-256 d2a37bf51f6a9ca584c0e474327c7b404075fab8f0e0954199554d6ea145398f。25 个所用或新增图标路径的本机文件与 HTTP 字节相同；catalog 14.364 来源不冒充新采集，运行目标仍为14.368/5.3.3。
- 独立 Chrome 原生验收完成，父已查看全部三张真实截图并重算来源/产物哈希：Actor 5个Item图和5个Activity图、独立Item本体和2个Activity图均与正式期望一致，正常刷新后仍相同。原生爪/火/冰/牙/尾可区分，附赠/传奇分类、HP45/AC14、120ft单体1d10火焰攻击保持。独立Item显示force.svg与equipment.svg不同，活动动作/反应、1分钟专注及黎明恢复原样。
- 精确收尾通过：Actor.15dfca5896456c28 与 Item.e43353db8b743fe2 各新建1/删除1，Actor集合304→305→304、Item208→209→208，原默认蓝图保持。无API/Key/服务/宏/Token/Scene/Combat/Chat/世界时间操作。证据及父验证在`.local/forge-semantic-icons-20261011/chrome/receipt.json`和`parent-verification.json`；receipt SHA-256 fa8fb840162006dac01297c6c93d3c942ee31ec88b960d488082f3d368ae1a4d。
- 输入观察：Item来源含UTF-8 BOM，浏览器File.text去掉BOM；执行器通过正常textbox恢复同一原文件全文后才生成，sourceHash及artifactHash严格匹配，没有修改来源文件或最终JSON。本轮图标接受不扩大到文件上传字节保真修复。可选手册file页未另开；纯说明已人工核对并通过33项生成一致性检查。
- 本阶段功能、机械/来源/视觉与限定运行验收完成；本轮尚未提交，不合并 master。主master HEAD仍3734eb2de0b19b0f3d4cfb38bd1e0c8478635281；验收期间主区新增未知untracked `.omo/`，保留未触碰，不将其归为本轮变更。

## CR7 实际来源接续结果

用户暂停后明确继续。复用原PDF第4页Sea Hag Auntie来源及同一Chrome执行器，没有重做有效提取；引用定义与Bilebrine等级通过来源反馈修复，Seed Terror的自选属性/多目标手动处理以完整GM边界保留。发现并修复v14已知英文语言名大小写映射（Aquan→aquan），未知短语和v12旧契约保持。286生成回归、类型、架构与局部anti-overfit11sources通过。

中文86个Actor字段加3个包字段通过本地校验后，人工发现4正文的Save Ends译义及1背景的keep food down译义错误。新增只针对未批准正文的本地修正端口与真实模板入口，不依赖Key或Provider；来源、数值、骰式、术语、显示标记和标题绑定保持，修改撤销确认并支持恢复。476模块/36本地化与相关类型通过，手册同步；真实UI仅改5字段，其余84字段逐字保持。该结果也说明自动文本校验不能替代译义审核。

当前r7的JS SHA def389a8c0c0a9045055d3189ecee01be571e85fb9c60eb08a09ae13cfbb22f5、模板SHA ba0139d797916621630e7f7ffad704c270a5e1105aa0bcbfbc2214ef894c3fd6，16文件与安装相同，两修改文件与HTTP字节一致。Mirror14.368/5.3.3本段实际GM批准、正式中文生成、1Actor+1Macro导入后，原生HP151/AC15/CR7、语言水族语、12双语能力与源规则/GM边界正确；正常刷新后图标、ID、正文与背景保持。4项内容匹配是多重攻击、腐肉爪、死亡凝视和由勇转惧，另8项保守回退；爪子本体和其Midi子活动的暗蚀图分别核对。未执行控制器、活动、骰子或战斗。

本段模型/连接探测/翻译/AI审核/外部Key读取/服务操作均0。只创建并精确删除本次Actor/Macro各1，目录DOM基线Actor287/Macro94恢复；不把目录范围冒充全世界数据库审计。原无Key设置、Guard及其它用户页恢复。正式中文包与产物已通过父独立再生成/hash/全部译文字段、原生DOM图标和截图核对；宏字节与当前模块绑定模板及正式配置相同。原生下载JSON未捕获，完整原生文件导出往返保持UNKNOWN；有效生成与原生视觉/刷新证据保留，没有为导出缺口重放业务。

完整原件、父核结果与方便接续入口在当前worktree的 `.local/forge-sea-hag-auntie-20261011/`（不纳入公开手册sources）。正式中文包hash9cb603df3664beb230d0dd75e8e696e158b89c1de0eeb4b1c7e3d4326dd9f339，artifact hashcfd56b03f00682742bc93919cdc539f919440445c177ef4b88dc0a60bae9d444。未合并master、未提交/推送。

## 通用正文图标补齐（本次限定接续）

2026-10-11 21:21（北京时间）开始。用户要求补通用内容匹配，复用现有已批准海妖婆包进行一次导入/刷新，不扩大其他功能，不合并master；结束后按现存日志解释上一轮整下午耗时。现存缺口为12项能力中8项默认图。继续同一工作树与Chrome执行器。

检查选择：正文效果识别涉及所有safe消费者，因此补改名后的中英文能力正例、免疫/移除/前置条件和混合伤害反例、只变图不变机制断言；正式Forge Actor回归验证端到端来源生成。复用上一轮未受影响的翻译、规则选择、正文编辑与清理协议证据，不重做AI调用。包类型/架构、Forge build与禁止导入检查是现有集成门；手册核对正文选图说明并生成。最后只做当前候选的一次海妖婆导入/刷新，核全部12图及实际加载，精确清理本次对象。

首轮限定检查修正了测试表可选参数被Bun当作done回调、中文“受到诅咒”的词形；随后54项通过。正式已批准包重投影12项均非默认，除25个img路径外数据逐字段不变。新增同句“施加状态且不能施法/移动”的反例边界，避免整句否定过滤误丢真实效果；只复验图标与既有Forge整合门，不重跑翻译和付费提取。战斗包内Actor保持既有needs_review/11个人工规则要求，不因选图绕过GM门。

完整Forge+resolver整合532项通过，唯一新反例“does not imitate ... or change ...”暴露并列否定作用域，已在内容匹配内部修正；接下来定点复验全部正文/旧图标/正式来源54+新增6项，不重跑其余有效模块行为证据。

最终图标/正式来源60项、包类型与架构1302模块/3068依赖通过，正式已批准包再次投影仍只有25个img变化、12项0默认、source verifier warnings0/errors0。typecheck:all发现新增测试把catalog字典的可选默认值直接传入严格string断言，已补已知feat键的类型保证；仅重跑此类型门，不改运行代码。安装写一次JS后HTTP读取器对文本Content误当bytes，保留已成功的前/后文件核对，改用只读arrayBuffer核16文件一致，不重装。当前JS2925247e...e2f3a84；12个不同图标URL均200/image。13:47:17UTC派发原执行器做一次限定导入/刷新，父仅继续已授权的耗时复盘与类型/手册工作，不监控或重演浏览器。

13:59:39UTC浏览器批次完成（11分49秒，含登录/截图/刷新/清理，不是单次导入响应时长）。原包正常上传、当前正式UI artifact规范hasha9e936d19b6b7e72c0628fcad2fda8911949565492c9c6ed4394af9d4b4d7e19；一次导入新Actor.68a60ca0e222fdb0及Macro.1afcdafe1758c22b，本次基线两ID不存在。全部12主Item行路径与期望一致，IMG complete、natural256、显示32；顶部/底部四张原生前后截图已父看，HP151/AC15/CR7正确。一次刷新后12项ItemID/名称/路径/加载保持。父独立重算UI/本地产物、25img-only差异和所有12图读回。

仅本批两对象各精确删除1；正常目录Actor287/Macro94及逐ID集合恢复谓词通过，父核基线/新身份与清理谓词，不宣称已捕获完整删除后ID向量或审计数据库。任务包身份核后清空，Guard/原连接与其他10页保护；模型/探测/翻译/付费审核/活动/控制器/战斗/时钟/服务操作0。完整证据content-icons/chrome，父核content-icons/parent-verification.json。上一轮耗时按聊天turn/收据复盘于content-icons/TIMING_REVIEW.md；扣除明确暂停后仍约3小时39分，主要缺口与执行扩张已记录，不把已批准包0.3秒投影冒充新PDF全流程速度。README新增本次实际结果使手册指纹变化，仅复核受影响说明/review/build/check，不重跑业务。
