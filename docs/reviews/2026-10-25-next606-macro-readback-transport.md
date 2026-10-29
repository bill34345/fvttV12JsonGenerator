# Next 6.0.6：Macro 源码读回与导出运输

目标是现有 Next／cor-cotn／Core14.368／dnd5e6.0.6；本记录只解释本轮工具读回，不新增模块玩法接受。当前进度仍归[合集执行总账](../plans/2026-10-11-fvtt-suite-refactor/EXECUTION_LEDGER.md)。

## 本机观察与分层结论

- 本批全新 Macro `FerafSKnc8hvkj8U` 已经正常 Create／Import，未覆盖旧工具。CodeMirror 可见 DOM 只含少量行，公开 DOM value 读回为空，普通复制亦未取得全文；原因仍未知，不能据此认定持久源码缺失。
- 两次原生 Export 未得到可核完整导出；一次下载等待使官方 Node runtime 重建。已核对仍是同一 Chrome extension／同一自有页，只是内部 browser ID3→1。没有安全拒绝，未使用裸CDP、私有编辑器状态或其他浏览器通道。
- 精确14.368的 Macro 执行以实际文档作为 `this`。本工具初始化在任何持久写入或业务调用前对完整 `own.command` 做规范化 SHA 断言，再显示选择器；错误源零写拒绝已有工具反例。因此普通 Execute 只读引导可作为本批最小来源往返，不额外要求下载必须成功。选择器出现证明断言通过，不等于从独立DOM导出了完整源码或实际SHA数值。
- 随后一次 preflight 已通过：实际界面确认七模块active／版本／HTTP脚本SHA。完整显示结果首次整体读取被连接器截断，只修运输，13个只读DOM片段合并为610989字节UTF-8 JSON，父侧独立解析及SHA `946e8608beb9b44465eb0c355f9fb9e4b3df04b113241f14618d60fac4b201f0`一致；未重跑preflight，未执行模块业务。原件在任务 `.local/next606-resume-20261024/chrome-business/preflight/`。

## 精确源码与一手对照

本机14.368：`client/documents/macro.mjs` 的脚本执行使用 `fn.call(this,...)`；`macro-config.mjs` 的配置窗Execute先submit再execute。未编辑的配置窗宜正常关闭后从新Macro执行入口运行，避免额外提交。`elements/form-element.mjs` 提供公开value，`elements/codemirror/element.mjs` 的 getter 返回整个编辑文档；可见行数不代表全文长度。

原生Export经 `ClientDocument.exportToJSON()` 调用 `saveDataToFile()`，使用Blob／临时下载链接并在100ms后撤销URL，不返回下载完成Promise。事件未捕获只证明运输层未闭合，不能判Foundry或本模块业务失败。

有限AnySearch混合检索读到[Foundry原始问题12388](https://github.com/foundryvtt/foundryvtt/issues/12388)与[CodeMirror维护者回复](https://discuss.codemirror.net/t/how-can-i-get-the-value-of-the-content-inside-the-code-editor/6245)。前者说明完整编辑器接口的实际需求，后者说明全文来自编辑文档；两者不证明本次官方Chrome下载事件丢失的根因，也不授权读取私有editor state。没有找到精确匹配14.368／本轮官方连接器的同类一手失败，不扩大搜索。

## 后续复查与本地化

没有新增待判断本地化项。若新任务确需原生下载，再按当时官方Chrome组件与明确下载事件事实检查，不重做已接受的业务。本批继续使用普通应用入口和显示正文读回；若有明确策略拒绝，保留实际范围停止，不以该路线绕过。
