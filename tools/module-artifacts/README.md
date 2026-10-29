# 独立模块包只读校验

`verify.py` 是发行准备的机械校验器：读取指定的stage目录与ZIP，核对module ID/version、ZIP路径与CRC、全部文件字节及SHA-256。不构建、不安装、不写文件、不连接服务；JSON输出的scope始终为 `file-integrity-only`。

```powershell
python tools/module-artifacts/verify.py --module-root foundry-modules/fvtt-babele-rolltable-embed-translation/dist/module --archive foundry-modules/fvtt-babele-rolltable-embed-translation/dist/fvtt-babele-rolltable-embed-translation.zip --module-id fvtt-babele-rolltable-embed-translation --version 0.2.1
```

可选 `--expected-paths` 接收JSON数组，使用模块owner提供的精确相对路径白名单；不提供时只核ZIP与stage路径集一致，不能据此声称白名单已经审核。含重复/逃逸/链接或特殊文件、内容不一致、外来manifest时退出1。测试使用stdlib unittest和自有临时目录。

业务语义、目标版本、内容来源、许可、已安装身份及真实Foundry接受继续归各模块；此工具不能给出可发行结论。
