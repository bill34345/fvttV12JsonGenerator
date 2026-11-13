# 血猎手 2024：来源、构建与公开范围

项目的本地构建使用固定的 BloodHunter2024 enriched JSON。来源元数据将 2024 改编记为 SnowWolf，将转换记为 cloridon；原版血猎手由 Matthew Mercer 创作。英文 2024 改编、转换后的中文数据及本仓库的自动化代码是不同产物。

- [SnowWolf 的 Homebrewery 原稿](https://homebrewery.naturalcrit.com/share/fcV-yiDorwjY)及[作者发布帖](https://www.reddit.com/r/criticalrole/comments/1j1g1qm/no_spoilers_the_blood_hunter_2024_a_rebalance_of/)列出改编与原作署名。作者公开阅读和下载的文档不是构建器所需的 enriched JSON。
- [Foundry 玩家与改编作者的交流](https://www.reddit.com/r/3d6/comments/1ouqglq/vampire_blood_hunter/)记录了该改编在 Plutonium 中可用，以及玩家报告成功建卡。作者对此表示肯定；帖子没有给出本项目中文合集或 ZIP 的再分发条款。
- [DanCDavies 的公开 Foundry 模组](https://github.com/DanCDavies/foundryvtt-bloodhunter-2024)提供另一份 2024 适配的预构建包，并区分构建代码与游戏内容。它未使用本项目的锁定中文来源，不能作为这个 ZIP 的许可。
- [D&D Beyond 的 Mercer 原版](https://www.dndbeyond.com/classes/357975-blood-hunter)标为合作内容；[DMs Guild 授权说明](https://help.dmsguild.com/hc/en-us/articles/12776887523479-Dungeon-Masters-Guild-Licensing-Information)区分平台内授权和 SRD 开放内容。

本次范围为自动化源码、构建器、引用元数据及可复现测试。完整规则源与生成的职业、子职和特性合集不随源码提供；构建需要已取得的匹配 enriched JSON，不能直接输入原作者 PDF 或 Homebrewery 页面。构建输入、哈希及流程见[模块说明](../../foundry-modules/fvtt-blood-hunter-2024/README.zh-CN.md)。若以后考虑提供预构建包，须复核对应该 ZIP 内容的许可和署名范围，并重新核对实际归档清单。
