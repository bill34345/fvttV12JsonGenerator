# Crawl Workflow Rules

## Scope

- Applies to `src/core/crawl/**` and tests under this directory.
- Keep crawl/site-harvest code decoupled from the main actor conversion CLI (`src/index.ts`). `src/tools/crawlSites.ts` is the command entrypoint; core crawl logic belongs here.

## Data And Credentials

- Never commit cookie headers, saved login cookies, passwords, or `.crawlee-storage/`.
- Prefer env vars (`GODDESSFANTASY_COOKIE`, `GODDESSFANTASY_USERNAME`, `GODDESSFANTASY_PASSWORD`) or explicitly provided local files for credentials.
- Raw crawl artifacts may include `records.json`, `topics.jsonl`, `failures.jsonl`, `manifest.json`, and print-page HTML; treat them as source artifacts, not final actor JSON.

## Site Rules

- Keep site-specific parsing in `src/core/crawl/sites/`.
- For Goddess Fantasy/SMF, use print-page URLs for full-topic extraction and ignore non-canonical board-row actions such as `#new`, `action=post`, `action=markasread`, and `action=reporttm`.
- Do not add network-dependent unit tests; use fixtures for parser/converter coverage.

## Verification

- For crawl/parser changes, run focused crawl tests: `bun test src/core/crawl/__tests__/goddessfantasy.test.ts src/core/crawl/__tests__/recordsToPlaintext.test.ts`.
- When changing crawl-to-plaintext output, verify the plaintext still enters the existing ingestion path, either through `recordsToPlaintext` coverage or a dry-run/fixture path.
- If a crawl change affects parser/generator behavior or final actor JSON, also follow root `docs/generated-actor-verification.md` and run `bun run audit:anti-overfit`.
