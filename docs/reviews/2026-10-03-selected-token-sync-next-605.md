# Selected Token Sync 的 ServerNext 6.0.5 候选

日期：2026-10-03（上海）。接续 [此前只读评估](2026-10-02-selected-token-sync-dnd6-feasibility.md)，用户本轮明确授权适配，并选择“每个不同 Actor 各自增减一级，保留等级差异”。原迁移与不全包已接受范围不重跑。

## 当前分层状态

- 实现、20 项模块测试、模块类型检查、构建：PASS。
- ServerNext 自有模块安装器 404 项安全测试、tools 类型检查、架构依赖和循环检查：PASS。
- 候选 0.2.0 首次安装与五文件逐项 SHA-256 对账：PASS。
- 实际世界启用、普通/分级 HUD、两个 GM 客户端、重载和本批临时对象清理：PASS，限下述已核对范围。完整玩家角色 UI、生产与长时会话未验。
- 正式 Chrome 在本轮前半段可用；随后旧技能文件和 REPL 会话消失。用户再次标记当前 `@Chrome` 后，主控确认其现行官方入口由统一工具提供 Chrome extension/AX/Playwright 浏览器 API；已实际连接 Chrome 并读回页面。未调用 Windows 桌面控制。初始 `ERR_CONNECTION_REFUSED` 经进程/端口核对为原 Next 服务已退出，不是 Chrome 连接失败。旧技能文件缺失不再作为阻碍。

## 版本与精确接口

AnySearch 成功读取 [官方最新稳定发布](https://api.github.com/repos/foundryvtt/dnd5e/releases/latest)，为 [release-6.0.5](https://github.com/foundryvtt/dnd5e/releases/tag/release-6.0.5)，发布于 2026-09-22T22:22:44Z，无需升级。Context7 返回的 Core V11 ActorDelta/ActiveEffect资料仅用于导航，没有作为 6.0.5 证据。

目标源码为 `F:/FoundryLab/reference-cache/dnd5e/6.0.5/repo`，HEAD `3ee48de02f8f6f7b2638c9f6cf3e9540c9c181cc`；Core 为 `F:/FoundryLab/foundry-v14/app/14.368`。未声称源码仓与已安装系统 bundle 字节相同。

- `TokenHUD5e` 已替代 Core HUD；其分级状态调用传 `levels: +1/-1`。
- `Actor5e.toggleStatusEffect` 的分级分支忽略普通布尔 active 语义，既有等级更新 `effect.system.level`，不是 create/delete。
- 零级直接传负 delta 会落回 Core toggle；本模块必须跳过零级减级，不能由源 Actor 的无变化阻塞其他 Actor。
- `ConditionData.prepareDerivedData` 将等级写入派生 `actor.system.conditions`。验收以真实 effect level 与 conditions 为准，旧 attributes.exhaustion 单列诊断；原始移动速度与派生速度分开读回。

## 实现范围

保留普通状态的 HUD intent/create/delete hook 路径及 TokenDocument movementAction 路径。仅分级状态通过 HUD 捕获并串行调用正常 `actor.toggleStatusEffect`：每个不同 Actor 独立夹到 0～系统上限；linked 去重；先保存所有等级，再处理世界 Actor、重读合成 Actor，防止继承后的二次加级；右键 contextmenu/auxclick 同手势只执行一次。程序化效果不进入此分级队列。

manifest、构建约束、README、局部 AGENTS 和手册统一为 0.2.0 / Core14.368 / dnd5e6.0.5。旧0.1.0安装未修改。安装入口复用 `installServerNextOwnedModule`，精确 Next 目标，已存在目录和链接仍拒绝。

锁文件原先遗漏本树已经提交的多个 workspace 版本及 external-candidates workspace。第一次 frozen install 拒绝；通过 `bun install --lockfile-only --ignore-scripts` 同步已有 package 元数据后，frozen install 通过。没有升级外部依赖版本。

## 安装与检查证据

安装前服务核对为 PID43196 / Administrator / Node24.17.0 / 127.0.0.1:30002，app14.368、data/server-next、cor-cotn。工具刷新后该 PID 和端口均不存在，退出原因未确定；按已有本地验收授权恢复同一 app/data/world，启动回执 PID41112，不另建实例、不停任何现有服务、不删除锁文件。安装目录为 `F:/FoundryLab/foundry-v14/data/server-next/Data/modules/fvtt-selected-token-sync`。

- 安装清单 SHA：`422095621a648f408637052e5e52e6c80ccd39851898fe6cb7b2f33cda644bc4`。
- manifest SHA：`31e57cfaf0c3d1d24059a1cf8a532c729496f74033cf90e59c81c90935698e70`。
- 实际 browser script SHA：`29da3b9efbe7fd97371311af2bf1eb0e89fd543c4b843fb32fd5d4f4eaee884a`。
- 从模块 cwd 到根 cwd 构建导致 Bun 的三处源码路径注释变化；在内存中仅移除注释路径前缀后，SHA 精确等于 worker 的 `74848a94f80d0246a0a5e21b0046fb009a0b77e3cd7b964b28983e13e65e3c0a`。执行合同绑定实际已安装 SHA。

独立审查未发现剩余确定缺陷；指出 native exhaustion 首次创建/删除后的 Actor 异步回写不能由 mock 证明，已列为实机必验。消费者的部分创建清理问题已修复，并使用 V1 文件侧操作验证部分对象可清理、未知 ownership 在写入前拒绝。首次文件检查器语法失败原件保留，后续新合同通过；没有重放已领取合同。

## 真实行为与收尾

新消费者 `foundry-modules/fvtt-selected-token-sync/acceptance-macro.js` 复用既有 E2E 生命周期。正式输入去掉尾部换行，先正常 UI 保存全文、读回 SHA 和 Readback 往返，再创建最多三个 NPC、一场景、五个 Token；两个 Token 共享 linked Actor，另有同源 synthetic 和独立 synthetic。每例复用资源，最终清理只按本批 ledger 和精确归属。

原执行器回执 `2b446f47-eec7-4e15-bb92-c643fca18f2b` 证明其当前注册表没有新正式 Chrome 工具，browser/world 操作均0。父按用户此前明确的接管授权执行合同 `a01d08b8-dcbe-48c8-ba6b-aa41230d02e0`，没有新建执行聊天或换用桌面操作。真实模块管理器保存原104注册/95启用集合，仅新增本模块到96启用；原95个ID逐项相同。

| 已接受行为 | 实际读回 |
|---|---|
| 同步关闭基线 | 来源 A 与同 linked Actor 的另一个 Token、同源 synthetic 中毒；独立 B/CS 不变 |
| 普通状态 | 同步开启后五 Token 中毒添加/删除、倒地 overlay=true 全部正确 |
| 分级路径 | 五 Token 疲乏0→1→2→1→0；linked只改一次，synthetic无双加 |
| 不同等级 | 四个不同Actor初值1/3/2/4，经左击为2/4/3/5，右击恢复1/3/2/4 |
| 上下限 | 满级来源6/6/2/4左击为6/6/3/5；零级来源0/0/2/1右击为0/0/1/0 |
| 快速操作 | 零级双击准确得到2；1→0→立即1最终全部1，effect与派生conditions一致 |
| 程序化负例 | 仅 B 的普通API添加中毒，其他角色不被同步 |
| 移动方式 | 五 Token 同步fly，默认保存为null；原始Actor速度始终相同 |
| 两客户端 | 两个同GM客户端均开启同步；发起端一次左击，另一端只读到一级，未变成二级 |
| 重载 | 五Token等级1、原始movementAction=null、96模块集合与原世界ID/time保持 |
| 权限边界 | 既有PLAYER实际canUserModify对三个自有NPC均false；完整玩家登录/点击UI未验 |

Core14.368 `client/documents/token.mjs:488` 在prepareDerivedData中推断缺省movementAction，所以默认的派生读回为walk，不能用它判定存储失败。只为消费者新增 `toObject().movementAction` 读回：r4输入11914bytes/SHA `7154927cced6c71220b66e9ef29b1288a70e8e8156ff40006904e8ed48e3a28f`，V1 `e62503ab-02f6-4c85-b5a2-1889e73807d6` PASS，正常UI保存/重新打开/全文拷贝SHA一致。没有修改已测模块bundle或重放Prepare。

首次普通状态点击受前景窗口遮挡，未产生状态；移开窗口后真实点击与Document读回通过，原观察仍保留。最终重载捕获一条旧Actor `LN5PLqTTdx0l7o7w` / Item `f8e17a7b397a98b7` 非法identifier，与[2026-09-28旧测试副本归因](2026-09-28-server-next-startup-error-actor-attribution.md)一致；依既有要求保留，不为清空console而改/删。未发现本模块相关新增error。`dev.logs`为增量输出，首次工具原件单独保留，后续空数组不被描述为全部历史error为0。

父审从25份实际原件核对21项限定行为及清理，`parent-runtime-review.json` PASS。Cleanup正常删除3NPC/1Scene/5Token；Finalize保存完整Macro证据后正常删除 `f2MxtXaP3G5gCujz`。217273字符最终回执通过五段DOM读回、长度/JSON/SHA核对；首次整段传输截断后没有重放Finalize。原完整ID集合恢复为Actors294/Items213/Scenes65/Macros90/Tables12/Journals67/Chat1419，worldTime21085409、原viewedScene与paused=true保持，client同步开关恢复false。模块保持启用。主/观察/预检自有标签全部正常关闭，owned tabs=0。

私有准备与当前状态：`.local/selected-sync-next-20261003/`；原件目录 `F:/FoundryLab/foundry-v14/evidence/server-next-migration/selected-sync-next-20261003-d3184b6c`。本批已闭合，不重放Prepare、Finalize或旧合同。手册页面目视按用户选择延期；完整玩家角色UI、生产与长时接受保持未验。没有本轮commit、合并或push。
