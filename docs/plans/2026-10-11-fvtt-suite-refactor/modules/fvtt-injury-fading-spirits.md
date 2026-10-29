# Fading Spirits：复活状态与历史

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)；进度：[总账](../EXECUTION_LEDGER.md)。F1/F2旧数据保护与F3可选CC正向门67项/423断言及类型通过。实装不变，606仅CC当前episode协作已有代表接受，复活结算尚待。

## 目标与当前事实

让复活仪式、死亡 episode、持久历史和 UI 请求有清晰归属，继续独立于 Injury 的写入所有权。

- owner：[foundry-modules/fvtt-injury-fading-spirits/](../../../../foundry-modules/fvtt-injury-fading-spirits/)。
- 稳定 runtime ID：`fvtt-injury-fading-spirits`；默认阶段：P3，CC 可选协作契约明确之后。
- 当前 1.1.0；manifest 无 requires。IFS 可选调用 CC Injury API，CC 可选打开 IFS 复活入口。Mirror14.364/5.3.3 与 Next14.368/6.0.5 的接受范围不同，Next仅基本/快速联动。
- 关键归属：`src/runtime.ts`、`src/persistence.ts`、`src/fading.ts`、`src/ui.ts`。
- 版本与接受须继续对照[支持矩阵](../../../acceptance/current-support-matrix.md)，上述记录不保证未来执行时仍是最新目标。

## 切片

### F1 复活状态模型

界定 death episode、贡献、结果和历史；从 UI/Hook 分离可验证的状态迁移，不把 CC injury 重新写回本模块。

### F2 请求与结算

保留实际发送者权限和正确 GM 的结算；UI 操作转为明确请求，迟到/重复结果不生成第二次结算。

本轮先核parseHistory等规范化数组与持久写入是否无损：Foundry object更新会递归merge，已有unknown sibling可能天然保留，数组则可能整体替换。须用精确Core语义与局部反例判断，不凭浅mock或字段读取成功认定历史完整。证明缺口后只保留旧数据或拒绝无法安全理解的写入，保留原injury、权限/事务/历史身份，不扫全世界迁移。

### F3 可选协作与升级

有/无 CC 两种模式分别验证，保留旧字段为历史输入；按当前 schema 兼容读取，不自动改写所有 Actor。

## 必须保护

`flags.fvtt-injury-fading-spirits.fadingSpirits`、复活历史、death episode 身份，以及旧 `.injury` 原件/未知字段。

## 本模块最小真实接受

- 无 CC 仍能按现有独立复活范围工作；有 CC 时伤势只经其公开 API 改变。
- 一个本轮改变的仪式链验证成功/取消或失败分支，结算唯一，下一 death episode 正常。
- 非授权发送者与重复请求不写历史；重载保留结果和既有记录。

## 已有检查入口与下一步

- `bun run test:injury-fading-spirits`
- `bun run build:injury-fading-spirits`

按本轮变化选择上述入口，不默认全部重跑；类型、手册与整合门禁按共同约定补齐。命令存在不表示本轮已执行或功能通过。

F1/F2已核实际Core对象递归merge/数组替换语义；写入前要求旧历史/贡献等值完整保留，未知整块fading值、当前未来schema及无法无损理解的旧数组明确零写拒绝。合法旧默认字段可补齐，缺省/null/空对象可初始化；不做全Actor迁移。

F3的三个UI交接已仅接受active===true的可选CC；inactive或未知active保留API不再隐藏独立episode入口、打开状态管理器或接收恢复抑制。活动CC正常协作仍由公开API处理。

本地11文件模块包已构建并通过CRC/逐文件字节核对，尚未安装。下一切片：本任务Next恢复且WMP保留现场关闭后，安排F3完整普通仪式代表链、普通重载与精确恢复。有/无CC须分条件记录；原生贡献、GM裁定与blind最终骰不能由局部测试替代。任何数据迁移或功能扩展另写具体范围；未达到该模块真实出口前不进入发行清单。
