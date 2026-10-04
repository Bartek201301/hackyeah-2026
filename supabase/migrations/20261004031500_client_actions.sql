-- Client actions (migration L): the clients table, create_client, update_client and record_client_review.
-- Additive; no existing table, function or policy changes. Same conventions as migrations B/C/E/F/K:
-- security invoker with an empty search_path, execute for service_role only, errors raise an OpenAPI
-- ErrorCode as the message and a content-free detail. Role is read from trusted memberships; the gateway
-- applies the per-role rules first and this is the last line. A write and its ALLOW audit commit together.
-- Audit payloads carry ids, changed field names and versions only — never names, notes or amounts.
-- Applied once by the integrator after review; record the result in supabase/APPLIED.md. Never edit after apply.

begin;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  name text not null check (char_length(name) between 1 and 120 and btrim(name) <> ''),
  sector text check (char_length(sector) <= 60),
  notes text check (char_length(notes) <= 500),
  annual_fee_usd integer check (annual_fee_usd >= 0),
  status text not null default 'active' check (status in ('prospect', 'active', 'paused')),
  version int not null default 1 check (version >= 1),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id, created_by) references public.memberships (organisation_id, actor_id)
);

alter table public.clients enable row level security;
revoke all on public.clients from anon, authenticated;

-- Shared field validation: an object with only p_allowed keys, each within the table limits. Raises
-- INVALID_INPUT instead of letting a check or cast error reach the caller.
create function public.validate_client_fields(p_fields jsonb, p_allowed text[])
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_fee_type text;
  v_fee numeric;
begin
  if jsonb_typeof(p_fields) is distinct from 'object' or p_fields = '{}'::jsonb
     or exists (select 1 from jsonb_object_keys(p_fields) k where not (k = any (p_allowed))) then
    raise exception 'INVALID_INPUT' using detail = 'client fields: not an object or an unknown field';
  end if;
  if (p_fields ? 'name' and not (jsonb_typeof(p_fields -> 'name') = 'string'
        and btrim(p_fields ->> 'name') <> '' and char_length(p_fields ->> 'name') <= 120))
     or coalesce(jsonb_typeof(p_fields -> 'sector') not in ('null', 'string')
        or char_length(p_fields ->> 'sector') > 60, false)
     or coalesce(jsonb_typeof(p_fields -> 'notes') not in ('null', 'string')
        or char_length(p_fields ->> 'notes') > 500, false)
     or coalesce(jsonb_typeof(p_fields -> 'status') <> 'string'
        or p_fields ->> 'status' not in ('prospect', 'active', 'paused'), false) then
    raise exception 'INVALID_INPUT' using detail = 'client fields: a value is outside its limits';
  end if;
  -- Separate statements so the numeric cast only runs on a JSON number.
  v_fee_type := jsonb_typeof(p_fields -> 'annual_fee_usd');
  if v_fee_type = 'number' then
    v_fee := (p_fields ->> 'annual_fee_usd')::numeric;
    if v_fee <> trunc(v_fee) or v_fee < 0 or v_fee > 2147483647 then
      raise exception 'INVALID_INPUT' using detail = 'client fields: annual_fee_usd is not a whole amount';
    end if;
  elsif v_fee_type is not null and v_fee_type <> 'null' then
    raise exception 'INVALID_INPUT' using detail = 'client fields: annual_fee_usd is not a number';
  end if;
end;
$$;

create function public.create_client(
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

-- Only annual_fee_usd, status, sector and notes change; the name is fixed after creation. Compare-and-set
-- on version: a stale expected_version conflicts, a success bumps the version by one.
create function public.update_client(
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

-- A held client action (REVIEW): record_access_decision accepts only ALLOW/BLOCK, so this records the
-- REVIEW with the same operation/intent/decision/activity shape and writes nothing else. The payload is
-- built here from typed ids and field names, so free text cannot reach the audit. Same key and hash
-- return the first trace; a key first used for a different decision conflicts.
create function public.record_client_review(
  p_organisation_id uuid,
  p_actor_id uuid,
  p_operation text,
  p_idempotency_key uuid,
  p_request_sha256 text,
  p_reasons jsonb,
  p_client_id uuid default null,
  p_fields text[] default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_op jsonb;
  v_trace uuid := gen_random_uuid();
  v_usage jsonb := '{"generation_input_tokens":0,"generation_output_tokens":0,"generation_ms":0,
    "semantic_input_tokens":0,"semantic_ms":0,"reserved_generation_tokens":0,
    "unresolved_reservation":false,"comparison_micro_usd":0,"comparison_rate_version":"none"}'::jsonb;
begin
  if p_idempotency_key is null
     or p_operation is null or p_operation not in ('client_create', 'client_update', 'client_delete')
     or not coalesce(p_request_sha256 ~ '^[0-9a-f]{64}$', false)
     or jsonb_typeof(p_reasons) is distinct from 'array'
     or not coalesce(p_fields <@ array['name', 'sector', 'notes', 'annual_fee_usd', 'status'], true) then
    raise exception 'INVALID_INPUT' using detail = 'record_client_review: missing or invalid argument';
  end if;
  -- Separate statement so the element checks only run on an array.
  if jsonb_array_length(p_reasons) not between 1 and 20 or exists (
    select 1 from jsonb_array_elements(p_reasons) e
    where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and 80
  ) then
    raise exception 'INVALID_INPUT' using detail = 'record_client_review: reasons do not match the projection';
  end if;

  v_op := public.begin_operation(p_organisation_id, p_actor_id, p_operation,
    p_idempotency_key, p_request_sha256, v_trace, null);

  if (v_op ->> 'replay')::boolean then
    select a.trace_id into v_trace from public.audit_events a
    where a.organisation_id = p_organisation_id and a.operation_id = (v_op ->> 'operation_id')::uuid
      and a.event_type = 'decision' and a.payload ->> 'decision' = 'REVIEW';
    if not found then
      raise exception 'CONFLICT' using detail = 'idempotency key belongs to a different decision';
    end if;
  else
    update public.operations set state = 'denied' where id = (v_op ->> 'operation_id')::uuid;

    insert into public.audit_events (organisation_id, trace_id, operation_id, actor_id, event_type, payload)
    values (p_organisation_id, v_trace, (v_op ->> 'operation_id')::uuid, p_actor_id, 'decision',
      jsonb_strip_nulls(jsonb_build_object('stage', p_operation, 'decision', 'REVIEW', 'reasons', p_reasons,
        'client_id', p_client_id, 'fields', to_jsonb(p_fields), 'usage', v_usage,
        'policy_version', v_op -> 'policy_version', 'feed_version', v_op -> 'feed_version')));

    insert into public.actor_activity
      (trace_id, organisation_id, actor_id, operation, state, decision, reasons, usage, policy_version, feed_version)
    values (v_trace, p_organisation_id, p_actor_id, p_operation, 'review', 'REVIEW', p_reasons, v_usage,
      (v_op ->> 'policy_version')::int, (v_op ->> 'feed_version')::int);
  end if;

  return jsonb_build_object('trace_id', v_trace,
    'policy_version', (v_op ->> 'policy_version')::int, 'feed_version', (v_op ->> 'feed_version')::int);
end;
$$;

-- Execute for the gateway server only; Supabase default privileges would otherwise grant anon/authenticated.

revoke execute on function public.validate_client_fields(jsonb, text[]) from public, anon, authenticated;
grant execute on function public.validate_client_fields(jsonb, text[]) to service_role;

revoke execute on function public.create_client(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_client(uuid, uuid, uuid, text, jsonb) to service_role;

revoke execute on function public.update_client(uuid, uuid, uuid, text, uuid, int, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_client(uuid, uuid, uuid, text, uuid, int, jsonb) to service_role;

revoke execute on function public.record_client_review(uuid, uuid, text, uuid, text, jsonb, uuid, text[])
  from public, anon, authenticated;
grant execute on function public.record_client_review(uuid, uuid, text, uuid, text, jsonb, uuid, text[])
  to service_role;

commit;
