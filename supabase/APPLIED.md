# Migration register — integrator only

One Supabase project serves local, preview and production. Never record passwords or keys here.
Commit and review a migration before applying it. Applied files are immutable. After success, add the
file name, commit, project, UTC time and who applied it; after an error, record the result and check
the database state before retrying. Reverting code does not revert a migration.

| Migration file                                 | Commit  | Project                | UTC time                                                       | Applied by    | Result                                                                                            |
| ---------------------------------------------- | ------- | ---------------------- | -------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| 20261002000000_health_check.sql                | 750f3f7 | `qrriwnmluhbbpyuacepv` | pre-existing; verified by `npm run doctor` at 2026-10-03 15:26 | Bartosz       | OK                                                                                                |
| 20261003152115_core_schema.sql                 | 632d006 | `qrriwnmluhbbpyuacepv` | 2026-10-03 15:31                                               | Bartosz       | OK — 17 tables, RLS 17/17, 3 SELECT policies, anon probe 17/17 denied                             |
| 20261003162224_operation_rpcs.sql              | bc8bd6f | `qrriwnmluhbbpyuacepv` | 2026-10-03 16:33                                               | Bartosz (CLI) | OK — 3 functions, execute service_role only, test:db race/settle-once green                       |
| 20261003173711_run_rpcs.sql                    | ffd11eb | `qrriwnmluhbbpyuacepv` | 2026-10-03 17:52                                               | Bartosz (CLI) | OK — 2 functions, execute service_role only, test:db run tests green                              |
| 20261003210046_review_export_token_storage.sql | ef62e80 | `qrriwnmluhbbpyuacepv` | 2026-10-03 21:26                                               | Bartosz (CLI) | OK — 4 tables, RLS 21/21, 3 browser grants, 2 private buckets, no storage policies, test:db green |
