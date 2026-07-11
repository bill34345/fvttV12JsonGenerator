# Safe Delivery Checklist

## Commit groups

1. Bound Bun test concurrency and guarantee spawned crawl CLI cleanup.
2. Move v14 upstream reference bulk and generated indexes to `.local/references`; retain only pinned provenance and minimal Item templates.
3. Keep the existing v14 generator, Foundry Lab, and sanitized acceptance evidence together on `codex/foundry-v14-stable-support`.
4. Update README and delivery documentation to reflect the real support boundary.

## Required gates before push

- [ ] `git status --short` contains only the intended delivery commit before final commit, then becomes clean.
- [ ] `bun run test` reports zero failures.
- [ ] `bun run audit:anti-overfit` reports no unapproved parser/generator pattern.
- [ ] `bun run test:foundry-lab` reports zero failures.
- [ ] `bun run web:build` exits zero.
- [ ] `bun run references verify` confirms the optional local dnd5e cache revision.
- [ ] v14 core and modded acceptance suites regenerate six samples each with zero failures and zero actor-verification warnings.
- [ ] Representative v12 and v14 CLI outputs are checked against their source Markdown.
- [ ] Tracked files contain no `.local` runtime data, users database, password, cookie, private key, raw server log, or production inventory snapshot.
- [ ] Acceptance documents retain `Partial/Fail` for the complete production module set.

## Explicitly unfinished

- Complete production-module coexistence.
- DAE-specific source fixture and behavior claim.
- Authenticated live GoddessFantasy crawl.
- Standalone Item v14 live Foundry acceptance.
- Git history rewrite to remove large files from older commits.
