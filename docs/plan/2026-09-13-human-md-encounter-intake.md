# 原始人类 Markdown 到多生物战斗包

状态：本页记录的自由 AI 宏路线已于2026-09-13 19:44按用户要求停止；不会恢复该路线。2026-09-14用户授权改为固定能力与DS数据配置，当前实现与验收进度见[固定能力计划](2026-09-14-fixed-encounter-capabilities.md)。延续当前独立worktree；不提交、发布或生产部署。

## 流程与验收

人类MD → AI发现多生物 → 每份来源的evidence IR、确定性validator、renderer、正式Actor workflow及AI语义审阅 → AI生成来源绑定的配套宏草稿 → 宏与最终Actor独立语义审阅 → 显示GM审核 → 已有整包创建与明确启动。

不会以预写晶血龙兽YAML或专用宏替代真实AI步骤。原始MD完整转写用户已定规则；未指定的持续时间、数量上限和召唤者死亡规则保持未指定。新流程独立于单Actor/Item accepted-only入口。高级自动化显式进入新的配套宏IR，保留来源与逐项执行边界；源身份、缺项、未知错误或审阅不通过阻止创建。

本次新增范围：browser-runtime多生物编排，intake-ai配套宏契约/provider/validator，Forge原始MD输入与生成/取消/导出/审核入口。模型不硬编码到普通Provider路径；本地桥接仅供loopback页面显式选用，服务不记录凭据或完整请求。

机械门禁：多生物遗漏/重复、来源范围与hash、validator失败、宏绑定和来源证据、AI审阅失败、取消/过期响应/凭据泄露拒绝；原Forge回归、类型、构建与独立最终复核。

语义门禁：原始人类MD对照全部统计与能力；真实Luna Max调用记录各阶段状态和来源hash；通过外部Chrome审核本次真实AI产生的两生物与宏、导入并验证原生齐射自动召唤及先攻，清理临时世界对象并停止本地服务。不能用固定fake provider、旧样本包或旧宏替代该验收。未获延长授权时，长AI生成在CLI执行相同编排，Chrome/Foundry窗口保持30分钟以内；浏览器内完整重跑全部AI阶段单独报告。

## 2026-09-13 真实调用进展

- 人类写法MD完整包含龙兽15项能力和晶体3项能力，来源未指定规则保持未指定。独立来源复核通过。
- 本机既有OAuth桥接以gpt-5.6-luna、max、Responses流式请求运行；没有修改全局模型或推理默认。小型实际预检返回相同模型名称，仅作为服务报告，不推断隐藏路由。
- 本地代理将completed assistant item与空终态输出分别发送。适配器只重组同一响应的完整最终消息并移除代理追加的单个结束标记；严格共享解析器不变。部分消息、不同响应ID、重复消息、终态后数据均有拒绝测试。
- F轮：龙兽真实AI提取约20分钟，AI修正约10分钟；最终3处证据引文多出一个“再”字，严格验证维持needs_review，未输出包。原始报告保留在本地输出目录human-crystalbleed-intake-20260913-f。
- G轮：从F的真实提案续跑，重新校验；模型未修改错误引文，仍needs_review。修正请求的原文候选已由离线请求检查确认存在，没有自动编辑IR。
- H轮：明确“语义相同也不能替代逐字引用”后，真实AI约42秒修复全部三处引用，validator和正式生成通过；独立review约12分钟后流结束却没有任何terminal，严格拒绝为invalid_response。没有最终包。F曾20分钟正常完成，故不能归因为10/12分钟固定超时；具体关闭层仍未定位。
- 人工来源审计：15个能力均完整，主要数值正确，但huge被提取为gargantuan；另发现噩梦吐息缺少AOE/recharge结构字段和正式生成的重复恐慌效果。推翻“仅机械通过即可接受”的结论。
- I轮：通过独立来源反馈入口交给真实AI，约13秒将体型正确修为huge；重新验证通过。因已知AOE/recharge及重复效果仍需修复，于15:12左右停止自有CLI进程，保留IR报告，未把其running快照宣称为完成。
- J轮：真实AI补齐cone60和recharge[5,6]；进一步正式投影核对发现renderer写字符串5-6而parser原只接受数组，已以通用兼容规则修正。全量检查还发现传奇尾击原IR缺少被引用普通尾击的攻击与伤害字段；故中断J审阅，保留提案供实际AI继续修正。
- K轮：真实AI约4分34秒修正传奇尾击的引用数据和证据，validator通过；正式生成核对普通/传奇尾击均为力量+熟练的+11、15尺、4d6+6钝击+1d6心灵，传奇cost1；吐息具备原生充能5–6、cone60和单fear60s/failed-save，齐射cost2/DC18/单Dazed且保留下一目标回合结束的sourceDuration。独立AIreview运行中。来源hash为58b2f10e7f9ce3650082e87eff2f841b4638f5ccb31517f74b582ecfcbbd8349。只读投影证据.pui/crystalbleed-dragon-source-audit-k.json，不是最终AIaccepted包。
- 来源反馈入口只记录sourceHash、父报告hash、actor key、路径和差异说明，不修改IR；之后仍进行实际AI修正、严格验证、正式生成及独立审阅。report新增requestedOptions明确记录请求协议和reasoning，不声称服务端隐藏路由。
- 通用effect修复：来源effect只提升同一条件的generic推断效果一次，保留native status、来源duration和failed-save引用；不同来源的同status效果、多status歧义都保持独立。充能parser仅接受完整正整数有序范围，拒绝不安全整数；已覆盖正式workflow的Item uses、activity consumption和cone60。两项独立复核均PASS。
- 当前聚焦机械检查：254 tests / 1076 assertions PASS（包含parser全回归与provider），原Forge回归208 tests / 2061 assertions PASS；typecheck:all与typecheck:packages、architecture、13来源anti-overfit、31文件AGENTS通过。手册26条已建立，最终指纹需随最新修复更新。这些不能替代真实AI或召唤运行结果。
- 本地0.3.0候选已安装7文件并逐个哈希回读；Foundry保持停止。本次晶体、AI宏、整包和本次Lab尚未验收。

## L轮之后的语义修复

- K review于15:39结束，无terminal，仍needs_review。L在同一Luna/Max配置下重试，两次review均完整返回：第一次约12分钟，实际AI修正约3分28秒，第二次约13分钟。新增连接元数据证明L收到response.completed并以WebSocket1000正常关闭；没有改造失败响应为成功，也不能据此归因先前H/K的具体断开原因。
- L发现旧Intake verifier未正确识别native weapon base+ability、标准中英状态名称、资源名称规范化和draconic等价；修正中保持错误数值/自定义状态/缺真实uses仍阻断，独立复核指出的false-accept负例须全部关闭。
- 真实AI另指出守护被误推断halfDamageOnSave、名称中的支配被误推断为dominated/allyEscapeSave、独立save误带onHitRiders。parent已修为明确来源子句和正确事件类型，旧alyxian、generic riders、laughing hand样例回归通过；半伤与成功必须属于同一结果子句，成功无伤/失败半伤负例不再误标。该静态部分独立复核PASS。
- acKind=natural已由renderer保留为天生护甲说明，无acNote时不再丢失该已有IR语义；flat不新增说明，显式note不被覆盖或重复。public workflow正负例与独立复核PASS。
- 提取提示此前未列出aoe/recharge，现补齐这些已支持字段、uses/cost、显式攻击引用解析和标准体型映射。版本提升extract-v19/review-v24/repair-v19；后续真实请求仍为Luna/Max，未更改全局配置。
- 腐化的staged条件分支不能作为同时应用的原生效果。正在实现仅Encounter路径的source-derived GM/companion待处理机制；单Actor默认accepted门禁不放宽，最终仍须唯一宏绑定和完整独立review才允许整包输出。没有靠删去来源条件、手修Actor JSON或伪造accepted推动流程。
- 最新安装早于上述语义修复，进入Lab前必须从最终源重新构建、安装和哈希回读，不能以已装0.3.0版本号代替字节身份。

## 条件分支门禁与M/N轮

- Encounter专用renderer只对IR明确staged的条件组保留原文并增加源绑定GM机制；严格绑定ID、分区/index、完整数字条件路径、实际carrier和覆盖标记。生成期只抑制对应carrier的普通推断状态及refs，保留其他数据与source-derived独立效果；内部路径只在审计flags保留，不作为玩家说明显示。单Actor默认renderer和accepted门禁不变。
- 撤销了中间实现中的sourceField literal配额，最终仍只允许behavior-*的明确literal GM/external机制；同分区其他literal、错误carrier/path/coverage和缺宏覆盖均拒绝。所有独立复核阻断已关闭。
- M轮在17:26左右完成龙兽真实AI来源review，verdict=accepted且findings为空；角色保留明确companion needs_review状态后进入晶体提取。晶体请求约1分35秒后WS1006非正常关闭，没有terminal，严格失败、未输出包。该故障已有安全连接元数据，不是把失败响应当成功。
- 本地桥接新增单阶段最多2次尝试、共享30分钟总deadline；仅显式HTTP loopback+allowLocalBridge+waitPolicy启用。取消/总时限可结束不响应signal的Promise，迟到结果不回填；错误类型严格限制且普通连接不变。真实UI参数组合和错误预算均有测试。独立复核PASS，安全wrapper331 tests/1437 assertions PASS。
- N轮从M的真实IR提案重新校验和审阅，17:51左右开始，仍按gpt-5.6-luna/Max和新本地重试边界运行。没有从历史accepted状态直接放行。晶体、AI宏、整包和本次Lab尚未完成。

## N轮结果与O轮

- N于18:02完成龙兽来源review，accepted且findings为空，仅保留两项明确staged companion待处理；晶体提取约11分46秒完整返回，随后真实AI修复约1分48秒。三个coverage标题问题解决，但修复删除了必需的legendaryActions空数组，严格校验以INVALID_FEATURE_SECTION停止，未生成最终包。
- 月石晶体人工逐项核对：中型构装体、AC17、固定HP15/无生命骰、全部速度0、六维10/10/10/1/10/1、先攻0/CR0/PB2和三项能力文字均保真；未补造构装体免疫或未指定召唤规则。发现腐化互斥分支缺staged标记、戳刺activityType=damage与主敏捷豁免分类不符。尚无有效正式投影，不能推断运行时。独立只读审计确认上述差异。
- O使用绑定N完整报告hash的三条独立来源反馈，要求实际AI修复必需空数组、腐化阶段条件与戳刺save类型，不修改原始MD、IR或Actor JSON。首次Bun进程在任何输出/网络请求前异常耗CPU且没有创建输出目录；独立只读扫描/解析/hash预检通过，核对PID后停止该自有进程。重新启动于18:20:53正常进入龙兽新review。
- 最新Forge回归208/2061、typecheck:all、typecheck:packages、architecture（11442 modules/12600 dependencies）、31文件AGENTS及26项handbook检查均通过。一度并行release与release测试争用dist导致ENOENT，顺序重跑208项全部通过后重建候选；最终归档SHA256为42556a475790d7c4827c47268b8dc5b689a26593ed5325e9a311b52cb9b49beb。
- 最新0.3.0候选已重装本地mirror并逐个回读7文件哈希；Foundry仍停止，真实人类MD生成宏/整包和新Lab验收仍待完成。
- O于18:33:23完成龙兽review，accepted且findings为空。晶体真实AI修复于18:39:50完成，补回legendaryActions: []，腐化两项均标记staged:true，戳刺activityType=save；严格validator通过后进入来源review。只读正式投影核对HP15/AC17/无生命骰、月石戳刺DC18 dex/2d6穿刺/onSave none/10尺sphere正确，腐化DC18 cha保留且没有同时应用的原生状态effect；仍保留明确companion待处理，不构成宏或Lab通过。
- O晶体review于18:53:18返回revise：三条为审阅契约混淆（可选legendary对象与必需legendaryActions[]混淆、原生零资源容器误当授予、Actions标题误当必需action消耗），一条为真实生成缺陷（源动作+special错误投到特性分区）。修正prompt版本20/25/20，明确必需数组、source section与成本独立、schema零资源适用边界；bare空标题仍可能触发现有presence诊断并保留needs_review，未扩大validator接受面。生成器displaySection从source section解析，activation不变；正反分区回归新增并纳入安全wrapper。
- 本次静态独立复核PASS，聚焦332/1461、typecheck:all/packages和anti-overfit18通过。P于18:59:32从O真实IR重新验证和review，本地桥接在前一轮结束后更换为本任务自有PID51348（新2小时期限），仍使用Luna Max。未修改原始MD、IR或既有报告，尚无AI宏/整包/本次Lab。
- P于19:12:31给出错误review：依据新增提示中“Never derive an action cost from a heading alone”要求删除龙兽5个普通Actions能力的action类型。该提示过宽，推翻此前认为澄清已足够的静态结论；在实际AI修正完成前停止自有CLI及桥接，没有采用P修改。提示收窄为标准NPC分区提供默认action/bonus/reaction/legendary，仅正文明确自动触发且无行动消耗才special，显式消耗仍优先。版本21/26/21，332/1461回归及独立提示优先级复核PASS；真实下一轮仍须验证。
- Q于19:14:52从O的两份真实IR提案启动，未使用P错误意见/修正。新自有桥接PID10824，2小时期限；尚在dragon review，后续晶体、AI宏、整包和本次Lab仍待完成。
- Q于19:27:05完成龙兽review、19:31:00完成晶体review，二者verdict均accepted且findings为空；龙兽5普通动作保持action，晶体戳刺保留save/special且来源分区动作。每只Actor只剩两个已声明staged companion诊断，满足进入宏阶段的严格条件。19:31:00已调用真实AI生成配套宏；尚未产生宏审核/整包/本次Lab结果。
- 当前最新候选归档SHA256为c19ed8ce1ab0da62aa110577ac3c7cf2f3371cb4069b8dbd8927430ccc84ae1a，已安装本地mirror并回读7文件；26项handbook同步检查通过，Foundry尚未启动。
- 用户于19:44要求若卡在AI Intake则暂停。已停止Q的自有CLI PID32908及桥接PID10824；宏请求从19:31开始，停止时尚无完整automation输出。Q报告保留原始running快照而未伪装完成，另以.pui/human-encounter-user-stop-q.json记录用户停止原因、时间、PID、报告hash和两Actor accepted结果。未启动本次Foundry/Chrome验收，未生成可导入AI整包；整条目标未完成，需用户再次要求后才恢复。
