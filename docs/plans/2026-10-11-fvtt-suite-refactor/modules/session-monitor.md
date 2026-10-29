# Session Monitor：浏览器模块与 Companion 会话接口

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)；进度：[总账](../EXECUTION_LEDGER.md)。M1/M2与M3本地帮助已实施，原生短会话出口保留。

## 目标与当前事实

保持浏览器采集、Companion、会话归档和用户报告各有清晰 Interface，使开始/标记/结束与隐私范围可核对。

- owner：[foundry-modules/session-monitor/](../../../../foundry-modules/session-monitor/)。
- 稳定 runtime ID：`fvtt-session-monitor`；默认阶段：P5，可独立推进。
- 当前1.1.2；module ID与目录名不同。Midi/Sequencer是推荐而非硬依赖。Next6.0.5仅短会话start/mark/stop与历史持久，不是长会话PASS；旧MON-001等外部接受保持原状态。
- 关键归属：`src/runtime.ts`、`src/storage.ts`、`companion/cli.ts`、`companion/cdp.ts`。
- 版本与接受须继续对照[支持矩阵](../../../acceptance/current-support-matrix.md)，上述记录不保证未来执行时仍是最新目标。

## 切片

### M1 会话契约与归档

固定schema v1、sessionId、时间/事件来源与失效/断连表示；浏览器和Companion不复制各自的状态判断。

### M2 采集与报告分离

收敛必要指标白名单与用户明确开始/结束；报告说明观察和未知，不从相关性直接断言卡顿根因。

### M3 打包与帮助

分别说明模块与可选Companion的安装/使用/隐私范围和清理；各自版本、协议与归档可读性一致。

## 必须保护

module/Companion schema v1、当前版本身份、session IDs、已有历史/归档和隐私过滤；不采集凭据、Cookie或不必要聊天正文。

## 本模块最小真实接受

- 短会话开始→标记→结束→重载历史一致；取消/断连不会伪造完成或丢失已保存事件。
- 不启动时不采集；结束后本轮监听/连接释放，其他服务与用户历史保留。
- 归档/报告往返与过滤通过；长时范围须另有明确要求和真实时长，不用短案例代替。

## 已有检查入口与下一步

- `bun test foundry-modules/session-monitor/src --max-concurrency 1`（纯本地检查）
- `bun run test:session-monitor`（包含真实Chrome测试，须另走Chrome执行协议，当前不运行）
- `bun run test:session-monitor:build`
- `bun run build:session-monitor`

按本轮变化选择上述入口，不默认全部重跑；类型、手册与整合门禁按共同约定补齐。命令存在不表示本轮已执行或功能通过。

M1/M2原子存储、异步停止与失败恢复通过46项src测试和类型，独立复核无进一步阻断。M3面板只读帮助同源，模块/Companion版本1.1.2、schema1保持；细节见[本轮记录](../../../reviews/2026-10-12-monitor-session-lifecycle.md)。下一出口为新候选原生短会话与历史保留，不把CDP能力用作Chrome验收替代。 未达到该模块真实出口前不进入发行清单。
