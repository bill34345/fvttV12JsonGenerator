# 图片 / PDF 文档输入

文档输入只承诺 NPC/怪物 Actor，流程固定为：

```text
图片/PDF → 本地提取 → 候选筛选 → 原始 Markdown → 候选翻译 → AI Intake → 现有生成器 → Actor JSON
```

## CLI

```text
bun run src/index.ts <file.pdf|file.png> --extract-only
bun run src/index.ts <file.pdf|file.png> --document-candidate <candidate-id>
bun run src/index.ts --document-doctor
```

支持的参数：

- `--document-engine auto|native|paddleocr`
- `--document-language auto|en|zh-CN|mixed`
- `--document-candidate <id>`（可重复）
- `--extract-only`
- `--document-target-language <language>`（默认 `zh-CN`）

每次运行会在 `.local/document-runs/<run-id>/` 生成 `raw-extracted.md`、`document-candidates.json`、`extraction-report.json`。原始 PDF/图片不会复制进 Vault manifest。

## 本地 OCR

普通 PDF 优先使用 PDF 内嵌文字和坐标；没有可靠文字层的页面会用 `pdfplumber` 的本地 PDFium 渲染后交给 PaddleOCR。图片直接走 PaddleOCR。Tesseract 只作为英文标点和专名提示，不替代主 OCR。

先运行 `bun run document:doctor`。如果需要创建隔离环境，可在项目根目录使用 Python 3.12：

```text
uv venv .local/document-ocr --python 3.12
uv pip install --python .local/document-ocr/Scripts/python.exe pdfplumber paddleocr==3.7.0 paddlepaddle==3.2.0
```

不同机器的 Paddle/PaddleOCR 组合可能不同；以 `document:doctor` 和一次真实图片 smoke 为准。OCR 缺失时流程会给出错误，不会静默把乱码送进生成器。

## 翻译和 Intake 边界

过滤发生在翻译之前，只有被选中的高置信度候选会进入 Markdown 翻译。翻译服务缺失、结果为空或机械字段占位符丢失时，候选会停在 `needs_review`，不会生成正式 JSON。

OCR Markdown 不是项目的结构化 YAML/Markdown 契约。正式生成默认需要现有 AI Monster Intake 配置；没有 Intake 配置时，文档链路会 fail closed。普通 `.md`、`.markdown` 和 `.txt` 仍走原来的入口，不受影响。

Web 入口使用二进制 `multipart/form-data` 上传，检查文件大小、MIME 和文件签名，并在任务沙箱中保存输入；提取完成后在任务摘要和报告中提供页数。任务完成后可下载候选清单、报告、原始/翻译 Markdown、标准 Markdown 和 Actor JSON；上传模式不会修改 Vault manifest。
