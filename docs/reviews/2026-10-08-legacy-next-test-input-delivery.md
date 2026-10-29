# ServerNext 历史测试输入接入

## 范围

用户授权把旧迁移树仍被测试读取的材料接入本地 master。基线为 `6a7845650a04b8a78b458e5edd5f74fb2bb35ab3`；迁移实现本来已经合入主线，本次补输入交付与定位，保持历史来源身份。

- 仓库管理清单、一次性准备/只读校验入口、默认定位器、使用说明和手册。
- 主工作区接收目录为 `.local/legacy-next-test-inputs/data/`；170 个输入文件、220,267,059 字节，原包和私有分析数据继续保持本地 ignored。
- 清单身份为 `b463b195576d7d492773ebf78847cdccc34d038339970a264749eaadb8a275ec`，Midi 固定提交为 `4338eeab85041cd71b76ede36818e2265cbf06ae`。
- Classpack 身份报告读取当前 checkout；数据库查询在本次随机临时夹具中执行，保留原始输入的相对文件清单、大小及 SHA-256。

## 已取得的证据

使用 Bun 1.3.14，在非空历史输入根覆盖已清除的独立候选中运行：准备/定位 18 项、Midi 96 项、Classpack 47 项、external 4 项、DAE 9 项、DAE compendium status 4 项、Item Piles 14 项、Vision/Item Macro 9 项，共 **201 项通过**。全部查询结束后，170 文件完整校验仍通过。来源树的 Git status 与接入前相同，清单内全部来源文件再次验证匹配。

单次 `ci:verify` 通过环境隔离、AGENTS/手册、所有类型检查、架构、Session Monitor 构建和 CLI 检查，随后覆盖率因 `ffmpeg-static` 预期执行文件不存在而退出：3,967 通过、1 保留 skip、7 个 Painter 资源检查失败。复用本机已有 FFmpeg，通过包本身支持的进程级 `FFMPEG_BIN` 指定；资源定点复验 **9/9 通过**。没有修改资源或安装全局依赖。

通过原安全沙箱入口续跑完整覆盖率清单：**3,974 通过、1 保留 skip、0 失败，419 文件**，单进程报告，无合并计数。覆盖率阈值通过（生产行 85.84%、函数 86.77%），anti-overfit 434 来源通过，hygiene 2,221 路径通过，Web 构建与离线 Actor smoke 通过（6 个来源 Item、0 verifier warning、0 网络调用）。这是首次失败后的分段续跑结果，不把首次单次 `ci:verify` 写成 PASS。

固定参考来源检查另发现主工作区尚缺清单已锁定的 6.0.5 开发源码缓存。取得官方固定对象后，在原缓存外增加 `.local/references/dnd5e/6.0.5/repo` 的 detached checkout，HEAD 为 `3ee48de02f8f6f7b2638c9f6cf3e9540c9c181cc`；原 5.3.3 checkout 的 HEAD `965ad2d0cf5d063dac675ba078b5bd3c3c0dd449` 和工作状态保持。`references verify` 两项均为 `ok`。这是开发参考材料准备，未改变版本锁定或安装目标。

170 文件输入库已放入主工作区并重新完整读回。独立候选自身没有输入库时，定位出的 Midi、DAE、Classpack 路径均为主工作区的 `.local/legacy-next-test-inputs/data/`，不再指向旧迁移树。实现、说明和生成手册按授权一起集成本地 master；交付核对入口为 `handbook:check`、`legacy-next-inputs:prepare -- --check` 及相关离线回归。

## 边界

本次消除旧迁移 worktree 的测试输入依赖。现有 F 盘固定 Core/Node、系统方法、TCoE 来源和部分接受收据仍为本机参考依赖，公开克隆需要合法输入和对应环境。原包不随 Git 分发，离线通过不推广为新版本玩法接受。

这份接入覆盖清单内的测试输入；原树其余私有合同、原始收据、构建物及未清点范围沿用原审计结论，整棵旧树的清理单独判断。本次发布范围为本地 master，不包括远端推送或服务/世界操作。

操作与重验入口见[历史测试输入流程](../runbooks/legacy-next-test-inputs.md)。
