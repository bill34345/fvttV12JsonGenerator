# World Audit Task 1 Report

## Outcome

Implemented the safe stopped-world snapshot and Foundry LevelDB key-reader foundation in commit `c1e1c5d18a27f82d01b70eaaa18b18a14d05b265` (`feat: add read-only Foundry world snapshot reader`).

## Files changed and committed

- `src/tools/world-audit/model.ts`
- `src/tools/world-audit/snapshot.ts`
- `src/tools/__tests__/worldAuditSnapshot.test.ts`

`package.json` was included in the path-scoped staging command specified by the brief, but it had no required code or dependency change. The implementation dynamically imports the caller-supplied Foundry `classic-level/index.js` entry, so adding a project-level `classic-level` dependency would be unused and could imply an incorrect runtime source.

## RED evidence

Before the implementation existed, ran:

```powershell
bun test src/tools/__tests__/worldAuditSnapshot.test.ts
```

Result: exit `1`, with the expected missing-module failure:

```text
Cannot find module '../world-audit/snapshot'
0 pass
1 fail
1 error
```

During semantic review, added a regression test for an attempted snapshot destination inside the source tree. Its first complete RED run exited `1`: the destination's missing `evidence` parent was created before rejection. The test failed at `Expected promise that rejects / Received promise that resolved` for `lstat(source/evidence)`, proving the unwanted source-side directory creation. `resolveFuturePhysicalPath()` was then added so the physical-boundary check happens without creating that directory.

## GREEN and required verification

Ran:

```powershell
bun test src/tools/__tests__/worldAuditSnapshot.test.ts
bun run typecheck:production
bun run typecheck:all
git diff --check
git diff --cached --check
```

Exact final results:

```text
bun test src/tools/__tests__/worldAuditSnapshot.test.ts
3 pass, 0 fail, 9 expect() calls

bun run typecheck:production
$ tsc -p tsconfig.production.json --pretty false
exit 0

bun run typecheck:all
$ tsc -p tsconfig.json --pretty false
exit 0
```

Both whitespace checks exited `0`.

## Semantic acceptance review

- The contract test exercises top-level and embedded Foundry keys and verifies `actors.items.effects` parses to parent IDs `A1`, `I1` and embedded path `items`, `effects`.
- The stopped-world test verifies source bytes and the complete deterministic source hash are unchanged after snapshot creation, while the injected reader receives only `snapshot/data/actors`.
- The boundary regression test verifies an in-source snapshot path is rejected before even an empty source-side destination parent can be created.
- The production flow validates exact world metadata; rejects source-tree symbolic links/reparse points; excludes `backup-*` and `*.backup-*` collection directories; opens every original live collection `LOCK` with `r+`; holds all locks through source hash/copy/source re-hash; verifies snapshot hash equality; closes original handles before reading; and passes only snapshot database paths to the reader.
- The production reader imports the supplied `classic-level/index.js` entry using a file URL, constructs it with `{ createIfMissing: false, keyEncoding: "utf8", valueEncoding: "json" }`, reads it only after snapshot validation, and closes it in `finally`.

No original `cor-cotn` LevelDB directory was opened with ClassicLevel, and no remote system was contacted.

## Self-review

The initial implementation correctly met the supplied two-test contract but semantic review found the missing-parent side effect described above. The added RED regression and path-resolution fix close that issue. The implementation keeps snapshot creation/copying separate from reading, sorts files and live collection names deterministically, and fails closed if source or snapshot bytes differ.

## Concerns

- The Task 1 brief lists `package.json` as modified but does not prescribe any package script or dependency. I deliberately left it byte-identical: Task 1 must use the exact caller-supplied Foundry runtime entry rather than a project-installed `classic-level` copy. This is a scope/documentation discrepancy, not a functional failure.
- Tests use an injected reader by design, so the final verification does not instantiate Foundry's bundled ClassicLevel against the real `cor-cotn` world. That integration belongs to the later explicitly authorized local audit CLI run; this task intentionally did not open the original database.
- Existing user-owned dirty files remain unmodified and unstaged: `.ruler/AGENTS.md`, `AGENTS.md`, the maintenance runbooks/scripts, the Baileywiki guide, and Obsidian crawl artifacts.

---

## Review-fix addendum

### Findings fixed

- **Critical lock proof:** Replaced ordinary Node `r+` handles with a Windows stopped-world guard. The guard is a child PowerShell process that opens every original `LOCK` via `.NET FileStream` with `FileAccess.ReadWrite` and `FileShare.Read`: snapshot copying can read the `LOCK` bytes, but ClassicLevel cannot acquire its required read/write open. The production path refuses to snapshot on non-Windows rather than silently dropping the guard.
- **Incomplete snapshot cleanup:** A single outer failure path now removes only a destination that was verified absent and may have been created by this invocation. It covers partial copy, post-copy source drift, snapshot hash mismatch, malformed records, and reader failure before return. A pre-existing destination is rejected before this state is entered and is never removed.
- **Key validation:** Namespace segment count must equal identifier segment count; malformed embedded keys are rejected.
- **Reparse protection:** The source walk now checks both `lstat().isSymbolicLink()` and exact expected-vs-real physical paths for every entry. A Windows junction fixture is rejected.
- **Determinism:** Tree hash ordering is ordinal (`<`/`>`) rather than locale-dependent.

### RED evidence

The first review-fix test run exited `1` because `acquireStoppedWorldLocks` did not exist:

```text
SyntaxError: Export named 'acquireStoppedWorldLocks' not found
0 pass, 1 fail, 1 error
```

After the guard was implemented, the real contender test initially failed only because ClassicLevel wraps its underlying `LEVEL_LOCKED` condition as public `NotOpenError: Database failed to open`; the test was corrected to assert that documented observable error and then prove the same contender opens after the guard is released.

### Exact project-local ClassicLevel evidence

Tests dynamically imported only:

```text
I:\OpenCode\fvttV12JsonGenerator\.local\foundry-v14\app\14.364\node_modules\classic-level\index.js
```

Its installed `package.json` reports `classic-level` `3.0.0`; its local README states that an open database obtains an exclusive lock and a concurrent open fails. The tests created only disposable databases under the system temporary directory:

1. A pre-opened disposable ClassicLevel database caused `createWorldSnapshot()` to reject before copy.
2. While `acquireStoppedWorldLocks()` held the disposable `LOCK`, a contender `ClassicLevel.open()` rejected with `Database failed to open`.
3. After `guard.close()`, that same location opened and closed successfully.
4. The default reader opened a snapshot copy, returned its record, and a subsequent contender open on the snapshot succeeded, proving reader closure.

No ClassicLevel constructor, iterator, or open call targeted the original `cor-cotn` database, and no remote system was accessed.

### Final commands and exact results

```powershell
bun test src/tools/__tests__/worldAuditSnapshot.test.ts
# 16 pass, 0 fail, 29 expect() calls

bun run typecheck:production
# $ tsc -p tsconfig.production.json --pretty false
# exit 0

bun run typecheck:all
# $ tsc -p tsconfig.json --pretty false
# exit 0

bun test --max-concurrency 4
# 1317 pass, 0 fail, 5191 expect() calls, 116 files
```

`git diff --check` also exited `0` before staging.

### Review scope and remaining concerns

- The PowerShell guard is deliberately Windows-only and fail-closed elsewhere; this World Audit target is the project-local Windows Foundry mirror. The required exact Windows semantics were proven on this machine.
- The third `SnapshotLifecycleHooks` parameter is a narrow deterministic test seam for copy/hash failure cleanup. Production callers do not supply it and it performs no I/O by itself.
- This remains a Task 1 foundation. It does not pin the later CLI's world path/system version or perform Task 3 analysis/remote work.

### Fix commit

`9a0c0408361ac5b99cb5bad26f192e2293206ae1` — `fix: harden stopped-world snapshot safety`

---

## Second re-review fix evidence

- Snapshot work now occurs only in an invocation-owned `mkdtemp` staging directory. Validation and snapshot reading finish there; only then does `rename()` promote it to the requested destination. Failed copy/hash/read/promote paths remove only that owned staging directory. A concurrent foreign destination test preserves `foreign.txt` and proves no staging directory remains.
- The guard exposes an `unexpectedExit` signal. Lifecycle code records it, waits for any active hook/copy/hash work to settle, then rejects and cleans staging. The deterministic blocked-hook test terminates the guard, releases the hook, and proves rejection plus no destination.
- The exact genuine ClassicLevel contention tests remain in the focused suite and passed.
- Verification: focused `18 pass, 0 fail, 38 expect()`; both TypeScript checks exit 0; full `bun test --max-concurrency 4` reports `1319 pass, 0 fail, 5200 expect()`.

---

## Final safety-test completion addendum

### Scope and TDD evidence

This completion pass reviewed only the current Task 1 snapshot implementation and its focused test suite. It adds deterministic process/timeout seams rather than shortening the genuine project-local ClassicLevel contention coverage.

The new focused tests were written before the corresponding production seam was added. The RED command was:

```powershell
bun test src/tools/__tests__/worldAuditSnapshot.test.ts
```

It exited `1` with the expected missing exported test seam:

```text
SyntaxError: Export named 'assertWindowsReparsePointFree' not found
0 pass
1 fail
1 error
```

### Safety behavior added and checked

- The Windows reparse scanner now accepts only a zero exit with completely empty stdout/stderr. Explicit ReparsePoint output/nonzero status, malformed success output, and stderr all reject.
- `WorldAuditProcessHooks` injects a PowerShell process and scheduler for deterministic tests. Production still uses the real hidden `powershell.exe` process and the 10-second bound.
- Readiness and close timeouts kill the child with `SIGKILL` before rejection. The timeout wrapper tracks settlement so a cleared/stale timer or later process listener cannot kill or settle a completed operation again.
- `SnapshotRuntime` is a narrow guard-acquisition seam. If a snapshot failure and guard-close failure occur together, `createWorldSnapshot()` throws an `AggregateError` containing both errors instead of hiding the original snapshot error.
- Existing tests that dynamically import the exact project-local ClassicLevel `3.0.0` remain intact: a pre-opened source rejects, the guard blocks a real contender until release, and the default reader closes the snapshot database before a contender opens it.

### Exact final verification

```powershell
bun test src/tools/__tests__/worldAuditSnapshot.test.ts
# 23 pass, 0 fail, 54 expect() calls

bun run typecheck:production
# $ tsc -p tsconfig.production.json --pretty false
# exit 0

bun run typecheck:all
# $ tsc -p tsconfig.json --pretty false
# exit 0

bun test --max-concurrency 4
# 1324 pass, 0 fail, 5216 expect() calls, 116 files

git diff --check
# exit 0
```

### Semantic acceptance and self-review

The new unit tests use a manually driven scheduler and fake process, so they neither wait for real 10-second bounds nor depend on a machine race. They prove the observable safety contract: scanner findings cannot be accepted, hung child processes receive force-kill, close failure is visible without loss of the primary failure, and an artificially fired stale timeout callback leaves an already-ready guard untouched. The authentic ClassicLevel tests remain separate and prove the real project-local exclusive-lock behavior.

The only production extension is injectable process/timeout/guard acquisition at this low-level boundary; ordinary callers receive the unchanged real PowerShell behavior. No source World LevelDB was opened by ClassicLevel during this test pass, and no remote system was contacted. Existing user-owned dirty files were not edited or staged.
