# Forge 显式 thinking/high：同源 A/B 各一次

用户授权：保留 low 首轮，在相同独立工作树用原定三份来源、同一模型、同一验收各跑一次 A/B；两边显式 thinking enabled、reasoning_effort high。首次回复/失败保留，不重试刷通过，不动原工作树，不修 A。此次也不在运行中修 B。

所有输入、A 完整提交 `f637f77f28c086e34297513e5293f98b3835f2e9`、B 两个业务文件、提示/模板、公共基础与 Angel 既有切分、顺序 S1 A→B/S2 B→A/S3 A→B、600000ms 请求超时、json_object、首错即停、共同完整验收以及27次HTTP硬上限，均沿[low 首轮计划](2026-10-19-forge-real-ab-first-pass.md)。不增加来源或基础/切分/翻译/裁判/repair请求，不从low的模型能力答案制作新输入。

新运行器为受控参数派生，旧 low 运行器和原结果不改。由于现有公共 transport 没有独立 thinking 参数，只在本次两边共用的 HTTP 实验适配端把 `thinking:{type:'enabled'}` 写入实际请求正文；原 provider/组装/校验源码不动。实际 wire body、保存 body与body哈希必须一致，且 reasoning_effort 必须已经是 high，不能偷偷把 low 改成 high 后声称调用方配置正确。温度仍发送0以保持参数相同，但它在 thinking 模式下不生效，不能当作确定性控制。

新目录 `.local/forge-ab-high-first-pass-20261019`，独立排他 started 标记；low 目录全部文件先记录指纹、原109份首轮冻结证据先核对、结束时再核对未变。low 的原始失败标签、估算与报告均保留。

本批检查：先假 HTTP 核对两侧实际发送 thinking/high，以及计数、重复/预算、首错保存与脱敏；再零网络 dry-run 核三来源/基础/源码/凭据存在性。通过后仅执行一次真实high首轮。运行后人工按同一来源锚点判断；正式机器失败仍保留，不因发现公共误报而改判成功或改验收。跨 low/high 只能描述这两个各一次的小样本，缓存、服务负载与随机性没有控制，不能宣称力度提升的因果效果。

费用沿当日官方报价和实际缓存/输出用量计算，只是公开价估算，实扣账单 UNKNOWN。只保存推理token计数，不保存推理正文。运行器安全/参数变更不改变现有 Forge 用户界面或生成入口；没有产品模式发布或手册功能变化。未授权 commit/merge/push/Foundry 安装与实机。
