# Forge 原定三来源真实 A/B 首轮

授权：用户要求在现有独立工作树，用原定三来源、同一模型与验收标准各跑一次真实 A/B，保留首次回复与失败，不重试刷通过、不动原工作树、不顺带修 A。不包括 Foundry、翻译、额外基础提取、修复、安装、提交或合并。

A 完整提交仍为 `f637f77f28c086e34297513e5293f98b3835f2e9`；B 使用已通过固定回复接线的当前两个模块，执行前冻结源码哈希。只新增本次 opt-in 运行器、测试入口、计划和结果说明；不修改两方案的业务实现。

来源/基础原件与哈希沿原最小方案和 `forge-category-md-pilot-inputs.test.ts`。只取八组基础事实，不给模型旧能力答案。三份完整来源和公共校验结果保存在本次私有 `.local` 证据目录，属于新试验来源链，不是原工作树备份。原件只读。Angel 共用已有行号切分回复，不修 A 的确定性切分。

顺序固定：S1 A→B，S2 B→A，S3 A→B，串行；预计 24、硬上限 27 个真实能力 HTTP，每个一次尝试。任一侧遇到首个失败立即停止该侧，另一侧继续自己的首次运行；后续阶段 NOT_REACHED。没有自动重试、repair、追问或答案替换。运行目录有排他 started 标记，禁止无意重复执行。默认命令仅做 dry-run；`--execute` 才允许网络。

A 通过原公共 provider/staged auto 入口，HTTP 端口仅回放公共 source/base 两阶段，能力请求保持 A 原有 prompt 与 payload。B 通过既有 category-md-extraction 入口，每个非空类别一次；使用相同 transport、模型、reasoning、json_object、温度与 600000ms 单请求超时。两个回调均捕获真实 HTTP，用量与 finish reason；不记录凭据、请求头、推理正文。完整业务回复与安全请求正文只进入 ignored 的本次私有目录，不进入普通日志或 Git。

共同出口：anchor → validate → render → workflow/parser/generation → Intake verifier 与 Actor verification。来源逐项人工核对原方案关键锚点。保存首次失败时的阶段、路径、已收到/未达到的能力，不把失败提前停止说成提速。产物失败时不手改 IR/MD/JSON。

计时保存提取入口墙钟、真实 HTTP 等待合计、本地提取余量和后续正式生成/校验耗时。入口墙钟含两边现有只读来源/基础复验；共同原件准备、适配器开发、翻译和人工核对不计入。另保存 A base validated 时间戳，避免将基础回放误计模型时间。A/B 只有同源都达到同一正确性出口才比较成功耗时。

价格来源：https://api-docs.deepseek.com/quick_start/pricing/ ，2026-10-19 读取。该页标示 deepseek-flash 为 DeepSeek-V4.1-Flash-1017；off-peak 每百万 cache-hit input $0.003、cache-miss input $0.15、output $0.6；peak 为两倍。01–04 与06–10 UTC工作日为峰段（中国公众假期除外）。实际请求窗口记录在每笔审计中；缺用量或缓存细分则费用 UNKNOWN/区间，不伪造账单。报价估算不是账户实扣证明。

本批验证理由：先 dry-run 核对公共前置、原件与源码身份、排他目录和零网络；用固定假 HTTP 验证计数/首次失败/回复保存；再唯一一次真实首轮。运行后只读回本次原始回复/产物、核对原工作树前后指纹和成本算术，不重放真实请求、不扩大来源。
