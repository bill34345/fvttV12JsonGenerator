# fvttV12Json Web 部署说明

这个 Web 工作台面向个人 VPS 部署：浏览器上传 Markdown 或 JSON，Bun 后端调用项目 workflow，完成后提供 JSON、Markdown、records 或 ZIP 下载。

## 构建与启动

```bash
bun install
bun run web:build
FVTT_WEB_API_PORT=5174 bun run web:start
```

`web:start` 使用同一个 Bun 进程托管 `dist/web` 和 `/api`。开发环境可以运行：

```bash
bun run web:dev
```

## 环境变量

- `FVTT_WEB_API_PORT`: Web/API 端口，默认 `5174`。
- `FVTT_WEB_ENABLE_PATH_MODE=1`: 启用服务器本地路径读取和 `vault-sync` 路径能力。公网部署不建议开启，除非只给自己使用。
- `TRANSLATION_API_KEY` 或 `OPENAI_API_KEY`: 启用 `translate-json` 和 AI normalize。
- `GODDESSFANTASY_COOKIE`: Goddess Fantasy crawl 使用的 cookie。
- `GODDESSFANTASY_USERNAME` / `GODDESSFANTASY_PASSWORD`: Goddess Fantasy 登录凭据。浏览器不能提交这些凭据，只能从 VPS 环境变量读取。
- `FVTT_WEB_EXPOSE_ERRORS=1`: 调试时显示内部错误信息。公网不要开启。

## 公网风险

当前首版按“公网全开放、无应用内鉴权”实现。任何访问者都可以：

- 上传 Markdown / JSON 并消耗 CPU、内存和磁盘。
- 创建合集、翻译、crawl 等长任务。
- 间接消耗 VPS 上配置的翻译额度或爬站配额。

内置保护只降低滥用成本，不能替代鉴权：

- 单文件上传默认 5 MB。
- 合集/JSON 上传默认 20 MB。
- 每 IP 同时 1 个长任务。
- 非 GET 请求每 IP 每分钟 10 次。
- 临时任务产物默认保留 24 小时。
- 500 错误默认不返回 stack。

如果要长期公网使用，建议在反向代理层加 Basic Auth、Cloudflare Access、Tailscale Funnel ACL，或改为应用内 token。

## Nginx 示例

```nginx
server {
  server_name example.com;

  client_max_body_size 25m;

  location / {
    proxy_pass http://127.0.0.1:5174;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Caddy 示例

```caddyfile
example.com {
  request_body {
    max_size 25MB
  }

  reverse_proxy 127.0.0.1:5174
}
```

## systemd 示例

```ini
[Unit]
Description=fvttV12Json Web
After=network.target

[Service]
WorkingDirectory=/opt/fvttV12Json
ExecStart=/usr/local/bin/bun run web:start
Restart=always
Environment=FVTT_WEB_API_PORT=5174
Environment=TRANSLATION_API_KEY=
Environment=GODDESSFANTASY_COOKIE=

[Install]
WantedBy=multi-user.target
```

## 产物目录

所有 Web 任务写入：

```text
temp/web/jobs/<jobId>/
  input/
  output/
  result.json
```

下载接口只允许下载任务登记过的产物文件。ZIP 下载会把该任务的成功产物打包为一个 UTF-8 文件名的 zip。
