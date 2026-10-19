# 撤回死亡天使的功能完成结论

用户指出的回退成立：之前生成的魂镰没有同Item、由GM单独点击的CON18 Save及失败死亡效果；施法被缩成Utility次数记录，没有真实法术匹配／Cast；Actor双语名自动加了括号。此前“基础操作与GM边界PASS”只证明了缩减后的错误合同，不能证明用户原目标已完成。现撤回该功能完成结论。

原来源、第一次失败、DeepSeek回复、IR、JSON、导入卡和旧验收文件原样保留，不改写历史。真实旧候选的四项失败已固定在 `.local/forge-legacy-restoration-20261016/existing-candidate-red.json`；独立Luna/medium聊天“Forge 旧功能回退审计”确认了staged入口排除spellcasting和拒绝secondary/effects的可达性缺口，报告在同证据根 `independent-audit/legacy-capability-reachability.md`。

本轮完成条件恢复为：来源→当前staged IR→正式workflow→同Item独立Save及失败状态；接回现存manifest／resolver，真实匹配法术并在本地水合、正常原生Cast；通用中英文名称不新增括号、源名自带括号保留；审计已存在的其他能力并做实际入口防回退；最后核对原生读回与普通模块恢复。生成、匹配、水合、实际使用分层记录，不能用Utility、全文保留、导入成功、收据或清理代替功能完成。
