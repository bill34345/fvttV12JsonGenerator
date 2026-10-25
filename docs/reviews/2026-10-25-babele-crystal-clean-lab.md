# Babele合并包：第三干净环境验收

2026-10-25。实际维护候选在 `I:/OpenCode/fvtt-babele-zh-maintenance-worktrees/20261025-next-acceptance`，详细进度与证据由该项目 `docs/clean-lab-acceptance.md` 拥有。本文件记录外部模块/版本事实和用户入口边界。

## 对象与分层结论

用户明确改为建立第三干净环境，现有Next与Mirror不动。新实例 `F:/FoundryLab/foundry-v14/data/babele-clean-v14`，用户地址 `http://babele-clean.localhost:30003`，实际监听127.0.0.1:30003；复用Core14.368和Node24.17.0，dnd5e6.0.6与Next相同。仅启用Crystal Chaos1.0.1、Babele2.9.1、libWrapper1.13.5.1、foundry_chn14.365与1.0.194本地合并补丁。

21法术实际API核对、5种原生Item说明/4个Effects页及召唤链接点击已有有效证据；独立中英文语义复核未发现新的实质误译。发现并修复1个世界Actor链接、4个效果图片和蓝宝石尘轮数说明。显示适配器单项实机复验通过：原生卡片30秒钟、正文5轮、原始数据0.5 minute；父代理已实际查看说明与Details截图。清理状态和完整证据以独立项目记录为准。

没有验收施法自动化、战斗应用、整本Adventure、所有618份上游译文、多人或长时运行。中文补丁上游manifest仍只verified13，不因本轮21法术通过而改称整个补丁正式支持V14。

## 精确接口事实

- [dnd5e6.0.6源码](https://github.com/foundryvtt/dnd5e/tree/release-6.0.6)，本机reference cache HEAD `87e94dbd9f930135e0694cd7e7d49f210603cd2c`。`module/utils.mjs`的formatTime默认0位小数；duration-field以此生成标签，spell-block.hbs显示该标签，导致0.5分钟显示1分钟。
- 同一版本中second不在可选scalarTimePeriods内，不能直接把数据改为30 second。Core14.368的ActiveEffect区分世界时间与战斗轮数，也不能把0.5 minute替换成5 round冒充等价修复。
- 本地适配器只匹配Core14/dnd5e6.0.6、精确法术来源、原始0.5 minute且非专注，修改渲染DOM的持续时间文字；不改Document或全局formatter。构建通过白名单新增脚本，不覆盖上游脚本。
- Babele2.9.1局部mapping在默认ActiveEffect mapping上合并，允许本合集补充img。结论来自本地精确加载源码、独立审查与实际4效果读回，不推断为任意版本行为。

Context7导航曾返回6.1.x页面，因此没有用它证明6.0.6行为。核心判断均回到精确本地Core14.368源码与dnd5e6.0.6 tag及实际界面。

## 反证与故障调查

曾遇第三实例返回设置按钮未关闭世界。两次原生入口无新进展后，停止重复点击，检查Core处理代码并进行有范围外部搜索。AnySearch读取的[2022年Forge原始报告](https://forums.forge-vtt.com/t/cant-access-setup/17712)涉及托管站点所有者/admin权限，与本机干净实例不相同，未采用其设置密码方案，也未将其作为本机根因。

本机通过正常登出、重新登录GM后返回设置成功；没有强杀活动世界或编辑实时数据库。此结果只证实该恢复步骤有效，不证明最初失败原因。

最终交付时原IP登录再次回Join。已核Core14.368的dist/sessions.mjs固定设置名为session的host-only Cookie；[RFC6265](https://www.rfc-editor.org/rfc/rfc6265)明确同主机Cookie跨端口共享，单独端口并不能隔离三个实例的登录。新实例日志反复创建会话，与该覆盖机制吻合；未读取实际Cookie值，未证明具体覆盖来源。改用 `http://babele-clean.localhost:30003` 后正常GM登录成功，刷新和最后交付以独立项目DOMAIN-ISOLATION-RECEIPT.md为准。[RFC6761第6.3节](https://www.rfc-editor.org/rfc/rfc6761#section-6.3)定义.localhost回环保留名；没有改系统hosts、其他实例地址或读取/修改Cookie。后续第三环境入口固定为此独立主机名。

## 待判断本地化与复查

本次没有新增待引入候选。保留三处源规则歧义：Crystal Blast示例伤害类型、Topaz Barricade“外壳”指代、Crystals & Mirrors伤害终止条件。均非新增误译，实际规则裁定需用户/上游澄清。

下次用户提出更新时：仅查询一次正式release，锁ZIP及哈希；通过维护项目三方合并；检查运行环境是否仍命中显示适配器守卫；新冲突逐项交用户决定，受影响内容再实机验收。没有后台监听、自动升级Next/Mirror或自动部署。
