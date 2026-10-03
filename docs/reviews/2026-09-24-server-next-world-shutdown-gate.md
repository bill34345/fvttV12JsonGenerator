# ServerNext 正常关世界门禁（2026-09-24）

> **专项证据，不是当前进度表。**本页保留标题日期的来源和检查经过；其中“当前”“未执行”等只属于当时。新对话以[唯一迁移交接报告](../plan/server-next-migration-handoff-20260927.md)为准，仅在核对应证据时读本页。

目标是 `F:\FoundryLab\foundry-v14\data\server-next` / `cor-cotn` / Foundry 14.368 / dnd5e 6.0.2 / `127.0.0.1:30002`，当前进程为核对过命令行的 PID39880。本记录只涉及本地 ServerNext，不改变 Mirror 或生产。

独立 Chrome 任务在 GM 世界里确认只有 Gamemaster、Session Monitor Idle，且已知 House/Resolver 测试前缀的 Actor、Macro、ChatMessage、Dialog 均无残留。Settings→Return to Setup 的普通按钮点击、Playwright UI 点击和聚焦后 Enter 均未把页面带到 Setup；[UI 记录](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/combined-resolver014-midi-local9-20260924/world-return-to-setup-ui-20260924T092710Z.json>)为 `NOT_COMPLETED`。服务端 `debug.2026-09-24.log` 在本地时间17:24:24、17:25:09、17:25:45记录了三次 `World shutdown request received`；[主任务脱敏读回](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/combined-resolver014-midi-local9-20260924/world-return-to-setup-parent-analysis.json>)于09:33 UTC仍为 `active=true`、世界 `cor-cotn`。所以按钮事件确实到达服务端，但世界未关闭。未捕获该三次请求的 HTTP 响应状态，不能判定是会话权限、数据库断开、客户端跳转还是其他原因。

本地精确版本源码显示：`client/applications/sidebar/tabs/settings.mjs` 的 `data-app="setup"` 调用 `game.shutDown()`；`client/game.mjs` 向 Setup 路由发送 `worldShutdown` POST；`dist/server/views/setup.mjs` 收到后调用 `sessions.logoutWorld` 和 `World.deactivate`；`dist/packages/world.mjs` 的 `deactivate` 在非管理员请求下要求有效 GM 会话，否则返回 `success:false` 且世界保持运行。这提供了下一步应核查的分支，不证明本次请求一定落在该分支。

下一次独立 Chrome 轮次先在正常界面核验 GM 会话及请求结果；必要时通过正常 `/join` 重新登录，再单次尝试 Return to Setup，分别记录页面、响应或可见错误。父任务须独立核对 `/api/status active=false`、23个世界 LOCK 可独占打开，之后才能停止精确 Node 进程并更新 Resolver0.1.4与Midi-QOL local.9的五个非 pack 文件。若仍失败，保留运行服务和未更新模块，报告精确失败；不以直接编辑 LevelDB、覆盖 pack、无鉴权 HTTP 请求或强停进程替代该门禁。

## 后续正常路径已成功

新一轮[独立 Chrome 证据](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/world-shutdown-gm-session-20260924/world-shutdown-gm-session-20260924.json>)先核对仅GM在线、Session Monitor Idle、已知任务对象无可见残留，再用 Settings→Log Out 正常退出；`/join` 显示0/7，选准Gamemaster且用户密码留空、未触碰Admin Password，成功重新进入原世界和Scene。随后仅点击一次 Settings→Return to Setup，页面出现世界关闭通知并进入`/setup`；主菜单备用入口未使用。该轮另见一条`pixi.min.js` RangeError，因果关系未知，未影响本次关世界结果的独立读回。

父任务[停服前机械门禁](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/combined-resolver014-midi-local9-20260924/pre-stop-gate.json>)读到精确Administrator进程PID39880、唯一loopback30002、`active=false`、23/23世界LOCK可独占打开，才停止该PID；随后[全量文件清单](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/combined-resolver014-midi-local9-20260924/full-offline-preapply-inventory.json>)和[五文件定点更新](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/combined-resolver014-midi-local9-20260924/five-file-applied.json>)保留Midi现有18个pack文件与其余未改文件哈希。新PID7308已在原app/data/world/port/loopback参数下恢复；[服务读回](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/combined-resolver014-midi-local9-20260924/persistent-verified.json>)为原世界active，静态资源版本/哈希对账通过。最初按钮三次未关闭的具体原因**仍未实证**；“重新登录后成功”只说明这一路径有效，不反推原会话故障类型。
