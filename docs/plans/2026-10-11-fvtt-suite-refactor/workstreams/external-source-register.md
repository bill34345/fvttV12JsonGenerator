# 外部来源登记与合集去向（本地文件审计）

本次未联网更新来源、构建外部包或检查运行实例。这里只登记仓库冻结记录；链接中的上游版本和历史接受不代表当前最新或当前实装。商业分发条件均未在本次核定。

## Midi MI1

upstream.lock指向commit `4338eeab85041cd71b76ede36818e2265cbf06ae`、local.9、历史14.368/6.0.2；六个patch逐个SHA与lock相等。迁移记录另有local.10的Check/Save各+4限定接受；这两份身份不是可互换包。不得用旧lock构建覆盖新安装。没有新接口需求，不为合集重建Midi；MI2/MI3待准确源码/实装交接与窗口。

## 外部候选 E1/E3

| 冻结ID | 记录版本 | 本地记录 | 合集去向 |
| --- | --- | --- | --- |
| dfreds-convenient-effects | 9.2.7 | foundry-modules/server-next-external-candidates/candidate-inventory.json | 仅外部安装/兼容说明；不加入自有ZIP |
| dfreds-droppables | 6.2.1+servernext.1 | foundry-modules/server-next-external-candidates/candidate-inventory.json | 仅外部安装/兼容说明；不加入自有ZIP |
| global-progress-clocks | 1.3.3+servernext.1 | foundry-modules/server-next-external-candidates/candidate-inventory.json | 仅外部安装/兼容说明；不加入自有ZIP |
| vision-5e | 3.2.2+servernext.1 | foundry-modules/server-next-external-candidates/vision-macro/candidate-inventory.json | 仅外部安装/兼容说明；不加入自有ZIP |
| itemacro | 3.0.1+servernext.1 | foundry-modules/server-next-external-candidates/vision-macro/candidate-inventory.json | 仅外部安装/兼容说明；不加入自有ZIP |
| item-piles | 3.3.4+servernext.1 | foundry-modules/server-next-external-candidates/item-piles/candidate-inventory.json | 仅外部安装/兼容说明；不加入自有ZIP |
| itempilesdnd5e | 1.1.0+servernext.2 | foundry-modules/server-next-external-candidates/item-piles/candidate-inventory.json | 仅外部安装/兼容说明；不加入自有ZIP |
| DAE适配 | 14.0.14+servernext.1 | dae/README.md；已记录来源ZIP及脚本hash | 外部补丁单独维护，作者许可未在本次核定 |
| classpack | v4.3.4-next.1；606仅加载清单候选 | classpack/README.md及load-compatibility.ts | 内容与发行范围独立，禁止整个目录并入自有包 |
| icons修复 | 历史605：73引用/11缺失路径 | icons/README.md | 既有游戏资产引用修复，不是合集自有素材 |

所有目录保留原owner和证据。历史库存里的已退役工作树路径仅是旧记录，不读取或复制其内容；没有实际消费者的新需求不执行E2广泛适配。来源许可、翻译/媒体可分发性未知项保持UNKNOWN，发行前须逐项核定。
