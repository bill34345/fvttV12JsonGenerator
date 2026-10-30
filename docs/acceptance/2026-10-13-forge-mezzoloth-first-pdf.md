# 新 Better Monsters PDF：第一只怪物与 icon 验收

**本次首次结果为FAIL：Mezzoloth Sellblade CR5完成英文准备包，中文在固定状态标题的术语校验失败；icon为PARTIAL。总193.876秒、4次模型HTTP，配置和付费审核均0。失败后停止，没有修候选、再次生成、安装、导入或刷新。** 本轮没有修改产品代码，也没有commit/merge/push。

## 来源选择与下载

用户要求找一份最近的新Better Monsters PDF，下载后选其中第一只怪物，并强调icon。实际选择作者Conflux Creatures的[Ecology of the Yugbugs](https://www.patreon.com/confluxcreatures/posts/ecology-of-167683283)发布帖第一份附件：[Mezzoloths.pdf](https://www.patreon.com/file?h=167683283&m=726795204)。作者[2026年公开索引](https://www.patreon.com/cw/confluxcreatures/sitemap)列日期为2026-08-26；本次检索时它位于该索引最前。不能据此宣称整个站点没有更新的帖子，缓存中的相对日期“Yesterday”未作为当前日期使用。

实际PDF4页、7,981,566字节，HTTP200/application/pdf，PDF创建时间2026-08-25 22:39:37 UTC，SHA256 `c33b74cb7eb83237c31f1098e1882232e7b6a847c8e5a1e2a24f145a79cff6ef`。从作者公开附件的正常CDN重定向地址下载，未使用第三方转载、登录凭据或关闭TLS验证。

PDF在 `H:/CodexData/visualizations/2026/10/12/01a12e90-4de0-75c1-92d5-714811781a77/bettermonsters-newpdf-20261013/Mezzoloths.pdf`，同目录保留download-receipt.json和页面提取/渲染证据。

第1页是背景、召唤、费用和宝物说明，没有statblock。第2页左栏第一只为**Mezzoloth Sellblade CR5**，右栏为Company，下一页为Rune-Veteran。选择未因复杂度或生成结果改变。Poppler渲染完整第2页并目视核对左栏全部内容；pdfplumber裁切bbox为`[50,40,298,730]`points，x_tolerance=2、y_tolerance=6使视觉上同一行的小型大写字体正常合并。y_tolerance=3的标题错行观察也保留。

直接使用原生提取文件first-monster-y6.txt，**2,085个UTF-16字符**，SHA256 `2c93b830d3814fdc9ddd6bb255699a9bd28edbcf118bda1900fa6fa992bf0562`。不手工改写规则，不取右栏/下页怪物；最后的黑暗结束条件完整保留。一般背景和未被该statblock引用的收费/宝物说明未作为本怪能力输入。

准备阶段AnySearch与本地Patreon主域请求均在TLS阶段失败；网页工具能读取公开发布页和附件重定向，正常TLS下载作者CDN成功。一次批量“写入来源副本与验收基线”命令被自动审批以`blocked by policy`拒绝，未执行。随后核对文件不存在，省去来源复制，改为只读使用已经保存的原生提取文件；没有重发被拒绝的批量写入命令。以上均发生在模型调用前，不记为生成重试。

## 一次全新生成

北京时间2026-10-13 00:54:14.144至00:57:28.020，使用现有DeepSeek/deepseek-flash、openai-chat、json_object、reasoning low连接。来源经公开Forge Intake→workflows→generation→verifier；目标Foundry14.364/dnd5e5.3.3/core，实际response.target.iconMode=safe。没有旧IR、旧译文、旧配置或人工修正输入。reviewPolicy=deferred，审核调用被禁止；禁用审核尝试也为0。

| 阶段 | HTTP请求数 | 实测请求耗时 | 结果 |
| --- | ---: | ---: | --- |
| 提取 | 1 | 51.114秒 | 引文定位/覆盖缺口及3环法术等级遗漏被挡住 |
| 流程既有IR修复 | 1 | 44.037秒 | ready_to_generate，原生生成与来源核验accepted |
| 配套配置 | 0 | 无模型请求 | 走既有单Actor原生路径，无伴随控制配置 |
| 中文标题 | 1 | 33.261秒 | 返回待审标题 |
| 中文正文 | 1 | 65.153秒 | 返回待审正文，最终确定性校验失败 |
| 付费AI审核 | 0 | 未执行 | 保持关闭 |

整次193.876秒、4次HTTP均200；没有第二次外层提交。首次提取不是零修复成功。程序外层ready_for_gm_review仅指原语言prepared可供GM核对，hasChineseDraft=false，不能当成完整中文验收成功。原语言包保留7个Item，每项有1个Activity，共7个Activity；不导入该失败批次的原语言包冒充中文完成。

## 已定位的失败与额外静态发现

27个翻译字段均已保留。用现有生产validateLocalizationDraft对每个原样字段只读检查，稳定复现唯一拒绝字段：

| 字段 | 保存的实际值 |
| --- | --- |
| ID | text-f1a630477ea61fef4a895cb0 |
| 给翻译器的源标题 | 被擒抱 (Grappled) |
| 待审译稿 | 被擒抱 |
| 项目术语表要求 | Grappled → 受擒 |

相关爪击/撕裂正文已经译成“受擒”。问题集中在生成器产生的固定状态标题：`packages/generation/src/actor-effects.ts:451`使用“被擒抱”，而`packages/contracts/src/localization.ts:49`要求“受擒”。翻译器将该混合标题送入模型并返回待审文本，共用validator第203行拒绝。可以确认内部固定名称不一致及本次具体被拒值；不能只归因于怪物太复杂，也不需要放宽术语表来解释。

第一次提取另有三条已保存finding：`/coverage/17`的Actions引文无法定位、相邻source coverage未覆盖、Divergent Dark说明遗漏来源明确标注的3环等级。一次产品内置修复后这些finding消失，并保留了该等级；没有在本轮改提取代码。

**另发现语言代码静态错误**：原文Abyssal/Infernal/Telepathy60ft，Actor输出`languages.value=["Abyssal","infernal"]`、custom为Telepathy60ft。锁定dnd5e5.3.3源码commit `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449`的config.mjs:3932规定key为小写`abyssal`，traits.mjs:70按Set精确key查显示标签。当前生成器英文映射缺abyssal项，既有大小写规范化没有覆盖它。本次references verify通过；这是输出和精确版本源码的静态对照，未做Foundry实际显示验收，也没有改候选或产品。

核心属性AC18/HP75/10d8+30/CR5/速度40、六属性18/11/16/7/14/10、察觉+5、盲视60、抗火和酸/毒免疫均与原文比对。七个能力正文保留：两次攻击、爪击2d8+4/逃脱DC15/附赠动作逃脱、倒刺20/60及双伤害/命中或未命中驱散、CON DC14毒雾4d8与失败目盲/成功半伤、重甲减半、两个5尺直径黑暗球/30尺传送/两种结束条件。文本或Utility保留不等于其自动执行已验收；未运行活动或战斗。

## icon 实际结果

检查对象是**7个Item图标加7个Activity图标**。每项Item和对应Activity路径相同，14处均在已验证catalog内，5个不同文件在本机14.368/core或Mirror dnd5e5.3.3资源中存在。四个非默认图片实际打开目视核对，均256×256；没有新增图标模型调用。

| 能力 | 实际图标 | 本次判定 |
| --- | --- | --- |
| Conniving Resistance | systems/dnd5e/icons/svg/items/feature.svg | 默认回退；没有专属魔法抗性图 |
| Multiattack | icons/skills/melee/strike-weapons-orange.webp | 多件武器，内容匹配 |
| Spindletip Claws | icons/creatures/claws/claw-curved-jagged-gray.webp | 爪，内容匹配 |
| Weaverot Barb | icons/magic/death/hand-withered-gray.webp | 枯萎手；只表达暗蚀部分，未体现远程倒刺/穿刺，部分匹配 |
| Toxic Emission | icons/magic/death/skull-poison-green.webp | 毒骷髅/毒气，内容匹配 |
| Shred | systems/dnd5e/icons/svg/items/feature.svg | 默认回退；挥砍内容未获得专属图 |
| Divergent Dark (Level 3 Spell) | systems/dnd5e/icons/svg/items/feature.svg | 默认回退；黑暗/传送未获得专属图 |

因此是**3项明确内容匹配、1项部分匹配、3项默认回退**；“4项非默认”不能写成“4项全部正确”，更不能写成“7项图标完成”。Actor肖像/Token图片是另一功能，本次没有自动添画像。

该证据为生成路径、catalog、本机文件和静态目视证据。因中文失败，**HTTP加载、Chrome原生显示、导入和刷新均NOT_EXECUTED**；旧候选的原生图标验收不能推广到本次产物。用户的icon提醒已按明确要求记入后续任务说明。

## 停止边界与后续最小范围

本轮只测试新来源，没有处理前轮骰式x，也没有修当前固定标题、语言映射或默认icon。失败后仅分析保存结果、只读复现、核源/图标检查和写报告，不继续调用模型或调整候选。

若后续授权修复，优先让固定状态名称使用同一份已核术语，避免程序制造矛盾输入再交给模型；Abyssal规范化和icon匹配分别有独立证据，应分别限定回归，不以重跑同源试到成功代替修复。这里列的是剩余工作，本次没有实施。

本轮没有产品改动，无需为换PDF重跑全仓实现测试。复用前轮冻结实现证据；202个产品文件、候选JS和95个既有dirty/untracked路径在收尾核对中保持原样。master及本工作树HEAD未变。新的说明文件和本地证据另行记录。

证据根为 `.local/forge-bettermonsters-newpdf-20261013/`：

- [首次summary](../../.local/forge-bettermonsters-newpdf-20261013/fresh-attempt-1/summary.json)
- [原始完整结果与待审中文](../../.local/forge-bettermonsters-newpdf-20261013/fresh-attempt-1/result.json)
- [原样validator复现、语言与icon逐项证据](../../.local/forge-bettermonsters-newpdf-20261013/fresh-attempt-1/failure-analysis.json)
- [收尾身份与未执行边界](../../.local/forge-bettermonsters-newpdf-20261013/closure.json)
