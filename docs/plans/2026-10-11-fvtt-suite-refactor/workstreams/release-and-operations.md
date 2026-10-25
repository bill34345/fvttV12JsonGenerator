# 独立发布、合集组合与运维分工

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)。发行准备与运维工具支持所有模块，但不进入用户功能模块内部。

## 当前事实与目标

各模块已有manifest/build/test，Forge已有release/归档检查；根typecheck/build路由部分为显式列表。Foundry Ops和reference/cache拥有独立本机归属。目标是模块独立更新、合集按真实完成范围组合、手册随同发行，能从清单核对候选与用户实际安装身份。

## 切片

1. **L1 一个模块的完整发行物**：以统一手册/Deck试点为对象，固定manifest/version/ZIP/文件白名单/说明/目标接受及hash。先使用已有工具，不先建发布平台。
2. **L2 第二个真实消费者**：当另一个模块需要同样机械过程，再提取稳定的归档/身份/清单步骤；模块保留自己的业务断言与语义接受，不把规则塞进通用工具。
3. **L3 合集发布目录**：记录本次包含的模块、文档revision、依赖、精确支持/未接受范围和更新渠道。5.3.3与6.x可有不同目标构建，同一既有module ID不变；不能自动跨系统线更新或强制启用全部模块。
4. **L4 品牌与地址迁移**：品牌定稿后列清root/package/仓库/manifest/download的实际引用，准备旧用户更新链；技术演练后在明确外部写入授权范围内执行。

## 商业与内容边界

首批套餐只包含通过准入且分发范围明确的资产。模块源码、第三方补丁、规则文本、翻译、媒体分别清点；整仓库、reference、测试材料、个人来源、真实目标和凭据不打包。价格、收费周期、AI额度/成本与发行渠道由用户决定，本轮没有支付、商品、DRM或许可证定稿。

## 运维与接受

默认不升级Core/系统，不启动第二套Lab，不接管正在使用的Mirror，不直接编辑运行中LevelDB，不创建备份。未来安装/服务窗口按精确目标与owner核对；只结束本轮自有服务/fixture，常驻服务按其约定保留。旧安装器与无备份规则冲突时先修该入口，不能自动调用。

已有入口：`bun run architecture:verify`、`bun run handbook:check`、`bun run verify-release:fvtt-json-forge`、`bun run foundry:ops catalog`。必要整合门禁使用锁定Bun的 `bun run ci:verify`；commit前按根规则执行 `bun run agents:generate` 与 `bun run agents:check`，然后按授权集成并做合并后的手册核对。这些命令不是本轮规划的执行清单。

下一步：L1随首个正式实施切片进行。只有一个消费者时不创建通用发布DSL；tracked文件退役、仓库迁移、Git发布和外部发行均应在具体可审阅范围及实际授权内处理。

L1已有Suite本地双交付；L2只读机械校验已从四个真实包提取并验证；L3草案见[候选说明](../RELEASE_CANDIDATE.md)和[候选目录](../release-candidate-catalog.json)。L4仍待品牌/渠道/旧更新链决定和实际外部写入授权，不虚构下载地址。
