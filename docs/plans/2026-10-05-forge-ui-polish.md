# Forge 0.5.0 前端精修

## 范围与依据

用户要求使用 impeccable 优化刚完成的 Forge 前端。候选 `codex/20261005-191325-forge-ui-polish` 从已提交主线 `690f904` 建立；保留上一批独立工作树与证据。本轮为现有 Operate 工作台的精修：保留深青灰工作区、纸色2024资料块、目录入口、输入模式、来源身份、生成/审核/创建与共享连接契约。

沿用本会话已加载的 impeccable context，不重复运行。已读取 polish、operate、craft-floor；没有 DESIGN.md 不意味着重新设计。PRODUCT.md 的 Evidence on Hand 仍有前轮待验收表述，本轮依据已完成的统一计划和最终收据判断实际状态，不顺带修订产品上下文。

视觉基线为上一批最终接受的 `rev4-guard-formal-wide.png`、`rev4-hp48-formal-narrow-verified.png`、`rev4-blueprint-draft-narrow-confirmed.png`及共享连接截图；对应0.5.0 ZIP SHA256 `fa8f21d8a2837cc8098c464e194cba0baae78d6163718aa70c1a510edaf9fe7d`，与当前master/安装身份一致。

## 本轮处理

- 统一工作台与共享连接的颜色、字号、表单、焦点及状态层级；保留纸色预览自己的文字颜色。
- 区分模式选择、辅助工具、生成与创建主操作，收敛重复边框和装饰性标题。
- 蓝图库自身列表滚动、工具区紧凑排列，降低窄窗占用；编辑与预览保持独立滚动。
- 宽/中/窄浮动窗口按实际容器宽度布局，长名称、技术内容和错误可换行。
- 不修改生成、身份、权限或世界写入逻辑，不增加真实Provider请求或战斗运行范围。

## 验证选择

模板与样式变更采用现有模板/工作台/蓝图/连接局部检查和模块构建，不为低风险CSS写同构测试。实际行为复用前轮同一JS的身份/创建/完整清理证据；补测本轮真正改变的布局、控制可达性、焦点、颜色和滚动。

首次完成实现后一次批量检查：Actor蓝图/标准/AI、Item、共享连接在宽及窄窗口，包含草稿/正式预览、禁用/错误/长内容。如发现缺陷，集中修复后最多再确认一轮，不无限打磨。普通Chrome复用原已授权独立执行聊天，主控不直接操作Chrome。仅使用自有未保存表单及正式生成预览，默认不创建世界文档、不保存连接/调用Provider。

手册根据实际布局/操作变化核对；保留已有说明与watch，最后记录review/build/check。完整CI仅在实际本地集成边界运行。尚未完成视觉接受时不宣称交付完成。

## 第一批实现记录

第一批实现完成。既有Forge聚焦入口311 pass / 0 fail / 2787断言；普通release生成9文件归档。独立构建JS与上一批接受产物逐字节相同，manifest与Intake模板仅因新checkout换行规范变化，其余实质差分为CSS及三模板。已在精确Mirror逐文件校验安装，无重启/世界写入/备份。

一次设计检测仅标出共享蓝图tab旧3px下划线；该控件border-radius为0，当前统一窗口覆盖为2px，属于明确选中指示，留作首轮实机核对。视觉第一轮待同一授权Chrome聊天批量检查；不重复旧业务矩阵。

## 首轮检查与一次集中修复

`FUP-UI-01-ROUND1-01a10bd2`完整覆盖指定surface；父已读取原始metrics并审宽窗截图。1440/800/640真实窗口、标题去重、编辑/预览滚动、640纵向可达、长名换行、来源文件/模式草稿、正式预览主操作、AI800与连接520高级区通过，采样文字对比均≥4.5。没有世界文档、Provider、连接设置或蓝图库写入；保留自有tab651340394的临时Item预览。

集中修复两项材料缺陷：

- 实Tab后focus-visible为true但outline仍透明。锁定Core14.368表单CSS包含从transparent开始的outline-color 0.5s过渡；为Forge作用域提供原生focus tokens及明确即时的2px轮廓，排除outline-color过渡，防止宿主/主题覆盖。最终轮需再次实Tab确认。
- 本轮通用button的font:inherit污染了原生header icon字体。将通用button皮肤限制在window-content内，使用零特异性容器选择器维持现有内容按钮优先级，原生菜单/关闭字体和尺寸交还Foundry。

这是唯一集中修复批；不重跑已有效的311项行为检查，不添加镜像CSS实现的测试。只重建、确认除CSS外归档字节未变，再做最终一次focus/icon及受影响几何确认。其后停止外观打磨。Item空来源toast未抓到的瞬时通知保持该观测限制，不影响已验disabled状态，也不为补截图重放无关业务。

第二版ZIP `7512eb606dbade49098dc89a80423bf87354015c20190d282f397b6b5d90d280`、CSS `4f90ad1db226f0956fbdf86d9053a05b1fba5e7cf3f2c84fc3d04f331b04cabb` 已逐文件读回安装，其他八文件不变。手册核对仅更新review与生成页，入口/说明/权限不变，30项check通过；34项agents检查通过。进入沿用本会话授权的本地集成边界，运行一次完整CI；与浏览器最终确认独立，不因等回调增加额外检查。

## 最终确认

`FUP-UI-02-FINAL-01a10be5`为`PASS_FINAL_TARGETED_CONFIRMATION`；父已读原始收据并亲自查看DEX焦点和恢复的原生header截图。真实Tab至DEX、AI文件输入、连接模型及普通按钮，均即时出现rgb(161,239,240)的2px轮廓；Actor/Item/connection原生图标均恢复宿主Font Awesome 7 Pro/900，原生菜单及关闭操作正常。800/640窗口clientWidth与scrollWidth相等，窄窗纵向可达；首轮布局/对比/长来源/正式预览证据保留。只执行一次集中修复、一次最终确认，没有第三轮外观循环。

本轮未创建世界Actor/Item/Macro/Scene，未保存蓝图库或连接设置，Provider调用0。全部Forge窗口关闭，原landing/paused状态保持，测试GM退出、自有tab关闭，用户tab与常驻Mirror保留。未复验手机、全主题或性能，不将该窄窗接受扩大为这些结论。首轮未留存的Item瞬时空来源toast仍为证据限制，disabled和Actor空来源提示已独立核对。

完整`bun run ci:verify`退出0：3727 pass / 1 skip / 0 fail、380文件、覆盖率测试阶段361.55秒；独立CLI24项、构建检查、各层类型、架构、覆盖率门禁、anti-overfit433来源、hygiene1952路径、锁定参考、Web构建与离线Actor smoke全部通过。未改变清单或阈值。CSS修复后沿用311项聚焦回归，完整CI同时覆盖最终代码。

原始证据位于`H:/CodexData/visualizations/2026/10/03/01a10117-3f4e-77c2-b7d3-e99e6da803af/forge-ui-polish-20261005/round1`及`round2`；候选`.local/forge-ui-polish`保留测试日志、构建与安装身份。最终归档仍为上述7512eb…、安装CSS仍为4f90ad…；业务JS始终为17fd16a1…，没有修改生成/身份/权限/世界写入实现。

## 本地交付完成

精修功能提交`0c636e88a1533f1c61adbbd0e942665dd75cafbf`已从主工作区按白名单正常fast-forward合入master，保留基线`690f904`全部内容。合并前主区和索引为空、唯一新增计划路径无碰撞；合并后30项handbook:check通过，主区与候选经核对干净。本次完成补记仅改计划，复用已绑定的最终CI和两轮实机证据，不另做第三轮外观检查或重建。

Mirror维持0.5.0本地候选及常驻服务；无远端push、生产/Next操作、备份或工作树清理。最终机器收据保存于上述证据根的`forge-ui-polish-local-final-20261005.json`。本轮用户要求的前端精修已完成。
