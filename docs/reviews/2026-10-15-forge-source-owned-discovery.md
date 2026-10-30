# 来源归属与现成方案的实际适配

本轮沿用[10月13日同类工具记录](2026-10-13-forge-comparable-importers-and-manual-fallback.md)，只复核与当前入口故障直接相关的实现，不重复调查热门模块或安装新工具。

## 已核实的外部事实

- [5e Statblock Importer固定源码](https://github.com/Aioros/5e-statblock-importer/blob/98f5bd9bf3a18b3cb50429f1bef6b735de32271e/scripts/sbiParser.js)的`parseInput`在程序中清理换行、保存原文行和lineNumber；`matchAndAnnotate`把匹配位置映射到原行。固定`sbiActor.setActions`先保留描述，再附加识别的自动化。采用职责划分，不复制其默认属性、资源、缺法术处理或全部正则。
- [Google LangExtract固定resolver](https://github.com/google/langextract/blob/bebddfcecdbae24510b50014360346626dffbb8e/langextract/resolver.py)的`align`由程序设置来源字符位置，区分exact/lesser/fuzzy。此处借鉴程序保管精确范围，不采用默认模糊阈值、部分匹配或吞错。原代码保存于`.local/forge-discovery-offline-20261015/research/langextract-resolver.py`，SHA-256 `d176e5cdada24b526e0ab559f9388e35df5057ca194a2552195dd101112b7f4b`，只读未执行，没有引入新依赖。
- 真实用户反馈仍以[5e Importer问题65](https://github.com/Aioros/5e-statblock-importer/issues/65)的逐项预览/原文保留需求、[AI Importer问题5](https://github.com/wickercar/foundry-ai-text-importer/issues/5)的错误豁免为界：别人能导入或已经拆分，不证明全部机械事实正确。相关原问题本对话已读，不伪造新社区成功率。

## 本地适配与反证

模型只选择程序生成的首末行ID，程序从未改动的source恢复原文和精确范围；公开DiscoveryResult形状保持。这里的行ID协议是本地适配，不声称LangExtract原样采用同一协议，也没有真实模型通过率或费用下降的证据。

固定单怪物入口接受常见CR/Speed大小写；旧发现回复仅作唯一的空白表示映射，恢复输出始终为原始source切片。数字、否定、缺词、重复位置、未知或逆序行ID仍拒绝。不对真实错误作字符串近似修正。

26项离线正反例验证了上述行为，且实际Forge入口保留Archivist Grim整篇来源及七项能力、发现调用0；缺少历史基础回复处明确停止。另用保存的12例事实走正式Actor链及24条verify，未增加模型调用。具体分层结果见[离线验收](../acceptance/2026-10-15-forge-source-owned-discovery-offline.md)。

## 候选与边界

5e Statblock Importer仍为本机Untested的对照候选；本轮只借鉴来源行归属，不将其直接替换Forge。LangExtract不作为本项目新依赖或本地化候选。后续候选先固定版本/许可/源码，再用同一失败和真实内容错误反证，不重复模型试跑筛成功案例。

尚未证明：新行ID提示对真实模型的表现、Archivist Grim完整基础提取/中文，以及新候选Foundry导入刷新。新线上请求本轮不执行，不能用离线通过把这些项改成已完成。
