# Forge 新来源 discovery 空正文诊断

## 本地事实与当前结论

用户要求用 Sea Hags.pdf 第4页 CR7 Sea Hag Auntie 重试当前 Forge。源PDF及正式提取绑定已核，输入4314字符，SHA-256 0960bd91a4d3704371324d4cfa1e24c010a80f2a2afcc6b41032818cedc326c1。当前候选为本工作分支 f79c25fbac747a7e08f98c48779f052c3db68599 加已验收图标增量，installed r5 JS d2a37bf51f6a9ca584c0e474327c7b404075fab8f0e0954199554d6ea145398f；本轮没有改代码或重装。

第一次正常Chrome流程：DeepSeek/deepseek-flash/openai-chat/json_object/reasoning auto，连接探测通过，discovery报`AI provider returned no usable content.`。actors为空，尚未提取IR/选规则/翻译/付费审核/创建世界对象。公开报告未包含原始Provider响应、finish reason及token账，因此原浏览器请求的具体原因保持UNKNOWN，不能定性为规则或中文生成失败。原现场在`.local/forge-sea-hag-auntie-20261011/chrome/r1/`，来源与失败记录保留，不反复整包重生。

## 外部一手证据

- [DeepSeek官方JSON Output](https://api-docs.deepseek.com/guides/json_mode)：要求response_format=json_object、提示词明确JSON并给示例、合理输出额度，同时明确提示JSON模式可能偶发空正文。现有Forge discovery提示已经明确要求JSON并有对象示例，不能仅因看到这条建议就认定本地提示缺失。
- [官方Chat Completions参数](https://api-docs.deepseek.com/api/create-chat-completion)：thinking默认enabled；reasoning_effort的none关闭思考、low/high/max开启，默认high；未指定max_tokens时，非思考默认8K、思考默认64K（max128K）。这些是当前官方接口事实，不能直接证明原浏览器请求实际耗尽了额度。
- [用户原始报告DeepSeek-V3#1673](https://github.com/deepseek-ai/DeepSeek-V3/issues/1673)：2026-09-24报告V4 Pro及V4.1 Flash在streaming/thinking/JSON/约24k prompt场景出现content空、答案进入reasoning_content并正常stop；后续用户按token账区分通道异常与空完成。我们的请求是非流式、单段短来源、auto，条件不同，不能把该报告的复现率或因果直接推广到本轮。

检索使用AnySearch混合公开搜索及code.doc/library=deepseek；官方文档成功提取。AnySearch对该GitHub issue提取返回Unable to extract（request068141c1-d737-4bd9-a187-45645869e767），改用公开网页读取原报告；官方API页的网页读取超时，AnySearch正式提取成功。未用摘要冒充完整一手阅读。

## 区分假设的最小诊断

三种需区分的情况：服务端正常结束但无正文；输出额度/推理过程结束前截断；客户端未识别真实返回形状。一次同来源、同model/protocol/json_object的公开provider.discovery诊断，用真实接口仅记录request参数摘要、HTTP状态、返回字段名/类型/长度、finish reason、usage及现有parser结果。若content有合法字符串/文本数组却仍拒绝，再定位客户端解析；若content为空且reasoning有内容，则与通道/空完成问题相符；若finish reason为length，则独立核token账。没有原始响应的旧调用不做追溯确定结论。

诊断实现位于`.local/forge-sea-hag-auntie-20261011/probe-discovery.ts`，只读既有外部Key文件进内存、最多一个HTTP请求、300秒上限，不输出/写盘Key、完整请求、原始响应或推理文本。结果只作为诊断，不能替代正常Chrome生成或把本地脚本成功称为产品UI通过。

一次诊断已完成：同来源、model/protocol/json_object/auto，HTTP200、finish_reason=stop，content字符串3589字符、reasoning_content仅记长度103158字符；prompt1540tokens/completion39701/reasoning38645。现有正式provider成功解析1个Sea Hag Auntie候选，耗时约120秒。请求没有显式reasoning_effort/thinking/max_tokens，符合官方默认思考模式的条件。未重现原浏览器空正文，不能替原请求补造finish reason或确定归因；当前没有证据支持稳定客户端解析故障。

下一次正常UI仅将已有reasoning auto改为low，保留model/protocol/json_object/完整来源及所有验证，不改代码。官方明确low可选且映射现有Chat字段；以实际阶段结果判断，不承诺必然修复或减少某个固定比例的耗时/费用。尚无IR可复用，因此重试的仍是失败的discovery起点；第一轮现场及诊断分别保留。

后续候选路径：保持来源/模型不变，若JSON模式空正文有本地证据，可用现有显式prompt_fallback配置做一次对照；仍要求strict JSON解析及全部来源/机制/GM门禁。若仅该次请求偶发，则只续跑失败段。若有客户端字段处理缺口，先在真实接口模式的局部测试中复现再修，不把reasoning_content当最终答案。不会为此新增第二审核模型或自动付费审核。

## 待判断本地化

本轮没有新增外部模块候选；当前待核项是Provider响应分类及用户已有结构化输出配置的恢复行为，不增加模块健康矩阵的已接受范围。
