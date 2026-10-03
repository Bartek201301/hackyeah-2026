-- Core gateway schema (migration A): enums and the 17 G2-path tables with composite cross-org
-- foreign keys, indexes, RLS on every table, deny-by-default grants, three own-row browser SELECT
-- policies and service_role immutability for audit/policy/feed/excerpt text. No functions, no data.
-- Source of truth: docs/contracts/data-model.md. Applied once by the integrator through the
-- Supabase SQL Editor after review; record the result in supabase/APPLIED.md. Never edit after apply.

begin;

-- Enums

create type public.member_role as enum ('admin', 'analyst', 'employee', 'external');
create type public.classification as enum ('public', 'internal', 'restricted');
create type public.source_kind as enum ('dataset', 'upload');
create type public.audience_evidence as enum ('verified', 'unverified');
create type public.document_status as enum
  ('quarantined', 'processing', 'approved', 'partial', 'review', 'blocked', 'failed');
create type public.excerpt_status as enum ('candidate', 'approved', 'rejected', 'revoked');
create type public.fact_basis as enum ('actual', 'forecast', 'proposal', 'event');
create type public.run_kind as enum ('import', 'chat', 'export');
create type public.run_state as enum
  ('pending', 'running', 'completed', 'review', 'blocked', 'failed', 'cancel_requested', 'cancelled', 'incomplete');
create type public.operation_state as enum ('intent', 'started', 'completed', 'denied', 'unknown');
create type public.budget_scope as enum ('actor', 'org');
create type public.budget_unit as enum
  ('generation_tokens', 'generation_ms', 'semantic_tokens', 'commercial_micro_usd');
create type public.reservation_state as enum ('reserved', 'settled', 'unresolved', 'released');
create type public.audit_event_type as enum
  ('intent', 'decision', 'provider_started', 'completion', 'incomplete', 'review', 'configuration');

-- Tables (parents first)

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Actor columns elsewhere reference (organisation_id, actor_id); no cascade from auth.users,
-- so deleting a user with history fails.
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  actor_id uuid not null references auth.users (id),
  role public.member_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organisation_id, actor_id)
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  label text not null,
  created_at timestamptz not null default now(),
  unique (organisation_id, id)
);

create table public.deal_memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  deal_id uuid not null,
  actor_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organisation_id, deal_id, actor_id),
  foreign key (organisation_id, deal_id) references public.deals (organisation_id, id),
  foreign key (organisation_id, actor_id) references public.memberships (organisation_id, actor_id)
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  label text not null,
  kind public.source_kind not null,
  dataset_key text,
  classification public.classification not null,
  deal_id uuid,
  created_by uuid not null,
  audience_evidence public.audience_evidence not null default 'unverified',
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, dataset_key),
  check ((kind = 'dataset') = (dataset_key is not null)),
  check (classification <> 'restricted' or deal_id is not null),
  foreign key (organisation_id, deal_id) references public.deals (organisation_id, id),
  foreign key (organisation_id, created_by) references public.memberships (organisation_id, actor_id)
);

create table public.dataset_rows (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  batch_id uuid not null,
  source_id uuid not null,
  row_number int not null check (row_number > 0),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (source_id, batch_id, row_number),
  foreign key (organisation_id, source_id) references public.sources (organisation_id, id)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  source_id uuid not null,
  uploaded_by uuid not null,
  deal_id uuid,
  classification public.classification not null,
  status public.document_status not null default 'quarantined',
  storage_key text not null,
  sha256 text not null,
  format text not null,
  byte_count bigint not null check (byte_count >= 0),
  version int not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  check (classification <> 'restricted' or deal_id is not null),
  foreign key (organisation_id, source_id) references public.sources (organisation_id, id),
  foreign key (organisation_id, uploaded_by) references public.memberships (organisation_id, actor_id),
  foreign key (organisation_id, deal_id) references public.deals (organisation_id, id)
);

-- text/version are immutable for service_role (column grants below); only approved rows are searchable.
create table public.excerpts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  document_id uuid not null,
  version int not null check (version >= 1),
  text text not null,
  text_sha256 text not null,
  classification public.classification not null,
  deal_id uuid,
  status public.excerpt_status not null default 'candidate',
  locator text not null,
  source_date date not null,
  period text not null,
  unit text not null,
  basis public.fact_basis not null,
  fact_key text,
  search_vector tsvector generated always as (to_tsvector('english', text)) stored,
  approved_by uuid,
  approval_reason text,
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  check (classification <> 'restricted' or deal_id is not null),
  foreign key (organisation_id, document_id) references public.documents (organisation_id, id),
  foreign key (organisation_id, deal_id) references public.deals (organisation_id, id),
  foreign key (organisation_id, approved_by) references public.memberships (organisation_id, actor_id)
);

create table public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  version int not null check (version >= 1),
  document jsonb not null,
  sha256 text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (organisation_id, version),
  foreign key (organisation_id, created_by) references public.memberships (organisation_id, actor_id)
);

create table public.feed_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  version int not null check (version >= 1),
  document jsonb not null,
  sha256 text not null,
  source text not null,
  expires_at timestamptz not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (organisation_id, version),
  foreign key (organisation_id, created_by) references public.memberships (organisation_id, actor_id)
);

create table public.control_heads (
  organisation_id uuid primary key references public.organisations (id),
  policy_version int not null,
  feed_version int not null,
  revision int not null default 1,
  created_at timestamptz not null default now(),
  foreign key (organisation_id, policy_version) references public.policy_versions (organisation_id, version),
  foreign key (organisation_id, feed_version) references public.feed_versions (organisation_id, version)
);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  actor_id uuid not null,
  kind public.run_kind not null,
  state public.run_state not null default 'pending',
  stage text not null,
  policy_version int not null,
  feed_version int not null,
  input_private jsonb not null,
  result_private jsonb,
  lease_token uuid,
  lease_expires_at timestamptz,
  cancel_requested_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id, actor_id) references public.memberships (organisation_id, actor_id),
  foreign key (organisation_id, policy_version) references public.policy_versions (organisation_id, version),
  foreign key (organisation_id, feed_version) references public.feed_versions (organisation_id, version)
);

create table public.operations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  actor_id uuid not null,
  run_id uuid,
  operation text not null,
  idempotency_key uuid not null,
  request_sha256 text not null,
  state public.operation_state not null default 'intent',
  policy_version int not null,
  feed_version int not null,
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, actor_id, operation, idempotency_key),
  foreign key (organisation_id, actor_id) references public.memberships (organisation_id, actor_id),
  foreign key (organisation_id, run_id) references public.runs (organisation_id, id),
  foreign key (organisation_id, policy_version) references public.policy_versions (organisation_id, version),
  foreign key (organisation_id, feed_version) references public.feed_versions (organisation_id, version)
);

-- scope_id is polymorphic (actor or organisation), so it has no foreign key.
create table public.budget_buckets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  scope_kind public.budget_scope not null,
  scope_id uuid not null,
  period_start date not null,
  unit public.budget_unit not null,
  spent bigint not null default 0 check (spent >= 0),
  reserved bigint not null default 0 check (reserved >= 0),
  created_at timestamptz not null default now(),
  unique (organisation_id, id, unit),
  unique (organisation_id, scope_kind, scope_id, unit, period_start)
);

-- A call settles to its original bucket even across UTC midnight; unit must match that bucket.
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  operation_id uuid not null,
  call_id uuid not null,
  bucket_id uuid not null,
  unit public.budget_unit not null,
  amount bigint not null check (amount >= 0),
  actual bigint check (actual >= 0),
  state public.reservation_state not null default 'reserved',
  provider text not null,
  created_at timestamptz not null default now(),
  unique (call_id, bucket_id),
  check (state <> 'settled' or actual is not null),
  foreign key (organisation_id, operation_id) references public.operations (organisation_id, id),
  foreign key (organisation_id, bucket_id, unit) references public.budget_buckets (organisation_id, id, unit)
);

-- operation_id/actor_id are nullable: a denial before identity resolution is still audited.
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  trace_id uuid not null,
  operation_id uuid,
  actor_id uuid,
  event_type public.audit_event_type not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (organisation_id, operation_id) references public.operations (organisation_id, id),
  foreign key (organisation_id, actor_id) references public.memberships (organisation_id, actor_id)
);

-- Sanitized projection only. Versions are null when the denial precedes policy lookup.
create table public.actor_activity (
  trace_id uuid primary key,
  organisation_id uuid not null references public.organisations (id),
  actor_id uuid not null,
  operation text not null,
  state text not null,
  decision text check (decision in ('ALLOW', 'REDACT', 'REVIEW', 'BLOCK')),
  reasons jsonb not null default '[]',
  usage jsonb not null default '{}',
  policy_version int,
  feed_version int,
  created_at timestamptz not null default now(),
  foreign key (organisation_id, actor_id) references public.memberships (organisation_id, actor_id),
  foreign key (organisation_id, policy_version) references public.policy_versions (organisation_id, version),
  foreign key (organisation_id, feed_version) references public.feed_versions (organisation_id, version)
);

-- Indexes

create index excerpts_search_vector_idx on public.excerpts using gin (search_vector);
create index excerpts_filter_idx on public.excerpts (organisation_id, status, classification, deal_id);
create index memberships_actor_id_idx on public.memberships (actor_id);
create index deal_memberships_actor_id_idx on public.deal_memberships (actor_id);
create index runs_org_actor_created_idx on public.runs (organisation_id, actor_id, created_at);
create index audit_events_trace_created_idx on public.audit_events (trace_id, created_at);
create index audit_events_org_created_idx on public.audit_events (organisation_id, created_at);
create index actor_activity_actor_created_idx on public.actor_activity (actor_id, created_at);
create index actor_activity_org_created_idx on public.actor_activity (organisation_id, created_at);
create index documents_org_status_idx on public.documents (organisation_id, status);

-- Row level security on every table

alter table public.organisations enable row level security;
alter table public.memberships enable row level security;
alter table public.deals enable row level security;
alter table public.deal_memberships enable row level security;
alter table public.sources enable row level security;
alter table public.dataset_rows enable row level security;
alter table public.documents enable row level security;
alter table public.excerpts enable row level security;
alter table public.policy_versions enable row level security;
alter table public.feed_versions enable row level security;
alter table public.control_heads enable row level security;
alter table public.runs enable row level security;
alter table public.operations enable row level security;
alter table public.budget_buckets enable row level security;
alter table public.reservations enable row level security;
alter table public.audit_events enable row level security;
alter table public.actor_activity enable row level security;

-- No default access, even when the project has broad default privileges.

revoke all on public.organisations from anon, authenticated;
revoke all on public.memberships from anon, authenticated;
revoke all on public.deals from anon, authenticated;
revoke all on public.deal_memberships from anon, authenticated;
revoke all on public.sources from anon, authenticated;
revoke all on public.dataset_rows from anon, authenticated;
revoke all on public.documents from anon, authenticated;
revoke all on public.excerpts from anon, authenticated;
revoke all on public.policy_versions from anon, authenticated;
revoke all on public.feed_versions from anon, authenticated;
revoke all on public.control_heads from anon, authenticated;
revoke all on public.runs from anon, authenticated;
revoke all on public.operations from anon, authenticated;
revoke all on public.budget_buckets from anon, authenticated;
revoke all on public.reservations from anon, authenticated;
revoke all on public.audit_events from anon, authenticated;
revoke all on public.actor_activity from anon, authenticated;

-- Browser projections: own active membership, own deal memberships, own activity. SELECT only.

grant select on public.memberships, public.deal_memberships, public.actor_activity to authenticated;

create policy memberships_select_own on public.memberships
  for select to authenticated
  using ((select auth.uid()) = actor_id and active);

create policy deal_memberships_select_own on public.deal_memberships
  for select to authenticated
  using ((select auth.uid()) = actor_id and exists (
    select 1 from public.memberships m
    where m.organisation_id = deal_memberships.organisation_id
      and m.actor_id = (select auth.uid()) and m.active));

create policy actor_activity_select_own on public.actor_activity
  for select to authenticated
  using ((select auth.uid()) = actor_id);

-- service_role immutability: append-only audit and version snapshots; excerpt text/version fixed.

revoke update, delete, truncate on public.audit_events, public.policy_versions, public.feed_versions
  from service_role;
revoke update on public.excerpts from service_role;
grant update (status, approved_by, approval_reason) on public.excerpts to service_role;

commit;
