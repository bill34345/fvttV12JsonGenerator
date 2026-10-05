# 非音效功能验收 — 2026-09-12

用户已确认前一轮截图/视频的视觉效果，要求音效最后处理，并授权先完成荆棘规则、Region铺设、Shift恢复、擦除/历史/刷新和两种六角格验收。狂野魔法和裂隙继续排除。本轮没有修改美术、颜色算法、移动倍率或音频。

## 修复

实机发现Shift选择地形有两个问题：controller.activate触发订阅重绘，与ApplicationV2.minimize异步动画并发，导致DOM带minimized类但核心minimized状态为false；从擦除模式Shift选地形时也仍保留擦除模式。

`src/painter-app.ts`现在在配置地形期间暂停订阅重绘，Shift选择明确切回paint，配置完成后一次render再minimize；等待笔画时不重绘，笔画完成/停用后先maximize再render。close清除待恢复标记，避免关闭流程重新展开。新增回归测试复现重绘清除minimized状态的条件，验证从erase进入paint、等待期间不重绘，以及完成后恢复顺序。旧面板测试的渲染次数由10改为9，原因是移除了重复渲染，行为断言保留。

## 验收结果

环境：Foundry14.364 / dnd5e5.3.3 / 本地server-mirror / Gamemaster。音效开关始终关闭。

| 检查 | 方格 | 横列六角 | 纵列六角 |
|---|---|---|---|
| 荆棘疏根→密枝→棘墙、移动成本、核心碰撞 | PASS | PASS | PASS |
| 荆棘擦除、撤销、重做、清除保护外部Tile | PASS | PASS | PASS |
| 酸液图与光源擦除/历史 | PASS | PASS | PASS |
| 蓝色火焰图与光源擦除/历史 | PASS | PASS | PASS |
| 紫色整张符文、孔洞、原图范围、历史 | PASS | PASS | PASS |
| L形Region、孔洞、重叠去重与铺设入口 | PASS | PASS | PASS |
| Shift选项收起与落笔恢复 | PASS | PASS | PASS |

运行日志有18条最终PASS（每格型6组），另保留2条初始失败：Region测试已铺设/清理完成但工具序列化返回文档数组失败，改为返回布尔值后复查；Shift为上面修复的真实产品问题，其同名复测PASS。第一轮荆棘撤销比较还误含Core嵌套统计字段，之后仅排除系统`_id/_stats`，保留全部业务数据重新比较通过，不把元数据重建算地形丢失。

Region独立预期按格心与手写L形/孔洞坐标判断，三格型分别15/18/19格。方格和纵列六角通过Shift+P，横列六角通过面板按钮；方格按钮在首次工具返回值失败前也完成了正确铺设。原生Region负责轮廓含孔判断，不要求Tile像素边缘逐像素贴合Region。

荆棘规则的实际数值：疏根5尺距离消耗5、无墙；密枝和棘墙5尺距离消耗10，棘墙核心move碰撞true，sight碰撞false。**旧配置对飞行也应用2倍成本**，本轮保留了这一规则，没有擅自改变移动动作范围。证据使用实际Token.createTerrainMovementPath/measureMovementPath/checkCollision，不是JSON字段推测；没有把它称为独立玩家鼠标拖拽验收。

刷新检查：真实刷新页面后，方格棘墙、横列六角酸液、纵列六角蓝色火焰的业务文档与刷新前一致，纹理有效；酸液16个材质、彩色火焰16个材质挂载正常。另把纵列六角整张紫色符文从16格擦为15格后再次刷新，colorId、sheetCells、sheetFrame及图/光业务文档全部相等，单张mask材质挂载正常、diagnostic=null。刷新后测试工具旧Playwright evaluate超时，改用同一CUA支持的CDP读取实际面板与格位坐标后完成，没有因此修改产品代码。

人工查看了六角棘墙、带孔Region铺设、重载后的紫色符文截图：素材可见、区域与孔洞符合按格铺设的定义。此轮没有重做用户已批准美术。

机械：305测试、5824断言PASS；typecheck、build、diff检查PASS。修复安装91文件；构建与已安装main.js SHA256均为`BA91473F02726BC486A409BC9DFED29551C542B365B3AF0E65AAB469165BC593`。

## 清理与证据

证据目录：C:/Users/Administrator/.codex/visualizations/2026/09/09/01a0843e-d848-7653-90c7-311e93f0dab6/parity-runtime。

主要文件：harness.mjs、results.json、bramble-undo-0/1/2.json、reload-before.json、reload-results.json、rune-hole-reload.json、rune-hole-reloaded.png、tests-final.log、install-before/after.json、cleanup.json、server-stopped.json。

本轮3个随机测试Scene于11:46:30Z通过原生API删除，连同测试Token及所有子文档；view/active恢复`k0tDQjWqrbvHbjdu`，paused恢复true。进程30836开始于11:28:57Z，修复后进程46688仍沿用最初25分钟截止保护，最终于清理后停止，没有拼接超时。未生产写入、提交、合并、推送或创建备份。

## 保留范围

当前这批非音效功能验收PASS。音效试听/播放、独立玩家客户端和长时运行NOT_EXECUTED；前两项不混入本轮结论。狂野魔法/裂隙及自有新玩法均未追加。
