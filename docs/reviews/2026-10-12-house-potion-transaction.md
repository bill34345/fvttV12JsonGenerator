# House H1/H2：药水事务与手改保护

本地版本0.1.3候选，未安装。配置/标签/本地化仍在runtime入口，纯药水规则已有独立模块；新增potion-transaction负责同Item串行、快照和读回。

反例先红后绿：双apply均成功；初始setFlag等待中手改或失去GM仍写；update已完成而Promise等待时新增manual被纳入基线，恢复时误删；unsetFlag被veto却报告恢复成功，修正后又暴露无重试入口。

最终实现要求非目标原映射不变、无额外ID、生成三Activity按既定_id及字段核对，仅放行已知空healing.scaling默认值。歧义保留schema1。恢复清理重试仅同Item实例，绑定UUID、完整快照与原图；只unset，不重复Activity写入。外部改动拒绝继续。

75项模块检查/411断言、类型通过；独立复核关闭P1/P2。未实机核对的新系统默认值仍失败关闭。可选Midi版本表未改，605/606未知组合继续拒绝；该药水切片不接受全部房规。无真实文档/服务/浏览器操作。
