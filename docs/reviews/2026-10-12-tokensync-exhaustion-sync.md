# TokenSync：首次力竭同步边界

## 分层结论

本轮S1已在模块内部提取纯等级计划，并收敛首次创建力竭效果后的原生完成边界。受控时序反例先失败，修复后24项/99断言与模块类型检查通过。S1取证时Next缺失/启动被拒；后续用户授权已恢复Next。当前Forge仍使用同Chrome中的5.3.3网页，登录隔离无法证明，因此保持原生接续延期。候选仍未安装，没有6.0.6真实HUD、玩家/双客户端或重载接受。

## 精确来源与接口事实

- 6.0.5采用已提交基线的reference-cache-manifest登记源：官方`foundryvtt/dnd5e`仓库commit `3ee48de02f8f6f7b2638c9f6cf3e9540c9c181cc`。本机完整cache的system.version为6.0.5、origin为官方仓库，两个目标源文件clean；本地没有对应tag，因此按固定commit判断。Actor源码SHA `de38251da1afa96c2a02a0c17b450f31814ccd53eb5019705e7074e2ea1139aa`，Condition源码SHA `d74dd5ccf57fdab0c1ddbac309ff29deed3a551ffdcc104209fea1b5539859c1`。
- 6.0.6来自前批已逐文件核对官方安装包的实际source map，SHA `1e27f3b7985aa2e29e59237addbd1356902fd620af28af68e0961f47cb322eb1`。仅读取对应sourcesContent，没有修改系统或从打包压缩代码猜接口。
- 两版Actor的3407–3425、3450–3459、3610–3615行及Condition的139–164行经内存归一换行/行尾后逐字一致：首建Effect后另行更新legacy exhaustion=1，`_preUpdate`记录派生原级，`_onUpdate`等待encumbrance后按原级计算delta。Core14.368对descendant/onUpdate通知不等待其Promise，因此native toggle返回不能直接代表全部后台同步已结束。

官方固定源码入口：[Actor](https://github.com/foundryvtt/dnd5e/blob/3ee48de02f8f6f7b2638c9f6cf3e9540c9c181cc/module/documents/actor/actor.mjs)、[Condition](https://github.com/foundryvtt/dnd5e/blob/3ee48de02f8f6f7b2638c9f6cf3e9540c9c181cc/module/data/active-effect/condition.mjs)。读取与比对使用本机已锁源码；链接只方便复核。

## 本轮修复与检查

原实现受控连续两次HUD加级可能先到2，随后被后台旧字段同步改回1。修复只对首次力竭0→1且原Effect不存在、legacy falsy的情况等待：当前Actor、发起User、changed/source legacy=1及options.originalExhaustion=1都满足后继续。最后一项证明后台delta为0，避免updateActor到达却仍会重写Effect。其余状态、等级边界、linked/synthetic重读、移动、权限与CC边界保持。

只挂自有Hook，finally移除；10秒单操作超时后当前客户端暂停后续分级写，由用户核当前状态后关闭/重开同步。受控计时测试没有真实等待10秒，证明排队零后续写、foreign监听保留和恢复；负例的预期错误日志不代表测试失败。不写legacy/derived、不patch原型，不增加schema/API或跨客户端原子承诺。

## S3同源只读帮助

Token控制栏新增独立帮助按钮。GM检查可选Suite的active/ABI1与精确entry后打开统一手册；玩家直接阅读模块随包窗口，Suite不可用时也回退。正文由owner docs/manual.json提供，中央目录仅引用，读取不写设置/Actor/Token，也不因帮助扩大玩家同步权限。

包含S1回归与新帮助的模块35项/348断言、类型检查通过；错误Suite零调用断言加强后，10项/247断言定点补测与类型通过。窗口使用真实DOM构造的只读内容，但这仅是本地机械检查，不能替代Foundry宽窄窗口/角色实际验收。新5文件ZIP b9e34b65...、JS cc743bfe...及13源输入冻结，完整身份见总账与私有tokensync-s3-build.json；未安装。手册36项与H4两次确定性交付4项/72断言通过。

## 待判断本地化与复查

本次没有新增外部候选或本地化项目。若Core/dnd5e或模块候选变化，先复核上述首建/预更新/后台delta接口与完成事件，再只跑受影响局部反例及真实HUD链；不能由manifest上限、静态接口相同或旧605结果推定606实机可用。
