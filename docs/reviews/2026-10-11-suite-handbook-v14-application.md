# Foundry V14 统一手册窗口：接口与接受记录

日期：2026-10-11。范围为自有 `fvtt-suite-console` H2，只读阅读窗口；本文件不扩大第三方模块、dnd5e数据或商业发行范围。

## 分层结论

- 发现：Context7 `/websites/foundryvtt_api_v14`定位ApplicationV2与菜单接口。检索中的简化签名不作为minor版本契约。
- 精确静态：本机 `F:/FoundryLab/foundry-v14/app/14.368/package.json` 为14.368.0；读取其ApplicationV2与ClientSettings实现。Core授权源码只读核对，不复制进本模块。
- 实现：使用独立ApplicationV2子类，直接实现`_renderHTML/_replaceHTML`，避免为了空容器新增模板依赖。菜单type是同一单实例类，API每次核GM/Core。
- 真实接受结果由[执行总账](../plans/2026-10-11-fvtt-suite-refactor/EXECUTION_LEDGER.md)维护；本文只记录接口与接受边界，不把构建/替身测试提升为Foundry或Chrome已通过。

## 接口事实与最小反证

| 精确来源 | 本项目采用的事实 | 适配与反证检查 |
| --- | --- | --- |
| `client/applications/api/application.mjs` 的render流程 | frame在_renderHTML前创建，返回结果传_replaceHTML；_onRender被等待 | 在_replaceHTML先dispose旧阅读器，再挂载新root；替身按同序执行，实机重绘后只有一组有效监听器 |
| 同文件close流程 | _preClose被等待，发生在关闭动画/tearDown之前；_onClose不等待 | _preClose同步释放reader，再等待父方法；复制Promise在关闭开始后完成不得改UI |
| `client/helpers/client-settings.mjs` 的registerMenu | type接纳ApplicationV2子类；只写菜单注册表，不调用settings.set | 注册一次restricted菜单；实际阅读前后核设置值与世界文档事件；启用模块的安装准备单独记录 |
| ApplicationV2 options/_renderFrame | 普通div窗口、section.window-content、resizable；继承默认options | 专用frame class及window-content container，360–1000px窗口检查布局；不向body/nav/button写全局样式 |

本模块不读取Actor/Item/dnd5e系统数据。Core门只接纳14.368，manifest、源码常量、package和构建身份一致；具体运行目标仍需本批实际核对。

## 资料与实际使用案例

- [官方V14 ApplicationV2 API](https://foundryvtt.com/api/v14/classes/foundry.applications.api.ApplicationV2.html)：public/protected可见性与签名导航。页面不承诺具体minor build。
- [官方ApplicationV2原始设计issue](https://github.com/foundryvtt/foundryvtt/issues/5441)：源作者对渲染/关闭排队和生命周期设计的原始说明；属于历史设计背景，采用行为已由14.368本机源码重新核实。
- 当前仓库Deck `src/surfaces.ts`提供既有ApplicationV2使用实例；只参考边界，不跨模块导入其私有实现或照抄其业务行为。

## 待判断本地化与复查

本批没有新增第三方模块候选或翻译任务。正文沿用手册人工核对的同源目录；商业内容/许可白名单在H4处理，不因进入本包自动取得分发许可。

新Core候选复查：重新核package与API文件SHA，核_renderHTML/_replaceHTML/_onRender/_preClose/registerMenu的契约差异；先跑窗口/拒绝路径，再以新客户端接受，不推广旧build PASS。新dnd5e版本只有涉及数据API时才进行相应系统适配，不为只读手册连带升级系统。

本地原始API检索位于本任务 `.local/suite-direction/h2-application-api.md` 与 `h2-application-lifecycle-issue.md`；最终公开结论引用本机精确源码和实际验收，不用检索摘录代替运行。
