# Blood Hunter 2024 新人物 2 级战斗风格：现场失败与来源核对（2026-09-26）

> **专项证据，不是当前进度表。**本页保留标题日期的来源和检查经过；其中“当前”“未执行”等只属于当时。新对话以[唯一迁移交接报告](../plan/server-next-migration-handoff-20260927.md)为准，仅在核对应证据时读本页。

## 给使用者看的结论

**最新结果（覆盖下方最初失败与待测记录）：**当前正式目标包已修复2级缺项。专用新人物完成2级并获得所选能力；烈焰血仪实际扣3点生命，匕首获得火焰附魔，重新进入后仍在；一次匕首伤害掷骰分别显示3点穿刺和4点火焰。临时场景棋子已精确清理，原有棋子未动。旧人物迁移的既有通过结论沿用。以下保留当时失败和修复经过，不把早期“未执行”当作当前状态。

只在新建的测试人物 `CodexTemp-BH-D6New-20260926`（ID `coIBdfkcit09j5Cv`）上，通过游戏界面加入了本团新版血猎手。1级升级完成，三项测试技能、两项血咒和“鲜血秘法”实际保存，人物生命值10/10。**2级还没有完成：正常升级向导让选战斗风格时，只列出“诱变武者”一项，本来应有的另外四项没有出现。**测试人物仍停在1级；没有为了让测试变绿而强选唯一选项。玩家人物、用户要求保留的旧测试人物和旧人物更新证据没有动。

## 实际经过和证据层级

- 本机临时Chrome经正常登录页进入精确原世界 `cor-cotn`／Foundry14.368／dnd5e6.0.2；通过人物目录正常创建上述唯一新测试人物。[创建结果](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/hud-formal-20260926/ui-create-bh-actor-result.json>)。
- 在角色卡“添加职业”选择精确新包 `Compendium.fvtt-blood-hunter-2024.classes.Item.25d112d765d4a190`，没有选择世界里的另两个同名旧职业。1级向导13步：选择奥秘／调查／洞悉、匕首／标枪精通、暴露诅咒／焦虑血咒；完成后真实人物有职业1级、鲜血秘法和两项血咒。[逐步现场记录](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/hud-formal-20260926/ui-bh-advancement-live.jsonl>)。
- 角色卡编辑模式里用键盘正常选2级，打开2级4步向导；生命值选固定值，预览从10到16；猩红仪式选择“烈焰血仪”，均尚未按最终完成。最后的战斗风格只显示“诱变武者”，因此退出向导、未提交2级。[2级现场记录](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/hud-formal-20260926/ui-bh-level2-keyboard-live.jsonl>)。
- 一次自动化直接设下拉框值导致页面报`Maximum call stack size exceeded`且没有打开向导；改用方向键/回车，正常向导成功打开。这个自动化诊断现象不再当作血猎手2级的主要失败，也不能掩盖战斗风格缺项。[定点诊断](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/hud-formal-20260926/ui-bh-level2-keyboard-diagnostic.json>)。

## 来源与失败原因

本工作区最终构建契约的2级“战斗风格”选项池原有五项：官方D&D 2024的箭术、防御、巨武器战斗、双武器战斗，以及本团“诱变武者”。[本机真实目标读回](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/hud-formal-20260926/ui-bh-style-source-result.json>)表明五个精确引用都能打开；前四项均为合法`feat/fightingStyle`，后者为本团特性。**缺项不是文件缺失或引用失效。**

精确目标dnd5e6.0.2源码 `module/applications/advancement/item-choice-flow.mjs` 在显示选项前调用每项的`assertPrerequisites`；四个官方战斗风格的原始资料都要求人物先有 `identifier=fighting-style` 的职业特性。本团血猎手当前2级只给“猩红仪式”并呈现选项池，没有先授予这个标记特性；所以游戏筛掉四项，只剩不要求它的“诱变武者”。官方战士职业的原始包在选战斗风格前另有一条`ItemGrant`授予`Fighting Style`，可作同版实现参照。此处是从同版源码与现场结果推断的根因，修复仍须复测证实。

## 修复边界与复查

只在本团血猎手的正式来源到目标构建流程里补齐原文已有的“战斗风格”职业特性及其2级授予关系，使官方四项满足先决条件；不得手改最终包文件、放宽全世界规则或修改官方系统包。先做来源/构建/本模块定点检查，再正常关闭原世界、23处锁释放、精确替换本任务自有包、恢复原服务。只复测上述新人物的2级正常选项和“烈焰血仪”关键行为；1级选择、旧人物更新和其它模块已通过的检查不重跑。

## 修复后实际结果（覆盖上方失败时状态）

本团正式生成流程仅针对dnd5e6.0.2，从原始“战斗风格”来源生成一个稳定的本团基础特性（`identifier=fighting-style`），并把它放进2级授予步骤、排在五选一之前。旧目标仍为76个特性，新目标77个；资料来源、四个官方选项和自制“诱变武者”均保留。包内20项检查、模块31项检查通过，两个类型检查通过；精确旧来源的正式新目标构建产出82份文档、117个动作，ZIP SHA-256为`33FEAE2507820423FC92921F509BC4ED4D40F5A685F4545223A2A699549169F8`。独立只读复核没有发现安装前必须修改的风险。

原世界正常关闭、23个世界锁和3个模块包锁可独占打开后，精确停止PID24104；只替换本团Blood Hunter自有模块目录，新包18文件逐个哈希相符。按原参数恢复为PID43364，原世界、版本、登录页及模块清单读回正常；安装时没有修改世界数据库，也没有创建旧包备份。启动初次探测太早遇到连接拒绝，随后唯一进程已监听并确认正常。

修复后的受影响路径只用**新建**测试人物`CodexTemp-BH-D6Fix-20260926`（ID`bFhPu8SNIrDRX2je`）执行，旧失败测试人物`coIBdfkcit09j5Cv`没有更新。游戏里职业1级用于准备测试；正常角色卡升2级时，五项战斗风格全部列出（四项官方、一项本团），选中官方“箭术”，同时选择“烈焰血仪”；点击完成后人物HP16/16、职业2级、猩红仪式、战斗风格基础特性、烈焰血仪及箭术均实际存在。整页重载后相同。[真实向导与重载结果](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/bh-style-20260926/ui-bh-d6-retest-result.json>)。

**目前：2级选择、授予与重载PASS；烈焰血仪的激活失血、给武器附魔及后续伤害仍NOT_EXECUTED。**新旧两名本轮专用测试人物都暂保留并有精确ID，后续清理只针对它们；用户要求保留的旧人物及玩家人物始终未动。

## 烈焰血仪实际使用与清理（最终读回）

只在新建的2级专用测试人物 `bFhPu8SNIrDRX2je` 上放置一个隐藏、与该人物关联的场景棋子，并给他一把测试匕首。场景原先只有棋子 `gjZtXvIzfa4Sc1jz`；本轮新棋子为 `vdwaMetYabjuJCM0`。人物原生命值16/16，经正常角色卡使用“激活失血”，掷出3，稍后生命值实降到13/16。再次使用“激活烈焰血仪”，系统创建附魔卡；为避免同一次启动重复扣血，关闭随之弹出的第二张失血掷骰窗口，没有第二次掷骰。把测试匕首从人物背包正常拖到附魔卡，游戏为匕首添加 `enchantment` 类型“烈焰血仪”，其额外火焰伤害来源为 `@scale.blood-hunter.crimson-rite`。[现场操作记录](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/bh-style-20260926/ui-bh-rite-live.jsonl>)、[附魔后全新页面读回](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/bh-style-20260926/ui-bh-enchant-readback.json>)。

用这把匕首通过正常人物卡掷一次攻击和伤害，不选择其他人物作为目标，也没有点击对目标应用伤害。伤害窗口同时列出穿刺 `1d4+0` 和火焰 `1d6`；结果卡分别显示穿刺3、火焰4。人物HP仍为13，聊天卡明确写 `No Targets`。[独立重登后伤害卡读回](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/bh-style-20260926/ui-bh-dagger-fire-damage.json>)、[画面](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/bh-style-20260926/ui-bh-dagger-fire-damage.png>)。附魔效果在全新页面重登后仍在；这证明本轮指定武器效果持久、实际伤害含火焰。没有把攻击应用到任何玩家人物，也没有测试全部职业等级或分支。

只按精确ID删除本轮临时场景棋子；场景棋子数2→1，整页重载后仅原有 `gjZtXvIzfa4Sc1jz`，本轮人物HP仍13。[清理与重载读回](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/bh-style-20260926/ui-bh-rite-cleanup-result.json>)。本轮两名专用测试人物暂留：最初失败人物`coIBdfkcit09j5Cv`仍停1级，修复后人物`bFhPu8SNIrDRX2je`为2级且持有测试匕首；聊天证据暂留。用户要求保留的更早血猎手人物和错误测试副本没有删除、更新或改名。**本轮迁移影响的旧人物更新、新人物2级选择与血仪实用均PASS；全职业逐级玩法和真人角色迁移没有执行。**
