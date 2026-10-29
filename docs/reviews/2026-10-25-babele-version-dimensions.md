# Babele目录：系统、规则年代与Foundry Core声明

2026-10-25，输入仍为1.0.194本地包SHA-256 `17d6a6dfd381d55551d6ecdc7bbf284a2f01a2741ed38ddab95daeb7287b11bd`。用户明确要求区分dnd5e系统版本和2014/2024规则，再补充FVTT官方支持/验证版本；本轮只增强离线目录，没有更换补丁或操作Foundry。

## 已核事实与边界

99目标取得92份公开manifest、1份本地manifest、6项未知。92公开清单有81个标准dnd5e系统声明，其中16个只给系统ID；9个未声明dnd5e、1个非标准结构、1个系统本身。目录最终有数字范围66项，包含1项本地来源；未给范围25项，其余为非标准1、系统本身1、未知6。

根据[Foundry官方模块说明](https://foundryvtt.com/article/module-development/)，顶层compatibility用于Core，系统关系声明中另有系统compatibility。最低、已验证、最高字段分别保留；缺上限不推出无限兼容，声明也不当成本轮运行验收。

Core官网Verified统计：14代72项、13代13项、12代7项、未标明/未取得7项。7个目标的官网与清单verified原值不同，两处并列，不选择较高值覆盖。完整逐项目证据在独立项目docs/catalog/version-metadata.json。

## 需要保留的反例

- [CPR1.5.51](https://github.com/chrisk123999/chris-premades/blob/1.5.51/module-template.json)分别定义2014与2024动作合集；其技术清单却是dnd5e5.2.5—5.9.9、Core13—13。规则年代不等于软件版本。
- [Crooked Moon](https://foundryvtt.com/packages/the-crooked-moon-2014)当前原站为双版，但本地9个译文目标全是tcm2014，不能升级成译文双版覆盖。
- [dnd5e6.0.6](https://github.com/foundryvtt/dnd5e/blob/release-6.0.6/system.json)同时有Legacy/SRD5.1和Modern/SRD5.2合集；[官方SRD说明](https://www.dndbeyond.com/posts/1949-you-can-now-publish-your-own-creations-using-the)给出对应规则系列。
- Bloodpunk导出同时有system.source.rules=2014/2024，_stats.systemVersion却均为5.1.9。后者只是文档保存信息，不作兼容范围；前者嵌套字段次数也不当作独立实体数。
- [Crystal Chaos](https://foundryvtt.com/packages/crystal-chaos)1.0.1的Core最低/verified均14，但不写dnd5e范围。本地21法术在6.0.6中的既有结果单列，未扩大成整包或所有系统版本的支持证明。

## 规则分类

本包/目标明确证据为2014四项、2024六项、并存四项，其余85未锁定。原站当前产品声明为2014五项、2024十四项、双版/双兼容四项、泛称5E七十三项、其他两项、未知一项。两种筛选分开。

官方商城现行特定徽标5e/5.5e的映射依据[官方规则标签说明](https://www.dndbeyond.com/posts/1804-start-playing-today-with-the-2024-d-d-free-rules)；没有把这一规则扩展到第三方通用“5E”文案。新版Grim Hollow等原站2024声明不自动绑定旧译文。Faerûn、Eberron、Borderlands等原站未取得明确年代文案的继续保留未细分，没有按出版时间或版权年份猜。

本次没有新增引入推荐、改变已有模块健康状态或执行安装。后续复查先核原包版本与声明来源，再核译文是否绑定同一内容版本；本地规则证据绑定ZIP哈希，换包后未重核则停用该推断。

离线UI逻辑覆盖99条版本信息和617份逐目标文件；浏览器file协议拒绝仍有效，真实浏览器/窄屏/打印未执行，未换通道绕过。生成器的数据读回和新版本筛选检查见独立项目本轮取证目录。
