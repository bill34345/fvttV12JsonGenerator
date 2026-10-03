# batch6P：local.7 剩余编号验收执行单

目标：external Chrome 已验证 tab651332480 / browser2 / http://127.0.0.1:30002/game，ServerNext cor-cotn，Foundry14.368/dnd5e6.0.2。执行器重新核对返回的 tab，不能使用过期 screenshot/element。用户取消整体时间上限，仍对单次操作设置合理超时。

父方完成 local.6→local.7 三文件更新，前后均 PID36368，磁盘/HTTP哈希一致；执行器不安装、不研究源码、不修服务，只做本单 E2E/采证/自有测试恢复与清理。禁止停/重启服务、清锁、退出世界、修改 LevelDB、写 Mirror、改变共享活动场景/遭遇或推进共享世界时间。

## 0. 刷新与身份

- Version `14.6.0-beta.4338eeab.local.7`。
- ZIP SHA-256 `8D02F565BC0503AB560BFAA4CCADFC146BCA55784E5D61668E1D3ADAA1B0BCA9`。
- Bundle SHA-256 `1BF57FB02BCBB0C67A53CEBF38763F527DE11D872C7DB8ED5A32249871048BAC`。
- 六项实际函数指纹全部取自 `foundry-modules/midi-qol/dist/cf-fixture/client-build.json`；新增 clone 读 `CONFIG.ActiveEffect.documentClass.prototype.clone`，SHA256 必须为 `73840e4f60418f7af40dde6b91449ba218ec7994725bb53be7822ef847ed5ab7`。只比较前五项不足以识别本次补丁。
- 只刷新自己的30002页面，登录后核对world/system/actual functions。服务器 cached manifest 可能仍local.6，不因此重启或误判候选。
- O 已确认原设置 none/none/10；新测试前再次snapshot，以便 compare-before-restore。采集 Console/Troubleshooter baseline，以时间和调用区分历史 C03 错误，不清日志。

## 1. 首先 C03 / C04：附魔补丁

1. 复用正面识别的自有 Caster、Magic Weapon Item 与未附魔的 equipped weapon。读取真实 profile/type/活动和武器初始 magicalBonus、properties、名称及effects；若对象失效，可通过正常API重建同等自有fixture。
2. 正常施放 enchant 活动。用同一真实消息与profile走正常原生 `activity.applyEnchantment(profileId, weapon, {chatMessage, concentration:实际关联效果或null, strict:true})`，无需继续依赖失败的拖放。可以用本任务宏调用此公开活动 API；不能直接造预期effect或修改clone/payload/prototype。
3. C03通过条件：真实武器效果 `type=enchantment`，有效新ID，source profile ID/type未变，原changes/依赖未丢，预期魔法加值/属性实际生效，无新增 system.type schema错误。保存完整source/应用effect/武器读回和操作消息UUID。只消耗slot不算通过。
4. C04：确认效果在后续正常读回仍生效；经正常effect删除/原生解除附魔操作移除，武器属性恢复，原spell profile仍存在。记录前后UUID和属性，不用手动覆盖武器数值伪造恢复。
5. 若失败，保存payload与原始错误回传父方处理源码；继续其他独立编号，不重复同一失败刷日志。此次补丁不宣称系统全局迁移已修复。

## 2. 其余必须编号

| 编号 | 明确操作 | 通过条件与防误判 |
|---|---|---|
| B04 | 完成原workflow并刷新后，从保留的真实5环Fireball卡正常再次掷伤害；可复用ChatMessage.7HZM3nrWqQ4Mfzq2，先确认关联对象仍属本任务 | 新roll为10d6，源定义仍8d6，恢复关联Item/Activity无null或双缩放。对原39点damage点Apply不算新roll恢复 |
| E03 | 复用inactive Combat.xYa05YifCrc4A3Dh，仅切本客户端tracker view。真实used-state在M已过，补正常reset；必要时正常Shield再使用，并对真实卡Apply Active Effects | actor.inCombat为真；原生回合/配置支持的短休使used-state正确reset，不直接改reaction flags。Shield实际AC加值与资源分别读回；M的disabled旧effect不算新应用 |
| C06 | 通过正常活动建立适用的回合到期效果；在自有inactive遭遇推进正常round/turn，正常Document.update可显式worldTime:{delta:0}，不修改共享遭遇 | 实际事件使效果失效/移除且属性恢复，共享worldTime前后不变。若具体操作无法安全执行，记录确切限制；C05短休已有PASS不能冒充此项 |
| G03 | 记录自有目标有效卡及HP；切换自己的view到无可定位目标的自有scene，再返回原scene，在有效目标卡正常Apply一次 | 不可用行不可操作且HP不变；返回后实际HP变化正确且只应用一次，保存UI/文档证据。不要只看proposal就标全部PASS |
| G04/G05 | 每个case及时保存Console/Troubleshooter增量、workflow状态、网络异常URL/status/time | 无新增Midi归因错误；已有BFP404/Calendaria等明确单列，不能清日志或扩大修其他模块。若工具不提供某证据，明确缺口 |
| Z02 | 结束compare-before-restore临时设置及本客户端scene/tracker view，读回配置与空workflow | O的none/none/10仅是基线，P本次收尾还需验证，不能覆盖他人中途改动 |
| Z03 | 清理确切自有fixture，经正常API逐UUID读回不存在 | 包括L五Actors/Scene/原Macro、M Combat、O新增Macro.GcNaY7ZO5aaqZo4n，以及本次新建对象；保留必要chat证据。已有用户清理授权，无需再次确认 |

任何 test-only 宏只允许正常活动/文档 API 和只读观测；不伪造workflow结果、骰子、HP应用结果、expired或reaction状态。可以准备自有对象的初始HP/资源/配置，需明确与实际动作结果分开。

## 3. 不重测与交付

保留未受影响的 A01–A05、B01–B03、C01/C02/C05、D01–D04、E01/E02、F01–F04、G01/G02，引用原版本/时间证据，不重标为local.7。必要步骤经过已过路径允许，但不另起全套重跑。Z01由父方静态门禁承担，Z04父方最后复核。

新证据目录 `F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6P-midi-qol-local7-ag-20260921`。

`results-by-id.md` **必须逐行列 B04/C03/C04/C06/E03/G03/G04/G05/Z02/Z03**，状态PASS/FAIL/PARTIAL/NOT_EXECUTED，每条包括实际build/time、步骤、预期/实际、UUID、原始文件、缺口。不得用大组 A/B/C 报告替代。除真实需父方修复的阻碍外，不例行发送进度；完成或阻碍回传父任务 `01a0b8d1-e8db-70f2-9662-fd9beb035162`，以“Chrome 子任务回传”开头。父方负责复核与更新总清单。

工具安全停止必须遵从，不能换控制路径绕过；当前正常Chrome连接来自用户重新打开浏览器后的成功复核。其他标签，尤其30001，保持不动。服务始终保持运行。
