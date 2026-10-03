# Universal Battlemap Importer：官方V14支持与系统依赖

日期：2026-10-02。用户要求核对官方是否已经适配Foundry V14，以及是否需要另做dnd5e6适配。本轮仅公开来源和本机包只读核对，不安装或运行地图导入。

## 结论

用户的判断有官方声明与实现依据。6.1.1是官方V14包，未限制游戏系统；不需要为它另造dnd5e6内容适配分支。Next安装、启用/重登和新增错误检查属于后续接纳步骤，本轮未执行；官方声明不代替实际地图导入接受。

- [Foundry官方模块页](https://foundryvtt.com/packages/dd-import/)列出6.1.1为Foundry14–14、Verified14。
- [固定6.1.1清单](https://raw.githubusercontent.com/moo-man/FVTT-DD-Import/6.1.1/module.json)的minimum、verified、maximum均为14，没有relationships.systems或dnd5e版本门。
- [固定版本README](https://raw.githubusercontent.com/moo-man/FVTT-DD-Import/6.1.1/README.md)说明从DungeonFog/Dungeondraft/Arkenforge/AutoWall导出Universal VTT文件，经Scenes目录入口导入地图。
- [6.1.1发布说明](https://github.com/moo-man/FVTT-DD-Import/releases/tag/6.1.1)记录大地图导入失败修复和进度条；固定提交为3c78eb1b640f00b9bc9b3e30382ebbd03ee374ba。页面相对发布日期不作为精确年份证据。
- 本机Mirror已装6.1.1，清单与上述字段一致。实际ddimport.js使用Scene.create、WallDocument、门/灯光等Core数据，未见dnd5e/game.system/Actor/Item特定接口；系统无关是这一路径的源码判断，不是所有组合的运行保证。

## 当前层级与后续最小检查

10月2日此前真实审计：线上启用6.1.1、Mirror当前matrix未启用、Next未安装。静态官方支持成立；Next包接纳、实际导入及持久化未执行。没有把Next的缺席解释为dnd5e6不兼容。

若后续纳入Next，沿用未经本地修改的官方包与现有正常安装/启用流程。按既有验收口径核包、依赖、模块登记/启用、普通重登新增错误；用户要求实际导入时再用本任务可追踪临时Scene与最小UVTT输入检查墙、门、灯光、网格和图片路径，结束清理本任务对象，不改既有Scene。最小反证是Core14.368下模块未登记/初始化出错或正常入口导入失败。

本项不需要本地化或新实现候选，待办仅为是否接纳Next及相应正常加载检查。没有安装、升级、Scene写入、服务操作、备份或额外实例。

## 数据来源

本轮AnySearch成功读取上述官方模块页、固定tag清单/README及发布页；本机实际来源为F:/FoundryLab/foundry-v14/data/server-mirror/Data/modules/dd-import/module.json与ddimport.js。状态证据复用[三环境实时对账](2026-10-02-servernext-live-modules-comparison-and-wall-tools.md)，没有重新开生产审计页或重放清单。
