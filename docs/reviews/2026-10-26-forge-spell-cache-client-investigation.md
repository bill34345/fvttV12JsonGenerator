# 米·戈重复法术：客户端与原生缓存的有界调查

本页是原双页失败的调查快照。后续按用户接受的安排，以同一冻结米·戈候选在单GM页创建，2个Spell/2个Cast且无过期提示，完整刷新保持；见[后续验收](../acceptance/2026-10-26-forge-empty-fields-vulnerability-repair.md)。下文“尚待单页核对”不再是当前待办；未修改Resolver并发机制，也未证明多页面已获支持。

日期：2026-10-26。对象是本批新米·戈Actor，目标Mirror Core14.368/dnd5e5.3.3；不是旧失败清单的重新开启。只读调查，不改产品、系统或Actor，不重新解析法术。

## 当前结论

Actor已成功保存，Resolver有`hydrated`状态及成功事务。两个各1/日Cast保留INT/DC17、全部法术成分豁免和Plane Shift仅自身；但每个法术有两份Spell Item，其中一份没有Resolver归属。角色同时显示`Ready plan is stale for the Actor current managed projection`。

代码和保存数据支持“同一GM账号的多个客户端同时处理”的解释，尚不能证明每次调用具体来自哪个页面，也未排除同页重复注册。不要把推断写成已定位全部根因，更不能以删除重复Spell或过期检查代替修复。

## 直接证据

- `foundry-modules/monster-spell-resolver/src/transaction.ts:124`在事务写入前核对当前数据。该报错调用自身没有写出4个Spell，也没有删掉已有攻击、伤害或法术。
- `foundry-modules/monster-spell-resolver/src/hooks.ts:99`只按活跃GM用户ID选定执行者；队列/active状态是每个客户端自己的。两个页面登录同一账号都能成为执行者。
- 实际安装的`Data/systems/dnd5e/dnd5e.mjs:18532`仅以`userId === game.user.id`决定是否处理活动更新；找不到缓存后异步读取并创建。相同账号多个页面均满足条件。
- 冻结Actor的四个Spell都由同一GM账号最后修改；每对法术的`dnd5e.cachedFor`相同，未管理副本分别晚148毫秒和159毫秒。世界活跃用户列表只有一个GM账号；该列表不能区分同账号多个连接。
- 浏览器准备时保留了一个MCP桥接GM页和一个隔离来源的工作GM页。正常只读宏已确认两个页面登录同一GM、使用不同socket且都已连接，Resolver在两页均启用、API已加载、`canMutate=true`。事实在`browser/identity-working.json`和`identity-bridge.json`；它证明重复执行条件成立，未记录每次具体调用的发起页面。

原件位于本批私有证据`browser/mi-go/created-full-observation.json`、`native-actors.json`、`spell-readback.json`。完整原件保持；浏览器页面内的原候选和世界中实际保存的Actor分开记录。

## 外部检索与适用边界

按个人调研规则用AnySearch检索`site:github.com/foundryvtt/dnd5e/issues duplicate spell cachedFor multiple browser tabs`，并检索官方仓库`onUpdateActivities cachedFor userId`实现。本轮没有找到与当前条件、版本和结果直接匹配的一手故障案例，不能声称这是社区已确认的同一问题。

检索定位到[官方Item实现](https://github.com/foundryvtt/dnd5e/blob/93ba0dc3e837b66864ec385b8419882009b12e4e/module/documents/item.mjs)的活动更新委托；网页抽取先返回大量行号，随后读取其Raw内容。该提交未在本轮证明等于5.3.3，故仅作导航，结论仍以本地实际5.3.3代码与本批保存结果为依据。没有据此扩大到其他版本，也没有引入外部模块或新依赖。

## 下一步及待判断项

两个页面的只读身份取证已完成，桥接页随后关闭。浏览器执行器之后连续两次模型容量错误，主控按既有Chrome规范接手；原工作页仍属于旧执行会话，主控通过官方页面清理接口关闭已完整取证的本批页，再在同一来源地址恢复已保存角色。恢复读回与先前完整Actor逐字段相同，没有重建米·戈或清理其重复Spell。原罗刹候选继续在唯一工作页验收。单页下另一个样本的成功只能缩小解释范围，不是米·戈已修好或多页面因果已严格证明。

待判断的是执行者选择、重复调用和原生缓存交接的最小修复，非内容复核或攻击/法术降级。当前不需要新增本地化项目。重新评估候选修复时先以冻结资料明确会改变的调用点，再只验证受影响场景；不重复模型提取或扩全仓矩阵。

后续原罗刹候选在单工作页通过正常Forge导入：9个Cast与9个受管理法术缓存，没有重复或过期提示；刷新全量保持。该结果未改变上述因果边界。米·戈完整失败数据另行冻结，最终仅随已授权测试角色清理删除，不把清理当修复。

用户追问后已另外证实：同一个127.0.0.1 GM页面可以同时用于MCP读取和Forge界面，不需要专门的第二张GM页。优先修正本次双页测试安排，不将多客户端改造自动扩大为本轮必修功能。米·戈单页情况尚待同冻结候选核对，详见[后续事实核查](2026-10-26-forge-empty-fields-and-official-rakshasa.md)。
