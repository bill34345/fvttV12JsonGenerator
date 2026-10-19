# V7 全新 Archivist Grim 首次测试：失败 0/1

沿用用户指定dirty工作树和V7冻结，不改产品代码。用户要求再拿一个此前未处理过的生物，按已记录输入输出、fixture、旧IR/译文、验收计划和世界roster排重。Nabassu因旧世界已有而在选择前排除；选定作者公开Archivist Grim，未使用旧IR/译文，未换样本或反复生成。

作者来源：[Library Monsters!](https://www.patreon.com/confluxcreatures/posts/library-monsters-140110477) / [同一作者公开原文](https://homebrewery.naturalcrit.com/share/0ZhEKPSQfwEB)。PDF附件普通HTTPS返回403，原获取失败保存；同一公开原文正常GET200，完整原始MD、HTML与CC0许可保留。输入只去掉展示包装、展平六个标记明确的属性行，7个完整能力正文逐条等价检查通过。没有改变数值或规则。它是新的作者原文来源测试，不冒充新的PDF二进制端到端测试。

V7的335产品文件和正常16安装文件SHA不变，冻结d3dbb8f3ffa65d5eb2b174b6456a3f3d718a94fa6713edc79f2786c8287474d5。现有Mirror原PID36592不再存在且30001未监听，排除其他Foundry进程/peer后复用既有app14.368/Node24.17.0/data server-mirror/cor-cotn启动；当前PID44976仅loopback30001，dnd5e5.3.3，未改认证配置、未停其他进程，不复制另一Lab。两个本地启动调用预检错误（路径分隔表示及配置函数参数顺序）均发生在spawn前，最终只启动一次；它们不计AI或怪物首次失败。

## 真实首次结果

- 首次业务为failed，0/1：discover仅1次HTTP200，repair/retry/paid-review0，无priorIR或priorTranslation。
- 错误：`Discovery candidate 0 quote does not match source offsets and cannot be uniquely anchored.`
- 模型识别名称正确，但start=2130，实际statblock start=2129；抄回的XP行少了一个空格。整段quote忽略空白后与完整原statblock一致，无机械文本缺失；按当前精确/CRLF锚定规则不能匹配，在base/能力/中文之前拒绝。
- 请求耗时167359ms。原请求收据记录49301总tokens，其中47218 reasoning tokens；仅记录用量，不推断模型内部推理或故障唯一成因。
- prepared=false、完整中文=false；无有效包，不能正式批准/导入。native/refresh保持NOT_EXECUTED，不能把HTTP200或程序退出0算业务成功。

当前问题在发现阶段的来源定位责任：仍让模型抄整段原文、报字符位置，表示差异使第一步阻断。已保存Source→provider reply→normalizeDiscovery→result/receipt与离线差异，不修源/草稿、不改代码、不重跑模型，也不换一个更容易的生物凑通过。它不直接证明后面的完整GM手动实现失败，因为那些阶段未执行；但明确证明当前V7不能保证全新怪物首次交付。旧12来源/Actor链与9完整中文/native结果继续有效，不用旧PASS覆盖这个新失败。

原件在`.local/forge-v7-unseen-archivist-grim/`，总体首次失败收据first-test-failure-receipt.json保持原样；最终收尾另存test-closure-receipt.json。独立GPT-6 Luna/max完成预检及收尾，父任务核对原始回执、DOM文件和截图SHA并查看截图：本轮Foundry页651345265和来源页651345268正常关闭，owned清单为空，用户页前后均为5。没有Actor、Macro、helper创建或世界设置写入；Mirror PID44976仍只监听127.0.0.1:30001，按常驻约定保留。付费AI审核0，不提交合并推送，无生产操作。

浏览器来源核对的边界：实时DOM包含完整六个属性行及全部七条能力，未发现来源正文缺失；但截图中属性块越出白色页面且被插图遮挡，视觉可读性只能记为PARTIAL，不能记PASS。页面中的浏览器自动翻译不属于Forge正式中文，也没有用于生成输入。PDF403未重试。本轮“新样本测试并如实保存结果”已完成，结果仍为首次失败0/1；发现阶段缺口尚未修复，不能将收尾完成写成生成修复完成。
