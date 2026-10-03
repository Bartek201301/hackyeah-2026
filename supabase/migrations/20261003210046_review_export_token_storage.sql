-- Review, export and token tables plus private Storage buckets (migration D): three enums, four tables
-- with composite cross-org foreign keys, RLS on every table and no browser grants or policies, and the
-- private buckets quarantine and generated-exports with no storage.objects policies (absence is deny for
-- anon/authenticated; only the service client stores and streams objects). No functions, no data rows.
-- Source of truth: docs/contracts/data-model.md. Applied once by the integrator through the Supabase CLI
-- after review; record the result in supabase/APPLIED.md. Never edit after apply.

begin;

-- Enums

create type public.review_status as enum ('pending', 'approved', 'rejected', 'expired');
create type public.export_status as enum ('ready', 'revoked', 'expired');
create type public.token_audience as enum ('public', 'feed');

-- Tables (parents first)

-- run_id is nullable: an import review always sets it, but an admin edit of an existing review has no run.
create table public.review_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  document_id uuid not null,
  run_id uuid,
  candidate_text text not null,
  version int not null default 1 check (version >= 1),
  classification public.classification not null,
  status public.review_status not null default 'pending',
  reviewer_id uuid,
  reason text,
  evidence_excerpt_ids uuid[] not null default '{}',
  expires_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id, document_id) references public.documents (organisation_id, id),
  foreign key (organisation_id, run_id) references public.runs (organisation_id, id),
  foreign key (organisation_id, reviewer_id) references public.memberships (organisation_id, actor_id)
);

-- Append-only: previous candidates persisted on each CAS update (grants below).
create table public.review_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  review_id uuid not null,
  version int not null check (version >= 1),
  candidate_text text not null,
  text_sha256 text not null,
  classification public.classification not null,
  actor_id uuid not null,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (review_id, version),
  foreign key (organisation_id, review_id) references public.review_requests (organisation_id, id),
  foreign key (organisation_id, actor_id) references public.memberships (organisation_id, actor_id)
);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  run_id uuid not null,
  actor_id uuid not null,
  storage_key text not null,
  text_sha256 text not null,
  excerpt_versions jsonb not null,
  expires_at timestamptz not null,
  status public.export_status not null default 'ready',
  created_at timestamptz not null default now(),
  foreign key (organisation_id, run_id) references public.runs (organisation_id, id),
  foreign key (organisation_id, actor_id) references public.memberships (organisation_id, actor_id)
);

-- Only the token hash is stored; the plaintext is shown once and never persisted.
create table public.access_tokens (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  actor_id uuid not null,
  token_sha256 text not null unique,
  scopes text[] not null,
  audience public.token_audience not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organisation_id, actor_id) references public.memberships (organisation_id, actor_id)
);

-- Indexes

create index review_requests_org_status_idx on public.review_requests (organisation_id, status);

-- Row level security on every table

alter table public.review_requests enable row level security;
alter table public.review_versions enable row level security;
alter table public.exports enable row level security;
alter table public.access_tokens enable row level security;

-- No browser access: no grants and no policies for anon or authenticated.

revoke all on public.review_requests from anon, authenticated;
revoke all on public.review_versions from anon, authenticated;
revoke all on public.exports from anon, authenticated;
revoke all on public.access_tokens from anon, authenticated;

-- service_role immutability: review versions are append-only.

revoke update, delete, truncate on public.review_versions from service_role;

-- Private buckets. No storage.objects policies: anon/authenticated are denied by their absence.

insert into storage.buckets (id, name, public)
values ('quarantine', 'quarantine', false), ('generated-exports', 'generated-exports', false)
on conflict (id) do nothing;

commit;
