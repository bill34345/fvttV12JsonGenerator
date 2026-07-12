# Foundry v14 local mirror tooling

This tooling builds a loopback-only Foundry v14.364 laboratory under
`.local/foundry-v14`. The directory is ignored by Git. Production access is
read-only: inventory uses SSH and server-only package acquisition uses SCP.
The workflow never creates production archives or removes or changes production
files. SSH transport compression may be enabled in memory with `scp -C`.

## Package acquisition

First capture and classify the live inventory, then review the dry-run:

```powershell
bun run foundry:lab inventory --apply
bun run foundry:lab classify
bun run foundry:lab acquire
```

The dry-run reads the locked local inventory and dnd5e reference only. It does
not create directories, download files, or connect over SSH. A production
snapshot with 88 active modules produces 90 planned actions: one per module and
one dnd5e 5.3.3 installation for each local profile.

Apply the reviewed plan with:

```powershell
bun run foundry:lab acquire --apply
```

Public archives must remain HTTPS through every redirect. Downloads use a
`.part` file, extraction uses an isolated staging directory, and the archive's
UTF-8 `module.json` or `system.json` must contain the exact expected ID and
version before the existing installation is atomically replaced. An invalid
package fails independently and leaves an existing verified directory intact.

Packages classified `server-only` are copied serially from
`Administrator@49.232.12.153:E:/Bill/fvtt_v13/data/Data/modules/<folder>` using
the existing SSH identity. Progress is reported per package, including copied
bytes. No transfers run in parallel. Packages classified `account-protected`
remain unresolved until installed through the user's authenticated Foundry
package interface; the script never looks for public substitutes or stores
credentials. On a later run, an account-protected package already present with
the exact expected ID and version is accepted as installed. `manual-review`
packages are always held out of installation.

Server-only trees are inventoried read-only on production and verified locally
by relative path, byte size, and SHA-256. Packages without active database lock
files use `scp -O -C -r` to avoid SFTP round trips for many small files. If a
tree contains LevelDB files whose exact basename is `LOCK` (case-insensitive on
Windows), acquisition uses modern `scp -C -r`, records those runtime-only lock
paths as exclusions, and verifies every other file. No other filename is
excluded. Missing files after a recursive copy are fetched one at a time and
the complete tree is verified again. A live LevelDB `.log` file that Foundry
holds exclusively is not treated as disposable: the package fails closed and
must be reacquired during an approved maintenance window or through its
authorized package source.

For active manifests declaring `persistentStorage: true`, the base package is
verified in package staging first. Its production `storage` directory is then
copied into that same staged package and checked by relative path, byte size,
and SHA-256. The complete package replaces the prior tree in one atomic step.
When an exact package already exists (including an authorized protected
package), it is cloned to staging before storage refresh, so a storage failure
leaves the authorized base and its previous storage byte-for-byte untouched.
The remote inventory probe reports whether the declared `storage` directory
actually exists. A verified missing directory is recorded as
`verified-missing-as-empty` with zero files and zero bytes and does not invoke
SCP; probe errors still fail closed. Existing directories, including empty
ones, continue through the full copy and relative-path/size/SHA-256 check.

The ignored report is written to:

```text
.local/foundry-v14/inventory/acquisition-report.json
```

It lists every installed, unresolved, and failed package. An apply run is only
complete when both unresolved and failed counts are zero.

## User-owned local package sources

Exact packages already owned on the workstation can be imported without using
production bandwidth. Put the mapping only in the ignored runtime file:

```text
.local/foundry-v14/inventory/local-package-sources.json
```

Each entry contains only an ID, exact expected version, and absolute source
path. Do not add passwords, tokens, or account data:

```json
[
  {
    "id": "example-module",
    "expectedVersion": "1.2.3",
    "sourcePath": "D:\\user-owned-packages\\example-module.zip"
  }
]
```

Review sources without changing the lab or source files:

```powershell
bun run foundry:lab acquire-local
```

Then apply the validated plan:

```powershell
bun run foundry:lab acquire-local --apply
```

Directories and `.zip`, `.7z`, and `.rar` archives are supported. Archives use
7-Zip and are listed before extraction. Absolute, UNC, drive-relative,
traversal, and NTFS alternate-data-stream paths are rejected. A package may
have `module.json` at archive root or inside exactly one wrapper directory.
The exact manifest ID/version and the staged file inventory must verify before
one atomic replacement of the server-mirror package directory.

Encrypted archives use a runtime-only environment variable derived from the
package ID, for example:

```text
FOUNDRY_LAB_ARCHIVE_PASSWORD_EXAMPLE_MODULE
```

The password is passed only to 7-Zip, redacted from command output, and never
stored in mappings or reports. The ignored result is written to
`.local/foundry-v14/inventory/local-source-report.json` only under `--apply`.

## Module compatibility acceptance workflow

### Default world for future end-to-end testing

Use the local copied world `cor-cotn` (`溟渊的呼唤`) in the `server-mirror`
profile as the default environment for future real end-to-end Foundry tests.
It is the durable production-shaped baseline for scene, Actor, sheet, chat,
journal, token, and enabled-module behavior. Missing image assets are
non-blocking unless they prevent the workflow under test.

Do not replace that end-to-end baseline with a disposable world merely because
the disposable world is cleaner. Use the disposable worlds only to isolate a
failure:

- `fvtt-v14-core-baseline` in `core-test`: Foundry/dnd5e behavior with no
  third-party modules.
- `fvtt-v14-module-matrix` in `server-mirror`: controlled module-group and
  minimal locked-module tests.

The copied world's authentication credential is intentionally not documented
or committed. A successful local login is a runtime prerequisite, not a reason
to store the password in this repository.

Package parity is a prerequisite, not the compatibility result. Run behavior
acceptance in disposable worlds and record it in
`docs/acceptance/foundry-v14-module-compatibility.md` before using a copied
production world:

1. Start `core-test` with no third-party modules and exercise Actor create,
   edit, roll, and export behavior.
2. Start `server-mirror` with a disposable matrix world. Enable libraries and
   sheets first, then automation/effects, animation/media, and scene/world
   utilities in dependency-safe groups.
3. After each group, reload and collect the active module IDs, browser errors,
   server errors, and an actual feature workflow. A visible control or a clean
   initialization log is only mechanical evidence.
4. Enable the broad production-snapshot set. For each blocking error, disable
   suspected modules and reproduce until the responsible module is isolated.
   Record both the failing set and the reduced set; never relabel a reduced set
   as exact parity.
5. Exercise a production-equivalent copied world only after the clean disposable
   baseline. Do not bypass its user authentication or copy live LevelDB files.

Acceptance statuses mean:

- `Pass`: the required representative behavior was exercised successfully.
- `Partial`: some real behavior worked, but required coverage remains missing.
- `Fail`: a required workflow or the intended complete configuration reproduced
  a blocking error.
- `Not Tested`: no behavioral evidence was collected.

For the 2026-07-11 run, the production snapshot contained 88 active IDs, but
only 87 registered locally because the protected MCDM package had an invalid
signature. `dungeon-strugglers-collection` was intentionally disabled by user
decision, so the broad configurable test contained 86 active modules. That
configuration reproduced errors from `monks-combat-marker` and `translate-all`.
Disabling those two produced an 84-module reload with no captured browser
errors. This 84-module result is a reduced stable candidate, not proof that all
88 production IDs coexist or that every enabled feature is correct.

The later authenticated `cor-cotn` smoke test used only the local copied world.
The user explicitly authorized a local-only Gamemaster password reset, and the
users database was backed up under the ignored world runtime directory before
the change. Do not record the replacement password or commit that backup.

That copied world opened with Foundry 14.364, dnd5e 5.3.3, and 87 registered
active modules. Representative Actor sheet, save/chat, journal, scene, and token
workflows succeeded. This proves sampled world usability, not complete module
compatibility: `simple-quest` 2.3.10 threw from
`JournalEntryPage.buildTOC`, and resource-path and deprecation warnings remained.
Record the core workflow as `Pass`, the complete-module error-free gate as
`Fail`, and the overall compatibility run as `Partial/Fail`.

Profile launches are serialized by an atomic lab-wide reservation at
`.local/foundry-v14/evidence/.launch-reservation`. The reservation spans peer
PID inspection, process spawn, listener verification, and PID-file publication,
so concurrent `core-test` and `server-mirror` launch commands cannot both pass
the mutual-exclusion boundary. A failed launch releases its reservation. After
an interrupted launcher, stale recovery removes the reservation only when its
recorded owner PID is no longer alive; it never removes a live owner's lock.

## Module health diagnostics

Refresh the production disk inventory with the existing read-only SSH command,
then create an ignored static diagnosis:

```powershell
bun run foundry:lab inventory --apply
bun run foundry:lab diagnose inventory
```

Performance samples belong under
`.local/foundry-v14/evidence/diagnostics`. A baseline JSON must contain the
0, 15, 30, 60, 90, and 120 minute checkpoints; shorter data is rejected rather
than reported as a soak result:

```powershell
bun run foundry:lab diagnose baseline full --input=.local/foundry-v14/evidence/diagnostics/full-samples.json
```

Runtime and semantic findings are supplied as a sanitized ignored JSON file.
Only explicit findings can promote a module from `Untested`; manifest metadata
alone never produces `OK`:

```powershell
bun run foundry:lab diagnose report --evidence=.local/foundry-v14/evidence/diagnostics/runtime-evidence.json
```

Operation-accumulation samples are appended one JSON object per line so an
interrupted soak preserves every completed sample. After the 15-minute warm-up
and five fixed 10-minute operation cycles, validate the 0, 15, 30, and 50
minute checkpoints and render
the sanitized report plus the ignored SVG curve with:

```powershell
bun run foundry:lab diagnose cumulative-report --input=.local/foundry-v14/evidence/diagnostics/operation-cumulative.jsonl
```

The cumulative report fails closed when any metric gap is recorded, the module
configuration hash changes, a required checkpoint is absent, or fewer than 5
post-GC cycle floors were collected. A performance-suspect result never claims
that an individual module is the root cause.

The report is written to
`docs/acceptance/foundry-v14-module-health.md`. Find the Culprit is installed
only in the local server mirror and is an isolation aid, not a corruption or
performance scanner. Always restore the module activation snapshot and local
user/config backups after a diagnostic run.
