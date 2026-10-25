# Forge 生物生成与关联召唤物工具

本目录承载规则资料Intake的CLI入口，以及携带正式来源和配套脚本的生物导入文件制作。本体及能力关联的召唤生物／物件统一属于生物生成，面向用户称“生物与召唤物”，不使用encounter package或战斗包作独立功能分类；旧代码符号和协议仅作兼容标识，命名依据见[当前决定](../../docs/plans/2026-10-20-forge-ab-current-state.md)。Actor数据必须来自正式workflow，并由接收端重新生成；不在打包器里手写或修补Actor JSON。examples是明确的样本来源和专用宏，不作为通用AI推断规则。

真实AI调用使用已配置的专用Provider；先扫描来源与显示名称中的配置凭据，逐阶段保留来源hash、IR与审阅记录。本地入口默认使用DS API deepseek-flash（V4.1 Flash），从外部现有凭据读取到内存，不持久化Key。Luna Max仅负责已授权的server-mirror验收操作，完成后返回报告，不持续监听。审核不通过不输出可导入包。

localCodexResponses仅适配已审本机桥的Responses框架：由完整且同一响应的assistant completed item补齐空终态、移除终态后的单个代理结束标记。不得把部分delta、跨响应内容或未知协议错误提升为完成，不放宽共享解析器。测试不读取凭据或访问真实服务。

打包不会执行脚本或写Foundry世界。AI只能返回固定能力与参数；控制入口由工具编译，拒绝AI返回的可执行代码。固定配置在明确启用后通过模块flags恢复，停用必须持久生效。运行时关联通过forgeEncounter.actors中的确定性Actor UUID提供；不得硬编码用户世界ID、凭据或API Key。目标固定14.364/5.3.3/core。

修改样本宏时对照来源与锁定API，生成包后经过当前正式预览和本地运行验收。禁止把包内自称accepted作为自动执行代码的许可。
