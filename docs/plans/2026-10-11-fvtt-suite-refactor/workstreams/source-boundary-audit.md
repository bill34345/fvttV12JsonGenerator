# 本工作树的调用与默认值核对

本页只说明已提交基线在本任务worktree中的事实；没有读取或整合另一个正在工作的Forge脏树。

| 消费者 | 实际入口与归属 | 本轮处置 |
| --- | --- | --- |
| CLI | apps/cli/src/main.ts → src/core/application/cli.ts 组合面 → workflows/Intake等公开实现 | 参数/展示仍归CLI；不在组合兼容面新增规则 |
| Web | apps/web/src/server/api.ts → src/core/application/web-server.ts；job/AI连接由各server家族拥有 | 保留已有接口；操作台命名/手册为本轮已授权UI变化，不重做全部页面 |
| Forge | 模块application/runtime等消费 forge-browser-runtime，连接、来源库、encounter等走对应公开子入口 | 当前工作成果需owner交接后才能核真正组合；不覆盖它或假装旧源码为最新 |
| Resolver | 模块消费spell-manifest-contracts；producer为generation/actor-spell-manifest | R1–R3已核；没有Forge模块硬依赖 |
| Species | accepted ledger→generation/species→本模块构建IO | 既有边界和5项目标/hash/UUID检查通过，保持content-only |
| Blood Hunter | 冻结blood-hunter-v14公开编译入口→模块pack/migration契约；Preview纯逻辑独立 | BH1/BH2本地完成；写入迁移模式未定 |

`src/core/spell-resolution/types.ts`等契约出口为re-export，但resolver/planner等仍有真实实现，不能把整个目录当纯兼容壳删除。

## V14默认迁移的实际调用清单

CLI main.ts的`--fvtt-version`默认及两处回退仍为12。workflow的singleFileConversion、collectionConversion两处、itemTextWorkflow、plainTextActor、obsidianSync省略版本仍为12；canonicalActorCollection已为14，Web初始也为14。两类行为不可混写。

K4需与当前Forge/共享核心实际成果对齐后，针对以上入口实施一个明确的默认迁移切片，并同步测试/手册/根操作约定；本批不把历史默认静默改掉或删除V12。K2也应选择真实当前消费者家族，等待Forge交接，不按旧基线重写它正在变动的生成链。

A2/A3的新Web状态家族和AI产品行为尚无本轮新增使用场景；已有协议/Provider/秘密边界保留。无需为了合集销售先部署Web或新增远程执行。
