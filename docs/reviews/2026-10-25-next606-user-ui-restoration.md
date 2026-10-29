# ServerNext 6.0.6 正常界面偏好与验收恢复

本记录只解释本轮验收工具遇到的 User 偏好写入，不扩大模块业务、角色权限或旧账号恢复结论。当前结果与原件见[执行总账](../plans/2026-10-11-fvtt-suite-refactor/EXECUTION_LEDGER.md)。Forge、Mirror及生产未参与。

## 已核实的来源与影响

House 首轮工具只保存 User 整体指纹，没有分项原值，事后无法证明历史账号状态精确恢复。用户明确选择“保留当前账号状态，记录缺口并继续”；该决定仅处理这一历史缺口，原始 REVIEW 保留。不能把它扩大为后续 User 变化的豁免。

后续 r3 从当前服务器安全索引建立分项前像，比较公开业务字段、已授权布局、其他非敏感 flags 哈希与审计字段；不读取密码、salt、完整 User 文档或任意私有 flag 值。正常 `_stats` 只记录，不倒写。

精确安装源码说明正常操作也会写 User：

| 来源 | 普通操作与准确字段 | 本轮处理 |
| --- | --- | --- |
| dnd5e 6.0.6 原生 Actor Sheet | 定位回调延迟保存 `flags.dnd5e.sheetPrefs.npc.width/height` 或 `character.width/height` | r3 预先采四叶及祖先存在性；只有本例事件支持的变化才能恢复 |
| Monk's TokenBar | 正常定位延迟保存 `flags.monks-tokenbar.position` | r3 采完整已知几何和原存在性，逐笔保护恢复 |
| Tidy 14.1.2 | 自己的 mixin 保存 `flags.tidy5e-sheet.sheetPreferences.<type>.width/height`；Actor 首次显示还可能保存选中页的 `sidebarExpanded` | 不外推为原生字段。先记录真实类/公共 predicate；必要时仅新 fixture 选择原生注册类，并明确不算 Tidy 整合接受 |
| Monk's Little Details 14.01 | `changeSidebarTab` 调用 `setFlag("monks-little-details", "sidebar-tab", tab.tabName)`；`collapseSidebar` 另保存 `sidebar-expanded` | Guard 实际捕获前一字段；后一字段没有本例变化证据，不因此豁免 |

Monk's Little Details 来源是本机 Next 安装的 `monks-little-details.js`，SHA-256 `5c29e6e6604fd4b8ed68c2486a7e95b2d0368e2f6e4a37fc8499f27b26387e54`。470–474 行读取已保存标签并调用正常侧栏切换，1282–1284 行保存标签，1287–1288 行保存展开状态。Tidy 的已装 bundle 在35106行的定位回调、10897行的公开 setFlag、29527/37713行的首次侧栏 effect 提供对应证据；默认注册没有 makeDefault，安装存在不证明当前 Actor 实际使用它。

## Guard 的实际差异与有限恢复方法

Guard 的25条测试消息、20卡阈值、禁用与再启用重载已经产生有效行为证据，清理后世界文档和设置一致。r3 事后审计捕获当前账号/guard用例的两次 `sidebar-tab` 更新，其他公开业务字段与已采布局保持；Monk's Little Details 命名空间哈希变化使恢复正确停在 REVIEW。

原安全叶没有值前像，不能直接把截图中的标签当成原持久值。只读补证使用当前安全投影，在内存中枚举实际界面提供的有限标签及缺席/null；仅当恰好一个候选使整个命名空间哈希等于原基线时，才证明该叶原像。此步骤不写 User，不枚举秘密或其他偏好。匹配失败、歧义或其他字段漂移继续保留 REVIEW。

若原叶被唯一证明且可由正常 UI 恢复，则回到该标签后仅补一次原工具恢复读回，不重放聊天行为、不更换基线。后续工具应在操作前采这一个明确安全叶，并要求准确事件归属、原值及写前保护；恢复后原有全命名空间哈希仍必须匹配，不把整个 Monk's 命名空间排除比较。缺席祖先只能在有原存在性证据且当前客户端/服务器均精确为空时清理。

首轮实际只读结果没有找到前像：16个真实tab加缺席/null共18候选均不匹配，其他命名空间与敏感排除覆盖仍一致。`sidebar-tab`的已观察事件不能单独解释全部命名空间差异；reload期间未观察到的其他变化仍未知。鉴于精确源码另有`collapseSidebar`保存布尔展开偏好，下一步只增加这两个固定安全UI叶的有限联合反证；不枚举其他偏好或将无匹配当成恢复成功。原始Guard REVIEW与首轮失败证据保留。

联合72候选也未命中后，停止原枚举路线并作有范围的一手调研。AnySearch按code能力发现后检索作者仓库，并读取[作者宏窗口源码](https://raw.githubusercontent.com/ironmonk108/monks-little-details/main/apps/macro-config.js)与[作者变更记录](https://github.com/ironmonk108/monks-little-details/blob/main/CHANGELOG.md)。作者13.03记录新增宏编辑器尺寸持久化及侧栏记忆，14.01记录v14适配；main仅作当前作者证据，实际行为以已安装14.01文件为准。初次搜索误用旧仓库路径ironmonk88，之后依据安装manifest改用ironmonk108，没有沿旧路径推断版本。

本机`apps/macro-config.js`的12–22行每次setPosition后延迟一秒，将`{width,height}`写入`flags.monks-little-details.macro-window-size[当前Macro ID]`。该新来源改变了“只需检查侧栏两叶”的判断：创建诊断Macro本身也可能新增尺寸键，重载后再执行审计会漏掉执行前的延迟写。当前键名读回确实包含macro-window-size，但尚不能仅凭此认定它解释全部差异。

因此下一反证只针对本轮有确切创建身份的Macro尺寸键：内存中移除这些本轮键，再与已证来源的有限侧栏状态联合，要求完整原命名空间哈希唯一命中。其他Macro键、quicklinks、findTime/findIdx及last-actor不枚举、不改写。该方法不能恢复任意旧尺寸值；无匹配就保留缺口，不做几何数值暴力枚举。调研没有改变旧House原像未知、账号业务字段保持的事实，也没有新增待本地化候选。

实际r3反证已唯一命中：576个canonical候选只有1个完整哈希等于原基线。原tab为macros、expanded为true；仅两个在本轮后建的临时reader尺寸键应缺席，主Macro已有720×600尺寸应保留。其他命名空间、敏感排除覆盖及其他Monk's键均参与原完整哈希验证，没有靠排除字段制造PASS。原件SHA `38f791cb5f53a46c371ff08ea3d99e45b677164a03c04509008d7b770000cc87`，对应精确ID与后续恢复步骤保留本地取证/总账；此时只证明前像，真实精确恢复仍待独立审阅后执行。

已找到避免重复副作用的正式入口：Core14.368的`client/applications/sidebar/tabs/chat.mjs`89–92/957–986支持`/macro 完整名称`，按名称执行并返回false阻止创建聊天文档，不需要MacroConfig或Hotbar。官方Chrome实际在正常聊天框执行唯一自有工具名称，源门与ready显示通过。后续初次导入关编辑器、等待已证一秒延迟稳定后才采新基线；普通重载后用此正常命令恢复工具，再回到已捕获的侧栏偏好，不重开编辑器。

实际精确恢复及helper删除后延迟末读均已通过，原主工具又经普通reload仅补一次恢复读回；本例已采集User业务/非敏感flags/布局与原值一致，仅正常modifiedTime审计差异。没有使用新policy重判旧原件，旧House缺口仍未知。

## TokenSync 的个人日历位置记录

TokenSync GM代表业务及自有对象清理后，唯一设置差异为`calendaria.miniCalPosition`。基线只存原raw哈希，已有10月12日诊断也只有同一哈希，不能从这些材料还原旧坐标或序列化形状。该差异不能直接被说成日历时间改变，亦不能仅因哈希不同断定可见像素位置发生位移。

已核已安装Calendaria **1.4.2** 的实际bundle SHA `e8f5ccf548417f3e04f8e3a2b37d8107bab37dd8177a3443d61d193980148681`，并对照所附source map：`scripts/settings-handler.mjs:28`注册此key为user scope、nullable ObjectField；`scripts/applications/calendar/mini-cal.mjs:1406`在拖动结束时仅写`left/top/zoneId`。实际minified bundle也直接包含这两个对应调用，结论不是仅凭source map或旧health中的1.2.0版本推断。此key是当前账号的界面位置记录，日期和时钟由其他设置及worldTime控制。

本例其他已采集设置、全部11类世界文档、模块、时间/暂停、Fog及User安全范围均保持。旧位置原值不足，原始REVIEW保留；用户正在选择本次及本轮后续纯界面偏好的保留范围，尚未形成新的确认要求。后续工具只为这个已证明安全的布局key另存准确row/user/raw/presence前像，并要求本例post事件、当前raw与client/server保护后才恢复；不扩大任意Setting值读取，也不把当前值补成旧原像。

## 边界与复查

上述来源解释特定界面写入，不能证明 House 的历史变化由哪项功能导致，也不能证明任意 User 字段完整相同。本轮没有新的待本地化候选。将来修改 Core、dnd5e、Monk's 或 Tidy 后，应先复核实际类及这些准确调用点，再选择受影响的最小真实用例；不能靠字段名称相似扩大允许范围。
