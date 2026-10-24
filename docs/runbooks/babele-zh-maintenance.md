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
- 现有 Babele 2.9.1 的 315 项数据引擎检查属于旧独立包；新同模块 ID 合并包的构建读回不等于 Foundry V14 实机验收。

本仓库的手册只维护这一外部项目入口与操作边界；外部项目的实际实现、测试和交付记录在其自身仓库维护。
