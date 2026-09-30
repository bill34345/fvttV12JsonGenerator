# 开发反馈工具：Vision5e + Item Macro 实机接续

日期：2026-09-30。状态：运行边界增量已验证，真实批次进行中。范围为既有 ServerNext 的 Vision5e 3.2.2+servernext.1 与 Item Macro 3.0.1+servernext.1；完整模块支持、后续迁移、生产和长时测试不在本轮。

用户继续[试点计划](../plans/2026-09-29-development-feedback-pilot.md)的下一步；本任务承接该限定实机试用及原有提交／合并授权，暂不 push。旧业务树、候选与暂停合同保留，不自动提交既有内容。

## 进入实机前的结果

- 原服务聊天无运行中工作；检查时 Next／Mirror 均无监听或对应进程。旧服务 PID 不作现状证据，既有 Next 需要一次精确冷恢复。
- 原两个候选的安装校验通过，目标目录为空，未安装时即完成候选资源与身份核对。
- 复用原 Chrome 执行聊天做了一次无服务前检：实际本机 turn_context 为 gpt-6.1-sol／max、danger-full-access／never；官方 Chrome 初始化、现有标签读取通过。未导航 Foundry、未登录或修改世界。
- 前检原生消息回传到当前父 UUID；运输回执中的实际接收者与期待值一致，父任务收到同一 dispatch／revision。它证明这次消息送达；不推断结束父 turn 后一定自动唤醒，也不推断后端实际计算模型。
- 主区5条、审计树12条、ServerNext368条与 WMP161条既有未提交路径已记录字节指纹，索引为空；整合前后按同一算法核对。

## 本轮共用增量与验证

新增 `prepare-runtime`、`ready-runtime`、`claim-runtime`、`collect-runtime`。运行合同引用原文件侧合同及当前明确恢复记录，绑定当前父／原执行聊天、实际配置、服务收据和实现字节。派发前再核对当前服务 PID／创建时间／owner／命令行、HTTP 世界与版本，以及安装候选字节。失配不进入消息回调，领取后不自动重放；实际聊天发送仍由获准宿主负责。

证据收集核对新运行 dispatch／revision／父子 UUID／合同指纹与旧宏 sourceDispatchId，固定原生读回、独立上下文及其他证据的指纹，幂等读回。数值和事件记录用于 API 数据观察；界面、玩家视野、刷新和完整清理仍由父任务看实际证据。收集成功保持 behavior INCOMPLETE、parentReview PENDING，不把标签当接受。

| 检查 | 实际结果与范围 |
| --- | --- |
| `bun install --frozen-lockfile` | PASS；仅新任务工作树的锁定依赖。 |
| `bun run test:acceptance-tools` | PASS，63项／407断言；包含原文件侧与离线接入，以及5组新的恢复／配置／服务拒绝、运输领取与回执检查。合成上下文和服务探针仅是协议向量。 |
| `bun run typecheck:tools` | PASS。 |
| `bun run architecture:verify` | PASS；依赖与循环检查。 |
| `bun run test-isolation:check` | PASS；测试不读写持久 Lab。 |
| `bun run agents:generate`／`agents:check` | PASS，32个必需指令文件；生成无差异。 |
| PowerShell 服务探针／私有冷启动脚本语法 | PASS；真实服务及安装接受待后续实际调用。 |
| `bun run handbook:check` | 合并前 PASS，28条工具；已人工对照新增入口、授权、结果和限制。合并后另记。 |

首轮聚焦检查的两个失败已处理：测试把 JSONL 元数据写成多行 JSON；另一次在检查运行期间修改了受绑定的实现，合同按预期过期。类型检查的两处类型声明已修正。修正后相关整合检查63项通过；这些准备期返工不算业务验收通过。

本轮按当前用户要求保持主控与执行聊天模型／effort一致，与原计划 Astra/max 的比较边界不同；未做模型 A/B、三任务时间／token对比或提速结论。

## 实机验收与剩余项

以下仍未执行：启用两个候选；宏的 UI 保存／重开／执行；60→90→60 API；手动参数与真实活动 API；玩家近处可见／远处不可见及刷新；GM刷新读回；错误分阶段归因；精确归属清理和原场景／设置恢复。下一次从这些门禁接续，不重复 WMP 玩法。

父任务必须看实际原件和画面后再判断此限定范围是否通过，记录保留对象／服务及清理结果。全 Vision5e 感官／墙体／语言与 Item Macro 其他系统／旧用法仍未接受；本地结果不能代替生产或长时接受。

本地证据保留在专属 evidence 目录，完整日志和图片不进入仓库。源合同 `NEXT-VM-20260929-03` 保持只读；新运行合同的派发 ID 单独生成，并由当前持久交接文件指向。
