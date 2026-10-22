# Forge 连续推进 B：普通完整候选跨刷新恢复

从 `f538cb7` 继续，由主代理亲自实现、离线检查及官方Chrome扩展验收。原普通队列只持久化来源和审阅摘要，完整IR／response／artifact在页面内存中；刷新后虽能显式继续，AI来源仍可能重新抽取。本批增加完整候选恢复，保留来源库及portable review的只读语义。

## 实现与失败边界

独立IndexedDB按世界／GM保存完整来源、IR、正式产物、真实诊断、候选身份和队列attempt，总额度8MiB，恢复有效期7天。不保存API Key、endpoint、原HTTP回复、GM批准或连接已测试状态。过期只禁止恢复，不自动删除；可显式清理副本。

恢复先核版本、校验和、来源、目标及候选身份，再用当前renderer／workflow／verifier重建相同正式response和本地问题清单。重验Provider的四个方法均明确抛错，不能请求模型。批量还核对当前attempt、原review，事务提交前重新检查GM／runtime和队列状态。单条仅在空白工作区点击“更多工具→批量处理→恢复上次单条候选”，不覆盖草稿；批量重开本地重验并续接原attempt。两者仍须GM本次确认，不继承旧批准。

损坏、过期、存储／配额失败、目标／结果改变、旧attempt或另一窗口冲突均明确提示，保留原来源／队列及当前可用结果，不自动重发模型请求；可显式重新准备。创建成功、取消job、删除Collection时清理对应副本。“清除本地恢复副本”只作用于当前世界／GM，不删除来源库、队列或世界文档。

## 实际验证

| 层级 | 结果与边界 |
|---|---|
| 局部回归 | `bun run test:forge-batch-queue`：103 pass、0 fail、859断言；包含真实正式生成的Actor／Item单条和批量恢复、原attempt／候选、重新批准、创建失败后撤销旧批准、旧attempt拒绝、损坏／过期／目标变化／当前生成差异、凭据拒绝；IndexedDB覆盖配额、权限撤销、窗口冲突、scope隔离及显式损坏重置。原隔离Bun1.3.14，无模型网络。 |
| 构建／契约 | bundle／release3项、package与Foundry module类型、诊断源码严格类型、architecture通过。指令生成／检查34项通过；三个受影响手册条目人工核对，33项一致性通过。未默认扩展全仓CI或玩法矩阵。 |
| 真实批量刷新 | 原Mage冻结来源／IR，Mirror PID59936／127.0.0.1:30001／Core14.368／dnd5e5.3.3／cor-cotn。整页刷新前后同job、attempt1、候选hash `23440424…`、完整记录及问题相同；刷新后可直接重新确认，runner按钮禁用。固定discover/extract各1，review/repair/liveModel均0。 |
| 创建／读回 | 正常确认框展示needs_review及原问题。创建Actor `9be99b933b7b8947`，17个Items；队列applied、采用记录reviewed_candidate，严格needs_review不变。成功后对应完整副本清除。 |
| 真实单条刷新 | 正常输入、分析和生成后整页刷新，点击正常恢复按钮；候选hash `3a2f5c7b…`及11条问题相同，回到ready_for_gm_review，GM批准为空。两次独立准备合计固定discover/extract各2，单条刷新前后计数相同，review/repair/liveModel均0，没有多创建Actor。 |
| 清理／保护 | 最终读回后删除唯一临时Actor、任务宏、三个任务IndexedDB项、任务localStorage、三个hash绑定静态文件和任务Chrome页。世界对象、Guard／24Token、视图与原scope一致；3198份旧证据、主区HEAD、既有本机标记及hook源码／配置未变。常驻Lab保留。 |

外部证据入口：`H:/CodexData/visualizations/2026/10/22/01a163d8-f3e5-7663-bd1b-25d55bfdac88/forge-continuous/verification-receipt.json`。逐层原件为`before-reload.json`、`after-reload.json`、`after-apply.json`、`single-before-reload.json`、`single-after-restore.json`、`cleanup.json`及DOM／截图。取证源码保留为`tests/diagnostics/forge-candidate-recovery-runtime-browser.ts`；只有模型Provider及会话设置替换为固定值，生成、存储、UI、批准及创建／读回为真实代码。

最终安装脚本SHA-256：`87759cdf6a3455bf54e8d7f2054f30eb9930c67673743e37c6d5a463803136ce`。批量在前一构建完成；最终构建补删除Collection的副本清理及损坏entries类型拒绝，相关离线检查通过，随后单条实机使用最终构建。未把取证和清理层变动当成重跑已通过批量链的理由。

## 初始失败与未验证项

首次保存误用禁止artifact的来源库导出扫描器，完整候选被拒；改为本模块的凭据／原Provider内容检查，保留artifact。随后通用hash把问题数组当成artifact对象，恢复拒绝；改为数组的稳定JSON包装。两次只修对应层，旧94项持续通过，失败日志保留。首次直接Bun浏览器构建缺adapter别名，改用既有`buildBrowserBundle`。一次大JSON取证返回截断，保留截断件后分段读同一证据框，未重跑业务；宏异步呈现及一次CDP输入超时按实际DOM核对后完成，未换执行通道。

本轮证明固定资料、目标版本和本地入口的恢复行为。未测新模型质量、真实费用或速度百分比，未扩展玩法、操作生产、改hook、合并或推送。Item恢复有真实正式生成的离线用例；本轮Foundry刷新实机为Mage Actor，不宣称额外Item实机覆盖。
