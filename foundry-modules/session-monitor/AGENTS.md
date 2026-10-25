# FVTT Session Monitor / 跑团会话监测器规则

## 这个功能是做什么的

本产品由 GM-only Foundry 浏览器模块和 Windows/Chrome companion 组成，分别记录浏览器内事件与浏览器外进程/内存信号，并合并为隐私过滤的排障时间线。

## 产品边界

- module、companion、schema v1 和版本 1.1.2 是一个发布单元，不能拆成两个漂移产品。
- 它只观察：不清缓存、不改游戏设置、不删除 Foundry 文档、不写世界 LevelDB。
- companion 只管理自己创建的专用 Chrome profile，不接管用户日常 Chrome，不读取 Cookie、密码或浏览器凭据。
- GM 必须通过正常界面登录；companion 不得猜测、提取或绕过密码。
- Foundry runtime 不导入 companion；companion 不导入 generator、workflow、Web 或 Foundry Ops 私有实现。
- 报告不得包含聊天正文、场景名称、Actor 名称、用户身份等游戏内容；新增字段先通过隐私/schema 检查。

## 长时间验收

- Foundry／Chrome 工作沿用根说明，不设固定总时长上限；单操作保留超时，运行前核对目标、服务 owner、存储与隐私边界，结束后核对导出证据及环境。
- 四小时或其他长时测试仅在用户明确要求相应验收时运行。真实玩家活动和非 GM 设备证据来自实际参与者及设备；代理可负责已授权监测与证据分析，不以模拟或多个短测试拼接替代真实会话。
- build、单测、短握手、冷重启 smoke 或本地 start/mark/stop 都不能关闭四小时验收。

## 验证

- `bun run test:session-monitor`
- `bun run test:session-monitor:build`
- `bun run build:session-monitor`
- `bun run typecheck:foundry-modules`
- 运行时变化可以执行目的明确的项目本地 smoke；完成后恢复本轮拥有的模块配置、世界配置、专用 Chrome 和临时对象，保留可复用服务及验收原件。
- `test:session-monitor`中的companion/session-monitor.test.ts会启动真实临时Chrome。普通非浏览器worker只跑本次相关src/release契约；需要该Chrome场景时先走根Chrome执行协议，不把隐藏浏览器副作用当纯unit。当前606只改manifest上限，module/companion/schema版本仍1.1.2；真实会话门保持原范围。

## 完成标准

- module/companion 使用同一 schema、session ID 和版本，浏览器/renderer generation、gap 和错误过滤按预期记录。
- 构建产物、ZIP 和项目本地安装内容一致。
- 本地短时、生产短时、四小时和非 GM 证据分别报告；未运行的真实场景保持 pending。
