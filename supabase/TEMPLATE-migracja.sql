-- TEMPLATE, not a ready migration. The integrator copies it to migrations/<YYYYMMDDHHMMSS>_<description>.sql.
-- First agree the entity, users and access in docs/product/requirements.md. Commit + review before applying.
-- After applying, record the result in APPLIED.md; never edit an already applied migration.

begin;

create table public.table_name (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null
);

alter table public.table_name enable row level security;
-- No default access, even when the project has broad default privileges.
revoke all on public.table_name from anon, authenticated;

-- HERE the integrator adds policies and grants per the requirements. Each operation and role separately.
-- For user data add an owner column and the condition (select auth.uid()) = owner_id.
-- SELECT: USING, INSERT: WITH CHECK, UPDATE: USING + WITH CHECK, DELETE: USING.
-- Do not copy default USING (true) or anonymous writes.
-- Before merging dependent code, test both allowed and denied access.

commit;
