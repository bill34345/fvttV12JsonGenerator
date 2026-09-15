# Forge 角色、召唤物与战斗宏整包导入

状态：静态候选和本地 server-mirror 整包导入/启动/原生齐射召唤/刷新后重启验收PASS。用户于2026-09-13授权补上整包导入与启动入口，并明确使用本地镜像测试、沿用外部Chrome；沿用Provider/model配置，不将用户常用的模型别名硬编码为服务端ID。未提交、合并、推送或生产部署。

## 产品结果

Forge Intake增加独立的战斗包入口，支持源数据、相关Actor、宏、图片和绑定关系。导入文件后只解析和重新生成预览；确认清单和宏后才创建世界文档。创建后显示各文档入口及“启动战斗控制”，宏不会在选文件或导入时执行。刷新后保留世界宏，并提供重新找到/启动的入口。

## 契约与权限

- 新契约fvtt-json-forge-encounter v1；JSON或仅含encounter.json的标准ZIP。与历史Review Bundle和Batch Collection严格分离，不把历史accepted记录伪装为可创建response。
- Actor只携带来源及hash，在当前浏览器通过正式workflow重新生成。失败、未知诊断和来源警告阻止导入；仅明确的gm-assisted/external-rule提示可进入整包GM审核，且每项必须有明确的配套宏coverage。原单Actor/Item accepted-only入口不变。
- 宏代码与hash、actor bindings及说明独立显示；创建Macro不执行代码。GM单独启动时再次检查宏身份和绑定，使用当前世界的确定性Actor UUID。包本身的声明不等于代码安全证明或AI语义通过。
- 图片限定已校验的PNG/JPEG/WebP，上传至内容哈希命名空间；现存文件hash不同则拒绝覆盖。
- 所有文档采用包id+类型+逻辑key确定性ID；相同未改变结果可复用，冲突不覆盖。提交前全面预检；失败只清理本次新建文档，报告部分成功和浏览器崩溃边界。

## Owner与实现

- packages/forge-browser-runtime：严格包协议、ZIP和正式生成预览。
- foundry-modules/fvtt-json-forge：世界文档创建、绑定、回读、明确启动及Intake入口。
- 工具：构造晶血龙兽样本包；复用上一任务正式来源与已验收宏。复用4个通用源码文件的必要修正，另修正behavior duration的JSON序列化，共5个通用源码文件；旧worktree保持不变。

本增量遵守Forge browser-first架构；不引入后台服务、全局凭据修改或任意脚本自动执行。与Task E历史accepted-only来源库/队列的边界保持独立。

## 验收

机械：协议/ZIP篡改及越界、引用和hash、失败来源、缺失coverage、导入不执行脚本、创建/回读/冲突/并发/部分失败、启动前身份复核；现有Forge回归、类型/构建、通用生成回归和anti-overfit。

语义：外部Chrome、本地14.364/5.3.3 Lab，用晶血龙兽包从Intake入口预览并创建两Actor和宏，核对图像、绑定；重复导入不复制；启动后原生齐射自动召唤/先攻；刷新后能明确重新启动。仅运行一个受25分钟保护的Lab窗口，清理新建文档、恢复原场景与暂停状态。生产与長时不在本次范围。

## 当前实现和检查结果

独立worktree：`20260913-021943-forge-encounter-import`，基线master 3d7c332。包协议由一个Terra XHigh worker完成，父代理完成正式预览、世界adapter、Intake入口、规则/图片/源码预览和明确启动。服务端实际模型元数据未提供，OBSERVED_METADATA_UNAVAILABLE。

- 新入口：Forge Intake中的“战斗包导入 / 启动控制”；显示主/配套Actor、HP/AC/CR、来源Markdown和生成JSON、宏代码、来源派生的5项GM/external规则、图片文件名/hash/绑定；导入结果提供打开Actor和启动宏入口。
- 正式源码生成保留needs_review，只有明确且完整绑定的配套规则可进入独立GM包审核；原accepted-only路径没有放宽。
- 启动复核命令hash、绑定key/UUID、Actor版本/kind/归属和机制marker。文件名拒绝URL分隔含义的%/#，扩展名与MIME一致。创建/删除被hook取消、意外ID、部分失败都按实际结果核对并报告。
- `bun run test:forge-encounter`：PASS，48测试/274断言，已通过hermetic wrapper；既有`test:fvtt-json-forge`回归PASS，204测试/2040断言。
- 独立最终复核及实机发现后的窄修复复核：PASS（静态门禁）；运行时证据见下文。
- `typecheck:packages`、browser-runtime类型、Forge模块类型、`typecheck:tools`：PASS。
- `architecture:verify`：PASS，依赖和循环检查均通过；`audit:anti-overfit`：PASS，7个变更源。
- `references verify`：PASS，锁定dnd5e5.3.3；`agents:check`、`git diff --check`：PASS。
- 模块build/release：PASS，0.2.0 manifest、package、7文件归档一致；`verify-release:fvtt-json-forge`：PASS，1测试/9断言，重复构建字节一致。
- Bun1.3.8的lockfile-only未刷新纯workspace版本元数据；仅同步bun.lock内本模块0.1→0.2这一行，未改变依赖解析。随后`bun install --frozen-lockfile`PASS。
- 样本包由当前`build-example.ts`重建：2个Actor来源、1个绑定宏、1张图片；package hash `7a64668a7d74658117689eeab864c162951bbec2a067ae3a0a58b77cc4fa198c`。preparation.json包含5个结构化要求对象，不再使用旧的字符串摘要。

## 本地实机验收结果（2026-09-13）

用户连接外部Chrome后，在同一浏览器中完成测试。目标为`F:\FoundryLab\foundry-v14\data\server-mirror`、世界`cor-cotn`、Foundry14.364/dnd5e5.3.3、端口30001、PID46692。运行从10:41:52至11:02:46，约20分54秒，25分钟机械保护未触发。只安装Forge的7个候选文件，不创建备份；记录每次替换前后SHA-256。本地保留0.2.0模块，服务已停止，端口释放。

- PASS：Intake按钮打开战斗包窗口；通过原生文件选择器选ZIP，正式生成两Actor，显示HP/AC/CR、图片绑定和5条GM/external规则。预览后世界角色/宏数量不变。
- PASS：确认后实际FilePicker上传并哈希回读图片；创建Actor.4ffe914190ff8157、Actor.a8139b242e679eef、Macro.9dcb48629e517e2a。创建宏时runtime仍为null，没有自动执行。
- PASS：重新预览/确认相同包，3份文档均为existing，没有重复创建。
- PASS：点击启动后runtime为2.1.0，绑定签名为上述两个Actor UUID。
- PASS：在独立临时场景摆放龙兽和测试目标，从原生角色面板点击晶片齐射。真实体质豁免总计4，失败；目标HP200→188，传奇动作spent0→2。自动生成Token.vqLv0aqNjnHNm4gW，Actor绑定为晶体，加入测试Combat.hlGXujgG3DFjBAHr，先攻17.1；场景Token数2→3，战斗成员2→3，生成时未立即戳刺。
- PASS：刷新后两Actor和宏仍存在、runtime回到null；不重新导包即可从列表启动，恢复2.1.0及正确绑定。
- PASS：停止runtime，清理测试的3个Actor、1个宏、1个场景、1场战斗、4条消息和上传图片；逐项文档ID集合与原基线完全相同（283Actor/90Macro/64Scene/10Combat），恢复原查看场景和paused=true。

实机修复：Foundry原地清洗嵌套flags，因此提交可变JSON副本，保持审核计划独立以便回读；锁定版本的movement/init FormulaField数字转精确字符串，未设置的movement null允许原生缺省；仅移除历史skills.value空数组元数据。其他形状、实际数值漂移仍被拒绝。失败时世界新文档清理已实际观察，正式artifact保持不变。

证据位于本worktree的`.pui/encounter-live-evidence.json`、`encounter-refresh-evidence.json`、`encounter-cleanup-evidence.json`、`encounter-summon.png`、各次install记录和Lab日志。初次浏览器调试连接中断后使用同一外部Chrome恢复，没有改用内置浏览器。

最终交付ZIP SHA-256：`e539c7f57551376cc6812194aadae786d86d518a6708665af289fe7c99c5edf5`。根目录与模块目录启动Bun构建会产生136行来源路径注释差异，已逐行确认仅注释不同；最终从与实测相同的模块目录打包，bundle SHA-256与实测安装完全一致：`0b2aca1cabaadfe7a9f1c96ff979dab7ebb5c154f62b6b747b50d809c5c6345b`。没有用未测试的可执行代码替换验收版本。

边界：本轮测试的是整包导入、绑定和自动召唤链路，没有调用dsv4.1flash/5.6lunamax，也未新增自由文本生成任意配套宏。当前镜像启用75模块；失败豁免后观察到两条恍惚效果记录，尚未定位是否由现有自动状态模块叠加，未改变其他模块或宣称所有战斗效果组合已验收。生产、发布和长时验收均NOT_EXECUTED。
