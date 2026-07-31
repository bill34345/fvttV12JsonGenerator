# ADR-0004：代码重整期间保持 Obsidian vault 路径兼容

- 状态：Accepted
- 日期：2026-07-31
- 决策人：项目用户

## 背景

项目的默认输入、输出、crawl artifacts、文档和用户操作习惯都以
`obsidian/dnd数据转fvttjson` 为中心。将内容目录与代码 package 同时搬迁，会把架构重构、内容迁移
和用户工作流变化混成一个无法独立验收的改动。

## 决策

在 contracts、application facade 和 workspace package 迁移完成前：

- 默认输入仍是 `obsidian/dnd数据转fvttjson/input`；
- 默认输出仍是 `obsidian/dnd数据转fvttjson/output`；
- 最终 Actor JSON 仍只能由项目 CLI/workflow 生成；
- 不把 vault 移到 `content/`；
- 不改变现有 CLI 参数和 Web job schema。

代码边界稳定后，再单独决定 vault 是否迁往 content repository。该决策需要独立的内容版本、权限、
插件配置、发布节奏和路径兼容评估。

## 后果

- 第一轮重构不需要批量更新用户文档和输入路径；
- 可通过 pre/post CLI 生成结果直接比较行为；
- `.local` 运行数据治理与 vault 内容治理保持为两个独立阶段。

