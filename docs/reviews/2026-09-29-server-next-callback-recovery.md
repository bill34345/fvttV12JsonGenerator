# 独立Chrome报告回传遗漏与恢复

## 已确认原因

用户要求检查独立任务未回报的原因后，读取其最新完成turn `01a0e855-74d0-73a3-88e6-1714d9a3e402` 与对应调用记录。2026-09-28 22:25:41（北京时间）执行器调用了task内 `send_message`，目标是 `/root`；该路径属于执行器自己的独立task。没有调用 Codex app `send_message_to_thread` 指向实际父任务UUID。工具记录中的task-local交互与其最后final都不能证明主任务收到报告。这次是回传通道用错，未观察到跨线程发送工具自身失败。

审计只记录工具、目标、时间和结果，不复制原始私有会话/加密消息正文。独立执行器ID为 `01a0e69f-fac9-7931-aa4c-7771c2236ba6`；正确父任务ID为 `01a0e0af-9d17-7bc3-a02a-391e051355a1`。

## 找回的业务结论

v3原样回执在[cn-source-inspection-readback.json](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/player-item-repair-20260928/cn-source-inspection-readback.json>)。7件失效条目现在均取得Plutonium CN来源信息。世界独立Item扫描180项，只找到海精灵父条目的1个匹配来源身份候选 `Item.6TYN6iWXJ1lANfsW`；内容不等价且候选没有可用ItemGrant列表，不能直接替换玩家种族或将其当9个授予特性的来源。7件均未修复，玩家写入0。

血猎手原导入来源为BloodHunter2024；牧师/法师为XPHB；海精灵/雅灵为MPMM；前邪教徒为TalDoreiCampaignSettingReborn；沃什塔克特工为EGW。下一步用准确的导入page/source/hash核现有正式文档，先核本团血猎手已安装正式包的7个来源映射。

## 服务恢复与时间偏差

执行器final称正常Return to Setup失败，登出后active=true、users0，留下PID35180。主任务收到用户新消息后核实该状态仍在，接手这一失败步骤：官方Chrome可见AX操作正常Gamemaster登录、Settings→Return to Setup；出现关世界提示后进入/setup。随后active=false、23/23世界锁释放，停止精确PID35180。

[最终关服回执](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/player-item-repair-20260928/parent-shutdown-20260929.json>)于2026-09-29 00:39:16确认进程不存在、30002无监听；[Setup画面](<F:/FoundryLab/foundry-v14/evidence/server-next-migration/player-item-repair-20260928/parent-shutdown-20260929.png>)保留。服务启动至最终复核9330秒，超过30分钟门限7530秒；这是实际超时偏差，不以“没有玩家在线”淡化。Mirror未触碰。停止操作后第一次写回执的日期解析失败，复核停止结果后重新写回执，未重发停止命令。

## 防止重复的具体措施

- 已按用户要求更新chrome-delegation-dev：独立task只能用send_message_to_thread和父任务UUID回报，不能用/root或collaboration.send_message。
- 执行器先保存证据，再调用跨线程回传；核工具成功且目标正确后才能final。失败/关服未完成也立即使用相同blocker回传。不能仅在final中写“已通知”。
- 后续委派提示词给出工具全名、精确schema、父/子UUID及禁止混用的agent路径；修复验证先做一次不启动Foundry的回传往返。
- 保持父任务派发即结束、不轮询、不建立watcher的用户约定。下一次实收回传前，只能称协议已修正，不能称真实送达已验证或保证永久不再遗漏。

## 实收回传与新版工作约定

已收到正确独立线程发来的 `CALLBACK_ROUTE_PROBE_PASS nonce=NEXT-CALLBACK-20260929-ROUTE-01`，跨线程消息实际送达通过。收到后继续只读源码检查，却被旧PreToolUse守卫拒绝；旧脚本只按session_id与turn_id存锁，错误假设callback一定换turn_id。主任务遵守当时技能停止该轮，未绕过守卫。

用户随后给出新AGENTS约定：派发后允许必要、不依赖子任务结果的已授权工作；有callback即可在同轮恢复。本机hook与chrome-delegation-dev也同期改为无状态提醒（脚本mtime 2026-09-29 10:00:39）；主任务原拟修改因内容已变化未应用，保留了这份同期改动。当前hooks.json仅配置PostToolUse提醒，脚本对PreToolUse直接返回空结果；新派发首行使用 `[chrome-delegation:dispatch]`，回传使用 `[chrome-delegation:callback]`，旧callback-only标记不再使用。仍禁止进度轮询和watcher。

对现有脚本的6项聚焦检查均通过：PreToolUse不拒绝、成功派发提醒、callback不触发、旧marker不触发、失败发送不触发、目标不符不触发。检查时原命名test文件仍引用旧MARKER接口，运行报ImportError；没有覆盖其它任务尚在调整的测试。此处只声明上述6项与实际跨线程送达通过，不冒充整个hook测试套件通过。


## 10:43 实际服务批次回传复验

独立执行器本轮v4b预览阻塞后正常关世界、核23锁、停PID2692，并通过原生跨线程消息将真实阻塞与证据返回正确父线程；父线程实际收到callback后同轮继续检查和修复工具，未遭旧守卫拦截。服务约19分钟。该回传和收尾通过，不代表玩家物品已修复。
v7结果落盘后没有正确回传：只读线程记录显示其在报告之后发生contextCompaction，随后转去处理旧PID35180关闭记录，final回答旧任务，未发送v7结果。父任务因用户询问主动取回并核对两份原始样本，不能当作自动回传成功。下一轮用外部current-chrome-dispatch.json固定唯一当前批次/服务/回传对象；压缩恢复先重读当前合同，报告保存后的下一项协调动作必须发送回执，不再先做历史检查。当前玩家修复仍0/7，实际应用/重登待v8。


## 最终证据验收纠正

v11/v12的跨线程回传已送达，但截图内容与部分PASS总结不符：v11有四项缺失/错位，v12仍将人物卡+法师窗口当成沃什塔克特工证明。父任务实际核图后拒绝这些证据；最后一项按chrome-delegation-dev困难步骤接管，核DOM精确Actor/Item ID并实际查看正确前景截图后通过。不能以文件名、SHA、AX出现同名文本或执行器PASS断言代替已保存图片内容。最终机器回执采用单独截图白名单，错误原证据保留。v11超时755秒已记录；父任务最终只读验收及正常关服316秒完成。全部本轮服务均关闭，临时Macro已清理，详见最终结果报告。
