-- T07 policy activation. Additive; no active policy or other shared data is changed by installation.
-- Full schema and business validation precede this service-only RPC in policy-update.ts.
-- Membership, CAS, immutable snapshot and durable audit remain atomic here.
begin;

create function public.update_policy(
  p_organisation_id uuid,
  p_actor_id uuid,
  p_idempotency_key uuid,
  p_expected_version int,
  p_document jsonb,
  p_request_sha256 text,
  p_document_sha256 text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_head public.control_heads%rowtype;
  v_op jsonb;
  v_trace uuid := gen_random_uuid();
  v_version int;
  v_result jsonb;
  v_usage jsonb := '{"generation_input_tokens":0,"generation_output_tokens":0,"generation_ms":0,
    "semantic_input_tokens":0,"semantic_ms":0,"reserved_generation_tokens":0,
    "unresolved_reservation":false,"comparison_micro_usd":0,"comparison_rate_version":"none"}'::jsonb;
begin
  if p_organisation_id is null or p_actor_id is null or p_idempotency_key is null
     or p_expected_version is null or p_expected_version < 1 or p_expected_version >= 2147483647
     or jsonb_typeof(p_document) is distinct from 'object'
     or not coalesce(p_request_sha256 ~ '^[0-9a-f]{64}$', false)
     or not coalesce(p_document_sha256 ~ '^[0-9a-f]{64}$', false) then
    raise exception 'INVALID_INPUT';
  end if;
  v_version := p_expected_version + 1;
  if p_document -> 'version' is distinct from to_jsonb(v_version) then
    raise exception 'INVALID_INPUT';
  end if;

  -- The role is read from server records, never from the browser or model. Keep it stable until commit.
  perform 1 from public.memberships m
  where m.organisation_id = p_organisation_id and m.actor_id = p_actor_id
    and m.active and m.role = 'admin'
  for share;
  if not found then raise exception 'ACCESS_DENIED'; end if;

  select * into v_head from public.control_heads h
  where h.organisation_id = p_organisation_id for update;
  if not found then raise exception 'POLICY_UNAVAILABLE'; end if;

  v_op := public.begin_operation(p_organisation_id, p_actor_id, 'policy_update',
    p_idempotency_key, p_request_sha256, v_trace, null);
  -- Replay precedes the CAS: a committed retry returns its original version even after later updates.
  if (v_op ->> 'replay')::boolean then
    select jsonb_build_object('trace_id', a.trace_id,
      'policy_version', a.payload -> 'policy_version', 'feed_version', a.payload -> 'feed_version')
    into v_result from public.audit_events a
    where a.organisation_id = p_organisation_id and a.operation_id = (v_op ->> 'operation_id')::uuid
      and a.event_type = 'configuration';
    if v_result is null then raise exception 'STATE_UNAVAILABLE'; end if;
    return v_result;
  end if;
  if v_head.policy_version <> p_expected_version then raise exception 'CONFLICT'; end if;

  insert into public.policy_versions (organisation_id, version, document, sha256, created_by)
  values (p_organisation_id, v_version, p_document, p_document_sha256, p_actor_id);
  update public.control_heads set policy_version = v_version, revision = revision + 1
  where organisation_id = p_organisation_id;
  update public.operations set state = 'completed' where id = (v_op ->> 'operation_id')::uuid;

  -- Fixed metadata only; the policy document, keys and freeform input never enter audit payloads.
  insert into public.audit_events (organisation_id, trace_id, operation_id, actor_id, event_type, payload)
  values (p_organisation_id, v_trace, (v_op ->> 'operation_id')::uuid, p_actor_id, 'configuration',
    jsonb_build_object('stage', 'policy_update', 'decision', 'ALLOW', 'reasons', '[]'::jsonb,
      'previous_policy_version', v_head.policy_version, 'policy_version', v_version,
      'feed_version', v_head.feed_version, 'policy_sha256', p_document_sha256, 'usage', v_usage));
  insert into public.actor_activity
    (trace_id, organisation_id, actor_id, operation, state, decision, reasons, usage, policy_version, feed_version)
  values (v_trace, p_organisation_id, p_actor_id, 'policy_update', 'completed', 'ALLOW', '[]'::jsonb,
    v_usage, v_version, v_head.feed_version);

  return jsonb_build_object('trace_id', v_trace, 'policy_version', v_version,
    'feed_version', v_head.feed_version);
end;
$$;

revoke execute on function public.update_policy(uuid, uuid, uuid, int, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.update_policy(uuid, uuid, uuid, int, jsonb, text, text) to service_role;

commit;
