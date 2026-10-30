# Forge 六 PDF 样本下载失败：已知原因层级与未决根因

2026-10-13，Asia/Shanghai。用户追问“为什么不能下载”。本轮只读核对历史收据、浏览器本地配置和外部原始报告，没有重新尝试下载或修改设置。

## 结论

已确认的是两条下载路径在不同阶段失败，具体根因仍未确定。不能把 `ERR_BLOCKED_BY_CLIENT` 直接当成某个插件、代理或自动化平台的责任证明，也不能把自动下载失败推广为用户手动下载必然失败。该故障发生在 Forge 取得 PDF 原始字节之前。

## 本地证据

1. 原命令行 curl / PowerShell / Python 均在 TLS 握手阶段失败；使用现有代理的对照也报 SSL unexpected EOF，没有取得 HTTP 状态或文件字节。它支持“TLS 连接未建立”，不足以判断是代理、链路还是远端中断。
2. 独立 Chrome 执行聊天能打开指定 Patreon 帖子并看见 Charon.pdf 正常附件。一次 `downloadMedia` 操作等待 30 秒超时；随后页面位于 `c10.patreonusercontent.com` 错误页，显示 `ERR_BLOCKED_BY_CLIENT`。附件没有取得原始字节。
3. 另两份 PDF 在共享 CDN 阻断后没有执行浏览器下载，不能分别报告为已失败。
4. 本轮检查正在运行的 Chrome 及默认 profile 的选定配置项。在 HKCU/HKLM 的 `Software\Policies\Google\Chrome` 和 URLBlocklist/URLAllowlist 子项未发现对应注册表键；这不是完整有效策略审计。
5. 扩展实际设置在 `Secure Preferences`，不能由普通 `Preferences` 中空 extensions 列表得出“未安装扩展”。多个扩展声明 debugger、webRequest 或 declarativeNetRequest 权限；没有获得本次请求的规则命中或阻断来源。检查到的静态规则文件中未见明确 Patreon 条件；动态规则和运行时拦截仍未排除。
6. AnySearch 的域发现调用本轮也报“Client network socket disconnected before secure TLS connection was established”，已改用可用 web 检索。它是另一条 TLS 失败证据，不证明它与 Patreon 失败有共同原因。

历史下载收据：`H:\CodexData\visualizations\2026\10\12\01a12e90-4de0-75c1-92d5-714811781a77\forge-facts-holdout-20261013\metadata\browser-acquisition-receipt.json`。SHA-256：`9e63a86cc968ce749d03a22a98410d42058451cb96b87d13ce7598174edd505f`。

## 外部核对与适用范围

- [Chromium 网络错误源码](https://github.com/chromium/chromium/blob/main/net/base/net_error_list.h) 将 `BLOCKED_BY_CLIENT` 定义为客户端选择阻止请求，并与管理员 URL 封锁、响应策略、CSP 等错误分列。不能由该错误码单独识别组件。
- [Chromium security-dev 的 PDF 下载原始讨论](https://groups.google.com/a/chromium.org/g/security-dev/c/Abvu9qL-nzk) 中，维护者明确说明该错误使用范围很广，需要上下文。部分当事人确认旧 CSP 问题在 Chrome 91 修复；后续不同条件仍有同码报告。这不是当前 Chrome 的已验证修复方案。
- [Privacy Badger 原始 issue #3011](https://github.com/EFForg/privacybadger/issues/3011) 记录过扩展与 Chrome Canary 特定版本产生同一错误；维护者建议按实际域检查，报告者也反馈一次禁用配置无效。该案例只支持“扩展/版本是可能原因”，本机未发现该扩展，不将其套用为本次结论。

上述第一手案例与技术定义来自原始维护项目／开发者讨论，不采用通用教程作为根因证明。没有找到与本机版本、该 Patreon 附件和官方 Chrome 下载工具完全相同且已验证解决的案例。

## 下一步最小判别

在同一用户 Chrome、同一登录状态下，手动打开 [固定 Charon 附件](https://www.patreon.com/file?h=171613449&m=759199072) 并点击正常下载。该人工对照尚未执行。

- 手动成功：缩小到自动操作、下载捕获或受控页面环境差异；核验原始文件后继续原样本封存。
- 手动同样失败：继续定位浏览器请求拦截、响应策略或网络链路，捕获对应错误证据后再选择单个配置实验。

不以猜测为由停用所有扩展、修改代理、关闭 TLS 校验或换样本。用户手动取得同一附件原件可用于补齐文件哈希，但不消除对自动下载故障的未决结论。

## 待判断本地化与验收影响

本次没有新增待本地化模块。六例版本冻结和真实生成继续未执行；下载诊断不改变任何模型、中文规则、Icon 或 Actor 机械数据，也没有付费审核、提交、合并或推送。


## 后续处理：原件已取得

用户明确要求继续排查并处理后，新的TLS/HTTP矩阵全部取得响应，固定附件正常302到CDN；没有配置修改。随后三份原公开附件各一次正常HTTPS GET，全部200，原始PDF及SHA-256封存。无需再让用户手动下载来完成本批取样。当前下载实际已恢复；历史TLS中断的具体恢复原因和Chrome拦截组件仍未确定，不能把恢复推断为对某个插件/代理的修复。完整过程和哈希见[冻结六PDF批次记录](../acceptance/2026-10-13-forge-frozen-six-pdf.md)。
