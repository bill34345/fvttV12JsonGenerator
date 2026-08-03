# 文档输入包规则

## 用途

`ingest-documents` 负责把 PDF、PNG、JPG、JPEG 和 WebP 变成带页码、坐标、识别方式和置信度的原始文字块，并在翻译前筛选 NPC/怪物 stat block。它不直接实现 Foundry Actor/Item 生成规则。

## 修改范围

- PDF 必须优先使用文字层和坐标重建阅读顺序；扫描页或图片才进入 OCR。
- 候选筛选必须是确定性的、本地的，并在任何翻译或 AI Intake 调用之前完成。
- 原始 Markdown、候选清单和提取报告必须先写入独立 run 目录。
- OCR、翻译和 Intake 都通过适配器/注入接口接入；单元测试默认使用 fake，不依赖网络。
- 不把文档原文件复制到 Vault，也不在本包中维护 Foundry JSON 字段映射。

## 验证

- 覆盖 PDF 页级文字顺序、并排候选、中文/英文/混排筛选、机械字段保护和服务失败状态。
- 修改后运行 `bun run typecheck:packages` 以及受影响的文档输入和 workflow focused tests。
- 真实 PDF/图片验收必须比较原页面、原始 Markdown、翻译 Markdown、标准 Markdown 和最终 Actor JSON；代码测试通过不能替代语义对照。
