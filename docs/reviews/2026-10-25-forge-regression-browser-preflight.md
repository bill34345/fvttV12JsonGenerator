# Forge回归验收：本地登录前置调查

本记录只说明2026-10-25本批浏览器前置，不是Forge生成或运行验收。目标为既有Mirror进程35448、Core14.368／dnd5e5.3.3／cor-cotn／30001；未重启服务，未更改Core、系统或其他实例。

## 事实与判断

首次通过官方Chrome在`127.0.0.1:30001`登录，界面及服务日志显示认证成功，但随后没有world数据交付记录；页面观察出现`Page.getFrameTree`超时，后续官方截图实际仍为登录页、0名玩家。读取失败不能被当作已经进入世界。

官方页面清单显示另外两项正在使用`127.0.0.1:30002/game`和`127.0.0.1:30003/game`。本地精确Core源码`F:/FoundryLab/foundry-v14/app/14.368/dist/sessions.mjs`中，登录Cookie固定命名为`session`，未以端口区分；没有读取任何浏览器Cookie值。[RFC6265 §8.5](https://www.rfc-editor.org/rfc/rfc6265#section-8.5)明确说明Cookie不按端口隔离。因此同主机名的多实例存在相互覆盖会话的合理解释。

先只读确认`localhost:30001`仍指向同一PID和同一join页面，再用官方Chrome登录该主机名。此次服务随后实际交付world数据，界面也进入game并打开Forge。此对照支持主机名会话冲突判断；未读取Cookie值或复现覆盖动作，不能宣称已证明每次工具超时都由它造成。此措施仅改变本任务访问同一服务的主机名，不清Cookie、不复制Lab、不修改其他任务页面。

## 有范围的外部核查

先使用已配置AnySearch检索精确错误与Foundry登录／会话症状。没有找到可直接对应当前官方Chrome组件版本的`Page.getFrameTree`修复案例；搜索摘要未被当作修复证据。随后读取原始资料：

- [Foundry官方排障页](https://foundryvtt.com/article/troubleshooting/)涵盖密码与安全模式等一般情况，不能解释本例已认证后重新到join；未据此重置密码、关模块或重启共享服务。
- [一手日志讨论](https://www.reddit.com/r/FoundryVTT/comments/od6i4k/question_about_logging/)区分创建客户端会话、认证成功及world数据交付。该讨论是旧版本经验，只帮助选择本地日志检查项，不作为14.368行为的单独证明。
- Cookie端口边界以RFC原文、本地14.368源码和实际两个主机名对照共同判断。

本轮没有待本地化的新模块候选，也未把搜索得到的重定向模块列为修复。若新浏览器／Core版本再出现同类问题，先核实际主机名、Cookie名称定义、认证与数据交付的差别，再决定是否适用本次解释。

## 工具生命周期与配置

沿用同任务Chrome执行器、gpt-6.1-sol／medium；它从自身实际turn_context核实FullAccess。官方组件26.1021.31345连接成功；未用CUA、裸CDP或其他通道绕过。旧owned页在后续turn中失去handoff标记后不存在，已核清单再建立唯一替代页；后续每个恢复turn重新标记真实待续页。

Chrome扩展backend未提供visibility能力，management的激活参数也被组件拒绝；未换通道尝试。用户可手动选择`🔎 Forge 回归前置核验`标签组中的localhost页面。

localhost有既有单条候选，不能用新候选保存覆盖。当前准备只在正常界面做分析，再通过正式workflow续接；原始回复使用现有私有responseEvidence接口取证。后续创建和恢复记录仍须按实际入口核对，不因登录成功而接受。

非敏感取证在本批`forge-regression-recovery/browser/`：`preflight.md`、登录截图、`connection-readiness.json`和世界基线。认证日志只在本机读取，不把会话标识、凭据或未脱敏日志放入本报告。
