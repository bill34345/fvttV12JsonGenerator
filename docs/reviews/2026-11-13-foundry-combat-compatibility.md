# Foundry 14 战斗兼容补丁

以下是三个可单独准备的源码补丁。适用版本取自原始运行验证。生成器、补丁和测试不访问运行中的世界，不会随 Forge 安装或启用。升级时先核对对应上游是否已修，再决定是否保留该补丁。没有新增待本地化模块。

| 遇到的现象 | 适用版本和改动 | 实测边界 |
| --- | --- | --- |
| 第一轮按「下一回合」又跳去聊天 | [Monk’s Combat Details 14.03](../../foundry-modules/server-next-external-candidates/retained-tools/monks-combat-details-14.03.md)。原设置开启时只在开战切一次，若用户已经离开战斗页则跳过。 | 本地两次正常开战切页，三次下一回合留在战斗页。 |
| 六个独立 NPC 一起掷先攻时，点击和浮窗到达各卡一下 | [dnd5e 6.0.6](../../foundry-modules/server-next-external-candidates/system-runtime/README.md) 跳过没有先攻值的分组候选。[Monk’s Combat Details 14.03](../../foundry-modules/server-next-external-candidates/retained-tools/monks-combat-details-14.03.md) 分开显示这一批浮窗。 | 本地两轮均保留六颗骰、六张聊天卡和六条浮窗。用于查找可共享先攻的分组计算从 42 次降到 6 次，仍能共享同组已有先攻，包括 0 点。开战前独立出现的停顿没有定位。 |
| 战斗画布第一次播放某种 3D 骰时顿一下 | [Dice So Nice 6.4.4](../../foundry-modules/server-next-external-candidates/animation-stack/dsn-board-normal-worker.md)。分批提交骰面绘制，把法线贴图的像素运算交给 Worker。 | 两次本地冷启动 Hex 样本中，材质阶段由 111／59 ms 两段长任务减为一次约 60–63 ms，首次绘制仍可能短停。骰子仍完整播放，样本的伤害结算保持一致。 |

[dnd5e 作者的实测](https://github.com/foundryvtt/dnd5e/pull/5842#issuecomment-3120557010)在另一条聊天卡路径中减少不可见托盘的计算，复测 100–200 张伤害和效果卡时观察到动画改善；维护者在自己的设备未复现同等峰值。[PubTech 的实测](https://web.dev/case-studies/pubconsent-inp)通过拆开长任务和其他渲染改动，让浏览器更早刷新界面。两条案例分别支持少做重复工作和分散长任务的办法，没有找到对应版本和场景完全相同的外部成功复现。表中实际行为和耗时来自 Foundry 14.370 的本地前后对照。
