# Dice So Nice 6.4.4：减少骰子第一次显示时的短停

从 [Dice So Nice 6.4.4 正式包](https://gitlab.com/riccisi/foundryvtt-dice-so-nice/-/jobs/artifacts/6.4.4/raw/dist/dice-so-nice.zip?job=build)提取原版 `main.js` 和 `main.js.map`。固定上游提交为 `a21ede8b21a322b25fbf0d99dc89470f2ebe2711`，原包 SHA-256 为 `564fdf7e3044ac480e17d35afe156e91732f3334952c2daaaf04496e013ea046`。项目根安装锁定依赖后，在 Node 22 或以上运行：

```powershell
bun run prepare:dsn-board-normal "<解包后的官方目录>" "<尚未创建的输出目录>" --official
```

构建依次合成两份既有修复（释放被替换的旧画布 WebGL 上下文、合并同时到达的先攻遮罩重绘），再生成本次首次绘制优化。若手头已有经过这两份修复且摘要相符的 `6.4.4+local.2`，可去掉 `--official` 直接以它为输入。输出只有 `main.js`、`main.js.map`、`bump-normal-worker.js`，是一起使用的三个文件。命令不会安装模块。

验证时从相同提交的[官方源码](https://gitlab.com/riccisi/foundryvtt-dice-so-nice/-/tree/6.4.4)取得 `module/Dice3D.js`，设置 `DSN_CONTEXT_SOURCE` 指向它，`DSN_CONTEXT_OFFICIAL_PACKAGE` 指向解包的官方目录，运行 `bun run test:dsn-board-normal`。测试包括前置修复的行为、映射以及三个产物与实际验收文件的摘要对照。

只优化战斗画布使用真实光照且缓存还没有对应材质的场景。首次绘制仍可能短停，动画播放时间和游戏规则不变。补丁保留上游 Dice So Nice 署名，按其 [AGPL-3.0](LICENSE.dice-so-nice.md) 条款提供。生成产物包含上游代码，若另行再分发，须遵循上游适用的许可证。
