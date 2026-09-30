# 共用验收工具：Vision5e + Item Macro 离线接入

日期：2026-09-30。范围：用户接受下一轮离线接入方案，继续授权本任务提交、合并到 master，暂不 push；ServerNext 原批次维持暂停。依据：[试点计划](../plans/2026-09-29-development-feedback-pilot.md)、[第一版记录](2026-09-30-development-feedback-tool-v1.md)。

## 基线与归属

从已提交 master `312f394ccfca2f1d630c26052cb562d356ff6ded` 建立唯一工具树 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20260930-122735-acceptance-next-vm`，分支 `codex/20260930-122735-acceptance-next-vm`。主区原有 5 个 dirty 路径、索引为空；ServerNext 源树 368 个 dirty 路径，WMP 161 个，前一个工具树 clean。保存其 status、文件指纹和 staged 清单作为发布对账基线。

既有源树为 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration`，HEAD `b0396c3b6f3950d0dfdc5ec88de2bf558c1bff6d`。其业务实现、构建与旧合同只读，不复制源码、不整合其未提交内容、不重写唯一当前状态。原合同路径为 `F:/FoundryLab/foundry-v14/evidence/server-next-migration/vision-macro-20260929/current-chrome-dispatch.json`。

## 实际来源与接口事实

原批次 `NEXT-VM-20260929-03` 为 `PREPARED_NOT_DISPATCHED`，parentContinuation 明确暂停。原父线程 `01a0ec3b-9fad-72a0-9869-c6f58a0220b6`、子线程 `01a0ec4b-9484-7dc0-a727-e8d4b9b347b5` 保留为来源归属，未向任一线程发消息或复用旧模型配置执行 Chrome。

固定候选为 Vision5e `3.2.2+servernext.1` 与 Item Macro `3.0.1+servernext.1`；声明资源分别 13 和 29 个，另有两个 ZIP、宏 JSON、Item Macro 文本和源合同，共 47 个源文件。已实际检查完整资源列表、版本与文件 SHA-256、ZIP 指纹、命令 JSON 读回、精确目标门禁和 fixture／清理清单一致性。历史“9项测试PASS”声明单独保存，未冒充本轮重新执行结果。

原合同 SHA-256：`44825fdb18e595d99d9c472fcdf00146f314c7e9629b7bab69787da84a0f9432`。目标为原合同**声明**的 `127.0.0.1:30002`、server-next、cor-cotn、Foundry 14.368／dnd5e 6.0.2；本轮未连接服务或刷新其 PID、占用、安装、活动世界，不能称作当前运行身份验证。

真实接口事实来自现存 `prepare-vm-dispatch.py`、`vision-macro/acceptance-macro.js` 和 `item-command.js`：

- Python 对 Item Macro 的 `read_text()` 内容计算哈希，再用 Windows `write_text()` 写文件。实测文件 633 字节、7 个 CRLF；原始文件 SHA `8a0caa24f2e73a4609f4a0400345c301714cb1072c45c5355d42d3c22c3a8772`，规范化文本 SHA `ed7a1203446d47e11ff7b67287ad16f5db91c03ca1b18878809b8b2ba6e094b8` 与声明一致。首次直接比较字节失败后，读取生产者与实际字节修正 adapter；分别保留两种身份，不修改文件或忽略差异。
- 原生 readback 有 dispatchId、world／core／system、模块版本／启用、文档 ID、操作和记录。数据判定重算 60→90→60、命令校验及单次 API／活动记录，不依赖 `result.pass`。
- 原生 phase=cleaned 不包含完整文件夹／Controls 删除、UI、加载哈希及角色／重载证据。自动数据判断保留为参考，整体行为／证据 INCOMPLETE，运行／清理 NOT_EXECUTED，父审 PENDING。

## 本增量与实际链路

复用现有内核的绝对路径／junction 防护、工作树身份、预检、一次离线执行、文件原件／摘要与恢复；新增明确的只读来源绑定和模块 adapter。[具体操作](../../tools/foundry-ops/README.zh-CN.md#第二个消费者vision5e--item-macro-离线接入)与[最小请求](../templates/development-feedback-batch-request.example.json)可直接查阅。

`prepare-batch` 自动填写所有机器字段与源身份；`ready` 的 scope 仅为本地文件检查，`ready-batch` 单独拒绝运行派发。`capture-receipt` 自动绑定两套 dispatch／合同身份并保留 UTF-8 原生字节；`import-receipt` 拒绝错目标／候选／批次／revision／哈希，重复结果保持同一 receiptId，部分文件已写时只读核对并补齐摘要，不覆盖不同原件。没有通用调度器、浏览器 harness 改写或实际安装入口。

真实消费者链在本任务树完成：prepare-batch→ready→一次离线 execute→collect→ready-batch→不支持回执拒绝→resume。原始检查器输出为 ok:true、47 源文件、runtime NOT_EXECUTED；主控独立读取并核对原件哈希，仅接受离线结果。

| 证据字段 | 原件 |
| --- | --- |
| runId | `9a90521b-c25e-4bc1-ba55-bb24dc321d27` |
| receiptId | `54e7ac93-585b-48a8-9646-0db834504bbd` |
| 原始离线输出 SHA-256 | `ec2e5f005b6bec39e68cc2da339fdad2d2add7d675c404b486e944cba4434622` |
| 文件侧摘要 | behavior PASS、evidence COMPLETE、cleanup NOT_REQUIRED、父审自动标签 PENDING；主控另存 ACCEPTED_OFFLINE_ONLY。 |
| 运行门禁 | offlineReady true、dispatchable false、运行授权 NONE，原暂停与回调归属保留，退出 2。 |
| 恢复 | REVIEW，读取同一收据并附运行门禁；不重放检查或业务操作。 |

原件位于本树 `.local/development-feedback/9a90521b-c25e-4bc1-ba55-bb24dc321d27/`，父审与各 CLI 输出位于 `.local/next-vm-pilot/`。没有真实原生业务读回，因此没有制造成功捕获／导入样本；实际不支持的空 envelope 在写入导入目录前拒绝。提交改变 HEAD 后历史合同只能作证据，新操作要重新准备。

## 回归与门禁

- `test:acceptance-tools`：55 pass／0 fail／353 assertions，包含原有 40 项与最初 15 项消费者检查。
- 随后仅修改消费者的固定角色校验与部分文件恢复，运行 `test:acceptance-next-vm`：17 pass／0 fail／57 assertions。两次有重叠，不把数量相加；最终覆盖集为原有 40 项加 17 项消费者检查。
- 消费者检查覆盖：字节／文本哈希差异、资源遗漏／额外文件、路径逃逸／junction、宏目标门禁、角色缺失、清理归属、暂停派发回调次数 0、源合同／分支变化、空输出、错目标／候选／旧绑定、原件变更、幂等与部分写入恢复、忽略 PASS 标签、数据缺失保持 INCOMPLETE、纯 cleaned 标签不算清理。
- 正向原生收据捕获／导入及 API 数据判断使用与实际 readback 字段相同的**合成协议向量**，全部在随机临时根；它们不是实机或 UI 接受证据。
- `architecture:verify`、`typecheck:tools`、`test-isolation:check` 通过；文档／模板、Ruler、手册及最终发布对账在提交／合并边界完成，详情保存到本树 `.local/next-vm-pilot/closure.json`。

## 当前完成边界

第二消费者的离线来源、合同、原件与恢复接入成立；实机 D、当前服务／执行器权限、安装、UI／角色／重载、跨线程送达／去重和精确业务清理均未执行。源批次保持暂停，源工作树与原件保留，工具与说明按本轮授权整合到 master，未 push。本次未委派、未连接／启停 Foundry、未更改生产或系统、未创建备份。

后续应在源批次明确恢复后按原限定验收完成真实链路，再判断接口共用是否值得固化。三任务描述性计量与性能／token 收益仍未测得。
