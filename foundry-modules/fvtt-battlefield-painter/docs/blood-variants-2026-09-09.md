# Blood随机素材库 · 2026-09-09

用户要求血迹作为地图元素，多准备图片并在生成时随机选择。本轮将每阶段扩充至3张，共6张，原有两张作为变体0保留不变，新增4张原创PNG。没有扩展其他效果，也没有提交、合并、推送或生产写入。

## 行为

- 仅首次绘制新的血迹格调用随机选择，三个候选等概率；允许相邻格偶然重复，不是轮流排图或强制去重。
- 每格保存bloodVariant=0/1/2，正式Tile路径直接指向本阶段对应PNG。选图结果在场景文档中持久化，不在draw/refresh中重新随机。
- 阶段切换沿用同一变体编号，换成本阶段对应图片；未命中的格保持原图。
- 刷新、擦除邻格、拆分bundle、失败恢复、撤销重做保留原选择。擦除后重新绘制是新的随机选择，仍可能抽到相同图。
- 旧blood-static-v1无bloodVariant时默认0，保留原有素材。其他配置或非法变体编号不能伪装成有效血迹所有权。
- 保持静态、不发光、不减速、不加状态。没有新增性能/质量切换。

## 验收

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 4张新增素材 | PASS | 1254×1254真实RGBA，inspect_asset检查；原图与100px格子底图合成自审 |
| 6种构图区分 | PASS | 原飞溅/滴落轨迹/侧向飞溅；原血斑/斜拖痕/片状血斑；地图混排减少固定图案重复 |
| 单元与集成测试 | PASS | 208 tests、3788 assertions、32 files、0 fail；覆盖随机只调用新格、history、服务重建、故障恢复、旧标记兼容、非法编号 |
| 类型/构建 | PASS | 模块typecheck，正式37文件分发树与安装hash一致 |
| 方格随机混排 | PASS | 正式画笔I/II各18格；I的0/1/2数量3/8/7，II数量6/5/7，六种素材实际加载 |
| 页面刷新 | PASS | ignoreCache实际reload后返回活动场景，再打开测试场景，36格路径/编号/旋转逐项完全一致 |
| 方格阶段与历史 | PASS | 仅3:3图片切换，编号不变；阶段撤销完全恢复；擦除后35格邻居不变，undo36/redo35对应精确原选图 |
| 两种六角格 | PASS | type2/type4正式画笔随机混排；横列擦除/undo、纵列阶段/undo保持原编号与图片；矩形Tile适配 |
| 所有权与清理 | PASS | 清除保留外部Tile；原view/active/paused恢复，3个临时场景和本轮标签清理，Lab停止 |
| 独立玩家/生产/长时 | NOT_EXECUTED | 本轮不重复未改变的移动规则或长时测试 |

本地Foundry14.364 / dnd5e5.3.3，server-mirror/cor-cotn，Node28552、30001；09:39:31 UTC启动，09:58:58 UTC前停止，约19分27秒，未到25分钟保护。view/active=k0tDQjWqrbvHbjdu，paused=true已恢复。

测试场景PuOKYv1TfFemz0aV、Cvq2zaui0zwqukWZ、2HTbP6KXxjm0rjOX，核对owner=blood-variants-20260909且非active后删除。刷新返回活动场景时取得的一次非测试快照已明确标为reload-returned-active-scene-not-test，未把该快照误报为测试结果，亦未修改该活动场景文档。

证据目录：`C:/Users/Administrator/.codex/visualizations/2026/09/09/01a0843e-d848-7653-90c7-311e93f0dab6/blood-variants/`。包含variant-art-review.png、square/hexrows/hexcols-runtime.png、runtime-preview.png、before-reload.json、runtime-result.json、4份asset检查、tests.log、build.log、preservation.json及安装/运行/停止hash证据。

本轮全部28个既有素材文件hash不变。新增素材为代理自审通过，不称用户逐张确认。随机允许重复，六角格不是专用六角贴图；1280×720有Foundry高度警告，所测操作完成。Blood原有无状态副作用、GM拖拽验收仍参见此前blood-integration记录，不冒称本轮重新验证。Flooding和新版Lava阶段I的旧实机缺口不变。

### 血迹随机素材定稿确认 · 2026-09-09

用户回复“这个可以没问题”，确认当前血迹每阶段3张、共6张素材，以及首次绘制逐格随机、之后持久保存、阶段切换沿用变体编号的行为。此前仅代理自审的新增4张现升级为用户已确认基线。此确认不扩大提交、发布或生产权限。
