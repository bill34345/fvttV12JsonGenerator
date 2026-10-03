# 浏览器执行阻碍与未恢复状态

独立 Chrome 执行器在 batch6N 首次检查页面前收到电脑操作工具的明确停止响应：无法充分可靠地识别 Windows 浏览器当前 URL，以执行工具策略检查。执行器遵从停止，没有检查 Foundry、执行测试、恢复设置或清理对象，也没有创建该批 E2E 证据文件。

父方不通过改用另一控制路径、重派相同操作或更改权限来绕过此停止。Full Access 不能覆盖工具策略。源码、锁定构建和离线测试可以继续；浏览器能力恢复前不能勾选运行时结果。

ServerNext 的独立故障已在用户“都你来负责”授权后恢复：PID36368，127.0.0.1:30002，cor-cotn，14.368/6.0.2，local.6，状态接口与资源哈希核对成功。服务保持运行；恢复证据在私有 batch6N-service-recovery-20260921 目录。没有修改 Foundry/dnd5e 版本、数据根、世界数据库或外部 dirty checkout。

必须保留的未完成事项：

- ConfigSettings gmDoReactions/enforceReactions/reactionTimeout 最后记录为 all/all/60，原值 none/none/10。尚未恢复，重连后先 compare-before-restore。
- batch6L 五个确切 Actor、Scene、Macro 及 batch6M 自有 Combat/嵌入对象尚未清理。UUID 清单在 batch6L/fixture-inventory-pre-cleanup.evidence.json、batch6M/results-by-id.md。
- B04、C06、E03 reset、G03 完整目标切换、G04/G05 最终增量及 Z02/Z03 仍未关闭。
- C03/C04 附魔由父方修复，local.7 尚不能声称运行时通过。

最新分工：父方处理所有非 E2E 工作与总清单；执行器只执行明确编号的测试、原始证据记录、自己测试状态的正常恢复和清理。
