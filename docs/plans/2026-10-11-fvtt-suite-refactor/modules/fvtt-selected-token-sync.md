# Selected Token Sync：HUD 操作与同步计划

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)；进度：[总账](../EXECUTION_LEDGER.md)。S1纯等级规划/原生执行完成边界与S3同源帮助已实施，35项测试与类型通过；帮助调用门另补10项验证。未安装或取得606原生HUD/帮助接受，S2及S3角色实机出口保留。

## 目标与当前事实

保持 HUD 用户操作和纯同步计划分离，明确 linked/synthetic 对象、等级状态和移动同步的目标与写入范围。

- owner：[foundry-modules/fvtt-selected-token-sync/](../../../../foundry-modules/fvtt-selected-token-sync/)。
- 稳定 runtime ID：`fvtt-selected-token-sync`；默认阶段：P5，可独立推进。
- 当前0.2.0，manifest为Core14.368/dnd5e6.0.5–6.0.6，verified保持605；605 GM HUD限定状态/移动行为已有接受，606尚待。无CC/TE硬依赖；multistatus启用时fail-closed，玩家与长时未接受。
- 关键归属：`src/index.ts`、`src/core.ts`。
- 版本与接受须继续对照[支持矩阵](../../../acceptance/current-support-matrix.md)，上述记录不保证未来执行时仍是最新目标。

## 切片

### S1 计划与执行 Interface

核对当前纯规划已经覆盖的去重、clamp、overlay 和 movementAction，只有实际混合的职责才提取；保留用户 HUD 操作来源。

### S2 原生目标 Adapter

对各版本对象/字段的差异做局部适配，所有写入走系统/Token 原生出口；5.3.3 是待确认适配范围，不直接放宽 manifest。

### S3 帮助与角色范围

记录 multistatus 冲突、开关与同步范围；接通帮助并按实际支持范围验证角色 UI。

## 必须保护

用户级 enabled 设置、事务 option key、系统状态和 movementAction 的原生表示；不引入模块自有世界文档或新 CC 依赖。

## 本模块最小真实接受

- linked Actor 多 Token 与独立 synthetic 目标正确规划；快速加减、边界和 overlay 不重复传播。
- 程序触发不会伪装成 HUD 用户操作；multistatus 冲突明确阻断。
- 移动同步不修改原始速度数值；非 GM/玩家行为按声明实测后才能放行。

## 已有检查入口与下一步

- `bun run test:selected-token-sync`
- `bun run build:selected-token-sync`

按本轮变化选择上述入口，不默认全部重跑；类型、手册与整合门禁按共同约定补齐。命令存在不表示本轮已执行或功能通过。

S1提取纯desired等级规划，保留去重/clamp/world→synthetic重读和原生writer。精确606/Core非await链支持的快速0→1→2反例先21通过/1失败，修后等待自有Actor/User的legacy=1及originalExhaustion=1（后续delta为0）才续队列。单操作timeout移除自有Hook并阻断后续分级写，关闭开关清阻断；24项/99断言含foreign监听保留、错误身份/原级不释放、timeout零后续写及恢复。未写derived/legacy、未改API/schema/manifest或CC边界。

当前Next已按用户授权恢复到PID38672/127.0.0.1:30002/Core14.368/dnd5e6.0.6。IFS更新前正常关闭尚未完成；同Chrome另有Forge使用的30001页面，登录隔离无法证明。原生回放继续等待可安全使用的登录环境，不将旧启动拒绝当作当前服务状态。任何迁移/扩展另写具体范围；未达到真实出口前不进入发行清单。

S3可独立接续：把本条目正文迁入owner的docs/manual.json，中央目录只引用，新增Token控制栏只读帮助。GM仅在合集active/ABI1且可调用时定位统一手册；玩家以及合集缺失/不兼容/打开失败时使用同源随包窗口，阅读不受同步开关或multistatus冲突影响，不扩展同步权限。新增检查针对精确entry/ABI、玩家不调用GM接口、失败回退、重复打开与最小化重开、真实Hook按钮零设置/文档写入；沿用模块测试入口和类型检查。正文/来源迁移需人工review、handbook生成/一致性及交付候选刷新，606实际帮助UI与玩家运行仍不预先接受。

S3上述源码/正文与本地交付已完成：ZIP b9e34b65...、JS cc743bfe...，5文件CRC/逐字与13源输入核对通过；36项手册与H4交付检查通过。具体SHA与原件见总账及tokensync-s3-build.json。用户确认Forge仍使用5.3.3网页，继续避开同Chrome重登；下一原生切片保持606 HUD及帮助/角色回放，不以静态结果进入发行清单。
