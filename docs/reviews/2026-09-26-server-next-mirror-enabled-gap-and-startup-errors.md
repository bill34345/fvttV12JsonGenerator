# Server Mirror 开启项与 ServerNext 启动错误复核（2026-09-26）

> **专项证据，不是当前进度表。**本页保留标题日期的来源和检查经过；其中“当前”“未执行”等只属于当时。新对话以[唯一迁移交接报告](../plan/server-next-migration-handoff-20260927.md)为准，仅在核对应证据时读本页。

## 给使用者看的结论

**Next 现在并没有照搬 Mirror 的开启清单，而且重新进入 Next 游戏时确实报错。**这次只读对账发现 Mirror 世界保存为开启的 78 项中，Next 实际运行 52 项；另外 26 项在 Next 连模块文件都没有。Next 另有 22 项开启，而 Mirror 保存为关闭或不在其开启清单里；所以 Next 实际运行 74 项，并非“和 Mirror 一样”。Mirror 当时有 1 人在线，本轮没有登录或修改它；78 是其世界设置的**保存开关数**，不能冒充当时客户端实际载入数。

此前的85项清单只覆盖已选定的一部分：在这26个缺失项中，仅 `plutonium-cn` 与 `fvtt-json-forge` 列于旧85项，另 **24 项根本未列入**。因此“85项里只缺两个包”仍是该清单内部的磁盘计数，**不能回答整个 Mirror 世界是否已迁完**。本轮没有为了凑数批量安装、开启、关闭或更新任何模块。

## 当前数量对账

| 层级 | Mirror | Next | 说明 |
|---|---:|---:|---|
| 世界启用开关/客户端实际运行 | 保存78 | 实际运行74 | 两边来源层级不同；不能只看总数 |
| 两边共同开启 | — | 52 | 按精确模块ID比较 |
| 仅Mirror保存为开启 | 26 | 0 | 这26项在Next均无模块清单文件 |
| 仅Next实际运行 | 0 | 22 | 不擅自关闭，需核原意与来源 |

[Mirror只读设置快照](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/module-activation-20260926/mirror-persisted-module-setting.json>)来自原 `cor-cotn` 设置文件的当前只读解析，文件SHA-256 `3F08D437B08232C327B573E7FB77B04F5097A223B182FB277AB18C2C80BE574D`；[Next真实客户端读回](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/module-activation-20260926/next-live-client-startup.json>)记录原世界、Foundry14.368/D&D6.0.2、74实际运行及错误。Mirror端口30001/PID14248、Next端口30002/PID43364均核对为本机精确数据目录。

## Next 这次进入游戏到底有没有报错

**有。**服务能进入世界，74项会载入，但不能称“启动无错”。这次全新Chrome登录的客户端记录了50条 `error`、3条页面异常和132条 `warning`；这不是53个互不相干的故障，许多记录来自同一类旧文档。警告不全是故障，错误则必须单列：

- 39条旧日历页面报错，页面类型为 `calendaria.calendarnote`，而 Next 缺 `calendaria`。这与缺少日历模块一致，属于待验证的原因推断，尚未安装后复测。官方当前 `calendaria` 1.4.2 正式包支持 Foundry 14，依赖 `3ds-atlas` 1.4.3；两者均未装。
- 8条旧人物物品初始化失败：包括一份用户要求保留的错误血猎手测试副本的非法识别符，以及若干旧授予引用不被目标系统接受。没有修改任何人物；不能把这些错误归因于“所有模块都坏了”，也不能忽略。
- 1条侧栏折叠报错，错误来源同时指出 `dice-calculator` 与 `monks-little-details` 的钩子；另有 `custom-css`/`lib-wrapper` 的早期设置异常和两次调用栈溢出。两条资源404和字体/旧接口警告仍待定点定位。
- 服务端当天日志还记录受保护的付费 `demon-queen-awakens` 签名文件无效；按用户付费包只记录规则，本轮没有下载、替换或重新开启它。

这些错误来自本次现有Next配置的客户端登录和服务日志；**没有**测试过“让Next强行开启Mirror全部78项”的组合，因为26项没有文件，其中有明确不兼容或来源未清的包。

## 仅Mirror开启的26项：先查官方再决定

下表里的“正式版”是本轮实时从发行方 manifest 取得；“无D&D声明”不是“明确支持D&D6”。Mirror本机旧版和Next目标来源分开记录。详细字段见[本机旧清单](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/module-activation-20260926/mirror-only-local-manifests.json>)与[正式清单只读结果](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/module-activation-20260926/mirror-only-official-manifests.json>)。

| 模块ID | Mirror旧版 → 官方正式版 | 当前判断 |
|---|---|---|
| [3ds-atlas](https://github.com/Sayshal/3DS-ATLAS/releases/latest/download/module.json) | 1.0 → 1.4.3 | 正式包支持 Foundry 14；未声明 D&D 系统版本。按通用包候选逐个复核，不把它写成 D&D 6 已验证，也未安装。 |
| `5e-dlc-monster` | 1.2.0 → 公开版待核 | Mirror 本机包无可核的公开正式入口；来源/授权未明，暂缓。 |
| [calendaria](https://github.com/Sayshal/Calendaria/releases/latest/download/module.json) | 1.2.0 → 1.4.2 | 正式包支持 Foundry 14；未声明 D&D 系统版本。按通用包候选逐个复核，不把它写成 D&D 6 已验证，也未安装。 |
| `chat-memory-guard` | 1.0.0 → 公开版待核 | 本团旧包锁 Foundry 14.364 / D&D 5.3.3；需本团移植，暂缓。 |
| [color-picker](https://github.com/Larkinabout/fvtt-color-picker/releases/latest/download/module.json) | 1.7 → 1.8 | 正式包支持 Foundry 14；未声明 D&D 系统版本。按通用包候选逐个复核，不把它写成 D&D 6 已验证，也未安装。 |
| [dfreds-convenient-effects](https://github.com/DFreds/dfreds-convenient-effects/releases/latest/download/module.json) | 9.1.0 → 9.2.7 | 用途涉及 D&D，正式清单没有明确验证 D&D 6；GitHub 未找到可核的正式 6.x 承诺，暂缓。 |
| [dfreds-droppables](https://github.com/DFreds/dfreds-droppables/releases/latest/download/module.json) | 6.1.2 → 6.2.1 | 正式包支持 Foundry 14；未声明 D&D 系统版本。按通用包候选逐个复核，不把它写成 D&D 6 已验证，也未安装。 |
| [dungeon-strugglers-collection](https://drive.google.com/uc?export=download&id=1tLPV5D-oBSjMaVIDxEUOefHEtNYClOLI) | 1.1.1 → 1.1.1 | 公开入口指向 Patreon/Google Drive；正式清单只验证旧目标，来源和 D&D 6 仍未明，暂缓且不下载。 |
| `fvtt-babele-rolltable-embed-translation` | 0.1.0 → 公开版待核 | 本团旧包锁 Foundry 14.364 / D&D 5.3.3；需本团移植，暂缓。 |
| `fvtt-custom-conditions` | 0.1.1 → 公开版待核 | 本团旧包锁 Foundry 14.364 / D&D 5.3.3；需本团移植，暂缓。 |
| [fvtt-json-forge](https://raw.githubusercontent.com/bill34345/fvttV12JsonGenerator/master/foundry-modules/fvtt-json-forge/src/module.json) | 0.4.0 → 0.1.0 | 本团旧包锁 Foundry 14.364 / D&D 5.3.3；需本团移植，暂缓。 |
| `fvtt-trigger-engine` | 0.1.1 → 公开版待核 | 本团旧包锁 Foundry 14.364 / D&D 5.3.3；需本团移植，暂缓。 |
| `fvtt-weapon-mastery-properties` | 0.1.0 → 公开版待核 | 本团旧包锁 Foundry 14.364 / D&D 5.3.3；需本团移植，暂缓。 |
| [global-progress-clocks](https://github.com/CarlosFdez/global-progress-clocks/releases/latest/download/module.json) | 1.3.2 → 1.3.3 | 正式包支持 Foundry 14；未声明 D&D 系统版本。按通用包候选逐个复核，不把它写成 D&D 6 已验证，也未安装。 |
| [item-piles](https://github.com/fantasycalendar/FoundryVTT-ItemPiles/releases/latest/download/module.json) | 3.3.4 → 3.3.4 | 正式包支持 Foundry 14；未声明 D&D 系统版本。按通用包候选逐个复核，不把它写成 D&D 6 已验证，也未安装。 |
| [itemacro](https://github.com/Foundry-Workshop/Item-Macro/releases/latest/download/module.json) | 3.0.1 → 3.0.1 | 正式版只验证到 Foundry 13.344，GitHub 未见当前目标承诺；暂缓。 |
| [itempilesdnd5e](https://github.com/fantasycalendar/FoundryVTT-ItemPilesDnD5e/releases/latest/download/module.json) | 1.1.0 → 1.1.0 | 用途涉及 D&D，正式清单没有明确验证 D&D 6；GitHub 未找到可核的正式 6.x 承诺，暂缓。 |
| [multiple-document-selection](https://github.com/ironmonk108/multiple-document-selection/releases/latest/download/module.json) | 14.01 → 14.01 | 正式包支持 Foundry 14；未声明 D&D 系统版本。按通用包候选逐个复核，不把它写成 D&D 6 已验证，也未安装。 |
| [plutonium-cn](https://github.com/5eTools-Plutonium-CN/Plutonium-CN-Next/releases/latest/download/module-foundry14.json) | 2.15.6 → 2.15.6 | 正式中文版明确把 D&D 上限锁在 5.3.999；不支持目标 6.0.2，暂缓。 |
| [psfx](https://github.com/JimHPerry/psfx/releases/latest/download/module.json) | 0.15.0 → 0.17.0 | 正式包支持 Foundry 14；未声明 D&D 系统版本。按通用包候选逐个复核，不把它写成 D&D 6 已验证，也未安装。 |
| [quickscale](https://github.com/unsoluble/quickscale/releases/latest/download/module.json) | 1.7.0 → 1.7.0 | 正式包支持 Foundry 14；未声明 D&D 系统版本。按通用包候选逐个复核，不把它写成 D&D 6 已验证，也未安装。 |
| [share-media](https://github.com/mech-tools/share-media/releases/latest/download/module.json) | 3.14.2 → 3.14.3 | 正式包支持 Foundry 14；未声明 D&D 系统版本。按通用包候选逐个复核，不把它写成 D&D 6 已验证，也未安装。 |
| [simplecover5e](https://github.com/Kapuzenjoe/simplecover5e) | 2.2.0-cor-cotn.1 → 公开版待核 | 本地旧版/补丁：尚无当前目标的正式来源与验收；暂缓。 |
| [sync-token-actor](https://github.com/kagangtuya-star/sync-token-actor/releases/latest/download/module.json) | 3.1.0 → 3.1.0 | 正式包支持 Foundry 14；未声明 D&D 系统版本。按通用包候选逐个复核，不把它写成 D&D 6 已验证，也未安装。 |
| [vision-5e](https://github.com/dev7355608/vision-5e/releases/latest/download/module.json) | 3.1.3 → 3.2.2 | 用途涉及 D&D，正式清单没有明确验证 D&D 6；GitHub 未找到可核的正式 6.x 承诺，暂缓。 |
| [z-scatter](https://github.com/elizeuangelo/fvtt-module-z-scatter/releases/latest/download/module.json) | 2.2.4 → 2.3.0 | 正式包支持 Foundry 14；未声明 D&D 系统版本。按通用包候选逐个复核，不把它写成 D&D 6 已验证，也未安装。 |

## 明确不支持者的 GitHub 复核

[Plutonium CN 正式发布页](https://github.com/5eTools-Plutonium-CN/Plutonium-CN-Next/releases)仍把 v2.15.6 标为最新，发布说明只说同步原版2.15.6；正式中文版清单把 D&D 上限写为5.3.999。[其GitHub Issues](https://github.com/5eTools-Plutonium-CN/Plutonium-CN-Next/issues)目前只公开一条安装链接问题，[Pull requests](https://github.com/5eTools-Plutonium-CN/Plutonium-CN-Next/pulls)没有公开PR；未找到中文包已正式移植 D&D6 的证据。英文原版新增6.x支持不能冒充中文版已发布。

`fvtt-json-forge`、`fvtt-custom-conditions`、`fvtt-trigger-engine`、`fvtt-weapon-mastery-properties` 等为本团模块，Mirror旧包明确锁在旧目标；应在唯一代码工作区按正式来源和迁移影响行为处理，不能拿旧包复制到Next。`vision-5e` 的正式版最后标明验证D&D5.3.3；其[GitHub仓库](https://github.com/dev7355608/vision-5e)没有提供这次可核的D&D6正式声明，暂不升格为支持。其他D&D用途不清的包亦保持暂缓。

## 默认操作与下次收尾

已在当前工作树的 `.ruler/AGENTS.md` 增加规则，并按项目的Ruler流程生成根 `AGENTS.md`；详细步骤同步到[ServerNext模块来源与安装runbook](../runbooks/server-next-module-upstream-and-package-source.md)。以后先对账两边启用差集，再逐包实时查正式版、Foundry与D&D目标及依赖；正式不支持者再读GitHub发行/issue/PR/分支。仅明确适用的免费第三方进入小批安装和重新登录错误检查；付费只记录且保持关闭状态；本团模块走来源与关键行为门禁。不要把“可登录”“有文件”或“数量相等”写成无报错。

待判断本地化：当前没有因为这轮对账新增可直接发布的本地化内容。对缺口中本团旧包逐个核正式来源；对 `calendaria`/`3ds-atlas` 这样的通用包，确认依赖、安装来源和目标空闲后可定点处理，再看旧日历页面错误是否消失；对旧人物资料错误另行按公共游戏界面或文档API修复，绝不直接编辑运行中世界数据库。
