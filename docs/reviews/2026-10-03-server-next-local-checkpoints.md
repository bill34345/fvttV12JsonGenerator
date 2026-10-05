# ServerNext 累积成果：本地提交检查点

日期：2026-10-03。用户要求先做commit，不再让迁移工作树长期累积dirty。本轮只授权并执行原迁移分支的本地提交，不合并、不push，不从其他worktree移动master，也不执行任何Foundry安装、数据修复或服务操作。

工作树为`I:/OpenCode/fvttV12JsonGenerator-worktrees/20260919-151319-server-next-migration`，分支`codex/20260919-151319-server-next-migration`。接手基线为`61974058f1af4e0f70fc675a0c856cae07d99a8f`、273个状态路径、空索引。主工作区另行只读核对为`a6cbd37dcaaf367ce11bd8e999a4d1445d8ce4ce`且干净；它不参与这些提交。

## 提交边界

| 本地提交 | 内容 |
| --- | --- |
| b6ec1ad | 有保护的Next自有模块安装入口、历史玩家物品修复、血猎来源metadata公开边界、种族/雅灵投影及对应记录 |
| 493f21d | 历史6.0.2/local.9 Midi独立补丁、工具、回归与原实机证据；测试固定来源修复 |
| 0c91e70 | 外部候选、DAE阶段/合集模板保护、不全包6.0.5适配、来源索引与对应专题记录 |
| 配套文档提交 | 唯一进度表、其余历史调研/边界、手册条目、人工review与生成HTML |

这些源码检查点保留当时6.0.2和现在6.0.5的区别。旧合同和安装器不因入Git而得到执行授权；不全包本轮已接受的来源、限定UI、重载和精确清理不因提交重跑。手册页面目视按用户决定延后。

## 提交前核查及必要修复

已按归属和依赖检查全部拟提交路径，显式路径列表分组暂存，根package.json按脚本所属组分段暂存。凭据特征和非loopback IP URL筛查无命中，未纳入完整Foundry安装、运行中数据库、原始浏览器资料、商业包源码、upstream ZIP、dist或.local。固定索引和候选报告属于审计证据，原版本与本机路径不伪改为可移植发布身份。统一diff所需的空格/Tab及一份既有注册输入的终止空行，通过精确.gitattributes条目保留，不格式化已接受的字节输入。

classpack原构建把历史candidate-report.json当新输出，入Git后会阻止新checkout构建。现在新报告写到ignored dist/candidate-report.json，读取优先新报告并核manifest/runtime/baseline SHA；历史报告保持原字节，已有候选或新报告继续拒绝覆盖。新增路径/拒绝检查，不重新构建或修改已安装候选。

历史Midi测试原来直接读当前ServerNext的dnd5e.mjs；升级到6.0.5后，原6.0.2 SHA门正确拒绝，首次得到73PASS/16FAIL。现在只从[官方6.0.2分发包](https://github.com/foundryvtt/dnd5e/releases/download/release-6.0.2/dnd5e-release-6.0.2.zip)取得所需的单个源文件作为ignored测试输入：archive SHA `634eb3a71493ce6c17ac4ffe312c2f4b839a220ff3d1c4980d70cbcbd4fb6b11`，dnd5e.mjs仍强制原SHA `e9570927a215948fb3a3923a322c7bbf1455009565f48813168edd8c6df4890f`。没有改预期版本、跳过断言或改运行系统；修复后96PASS。

DAE说明同步区分原发布输入与实际包含两个补丁的候选，补充合集模板守卫及已有本地输入前置，不误称当前安装仍是原始文件。

## 实际检查

| 检查 | 结果 |
| --- | --- |
| bun run test:foundry-ops | 403 PASS，使用项目隔离包装器 |
| bun run midi-qol:test | 固定输入修复后96 PASS |
| bun run test:classpack-next | 构建报告路径修复后42 PASS |
| bun run test:homebrew-species | 41 PASS |
| bun run test:eladrin-adoption | 6 PASS |
| architecture-source-scope聚焦测试 | 3 PASS |
| DAE phase / compendium guard | 9 / 4 PASS |
| external baseline / Item Piles / Vision + Item Macro | 4 / 14 / 9 PASS |
| typecheck:tools / typecheck:packages / typecheck:foundry-modules | PASS |
| architecture:verify | 依赖边界与cycle检查PASS |
| agents:generate / agents:check | 无backup生成；32项分层/幂等检查PASS |
| handbook | 人工核受影响条目后生成并check；页面目视继续用户延后 |

检查使用本机Bun1.3.8和已固定的本地源码/候选缓存，不宣称Bun1.3.14 CI环境或没有准备输入的新clone直接通过。未跑全仓ci:verify、生产、长时或新的Foundry E2E。已有真实接受以各原始收据及唯一迁移总表的版本/场景边界为准。

提交完成后用git log/status和主树只读检查确认结果；机器收据保存在忽略的.local/commit-checkpoint-20261003中，不为填写本文档自己的commit SHA再制造dirty。后续仍从实际HEAD创建新的运行合同，不重放绑定旧HEAD的合同。
