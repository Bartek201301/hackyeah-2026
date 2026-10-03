-- Operation and reservation RPCs (migration B): begin_operation, reserve_call, finish_call.
-- Source of truth: docs/contracts/data-model.md "Atomic RPC responsibilities" and technical-spec §8.
-- Security invoker with an empty search_path; execute is granted to service_role only (gateway server
-- code). Errors raise an OpenAPI ErrorCode as the message and a content-free detail. Bucket locks are
-- always taken ordered by (scope_kind, unit) to avoid deadlocks. No table changes.
-- Applied once by the integrator after review; record the result in supabase/APPLIED.md. Never edit after apply.

begin;

-- Durable intent with idempotency: a replay returns the prior operation, a changed request conflicts.
create function public.begin_operation(
  p_organisation_id uuid,
  p_actor_id uuid,
  p_operation text,
  p_idempotency_key uuid,
  p_request_sha256 text,
  p_trace_id uuid,
  p_run_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_head public.control_heads%rowtype;
  v_op public.operations%rowtype;
begin
  if p_organisation_id is null or p_actor_id is null or p_idempotency_key is null or p_trace_id is null
     or coalesce(btrim(p_operation), '') = '' or coalesce(btrim(p_request_sha256), '') = '' then
    raise exception 'INVALID_INPUT' using detail = 'begin_operation: missing required argument';
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.organisation_id = p_organisation_id and m.actor_id = p_actor_id and m.active
  ) then
    raise exception 'ACCESS_DENIED' using detail = 'no active membership';
  end if;

  select * into v_head from public.control_heads h where h.organisation_id = p_organisation_id;
  if not found then
    raise exception 'POLICY_UNAVAILABLE' using detail = 'no control head';
  end if;

  insert into public.operations
    (organisation_id, actor_id, run_id, operation, idempotency_key, request_sha256, policy_version, feed_version)
  values
    (p_organisation_id, p_actor_id, p_run_id, p_operation, p_idempotency_key, p_request_sha256,
     v_head.policy_version, v_head.feed_version)
  on conflict (organisation_id, actor_id, operation, idempotency_key) do nothing
  returning * into v_op;

  if not found then
    select * into strict v_op from public.operations o
    where o.organisation_id = p_organisation_id and o.actor_id = p_actor_id
      and o.operation = p_operation and o.idempotency_key = p_idempotency_key;
    if v_op.request_sha256 <> p_request_sha256 then
      raise exception 'CONFLICT' using detail = 'idempotency key reused with a different request';
    end if;
    return jsonb_build_object('operation_id', v_op.id, 'state', v_op.state, 'replay', true,
      'policy_version', v_op.policy_version, 'feed_version', v_op.feed_version);
  end if;

  insert into public.audit_events (organisation_id, trace_id, operation_id, actor_id, event_type, payload)
  values (p_organisation_id, p_trace_id, v_op.id, p_actor_id, 'intent',
    jsonb_build_object('operation', p_operation, 'request_sha256', p_request_sha256,
      'policy_version', v_op.policy_version, 'feed_version', v_op.feed_version));

  return jsonb_build_object('operation_id', v_op.id, 'state', v_op.state, 'replay', false,
    'policy_version', v_op.policy_version, 'feed_version', v_op.feed_version);
end;
$$;

-- Reserves actor and org allowance for one provider call, all units or nothing. Scopes come from the
-- operation; limits come from the policy the trusted caller loaded. A retried call id never reserves twice.
create function public.reserve_call(
  p_operation_id uuid,
  p_call_id uuid,
  p_provider text,
  p_period_start date,
  p_units jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_op public.operations%rowtype;
  v_bucket_ids uuid[];
  v_ids uuid[];
  v_other_operation boolean;
  v_over record;
  v_trace uuid;
begin
  if p_operation_id is null or p_call_id is null or p_period_start is null
     or coalesce(btrim(p_provider), '') = '' then
    raise exception 'INVALID_INPUT' using detail = 'reserve_call: missing required argument';
  end if;

  select * into v_op from public.operations o where o.id = p_operation_id for no key update;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'operation not found';
  end if;
  if v_op.state not in ('intent', 'started') then
    raise exception 'CONFLICT' using detail = format('operation is %s', v_op.state);
  end if;

  -- Separate statements so the element checks never run on a non-array.
  if jsonb_typeof(p_units) is distinct from 'array' or jsonb_array_length(p_units) = 0 then
    raise exception 'INVALID_INPUT' using detail = 'units must be a non-empty array';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_units) e
    cross join unnest(array['amount', 'actor_limit', 'org_limit']) k
    cross join lateral (
      select case when jsonb_typeof(e -> k) = 'number' and e ->> k ~ '^[0-9]+$' then (e ->> k)::numeric end as v
    ) n
    where jsonb_typeof(e) <> 'object'
       or not coalesce(e ->> 'unit' = any (enum_range(null::public.budget_unit)::text[]), false)
       or n.v is null or n.v > 9223372036854775807
  ) or (select count(distinct e ->> 'unit') <> count(*) from jsonb_array_elements(p_units) e) then
    raise exception 'INVALID_INPUT'
      using detail = 'each unit needs a valid budget unit, integer amount and limits >= 0, and appears once';
  end if;

  -- Create missing buckets in lock order, then lock all of them in the same order.
  insert into public.budget_buckets (organisation_id, scope_kind, scope_id, period_start, unit)
  select v_op.organisation_id, s.kind, s.id, p_period_start, u.unit
  from jsonb_to_recordset(p_units) as u(unit public.budget_unit)
  cross join (values ('actor'::public.budget_scope, v_op.actor_id), ('org', v_op.organisation_id)) s(kind, id)
  order by s.kind, u.unit
  on conflict (organisation_id, scope_kind, scope_id, unit, period_start) do nothing;

  select array_agg(locked.id) into v_bucket_ids
  from (
    select b.id
    from public.budget_buckets b
    where b.organisation_id = v_op.organisation_id
      and b.period_start = p_period_start
      and ((b.scope_kind = 'actor' and b.scope_id = v_op.actor_id)
        or (b.scope_kind = 'org' and b.scope_id = v_op.organisation_id))
      and b.unit in (select u.unit from jsonb_to_recordset(p_units) as u(unit public.budget_unit))
    order by b.scope_kind, b.unit
    for update
  ) locked;

  -- Under the locks a concurrent retry of this call id has either committed or not started.
  select array_agg(r.id order by r.id), bool_or(r.operation_id <> p_operation_id)
  into v_ids, v_other_operation
  from public.reservations r
  where r.call_id = p_call_id;
  if v_other_operation then
    raise exception 'CONFLICT' using detail = 'call id belongs to another operation';
  end if;
  if v_ids is not null then
    return jsonb_build_object('reservation_ids', to_jsonb(v_ids), 'replay', true);
  end if;

  select b.scope_kind, b.unit into v_over
  from public.budget_buckets b
  join jsonb_to_recordset(p_units) as u(unit public.budget_unit, amount bigint, actor_limit bigint, org_limit bigint)
    on u.unit = b.unit
  where b.id = any (v_bucket_ids)
    and b.spent::numeric + b.reserved + u.amount
      > case b.scope_kind when 'actor' then u.actor_limit else u.org_limit end
  order by b.scope_kind, b.unit
  limit 1;
  if found then
    raise exception 'BUDGET_EXHAUSTED' using detail = format('%s %s budget exhausted', v_over.scope_kind, v_over.unit);
  end if;

  update public.budget_buckets b
  set reserved = b.reserved + u.amount
  from jsonb_to_recordset(p_units) as u(unit public.budget_unit, amount bigint)
  where b.id = any (v_bucket_ids) and b.unit = u.unit;

  with inserted as (
    insert into public.reservations (organisation_id, operation_id, call_id, bucket_id, unit, amount, provider)
    select b.organisation_id, p_operation_id, p_call_id, b.id, b.unit, u.amount, p_provider
    from public.budget_buckets b
    join jsonb_to_recordset(p_units) as u(unit public.budget_unit, amount bigint) on u.unit = b.unit
    where b.id = any (v_bucket_ids)
    returning id
  )
  select array_agg(id order by id) into v_ids from inserted;

  select a.trace_id into strict v_trace
  from public.audit_events a
  where a.organisation_id = v_op.organisation_id and a.operation_id = p_operation_id and a.event_type = 'intent';

  insert into public.audit_events (organisation_id, trace_id, operation_id, actor_id, event_type, payload)
  select v_op.organisation_id, v_trace, p_operation_id, v_op.actor_id, 'provider_started',
    jsonb_build_object('call_id', p_call_id, 'provider', p_provider, 'units', jsonb_agg(jsonb_build_object(
      'unit', u.unit, 'amount', u.amount, 'actor_limit', u.actor_limit, 'org_limit', u.org_limit) order by u.unit))
  from jsonb_to_recordset(p_units) as u(unit public.budget_unit, amount bigint, actor_limit bigint, org_limit bigint);

  update public.operations set state = 'started' where id = p_operation_id and state = 'intent';

  return jsonb_build_object('reservation_ids', to_jsonb(v_ids), 'replay', false);
end;
$$;

-- Settles a call's reservations exactly once in their original buckets. A known actual moves the reserved
-- amount to the full actual spend (overrun recorded, never capped); an unknown actual keeps it reserved
-- as unresolved until a later call settles it. Operation state is left to finalize_run (T03).
create function public.finish_call(p_call_id uuid, p_actuals jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_res record;
  v_settled int := 0;
  v_unresolved int := 0;
  v_overrun boolean := false;
  v_op public.operations%rowtype;
  v_trace uuid;
begin
  if p_call_id is null or jsonb_typeof(p_actuals) is distinct from 'array' then
    raise exception 'INVALID_INPUT' using detail = 'finish_call: call id and an actuals array are required';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_actuals) e
    cross join lateral (
      select case when jsonb_typeof(e -> 'actual') = 'number' and e ->> 'actual' ~ '^[0-9]+$'
        then (e ->> 'actual')::numeric end as v
    ) n
    where jsonb_typeof(e) <> 'object'
       or not coalesce(e ->> 'unit' = any (enum_range(null::public.budget_unit)::text[]), false)
       or (coalesce(jsonb_typeof(e -> 'actual'), 'null') <> 'null' and (n.v is null or n.v > 9223372036854775807))
  ) or (select count(distinct e ->> 'unit') <> count(*) from jsonb_array_elements(p_actuals) e) then
    raise exception 'INVALID_INPUT'
      using detail = 'each actual needs a valid budget unit, an integer >= 0 or null, and appears once';
  end if;

  perform 1 from public.reservations r where r.call_id = p_call_id order by r.id for update;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'no reservations for call';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_actuals) as a(unit public.budget_unit)
    where not exists (select 1 from public.reservations r where r.call_id = p_call_id and r.unit = a.unit)
  ) then
    raise exception 'INVALID_INPUT' using detail = 'actual reported for a unit the call did not reserve';
  end if;

  perform 1 from public.budget_buckets b
  where b.id in (select r.bucket_id from public.reservations r where r.call_id = p_call_id)
  order by b.scope_kind, b.unit
  for update;

  for v_res in
    select r.id, r.bucket_id, r.amount, a.actual
    from public.reservations r
    left join jsonb_to_recordset(p_actuals) as a(unit public.budget_unit, actual bigint) on a.unit = r.unit
    where r.call_id = p_call_id and r.state in ('reserved', 'unresolved')
    order by r.id
  loop
    if v_res.actual is null then
      update public.reservations set state = 'unresolved' where id = v_res.id;
      v_unresolved := v_unresolved + 1;
    else
      update public.budget_buckets
      set reserved = reserved - v_res.amount, spent = spent + v_res.actual
      where id = v_res.bucket_id;
      update public.reservations set state = 'settled', actual = v_res.actual where id = v_res.id;
      v_settled := v_settled + 1;
      v_overrun := v_overrun or v_res.actual > v_res.amount;
    end if;
  end loop;

  -- A duplicate finish of an already settled call changes nothing and records nothing.
  if v_settled + v_unresolved > 0 then
    select o.* into strict v_op
    from public.operations o
    where o.id = (select r.operation_id from public.reservations r where r.call_id = p_call_id limit 1);
    select a.trace_id into strict v_trace
    from public.audit_events a
    where a.organisation_id = v_op.organisation_id and a.operation_id = v_op.id and a.event_type = 'intent';

    insert into public.audit_events (organisation_id, trace_id, operation_id, actor_id, event_type, payload)
    select v_op.organisation_id, v_trace, v_op.id, v_op.actor_id, 'completion',
      jsonb_build_object('call_id', p_call_id, 'settled', v_settled, 'unresolved', v_unresolved,
        'overrun', v_overrun, 'usage', jsonb_agg(distinct jsonb_build_object(
          'unit', r.unit, 'reserved', r.amount, 'actual', r.actual, 'state', r.state)))
    from public.reservations r
    where r.call_id = p_call_id;
  end if;

  return jsonb_build_object('settled', v_settled, 'unresolved', v_unresolved, 'overrun', v_overrun);
end;
$$;

-- Execute for the gateway server only; Supabase default privileges would otherwise grant anon/authenticated.

revoke execute on function public.begin_operation(uuid, uuid, text, uuid, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_operation(uuid, uuid, text, uuid, text, uuid, uuid) to service_role;

revoke execute on function public.reserve_call(uuid, uuid, text, date, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_call(uuid, uuid, text, date, jsonb) to service_role;

revoke execute on function public.finish_call(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finish_call(uuid, jsonb) to service_role;

commit;
