-- Run RPCs (migration C): start_run, finalize_run.
-- Source of truth: docs/contracts/data-model.md "Atomic RPC responsibilities" and technical-spec §9.
-- Same conventions as migration B: security invoker with an empty search_path, execute for service_role
-- only, errors raise an OpenAPI ErrorCode as the message and a content-free detail. No table changes.
-- Applied once by the integrator after review; record the result in supabase/APPLIED.md. Never edit after apply.

begin;

-- Durable intent plus a queued run in one transaction. The run id is the root trace id. A replay returns
-- the prior run; a changed request or a different run kind conflicts. Creating the run completes the
-- starting operation.
create function public.start_run(
  p_organisation_id uuid,
  p_actor_id uuid,
  p_operation text,
  p_kind public.run_kind,
  p_idempotency_key uuid,
  p_request_sha256 text,
  p_trace_id uuid,
  p_input_private jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_op jsonb;
  v_run public.runs%rowtype;
begin
  if p_kind is null or p_trace_id is null or jsonb_typeof(p_input_private) is distinct from 'object' then
    raise exception 'INVALID_INPUT' using detail = 'start_run: kind, trace id and an input object are required';
  end if;

  v_op := public.begin_operation(p_organisation_id, p_actor_id, p_operation, p_idempotency_key,
    p_request_sha256, p_trace_id, null);

  if (v_op ->> 'replay')::boolean then
    select r.* into v_run
    from public.operations o
    join public.runs r on r.organisation_id = o.organisation_id and r.id = o.run_id
    where o.id = (v_op ->> 'operation_id')::uuid;
    if not found then
      raise exception 'CONFLICT' using detail = 'operation has no run';
    end if;
    if v_run.kind <> p_kind then
      raise exception 'CONFLICT' using detail = 'idempotency key reused for another run kind';
    end if;
  else
    insert into public.runs
      (id, organisation_id, actor_id, kind, stage, policy_version, feed_version, input_private)
    values
      (p_trace_id, p_organisation_id, p_actor_id, p_kind, 'queued',
       (v_op ->> 'policy_version')::int, (v_op ->> 'feed_version')::int, p_input_private)
    returning * into v_run;

    update public.operations set run_id = v_run.id, state = 'completed'
    where id = (v_op ->> 'operation_id')::uuid;
  end if;

  return jsonb_build_object('run_id', v_run.id, 'kind', v_run.kind, 'state', v_run.state, 'stage', v_run.stage,
    'replay', (v_op ->> 'replay')::boolean, 'operation_id', v_op -> 'operation_id',
    'policy_version', v_run.policy_version, 'feed_version', v_run.feed_version);
end;
$$;

-- Settles a run exactly once under its lease: terminal run and operation state, the decision (or
-- incomplete) event and the sanitized actor_activity projection, atomically. Versions in the projection
-- come from the operation row, never from the caller. A run that is no longer running returns
-- finalized=false and writes nothing.
create function public.finalize_run(
  p_run_id uuid,
  p_lease_token uuid,
  p_operation_id uuid,
  p_outcome jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.runs%rowtype;
  v_op public.operations%rowtype;
  v_decision text;
begin
  if p_run_id is null or p_lease_token is null or p_operation_id is null
     or jsonb_typeof(p_outcome) is distinct from 'object' then
    raise exception 'INVALID_INPUT' using detail = 'finalize_run: missing required argument';
  end if;
  -- Separate statement so the field checks only run on an object.
  if not coalesce(p_outcome ->> 'run_state' in ('completed', 'review', 'blocked', 'failed', 'incomplete', 'cancelled')
         and jsonb_typeof(p_outcome -> 'run_state') = 'string', false)
     or not coalesce(p_outcome ->> 'operation_state' in ('completed', 'denied', 'unknown')
         and jsonb_typeof(p_outcome -> 'operation_state') = 'string', false)
     or not (coalesce(jsonb_typeof(p_outcome -> 'decision'), 'null') = 'null'
         or coalesce(jsonb_typeof(p_outcome -> 'decision') = 'string'
           and p_outcome ->> 'decision' in ('ALLOW', 'REDACT', 'REVIEW', 'BLOCK'), false))
     or jsonb_typeof(p_outcome -> 'reasons') is distinct from 'array'
     or jsonb_typeof(p_outcome -> 'usage') is distinct from 'object'
     or jsonb_typeof(p_outcome -> 'operation') is distinct from 'string'
     or char_length(p_outcome ->> 'operation') not between 1 and 60
     or jsonb_typeof(p_outcome -> 'stage') is distinct from 'string'
     or char_length(p_outcome ->> 'stage') not between 1 and 40
     or coalesce(jsonb_typeof(p_outcome -> 'result'), 'null') not in ('null', 'object')
     or jsonb_typeof(p_outcome -> 'event') is distinct from 'object' then
    raise exception 'INVALID_INPUT' using detail = 'finalize_run: outcome does not match the contract';
  end if;
  -- Reasons and usage are shown to the actor, so they must keep the AuditProjection shape: up to 20 short
  -- reason codes, and usage values that are scalars with strings of at most 60 chars. No free text.
  if jsonb_array_length(p_outcome -> 'reasons') > 20 or exists (
    select 1 from jsonb_array_elements(p_outcome -> 'reasons') e
    where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and 80
  ) or exists (
    select 1 from jsonb_each(p_outcome -> 'usage') u
    where jsonb_typeof(u.value) not in ('number', 'boolean', 'null', 'string')
       or (jsonb_typeof(u.value) = 'string' and char_length(u.value #>> '{}') > 60)
  ) then
    raise exception 'INVALID_INPUT' using detail = 'finalize_run: reasons or usage do not match the projection';
  end if;
  v_decision := p_outcome ->> 'decision';

  select * into v_run from public.runs r where r.id = p_run_id for no key update;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'run not found';
  end if;
  if v_run.state not in ('running', 'cancel_requested') then
    return jsonb_build_object('finalized', false, 'state', v_run.state);
  end if;
  if v_run.lease_token is distinct from p_lease_token then
    raise exception 'CONFLICT' using detail = 'lease not held';
  end if;

  select * into v_op from public.operations o
  where o.id = p_operation_id and o.organisation_id = v_run.organisation_id and o.run_id = v_run.id
  for no key update;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'operation not found for run';
  end if;
  if v_op.state not in ('intent', 'started') then
    raise exception 'CONFLICT' using detail = format('operation is %s', v_op.state);
  end if;

  update public.runs
  set state = (p_outcome ->> 'run_state')::public.run_state,
      stage = p_outcome ->> 'stage',
      result_private = nullif(p_outcome -> 'result', 'null'::jsonb),
      lease_token = null,
      lease_expires_at = null
  where id = v_run.id;

  update public.operations set state = (p_outcome ->> 'operation_state')::public.operation_state
  where id = v_op.id;

  insert into public.audit_events (organisation_id, trace_id, operation_id, actor_id, event_type, payload)
  values (v_run.organisation_id, v_run.id, v_op.id, v_run.actor_id,
    case when v_decision is null then 'incomplete' else 'decision' end::public.audit_event_type,
    p_outcome -> 'event');

  insert into public.actor_activity
    (trace_id, organisation_id, actor_id, operation, state, decision, reasons, usage, policy_version, feed_version)
  values
    (v_run.id, v_run.organisation_id, v_run.actor_id, p_outcome ->> 'operation', p_outcome ->> 'run_state',
     v_decision, p_outcome -> 'reasons', p_outcome -> 'usage', v_op.policy_version, v_op.feed_version);

  return jsonb_build_object('finalized', true, 'state', p_outcome ->> 'run_state');
end;
$$;

-- Execute for the gateway server only; Supabase default privileges would otherwise grant anon/authenticated.

revoke execute on function public.start_run(uuid, uuid, text, public.run_kind, uuid, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.start_run(uuid, uuid, text, public.run_kind, uuid, text, uuid, jsonb)
  to service_role;

revoke execute on function public.finalize_run(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_run(uuid, uuid, uuid, jsonb) to service_role;

commit;
