# 自有环境音 V3 接入记录

用户2026-10-04选择“按原版方向重做自有音效”。方向为较长环境音、稀疏气泡和分类区别；原能量文件保持。原版只读比较，付费声音不复制或派生进自有产品。

## 来源与结果

6条约180秒、立体声、32000Hz Vorbis候选已制作并整合到候选源码，能量仍为原5.24秒。Fire/Lava分别混合已许可的壁炉与火焰gust素材；Acid从录音提取57个气泡事件、间隔中位约3.22秒，轻腐蚀层为辅；Holy/Unholy/MagicCircle为已许可的弥散氛围混合。来源许可、作者、链接、变化说明见[署名](../assets/audio/ATTRIBUTION.md)，两项CC BY 3.0署名随构建保留。不把公开氛围素材都称为麦克风录音。

| 文件 | 全长信号 RMS dBFS | 解码峰值 | 制作/验证 |
| --- | ---: | ---: | --- |
| fire-loop.ogg | -16.04 | 0.906 | 壁炉底层与不规则gust，软化细碎爆裂；边界跳变量0.000832 |
| acid-loop.ogg | -30.51 | 0.750 | 57次不规则气泡，低腐蚀层；边界跳变量0.000265 |
| chime-loop.ogg | -29.01 | 0.231 | 弥散明亮氛围，文件名保留旧引用 |
| drone-loop.ogg | -27.55 | 0.282 | 分层幽异氛围，文件名保留旧引用 |
| lava-loop.ogg | -20.55 | 0.883 | 独立低频熔流/缓慢gust，120ms边界处理 |
| magic-circle-loop.ogg | -29.99 | 0.224 | 独立安静法阵氛围 |

全长解码、格式/峰值、零满刻度削波、接缝相对局部跳变、采样短窗重复检查均通过；固定种子和FFmpeg bitexact下两次生成6文件sha相同。这些是机械证据，不是主观音色接受。能量SHA256保持`a7502a3940ca3f1d0cafb81acd9cc6498c551ac5e2553bbede8c8896468b1439`。

原件和许可输入bundle在本任务外部`audio-v3-draft`，根证据为`H:/CodexData/visualizations/2026/10/03/01a1010c-9d38-7421-9098-596a96bc261a`。源码采用`generate-parity-audio.py --source-root <licensed-bundle> --output-root <audio-folder> --report <outside-audio-folder.json>`；输入哈希固定，源/报告与分发音频分开，不把个人目录或付费资产当输入。脚本不重写能量文件。

独立复核发现原路径检查仅拒绝报告直接位于输出根，遗漏输入文件和嵌套目录；已在任何mkdir/写入前按resolve后的祖先关系拒绝输入/输出互相包含、报告进入任一目录树，并拒绝六个输出文件的软链接重定向。9个真实CLI检查仅使用本任务随机临时根的合成文件，全部拒绝或到达正常来源哈希校验，文件/目录状态均不变。修复后的合法输入完整重建6条与正式候选hash相等，源bundle/候选/安装的能量三处仍为批准字节。外部原件为`audio-v3-path-guard-probe.py`、`audio-v3-path-guard-check.json`和`audio-v3-pathguard-positive-check.json`；不会把机械检查升级为听感接受。

## 产品与接受边界

9类配置使用7音源，仍默认关闭、每笔1个拥有标记的AmbientSound。新笔画起始volume为Fire0.8、Acid0.26/0.4、Holy0.3、Unholy0.7、Lava0.8、MagicCircle0.25；Energy三类0.1保持。音量是基于自有信号强度和阶段8相对监听位置的起始值，实际近远/重叠/GM与玩家、循环和清理由新构建另验，不以旧声音PASS推广。

四旧路径文件内容随模块更新，旧World文档的path/volume不自动修改；新Lava/MagicCircle改用独立路径。候选源码整合、318测试/6066断言、类型和93文件构建通过；适配到正式路径和显式输入/输出/报告参数的脚本完整重建6文件与已审候选sha相等。完整`ci:verify` r7通过，coverage运行3547 PASS/1 SKIP/0 FAIL。

阶段9安全检查点后已受限安装9文件（6音频、署名、main.js、README），逐文件readback相等，其他84文件和能量原字节保持，PID70620常驻未停止。安装收据为外部`audio-v3-install-receipt.json`；不是新媒体运行接受。CI重建发现预先记载的bundle hash变化，已证明全部32处差异仅为cwd导致的源码路径注释：模块cwd为`58421b740fedb2f45e7039654249ce8d31b79e509320630bf38267d148aceaf8`，仓库cwd为`f38f10f674b7fd260f6259ad78f3269b1b9e58a1c879b0b873f71143283a2662`，执行代码相同，两种Bun的仓库cwd构建字节相同；安装的是后者。

阶段10当前官方Chrome正常重载和原生画笔验证七个独立音源通过：六长源180秒、Energy5.237秒均loaded/playing/loop，成对读回保持同Doc/Sound.id并推进。AcidII168.512→9.520/21.003秒、Lava149.531→34.120/64.592秒各真实跨轮，Energy在46.696秒经过9轮；父独立elapsed/模运算残差均小于0.01秒。相同105/35监听偏移时Fire/Lava引擎volume0.4617，AcidI0.1501/II0.2309，Holy0.1731、Unholy0.4040、Circle0.1443、Energy0.0577；这是Sound参数，不是响度接受。

Fire原生Undo0→Redo1→正常刷新相同Doc/path/volume→擦除0通过；显式StageII绘制实际stage1、path/volume正确。第一次循环阶段动作收据active=false，不能声称已启用画笔的stage手势通过。受控远点playingfalse/volume0/公开播放池空，返回近点恢复；原生主Ambient控制读回0时Sound仍playing，恢复精确0.5后再次播放，未把停播作为静音的必要条件。所有case清理和最终9baseline字段、actual79/saved115、3Scene仅原夹具、ActorHP10/walk30/items/effects空、source/公开playing池0均通过；父独立复算最终JSON SHA`ba63e53ee056224a24fb63436fdb7ce99af0bac0976e35d76500e320d01c28e2`。

技术声音接受不替代主观试听。各case完整JSON已留存，截图仅匹配Blueprint、Fire supplement和恢复，不称每种音效均有无遮挡实景；旧Square-only Fire/Frost在gridless Landing恢复的诊断、一次当前Scene资源加载期间拒绝切场景警告保留，没有捕获音频decode错误。原件为外部chrome-phase10，父记录`phase10-parent-acceptance.json`。玩家当前客户端声音、真实拖拽、三格型和阶段手势由阶段11另验；主观试听尚未接受。

## 2026-10-05玩家端补验

阶段12的SY当前客户端七独立源均loaded／playing／loop、正gain，同Sound.id有实际进度；玩家端近处技术播放通过。阶段15用一个Energy代表实例补齐近→远→返回：真人在HexRows完成两次SY拖动，距离与成本各25，匹配当前completed事件；原Sound文档／路径保持，远处listener距源320.124world大于196半径时playingfalse／volume0／对应公共池空，返回约140.001world后正gain0.01298556、playing／loop和同实例进度0.13958→5.19042。原始near／far／return分别采样，不能把最终近处替代远处读回。最终完整恢复后源0／playing空及九字段／79active／115saved精确保持。

这次移动操作由真人完成，自动拖动接口的时序假设尚未确证或修复；主观音色仍单独留待用户判断。见[本轮技术验收](completion-2026-10-05.md)，不重做已接受的GM180秒循环或推广到生产／长时。
