# Batch6AC：完成Shield实际应用链与未截断原生日志

## 固定边界

唯一workdir I:\OpenCode\fvttV12JsonGenerator-worktrees\20260919-151319-server-next-migration；branch codex/20260919-151319-server-next-migration；HEAD b0396c3b6f3950d0dfdc5ec88de2bf558c1bff6d。保留dirty，不建/切换worktree，不commit/merge/push。
目标官方外部Chrome / http://127.0.0.1:30002/game / cor-cotn / Foundry14.368 / dnd5e6.0.2 / local.7。ServerNext保持运行，原PID34548须只读复核，不启停/重启/清锁。Mirror/30001只读，不碰共享场景/遭遇/世界时钟。
本轮C06/G04/G05及当次Z02。G03已由AB真实原始报告关闭，其他既有PASS不重测。根负责Z03/Z04。新独立Luna Max/实际Full Access/never，不能递归委派。

## 根已定位的AB缺步（不要再重复）

AB正确打开Target的Shield、准备了slot并点击Cast Spell，但没有任何Apply Active Effects/最终Apply点击；这是未完成应用流程，不能把workflow Completed或content空当作效果应用已执行。不要再改gmDoReactions、ignoreSpellReactionRestriction或打一次攻击来碰运气。
dnd5e6.0.2实际EffectApplicationElement._onApplyEffects对checked effects及targetList.targets执行modifyBatch；_prepareEffectData可正常重用同源旧effect，清expired并重新取start。因此UUID不变是合法的，验收要求正常新应用后active/registered及起点正确，不要求必然新建UUID。

## 先建立原生证据通道

1. 按当前已知URL获取有效Chrome tab；旧tab id失效时不要停止，应按官方文档重新绑定已知URL/新建目标tab。用户授权Gamemaster空密码登录。读官方Console/CDP能力文档，使用tab.dev.logs和tab.capabilities.get('cdp')，不旁路CDP。
2. 完成所有必要页面加载/登录后，才enable Network/Runtime/Log并取起始cursor。此后不刷新页面。若必须刷新，刷新完成后重新enable并另起明确窗口，不能沿用旧cursor称覆盖完整。
3. 每3个UI动作或最长约30秒读取一次readEvents（methods保持一致，afterSequence续接，hasMore则立即分页），立刻落盘允许字段；不要等整轮结束再读。出现truncated=true的窗口不能判完整，缩小窗口后有因重取，不能隐藏截断。tab仍有效时保存结果，释放前完成。
4. 保存允许字段：时间/sequence、console level及primitive/协议已给的description和stack frames、资源origin+pathname/status/type/errorText/timing。不要保存headers、Cookie、Authorization、POST/body、response body、objectId和任意账号数据。不使用AA自编console wrapper。
5. 本轮有确定的无副作用网络探针：主任务identity宏会对同源/modules/midi-qol/midi-qol.js做cache:no-store GET并核对SHA，仅保存status/bytes/hash。请在Network已启用后运行，并及时读回对应Network.responseReceived/loadingFinished或loadingFailed。G05不要求完整body trace；要求实际可归因资源证据和诚实覆盖边界。

## 固定宏与指纹

通过正常Macro UI使用既有Macro.GcNaY7ZO5aaqZo4n，先保存原command，最后恢复。文件原文，不手工重写成简版，不乱用duration.toObject等未验证方法。

- ac-identity-shield-readback.js：SHA256 613C45A5CE52A0FE0547CB0A7E8CBFBD13B3887F5023CB0D51C2BC9167563549。
  根已修复独立宏常量依赖和target iterator序列化；来源为已验证的cf生成指纹代码，只读取业务数据、做同源GET、创建自有证据whisper。六个实际函数包括CONFIG.ActiveEffect.documentClass.prototype.clone，不要查不存在的MidiQOL.enchantmentClone。
- q-combat-view-preflight.js：原样做本客户端own tracker预检。
- ac-shield-expiry-diagnostic.js：SHA256 6E81B852E9B74F41551B8780B88AE4D73544162E76B32CAAC1FFD623B075287B。与已审AB脚本业务相同，只改AC标签。完整effect.toObject、duration/start/source、expectedExpiryPredicate、native round和Hooks都保留。

AC两份宏发布带真实messageUuid的完整JSON，只whisper当前GM。必须核对case为AC、时间属于本轮、报告messageUuid与当前消息对应，原始JSON逐份保存，不能抓旧聊天/拼接不同运行。占位消息不算报告保存成功。代码/语法/属性问题报根处理，不自行重造宏绕过guard。

## 执行顺序

1. 保存本轮live baseline：完整world/scene/active/viewed Combat UUID与round/turn、targets、Midi配置（至少autoItemEffects/autoCEEffects及反应设置）、自有Target HP/slot/效果和宏command。已有历史值不是恢复常量。
2. 运行identity宏并立即保存报告与Network/Console分页。它验证六函数指纹及HTTP bundle hash；读取Shield完整system/源effect、当前autoItemEffects、两条AB已知消息（仅作为旧尝试诊断，不能当本轮施法）。主任务保证只读业务数据，网络探针不保存响应正文。
3. 正常view Scene.RyluHOjH0iBC7xro，再运行q-combat-view-preflight，确认game.combat与tracker均为inactive Combat.xYa05YifCrc4A3Dh、Target.inCombat=true。不得激活共享Combat或推进worldTime。
4. 用正常UI准备Target一个1环slot（如需要，记录原值），通过Target角色卡Shield正常Cast Spell。记录本次新ChatMessage实际UUID，立即采集一次日志。
5. **必须继续处理这张新Shield卡**：正常进入Chat并定位该UUID，展开Apply Active Effects / effect-application托盘。查看并按正常UI勾选Imperceptible Barrier，确认选中；确认托盘的真实目标是自有Target（Actor.6G73ekCjdnN2UUZU或其Token UOJVkOn5ulEhnMdw）。Actor-only在此效果路径合法，不能套用G03伤害组件限制。需要时正常Token.setTarget或UI选择自有Target，不能写workflow结果。
6. 在同一effect-application内点击最终Apply（原生data-action=apply；不要点击别的卡片伤害Apply）。保存UI选择与点击证据、新卡UUID。如果托盘没有显示，先保存当前卡DOM/system.effects及autoItemEffects；仅当现有autoItemEffects为applyNoButton/applyRemove确实抑制按钮时，允许经正常配置API临时把该字段设为已知有效off，compare-before-restore并恢复；不随机调整反应规则。若数据无effect或实际Apply报错，立即保存准确异常和卡数据，停止反复施放，回传根。
7. 正常Apply后应唯一active Imperceptible Barrier，registry=true/AC bonus5。允许系统重用旧UUID。此刻运行原样ac-shield-expiry-diagnostic.js一次，记录完整before/effect.toObject.duration与startCombat/sourceActor、expected predicate、事件、after expired/AC0和shared unchanged。不要在已过期后再次推进来充作新到期证明。worldTime delta0。
8. 立即保存此阶段Console/CDP新增与Troubleshooter本轮读回。已知Calendaria若本轮再出现要写“本轮重现已知类型”，不能按旧时间冒称历史日志。BFP frost-film404、音频/其他模块异常分别归因；新Midi错误必须给栈和最小复现，不修改源码。
9. 若G04还需要覆盖local.7新增clone路径，可仅作一条既有Magic Weapon正常applyEnchantment/正常移除的日志检查（沿用P执行单公开活动API，源profile保留，武器状态恢复）；不是重跑C03/C04全组，不改其历史版本。无必要不要扩展。
10. Z02在本轮baseline上compare-before-restore全部临时字段/视图/tracker/targets/slot/HP，恢复helper command，保存完整前后UUID/字段。不要覆盖他人变化。结束原生日志订阅并保存最后cursor/hasMore/truncated。关闭自己开的编辑窗口，留九个root给根清理，释放浏览器；需要根接续的自建目标页markHandoff。不要在释放后再取日志。

## 回传

唯一证据目录 F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6AC-midi-qol-shield-native-e2e-20260922（原样使用，不自行增删-e2e-）。
逐C06/G04/G05/Z02；G03及其他PASS不重测。results-by-id.md引用完整raw、消息UUID、原生日志分页与窗口，不写“只有summary也验证通过”。生成后从磁盘读回检查路径/JSON与字段，不只验证JSON语法。
无总体时限，但每步超时合理，不无限尝试同一失败。完成或实质阻碍，先send_message_to_thread到主任务01a0c666-44c3-7010-8d64-7eb1582a5d7f，前缀Chrome 子任务回传，带原始绝对路径和已恢复/释放情况，再final。根负责清理和最终交付。不得归档/递归委派/修改源码、计划总清单或运行时。