# Forge 第一轮生成优化

用户授权仅缩短单怪物流程、补来源完整性检查、保护关键规则译文；海妖婆及Faldric the Archer/Gremishka三个真实来源实测，同步手册，不合并master。继续现有codex工作树；不改图标、战斗控制或全局工具。

复用正式生成、现有coverage/evidence IR、失败续跑、翻译token保护与GM批准。单生物快捷识别必须确认唯一完整statblock，含糊或多生物回原有发现流程；来源缺项在IR校验层暴露，未知机制仍GM处理；规则保护不改变旧翻译身份或新增审核请求。

基准：三个来源各运行一次旧/新正式公共workflow，固定DeepSeek/deepseek-flash/openai-chat/json_object/low、同一来源hash和deferred审核。记录实际HTTP生成/翻译请求数与阶段耗时；不记录Key/完整请求/原始响应/推理文本。首次提取与完成候选正确性分别审核，修复不计入无修复首次正确；失败保留原件，不因新代码修复重跑覆盖首次结果。旧流程使用本轮变更前的模块快照（只在正在运行的Bun内存中冻结，不创建备份checkout或旧模块副本）。

检查：快捷路单/多/模糊/前后引用保留、来源coverage伪忽略/遗漏/法术等级等局部回归；worker拥有规则短语与现有localization回归。整合一次受影响Forge/Intake、包/模块类型、build/architecture、局部anti-overfit与来源核对。最后原Chrome执行器一次批次导入可审核的三个候选、刷新与精确清理；实测失败保持失败，不能改标签凑通过。手册按实际结果更新并生成。

旧版基准三例均未形成完整可审中文候选：海妖婆discovery225秒后提取schema失败；Faldric正式技能投影不符；Gremishka能力配置源绑定编译失败。首次结果保留，不换样本、不另修未授权投影/能力机制。首轮本地整合517通过/10失败，其中9个是旧Guard调用次数仍期待discovery1（新明确单生物已0），1个为第二编号生物漏拒绝；修对应断言与保守识别。独立审查另发现加粗属性误判能力、定义末段例外/CRLF偏移漏检，补实际反例后定点再验。真实API结果需与新结果按各阶段和失败状态比较，不把早失败当作更快生成。

最终530项Forge/新回归、全仓类型通过；独立审查的3反例复验修复。真实优化首例海妖婆提取+修复143秒/2请求，仍未通过：新来源检查抓到引用定义遗漏，同时误把PDF断行后的小写damage/next turn当标题；修正新检查只认明确标题，不重做首次提取。Faldric根因已定位为提取输出Acrobatics/Perception首字母大小写，renderer原已有映射只接受小写；本轮只补现有技能名大小写归一化并保留数值，不开发新技能投影。首次快照保持失败，修正后仅复用该IR正式重投影，不能重记为首次正确。

进一步证据更正Faldric主因：IR技能名实际为小写，大小写兼容有回归但不是该样本的主阻断。源未显式PB、导出Actor.prof亦缺省，Intake verifier把派生PB按0计算，造成技能/察觉/命中假漂移。复用ActorGenerator现有CR/level推导公式修正只读投影校验，补CR3/7/分数和显式PB覆盖测试，不新增机制。原6次首次结果不改。三例初次续跑中Gremishka24秒/3翻译HTTP成功、0宏；Faldric0HTTP暴露上述校验；海妖婆1次修复后定义仍漏，停止同路重试。后续仅复用已验证同源R4海妖婆IR/配置与原Faldric IR继续生成/翻译，不重提取、不计首次成功、不增加付费审核。

后续读取cn.json核得Acrobatics受支持译名为“特技”，旧renderer“体操”无法映射acr；只修该既有字段译名，不实现额外技能机制。海妖婆同源R4续跑3翻译请求118秒，2个Activity术语字段及包级Saving Throw术语被挡；按原功能只续失败字段，其余复用。把这两个已有明确机械术语也纳入本地token保护，避免再花请求修同义译法。补native无宏候选主动点击AI审核的兼容回归（默认仍0，主动仅审Actor而不审空控制配置），以及仅空白包围的章节标签归一化。初版优化实测是开发中版本，源代码清单已留存；最后冻结当前修正版，再对同一三来源各独立运行一次final测量，结果单列，不覆盖初版失败或把续跑充首次成功。最终样本每例只跑一次，不继续拟合来源或扩展机制。

冻结版536项集成、全仓/package/module类型、build及22来源anti-overfit通过。final三来源已跑完：493秒/9HTTP、29秒/1HTTP、89秒/4HTTP，付费审核均0；完整中文首次正确仍0/3。明确单体发现请求3→0，小法妖控制配置0，但不同停止阶段不能宣称整体提速。海妖婆内部规则ID与小法妖DM缩写被中文检查挡，Faldric反应伤害投影仍阻断；不放宽/换样本/扩机制。实际对照与续跑边界已整理到[接受记录](../acceptance/2026-10-11-forge-first-pass.md)。有效海妖婆R2及小法妖续跑包已按公开workflow形成明确测试批准fixture，canonical verifier通过，独立Chrome执行器已收一批导入/刷新/精确清理合同；浏览器收据尚待回传。手册补用户流程及有限检查边界，6个stale条目按实现与来源人工核对，不改变CLI独立审核策略。

补充来源验证文档后另触发markdown-convert条目stale；原6项review后build正确拒绝未复核的第7项。核对普通Markdown→workflow命令、v14/core/icon-off及输入输出步骤不变；新增内容只明确Intake来源检查有限和派生PB核对，不改变普通转换行为。单独记录此项review再build/check，未缩小watch。

2026-10-12首批Chrome回传：两例公开UI产物与工作流逐字段一致、普通GM确认导入/正常刷新/精确清理通过，0模型请求，目录287Actor/94Macro及Guard/无Key恢复。手册file:协议被官方工具明确拒绝，保持NOT_EXECUTED不绕路。验收发现海渴症keep food down被误译为“咽下”，更正此前该句译义PASS；通过已有本地正文修正和公开workflow只改一字段为“不吐出”，来源/请求hash、Items及其他系统字段不变，0模型/源码修改。原执行器已收最小单句导入/刷新读回合同，其他有效证据复用；尚待此补充收据。

补充收据已到：修正包公开产物、普通导入、同ID刷新后的全文/“不吐出”读回PASS；parent重核收据SHA、结构/文本相等及可读截图。精确清本批1Actor/1Macro，原集合/Guard/设置/无Key恢复，0模型/服务/战斗操作。三来源实测与两续跑候选的运行证据已整理完；代码与手册检查通过，首次完整中文可用性仍PARTIAL(0/3)，保留3个实际阻断，不以续跑冒充首成。未新增commit/merge/push；master与工作分支HEAD均未移动。

2026-10-12用户授权只修上述三个阻断，不放宽校验，随后原三来源各一次新鲜真实测量。先用保存失败IR/译文建立不联网的实际工作流RED回归；反应链与两个译文问题独立分工，单写入者。检查回答：反应攻击实际伤害与validator投影是否相等（含绑定属性、错误骰式/未绑定变量反例）；内部ID仅按已绑定规则投影显示标题，未知/歧义不得放行；DM在现有翻译链规范为GM，数字/标记/正文检查保持。定点绿后跑受影响Intake/Forge/中文整合、类型、build/architecture和局部anti-overfit；再同来源hash/模型/协议/low/中文/deferred实测，实际HTTP和完整中文首成计数与前次final单列比较，不覆盖旧失败。必要浏览器只补本次变化，不重演图标/战斗/旧手册协议拒绝。源码/文档在原授权工作树继续，付费审核默认关闭，不新增提交/合并/push。

三阻断已最小修复并红→绿；Faldric实际@mod伤害一直存在，修的是绑定属性的只读核对，不改Actor生成值。严格validator保持；规则ID只按配置投影标题，DM只改受保护传输。独立审查引入的跨Actor同名误拦已修并复核。冻结813项整合、全仓/package类型、build、1309模块架构和23来源anti-overfit通过；两个新增回归接入原测试入口（同一整合已显式执行这些文件，不重复完整整合）。16文件安装/HTTP核等，新JS aa2004...10d76，仅JS变更，无服务操作。原3来源一次fresh模型测量已启动，结果/手册与[本轮修复记录](../acceptance/2026-10-12-forge-three-blockers.md)继续同步，旧失败不覆盖。

原3源fresh已完：Sea43秒/1HTTP上游schema失败保持；Faldric84秒/4HTTP无IR修复完整中文、Grem73秒/5HTTP含1自动IR修复完整中文，源义独立核对通过，首轮完整候选0/3→2/3；不得用不同停止阶段宣称整体提速。Sea仅用前次同源有效候选/Actor111译文补测包级ID，2HTTP/29秒通过，旧GM总结替目标选择的矛盾用已有本地正文修正2槽，0API，不算fresh。3份canonical verifier均过；新Grem批准包/Actor与前批UI字节/字段相同、导入逻辑未变，复用旧运行证据。原Chrome执行器已收Faldric+Sea受影响读回/一次刷新/精确清理合同，尚待回传；不重演Grem/战斗/图标/手册拒绝。手册6项review后33项build/check通过。

浏览器回传Faldric原生读回实际阻断：$.items[4].activities[0].value.range.long，自动回滚恢复287/94集合，未测Sea。按钮误判又点一次已承认，内部尝试/UUID次数UNKNOWN，不再原路试第三次。实际5.3.3 source map RangeField只存value/units/special/override，没有long/reach；weapon的getRangeLabel读取parent Item.range.long，runtime原已有按parent重建的严格读回。下一条检查是fixture真实生成+只清掉RangeField未支持字段后做现有严格readback，区分丢字段与比较器问题；不得忽略long或改宽读回。最小生成候选仅对v14带明确长射程且已有native base damage的反应/附赠攻击使用原生weapon载体，保留原activation/伤害/Item数量，其他情况不变。检查多个源形态、错long仍拦、原普通武器/近战反应及v12不变。真实新鲜模型测量原件保持；如修正最后原生投影，仅本地重放同源IR/译文，再窄补实际导入，不额外跑模型或把续跑充首次成功。

源schema反证后修正计划：原生投影确实改变正式产物，旧2/3只能保留为候选层，不足作最终可导入率。因此最终冻结后原三源各一次新鲜测量，保留上一版全部失败与调用，不择样/续跑充首成。RangeField3真实输入重放红→绿，wrong-long仍拒绝；最终817项Forge/Intake、286生成器、类型/build/23来源anti-overfit与1309模块架构通过，独立审查无新问题。仅JS新8691...5cf8a已装/16HTTP核等，无服务操作；最终fresh-final在运行，受影响原生读回将用最终候选重派，Grem未变路径按精确包hash决定复用。

最终冻结版原3源独立fresh-final已完：Sea91秒/2HTTP（提取+1修复）仍漏Hag Debts/Merthirst定义，来源完整性阻断保留；Faldric57秒/4HTTP、小法妖100秒/4HTTP均1提取+3翻译、无IR修复，完整中文与独立核源通过。完整候选首成0/3→2/3，无IR修复完整候选同为2/3；不同停止层不能宣称整体提速。此前493/9、29/1、89/4与首版43/1、84/4、73/5均保留，最终另存final-comparison.json。累计本轮Forge HTTP22（首版10+Sea定点续译2+最终10），付费审核0，不含Codex开发调用。三个最终测试包正式CLI verifier均过；Sea明确为旧同源续跑及两个记录过的本地GM指引修正，不计首成。小法妖简介措辞变化使最终包hash改变，原Chrome执行器已收最终三候选导入/刷新/精确清理批次forge-three-blockers-native-range-final-20261012，运行结果待回传，不用旧hash证据覆盖。手册长射程载体说明与3个受影响review更新，最终build/check33通过；不扩大机制、不放宽readback、未提交/合并/push。

最终Chrome收据已到并经parent核证：新JS8691...5cf8a身份正确，三公开UI产物与正式工作流逐字段相等；Faldric原生反应+5/1d8+3/150-600及正文刷新保持，小法妖最终传记/条件正文保持，Sea续跑包14Item/两定义/五中文规则引用/目标自行选INT-WIS刷新保持。每例一次提交，共3Actor/1Macro，一次刷新后精确清理，原287/94 ID集合、Guard、十设置、空任务与无Key恢复，0模型/服务/战斗调用。parent读回及六代表截图通过，收据3bb55e...20b48；批次1298秒另计UI验收，不混入生成耗时。首版原生失败与Sea最终fresh定义遗漏保留，完整候选首成仍2/3。限定修复/测量/运行验收/手册同步完成，剩余Sea提取完整性明确留存，不扩范围。master与任务分支HEAD未移动，没有commit/merge/push。

2026-10-12用户继续授权处理，先限定引用定义遗漏。沿用同一任务worktree，保留所有旧失败/产物，不新增提交/合并/push。当前最小检查：重放最终Sea失败IR走公开Forge分析，确认完整原文只在coverage中出现、未进入输出；合成不同名字的中英文引用定义走同入口，检查完整多段正文、例外、精确来源证据、scope、幂等及输入不变，原validator缺失反例继续红。计划仅复用IR现有传记/文字保留和来源事实规范化，不猜自动机制，不增加付费审核或额外提取/修复请求。定点通过后才跑受影响整合/类型/anti-overfit与正式生成/核源；冻结后同Sea来源独立实测一次，记录耗时和实际HTTP，不挑重试覆盖首次结果。若产物变化，再窄补该候选导入/刷新/清理，复用不受影响的其他怪物证据，更新手册。

引用定义遗漏已稳定回放为两个SOURCE_DEFINITION_OMITTED，0网络；同缺陷合成回归先红后绿。只改既有source-facts规范化：复用严格检查识别的精确引用定义块，完整原文附入传记并记录preserved-literal来源/coverage，不新建Item或自动机制，Browser与CLI共用。已完整落点不重复，截断范围末块不自动补写；输入、未知机制、错误身份、冲突claim与无效证据仍校验。边界测试发现范围截断和空evidence两个新分支问题，修对应防护后8定点通过；formal测试对rawJson误做JSON.parse只修测试读回。原Sea失败IR重放转ready_to_generate、0模型。825项受影响整合/5456断言、package/全仓类型通过，24来源anti-overfit和1309模块/3100依赖架构通过，Forge构建通过。原同hashSea一次fresh已启动，其他两怪物不变证据复用；模型/中文结果和窄原生验收尚待完成。手册明确传记位置、例外/译义与GM边界，付费审核默认关闭。外部脚注遗漏报告位于PDF导出层，与本地已含原文的IR遗漏不同；不采用提取器改动，记录见[窄排查](../reviews/2026-10-12-forge-reference-preservation.md)。

本轮Sea fresh136749ms/2HTTP（提取+一次修复）已保留两完整定义，但正式生成被英文同名限定别名的嵌套标题拦住；首次仍失败，原件不覆盖。最小回放及三个不同名称/限定的正式GM载体回归先红；抽取现有共享标题格式，能力YAML与精确GM绑定共用，只有完整同名前缀加括号限定才省去重复原名，空格按原生双语显示规范化；普通双语不变，不同身份的嵌套别名仍拒绝。4项定点通过，没有修改strict findItem/readback或新增机制。重放随后暴露本次模型IR的Seed Terror原生save缺ability，原文确实由目标选择INT/WIS；保留此阻断，通过已有sourceFeedback明确要求保留完整目标自选/DC/期限等GM裁定，不替目标挑固定属性。只复用本次IR续跑，不重提取、不算首次成功，不增加付费审核。首次fresh与源反馈续跑各留目录。

Lab旧PID6156和30001均已停止，安装守卫在任何写入前拒绝，未生成安装收据。只读核对无Foundry实例后，按tools/foundry-ops既有本地启动授权，以正式launch server-mirror启动同一14.368/5.3.3/cor-cotn、loopback/noBackups实例，新PID37608；不创建新Lab、不改版本、不操作其他服务，收尾保持常驻。此前通过的源码检查保留；标题格式变化后只再跑受影响整合/类型/构建/架构和anti-overfit，最终中文与原生结果待完成。

源反馈续跑33991ms/1HTTP修正了缺ability的save，但模型仍将明确的目标自选规则标为blocking AMBIGUOUS_SAVE_ABILITY，保持needs_review，不清除标记或强填属性。改用本轮原始修复对象——前轮同hash、只因两定义遗漏被挡的原IR——验证保留链，0重提取/修复；实际固定配置提案1HTTP/31134ms后，整包门禁抓到Sargassum Grasp普通失败分支因PDF换行成为literal-save。精确canonical路径已核，非传记保留造成，也没有跳过门禁。source-derived save-outcome只识别明确正向普通/首次失败条件，句末/空段、否定/免疫、仅失败差值/第二次失败和未明确成功分支继续literal；3个不同条件的LF/CRLF完整Actor形状正例及负例红→绿。

复用同一原IR与实际固定配置提案、重跑公开prepare后，正式英文候选可审；238439ms/6翻译HTTP仍被包级actor-1/legendaryRecovery残留阻断，Actor中文已有效保存。仅显示请求按已声明角色key投影名称，将固定配置词变为普通文字，原包、command/ID、数字参数保持；未知角色引用仍拦。旧raw和旧rule-title-only批准请求按原requestHash兼容，显示字段也按对应身份读回；新增回归核对。旧Curse形状对比唯一失败是内容图标因正文不同而不同，按已接受内容图标功能只规范展示img，DC/Activity/Effect与其余机械结构仍全等；不修图标匹配。本次只重译改变的包级显示字段，复用有效Actor中文，旧失败和6次费用保留，不算首次成功。

包级续译2HTTP/46秒完成，Actor译文复用，合计本轮Forge HTTP12（fresh2+来源反馈1+固定配置1+译文6+包级续译2），付费审核0。原PDF人工核对发现传记Merthirst仍误译“咽下”，改为海水送服才能不吐；统一同一定义的中文名称。Death Glare模型GM总结额外写instead，按PDF保留普通失败结果并追加降0HP，补全一处被截断的操作摘要。均经既有本地正文修正API，8显示槽、0模型，原来源/请求/数字/标记/绑定不改，不算首次正确；没有扩展新翻译机制。当前测试包12主体Item+传记两完整引用定义/1Macro，公开prepare/测试确认及CLI source verifier通过，hash7f2db8...21a2e3；完整链仍依赖同源已保存IR续跑，本次fresh与来源反馈保持失败/待GM。

save-outcome是共享投影，因此最终收尾补当前生成器回归和V12静态保存分支门禁，受影响Forge/Intake/译文/新正反例一组整合、类型、架构/anti-overfit及最终构建按冻结代码检查；不重跑全仓CI或战斗矩阵。最终Actor包身份变化，需仅补此Sea候选正常导入/传记定义/原生参数/同ID刷新/精确清理。其他两怪物不受本次输入变化影响，沿用原件；浏览器手册file:策略拒绝仍NOT_EXECUTED。

本轮最终842项整合/5670断言、286生成器、19静态V12/治理、package/全仓类型、build、1309模块/3101依赖架构和26来源anti-overfit通过。readonly测试fixture只改不可变构造后9项定点与类型复验，旧机械/运行证据不重演。核源又纠正Sargassum必然拖动，正文修正共10槽；最终包b764b1...5d02，12主体Item/传记两定义/1Macro，source CLI verifier过，0模型。最终JS c019f1...b744仅JS安装/16HTTP核等，PID37608/30001同Lab保持。手册33项build/check通过。本轮模型HTTP12/付费审核0，新鲜开发快照及源反馈仍失败/待GM，最终候选系同源草稿续跑，不计首成。原Chrome执行器已收forge-reference-definitions-native-20261012单Sea导入/刷新/精确清理合同，尚待回传；不轮询，下一步只整合该收据。完整分阶段证据与剩余项见[引用定义验收记录](../acceptance/2026-10-12-forge-reference-definitions.md)，没有提交/合并/push。

原生收据9e213b...9cb2已到并经父控核对artifact、刷新同12Item ID/全文/五参数、三个代表截图及恢复：一次导入/一次刷新/精确清1Actor+1Macro通过，287/94实际完整集合、Guard/十设置/空任务无Key恢复，0模型。新owned tab651343842替代不在库存的旧tab，其他五页/同服务保留。发现包级note误说Steal只有Utility，另把本包未匹配的复杂状态组合说成状态不在目录；原发现不改写PASS。只经已有正文编辑修正同一包级槽，0模型/源码；新包1c7dbf...99b0、Actor hash仍c366...c57d2且整份逐字段相等，宏名称/command/绑定/covers亦相等，原原生接受按精确组件复用，不重演导入。原执行器已收note-preview小批，仅正常预览新说明/核公开artifact/清任务恢复，0世界文档写入/刷新；此显示收据待回传。当前剩余步骤仅整合该回传并收尾，fresh失败和需要GM核源边界保持。

说明补读回6e3710...b010已完成并经父控核对：UI导出新包hash精确、Actor与前批逐字段相等、固定command及宏组件不变，新句和四状态名称可见，旧两误述消失，截图清晰。0导入/世界文档写入/刷新/模型，清任务与Guard/十设置/无Key、287/94集合保持。原生和显示均已接受，本轮限定交付收尾；最终可用候选仍为同源草稿续跑+本地核源修正，不计首次成功，目标自选豁免提取表示和自然语言译义仍是明确剩余边界。手册/必要检查保持，所有失败及12次请求保留，付费审核默认关闭，无commit/merge/push。详细原件及状态见引用定义验收记录，当前没有等待中的执行批次。
