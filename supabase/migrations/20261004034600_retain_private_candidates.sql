-- Preserve every bounded import unit privately so request-time projection can rescue safe facts.
-- No original is changed, and no blocked/reviewed unit is approved by this migration.
begin;

create or replace function public.finalize_import(
  p_run_id uuid,
  p_lease_token uuid,
  p_operation_id uuid,
  p_outcome jsonb,
  p_document jsonb,
  p_excerpts jsonb,
  p_reviews jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.runs%rowtype;
  v_source public.sources%rowtype;
  v_document_id uuid;
  v_status text;
  v_approved int;
  v_candidates int;
  v_final jsonb;
begin
  if p_run_id is null or p_lease_token is null or p_operation_id is null
     or jsonb_typeof(p_document) is distinct from 'object'
     or jsonb_typeof(p_excerpts) is distinct from 'array'
     or jsonb_typeof(p_reviews) is distinct from 'array' then
    raise exception 'INVALID_INPUT' using detail = 'finalize_import: missing required argument';
  end if;
  -- Separate statement so the field checks only run on an object.
  if not coalesce(p_document ->> 'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false)
     or not coalesce(p_document ->> 'source_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false)
     or not coalesce(p_document ->> 'status' in ('approved', 'partial', 'review', 'blocked'), false)
     or not coalesce(p_document ->> 'sha256' ~ '^[0-9a-f]{64}$', false)
     or not coalesce(char_length(p_document ->> 'format') between 1 and 20, false)
     or not coalesce(char_length(p_document ->> 'storage_key') between 1 and 200, false)
     or jsonb_typeof(p_document -> 'byte_count') is distinct from 'number'
     or not coalesce((p_document ->> 'byte_count') ~ '^[0-9]{1,15}$', false) then
    raise exception 'INVALID_INPUT' using detail = 'finalize_import: document does not match the contract';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_excerpts) e
    where jsonb_typeof(e) is distinct from 'object'
       or not coalesce(e ->> 'status' in ('approved', 'candidate'), false)
       or not coalesce(char_length(e ->> 'text') >= 1, false)
       or not coalesce(char_length(e ->> 'locator') between 1 and 80, false)
       or not coalesce(e ->> 'source_date' ~ '^\d{4}-\d{2}-\d{2}$' and pg_input_is_valid(e ->> 'source_date', 'date'), false)
       or not coalesce(char_length(e ->> 'period') between 1 and 60, false)
       or not coalesce(char_length(e ->> 'unit') between 1 and 60, false)
       or not coalesce(e ->> 'basis' in ('actual', 'forecast', 'proposal', 'event'), false)
       or not (coalesce(jsonb_typeof(e -> 'fact_key'), 'null') = 'null'
         or coalesce(char_length(e ->> 'fact_key') between 1 and 60, false))
  ) or exists (
    select 1 from jsonb_array_elements(p_reviews) r
    where jsonb_typeof(r) is distinct from 'object'
       or not coalesce(char_length(r ->> 'candidate_text') >= 1, false)
       or jsonb_typeof(r -> 'expires_at') is distinct from 'string'
       or not pg_input_is_valid(r ->> 'expires_at', 'timestamptz')
  ) then
    raise exception 'INVALID_INPUT' using detail = 'finalize_import: excerpts or reviews do not match the contract';
  end if;

  v_document_id := (p_document ->> 'id')::uuid;
  v_status := p_document ->> 'status';
  select count(*) filter (where e ->> 'status' = 'approved'), count(*) filter (where e ->> 'status' = 'candidate')
    into v_approved, v_candidates
  from jsonb_array_elements(p_excerpts) e;
  -- A blocked unit remains a private candidate for request-time safe projection. It is never
  -- approved by this RPC. Only REVIEW units create administrator review requests.
  if not (case v_status
            when 'approved' then v_approved >= 1 and v_candidates = 0
            when 'partial' then v_approved >= 1
            when 'review' then v_candidates >= 1
            else v_approved = 0
          end)
     or (v_status = 'review' and jsonb_array_length(p_reviews) > v_candidates)
     or (v_status <> 'review' and jsonb_array_length(p_reviews) <> 0) then
    raise exception 'INVALID_INPUT' using detail = 'finalize_import: status, excerpts and reviews disagree';
  end if;
  -- The publication and the settled outcome must tell the same story; a content BLOCK is a completed import.
  if concat_ws('/', p_outcome ->> 'run_state', p_outcome ->> 'decision') is distinct from (case v_status
       when 'approved' then 'completed/ALLOW'
       when 'partial' then 'completed/REDACT'
       when 'review' then 'review/REVIEW'
       else 'completed/BLOCK'
     end) then
    raise exception 'INVALID_INPUT' using detail = 'finalize_import: document status disagrees with the outcome';
  end if;

  -- Lock the run first so a replayed or stale call conflicts before any insert.
  select * into v_run from public.runs r where r.id = p_run_id for no key update;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'run not found';
  end if;
  if v_run.kind <> 'import' or v_run.state not in ('running', 'cancel_requested')
     or v_run.lease_token is distinct from p_lease_token then
    raise exception 'CONFLICT' using detail = 'run is not an import held under this lease';
  end if;
  if v_run.input_private ->> 'source_id' is distinct from p_document ->> 'source_id' then
    raise exception 'CONFLICT' using detail = 'document source differs from the run request';
  end if;

  select * into v_source from public.sources s
  where s.id = (p_document ->> 'source_id')::uuid and s.organisation_id = v_run.organisation_id;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'source not found in the run organisation';
  end if;
  -- Re-import is refused while the source has a published document, whatever this import's outcome.
  if exists (
    select 1 from public.documents d
    where d.organisation_id = v_run.organisation_id and d.source_id = v_source.id
      and d.status in ('approved', 'partial')
  ) then
    raise exception 'CONFLICT' using detail = 'source already has a published document';
  end if;
  -- Server-generated key: <organisation>/<document>/<version>.<ext>, nothing user-supplied.
  if left(p_document ->> 'storage_key', 74) is distinct from format('%s/%s/', v_run.organisation_id, v_document_id)
     or not coalesce(substr(p_document ->> 'storage_key', 75) ~ '^[0-9]{1,6}\.[a-z]{2,5}$', false) then
    raise exception 'INVALID_INPUT' using detail = 'finalize_import: storage key outside the document prefix';
  end if;

  -- A concurrent import of the same source, or a reused document id, is a conflict, not a raw error.
  begin
    insert into public.documents
      (id, organisation_id, source_id, uploaded_by, deal_id, classification, status, storage_key, sha256, format,
       byte_count, version, run_id)
    values
      (v_document_id, v_run.organisation_id, v_source.id, v_run.actor_id, v_source.deal_id, v_source.classification,
       v_status::public.document_status, p_document ->> 'storage_key', p_document ->> 'sha256',
       p_document ->> 'format', (p_document ->> 'byte_count')::bigint, 1, v_run.id);

    insert into public.excerpts
      (organisation_id, document_id, version, text, text_sha256, classification, deal_id, status, locator,
       source_date, period, unit, basis, fact_key, approved_by, approval_reason)
    select v_run.organisation_id, v_document_id, 1, e ->> 'text',
      encode(sha256(convert_to(e ->> 'text', 'UTF8')), 'hex'), v_source.classification, v_source.deal_id,
      (e ->> 'status')::public.excerpt_status, e ->> 'locator', (e ->> 'source_date')::date, e ->> 'period',
      e ->> 'unit', (e ->> 'basis')::public.fact_basis, e ->> 'fact_key', null,
      case when e ->> 'status' = 'approved' then 'import:assessment_clean' end
    from jsonb_array_elements(p_excerpts) e;

    insert into public.review_requests
      (organisation_id, document_id, run_id, candidate_text, version, classification, expires_at)
    select v_run.organisation_id, v_document_id, v_run.id, r ->> 'candidate_text', 1, v_source.classification,
      (r ->> 'expires_at')::timestamptz
    from jsonb_array_elements(p_reviews) r;
  exception when unique_violation then
    raise exception 'CONFLICT' using detail = 'document already published for this source or id';
  end;

  v_final := public.finalize_run(p_run_id, p_lease_token, p_operation_id, p_outcome);
  if not coalesce((v_final ->> 'finalized')::boolean, false) then
    raise exception 'CONFLICT' using detail = 'run was already settled';
  end if;

  return jsonb_build_object('finalized', true, 'state', v_final ->> 'state', 'document_id', v_document_id);
end;
$$;

commit;
