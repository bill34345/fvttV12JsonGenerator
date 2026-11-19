# 图解手册生成

`../src/guide/guide-source.json` 是 HTML 与 PDF 的共同正文来源。截图放在 `../src/guide/images/`，在对应章节的 `images` 中填写模块内相对路径、替代文字和图注；只使用当前版本的实际界面截图。

在仓库根目录执行：

```powershell
python foundry-modules/fvtt-json-forge/scripts/build-guide.py
```

PDF 生成需要 ReportLab。优先使用已包含该依赖的 Python 环境；中文字体默认使用 Windows 黑体，可通过 `--font <字体路径>` 或 `FORGE_GUIDE_FONT` 指定其他中文 TrueType 字体。只更新 HTML 可用 `--html-only`。

生成器更新 `src/guide/index.html` 与 `src/guide/guide.pdf`。不要直接编辑这两个产物。Foundry 阅读窗口从 HTML 提取带固定标识的正文与作用域样式，不使用 iframe；窗口目录只滚动到相应章节。生成后检查 PDF 排版和手册内链接，再由模块原有构建流程打包。既有原文与生物导入示例不由生成器改写。
