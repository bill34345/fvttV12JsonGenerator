# Forge HP表格与可选生命骰公式（2026-10-23）

本批从本地`67fa01d`继续，主代理亲自完成；继续原worktree，不新增真实模型调用、不扩展法术玩法、不改hook、不合并或推送。

用户原输入为：

```markdown
| **HP&#x20;**&#x37;（3d4） |
| ----------------------- |
```

## 原因、证据与修复

NPC原生字段是`system.attributes.hp.formula`。本地dnd5e5.3.3的`dnd5e.mjs:73010`在NPC的HP schema中定义FormulaField；已有generator会把已解析公式写入该位置，renderer也已支持括号内骰式，不需要新增Actor字段。

实际缺陷在来源呈现比较：`headerPresentation`没有解码数字HTML实体，来源数字检查不能将`HP&#x20;…&#x37;`与HP7对应，抛出`UNPROVEN_BASE_NUMBER`。新增的8个表格正例在实现修改前全部失败，修改后全部通过。修复只在比较视图单次解码有效的十进制／十六进制字符引用，再执行已有宽度／强调处理；原文、hash及证据坐标不改。非法码点、ASCII控制字符不解码，不递归解码。

来源有公式时必须保留正确公式；没有公式时不推算、不借攻击或治疗骰式，也不按骰子重新计算或掷出HP。明确冲突或模型遗漏仍由已有来源校验指出，不能保证新模型首次提取成功。

## 实际结果

- 10项新增回归通过：三种有公式写法、一种无公式写法各覆盖LF／CRLF；逐项验证原文切片、正式renderer→workflow→parser/generator→verifier与Actor HP；同时拒绝数值／公式错填、漏公式、无来源猜公式，另检查攻击骰式不充当HP公式及单次实体解码。
- `test:forge-batch-queue`105项／917断言通过；成年绿龙、成年黄铜龙增加最终Actor公式断言，同候选刷新检查保持通过。`test:forge-v2-bw:bundle`3项通过，包类型、取证源码严格类型与局部anti-overfit通过。
- 真实Mirror：PID38788／127.0.0.1:30001／Core14.368／dnd5e5.3.3／cor-cotn。辅助工具使用实际浏览器Intake分析、正式生成、GM确认函数与`createAcceptedForgeActor`，只注入固定来源IR。来源表格保持用户原文，Actor`38620d579689ce51`读回`hp.value=7, max=7, formula=3d4`，严格accepted、0 findings、真实模型0；不是新增的完整工作台或刷新UI验收。
- 本地产品安装只更新Forge`scripts/index.js`，SHA256为`ffc93543b59a2a425ecd0655be46db5443506ea440e722df465077f15ffc4f55`；manifest及其他产品文件不变，Lab常驻保留。取证工具使用相同worktree构建的当前生成及创建代码，没有手补最终JSON。
- 临时Actor最终读回后精确删除；原世界文档、场景Token与视图hash核对一致。本任务宏、两个静态取证文件和独立Chrome页也精确清理，不写原候选／队列存储，不改既有Actor。

## 现有失败与未验范围

较宽的`test:forge-statblock-semantics`最终为231通过／4失败，不能称全绿。同四项在任何产品代码修改前已经失败（初始222通过／12失败，另外8项为本次新增正例），且修改后名称／原因保持：

1. `an unclear swarm size is not guessed`：预期`identity/swarmSize`，实际先拒绝`identity/size`。
2. `correct ordinary and staged facts: wrapped-title`。
3. `wrapped-title rejects/restores hp`。
4. `the header cannot borrow HP from a later ability or another candidate`。

后三项均在现有fixture派发阶段报`Unknown fixture ability`，未到本次实体解码链。它们在本批记录为待单独定位的既有失败，没有改断言、跳过用例或宣称已修复。新增测试源码曾因`rawJson: unknown`类型访问失败，已改为完整路径断言；首次浏览器辅助工具误读未批准候选的`response`，正式链返回的是`candidateResponse`，未创建Actor；修正为现有GM确认函数后才继续。上述初始失败证据保留。

此前两只龙的不可变`after-apply.json`也确认了原生HP公式：绿龙`18d12 + 90`、黄铜龙`15d12 + 75`。其正式生成、刷新续接、施法接线配置、创建读回在既定范围内通过；实际施法扣费、逐回合恢复、完整法术后果未在那轮新增验证，不能称“完美通过”。本次HP补验同样不扩大这些结论。

证据根：`H:/CodexData/visualizations/2026/10/22/01a163d8-f3e5-7663-bd1b-25d55bfdac88/forge-hp-formula`。`initial.log`、`after-decode.log`、`semantics-final.log`保留前后差异；`native-readback.json/.png`、`cleanup.json/.png`为真实行为／恢复证据；安装计划和收据、类型／bundle／handbook日志及最终保护收据保留。不重新生成或覆盖3198份旧冻结资料。
