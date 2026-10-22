# Forge候选补验：窗口与浏览器下载接口

日期：2026-10-22。仅用于同一worktree、本地Mirror Core14.368／dnd5e5.3.3的补验；不是升级或引入外部模块的建议。

## 分层结论

- 项目三个窗口已有明确默认尺寸：Workspace 1440×900、Connection 660×760、Encounter 850×850。Core14.368的ApplicationV2构造器合并`DEFAULT_OPTIONS.position`，首次render传入当前position，最后由`setPosition()`根据视口和CSS约束应用。
- 本批新页面未调用任何`setPosition()`或resize，实测上述尺寸均保持，普通Intake视图也完整显示。上批200×52现象有历史原件，本批未复现，原因仍未知；不能因新页面正常而回写原失败，也没有根据替换全局CSS或Foundry prototype。
- Core14.368的document级`_onClickHyperlink()`对到达document的链接点击调用`preventDefault()`并打开新页。可见报告下载链接已有自身`stopPropagation()`；候选下载使用临时Blob锚点。必须以真实按钮下载完成及文件内容核对判断本轮可用性，不能只据生成Blob或按钮点击判定成功。

## 原始来源与反证

- 固定本地源码：`F:/FoundryLab/foundry-v14/app/14.368/client/applications/api/application.mjs`中的constructor、`_initializeApplicationOptions()`、`_configureRenderOptions()`、`_updatePosition()`；同版本`client/game.mjs`中的`_onClickHyperlink()`。这些是本批接口事实的版本依据。
- [ApplicationV2官方接口](https://foundryvtt.com/api/classes/foundry.applications.api.ApplicationV2.html)用于导航；在线页面会随版本变动，不能代替上述固定源码。
- [Foundry原始问题11416](https://github.com/foundryvtt/foundryvtt/issues/11416)：报告者在12.328手动缩小可调整窗口后无法再拖回，提出最小高度CSS补丁；维护者将其关闭并归入12.329。它说明存在过相似视觉后果，但版本、触发步骤与本批不同，不能证明14.368初开200×52的原因，也不支持把旧CSS补丁直接应用到本项目。
- 本批官方Chrome仅允许HTTP／HTTPS，访问`chrome://downloads`被明确拒绝；停止该入口，不改用其他通道读取浏览器内部状态。后续证据使用官方支持的下载事件／文件路径与任务文件核对。
- [Chromium原始问题41380177](https://issues.chromium.org/issues/41380177)：报告者在M65扩展选项页复现立即revoke导致下载失败、延迟revoke正常；同时报告普通本地HTML正常，维护者后来修复。它提供Blob释放时机的单变量检查方向，不证明当前Chrome仍有同一缺陷。
- [Playwright原始问题23936](https://github.com/microsoft/playwright/issues/23936)：旧1.24.2／Windows Server内部站点报告“手动能下载、自动化无事件”；维护者指出应先挂download事件再点按钮，缺少可运行复现则无法确认原因。不能把事件超时直接解释成文件没有下载，或据此更换浏览器／绕过官方连接器。本批已在点击前挂事件，仍需具体文件证据及对照检查。
- 本地单变量检查：固定纯文本、延迟30秒revoke的诊断按钮也没有收到download事件；因此不支持把当前失败归因立即revoke。进一步对正常Dialog中的唯一可见`a[download]`调用官方`Locator.downloadMedia()`，明确返回`Blob downloads are not supported by this browser.`（`download-visible-link-result.json`）。本批停止Blob自动取证，不改产品或更换通道；普通按钮是否已在原生浏览器落盘仍未证明。需要人工通过正常Chrome保存真实产品文件，再由文件工具读回内容与hash，才可关闭下载完成门禁。

## 待判断本地化清单与复查

没有新增外部模块或待本地化候选。若初开尺寸再次失败，先保存未调整时的options.position、实际position、minimized、inline/computed CSS及视口，再定位覆盖层；不预先归因旧Core问题。下载结果、普通Actor创建与清理的实际完成层级见[候选交付验收](../acceptance/2026-10-22-forge-candidate-delivery.md)及`.local/forge-candidate-followup-20261022/`原件。
