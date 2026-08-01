# Milestone 15: FVTT Session Monitor

**Finding:** `MON-001`

**Goal:** Deliver a GM-only Foundry 14.364 client monitor, a Windows/Chrome
companion sampler, and an offline report generator for a real four-hour
`cor-cotn` session without writing sampled data to Foundry LevelDB or collecting
gameplay content.

## Locked decisions

- The Foundry module ID is `fvtt-session-monitor`.
- Only a GM client records in v1; non-GM clients have no panel and no sampling.
- Browser samples are stored every 10 seconds in IndexedDB and resume across a
  refresh under the same session ID.
- The companion launches a dedicated Chrome profile, connects over the browser
  CDP endpoint, and records Chrome process/CDP metrics without reading cookies
  or credentials.
- Exported Scene and Combat identities are session-local aliases. No chat text,
  rolls, Actor/Item text, player input, credentials, IPs, or raw object dumps
  may enter evidence.
- Monitoring is observation-only. It never clears caches, changes settings,
  deletes documents, or performs an automatic optimization.
- Any continuous Chrome/Foundry/monitoring acceptance longer than 30 minutes is
  user-operated. The agent must not start, babysit, poll, or simulate the
  four-hour run; it may prepare the preflight and analyze the user's export
  afterward.

## Implementation
1. Maintain the browser-safe module under
   `foundry-modules/session-monitor/src` with a compact GM panel, IndexedDB
   storage, sampled metric adapters, event/error capture, privacy sanitization,
   export schema v1, and a bounded module API.
2. Maintain the companion and report tooling under
   `foundry-modules/session-monitor/companion` with dedicated Chrome
   launch/attach, browser-level CDP sampling, Windows process memory
   attribution, reconnect/gap handling, JSONL evidence, merge, Markdown, and
   SVG output.
3. Add deterministic build and exact project-local install/backup/rollback
   tooling plus package scripts. Do not route this feature through `src/index.ts`
   or `scripts/foundry-lab`.
4. Add focused privacy, lifecycle, sampling, CDP, process attribution, report,
   build, and install tests; then run both typechecks and the full repository
   gate.
5. Install only in the project-local Foundry mirror and complete a real GM
   runtime smoke including start, sample, marker, refresh/resume, stop, export,
   companion reconnect, and manual review of the final evidence.

## Acceptance

- Mechanical: focused tests, deterministic build, safe install/rollback, both
  typechecks, full tests, coverage, hygiene, references, Web build, and offline
  smoke pass.
- Semantic: the local exact-version runtime produces an intelligible joined
  timeline, captures a known safe test error and manual jank marker, continues
  one session across refresh, adds no visible gameplay regression or monitor
  Long Task, and exports none of the forbidden planted values.
- Production installation and the actual four-hour GM/player session remain
  separately authorized external acceptance. GM-only monitoring cannot close
  the non-GM device-performance gate.
- The four-hour run is not an agent execution task. It is accepted only from a
  real user-operated game session; bounded smoke tests and concatenated short
  runs cannot substitute for it.

## Result (2026-07-29)

- Implemented the Foundry module, IndexedDB session store, bounded GM API,
  privacy filtering, Windows/Chrome companion, JSONL recorder, report merger,
  Markdown/SVG renderers, a generation-aware Chrome supervisor, deterministic
  packaging, exact local installer, and Chinese runbook. The initially accepted
  local module and companion version was `1.1.0`; the later public-HTTP fix is
  recorded below.
- A full Chrome exit now produces explicit launch/exit/relaunch lifecycle
  records, relaunches the same dedicated profile, waits for an ordinary login
  when required, rejects a different/stopped session, resumes only the same
  active session ID, and reports page-heap plus renderer-private deltas across
  each browser generation.
- Real Foundry acceptance exposed and overturned an initial implementation:
  the module API was visible before asynchronous IndexedDB recovery completed,
  so a fast companion could observe a transient idle state and create a second
  active session. The API is now attached only after recovery finishes; a
  clean-profile rerun proved one session across the cold restart.
- Focused verification passed `12 / 12` with `53` assertions, including a real
  dedicated Chrome process exit/relaunch test. Both TypeScript projects passed.
  Two consecutive module archives had SHA-256
  `7263ed2066b546f8a4d40fa68ad1c568e25ee6e772cfb9cb739791b4920af57d`.
  Reinstall created a recoverable prior-1.1.0 backup at
  `.local/foundry-v14/backups/fvtt-session-monitor/1.1.0-1785321428266`;
  the earlier 1.0.0 backup is also retained.
- The final complete repository gate passed `1476 / 1476` tests with `6,881`
  expectations plus coverage,
  anti-overfit, hygiene, locked dnd5e reference verification, Web build, and
  offline Actor smoke. One preceding run had `1475 / 1476` because the existing
  crawl CLI test hit its 60-second timeout; its isolated rerun passed `5 / 5`,
  and the clean full rerun passed.
- Real Foundry 14.364 / dnd5e 5.3.3 GM smoke in
  `fvtt-v14-module-matrix` produced eight browser samples, one manual jank
  marker, one refresh with the same session ID, and one deliberately planted
  safe error. The export reported `refreshCount=1`, retained only
  `Error / <message-redacted>`, and contained neither the planted value nor
  `worldKey` nor the raw alias maps.
- A real dedicated headless Chrome companion probe returned browser heap,
  36 Performance metrics, separate browser/GPU/renderer/network/storage/unzip
  process groups, renderer private bytes, and a completed native allocation
  scan. The probe Chrome and local Foundry process were stopped afterward.
- The final companion-controlled joined-world acceptance used session
  `f8090595-9e2d-449f-9f23-07d2e61fe93c`. It recorded companion samples in
  browser generations `1,2`, lifecycle events
  `chrome-launch -> chrome-exit-detected -> chrome-relaunch-start ->
  chrome-relaunch-complete`, the same browser/module session ID before and
  after restart, `refreshCount=1`, two browser samples, 100% companion
  coverage, and a stopped export. Its report records one cold-restart boundary:
  page heap `60.2 MiB -> 64.8 MiB` and renderer private bytes
  `471.5 MiB -> 434.9 MiB`.
- The accepted bundle is local evidence at
  `.local/foundry-v14/evidence/session-monitor-restart-acceptance/live-sessions/f8090595-9e2d-449f-9f23-07d2e61fe93c/`.
- The disposable world's module choices were restored to their exact prior
  boundary: monitor, MIDI-QOL, and Sequencer disabled; `dnd5e_classpack`, DAE,
  libWrapper, and socketlib are the only four enabled modules. The installed
  module remains available but disabled; all acceptance Chrome processes and
  the local Foundry server were stopped, and port 30001 was released.
- Production deployment was separately authorized on 2026-07-30. The first
  real public-HTTP start rejected 1.1.0 because `crypto.subtle` was unavailable;
  the browser module now uses the project's pure JavaScript SHA-256 and both
  module and companion report version 1.1.1. The focused suite passed `13 / 13`
  with `56` assertions, and the deployed five-file archive had SHA-256
  `31098AD6EB861D641DC67BED9B51BA889058EA382CDDABC2BBC6D1C18C492CC4`.
  The release build now normalizes static text resources to LF, so two fresh
  Windows builds reproduce that exact deployed archive and all five deployed
  file hashes instead of varying with checkout line endings.
- A 2026-07-31 read-only 8080 recheck proved the live process still uses
  `X:\FoundryData`, the complete 1.1.1 module is present there, every
  module resource returns HTTP 200 through 8080, and the public manifest reports
  1.1.1. The recheck did not log in as GM or read live LevelDB, so it proves
  current deployment/serving rather than current world activation.
- Local implementation, joined-world cold-restart acceptance, production
  installation, and the historical normal module-management activation event
  are complete. Post-restart 1.1.1 start/mark/stop acceptance, the actual
  four-hour run, and non-GM device evidence remain open external acceptance.

## Architecture relocation result (2026-07-31)

- The Foundry module, versioned schema, Windows/Chrome companion, report
  generator, tests, build, installer, and runbook now form one release unit at
  `foundry-modules/session-monitor`; the root package scripts remain compatible
  wrappers. Package, module, and companion product versions are locked to
  `1.1.1`, and the shared protocol remains schema v1.
- The release unit depends only on the browser-safe
  `@fvtt-json-generator/contracts/hash` surface. Dependency-cruiser rejects
  imports from generator, workflow, Web, operations, sibling modules, or other
  contracts internals.
- Focused verification passed 19 tests / 71 expectations, both package-local
  and root typechecks/builds passed, dependency-cruiser reported 3,536 modules /
  3,829 dependencies / 0 violations, and Knip reported no cycles. Four static
  release files remained byte-identical; the browser bundle differed only in
  six Bun source-path comments and was executable-text identical after those
  comments were removed. The final builder normalizes and count-checks those six
  labels, so root-wrapper and package-local builds are now byte-identical at ZIP
  SHA-256 `044EEEE98566B7ABEFCF0B6E3B145C24D02AF6051BB9AFD1D26E86FC7DDE1B04`.
  Final review also fixed and regression-locked command parsing so a normal
  option value named `report` cannot select report mode.
- The complete repository gate passed one isolated subprocess-build test / one
  expectation, 12 CLI tests / 57 expectations, and 1,582 coverage tests / 7,462
  expectations: 1,595 tests / 0 failed / 7,520 expectations total. Production
  coverage was 85.55% lines / 88.11% functions across 264 files; anti-overfit,
  hygiene, locked references, Web build, and offline Actor smoke also passed.
  The build subprocess test is deliberately outside the coverage process after
  the first combined run completed its assertions but triggered a Bun 1.3.8
  shutdown assertion; the final isolated configuration exited 0.
- The rebuilt 1.1.1 release was installed only in the project-local mirror and
  all five installed files match the final build exactly; the prior local 1.1.1
  install is recoverable at
  `.local/foundry-v14/backups/fvtt-session-monitor/1.1.1-1785499480257`. A normal
  Foundry 14.364 / dnd5e 5.3.3 GM UI smoke completed start, jank marker, stop,
  and export-state review with MIDI-QOL and Sequencer absent. A real
  companion-owned Chrome handshake then produced two browser and two companion
  samples with 100% coverage, separate process signals, zero gaps/errors, and
  no forbidden gameplay identity or content.
- The disposable world's exact four-module baseline was restored, Session
  Monitor was disabled again, the configured default world was restored to
  `cor-cotn`, all acceptance Chrome processes were closed, the local server was
  stopped, and port 30001 was released.
- This relocation does not close `MON-001`: production post-restart UI smoke,
  the real four-hour session, and non-GM device evidence remain open external
  acceptance.
- Per the user's explicit 2026-07-31 direction, the four-hour run and every
  continuous monitoring run over 30 minutes stay listed but must never be
  initiated or awaited by an agent. Resume only for preflight preparation or
  post-run evidence analysis around a user-operated real session.
