# Web / VPS Workbench Rules

## Scope

- Applies to `apps/web/**`, Web API tests, Vite/React entrypoints, and Web deployment docs.
- Treat the Web app as a deployable personal VPS tool, not a local-only wrapper around the CLI.
- The primary user flow is browser upload -> server workflow -> progress/results -> JSON/Markdown/ZIP download.

## Architecture

- Keep `src/index.ts` and `apps/cli/src/main.ts` CLI behavior stable unless the user explicitly asks to change the CLI.
- Web API code must call shared workflow services or core modules directly. Do not shell out to the CLI as the main implementation path.
- When a CLI branch needs Web support, extract a reusable service layer first, then make both CLI and Web call that layer.
- Keep long-running Web work behind the job system. Jobs should report status, progress, logs, warnings, failures, and registered output files.
- Upload-mode conversions must not write the vault sync manifest unless the user explicitly selects a vault-oriented workflow.

## Security And Public Deployment

- Default Web/API binding must remain loopback-only. Public or reverse-proxied mode must be explicit and must retain the implemented authenticated API boundary.
- Browser users authenticate at the external access layer; the proxy may inject the server-side bearer token. Do not expose or ask the browser to submit that token.
- Do not let the browser submit server credentials, API keys, cookies, passwords, or crawl login secrets.
- Translation, AI normalize, and crawl credentials must come from VPS environment variables only.
- Preserve rate limits, upload size limits, per-IP long-job concurrency limits, temp cleanup, and hidden stack traces for public routes.
- Download routes must serve only files registered on the job. Never build a download path directly from a request URL or arbitrary user input.
- Sanitize uploaded file names and ZIP entry names, and reject or neutralize path traversal.

## Frontend Product Rules

- The UI must be Chinese-first unless the user explicitly asks otherwise.
- Build the actual workbench as the first screen. Do not add a landing page, hero marketing section, decorative fantasy parchment, purple glow, or fake dashboard.
- Prioritize upload conversion, batch job progress, warnings, failed entries, JSON preview, and download actions.
- Single-file jobs should expose direct JSON download. Batch jobs should expose per-file downloads and ZIP download.
- Long Chinese paths, generated names, warning text, and JSON fields must wrap or scroll without overlapping nearby controls.

## Deployment Docs

- Deployment docs must state the exact binding, public-mode, authentication, and trusted-proxy boundary. Do not describe the current API as publicly unauthenticated.
- Docs must list relevant environment variables and explicitly say that translation/crawl credentials are server-side env vars.
- Reverse proxy examples should set a request body limit compatible with the Web upload limits.

## Verification

- For Web/API changes, run `bun run web:build`.
- For API or job runner changes, run `bun test apps/web/src/server/__tests__/api.test.ts`.
- For upload/download changes, run a browser smoke test that uploads a real markdown file and downloads the generated JSON or ZIP.
- If Web changes affect generated actor JSON semantics, also regenerate a real actor through the project workflow and run `bun run verify:actor <source.md> <output.json>`.
