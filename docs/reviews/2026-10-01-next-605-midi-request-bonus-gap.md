# ServerNext6.0.5：Midi-QOL请求检定／豁免来源加值缺口

日期：2026-10-01。当前状态：用户已明确批准将两个请求处理器的修复、构建、限定部署和实机验收纳入本次。独立 local.10 候选类型／构建、限定安装、真实 Check／Save各+4以及精确清理全部通过；原十模块代表行为、重载和精确清理也通过。下文草稿／未授权文字记录较早阶段，不能替代本段当前状态。

实机活动类为MidiCheckActivity／MidiSaveActivity，owner STR修正3、target修正1；两次正常UI结果都是1d20+1，未重掷、未改结果。公开getRollData／BasicRoll.replaceFormulaData返回来源3，构造parts[@activityBonus]及data.activityBonus=3，所以来源数据和公式解析并未缺失。两个原生roll的prepared origin为ChatMessage对象，raw origin为card ID；已纠正工具关联并完成精确自有现场清理，行为FAIL与清理PASS分开保存。

实际已安装Midi版本为14.6.0-beta.4338eeab.local.9。安装midi-qol.js的#rollCheck（38778起）和#rollSave（38173起）覆盖dnd5e原生处理器，均没有读取check/save.bonus或向actor的roll配置传递bonusData；分别直接调用rollAbilityCheck／rollSavingThrow。与固定6.0.5的check.mjs:110–122、save.mjs:122起对比，覆盖链遗漏了来源加值处理。运行配置实际使用这些覆盖类，静态调用链和已保存+1观察一致；未进行禁用Midi的隔离实验，不声称整个Midi或Core故障。

窄修复稿只改两个请求处理器：先用owner的getRollData解析该Activity的bonus，再把parts/data放进原roll配置；保留Midi原有workflow、GM/玩家权限、rollMode和DC分支。草稿在本任务.local/next-605-restore/midi-proposal/，不向现有dirty上游源码或运行安装包直接打补丁。下一步若获准，应建立独立来源候选、保存local.9既有改动与精确构建身份，运行两handler对照、构建／类型门及正常UI+4/+4与精确清理验收；不升级Core、系统或其他Midi功能。

待判断本地化：是否将该现有本地Midi两个覆盖handler适配纳入本次。Manifest声明、脚本语法和模拟不能替代两次真实请求结果。当前94模块启用、49来源与无关ID保留的接受仍有效，组合Check／Save语义为FAIL。私有证据根为F:/FoundryLab/foundry-v14/evidence/server-next-migration/next-605-restore-20261001-4863dddb。

修复稿的可复核检查已运行：Bun对两份完整TS文件转译，并执行旧／新处理器body对照，公开公式helper的返回按实机诊断校准。旧handler均不传activityBonus，新稿传3／parts[@activityBonus]，ability=str、DC10和rollMode=public与旧版一致。它只证明参数传递边界；完整类型／构建、复杂隐私分支和部署实机尚未执行。稿子没有写回旧dirty Midi源码或安装包，等待用户是否增加该模块范围。原十模块批次已继续派发。

Core验证场景最终精确清理PASS：四个自有Chat、两个Actor和场景已删除，原Actor/Scene/chat/其他Macro集合与view/pause/control/targets恢复，49来源值保持。Core辅助Macro已缺席，旧升级Macro仍保留给主模块接受；原两次+1行为FAIL不因清理成功改成PASS。

## 已授权候选与可复核产物

候选为本恢复 worktree 下 `.local/midi-605-requests` 独立 checkout，基于 `4338eeab85041cd71b76ede36818e2265cbf06ae`；原 Next 的 dirty Midi 来源树未改写。原 local.9 的 DamageApplicationElementMidi／Workflow／patching 三份既有运行修改逐字节保留，package 两个文件除 local.10 版本／下载身份外与原 dirty 输入一致。两 handler 增量保存为 [2026-10-01-request-bonus.patch](../../references/third-party/midi-qol/patches/2026-10-01-request-bonus.patch)，SHA-256 `ad4563f27de869c334ff8bbde13ffbfe41b9809282cb9815d582f09fd0ae7ae5`；补丁不包含那三个既有 local.9 修改，不能把它单独当作完整部署包。

第一次 Gulp 曾打印6个 TypeScript 错误却退出0并产出 ZIP，已明确拒绝。补窄接口类型后，独立 `tsc --noEmit` 退出0、`gulp zip` 退出0；最终 local.10 ZIP 为3,118,400字节，SHA-256 `ddc75397b259d97a1f01d2cf7c18bed2b05d4e25150fbf18ad230cbdd90d9cf0`。父独立读取 ZIP 入口复算：JS为 `bc9a41c4b5ddf7de8f279f9f44524e1d68992a4b2181cb0f16b851362d4bbff4`，map为 `0db0f96169d27f833d602dc736abf2d5f394181f6944d47f60acc278dbf011b9`。两个 handler 的 source map 与候选源码一致；old/new body 模型证明 Check／Save 配置传3且保留 ability／DC／模式。这仍属于源码／构建证据。

ZIP有119入口，其中12为 packs；限定安装只允许 `midi-qol.js`、`midi-qol.js.map`、`module.json` 三文件，其他104 nonpack 文件与已装 local.9 相同。manifest 除 version/download 外完整一致。运行中读取某 pack log 被锁拒绝后没有重试或写入；pack 前后清单和SHA必须在正常 Setup／锁释放后核对。另四个已批准 House／Injury 中英文拒绝文案也纳入最终七文件计划，准备阶段 installedFilesWritten=0；不替换数据库或写 packs。

新验收工具 V4 明确要求 active Midi local.10，给 Check／Save Activity 显式 `_id`，沿用已纠正的 raw/prepared origin 关联和公开 TokenLayer 目标恢复。部署后分别走真实请求 UI 一次，预期 owner+3／target+1 的+4；记录随机骰与总值，随后精确清理和49来源读回。旧+1失败证据保留；目前该新实机门为 NOT_EXECUTED。

## 限定安装通过，实机仍待回执

十模块自有现场与两个临时 Macro 精确清理通过后，正常 Return to Setup；父独立 status.active=false、原PID39528／端口／app/data身份、Core14.368／系统6.0.5以及world／packs锁释放核对通过。只覆盖冻结的七文件，全部写后哈希一致，父再次独立复算七项0差异；三个相关模块所有 packs 文件前后 SHA 与数量完全一致，其他 nonpack 未变。安装收据 `midi-fix-install-receipt.json` 明确 `PASS_LIMITED_INSTALL_ONLY`，没有把它记为运行PASS。

V4再绑定原94启用ID与版本，仅允许 Midi local.9→local.10 的单项授权差异。最终冻结请求工具24,905字节，SHA `bd6036e6685054e1e2b568f0cfd1fc9e3b6ccb46feac6cb06d4fbb81674e9742`。已派正常原世界启动、真实 Check／Save各一次、原始骰值／总值关联及精确清理；旧十模块已过门不重放。此时+4／+4仍为待回执，不以预期值写实际结果。

首次V4存储读回在执行前遇纯行尾规范化：一处CRLF以及最终LF被编辑器规范，全文逻辑一致，但不冒充原hash相同。现场只有唯一Macro、无flags／fixture／Chat／roll。父源文件统一LF后重新冻结为24,904字节、SHA `35979f7b6d54e0ff873bcff0eb88cff91710c67c4820b47d86ca9fa9ebf1e49b`，同一Macro接续，仍允许单独记录编辑器省略末尾LF的保存hash。该工具问题不计作Midi语义失败。

## 真实请求与清理接受

同一新fixture的owner STR修正3、target修正1。正常Check请求卡 `cuqIzYSsim6LPAKd` 的真实target roll `bqLtyEmq0vjIplr1` 为 `1d20 + 3 + 1`、骰12／总16；Save卡 `l0bZdXBILjuYLU73` 的roll `mCdNFtT9esgIvTPz` 为同公式、骰20／总24。两次modifier均4且raw origin准确对应各卡；Check普通NORMAL／PublicAsUser对话实际投一次，Save正常按钮直接evaluate一次，没有第二次投、重掷、改公式或写结果。`midi-local10-actual-rolls.json` 20,330字节，SHA `9dca9d5c0e4e84a57929023e91f90889bdb5286a2d58dc3bde620e045ee9269c`。

实际active modules完整94集合，仅Midi版本为local.10，其他93版本与已接受原94一致；49来源值全部逐项相等。精确cleanup只删除新2NPC／Scene／Feat／4Chat并恢复原view／activeScene／pause／control／targets，原Actor294／Chat1419和Scene集合保持。`midi-local10-final-cleanup.json` 68,679字节，SHA `ee0ac5311b4167eb75eeefda1d5dc4ac34f09f961b79663200e480326d0eea31`。唯一工具Macro随后删除，原90ID完整相等；`midi-local10-macro-final-cleanup.json` 2,344字节，SHA `535e679aec4253ea51ff7153387acf4d86f2993a6886fda3c6cb366d38d9572c`。

父另解析raw JSON，重新计算total−diceTotal、核两card origin与speaker、逐值比较49来源及94版本唯一delta，核原Actor／Chat／90Macro，Scene以完整重载快照去除准确owned Painter Scene为对照（早期fresh84快照不含sceneIds，不能把缺字段当作空集合）。接受存于 `parent-midi-runtime-acceptance.json`。实际查看roll可见截图；不把manifest／磁盘哈希当客户端已执行字节证明。

本轮接受两个请求来源加值的正常UI切片，不包含所有权限／privacy／workflow分支、完整native Cast、天然19、长时跑团或生产。旧local.9的两次+1FAIL完整保留，不因修复成功改写旧结果。服务原PID39528继续运行，原Scene／pause恢复，未Return Setup或停服务。
