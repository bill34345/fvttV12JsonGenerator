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

`web:dev` is loopback-only and enables the Companion endpoint by default. It
also builds `dist/web/fvtt-ai-companion.exe` before starting the single Bun
server on `http://127.0.0.1:5173`. Set
`FVTT_WEB_CODEX_COMPANION_ENABLED=0` to turn it off explicitly. Production and
VPS starts remain disabled unless the operator sets:

```text
FVTT_WEB_CODEX_COMPANION_ENABLED=1
```

The AI connections panel guides the local flow: download and double-click the
fixed Windows artifact, wait for the page to detect the local Companion, choose
the main/review models and reasoning, then click `Connect`. No PowerShell
window, command line, or visible pairing token is required. The page polls the
Companion control endpoint and the Web pairing every two seconds, then
automatically selects the connection after `connected`. `blocked`, `expired`
and `disconnected` remain visible with an actionable diagnostic; the page does
not silently switch to site AI or a BYOK connection when the EXE exits.

The authenticated download endpoint is `GET /api/ai-companion/download`. It
serves only the fixed build artifact and never accepts a user path. If the
artifact is missing, build it with `bun run web:companion:build`.

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
session, then hands it directly to the Companion through its loopback-only
control service at `http://127.0.0.1:43173`. The control service only accepts
the exact Web origin `http://127.0.0.1:5173`, protocol v1, the current instance
ID, and a strict JSON shape. A pairing token is never returned by the status
endpoint, URL, command line, or logs, and is invalid after first use, expiry,
disconnect, cancellation, or session loss.
The versioned protocol starts with a `gate` message; the Companion runs a
real zero-tool gate for each de-duplicated selected model and returns a
`gate-result`. Only an `ok` result changes the connection to `ready`.
The pairing material is sent in the first WebSocket `pair` frame after the
loopback handoff; the WebSocket URL itself contains no pairing token.

The server operator builds the Windows artifact once; end users receive only
the resulting executable and do not receive the project checkout or server
secrets. The compiled artifact hides the Windows console. A user double-click
starts a single local Companion process; the Web page provides disconnect and
shutdown controls. The artifact is an unsigned development build, so Windows
SmartScreen may still require an explicit user confirmation.

```text
# Build on Windows from the project checkout:
bun run web:companion:build

```

The packaged Windows Companion uses the user's official `codex.exe`; it must
not receive project source or OAuth files. The old explicit command-line flags
remain only as a diagnostic compatibility path for one release cycle.

## Job pinning and resume

Every AI job records only an opaque connection ID and an HMAC session binding.
The provider secret is not part of `result.json`, downloads, logs, or error
responses. Job polling, downloads, decisions, and resume are restricted to
the original anonymous session. Resume resolves the original connection; if
it is expired, disconnected, or blocked, the job stays `needs_review` or
`failed` and never silently switches to the site provider.
