# ServerNext 掩护与棋子工具的正式来源（2026-09-27）

## 当前判断

本页记录下一批的来源、安装和恢复；**三项已装、保存开关为true、正常客户端实际开启且界面勾选，原80项开启状态均保留；安装/启用读回PASS。**Z Scatter 2.3.0是通用棋子视觉排布工具；Sync Token Actor 3.1.0只在人物更新或新棋子创建时执行同步，不在启动时批量改旧人物；Simple Cover 5e作者2.2.3是D&D专用正式版，作者2.2.2明确加入D&D6支持，2.2.3又修复近同时掩护移除竞态。三项正式ZIP的内部ID/版本、声明入口与官方清单一致；安装前仍须正常关闭世界、核锁和服务属主。没有从Mirror复制旧包。

| 包 | 作者正式来源与当天目标 | 包内核对和迁移判断 |
|---|---|---|
| Z Scatter (`z-scatter`) | [正式清单](https://github.com/elizeuangelo/fvtt-module-z-scatter/releases/latest/download/module.json)、[2.3.0 ZIP](https://github.com/elizeuangelo/fvtt-module-z-scatter/releases/download/v2.3.0/z-scatter.zip)；最低Foundry13、验证14.367；不声明D&D系统版本 | ZIP SHA-256 `F61FCE641EB0D81EDE3616B0FD8B5128B80C0D6656B1F3ED1C425B85875A4E87`，内部11文件、入口齐。源码在`refreshToken`/移动等钩子计算显示偏移，写的是渲染位置；没有自动更新旧世界棋子文档。按通用包候选，不称D&D6玩法正式验证。 |
| Sync Token Actor (`sync-token-actor`) | [正式清单](https://github.com/kagangtuya-star/sync-token-actor/releases/latest/download/module.json)、[3.1.0 ZIP](https://github.com/kagangtuya-star/sync-token-actor/releases/latest/download/module.zip)；最低Foundry13、验证14；不声明D&D系统版本 | ZIP SHA-256 `72CD9F397F787A141E2E7C5ABBAE01E133764FCE49860F3BB273D703B28B6B1A`，内部8文件、入口齐。源码在`updateActor`与`preCreateToken`钩子同步名称/图片/原型棋子，默认自动同步开，但没有启动时批量重写；旧设置仍须正常客户端确认。它会影响未来人物更新，因此不把“启动无错”当成所有同步场景通过。 |
| Simple Cover 5e (`simplecover5e`) | [作者正式发布](https://github.com/Kapuzenjoe/simplecover5e/releases)、[2.2.3清单](https://github.com/Kapuzenjoe/simplecover5e/releases/latest/download/module.json)、[2.2.3 ZIP](https://github.com/Kapuzenjoe/simplecover5e/releases/download/2.2.3/module.zip)；Foundry14，作者2.2.2发行说明明确D&D6.0.0初步支持 | ZIP SHA-256 `7BF3295DC7FE4A03B78FF7696FA5E102AFF3DCD3D487DE017938A428633DB74F`，只取ZIP内`simplecover5e/`包根、54文件，排除`__MACOSX`元数据。2.2.3源码`cover/status.mjs`按Actor UUID使用`Semaphore(1)`，覆盖Mirror旧2.2.0-cor-cotn.1补丁的同人物写入串行核心用途；作者2.2.3发行说明也明确修复近同时移除状态竞态。详见[旧补丁逐项对照](./2026-09-26-server-next-official-replacement-and-local-patches.md)。不叠加旧补丁。 |

作者Simple Cover 2.2.0起有旧设置自动迁移逻辑，真实目标的旧设置和首次加载结果仍需正常界面/错误读回。该模块D&D6支持是作者发行说明，不等同这场跑团的掩护玩法全测；按用户规则核包、开关与启动错误，若出现旧补丁所防的特定并发错误再做定点复现。其它两项通用模块也只做安装、启用与重登错误检查，不用玩家人物或棋子作无关玩法测试。

## 离线安装与服务恢复

独立Chrome任务经正常Settings→Return to Setup关闭原世界，PID42740和loopback30002仍在，/api/status active=false。父任务核精确Node24.17.0/app14.368/server-next/cor-cotn命令行和23个世界LOCK均可独占读取，三项目标目录不存在；正常停止精确PID42740并确认端口释放，未强制停服、清锁或建备份。关世界证据及pre-stop-gate.json在 F:\FoundryLab\foundry-v14\evidence\server-next-migration\cover-token-batch-20260927。

将正式ZIP内准确包根移入Next Data/modules：Z Scatter 11文件、Sync Token Actor 8文件、Simple Cover 5e 54文件。每项移动前后文件SHA-256一致，三个install-receipt.json记来源、ZIP哈希及目标；没有使用Mirror旧包。PSFX设置文件在世界关闭时仍未能从当前压缩SSTable只读判定popup0926，保持未装。

12:05第一次按原参数启动PID31640，在世界资料加载约9%处进程无stderr退出；无Node进程/监听残留，23个锁随后可读。Windows Application事件、可用内存与磁盘检查未给出明确原因，不能归因到某一新包。21:02以相同参数进行一次受控重试，PID41620成功恢复唯一loopback30002及原cor-cotn；/api/status active=true、Foundry14.368/dnd5e6.0.2、0人在线。两次stdout/stderr分别保存在同证据目录server-*.log和retry-*.log。服务日志仍有既有付费Demon Queen Awakens签名错误，本批客户端错误尚未读回。
## 三包正常客户端读回（22:27）

第一次独立Chrome脚本正常勾选三项并点“保存模组设置”，但立即等待同页game.ready和新active集合90秒超时，未能判断是否已保存，原结果标INCOMPLETE。暂停后恢复的一次脚本又在/join的空模板尚未渲染时立刻用count()判断登录框，误判为无控件；没有提交登录或改世界。修正为等待可见登录框后，[最终独立Chrome只读证据](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/cover-token-batch-20260927/post-save-readback-fixed-join.json>)确认：原PID41620/loopback30002/cor-cotn/Foundry14.368/dnd5e6.0.2，91登记、83实际开启，三项准确版本的保存值均true、runtime active和模块管理界面勾选一致；旧80项active完整保留，日历链仍active。本轮没有再次保存、重载或改人物/棋子。

Mirror保存78项、Next实际开启83项，共同61、仅Mirror17、仅Next22。该客户端记录12条console错误、55条警告、3条页面异常、两条同一Plutonium CN缺失图标skills.svg的HTTP404；相较前一批10/35/未捕获404，不能把增加量归因三包，因为第一次勾选前已有12/55/两条404。当前读回没有三包相关console错误。Simple Cover可见旧设置，但Sync Token Actor几个设置值被执行器的保守过滤省略，不据此声称它们已逐项核旧值。三包没有玩法E2E，特别是人物同步与掩护计算仍未由这次读回证明。
## 其余公开包暂缓原因

- PSFX 0.17.0正式ZIP SHA-256 `EBF37C6C41A7A1D1A0AF6FABBAAFC6BB8079DF335D67FD7BD875DA752E4F80AE`，内包453文件、声明入口齐，但源码在GM首次ready且`popup0926`设置为false时会创建聊天消息并改设置。世界运行中设置日志被进程占用；下一次离线维护可只读核旧设置后决定，避免为安装制造不必要的世界消息。不把这一点称为版本不兼容。
- Item Piles 3.3.4虽然基础包与D&D专用配套是两个ID，但基础包会处理物品/货币等系统数据，仍需查作者明确D&D6适配或隔离其相关路径；不能仅凭Foundry14清单和依赖已装就放行。其D&D配套`itempilesdnd5e`另行暂缓。

待判断本地化：本批无新的本团补丁；Simple Cover旧本地队列用途已在作者正式版源码出现，先验实际装载而不复制旧修订。新候选复查从上述作者清单、发行说明、包内manifest/入口与本机旧设置开始；PSFX先核`popup0926`，Item Piles先核D&D6来源。
