# Mirror MCP 接续实施与验收

日期：2026-10-26，Asia/Shanghai。Owner：聊天 `01a173dd-c199-7281-9775-17e178f56517`，工作树 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261026-004213-foundry-mcp-readiness-review`。

## 范围与授权

用户原话：“现在可以看下nn mirror 了。”本轮恢复此前已授权的 Mirror 连接、准备入口、日志与重连修正；先前“先处理 next吧，mirror先不要处理”的暂缓已经解除。复用 [Next 已验证实现](2026-10-26-foundry-mcp-readiness-implementation.md)，保留其证据；不把 Next 的 PASS 当作 Mirror 运行验收，不操作生产，也没有 Git 提交、合并或推送授权。

## 当前观察

- 08:48 起，初始 Mirror Foundry 服务未运行，正式 MCP 返回模块未连接；工具调用后本机 MCP 后台正常，控制/Bridge 端口为31414/31415。
- Chrome 初始未运行。执行代理通过已安装官方启动工具启动 Chrome，重新发现浏览器；新清单没有30001或旧Forge验收页面，未观察到恢复的Mirror页面占用。旧标签页ID不作为当前证据，没有向其他聊天发送消息。
- 准备入口启动了精确 Mirror PID20308，app14.368、既有server-mirror数据、cor-cotn、dnd5e5.3.3、回环30001、`--nobackups`。
- 首次准备在45秒等待后报告 `startup_failed`；同一进程于08:50:45正常完成世界启动，约48秒。失败收据保留；独立读回PID、命令、端口与 `/join` HTTP200后复用，没有重复启动或重启。
- 这一实际差异导致启动等待窗口由45秒改为90秒，并同步已安装固定入口。相关readiness安全测试17项/73 assertions、tools类型检查均通过。该时间调整未做新的冷启动重放；本轮不为了测一个等待常量停止已就绪的共享Mirror服务。
- 专用GM基线已通过：本任务页651351330，`http://127.0.0.1:30001/game`，初次登录页面显示0/7在线。原生MCP返回正确世界/实例、Core14.368、系统5.3.3，角色目录318项，既有Amalgam读取成功。
- 基线Bridge原本已启用，Host/Port为localhost:31415、Allow Write Operations为true；自动重连实际为false。该现状可以解释当前不会按该偏好自动恢复，但不能证明谁或何时关闭，也不能解释所有历史断线。按用户已批准的自动恢复目标，将其作为本轮必要设置修正，保留其他偏好。
- 已核Bridge0.8.4原主文件SHA256 `169abb12ddc7793f9c8dbcb7d01484a50f28d79cc82c550384a4ed70cf43d6b0`；安装后主文件SHA256 `eb75ed360c8dba836a8a9ff01589a76df232fed5e41a41ac31a06aa743789cb3`，恢复helper为 `8c7b4d49b8ca355a895e278c1f6f2110dfa8310adfa5099ceeb818039bd02ed5`，与Next接受实现相同。安装读回通过，重复plan为0写入；页面重载及Mirror实际恢复均已通过。
- 已通过正常设置界面将自动重连false改为true，并仅重载本任务页；写入权限原值true未变，模块已加载 `local-recovery-1`，实际心跳间隔30秒。恢复用临时宏的完整来源保留，已按精确ID清理并读回为0。
- 当前固定CLI包含90秒等待修正，SHA256 `c20c3b029f97c30d1933c27a0d49fec26b181762e72008e45fc07f491e09a361`；该更新同步本机入口，不代表重跑或改变Next已取得的功能证据。

## Mirror实际恢复行为

- 本任务页临时断开自身WebSocket后，北京时间08:56:29.931记录断开、08:56:32.187自动连接并标记recovered，约2.26秒。这里是该次心跳相位下的实测，不是固定恢复时限承诺。
- 08:57:33.276明确停止；08:58:30.740仍未连接且监测关闭，保持约57.46秒，超过实际30秒心跳间隔。enabled与autoReconnect保持true，写入权限原值true未变。
- 停止期间，CLI于08:57:36.863返回 `gm_bridge_missing` / exit2、复用同一PID20308；当前聊天原生world读取也返回module not connected，均没有把协议可达当作游戏就绪。
- 主代理采集停止证据后允许手动恢复；08:58:45.114连接恢复。08:59:42.204专用页面重载后读回正确版本、实例和端口，适配器及重连偏好均生效。
- 09:00:37固定本机入口prepare返回 `ready` 并复用原PID20308；当前聊天原生MCP同时成功读取正确Mirror世界及既有Amalgam。正式读取与独立CLI分别保留证据。

## 本轮验证选择

复用：同版本恢复适配器单元/精确源码契约、独立代码审查和Next行为证据；源码未变，不重跑Next用例。新增：Mirror专用GM页、正式世界与既有角色读取、已核适配器本地安装、连接中断后恢复、显式停止保持/恢复、页面重载、日志和临时宏清理。仅对本轮修改的启动等待层运行现有聚焦检查，并在最终核对手册指纹。

本轮收据：工作树 `.local/mcp-readiness/mirror/` 与 `.local/mcp-readiness/browser/mirror/`。后续实际结果在本文件续写；未采到的检查不标为通过。

## 最终交付

Mirror本轮实施已完成。服务PID20308和专用GM页651351330保留供实际使用；最终原生MCP在清理后再次读取正确Mirror世界。临时宏P07eHF2UUpCew22Z按精确ID与名称检查均为0；其他页面和Next运行状态未操作。

主代理目视核对了实际Bridge设置截图，确认Connected、31415、自动重连勾选及写入权限保留。固定CLI最后返回ready并复用同一服务，日志当前记录和最近成功读取时间均可读回。新增17项readiness回归、tools类型检查及38项手册生成/一致性检查通过；未重跑源码未变的15项恢复测试及Next接受。

证据入口：`.local/mcp-readiness/mirror/final-operational.json`、`browser/mirror/final-operational-receipt.json`、`browser/mirror/final-ui-cleanup-readback.json`。已记录的45秒启动超时是历史工具窗口不足，不是当前未解决的启动失败；90秒调整未另做冷启动重放的限制保留。

本机修正及固定准备入口已生效；仓库改动和手册仍在任务工作树，未提交、合并或推送。连接仍依赖专用GM页在线，不声称仅启动Foundry即可在无客户端时访问世界，也不声称Next此刻同时在线。

## 后续主线整合授权

用户随后明确：“那就把这次 Next 和 Mirror 的修复、准备流程和手册一起提交并合并到主线吧。”本次授权覆盖这批实现、记录、Ruler流程与手册的提交和本地主线合并，不包含远程推送。前文“未提交、合并”描述的是运行验收完成时点；提交身份与主线包含关系以Git历史和合并后读回为准。原始运行证据保留，文档整合不重跑已通过的浏览器用例。
