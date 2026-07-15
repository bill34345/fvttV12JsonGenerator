# Artifact Inventory — 2026-07-15

This inventory is the path-by-path evidence for Milestone 6 of
`docs/remediation/2026-07-15-project-hardening/EXECPLAN.md`. It records the
178 paths rejected by the first real repository-hygiene run. The initial run
failed closed with exactly 178 findings.

No file was classified from its name alone. The inventory used `git ls-files`,
`git ls-files -ci --exclude-standard`, source/docs/test reference searches,
content inspection, SHA-256 comparisons for Item Markdown, Git history, and the
existing side-branch cleanup commit `a7f7327` as corroborating—not
authoritative—evidence.

## Decision summary

| Group | Count | Policy category | Producer/origin | Current consumer | Reproducibility and retention |
| --- | ---: | --- | --- | --- | --- |
| Vault `output/` Actor JSON | 28 | Generated disposable output | Project CLI or vault sync | Operator import and dated docs refer to output paths; no test or runtime imports the tracked bytes | 26 files have direct source Markdown; the two legacy Chuul aggregates are superseded by individual tracked sources and recoverable from Git history. Keep local ignored copies, remove from Git. |
| Vault `output_backup/` JSON | 86 | Local/runtime recovery artifact | Vault sync before overwrite | Human rollback only; no code/docs require a particular tracked generation | Recreated on future overwrites; historical revisions remain in Git. Keep local ignored copies, remove from Git. |
| `temp-items/` Markdown | 10 | Local experiment scratch | April Item workflow experiments | None | Full Jewel/Shield text is preserved in tracked vault inputs; reduced cases are covered inline by parser/generator tests. Keep local ignored copies, remove from Git. |
| `temp-items/` JSON | 24 | Generated disposable output | Old Item CLI/debug iterations | Obsolete root `verify.ts` reads a different current output directory; no supported test consumes these bytes | Regenerable from the current Item workflow; exact random IDs are intentionally not golden evidence. Keep local ignored copies, remove from Git. |
| Root `output*` JSON | 13 | Generated disposable output | Early CLI/debug runs | No exact tracked consumer | Superseded by vault input/output workflow and tests; keep local ignored copies, remove from Git. |
| Root `debug-*` programs | 7 | Local experiment scratch | April Item workflow debugging | None | Stage parsing, reference lookup, spell mapping, Item structure, and description parsing are covered by current focused tests. Keep local ignored copies, remove from Git. |
| Root `test_*.js` programs | 4 | Local experiment scratch | Initial parser/i18n regex probes | None | Behavior is covered by mapper/parser/mechanics tests. Keep local ignored copies, remove from Git. |
| Root `temp-dragon.json` | 1 | Generated disposable output | Early Actor generation | No supported consumer | Byte-identical size and identity class to early root output; source/test routes supersede it. Keep local ignored copy, remove from Git. |
| Root `verify.ts` | 1 | Obsolete experiment tool | April fixed-path Item inspection | None; paths no longer describe the supported workflow | Activity/uses behavior is covered by Item generator/parser tests; remove the obsolete working copy after inventory. Git history remains recovery. |
| `temp/` gitlinks | 2 | Local runtime/vendor artifact | Early detached repository checkouts | None; no `.gitmodules`, source, docs, or package reference exists | The recorded object IDs remain in Git history; keep local checkouts if present, remove gitlinks from Git. |
| `.fvtt-sync-manifest.json` | 1 | Local runtime artifact | Vault sync | Vault sync reads and rewrites local state | Recreated by sync; keep local, add ignore, remove from Git. |
| `.obsidian/workspace.json` | 1 | Local workspace state | Obsidian | Obsidian only | User-layout state; keep local ignored copy, remove from Git. |
| `src/temp/` | 0 tracked | Local experiment scratch | Historical TypeScript scratch | None in Git | Already outside the tracked supported graph; hygiene prevents future tracked root/temp scratch. |

`AGENTS.md` is the one intentional tracked path also matched by a generated
Ruler ignore rule. It is project instruction/configuration, not an artifact,
and is explicitly allowed by the hygiene gate. Other stable Obsidian settings
and vendored plugins are also project tooling/configuration; only
`.obsidian/workspace*.json` is classified as user-local state here.

## Exact vault output manifest (28)

Shared metadata: generated disposable output; producer is the CLI/vault sync;
no consumer requires the tracked bytes; retain only as ignored local output.

- `obsidian/dnd数据转fvttjson/output/aboleth-spawn__底栖魔鱼衍体.json`
- `obsidian/dnd数据转fvttjson/output/alyxian-aboleth__底栖魔鱼“阿利克辛”.json`
- `obsidian/dnd数据转fvttjson/output/bonebreaker-dorokor.json`
- `obsidian/dnd数据转fvttjson/output/chuul-incubator.json`
- `obsidian/dnd数据转fvttjson/output/chuul-nullifier.json`
- `obsidian/dnd数据转fvttjson/output/chuul-screecher.json`
- `obsidian/dnd数据转fvttjson/output/corrupted-giant-shark__腐化巨鲨.json`
- `obsidian/dnd数据转fvttjson/output/deaths-embrace__死亡之拥.json`
- `obsidian/dnd数据转fvttjson/output/faldric-the-archer.json`
- `obsidian/dnd数据转fvttjson/output/light-devourer__噬光鮟鱇.json`
- `obsidian/dnd数据转fvttjson/output/mock-dragon.json`
- `obsidian/dnd数据转fvttjson/output/oregg-steeltwister.json`
- `obsidian/dnd数据转fvttjson/output/pinna.json`
- `obsidian/dnd数据转fvttjson/output/ruidium-corrupted-chuul-incubator.json`
- `obsidian/dnd数据转fvttjson/output/ruidium-corrupted-chuul-nullifier.json`
- `obsidian/dnd数据转fvttjson/output/ruidium-corrupted-chuul-screecher.json`
- `obsidian/dnd数据转fvttjson/output/ruined-chuul-nullifier.json`
- `obsidian/dnd数据转fvttjson/output/ruined-chuul-screecher.json`
- `obsidian/dnd数据转fvttjson/output/scuttling-serpentmaw__蛇口蛮蟹.json`
- `obsidian/dnd数据转fvttjson/output/slithering-bloodfin.json`
- `obsidian/dnd数据转fvttjson/output/slithering-bloodfin__滑行血鳍.json`
- `obsidian/dnd数据转fvttjson/output/white-tusk-bloodrager.json`
- `obsidian/dnd数据转fvttjson/output/white-tusk-juggernaut.json`
- `obsidian/dnd数据转fvttjson/output/white-tusk-orc.json`
- `obsidian/dnd数据转fvttjson/output/white-tusk-shaman.json`
- `obsidian/dnd数据转fvttjson/output/white-tusk-warspeaker.json`
- `obsidian/dnd数据转fvttjson/output/三个Chuul.json`
- `obsidian/dnd数据转fvttjson/output/三个Chuul（不准删除这个md）.json`

## Exact vault backup manifest (86)

Shared metadata: local workflow recovery generations; producer is vault sync;
no consumer requires any particular generation; Git history plus future local
backups provide recovery; retain only as ignored local state.

- `obsidian/dnd数据转fvttjson/output_backup/bonebreaker-dorokor.2026-02-15T10-24-20-194Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/bonebreaker-dorokor.2026-02-15T12-24-04-076Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/bonebreaker-dorokor.2026-02-15T13-03-49-714Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/bonebreaker-dorokor.2026-02-15T13-06-01-075Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/bonebreaker-dorokor.2026-02-15T15-35-19-827Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/bonebreaker-dorokor.2026-02-15T15-38-06-075Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/bonebreaker-dorokor.2026-02-15T15-49-28-232Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/bonebreaker-dorokor.2026-02-15T16-29-43-373Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/bonebreaker-dorokor.2026-02-17T11-07-47-945Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/bonebreaker-dorokor.2026-03-16T15-40-20-311Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/faldric-the-archer.2026-02-15T10-20-27-876Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/faldric-the-archer.2026-02-15T10-24-20-201Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/faldric-the-archer.2026-02-15T12-24-04-079Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/faldric-the-archer.2026-02-15T13-04-03-705Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/faldric-the-archer.2026-02-15T13-06-01-078Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/faldric-the-archer.2026-02-15T15-35-30-077Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/faldric-the-archer.2026-02-15T15-38-15-065Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/faldric-the-archer.2026-02-15T15-49-36-361Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/faldric-the-archer.2026-02-15T16-29-43-376Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/faldric-the-archer.2026-02-17T11-07-47-952Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/oregg-steeltwister.2026-02-15T10-25-07-569Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/oregg-steeltwister.2026-02-15T12-24-04-085Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/oregg-steeltwister.2026-02-15T13-04-21-296Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/oregg-steeltwister.2026-02-15T13-06-01-081Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/oregg-steeltwister.2026-02-15T15-35-42-195Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/oregg-steeltwister.2026-02-15T15-38-24-384Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/oregg-steeltwister.2026-02-15T15-49-46-458Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/oregg-steeltwister.2026-02-15T16-29-43-380Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/oregg-steeltwister.2026-02-17T11-07-47-961Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/pinna.2026-02-15T10-25-19-087Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/pinna.2026-02-15T12-24-04-093Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/pinna.2026-02-15T13-04-36-606Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/pinna.2026-02-15T13-06-01-085Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/pinna.2026-02-15T15-35-42-202Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/pinna.2026-02-15T15-38-24-390Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/pinna.2026-02-15T15-49-46-462Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/pinna.2026-02-15T16-29-43-382Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/pinna.2026-02-17T11-07-47-967Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-bloodrager.2026-02-15T10-20-27-879Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-bloodrager.2026-02-15T10-25-19-093Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-bloodrager.2026-02-15T12-24-04-095Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-bloodrager.2026-02-15T13-04-36-611Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-bloodrager.2026-02-15T13-06-01-089Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-bloodrager.2026-02-15T15-36-05-337Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-bloodrager.2026-02-15T15-38-54-279Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-bloodrager.2026-02-15T15-50-15-900Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-bloodrager.2026-02-15T16-29-43-387Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-bloodrager.2026-02-17T11-07-47-974Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-juggernaut.2026-02-15T10-20-27-894Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-juggernaut.2026-02-15T10-25-19-096Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-juggernaut.2026-02-15T12-24-04-097Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-juggernaut.2026-02-15T13-04-45-455Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-juggernaut.2026-02-15T13-06-01-091Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-juggernaut.2026-02-15T15-36-05-341Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-juggernaut.2026-02-15T15-38-54-283Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-juggernaut.2026-02-15T15-50-15-909Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-juggernaut.2026-02-15T16-29-43-392Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-juggernaut.2026-02-17T11-07-47-981Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-orc.2026-02-15T10-20-27-898Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-orc.2026-02-15T10-25-19-101Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-orc.2026-02-15T12-24-04-101Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-orc.2026-02-15T13-04-45-458Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-orc.2026-02-15T13-06-01-094Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-orc.2026-02-15T15-36-05-345Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-orc.2026-02-15T15-38-54-286Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-orc.2026-02-15T15-50-15-912Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-orc.2026-02-15T16-29-43-395Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-orc.2026-02-17T11-07-47-988Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-shaman.2026-02-15T10-25-19-106Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-shaman.2026-02-15T12-24-04-103Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-shaman.2026-02-15T13-04-45-462Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-shaman.2026-02-15T13-06-01-096Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-shaman.2026-02-15T15-36-28-492Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-shaman.2026-02-15T15-39-19-517Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-shaman.2026-02-15T15-50-38-100Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-shaman.2026-02-15T16-29-43-398Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-shaman.2026-02-17T11-07-47-994Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-warspeaker.2026-02-15T10-25-19-109Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-warspeaker.2026-02-15T12-24-04-105Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-warspeaker.2026-02-15T13-05-12-505Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-warspeaker.2026-02-15T13-06-01-099Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-warspeaker.2026-02-15T15-36-28-500Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-warspeaker.2026-02-15T15-39-19-527Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-warspeaker.2026-02-15T15-50-38-104Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-warspeaker.2026-02-15T16-29-43-402Z.json`
- `obsidian/dnd数据转fvttjson/output_backup/white-tusk-warspeaker.2026-02-17T11-07-48-001Z.json`

## Exact Item experiment Markdown manifest (10)

Shared metadata: local experiment sources; no live consumer. The authoritative
current sources are `obsidian/dnd数据转fvttjson/input/items/三祷之坠.md` and
`obsidian/dnd数据转fvttjson/input/items/骑士之盾.md`; reduced cases are
represented in `item-parser.test.ts` and `item-generator.test.ts`.

- `temp-items/final-shield.md`
- `temp-items/jewel-full.md`
- `temp-items/jewel-of-three-prayers-e2e.md`
- `temp-items/jewel-test.md`
- `temp-items/shield-attack-test.md`
- `temp-items/shield-e2e.md`
- `temp-items/shield-test.md`
- `temp-items/test-item.md`
- `temp-items/三祷之坠.md`
- `temp-items/骑士之盾.md`

## Exact Item experiment JSON manifest (24)

Shared metadata: generated disposable Item outputs; no supported consumer;
regenerate from the current Item CLI/workflow instead of retaining random IDs.

- `temp-items/final-shield.json`
- `temp-items/jewel-e2e.json/三祷之坠 (Awakened).json`
- `temp-items/jewel-e2e.json/三祷之坠 (Exalted).json`
- `temp-items/jewel-e2e.json/三祷之坠.json`
- `temp-items/jewel-test.json/三祷之坠 (休眠态).json`
- `temp-items/jewel-test.json/三祷之坠 (觉醒态).json`
- `temp-items/jewel-test/三祷之坠 (Awakened).json`
- `temp-items/jewel-test/三祷之坠 (Exalted).json`
- `temp-items/jewel-test/三祷之坠.json`
- `temp-items/shield-attack-test.json`
- `temp-items/shield-e2e-out.json`
- `temp-items/shield-e2e.json`
- `temp-items/shield-fixed.json`
- `temp-items/shield-test.json`
- `temp-items/test-dormant.json`
- `temp-items/test-item.json`
- `temp-items/test-jewel-debug.json/三祷之坠 (Awakened).json`
- `temp-items/test-jewel-debug.json/三祷之坠 (Exalted).json`
- `temp-items/test-jewel-debug.json/三祷之坠.json`
- `temp-items/test.json/三祷之坠 (休眠态).json`
- `temp-items/test.json/三祷之坠 (升华态).json`
- `temp-items/test.json/三祷之坠 (觉醒态).json`
- `temp-items/verify-shield.json`
- `temp-items/骑士之盾.json`

## Exact root output manifest (13)

Shared metadata: obsolete generated Actor/Item output; no exact consumer;
current source inputs, CLI routes, and fixture-backed tests supersede it.

- `output.json`
- `output/adult-red-dragon-final.json`
- `output/adult-red-dragon-v2.json`
- `output/adult-red-dragon.json`
- `output/chuul-incubator.json`
- `output/chuul-nullifier.json`
- `output/chuul-screecher.json`
- `output/english-dragon.json`
- `output/ruidium-corrupted-chuul-incubator.json`
- `output/ruidium-corrupted-chuul-nullifier.json`
- `output/ruidium-corrupted-chuul-screecher.json`
- `output/stasis-field-generator.json`
- `output/三个Chuul.json`

## Exact root debug manifest (7)

Shared metadata: one-off debugging programs; no live consumer; behavior is
preserved by focused parser/generator/mapper tests and current source fixtures.

- `debug-filter.ts`
- `debug-generate.ts`
- `debug-parse.ts`
- `debug-paths.ts`
- `debug-spells.ts`
- `debug-test.ts`
- `debug-trace.js`

## Exact root ad-hoc test manifest (4)

Shared metadata: pre-test-suite regex/i18n probes; no live consumer; current
automated tests preserve the useful assertions.

- `test_i18n.js`
- `test_parse.js`
- `test_regex.js`
- `test_regex2.js`

## Remaining exact paths

- `temp-dragon.json` — generated disposable Actor output; retain local only.
- `verify.ts` — obsolete fixed-path Item summary; remove after inventory.
- `temp/fantasy-statblocks` — unconfigured gitlink, object `f248f4af8a3d748c2f64534f15e01c2d846e8b12`; retain local checkout only.
- `temp/ttrpg-convert-cli` — unconfigured gitlink, object `081f944ddd326615504a6c95629e7bfec1e3235`; retain local checkout only.
- `obsidian/dnd数据转fvttjson/.fvtt-sync-manifest.json` — regenerated local sync state.
- `obsidian/dnd数据转fvttjson/.obsidian/workspace.json` — user-local Obsidian layout.

## Consumer and semantic checks

- Searches found no supported consumer for root output, root debug/test,
  `temp-items/`, or the two gitlinks.
- The only exact tracked vault-output references are historical docs/manual QA
  instructions and a test that creates its own temporary vault output; none
  requires committed JSON bytes.
- The old `verify.ts` reads `obsidian/.../output/items`, not
  `temp-items/`, and only prints activity/uses summaries. Current Item tests
  assert the underlying parser/generator contracts.
- The complete Jewel and Shield experiment Markdown differs from current
  tracked input by corrected/superset source text, BOM/frontmatter cleanup, or
  reduced test-only cases. No unique authoritative source text exists only in
  `temp-items/`.
- The two legacy aggregate Chuul output files lack a current exact-basename
  source, but the individual Chuul sources are tracked and the legacy files
  remain recoverable from Git history. They are not sole-source evidence.

