# B08 — 玩家空间音频录制

> **RETIRED — NOT APPLICABLE / 不再执行。** Battlefield Painter 音频功能已退役；本文件保留历史音频验收要求，不得录音、寻找 OGG、创建音频 PASS 或将音频缺失判为当前代码故障。当前退役契约由 R02 验收。

只推进 `P2-006`。前提是 B00 双身份和 B07 Square P2 已完成。使用内置 Browser 玩家视口；Chrome GM 只负责移动声音/墙体 fixture。

先做一次不超过 10 秒的 Xbox Game Bar 录制预检：聚焦 Codex 玩家窗口，`Win+G` 核对 Capturing audio 为 `All`，用 `Win+Alt+R` 开始/停止；确认新文件确有视频轨和非静音音轨。Game Bar 已安装；不得读取浏览器存储。预检失败只尝试一次，冻结原因后把本批标 `PARTIAL — USER AUDIO REVIEW UNAVAILABLE`。

预检成功后录制一段连续证据：玩家 Token 对 fire/frost/brambles 三种 OGG 分别执行远处、接近、离开；再隔着 mature bramble wall 重复，口头/画面标识当前 terrain/stage。GM 同时保存 AmbientSound volume/radius/walls 字段，玩家端保存媒体事件和播放时间推进。

Game Bar 生成的是 MP4，不得只改扩展名。精确识别本批新生成的 MP4 后，用现有 `H:\FFmpeg\bin\ffmpeg.exe` 以 `-n` 转码为 VP9 视频＋Opus 音频的：

`F:\FoundryLab\foundry-v14\evidence\battlefield-painter\2026-08-14-92346b3\BP-E2E-018-player-media-audio.webm`

不覆盖既有文件。用 ffprobe 证明目标容器、视频轨、非静音音频轨和时长正确后，使用 `Remove-Item -LiteralPath <本批精确 MP4>` 删除本次任务创建的源 MP4，不加 `-Force`；失败则停止并报告精确对象。Luna 只能报告“录制完成、等待用户听音”，不能代替用户判断听感；向用户给出绝对路径并停。用户确认前 `P2-006` 保持 PARTIAL。
