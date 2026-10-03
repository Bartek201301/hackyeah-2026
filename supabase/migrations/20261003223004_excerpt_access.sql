-- Permission-filtered excerpt access (migration F): search_permitted_excerpts, read_permitted_excerpts and
-- record_access_decision. Source of truth: docs/contracts/data-model.md "Queries and indexing",
-- requirements §2 role matrix, technical-spec §2/§6 and the T06 decisions. Role and deal scope are derived
-- here from trusted memberships; the caller never passes a role or deals. Same conventions as migrations
-- B/C/E: security invoker with an empty search_path, execute for service_role only, errors raise an OpenAPI
-- ErrorCode as the message and a content-free detail. No table changes.
-- Applied once by the integrator after review; record the result in supabase/APPLIED.md. Never edit after apply.

begin;

-- Approved excerpts this actor may see that match the query, best first. The permission filter is in the
-- WHERE clause, so it runs before ranking and before any text leaves SQL. Visible: public always; internal
-- for a non-external member with audience 'actor'; restricted only on the actor's own deals with audience
-- 'actor'. p_deal_id narrows restricted rows to one of the actor's deals and never grants one. The query is
-- an OR of its English lexemes, cast without re-parsing so each lexeme matches search_vector exactly.
create function public.search_permitted_excerpts(
  p_organisation_id uuid,
  p_actor_id uuid,
  p_audience text,
  p_query text,
  p_limit int,
  p_deal_id uuid default null
)
returns table (
  id uuid,
  version int,
  text text,
  classification public.classification,
  locator text,
  source_date date,
  period text,
  unit text,
  basis public.fact_basis,
  fact_key text,
  source_label text,
  rank real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_deals uuid[];
  v_tsq tsquery;
begin
  if p_organisation_id is null or p_actor_id is null or p_query is null
     or p_audience is null or p_audience not in ('actor', 'public')
     or p_limit is null or p_limit < 1 then
    raise exception 'INVALID_INPUT' using detail = 'search_permitted_excerpts: missing or invalid argument';
  end if;

  select m.role into v_role from public.memberships m
  where m.organisation_id = p_organisation_id and m.actor_id = p_actor_id and m.active;
  if not found then
    raise exception 'ACCESS_DENIED' using detail = 'no active membership';
  end if;
  select coalesce(array_agg(dm.deal_id), '{}') into v_deals from public.deal_memberships dm
  where dm.organisation_id = p_organisation_id and dm.actor_id = p_actor_id;
  if p_deal_id is not null then
    if not (p_deal_id = any (v_deals)) then
      raise exception 'NOT_FOUND' using detail = 'deal not found';
    end if;
    v_deals := array[p_deal_id];
  end if;

  -- tsquery quoting: a lexeme is wrapped in single quotes with quotes and backslashes escaped.
  select string_agg('''' || replace(replace(l, '\', '\\'), '''', '''''') || '''', ' | ')::tsquery
  into v_tsq
  from unnest(tsvector_to_array(to_tsvector('english', left(p_query, 1000)))) as l;
  if v_tsq is null then
    return;
  end if;

  return query
  select e.id, e.version, e.text, e.classification, e.locator, e.source_date, e.period, e.unit, e.basis,
    e.fact_key, s.label, ts_rank(e.search_vector, v_tsq)
  from public.excerpts e
  join public.documents d on d.organisation_id = e.organisation_id and d.id = e.document_id
  join public.sources s on s.organisation_id = d.organisation_id and s.id = d.source_id
  where e.organisation_id = p_organisation_id
    and e.status = 'approved'
    and (e.classification = 'public'
      or (p_audience = 'actor' and e.classification = 'internal' and v_role <> 'external')
      or (p_audience = 'actor' and e.classification = 'restricted' and e.deal_id = any (v_deals)))
    and e.search_vector @@ v_tsq
  order by ts_rank(e.search_vector, v_tsq) desc, e.created_at desc, e.id
  limit least(p_limit, 20);
end;
$$;

-- The same permission filter by ID, for the access recheck before release and for direct reads. Only
-- permitted IDs come back, so a missing and a forbidden excerpt look identical. At most 20 IDs.
create function public.read_permitted_excerpts(
  p_organisation_id uuid,
  p_actor_id uuid,
  p_audience text,
  p_ids uuid[]
)
returns table (
  id uuid,
  version int,
  text text,
  classification public.classification,
  locator text,
  source_date date,
  period text,
  unit text,
  basis public.fact_basis,
  fact_key text,
  source_label text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_deals uuid[];
begin
  if p_organisation_id is null or p_actor_id is null
     or p_audience is null or p_audience not in ('actor', 'public')
     or p_ids is null or cardinality(p_ids) > 20 then
    raise exception 'INVALID_INPUT' using detail = 'read_permitted_excerpts: missing or invalid argument';
  end if;

  select m.role into v_role from public.memberships m
  where m.organisation_id = p_organisation_id and m.actor_id = p_actor_id and m.active;
  if not found then
    raise exception 'ACCESS_DENIED' using detail = 'no active membership';
  end if;
  select coalesce(array_agg(dm.deal_id), '{}') into v_deals from public.deal_memberships dm
  where dm.organisation_id = p_organisation_id and dm.actor_id = p_actor_id;

  return query
  select e.id, e.version, e.text, e.classification, e.locator, e.source_date, e.period, e.unit, e.basis,
    e.fact_key, s.label
  from public.excerpts e
  join public.documents d on d.organisation_id = e.organisation_id and d.id = e.document_id
  join public.sources s on s.organisation_id = d.organisation_id and s.id = d.source_id
  where e.organisation_id = p_organisation_id
    and e.id = any (p_ids)
    and e.status = 'approved'
    and (e.classification = 'public'
      or (p_audience = 'actor' and e.classification = 'internal' and v_role <> 'external')
      or (p_audience = 'actor' and e.classification = 'restricted' and e.deal_id = any (v_deals)))
  order by array_position(p_ids, e.id);
end;
$$;

-- One audited access operation (excerpt search/read, admin review reads): the membership check, the
-- operation (completed for ALLOW, denied for BLOCK), intent and decision events with versions from the
-- control head and the actor_activity projection, atomically. A null key is a fresh access; the same key
-- and hash return the existing trace, a different hash conflicts (begin_operation). The payload carries
-- safe codes and counts only; reasons and usage get the same projection checks as finalize_run.
create function public.record_access_decision(
  p_organisation_id uuid,
  p_actor_id uuid,
  p_operation text,
  p_idempotency_key uuid,
  p_request_sha256 text,
  p_decision text,
  p_reasons jsonb,
  p_usage jsonb,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_op jsonb;
  v_trace uuid := gen_random_uuid();
begin
  if p_decision is null or p_decision not in ('ALLOW', 'BLOCK')
     or jsonb_typeof(p_reasons) is distinct from 'array'
     or jsonb_typeof(p_usage) is distinct from 'object'
     or jsonb_typeof(p_payload) is distinct from 'object'
     or not coalesce(char_length(p_operation) between 1 and 60, false) then
    raise exception 'INVALID_INPUT' using detail = 'record_access_decision: missing or invalid argument';
  end if;
  -- Separate statement so the element checks only run on an array/object.
  if not coalesce(jsonb_typeof(p_payload -> 'stage') = 'string'
         and char_length(p_payload ->> 'stage') between 1 and 40, false)
     or jsonb_array_length(p_reasons) > 20 or exists (
    select 1 from jsonb_array_elements(p_reasons) e
    where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and 80
  ) or exists (
    select 1 from jsonb_each(p_usage) u
    where jsonb_typeof(u.value) not in ('number', 'boolean', 'null', 'string')
       or (jsonb_typeof(u.value) = 'string' and char_length(u.value #>> '{}') > 60)
  ) then
    raise exception 'INVALID_INPUT' using detail = 'record_access_decision: payload, reasons or usage do not match the projection';
  end if;

  v_op := public.begin_operation(p_organisation_id, p_actor_id, p_operation,
    coalesce(p_idempotency_key, gen_random_uuid()), p_request_sha256, v_trace, null);

  if (v_op ->> 'replay')::boolean then
    select a.trace_id into strict v_trace
    from public.audit_events a
    where a.organisation_id = p_organisation_id and a.operation_id = (v_op ->> 'operation_id')::uuid
      and a.event_type = 'intent';
  else
    update public.operations
    set state = (case p_decision when 'ALLOW' then 'completed' else 'denied' end)::public.operation_state
    where id = (v_op ->> 'operation_id')::uuid;

    insert into public.audit_events (organisation_id, trace_id, operation_id, actor_id, event_type, payload)
    values (p_organisation_id, v_trace, (v_op ->> 'operation_id')::uuid, p_actor_id, 'decision',
      p_payload || jsonb_build_object('decision', p_decision, 'reasons', p_reasons, 'usage', p_usage,
        'policy_version', v_op -> 'policy_version', 'feed_version', v_op -> 'feed_version'));

    insert into public.actor_activity
      (trace_id, organisation_id, actor_id, operation, state, decision, reasons, usage, policy_version, feed_version)
    values
      (v_trace, p_organisation_id, p_actor_id, p_operation,
       case p_decision when 'ALLOW' then 'completed' else 'blocked' end, p_decision, p_reasons, p_usage,
       (v_op ->> 'policy_version')::int, (v_op ->> 'feed_version')::int);
  end if;

  return jsonb_build_object('trace_id', v_trace,
    'policy_version', (v_op ->> 'policy_version')::int, 'feed_version', (v_op ->> 'feed_version')::int);
end;
$$;

-- Execute for the gateway server only; Supabase default privileges would otherwise grant anon/authenticated.

revoke execute on function public.search_permitted_excerpts(uuid, uuid, text, text, int, uuid)
  from public, anon, authenticated;
grant execute on function public.search_permitted_excerpts(uuid, uuid, text, text, int, uuid) to service_role;

revoke execute on function public.read_permitted_excerpts(uuid, uuid, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.read_permitted_excerpts(uuid, uuid, text, uuid[]) to service_role;

revoke execute on function public.record_access_decision(uuid, uuid, text, uuid, text, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_access_decision(uuid, uuid, text, uuid, text, text, jsonb, jsonb, jsonb)
  to service_role;

commit;
