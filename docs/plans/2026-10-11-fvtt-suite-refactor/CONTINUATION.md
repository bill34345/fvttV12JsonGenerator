# 本批接续点

本轮沿总计划连续推进，不开启 goal 模式。当前整体重构未完成；进度与完整证据以[唯一总账](EXECUTION_LEDGER.md)为准。

## 当前停点与已完成的独立工作

本轮不依赖浏览器的候选准备已收尾：Monitor46项、House75项/411断言、Painter332项/6096断言coverage、Babele14项/37断言与各自类型/包通过；独立复核发现的实质问题均修正。BloodHunter只读Preview19通过/1真实来源跳过，6构建契约通过，浏览器脚本可独立构建；Species既有纯内容边界5项/52断言通过。所有worker/reviewer已回报，无待收的委派。

只读共用包校验器6组测试及Monitor/House/Babele/Painter四个真实ZIP通过。手册36项、H4双交付4项/72断言、架构1304模块/2928依赖通过。交付与剩余门见[候选说明](RELEASE_CANDIDATE.md)和[机器目录](release-candidate-catalog.json)。没有运行全仓CI、安装新包或完成整体验收。

后续需Forge释放共享Chrome/源码交接，再接原生小计划；BH写入迁移模式、内容分发和品牌/渠道属于尚待明确的产品出口。不要以旧Forge基线继续重写共享核心，也不要为等窗口制造新功能范围。

## 必须保留的运行边界

- 用户最新明确答复：Forge 仍使用 5.3.3 网页，继续避开。不得操作 Mirror/30001 或在共享 Chrome 中重新登录 127.0.0.1。
- Next 最后一次核对为 PID38672、creation UTC2026-10-12T02:54:55.8460570Z、Core14.368/dnd5e6.0.6、仅127.0.0.1:30002/nobackups；服务指针在 `.local/suite-direction/h2-server-next-service.json`。这是历史运行读回，本次源码工作没有重新核对服务状态。
- 原生“返回设置”曾被服务收到，但世界未关闭。官方 Chrome 同一连接含30001和30002页面，登录隔离未知；专用 localhost 地址已被客户端 `net::ERR_BLOCKED_BY_CLIENT` 拒绝，不重试别名或改通道。
- IFS没有 normal-inactive + READY，禁止 apply。IFS 默认安装器会指向 Mirror/备份路径，不能调用。待 Forge 释放共享浏览器或正式独立登录环境可用后，按正常生命周期重新核对目标和身份，再接原生验收。
- WMP 本轮九个自有对象（含两 Macro）已全部删除，已知恢复完成；只保留原 Combat modifiedTime 例外与旧 User70b2 UNKNOWN。不重建旧宏或重放已接受的业务链。

## 已有成果与候选

H4 双交付以及 Deck、TE、CC、WMP 的限定代表链已有原生证据；证据只覆盖总账中的精确版本、角色与场景。

以下新候选均未安装：

| 模块 | 本地完成范围 | 精确包身份收据（`.local/suite-direction/next606/`） |
| --- | --- | --- |
| IFS | F1–F3源码；67项/423断言与类型通过 | `ifs-f1-f3-build.json` |
| TokenSync | S1/S3、同源只读帮助、共享正文渲染 | `tokensync-s3-shared-build.json` |
| Resolver | R1–R3、提交读回/精确恢复、同源帮助；349项回归 | `resolver-r1-r3-shared-build.json` |
| Chat Guard | G1–G3、缓存/监听/旧裁剪批次保护、同源帮助；48项回归 | `chat-guard-g1-g3-shared-build.json` |
| Monitor | M1–M3保存/恢复及帮助；46项 | `monitor-m1-m3-build.json` |
| House | H1/H2药水事务；75项 | `house-h1-h2-build.json` |
| Babele | B1–B3匹配/渲染及正文；14项 | `babele-b1-b3-build.json` |
| Painter | P2事务；332项coverage | `painter-p2-build.json` |

最新 H4 模块 ZIP 为 `1ee2a4d9e32ad6ac0eb86bdd59a05ccb3507fd5f03d1a996e1685e79ffbbe7ca`，完整离线 HTML 为 `1c0366923fc00d7f14818f822bf4cc580fd254037bd7e3113cc1f3e4726ce3f1`。位置为 Suite 的 `dist/release/`；36项手册、重复构建一致性与架构门通过。当前包已经包含本批手册更新；不覆盖旧证据含义。

## 接续顺序与权限

Monitor/House/Painter/Babele与内容Preview切片、本地发行目录已经收尾；下一步按上述真实前置接续总账。已有源码证据不替代 Foundry 原生出口，不虚构 H5，不把浏览器阻塞扩成整个项目停工。

所有写入留在本任务 sibling worktree `20261011-144833-suite-direction-console-handbook`。无 commit、merge、push、仓库改名、商品发布或生产操作。需要产品/发行决定时，先准备具体候选；已有权限不重复索取。
