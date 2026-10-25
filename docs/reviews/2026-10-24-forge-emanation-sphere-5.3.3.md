# Emanation与Sphere在本机dnd5e5.3.3中的定义及模板行为

用户要求先核实Foundry是否把本例光环与球状统一定义为球状。本次只读核对系统源码、官方2024数据与既有取证；未修改产品、AI结果或最终JSON，未重跑AI，未写Foundry世界。

## 结论分层

1. **画布底层相同**：dnd5e的radius与sphere均映射到Core的circle模板。在2D地图上都画圆，不能靠圆形外观或“球状”这个中文标签单独判断生成错误。
2. **dnd5e配置及行为不同**：radius的系统标签是Emanation，sphere的标签是Sphere。AbilityTemplate.fromActivity仅为radius设置dimensions.adjustedSize=true；预览悬停可见Token时，系统把Token较大边长的一半加到基础距离。sphere不进入该分支。因此不能将二者视为完全等价的系统配置。
3. **本例独立对照**：release-5.3.3的官方actors24/fiend/balor.yml里DeathThroes与FireAura均使用target.template.type=radius。本次SRD5.2.1来源也明确写Emanation，而初始AI、生成JSON及既有原生卡均用sphere，故类型不符的判断维持。官方pack只用于比对类型，不将它的其他数值覆盖本次SRD来源。
4. **证据边界**：上轮只依据枚举标签就下结论不充分；本次补齐了实际安装源码一致性、模板执行分支、官方同版Actor和非浏览器源码探针。未重新在真实场景摆放模板，未验证第三方模块Hook、实际受影响Token或移动／自动伤害效果，不把本结论扩成实战覆盖已测。

## 精确版本与本机对应

- 安装系统为server-mirror的dnd5e5.3.3；已从dnd5e-compiled.mjs.map提取module/config.mjs和module/canvas/ability-template.mjs，归一LF后与锁定5.3.3 reference逐字相等。
- `bun run references verify dnd5e-5.3.3`通过；该命令也读验了已配置的current-6缓存，没有升级、替换或把其行为用于本结论。
- config.mjs第2836行附近分别定义radius/Emanation和sphere/Sphere，两者template均为circle。
- ability-template.mjs第54至73行选择Core图形并设置adjustedSize；第220至237行按悬停Token尺寸调整distance。
- 官方actors24 Balor数据第605与747行均为type:radius。SpiritGuardians2024数据也使用radius；不由“Aura”能力名推断类型，只依据本例规则明确写出的Emanation。

## 最小行为反证

运行`.local/emanation-sphere-source-probe.mjs`，执行实际安装包中原始AbilityTemplate.fromActivity和_onMovePlacement，仅替换Document／Canvas依赖，未建立浏览器、场景或Token。8个分支通过：5尺／30尺，悬停无Token／3格Token，radius／sphere。

在5尺方格、3格宽高Token的探针条件下：

| 类型 | Core图形 | adjustedSize | 基础5尺时的distance | 基础30尺时的distance |
|---|---|---|---|---|
| radius/Emanation | circle | true | 12.5 | 37.5 |
| sphere/Sphere | circle | false | 5 | 30 |

未悬停Token时两者距离均保留基础值。以上是源码执行结果，不是当前世界的实景模板截图或第三方自动化验收。

原件：`H:/CodexData/visualizations/2026/10/24/01a16bdb-060b-7bf0-b3bc-6856d049157a/balor-2024-third/shape-verification/native-source-probe.json`。原AI、候选JSON和上一轮原生读回保持。

## 数据来源与适用范围

- [官方5.3.3配置](https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/config.mjs)
- [官方5.3.3模板源码](https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/canvas/ability-template.mjs)
- [官方5.3.3的2024 Balor](https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/packs/_source/actors24/fiend/balor.yml)
- [维护者关于Emanation配置的原始需求6723](https://github.com/foundryvtt/dnd5e/issues/6723)，对应5.3.0；说明系统将Emanation作为独立可配置类型。它不能单独证明本机移动／附着效果，最终依据为上面的锁定实现。

待判断本地化清单：无新增模块候选；本次是已有系统定义核查。新版本／新模板模块复查时，先核实际源码与官方同版内容，再检查radius对应的调整、Token关联及第三方Hook；不得把5.3.3结论直接推广到其他系统版本。
