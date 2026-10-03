# Migration register — integrator only

One Supabase project serves local, preview and production. Never record passwords or keys here.
Commit and review a migration before applying it. Applied files are immutable. After success, add the
file name, commit, project, UTC time and who applied it; after an error, record the result and check
the database state before retrying. Reverting code does not revert a migration.

| Migration file                  | Commit  | Project                | UTC time                                                       | Applied by | Result                                                                |
| ------------------------------- | ------- | ---------------------- | -------------------------------------------------------------- | ---------- | --------------------------------------------------------------------- |
| 20261002000000_health_check.sql | 750f3f7 | `qrriwnmluhbbpyuacepv` | pre-existing; verified by `npm run doctor` at 2026-10-03 15:26 | Bartosz    | OK                                                                    |
| 20261003152115_core_schema.sql  | 632d006 | `qrriwnmluhbbpyuacepv` | 2026-10-03 15:31                                               | Bartosz    | OK — 17 tables, RLS 17/17, 3 SELECT policies, anon probe 17/17 denied |
