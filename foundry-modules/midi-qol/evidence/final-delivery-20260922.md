# Midi-QOL local.7 验收与最终清理交付

完成日期：2026-09-22。目标为 ServerNext / cor-cotn / Foundry 14.368 / dnd5e 6.0.2 / Midi-QOL 14.6.0-beta.4338eeab.local.7。A–G及Z01–Z04总计35项已有通过证据并完成父方复核；历史PASS保留原版本和时间，不改写成全部在local.7新测。

## 最终清理及恢复

独立Luna Max任务 `01a0c792-32fa-7463-88f1-5d9755d8cbee` 的实际 never / danger-full-access 已核实。Fast未从运行配置证实，不宣称开启。外部Chrome恢复后，正常Foundry Macro UI及Document API删除5个Actor、1个Scene、1个Combat、2个既定Macro，另清理经AA原创建记录确认的临时Macro.V0vgPBSNl6e1F7ne，共10个root。随Scene/Actor包含的测试Token、Region和过期效果一并移除。没有删除ChatMessages；保留测试报告。

- 九root报告：ChatMessage.RAWCZeY8jBT8MvwO，2026-09-22T05:49:10.227Z，removed=9、alreadyAbsent=[]、remaining=[]、messagesMissing=[]、shared before=after。
- 最终补充报告：ChatMessage.K2bQS8bXUEDENS4B，2026-09-22T06:01:24.999Z。精确临时宏删除后absent；AG-MIDI6/AG-L6/AA-READBACK前缀宏审计为空。未知对象未删除。
- MidiQOL.configSettings()真实前后读回：gmDoReactions/doReactions/enforceReactions均none，reactionTimeout10，autoItemEffects off，autoCEEffects none。先前以独立setting键读取产生的null是诊断错误，已由正确接口读回取代，无设置写入。
- targets=[]，按真实Map/object类型读取workflow keys=[]；shared worldTime21085409、active/viewed Scene.k0tDQjWqrbvHbjdu、Combat.8WCtc3bOyudYuHzh round11/turn5均未变。
- 执行器报告临时借用的既有CRITMAX-HOOK-DEBUG宏已恢复原命令并保存，不删除该既有宏。

证据根：`F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6AE-final-owned-cleanup-20260922`。

父方直接复核官方工具输出，保留原始记录并提取：

| 文件 | SHA-256 |
|---|---|
| ae-cleanup-verbatim.json | 61349C6C36C21F273046CEE5993F1246776FDF36DF21355426060F7AA1362EC2 |
| ae-final-exact-original-ax.txt | FE5A3D2057C331B617B70C026E109F65A83B1FC6B254D3B5284D24A403C34FEF |
| ae-final-exact-ax-decoded.json | 2B23C2735C8E08143AC0EFB29887EECBF9FB4702F6AEC717643EF3E29BB60387 |

最终AX将origin URL拆成link和child text；decoded文件只去除AX节点包装并保留URL一次，不改变报告字段。对removed数量/唯一性、remaining、消息保留、全部root absent、配置相等、共享状态相等、目标及workflow为空的父方断言全部通过。执行器整理文件z03-z02-final*.json作辅助，不替代原始证据。

## 运行环境与交付边界

父方最终再次核实PID34548只监听127.0.0.1:30002，/api/status active=true、Foundry14.368 / dnd5e6.0.2 / cor-cotn。服务保持运行，清理未重启。已安装bundle SHA-256仍为1BF57FB02BCBB0C67A53CEBF38763F527DE11D872C7DB8ED5A32249871048BAC；没有重装Midi或新增Midi源码补丁。

分支 codex/20260919-151319-server-next-migration，HEAD b0396c3b6f3950d0dfdc5ec88de2bf558c1bff6d。所有既有dirty及外部Midi checkout的4条dirty/untracked保留。未commit/merge/push、未创建备份、未直接修改LevelDB、未写mirror/30001、未生产回迁。

Batch6的Midi兼容验收和授权清理已关闭。G04/G05记录的其他模块资源404及兼容警告仍按原证据归因，不把本交付写成全模块零错误，也不等同后续迁移批次或生产验收完成。浏览器传输修复是已验证的本机兼容修复，宿主更新可能替换它；最终页面操作与清理已通过官方外部Chrome完成。
