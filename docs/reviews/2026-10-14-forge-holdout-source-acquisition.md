# Forge V2/V3/V4 新样本来源取得与准备边界

2026-10-14，Asia/Shanghai。用于本轮首次样本与保存回放的来源证明，不改变历史首次成绩、模型配置、审核开关或发布权限。

## 已核实事实

- V2 预先固定的三份已知 PDF 第 4 页均为署名、许可或推广页，没有完整怪物数据。截图及原始提取保存，来源准备批次为 `SOURCE_SELECTION_NOT_ELIGIBLE`，模型调用 0；没有把它们计成三次生成失败或换页后的通过。
- 之后另固定作者 [Snakeguars and Laserwolves](https://www.patreon.com/confluxcreatures/posts/snakeguars-and-167033467) 的第一个公开 PDF [Kamadan.pdf](https://www.patreon.com/file?h=167033467&m=720363185)，再固定第二个公开 PDF [Senmurv.pdf](https://www.patreon.com/file?h=167033467&m=720363187)。选定时尚未读取对应 PDF 正文。Kamadan 第一只怪物为第 1 页 Kamadan；Senmurv 第一只为第 1 页 Senmurv Maverick，第 2 页是另一只 Senmurv Skymaster。
- Kamadan 原件 9,294,362 字节，SHA-256 `50a4a2cdfa70ef3a31133990cef964aaeaeef99eb79e6481cc048b7e712c55d4`。Senmurv 原件 8,311,589 字节，SHA-256 `f4e027b13aa0867827d1ac0ce8ef71a7bb2b1f5cd64c5182009bca21f2c47813`。实际取得均为普通 HTTPS GET、200、PDF 签名及正常 TLS 验证。

## 检索／取得过程及限制

先按已安装 AnySearch runtime 发现 social_media/gaming 域并作混合检索。搜索可用，作者 sitemap 正文 extract 返回 API 错误；web 对 sitemap 也不可读。正常 HTTPS 读取作者公开 sitemap 返回 200，可取得作者帖子 URL；随后 web 成功读取固定作者帖子的公开附件清单。

web 对二进制附件的 CDN 跳转不可读。Kamadan 旧缓存 CDN 地址直接 GET 为 403，改从页面所列稳定公开附件 URL 作正常 GET，取得 200 原件；Senmurv 同一路径首次 GET 即 200。没有关闭 TLS 验证、改代理／扩展／配置、登录私有 API、购买或绕过付费访问。报告只保存稳定公开链接，不保存带签名的 CDN 地址。

这支持“当前稳定公开附件 URL 能取得本次原件”，不能据此解释历史 CDN／TLS／浏览器故障的根因。对外检索的第三方结果只作发现入口，怪物来源及附件身份以作者帖子和原 PDF 为准。网页中的相对日期与缓存月日未当作精确发布日期。

## 来源准备与语义边界

原 PDF、pypdf 输出、Poppler raw/layout 和页面图片均保留。PDF 左栏部分文字被提取成无空格或重叠文本，来源准备按截图恢复完整背景、战术与战利品的空格，并对恢复前后做忽略空白／大小写的字符序列相等检查。原文错拼也保留。完整能力正文直接来自 statblock 原始提取；只把同一视觉行的标题／CR、MOD/SAVE 表头恢复到阅读顺序，不改数值或能力规则。

两栏来源按背景先、能力块后保留；艺术署名保留，重复出版页脚作为页面家具在准备收据明确排除。同一 PDF 的其他怪物和编辑模板不混入所选完整怪物。新 PDF、已知 PDF 新怪物、保存回复回放和首次模型成绩分别记载，不将来源预处理失败或离线通过冒充首次成功。

## 后续复查与本地化

V4 在固定 Senmurv 第二只怪物 Skymaster 的首次失败后，另行在读取内容前固定官方 SRD 5.1 的 Giant Boar 作为独立来源对照；沿用同一V4冻结及模型设置，不将其替换进原Better Monsters批次。官方原件为 [Wizards of the Coast SRD 5.1 PDF](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf)，3,158,713字节、403页，SHA-256 `2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0`。完整怪物横跨PDF第373–374页，来源准备把六列能力分数无损转为逐行，统一TAB/CR/NBSP词间空白并明确排除重复页脚，没有修改数值、规则或补入其他怪物。最终来源SHA `5469c971d591c04da7a1e8f6e566708de9cb28d3bb527dc56bc64da66dafa7b0`；原始提取、截图、字符核对和CC BY来源说明保存于 `v4-srd-source/`。

该对照首次5次HTTP200完成来源、基础事实及中文草稿，之后正常GM批准、导入与一次刷新完整文档读回通过。来源取得、首次模型生成、翻译、原生持久化和图标语义仍分列；这一个官方来源成功不证明全部第三方PDF泛化，原Skymaster20/21差异和既有首次失败不改判。

来源取得收据及准备细节在 `.local/forge-staged-manual-20261013/` 的 `v2-holdout-*`、`v3-new-*` 中。重新核验时先比 PDF 与最终来源 hash，再看原始提取／截图／字符相等证明，最后核对保存 IR、正式 Actor 和运行收据。不得用更新网页或新译文覆盖本次失败原件。

本次没有新增待本地化模块；没有提交、合并、推送或生产部署。当前可用范围与历史失败继续以 [分步实施验收记录](../acceptance/2026-10-14-forge-staged-manual.md) 及 [支持矩阵](../acceptance/current-support-matrix.md) 为准，来源可取得不等于生成／中文／导入刷新通过。
