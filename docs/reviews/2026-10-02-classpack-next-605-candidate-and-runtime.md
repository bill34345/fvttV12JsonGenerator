# DND5E不全包：Next6.0.5候选、来源修复与运行门禁

批次日期：2026-10-02，继续至2026-10-03。当前状态：不全包为原94+本包95启用；r7、明确次数字段修补及构建报告路径检查共42项classpack检查通过，既有4项DAE合集守卫检查仍适用。原单次迁移完成21合集后发现秘法眼原效果被DAE删除，原FAILED收据保留；已正常API只恢复该效果，独立COMPLETE恢复收据、全量来源与普通客户端重载均通过父审。21合集/5655顶层/13303可达原记录及18原孤立行、5530原生投影保持，游侠公开source hook进出平衡、无新增相关错误。歌利亚三授予、游侠一级PHB宿敌/自然探索者、头盔真实施法配置与Cancel已接受；石之坚韧按原文修max为@prof，正常长休回满2次、真实使用后剩1次并掷1d12+2，普通重载保持。原scalar保全检查误判的是4个系统派生显示字段清洗，已核精确源码和全字段差异，作者数据保持；原失败保留并另有COMPLETE恢复。04a9e7ae批末精确清理已父审通过，原世界及1419条Chat ID集合恢复，本批角色/物品/消息/Macro/owned页全部0。根测试41PASS，手册31项机械检查通过，页面目视因正式Chrome不允许file://协议而NOT_EXECUTED；拒绝原件和该次空白页关闭回执已保留，未绕过。未接受27宏全玩法、实际Teleport或完整受伤反应链。唯一当前总状态仍在[迁移总表第5.15节](../plan/server-next-migration-handoff-20260927.md#515-原迁移收尾之后的新适配范围与执行顺序)。下文早期阶段与失败均为历史证据，不覆盖此当前状态。

## 本轮限定接受结果（2026-10-03）

证据根：`F:/FoundryLab/foundry-v14/evidence/server-next-migration/classpack-next-20261002-b322ea20`。实际目标为Core14.368/dnd5e6.0.5/cor-cotn，95启用模块保持。

| 层级 | 已接受结果 | 原件入口 |
| --- | --- | --- |
| 固定来源及迁移恢复 | 21合集、5655顶层、13303可达原记录与18原孤立行、5530原生投影；规则/ID/正文/活动目标保护。原单次迁移FAILED保留，秘法眼原效果独立恢复后COMPLETE，不重放。 | b796c62f-report.json及对应native原件 |
| 歌利亚授予 | 正常UI完成六步，三项特征来自准确MPMM来源，Advancement origin与原ID保持。 | 6850b813-r2-final-before-cleanup-native.json |
| 石之坚韧 | 原文PB次数对应max=@prof。正常长休回满2次，正常使用一次后剩1次，真实1d12+2掷出12；worldTime不变，重载保持。 | 38ee6abb-after-long-rest-native.json、after-one-use-native.json |
| 游侠一级 | 正常Modify Choices选择PHB宿敌并实际授予，保留自然探索者和39进阶ID；Tasha替代项未选择。 | 38ee6abb-ranger-after-choices-native.json |
| 传送头盔 | 正常Cast入口解析原Teleport，显示Consume1of3配置，正常取消且充能未消耗。 | 38ee6abb-helm-usage-dialog.png、before-reload-native.json |
| 持久化/错误 | 普通客户端重载后上述字段/授予/原世界ID/95启用集合保持，相关新error0。 | 38ee6abb-after-client-reload-native.json |
| 精确清理 | 本批1角色/9内嵌物品/2消息/1Macro/1当前owned页清除，原294/213/65/90/12/67及1419Chat IDs精确保持，原迁移settings保全。 | 04a9e7ae-finalize-native.json、tab-close-receipt.json |

这些结论不覆盖27个宏的全玩法、完整Teleport或受伤反应链。失踪自定义召唤/辅助法术按用户选择保留后续。未验证生产或长时，源码已纳入本地迁移分支检查点，未合并/推送。早期失败和工具输入规范化记录均保留；派生来源显示字段的正常清洗已凭6.0.5 SourceField源码与真实全字段差异核清，不放宽正文、规则或未知值。

## 已授权范围与保留边界

用户明确处理不全包，继而选择“先完成6.0.5兼容和明确修复，缺失自定义对象单列后续处理”。使用4.3.4原包与已有V14修补，保留21个合集名、新图标包名new-icon、原规则和所有已有ID；不引入4.4的spell改名或自动世界UUID替换，不重造失踪自定义对象。其他自有mod后置；DMTools、Plutonium和原暂停/付费边界不变。

目标仍是原Next30002/cor-cotn/Core14.368/dnd5e6.0.5/DAE14.0.14+servernext.1/Midi14.6.0-beta.4338eeab.local.10。新只读Chrome前检已父审：102行/94启用/8关闭，94个ID与前接受集合逐项相同；不全包当时缺席。准确配置为6.1-sol/medium/Full Access，出生页651338501保留本批；未碰Mirror/生产/旧1840510。

## 来源与离线接受

[固定v4.3.4官方发行元数据](https://api.github.com/repos/HJSmile/classpack/releases/tags/v4.3.4)的169391117byte压缩包SHA256为8dceac980d5521c3119141ee166589a0f5ab78c13d9987f61c33f96c72fe22c1，实际下载一致。它是适配工作输入，不是运行实例或备份。原包解出3623个文件/目录项；候选最终3337个文件。

全量离线记录为5655顶层文档、13559数据库记录、39014身份位置；固定身份SHA19dc85310c69137b159945ac50f00b76e7cdba49e7b43b131592fa3bfda48b21保持，0本地图引用缺失。已复用12独立Macro纯函数修补，另按原命令hash修13个Item的15个嵌入命令字段；候选旧API/语法审计剩余0。这些是代码/输入证据，不是27个宏的玩法结果。

确定内容修复：传送头盔原文明确现存Teleport，只改Cast活动目标；原记录SHAfa7592b11c67c520bd642f64af6b99e449f1714aab26282758ff1b44a2ba57e0，充能/消耗/环阶/ID不变。另外原PHB法术表将旧Amu明确标为神莓、现存唯一神莓为2014版；源背景文字或直接现存链接确定附盖提灯、灯油、工具锤、高档服装、祭袍。六组同源别名修17处引用，规则文字仅更新链接目标，历史溯源不改；没有新增文档或改成2024规则。源上下文、原件SHA与具体字段在候选目录审计及主控 `.local/classpack-next-20261002/reference-observations*.json`，不以名字相似替代来源。

残余引用审计有33个条目，10个首发现位置在授予/活动/法术列表路径；其余包括旧溯源、说明链接和嵌入目标，尚未全部接受。Dust Devil缺失召唤Actor、Open Hand/Sun Soul失踪辅助法术及数个特殊背景物件保留为后续；不替换为规则不同的普通法术，不宣称它们已经可用。

## 运行代码与独立复核

运行入口仅注册inventory/preflight/migrate，不在ready写合集或世界。preflight比较全部加载ID/名称/原文/Advancement ID与活动UUID，严格校验并拒绝遗失文档；新目标专属收据绑定Core/系统/DAE/Midi/源与代码hash，旧5.x标记不构成6迁移完成。正常API迁移按16个Actor/Item合集严格运行，原生dnd5e与DAE操作均finally恢复锁；失败保存准确完成合集/失败点并拒绝整批自动重放。

独立review发现并修复两项P1：6.0.5真实模型把Advancement数组改为按ID对象，现已统一规范化；准确COMPLETE收据中的合法重复效果删除，重载后仍可以验证且不重放。新增回归同时拒绝名单外删除。P2并发边界用单执行器合同约束，代码不宣称跨客户端原子锁；等待之后重查GM/收据，旧运行不能覆盖另一runId。

`bun run --cwd foundry-modules/server-next-external-candidates test:classpack`在本机Bun1.3.8为15/15 PASS，覆盖目标、前检失败不写、旧标记、重载删除、同客户端重复、失败保留/他人收据、DAE锁和来源引用范围。独立复核修订冻结代码后无剩余P1，源码/构建/manifest三者运行时SHA一致。没有跑全仓CI或把Bun1.3.8结果当1.3.14固定CI环境接受。

候选4.3.4-next.1：manifest SHAa845192224a0dde219a34069503db898ee8b869a1878d683957a106ee6a25d77；runtime SHA64d470577637a9a7ce8a6244dc0854939ecd5acec84143ed55a12791aa70519e；source-baseline SHAef570e22d5b3a7c77fcaa03656a3621c87e8b10b5f36e8036e88f429ee47af96。

## 安装、派发与未完成门

主控只写原Next此前不存在的dnd5e_classpack目录，源/目标3337文件逐项字节和SHA相同，manifest最后落地以避免扫描半包；包指纹a1a7f38ef7cfcb10543ed8b54811eb9bda0e1c4ebf0c4da31ce941e389b90e33。首轮copy前被自建空目录触发EEXIST，确认0文件后仅恢复该本任务空目标；旧失败install-receipt与新install-recovery-receipt分别保留。没有覆盖原模块、创建备份、复制运行世界或编辑已运行数据库；PID39148及服务active保持。

新Chrome派发624061f4-7c46-440d-bf93-b6a611e9572c/revision1只允许正常世界关开登记、模块开关仅新增本包、一个出生只读检查Macro及原生回执。期待103管理器行、原94+本包=95、21合集/5655顶层/13321源文档记录，原Actor/Item/Scene等ID保持。出现FAIL保留Macro/页面，不调用migrate、不进口角色或投骰。出生Macro后续同批清理，当前没有宣称清理完成。

共用V1文件工具已用于3009byte检查Macro输入的prepare→ready→execute→collect，收据de1f4ce1-c088-43df-acaa-9f8b353c3fe4为PASS/COMPLETE，仅文件检查。首次PowerShell输入构造错误被前置拒绝后修正，失败没有派发运行；未另造共用框架。

执行器回调030ed053-8cbd-4e2d-b200-df00981e5f87为正常Return to Setup之后的Chrome传输阻塞，未Launch、保存开关、创建Macro或执行前检。主控按用户既有fallback授权通过正式Chrome正常启动cor-cotn、空密码Gamemaster登录，只启用dnd5e_classpack并确认正常重载；实际103行/95启用，原94 ID保持，其他8关闭保持。PID39148与目标版本不变；没有Computer Use或服务重启。证据root-registration-before.json、root-activation-receipt.json、root-module-enabled.png分别保存前后状态与视觉原件。新出生页面651338506位于/game，旧出生651338501仍在/setup，后续精确清理；未碰旧1840510。

本阶段余项：真实严格模型与源差异回执；随后才能立单次正常API合集迁移合同，再做用户范围内代表性导入/授予/活动UI、迁移后正常重载、来源保持和出生对象精确清理。新合同70e3e9c6-a984-4d9a-bef4-1ef492347ec2/revision1禁止重做世界关开与模块保存，只读探针保持3009bytes及原V1收据。F盘证据根为server-next-migration/classpack-next-20261002-b322ea20。无commit/合并/push，原已批准迁移收尾不重跑。

该合同唯一出生Macro7Bm4CY4NMBNjvKHx正常Save/reopen后读回3008bytes，SHA9f9a3864a9a3df6901636119af02a9f96bc70485e1df4c8ff37ee76282746ffb；执行器因整文件SHA不符停止，Execute0，原90宏ID保持。父逐字节确认两次读回均只少原件末尾一个LF，Core实际Macro.command StringField默认trim:true/clean(value.trim())解释了正常保存结果。父冻结仅去掉此LF的文本并执行node --check通过，不改原3009byte/V1输入、不一般性忽略空白；parent-inspector-normalization-acceptance.json留证。新合同132b9ef7-b2e6-4fcd-9796-f2009f1234e9只复用出生宏、核固定规范化全SHA后单次只读执行。旧出生Setup页已精确关闭，game页保留；schema仍未执行，其他后续门不变。

实际一次执行来源FAIL：BackgroundFeature的Q5zSBfn4T0IH52mK“我来修好它！I'll Patch It!”正文投影SHA不同，未调用迁移。完整原件readonly-schema-native.json及回调dde135c0-d8d0-4a1d-862d-3067da489df8保存；六类世界集合完整ID保持，计数294/213/65/91/12/67。父只在离线关闭候选DB读取失败原记录，原规则正文存在；尚不能确定是模型规范化还是数据丢失。精确只读诊断合同cc45e07f-a04d-401b-9edd-3665d4570092复用出生Macro，取得loaded/prepared数据与21合集全ID/严格schema；V1文件检查收据a7cf1233-a657-4dfe-9ab2-89287ed02f13 PASS/COMPLETE只覆盖新诊断语法/边界。来源门保持FAIL，后续写入门不开放，未重写运行DB或清理其他报错角色。

后续诊断完整原件209187bytes/SHA238b46340366201d4388d08753937dbe27fdb337810a0623938a6bb9573086c2，真实21合集/5655顶层及strictschema失败0；父逐字段确定原正文/原路径/值保持，新增六个描述/Midi条件字符串为空。前检修复绑定baseline原textFieldPaths，所有原值SHA继续逐条核对、原空字段也必须存在；仅容许新增空字符串，拒绝非空新增/原文改变/原空字段删除。离线13321原textSHA全部不变，安全入口16/16 PASS，独立review无P1/P2。Next仅三份检查metadata更新并读回，数据库记录/服务操作0；新manifest aee90f5b183625c8f0b0249bd83cb53ae0f822ca8af676fab04922efe5f72cfc，runtime09e69b528ab27e22f4f9497ca9b22b7499d46aabd7f33d9a3b40e26770a66ded，baseline94e4406f4566de8188e04bdb1dbcd3828b7e36614aa8d09d632654cd637dc141。旧失败与初安装指纹保留；新完整来源门/迁移/行为/清理未执行，正常同world元数据重载与单次前检按新合同继续。

二次Setup传输阻塞后父正式Chrome正常恢复同世界，执行受影响前检及一次完整源诊断。新原件1100315bytes/SHAced9c43e81e4645f3481a16e08961736f9b3ba5feaf3df9d154333092c6f56e1涵盖全13321物理源行；264 text/4 name/14 Advancement/39 UUID/18 missing已经逐原源和精确代码分类。174表结果text改description，88HTML差异仅空元素写法，1表达式尾空格，1feat空旧unidentified字段；4name均未鉴定显示原名未改。18 missing是原父.effects没有列出的旧孤立行，保持原物理记录/哈希，不挂回。Tasha4.0.0当前初始化37额外Advancement及UUID用精确本机vendor脚本1d20c987899ff3c8d1fc67e2c9b91e93dbd942daeb1899250b3b14e4fed4d8af独立从原源模拟；实际启用/setting/版本/代码均匹配才采用逐对象固定投影，不豁免前缀、不测试付费功能。

唯一失效非空grant是MPMM歌利亚旧world Actor引用，其原d12+CON/PB次数/LR规则与现存racial-traits/BAX4NWZ6iTLGgf31一致。候选源SHA限门修2链接；目标通过正常API修同一Item1次，独立前后投影除2字段/_stats外相等，锁恢复/world全ID保持。首次断言误把null UUID行当整条删除，写入前被挡；真实三行结构读回后修正，旧失败和新V1收据7f5ace98-803c-459e-ac09-3f3f33462241分别保留。沒有重造缺失自定义对象或直接编辑运行DB。

综合projection revision3已21/21安全入口测试通过且独立review无P1/P2，三份Next metadata读回manifest c7cb37081597ef055146aeac05a8567c5aeaf48462475b5f2eabef0db89d0136/runtime c6cfe3fbded065dd311a21f48e0b74dc4996551da89140b923b5e3f256f1ccff/baseline3438b747847ab4e38130e689d1e5df4f24e3351c646a573dd72633aa99e6c11a。期望13,303可达记录+18原孤立行，5655顶层与21合集不变。完整真实源前检、16合集正常迁移、代表性行为、迁移后重载、最终清理仍未接受，旧失败不能升级PASS。

## 本地提交前的可重建性核对（2026-10-03）

历史candidate-report.json保留原字节；新构建报告写到忽略的dist/candidate-report.json，不再因已跟踪历史报告而拒绝新的候选构建。读取时优先新报告并核manifest/runtime/source-baseline身份；已有候选或新报告仍拒绝覆盖。原有候选产物、运行代码、来源基线与安装目标未改，原实机证据继续适用。新增纯路径/拒绝回归后test:classpack-next为42PASS；此检查不等于另一次完整构建或运行安装。依赖固定ZIP、精确Core与本地来源缓存的边界保持。
