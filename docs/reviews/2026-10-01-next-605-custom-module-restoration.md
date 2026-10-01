# ServerNext 6.0.5：十个自有模块恢复与限定验收

日期：2026-10-01。当前状态：本轮授权的本地恢复完成；十模块限定代表行为、普通GM重载、精确清理，额外 Midi local.10 的两请求+4与精确清理全部通过。用户随后明确授权整理提交、发布前整合、合并 master 并推送，且要求保护原工作树、不重跑已通过 E2E。发布前检查见[整合记录](2026-10-01-next-605-release-integration.md)，实际提交与远端身份以 Git 发布回执为准。以下阶段记录保留旧失败，当前接受以末尾收据为准；本记录不恢复其他迁移、升级Core／Mirror／生产或扩大长时测试。

## 当前目标与候选

- 候选：`I:/OpenCode/fvttV12JsonGenerator-worktrees/20261001-161536-next-605-restore`，从 master `053a592b940d59b4c3014074eb233d65bcfb944e` 建立。
- 目标：`server-next` / `cor-cotn` / Foundry14.368 / dnd5e6.0.5 / loopback30002 / PID39528 / Node24.17.0。
- 原迁移源：`20260919-151319-server-next-migration`；仅十个模块及必要构建依赖逐项导入，不复制整棵 dirty 工作区。初始368个实际 dirty 文件逐文件指纹保留，源树不写入。
- 版本策略源：`20261001-142408-dnd5e-version-policy`；固定5.3.3和稳定6.x跟随方向不变，精确版本接受与长期跟随策略分开。
- 业务 run：`4863dddb-c416-4a93-9060-1076106abfed`。私有原件根：`F:/FoundryLab/foundry-v14/evidence/server-next-migration/next-605-restore-20261001-4863dddb`，不复制完整世界资料或会话入仓库。

## 修复范围

十个 ID：chat-memory-guard、fvtt-babele-rolltable-embed-translation、fvtt-battlefield-painter、fvtt-blood-hunter-2024、fvtt-homebrew-species、fvtt-house-rules、fvtt-injury-fading-spirits、fvtt-json-generator-spell-resolver、fvtt-session-monitor、open-session-deck。

运行代码只新增明确核验的14.368/6.0.5配对，保留旧配对并拒绝交叉或未核验版本；manifest 声明不替代代码及实机接受。固定6.0.5源码提交为 `3ee48de02f8f6f7b2638c9f6cf3e9540c9c181cc`；Open Session Deck须处理6.0.5的效果来源力竭字段，而非只改版本上限。

血猎手及自制种族保留6.0.2已接受内容投影和世界现有合集；6.0.5为运行兼容目标。安装只更新审核的非packs文件，停世界／释放锁后记录合集全部文件前后SHA-256，不重放系统迁移、不替换数据库、不制作备份。

## 初始出口与当前状态

- 已关闭：实际基线、正常Return to Setup／锁释放、候选构建与逐项安装哈希。
- 已关闭：原94启用ID恢复、49来源值与两包数量／锁保留；额外Midi只有local.9→local.10的授权版本差异。
- 已关闭：上述限定代表行为、普通GM重载、自有世界对象与临时Macro精确清理；其他矩阵不由此扩大接受。
- 已关闭：owned浏览器页面释放、文档／手册／指令一致性；源码发布接续见整合记录。

模块玩法的历史通过仍绑定原目标。原工具V1交付结论继续有效，本恢复任务不用于宣称受控提速、token节省或全模块兼容。

## 机械验证与安装读回

模块 owner 运行各自检查：Painter148通过、Injury62通过、Resolver339通过、OpenDeck54通过；House Rules测试／类型／build／12项ZIP artifact核对通过。声明／内容组：Chat Guard29、Babele8、Blood Hunter51通过且1个条件真实源专项跳过、Species36、Session Monitor29通过，独立监测器build gate通过。各组有覆盖关系，不累计为一个无意义总数。

主控整合检查：packages、apps、foundry-modules类型检查通过，architecture:verify通过，CLI24通过；Species36在默认vault路径修正后再次通过，anti-overfit10来源通过，references verify的5.3.3与current6条目通过。CLI子进程曾在默认5秒处超时；只为六个启动CLI的用例设置30秒单项界限，断言和业务参数未放宽。

已按正常客户端取实机基线：UTC08:36:47，源49值差异0，两DLC包969/278均锁定，当前84活跃模块；原升级前94参考和无关ID均保留。正常Return to Setup一次，接口active=false，PID39528／loopback30002保留。旧页面消失时从支持的Chrome入口创建一个owned同目标页面；未切工具绕过拒绝、未猜密码或读Cookie。

共用文件工具实际走完prepare→ready→execute→collect→resume，收据 `c4169afc-3817-423a-a0ec-43875fc8e160`，文件侧PASS／COMPLETE，运行出口仍独立。原请求描述误写79文件，实际全部80构建文件及4脚本／计划身份已绑定，operation核80且没有遗漏；父接受只授予安装前文件门。

实际安装在inactive Setup完成：十模块80个非packs文件逐一写入／读回SHA-256；主控随后独立复算0差异。所有已安装packs文件（含各数据库现有清单）在操作前后完全一致。Blood Hunter六份nonpack data与Species三份nonpack data此前逐字节相同，内容投影、逻辑身份和accepted来源未改写；真实冻结来源构建为1职业／4子职／77特性／94ledger／117Activities。

当前进入原世界重启及模块开关恢复阶段。只有该阶段和后续代表性行为／重载／精确清理回执得到独立核对，才关闭运行门。本记录此时不宣称94集合或6.0.5玩法已经通过。

## 原启用集合已恢复（北京时间16:54后）

正常启动原世界一次，原10条已审核开关在Module Management可用；独立DOM核对其他开关未变，保存一次并接受正常设置重载。新原件 `restored-inspection.json` 68,713字节，SHA-256 `c78c0fceea1e761a592fa6eff012e9eeb003782c97d10bed0a56d35f342a5429`。主控独立解析确认原94 ID及版本逐项相等；49来源值差异0，两DLC包969/278均锁定，world Actor/Item/其他Macro/chat IDs、GM角色、active/viewed scene及pause与本轮fresh84基线一致。实际截图也显示14.368／6.0.5／94。

父接受为 `ACCEPTED_94_MODULE_RESTORE_AND_SOURCE_PRESERVATION_ONLY`。本轮目标十模块的支持工具错误／警告日志归类为0；旧世界4条Item／Pixi错误单列，不宣称整世界无错误。公共API及代表玩法仍待下一个冻结Macro批次，临时Macro与页面保留。

独立只读复核未发现本次版本门、力竭读写、内容身份或安装保护的代码缺陷；发现村规/伤势拒绝字符串和解析器README漏列6.0.5，源文义已修正，最终安装同步仍待收尾Setup窗口。该文案修正不改变已接受的运行逻辑。

## Core Check／Save 工具纠错记录

首次原生请求卡准备在调用前被工具阻断：Item raw活动map键为dnd6checkproof01／dnd6saveproof001，但DataModel `_id` 未声明而得到随机id，运行Collection索引使用新id，旧固定键查找为undefined。实际只读诊断确认两个typed Activity均有use函数、bonus仍为`@abilities.str.mod`，新增Chat为0，旧claimed Check id=null；flags／失败领取事实完整保持。不能写成系统Check／Save业务失败。

另一个清理工具错误是使用Core14.368已不存在的User.updateTokenTargets；正常返回原view后即停止在该调用，尚未删除对象。精确版本Source `client/canvas/layers/tokens.mjs:341` 提供公开TokenLayer.setTargets(ids,{mode:replace})；运行诊断也读到function。两个已归属NPC／Feat／Scene／Macro精确ID保留，不重建。V2仅修活动选择与目标恢复，归档未调用use的旧领取记录，经0新Chat／唯一typed模型门后在同一fixture恢复；后续真实UI结果仍待回传。主模块验收Macro在第一次使用前也同步正确清理API。

### 已观察到两次原生结果，原因仍待定位

V2在同一fixture归档旧未调用领取后，分别创建真实Check／Save请求卡并通过正常UI各操作一次。观测值为Check骰13／总14、Save骰5／总6，均为+1，未达到预期owner+3加target+1；未改公式／造骰／重掷。不据此断言Core单独故障或某模块因果。

工具同时错误地按字符串比较prepared `system.origin`；固定6.0.5的RollMessageData将其声明为ForeignDocumentField，需核raw与prepared值才能关联消息。执行器识别工具会漏删实际roll，未选择清理；2 Actor／Scene／Feat／CoreMacro及两卡两roll均按准确ID保留。新的只读诊断取getRollData、公开BasicRoll公式替换和known4消息来源／flags，不再调用use或roll。此门仍FAIL/INCOMPLETE，94模块启用及来源保留的独立接受不变。

### 药水判定器真实反例及限定接续

只读28408字节原件SHA9c423dcde50c6220e73c712953dc6b93fa9664d0b6ddc3028e88581e4aa6139c：snapshot与actual rawJSON／canonicalJSON均相同，differences为空，而Coreutils.equals返回false。判定工具对含数组的持久文档数据不应使用该集合语义helper。实际持久heal ID为hrPotionQ0000001／hrPotionM0000001／hrPotionF0000001，对应模块core/potion.ts明确_id；旧hrPotionFeed只是构建逻辑map键。

工具只改严格stableJSON比较与准确feed ID，增加一次同药水接续按钮；已有applied snapshot先完整校验，归档旧FAIL后只跑未完成的手改保护／恢复。Preview／Apply及其他9个已通过API门不重放。用户另已明确批准Midi两个handler修复，独立候选保留5个既有local.9改动、只新增两函数来源加值路径；原Midi源码树不变。

上游gulpzip曾打印6个TS语义错误却退出0并产生zip；该产物不接受。新接口运行事实已由Core6.0.5源码／只读诊断确认，补准确本地类型后须独立tsc --noEmit退出0，再接受build／归档，不能让后续编译或文件保存掩盖失败。

### 药水通过；Deck 暴露真实 ID 错误（UTC10:32）

同一药水的限定接续已通过手改保护／恢复：恢复后 Activities 数为0且 snapshot 清空；原 Preview／Apply 和其他 API 已通过门未重放。随后 Deck 卡片显示0，工具旧 `conditions` 读数1，先前 fixture 领取为3；停止 UI 加减并保存三层差异。

只读原件 `deck-readonly-diagnostic.json`（27,747字节，SHA-256 `7d89ac5c1babe688170bab9fb495a72bd4f863c13e0b77da7351d45b6a2ecd83`）确认唯一原生效果为 `dnd5eexhaustion0`，level1、disabled=false、status exhaustion；attributes 与 prepared conditions 均为1。未补齐的 `dnd5eexhaustion` 查找缺失。6.0.5精确源码 `ActiveEffect5e.ID.EXHAUSTION` 调用 `staticID`，后者补齐到16字符；此前候选常量与模拟fixture都遗漏末尾0，先前静态复核未识别这一问题，其“未发现力竭代码缺陷”结论已被现场证据推翻。候选已纠正常量／测试／模块说明，54测试及 foundry-modules 类型检查、build再次通过；三文件限定安装与真实UI 3→4→3仍待执行。

初次一次性 `toggleStatusEffect` 增加3还触及系统原生异步同步：`Actor5e._onCreateDescendantDocuments` 在 source exhaustion 为0时写1，`_onUpdateExhaustion` 再计算效果 delta；现场 effect 的 created／modified 相差50ms，与该路径一致，但不以只读快照断言唯一因果。验收工具改为读取准确 effect ID，先完成第1级创建再加2；当前自有 level1 fixture 只做加2接续并等待读回3，不重建或重跑其他门。它不写派生属性或改系统源码。

### Deck UI 已通过；Resolver 自动路径待精确读回（UTC10:46）

正常 Setup／锁释放后只覆盖 Deck JS／两份 README，三项写后 SHA 相等，其余六项文件未变，manifest版本不变；安装回执 `deck-fix-install-receipt.json` 明确 PID39528、active=false、未写世界数据库、未创建备份。正常启动原世界后，同一 owned fixture 加2接续为3，Deck显示3、正常加一次4／减一次3，公共工具读取准确 effect 与UI一致。加载证据是正常启动后的 script URL 和修复后行为，未取已执行脚本字节哈希，不把磁盘 SHA 冒充客户端执行字节。

Resolver 首次打开已是 hydrated，正常 View Report 显示10个 `automatic-2024` 选择，执行器 Apply／Undo均零点击即保留现场。源码 hooks.ts 在 createActor／updateActor 后排队异步 resolve；工具 importFromJSON／setFlag 能触发该路径，源fixture本身为3 feat／1 weapon且无 Spell，所以先前 bounded pending／1 Spell 很可能是异步未完成时读回。当前仅确认触发机制与报告吻合，仍需只读现场绑定十个 managed cache／Cast／selection 和完整 undo snapshot；相等后正常 Undo 一次，目标 pending／0缓存，不重复水合。此验收口径改为实际自动水合与普通UI撤销，不宣称未发生的 Review／Apply 点击。

### Resolver 已通过；Painter 真画布 FAIL（UTC10:57）

Resolver 现场 before 39,244字节 SHA `1856fe68a04da246c74cd344de2b37fdaad5f6b111905ecb36e7e3cd817571dd`：hydrated，10 Spell／10 cache／10 Cast，严格唯一 selection ownership 相等。正常UI Undo唯一一次后 after 4,277字节 SHA `3a6e06b3d71790a3bd4c9077f39777a2f627065520dc03dc4f49fb1c92677828`：pending且三项均0，manifest SHA `ba9c849d19d17b8afa0716b3c352f019a00d04be3bf3b28675d4e2a564254eeb` 未变。通过范围为自动水合的当前完整结果与普通UI撤销；完整原生施法矩阵尚未执行。

Painter 在空的自有 Square Scene 只画一次 Fire I／radius0 两格，保存2 Tile／1 Region／1 light；audit 有2 fireCells／atlasLoaded／1 mesh，但0 vertices／triangles／emitters。清晰截图仅有暖光没有可识别火焰，视觉 FAIL，不以文档／atlas成功替代。两条 Pixi `_onCanPlay`／`_onPlayStart` 递归错误完整落盘；每条大栈871,163字符不能当作根因。现场没有重画、撤销、删除或重载。

精确 Core14.368 `common/grid/square.mjs` 明确 i=rowY、j=columnX；Fire renderer 的 origin／anchor 反用坐标，而 Frost同处已经正确。新增非对角 persisted offset 回归和校准runtime mock在旧Fire代码上得到0 emitters，与现场一致；纠正六处转换后局部8测试通过。视频递归与几何空数据可能是两个问题，目前已派只读公开DOM／纹理／Tile坐标诊断，未宣称视频因果或已修复实机。

现场只读 `painter-readonly-diagnostic.json`（8,764字节，SHA `c00f2728df532192b82bdb2d34dfe37e5f77a34c2ae08ffc6c7a5dd67aadad62`）准确 Tile offset0:0／0:1、公开center50,50／150,50；mesh size0/index0/positions空。两份视频及 texture/baseTexture/resource均768×768且valid，视频paused=false、readyState1、currentTime0.533333；不能从一个快照断言持续推进或递归已解除。

加载协议对照已安装 Core14.368 的 Pixi7.4.3 `VideoResource`：Texture.from 默认autoLoad；模块又load并立即play，能在尺寸重置／无效时进入 `_onPlayStart`→`_onCanPlay` 递归路径。候选取消两层autoplay、保留Pixi单次load、在decoded dimensions就绪时先公开resource.update再play一次；不修改Pixi或系统prototype。新增延迟尺寸／重复ready事件回归，151 tests/coverage、模块typecheck及build通过。限定安装只有 Painter `scripts/main.js`，其余14文件与安装基线固定；准备时JS SHA `640cf1cd3629f85a45668c27c79234b3266bd2ad8908367502b86e99a68a43ef`。下一步正常 Setup后overlay并重用原两格，必须补真实火焰视觉、700ms两样本播放推进、无新增同类递归及普通重载读回，当前仍未接受视觉门。

### 十模块代表运行及普通重载已接受（北京时间19:23）

Painter单JS overlay在inactive Setup完成，写后SHA与上述候选一致，其余14文件无差异。原两格未重画，真实截图显示可识别火焰；audit为2cells／mesh1／vertices32／triangles16／emitters8、2Tile／1Region／1light。700ms两样本 StageI 0.383333→1.048327、StageII 0.383333→1.046717，readyState4、无video error；本批普通launch/reload边界内返回日志新增error0，不宣称长测或整世界无错。普通GM重载后稳定帧仍显示同两格火焰，初未加载帧与稳定帧均保存。

Babele可见Dialog严格按两张实际table核25／5行且每行有中文，原条件／基本方位UUID保留，零rollable点击。父已查看火焰前后及Babele上下截图。重载原件 `painter-fixed-post-gm-reload.json`（100,918字节，SHA `957f5eaad78033c761455951165d1f0ac9ee1421c0c4e7cbeb5406a48f1b214e`）十gate全部PASS；父另逐项核49 currentValue=sourceValue与 fresh pack969／278锁定身份，原世界集合和旧升级Macro哈希保留。独立接受为 `parent-ten-module-runtime-acceptance.json` 的限定代表运行与重载；已派精确fixture／两临时Macro清理，当前不宣称清理完成。

接受范围不包含天然19、完整原生Cast／四子职／其他地形矩阵、长时测试、生产，或随后才获准的 Midi +4请求门。Blood Hunter／Species只接受现有来源、内容身份与合集读取，不提升为全部职业／种族玩法通过；Chat Guard仅公开统计API，Monitor仅短会话与历史持久。旧失败证据完整保留。

### 精确清理已接受

第一阶段 `ten-module-final-cleanup.json`（2,390字节，SHA `1f7f23653c28642db8237682e4bd3632069c5deb48f4052923b41c7ac0281688`）为PASS／failures空／finalPreservationtrue：七项Deck设置、原view/control/targets恢复，两个自有Actor／Folder／Scene及其Tile／Region／light删除；仅删除自有短Monitor记录，原两条历史ID与hash保持。原世界对象／49来源值保留。

第二阶段先核原升级 Macro `C3z5LLakUs6riKBN` 的run、command与flags SHA，再与本轮工具 `eIJdNfO1iEiGW4YW` 一起删除；`temporary-macros-final-cleanup.json`（10,688字节，SHA `f0c08b5079325978139c1009f69a7f539d7b5c623c406e7d427cb07c026d3adc`）为PASS，原90Macro ID完整保留。父另从 fresh baseline 去除准确旧临时ID后逐项比较90ID，保存 `parent-ten-module-cleanup-acceptance.json`。正常UI目录也核两临时项缺席。之后正常Return Setup，服务PID39528保留，为额外Midi七文件限定部署准备；没有停服务、创建备份或删除历史证据文件。

## 最终接续状态

额外 Midi 接受见[真实请求与清理记录](2026-10-01-next-605-midi-request-bonus-gap.md)：原两次+1FAIL保留，新Check骰12／总16、Save骰20／总24各一次，modifier均4；新2Actor／Scene／Feat／4Chat／唯一Macro精确删除。当前仍为原94启用ID，其他93版本不变，只Midi为 `14.6.0-beta.4338eeab.local.10`。父接受原件为 `parent-midi-runtime-acceptance.json`。

最终只关闭owned页面651337851，`owned-browser-page-final-cleanup.json`（733字节，SHA `15f813d68d9f073db7fe2304ef402a9fabe64c24e79b7a7ac4b99ccef7f1dc63`），其他可见owned pages未变；没有关闭profile／浏览器／服务器或Return Setup。父最终 `/api/status` 确认 active=true、world=cor-cotn、Core14.368／dnd5e6.0.5、users0，仍由原PID39528／Node24.17.0／ServerNext数据根运行。

保护性复核：原迁移源368个dirty文件逐SHA复算0差异，原Midi三个既有运行修改SHA原样保持；主工作区 `master` 仍clean且HEAD `053a592b940d59b4c3014074eb233d65bcfb944e`。本候选没有tracked删除、没有stash或自动提交用户改动，源码尚未发布。模块说明更新后重新生成候选ZIP，Deck／Painter／Resolver最终JS与实际已装JS逐SHA一致；安装时冻结的README属于当时快照，仓库与重建ZIP已带最新限定接受说明，没有为纯说明重放运行门。

最终相关检查：AGENTS32文件／Ruler一致性PASS，references的5.3.3与current6条目PASS，architecture依赖／循环PASS，handbook28工具来源／指纹／离线页面一致PASS，git diff --check PASS。变更过的Painter151测试／coverage／typecheck／build、Deck54测试及模块类型／build已通过；先前各owner与CLI／Species／anti-overfit结果见机械验证段。未执行全仓 `ci:verify`／全仓测试，也未重跑已足够的既有验收。

以上为发布授权前的历史快照。用户已批准对本次worktree `codex/20261001-161536-next-605-restore` 按[发布流程](../runbooks/worktree-development.md)执行commit／merge／push，整合检查接续见独立记录。天然19、完整Cast／四子职／其它地形／GM玩家矩阵、长测和生产维持NOT_EXECUTED，不能当本轮遗漏的强制出口或已通过结论。
