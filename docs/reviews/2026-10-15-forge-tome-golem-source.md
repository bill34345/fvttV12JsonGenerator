# Tome Golem 首次样本来源

本轮先冻结已验收双语业务版，再选择作者Conflux Creatures的Tome Golem。作者[Library Monsters!公开帖](https://www.patreon.com/confluxcreatures/posts/library-monsters-140110477)链接到[完整公开原文](https://homebrewery.naturalcrit.com/share/ruMh7_7CDtJU)。AnySearch正文提取返回API错误，普通网页读取成功；随后一次普通HTTPS GET200取得公开页面及公开brew.text，不登录、不付款、不取私有API、不关闭TLS。

选定能力前查主区、当前及其余三个注册工作树的输入输出、tests/fixtures、docs和保存JSON/Markdown/YAML结果，包括已捕获的世界roster，无Tome Golem及已查中文名称变体的处理匹配。先保存source-selection，随后才读取能力；不加载既往IR或中文。作者发布页中的链接名不算既往处理。当前实时世界名册还要由原Luna在模型执行前确认。

完整资料有Lore、Treasure、描述、基础表和七项能力。作者原文引用[Burning条件](https://homebrewery.naturalcrit.com/share/uDYpiTxHncTE)与[Animated Book](https://homebrewery.naturalcrit.com/share/11s4ieAqZiqStfRT3fxFHrHOSLKaUzaifsojvlVDoKawB)，两页各一次普通GET200；只提取完整Burning定义（含叠加/解除）与完整Animated Book能力块和相关战术，作为明确引用定义保留，不创建第二个生成Actor。其他活化物品、配图和推广页不混入所选生物；完整原始页面、Markdown和许可声明均保留。作者文字声明CC0，未导入配图。

格式准备去除Homebrewery视觉包装、Markdown强调和列分隔，逐行展平明确标注的六项能力/MOD/SAVE，排版`--4`按负4表示。完整文字、数值和全部七能力保留。首次纯程序预检因`### Treasure`叙事标题触发UNKNOWN_HEADING，模型调用0；仅将其转为无Markdown标记的`Treasure`文字后通过，不改任何正文或规则，原准备稿和失败记录不覆盖。最终输入只有一个顶层生物；两个引用定义进入传记，未污染基础数据范围。这项格式限制单列保留，不把来源准备说成模型生成已经通过。

冻结业务主脚本SHA `5e90014ac8af8477c2afc8f5a0410e026ab17581decc92d3d73e6744a7466bbe`；最终输入字节SHA `31cd60ecf84aee11b2648a106ead5a38d840a0bd2932c135dd3d71cba9d61a88`，6168字符，七能力。源准备中LF逻辑文本的哈希与Windows初步文件字节表示分开；正式执行以source-preflight/candidate-freeze中的物理文件字节及Bun读取字符串身份为准。

证据根 `.local/forge-bilingual-fresh-20261015/`：公开原件、source-selection、两引用原件、source-format-preflight-record、最终Tome-Golem-input、source-preflight和冻结清单。此时实际模型请求0，后续唯一首次请求、中文/英文及原生验收结果另行记录。来源可取得不代表生成可用。

没有新增待本地化模块。复查先核固定原文/输入字节hash，再检查来源包装变更、引用定义完整性及基础隔离，最后核真实回信/Actor与原生证据；不拿更新来源覆盖本轮首次失败，也不替换为更容易的怪物凑通过。
