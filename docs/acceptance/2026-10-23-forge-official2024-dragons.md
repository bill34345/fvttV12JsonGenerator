# Forge：其他2024官方施法／传奇怪物复验

基线`77b13e9`，将用户的“传动”按传奇动作理解。主代理亲自使用成年绿龙、成年黄铜龙补充当前版本的跨样本验收，沿用已保存的2024来源、回复／IR，真实模型调用为0。没有修改产品实现或最终Actor JSON。

## 来源和样本

现场只读核对官方Monster Manual合集：`Compendium.dnd-monster-manual.actors.Actor.mmAdultGreenDrag`及`mmAdultBrassDrag`的`system.source.rules`均为`2024`。官方来源身份、CR与HP记录在外部`official-identity.json`；MCP是有损投影，仅用于身份／版本核对，不用它缺少的Activity／Effect字段判定官方实现。

绿龙使用tracked的`tests/fixtures/forge-2024-pilot-frozen-boundaries.json`中P3原source／baseReply／wholeReply，核对原SHA后经当前生产adapter组装IR。黄铜龙复用原`qa-runtime-seed-b87a1f.json`的N3 IR，并与原N3来源逐字／hash核对。两者都继续经过真实browser analysis、renderer／workflow／verifier、完整候选存储和当前代码重验，没有手写或修补最终产物。这不改写历史首轮成绩，也不构成新模型准确率试验。

| 项目 | 成年绿龙 | 成年黄铜龙 |
|---|---|---|
| 基础数值 | AC19、HP207、CR15 | AC18、HP172、CR13 |
| 施法 | CHA／DC17；Detect Magic、三环Mind Spike、Geas每日一次 | CHA／DC16；6个可执行法术来源，Detect Thoughts／Control Weather分别每日一次 |
| 传奇施法 | Mind Invasion引用同源三环Mind Spike，legendary／费用1 | Blazing Light引用同源Scorching Ray，legendary／费用1，继承所选法术原环阶 |
| 传奇资源 | 动作和抗性基础3，巢穴4；当前spent0 | 动作和抗性基础3，巢穴4；当前spent0 |
| 正式结果 | accepted、0 findings | accepted、0 findings |
| 实机创建并水合 | Actor `b38748509507744b`；13 Items、4原生Cast及4缓存 | Actor `b1973646ba42cf0d`；16 Items、7原生Cast及7缓存 |

黄铜龙Shapechange的形态、临时HP与专注限制完整保留为GM规则，未变成无条件原生Cast。上述accepted不表示其全部规则自动执行。

## 实际行为和原生配置

- 使用既有安全入口`bun run test:forge-batch-queue`，**105 pass／0 fail／915断言**，含两个新增样本的正式生成、来源数值、施法／传奇引用、Resolver Cast构造及完整候选恢复。新样本依赖私有N3资料，缺失时明确skip，不能把skip当成本项通过。Foundry模块类型和取证源码严格类型通过；复用未改变产品实现的既有bundle／架构结果。指令34项、手册33项通过；用户入口与限制未改变，无需改写手册。
- 本地Lab为Core14.368／dnd5e5.3.3／cor-cotn。原59936已结束、30001无监听，经既有180秒启动入口启动同一实例，当前PID38788；没有创建另一套Lab或停止他人服务。
- 两个普通batch job正常生成后整页刷新；job、候选hash、完整记录摘要及attempt1均相同，恢复Map两项且GM批准为空。固定Provider调用前后均为discovery1、extract2、review0、repair0、liveModel0；黄铜龙Markdown标题可直接定位，故不需要discovery。
- 正常GM确认框列出两项accepted，分别创建并读回。队列两项applied、批准存在，创建后恢复副本清除；实际Actor的HP／AC、传奇资源、原生Cast及Resolver水合结果读回一致。
- 传奇与普通入口选择同一官方法术UUID；CHA、DC17／16、绿龙三环、legendary／费用1、无独立uses或第二次消费配置均正确。dnd5e5.3.3的`Cast.getCachedSpellData()`按`activity.relativeUUID`设置`cachedFor`，并为该入口建立附魔；因此同源复用允许各入口独立缓存，不能把它说成共用一个物理Item。当前4／7个Cast与4／7份缓存符合该接口，未因同名缓存数量臆定程序错误。

本轮没有实际掷骰施法、应用HP伤害、推进回合或新验传奇资源逐回合恢复；证明止于生成、原生配置／水合、刷新恢复及确认创建读回，不推广完整法术玩法、任意新来源、6.x或生产。

## 清理、失败和证据

最终读回后精确删除两只临时Actor、唯一测试宏、任务localStorage、三个任务IndexedDB项、两个hash绑定静态文件及本任务Chrome页。原世界对象、Guard／24Token、视图／时钟及原scope一致，常驻服务保留；3198份旧证据保持。未改hook、合并或推送。

初始测试把两样本discovery都预期为1，实际黄铜龙为0；修正为比较恢复前后真实计数。Cast构造夹具首次漏掉尚未由Foundry分配的Item ID，使用既有16字符夹具ID后通过。类型检查补齐nullable wholeReply的拒绝分支。最终取证断言区分了构造器DTO与Foundry数值／默认字段归一化，并纠正“同源必须同物理缓存”的错误预期；只补报告层核对，未重跑生成或改产品。一次初始Chrome DOM读取超时后，用官方AX／截图确认页面已正常载入，未换执行通道。工具沿用的Collection标签仍有旧Mage后缀，实际两份source hash和最终Actor名字已核对，未为标签重跑业务。

证据根：`H:/CodexData/visualizations/2026/10/22/01a163d8-f3e5-7663-bd1b-25d55bfdac88/forge-2024-dragons/`。主要文件：`offline-cast-final.log`、`semantic-review.json`、`before-reload.json`、`after-reload.json`、`after-apply.json`、`native-spell-configuration-review.json`、`cleanup.json`及DOM／截图。取证源码：`tests/diagnostics/forge-2024-dragons-runtime-browser.ts`。来源、初始失败及旧成绩只读保留。
