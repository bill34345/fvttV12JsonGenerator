# instruction-scope 遗留候选评估

日期：2026-10-02。源工作树：`20260914-101915-instruction-scope`；本轮对照 master基线 `61974058f1af4e0f70fc675a0c856cae07d99a8f` 及现行工作约定。以下保留初次评估依据；用户后续授权处理后，建议已[选择性实施](2026-10-02-instruction-scope-integration.md)并合成到[最终整合候选](2026-10-02-injury-condition-integration.md)，没有整文件覆盖旧七份规则。

## 这项工作解决什么

这不是 Foundry Mod。七个改动文件均为 AI 开发规则或流程文档：`.ruler/AGENTS.md`、生成的根 `AGENTS.md`、worktree／handbook runbook，以及 generation／ingest-documents／intake-ai 的局部 AGENTS。目标是按实际行为变化选择检查，减少无关的重复步骤；不能把减少重复理解为降低来源保真、必要反例或真实行为接受要求。

## 逐项判断

| 提议 | 评估 | 建议的最终边界 |
|---|---|---|
| 手册更新按入口、输入／输出、支持版本、步骤与安全限制变化触发 | 值得纳入 | 内部实现／测试改动先核对用户说明是否受影响；已登记 watch 报 stale 时仍须逐项人工 review、重新生成与检查，不缩小 watch 或批量刷新绕过检查。 |
| worktree runbook 同步上述手册范围 | 值得纳入 | 和 handbook 规范一同修订；保留当前发布顺序、用户 dirty 保护、版本流程及已有后续文字，不能整文件覆盖。 |
| 固定“至少三个正例”改为未限定数量的代表正例 | 不直接采用旧稿 | 当前生成器仍需三个有意义正例、接近反例和不相关样例不变检查。可澄清正例须覆盖不同来源形态／分支，不为凑数量复制同类断言；本轮不据旧提案放宽最低要求。 |
| PDF 元数据展示未影响正文时，只验受影响层级 | 值得纳入，但需保留证明条件 | 原始 Markdown、阅读顺序和候选语义须有未变证据；仍核原页、坐标与可追溯信息。正文／顺序／候选或下游产物改变，继续完整来源链验收。 |
| 区分真实 TXT 来源、只读 verifier 与真实 provider 调用 | 值得纳入，需修正授权表达 | 真实文件不自动授权联网 provider；已有任务／会话的明确 provider 授权持续有效，不制造每次调用重新确认的要求。 |
| 更新 verify:intake 用法 | 值得纳入 | 当前 `src/tools/intakeVerification.ts` 要求 `--source`、`--ir`、`--markdown`、`--actor`；不传两个 output 选项时只读文件并打印报告，没有 provider 调用。四个输入必须是同一来源链；dry-run 不证明 accepted 链，fake provider 也不证明真实模型效果。 |

## 当前实现依据

- `package.json` 的 `verify:intake` 入口实际指向 `src/tools/intakeVerification.ts`。
- `verifyIntakeFiles()` 读取四份文件，调用本地 `verifyMonsterIntake()`；只有明确传入 `jsonOutput`／`markdownOutput` 才写报告文件。
- `docs/handbook/build.mjs` 的 watch 指纹和生成一致性仍是现行机械门禁；本文不提议改检查器、缩小登记目录或忽略 stale。
- `docs/runbooks/development-feedback-loop.md` 已在后续主线明确规定按改动分层验收、重复失败转诊断和已有授权复用，应优先复用，不另造一套流程。

## 实施与发布结论

推荐后续形成一个窄规范增量：手册范围、PDF 验收层级、Intake 本地只读用法及持续授权表达。保留固定来源回归底线，保留当前 Next／5.x 版本政策和全部发布权限。

根规则的唯一编辑源仍是 `.ruler/AGENTS.md`；若采纳则由 Ruler 生成根文件并验证幂等。局部说明直接维护，不手改生成根 `AGENTS.md`。纯规范变更只核文义、作用域、命令与引用及生成一致性，不因此启动 Foundry 或跑无关全仓测试。

用户本轮要求的是评估是否纳入；本文记录判断，未把旧七文件提案直接推广为现行规则。旧工作树和未提交内容保持原样。
