-- OMNIVORE ARCHITECT / executable Gathering revision promotion.
-- Exact apply order:
--   supabase-v3.3-base.sql
--   -> supabase-v3.sql
--   -> supabase-v3.1.sql
--   -> supabase-v3.2.sql
--   -> supabase-v3.3-revision-apply.sql
--   -> supabase-v3.3-talk-realtime.sql
--
-- A revision snapshot is the full GatheringProgram JSON shape used by the
-- TypeScript domain. System-owned fields are checked against the published
-- row and never written from client input. Only editable Program and
-- GatheringDetail fields are normalized into the stored snapshot.

do $$
begin
  if to_regclass('public.program_revisions') is null
     or to_regprocedure(
       'public.review_program_revision(uuid,public.approval_status,text)'
     ) is null then
    raise exception 'REVISION_APPLY_REQUIRES_V3_2';
  end if;
  if to_regclass('public.gathering_payment_instructions') is null then
    raise exception 'REVISION_APPLY_REQUIRES_V3_3_BASE';
  end if;
end;
$$;

create or replace function private.oa_normalize_gathering_revision_snapshot(
  p_program_id uuid,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  current_program public.programs%rowtype;
  detail jsonb;
  cost jsonb;
  canonical_cost jsonb;
  proposed_title text;
  proposed_description text;
  proposed_start_at timestamptz;
  proposed_end_at timestamptz;
  proposed_location text;
  proposed_map_url text;
  proposed_capacity integer;
  proposed_created_at timestamptz;
  proposed_updated_at timestamptz;
  proposed_category public.gathering_category;
  proposed_meeting_point text;
  proposed_recruitment_deadline timestamptz;
  proposed_waitlist_enabled boolean;
  proposed_cost_type public.gathering_cost_type;
  proposed_estimated_price bigint;
  proposed_purchase_url text;
  proposed_purchase_note text;
  proposed_participation_fee bigint;
  proposed_fee_includes text;
  proposed_payment_info text;
  proposed_payment_deadline timestamptz;
  proposed_cancellation_policy text;
  proposed_bring_items text;
  proposed_notice text;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'INVALID_REVISION_SNAPSHOT';
  end if;

  select * into current_program
  from public.programs
  where id = p_program_id and type = 'GATHERING';

  if not found then
    raise exception 'GATHERING_NOT_FOUND';
  end if;

  -- Require the complete typed GatheringProgram object and reject shadow
  -- fields. This makes the review screen and the promoted payload identical.
  if not (p_snapshot ?& array[
    'id', 'code', 'type', 'title', 'description', 'hostId', 'startAt',
    'endAt', 'location', 'mapUrl', 'capacity', 'status', 'coverImageId',
    'createdAt', 'updatedAt', 'detail'
  ]::text[])
  or exists (
    select 1
    from jsonb_object_keys(p_snapshot) as top_level(key)
    where not (key = any(array[
      'id', 'code', 'type', 'title', 'description', 'hostId', 'startAt',
      'endAt', 'location', 'mapUrl', 'capacity', 'status', 'coverImageId',
      'createdAt', 'updatedAt', 'detail'
    ]::text[]))
  ) then
    raise exception 'INVALID_REVISION_TOP_LEVEL_FIELDS';
  end if;

  if jsonb_typeof(p_snapshot -> 'id') is distinct from 'string'
     or p_snapshot ->> 'id' <> p_program_id::text
     or jsonb_typeof(p_snapshot -> 'code') is distinct from 'string'
     or p_snapshot ->> 'code' <> current_program.code
     or jsonb_typeof(p_snapshot -> 'type') is distinct from 'string'
     or p_snapshot ->> 'type' <> 'GATHERING'
     or jsonb_typeof(p_snapshot -> 'hostId') is distinct from 'string'
     or p_snapshot ->> 'hostId' <> current_program.host_id::text
     or jsonb_typeof(p_snapshot -> 'status') is distinct from 'string'
     or p_snapshot ->> 'status' <> current_program.status::text then
    raise exception 'REVISION_SYSTEM_FIELD_MISMATCH';
  end if;

  if current_program.cover_image_id is null then
    if jsonb_typeof(p_snapshot -> 'coverImageId') is distinct from 'null' then
      raise exception 'REVISION_COVER_IMAGE_MISMATCH';
    end if;
  elsif jsonb_typeof(p_snapshot -> 'coverImageId') is distinct from 'string'
        or p_snapshot ->> 'coverImageId' <> current_program.cover_image_id::text then
    raise exception 'REVISION_COVER_IMAGE_MISMATCH';
  end if;

  if jsonb_typeof(p_snapshot -> 'createdAt') is distinct from 'string'
     or jsonb_typeof(p_snapshot -> 'updatedAt') is distinct from 'string' then
    raise exception 'INVALID_REVISION_TIMESTAMPS';
  end if;
  begin
    proposed_created_at := (p_snapshot ->> 'createdAt')::timestamptz;
    proposed_updated_at := (p_snapshot ->> 'updatedAt')::timestamptz;
  exception when others then
    raise exception 'INVALID_REVISION_TIMESTAMPS';
  end;
  if proposed_created_at is distinct from current_program.created_at
     or proposed_updated_at < proposed_created_at then
    raise exception 'REVISION_SYSTEM_FIELD_MISMATCH';
  end if;

  if jsonb_typeof(p_snapshot -> 'title') is distinct from 'string'
     or nullif(btrim(p_snapshot ->> 'title'), '') is null
     or jsonb_typeof(p_snapshot -> 'description') is distinct from 'string'
     or nullif(btrim(p_snapshot ->> 'description'), '') is null
     or jsonb_typeof(p_snapshot -> 'location') is distinct from 'string'
     or nullif(btrim(p_snapshot ->> 'location'), '') is null then
    raise exception 'INVALID_REVISION_REQUIRED_TEXT';
  end if;
  proposed_title := btrim(p_snapshot ->> 'title');
  proposed_description := btrim(p_snapshot ->> 'description');
  proposed_location := btrim(p_snapshot ->> 'location');

  if jsonb_typeof(p_snapshot -> 'startAt') is distinct from 'string'
     or jsonb_typeof(p_snapshot -> 'endAt') not in ('string', 'null') then
    raise exception 'INVALID_REVISION_PROGRAM_TIME';
  end if;
  begin
    proposed_start_at := (p_snapshot ->> 'startAt')::timestamptz;
    proposed_end_at := case
      when jsonb_typeof(p_snapshot -> 'endAt') = 'null' then null
      else (p_snapshot ->> 'endAt')::timestamptz
    end;
  exception when others then
    raise exception 'INVALID_REVISION_PROGRAM_TIME';
  end;
  if proposed_end_at is not null and proposed_end_at <= proposed_start_at then
    raise exception 'INVALID_REVISION_PROGRAM_TIME_ORDER';
  end if;

  if jsonb_typeof(p_snapshot -> 'mapUrl') not in ('string', 'null') then
    raise exception 'INVALID_REVISION_MAP_URL';
  end if;
  proposed_map_url := nullif(btrim(p_snapshot ->> 'mapUrl'), '');
  if proposed_map_url is not null
     and proposed_map_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'INVALID_REVISION_MAP_URL';
  end if;

  if jsonb_typeof(p_snapshot -> 'capacity') is distinct from 'number'
     or (p_snapshot ->> 'capacity') !~ '^[0-9]+$' then
    raise exception 'INVALID_REVISION_CAPACITY';
  end if;
  begin
    if (p_snapshot ->> 'capacity')::bigint > 2147483647 then
      raise exception 'INVALID_REVISION_CAPACITY';
    end if;
    proposed_capacity := (p_snapshot ->> 'capacity')::integer;
  exception when numeric_value_out_of_range then
    raise exception 'INVALID_REVISION_CAPACITY';
  end;
  if proposed_capacity < 1 then
    raise exception 'INVALID_REVISION_CAPACITY';
  end if;

  detail := p_snapshot -> 'detail';
  if jsonb_typeof(detail) is distinct from 'object'
     or not (detail ?& array[
       'programId', 'category', 'meetingPoint', 'recruitmentDeadline',
       'waitlistEnabled', 'cost', 'bringItems', 'notice'
     ]::text[])
     or exists (
       select 1
       from jsonb_object_keys(detail) as detail_level(key)
       where not (key = any(array[
         'programId', 'category', 'meetingPoint', 'recruitmentDeadline',
         'waitlistEnabled', 'cost', 'bringItems', 'notice'
       ]::text[]))
     ) then
    raise exception 'INVALID_REVISION_DETAIL_FIELDS';
  end if;

  if jsonb_typeof(detail -> 'programId') is distinct from 'string'
     or detail ->> 'programId' <> p_program_id::text then
    raise exception 'REVISION_DETAIL_PROGRAM_MISMATCH';
  end if;
  if jsonb_typeof(detail -> 'category') is distinct from 'string'
     or not ((detail ->> 'category') = any(array[
       'CASUAL', 'WORKSHOP', 'FIELD_TRIP', 'EXHIBITION',
       'STUDY', 'DINING', 'OTHER'
     ]::text[])) then
    raise exception 'INVALID_REVISION_CATEGORY';
  end if;
  proposed_category := (detail ->> 'category')::public.gathering_category;

  if jsonb_typeof(detail -> 'meetingPoint') not in ('string', 'null')
     or jsonb_typeof(detail -> 'bringItems') not in ('string', 'null')
     or jsonb_typeof(detail -> 'notice') not in ('string', 'null') then
    raise exception 'INVALID_REVISION_OPTIONAL_TEXT';
  end if;
  proposed_meeting_point := nullif(btrim(detail ->> 'meetingPoint'), '');
  proposed_bring_items := nullif(btrim(detail ->> 'bringItems'), '');
  proposed_notice := nullif(btrim(detail ->> 'notice'), '');

  if jsonb_typeof(detail -> 'waitlistEnabled') is distinct from 'boolean' then
    raise exception 'INVALID_REVISION_WAITLIST';
  end if;
  proposed_waitlist_enabled := (detail ->> 'waitlistEnabled')::boolean;

  if jsonb_typeof(detail -> 'recruitmentDeadline') not in ('string', 'null') then
    raise exception 'INVALID_REVISION_RECRUITMENT_DEADLINE';
  end if;
  begin
    proposed_recruitment_deadline := case
      when jsonb_typeof(detail -> 'recruitmentDeadline') = 'null' then null
      else (detail ->> 'recruitmentDeadline')::timestamptz
    end;
  exception when others then
    raise exception 'INVALID_REVISION_RECRUITMENT_DEADLINE';
  end;
  if proposed_recruitment_deadline is not null
     and proposed_recruitment_deadline > proposed_start_at then
    raise exception 'INVALID_REVISION_RECRUITMENT_DEADLINE';
  end if;

  cost := detail -> 'cost';
  if jsonb_typeof(cost) is distinct from 'object'
     or jsonb_typeof(cost -> 'type') is distinct from 'string'
     or not ((cost ->> 'type') = any(array[
       'FREE', 'INDIVIDUAL_PURCHASE', 'HOST_COLLECT'
     ]::text[])) then
    raise exception 'INVALID_REVISION_COST';
  end if;
  proposed_cost_type := (cost ->> 'type')::public.gathering_cost_type;

  if proposed_cost_type = 'FREE' then
    if not (cost ?& array['type']::text[])
       or exists (
         select 1 from jsonb_object_keys(cost) as free_cost(key)
         where key <> 'type'
       ) then
      raise exception 'INVALID_REVISION_FREE_COST';
    end if;
    canonical_cost := jsonb_build_object('type', 'FREE');

  elsif proposed_cost_type = 'INDIVIDUAL_PURCHASE' then
    if not (cost ?& array[
      'type', 'estimatedPrice', 'purchaseUrl', 'purchaseNote'
    ]::text[])
    or exists (
      select 1 from jsonb_object_keys(cost) as individual_cost(key)
      where not (key = any(array[
        'type', 'estimatedPrice', 'purchaseUrl', 'purchaseNote'
      ]::text[]))
    ) then
      raise exception 'INVALID_REVISION_INDIVIDUAL_COST';
    end if;
    if jsonb_typeof(cost -> 'estimatedPrice') not in ('number', 'null')
       or jsonb_typeof(cost -> 'purchaseUrl') not in ('string', 'null')
       or jsonb_typeof(cost -> 'purchaseNote') not in ('string', 'null') then
      raise exception 'INVALID_REVISION_INDIVIDUAL_COST';
    end if;
    if jsonb_typeof(cost -> 'estimatedPrice') = 'number' then
      if (cost ->> 'estimatedPrice') !~ '^[0-9]+$' then
        raise exception 'INVALID_REVISION_ESTIMATED_PRICE';
      end if;
      begin
        proposed_estimated_price := (cost ->> 'estimatedPrice')::bigint;
      exception when numeric_value_out_of_range then
        raise exception 'INVALID_REVISION_ESTIMATED_PRICE';
      end;
    end if;
    proposed_purchase_url := nullif(btrim(cost ->> 'purchaseUrl'), '');
    if proposed_purchase_url is not null
       and proposed_purchase_url !~* '^https?://[^[:space:]]+$' then
      raise exception 'INVALID_REVISION_PURCHASE_URL';
    end if;
    proposed_purchase_note := nullif(btrim(cost ->> 'purchaseNote'), '');
    canonical_cost := jsonb_build_object(
      'type', 'INDIVIDUAL_PURCHASE',
      'estimatedPrice', proposed_estimated_price,
      'purchaseUrl', proposed_purchase_url,
      'purchaseNote', proposed_purchase_note
    );

  else
    if not (cost ?& array[
      'type', 'participationFee', 'feeIncludes', 'paymentInfo',
      'paymentDeadline', 'cancellationPolicy'
    ]::text[])
    or exists (
      select 1 from jsonb_object_keys(cost) as host_cost(key)
      where not (key = any(array[
        'type', 'participationFee', 'feeIncludes', 'paymentInfo',
        'paymentDeadline', 'cancellationPolicy'
      ]::text[]))
    ) then
      raise exception 'INVALID_REVISION_HOST_COLLECT_COST';
    end if;
    if jsonb_typeof(cost -> 'participationFee') is distinct from 'number'
       or (cost ->> 'participationFee') !~ '^[0-9]+$'
       or jsonb_typeof(cost -> 'feeIncludes') not in ('string', 'null')
       or jsonb_typeof(cost -> 'paymentInfo') is distinct from 'string'
       or nullif(btrim(cost ->> 'paymentInfo'), '') is null
       or jsonb_typeof(cost -> 'paymentDeadline') not in ('string', 'null')
       or jsonb_typeof(cost -> 'cancellationPolicy') not in ('string', 'null') then
      raise exception 'INVALID_REVISION_HOST_COLLECT_COST';
    end if;
    begin
      proposed_participation_fee := (cost ->> 'participationFee')::bigint;
    exception when numeric_value_out_of_range then
      raise exception 'INVALID_REVISION_PARTICIPATION_FEE';
    end;
    if proposed_participation_fee <= 0 then
      raise exception 'INVALID_REVISION_PARTICIPATION_FEE';
    end if;
    proposed_fee_includes := nullif(btrim(cost ->> 'feeIncludes'), '');
    proposed_payment_info := btrim(cost ->> 'paymentInfo');
    proposed_cancellation_policy := nullif(
      btrim(cost ->> 'cancellationPolicy'), ''
    );
    begin
      proposed_payment_deadline := case
        when jsonb_typeof(cost -> 'paymentDeadline') = 'null' then null
        else (cost ->> 'paymentDeadline')::timestamptz
      end;
    exception when others then
      raise exception 'INVALID_REVISION_PAYMENT_DEADLINE';
    end;
    if proposed_payment_deadline is not null
       and proposed_payment_deadline > proposed_start_at then
      raise exception 'INVALID_REVISION_PAYMENT_DEADLINE';
    end if;
    canonical_cost := jsonb_build_object(
      'type', 'HOST_COLLECT',
      'participationFee', proposed_participation_fee,
      'feeIncludes', proposed_fee_includes,
      'paymentInfo', proposed_payment_info,
      'paymentDeadline', proposed_payment_deadline,
      'cancellationPolicy', proposed_cancellation_policy
    );
  end if;

  return jsonb_build_object(
    'id', current_program.id,
    'code', current_program.code,
    'type', 'GATHERING',
    'title', proposed_title,
    'description', proposed_description,
    'hostId', current_program.host_id,
    'startAt', proposed_start_at,
    'endAt', proposed_end_at,
    'location', proposed_location,
    'mapUrl', proposed_map_url,
    'capacity', proposed_capacity,
    'status', current_program.status::text,
    'coverImageId', current_program.cover_image_id,
    'createdAt', current_program.created_at,
    'updatedAt', proposed_updated_at,
    'detail', jsonb_build_object(
      'programId', current_program.id,
      'category', proposed_category::text,
      'meetingPoint', proposed_meeting_point,
      'recruitmentDeadline', proposed_recruitment_deadline,
      'waitlistEnabled', proposed_waitlist_enabled,
      'cost', canonical_cost,
      'bringItems', proposed_bring_items,
      'notice', proposed_notice
    )
  );
end;
$$;

create or replace function private.oa_material_gathering_revision_fields(
  p_program_id uuid,
  p_snapshot jsonb
)
returns text[]
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  current_start_at timestamptz;
  current_end_at timestamptz;
  current_location text;
  current_cost_type public.gathering_cost_type;
  current_participation_fee bigint;
  current_payment_info text;
  current_cancellation_policy text;
  proposed_cost jsonb := p_snapshot -> 'detail' -> 'cost';
  proposed_cost_type public.gathering_cost_type;
  changed text[] := array[]::text[];
begin
  select
    p.start_at,
    p.end_at,
    p.location,
    gd.cost_type,
    gd.participation_fee,
    gpi.payment_info,
    gd.cancellation_policy
  into
    current_start_at,
    current_end_at,
    current_location,
    current_cost_type,
    current_participation_fee,
    current_payment_info,
    current_cancellation_policy
  from public.programs p
  join public.gathering_details gd on gd.program_id = p.id
  left join public.gathering_payment_instructions gpi on gpi.program_id = p.id
  where p.id = p_program_id and p.type = 'GATHERING';

  if not found then
    raise exception 'GATHERING_NOT_FOUND';
  end if;

  proposed_cost_type := (proposed_cost ->> 'type')::public.gathering_cost_type;
  if current_start_at is distinct from (p_snapshot ->> 'startAt')::timestamptz then
    changed := array_append(changed, 'startAt');
  end if;
  if current_end_at is distinct from (p_snapshot ->> 'endAt')::timestamptz then
    changed := array_append(changed, 'endAt');
  end if;
  if btrim(current_location) is distinct from btrim(p_snapshot ->> 'location') then
    changed := array_append(changed, 'location');
  end if;
  if current_cost_type is distinct from proposed_cost_type then
    changed := array_append(changed, 'costType');
  end if;

  -- These fields are material only while both versions use HOST_COLLECT,
  -- matching the TypeScript classifyGatheringChanges policy.
  if current_cost_type = 'HOST_COLLECT'
     and proposed_cost_type = 'HOST_COLLECT' then
    if current_participation_fee is distinct from
       (proposed_cost ->> 'participationFee')::bigint then
      changed := array_append(changed, 'participationFee');
    end if;
    if nullif(btrim(current_payment_info), '') is distinct from
       nullif(btrim(proposed_cost ->> 'paymentInfo'), '') then
      changed := array_append(changed, 'paymentInfo');
    end if;
    if nullif(btrim(current_cancellation_policy), '') is distinct from
       nullif(btrim(proposed_cost ->> 'cancellationPolicy'), '') then
      changed := array_append(changed, 'cancellationPolicy');
    end if;
  end if;

  return changed;
end;
$$;

create or replace function public.apply_program_revision_snapshot(
  p_program_id uuid,
  p_proposed_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  canonical_snapshot jsonb;
  derived_changed_fields text[];
  stored_changed_fields text[];
  detail jsonb;
  cost jsonb;
begin
  if not public.is_oa_admin() then
    raise exception 'FORBIDDEN';
  end if;

  perform 1
  from public.programs
  where id = p_program_id
    and type = 'GATHERING'
    and status in ('OPEN', 'CLOSED')
  for update;
  if not found then
    raise exception 'GATHERING_NOT_FOUND';
  end if;

  perform 1
  from public.gathering_details
  where program_id = p_program_id
  for update;
  if not found then
    raise exception 'GATHERING_DETAIL_NOT_FOUND';
  end if;

  -- Lock the restricted row when it exists so a HOST_COLLECT transition and
  -- its payment instructions cannot be observed or changed independently.
  perform 1
  from public.gathering_payment_instructions
  where program_id = p_program_id
  for update;

  canonical_snapshot := private.oa_normalize_gathering_revision_snapshot(
    p_program_id,
    p_proposed_snapshot
  );
  derived_changed_fields := private.oa_material_gathering_revision_fields(
    p_program_id,
    canonical_snapshot
  );

  select changed_fields into stored_changed_fields
  from public.program_revisions
  where program_id = p_program_id
    and proposed_snapshot = canonical_snapshot
  for update;

  if not found then
    raise exception 'REVISION_SNAPSHOT_MISMATCH';
  end if;
  if cardinality(derived_changed_fields) = 0
     or stored_changed_fields is distinct from derived_changed_fields then
    raise exception 'REVISION_CHANGED_FIELDS_MISMATCH';
  end if;

  detail := canonical_snapshot -> 'detail';
  cost := detail -> 'cost';

  update public.programs
  set title = canonical_snapshot ->> 'title',
      description = canonical_snapshot ->> 'description',
      start_at = (canonical_snapshot ->> 'startAt')::timestamptz,
      end_at = (canonical_snapshot ->> 'endAt')::timestamptz,
      location = canonical_snapshot ->> 'location',
      map_url = canonical_snapshot ->> 'mapUrl',
      capacity = (canonical_snapshot ->> 'capacity')::integer,
      updated_at = now()
  where id = p_program_id;

  update public.gathering_details
  set category = (detail ->> 'category')::public.gathering_category,
      meeting_point = detail ->> 'meetingPoint',
      recruitment_deadline = (detail ->> 'recruitmentDeadline')::timestamptz,
      waitlist_enabled = (detail ->> 'waitlistEnabled')::boolean,
      cost_type = (cost ->> 'type')::public.gathering_cost_type,
      estimated_price = case
        when cost ->> 'type' = 'INDIVIDUAL_PURCHASE'
        then (cost ->> 'estimatedPrice')::bigint
        else null
      end,
      purchase_url = case
        when cost ->> 'type' = 'INDIVIDUAL_PURCHASE' then cost ->> 'purchaseUrl'
        else null
      end,
      purchase_note = case
        when cost ->> 'type' = 'INDIVIDUAL_PURCHASE' then cost ->> 'purchaseNote'
        else null
      end,
      participation_fee = case
        when cost ->> 'type' = 'HOST_COLLECT'
        then (cost ->> 'participationFee')::bigint
        else null
      end,
      fee_includes = case
        when cost ->> 'type' = 'HOST_COLLECT' then cost ->> 'feeIncludes'
        else null
      end,
      payment_deadline = case
        when cost ->> 'type' = 'HOST_COLLECT'
        then (cost ->> 'paymentDeadline')::timestamptz
        else null
      end,
      cancellation_policy = case
        when cost ->> 'type' = 'HOST_COLLECT' then cost ->> 'cancellationPolicy'
        else null
      end,
      bring_items = detail ->> 'bringItems',
      notice = detail ->> 'notice'
  where program_id = p_program_id;

  if cost ->> 'type' = 'HOST_COLLECT' then
    insert into public.gathering_payment_instructions (
      program_id,
      payment_info,
      updated_at
    ) values (
      p_program_id,
      cost ->> 'paymentInfo',
      now()
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

-- Replace the v3.2 submission function. The third argument remains only for
-- wire compatibility with clients already built against v3.2. It is never
-- used for authorization, storage, or activity metadata: PostgreSQL derives
-- material fields from the locked published rows and normalized snapshot.
create or replace function public.submit_program_revision(
  p_program_id uuid,
  p_proposed_snapshot jsonb,
  p_changed_fields text[] default null
)
returns public.program_revisions
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  current_program public.programs%rowtype;
  approval public.program_approvals%rowtype;
  revision public.program_revisions%rowtype;
  canonical_snapshot jsonb;
  derived_changed_fields text[];
  submitted_at timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED';
  end if;

  -- Match review_program_revision's lock order (approval before Program) to
  -- avoid a submit/review deadlock on the same revision.
  select * into approval
  from public.program_approvals
  where program_id = p_program_id
  for update;

  if approval.id is null then
    raise exception 'APPROVAL_NOT_FOUND';
  end if;
  if approval.published_at is null then
    raise exception 'NO_PUBLISHED_VERSION';
  end if;
  if approval.status not in ('APPROVED', 'CHANGES_REQUESTED') then
    raise exception 'INVALID_TRANSITION';
  end if;

  select * into current_program
  from public.programs
  where id = p_program_id
    and type = 'GATHERING'
    and status in ('OPEN', 'CLOSED')
  for update;

  if not found
     or not (
       current_program.host_id = auth.uid()
       or public.is_oa_admin()
     ) then
    raise exception 'FORBIDDEN';
  end if;

  perform 1
  from public.gathering_details
  where program_id = p_program_id
  for update;
  if not found then
    raise exception 'GATHERING_DETAIL_NOT_FOUND';
  end if;
  perform 1
  from public.gathering_payment_instructions
  where program_id = p_program_id
  for update;

  canonical_snapshot := private.oa_normalize_gathering_revision_snapshot(
    p_program_id,
    p_proposed_snapshot
  );
  derived_changed_fields := private.oa_material_gathering_revision_fields(
    p_program_id,
    canonical_snapshot
  );
  if cardinality(derived_changed_fields) = 0 then
    raise exception 'NO_MATERIAL_CHANGES';
  end if;

  insert into public.program_revisions (
    program_id,
    approval_id,
    proposed_by,
    proposed_snapshot,
    changed_fields,
    created_at,
    updated_at
  ) values (
    p_program_id,
    approval.id,
    auth.uid(),
    canonical_snapshot,
    derived_changed_fields,
    submitted_at,
    submitted_at
  )
  on conflict (program_id) do update
  set approval_id = excluded.approval_id,
      proposed_by = excluded.proposed_by,
      proposed_snapshot = excluded.proposed_snapshot,
      changed_fields = excluded.changed_fields,
      updated_at = excluded.updated_at
  returning * into revision;

  update public.program_approvals
  set status = 'PENDING',
      requester_id = auth.uid(),
      reviewer_id = null,
      requested_at = submitted_at,
      reviewed_at = null,
      review_comment = null
  where id = approval.id;

  insert into public.program_activities (
    program_id, actor_id, type, metadata, dedupe_key
  ) values (
    p_program_id,
    auth.uid(),
    'UPDATED',
    jsonb_build_object(
      'classification', 'MATERIAL',
      'changedFields', to_jsonb(derived_changed_fields),
      'applied', false,
      'revisionId', revision.id
    ),
    'REVISION_UPDATED:' || revision.id::text || ':' || submitted_at::text
  )
  on conflict do nothing;

  insert into public.program_activities (
    program_id, actor_id, type, metadata, dedupe_key
  ) values (
    p_program_id,
    auth.uid(),
    'SUBMITTED',
    jsonb_build_object(
      'reason', 'MATERIAL_CHANGE',
      'changedFields', to_jsonb(derived_changed_fields),
      'revisionId', revision.id
    ),
    'REVISION_SUBMITTED:' || revision.id::text || ':' || submitted_at::text
  )
  on conflict do nothing;

  return revision;
end;
$$;

revoke all on function private.oa_normalize_gathering_revision_snapshot(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function private.oa_material_gathering_revision_fields(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.apply_program_revision_snapshot(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.submit_program_revision(uuid, jsonb, text[])
  from public;
grant execute on function public.submit_program_revision(uuid, jsonb, text[])
  to authenticated;

comment on function public.apply_program_revision_snapshot(uuid, jsonb) is
  'Internal, atomic promotion of a validated GatheringProgram revision.';
comment on function public.submit_program_revision(uuid, jsonb, text[]) is
  'Stores a normalized revision and derives material changes server-side; the legacy changed-fields argument is ignored.';
