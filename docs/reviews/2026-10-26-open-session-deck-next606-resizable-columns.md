# Open Session Deck：最新 master 上的 ServerNext 布局验收

日期：2026-10-26。用户在确认改用 ServerNext 的衔接方案后明确要求：“那就用那个验收吧”。本轮仅接入分隔线与窄栏布局，更新本地 Next 候选并验收；没有 commit、merge、push 或生产操作。原 Mirror 候选和证据保留。

## 候选与目标

- 基线：master `aefed11cce98a253ad7a36ba09fcb59ee2af39c2`；本轮 worktree `I:/OpenCode/fvttV12JsonGenerator-worktrees/20261026-164419-next606-deck-splitter`，分支 `codex/20261026-164419-next606-deck-splitter`。
- 保留 master 的 Deck0.2.0、6.0.6适配、帮助、错误处理和输入禁用原因；只从旧 splitter 候选衔接列宽控制、模板标签、容器换行与对应回归。没有覆盖旧版本整包。
- 目标仅原 ServerNext：`F:/FoundryLab/foundry-v14/data/server-next`、cor-cotn、Core14.368/dnd5e6.0.6，回环30002；任务GM页面使用 `http://localhost:30002/game`。原Next停止且端口空闲后定点更新，再通过现有readiness公开入口启动，PID32260。未重启Mirror、升级系统或制作备份。
- 七个变化资源更新，manifest/LICENSE未变；完整9文件清单与构建逐项SHA256相等，结束再次相等。安装身份由本worktree `.local/session-deck-next606/install-applied.json`、`install-final.json` 绑定，不由0.2.0版本号单独证明。
- 实际执行器从本聊天最新turn_context与Node请求均核为gpt-6.1-sol/xhigh/danger-full-access；相较10月24日medium配置已变化，按真实配置记录，不作耗时/token比较。

## 结果

**主屏限定布局验收通过；副屏视觉和完整鼠标拖动仍未闭合，整体为部分验收。** 不把既有6.0.6兼容证明扩大为本次副屏拖动已通过。

1. 新GM客户端通过正常Token工具栏打开Deck，界面实际显示Core14.368/dnd5e6.0.6/受支持；DOM存在新增竖向分隔线及data-keyboard-focus。
2. 主屏真实Chrome AX鼠标拖动44%→约62%→约39%，两栏保留；释放后 `.osd-resizing` 消失。右栏受压后上一/下一回合按钮完整重排，使用既有第11轮遭遇，没有切换回合。
3. 39%时正常密度按钮舒适→紧凑重绘保持39%，恢复舒适；双击44%、方向键46%、Enter44%均读回。主屏调整时副屏仍44%，两surface未互相覆盖。主屏关闭重开47%保持，未残留拖动状态。
4. 主屏通过实际窗口手柄缩到约922px，左列约410px；列与五张角色卡scrollWidth/clientWidth相等。实际垂直滚到最后角色，长姓名、当前状态、三列带标签数值、死亡豁免和末尾角色卡按钮均可见，无需横向滚动。`next-panel-default.jpg`、`next-panel-wide-party.jpg`、`next-panel-last-card.jpg` 已实际看图。既有status文本bloodied thinking可显示；未改Actor制造任意超长文本，因此不声称强制长状态压力样本通过。
5. 副屏由正常UI新建同会话about:blank：readyState complete、visibility visible、fonts loaded，实际1288×762，运行版本文字正确；列计算样式grid/10px分隔线、几何和无横溢读回成功。仅尝试一次官方支持的clip截图760×740，仍报 `Timed out after 5000ms waiting for CDP command Page.captureScreenshot`。因此按预先约定停止副屏鼠标链，没有再试默认/AX截图、渲染flags、rawCDP、外部Playwright或其他控制通道。
6. stylesheet DOM读回两条绝对loopback href且sheet=false；主屏对照同样sheet=false而截图/布局正常，故这个读回不足以证明副屏样式未加载。computed display/grid tracks已生效。文档/字体未完成假设在本轮观察中不成立；截图失败的本机根因仍未知，不能据此改写产品创建/样式代码。

## 检查与恢复

Bun1.3.14 frozen install；模块81test/0fail/580断言，13文件；typecheck:foundry-modules、模块build及manifest/package一致性门通过。手册从owner manual.json增加实际操作说明，review/build/check38项通过；agents generate/check34文件通过，git diff --check通过。本次不重跑全仓CI或既有HP/力竭/玩家拒绝链。

正常UI原值：队伍来源未选择、包含子文件夹true、密度舒适、activeTab party、lastMode panel。临时选既有玩家角色，结束已用正常UI恢复并读回队伍0/尚未选择、舒适/party及panel入口。没有创建fixture、写Actor/Combat或改变暂停/场景。主屏与副屏均关闭，最终本任务Chrome标签清单为空；用户原标签保留。Next保持运行，最终/api/status users0，原master tracked/index未改，既有untracked保持清单。

启动日志包含其他已启用模块的警告（汉化转换器、重击集成范围、AI Map Generation服务超时及浏览器翻译扩展）；保留console原件，未为本次布局验收改这些模块或设置。没有把这些环境提示写成Deck故障。

证据均在本worktree `.local/session-deck-next606/`：`executor-receipt.json`、`target-before.json`、`target-after.json`、安装前后hash、`observations.json`、`stylesheet-control.json`、`popout-clip-error.txt`、`restored-settings.json`及上述截图。10月24日Mirror证据仍留原worktree，不改写为6.0.6证据。

## 父聊天复核

父代理已通过read_thread核对本执行器聊天中的两条人类原话：“可以用server next验收吗？master已经做了很多合并，我在另一个thread已经把这个mod验证可以代入到dnd6.0.6里面了”及方案说明后的“那就用那个验收吧”。这是本次切换测试目标及按所述方案衔接候选的依据，不扩大为发布授权。

父代理读取了实际源码差异与模块约定，确认保留6.0.6、help、runDeckUiAction与tooltip路径；column-layout及其单测与10月24日已审版本逐字节相同。实际查看Next的wide-party和last-card截图，确认约410像素左栏的末尾角色控件完整。已读81/0/580测试原件、类型检查日志、安装9文件一致清单与恢复/目标读回。父审接受主屏限定布局结果，副屏视觉和完整鼠标链仍待证，不能用源码或主屏截图替代。

当前待办不再是等待Mirror释放：用户已经在执行器聊天选择Next且本轮已执行。唯一剩余外部阻断为官方Chrome对副屏的Page.captureScreenshot超时；本轮已排除文档和字体未就绪的解释。没有新证据前不重试同一路径、不改宿主或弹窗源码猜测修复、不换通道。代码、Next安装与所有原始证据保留，等待工具能力恢复或用户直接确认副屏行为；未将整体任务记为完成。父审冻结文件为 `.local/session-deck-next606/parent-review-frozen.json`。

## 2026-10-26 细线外观修订

用户原话：“中线不要长这样，就有原本的一条，那条可以拖就好，现在好丑”。本次实现只改CSS：可见分隔线从10px宽条回到1px、使用原边框色；去掉中部把手及鼠标宽高亮，保留11px透明命中区。键盘焦点仅改变细线颜色。拖动算法、键盘操作、比例保留和两栏换行均不改。

Next仅更新styles/open-session-deck.css，完整9文件hash再次相同。实际主屏DOM宽度1px、旧::after把手content=none、透明::before宽11px；从细线旁透明命中区实际拖动44%→57%，release后resizing=false，双击44%复位。已实际看新版截图，细线/无宽条/无中部把手符合本次外观要求。主屏原有尺寸告警与Monitor HUD保持原状，未为截图改其他模块或偏好。细线截图与原始读回位于 `.local/session-deck-next606/thin-divider/`，代表图为thin-line-detail.jpg。

既有81项模块测试/580断言、build、handbook38项和diffcheck通过。设计检测器只报告原有in-combat角色条3px强调条，属于本次未改的界面元素，不扩大改动。原手册操作步骤仍准确，只核对review并重新生成HTML。队伍来源已恢复未选择，舒适密度与panel模式保持；本任务标签全部关闭，Next保持运行。未重跑既有副屏截图失败路线，本段不把副屏缺口改判通过。

细线修订父审：已读取执行器聊天中的原始人类要求并核对CSS差异，实际查看thin-line-detail.jpg。细线样式与要求一致，透明命中区的真实拖动/释放/双击回执有效；接受本轮主屏外观修订。旧粗线截图仅保留为上一版证据，不代表当前外观。新冻结记录为thin-divider/parent-review-frozen.json。副屏工具缺口不改判。
