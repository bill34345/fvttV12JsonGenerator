# H3 模块状态与 Deck 可选帮助契约

日期：2026-10-11。候选为Suite0.2.0与Deck0.2.0；运行目标仅既有ServerNext/Core14.368/dnd5e6.0.5，Forge使用的Mirror不参与。当前接受结果由[执行总账](../plans/2026-10-11-fvtt-suite-refactor/EXECUTION_LEDGER.md)维护，本文不因构建成功自动宣称实机通过。

## 精确来源与事实

- Core14.368本机`client/game.mjs:629`以返回的module数据构造`game.modules` Collection；`client/packages/module.mjs`把`active`设为只读布尔属性。状态读取只用Collection查找、active及安装版本，不修改module记录或读取持久设置。
- 已接受的H2 ApplicationV2生命周期继续适用。模块启停通过Foundry原生管理及页面重载生效；“刷新状态”仅重读当前客户端的模块表，不替代重载。
- Suite公开帮助接口增加`apiVersion:1`。这是帮助契约版本，和module自身0.2.0版本分开。消费者检查module存在/已启用、api.moduleId、apiVersion及openHelp函数后，调用稳定entryId。
- Core的render返回不代表调用方权限门已经成功；Suite与Deck帮助在render后继续复查GM。后备帮助恢复最小化并置前，避免重复点击留在旧窗口后方。

## 本批边界与反证

| 边界 | 实现 | 能推翻假设的检查 |
| --- | --- | --- |
| 视图与宿主 | shared reader只接收纯状态快照，不获得Foundry对象；standalone不查询状态 | 多root、非模块条目、静态宿主均不访问状态端口；刷新不换文章节点/滚动、URL/title或存储 |
| 安装状态与功能支持 | 已启用/未启用/未安装/未知及实际版本独立呈现，功能适用范围继续来自人工说明 | 缺失/异常记录保留未知，未知版本不能被当作已验收版本；API和设置写调用均为零 |
| Deck可选帮助 | 正确ABI打开Suite的open-session-deck条目；缺失/停用/未知ABI/打开失败改用随包只读窗口 | 实际停用Suite并重载后Deck仍打开本模块帮助；再启用后正常定位统一条目；非GM不能进入后备窗口 |
| 单一正文 | Deck docs/manual.json是唯一可编辑条目，中央modules.json只保留source；本模块帮助和合集投影读取同一记录 | owner/路径/覆盖/重复ID拒绝，源文件变化使review失效；构建和真实帮助正文一致 |

Deck不导入Suite私有源码，不增加Foundry硬依赖、第二个世界连接或新的业务命令。帮助不调用Deck的openPanel/openPopout，不保存lastOpenMode，不写Actor/Combat或settings。正常打开Deck的既有偏好保存属于验收准备，须与帮助观察区间分开并按原值恢复。

## 来源与后续复查

精确本机Core为本次接口结论依据；[官方V14 Module API](https://foundryvtt.com/api/v14/classes/foundry.packages.Module.html)仅作导航，H2已核实的窗口契约见[ApplicationV2记录](2026-10-11-suite-handbook-v14-application.md)。本批未引入外部模块、内容或新的本地化候选。

新Core复查module.active/数据表及ApplicationV2契约；新帮助ABI复查双方能力检查与独立后备。实际模块版本和状态不能自动提升旧业务接受范围。源码调查、构建、安装、客户端状态、真实行为和清理分别记账。
