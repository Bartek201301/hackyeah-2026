-- Request-time source resolution and private candidate retrieval. Originals and candidate text remain
-- server-only; the gateway projects safe facts before model input or a response. Additive migration.
begin;

create index if not exists sources_name_lookup_idx on public.sources
  (organisation_id, lower(label));
create index if not exists sources_dataset_key_lookup_idx on public.sources
  (organisation_id, lower(dataset_key)) where dataset_key is not null;
create index if not exists documents_source_lookup_idx on public.documents
  (organisation_id, source_id);

create function public.match_permitted_sources(
  p_organisation_id uuid, p_actor_id uuid, p_audience text, p_name text,
  p_source_id uuid default null, p_deal_id uuid default null
)
returns table (id uuid, label text, created_at timestamptz)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_role public.member_role;
  v_deals uuid[];
  v_name text;
begin
  if p_organisation_id is null or p_actor_id is null or p_audience is null or p_audience not in ('actor', 'public')
     or (p_name is null) = (p_source_id is null)
     or (p_name is not null and char_length(p_name) not between 1 and 200) then
    raise exception 'INVALID_INPUT' using detail = 'match_permitted_sources: invalid arguments';
  end if;
  select m.role into v_role from public.memberships m
  where m.organisation_id = p_organisation_id and m.actor_id = p_actor_id and m.active;
  if not found then raise exception 'ACCESS_DENIED'; end if;
  select coalesce(array_agg(dm.deal_id), '{}') into v_deals from public.deal_memberships dm
  where dm.organisation_id = p_organisation_id and dm.actor_id = p_actor_id;
  if p_deal_id is not null then
    if not p_deal_id = any(v_deals) then raise exception 'NOT_FOUND'; end if;
    v_deals := array[p_deal_id];
  end if;
  v_name := regexp_replace(lower(coalesce(p_name, '')), '[^[:alnum:]]', '', 'g');
  return query
  select s.id, s.label, s.created_at from public.sources s
  where s.organisation_id = p_organisation_id
    and (p_source_id is not null and s.id = p_source_id
      or p_name is not null and v_name <> '' and (
        regexp_replace(lower(s.label), '[^[:alnum:]]', '', 'g') = v_name
        or regexp_replace(lower(regexp_replace(s.label, '\.[^.]+$', '')), '[^[:alnum:]]', '', 'g') = v_name
        or regexp_replace(lower(coalesce(s.dataset_key, '')), '[^[:alnum:]]', '', 'g') = v_name
      ))
    and exists (
      select 1 from public.documents d
      join public.excerpts e on e.organisation_id = d.organisation_id and e.document_id = d.id
      where d.organisation_id = p_organisation_id and d.source_id = s.id
        and (e.status = 'approved' or (p_audience = 'actor' and v_role <> 'external' and e.status = 'candidate'))
        and (e.classification = 'public'
          or (p_audience = 'actor' and e.classification = 'internal' and v_role <> 'external')
          or (p_audience = 'actor' and v_role in ('analyst', 'admin')
              and e.classification = 'restricted' and e.deal_id = any(v_deals)))
    )
  order by s.created_at desc, s.id
  limit 6;
end;
$$;

create function public.search_served_excerpts(
  p_organisation_id uuid, p_actor_id uuid, p_audience text, p_query text,
  p_limit int, p_deal_id uuid default null, p_source_id uuid default null
)
returns table (
  id uuid, source_id uuid, status public.excerpt_status, version int, text text,
  classification public.classification, locator text, source_date date, period text, unit text,
  basis public.fact_basis, fact_key text, source_label text, rank real
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_role public.member_role;
  v_deals uuid[];
  v_tsq tsquery;
begin
  if p_organisation_id is null or p_actor_id is null or p_audience is null or p_audience not in ('actor', 'public')
     or p_query is null or char_length(p_query) > 4000 or p_limit is null or p_limit not between 1 and 20 then
    raise exception 'INVALID_INPUT' using detail = 'search_served_excerpts: invalid arguments';
  end if;
  select m.role into v_role from public.memberships m
  where m.organisation_id = p_organisation_id and m.actor_id = p_actor_id and m.active;
  if not found then raise exception 'ACCESS_DENIED'; end if;
  select coalesce(array_agg(dm.deal_id), '{}') into v_deals from public.deal_memberships dm
  where dm.organisation_id = p_organisation_id and dm.actor_id = p_actor_id;
  if p_deal_id is not null then
    if not p_deal_id = any(v_deals) then raise exception 'NOT_FOUND'; end if;
    v_deals := array[p_deal_id];
  end if;
  select string_agg('''' || replace(replace(l, '\', '\\'), '''', '''''') || '''', ' | ')::tsquery
  into v_tsq from unnest(tsvector_to_array(to_tsvector('english', left(p_query, 1000)))) as l;
  if v_tsq is null and p_source_id is null then return; end if;
  return query
  select e.id, s.id, e.status, e.version, e.text, e.classification, e.locator, e.source_date,
    e.period, e.unit, e.basis, e.fact_key, s.label,
    (coalesce(ts_rank(e.search_vector, v_tsq), 0) +
     coalesce(ts_rank(to_tsvector('english', coalesce(e.fact_key, '') || ' ' || e.basis::text), v_tsq), 0) * 2)::real
  from public.excerpts e
  join public.documents d on d.organisation_id = e.organisation_id and d.id = e.document_id
  join public.sources s on s.organisation_id = d.organisation_id and s.id = d.source_id
  where e.organisation_id = p_organisation_id
    and (p_source_id is null or s.id = p_source_id)
    and (p_source_id is not null or e.search_vector @@ v_tsq)
    and (e.status = 'approved' or (p_audience = 'actor' and v_role <> 'external' and e.status = 'candidate'))
    and (e.classification = 'public'
      or (p_audience = 'actor' and e.classification = 'internal' and v_role <> 'external')
      or (p_audience = 'actor' and v_role in ('analyst', 'admin')
          and e.classification = 'restricted' and e.deal_id = any(v_deals)))
  order by 14 desc, e.created_at desc, e.id
  limit p_limit;
end;
$$;

create function public.read_served_excerpts(
  p_organisation_id uuid, p_actor_id uuid, p_audience text, p_ids uuid[]
)
returns table (
  id uuid, source_id uuid, status public.excerpt_status, version int, text text,
  classification public.classification, locator text, source_date date, period text, unit text,
  basis public.fact_basis, fact_key text, source_label text
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_role public.member_role;
  v_deals uuid[];
begin
  if p_organisation_id is null or p_actor_id is null or p_audience is null or p_audience not in ('actor', 'public')
     or p_ids is null or cardinality(p_ids) > 20 then
    raise exception 'INVALID_INPUT' using detail = 'read_served_excerpts: invalid arguments';
  end if;
  select m.role into v_role from public.memberships m
  where m.organisation_id = p_organisation_id and m.actor_id = p_actor_id and m.active;
  if not found then raise exception 'ACCESS_DENIED'; end if;
  select coalesce(array_agg(dm.deal_id), '{}') into v_deals from public.deal_memberships dm
  where dm.organisation_id = p_organisation_id and dm.actor_id = p_actor_id;
  return query
  select e.id, s.id, e.status, e.version, e.text, e.classification, e.locator, e.source_date,
    e.period, e.unit, e.basis, e.fact_key, s.label
  from public.excerpts e
  join public.documents d on d.organisation_id = e.organisation_id and d.id = e.document_id
  join public.sources s on s.organisation_id = d.organisation_id and s.id = d.source_id
  where e.organisation_id = p_organisation_id and e.id = any(p_ids)
    and (e.status = 'approved' or (p_audience = 'actor' and v_role <> 'external' and e.status = 'candidate'))
    and (e.classification = 'public'
      or (p_audience = 'actor' and e.classification = 'internal' and v_role <> 'external')
      or (p_audience = 'actor' and v_role in ('analyst', 'admin')
          and e.classification = 'restricted' and e.deal_id = any(v_deals)))
  order by array_position(p_ids, e.id);
end;
$$;

revoke execute on function public.match_permitted_sources(uuid, uuid, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.match_permitted_sources(uuid, uuid, text, text, uuid, uuid) to service_role;
revoke execute on function public.search_served_excerpts(uuid, uuid, text, text, int, uuid, uuid) from public, anon, authenticated;
grant execute on function public.search_served_excerpts(uuid, uuid, text, text, int, uuid, uuid) to service_role;
revoke execute on function public.read_served_excerpts(uuid, uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.read_served_excerpts(uuid, uuid, text, uuid[]) to service_role;

commit;
