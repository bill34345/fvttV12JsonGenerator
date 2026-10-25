# 中文 Babele 汉化维护入口

当用户在本 Codex 项目中讨论中文 Babele 补丁的上游更新、自有译文增补或合并安装包时，实际工作对象为独立项目：

`I:\OpenCode\fvtt-babele-zh-maintenance`

用户明确选择继续在当前 `fvttV12JsonGenerator` 项目里交流，不另建 Codex 项目。这里拥有路由与工具手册入口；独立项目拥有源码、译文、锁定状态、冲突计划、构建产物及架构。

## 接续步骤

1. 读取独立项目 `AGENTS.md`、`README.md`；涉及架构或范围时读取 `docs/architecture.md` 和 `docs/requirements.md`。
2. 在独立项目核对 Git 状态、当前 state 与 overlay；不把当前生成器仓库当作译文存放位置。
3. 用户只问现状时运行 status，只问有无新版时运行 check-upstream；明确要求更新时运行 update。没有后台监听或定时任务。
4. 无冲突自动合并；同处冲突输出三方值，按照用户逐项选择完成。维护版本仅在 ZIP 构建和读回完成后切换。
5. 报告实际上游版本、本地增补、输出路径与验证范围；安装进 Foundry、Git 提交、合并或推送依照对应明确授权执行。

## 从当前目录运行

```powershell
python -B "I:/OpenCode/fvtt-babele-zh-maintenance/maintain.py" status
python -B "I:/OpenCode/fvtt-babele-zh-maintenance/maintain.py" check-upstream
python -B "I:/OpenCode/fvtt-babele-zh-maintenance/maintain.py" update
```

入口默认按脚本位置定位维护项目，当前 cwd 不改变目标。精确参数及冲突决策文件格式以独立项目的 `--help` 与 README 为准。

## 当前基线与交付边界

- 初始上游 1.0.194，锁定 ZIP SHA-256 `abe1c245469b4a0f7dc9427c59ace8dbc1adcd92d9ba84891006112c6c1f9dcf`。
- 首个增补：水晶浩劫 Crystal Chaos 1.0.1 的 21 个法术，独立保存译文、来源和既有数据引擎证据。
- 按用户选择，自用包取消上游 manifest/download 更新地址，后续通过维护项目更新；包内保留原上游清单和来源。
- 原有 Babele 2.9.1 的315项数据引擎检查属于旧独立包。2026-10-25的新合并包已在第三干净环境 Core14.368 / dnd5e6.0.6 / cn中完成水晶浩劫21法术API和来源语义对照，并检查5种原生说明界面、4个效果页/图片及召唤链接实际点击。
- 第三环境为 `F:\FoundryLab\foundry-v14\data\babele-clean-v14`，用户地址 `http://babele-clean.localhost:30003`，实际仅监听127.0.0.1。独立主机名隔离多实例同名登录Cookie；只换端口不能隔离Cookie，无需修改hosts。仅安装水晶浩劫、Babele、合并汉化包及必要依赖；本轮没有安装、重启或改动Next/Mirror。
- 本轮修复召唤Actor链接、4个效果图片、蓝宝石尘30秒对应轮数，以及dnd5e6.0.6将0.5分钟显示为1分钟的问题。显示适配器只改指定来源的卡片文字，时长数据不变；系统升级后须复核守卫。
- 源文3处问题已由用户裁定：水晶冲击示例为2d4力场加2d6穿刺；黄玉壁垒统一墙体指代；水晶与镜像仅范围伤害结束。实际包与复验进度见独立项目 `docs/clean-lab-acceptance.md`，不能将首轮旧哈希的通过直接推广到新正文。
- 本次汉化验收不覆盖施法/战斗自动化、整本Adventure、上游所有译文、多人或长时运行；上游manifest仍verified13。

本仓库的手册只维护这一外部项目入口与操作边界；外部项目的实际实现、测试和交付记录在其自身仓库维护。

## 查看包内内容目录

独立项目根文件 `I:\OpenCode\fvtt-babele-zh-maintenance\中文Babele内容目录.html` 为单文件离线目录，包含当前包的99个来源目标，支持名称/ID搜索、类别/内容类型/发布方筛选、展开全部合集及打印。官方/第三方分类、原始导出格式和实机验收范围分别标明；统计口径及重建命令见独立项目 `docs/catalog/README.md`。页面来源日期和ZIP哈希指明具体快照，不承诺持续更新。

版本栏分开显示dnd5e系统最低/verified/最高、2014/2024规则证据、FVTT官网支持/Verified及原包Core清单。另有本包规则与原包当前规则的独立筛选；两处Core声明不同会同时保留。未声明、非标准声明和未取得清单分别标明，不能从缺失上限或官网声明推断汉化快照已验证兼容。
