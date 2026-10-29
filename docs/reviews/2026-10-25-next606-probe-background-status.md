# ServerNext 6.0.6：Painter 验收工具拦截后台连接状态记录

## 当前结论

真实 Painter movement 用例已完成首次准备，尚未绘制、创建 A/B Token 或发出移动。验收工具拒绝了 `foundry-mcp-bridge.lastConnectionState` 的一次更新并暂停；这不是 Painter 玩法失败。原准备和拒绝记录保留，不重建夹具。

被拒绝事件没有保存拟写 payload，不能追认它写的是哪个状态。当前世界值与开测 hash 一致，说明该被拒绝操作未改变已采集设置。后续修复只放行准确记录上当前值和拟写值都等于原 `error` 的幂等更新；其他状态、其他字段或其他记录仍拒绝。旧拒绝原数组必须完整保留，接续需绑定具体已审前缀和原件，不能清空或把未知拒绝统一豁免。

## 本机原始证据

- 目标仍为原 Next PID 48896、loopback 30002、Core 14.368 / dnd5e 6.0.6 / cor-cotn；未改 Mirror、生产或服务。
- `chrome-business/painter-movement-r4/01-prepared.json` SHA-256：`98d446065ae8a23092ee86c801331db3f1afd83e5d5321c9adc5e2e386bf8970`。
- 自有 Macro `zkNq5g381yAHk0Lw`，Scene `N2Qg41PQ1F2B6TPc`、Level `INQ3SKOcxCWxcPw4`、Actor `ulbYBCxhJsVYLKUK`；phase 为 `awaiting-one-fire-fixture`。
- 顶层 `blocked` 只有 `preUpdateSetting / hQ1kddGHYhWSQf5V / foundry-mcp-bridge.lastConnectionState`；持久 run 的 blocked 数组为空，因为事件发生在准备保存以后。升级时须同时保留 live 和持久证据。
- 本例 Calendar 前像准确存在：`iWZGzzQw5Nh2n1nR / FccwB5HfAhy1F49a`，原 raw SHA 为 `f70c502e1a6e0b2618eac2b2d572960b72d0f196c8cebd2bd997a8983e5c4f8d`。这只是新例当前 B，不恢复或批准 TokenSync 旧未知 A。

## 精确来源与反证

本机安装的 Foundry MCP Bridge 0.8.4：

- `Data/modules/foundry-mcp-bridge/dist/settings.js:311` 将 lastConnectionState 注册为 world scope、隐藏的 String，default 为 disconnected。文件 SHA：`03fd8ffce90d29e44e7cf01988303033caa1a20a75138f21bb14878efe18374f`。
- `dist/main.js:162` 在连接成功时写 connected；199 在启动失败时写 error；220 在 stop 时写 disconnected。文件 SHA：`169abb12ddc7793f9c8dbcb7d01484a50f28d79cc82c550384a4ed70cf43d6b0`。
- 准备记录该准确 world Setting 的原 raw hash 为 `4d01709fcd599118652e3b27bd0ca97c802f832183d01f76a034755f2bc62fa3`。对精确源码有限状态的 JSON 字符串计算 SHA，唯一匹配为 `"error"`。connected、disconnected、connecting 均不匹配；没有猜测任意设置值。
- 唯一相同值放行仍须核准确 ID/key/world owner、当前 Fcc requester、仅 `_id/value`、当前 raw 和拟写 raw 都严格相同，以及原 baseline hash。仅有相同 key、有效枚举或父审记录均不足以允许真实值变化。

这解释了为什么全拒绝未知 Setting 的工具会暂停，也限定了最小修复。它不证明桥已连接、连接故障已修复或该旧 attempt 的 payload。

## 运输缺口与恢复方式

正常 Macro 目录 Export Data 一次未取得下载事件或实际文件，保留 `02-native-export-transport.json`，未重复导出、重载或业务准备。Core `client/documents/abstract/client-document.mjs:928` 的 exportToJSON 还会经 toCompendium；1108 的默认 clearOwnership=true。因此普通导出本身不能冒充完整原生 source。

改用已有自有 Macro 的正常 command 编辑入口临时安装只读 reader，经原生 Socket GET 读该准确 Macro 全 source、flags、run 和 ownership，并以 Dialog 关闭 details 中的文本分段读回。只读 reader 不更新 User、Setting、flags 或别的文档；之前的正常 command 保存和审计变化单列。原 r4 command 保持本地冻结，旧 live closure 不重载。新 r5 replacement 必须从实际 source 生成，保留其他字段与旧 run，只改本工具 command 和 owner source SHA；随后精确迁移自己旧 hooks/事件，不靠重载丢失拒绝记录。

`03-native-own-source.json` 已实际取得，SHA 为 `40d5969c789cb0b724c380633f5cb71c5dd5b2bfb9e0f773d7224fe83bdc0fb2`。父独立核对实际持久 run、live run 和01准备 run逐项一致，canonical SHA为 `5cf0970c1261acee3e45a340370b762c2cd0bc914b49a09f0763e78391ef5002`；ownership仍default0/Fcc3，flags仅原world owner/run。临时 reader command SHA为 `b76d7b39fb7d020823b91dc6a75b478db9408bc201ff98f3448ef9052d2f1fa8`，旧live source仍4bbb。真实Setting当前hash仍为原error hash。

正常打开自有Macro编辑器以后另捕获一次 `preUpdateUser / FccwB5HfAhy1F49a` 拒绝，payload未存，不能确定为哪个字段或追认为窗口尺寸变化。该原事件与原Setting拒绝均保留；实际post User事件目前只见两次本例Fcc的sidebar-tab和正常审计时间。r5须先只读取完整八叶当前比较、其他非敏感flags hash和已知叶的当前事件归属，父审实际结果以后才接续，不能将“pre已拒绝”直接写成User精确恢复已通过。

## 外部调研与边界

按个人调研规则先发现 AnySearch code 子域，再作 GitHub 原仓库连接失败报告和精确实现的混合检索；该批量调用未取得可读回执，没有据此声称找到社区案例。随后用精确报错检索 `site:github.com/adambdooley/foundry-vtt-mcp/issues "Failed to start bridge"`，返回 No relevant results found。因此没有可比真人报告支持本机因果；当前判断来自本机精确安装源码、被拒绝事件、原指纹及必要反例。未找到匹配报告没有改变对本机事实的判断，也不能推广到其他桥版本。

上游来源身份来自安装 manifest 的 [原仓库](https://github.com/adambdooley/foundry-vtt-mcp)，未把其当前分支作为 0.8.4 的版本证明。本次无待引入或本地化候选，不建议修改第三方桥。新候选复查时先比安装源码 SHA，再检查该 Setting 是否仍为相同隐藏 String、作者实际 writer 枚举及本例原 hash；发生漂移时停止复用此窄门。

当前仅工具修复准备与运输恢复，Painter 的移动成本、linked falling、普通 reload 及最终清理均仍待实际结果。已接受绘画、Undo、Redo、veto 不重测。
