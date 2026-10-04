-- Client actions trace id (migration M): create_client and update_client also return the audit trace id,
-- {"client_id","version","replayed","trace_id"} — the new trace on a fresh write, the original ALLOW
-- decision's trace on a replay. Bodies are migration L's plus that key; signatures, return type, checks
-- and grants are unchanged (create or replace keeps the service_role-only execute grants).
-- Applied once by the integrator after review; record the result in supabase/APPLIED.md. Never edit after apply.

begin;

create or replace function public.create_client(
  p_organisation_id uuid,
  p_actor_id uuid,
  p_idempotency_key uuid,
  p_request_sha256 text,
  p_client jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_op jsonb;
  v_trace uuid := gen_random_uuid();
  v_id uuid;
  v_result jsonb;
  v_usage jsonb := '{"generation_input_tokens":0,"generation_output_tokens":0,"generation_ms":0,
    "semantic_input_tokens":0,"semantic_ms":0,"reserved_generation_tokens":0,
    "unresolved_reservation":false,"comparison_micro_usd":0,"comparison_rate_version":"none"}'::jsonb;
begin
  if p_organisation_id is null or p_actor_id is null or p_idempotency_key is null
     or not coalesce(p_request_sha256 ~ '^[0-9a-f]{64}$', false) then
    raise exception 'INVALID_INPUT' using detail = 'create_client: missing or invalid argument';
  end if;
  perform public.validate_client_fields(p_client, array['name', 'sector', 'notes', 'annual_fee_usd', 'status']);
  if not p_client ? 'name' then
    raise exception 'INVALID_INPUT' using detail = 'create_client: name is required';
  end if;

  -- Keep the role stable until commit.
  perform 1 from public.memberships m
  where m.organisation_id = p_organisation_id and m.actor_id = p_actor_id
    and m.active and m.role in ('admin', 'analyst')
  for share;
  if not found then raise exception 'ACCESS_DENIED' using detail = 'no active admin or analyst membership'; end if;

  v_op := public.begin_operation(p_organisation_id, p_actor_id, 'client_create',
    p_idempotency_key, p_request_sha256, v_trace, null);
  -- A key first used for a request that was not allowed has no client to return.
  if (v_op ->> 'replay')::boolean then
    select jsonb_build_object('client_id', a.payload -> 'client_id', 'version', a.payload -> 'version',
      'replayed', true, 'trace_id', a.trace_id)
    into v_result from public.audit_events a
    where a.organisation_id = p_organisation_id and a.operation_id = (v_op ->> 'operation_id')::uuid
      and a.event_type = 'decision' and a.payload ->> 'decision' = 'ALLOW' and a.payload ? 'client_id';
    if v_result is null then
      raise exception 'CONFLICT' using detail = 'idempotency key belongs to a request that was not allowed';
    end if;
    return v_result;
  end if;

  insert into public.clients (organisation_id, name, sector, notes, annual_fee_usd, status, created_by)
  values (p_organisation_id, p_client ->> 'name', p_client ->> 'sector', p_client ->> 'notes',
    (p_client ->> 'annual_fee_usd')::numeric::int, coalesce(p_client ->> 'status', 'active'), p_actor_id)
  returning id into v_id;
  update public.operations set state = 'completed' where id = (v_op ->> 'operation_id')::uuid;

  insert into public.audit_events (organisation_id, trace_id, operation_id, actor_id, event_type, payload)
  values (p_organisation_id, v_trace, (v_op ->> 'operation_id')::uuid, p_actor_id, 'decision',
    jsonb_build_object('stage', 'client_create', 'decision', 'ALLOW', 'reasons', '[]'::jsonb,
      'client_id', v_id, 'version', 1,
      'fields', (select jsonb_agg(k order by k) from jsonb_object_keys(p_client) k),
      'usage', v_usage, 'policy_version', v_op -> 'policy_version', 'feed_version', v_op -> 'feed_version'));
  insert into public.actor_activity
    (trace_id, organisation_id, actor_id, operation, state, decision, reasons, usage, policy_version, feed_version)
  values (v_trace, p_organisation_id, p_actor_id, 'client_create', 'completed', 'ALLOW', '[]'::jsonb,
    v_usage, (v_op ->> 'policy_version')::int, (v_op ->> 'feed_version')::int);

  return jsonb_build_object('client_id', v_id, 'version', 1, 'replayed', false,
    'trace_id', v_trace);
end;
$$;

create or replace function public.update_client(
  p_organisation_id uuid,
  p_actor_id uuid,
  p_idempotency_key uuid,
  p_request_sha256 text,
  p_client_id uuid,
  p_expected_version int,
  p_changes jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
  v_op jsonb;
  v_trace uuid := gen_random_uuid();
  v_result jsonb;
  v_usage jsonb := '{"generation_input_tokens":0,"generation_output_tokens":0,"generation_ms":0,
    "semantic_input_tokens":0,"semantic_ms":0,"reserved_generation_tokens":0,
    "unresolved_reservation":false,"comparison_micro_usd":0,"comparison_rate_version":"none"}'::jsonb;
begin
  if p_organisation_id is null or p_actor_id is null or p_idempotency_key is null or p_client_id is null
     or p_expected_version is null or p_expected_version < 1 or p_expected_version >= 2147483647
     or not coalesce(p_request_sha256 ~ '^[0-9a-f]{64}$', false) then
    raise exception 'INVALID_INPUT' using detail = 'update_client: missing or invalid argument';
  end if;
  perform public.validate_client_fields(p_changes, array['annual_fee_usd', 'status', 'sector', 'notes']);

  perform 1 from public.memberships m
  where m.organisation_id = p_organisation_id and m.actor_id = p_actor_id
    and m.active and m.role in ('admin', 'analyst')
  for share;
  if not found then raise exception 'ACCESS_DENIED' using detail = 'no active admin or analyst membership'; end if;

  select * into v_client from public.clients c
  where c.organisation_id = p_organisation_id and c.id = p_client_id for update;
  if not found then raise exception 'NOT_FOUND' using detail = 'client not found'; end if;

  v_op := public.begin_operation(p_organisation_id, p_actor_id, 'client_update',
    p_idempotency_key, p_request_sha256, v_trace, null);
  -- Replay precedes the CAS: a committed retry returns its original version even after later updates.
  if (v_op ->> 'replay')::boolean then
    select jsonb_build_object('client_id', a.payload -> 'client_id', 'version', a.payload -> 'version',
      'replayed', true, 'trace_id', a.trace_id)
    into v_result from public.audit_events a
    where a.organisation_id = p_organisation_id and a.operation_id = (v_op ->> 'operation_id')::uuid
      and a.event_type = 'decision' and a.payload ->> 'decision' = 'ALLOW'
      and a.payload ->> 'client_id' = p_client_id::text;
    if v_result is null then
      raise exception 'CONFLICT' using detail = 'idempotency key belongs to a request that was not allowed';
    end if;
    return v_result;
  end if;
  if v_client.version <> p_expected_version then
    raise exception 'CONFLICT' using detail = 'client version changed';
  end if;

  update public.clients c set
    annual_fee_usd = case when p_changes ? 'annual_fee_usd'
      then (p_changes ->> 'annual_fee_usd')::numeric::int else c.annual_fee_usd end,
    status = case when p_changes ? 'status' then p_changes ->> 'status' else c.status end,
    sector = case when p_changes ? 'sector' then p_changes ->> 'sector' else c.sector end,
    notes = case when p_changes ? 'notes' then p_changes ->> 'notes' else c.notes end,
    version = c.version + 1
  where c.organisation_id = p_organisation_id and c.id = p_client_id;
  update public.operations set state = 'completed' where id = (v_op ->> 'operation_id')::uuid;

  insert into public.audit_events (organisation_id, trace_id, operation_id, actor_id, event_type, payload)
  values (p_organisation_id, v_trace, (v_op ->> 'operation_id')::uuid, p_actor_id, 'decision',
    jsonb_build_object('stage', 'client_update', 'decision', 'ALLOW', 'reasons', '[]'::jsonb,
      'client_id', p_client_id, 'version', v_client.version + 1,
      'fields', (select jsonb_agg(k order by k) from jsonb_object_keys(p_changes) k),
      'usage', v_usage, 'policy_version', v_op -> 'policy_version', 'feed_version', v_op -> 'feed_version'));
  insert into public.actor_activity
    (trace_id, organisation_id, actor_id, operation, state, decision, reasons, usage, policy_version, feed_version)
  values (v_trace, p_organisation_id, p_actor_id, 'client_update', 'completed', 'ALLOW', '[]'::jsonb,
    v_usage, (v_op ->> 'policy_version')::int, (v_op ->> 'feed_version')::int);

  return jsonb_build_object('client_id', p_client_id, 'version', v_client.version + 1,
    'replayed', false, 'trace_id', v_trace);
end;
$$;

commit;
