# ServerNext 日历依赖链：正式来源与首轮安装（2026-09-27）

## 当前结论

`3ds-atlas` 1.4.3 和 `calendaria` 1.4.2 已从作者正式发布包安装到 ServerNext，逐文件 SHA-256 对账通过。**正常客户端重登后，两项均实际开启；旧 `calendaria.calendarnote` 错误从39条降为0，原有日历笔记可打开。日历链定点验收 PASS。**客户端仍有10条其他错误和35条警告；独立页面异常事件流未由此次Chrome接口提供，不能宣称全世界启动零错误。没有触碰 Mirror 包、世界数据库或付费包。

## 当天来源与适配判断

| 包 | 正式来源及包 | 目标依据 | 依赖/用途 |
|---|---|---|---|
| 3DS:ATLAS | [Foundry包页](https://foundryvtt.com/packages/3ds-atlas)、[作者正式清单](https://github.com/Sayshal/3DS-ATLAS/releases/latest/download/module.json)、[1.4.3 ZIP](https://github.com/Sayshal/3DS-ATLAS/releases/download/release-1.4.3/module.zip) | ID `3ds-atlas`、版本1.4.3、Foundry最低14/验证14.367；本机目标14.368在范围内 | 作者说明是3 Death Saves系列共享主题、日志、更新提示等通用基础包；无必需模块，不声明D&D6玩法验证。 |
| Calendaria | [Foundry包页](https://foundryvtt.com/packages/calendaria)、[作者正式清单](https://github.com/Sayshal/Calendaria/releases/latest/download/module.json)、[1.4.2 ZIP](https://github.com/Sayshal/Calendaria/releases/download/release-1.4.2/module.zip) | ID `calendaria`、版本1.4.2、Foundry最低14/验证14.367；本机目标14.368在范围内 | 作者说明是日历、时间、旧日历笔记等通用功能；正式清单要求`3ds-atlas`，无D&D6玩法声明。 |

作者清单没有系统专属要求；包页描述的核心功能是日历与共享工具，因此按通用模块路线进入安装。此判断只覆盖安装和启动，不把无系统上限写作作者正式验证D&D6玩法。Mirror旧包仅作设置和用途对照来源，没有复制旧文件。

## 本机执行与证据

- 操作前：30002和30001均无监听；无`server-next` Node进程；Next原世界16个已发现的`LOCK`文件均可独占读取。Mirror最新设置日志 `001874.log` 只读解析仍为114个配置项、78开、36关，SHA-256 `39EBD447E3C5B75F3DA112591103E21B3093AEF9CFB53D76F449159D4DBCB1C8`。这只是Mirror保存开关，不是其当前客户端运行状态。
- 包下载到 `F:\FoundryLab\foundry-v14\evidence\server-next-migration\calendar-chain-20260927`；外层正式清单与ZIP内`module.json`的ID、版本、Foundry范围一致。ZIP路径无绝对路径、`..`或盘符；模块声明的入口脚本与样式都存在。
- `3ds-atlas` ZIP SHA-256 `339CC548C41969B27398B654C9C8196019782912D30F00F54CC71772DDE78AA3`，安装27个文件；`calendaria` ZIP SHA-256 `E0188BC3B9D785C124A87185AF4491873A1E4E680968C06012A475E9EF97289D`，安装135个文件。两包逐文件安装前后哈希一致。精确结果在同目录`*-install-receipt.json`。
- 用Node24.17.0、原app `14.368`、原`server-next`数据目录和loopback预载启动Next PID9840。`127.0.0.1:30002/api/status`返回HTTP200：`cor-cotn` active、Foundry14.368、dnd5e6.0.2、0人在线。启动日志仍报两条`Invalid signature file for protected module "demon-queen-awakens"`，付费包按现授权只记录。日志在同证据目录`server-stdout.log`/`server-stderr.log`。

## 正常客户端重登验收（11:26）

[独立Chrome原始读回](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/calendar-chain-20260927/calendar-chain-normal-client-acceptance-20260927.json>)核PID9840、唯一loopback30002、原世界及版本；以ServerNext现有测试Gamemaster账号正常登录，玩家列表仅Gamemaster在线。Module Management显示84登记、76开启、8关闭；两个新装包均按旧世界保存开关自动勾选，执行者没有改任何开关。重载并重新进入后仍显示`3ds-atlas` 1.4.3和`calendaria` 1.4.2开启。日历HUD、大日历和原有`New Dawn`笔记可打开，显示日期与正文；笔记、日期及世界资料未编辑。

新登录客户端记录10条`console error`和35条warning，日历页面类型错误0条。10条错误分为1条旧Item非法标识符、7条旧授予嵌入UUID引用、2条Pixi调用栈溢出；页面异常的独立事件流未暴露，不能与旧3条直接比较。旧基线是50条console error（其中日历39条）、132条warning。这是相同目标的定点差异，不代表所有旧错误都已解决。

按精确ID重算：Mirror保存78项开启、Next客户端实际76项开启，共同54、仅Mirror 24、仅Next 22。Next磁盘85个`module.json`均可解析，界面只登记84个；**唯一未登记ID是付费`demon-queen-awakens` 6.0.0**，与启动日志签名错误对应。当前授权仍只记录，不修付费包。两边的具体ID列表、8项Next已关闭名单和错误类别均在原始读回文件。

## 下一关口

日历链已关闭。接下来处理剩余24个仅Mirror开启且Next缺文件的包，以及10条非日历console错误；其中8条旧Item错误须先按精确文档ID定位来源和所有者，不能为清错删除用户保留的人物或改玩家人物。Pixi调用栈溢出及两条旧资源404仍需独立定位；付费包签名错误保持只记录。逐项路线见[唯一交接报告](../plan/server-next-migration-handoff-20260927.md)。

待判断本地化：本轮无新增本地化候选；若旧日历页在正式版下仍不能读，记录精确旧数据格式和作者正式来源，再决定是否需要本团适配，不能先改世界资料。下一次复查从上述两个作者正式清单、发行说明与包页开始，并核本机实际安装版和客户端错误。
