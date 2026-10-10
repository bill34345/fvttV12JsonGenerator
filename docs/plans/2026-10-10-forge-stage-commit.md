# Forge 本阶段本地提交

**收尾状态：必要门禁通过，随本地阶段提交保存；不合并master，不推送或发布。** 提交身份以当前分支中包含本记录的Git提交为准。本阶段保留继续优化空间，不将本地接受提升为生产或全版本接受。

用户于2026-10-10明确授权：“把这阶段的改动整理好，跑完必要检查，连同手册一起提交、先不要合并到master，目前还有很大优化空间。”本次只在现有`codex/20261006-111625-bettermonsters-eye-deep-sample`保存阶段提交；不合并master，不吸收其他分支、不push、不发布、不重启或重新部署Lab，不清理工作树。

本阶段范围为当前唯一候选工作树中连贯的Forge/Custom Conditions增量：真实怪物来源接入及其parser/generation修正、特殊机制与GM承载、中文翻译/术语及双语绑定、内置十页图解和受审示例、十四原生状态生命周期、世界组合状态与来源快照、流血及中英文语义规范化。对应测试、来源fixture、公共exports、锁文件、README/runbook、执行/接受记录、工具手册数据/人工review与生成HTML一起提交。`.local`原件、私有截图、运行日志、凭据、构建目录不提交。

开工核对：候选HEAD`6a7845650a04b8a78b458e5edd5f74fb2bb35ab3`，候选索引为空；主区master HEAD`15b4a5b05b5150167f4a73418352f8ad18937c3c`且索引/工作区clean。仅保存路径与SHA清单于`.local/forge-stage-commit-20261010/`，不制作备份或覆盖原成果。只按核准的精确路径清单暂存，不使用全区add。

本次为完整阶段提交边界，涉及共享parser/generation/Intake/browser/runtime，需补离线整合检查：`agents:generate/check`、受控`ci:verify`（类型、架构、全仓测试/覆盖率、anti-overfit、手册、参考和离线正式生成），以及guide示例通过正式prepare核验。测试使用Bun1.3.14、随机CI沙箱和去除provider凭据的环境，保留持久Lab。既有真实来源、中文绑定、状态/流血/四语言与GM反例、恢复的有效证据不因提交重放。

独立静态审查核对了promotion/独立审核、翻译身份、active GM与配置指纹、公共exports及示例ZIP，未发现高置信度新增阻断问题。两个示例ZIP仅含encounter.json，HTML无脚本、链接指向包内下载或锚点。此前视觉与实机接受继续按原收据范围复用，不把本次有重点静态审查称为全部旧代码逐行审计。手册内H:/Download示例是明确要求替换的CLI路径，不是凭据或真实生产目标。

开工状态为CHECKING，现以顶部收尾结论为准。提交前记录检查结果、精确清单、保留差异及分支边界；提交后核对HEAD、提交树和主区基线。后续优化在本分支继续，合并/推送/发布等待新的明确授权。此前各日期接受记录中“未提交”描述是当时状态，本记录是此次保存授权的当前入口。

R1的agents生成/检查、沙箱/隔离、手册及production类型通过；完整CI在typecheck:all发现11个本阶段测试文件存在结果联合类型、可空项和JSON值未收窄，尚未进入全仓覆盖率。仅修测试守卫与局部夹具类型，保留原断言及业务代码：根负责5文件39项396断言、独立worker负责6文件50项468断言，均通过。为验证该修正并补R1未执行的后续门禁，运行新的完整CI R2；不重跑有效实机。两个随包guide示例已从ZIP经官方prepare重新正式生成通过，原macro为固定入口、assets空，结果在本次local记录。

R2进一步揭示两文件三处JSON items数组未收窄，仅补真实Array.isArray守卫。随后单独`typecheck:all`通过，再进入R3整合检查，避免在同一个类型问题上重复完整流程。147个精确候选路径经过范围与已知凭据字面值检查，未含.local/dist/coverage/凭据；原index空，主区仍原HEAD且clean。暂存只采用这份逐路径清单，随后CI的仓库hygiene包含新增文件。

首次索引空白检查发现ReportLab的ASCII85 PDF被全局diff-as-text规则当作文本，xref行的必要空格报错；未改PDF原件，给该精确guide.pdf加仓库binary属性以保持字节，扩充清单至148路径。另清除native目录源码末尾多余空白行，只有格式变化；需更新受影响手册指纹，业务逻辑与已验收运行机制不变。R3尚未启动即被该暂存检查拦截，修正后再执行完整离线门禁。

R3完成所有类型、架构、session-monitor构建与CLI检查；全仓覆盖率实际跑437文件/4125项，4108通过、1既有skip、16失败及5加载错误，332.92秒。失败集中于旧Next/Midi的ignored锁定输入缺失，不能报告全仓PASS。当前候选早于主区的自动输入库发现增量，不合并主区；按已有runbook显式传`FVTT_LEGACY_NEXT_INPUT_ROOT`，只读复用主区已准备的`.local/legacy-next-test-inputs/data`。使用主区既有工具的read-only check核170文件/220267059字节、catalog `b463b195576d7d492773ebf78847cdccc34d038339970a264749eaadb8a275ec`，不复制、下载、安装或修改该库。提供既有`FFMPEG_BIN`路径后，先窄验历史输入相关检查，再补全仓单进程覆盖率及R3未执行的后续门禁。保留R3原始失败与已通过静态检查，运行参数只在本批子进程，不写全局环境。

窄验第一步发现旧local runner在Windows以大小写敏感键读取PATH，子进程丢git/tar/python。仅修本批local续跑器的Path/ PATH合并并使用公共max-concurrency1入口；Midi96项通过。Classpack另有真实历史输入适配问题：测试把tracked报告随ignored候选路径一起迁移，导致报告缺失。只修candidate-report的可选候选目录参数及离线测试读取位置，默认行为保持；将两处LevelDB读取放到本次随机临时fixture并验证原库文件身份，不直接打开保留库。此两文件属于必要检查适配，清单扩充到150路径；未吸收主区其他功能或合并master。

适配后Classpack公共入口42项/366断言通过，原库身份保持；PDF与两示例ZIP的索引Git blob等于原始文件字节，二进制属性生效。因新增两文件的检查适配，续跑先复核typecheck:all/architecture，再跑全仓单进程coverage及后续anti-overfit/hygiene/reference/Web/offline smoke；其余R3通过类型和静态检查复用。Forge最终bundle与实际已验收安装SHA仍同81f28e4e6d6600893ab321288d80982b0d706d37a61f7a11b71aaed47c2dc796，故不产生需要新Chrome回放的产品变化。

## 最终检查与提交范围

- `agents:generate`/`agents:check`通过，生成的AGENTS与原根文件一致，34个必需说明有效。
- R3已通过production/packages/apps/Foundry modules/tools类型、architecture与session-monitor构建；新增检查适配后R4再次通过`typecheck:all`和architecture。没有缩小生产类型或测试范围。
- R4公共`test:coverage`：CLI24通过；完整单进程437文件、4191项，4190通过、1项原有skip、0失败，322.19秒；生产行覆盖率86.54%、函数87.25%，全部阈值通过。
- `audit:anti-overfit:all`通过448来源；仓库hygiene通过2292个当前索引路径；dnd5e5.3.3及已登记current6参考校验通过；Web构建通过；White Tusk Shaman离线正式Actor smoke含6个来源Item、0 verifier warning、0网络调用。
- guide两份受审示例ZIP经正式decode/prepare通过，PDF和两ZIP在Git索引中的字节与原件相同。最新业务bundle与实际已接受Lab安装一致；既有来源/视觉/玩法及恢复证据按其原目标范围复用。
- 最终精确清单150路径，包含阶段功能、测试/fixture、公共exports/锁文件、图解与示例、说明/验收记录及生成工具手册，另含PDF二进制属性及两处历史输入检查适配。已知凭据字面值检查未命中，.local、私有原件、构建产物未暂存。索引空白检查通过。

完整CI R3保留原失败标签，不改写为成功；阶段门禁由R3有效静态检查与R4在已核验只读输入库中的完整单进程测试/后续门禁共同闭合。命令、退出码与来源身份原件在`.local/forge-stage-commit-20261010/`，包括`ci-r3.log`、`remaining-ci-r4.log`、`remaining-checks-result.json`和`candidate-audit.json`。显式历史输入根及FFMPEG配置仅本次进程使用，没有改全局设置、合并主区或运行/安装旧Next候选。
