# 原生法术缓存的 HTML 比较修复

## 实际证据与边界

本地固定 Core14.368 / dnd5e5.3.3 的死亡天使经正常 Forge 确认成功创建，world-only phase=verified 已持久化；之后 Resolver 在第1/6条易容术缓存比较失败。失败卡与未验证缓存保留，不强删、不改法术资料包。原始146617字符读回与95765字符只读探针均按完整工具字串分片恢复并校验UTF8 SHA；原299 Actor／94 Macro指纹无变更，时间与全局场景不变。完整原件留在私有本地证据目录，不以摘要替代。

探针分别读取实际公共`CastActivity.getCachedSpellData()`、`Item.cleanData(...sanitize:true...)`及已创建缓存。前两者相同，均未匹配缓存；除既有hash已忽略的版本／时间／ownership外，唯一差异是一个效果说明中的字面`<`被创建结果转义为`&lt;`。因此不再假定客户端静态cleanData等于实际创建边界。

## 外部依据与采用方式

- [WHATWG HTML tag-open规则](https://html.spec.whatwg.org/multipage/parsing.html#tag-open-state)：非ASCII字母等不能开始标签的字符使前导小于号按字符处理。这解释本案原文以中文紧接小于号时的解析结果，不把小于号后任意内容都当标签。
- [parse5 parseFragment](https://parse5.js.org/functions/parse5.parseFragment.html)与[serialize](https://parse5.js.org/functions/parse5.serialize.html)提供标准片段解析／序列化。实际使用已在本仓库锁定的7.3.0；本地该版本源码、类型与MIT许可证已核，不以文档站最新版推断目标接口。
- 7.3.0原由cheerio/jsdom传递依赖，现在Resolver自己的package与workspace锁显式声明精确版本；`bun install --frozen-lockfile`通过且无其它版本变化。parse5与entities6.0.1的许可原文随模块发布树包含。
- 按精确报错、Foundry/dnd5e缓存及HTML转义搜索，没有找到本模块同一故障的真人原始报告；泛泛的导入建议不作为修复依据。采用标准接口和本案真实原件作可反驳验证，不编造第三方成功案例。

只在原生缓存的richtext字段比较时做无DOM、无脚本执行、无资源载入的片段parse／serialize。未改来源、IR、manifest、世界Actor、缓存或getter值；法术UUID、cachedFor、属性、DC、持续时间、效果变更与所有权继续严格核对。

## 反证及未完成层级

新测试先固定了3种普通HTML转义正例及7种正文、markup、实体层级、脚本、注释、引用与数值反例；旧比较有5个RED，均保留。新比较接受本案完整实际getter／缓存投影，同时拒绝DC、24小时、来源UUID、cachedFor、规则正文和效果删除的6种破坏。

构建器原先把普通AST的`node:`字段误当Node.js导入。仅将此检查限定为引号／模板字面的`node:`specifier，加入真实Node导入和其余禁止内容反例；其它路径／凭据／运行约束不变。含构建的模块测试与独立构建串行执行，不能同时改同一dist。

截至本记录，真实6/6水合、原生Cast、独立次数、Save／死亡效果及重载尚未通过。本案失败卡与缓存将继续作为原件保留；后续使用相同来源、独立包身份的干净候选进行正常导入，避免放宽归属或改写失败现场。离线投影修复不代表真实施法已经可用。没有新增待本地化模块候选；下次新来源出现差异时保留完整getter与实际缓存，先分类语义改变／标准序列化／元数据，再复查目标版本，不能继续忽略字段。
# Follow-up verification and retained failed candidate

The independent read-only review `cache-html-review.md` identified a separate retry hole: persisted `failed-recovery-required` was displayed but did not stop ordinary automatic or explicit re-resolution. Coordinator admission, already-queued callbacks and the processing service now reject that state. Regression checks cover automatic, explicit and status-changed-after-queue paths without fetch/transaction/world writes. The two former retry tests now exercise a completed rollback; unresolved partial rollback is never treated as retryable.

`cache-html-resolver-r4.txt`: 367 passed, 0 failed. `cache-html-build-final.txt` and `cache-html-types-final-r2.txt` pass. Build guards retain rejection of actual Node imports, absolute drive paths and prototype assignments while accepting parser object keys, HTTP namespace URLs and equality comparisons. The installable module has 9 files including exact parse5 7.3.0 / entities 6.0.1 notices. These results establish offline behavior and packaging, not actual hydration or Cast acceptance.

The failed Actor `d1353ecfc90054b2` and cache `QVp1kKCADtAPFKdm` remain untouched. A new outer package identity will use the same saved actual DeepSeek source/IR and formal generation; the generated Actor must remain structurally identical before import. All 300 current Actors (including the failed candidate) and 94 Macros are protected by retained exact fingerprints. No new model call, final JSON patch, forced adoption or deletion is permitted for this next acceptance.


## 后续实际水合结果

新身份Actor `cae9e900a0e26de8`经普通Forge确认已实际完成六条法术/六个owned缓存。260591字符原始读回恢复后SHA-256为`795fee85450f217e5edf8ece7fbe0b9dc0eaa9705e951ed3ea376da56954eb6a`，旧300Actor/94Macro及scene/time保持。HTML投影阻断这一切片已跨过实际水合门；施法应用又发现卡面24小时而base效果1小时，失败原件保留，见[时长专项](2026-10-16-native-spell-effect-duration.md)。原生法术使用、独立Save/死亡、每日次数及最后重载仍逐项另记，整体未完成。
