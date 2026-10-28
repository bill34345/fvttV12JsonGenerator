# 名单行高与头像缩略图

用户在2026-10-27指出，先攻与队伍头像／姓名占用过多垂直空间；先攻只能看见6人，五位玩家已经占去多数位置，并要求小头像不承担不必要的原图资源成本。本轮保留R19所有命令与私密策略，只调整显示密度和头像资源。

## 精确接口事实

- Core14.368 `client/documents/actor.mjs:116–117` 的 `Actor.thumbnail` 只是 `this.img`，不产生缩略图；本机dnd5e6.0.6未覆写。
- `client/helpers/media/image-helper.mjs:22–35` 的公开缩略图API先调用`foundry.canvas.loadTexture`再经PIXI缩小。该入口依赖游戏Canvas，并保留原图共享纹理缓存，不适合为了DOM名单节省原图解码占用。
- 本机Core静态资源直出，未发现按尺寸转换图片的服务端路由；追加`?width=64`不能据此当成服务端缩图。没有已有派生文件时，客户端首次生成仍需读原图。
- 仓库的Chat Guard已有`fetch→Blob→createImageBitmap→2D canvas→WebP→bitmap.close`路径；Session Monitor和Forge浏览器库有原生IndexedDB使用。Deck自有实现，不跨模块导入私有代码，也不增加Node依赖或服务端接口。

## 实现与限制

名单头像约28×32、姓名16px且最多两行，悬停保留全名；按钮目标保持34px，减少行内空白及遭遇标题带占用。默认密度和紧凑模式均同步调整。长状态、展开的详细操作仍可按内容增加行高。

浏览器生成64×64／质量0.75的WebP Blob，原始ImageBitmap在编码结束后关闭。主副屏共享当前GM页结果；IndexedDB保存Blob，不保存跨页面失效的Object URL。每次GM页重开先HEAD校验ETag／Last-Modified／长度，变化或校验失败时重新获取；图片路径变化自然换键。首次冷缓存读取原文件，无法浏览器读取或解码的来源保留原显示，原生SVG直接显示。持久存储失败仍能本页复用；原图文件、Actor路径及共享PIXI纹理均不写入。

独立审查发现的两项问题已经修正：后台图像完成只改对应`img.src`，不重绘副屏，保留输入、焦点和弹层；HEAD异常不算有效缓存命中。对应回归已加入。实机冷／热缓存及同视口密度证据记录于`.local/status-alignment-20261027/r20-density-thumbnails/`，具体结论以该目录最终收据为准；本段不预先宣称实机通过。
