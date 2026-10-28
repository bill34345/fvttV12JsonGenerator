# 独立副屏网页截图恢复调查

## 目标与权限

用户回复“为什么会超时，给我去找解决方案，之前是可以的，最早开发的时候”。这不是同意Windows窗口替代方案，当前继续排查并恢复官方Chrome截图链；原产品目标和已通过的主屏证据保留。沿用同一执行聊天，不改Chrome/系统设置，不重启浏览器或服务，不使用原生窗口、IAB、外部CDP直连或启动flags。此前报告/派发中将“raw CDP”一概排除写得过宽：当前官方Chrome扩展自身的cdp能力仍属于原连接器，只能按其真实权限、HTTP来源及子target文档使用，不创建外部调试通道或绕过真实拒绝。

## 已核实的本地事实

- 2026-10-26执行聊天原始调用确有多次成功：14:40Z `ledgerPop.screenshot({fullPage:false})`；15:12Z及15:27Z/15:34Z为fullPage true。相应JPEG原件、原稿对照与DOM状态均存在，不能声称副屏从来不可截图。调用摘录冻结在`.local/status-alignment-20261027/popout-recovery-20261027/`。
- 当时使用mcp node_repl的官方browser对象；R7首次已知失败也在旧入口，故不能只因R8改用cua包装就认定其是原因。没有同刻Chrome/App版本证据证明升级造成回归。
- 旧metadata中副屏实际Chrome窗口type=normal、maximized、focused=true，tab.active=false；最近R8同类窗口focused=false、tab.active=false。旧metadata早于成功取图，不足以把focus单独判为根因；active字段也不能否定人类已置前的答复。
- 最近主面板取图一直可用。副屏DOM/几何可读、fonts loaded；默认截图及R9 reset后显式1448×962可见clip均captureScreenshot5000ms超时。排除“Chrome根本未运行”，不能据此证明所有stylesheet完成或渲染帧已提交。
- 新版副屏视觉和完整鼠标释放仍未接受，旧R7为PARTIAL。R8–R11主屏中文/列对齐/菜单/响应式/数字等有效结果不重跑。

## 一手来源及反证

1. [Puppeteer #12712](https://github.com/puppeteer/puppeteer/issues/12712)：2024/macOS/headless并发开关页的原始复现。维护者解释截图等待活动页面渲染帧，作者指出激活与截图之间其他target操作会造成竞态；最终通过避免并发与内部锁处理。可以支持顺序激活后立即捕捉的最小检查，不能把本机Windows顺序调用直接归入该bug，更不能仅扩大timeout。
2. [Chromium #41430082](https://issuetracker.google.com/issues/41430082)：旧版Chrome71扩展截图在head stylesheet未完成时长期等待，维护者讨论下一帧和ForceRedraw/stylesheet加载。版本很旧，只用于提出document.readyState和stylesheet完成的可区分检查，不宣称当前Chromium仍相同。
3. [ego-lite #369](https://github.com/citrolabs/ego-lite/issues/369)：2026/macOS真实报告明确反对把所有截图失败等同遮挡；作者在背景/最小化状态也有成功对照，分隔条件未定。反证“只要前台/viewport非零就应通过”。其替代像素/PDF/其他协议方案不在本项目执行。
4. [Claude Chrome #78533](https://github.com/anthropics/claude-code/issues/78533)：2026/Windows用户报告DOM瞬时可读而hidden页面captureScreenshot等待超时，作为同平台相似症状。报告中的归因和flags属于作者意见，且产品不同；未将其套成本机原因，不重放合成点击、flags或协议替代。
5. [OpenAI官方扩展说明](https://learn.chatgpt.com/docs/chrome-extension)没有给出本症状的精确修复。当前官方management文档支持normal窗口`windows.update(id,{focused:true})`，并不支持此前被拒的tabs.update active字段；不重试该字段，不绕过真实拒绝。

## 最小恢复与分层检查

同一执行器只创建本任务GM页与副屏，记录实际绑定和页面加载/样式/可见性。优先从真实主屏截图使用官方Chrome指针点击打开副屏；在normal窗口类型得到实际核实后，只将该所属Chrome窗口置前（无搬移/尺寸/分组更改），顺序立即截图，不在激活与截图间操作其他页。当前用户已授权继续官方Chrome验收和排障，窗口置前是同一路径内的常规操作，不沿用未获允许的Windows原生替代方式。

若仍超时，导航同一任务拥有的副屏到现有本地静态资源`http://localhost:30002/icons/svg/d20.svg`并比较同方法取图；该文件已从实际Core14.368安装核实存在。仅在该静态副屏也失败时采同URL普通任务标签作为对照。它们分别区分页面内容/初始文档与窗口/绑定状态；静态资源截图不是产品视觉通过。没有新证据时停止该分支，不重复原样调用或要求人类再置前。

如原副屏恢复实际图，再继续其原本未完成的鼠标拖动/正常释放/非拖动稳定/复位及整页对稿。任何方案以本机实际结果判断，未执行前不称解决。所有设置、viewport、自有页恢复，Next保留运行，Actor/Effect/Combat不写。当前产品仍为R11，未修改模块/工具实现。

## R12对照结果与后续

原副屏已由真实指针打开，readyState complete/visibility visible/fonts loaded、726图完成。normal窗口置前返回focused true/maximized，紧接截图仍5000ms超时。同一副屏标签导航到静态d20.svg仍超时，而同窗口、同DPR的新普通标签打开相同SVG，97ms返回8793字节。这是窗口/target来源与绑定路径的可复查差异，不能再仅归因于UI复杂、未置前或字体图片未加载；精确原因仍未知。hasFocus/link.sheet/resourceTiming未能通过只读DOM接口取得，不能将能力缺失判作加载失败。恢复时鼠标Input.dispatchMouseEvent也超时、键盘正常，可支持渲染/输入target层的问题线索。

原产品未改，R12全部设置/viewport/自有页恢复，用户页和其他任务页保留，Next33448仍运行。原件`.local/status-alignment-20261027/chrome/r12-recovery/receipt.json`SHA256 `a683b5016e9726f8616644782ba90dfe9d020a156f4b394afb6ee8019cb3cade`。

下一项最小区分是激活实际page target，而非仅激活宿主window。[Chrome Page协议](https://chromedevtools.github.io/devtools-protocol/tot/Page/)的bringToFront激活页签，当前官方连接器cdp文档要求先访问HTTP/HTTPS，子target只能由attached事件取得。可在本任务HTTP GM页收集实际子target事件后操作匹配的副屏；若没有该事件，不能猜session/target或直接对about:blank发CDP，先在同一任务静态HTTP资源上验证激活/截图路径。若高层截图和官方cdp截图结果不同，就保留这层差异；任何安全拒绝停止对应操作，不再换通道。

另查[OpenClaw #54148](https://github.com/openclaw/openclaw/issues/54148)及维护者结案，旧建议fromSurface false已因Chrome146+兼容被移除，不能把该参数或其WSL网络方案照搬到本机。这些案例改变的是检查假设，尚未证明本机根因或修复。

## R13有效恢复原语与R14候选

R13实际官方cdp能力可用且无新增开发权限或安全拒绝。HTTP GM页在打开副屏前后只收到0个attached子target事件，未猜selector、未对about:blank发CDP。把同一副屏导航到原有HTTP静态SVG后，Page.getFrameTree确认同源frame，Page.bringToFront返回成功并紧接正常tab.screenshot，133ms返回5868字节实际JPEG；此时tab.active=true。R12同种静态页只window.focus仍active=false、5000ms超时。由此验证page级激活是有效恢复条件，不是单纯延长等待；仍未证明active是唯一底层根因。原Deck副屏尚未取图/拖动。原件`.local/status-alignment-20261027/chrome/r13-target-activation/receipt.json`SHA256 `782cf04380ace171bf44bd93c72a51400bec4e6a645e6e17085110d3016ba4b2`。

R14让产品副屏先加载模块真实的`templates/popout.html`静态空壳，不加载world URL或脚本；原GM仍负责快照与命令。初始化等待该实际文档完成后再写入页面，设置base为GM document.baseURI，保持Actor图片/拷贝样式的相对路径，在Foundry前缀路由下同样正确。名称/复用窗口、权限、状态、列宽、无蓝光等行为不变。这样具备正式HTTP来源，可按已验证原语激活实际Deck目标，不把静态SVG成功当产品成功。

对应检查：打包必须包含同字节无脚本空壳；打开/延迟加载/前缀资源/加载中关闭回归，以及完整模块测试、类型、构建/手册和实际副屏原链。首次模块运行90项通过、旧runtime-contract仍硬断言blank URL而失败，已将该过时实现断言改为对真实分发空壳无script/iframe/子元素及bundle无socket/第二客户端的边界检查；旧失败日志保留。R14具体截图和完整pointer仍待本机验收，未提前宣称修复完成。

R14最终91项/851断言、类型、模块构建、38项手册通过。六个资源（JS、两语言、两README、新空壳）已定点安装，119文件逐项匹配。初次安装后响应检查错误要求text/html而拒绝；Core14.368实际express.mjs明确将HTML/XHTML静态资源设为text/plain，已按该精确来源修正取证预期，未改服务器MIME、安全策略或再次复制安装。HTTP200/UTF-8正文与构建一致；真实浏览器里能否正常重建HTML DOM、样式和图片仍列入R14集成检查，不能仅因body字节一致就接受。安装前值未在抛错前持久化，R11冻结清单仅作参考，没有冒充当时现场。

## R14真实Deck接受与收尾

真实HTTP Deck默认截图仍5000ms超时，官方Page.bringToFront后立即正常截图435ms成功。产品在text/plain文档中正常重建HTML root/body/title，base沿用GM/game，727图完成、无破图、无script/第二世界载入；实际标题字形为本地Noto Serif SC。FontFaceSet.check与实际字形存在观测差异，未把工具返回false误判字体失败，精确差异不在本次另行扩大。

1440×1000完整图及拖动62/双击55/菜单原件齐全；初期尺寸覆盖后仍裁切的旧图保留，没有用它们冒充完整图。真鼠标55→62、正常release/resizing false、非拖动稳定、真双击55通过。两表全部共享4列的cell边界差0，62个状态中文和两个代表菜单入界，5个HP与11个先攻原值不变，恢复原设置/viewport/自有页且Next保留。证据`.local/status-alignment-20261027/chrome/r14-http-shell/receipt.json`SHA256 `74ea754da98a72ef7187388b13b14504b822f73e18faa1e73dc01d3874413ca7`；父聊天已亲自看真实完整图和唯一稿。

当前已验证的是本任务官方验收路径恢复：需要显式激活真实page，不能称Chrome默认捕捉工具或扩展内部已经被修补，也未认定更底层唯一根因。无浏览器/服务器安全设置、工具代码、native或外部CDP更改。R15仅补右上主屏纸签/深色关闭框与原稿一致的适配，原动作及R14有效运行证据复用。

## R15最终闭合

R15获得真实1440×1000完整副屏及580×100顶栏图，主代理亲自看图后接受所选稿的最终工具栏适配。主屏短纸签保留完整中文aria/title，深色48×54关闭框使用FA xmark；真鼠标主屏动作使原面板由无到可见并保留副屏，再真鼠标×只关闭副屏。原模式/设置/viewport和本任务页均恢复，用户页保留，Next33448继续active/users0。原件`.local/status-alignment-20261027/chrome/r15-toolbar/receipt.json`SHA256 `ffc319360a2d1b41520930f99bf09e7f5bbcec8ec78807a2078a1ed1158fcc33`。

尺寸覆盖顺序也已实测收拢：先激活真实HTTP副屏，再viewport.reset/set并核对实际CSS1440×1000，随后正常捕捉即可完整；在GM活动时先设置的三张小内容图没有接受。当前125%接口请求1800×1250及ROI比例是本机现场校准结果，不推广成所有DPR的固定值，不直接把请求尺寸当成真实像素。无需再拖动重跑R14矩阵来修复取图准备层。

本任务所需原Chrome取图/鼠标链已恢复，产品副屏本身也已完成代表接受；Chrome默认工具为什么没有自动完成target激活的更底层实现仍未作唯一归因，未给出版本升级/扩展损坏等无证据结论。旧R7部分鼠标、R8/R9超时及R12静态失败均保持原件，当前通过来自R14/R15新证据，不追认旧失败为通过。
