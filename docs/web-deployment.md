# fvttV12Json Web 部署说明

这个 Web 工作台提供浏览器上传 Markdown/JSON、Bun 后端 workflow、任务进度，以及 JSON、Markdown、records 和 ZIP 下载。它默认是本机工具，不会因为执行 `web:start` 就监听公网接口。

## 安全模式

### 本机模式（默认）

```bash
bun install
bun run web:build
bun run web:start
```

默认地址是 `http://127.0.0.1:5174`：

- 只绑定 IPv4 回环地址；
- API 不要求 bearer token；
- 忽略 `X-Forwarded-For` 和 `X-Real-IP`；
- 如果把 `FVTT_WEB_HOST` 改为非回环地址却没有设置 `FVTT_WEB_PUBLIC_MODE=1`，进程会拒绝启动。

开发环境可运行 `bun run web:dev`。Vite 和 API 都只监听回环地址。

### 公开/反向代理模式（显式开启）

公开模式必须同时设置：

```bash
FVTT_WEB_PUBLIC_MODE=1
FVTT_WEB_AUTH_TOKEN=<至少32个字符的高熵随机值>
```

该 token 是服务器之间的凭据，不是给浏览器页面填写的登录密码。推荐部署方式是：

1. Bun 仍绑定 `127.0.0.1`；
2. Nginx、Caddy、Cloudflare Access 或同类入口先验证真实用户；
3. 反向代理在转发到 Bun 时注入 `Authorization: Bearer <FVTT_WEB_AUTH_TOKEN>`；
4. 浏览器永远不能读取或提交 VPS 的翻译 key、爬站 cookie、密码或这个 bearer token。

如确实要直接监听网络接口，还必须显式设置 `FVTT_WEB_HOST=0.0.0.0`（或指定地址）。静态页面可以被读取，但所有 `/api/*` 请求仍必须携带正确 bearer token；不建议把这种直接绑定当作完整用户身份系统。

## 环境变量

部署与鉴权：

- `FVTT_WEB_HOST`：监听地址，默认 `127.0.0.1`。
- `FVTT_WEB_API_PORT`：端口，默认 `5174`。
- `FVTT_WEB_PUBLIC_MODE=1`：启用公开/代理模式；没有它时非回环绑定会失败。
- `FVTT_WEB_AUTH_TOKEN`：公开模式必填，至少 32 个字符；不要提交到 Git、浏览器或日志。
- `FVTT_WEB_TRUSTED_PROXIES`：允许提供客户端转发链的代理字面 IP，逗号分隔，例如 `127.0.0.1,10.0.0.2`。不支持主机名或隐式“信任全部”。

资源边界（默认值）：

- `FVTT_WEB_SHORT_REQUEST_LIMIT=10`：每客户端每分钟非 GET 请求数。
- `FVTT_WEB_GLOBAL_SHORT_REQUEST_LIMIT=100`：所有客户端合计每分钟非 GET 请求数。
- `FVTT_WEB_LONG_JOBS_PER_CLIENT=1`：每客户端同时运行的长任务数。
- `FVTT_WEB_GLOBAL_LONG_JOBS=4`：整个进程同时运行的长任务数。
- `FVTT_WEB_JOB_RETENTION_HOURS=24`：终态任务产物保留小时数。
- `FVTT_WEB_MAX_RETAINED_JOBS=100`：未过期终态任务的最大保留数量；超过时最旧优先清理。

工作流能力：

- `FVTT_WEB_ENABLE_PATH_MODE=1`：允许读取服务器 workspace 路径和运行 `vault-sync`。公开部署通常不要开启。
- `TRANSLATION_API_KEY` 或 `OPENAI_API_KEY`：服务器端翻译/AI normalize 凭据。
- `GODDESSFANTASY_COOKIE`：服务器端 Goddess Fantasy crawl cookie。
- `GODDESSFANTASY_USERNAME` / `GODDESSFANTASY_PASSWORD`：服务器端爬站登录凭据。
- `FVTT_WEB_EXPOSE_ERRORS=1`：返回内部错误详情，仅限本机调试；公开部署不要开启。

浏览器只能看到“某项能力是否已配置”，不能取得上述凭据值。

## 固定资源保护

- Bun 在读取请求体前实施 25 MiB HTTP body 上限；有 `Content-Length` 时，API 还会在调用 `request.text()` 前拒绝超限或畸形长度。
- 单文件内容上限是 5 MiB；合集/JSON 内容上限是 20 MiB。
- 客户端身份来自真实 socket。只有直接 socket 对端在 `FVTT_WEB_TRUSTED_PROXIES` 内，才会从右向左解析转发链；伪造或畸形链不会创建新限流身份。
- 每客户端和全局请求/长任务上限同时生效，不能仅靠更换转发头绕过。
- 当前进程真正 queued/running 的任务不会被清理；过期终态任务先清理，数量仍超限时再最旧优先清理。
- 500 错误默认隐藏内部详情。下载接口仍只服务任务登记过的文件。

这些是纵深防御，不代替公开入口的真实用户鉴权、TLS、防火墙和操作系统资源限制。

## Nginx 示例

下面的 Basic Auth 验证浏览器用户；`Authorization` 在代理到 Bun 时被替换为服务器端 bearer。把 token 放入仅 root 可读的 Nginx 配置片段，不要写进公开仓库。

```nginx
server {
  listen 443 ssl;
  server_name example.com;

  client_max_body_size 25m;

  location / {
    auth_basic "fvtt workbench";
    auth_basic_user_file /etc/nginx/fvtt.htpasswd;

    proxy_pass http://127.0.0.1:5174;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Authorization "Bearer REPLACE_WITH_THE_SAME_32_PLUS_CHARACTER_TOKEN";
  }
}
```

Bun 侧至少设置：

```bash
FVTT_WEB_PUBLIC_MODE=1
FVTT_WEB_AUTH_TOKEN=REPLACE_WITH_THE_SAME_32_PLUS_CHARACTER_TOKEN
FVTT_WEB_TRUSTED_PROXIES=127.0.0.1
```

如果 Nginx 与 Bun 不在同一网络命名空间，`FVTT_WEB_TRUSTED_PROXIES` 应填写 Bun 实际看到的直接代理 IP，而不是盲填公网客户端 IP。

## Caddy 示例

```caddyfile
example.com {
  request_body {
    max_size 25MB
  }

  basic_auth {
    operator REPLACE_WITH_CADDY_PASSWORD_HASH
  }

  reverse_proxy 127.0.0.1:5174 {
    header_up Authorization "Bearer REPLACE_WITH_THE_SAME_32_PLUS_CHARACTER_TOKEN"
    header_up X-Real-IP {remote_host}
  }
}
```

同样设置 `FVTT_WEB_PUBLIC_MODE=1`、同一个 `FVTT_WEB_AUTH_TOKEN`，并将 Caddy 的直接 socket IP 加入 `FVTT_WEB_TRUSTED_PROXIES`。

## systemd 示例

把 secret 放在权限受限的 `/etc/fvtt-web.env`，而不是直接写进 unit 或仓库：

```ini
[Unit]
Description=fvttV12Json Web
After=network.target

[Service]
WorkingDirectory=/opt/fvttV12Json
ExecStart=/usr/local/bin/bun run web:start
Restart=always
EnvironmentFile=/etc/fvtt-web.env

[Install]
WantedBy=multi-user.target
```

`/etc/fvtt-web.env` 示例：

```bash
FVTT_WEB_HOST=127.0.0.1
FVTT_WEB_API_PORT=5174
FVTT_WEB_PUBLIC_MODE=1
FVTT_WEB_AUTH_TOKEN=<至少32个字符的高熵随机值>
FVTT_WEB_TRUSTED_PROXIES=127.0.0.1
```

## 产物目录

所有 Web 任务写入：

```text
temp/web/jobs/<jobId>/
  input/
  output/
  result.json
```

下载接口只允许下载任务登记过的产物。ZIP 下载会把成功产物打包为使用 UTF-8 文件名的 ZIP；清理策略按上文的年龄和数量边界执行。
