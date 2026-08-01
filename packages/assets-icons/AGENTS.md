# Actor 图片、Token 和图标规则

## 这个功能是做什么的

本目录管理 Foundry v14 图标解析、Actor 图片、Token 图片、裁切候选、人工审阅 contact sheet，以及可选的远程图片上传适配器。

## 不可违反的规则

- `actor.img` 与 prototype token texture 是两个不同用途的资产，必须分别路由和验收。
- safe icon mode 只能使用受支持目录、明确 override 或已验证 catalog；不得根据名称相似度静默替换成错误图标。
- 自动裁切结果是候选，不是人工美术验收。共享图片、非方形主体、透明边框和图像所有权风险必须保留给审阅流程。
- SSH/远程上传是外部写入；没有目标、凭据和明确授权时只允许 dry-run/本地计划。
- 不得把服务器凭据放入浏览器、前端请求、仓库或生成 JSON；公开 URL、远程路径和本地文件都要经过路径/协议验证。

## 修改入口

- 公共出口：`packages/assets-icons/src/index.ts`。
- `assets/` 管 Actor/Token 资产与审阅，`icons/` 管 catalog/override/报告。

## 验证

- `bun run typecheck:packages`
- 运行受影响的 icon/image/CLI 测试；v14 catalog 变化时运行 `bun run build:icon-catalog:v14` 和对应 locked reference 检查。
- 视觉结果必须查看最终 Actor 图、Token 图或 contact sheet；文件存在、尺寸正确和上传成功都不是视觉验收。
- 影响 Actor JSON 时继续执行正式生成与 `verify:actor`。

## 完成标准

- 资产来源、用途和输出 URL 可追踪，Actor/Token 没有互换。
- 自动检查通过且最终图片由人工查看，没有把候选误报为已接受。
- 任何真实远端写入都在当前授权范围内并有读回或等价验证。
