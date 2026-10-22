# Forge传奇施法弹出消息：原图核对与误判更正

日期：2026-10-22。目标：核对同一2024成年绿龙Mind Invasion的真实施法显示；不改来源、冻结回复、骰子、最终JSON、系统或第三方模块。

结论：**初次所谓“浮窗1动作、实际1传奇动作”是父控读取缩小图时的误判，原分辨率图片明确显示“1传奇动作”。没有证据支持程序显示错误，不应创建虚假修复或重跑已通过业务。** 原PNG和初次报告保留，附加更正收据覆盖错误解释。

父控重新使用原分辨率2560×1271查看`mind-invasion-third-4d8-20-legendary-visible.png`，中心原消息弹出窗下方标签清楚为“1传奇动作”。同一消息在Save前后及正常刷新前后的完整存储content也全为该值，modifiedTime未因Save改变；实际消费提示与传奇spent0→1一致。此后正常刷新保持已耗，原生结果和精确恢复证据不因报告误读失效。

有界调研先用AnySearch发现code子域，再以明确版本及“Cast legendary action chat popout wrong activation”查询一般搜索和官方dnd5e代码。未找到可比的一手复现/失败修复报告，不能用泛泛旧教程推导本地原因。已读取[官方v14 renderChatMessageHTML接口](https://foundryvtt.com/api/functions/hookEvents.renderChatMessageHTML.html)：它允许渲染后自定义聊天HTML；这只说明有渲染扩展点，并不证明任何模块改错标签。对照本地精确14.368 ChatPopout、dnd5e5.3.3和Midi14.0.11源码，同样未建立错误因果；最终由原图直接排除最初前提。没有改动Core、Midi、Tidy或聊天模块。

待判断本地化清单：无新增候选，不把一次误读当作引入模块或补丁的理由。新候选复查：只有原分辨率像素、当前DOM和完整已存消息存在真实矛盾时才重新定位渲染层；先记录准确版本/同一消息身份及差异，复用已过施法/资源证据，不为报告问题重掷骰或调用模型。

本批私有证据根`.local/forge-cast-lifecycle-mind-invasion-20261022/`；更正`parent-image-original-resolution-correction.json`，实际原生接受`parent-stage2-native-review.json`，准确恢复`parent-final-restoration-review.json`。本记录不包含用户世界原文导出或凭据。
