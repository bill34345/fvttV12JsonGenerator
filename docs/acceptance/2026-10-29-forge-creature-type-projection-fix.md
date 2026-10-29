# 生物主类型被备注覆盖的修复与冻结复验

2026-10-29。用户原话：“修复这个类型转换问题，沿用当前 worktree，用这次冻结原答复验，确保不破坏原来正确的行为。不新增模型调用，不提交、合并或推送。”本轮沿用 `codex/20261019-forge-ab-fixed-replies`，仅修复明确主类型被备注替换的问题；不调整原生 subtype 展示，不修改提示词、来源、AI原答或IR。

## 实现与结果

`packages/intake-ai/src/renderer.ts:76` 只删除 `?? creature.identity.creatureTypeCustom` 这一回退。主类型继续使用原英文类型映射，或保留AI明确给出的主类型；类型备注仍由下一行独立输出。程序不再以“恶魔”备注替换中文“邪魔”主类，不从原文猜类型，也没有按生物名称新增分支。

现有模型、parser、generation和verifier均分别保存/比较主类与备注；定向独立审查未找到“未知主类型必须被备注替换”的已支持正确契约。`custom` 哨兵和未识别主类同样保持各自字段，不再被展示备注覆盖。这不新增对未知类型的标准化或原生支持承诺。

本次四份真实首答经现有公共分析入口和正式workflow离线重放，全部保留Actor。**修后四只在本次本地内容/配置范围内均完全成功**；原首答3完全/1部分的历史成绩和旧错误Actor原件保持。

| 生物 | 成功程度 | 问题点 |
|---|---|---|
| 六臂蛇魔 Marilith | 完全成功 | — |
| 铁魔像 Iron Golem | 完全成功 | — |
| 树人 Treant | 完全成功 | — |
| 星天神使 Planetar | 完全成功 | — |

六臂蛇魔完整Actor与首答旧Actor相比，**仅 `/system/details/type/value` 从“恶魔”改为 `fiend`**。`type.custom:"恶魔"`、八项能力、攻击/豁免/伤害/效果及关联、escape DC14、传送充能和格挡/每回合反应均完整不变。其余三只完整Actor严格相等，没有忽略时间、ID、flags或其他字段；四份IR也严格相等。

## 原来正确行为的保持

为核对共享renderer没有破坏前一轮已修好的行为，另用前六只冻结原答重放，并与原生传奇抗性修复后的最终Actor比较：Medusa、Roper、Unicorn、Priest、Behir、Adult Brass Dragon六份完整Actor严格相等。独角兽与黄铜龙已有的原生计数和特性消费配置均保持，未重建独立池。

两组共十份IR全部相同，九份Actor完整相同，六臂蛇魔只有上述一个字段变化。十份正式响应均通过真实wire解码；独立审查逐组只读读回新旧产物，核对hash、IR与完整Actor差异，无实质发现。旧四只首答的141项字段/28段全文对照继续适用：唯一原失败字段已修正，所有其他字段未变。本轮没有重复运行已通过的旧语义矩阵。

原有手动边界保持：传送、活化树木有次数池，GM手动Utility不自动扣次；火焰吸收按实际火焰伤害量由GM处理；星天神使仍是2组9引用的pending manifest，未执行Resolver匹配或水合。来源单数Cure Wound没有擅自改名，原生“天使”subtype展示限制未在本轮修改。

## 检查与证据

- 新增 `tests/forge-creature-type-projection.test.ts` 和安全入口 `bun run test:forge-creature-type`。16项通过，96次断言；覆盖14类标准英文、英文大写、中文加独立备注的完整Actor等价，以及custom/未知主类的字段独立与无备注控制。实际走renderer和正式转换workflow，网络被禁止。测试固定并恢复系统时钟，不删除Actor比较字段。
- 旧回退对这些正确类型断言实际失败，修后通过。首次比较因直接workflow写入当前时间而未能跑到中文断言，已只修测试时钟，再对旧回退做受控反证并恢复当前修复；最终红日志显示中文主类被备注替换，绿日志16通过。早期辅助失败日志保留，不算产品失败或删除证据。
- 本次四答及前六答公共入口冻结重放通过。仅向进程内provider返回已保存原答，禁止真实fetch、发现、复核、纠错和再次提取，不读真实凭据；实际新模型请求0。
- 六臂蛇魔 `verify:intake` 来源链为accepted，无主类型漂移；保留原来两条非阻断 `EMPTY_FIELD_NORMALIZED` 提示。`verify:actor` 通过，warnings和sourceIntegrityErrors均为空。
- `bun run typecheck:packages`、`bun run architecture:verify` 及renderer局部 `audit:anti-overfit` 均通过。没有新增依赖、Creature专名分支或来源猜补逻辑。
- 手册原watch报告六个条目stale，保留该检查结果；人工核对Monster/Forge、人形遭遇、Item/Species独立renderer与验证入口。只在Monster和Forge已有说明中补充主类/备注独立及旧Actor不自动迁移；其余入口、版本、权限、步骤不变。更新六项review、重新生成页面，最终 `handbook:check` 33项通过。

私有证据根：`H:/CodexData/visualizations/2026/10/29/01a18790-ad68-79e3-8895-49616acd060d/forge-creature-type-fix/`。`frozen-comparison.json` 绑定十组新旧Actor与IR；`independent-review.json` 记录独立读回；红绿日志、两个verify日志、类型/架构/anti/手册结果及 `preservation-final.json` 分层保存。修好四只的实际产物在 `replay/four-additional/<id>/actor.json`，原首答目录不改写。

本轮只改变一个产品表达式，新增局部测试及入口，并同步手册、当前状态和本报告。2,752份既有仓库文件按hash核对，249份既有会话证据保持，未删除旧文件。HEAD仍为 `5dc5702767bbcb0818a05a02e45c925289e66758`，暂存区为空。没有新增模型调用，没有提交、合并、推送、安装或部署；没有运行Foundry，也未把本地配置检查扩展成真实导入、刷新、Use/Cast/Apply或战斗验收。
