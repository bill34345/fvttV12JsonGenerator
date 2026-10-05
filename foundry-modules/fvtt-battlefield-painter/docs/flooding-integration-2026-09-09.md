# Flooding 候选 — 2026-09-09

状态：实现与离线美术自审完成；正式画笔和动态实机验收尚未完成，不作交付PASS。

## 本轮范围

在既有worktree接续，保留用户确认的Fire/Frost/Brambles/Acid。核对官方商店、screenshot-3公开目录与screenshot-5阶段图，选择尚未覆盖的Flooding两阶段。目录仍列36种配置；现有四种主题已实现，本轮只增加积水。

来源：[商店](https://www.foundryvtt.store/products/tile-arsenal)、[目录](https://sigil-fvtt.s3.amazonaws.com/tile-arsenal/assets/screenshot-3.webp)、[阶段图](https://sigil-fvtt.s3.amazonaws.com/tile-arsenal/assets/screenshot-5.webp)。AnySearch刷新文字，浏览器查看两张公开图。未取得或导入付费资产、代码或配置。官方当前最低版本14.365不改变本项目锁定14.364/dnd5e5.3.3。

## 本项目选择

I水洼：零散蓝绿色积水。II漫水：连续水面与水下光纹。每格一张原生Tile，alpha0.9、白色Tint、15%视觉外扩、稳定0/180旋转；标记flooding-static-v1。正常移动；水深、游泳与减速由GM裁定，不创建Region/Wall/Light/Sound。公开资料未确认这些内部玩法参数。

复用原酸液原生材质生命周期，加入独立Flooding profile：12秒循环、I/II内部UV位移0.006/0.010。酸液默认profile保留10秒与0.009/0.014，原shader公式不变，有回归断言。未新增画质切换，也未改动四组原PNG。水面动效尚待完整实机周期检查。

## 素材与离线自审

两张内置imagegen原创PNG均1254×1254 RGBA，无手工重绘/抠图/重采样。I coverage30.82%，II82.37%；alpha实际含0与255。原图与地图叠图已查看：水面身份清楚，单格、九格、L形和孔洞成立；可见格位重复，不能称无缝。offline-art-review.png明确标识为离线合成，不能冒充Foundry截图。

| 文件 | SHA-256 |
| --- | --- |
| flooding-native-stage-i.png | ef0554871a0ea079ad9e40baf256a0f53b42de58cb2b262f9bc414b2cf9eccc8 |
| flooding-native-stage-ii.png | 6bd520db1c8869513adfa905bfda68b0744f5bbbe7329eda3b563406c7575b74 |

## 验证状态

- PASS：189测试、0失败、3540断言；模块和全部Foundry模块typecheck；测试内build与确定性ZIP验证；diff检查。
- PASS：两张新PNG透明检查，原图及离线地图叠图自审。
- PASS：本地精确版本14.364/5.3.3、原active/view和暂停状态记录。
- NOT_EXECUTED：正式画笔、实机静态视觉、12秒连续动态、玩家、Hex、移动路径、阶段/擦除/历史、清除保护。
- NOT_EXECUTED：压力、弱GPU、长时稳定性及生产。

## 首次实机尝试与停止点

本轮Node13388于14:28:58启动。独立保护在14:56:01停止该进程（约27分钟），端口释放。创建了三个测试Scene后尚未完成绘制即到达时限；没有自主重启来拼接运行。原active仍为k0tDQjWqrbvHbjdu，最后确认paused=true。最后view为临时Square，尚待恢复/清理。运行输出捕获长时间未结束，期间对进程和监听做了独立核对；不能将工具等待误认为已完成测试。

待通过Foundry正式接口清理以下本次对象（owner=flooding-20260909）：

- or5SYIy67l8ifsZ0 — Square
- 3tlxXIAQBwYIWRCx — HexRows
- 14hRSm91xELZiBkZ — HexCols

已向用户请求一次额外最多15分钟的本地验收/清理运行；授权前不重启，不直接编辑世界LevelDB。没有提交、合并、推送或生产部署。

证据目录：`C:/Users/Administrator/.codex/visualizations/2026/09/09/01a0843e-d848-7653-90c7-311e93f0dab6/flooding`。
