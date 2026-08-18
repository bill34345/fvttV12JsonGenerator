# Web AI connections

The Web worker supports three explicit AI connection kinds:

1. `site`: the server-owned Intake provider. It is disabled by default and is
   quota-limited per anonymous session, client IP, and process-wide daily
   budget.
2. `user-api-key`: a browser-created BYOK connection. The key is held only in
   the in-memory session registry, is never written to a job or log, and is
   cleared when the connection expires or is disconnected.
3. `local-codex`: a Windows Companion that makes an outbound WebSocket
   connection and runs the user's already-authenticated official Codex CLI.
   OAuth credentials never leave the user's machine.

## Public deployment

Keep Bun loopback-only behind an HTTPS reverse proxy. Public mode requires:

```text
FVTT_WEB_PUBLIC_MODE=1
FVTT_WEB_HOST=127.0.0.1
FVTT_WEB_AUTH_TOKEN=<32+ random characters>
FVTT_WEB_SESSION_SECRET=<32+ random bytes, kept stable across restarts>
FVTT_WEB_TRUSTED_PROXIES=127.0.0.1
```

The proxy must forward WebSocket upgrades for
`/api/ai-companion/connect` and preserve the external HTTPS origin. The
Companion endpoint is `wss://<public-origin>/api/ai-companion/connect` when
the public URL uses HTTPS. Never expose the Bun port directly.
For state-changing browser requests, forward `Host`, `X-Forwarded-Host`, and
`X-Forwarded-Proto`; the server uses those headers only in public mode to
validate the browser `Origin` against the external origin.

The anonymous browser session uses an HttpOnly, SameSite-Strict cookie. It
expires after eight hours idle or 24 hours absolute. Restarting the process
invalidates the in-memory session registry.

## Site provider and BYOK

Site AI requires all three limits before the server starts accepting site
connections:

```text
FVTT_WEB_SITE_AI_ENABLED=1
FVTT_WEB_SITE_AI_SESSION_DAILY_LIMIT=20
FVTT_WEB_SITE_AI_IP_DAILY_LIMIT=100
FVTT_WEB_SITE_AI_GLOBAL_DAILY_LIMIT=1000
```

BYOK accepts `https://api.openai.com/v1` by default. Additional providers must
be exact HTTPS origins in `FVTT_WEB_AI_PROVIDER_ALLOWLIST`, for example
`https://gateway.example.com`; credentials, query strings, fragments,
redirects, private hosts, and arbitrary URLs are rejected.

## Companion gate and pairing

`web:dev` is loopback-only and enables the Companion endpoint for local
development. It builds `dist/web/fvtt-ai-companion.exe` before starting the
single Bun server on `http://127.0.0.1:5173`. Public/VPS deployments keep the
Companion hidden and disabled unless the server administrator explicitly sets:

```text
FVTT_WEB_CODEX_COMPANION_ENABLED=1
```

Only current Windows Chrome and Edge are supported. Firefox is intentionally
out of scope. The authenticated download endpoint is
`GET /api/ai-companion/download`; it serves only the fixed build artifact and
never accepts a user path. If it is missing, build it with
`bun run web:companion:build`.

For a local development page at `http://127.0.0.1:5173`, the page can check the
local Companion directly. A remote page must use HTTPS. Its flow is:

1. The user clicks connect, and the page opens a local confirmation window.
2. That local window displays the exact remote website address and asks for a
   deliberate approval.
3. After approval, the local window sends a one-time, five-minute pairing
   authorization only to the window that opened it, using browser memory. It
   never appears in a URL, command line, log, job file, or download.
4. The remote page uses it once to pair. The Companion then tests each selected
   model before the connection becomes usable.

The loopback control service binds only `127.0.0.1:43173` and uses control
protocol v2. Before local approval it gives a remote website no cross-origin
permission at all. After approval it returns CORS and local-network permission
headers only to that exact HTTPS origin. Pairing is bound to that origin, the
current Companion instance, and the current server pairing. Disconnect and
shutdown each require a separate one-use control credential; knowing a public
instance ID is never sufficient. Popup blocking, rejection, expiry, a refused
local-network permission, an unsupported browser, or a stopped Companion all
produce a user-facing recovery message.

Leaving the model fields blank means the Companion invokes the user's current
Codex CLI default; it does not inject a fixed model name. A user may specify
models explicitly, but every selected main/review model must pass the real
no-tool-call gate before the connection is ready. A gate failure never silently
falls back to a different model, site AI, BYOK, or a local OAuth bridge.

The adapter uses an ephemeral temporary directory, a read-only sandbox, and a
strict result schema. It disables the current tool features and rejects any
tool-shaped JSONL event. The packaged Windows Companion uses the user's
official `codex.exe`; it never receives project source or OAuth files. It no
longer accepts pairing tokens or pairing flags on the command line: users
double-click the EXE and complete the approval in the page instead.

The server operator builds the Windows artifact once; end users receive only
the resulting executable and do not receive the project checkout or server
secrets. The compiled artifact hides the Windows console. It is an unsigned
development build, so Windows SmartScreen may still require an explicit user
confirmation.

## Job pinning and resume

Every AI job records only an opaque connection ID and an HMAC session binding.
The provider secret is not part of `result.json`, downloads, logs, or error
responses. Job polling, downloads, decisions, and resume are restricted to
the original anonymous session. Resume resolves the original connection; if
it is expired, disconnected, or blocked, the job stays `needs_review` or
`failed` and never silently switches to the site provider.
