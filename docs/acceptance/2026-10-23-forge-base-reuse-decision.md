# Forge 连续推进 C：跨失败尝试的基础阶段复用判断

本批按已授权条件，先检查既有失败及请求证据，再决定是否实施。没有新增模型请求或修改分阶段提取代码。

结论：**当前不实施跨 attempt 的 base 缓存。** 代码确有这个较窄的优化空间，但当前抽样记录没有证明它发生的频率与重复请求成本，尚不足以抵消新持久状态、失效规则和纠错预算绑定的复杂度。这不表示缺口不存在，也不将它算作已经实现。

## 核对到的事实

| 既有记录 | 观察结果 | 能说明什么 |
|---|---|---|
| `.local/forge-ab-first-pass-20261019/http-requests.json` 与 `run-summary.json` | 13 次 HTTP 均收到 200；6 个最终失败分别涉及正式检查、能力表单不支持字段和来源事实冲突 | HTTP 成功不等于结果正确；这组能力试验没有给出当前 base 成功后跨 attempt 重复请求的频率 |
| `.local/forge-repeat-v2-trial-20261020/http-requests.json` 与 `run-summary.json` | 45 次 HTTP 均收到 200；24 个候选中22个进入待来源审阅状态，2个记为 `FORMAT_OR_TRANSPORT_FAILED` | 失败两例的实际错误均为 `FORM_SAVE:unit-7`，不能仅凭汇总标签把它们当作网络失败或 base 重发 |
| 2026-10-22 三组配对 final receipt、黄铜龙冻结 replay receipt | 区分已有模型实测与后续固定资料回放 | 固定回放可以验证程序行为，不能充当新的模型失败率或省费测量 |

以上是有界抽样，不能推广为整个项目“从未传输失败”。请求状态、计数、路径和 SHA-256 保存在本轮外部证据 `forge-continuous/c-request-observations.json`；结果分类在 `c-existing-failure-classification.json`。所有旧文件只读保留。

## 保留的优化空间与实施条件

当前 `packages/intake-ai/src/staged-extraction.ts` 在一次调用内部保留已通过的 base，显式开启纠错时只补失败阶段；战斗包也已能复用完整候选和已有 IR。尚缺的是完整 IR 形成前，base 已验证通过、后续 whole-feature 失败结束本次调用后，下一 attempt 对这个 base 的复用。

后续若既有日志能建立同一来源的完整链：base 已通过 → whole-feature 失败且无完整 IR → 下一 attempt 再次请求相同 base，并能记录次数和请求成本，再按优先级实施。绑定至少包含来源、分段、目标、模型和提示版本；恢复不能重置每生物最多一次的纠错预算，也不能自动恢复付费权限。当前不为取得这些数据新增付费实验，不建设通用缓存平台。

本轮 B 已完成的普通完整候选恢复解决的是已生成结果在刷新后丢失的问题；它与这里的前置阶段缓存是不同的能力。当前 C 的交付是证据判断和明确的暂不实施决定。
