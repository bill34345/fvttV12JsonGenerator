# B00 — 命令行 Chrome 与双身份会话

只执行本批，不执行 B01 以后内容。先按 README 共同硬规则核对环境；Lab 停止时用正式 launcher 启动，已健康且身份吻合时不得启动第二个进程。

1. 用 README 中的 PowerShell 命令打开可见 Chrome GM 窗口。按 `chrome:control-chrome` 选择明确的 `chrome` backend、读取其完整运行时说明、连接/认领 `127.0.0.1:30001` 标签页。禁止用默认 Browser、Edge、Computer Use 或 standalone Playwright替代 Chrome 控制。
2. 另行选择明确的 `iab` backend 作为玩家。两个绑定不能共享；空密码各提交一次。
3. 用页面可见内容保存证据：Chrome 显示 `Gamemaster [GM]`，内置 Browser 显示 `佐德`；Foundry 14.364、dnd5e 5.3.3、`cor-cotn`；GM 有 Tiles 控件，玩家无 Painter 控件。
4. 玩家在控制台尝试取得模块绘制/清除/阶段变更入口，证明无法创建、更新或删除模块文档；只记录返回类型和前后 `auditScene()` 计数，不保存浏览器存储。
5. 创建并切换一个 `BP-ACCEPT-20260815-B00-<HHmmss>-Session` 空任务 Scene 再返回，记录两端 Battlefield Painter 相关 console errors、network failures 和 server log 新区段。

证据名以 `BP-E2E-B00-` 开头。完成标准是两个独立 backend、两个不同角色和玩家写入拒绝全部有可见证据。批末只更新会话/权限结果并停下；保留 Lab 与会话。
