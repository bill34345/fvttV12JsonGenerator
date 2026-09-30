# DLC 两个 Actor 合集：共用验收工具追加实机记录

日期：2026-10-01。主目标仍为共用验收工具 V1 验证；本样本只处理用户另行授权的两个 DLC Actor 合集。第一版最低接受边界仍为 VERIFIED_LIMITED_SCOPE。本样本已经完成安装、两次 strict 系统迁移、完整文件校验及两个样本 UI／GM重载；**完整来源语义暂为 FAIL：11个Actor的49条原有技能检查额外加值未进入正确的新字段。** 不用 API 返回、数量或 UI 样本通过把这项失败覆盖为整个合集可用。

## 范围与实际运行

候选为 `20261001-000036-acceptance-dlc-trial / 072b50a`，运行原有 Next 的 `cor-cotn / 14.368 / dnd5e6.0.2`，只处理 `5e-dlc-monster.monster-heji` 和 `5e-dlc-monster.modengken-duoyuanguaiwu`。原 Mirror 未写、其他批次未恢复、无生产／版本升级／备份／世界复制。代码及原始Actor来源只作私有证据，不把完整付费内容或世界数据提交到仓库。

Chrome实际执行配置为 `gpt-6.1-sol / medium / danger-full-access / never`，各阶段有执行器自己的新上下文回执；后台模型未独立观测。主控仍为 max。独立回调明确路由当前父UUID，原件含dispatchId/revision/nonce；发送、收到及父审分别记录。

| 层级 | 实际证据 | 当前结论 |
| --- | --- | --- |
| 安装与来源 | 4591文件／626,561,217字节；停止状态下只读本任务新目标，当前原始记录969＋278 Actor、9805＋2642 Item、380＋3 Actor Effect、433＋21 Item Effect、15＋42 Folder；记录引用和所有key／value ID完整。 | PASS 限定来源。 |
| 原生身份 | 原生索引／Folder全量ID独立对照原始记录，保留大小写，missing／extra／duplicate均0。 | PASS，不能代替机制。 |
| 系统迁移 | 两个合集各调用一次 `migrateCompendium(pack,{strict:true,bypassVersionCheck:false})`；首包UTC22:07:18.869→22:10:10.031，次包22:10:10.077→22:10:31.460。原锁恢复true，art=true、pause=true、active=viewed=`k0tDQjWqrbvHbjdu`。 | 两次调用完成；无迁移／复原错误。 |
| 完整after | 236个API上传原片，最大323614字节；整体64,888,210字节，原生SHA-256 `8b4466925a3433db95287e2648de853174f402f18d0bd0396789332beb4ef1ce`。父逐片复算、连续UTF16重组／Unicode／长度／整体摘要均一致。 | PASS完整原件。 |
| 来源对照 | Actor／Item／Effect／Folder ID、名字、描述、图片、所属关系均保持；HP／能力值／原AC字段无数值差异。移动、感官、roll bonus、rarity、advancement和effect origin按精确版本新路径检查。 | 49项技能加值不符合来源；FAIL，不接受完整语义。 |
| 样本UI／GM重载 | 有翼晶角兽HP93／AC17／STR19／walk40＋fly40、6物品；火巨人HP187／AC21／STR27／walk30、7物品＋1效果。头像实际加载，Bite的Midi Attack活动、装备页可见；一次正常重载前后样本／包锁／102模块94启用及版本／scene／pause／art／Token覆盖设置一致。 | PASS限定UI／持久化，不证明全部玩法。 |
| 清理 | 所属Macro、私有文件暂存目录及替代页面保留待接续；原巨大输出页面关闭未确认。 | NOT_COMPLETE。 |

## 真实失败与缩小工具

1. 安装前PowerShell路径猜错，被文件侧共同检查分类为工具层INCOMPLETE，安装未调用；改用实际入口后新合同通过。
2. 本任务临时检查器比较已排序实际ID与不同顺序的expected数组，产生假差集；直接对照源码和原始记录复现，修正为同一大小写敏感排序，缺失／重复／大小写改变／Folder缺失仍拒绝。原错误操作保留一次，不重放。
3. 原下载等待60秒大于外层30秒，引起执行超时；把超时分开后真实download事件仍失败。保留状态，改用小体积原生Dialog DOM读回，取得真实无ledger及全量ID。
4. 修正完整读取共两次，原生ledger证实序列化148,451,270字节完成，但整个大textarea使页面无法采集。支持的reload／close均遇原页面deadline；旧关闭未确认，同一Chrome另建一个替代页面后取得真实ledger。未杀进程／重启服务／绕过政策。
5. 取消“完整before必须再次显示”这项过重门禁；已有原始来源记录及原生ID为来源基线。精确Core源码证明JSON文件接口可用，再用473字节实际Unicode／nonce fixture跑完上传→保存→解析→父摘要复算；原ledger前后不变。
6. 两次系统迁移后输出紧凑JSON，只通过已有本地Core FilePicker上传每片最多1MiB的文件和原生manifest，界面只显示阶段摘要。输出失败分支保留已发生迁移，不授权重放。

这些是私有DLC案例适配器的恢复经验，没有追加公共DSL／调度服务，也没有把VM运行adapter冒充DLC通用接口。操作及输出分层、真实来源复核和独立父审有实际价值；这些事实不能宣称耗时／token节省。

## 语义失败及尚待决定的修复归属

精确dnd5e6.0.2的 `CommonTemplate.#SKILL_TOOL_BONUS_FIELD_PATHS` 把技能的 `bonuses.check` 指向 `check.roll.bonus`；`RollConfigField` 定义的是直接 `roll`。实际after的49条非零原值未出现在 `system.skills.<id>.roll.bonus`。涉及首合集10个Actor／48字段、次合集1个Actor／1字段。父任务已准备逐Actor／字段／原值／当前值的私有清单，尚未应用；是否进行这项额外第三方数据修正待用户决定，不自动改系统源码或重复迁移。

其余旧字段变化有实值检查：移动移至formula字符串 `movement.speeds`、感官移至 `senses.ranges`；AC和roll bonus位置按源码映射；20条common rarity进入 `rarities`，空advancement进入ID对象；712条旧effect origin保留在结构化 `system.origin`。原型Token显示／阵营／视野变化与该世界既有 `core.prototypeTokenOverrides` 一致，没有改变世界设置。

兼容清单：火巨人的Other AC Bonus原值＋1保持，但效果编辑UI标为Change Inactive；不能把准备后的AC21归因给它，也未接受完整效果玩法。爪击图标仍引用来源里的 `modules/plutonium/media/icon/sword-brandish.svg`，实际缩略图缺失。两项没有为凑PASS擅自改规则／换图；旧世界Item/Pixi错误族与本案新增差异分开记录。

## 接续与证据入口

完整私有证据根为 `F:\FoundryLab\foundry-v14\evidence\server-next-migration\dlc-tool-trial-20261001`；权威状态为其中 `current-case.json`。关键层级为原始source-records、runtime-page-recovery-4、runtime-file-output-probe-5、runtime-strict-migration-6、runtime-sample-ui-reload-7以及after-source-comparison／semantic-mapping／proposed-source-skill-repair。父审依原件和源代码，不只读取执行器标签。

下一步由本次数据修正范围决定：限定恢复49条来源值后复核受影响字段，或保留迁移语义待修状态先收尾原工具验证。随后精确清理自有Macro／暂存文件，保留必要证据。不得新增另一个迁移目标。三件可比任务、主动／等待、父子token归账及提速效果仍未完成。
