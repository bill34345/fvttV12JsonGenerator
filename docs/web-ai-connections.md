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

The Companion is intentionally disabled until the official Codex CLI adapter
passes the zero-tool gate. Enable the endpoint only after a Windows package
has been tested with:

```text
FVTT_WEB_CODEX_COMPANION_ENABLED=1
```

The adapter always uses an ephemeral temporary directory, ignores user and
project rules, uses the read-only sandbox, disables the current Codex tool
features (`shell_tool`, browser/computer use, apps, tool search and MCP
elicitation), disables web search, requires a strict result schema, and rejects
any tool-shaped JSONL event. Unknown future feature names fail the CLI call
closed. If the installed CLI cannot run the selected model (the current local
CLI reports that `gpt-5.6-luna` needs a newer version), pairing remains
blocked; it must not fall back to a local OAuth bridge or a different model
silently.

The browser creates a five-minute, one-time pairing bound to its anonymous
session. The Companion command must display the origin and require an exact
`--confirm-origin` match. A pairing token is never returned by the status
endpoint and is invalid after first use, expiry, disconnect, or session loss.

The server operator builds the Windows artifact once; end users receive only
the resulting executable and do not receive the project checkout or server
secrets. Example build and invocation:

```text
# Build on Windows from the project checkout:
bun run web:companion:build

# Then run dist/web/fvtt-ai-companion.exe:
fvtt-ai-companion.exe `
  --origin https://example.com `
  --pairing-id <id> `
  --pairing-token <one-time-token> `
  --confirm-origin https://example.com
```

The packaged Windows launcher should use the same arguments and the user's
official `codex.exe`; it must not receive project source or OAuth files.

## Job pinning and resume

Every AI job records only an opaque connection ID and an HMAC session binding.
The provider secret is not part of `result.json`, downloads, logs, or error
responses. Job polling, downloads, decisions, and resume are restricted to
the original anonymous session. Resume resolves the original connection; if
it is expired, disconnected, or blocked, the job stays `needs_review` or
`failed` and never silently switches to the site provider.
