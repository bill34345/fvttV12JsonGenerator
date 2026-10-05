# AB主任务复核

实际证据目录为batch6AB-midi-qol-native-observability-e2e-20260922；最初回传漏写-e2e-，已只读定位纠正，未复制/搬移。

G03关闭：本轮AB原始真实DamageApplicationElementMidi，Actor-only无option/不可操作、HP不变；返回Token有效后正常Apply16并恢复HP。own-raw保存的是返回有效相位ChatMessage.aA58j2MNegHRQwOD，不把它说成最初Gybs相位。初相位报告未单独落盘，但offscene→返回有效→真实Apply及恢复链已成立。Z02本轮baseline/final完整shared状态、设置、自有HP/slot一致，仍须随下一轮再恢复。

C06仍待关闭。只读工具轨迹审计确认：AB两次只有Cast Spell，无Apply Active Effects/最终Apply点击；第1次曾slot0但之后两次已准备slot，slot不足不是最终缺步的全部解释。读取效果的临时探针还产生duration.toObject非函数和语法错误，这些是诊断代码错误，不是Midi已定位缺陷。AA原始有自然到期行为，AB没有执行完整应用不能据此推翻；但完整duration/start/source转变仍需AC一次正确流程。

G04/G05日志缓冲truncated=true，994 events，network事件0，不能判完整。已知Calendaria在本轮10:10重现，应写本轮已知类型而非把timestamp算旧历史。下一AC无刷新短窗口、及时分页；只读同源bundle GET提供确定Network事件。无需完整body trace，也不采集敏感headers。

AC identity宏精确六指纹，clone位置CONFIG.ActiveEffect.documentClass.prototype.clone，修正AB探针查错位置的undefined。源API从本机dnd5e6.0.2 source map对照：EffectApplicationElement只应用勾选effects及targetList.targets，正常existingEffect更新会duration.expired=false、start=getEffectStart，重用UUID正常。无需因此改Midi源码。

总清单30/35。新AC只补C06/G04/G05及Z02，Z03/Z04根负责，G03不重测。