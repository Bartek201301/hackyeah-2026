-- Atomic export publication (migration K): finalize_export.
-- Source of truth: technical-spec §7, data-model.md "exports" and "Atomic RPC responsibilities", and the
-- post-G2 phase 12 decisions. Same conventions as migration E (finalize_import): security invoker with an
-- empty search_path, execute for service_role only, errors raise an OpenAPI ErrorCode as the message and a
-- content-free detail. The PDF is uploaded before this call under a server-generated key; if this call
-- fails the object stays private and orphaned, and nothing is disclosed.
-- Applied once by the integrator after review; record the result in supabase/APPLIED.md. Never edit after apply.

begin;

-- Publishes one completed export under the run's lease: the exports row, then the finalize_run settlement,
-- in one transaction. Organisation and actor come from the run, never from the payload. Every cited excerpt
-- version must be an approved public excerpt of the run organisation. If the run cannot be finalized nothing
-- is inserted.
create function public.finalize_export(
  p_run_id uuid,
  p_lease_token uuid,
  p_operation_id uuid,
  p_outcome jsonb,
  p_export jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.runs%rowtype;
  v_export_id uuid;
  v_final jsonb;
begin
  if p_run_id is null or p_lease_token is null or p_operation_id is null
     or jsonb_typeof(p_outcome) is distinct from 'object'
     or jsonb_typeof(p_export) is distinct from 'object' then
    raise exception 'INVALID_INPUT' using detail = 'finalize_export: missing required argument';
  end if;
  -- Separate statement so the field checks only run on an object.
  if not coalesce(p_export ->> 'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false)
     or not coalesce(p_export ->> 'text_sha256' ~ '^[0-9a-f]{64}$', false)
     or not coalesce(char_length(p_export ->> 'storage_key') between 1 and 200, false)
     or jsonb_typeof(p_export -> 'expires_at') is distinct from 'string'
     or not pg_input_is_valid(p_export ->> 'expires_at', 'timestamptz')
     or jsonb_typeof(p_export -> 'excerpt_versions') is distinct from 'array'
     or jsonb_array_length(p_export -> 'excerpt_versions') > 20 then
    raise exception 'INVALID_INPUT' using detail = 'finalize_export: export does not match the contract';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_export -> 'excerpt_versions') e
    where jsonb_typeof(e) is distinct from 'object'
       or not coalesce(e ->> 'excerpt_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false)
       or jsonb_typeof(e -> 'version') is distinct from 'number'
       or not coalesce((e ->> 'version') ~ '^[1-9][0-9]{0,8}$', false)
  ) then
    raise exception 'INVALID_INPUT' using detail = 'finalize_export: excerpt versions do not match the contract';
  end if;
  v_export_id := (p_export ->> 'id')::uuid;
  if (p_export ->> 'expires_at')::timestamptz <= now() then
    raise exception 'INVALID_INPUT' using detail = 'finalize_export: export already expired';
  end if;
  -- Only a released export is published, and the stored result must point at this export and expiry.
  if concat_ws('/', p_outcome ->> 'run_state', p_outcome ->> 'decision') is distinct from 'completed/ALLOW'
     or p_outcome #>> '{result,data,download_path}' is distinct from format('/api/v1/exports/%s/download', v_export_id)
     or p_outcome #>> '{result,data,expires_at}' is distinct from p_export ->> 'expires_at' then
    raise exception 'INVALID_INPUT' using detail = 'finalize_export: export disagrees with the outcome';
  end if;

  -- Lock the run first so a replayed or stale call conflicts before any insert.
  select * into v_run from public.runs r where r.id = p_run_id for no key update;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'run not found';
  end if;
  if v_run.kind <> 'export' or v_run.state not in ('running', 'cancel_requested')
     or v_run.lease_token is distinct from p_lease_token then
    raise exception 'CONFLICT' using detail = 'run is not an export held under this lease';
  end if;
  -- Server-generated key: <organisation>/<export>.pdf, nothing user-supplied.
  if p_export ->> 'storage_key' is distinct from format('%s/%s.pdf', v_run.organisation_id, v_export_id) then
    raise exception 'INVALID_INPUT' using detail = 'finalize_export: storage key outside the export prefix';
  end if;
  -- Public audience, enforced here as well as in retrieval: every cited version is approved and public.
  if exists (
    select 1 from jsonb_array_elements(p_export -> 'excerpt_versions') e
    where not exists (
      select 1 from public.excerpts x
      where x.organisation_id = v_run.organisation_id and x.id = (e ->> 'excerpt_id')::uuid
        and x.version = (e ->> 'version')::int and x.status = 'approved' and x.classification = 'public'
    )
  ) then
    raise exception 'CONFLICT' using detail = 'cited excerpt is not an approved public version';
  end if;

  -- A reused export id is a conflict, not a raw error.
  begin
    insert into public.exports
      (id, organisation_id, run_id, actor_id, storage_key, text_sha256, excerpt_versions, expires_at, status)
    values
      (v_export_id, v_run.organisation_id, v_run.id, v_run.actor_id, p_export ->> 'storage_key',
       p_export ->> 'text_sha256', p_export -> 'excerpt_versions', (p_export ->> 'expires_at')::timestamptz,
       'ready');
  exception when unique_violation then
    raise exception 'CONFLICT' using detail = 'export already published';
  end;

  v_final := public.finalize_run(p_run_id, p_lease_token, p_operation_id, p_outcome);
  if not coalesce((v_final ->> 'finalized')::boolean, false) then
    raise exception 'CONFLICT' using detail = 'run was already settled';
  end if;

  return jsonb_build_object('finalized', true, 'state', v_final ->> 'state', 'export_id', v_export_id);
end;
$$;

-- Execute for the gateway server only; Supabase default privileges would otherwise grant anon/authenticated.

revoke execute on function public.finalize_export(uuid, uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_export(uuid, uuid, uuid, jsonb, jsonb) to service_role;

commit;
