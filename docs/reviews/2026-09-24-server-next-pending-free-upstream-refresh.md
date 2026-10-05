# ServerNext 待迁免费模块：官方上游复核（2026-09-24）

> **专项证据，不是当前进度表。**本页保留标题日期的来源和检查经过；其中“当前”“未执行”等只属于当时。新对话以[唯一迁移交接报告](../plan/server-next-migration-handoff-20260927.md)为准，仅在核对应证据时读本页。

目标是 Foundry 14.368 / dnd5e 6.0.2。本次于 2026-09-24 02:05 UTC 只读复核九项待迁/关键依赖的官方发布 manifest 与 Midi 开发分支；前一天全部 85 项基准见[上游审计](./2026-09-23-server-next-all-mod-upstream-audit.md)。这里的 `CURRENT` 只指版本与已装或前日记录相符，不提升为运行时语义通过。

| 模块 | 官方入口与当前声明 | 目标处置 |
|---|---|---|
| [Token Action HUD D&D5e](https://github.com/Larkinabout/fvtt-token-action-hud-dnd5e/releases/download/2.1.0/module.json) | 2.1.0；dnd5e 5.1.0–5.99，verified 5.3.1 | `HOLD_UNSUPPORTED`，不能用 dnd6 目标直接安装 |
| [Token Action HUD Core](https://github.com/Larkinabout/fvtt-token-action-hud-core/releases/download/2.1.1/module.json) | 2.1.1；未列 dnd5e 系统范围 | 版本未变；依赖适配器仍受阻 |
| [Plutonium CN](https://github.com/5eTools-Plutonium-CN/Plutonium-CN-Next/releases/download/v2.15.6/module-foundry14.json) | 精确 ID `plutonium-cn` 2.15.6，dnd5e maximum 5.3.999 | `HOLD_UNSUPPORTED`；英文版不是同一包 |
| [5e_chn](https://github.com/fvtt-cn/5e_chn/releases/download/5.3.0/module.json) | 5.3.0，Foundry verified 12、dnd5e verified 3.3.0，未列 maximum | `HOLD_COMPAT`，未证实目标支持 |
| [dnd-simplified-chinese-babele-patch](https://github.com/feederze/dnd-simplified-chinese-babele-patch/releases/download/latest/module.json) | `latest` 资产从前日 1.0.162 变为 **1.0.163**；Foundry minimum 12 / verified 13，未列 dnd5e systems | 台账改为 1.0.163，仍 `HOLD_V13`；可变 `latest` 标签日期不能充当资产变更时间 |
| [zzz_mod_chn](https://github.com/Memorize-Remix/fvtt_mod_chn/releases/download/13.99/module.json) | 13.99，Foundry verified 13，未列 dnd5e systems | 版本未变，`HOLD_V13` |
| [Midi-QOL 稳定版](https://gitlab.com/tposney/midi-qol/-/releases/v14.0.12/downloads/module.json) | 14.0.12，dnd5e maximum 5.3.99；[官方 dnd6 分支](https://gitlab.com/api/v4/projects/tposney%2Fmidi-qol/repository/branches/dnd6) 在02:05 UTC为 `4338eeab85041cd71b76ede36818e2265cbf06ae`，09:45 UTC已前进为`43444e15ad4ce1a2fa3c25a36c868a198d57744a` | 稳定版不替换本地 local.8 dnd6 候选；保留其独立语义缺口，新分支提交另核 |
| [DAE](https://gitlab.com/tposney/dae/raw/v14/package/module.json) | 14.0.14，Foundry verified 14.367，未列 dnd5e systems | 已装版未变；历史 `isDamaged` 实测失败不因版本核对消失 |
| [Tidy5e Sheet](https://github.com/kgar/foundry-vtt-tidy-5e-sheets/releases/download/v14.1.2/module.json) | 14.1.2，dnd5e minimum/verified 6.0.0、maximum 6.0.x | 已装当前官方版；按用户规则不重复玩法测试 |

本次查询 GitHub 官方发布与资产、GitLab 官方发布/manifest；后续 GitHub API 请求遇到 403 限流，所以**预发布版本未完整复查**。AnySearch 本地脚本没有可核对的原始校验值，未执行；改读发行方官方端点。没有安装、启停服务或修改世界。

新候选复查步骤：下次安装/最终交付前，对本表 `HOLD` 项重新读取同一发行方 manifest，核对 `id/version/compatibility/relationships.systems` 和资产是否发生变化；若出现精确 dnd5e 6 支持，再按包来源规则区分免费更新与付费只记录。对仍无系统声明者，不从 Foundry verified 数字推断 dnd5e 6 可用。

## 同日 09:45 UTC 再刷新

按用户要求重新读取上表九项发行方 manifest；GitHub 七个仓库的 `/releases/latest` 重定向仍分别指向 HUD D&D5e 2.1.0、HUD Core 2.1.1、Plutonium CN v2.15.6、5e_chn 5.3.0、Babele `latest`、zzz_mod_chn 13.99、Tidy v14.1.2。逐份 manifest 的 ID、版本及兼容声明与上表一致，Babele `latest` 资产仍是1.0.163。GitLab 的[稳定版 Midi-QOL](https://gitlab.com/api/v4/projects/tposney%2Fmidi-qol/releases/permalink/latest)仍为 v14.0.12且其manifest的dnd5e上限仍5.3.99；[DAE 最新版](https://gitlab.com/api/v4/projects/tposney%2Fdae/releases/permalink/latest)仍为 v14.0.14。

**新变化**：[Midi-QOL 官方 dnd6 分支](https://gitlab.com/api/v4/projects/tposney%2Fmidi-qol/repository/branches/dnd6) HEAD 从本地候选锁定的 `4338eeab85041cd71b76ede36818e2265cbf06ae` 前进为 `43444e15ad4ce1a2fa3c25a36c868a198d57744a`。[官方 compare](https://gitlab.com/api/v4/projects/tposney%2Fmidi-qol/repository/compare?from=4338eeab85041cd71b76ede36818e2265cbf06ae&to=43444e15ad4ce1a2fa3c25a36c868a198d57744a)显示[单次提交](https://gitlab.com/tposney/midi-qol/-/commit/43444e15ad4ce1a2fa3c25a36c868a198d57744a)，标题明确为“WIP (not a release): dnd6 fixes + manifest now v6-only”，改动涉及 Workflow、Activity、ammunition、concentration、manifest等，作者还注明 applicableEffects 的 M3/M4 读取点未完成。独立只读对照确认该 diff **没有**改 `isDamaged`、`expireTargetEffects`、`_onApplyDamage` 或 `DamageApplicationElementMidi`，故没有取代 local.9 的基础 `isDamaged` 修复；新 manifest 反而把 DAE 最低依赖从14.0.14提高到14.6.0，而当前 ServerNext 安装 DAE14.0.14。此 WIP 不能直接作为当前目标更新包；暂保留已锁定、测试并复审的 local.9，待正常关世界后按原范围安装与真实E2E，不为追一个非发行提交立即重锁定、扩大依赖更新。后续若官方发布可用新包，再检查其 dnd6 声明、DAE 依赖和本地补丁是否可删除。此次只是公开来源只读核查，没有改动锁定 SHA、模块文件或服务。

## 12:15 UTC 精确再查

直接读取[官方 Midi dnd6 branch API](https://gitlab.com/api/v4/projects/tposney%2Fmidi-qol/repository/branches/dnd6)于12:15:14 UTC仍返回 HEAD `43444e15ad4ce1a2fa3c25a36c868a198d57744a`，标题仍为 WIP 非发行；[官方 DAE latest API](https://gitlab.com/api/v4/projects/tposney%2Fdae/releases/permalink/latest)于12:15:24 UTC仍为 `v14.0.14`。搜索/页面抓取缓存曾显示旧 Midi HEAD，故以此次直接API读取为时点证据。ServerNext 已装 Midi local.9；真实手动 APPLY 尚未执行，第二轮受控宏仅到效果准备态即失败，见[最新迁移交接报告](../plan/server-next-migration-handoff-20260927.md)。这次没有下载、安装或操作世界。
