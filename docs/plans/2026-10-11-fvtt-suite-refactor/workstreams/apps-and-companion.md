# CLI、Web 与可选 Companion

总计划：[PLAN](../PLAN.md)；共同约定：[MODULE_CONTRACT](../MODULE_CONTRACT.md)。这些是执行/交互宿主，保留独立用途，不取代Foundry内统一手册，也不复制生成规则。

## 当前归属与目标

`apps/cli/` 拥有命令、退出码与交付；`apps/web/` 拥有页面、API/job、下载和AI连接；`apps/web/src/companion/` 是可选本机连接宿主。Web `App.tsx` 的输入、任务、审核和结果状态可以逐个收敛，不能一边重构一边默认更换整个用户界面。

## 切片

1. **A1 命令契约**：固定真实参数、默认路径、退出码和错误；配合K4单独处理V14默认，不给所有旧调用静默换行为。
2. **A2 Web状态家族**：选输入/上传、job状态、审核或下载其中一个，分离组件呈现、状态转移和正式workflow调用。已有API/安全/job契约保持，页面不shell-out CLI。
3. **A3 AI连接与Companion**：分清网站AI、BYOK与本机Companion的协议/身份、会话、取消和失败出口。Provider秘密留在规定宿主；配对、外部请求和成本由明确用户操作触发。
4. **A4 统一说明与边界**：Foundry手册说明什么时候需要这些宿主、怎么准备和取得结果；可提供明确跳转或导入入口，不在Foundry内执行任意本机命令。

## 必须保护

CLI公开参数/退出码、source identity、job已登记文件面、上传限制与path traversal防护、loopback默认绑定、公网显式认证/trusted proxy、会话/配对身份和取消语义。用户文档/下载不会暴露服务器bearer/API Key/Cookie。Companion不是为了隐藏无限AI成本的免费承诺。

## 真实接受与已有入口

只改一个状态家族时，检查对应真实上传/生成/审核/下载链及错误，不重放所有功能。Web/CLI共享接口变化各验证一条真实入口；修改AI协议必须用最小往返和故障输入证明，fake provider不能称真实服务可用。对未授权真实资料/Provider不请求执行。

已有入口：`bun run test:cli`、`bun run typecheck:apps`、`bun run web:build`、`bun run web:companion:build`。API/job或连接变化从模块现有安全测试入口选择，不用全仓CI寻找下一处局部问题。本轮未运行。

下一步：A1只读梳理与K1对齐；Web/Companion由实际客户使用场景决定后续切片，不把其部署作为每个mod的前提。

A1当前命令/组合面已核，见[source-boundary-audit](source-boundary-audit.md)。本轮不改变Provider协议或新增Web产品行为，A2/A3按实际需求另选家族。
