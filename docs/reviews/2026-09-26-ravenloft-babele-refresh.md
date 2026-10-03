# ServerNext 的 Ravenloft 中文显示复查（2026-09-26）

> **专项证据，不是当前进度表。**本页保留标题日期的来源和检查经过；其中“当前”“未执行”等只属于当时。新对话以[唯一迁移交接报告](../plan/server-next-migration-handoff-20260927.md)为准，仅在核对应证据时读本页。

## 结论与证据层级

`Ravenloft-babele` 本地 `1.0.1-local.1` 的文件和世界开关此前已核对。独立浏览器任务在只读打开 `dnd-ravenloft-horrors-within.items` 时看到 `Animated Digits` 仍为英文，故当时的物品译文显示为 **FAIL**。本轮在同一 `cor-cotn` 世界中，通过 Babele 正常设置界面按**原已配置的顺序**保存译文来源并触发刷新后，Babele 提示刷新成功，浏览器日志明确显示 `dnd-ravenloft-horrors-within.items` 从两个来源文件加载。随即只读打开该合集：目录显示“项目”，`Animated Digits` 显示“动画数字 Animated Digits”，`Ashes of a Corpse` 显示“尸体的骨灰 Ashes of a Corpse”。整页重载、重开合集后两个中文名仍在；一个物品详情也出现中文名称和中文说明。**这两条名称的显示与重载读回 PASS；全包翻译正确性未验。**

刷新前后的世界与服务均是 ServerNext、Foundry14.368／dnd5e6.0.2、本机端口30002、PID44468。GM 浏览器已关闭，未导入物品、未打开 Adventure 合集、未更改付费模组开关、未改 Server Mirror 或生产。此次没有改动任何译包文件；设置界面保持了 `dnd-simplified-chinese-babele-patch:cn` 在前、`Ravenloft-babele:cn` 在后的原顺序，并调用了 Babele 自己的刷新。**首次登录未载入物品译表的底层原因尚未证实**，不能仅凭刷新奏效断言是安装、语言或缓存的哪一种问题。

## 正式来源、版本与依赖

- [Foundry 官方 Babele 包页](https://foundryvtt.com/packages/babele/)在本轮查询时列最新正式版 **2.9.1**，Verified Foundry14；ServerNext 本机正是2.9.1，依赖 `lib-wrapper` 已装。作者[GitLab README](https://gitlab.com/riccisi/foundryvtt-babele/-/blob/master/README.md)说明译文以 JSON 在内存中覆盖合集显示，不修改原合集资料。
- Ravenloft 本地中文包没有可核对的公开正式仓库，仍按[9月25日安装来源记录](./2026-09-25-server-next-translation-install.md)中的本机 RAR 哈希、14处机械路径修订和本地版本识别，不冒充发行方正式发布。
- `dnd-ravenloft-horrors-within` 付费原包仍为本机1.0.1，未下载、更新或做玩法测试；本轮只为验证中文包而读两个物品名称。
- 目标语言设置的下拉选中值由只读页面读取为 `cn`；两份译包在 Babele 来源优先级界面均登记为 `:cn`，故本轮没有发现语言代号不匹配。

## 限制与下一次复查

两份译表中的该合集各有62个条目；来源次序使本地译包的“动画数字”覆盖另一包的“活化数字体”。这只能说明实际显示采用了本地译包，不证明62条译文语义都正确。物品所在的“迷雾护符”分组和它的中文说明讲的是通用迷雾护符规则，不能仅凭该条目的英文名认定说明错配；本轮没有权威原文的逐条语义验收。

Babele 客户端仍有 `range`、`rangeActivities`、`movement`、`senses` 缺转换器的警告。只读检查这份本地译包的9份直属 JSON，相关映射字段出现在3份文件里，但实际 `entries` 没有这四种译文负载；本轮样本的名称/说明显示未受影响。警告说明这些字段将被跳过，不能宣称所有结构化字段已翻译。若日后补译这些字段，先按当前 Babele2.9.1 注册的转换器和目标资料形态做定点来源核对，再走停世界安装和实际读回。

新候选的复查顺序：先核发行方正式版本与依赖；再核目标客户端语言、译表来源是否被加载、同名多来源的优先顺序；最后对一小组原文明确的条目做显示和整页重载读回。不能以“文件在磁盘”代替读回，也不能把两个物品的结果推广到整本冒险。
