# Open Session Deck 弹框去模板化 UI：外部调研与建议

日期：2026-10-26。用户原话：“最后 我实在是太想修改这个弹框的 UIai 感了 有什么好办法吗？外部调研”。本轮交付为外部调研和建议；未修改产品源码、运行设置、Next安装文件或数据，没有执行新一轮Foundry/Chrome验收，也没有commit/merge/push。下述视觉和交互方案均是助手建议，尚未获用户选择或实现。

## 当前界面证据与判断

当前目标仍为Deck0.2.0的Next606布局候选，已恢复1px可拖细线。复用本worktree `.local/session-deck-next606/thin-divider/thin-line-full.jpg` 和 `thin-line-detail.jpg`，结合src/templates/deck.hbs及现有CSS只读核对。截图外层红色窗口尺寸告警和Session Monitor HUD来自Core/其他模块，不作为Deck设计缺陷。外部产品本轮主要核对原作者文档；Monk's TokenBar官方仓库截图已实际看图。没有把未渲染的Tidy/HUD文档图片说成已经视觉验收。

“AI感”是用户对视觉的评价，不是对生成来源的技术鉴定。针对当前图，我的判断：

- 当前HP、基础上限、上限修正、有效上限、临时HP、AC及修正用相近的盒子/尺寸/字重铺开，重复的0和上限值与真正紧急信息争夺注意。
- 左侧每人是大块表单，右侧NPC又重复另一套卡片；字号不大但纵向耗空间，常见窗口只能见少数完整角色，扫描与比较困难。
- 每人常驻激励/力竭/状态/护甲修正/专注/死亡豁免/角色卡等控制，几乎没有“读数”和“操作”层次。
- 标题区同时承担品牌、世界/场景、Core/system版本、支持状态、回合/行动者和一串配置按钮，层级拥挤。字体装饰与普通表单混用，统一性不足。
- 本次细线已解决拖动条的视觉重量，但信息组织、表单边框和操作密度仍是另一层问题。不能用修细线的通过证明整个UI已符合用户审美。

## 检索与一手证据

按用户规则先用AnySearch，发现code/gaming/social_media垂直能力；gaming仅覆盖电竞/Steam，不适合此问题，因此用通用检索加reddit垂直混合初搜。GitHub原文用已连接GitHub工具读issue、全部20条评论、README和仓库身份。连接器返回的repo metadata不含star字段，另用AnySearch读取公开GitHub REST metadata补关注度代理。

### 一手改版反馈与反证

[Tidy5e #1521](https://github.com/kgar/foundry-vtt-tidy-5e-sheets/issues/1521)从2025-12-17讨论至2026-07-30关闭。反馈涉及可扫描分类、行高、屏内可见内容及额外点击；也有人认可新版外观，但保留旧版使用习惯。维护者解释响应式、缩放与维护成本的取舍，并补充Basic/紧凑方向的设置。结论只支持“紧凑信息组织与常用操作可达性应单独验证”，不证明所有用户都喜欢旧版，也不证明图标、边框或深色本身错误。

- [Silvestrae：喜欢新版外观但难扫描分类](https://github.com/kgar/foundry-vtt-tidy-5e-sheets/issues/1521#issuecomment-3765129973)
- [Silvestrae：行高与新增分类导致内容移出屏幕](https://github.com/kgar/foundry-vtt-tidy-5e-sheets/issues/1521#issuecomment-3925036172)
- [维护者：响应式/缩放的约束](https://github.com/kgar/foundry-vtt-tidy-5e-sheets/issues/1521#issuecomment-3735718795)
- [维护者：Basic主题和仍余行列自定义](https://github.com/kgar/foundry-vtt-tidy-5e-sheets/issues/1521#issuecomment-4627786156)

据此修正建议：不能把所有按钮一概藏进更多菜单；HP、状态等高频编辑保留一击入口，具体频率仍需GM确认。不能以放大留白作为唯一美化办法。

### 最有用的界面参考

| 来源 | 已核实的做法 | 本面板可借鉴 | 适用边界 |
|---|---|---|---|
| [Monk's TokenBar](https://github.com/ironmonk108/monks-tokenbar/blob/main/README.md) | 头像配少量读数，点击/上下文菜单承载操作；官方截图已看 | 首屏突出角色身份与少量关键状态，减少常驻表单外观 | 本面板需要更丰富的多角色编辑，不照搬成一条头像栏 |
| [Token Action HUD Core](https://github.com/Larkinabout/fvtt-token-action-hud-core/blob/main/readme.md) | 选中Token对应动作、分组可定制 | 操作按当前对象/分组展开，避免每人重复全部按钮 | README是能力事实，未验证其当前系统兼容或安装；不是本轮引入建议 |
| [Party Overview](https://github.com/League-of-Foundry-Developers/party-overview/blob/master/README.md) | HP当前/上限、AC、被动值做整体概览，语言另页 | 借“可比较的队伍状态表”，低频资料分层 | 历史仓库仅作信息模型参考，不把2021-era模块推为V14/606可用 |
| [Carbon Data table](https://www.carbondesignsystem.com/building-blocks/core/components/data-table) | 可展开行、行内操作及选择后批量操作栏 | 概览/详情/批量操作有明确层次，常用按钮仍可直接放行内 | 借布局机制；不引入Carbon框架，不采用文档的AI presence标签样式 |

热门跨领域产品只作原则对照：[Linear原作者改版记录](https://linear.app/now/how-we-redesigned-the-linear-ui)强调减少框架噪音、对齐与层级；其SaaS外观不是本面板的整套模板。

### 关注度分档

以2026-10-26公开GitHub stars为狭窄代理：<30小众、30–199中等、≥200较高；这只是本次取样分档，不等于Foundry安装量、质量或兼容性。

- Tidy5e：84 stars、32 forks，属于本次中等档，主要作一手改版反证。
- Monk's TokenBar：65 stars、65 forks，中等档，主要界面参考。
- Token Action HUD Core：公开项目页27 stars、38 forks，小众补充。
- Party Overview：REST顶层2 stars/4 forks，历史信息架构补充；不误取fork parent/source对象的4 stars/12 forks为本仓库数据。

主借鉴选择Foundry相关中等关注对象；没有围绕热门模块重做引入评测。

## 建议方向与方案边界

### 首选：紧凑的原生GM工作台

保留队伍/遭遇双栏及可拖细线。以连续行与统一列对齐组织角色；生命当前/上限、临时生命、AC、状态成为首层读数。低频的基础上限/修正细节进入可展开行，死亡豁免在需要时明显出现且仍能手动访问。不要硬删除数据或功能。

当前HP可继续原位编辑，但普通状态收敛输入边框/底色，悬停或聚焦时提示可编辑；常用状态、伤害/治疗与下一回合保持直接可达。具体哪些常用仍是建议，未写成用户要求。多人选择后才出现批量操作工具条。

遭遇侧沿先攻队列排；当前行动者用一条明确但克制的强调。返回/下一回合固定位置，减少每个NPC重复的全套表单。标题区以游戏任务和回合为主，正常版本信息放帮助/关于入口，异常与不支持版本继续明显提示。两区采用统一中文正文、等宽数字、有限字号与灰度层级，沿用Foundry语境的少量强调色，不额外增加装饰性卡片/渐变/玻璃层。

### 可选：纸本GM屏的视觉气质

同样的信息结构上使用偏书页的浅米色/墨色、节制的衬线标题与横线分区。它可能更有TRPG个性，但必须检验长时可读性、深色环境及与Foundry窗口的协调。不是简单给现有每个盒子加羊皮纸纹理，也不是已确认用户偏好。

### 实施前最小可审阅产物

先用相同5名队员、多个NPC、长姓名、受伤/专注/0HP/死亡豁免、窄宽两栏做两个静态样张：原生紧凑版与轻书页版。展示正常/悬停/展开编辑三种状态，用户选方向后才接正式视图。目标是在常见1100×760窗口更容易总览5人；这个目标还没有通过新原型验证。

评估应回答：第一眼能否找出低HP和当前回合；常用操作有无增加点击；长中文是否完整；收起详情后是否仍知道有可用操作；窄栏是否保留本次已经修好的完整显示。视觉样张不代替真实拖动、焦点、数据重绘或系统API验收。

## 待判断本地化清单与新候选复查

本轮没有新增模块安装或本地化候选，只有界面借鉴清单。既有模块health/运行支持状态不变，Untested不作可用。若后续真的考虑引入模块，先查既有2026-09-22记录与当前health，核精确Core/system及模块版本、维护状态、许可证、原作者界面资料，再按授权在对应实例窄验收；不能由本报告外观建议跳成安装或生产授权。

若仅重做Deck外观：核对新的参考图是否仍是同一产品/版本，沿用已有稳定交互，先审静态方案；选定后再改本模块模板/CSS，按实际改动补主屏与副屏、可拖细线、键盘、重绘、窄栏和错误提示。保留既有副屏截图工具缺口，不用静态样张把它改判为通过。

## 调研缺口

- Reddit Party Overview原帖遇机器人验证，未绕过；初搜返回的评论摘要没有作为最终一手结论依据。
- Token Action HUD wiki的一次AnySearch正文请求在TLS建立前断开；仓库readme已通过GitHub连接器取得，因此没有重复猜试或扩展控制通道。
- GitHub连接器读取HUD的README.md返回404，项目公开文件清单确认实际名为readme.md，随后按精确路径取得。
- 这是来源与当前截图支持的设计建议，没有用户选择、新UI实现或新运行验收。调研不证明某种审美普遍优于其他风格。

## 后续视觉反馈与材料补查

用户指出前三张“太AI”，随后说明没有顺眼的现成参考，并追问先前承诺的“TRPG桌面工具风”在何处体现。前三图只作为未获选择的概念保留，不作为已确认方向。下一张以整个窗口的材质和装帧骨架为单一修订目标，而非继续展开三套泛化主题；仍不改产品代码或安装。

AnySearch新批次两条检索在TLS建立前失败，改用现有web检索。Dragonbane官方GM Screen产品页仅得到检索摘要，正文403；未获取、未声称看过官方美术，也未绕过。Vaesen官方Foundry入口指向fvtt-fria-ligan/vaesen-foundry-vtt；GitHub连接器取得README及asset/headquarter.png并实际显示。只借底纸/墨色/装帧统一视觉的做法，不复制其版面、品牌、插图或规则；尝试将连接器图像另存时，Node调用因超过64000-byte auto-review大小限制而未执行；没有另存图像，改用已显示的聊天图像作为ImageGen参考。原作者来源 https://github.com/fvtt-fria-ligan/vaesen-foundry-vtt/blob/master/asset/headquarter.png 。此为小众视觉补充，GitHub网页快照18 stars，不是当前安装量、兼容或引入建议。

修订构想是助手自行提出：深色书布外框、一整张有纸纤维的灰米色记录页、页签式工具栏及小头像；不把这些具体材质记成用户已选要求。用户已明确的目标仍是整个弹框UI/UX与可识别的TRPG桌面工具气质。
