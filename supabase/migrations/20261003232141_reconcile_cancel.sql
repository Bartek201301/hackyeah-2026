-- Conservative reconciliation and run cancellation (migration G): reservation_state 'charged',
-- reconcile_reservation and cancel_run. Source of truth: docs/contracts/data-model.md "Atomic RPC
-- responsibilities" (last paragraph), technical-spec §8/§9 and protocols.md run_cancel. Same conventions as
-- migrations B/C/E/F: security invoker with an empty search_path, execute for service_role only, errors raise
-- an OpenAPI ErrorCode as the message and a content-free detail. No table changes.
-- Applied once by the integrator after review; record the result in supabase/APPLIED.md. Never edit after apply.

begin;

-- Counted as spent, actual unknown. Never measured usage. Function bodies resolve it at runtime, so it is
-- not used inside this transaction.
alter type public.reservation_state add value if not exists 'charged';

-- An admin charges a call's unresolved reservations at the full reserved amount, with a reason. Usage stays
-- unknown (actual null). There is no release: without a bridge ledger nothing proves a call never started.
-- Locks follow finish_call: the call's reservations by id, then its buckets by (scope_kind, unit).
create function public.reconcile_reservation(
  p_organisation_id uuid,
  p_admin_actor_id uuid,
  p_call_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_res record;
  v_charged int := 0;
  v_op public.operations%rowtype;
  v_trace uuid;
  v_units jsonb;
begin
  if p_organisation_id is null or p_admin_actor_id is null or p_call_id is null
     or char_length(btrim(coalesce(p_reason, ''))) not between 10 and 200 then
    raise exception 'INVALID_INPUT' using detail = 'reconcile_reservation: call id and a 10-200 char reason are required';
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.organisation_id = p_organisation_id and m.actor_id = p_admin_actor_id and m.active
      and m.role = 'admin'
  ) then
    raise exception 'ACCESS_DENIED' using detail = 'no active admin membership';
  end if;

  perform 1 from public.reservations r
  where r.organisation_id = p_organisation_id and r.call_id = p_call_id
  order by r.id
  for update;

  perform 1 from public.budget_buckets b
  where b.id in (
    select r.bucket_id from public.reservations r
    where r.organisation_id = p_organisation_id and r.call_id = p_call_id
  )
  order by b.scope_kind, b.unit
  for update;

  for v_res in
    select r.id, r.bucket_id, r.amount
    from public.reservations r
    where r.organisation_id = p_organisation_id and r.call_id = p_call_id and r.state = 'unresolved'
    order by r.id
  loop
    update public.budget_buckets
    set reserved = reserved - v_res.amount, spent = spent + v_res.amount
    where id = v_res.bucket_id;
    update public.reservations set state = 'charged' where id = v_res.id;
    v_charged := v_charged + 1;
  end loop;

  if v_charged = 0 then
    raise exception 'NOT_FOUND' using detail = 'no unresolved reservations for call';
  end if;

  select o.* into strict v_op
  from public.operations o
  where o.id = (select r.operation_id from public.reservations r where r.call_id = p_call_id limit 1);
  select a.trace_id into strict v_trace
  from public.audit_events a
  where a.organisation_id = v_op.organisation_id and a.operation_id = v_op.id and a.event_type = 'intent';
  select jsonb_agg(distinct jsonb_build_object('unit', r.unit, 'amount', r.amount)) into v_units
  from public.reservations r
  where r.call_id = p_call_id and r.state = 'charged';

  -- Admin-only audit (no browser grant on audit_events); the actor's own projection is unchanged.
  insert into public.audit_events (organisation_id, trace_id, operation_id, actor_id, event_type, payload)
  values (p_organisation_id, v_trace, v_op.id, p_admin_actor_id, 'configuration',
    jsonb_build_object('action', 'reconcile_charge', 'call_id', p_call_id, 'units', v_units,
      'reason_code', 'reconcile:charged_conservatively', 'reason', btrim(p_reason)));

  return jsonb_build_object('charged', v_charged);
end;
$$;

-- The owner cancels a run. pending → cancelled with the stored 409 result, its decision event and the
-- actor_activity row; running → cancel_requested, and the running execute finalizes it before its next
-- provider call. Any other state is returned unchanged with accepted=false and records nothing. The
-- operation key makes it idempotent: a replay returns the run's current state with accepted=true.
create function public.cancel_run(
  p_organisation_id uuid,
  p_actor_id uuid,
  p_run_id uuid,
  p_idempotency_key uuid,
  p_request_sha256 text,
  p_result jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.runs%rowtype;
  v_op public.operations%rowtype;
  v_op_id uuid;
  v_root text;
  v_accepted boolean := true;
  v_replay boolean := false;
begin
  if p_organisation_id is null or p_actor_id is null or p_run_id is null or p_idempotency_key is null
     or coalesce(btrim(p_request_sha256), '') = '' or jsonb_typeof(p_result) is distinct from 'object' then
    raise exception 'INVALID_INPUT' using detail = 'cancel_run: missing required argument';
  end if;
  -- Separate statement so the field checks only run on an object.
  if jsonb_typeof(p_result -> 'usage') is distinct from 'object'
     or jsonb_typeof(p_result -> 'semantic') is distinct from 'object' then
    raise exception 'INVALID_INPUT' using detail = 'cancel_run: result needs usage and semantic objects';
  end if;

  -- Own run only; the lock serializes concurrent cancels, claims and finalizes of this run.
  select * into v_run from public.runs r
  where r.id = p_run_id and r.organisation_id = p_organisation_id and r.actor_id = p_actor_id
  for no key update;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'run not found';
  end if;

  select * into v_op from public.operations o
  where o.organisation_id = p_organisation_id and o.actor_id = p_actor_id
    and o.operation = 'run_cancel' and o.idempotency_key = p_idempotency_key;
  if found then
    if v_op.request_sha256 <> p_request_sha256 or v_op.run_id is distinct from v_run.id then
      raise exception 'CONFLICT' using detail = 'idempotency key reused with a different request';
    end if;
    v_replay := true;
  elsif v_run.state not in ('pending', 'running') then
    v_accepted := false;
  else
    v_op_id := (public.begin_operation(p_organisation_id, p_actor_id, 'run_cancel', p_idempotency_key,
      p_request_sha256, v_run.id, v_run.id) ->> 'operation_id')::uuid;
    update public.operations set state = 'completed' where id = v_op_id;

    if v_run.state = 'pending' then
      update public.runs
      set state = 'cancelled', stage = 'cancelled', result_private = p_result, cancel_requested_at = now()
      where id = v_run.id
      returning * into v_run;

      insert into public.audit_events (organisation_id, trace_id, operation_id, actor_id, event_type, payload)
      values (v_run.organisation_id, v_run.id, v_op_id, p_actor_id, 'decision',
        jsonb_build_object('stage', 'cancelled', 'decision', null, 'reasons', '[]'::jsonb,
          'findings', '[]'::jsonb, 'semantic', p_result -> 'semantic', 'usage', p_result -> 'usage'));

      -- The projection names the run's starting operation, as finalize_run does.
      select o.operation into v_root from public.operations o
      where o.organisation_id = v_run.organisation_id and o.run_id = v_run.id
      order by o.created_at, o.id
      limit 1;
      insert into public.actor_activity
        (trace_id, organisation_id, actor_id, operation, state, decision, reasons, usage, policy_version, feed_version)
      values
        (v_run.id, v_run.organisation_id, v_run.actor_id, coalesce(v_root, 'run_cancel'), 'cancelled', null,
         '[]'::jsonb, p_result -> 'usage', v_run.policy_version, v_run.feed_version);
    else
      update public.runs
      set state = 'cancel_requested', cancel_requested_at = now()
      where id = v_run.id
      returning * into v_run;
    end if;
  end if;

  return jsonb_build_object('run_id', v_run.id, 'kind', v_run.kind, 'state', v_run.state, 'stage', v_run.stage,
    'policy_version', v_run.policy_version, 'feed_version', v_run.feed_version,
    'accepted', v_accepted, 'replay', v_replay);
end;
$$;

-- Execute for the gateway server only; Supabase default privileges would otherwise grant anon/authenticated.

revoke execute on function public.reconcile_reservation(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reconcile_reservation(uuid, uuid, uuid, text) to service_role;

revoke execute on function public.cancel_run(uuid, uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.cancel_run(uuid, uuid, uuid, uuid, text, jsonb) to service_role;

commit;
