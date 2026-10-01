# dnd5e 双版本线与 ServerNext 稳定版跟随策略

日期：2026-10-01。当前状态：用户已授权双版本线流程、十自有模块恢复以及额外 Midi 两请求处理器修复。系统6.0.2→6.0.5安装完成，十模块恢复为原94启用ID，代表行为与普通GM重载、精确清理通过；Midi local.10 的限定部署／真实两请求+4／精确清理也通过，仅它的版本由local.9改变。历史84／模块FAIL记录如下保留，当前进展以[本轮恢复接受](2026-10-01-next-605-custom-module-restoration.md)和[Midi修复记录](2026-10-01-next-605-midi-request-bonus-gap.md)为准。未启用后台定时任务；本轮代表切片不等于全部模块／玩法／生产通过。

## 当前方向

- V12 后续逐步弃用；本稿不删除既有实现或改变 CLI 默认值。
- 5.x 是保留的独立系统线，资料与开发固定 5.3.3（当前也是该系列最新稳定发布）；不自动跨到 6.x。若作者以后再发布 5.x 维护版，重新核对，不断言作者永不补发。
- ServerNext 的长期目标是官方最新稳定 6.x，不把 6.0.2 设为永久支持上限。排除 draft、预发布和开发分支；7.x 不自动纳入本策略。
- “跟随更新”和“记录精确版本”并存：升级前后记录实际 system/Core 版本、源码提交和证据；新的任务使用当时实装的 6.x。历史 PASS 保留原版本，不自动改写成所有后续 6.x 都通过。
- 自有 mod 的公共规则尽量复用；5.x/6.x 不同接口分别适配、分别验收，不默认复制两套完整实现。

## 2026-10-01 官方与本地核查

| 对象 | 核查事实 | 证据边界 |
| --- | --- | --- |
| 官方稳定 5.x | GitHub Releases API 所列最新非 draft、非 prerelease 的 5.x 是 release-5.3.3 | 这是查询时点，不是永久冻结上游的声明 |
| 官方稳定 6.x | 最新为 release-6.0.5，发布于 2026-09-22 22:22:44 UTC；正文修复 Activity 请求检定／豁免在部分情形下报错 | 修复说明不等于本团所有 mod 运行已接受 |
| 6.0.5 Core 要求 | 精确版本 system.json 声明 minimum=14.367、verified=14 | 不能以系统更新策略顺带授权升级 Foundry Core |
| ServerNext | 只读安装清单仍为 dnd5e 6.0.2 | 本次未启动客户端，不声称完成升级或 gameplay |
| 关键 mod 声明 | Midi local.9 声明 maximum=6.999；AC5e14.603.2 声明 6.0.0–6.1；Tidy14.1.2 声明 6.0.x；Vision/Item Macro 是既有本地候选 | 声明没有显示这些条目明确排除 6.0.5，但本地适配、Hook 与源码仍须针对升级变化核对 |

AnySearch 成功读取 6.0.5 正式发行页，5.3.3 页面提取失败；5.x 发布身份以官方 Releases API 的成功响应为依据。没有因提取失败反复重试或凭缓存猜最新版。

## 发现更新后的窄流程

1. 从官方发布列表取最新稳定 6.x，比较目标实际安装版本；读取发行说明和精确清单。
2. 检查目标 Core 是否满足要求、当前关键 mod 与本地适配是否受影响、服务是否被其他任务使用。只处理 ServerNext 的 dnd5e 系统；不连带升级 Mirror、Core 或生产。
3. 前置成立后按已核对的本地升级路径更新；不直接编辑运行中 LevelDB，不创建备份或另一套 Lab。具体维护与浏览器操作沿用现有规则。
4. 验证正常启动和受影响的代表行为，核对必要迁移／持久化；没有相关变更不重做完整模块矩阵或已完成 DLC 迁移。
5. 更新实际版本、对应源码与新证据。出现具体兼容障碍时记录阻碍；不因“官方更新通常修 bug”把失败升级或玩法错误自动接受。

6.0.x 补丁一般可使用较窄检查；6.1／6.2 可能增加功能或改变接口，按发行事实扩大受影响范围。是否需要 Core 更新、跨到 7.x 或处理既有数据异常属于新的范围判断。

本稿未配置后台监测频率，不能声称已经在持续监控或将准时自动更新。ServerNext 6.0.2 → 6.0.5 已按用户授权安装并重新进入cor-cotn；当前Core14.368、原PID39528保留。原94活跃模块降为84，模块组合未接受。业务 runId `021d72ef-f766-457b-b6ab-f6a004da87c7`，原件位于 `F:/FoundryLab/foundry-v14/evidence/server-next-migration/dnd6-update-20261001-021d72ef`；不复制私有原件入仓库。

## 资料与来源

- [官方发布 API](https://api.github.com/repos/foundryvtt/dnd5e/releases?per_page=100)
- [5.3.3 正式发布](https://github.com/foundryvtt/dnd5e/releases/tag/release-5.3.3)
- [6.0.5 正式发布](https://github.com/foundryvtt/dnd5e/releases/tag/release-6.0.5)
- [6.0.5 精确系统清单](https://raw.githubusercontent.com/foundryvtt/dnd5e/release-6.0.5/system.json)
- [现有资料路由](../runbooks/foundry-v14-development-source-routing.md)：仍有 5.3.3 单目标文字，后续规范整合应区分固定线和跟随线。
- [反馈流程](../runbooks/development-feedback-loop.md)

## 本轮资料查询与准备验证

Context7 两次实际查询分别要求 release-5.3.3 和 release-6.0.5，但仍返回 Wiki／6.0.x，未建立精确版本文档证据；没有据此升级版本或推断 API。官方发布身份来自 Releases API，精确源码6.0.5为提交3ee48de02f8f6f7b2638c9f6cf3e9540c9c181cc，新 checkout 复用6.0.2源仓库Git对象，旧HEAD保留。

原生快照工具语法及3项文件侧守卫检查通过：49来源值／字符串快照往返和不重复写入；错误来源值阻断；升级后的模块漂移阻断。它们不代替真实Setup更新、客户端读回、Activity行为或资源清理。执行步骤见[双版本线操作](../runbooks/dnd5e-version-following.md)。

## 实际升级与未闭合出口

Chrome完成回执：dispatch e425f6dc-0d91-4b85-9f82-c99321f8e1c4，正常Setup仅更新dnd5e并启动同一世界；标准World Data Migration提示6.0.2→6.0.5，备份选项1→0后执行一次。Systems和游戏内均显示6.0.5，Core14.368、PID39528／Node24.17.0／loopback30002保留。

原生后置观察在activeModules比较停止，未产生afterJSON。Source49检查在该比较之前成立属于控制流证据；本轮新的原始49值和之后无关ID比较仍待独立只读保存，不能写成全部保留PASS。

10个已启用模块现被Foundry因清单maximum6.0.2禁用：chat-memory-guard、fvtt-babele-rolltable-embed-translation、fvtt-battlefield-painter、fvtt-blood-hunter-2024、fvtt-homebrew-species、fvtt-house-rules、fvtt-injury-fading-spirits、fvtt-json-generator-spell-resolver、fvtt-session-monitor、open-session-deck。至少Battlefield Painter、House Rules、Injury、Spell Resolver、Open Session Deck的已安装运行代码另有6.0.2精确版本门。

前置检查只抽查了部分关键模块，漏掉上述自有模块，是本次检查设计的缺口；已据反例修正runbook为启用全集与代码门。原迁移工作树持有未提交的Next适配，旧主线多数仍锁14.364／5.3.3。父任务未改高运行清单、未勾选保存模块、未复制或提交原业务树，也未重放更新／迁移或降级。

用户正在选择是否将这10个模块的6.0.5适配纳入本次，或保留新系统另行安排模块适配；这项选择影响新增业务范围，不能由普通版本更新自动推断。自有Macro C3z5LLakUs6riKBN及页面651337820暂留，精确清理待后续阶段；当前服务运行。候选check/save fixture工具只完成准备与语法检查，未执行、未创建其Actor／Scene／聊天。

## 独立只读父审更新

第二次只读dispatch5ad7fb5d-e7b8-4c55-9af3-31c48f172093得到67930字节native-inspection.json，SHA-256为634d7bca5fe26cc578810dcc1fd7f5558a611238e3d7408f869eb654fbeec103。父侧独立解析原件，49来源值逐项相等；world Actor294／Item206、其他Macro90、chat1419、用户角色、active/viewed scene、paused及两Pack969/278与本次升级前baseline一致，Pack均锁定。chat分母为本次升级前1419，不把前一任务历史1418当当前基线。

父侧实际查看Setup及游戏内截图，均显示6.0.5／Core14.368，游戏内活跃模块84。发行系统为打包dnd5e.mjs，没有module源码目录；最初直接逐文件比较的假设被撤回。安装包source map中五个关键嵌入源码（migration、Check、Save、Activity mixin、Actor）与固定3ee48de源码仅换行不同，明确CRLF→LF后逐字一致；分别保留原始SHA。官方ZIP直接下载遇SSL EOF，未完成ZIP逐字身份验证，不能将source map比较扩大成全包验证。详见parent-inspection-review.json。

只读保存与源值保留接受；10模块差异仍FAIL，Gameplay及精确清理未完成，等待用户模块范围选择。
