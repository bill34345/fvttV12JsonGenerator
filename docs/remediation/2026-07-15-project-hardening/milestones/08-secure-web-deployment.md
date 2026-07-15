# Milestone 8 Secure Web Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and `superpowers:test-driven-development` task by task. Do not dispatch subagents because the active project instructions do not authorize delegation.

**Goal:** Make the Web workbench loopback-safe by default and support explicit public/proxied deployment only behind authenticated, bounded, proxy-aware server behavior.

**Architecture:** A pure Web security configuration module owns deployment mode, binding, authentication, trusted proxies, body limits, and concurrency/retention limits. `index.ts` validates this configuration once and passes the real Bun socket address into the API boundary. API helpers authenticate before route work, derive identity only through trusted proxies, reject declared oversized bodies before materialization, and enforce both per-client and global caps. The existing job/workflow boundary remains intact.

**Tech Stack:** Bun 1.3.8 `Bun.serve` (`hostname`, `maxRequestBodySize`, `server.requestIP()`), TypeScript 5.9, Bun tests, React/Vite workbench, Playwright browser smoke.

## Decision and constraints

- Supported modes are local/private and explicit public/proxied.
- Default: `127.0.0.1`, no API token required, forwarded headers ignored.
- Public/proxied mode requires `FVTT_WEB_PUBLIC_MODE=1` and a high-entropy `FVTT_WEB_AUTH_TOKEN`; non-loopback binding without public mode is rejected at startup.
- Browser users do not submit VPS secrets. A public reverse proxy authenticates the user and injects the server-side bearer token; direct API clients may send it themselves.
- `FVTT_WEB_TRUSTED_PROXIES` is an explicit comma-separated literal-IP allowlist. Forwarded identity is ignored unless the immediate socket peer and each skipped proxy hop are trusted.
- Application JSON body ceiling is 25 MiB, matching the documented reverse-proxy ceiling and exceeding the 20 MiB content payload limit only enough for JSON framing/escaping. Route content limits remain 5/20 MiB.
- Long-job defaults: one per client, four globally, 24-hour retention, at most 100 retained terminal jobs. Values may be lowered/raised by positive bounded environment configuration documented with the deployment.
- No CLI behavior, generated Actor semantics, production Foundry state, or browser-submitted credentials change in this milestone.

---

## Task 1: Fail-closed deployment configuration and API authentication

**Files:**

- Create: `src/web/server/security/config.ts`
- Create: `src/web/server/security/__tests__/config.test.ts`
- Modify: `src/web/server/index.ts`
- Modify: `src/web/server/api.ts`
- Modify: `src/web/server/__tests__/api.test.ts`

- [x] Write RED tests for loopback defaults, explicit public mode, rejection of non-loopback implicit exposure, rejection of public mode without a sufficiently strong token, and bearer authentication before any API route work.
- [x] Implement one pure `getWebSecurityConfig(env)` parser and constant-time bearer validation.
- [x] Bind `Bun.serve` to the configured hostname and 25 MiB `maxRequestBodySize`; pass `server.requestIP(request)?.address` into `handleApiRequest()`.
- [x] Make capabilities report actual deployment/auth mode instead of hard-coded `publicAccess: true`.
- [x] Run config/API tests, both typechecks, and `bun run web:build`; review that local default behavior remains source-compatible.
- [x] Commit this deployment/auth boundary separately.

Verification record (2026-07-15): RED reproduced the missing config module, hard-coded public capability, and unauthenticated public API. GREEN passed 26 tests / 131 expectations, production and broad typechecks, and the Vite build. Manual code review confirmed loopback default binding, fail-closed non-loopback/public configuration, 25 MiB Bun server ceiling, real socket-address propagation, constant-time bearer comparison, and truthful local/public capabilities without returning the secret.

## Task 2: Trusted-proxy identity and fail-closed request rate limits

**Files:**

- Modify: `src/web/server/security/rateLimit.ts`
- Create: `src/web/server/security/__tests__/rateLimit.test.ts`
- Modify: `src/web/server/api.ts`
- Modify: `src/web/server/__tests__/api.test.ts`

- [x] Write RED tests for direct clients, forged forwarded headers, one/multiple trusted proxy hops, malformed chains, and missing socket identity falling into one conservative shared bucket.
- [x] Derive identity from the real socket peer. Walk `x-forwarded-for` right-to-left only while the current hop is explicitly trusted; use `x-real-ip` only as a trusted-proxy fallback.
- [x] Add a global short-request window alongside the per-client window; prune empty/expired buckets and expose deterministic test reset/configuration.
- [x] Prove forged headers cannot split rate buckets and a global cap rejects distributed abuse.
- [x] Run focused/API tests, both typechecks, and Web build; commit separately.

Verification record (2026-07-15): RED showed that forged/malformed forwarding values became identities and distributed identities had no global cap. GREEN passed 34 tests / 147 expectations, both typechecks, and Web build. Direct sockets now ignore forwarding, trusted chains are walked from the real peer right-to-left, malformed/no-socket input collapses conservatively, per-client and global windows are checked atomically, and all expired identity buckets are pruned during rate checks.

## Task 3: Pre-materialization body limits and bounded global jobs

**Files:**

- Modify: `src/web/server/api.ts`
- Modify: `src/web/server/jobs/jobStore.ts`
- Modify: `src/web/server/__tests__/api.test.ts`
- Create or modify: focused job-store tests under `src/web/server/jobs/__tests__/`

- [x] Write RED tests proving an oversized declared body is rejected before `request.text()`, chunked/unknown bodies remain bounded by Bun's server ceiling, per-client and global long-job caps both apply, active jobs are never retention-evicted, expired jobs are removed, and terminal-job count stays bounded.
- [x] Enforce content-length before JSON materialization and return stable `REQUEST_BODY_TOO_LARGE` / invalid-length errors.
- [x] Add global running-job count and check it before job creation.
- [x] Run age/count cleanup before job creation; evict only terminal persisted jobs, oldest first, while preserving queued/running jobs.
- [x] Run focused/API tests, typechecks, Web build, and a modest concurrent abuse probe; commit separately.

Verification record (2026-07-15): RED reproduced post-materialization body checks, no global long-job cap, and age-only cleanup that could remove active jobs and did not enforce count. GREEN passed 39 tests / 167 expectations, both typechecks, Web build, and a 200-identity probe with exactly 100 global accepts / 100 rejects. Declared oversize and malformed lengths return stable errors before `.text()`; unknown/chunked bodies remain bounded at the Bun server; current-process active IDs survive cleanup; pre-restart `running` records do not consume live capacity; expired and oldest excess terminal jobs are removed before new job creation.

## Task 4: Deployment truth, browser acceptance, and finding closure

**Files:**

- Modify: `docs/web-deployment.md`
- Modify: `README.md` if its start instructions need the new environment contract
- Modify: `src/web/AGENTS.md` only if an operating rule needs clarification
- Modify: `docs/remediation/2026-07-15-project-hardening/EXECPLAN.md`
- Modify: this plan

- [x] Document local default, explicit public/proxied variables, the external-auth-plus-injected-token model, trusted proxy literal IPs, matching 25 MiB proxy limit, global/per-client caps, and bounded cleanup.
- [x] Run focused Web/API/job tests, `bun run ci:verify`, and `git diff --check`.
- [x] Build and start the real server on loopback; use a browser to upload a real Markdown source, inspect job progress/result, download JSON and a ZIP, and verify downloaded identity/item counts rather than only HTTP status.
- [x] Run a process-level negative smoke proving non-loopback/no-public-mode and public-mode/no-token startup fail closed; run an authenticated public-mode API smoke without exposing the service externally.
- [x] Close WEB-001/WEB-002/WEB-003 only when docs, mechanical gates, browser behavior, and abuse/security semantics agree.

Verification record (2026-07-15): deployment documentation and Web operating rules now match the implemented loopback/public boundary, proxy trust model, 25 MiB server/proxy ceiling, per-client/global caps, and bounded terminal-job cleanup. Focused security/API tests pass 39 tests / 167 expectations; the aggregate gate passes 717 tests / 2,844 expectations, 87.29% production line coverage, 88.34% function coverage, 109-source anti-overfit audit, 1,601-path hygiene, locked dnd5e 5.3.3 verification, Web build, and zero-network Actor smoke. The real loopback workbench generated White Tusk Shaman v14/core with the exact six source items and no invented Unconscious mechanic, then generated a two-entry ZIP from `开发用数据2.md`; parsed archive entries match both source identities, dnd5e 5.3.3/Foundry 14.361 metadata, and 8/6 item counts. Process probes rejected non-loopback binding without public mode and public mode without a token; a separate loopback-only public-mode process returned 401 without bearer and 200 with the configured bearer, reported authenticated public mode and the actual limits, and both temporary ports were released afterward. The first collection attempt used a single-Actor source and correctly failed the collection heading contract; it was not counted as acceptance.

## Acceptance boundary

Mechanical acceptance: config/API/job tests, both typechecks, aggregate coverage gates, Web build, process probes, and browser requests pass.

Semantic acceptance: a default start is reachable only on loopback; public/proxied API work cannot run without the configured authenticated boundary; forged forwarding headers do not create identities; distributed clients cannot bypass global caps; oversized input is stopped before unbounded materialization; active jobs survive cleanup while terminal storage remains bounded; a real source still produces and downloads the expected Actor/ZIP through the workbench.
