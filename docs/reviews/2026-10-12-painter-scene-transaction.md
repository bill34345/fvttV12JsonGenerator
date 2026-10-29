# Painter P1/P2：一次笔划的计划与真实保存边界

P1已有纯scene-plan接口；单格Square Fire产生Tile/Region/Light各一，现有规划/所有权/事务14项检查通过。保留这条边界，不新增效果或美术。

P2原接口接受非空计划的空create返回，TerrainService仍报告createdCells。新反例覆盖空/部分/重复/外来ID、归属错配、删除被拒和抛错，以及后续Region创建时向Tile或原本空的Sound集合插入未报告对象，均先红后绿。

事务现在以五集合baseline和计划flag预检，核每类型数量、唯一新ID和实际Scene归属。最终再次读回全部集合；失败只删除本次返回且已确认归属的新ID，删除前再核归属，外来/未知新增保留并报告。删除失败、静默veto与残留明确列出，不宣称完整补偿。

最终模块coverage332项通过、0失败、6096断言、39文件；类型和build通过。独立审阅关闭最终集合漏检P2，未发现进一步阻断。真实Foundry Collection接口对照本地Core14.368；测试使用内存Scene，未执行浏览器或真实创建/删除，不把纯测试代替P3视觉、Undo/Redo或完整地形矩阵。
