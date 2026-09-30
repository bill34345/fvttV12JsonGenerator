# 5e DLC 两个 Actor 合集：离线迁移准备与共用验收复用

日期：2026-09-30。用户明确选择“先完成两个合集的离线迁移准备”。结论为 **ACCEPTED_OFFLINE_PREPARATION_ONLY**；安装、迁移、Chrome、玩法与重载均未执行，运行授权 NONE。延续本任务文档提交／合并 master、暂不 push 的授权，不整合原业务树的未提交实现。

## 来源、范围与归属

源为用户已持有的 `F:/FoundryLab/foundry-v14/data/server-mirror/Data/modules/5e-dlc-monster`，manifest 1.2.0，无运行脚本，声明两个 dnd5e Actor 合集：`monster-heji`（官方扩展书怪物合集）、`modengken-duoyuanguaiwu`（魔邓肯巨献：多元宇宙的怪物）。Next 的对应模块目录当前不存在；未把版本兼容声明作为实际可用证据。

本次只盘点这两个合集、manifest 与共享 assets/token。16个未声明合集目录排除。初始模块全部4781文件、710,462,567字节；选择4591文件、626,561,217字节，其中两个数据库24文件、22,941,788字节，共享素材4566文件。不复制包或世界、不打开LevelDB、不读取Config、不把内容或图片重新分发；产物仅为路径、摘要、迁移方案和回执。

起点 master `cf52e4b8330d8042c59c4019ed76a6c84c7dad7c`，新树 `I:/OpenCode/fvttV12JsonGenerator-worktrees/20260930-225855-dlc-pack-preparation`，分支 `codex/20260930-225855-dlc-pack-preparation`。主区5个既有dirty路径、审计12／ServerNext368／WMP161路径与各先前工具树均记录内容指纹；旧业务树只读。原迁移聊天状态为notLoaded，不据此推断共享服务已释放；本次无服务操作。

## 实际来源清单

下列SHA-256是既有资产盘点器的根清单指纹，和单个文件的字节指纹不是同一种值。

| 选择范围 | 文件数 | 字节 | 清单根指纹 |
| --- | ---: | ---: | --- |
| module-manifest | 1 | 1,219 | `45085945985e6d8ad9f24af0f9fe361ffbf2f10aea9d12587d2104b1a0d4a0f4` |
| monster-heji | 15 | 17,962,206 | `99b7f17080583f329ebd673fac6c0ecf3114436ffc93192b1897bd737cd62de2` |
| modengken-duoyuanguaiwu | 9 | 4,979,582 | `3a0431db24bf8e890fa7967e1263bdddc93186487f252f98c9d0840261d0dfd5` |
| shared-assets | 4520 | 590,786,871 | `12bad8a633bf27bbbd8b34af05411adb96b9d969e648681422ec483f1d91741b` |
| shared-token-images | 46 | 12,831,339 | `43bde5e50abd1ca27f75e229f92ec10d4130bf0b14ee53ec31585f342ae6d51d` |

两次所选源盘点的路径／字节／SHA-256完全一致，没有链接、读取错误或扫描中变化。两个CURRENT均指向存在的MANIFEST，仅以普通文件读取；历史SST记录与嵌入数据不能充当当前Actor数量。当前Document数量、语义和引用覆盖保持NOT_EXECUTED。

## 精确系统接口与迁移方案

只读核对Next本机dnd5e6.0.2的 `Data/systems/dnd5e/dnd5e.mjs`，字节SHA-256为 `e9570927a215948fb3a3923a322c7bbf1455009565f48813168edd8c6df4890f`，得到以下静态接口事实：

- `migrateCompendium(pack, {bypassVersionCheck=false, incrementProgress, strict=false}={})` 接受Actor合集，通过 `getDocuments()` 取得数据，再走 `migrateActorData` 与正式 `doc.update`。不是直接写数据库。
- 默认strict=false会记录单条错误并继续，其后仍可能输出“全部迁移”日志。准备方案要求 `strict:true`；异常停止后续合集，保留实际已写状态，不整批重放。保留版本门禁，使用bypassVersionCheck=false。
- 系统finally恢复原合集locked，但把 `game.compendiumArt.enabled` 强制设为true。外层须事先记录并恢复该开关原值，不能把系统finally当完整原值恢复。
- 两个集合UUID分别为 `5e-dlc-monster.monster-heji` 与 `5e-dlc-monster.modengken-duoyuanguaiwu`；其他集合不自动纳入。

可审阅的完整迁移步骤与剩余检查在本任务树 `.local/dlc-pack-preparation/migration-plan.json`。以后明确恢复时：

1. 核对新授权、实际服务／聊天占用、PID／监听／dataPath／世界／Core与system，以及当前源清单。进入既有Next的受控安装流程，只处理这两个声明合集和共享素材。
2. 使用正常合集入口取得实际Document／Folder／嵌入ID全集和迁移前语义基线；不能以SST抽样代替。核对新错误差异。
3. 逐个调用精确系统迁移，strict=true；保存部分完成状态，恢复合集锁和全局图片开关原值。
4. 对照同一UUID集合核数量、技能、攻击／伤害／法术、资源／消费、效果、图片和跨包引用。完成代表UI、重载与独立父审。只有属于本次测试的临时对象才能清理，正式合集结果保留。

按[版本资料路由](../runbooks/foundry-v14-development-source-routing.md)评估官方CLI边界：本轮没有pack/unpack或数据库提取目标，已取得精确系统正常迁移入口，未新增CLI依赖或对源库做工具Trial。若以后需要unpack／pack，先锁CLI版本，只在明确候选构建目录验证Document／UUID／Folder往返，不能直接试开现有来源库。

## 共用工具的实际使用与父审

复用已有 `scanAssetRoot()`、路径／新文件保护和文件侧验收内核，没有新增公共adapter、命令或平台。专属检查脚本只保留本次明确来源及接口事实。准备、ready、一次正式verify、collect、resume已完整执行：

- run `67bd615a-e398-4e66-8cfe-9e90c15d433b`；dispatch `2c0f3995-3bd9-42e5-bb36-e51e7e415938`；收据 `6d0ab447-54c0-460c-b25d-3dc071c01875`。
- 指令基线自动取得 `cf52e4b8330d8042c59c4019ed76a6c84c7dad7c`。预检真正Node语法检查退出0；实际verify返回ok:true且退出0，核对4591个选择文件的前后清单。
- 自动层PASS仅指请求所声明的本地来源／接口检查，evidence COMPLETE、cleanup NOT_REQUIRED、parentReview PENDING。resume回到REVIEW并保持同一收据。
- 主控独立读原件与范围，重新复算43个合同绑定身份全部一致，再接受离线准备；不提升为Actor迁移或图片引用通过。

原件与专属脚本位于本任务树 `.local/dlc-pack-preparation/`：source-inventory.json、verified-source-inventory.json、migration-plan.json、parent-review.json、current-state.json。通用合同与收据位于 `.local/development-feedback/67bd615a-e398-4e66-8cfe-9e90c15d433b/`。此任务current-state只管理本次离线准备，不取代原迁移总交接。

## 描述性测量与尚未执行的层级

首次明确计时UTC `2026-09-30T14:52:26Z` 至离线父审 `2026-09-30T15:16:24.7707599Z` 共 1438.770 秒；此前初始接续／提问未覆盖，主动工作与等待未分账。依赖819包安装57.67秒。正式合同1份、正式检查1次、正式失败0；源盘点建立1次、验证1次；没有fixture重建、业务返工或玩法重放。

发现阶段仍有8项可观察准备问题：rg通配符路径、过宽输出截断、遗漏Data路径、PowerShell foreach管道、猜测三个不同源码路径，以及store返回值误拼进语法检查路径。改用真实目录／已定位源码／正确绝对路径后才进入正式检查；未把这些失败当PASS，也未因它们启动玩法复测。人类范围确认1次属必要决策，未向人类索取代理错误纠正。详见本任务 `.local/dlc-pack-preparation/measurement.json`。

只接受文件来源与迁移接口准备。实际合集读取／数量、前后数据语义、图片引用、安装启用、UI／角色／重载、清理都没有执行；不得报告“合集已迁完”。本次是自然业务任务的离线阶段，与完整实机任务边界不同，不算完成三件同复杂度对照；token、主动／等待和提速结论仍未测量。
