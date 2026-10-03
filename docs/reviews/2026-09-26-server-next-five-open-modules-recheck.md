# ServerNext 五项未收尾模块：发行方与本机复核（2026-09-26）

> **专项证据，不是当前进度表。**本页保留标题日期的来源和检查经过；其中“当前”“未执行”等只属于当时。新对话以[唯一迁移交接报告](../plan/server-next-migration-handoff-20260927.md)为准，仅在核对应证据时读本页。

目标固定为 `F:\FoundryLab\foundry-v14\data\server-next`、`cor-cotn`、Foundry14.368／dnd5e6.0.2。这里只使用当前唯一代码工作区；不碰 Server Mirror、生产或另一工作树。本记录把正式发布、文件安装、世界开启与真实行为分开。旧浏览器任务失败在 Windows 电脑操作通道初始化，**没有进入血猎手新人物界面，也没有证明模块行为失败**。

| 项目 | 2026-09-26 发行方正式来源与本机状态 | 本轮结论 |
|---|---|---|
| Token Action HUD Core | [GitHub 正式2.1.2](https://github.com/Larkinabout/fvtt-token-action-hud-core/releases/tag/2.1.2)于9月25日发布；正式 `module.json` 为 ID `token-action-hud-core`、Foundry最低13.351/verified14.368、必需 `socketlib`、可选 `color-picker`。ServerNext 已有 socketlib v1.1.4；本轮离线装入 Core2.1.2，37个文件逐一核对。 | **版本、文件安装、世界开启及重新进入后的读回通过**。不重复玩法测试。 |
| Token Action HUD D&D5e | [GitHub 正式2.2.0](https://github.com/Larkinabout/fvtt-token-action-hud-dnd5e/releases/tag/2.2.0)于9月25日发布；说明明确仅用于dnd5e6+并要求Core2.1.2。正式 `module.json` 为ID `token-action-hud-dnd5e`、Foundry最低14.359/verified14.368、dnd5e最低6.0.0/verified6.0.5/maximum6.99、Core依赖2.1.2–2.1.99。ServerNext当前6.0.2在其声明范围内；本轮离线装入D&D适配器2.2.0，18个文件逐一核对。 | **版本、文件安装、世界开启及重新进入后的读回通过**。不重复玩法测试。 |
| Plutonium CN | [GitHub 最新正式v2.15.6](https://github.com/5eTools-Plutonium-CN/Plutonium-CN-Next/releases/tag/v2.15.6)仍是原版；正式Foundry14清单ID `plutonium-cn`、D&D最低5.3.0/verified5.3.2/**maximum5.3.999**。ServerNext为6.0.2且未装此包。 | **暂缓**。不能拿同发行方英文版或Foundry14声明冒充D&D6兼容，不安装/开启。 |
| 本团 JSON Forge | 原环境0.4.0只在另一未整理工作树；本唯一代码工作区没有同版候选，目标未装。用户此前明确选择等另一工作树整理，不允许本任务新建工作树、暗中复制或降到本工作区旧版。 | **暂缓，来源整合未完成**。当前工作区无法交付原环境0.4.0。 |
| 本团 Blood Hunter 2024 | 精确旧原始文件已按用户单文件只读授权找回；新目标包已装/开启，旧人物更新在专用测试人物上通过留底、副本、原人物更新与重载。新人物完整升级和能力实际使用未验。旧独立浏览器任务本轮因电脑操作通道找不到本机管道而未进入游戏，未创建测试人物。 | **继续处理**新人物关键路径；通道故障与模块行为分开记录。 |

## 两个动作快捷栏正式包的安装与启用结果

从上列两个 GitHub 正式发行下载包获取并逐项检查，随后在原世界正常关闭且23处锁全部释放后安装到 ServerNext：

| 官方包 | ZIP SHA-256 | 文件数 | 包内清单与路径检查 |
|---|---|---:|---|
| Core2.1.2 | `F56B81717CE302F3E4C6122979AF620DDD128DEA161C208B1552E5A40B696879` | 41 | 根 `module.json` ID/版本/依赖与正式下载清单相同；无绝对路径、`..`、重复路径或符号链接。 |
| D&D5e2.2.0 | `1E1F6CBD4FFC9FF9070FEF56AE81C02A0AD6B161FC43A4D02F930E553E4DA19D` | 21 | 根 `module.json` ID/版本/目标范围/Core2.1.2依赖与正式下载清单相同；同样无路径越界、重复或符号链接。 |

两个ZIP与逐文件哈希清单位于 `F:\FoundryLab\foundry-v14\evidence\server-next-migration\hud-formal-20260926`；[安装及服务读回](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/hud-formal-20260926/installation-and-service-readback.json>)单独留存。本轮只读核对原服务器PID43220／本机30002／`server-next`／`cor-cotn`，世界已由GM正常关闭，`active=false`，23处锁均可独占打开；精确停止该进程后新建两个原先不存在的模块目录。安装后Core37个文件、D&D适配器18个文件的大小和SHA-256均与待装清单一致。按原参数恢复为PID24104；`/api/status`读回原世界active、Foundry14.368／dnd5e6.0.2、0人在线，登录页和两个模块清单均返回HTTP200。启动早期一次过早探测遇到连接拒绝，等待后确认服务正常；同时尝试前台再次启动因同一数据目录已由PID24104占用而被拒绝，没有建立第二个服务。**这是安装刚完成时的状态；后续正常界面开启与新页面读回见下段。**

用户指出应使用 Chrome 后，本次新建的独立任务已再次核PID24104、世界、版本、0人在线及安装记录，但它当前可调用工具中没有 `@Chrome` 浏览器操作入口。该任务按约没有用电脑操作工具或其他途径绕行，没有进入游戏、没有创建或修改任何人物。两个HUD世界开关与重载、Blood Hunter新人物升级与能力使用均为 **NOT_EXECUTED**；原因是浏览器工具不可用，不是模组失败。

**后续实际界面结果，覆盖上段两个HUD的“未执行”历史状态：**本机 Chrome 插件仍没有向任务提供工具；主任务依据用户“不手动介入”的要求，使用本机已安装的 Chrome 与 Playwright，仅通过正常登录页和游戏内模块管理界面操作 ServerNext。操作前核 Gamemaster／`cor-cotn`／Foundry14.368／dnd5e6.0.2；界面原有72项开启，Core/D&D两项关闭，socketlib开启。只勾选 `token-action-hud-core` 与 `token-action-hud-dnd5e`，勾选差异恰为这两项，保存后界面提示重新载入。随后关闭该临时 Chrome 页面，用**全新页面**再经登录进入同一世界；游戏实际读到Core2.1.2与D&D2.2.0均 `active=true`，socketlib v1.1.4仍开启；正常模块管理界面74项已勾选，两项也均勾选。[保存动作原样结果](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/hud-formal-20260926/ui-enable-hud-result.json>)、[新页面读回](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/hud-formal-20260926/ui-readback-hud-result.json>)。**两个HUD按用户规则的版本／安装／启用门禁PASS。**没有玩法测试，也没有改其他模块开关。Blood Hunter新人物仍未测，不能随HUD一起判通过。

## 待判断本地化和下次复查

- HUD两包若正式发布继续更新，操作前重查发行页、正式ZIP内清单、Core/系统依赖和目标版本；按来源声明只做安装与启用结果核对。
- Plutonium CN等作者正式版明确覆盖dnd5e6.0.2后再复查；不改用不同ID替代。
- Forge等用户许可的另一工作树成果整理并有可信来源进入**当前唯一工作区**后再整合；本任务不越界读取或安装。
- Blood Hunter只验受迁移影响的新人物职业升级、动作与效果，不重跑已通过的旧人物更新。
