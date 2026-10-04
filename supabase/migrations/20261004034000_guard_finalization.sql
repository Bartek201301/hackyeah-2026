-- Standalone MCP/Claude guard completion. Apply only after command-center review.
-- A model call has a durable begin_operation intent and atomic reservations before this RPC.
begin;

create function public.finalize_guard_check(
  p_operation_id uuid,
  p_organisation_id uuid,
  p_actor_id uuid,
  p_token_id uuid,
  p_scope text,
  p_decision text,
  p_reasons jsonb,
  p_usage jsonb,
  p_payload jsonb,
  p_unknown boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_op public.operations%rowtype;
  v_head public.control_heads%rowtype;
  v_trace uuid;
  v_decision text := p_decision;
  v_reasons jsonb := p_reasons;
  v_state text;
begin
  if p_operation_id is null or p_organisation_id is null or p_actor_id is null or p_token_id is null
     or coalesce(p_scope, '') not in ('excerpt:search', 'excerpt:read', 'guard:prompt', 'guard:tool')
     or p_decision is null or p_decision not in ('ALLOW', 'BLOCK', 'REVIEW')
     or jsonb_typeof(p_reasons) is distinct from 'array'
     or jsonb_typeof(p_usage) is distinct from 'object'
     or jsonb_typeof(p_payload) is distinct from 'object'
     or pg_catalog.octet_length(p_payload::text) > 4000 then
    raise exception 'INVALID_INPUT' using detail = 'invalid guard result';
  end if;
  if jsonb_array_length(p_reasons) > 20 or exists (
    select 1 from jsonb_array_elements(p_reasons) e
    where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and 80
  ) or not coalesce(jsonb_typeof(p_payload -> 'stage') = 'string'
      and char_length(p_payload ->> 'stage') between 1 and 40, false) then
    raise exception 'INVALID_INPUT' using detail = 'invalid guard projection';
  end if;

  select * into v_op from public.operations o
  where o.id = p_operation_id and o.organisation_id = p_organisation_id
    and o.actor_id = p_actor_id and o.run_id is null
    and o.operation in ('mcp_input', 'mcp_output', 'claude_prompt', 'claude_tool')
  for update;
  if not found then raise exception 'NOT_FOUND' using detail = 'guard operation unavailable'; end if;
  select a.trace_id into v_trace from public.audit_events a
  where a.organisation_id = p_organisation_id and a.operation_id = v_op.id
    and a.event_type = 'intent';
  if v_trace is null then raise exception 'STATE_UNAVAILABLE' using detail = 'intent unavailable'; end if;
  if v_op.state not in ('intent', 'started') then
    raise exception 'CONFLICT' using detail = 'guard operation already final';
  end if;

  select * into v_head from public.control_heads h where h.organisation_id = p_organisation_id;
  if not found or v_head.policy_version <> v_op.policy_version or v_head.feed_version <> v_op.feed_version then
    v_decision := 'BLOCK';
    v_reasons := '["policy:changed"]'::jsonb;
  end if;
  if not exists (
    select 1 from public.memberships m join public.access_tokens t
      on t.organisation_id = m.organisation_id and t.actor_id = m.actor_id
    where m.organisation_id = p_organisation_id and m.actor_id = p_actor_id and m.active
      and t.id = p_token_id and t.audience = 'public' and t.revoked_at is null
      and t.expires_at > now() and p_scope = any(t.scopes)
  ) then
    v_decision := 'BLOCK';
    v_reasons := '["credential:changed"]'::jsonb;
  end if;
  if p_unknown then
    v_decision := 'BLOCK';
    v_reasons := '["assessment:incomplete"]'::jsonb;
  end if;
  v_state := case when p_unknown then 'unknown'
    when v_decision = 'ALLOW' then 'completed' else 'denied' end;
  update public.operations set state = v_state::public.operation_state where id = v_op.id;
  insert into public.audit_events
    (organisation_id, trace_id, operation_id, actor_id, event_type, payload)
  values (p_organisation_id, v_trace, v_op.id, p_actor_id, 'decision',
    p_payload || jsonb_build_object('decision', v_decision, 'reasons', v_reasons,
      'usage', p_usage, 'policy_version', v_op.policy_version, 'feed_version', v_op.feed_version));
  insert into public.actor_activity
    (trace_id, organisation_id, actor_id, operation, state, decision, reasons, usage,
      policy_version, feed_version)
  values (v_trace, p_organisation_id, p_actor_id, v_op.operation,
    case when p_unknown then 'incomplete' when v_decision = 'ALLOW' then 'completed' else 'blocked' end,
    v_decision, v_reasons, p_usage, v_op.policy_version, v_op.feed_version);
  return jsonb_build_object('trace_id', v_trace, 'decision', v_decision,
    'reasons', v_reasons, 'policy_version', v_op.policy_version,
    'feed_version', v_op.feed_version);
end;
$$;

revoke execute on function public.finalize_guard_check(uuid, uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.finalize_guard_check(uuid, uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, boolean)
  to service_role;

commit;
