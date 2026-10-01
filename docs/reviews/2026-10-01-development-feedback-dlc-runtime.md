# DLC 两个 Actor 合集：共用验收工具追加实机记录

日期：2026-10-01。主目标为共用验收工具 V1 验证；本样本只处理用户另行授权的两个 DLC Actor 合集。第一版最低接受边界仍为 VERIFIED_LIMITED_SCOPE。本样本完成安装、两次 strict 系统迁移、完整文件校验及两个样本 UI／GM重载时，**来源语义被判为 FAIL：11个Actor的49条原有技能检查额外加值未进入正确的新字段。** 不用 API 返回、数量或 UI 样本通过把原失败覆盖为整个合集可用；后续限定修复另记如下。

上述FAIL是原系统迁移阶段的历史结果，原件保留。随后用户明确恢复限定49字段修复，已完成来源对照、重载、三个代表技能UI／实际API及精确清理，父审ACCEPTED_SOURCE_SKILL_REPAIR_LIMITED_SCOPE；当前见[独立修复验收](2026-10-01-dlc-source-skill-repair.md)。系统源码、其他字段和本记录的原迁移结果未改写，Other AC Bonus／遗留图标及全玩法仍未接受。

## 范围与实际运行

候选为 `20261001-000036-acceptance-dlc-trial / 072b50a`，运行原有 Next 的 `cor-cotn / 14.368 / dnd5e6.0.2`，只处理 `5e-dlc-monster.monster-heji` 和 `5e-dlc-monster.modengken-duoyuanguaiwu`。原 Mirror 未写、其他批次未恢复、无生产／版本升级／备份／世界复制。代码及原始Actor来源只作私有证据，不把完整付费内容或世界数据提交到仓库。

Chrome实际执行配置为 `gpt-6.1-sol / medium / danger-full-access / never`，各阶段有执行器自己的新上下文回执；后台模型未独立观测。主控迁移阶段为max，收尾阶段的实际上下文记录为high，配置分段详见[最终评估](2026-10-01-development-feedback-final-evaluation.md)，不能沿用旧期望值或当统一配置比较。独立回调明确路由当前父UUID，原件含dispatchId/revision/nonce；发送、收到及父审分别记录。

| 层级 | 实际证据 | 当前结论 |
| --- | --- | --- |
| 安装与来源 | 4591文件／626,561,217字节；停止状态下只读本任务新目标，当前原始记录969＋278 Actor、9805＋2642 Item、380＋3 Actor Effect、433＋21 Item Effect、15＋42 Folder；记录引用和所有key／value ID完整。 | PASS 限定来源。 |
| 原生身份 | 原生索引／Folder全量ID独立对照原始记录，保留大小写，missing／extra／duplicate均0。 | PASS，不能代替机制。 |
| 系统迁移 | 两个合集各调用一次 `migrateCompendium(pack,{strict:true,bypassVersionCheck:false})`；首包UTC22:07:18.869→22:10:10.031，次包22:10:10.077→22:10:31.460。原锁恢复true，art=true、pause=true、active=viewed=`k0tDQjWqrbvHbjdu`。 | 两次调用完成；无迁移／复原错误。 |
| 完整after | 236个API上传原片，最大323614字节；整体64,888,210字节，原生SHA-256 `8b4466925a3433db95287e2648de853174f402f18d0bd0396789332beb4ef1ce`。父逐片复算、连续UTF16重组／Unicode／长度／整体摘要均一致。 | PASS完整原件。 |
| 来源对照 | Actor／Item／Effect／Folder ID、名字、描述、图片、所属关系均保持；HP／能力值／原AC字段无数值差异。移动、感官、roll bonus、rarity、advancement和effect origin按精确版本新路径检查。 | 49项技能加值不符合来源；FAIL，不接受完整语义。 |
| 样本UI／GM重载 | 有翼晶角兽HP93／AC17／STR19／walk40＋fly40、6物品；火巨人HP187／AC21／STR27／walk30、7物品＋1效果。头像实际加载，Bite的Midi Attack活动、装备页可见；一次正常重载前后样本／包锁／102模块94启用及版本／scene／pause／art／Token覆盖设置一致。 | PASS限定UI／持久化，不证明全部玩法。 |
| 清理 | 精确自有Macro删除一次，91→90且其他Macro集合完全一致；238暂存文件及空目录清理，完整证据保留；替代页面正常关闭，最终一次原生tab清单中两个自有页面均缺席。 | PASS限定自有资源；未改数据、模块或服务。 |

## 真实失败与缩小工具

1. 安装前PowerShell路径猜错，被文件侧共同检查分类为工具层INCOMPLETE，安装未调用；改用实际入口后新合同通过。
2. 本任务临时检查器比较已排序实际ID与不同顺序的expected数组，产生假差集；直接对照源码和原始记录复现，修正为同一大小写敏感排序，缺失／重复／大小写改变／Folder缺失仍拒绝。原错误操作保留一次，不重放。
3. 原下载等待60秒大于外层30秒，引起执行超时；把超时分开后真实download事件仍失败。保留状态，改用小体积原生Dialog DOM读回，取得真实无ledger及全量ID。
4. 修正完整读取共两次，原生ledger证实序列化148,451,270字节完成，但整个大textarea使页面无法采集。支持的reload／close均遇原页面deadline；旧关闭未确认，同一Chrome另建一个替代页面后取得真实ledger。未杀进程／重启服务／绕过政策。
5. 取消“完整before必须再次显示”这项过重门禁；已有原始来源记录及原生ID为来源基线。精确Core源码证明JSON文件接口可用，再用473字节实际Unicode／nonce fixture跑完上传→保存→解析→父摘要复算；原ledger前后不变。
6. 两次系统迁移后输出紧凑JSON，只通过已有本地Core FilePicker上传每片最多1MiB的文件和原生manifest，界面只显示阶段摘要。输出失败分支保留已发生迁移，不授权重放。

这些是私有DLC案例适配器的恢复经验，没有追加公共DSL／调度服务，也没有把VM运行adapter冒充DLC通用接口。操作及输出分层、真实来源复核和独立父审有实际价值；这些事实不能宣称耗时／token节省。

## 语义失败及独立后续任务

精确dnd5e6.0.2的 `CommonTemplate.#SKILL_TOOL_BONUS_FIELD_PATHS` 把技能的 `bonuses.check` 指向 `check.roll.bonus`；`RollConfigField` 定义的是直接 `roll`。实际after的49条非零原值未出现在 `system.skills.<id>.roll.bonus`。涉及首合集10个Actor／48字段、次合集1个Actor／1字段。父任务已准备逐Actor／字段／原值／当前值的私有清单，尚未应用。用户确认先收尾工具第一版，把额外第三方数据修正列为[独立后续任务](../plans/2026-10-01-dlc-source-skill-repair-followup.md)；本轮不改系统源码、不修Actor、不重复迁移。

其余旧字段变化有实值检查：移动移至formula字符串 `movement.speeds`、感官移至 `senses.ranges`；AC和roll bonus位置按源码映射；20条common rarity进入 `rarities`，空advancement进入ID对象；712条旧effect origin保留在结构化 `system.origin`。原型Token显示／阵营／视野变化与该世界既有 `core.prototypeTokenOverrides` 一致，没有改变世界设置。

兼容清单：火巨人的Other AC Bonus原值＋1保持，但效果编辑UI标为Change Inactive；不能把准备后的AC21归因给它，也未接受完整效果玩法。爪击图标仍引用来源里的 `modules/plutonium/media/icon/sword-brandish.svg`，实际缩略图缺失。两项没有为凑PASS擅自改规则／换图；旧世界Item/Pixi错误族与本案新增差异分开记录。

## 接续与证据入口

完整私有证据根为 `F:\FoundryLab\foundry-v14\evidence\server-next-migration\dlc-tool-trial-20261001`；权威状态为其中 `current-case.json`。关键层级为原始source-records、runtime-page-recovery-4、runtime-file-output-probe-5、runtime-strict-migration-6、runtime-sample-ui-reload-7以及after-source-comparison／semantic-mapping／proposed-source-skill-repair。父审依原件和源代码，不只读取执行器标签。

用户已选择保留迁移语义待修状态，先收尾原工具验证。本轮专用Data暂存238文件／74,055,014字节及空目录已按完整清单与SHA-256清理；来源、完整after、manifest、对照结果及拟修清单均在私有证据目录保留。父清理收据为 `runtime-owned-cleanup-8/parent-file-cleanup-receipt.json`，同级目录清单保持一致。专用Macro／页面清理另由Chrome执行器读回，不用文件清理成功代替浏览器清理。

Chrome收尾dispatch `27e3d341-a1c5-463b-b47f-32fdaef89b7b` 在最新实际medium／Full Access上下文运行。正常Macro UI核旧command及marker后，仅保存冻结清理command，重开核对再一次执行；只删除 `4Izen96tFYrmJzxx`，原完成ledger留在实际结果中。43,402字节原生清理读回SHA-256为 `46fb860e0bd70cebb9c3dc3a15bb39af81a07cb3e58687b65ab2fb699adffb1b`。主控独立解析、复算摘要、核领取时点及完整Macro集合，packs／modules／scene／pause／art既与清理前一致，也与上一轮已接受重载原件一致。自有替代页面正常关闭；最终一次原生tab列表为空，旧巨大输出页也实际缺席，历史未确认状态由本轮当前证据闭合。

父审收据 `runtime-owned-cleanup-8/parent-cleanup-acceptance.json` 为 ACCEPTED_EXACT_OWNED_CLEANUP；10条合成删除guard只作准备检查，不代替浏览器原件。源语义仍FAIL、49条修复未执行。既有服务及安装保留，不因完成工具交付停止共享服务或撤掉迁移成果。

不得新增另一个迁移目标。三件可比任务、主动／等待及提速效果仍未完成；随后已完成记录窗口的父／Chrome／只读复核token回溯基线，不能把这些观察量当收益比较。上述限制不影响工具第一版最低交付结论。
