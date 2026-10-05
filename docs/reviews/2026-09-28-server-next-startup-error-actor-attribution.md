# ServerNext 启动错误与人物归属定点复核（2026-09-28）

## 目标与证据层级

目标是现有 `server-next` 的 `cor-cotn`，Foundry 14.368 / dnd5e 6.0.2。主任务启动并核对了 PID 30936 独占 `127.0.0.1:30002`、`/api/status` 的世界和系统身份；独立 Chrome 任务在正常客户端登录后，只读查看错误、人物目录与 Ownership 界面。[结构化回执](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/startup-errors-next-20260928/startup-errors-chrome-readback.json>)与同目录截图是本轮证据；[9月26日旧快照](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/module-activation-20260926/next-live-client-startup.json>)仅作历史对照。没有修改世界文档、人物权限、模块开关或付费内容。

## 当次结果

| 范围 | 结果 |
|---|---|
| 客户端 console | 46条已捕获记录中有10条 error：8条旧 Item 校验错误、2条 Pixi 调用栈溢出；正常只读查看期间未新增 error。warning 从登录后35条变36条，新增的是打开人物右键菜单时的 `ContextMenuEntry#name` 废弃提示。错误没有清零。 |
| 8条旧 Item 错误 | 1条是错误测试副本中 `system.identifier` 使用非法字符；另7条是五名玩家人物的旧 `ItemGrantConfigurationData` 引用嵌入文档 UUID。精确 ID 与人物归属见下表。 |
| 页面异常与网络404 | **INCOMPLETE**。本轮官方 browser-client 的 `dev.logs` 只给 console 记录，没有独立 `page-error` 和 `requestFailed` 事件流。console 中无 Plutonium/404 字样不能证明旧资源404已消失。重新查看[9月27日客户端网络回执](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/cover-token-batch-20260927/client-readback.json>)，其中两次404是同一地址 `http://127.0.0.1:30002/modules/plutonium-cn/media/icon/skills.svg`；这是历史精确地址，不是本轮新观测。 |
| 人物可见性 | 正常人物目录与 Ownership 窗口能确认人物姓名、文件夹和拥有者。失败的内嵌 Item 在正常人物卡 DOM 中未渲染，故其名称、来源和项目级保留状态仍 **INCOMPLETE**。 |
| 收尾 | 独立任务经正常 Settings → Return to Setup，测得 `/api/status active=false`、23/23 世界 LOCK 可独占；PID 30936 已退出。主任务随后独立核实30002无监听、该 PID 不存在。服务运行约1532秒，在30分钟短时门限内。 |

## 精确错误对象

| 人物 ID / 名称 | 失败 Item ID | 错误和归属 |
|---|---|---|
| `LN5PLqTTdx0l7o7w` / `【不可用·旧版错误测试副本】CodexTemp-BH-OldMigration-20260925` | `f8e17a7b397a98b7` | 非法 identifier；不在玩家人物文件夹，Gamemaster 拥有，明确标注旧版不可用测试副本。按既有用户要求保留，不为清错删除。 |
| `D90ARiSHc6gQix80` / 卡勒姆·维雷 | `JKYf8f2QRtTInPTg` | 旧 ItemGrant UUID；`玩家角色` 文件夹，SY 拥有。 |
| `AYV4B8wS4WSAjWAp` / 奥黛塔.米兰德拉 | `tmZVAnBOqiCBzj65` | 旧 ItemGrant UUID；`玩家角色` 文件夹，嫦娥拥有。 |
| `aMZwC9ORkpZpdlkc` / 斯兰沃德·S·艾莉儿 | `Oqs0HDVs0QOmvzb9`、`uzVbpCQgQkhTJHWP` | 两条旧 ItemGrant UUID；`玩家角色` 文件夹，没有拥有。 |
| `MkOcySfY7k3A1AAl` / 泽菲尔·艾什伍德 | `V5QhgpThojOk76m8` | 旧 ItemGrant UUID；`玩家角色` 文件夹，咸鱼拥有。 |
| `mPCqZoTgUrq2E4FL` / 贝伦席拉·冯·卡尔斯卡特 | `lD2rOPRef3624n1L`、`SK5GP9LvoSDk0BIB` | 两条旧 ItemGrant UUID；`玩家角色` 文件夹，佐德拥有。 |

上述人物的 `All Players` 权限均显示 `None`；各指定用户拥有权限。只读打开 Ownership 窗口并关闭，未保存。截图包括 `actor-directory.png` 与各人物 `ownership-*.png`，主任务抽查目录和卡勒姆的 Ownership 截图，与回执相符。

## 下一步边界

先从旧错误中的精确 Actor/Item ID 查来源和受影响字段，判断能否通过正常 Foundry 文档 UI 修复；不要因为错误就删除保留测试副本或修改五名玩家人物。失败 Item 不渲染，不能凭人物卡推测其名字或把错误自动归因于某个本团模块。Pixi 两条继续单列。旧404已有精确图标地址，需定位是哪份世界内容仍引用它；`plutonium-cn` 因目标D&D6不支持而暂缓，不能为了消除图标404把旧包复制进Next。若要判定页面异常或404是否已消失，需要取得相应当次事件流，不能拿本轮 console 缺字样替代。
