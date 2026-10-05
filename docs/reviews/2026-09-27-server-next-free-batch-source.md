# ServerNext 下一批免费模块的当天来源与包检查（2026-09-27）

## 结论与边界

Color Picker、Multiple Document Selection、QuickScale、Share Media 的包内ID/版本与正式清单一致，声明的脚本和样式都在包内；它们是通用界面工具，不声称作者验证了D&D6玩法。**11:42四项完成文件安装及逐文件哈希对账；随后正常客户端只开启这四项、重载后仍开启，未增加客户端错误或404。本批安装/启用/启动读回PASS。**Global Progress Clocks 和 DFreds Droppables 的下载包存在需要先解决的精确疑点，保持暂缓。目标固定为ServerNext Foundry14.368/dnd5e6.0.2；Mirror不改。

| 包 | 作者正式清单与ZIP | 当天版本/Foundry范围 | 来源与代码判断 | 下一步 |
|---|---|---|---|---|
| Color Picker (`color-picker`) | [正式清单](https://github.com/Larkinabout/fvtt-color-picker/releases/latest/download/module.json)、[1.8 ZIP](https://github.com/Larkinabout/fvtt-color-picker/releases/download/1.8/module.zip) | 1.8，最低10、验证14.368 | 提供Foundry颜色选择库，清单无系统依赖；包内8文件、声明入口齐。ZIP SHA-256 `11C78DE2363096ECC1737F7E306D8A1E1AD9E278CC41A4FDCCCF2A70473FD9C7`。 | 已装、开启、重载读回；PASS。 |
| Multiple Document Selection (`multiple-document-selection`) | [正式清单](https://github.com/ironmonk108/multiple-document-selection/releases/latest/download/module.json)、[14.01源码ZIP](https://github.com/ironmonk108/multiple-document-selection/archive/14.01.zip) | 14.01，最低/验证14 | 作者README说明是侧栏手动多选、移动、导出、删除文档；源码有PF2E特例判断，但未读写D&D专属字段。ZIP内包根为`multiple-document-selection-14.01/`，其内部13文件、入口齐。ZIP SHA-256 `F64E004F470EE51CB297EEA4781EF53BA8C45ECEA25908D200503C9C473037FB`。安装时只取内部包根；不触发文档操作。 | 已装、开启、重载读回；PASS。 |
| QuickScale (`quickscale`) | [正式清单](https://github.com/unsoluble/quickscale/releases/latest/download/module.json)、[1.7.0 ZIP](https://github.com/unsoluble/quickscale/releases/download/1.7.0/module.zip) | 1.7.0，最低13、验证14 | 作者README描述通过快捷键手动调整棋子、图块、灯光、音效和模板尺度；并非D&D专属数据。包内18文件、入口齐。ZIP SHA-256 `1CFA2D4AF98F728442907A9DDCD7248ABC3E66354185C9418644F95DCFFB881B`。 | 已装、开启、重载读回；PASS，未碰玩家棋子。 |
| Share Media (`share-media`) | [正式清单](https://github.com/mech-tools/share-media/releases/latest/download/module.json)、[3.14.3 ZIP](https://github.com/mech-tools/share-media/releases/download/3.14.3/module.zip) | 3.14.3，最低/最高/验证14 | 供GM手动共享媒体；源码的`game.system`只用于文件浏览的系统目录归属判断，不读写D&D数据字段。包内25文件、入口齐。ZIP SHA-256 `76F02B8283BF907D65E2EE69D721A76E765D2F1F5919C0C825BC1F8F8165B01E`。 | 已装、开启、重载读回；PASS。 |
| Global Progress Clocks (`global-progress-clocks`) | [正式清单](https://github.com/CarlosFdez/global-progress-clocks/releases/latest/download/module.json)、[1.3.3 ZIP](https://github.com/CarlosFdez/global-progress-clocks/releases/download/v1.3.3/module.zip) | 1.3.3，最低13、验证14 | 清单声明`scripts: greensock/dist/gsap.min.js`，正式ZIP解压后没有该文件；其余入口存在。ZIP SHA-256 `CB498ADAB49EE2B0BF9714B24F86C467AEC0FE23D802AF7453773690D7781C8E`。 | **PACKAGE_UNAVAILABLE/暂缓**：核作者发行说明、仓库构建与issue；不能装后制造新404，也不从Mirror补文件。 |

| DFreds Droppables (`dfreds-droppables`) | [正式清单](https://github.com/DFreds/dfreds-droppables/releases/latest/download/module.json)、[6.2.1 ZIP](https://github.com/DFreds/dfreds-droppables/releases/download/v6.2.1/dfreds-droppables.zip) | 6.2.1，最低/最高/验证14 | 包内入口存在，但`dfreds-droppables.mjs`嵌入的模块常量仍写版本1.2.5及旧下载URL，与外层/内部manifest的6.2.1不一致。ZIP SHA-256 `D67E9813496E8186A167D821713FB881B003BA5AECBA3465EBF3CAA80D4893F1`。 | **LOCAL_CANDIDATE/暂缓**：查作者release/源码与构建解释，不把manifest标签当完整新版证据。 |

9月28日按发行方 Releases API 复查 Global Progress Clocks：最新仍是 `v1.3.3`（2026-07-23 发布），正式 ZIP digest 仍为 `CB498ADAB49EE2B0BF9714B24F86C467AEC0FE23D802AF7453773690D7781C8E`，与上表已检查缺失脚本的同一包完全一致。没有新包可重试；维持 `PACKAGE_UNAVAILABLE`，不重复下载或从 Mirror 补文件。Droppables 的进一步包内风险见[9月28日专项复查](./2026-09-28-server-next-droppables-package-blocker.md)。

`item-piles` 3.3.4、`psfx` 0.17.0、`sync-token-actor` 3.1.0、`z-scatter` 2.3.0及`simplecover5e` 2.2.3的正式清单已刷新并保存在同一证据目录，但尚未完成包内/用途/旧设置判断，不属于这个安装小批。`item-piles`和`sync-token-actor`会接触人物或物品，需额外核D&D6行为；Simple Cover按另页已有作者D&D6声明和旧补丁对照继续定点处理。

原始清单与ZIP在 `F:\FoundryLab\foundry-v14\evidence\server-next-migration\free-batch-20260927`，未写入世界。后续安装前重核Next服务属主、实际用户、世界状态与包目标不存在；正常退出世界，确认锁释放，再按小批安装并重新进入读错误。每批要记录实际active ID与错误，不能用文件数代替。

## 本轮离线安装与服务恢复（11:42）

独立Chrome任务以Gamemaster正常返回Setup，`/api/status active=false`且仍为原PID9840。父任务核进程命令行是Node24.17.0、`server-next`精确dataPath、`cor-cotn`、30002，唯一loopback监听；原世界23个`LOCK`文件均可独占读取，四个目标目录均不存在。[关世界证据](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/free-batch-20260927/world-return-to-setup.json>)、`pre-stop-gate.json`保留于同证据目录。随后正常停止精确PID9840，核进程与端口消失，未强制停服、未清锁。

将四个已核官方包安装到Next`Data/modules`的新目录，逐文件比较移动前后SHA-256：Color Picker 8文件、Multiple Document Selection 13文件、QuickScale 18文件、Share Media 25文件，均匹配。各自`*-install-receipt.json`记录正式ZIP哈希、目标与时间；没有备份或修改旧包。用原app/data/world/port与loopback预载恢复PID42740，`/api/status`显示原世界active、Foundry14.368/dnd5e6.0.2、0人在线。新服务日志只见旧有付费`demon-queen-awakens`两条签名错误；客户端启动错误尚待本批正常重登读回。

## 正常客户端读回（11:54）

[独立Chrome本批证据](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/free-batch-20260927/client-readback.json>)复核新PID42740/唯一loopback30002、原世界、Foundry14.368/dnd5e6.0.2，只有本轮Gamemaster在线。Module Management从上批84登记/76开启变为88登记/80开启/8关闭；四个新增开启ID恰好是本批四项，旧76项active没有任何意外关闭。四项精确版本与包内一致，正常保存并重载后仍勾选；日历依赖链两项仍开启。

Mirror保存78项、Next实际开启80项，共同58、仅Mirror20、仅Next22。重载后Chrome console仍是10条错误/35条警告，与上批错误签名逐项一致；旧日历页面类型错误0，新404/资源失败0。10条旧错误仍为8条Item文档校验与2条Pixi栈溢出。磁盘89包/界面登记88，唯一未登记仍是按约只记录的付费Demon Queen Awakens。本批不做无关玩法E2E。
待判断本地化：本轮无新的本团功能补丁。Global Progress Clocks缺文件和DFreds Droppables脚本版本不一致是上游包疑点，先从各自作者正式release/issue/源码复查，不自动本地补齐。其余新候选每次实际操作前刷新作者清单、依赖与ZIP内部身份。
