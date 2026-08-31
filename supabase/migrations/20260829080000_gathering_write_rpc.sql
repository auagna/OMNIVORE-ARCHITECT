-- OMNIVORE ARCHITECT / atomic Gathering proposal and write boundary.
-- Apply after supabase-v3.3-revision-apply.sql. This file reuses its strict
-- full-snapshot normalizer, but public clients send only CreateGatheringInput
-- JSON. IDs, codes, lifecycle state, ownership, timestamps, and changed fields
-- are always derived from auth.uid() and locked database rows.

do $$
begin
  if to_regprocedure(
    'private.oa_normalize_gathering_revision_snapshot(uuid,jsonb)'
  ) is null
     or to_regprocedure(
       'private.oa_material_gathering_revision_fields(uuid,jsonb)'
     ) is null
     or to_regprocedure(
       'public.submit_program_revision(uuid,jsonb,text[])'
     ) is null then
    raise exception 'GATHERING_WRITE_REQUIRES_REVISION_APPLY';
  end if;
end;
$$;

create sequence if not exists private.oa_gathering_code_seq
  as bigint minvalue 1 start with 1 increment by 1;
revoke all on sequence private.oa_gathering_code_seq
  from public, anon, authenticated;

-- Never move an existing sequence backwards. On first install, advance it
-- past any imported/mock Gathering codes already present in production.
do $$
declare
  v_max_code bigint;
  v_last_value bigint;
  v_is_called boolean;
  v_effective_value bigint;
begin
  select coalesce(max(
    substring(program.code from '^OA / G([0-9]+)$')::bigint
  ), 0)
    into v_max_code
  from public.programs as program
  where program.type = 'GATHERING';

  select last_value, is_called
    into v_last_value, v_is_called
  from private.oa_gathering_code_seq;

  v_effective_value := case when v_is_called then v_last_value else 0 end;
  if v_max_code > v_effective_value then
    perform setval('private.oa_gathering_code_seq', v_max_code, true);
  end if;
end;
$$;

-- Convert the exact CreateGatheringInput JSON shape into the complete domain
-- snapshot expected by the v3.3 revision normalizer. System fields come from
-- the current Program row and cannot be shadowed by client JSON.
create or replace function private.oa_gathering_input_snapshot(
  p_program_id uuid,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_program public.programs%rowtype;
begin
  if p_snapshot is null
     or jsonb_typeof(p_snapshot) <> 'object'
     or not (p_snapshot ?& array[
       'title', 'category', 'description', 'startAt', 'endAt', 'location',
       'meetingPoint', 'mapUrl', 'capacity', 'recruitmentDeadline',
       'waitlistEnabled', 'cost', 'bringItems', 'notice'
     ]::text[])
     or exists (
       select 1
       from jsonb_object_keys(p_snapshot) as input_field(key)
       where not (key = any(array[
         'title', 'category', 'description', 'startAt', 'endAt', 'location',
         'meetingPoint', 'mapUrl', 'capacity', 'recruitmentDeadline',
         'waitlistEnabled', 'cost', 'bringItems', 'notice'
       ]::text[]))
     ) then
    raise exception 'INVALID_GATHERING_INPUT_FIELDS';
  end if;

  select program.*
    into v_program
  from public.programs as program
  where program.id = p_program_id and program.type = 'GATHERING';

  if not found then
    raise exception 'GATHERING_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'id', v_program.id,
    'code', v_program.code,
    'type', 'GATHERING',
    'title', p_snapshot -> 'title',
    'description', p_snapshot -> 'description',
    'hostId', v_program.host_id,
    'startAt', p_snapshot -> 'startAt',
    'endAt', p_snapshot -> 'endAt',
    'location', p_snapshot -> 'location',
    'mapUrl', p_snapshot -> 'mapUrl',
    'capacity', p_snapshot -> 'capacity',
    'status', v_program.status::text,
    'coverImageId', v_program.cover_image_id,
    'createdAt', v_program.created_at,
    'updatedAt', clock_timestamp(),
    'detail', jsonb_build_object(
      'programId', v_program.id,
      'category', p_snapshot -> 'category',
      'meetingPoint', p_snapshot -> 'meetingPoint',
      'recruitmentDeadline', p_snapshot -> 'recruitmentDeadline',
      'waitlistEnabled', p_snapshot -> 'waitlistEnabled',
      'cost', p_snapshot -> 'cost',
      'bringItems', p_snapshot -> 'bringItems',
      'notice', p_snapshot -> 'notice'
    )
  );
end;
$$;

create or replace function private.oa_operational_gathering_fields(
  p_program_id uuid,
  p_snapshot jsonb
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_program public.programs%rowtype;
  v_detail public.gathering_details%rowtype;
  v_proposed_detail jsonb := p_snapshot -> 'detail';
  v_proposed_cost jsonb := p_snapshot -> 'detail' -> 'cost';
  v_proposed_cost_type public.gathering_cost_type;
  v_changed text[] := array[]::text[];
begin
  select program.*
    into v_program
  from public.programs as program
  where program.id = p_program_id and program.type = 'GATHERING';
  select detail.*
    into v_detail
  from public.gathering_details as detail
  where detail.program_id = p_program_id;

  if v_program.id is null or v_detail.program_id is null then
    raise exception 'GATHERING_NOT_FOUND';
  end if;

  v_proposed_cost_type :=
    (v_proposed_cost ->> 'type')::public.gathering_cost_type;

  if btrim(v_program.title) is distinct from btrim(p_snapshot ->> 'title') then
    v_changed := array_append(v_changed, 'title');
  end if;
  if v_detail.category is distinct from
     (v_proposed_detail ->> 'category')::public.gathering_category then
    v_changed := array_append(v_changed, 'category');
  end if;
  if btrim(v_program.description) is distinct from
     btrim(p_snapshot ->> 'description') then
    v_changed := array_append(v_changed, 'description');
  end if;
  if nullif(btrim(v_detail.meeting_point), '') is distinct from
     nullif(btrim(v_proposed_detail ->> 'meetingPoint'), '') then
    v_changed := array_append(v_changed, 'meetingPoint');
  end if;
  if nullif(btrim(v_program.map_url), '') is distinct from
     nullif(btrim(p_snapshot ->> 'mapUrl'), '') then
    v_changed := array_append(v_changed, 'mapUrl');
  end if;
  if v_program.capacity is distinct from
     (p_snapshot ->> 'capacity')::integer then
    v_changed := array_append(v_changed, 'capacity');
  end if;
  if v_detail.recruitment_deadline is distinct from
     (v_proposed_detail ->> 'recruitmentDeadline')::timestamptz then
    v_changed := array_append(v_changed, 'recruitmentDeadline');
  end if;
  if v_detail.waitlist_enabled is distinct from
     (v_proposed_detail ->> 'waitlistEnabled')::boolean then
    v_changed := array_append(v_changed, 'waitlistEnabled');
  end if;
  if nullif(btrim(v_detail.bring_items), '') is distinct from
     nullif(btrim(v_proposed_detail ->> 'bringItems'), '') then
    v_changed := array_append(v_changed, 'bringItems');
  end if;
  if nullif(btrim(v_detail.notice), '') is distinct from
     nullif(btrim(v_proposed_detail ->> 'notice'), '') then
    v_changed := array_append(v_changed, 'notice');
  end if;

  if v_detail.cost_type = 'INDIVIDUAL_PURCHASE'
     and v_proposed_cost_type = 'INDIVIDUAL_PURCHASE' then
    if v_detail.estimated_price is distinct from
       (v_proposed_cost ->> 'estimatedPrice')::bigint then
      v_changed := array_append(v_changed, 'estimatedPrice');
    end if;
    if nullif(btrim(v_detail.purchase_url), '') is distinct from
       nullif(btrim(v_proposed_cost ->> 'purchaseUrl'), '') then
      v_changed := array_append(v_changed, 'purchaseUrl');
    end if;
    if nullif(btrim(v_detail.purchase_note), '') is distinct from
       nullif(btrim(v_proposed_cost ->> 'purchaseNote'), '') then
      v_changed := array_append(v_changed, 'purchaseNote');
    end if;
  end if;

  if v_detail.cost_type = 'HOST_COLLECT'
     and v_proposed_cost_type = 'HOST_COLLECT' then
    if nullif(btrim(v_detail.fee_includes), '') is distinct from
       nullif(btrim(v_proposed_cost ->> 'feeIncludes'), '') then
      v_changed := array_append(v_changed, 'feeIncludes');
    end if;
    if v_detail.payment_deadline is distinct from
       (v_proposed_cost ->> 'paymentDeadline')::timestamptz then
      v_changed := array_append(v_changed, 'paymentDeadline');
    end if;
  end if;

  return v_changed;
end;
$$;

-- Store an already-normalized full Gathering snapshot. This private helper is
-- used for a new placeholder row, an initial proposal resubmission, and an
-- immediately-applicable operational edit.
create or replace function private.oa_store_gathering_snapshot(
  p_program_id uuid,
  p_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_detail jsonb := p_snapshot -> 'detail';
  v_cost jsonb := p_snapshot -> 'detail' -> 'cost';
begin
  update public.programs
  set title = p_snapshot ->> 'title',
      description = p_snapshot ->> 'description',
      start_at = (p_snapshot ->> 'startAt')::timestamptz,
      end_at = (p_snapshot ->> 'endAt')::timestamptz,
      location = p_snapshot ->> 'location',
      map_url = p_snapshot ->> 'mapUrl',
      capacity = (p_snapshot ->> 'capacity')::integer,
      updated_at = (p_snapshot ->> 'updatedAt')::timestamptz
  where id = p_program_id and type = 'GATHERING';

  if not found then
    raise exception 'GATHERING_NOT_FOUND';
  end if;

  insert into public.gathering_details (
    program_id, category, meeting_point, recruitment_deadline,
    waitlist_enabled, cost_type, estimated_price, purchase_url,
    purchase_note, participation_fee, fee_includes, payment_deadline,
    cancellation_policy, bring_items, notice
  ) values (
    p_program_id,
    (v_detail ->> 'category')::public.gathering_category,
    v_detail ->> 'meetingPoint',
    (v_detail ->> 'recruitmentDeadline')::timestamptz,
    (v_detail ->> 'waitlistEnabled')::boolean,
    (v_cost ->> 'type')::public.gathering_cost_type,
    case when v_cost ->> 'type' = 'INDIVIDUAL_PURCHASE'
      then (v_cost ->> 'estimatedPrice')::bigint else null end,
    case when v_cost ->> 'type' = 'INDIVIDUAL_PURCHASE'
      then v_cost ->> 'purchaseUrl' else null end,
    case when v_cost ->> 'type' = 'INDIVIDUAL_PURCHASE'
      then v_cost ->> 'purchaseNote' else null end,
    case when v_cost ->> 'type' = 'HOST_COLLECT'
      then (v_cost ->> 'participationFee')::bigint else null end,
    case when v_cost ->> 'type' = 'HOST_COLLECT'
      then v_cost ->> 'feeIncludes' else null end,
    case when v_cost ->> 'type' = 'HOST_COLLECT'
      then (v_cost ->> 'paymentDeadline')::timestamptz else null end,
    case when v_cost ->> 'type' = 'HOST_COLLECT'
      then v_cost ->> 'cancellationPolicy' else null end,
    v_detail ->> 'bringItems',
    v_detail ->> 'notice'
  )
  on conflict (program_id) do update
  set category = excluded.category,
      meeting_point = excluded.meeting_point,
      recruitment_deadline = excluded.recruitment_deadline,
      waitlist_enabled = excluded.waitlist_enabled,
      cost_type = excluded.cost_type,
      estimated_price = excluded.estimated_price,
      purchase_url = excluded.purchase_url,
      purchase_note = excluded.purchase_note,
      participation_fee = excluded.participation_fee,
      fee_includes = excluded.fee_includes,
      payment_deadline = excluded.payment_deadline,
      cancellation_policy = excluded.cancellation_policy,
      bring_items = excluded.bring_items,
      notice = excluded.notice;

  if v_cost ->> 'type' = 'HOST_COLLECT' then
    insert into public.gathering_payment_instructions (
      program_id, payment_info, updated_at
    ) values (
      p_program_id,
      v_cost ->> 'paymentInfo',
      clock_timestamp()
    )
    on conflict (program_id) do update
    set payment_info = excluded.payment_info,
        updated_at = excluded.updated_at;
  else
    delete from public.gathering_payment_instructions
    where program_id = p_program_id;
  end if;
end;
$$;

create or replace function private.oa_create_gathering_program(
  p_status public.program_status,
  p_snapshot jsonb
)
returns public.programs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_number bigint;
  v_code text;
  v_program public.programs%rowtype;
  v_full_snapshot jsonb;
  v_canonical_snapshot jsonb;
  v_created_at timestamptz := clock_timestamp();
begin
  if v_actor_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if p_status not in ('DRAFT', 'OPEN') then
    raise exception 'INVALID_INITIAL_STATUS';
  end if;

  loop
    v_number := nextval('private.oa_gathering_code_seq'::regclass);
    v_code := 'OA / G' || lpad(v_number::text, 3, '0');
    exit when not exists (
      select 1 from public.programs as existing where existing.code = v_code
    );
  end loop;

  -- A valid placeholder lets the shared normalizer verify the proposed input
  -- against immutable system fields. Any failure rolls this row back.
  insert into public.programs (
    code, type, title, description, host_id, start_at, location,
    capacity, status, created_at, updated_at
  ) values (
    v_code, 'GATHERING', 'PENDING REVIEW', 'PENDING REVIEW', v_actor_id,
    v_created_at + interval '1 day', 'PENDING REVIEW', 1, p_status,
    v_created_at, v_created_at
  )
  returning * into v_program;

  v_full_snapshot := private.oa_gathering_input_snapshot(
    v_program.id, p_snapshot
  );
  v_canonical_snapshot :=
    private.oa_normalize_gathering_revision_snapshot(
      v_program.id, v_full_snapshot
    );
  perform private.oa_store_gathering_snapshot(
    v_program.id, v_canonical_snapshot
  );

  select program.*
    into v_program
  from public.programs as program
  where program.id = v_program.id;

  return v_program;
end;
$$;

create or replace function public.create_gathering_proposal(p_snapshot jsonb)
returns public.program_approvals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_status public.user_status;
  v_program public.programs%rowtype;
  v_approval public.program_approvals%rowtype;
  v_requested_at timestamptz := clock_timestamp();
begin
  if v_actor_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  select member.status into v_actor_status
  from public.users as member where member.id = v_actor_id;
  if not found or v_actor_status <> 'MEMBER' then
    raise exception 'FORBIDDEN';
  end if;

  v_program := private.oa_create_gathering_program('DRAFT', p_snapshot);

  insert into public.program_approvals (
    program_id, requester_id, reviewer_id, status, requested_at,
    reviewed_at, review_comment, published_at
  ) values (
    v_program.id, v_actor_id, null, 'PENDING', v_requested_at,
    null, null, null
  )
  returning * into v_approval;

  insert into public.program_activities (
    program_id, actor_id, type, metadata, dedupe_key
  ) values
  (
    v_program.id, v_actor_id, 'CREATED',
    jsonb_build_object('source', 'MEMBER_PROPOSAL'),
    'CREATED:' || v_program.id::text
  ),
  (
    v_program.id, v_actor_id, 'SUBMITTED',
    jsonb_build_object('approvalId', v_approval.id),
    'SUBMITTED:' || v_approval.id::text || ':' || v_requested_at::text
  )
  on conflict do nothing;

  return v_approval;
end;
$$;

create or replace function public.resubmit_gathering_proposal(
  p_program_id uuid,
  p_snapshot jsonb
)
returns public.program_approvals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_status public.user_status;
  v_program public.programs%rowtype;
  v_approval public.program_approvals%rowtype;
  v_full_snapshot jsonb;
  v_canonical_snapshot jsonb;
  v_submitted_at timestamptz := clock_timestamp();
begin
  if v_actor_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  select member.status into v_actor_status
  from public.users as member where member.id = v_actor_id;
  if not found or v_actor_status <> 'MEMBER' then
    raise exception 'FORBIDDEN';
  end if;

  -- Match approval review and revision submission lock order.
  select approval.* into v_approval
  from public.program_approvals as approval
  where approval.program_id = p_program_id
  for update;
  if not found then
    raise exception 'APPROVAL_NOT_FOUND';
  end if;

  select program.* into v_program
  from public.programs as program
  where program.id = p_program_id and program.type = 'GATHERING'
  for update;
  if not found then
    raise exception 'GATHERING_NOT_FOUND';
  end if;
  if v_program.host_id <> v_actor_id
     or v_approval.requester_id <> v_actor_id then
    raise exception 'FORBIDDEN';
  end if;
  if v_approval.status <> 'CHANGES_REQUESTED' then
    raise exception 'INVALID_TRANSITION';
  end if;

  v_full_snapshot := private.oa_gathering_input_snapshot(
    p_program_id, p_snapshot
  );
  v_canonical_snapshot :=
    private.oa_normalize_gathering_revision_snapshot(
      p_program_id, v_full_snapshot
    );

  if v_approval.published_at is null then
    if v_program.status <> 'DRAFT'
       or exists (
         select 1 from public.program_revisions as revision
         where revision.program_id = p_program_id
       ) then
      raise exception 'INVALID_INITIAL_RESUBMISSION';
    end if;

    perform private.oa_store_gathering_snapshot(
      p_program_id, v_canonical_snapshot
    );
    update public.program_approvals
    set status = 'PENDING',
        requester_id = v_actor_id,
        reviewer_id = null,
        requested_at = v_submitted_at,
        reviewed_at = null,
        review_comment = null
    where id = v_approval.id
    returning * into v_approval;

    insert into public.program_activities (
      program_id, actor_id, type, metadata, dedupe_key
    ) values (
      p_program_id, v_actor_id, 'SUBMITTED',
      jsonb_build_object(
        'approvalId', v_approval.id,
        'resubmission', true,
        'revision', false
      ),
      'PROPOSAL_RESUBMITTED:' || v_approval.id::text || ':' ||
        v_submitted_at::text
    )
    on conflict do nothing;
  else
    if v_program.status not in ('OPEN', 'CLOSED') then
      raise exception 'INVALID_TRANSITION';
    end if;
    perform public.submit_program_revision(
      p_program_id, v_canonical_snapshot, null
    );
    select approval.* into v_approval
    from public.program_approvals as approval
    where approval.id = v_approval.id;
  end if;

  return v_approval;
end;
$$;

create or replace function public.publish_gathering(p_snapshot jsonb)
returns public.programs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_program public.programs%rowtype;
  v_published_at timestamptz := clock_timestamp();
begin
  if v_actor_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if not public.is_oa_admin() then
    raise exception 'FORBIDDEN';
  end if;

  v_program := private.oa_create_gathering_program('OPEN', p_snapshot);
  insert into public.program_approvals (
    program_id, requester_id, reviewer_id, status, requested_at,
    reviewed_at, review_comment, published_at
  ) values (
    v_program.id, v_actor_id, null, 'NOT_REQUIRED', null,
    null, null, v_published_at
  );

  insert into public.program_activities (
    program_id, actor_id, type, metadata, dedupe_key
  ) values (
    v_program.id, v_actor_id, 'CREATED',
    jsonb_build_object('source', 'ADMIN_DIRECT'),
    'CREATED:' || v_program.id::text
  )
  on conflict do nothing;

  return v_program;
end;
$$;

create or replace function public.update_gathering(
  p_program_id uuid,
  p_snapshot jsonb
)
returns public.programs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_status public.user_status;
  v_program public.programs%rowtype;
  v_approval public.program_approvals%rowtype;
  v_full_snapshot jsonb;
  v_canonical_snapshot jsonb;
  v_material_fields text[];
  v_operational_fields text[];
  v_changed_fields text[];
  v_classification text;
  v_updated_at timestamptz := clock_timestamp();
begin
  if v_actor_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  select member.status into v_actor_status
  from public.users as member where member.id = v_actor_id;
  if not found or v_actor_status not in ('MEMBER', 'ADMIN') then
    raise exception 'FORBIDDEN';
  end if;

  -- Approval first matches submit/review lock order.
  select approval.* into v_approval
  from public.program_approvals as approval
  where approval.program_id = p_program_id
  for update;
  if not found then
    raise exception 'APPROVAL_REQUIRED';
  end if;

  select program.* into v_program
  from public.programs as program
  where program.id = p_program_id and program.type = 'GATHERING'
  for update;
  if not found then
    raise exception 'GATHERING_NOT_FOUND';
  end if;
  if not (
    v_actor_status = 'ADMIN' or v_program.host_id = v_actor_id
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_program.status not in ('OPEN', 'CLOSED')
     or v_approval.status not in ('APPROVED', 'NOT_REQUIRED') then
    raise exception 'INVALID_TRANSITION';
  end if;

  perform 1 from public.gathering_details
  where program_id = p_program_id for update;
  if not found then
    raise exception 'GATHERING_DETAIL_NOT_FOUND';
  end if;
  perform 1 from public.gathering_payment_instructions
  where program_id = p_program_id for update;

  v_full_snapshot := private.oa_gathering_input_snapshot(
    p_program_id, p_snapshot
  );
  v_canonical_snapshot :=
    private.oa_normalize_gathering_revision_snapshot(
      p_program_id, v_full_snapshot
    );
  v_material_fields := private.oa_material_gathering_revision_fields(
    p_program_id, v_canonical_snapshot
  );
  v_operational_fields := private.oa_operational_gathering_fields(
    p_program_id, v_canonical_snapshot
  );
  v_changed_fields := v_material_fields || v_operational_fields;

  if cardinality(v_changed_fields) = 0 then
    return v_program;
  end if;

  -- APPROVED material changes are staged for council review. NOT_REQUIRED
  -- Admin-direct Programs apply both material and operational edits directly.
  if cardinality(v_material_fields) > 0
     and v_approval.status = 'APPROVED' then
    perform public.submit_program_revision(
      p_program_id, v_canonical_snapshot, null
    );
    return v_program;
  end if;

  perform private.oa_store_gathering_snapshot(
    p_program_id, v_canonical_snapshot
  );
  v_classification := case
    when cardinality(v_material_fields) > 0 then 'MATERIAL'
    else 'OPERATIONAL'
  end;

  insert into public.program_activities (
    program_id, actor_id, type, metadata, dedupe_key
  ) values (
    p_program_id, v_actor_id, 'UPDATED',
    jsonb_build_object(
      'classification', v_classification,
      'changedFields', to_jsonb(v_changed_fields),
      'applied', true
    ),
    'GATHERING_UPDATED:' || p_program_id::text || ':' || v_updated_at::text
  )
  on conflict do nothing;

  select program.* into v_program
  from public.programs as program where program.id = p_program_id;
  return v_program;
end;
$$;

revoke all on function private.oa_gathering_input_snapshot(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function private.oa_operational_gathering_fields(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function private.oa_store_gathering_snapshot(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function private.oa_create_gathering_program(
  public.program_status, jsonb
) from public, anon, authenticated;

revoke all on function public.create_gathering_proposal(jsonb)
  from public, anon, authenticated;
revoke all on function public.resubmit_gathering_proposal(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.publish_gathering(jsonb)
  from public, anon, authenticated;
revoke all on function public.update_gathering(uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.create_gathering_proposal(jsonb)
  to authenticated;
grant execute on function public.resubmit_gathering_proposal(uuid, jsonb)
  to authenticated;
grant execute on function public.publish_gathering(jsonb)
  to authenticated;
grant execute on function public.update_gathering(uuid, jsonb)
  to authenticated;

comment on function public.create_gathering_proposal(jsonb) is
  'Atomically creates a Member-owned DRAFT Gathering and PENDING approval.';
comment on function public.resubmit_gathering_proposal(uuid, jsonb) is
  'Resubmits a CHANGES_REQUESTED initial proposal or published revision.';
comment on function public.publish_gathering(jsonb) is
  'Admin-only direct OPEN Gathering publication with NOT_REQUIRED approval.';
comment on function public.update_gathering(uuid, jsonb) is
  'Routes server-derived operational changes to storage and material changes to revision review.';
