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
