# Forge 同 Item 独立豁免与真实法术恢复

本记录修正此前仅验证攻击、GM文字和使用计数的不足。可移植 manifest、目标世界匹配／水合、原生 Cast 操作分别验收；此时离线修复已完成，实机恢复尚待本次独立验收，旧报告不改写。

## 外部实现与精确接口

- 官方 [Activity Types 原始议题](https://github.com/foundryvtt/dnd5e/issues/1964)提出同一 Item 配置 Attack、Save、Cast 等多个活动。实际适配依据是本机固定 `release-5.3.3` 的 dnd5e 源码，路径 `F:/FoundryLab/reference-cache/dnd5e/5.3.3/repo`；不是按最新版接口猜测。
- `module/config.mjs` 的 `dead` 是系统原生死亡状态；独立 Save 的 Effect 引用使用 `onSave:false`，原攻击不引用它。条件触发由 GM 判断后主动选择 Save，不把“攻击降至0HP”改成“任何命中直接死亡”。囚魂及复活限制仍保留完整原文。
- `module/data/activity/cast-data.mjs` 和 `module/documents/activity/cast.mjs` 提供来源 spell UUID、施法属性、challenge DC、原生成分忽略集合，以及 duration／target override。`getCachedSpellData()` 与 `getSpellChanges()` 是核对缓存法术属性的接口。24小时变体必须落实到原生 duration，不能只在文字里写了24小时。
- 复用仓库已有 `CanonicalSpellcastingGroup → portable spell manifest → Monster Spell Resolver`。Resolver 的实际目标世界索引负责匹配、owned Spell 缓存和 Cast；独立每日次数属于实际 Cast 的 `activityUses`，Utility 计数不再被接受为施法。

## 来源边界及最小反证

1. 攻击后唯一明确的 Save 单独追加到原 Item；保留属性、字面 DC、完整触发条件。攻击与 Save 的引用需分别读取。无 Save 的0HP提及不能新增 Save 或死亡。
2. 只将无条件、无期限的直接失败状态提升为原生 Effect。`dies if ...`、否定、状态选择、到目标下回合结束等，保留可点击 Save 和完整 GM 规则，不生成为无限期状态，也不拿固定轮数冒充准确的目标回合期限。
3. 明确的随意、独立1/日、已支持准备法术／法位走真实 manifest。任一未消费的法术授予行阻断，已识别随意行不能掩盖未支持的共享／每日行。未知 casting 限定阻止创建无限制 Cast；原有明确射线数量仍保留可见 GM 限定，不声称自动射线数。
4. 英文 `lasts 24 hours`、`lasts for 7 minutes`、中文持续时间、英语和中文无需任何法术成分均测试来源→staged→manifest→Cast 投影；直接向 builder 注入字段不算完整来源证明。
5. 展示连接用空格，保留名称本身括号。Actor 源标题直接保留；canonical 生成的 feature 明确标记已完成名称展示，阻止旧 YAML 双语括号语法再解释原名 `(Prototype)`。原有资源、行为引用保留唯一性检查并兼容旧名。

## 待判断本地化与复查

本轮未新增外部模块或本地化候选。官方系统结构和已有 Resolver 足以实现请求，无需引入新自动化框架。若评估新的 importer，以精确支持版本、同 Item 攻击＋Save、真实法术匹配、特殊持续时间、独立消耗、完整 GM 余项及已有卡保留为复查步骤；来源、静态投影、实际导入、真实操作和重载读回分别记录。manifest／清单兼容不等于可用。

独立审计原件位于本轮本地证据目录；普通攻击、资源、范围及历史复杂能力的通过结果只能证明已检查的路径，不能概括为所有旧功能全部恢复。

## 首次真实导入失败后的修正

本轮首次正常GM确认导入失败。严格读回在施法Activity的`description.chatFlavor`拒绝；新Actor清理期间Resolver已开始水合，继而报告Actor不存在及回滚差异。失败没有被判通过，旧卡和原始现场保留。

固定5.3.3的`module/data/activity/base-activity.mjs`用`StringField`存chatFlavor；本机Core14.368 `common/data/fields.mjs` 默认 `trim:true`。实际来源重放按此清理在同一字段产生RED。生成owner改为完整字面HTML，保持原文及内文空白，读回仍严格拒绝正文变化。

含manifest的Forge新卡新增world-only `spellImportPhase`：创建时pending，Resolver的事件及显式处理均等候；所有Actor/Macro及来源读回完成后，单独通过公开Actor.update标verified，再由普通广播事件开始水合。它不进入portable manifest或AI证据IR。导入读回失败不发布；发布元数据未确认时保留已验证的新Actor并显示当前本地phase，要求先读持久状态，不能在其他GM可能已开始水合后再删除。服务端已提交而本地promise拒绝时，不能因报错断言仍为pending。原有无标记Actor沿用旧行为，pending并发复用拒绝。原生重试仍待独立记录，离线时序检查不代替实机。
