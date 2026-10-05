# ServerNext DFreds Droppables 正式包复核（2026-09-28）

## 结论

发行方 [v6.2.1 固定发布](https://github.com/DFreds/dfreds-droppables/releases/tag/v6.2.1) 仍是 2026-09-28 的最新正式版，manifest 声明 Foundry14 精确范围、无系统或必需模块依赖。发布 ZIP 和 manifest 的完整 SHA-256 与 GitHub Releases digest 一致，但 ZIP 运行脚本含一个**未解释的构建身份与路径风险**，因此本轮保持 `HOLD_PACKAGE`，不安装或启用到 Next。这里是静态风险判断，不称已在目标客户端复现 FAIL。

## 精确证据

- 官方 `module.json` 为 `dfreds-droppables` `6.2.1`，ZIP 根目录含24个文件，声明入口 `dfreds-droppables.mjs` 存在。manifest SHA-256 `FC0366B855A46FADED1B3D65258A693BA5958792D5766F22D0521448647A90BF`；ZIP SHA-256 `D67E9813496E8186A167D821713FB881B003BA5AECBA3465EBF3CAA80D4893F1`。只读下载件保存在 `F:\FoundryLab\foundry-v14\evidence\server-next-migration\droppables-next-20260928`。
- ZIP 内 `module.json` 与发行方版本均为6.2.1，但运行入口打包出 `var MODULE_ID={id:"dfreds-droppables",...,version:"1.2.5",...,download:".../v1.2.5/..."}`。入口随后多次将该对象直接传给 `game.settings.register(MODULE_ID,...)`，并在 `modules/${MODULE_ID}/templates/drop-token-files-dialog.hbs` 中作为路径字符串使用。普通对象字符串化为 `[object Object]`；如果这些路径执行，就不会指向 `modules/dfreds-droppables/...`。这不仅是显示用版本常量不一致。
- Mirror 旧 `6.1.2` 安装包的入口也内嵌 `MODULE_ID` 对象与 `1.2.5`，因此不能凭当前静态发现断言该问题始于6.2.1，也不能从 Mirror 保存开关推断实际拖拽路径可用。
- v6.2.1 的发行说明只写修正放置时的层级处理，没有解释上述构建内容。未改作者包、未在 Next 复制旧版本、未触碰任何世界资料。

## 复查步骤

下次只查发行方后续正式包及对应构建源码：确认 ZIP 中的入口如何获得字符串模块 ID，检查 `game.settings`、模板路径和文件上传路径的实际参数；若作者提供修正包，再按固定标签 digest、清单、单批启用及真实拖拽行为验收。不要自行修补 ZIP 后冒充官方6.2.1。
