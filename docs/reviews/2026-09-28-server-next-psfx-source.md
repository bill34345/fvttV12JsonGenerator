# ServerNext PSFX 正式包来源与安装候选（2026-09-28）

## 当前结论

Server Mirror 保存为开启的 `psfx` 是 `0.15.0`。2026-09-28 重新核发行方后，正式最新发布已由交接表旧快照的 `0.17.0` 变为 **`0.18.0`**（发布于 2026-09-27 14:26 UTC）。它是免费音效库，发行方[项目 README](https://github.com/JimHPerry/psfx)说明音效可与不同系统的动画混用；当前清单声明 Foundry minimum 11 / verified 14，不声明 dnd5e 系统限制。**正式包已安装，正常客户端启用/重载保持与 Sequencer 数据库登记 PASS；实际音频播放 NOT_EXECUTED。**不预先称整库或 D&D6 自动动画玩法通过。

## 正式来源与包内检查

- [发行方 0.18.0 固定标签](https://github.com/JimHPerry/psfx/releases/tag/0.18.0) 的 `module.json`、`psfx.zip` 分别为 1083 和 28,888,805 bytes。GitHub Releases API 提供的 SHA-256 digest 分别为 `4FCC...B2655` 和 `781C...DE87`；下载后完整 SHA-256 实测为 `4FCCD49CDCEADC6FB3F373A7F2068C8D4B419C52070ADF4A8D68756C6F4B2655`、`781CFA4EE0E54E2ED8AD40B328063358EF8991E3C7A229FCAD82D1B1DD44DE87`，与发行方 digest 一致。原包保存在 `F:\FoundryLab\foundry-v14\evidence\server-next-migration\psfx-next-20260928`。
- ZIP 有单一顶层 `psfx-0.18.0/`，内部 461 个文件，展开后 30,022,161 bytes。去掉这一固定顶层后，路径没有绝对地址、`..`、重复项或符号链接；内含 `module.json`、4个被 init 导入的脚本、音效库、宏 pack、README 和许可文件。ZIP 内清单 ID/版本与发行版 manifest 一致。
- `scripts/psfx_sequencer.js` 中非注释的 396 个 `.ogg` 路径均在 ZIP 内；另外 40 个原始文本引用位于注释代码，不能当作运行时缺文件。Next 已有 Sequencer 4.2.3 开启，但 PSFX manifest 没有强制模块依赖。
- `scripts/init.js` 只注册模块设置、音效数据库和 `sequencer.ready` Hook，不调用 dnd5e 6 私有接口。旧 0.15.0 的一次性欢迎开关为 `popup0726`；新 0.18.0 改为世界设置 `popup1026` 且默认 false，**首次 GM 启用可能创建一条欢迎 ChatMessage 并把开关保存为 true**。这个可预期世界写入需在独立 Chrome 验收中按消息 ID 记录并清理欢迎消息，不能把它当作启动错误，也不直接编辑世界数据库。

## 离线安装与服务 smoke

ServerNext 服务停止、精确目标目录原本不存在、23 个世界锁可独占均已核；正式 ZIP 单一顶层下的461个文件无备份安装到 `server-next/Data/modules/psfx`，逐文件SHA-256与下载源一致，未碰 Mirror 或世界数据库。[停服前门禁](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/psfx-next-20260928/pre-install-gate.json>)、[安装回执](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/psfx-next-20260928/install-receipt.json>)。原世界短时恢复后，manifest HTTP 200，抽查一个 `.ogg` 返回 200 / `audio/ogg`；客户端启用和声音播放分别在下节记录，不以 HTTP 代替。

## 独立 Chrome 验收与结束状态

[独立任务回执](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/psfx-next-20260928/psfx-chrome-acceptance-20260928-171743.json>)锁定原 `cor-cotn` / Foundry14.368 / dnd5e6.0.2 / PSFX0.18.0，使用官方 Chrome 可见 UI；主任务另核[服务 smoke](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/psfx-next-20260928/server-smoke.json>)中的一个 `.ogg` HEAD 200 / `audio/ogg`。分层如下：

| 场景 | 结果 |
|---|---|
| 模块开启与重载 | PASS。正常模块管理只勾选 PSFX，85→86 active；重新登录后版本0.18.0与勾选保持，原开关未改。[界面](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/psfx-next-20260928/psfx-module-after.png>)。 |
| 首次欢迎消息 | PASS。原 `popup1026=false` 触发一条本包欢迎 ChatMessage `M20WYrg1vN0bRaV6`；经正常聊天上下文菜单只删除该消息，DOM 读回0条；模块写入的 `popup1026=true` 作为首次运行标记保留。[欢迎卡](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/psfx-next-20260928/psfx-welcome-card.png>)、[设置](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/psfx-next-20260928/psfx-popup-setting.png>)。 |
| Sequencer 数据库 | PASS：Sequencer Database Viewer 正常显示 `psfx` 分类及子目录。[界面](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/psfx-next-20260928/psfx-sequencer-database.png>)。实际声音播放 NOT_EXECUTED；上述 HTTP 200 仅证明一个文件可访问。 |
| 启动错误差异 | 本批客户端10 errors / 35 warnings，与前一批数量一致，没有 PSFX、Sequencer 或 `popup1026` 相关新命中。旧8条 Item 校验、2条 Pixi 及付费保护包签名问题继续单列。 |
| 停服 | PASS。GM 正常返回Setup、`/api/status active=false`、23/23世界锁可独占后停止精确PID42656；30002监听0。运行16:51:28—17:17:43共1575秒，在30分钟门限内。 |

本批结论为 **PASS_WITH_SCOPE_LIMIT**：PSFX 的正式文件、启用与目录登记可用，音频播放与整库覆盖未验。后续若需要声音语义，只选一个受支持的 UI 播放路径补证，不重复本批通过的安装/开关门禁。
