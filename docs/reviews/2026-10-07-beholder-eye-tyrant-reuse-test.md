# Beholder Eye Tyrant：第二来源的固定能力复用测试

日期：2026-10-07。当前状态：本批来源事实恢复、明确GM裁定承载及1至20项能力控制已实现，并完成限定Mirror运行接受。CR13真实AI整包审阅通过，产物`ready_for_gm_review`；C0至C4的实际8d2d业务证明经完整产物差异绑定复用，762a候选的新面板、C5和自有对象清理已实测且由Root独立复核。保留五条无直接Combat归属的回合提示，以及正常恢复造成的一个原Combat修改时间差异。全部代码仍在原worktree，未提交／合并／推送。下文前两轮`needs_review`、Chrome阻断和布局失败均保留历史证据，不推广为任意机制全自动或生产接受。

## 目标与基线

选定原 PDF 第 14 页的 **Beholder Eye Tyrant，CR 13**。它有十条眼射线，既有可与 Eye of the Deep 共用的麻痹形态，又有现有固定能力未覆盖的重复豁免、阶段石化、禁止治疗和随机选取。

- 工作树：`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261006-111625-bettermonsters-eye-deep-sample`。
- 分支：`codex/20261006-111625-bettermonsters-eye-deep-sample`；已提交基线 `6a7845650a04b8a78b458e5edd5f74fb2bb35ab3`。
- 复用本任务尚未提交的 Forge 0.5.1／CC 0.2.0 候选，不以 master 替代。主工作区保持干净；没有发布授权。
- 来源：本任务已保留的 `Beholders.pdf`，SHA-256 `cc7f114b0dcf7e96386665488ee57ec27139440fb46be94aaadca763d0ed2034`。第 14 页完整渲染并视觉核对后，原生抽取文字只规范换行、移除 form-feed、增加来源注释和标题，未改写机制。
- 本次输入 SHA-256：`f0fb9ec14cef73ce8b4351c2742aba768a60301511ee8873a3cc76f2c3ac5355`；输入和绑定收据在 `.local/bettermonsters-second/`。
- 正式生成：CLI `--intake-monsters`，显式 `--fvtt-version 14 --effect-profile core --icon-mode off`；只写本任务隔离 vault。复用已授权的真实 DeepSeek `deepseek-flash` API 配置，凭据只留内存。
- 运行候选：Mirror Core 14.368／dnd5e 5.3.3／cor-cotn／30001，保留常驻服务和现有模组组合。重新核对具体客户端、脚本哈希和世界后才执行实际行为。

本次检查的证据缺口是：第二只真实怪物是否保留十条射线及复杂规则，现有麻痹能力能否跨名称／豁免属性／DC复用，以及遇到不同机制时是否准确说明边界。先保持现有能力库执行；只修复实际发现的生成、绑定或误报问题，不把所有 GM 裁定一并扩成自动化。

## 原文检查基准

核心数据：AC 18，HP 228（24d10+96），Large Aberration（Beholder），Fly 40 ft.／Hover，STR16 DEX14 CON18 INT17 WIS15 CHA17；CON +9、INT +8、WIS +7；Perception +12，Darkvision120／Passive22，Deep Speech／Telepathy120，Prone免疫，PB+5，XP10000，来源 Initiative+12（22）。未给定 alignment，不猜测。

| 来源能力 | 原生内容及必须保留的规则 | 固定能力预期 |
| --- | --- | --- |
| Gnashing Bite | +8／5ft／4d6+3 Piercing | 原生攻击 |
| Eye Rays | 每次随机三条、重复重投、可见目标120ft | GM按来源选择；不承诺自动随机三连 |
| Charm Ray | WIS16／3d8 Psychic；Charmed至目标下回合结束；失败差值≥5改为Dominated | 现有四组合未覆盖分支和Domination |
| Paralyzing Ray | CON16；Paralyzed至来源下回合结束或任意实际伤害 | 复用既有paralyzed/source-end/1/true |
| Fear Ray | WIS16／4d6 Psychic；Frightened至目标下回合结束 | 现有四组合未覆盖Frightened |
| Slowing Ray | WIS16；Dazed1分钟、回合结束重复豁免、再次使用此能力结束旧效果；同时DEX豁免劣势 | 不能按名称误配为Glacial的速度减半 |
| Enervation Ray | CON16／3d8 Poison；Poisoned至目标下回合结束，期间无法恢复HP | 不承诺只挂Poisoned就完整支持禁止治疗 |
| Telekinetic Ray | Concentration／STR16；GM选方向移动最多30ft，Restrained至来源下回合开始 | 现有四组合未覆盖位移与专注 |
| Sleep Ray | WIS16；Unconscious1分钟；实际伤害或他人Action唤醒提前结束 | 现有四组合未覆盖此期限与唤醒 |
| Petrification Ray | DEX16；首次失败Restrained，下回合结束仍受束缚时再豁免，成功结束、再次失败Petrified | 阶段石化不能同时套两个状态 |
| Disintegration Ray | DEX16／8d8 Force；该伤害降至0HP时死亡并化尘 | 原生豁免／伤害，化尘为GM裁定 |
| Death Ray | CON16／10d10 Necrotic；该伤害降至0HP时立即三次死亡豁免 | 原生豁免／伤害，额外死亡豁免为GM裁定 |
| Eyestalks | Bloodied且遭受Critical Hit，攻击者选任一射线禁用 | 当前目录／契约只有两能力形态，不能冒充十条通用支持 |
| Magic Resistance | 对法术及魔法效果豁免优势 | 按用户范围保留说明，不新增效果 |
| Purge Distractions | 3/day、自己回合开始结束一个法术／状态，下一次攻击15–20暴击 | 来源说明／次数与GM裁定 |
| Antimagic Gaze | Bonus／150ft Cone，至来源下回合开始或再次使用；Antimagic Field包含自身射线 | 保留来源／原生形状；不承诺区域反魔法执行 |
| Legendary | 池3；Adjust Gaze半飞行速度后用Gaze，Eye Ray随机一条 | 保留活动／资源；来源未明确恢复时点时不增写恢复规则 |

## 执行记录

第一轮真实 run `2026-10-06T16-25-57-138Z-32e80909`：discover/extract/repair各1次（31174／105489／16658ms），十条射线均拆出且Paralyzing CON16／Slowing Dazed／其他不同机制保留。最终`needs_review`，5个`UNCLAIMED_MECHANICAL_COVERAGE`，没有standard.md／candidate-actor／正式Actor。具体为Traits、Actions、Bonus Actions、Legendary Actions标题及传奇池前言的空claimPaths；原始失败run完整保留。

诊断发现共享修复合并逻辑仅检查旧coverage的引用文字是否准确，就把旧ledger覆盖回修复输出；缺少机械绑定的旧ledger也被当成可保留。当前已以另一只既有中文Lurker fixture构造回归：有效provider修复在旧实现仍`needs_review`（红）；修复后成功生成，空／未知绑定均覆盖；仍有缺口的修复仍保持`needs_review`且零输出（绿2测试／16断言）。不能据此断言本轮未保存的原始repair响应已经正确，仅确认该路径存在可复现缺陷。

修复只调整Intake对旧ledger的保留条件：机械条目必须有非空、可解析到合并后claim的绑定。未放宽validator／引用检查／promotion gate，未改怪物专用规则和固定能力库。因为共享修复接受行为改变，需执行整个orchestrator及相邻validator／renderer／CLI／repair回归、package类型与架构检查；真实来源另开run重新进入现有CLI，不手修失败IR／Markdown／JSON。内部修复没有增加用户入口、版本或操作步骤；手册watch若变stale仍按既定流程人工核对。

同一来源链继续核对source／IR／标准Markdown／最终Actor；`needs_review`不能靠手修输出提升。固定能力选择若调用AI，独立记录其选择、编译和审阅结果；人工配置样本不得当成AI选择接受。

正式生成后使用现有 `verify:intake`、`verify:actor`及本样本逐字段语义检查。新源没有改写执行代码时复用既有公共回归结果；真实 Foundry 只验证本次不同来源、CON DC16麻痹、期限／解除及明确的支持边界，不重放Eye的完整矩阵。

## 第二轮实际结果

run `2026-10-06T16-33-13-278Z-1843aa08`：discover／extract／repair／review各一次（41036／132227／9542／13602ms），进入标准Markdown和候选JSON，但`needs_review`，没有promotion。本轮候选SHA-256为`0098fde6f1d41a699ce4de417937a53852f2e16a19207d816cfb9ec6516cfcba`，是诊断材料，不是可导入正式产物。

1. **原生基础结构与十条射线存在。** 十条都生成唯一DC16 Save Activity，能力属性／伤害／不同规则原文保留；Slowing是Dazed，没有按名称改成速度减半。Initiative12／AC18／HP228／Fly40Hover等有实际候选记录。第一轮IR来源审计138项通过仅说明IR内容，不能提升其失败来源链。
2. **Charm分支没有执行语义。** IR包含Charmed与失败差值≥5的Dominated。生成的dominated Effect没有statuses或changes，且与普通Charmed都连到同一个failed Save；确定性verifier与真实AI审阅都拦截`ACTOR_CONDITION_DRIFT`。不能把该空Effect当成支配效果，更不能改成近似的Charmed后称完整支持。
3. **Petrification阶段被错误合并。** 候选里Restrained与Petrified两个Effect都以onSave=false连到同一Save。旧verifier仅逐条检查staged entry内多个statuses，漏过了“两个entry各一个status”的情况。以独立的Stone Stages来源fixture复现旧实现findings[]／错误接受，再补跨entry检查：当前`verify:intake`额外准确拦截`STAGED_CONDITIONS_SIMULTANEOUS`，普通同次复合状态及既有companion suppression不受影响。初次使用exhaustion的回归因该状态未投影，不能作为同时阶段反证；其原红日志保留，换两个真实native状态取得有效反证。
4. **另有基础数据遗漏。** 第二轮IR的saves为空；实际候选CON4／INT3／WIS2，原文应为9／8／7，STR3／DEX2／CHA3仍与原文一致。源语义审计比仅IR→Actor核对多发现了这三项真实错误。未保存本轮修复前原始IR，无法断言是extract还是repair首次省略了saves；没有依据就不补写。后续必须修复同源提取／审阅完整性，不能手改候选JSON。
5. **120尺范围只保存在父Eye Rays说明。** 单独十条Save没有明确range／target元数据，尚无原生距离执行证据。重复豁免、禁止治疗、专注位移、唤醒、化尘／死亡豁免和反魔法场均未运行，不以已存状态或原文代替完整执行。

独立候选审计13项通过／4项失败（3个训练豁免＋同时石化）；源码IR审计第二轮132通过／6个明确总豁免缺省，实际native计算区分了3个与基础属性一致和3个真正错误。初次审计Perception大小写只属于工具alias差异，修正读取别名后第一轮IR138／0，不重做AI链，也不拿旧工具错误指控产品。

## 复用能力与整包边界

本次通过公开接口完成四个离线探针（不是怪物通过）：

- 不同actorKey／Item名的同一paralyzed/source-end/1/true数据契约接受，DC和CON仍来自本次native Save。这只是固定参数形态接受。
- 对完整本次IR调用`compileEncounterSelection`，仅配置Paralyzing会准确拒绝：`Staged condition /creature/actions/9 requires one companion rule for action/Petrification Ray.` 没有删掉Petrification或其staged标记来绕过。
- Eyestalks配置十条射线被当前“两项不同Activities”契约拒绝；当前目录没有十条任意选择支持。
- 麻痹换成目标下回合结束也被现有匹配组合拒绝，没有替换来源时点。

因此结论为：有可复用的执行骨架和少量固定规则组合，但第二只复杂眼魔不能直接通过现有AI→固定配置→整包路线。本轮没有真实AI固定能力选择调用，因为完整来源Actor尚未accepted；没有Foundry导入、状态结算或清理事务。Mirror候选文件哈希仍为Forge`03d8cc3dd0d671ce45a4577dbd9885f68b8460079e1d2eab27d8b702cb97dbe8`、CC`4677ac4b6ceda291d3020d42a296fc3219a122f784547142da01fa3065a715e3`，没有安装、重启、备份或世界写入。上一只Eye的运行证据不推广为本次通过。

## 后续顺序

1. 先修复完整来源数据的提取和审阅，至少让三个训练豁免不遗漏；补同源回归和正常生成，不修输出。
2. 明确并实现来源完整的GM裁定承载：特殊分支保留原文、前置、阶段、未执行边界，禁止伪造空效果或把多个阶段当同一次native状态。只有真实来源链和配套覆盖协议满足后才允许进入正式输出。先做这一条通用能力，避免逐怪物专用宏。
3. 将GM能力可用性控制从两项有界配置推广到来源证明的射线列表；仍保留GM确认Bloodied／重击／选择／恢复，不自动检测这些条件。
4. 之后对本次完整候选在Mirror窄验收：CON16麻痹复用、合法GM禁用／恢复和真实来源回读。新的期限／重复豁免／石化自动状态机等，在实际需要且支持范围明确时另行补能力；官方仅说明的Magic Resistance／Purge等继续按用户范围保留说明和GM操作。

最终同一代码版本的9文件聚焦回归 **170 pass／0 fail／592断言**（2.93s），覆盖orchestrator／renderer／合同／CLI及固定companion消费者。`typecheck:packages`通过；orchestrator／verifier局部anti-overfit两源码通过；架构依赖未新增，复用本轮1246模块／2836依赖无违规结果。`git diff --check`通过。受影响手册watch为monster／item／species／human encounter：Item和Species独立IR及目标不受Monster私有修复／verifier变化影响，已对照其入口文档；Monster与human说明补充阶段和两项禁用边界，4条review及页面已生成，`handbook:check`33条通过。实际生成HTML中两条新限制文本均存在；本次没有页面交互修改。

最终状态：**测试结果明确，但怪物未通过接受**。源语义／特殊能力不能以170个回归通过代替；本候选继续`needs_review`。没有执行`verify:actor`的正式输出接受、真实AI固定选择或Chrome／Foundry玩法验收；生成未达promotion gate，这些下游门禁保持`NOT_EXECUTED`。主工作区干净、HEAD保持原基线，全部修改留在既有worktree，无提交／合并／推送／安装／备份／服务操作。本次修复的是覆盖修复合并和阶段验收漏洞，尚未实现训练豁免遗漏恢复、Domination、石化状态机或十条眼柄控制。

所有新证据在`.local/bettermonsters-second/`：PDF页面及原生抽取、source-binding、两轮日志、来源审计、candidate-static-audit、capability-boundary-probe、验证前后报告、有效红绿回归。两个原始run及其原状态保留。不能将当前诊断JSON作为正式生成结果交付。

## 获授权后的通用修复与正式整包

用户随后同意上述处理顺序并要求开始。全部修改继续留在原worktree；运行目标仍是Core14.368／dnd5e5.3.3的同一Mirror，保留全部现有模组，不新增怪物名字分支或自由脚本。

1. **共同来源事实恢复。** 新的browser-safe `source-facts`统一CLI与浏览器／战斗包路径。完整六行能力表或明确Saving Throws行可恢复缺省值，并补精确同候选claim。只在AC开始的核心块处理；Traits／Actions的冒号、加粗、Markdown以及无总标题的特性正文均不能借出基础豁免。已有错值和矛盾来源继续阻断，恢复幂等；悬浮与明确失败分支也按同一来源核对。
2. **封闭GM裁定能力。** `gm-manual:{}`只绑定唯一来源Item，面板仅打开其规则页，零自动结算。阶段和一般条件用严格的共享marker校验；完整源码、分区／载体／路径、GM步骤、唯一Macro覆盖仍为必要条件。生成清除对应原生及CC状态推断，并保留Native Save／攻击／伤害。普通Actor/Item导入门禁仍不接受未绑定的GM审核状态。
3. **能力列表。** `gm-activity-lock`扩为1至20个不同Save Item；名字必须直接出现在权限特性或属于同一原文连续编号的眼射线列表，且都有唯一正式Native Save。GM确认Bloodied／实际重击，自己选择禁用与明确恢复；两非链接Token互不影响，停用／重载不隐含恢复。
4. **单怪物入口。** 原战斗包制作入口从2至6扩为1至6，沿用原审核／导入／明确启用过程，没有另建任意规则Mode。源码范围120ft及可见性仍由父Eye Rays和GM合法目标步骤保留，尚不声称各Ray的距离元数据或原生距离拦截已经补齐。

Root负责Intake、来源编译／生成及整合；复用的`eye_deep_fixed_runtime`只修改Forge runtime与其测试。独立`eye_deep_runtime_review`实证发现CC漏抑制和标题误采两个风险：均补到源实现，并用Slowed／Enfeebled、中文／双语别名及多种标题负例回归，不能把审查建议当作运行通过。

真实AI从第二轮的实际IR草稿继续，`source-proposal.json`只转换审查容器，没有手改IR值或继承accepted。`gm-repair-r1`因浏览器尚未接共同恢复逻辑而被claim门禁阻断，保留；接好共享实现后`gm-repair-r2`重新验证与来源审阅通过，并由真实DS选择16条固定规则：**1项麻痹、1项十射线GM锁、14项GM裁定**。不存在Petrification的自动状态机、Domination效果、禁止治疗或反魔法自动场。

整包第一次独立审核返回`accepted`但把8条正面确认写进findings，工具正确没有输出正式包。只修正独立审核提示“findings只含未解决缺陷，accepted必须[]”，保留既有配置并重新正式生成整包，只重做独立审阅；未重跑discover／extract／Actor review／能力选择。`gm-final-review-r1/review-receipt.json`：真实DS Flash／openai-chat／low，38517ms，`accepted/findings[]`，`ready_for_gm_review`。

正式产物为`.local/bettermonsters-second/gm-final-review-r1/`：

- 原始source SHA-256仍为`f0fb9ec14cef73ce8b4351c2742aba768a60301511ee8873a3cc76f2c3ac5355`。
- 整包JSON／packageHash：`7dcd666a40d38d33c31bc28d467df8e9835bd048d8991623ef6790395bc9fdb5`。
- 整包ZIP：`e793b186c7e01cd6d8e9f2670ba502ed35853a2065ca423cf274924e200892ba`。
- 当前正式生成Actor：`e17ee8e0e9488fcbd2f731a9c2b35daf6a206954e397f507fee5f114bb6a38ef`；17项独立native字段／Save／阶段审计全通过，训练豁免9／8／7恢复，阶段状态没有同一次失败绑定；`verify:actor`0 warnings／0 sourceIntegrityErrors。此Actor需要整包绑定审核，不能声称独立普通Actor入口接受。

当前同一实现的聚焦整合回归405 pass／0 fail／1704断言／18文件，package类型通过；architecture通过，7源码局部anti-overfit通过。Node/Bun/世界写入边界保持。工具手册需核对7个watch条目，新增用户步骤及边界与源码一起维护。

新的未发布Forge0.5.1候选以哈希区分：JS`8d2d240baee29167deda72153b4b73f474578984420d87eeaea0557ac2e34e7d`，ZIP`af67bb88ef920e024035d1ddfe81afa9332160557401b0e12e5fac5ec100fcda`，manifest仍`b6f804d33cf64dc11e81fd1b4192ab8ce30fd7d098c20c617c717575310b6d15`。此前已验收的ZIP等三个原始产物移动到本任务`accepted-eye-forge-release/`并核对原SHA，不创建副本／备份；其旧证明继续指向旧03d8脚本，不能推广到新8d2d候选。

按精确常驻PID49012／30001／dataPath／cor-cotn／noBackups身份核准，只热更新本模块`index.js`与`forge-encounter.hbs`两文件，其他三个自有模块哈希不变。未重启／停止服务、未改世界数据库。安装收据`install-receipt.json`标记`INSTALLED_NOT_RUNTIME_ACCEPTED`。下一步复用原Chrome验收聊天，重新核当前实际Sol6.1/medium/FullAccess与新加载脚本：正常预览／GM审核导入、真实数据读回、麻痹期限／受伤解除、十射线与单来源禁用／重载恢复、GM规则查看零副作用及自有fixture最终读回。服务继续常驻。

## CR13实机接受与面板窄修

本次收据`beholder-gm-rules-20261007-r1`，证据根位于本聊天visualizations下的同名目录。复用独立Chrome聊天`01a10b1b-3a61-7843-a584-8391d8bca8a3`，执行器实际turn_context核实Sol6.1／medium／FullAccess。官方Chrome26.930.41038及extension instance保持同一来源。

- **C0 VERIFIED**：8d2d脚本实际加载，正常整包预览、GM审核、导入及明确启动通过。
- **C1 VERIFIED**：正式Actor原生字段、CON／INT／WIS总豁免9／8／7、十项DC16及各自正确Save属性读回；GM项目没有伪造原生或CC执行效果。
- **C2 VERIFIED**：真实CON失败施加麻痹、成功不施加；当前来源结束／目标回合／下一来源开始仍保留，到下一来源结束解除；实际正伤害解除。保留初始fixture／导出失败，补齐缺失边界证据，没有用工具故障否定已发生的合法业务。
- **C3 VERIFIED**：十项列表包含第十Death Ray；来源1单项禁用后的原生使用没有Save／结算／HP／资源／消息副作用，来源2同射线及来源1其他射线仍可使用。Bloodied与受控实际重击骰是GM前置证明，不宣称自动命中／重击识别。
- **C4 VERIFIED**：治疗、重载及停用不隐含恢复，明确GM恢复后重新允许原生使用。
- **C5及cleanup待继续**：r1连接超时，没有把可能完成的C5State操作算作规则查看通过，也未执行清理。r2在相同官方组件成功读公共页面／点击IANA，随后重建拥有的GM tab651341057；实际只读C4State／C5State导出正常，未重播C0至C4、未初始化fixture。原tab消失原因保持UNKNOWN。

当前保留自有3个Actor、1个Scene／Combat、4个Token及控制／审计Macro。baseline与r2实际读回对比，原九集合成员和modifiedTime均未改变，设置及原视图一致；原Combat完整内容仅active true→false，符合测试Combat启用后的原生选择。删除测试Combat后须恢复原active／视图并比较完整source；原生更新时间如果变化如实记录，不能伪写_stats。

C0／C3截图显示原控制面板将来源×能力×操作全部铺到Dialog footer，两来源约50按钮造成重叠／截断。按impeccable及只读布局复核，窄修为同一来源选择器、能力／GM规则选择与短操作按钮，完整状态和绑定规则用原生details折叠；footer固定停用／关闭。保持既有浮窗、当前活动GM、Token身份、来源／配置hash、锁存储格式和业务Hooks。无Token只能查看世界Actor规则，不能伪造Token写状态。包预览同时补齐gm-manual中文标签。C0至C4只按证明未改业务部分复用，新面板接线和C5仍需实际接受。

清理helper独立审查发现并修复：native删除可能被preDelete取消后正常返回，现每一步检查exact ID确实消失；最后保留不依赖Audit的实际collector窗口，删除两个Macro后点击重新读取完整九集合。新RoundEnd记录窗口内所有Combat删除及匹配消息，出现并发／歧义即保留消息和余项。五条既有Monks回合marker虽与自有回合序列相符，但旧observer没有直接绑定每个ID；不以时间／数量或语义推断代替归属，将保留为明确残留。12条有准确自有scene／actor／token的原生消息可按ID清理。不得称世界消息已经完全恢复。

面板窄修的43项局部测试／395断言、模块typecheck及diff检查通过，手册33条通过。机械设计检测只报既有蓝图tab的3px底线；该tab明确border-radius0，与本次追加的面板样式无关。新ZIP`8c8208ae1a3ea433cc95a96a0aa5b772c1a26753a1c56d51a9b0e28c086772c6`／JS`aa366a84fa5af18fbbfab679d931fbedf135ca5d2833d959a83d534b6e696524`已冻结并热更新同一Mirror，仅index.js与CSS变化。旧8d2d接受ZIP原件移到`accepted-tyrant-r1-forge-release/`，没有新建副本／备份。全bundle比较仅showPanel、一个GM中文标签和生成的export setter thunk形式变化，业务／workflow／生成／Hook／guard／状态代码无差异；旧CSS是新CSS的完整前缀。r3收尾已派到同一Chrome聊天，新的selector／C5／清理实际结果保持待回传，不把旧业务接受重新标成新哈希fresh PASS。

r3实际回传发现：默认720px浮窗的两来源／十能力／14规则及两footer按钮可读，但展开能力状态后height1213、top167.21875、bottom1380.21875超过1271高的视口，footer也在屏幕外。窄窗、操作接线、C5和cleanup均未继续，不称布局通过。保存原图、DOM与实测bounds；旧tab消失原因UNKNOWN，新官方ownedGMtab651341062保留。

最小修复依据锁定Core14.368 `application.mjs` 的公开`setPosition()`及`_updatePosition()`：后者依据实际height和clientHeight重新夹取top。details原生toggle及正文状态变化不触发Application render，原位置未重新约束；现由这些内容事件重用Core定位，并让content/form可缩、footer不可缩，显式resize时内容仅在正文滚动。没有另设高度魔数或修改业务Hooks，未增加全屏默认。43项既有局部测试／395断言和模块类型复验通过，真实几何仍需r4确认。r3原ZIP移到`observed-tyrant-ui-r3-release/`保留失败候选；r4新ZIP`5cd8e7fc41195bfcc9698f27438baaf5f8d6c015472fbf7a6c295aa77de23143`／JS`762a2bb6c17f3f003b363747d3635a9350468e53181cfee0cbd3894626f525a0`热更新同一PID，仅脚本／CSS。来源、包、controller及清理helper仍与原绑定一致。

## r4最终接受与边界

执行器实际Sol6.1／medium／FullAccess与同一官方Chrome26.930.41038/browser6重新核准。旧owned tab在每轮开始时不在清单的原因保持UNKNOWN；本轮ownedGMtab651341066及常驻Mirror保留，没有将页面消失解释为业务失败。收据`final-receipt-r4.json`与Root独立比较`root-acceptance-r4.json`均在原证据目录。

1. **布局和控制通过。** 默认720px可读；两个details同时展开时panel top58／bottom1271，footer bottom1270、resize handle bottom1269，均在视口。正常resize约480px后可滚到最后Eye Ray，正文scrollWidth与clientWidth均468，无横向溢出，footer可见。Root已查看展开／窄窗实图及最后恢复图。Source1第十Death禁用、Source2同能力仍可用、Source1明确恢复，窗口和选项保留。执行器曾误以默认第一项为Source1而操作Source2，随即通过正常UI恢复，再按完整Token身份测试；最终两来源的锁均[]，没有用该失误重放原生攻击／Save或改骰。
2. **C5规则查看通过。** Source1实际打开Petrification／Charm／Eye Rays原生Item及手动处理配置；Source2打开Eye Rays的Item UUID精确包含Token `yQ1zFMVbPaNb5GEv`。逐步与整批比对，四Token的HP／状态／effects／锁状态／资源／Item uses、history、消息及完整九集合ID／mtime无变化。Root从原始before／after再次独立比较并接受，未只复述执行器布尔值。这里只确认规则查看无自动结算；14项GM机制没有逐项执行成自动化。
3. **键盘口径收窄。** Native close按钮具有autofocus/default配置，聚焦该按钮后按Enter实际关闭面板且控制器仍enabled、history不变；Tab可正常离开非modal浮窗。对dialog容器本身按Enter没有关闭，与Core原生行为一致。说明改为“关闭按钮设为默认；聚焦后可用回车”，不宣称任意控件回车都会关闭，也不新增键盘拦截。
4. **清理和实际独立读回完成。** 自有3个Actor、1个Scene／Combat、4个Token、controller及Audit均删除，12条有精确自有speaker的原生消息删除。新RoundEnd `qMWKjCmBEF8Q4FMp`由唯一owned Combat删除及唯一匹配消息绑定后删除；每个对象经native删除后确认collection不再包含ID。先保留真实collector窗口，Audit最后删除，再实际点击独立读取，保存`r4-independent-post-delete-readback.json`，不是提前保存的读回。

Root最终比较九集合：Actor286、Item180、Scene65、Combat10、Macro93、Journal67、Table12、Cards0；原成员全部在，前八类无新增自有对象。ChatMessage1096＝原1091＋明确保留的五条Monks提示（`Wm88NU3Y9Hv2IfTD`、`Vj3oDaiF41sSCpdA`、`vv1A7ZTTWMSVRME7`、`0PpKpSuASBvEKO6o`、`mgJXdcaIqgliuFtW`），它们的mtime保持。所有原对象mtime一致，只有Combat `8WCtc3bOyudYuHzh` 的`/_stats/modifiedTime`从1791300409674到1791319792212，来自native恢复；完整Combat其余字段与原source完全相同。已采集settings、启用module清单、scene／combat视图、camera、pause、worldTime、controlled／targets均一致；packageDocuments actors／macros为空。

正式包及来源、Actor哈希未变，最新模块JS／CSS为762a／b83e绑定；405项来源／生成整合回归和43项面板局部回归、模块类型、构建、手册33条与diff检查有对应证据。旧C0至C4保留原哈希，不重新标成fresh PASS。可选的包预览中文标签视觉补查未执行，该一项展示文案已编译／类型核对；不能因此重放已通过的导入或AI链。

仍需GM裁定的范围包括：随机三射线与重复重投、120ft／可见目标、支配分支、Dazed及重复豁免、禁止治疗、专注与位移、唤醒、分阶段石化、0HP化尘／额外死亡豁免及反魔法。完整来源和步骤保留，Native Save／攻击／伤害仍正常；没有把这些视作已自动执行。原生活动配置页用单行input显示长GM步骤，DOM完整值已核对，截图不同时显示整段；本轮没有更换dnd5e原生编辑器或声称其长文本体验完善。

本批实现与限定接受完成，残留及表达限制明确保留；生产、全部规则组合和长期游戏会话未执行。下一步可审阅本worktree的候选并按明确授权提交／整合；新的怪物继续走同一来源和审核路径，新的自动机制按实际需要添加通用能力，不能凭新名称自动取得支持。
