# local.3 preparation and resource update — 2026-09-20

- Locked upstream: `4338eeab85041cd71b76ede36818e2265cbf06ae`; today's advisory check found no dnd6 advancement or matching open MR in the existing checker.
- Patch SHA-256: `3BFBE35BF569FAAEE6952FD2CB7ABBA67F5EAD47365ABE7DD987720456FFDE79`.
- Candidate: `14.6.0-beta.4338eeab.local.3`.
- ZIP SHA-256: `29E180D1093F6FB2A3006B7C4E99C887E933E08D67EC328640DFC1D74B16115B`.
- Bundle SHA-256: `84B1CF21529779ABE5E345951DBD79CAB0507E3D052966D0D44DF80350AF50CA`.
- Build: exact patch application passed; pristine and candidate TypeScript exit codes both 0; archive validation passed, 148 entries.
- Pre-update tests: 43 passed, 0 failed, 146 assertions. Actual pinned Workflow methods execute under stubs; nine field-removal mutations cover all three constructors. Model probes expose local.2's erroneous condition migration and the fresh-ID base control. These are not complete Foundry runtime tests.
- Prepared macro syntax/input validation passed; macro command SHA-256 `813F87B8EF2D10BCA8BF8F497B77681B6D6E0CC620B32AD17B1CD4A60BDFCA27`; JSON SHA-256 `1346AB3636CBA5F86ACAFD2708242DB1054B46504D1685BEF80C88AA5345B757`.
- Astra reviewed the method extraction fix and restricted update safeguards; no remaining apply blocker. Read-only preview passed before apply.
- Browser-resource update passed: only bundle, source map and manifest replaced. Disk and HTTP bundle hashes matched the candidate; service PID stayed 11188. Existing packs, world data and Foundry runtime lock were preserved. No cold start was performed.
- Permanent evidence: `F:\FoundryLab\foundry-v14\evidence\server-next-migration\batch6J-midi-qol-local3-cf-20260920\browser-update-applied.json`.

Chrome C/F acceptance is still pending. The server may advertise cached local.2 metadata; the test macro must verify the actually executing template-cleanup and RollFinished method fingerprints from the candidate ZIP. Do not claim a new-client or gameplay PASS from the resource update alone. No commit, merge, push or production operation occurred.
