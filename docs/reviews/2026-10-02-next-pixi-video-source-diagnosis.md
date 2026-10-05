# ServerNext 旧 Pixi 异常：视频资源归因切片

日期：2026-10-02。本轮非暂停迁移调查；只读，不修改Core／Pixi／模块／媒体／场景或角色。唯一总状态见[总表](../plan/server-next-migration-handoff-20260927.md)。

## 已核事实与当前缺口

此前保存的parent-relogin-errors-v11.json内两条Pixi错误为2026-09-29T06:13:50.201Z／.284Z，Core14.368／dnd5e6.0.2现场；堆栈连续重复VideoResource `_onPlayStart` 与 `_onCanPlay`，没有包含具体视频URL。不能把旧堆栈当作6.0.5已复现，也不能从堆栈给某个模块定责。

实际Core14.368安装的Pixi为7.4.3，固定文件在 `app/14.368/node_modules/pixi.js/dist/pixi.min.js`，SHA-256 `712a3e1943b062a907d86c5bb56b67c7b32a3f03b3654768b00b7016d30a24c6`；不是同名public/scripts实体文件。实际包内VideoResource.mjs、BaseImageResource.mjs与Resource实现提供当前窄接口事实：视频play-start时资源无效会调用can-play；can-play执行update后若source仍playing又调用play-start；父图像资源用videoWidth／videoHeight或element宽高更新resource尺寸。若尺寸仍不能使资源有效，则存在同步互调的条件。该源码机制不是具体失败媒体归属或当前实机根因证明。

Core当前Tile `sourceElement` 来源为 `tile.texture.baseTexture.resource.source`；Pixi7.4.3的BaseTextureCache可只读枚举video resource。一般VideoHelper getter在texture无效时返回null，本切片不经该getter隐藏无效源，直接只读resource/source。没有调用更新、播放或暂停以驱动结果。

最小反证检查：在本轮新的正常GM客户端只捕获当前Pixi error堆栈和时间，再读取缓存/现存Tile/背景video resource的valid、width/height、HTML video尺寸、paused/ended、readyState、networkState、path、归属与错误码；1秒间隔两次自然采样。若全部源始终有效或未捕获失败，不将“0 error/0 invalid”写成历史已修复；需保留生命周期采样缺口。路径移除query等敏感字段，完整私有原件不进入tracked报告。

## 执行入口与边界

本树 `.local/next-continuation-20261002/pixi-video-readonly.js` 为一次只读小探针，语法检查后冻结正常Macro可保存的字节形式；不新增公共工具或测试平台。之前文件侧共用工具和身份流程已在本轮实际使用，当前只读采样使用简短独立case，不强套6.0.2旧运行adapter。

case合同 `.local/next-continuation-20261002/pixi-runtime/current-chrome-dispatch.json`，dispatch `1d6141d8-6adb-41d2-b397-30e1043f5adf`／revision1，执行聊天为本轮新线程01a0f84f-d578-7000-adb1-260bf20a1861，正确父回调保持01a0f838-b129-76f1-af31-8f26ec995bbe。本轮只读Macro／页面按出生证据清理并保存完整90 ID数组；不改变场景、暂停、媒体或现存服务。

## 当前6.0.5采样父审

**ACCEPTED_CURRENT_VIDEO_SAMPLE_HISTORICAL_FAILURE_NOT_REPRODUCED。** 父独立核真实保存命令SHA、一次领取早于两样本、原件nonce／目标及完整90 Macro ID数组，实际看正常画布截图。当前scene `k0tDQjWqrbvHbjdu`、pause=true；两次采样为UTC17:27:20.032／17:27:21.034，间隔1002ms，cache均148项、VIDEO资源均7个且valid=true、尺寸非零、media error=null，recursionPrerequisite均false。没有调用video play/pause、resource update或写场景、人物、设置、模块。

当前资源为Painter命名空间的fire-stage-i与ii各一个768×768、frost-mist-v1四个1024×1024，以及一个脱敏blob资源400×400。若干资源readyState从1到4，另有保持1的资源；valid在两次样本始终true，不能单凭readyState=1说资源无效或断言历史肇因。所有reference只来自BaseTextureCache，没有输出Tile／背景／前景关联；模块资产命名空间和缓存成员关系不证明当前场景对象归属，更不证明旧错误来源。

原生console错误原件含2条error，精确对象为已要求保留的旧测试Item identifier和当前雅灵7条embedded UUID配置；没有VideoResource、互调帧或Maximum call stack错误。这只是本次新客户端捕获未见历史错误，不是历史已修复／全世界零错误。原生网络／专用page-error流仍INCOMPLETE，没有绕用CDP或其他侧路。

出生Macro YuzZqj1bekcYQ8O8在after缺席，父逐项核完整before/after90 ID数组相同。自有页651337900已正常关闭并回执核缺席，现有服务保留。父审原件为pixi-runtime/parent-final-acceptance.json，记录数据／图片／命令／领取／日志／清理的SHA。完整native-pixi-video.json与console-errors.json不进入tracked报告。

本切片结束，不重复同样采样或试改Core／视频。下一次重开条件是实际同族错误重新出现，且保存当次source尺寸／播放状态／加载时点或具体资产URL，或有明确代码／媒体变更影响该路径。Painter限定代表行为的既有PASS保持，不重做火焰或视频推进验收；网络404／全部page-error及全世界零错误继续独立开放。
