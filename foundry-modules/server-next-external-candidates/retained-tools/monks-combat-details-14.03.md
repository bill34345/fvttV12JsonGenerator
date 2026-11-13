# Monk’s Combat Details 14.03

适用于 [14.03 发布版](https://github.com/ironmonk108/monks-combat-details/releases/tag/14.03)，提交 `311c490626d1fda5d63a367922f89a01e7ac7099`。[作者说明](https://github.com/ironmonk108/monks-combat-details/blob/311c490626d1fda5d63a367922f89a01e7ac7099/README.md)把自动切聊天描述为开战时的动作。两份补丁可分别采用。第一份限制切换时机，第二份只排队处理同一时段的后续原生先攻浮窗，保留原来的提醒条件、消息、顺序和接收者。

解包到独立目录。用 `Get-FileHash monks-combat-details.js` 核对原文件 SHA-256 为 `4e3fc30cc98cfcc73f56cb0b3ed46399fb5f8c57f3b88f222db96e630d703852`。在该目录运行 `git apply --check`，再运行 `git apply`，两次都按顺序传入以下补丁的绝对路径：

1. [开战切聊天](monks-combat-details-switch-chat-14.03.patch)
2. [批量先攻浮窗](monks-combat-details-initiative-notifications-14.03.patch)

在仓库根设置 `MONKS_COMBAT_DETAILS_SOURCE` 为未修改的官方脚本绝对路径，运行 `bun run test:monks-combat-details-patches`。它会把补丁应用在独立的临时文件上，验证与本地实测文件同摘要，并执行原版和候选脚本中的实际回调。

补丁保留 IronMonk 上游署名，按上游 [GPL-3.0](LICENSE.monks-combat-details.txt) 条款提供。
