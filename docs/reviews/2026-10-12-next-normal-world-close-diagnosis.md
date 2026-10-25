# Next正常关闭世界：首次菜单操作未完成

## 当前事实与范围

本任务仅独占Next PID38672、creation UTC2026-10-12T02:54:55.8460570Z、单127.0.0.1:30002、Core14.368/dnd5e6.0.6/cor-cotn。WMP代表链及已知恢复已父审接受；IFS更新preview只涉及README.zh-CN.md与scripts/index.js，尚无installed写入。Forge占用的30001/5.3.3 Mirror、Config、生产及直接LevelDB不在本诊断范围。

原Chrome首次原生MainMenu→Return to Setup一次，菜单消失但仍/game；随后active=true/users1，READY未写。close confirmation没有出现。not-closed图有既有翻译欢迎窗口/日历popover；仅凭它们不能确定阻挡来源。现有Actor identifier/frostmist历史错误没有本次时间关联，未用于归因。原件在本任务.local/suite-direction/next606/chrome/ifs-f1-f3-normal-close/。

父对owner stdout作一次指定事件的脱敏读取，仅输出时间/事件：2026-10-12 15:21:46（本机日志）确有World shutdown request received。新的单次api/status仍active=true。因此“完全未到服务端”的初始假设已明显减弱；不重复无观测菜单点击。

## 精确Core接口

- client/applications/ui/main-menu.mjs SHA d9f4d0b55d846ae4f4c16ceefcc44c822c2dd8006c29817bc94544955d6f966e：实际条目为data-menu-item=world，handler先close菜单，再game.shutDown。
- client/game.mjs SHA e074b28a942f49caf707e371151d90a526f0067e80b2dc56bf6c44ab9a3975f7：只在other active users存在时确认；本次独占GM不应要求确认。关闭走正常POST setup/action=worldShutdown、redirect=manual，不经过普通文档prewrite hooks。旧WMP文档guard不能据此认定为关闭请求阻拦者。
- dist/server/views/setup.mjs SHA 86012101e1adf95b7e8c8ae9d76ec47f8eb4cbceb4ba845e946b0fcc5d7508ee：记录接收请求后进行权限/会话处理，再调用World.deactivate并redirect。客户端不把该响应的非成功状态自动转成页面上的错误提示，故“无新console error”不等于关闭成功。
- dist/packages/world.mjs SHA 37b48a95871ce500b8c09e2e11eabc4e46e31208204cadf5c861c6eb8b76c546：非admin分支会核HTTP请求用户/GM身份；成功进入deactivate后清game属性、断开数据库/发shutdown事件，再保存World元数据。当前active未变不能推断已成功进入这一阶段。
- sessions.mjs静态实现使用名为session的HTTP Cookie、会话有效期一天。未读取或导出任何浏览器Cookie/会话值；没有证据证明当前失败与Forge或其他浏览器任务相关，不据静态机制归因或清理Cookie。
- 自有chat-memory-guard的beforeunload只是stop页面DOM缓存/observer，不会preventDefault；未改/停模块，也不把名称当作导航拦截证据。

## 最小区分与后续

当前主要区分：HTTP会话/权限拒绝或重定向、服务端关闭未完成，以及现有观测尚未覆盖的响应阶段。先让原Chrome通过正式连接器读取既有POST/setup的安全metadata（方法、路径、状态、重定向路径、时间、已知action）；不导出headers/cookies/token/完整body，不重放请求或改运行时。若该接口/历史记录不可用，报告具体能力缺口，不改用CDP、performance/fetch、exec或CLI shutdown。

同一诊断读回若发现原操作随后已达Setup且同Node inactive，可保留第一次NOT_OBSERVED并按新的正常关闭证据写READY；未达到则保留世界/包不动，依据真实响应选择正式UI下一步。缺失确认框的旧预期已撤回，不因此再点击。只有正常关闭与绑定READY成立才应用IFS两文件更新；既有WMP行为证据不重跑。

## 响应元数据能力缺口与一次隔离认证复验

原执行器当前官方Chrome SDK仅有DOM/交互/download/filechooser与console日志；没有历史网络请求/响应metadata接口。唯一debugger能力cdp本批不允许，未调用。原POST状态/redirect继续UNKNOWN，capability gap原件保留；不能因工具缺口改CDP、页面fetch/performance、Cookie/profile或代理抓包。

父另一次指定时间段脱敏事件读取只见会话创建与一次关闭请求，没有可用于直接判断HTTP状态的记录；这些创建事件也可能来自普通无Cookie状态检查，未据时间关联认定实际请求会话缺失。express.mjs在每次HTTP请求按session.worlds[worldId]赋request.user；页面已有Socket身份不构成当前HTTP请求身份的证明。logoutWorld之后request.user为本次已赋值字段，未把静态源码误判成必然的logout排序bug。

sessions.mjs的会话Cookie固定名session、无Domain属性；[RFC6265 8.5](https://datatracker.ietf.org/doc/html/rfc6265#section-8.5)明确Cookie不按端口隔离。这是需要保护的条件风险，尚无证据证明本次与Forge或任何其他会话存在实际碰撞，不读Cookie值也不清理任何现有会话。

下一单项复验在同官方Chrome、同Node/端口/数据根，仅用本任务专属前端host next-01a129b6-4b84-7eb3-9d3a-952c9aaf0c4f.localhost。依据[RFC6761 6.3](https://datatracker.ietf.org/doc/html/rfc6761#section-6.3)，localhost及子域为loopback特殊用途名；不改hosts/DNS/服务hostname或创建第二Lab。后台canonical身份仍127.0.0.1:30002，前端alias单独记录，若不能正常解析/连接或网站权限拒绝则停，不强改配置。

先新建唯一自有alias页读只读api/status并与同PID606/cor-cotn绑定；未证同目标前不关旧页。成功后仅关闭已完成且无未保存业务的旧自有Next页，避免其随后自动导航继续使用旧host；不点logout、不碰其他页面。新alias通过正常Join、既有私有Lab登录约定选择原Gamemaster Fccw...，只允许已知密码一次，未知管理员认证不猜/不改Config。随后原生Return to Setup一次，复验同目标normal inactive和Setup。该变化验证“重新建立HTTP登录态是否能完成关闭”，不是伪造/重放HTTP或绕过认证；失败保留原响应UNKNOWN与新证据，不继续重复。成功仅证明重建认证后的正常关闭，不倒推原因或归咎Forge。

## 隔离别名被客户端拒绝与浏览器表面核对

上述别名复验实际只执行了官方Chrome新页的第一步，返回`Browser Use cannot open; net::ERR_BLOCKED_BY_CLIENT`。别名没有取得DOM状态，无法绑定目标；未关闭旧自有页、登录、点击关闭世界或写READY，也没有改用其他host/浏览器/通道重试。拒绝原件在`.local/suite-direction/next606/chrome/ifs-isolated-auth-close/official-url-failure.json`。这只证明该URL被客户端阻止，不能称为自动审批拒绝、认证失败或canonical地址也被禁止。

之后通过官方SDK只读inventory确认：本任务原自有30002页与一个`http://127.0.0.1:30001`页面都出现在Chrome browser3连接中。没有操作或认领30001页面，仅保存origin/port/sameBrowser，其他页标题、路径、query与内容未导出。该连接未提供context/cookie-store隔离标识，因此共用登录状态仍UNKNOWN；sameBrowser不等于已经证明实际Cookie冲突。

当前SDK仅把sessionName描述为自动化会话的名称，没有证明它隔离登录信息，也没有正式的incognito/private/context/profile创建入口。能力缺口仅限代理当前工具，不能说Chrome没有隐身模式。证据在`.local/suite-direction/next606/chrome/ifs-chrome-surface-inventory/`。不以新sessionName冒充独立浏览器环境，不用未文档化参数或CDP绕过。

用户询问上一问题的含义时，已用普通话解释重新登录Next可能影响Forge的网页登录；用户尚未确认会话隔离或Forge已结束。保持不干扰Forge的既有要求，暂不在原Chrome重登/退出或重复关闭。IFS包与preview不变、READY和实装写入均未发生；继续可独立进行的TokenSync源码与统一帮助入口，原生验收待正式可用的独立登录环境或共享占用解除后接续。

## 第一手与官方资料比较

AnySearch get_sub_domains在TLS连接建立前断开，未使用或保存新凭据；依项目授权回退网页搜索。第一轮精确词无关结果未采用；按FoundryVTT域名收窄后阅读[2024年v11用户原帖及跟进](https://www.reddit.com/r/FoundryVTT/comments/1fmoz6h/return_to_setup_problem/)：问题发生在Join页无管理员密码，原作者可以先以GM进入世界再从设置返回。它与本次已经在/game的14.368 GM情况不同，不能套用重置配置或认定同因。

[官方Game Settings](https://foundryvtt.com/article/settings/)把世界内Return to Setup定义为关闭当前世界的入口；本机14.368菜单和设置侧栏确实都调用同一game.shutDown方法。官方reset-admin-password页面本次提取超时，仅搜索摘要可见，未作为当前故障修复依据。没有检索到与本机14.368/当前请求状态足够匹配并带完整响应证据的第一手案例，当前判定继续依赖本机源码及真实响应。未新增引入/本地化候选；版本/源hash变化时先重核接口与受检目标。
