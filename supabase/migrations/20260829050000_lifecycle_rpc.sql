-- OMNIVORE ARCHITECT / atomic lifecycle mutation boundary.
-- Apply after supabase-v3.3-base.sql -> supabase-v3.sql -> supabase-v3.1.sql
-- -> supabase-v3.2.sql. TALK realtime may be applied before or after this file.
--
-- Every caller identity comes from auth.uid(). Client-supplied actor/user ids
-- are intentionally absent. Direct table mutation stays unavailable to member
-- clients; these SECURITY DEFINER functions are the audited write boundary.

do $$
begin
  if to_regclass('public.programs') is null
     or to_regclass('public.gathering_details') is null
     or to_regclass('public.participations') is null
     or to_regclass('public.program_activities') is null
     or to_regclass('public.records') is null
     or to_regclass('public.record_materials') is null then
    raise exception 'LIFECYCLE_RPC_REQUIRES_FINAL_SCHEMA';
  end if;

  if to_regprocedure('public.program_has_published_version(uuid)') is null then
    raise exception 'LIFECYCLE_RPC_REQUIRES_PUBLISHED_VERSION_HELPER';
  end if;
end;
$$;

create or replace function public.join_program(p_program_id uuid)
returns public.participations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_status public.user_status;
  v_program public.programs%rowtype;
  v_existing public.participations%rowtype;
  v_participation public.participations%rowtype;
  v_waitlist_enabled boolean := false;
  v_cost_type public.gathering_cost_type;
  v_confirmed_count integer;
  v_placement public.participation_status;
  v_payment_status public.payment_status;
  v_joined_at timestamptz := clock_timestamp();
begin
  if v_actor_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select member.status
    into v_actor_status
  from public.users as member
  where member.id = v_actor_id;

  -- Admins operate Programs but do not consume participant capacity.
  if not found or v_actor_status <> 'MEMBER' then
    raise exception 'FORBIDDEN';
  end if;

  -- The Program row is the capacity mutex. Every join for this Program takes
  -- this lock before counting CONFIRMED rows, preventing oversubscription.
  select program.*
    into v_program
  from public.programs as program
  where program.id = p_program_id
  for update;

  if not found then
    raise exception 'PROGRAM_NOT_FOUND';
  end if;
  if v_program.host_id = v_actor_id then
    raise exception 'FORBIDDEN';
  end if;
  if v_program.status <> 'OPEN' then
    raise exception 'NOT_OPEN';
  end if;
  if v_program.start_at <= v_joined_at then
    raise exception 'RECRUITMENT_CLOSED';
  end if;
  if not public.program_has_published_version(p_program_id) then
    raise exception 'APPROVAL_REQUIRED';
  end if;

  if v_program.type = 'GATHERING' then
    select detail.waitlist_enabled, detail.cost_type
      into v_waitlist_enabled, v_cost_type
    from public.gathering_details as detail
    where detail.program_id = p_program_id;

    if not found then
      raise exception 'GATHERING_DETAIL_NOT_FOUND';
    end if;

    if exists (
      select 1
      from public.gathering_details as detail
      where detail.program_id = p_program_id
        and detail.recruitment_deadline is not null
        and v_joined_at > detail.recruitment_deadline
    ) then
      raise exception 'RECRUITMENT_CLOSED';
    end if;
  end if;

  select participation.*
    into v_existing
  from public.participations as participation
  where participation.program_id = p_program_id
    and participation.user_id = v_actor_id
  for update;

  if found and v_existing.status <> 'CANCELLED' then
    raise exception 'ALREADY_JOINED';
  end if;

  select count(*)::integer
    into v_confirmed_count
  from public.participations as participation
  where participation.program_id = p_program_id
    and participation.status = 'CONFIRMED';

  if v_program.capacity is null or v_confirmed_count < v_program.capacity then
    v_placement := 'CONFIRMED';
  elsif v_program.type = 'GATHERING' and v_waitlist_enabled then
    v_placement := 'WAITLIST';
  else
    raise exception 'CAPACITY_FULL';
  end if;

  v_payment_status := case
    when v_placement = 'CONFIRMED'
      and v_program.type = 'GATHERING'
      and v_cost_type = 'HOST_COLLECT'
      then 'PENDING'::public.payment_status
    else 'NOT_REQUIRED'::public.payment_status
  end;

  if v_existing.id is null then
    insert into public.participations (
      program_id, user_id, status, payment_status, joined_at, updated_at
    ) values (
      p_program_id, v_actor_id, v_placement, v_payment_status,
      v_joined_at, v_joined_at
    )
    returning * into v_participation;
  else
    update public.participations
    set status = v_placement,
        payment_status = v_payment_status,
        joined_at = v_joined_at,
        updated_at = v_joined_at
    where id = v_existing.id
    returning * into v_participation;
  end if;

  insert into public.program_activities (
    program_id, actor_id, type, metadata, dedupe_key
  ) values (
    p_program_id,
    v_actor_id,
    case when v_placement = 'CONFIRMED'
      then 'JOINED'::public.program_activity_type
      else 'WAITLISTED'::public.program_activity_type
    end,
    jsonb_build_object(
      'participationId', v_participation.id,
      'placement', v_placement::text
    ),
    v_placement::text || ':' || v_participation.id::text || ':' ||
      v_joined_at::text
  )
  on conflict do nothing;

  return v_participation;
end;
$$;

-- Replaces the v3.1 blueprint function with the final lock order, updated_at,
-- active-member check, and repeatable join/cancel audit key. The public
-- signature remains stable for repository adapters.
create or replace function public.cancel_own_participation(p_program_id uuid)
returns public.participations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_status public.user_status;
  v_program public.programs%rowtype;
  v_participation public.participations%rowtype;
  v_previous_status public.participation_status;
  v_cancelled_at timestamptz := clock_timestamp();
begin
  if v_actor_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select member.status
    into v_actor_status
  from public.users as member
  where member.id = v_actor_id;

  if not found or v_actor_status not in ('MEMBER', 'ADMIN') then
    raise exception 'FORBIDDEN';
  end if;

  -- Match join_program's lock order: Program first, Participation second.
  select program.*
    into v_program
  from public.programs as program
  where program.id = p_program_id
  for update;

  if not found then
    raise exception 'PROGRAM_NOT_FOUND';
  end if;

  select participation.*
    into v_participation
  from public.participations as participation
  where participation.program_id = p_program_id
    and participation.user_id = v_actor_id
  for update;

  if not found then
    raise exception 'PARTICIPATION_NOT_FOUND';
  end if;
  if v_participation.status = 'CANCELLED' then
    return v_participation;
  end if;
  if v_program.status in ('COMPLETED', 'CANCELLED')
     or v_program.start_at <= v_cancelled_at then
    raise exception 'INVALID_TRANSITION';
  end if;

  v_previous_status := v_participation.status;

  update public.participations
  set status = 'CANCELLED',
      updated_at = v_cancelled_at
  where id = v_participation.id
  returning * into v_participation;

  insert into public.program_activities (
    program_id, actor_id, type, metadata, dedupe_key
  ) values (
    p_program_id,
    v_actor_id,
    'LEFT',
    jsonb_build_object(
      'participationId', v_participation.id,
      'previousStatus', v_previous_status::text
    ),
    'LEFT:' || v_participation.id::text || ':' || v_cancelled_at::text
  )
  on conflict do nothing;

  return v_participation;
end;
$$;

create or replace function public.confirm_participation_payment(
  p_participation_id uuid
)
returns public.participations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_status public.user_status;
  v_program_id uuid;
  v_program public.programs%rowtype;
  v_participation public.participations%rowtype;
  v_cost_type public.gathering_cost_type;
  v_confirmed_at timestamptz := clock_timestamp();
begin
  if v_actor_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select member.status
    into v_actor_status
  from public.users as member
  where member.id = v_actor_id;

  if not found or v_actor_status not in ('MEMBER', 'ADMIN') then
    raise exception 'FORBIDDEN';
  end if;

  -- Read only the immutable parent id, then take locks in Program-first order.
  select participation.program_id
    into v_program_id
  from public.participations as participation
  where participation.id = p_participation_id;

  if not found then
    raise exception 'PARTICIPATION_NOT_FOUND';
  end if;

  select program.*
    into v_program
  from public.programs as program
  where program.id = v_program_id
  for update;

  if not found then
    raise exception 'PROGRAM_NOT_FOUND';
  end if;
  if not (
    v_actor_status = 'ADMIN' or v_program.host_id = v_actor_id
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_program.type <> 'GATHERING'
     or v_program.status in ('DRAFT', 'CANCELLED')
     or not public.program_has_published_version(v_program.id) then
    raise exception 'INVALID_TRANSITION';
  end if;

  select detail.cost_type
    into v_cost_type
  from public.gathering_details as detail
  where detail.program_id = v_program.id;

  if not found or v_cost_type <> 'HOST_COLLECT' then
    raise exception 'INVALID_TRANSITION';
  end if;

  select participation.*
    into v_participation
  from public.participations as participation
  where participation.id = p_participation_id
    and participation.program_id = v_program.id
  for update;

  if not found then
    raise exception 'PARTICIPATION_NOT_FOUND';
  end if;
  if v_participation.status <> 'CONFIRMED'
     or v_participation.payment_status = 'NOT_REQUIRED' then
    raise exception 'INVALID_TRANSITION';
  end if;
  if v_participation.payment_status = 'PAID' then
    return v_participation;
  end if;

  update public.participations
  set payment_status = 'PAID',
      updated_at = v_confirmed_at
  where id = v_participation.id
  returning * into v_participation;

  insert into public.program_activities (
    program_id, actor_id, type, metadata, dedupe_key
  ) values (
    v_program.id,
    v_actor_id,
    'PAYMENT_CONFIRMED',
    jsonb_build_object(
      'participationId', v_participation.id,
      'participantId', v_participation.user_id
    ),
    'PAYMENT_CONFIRMED:' || v_participation.id::text
  )
  on conflict do nothing;

  return v_participation;
end;
$$;

create or replace function public.set_program_status(
  p_program_id uuid,
  p_status public.program_status
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
  v_previous_status public.program_status;
  v_changed_at timestamptz := clock_timestamp();
  v_activity_type public.program_activity_type;
begin
  if v_actor_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select member.status
    into v_actor_status
  from public.users as member
  where member.id = v_actor_id;

  if not found or v_actor_status not in ('MEMBER', 'ADMIN') then
    raise exception 'FORBIDDEN';
  end if;

  select program.*
    into v_program
  from public.programs as program
  where program.id = p_program_id
  for update;

  if not found then
    raise exception 'PROGRAM_NOT_FOUND';
  end if;
  if v_actor_status <> 'ADMIN' and v_program.host_id <> v_actor_id then
    raise exception 'FORBIDDEN';
  end if;
  if v_program.status = p_status then
    return v_program;
  end if;

  -- Effective v3 state graph. DRAFT publication and reopening are Admin-only;
  -- Hosts may only close OPEN recruitment or cancel an OPEN/CLOSED Program.
  if not (
    (v_program.status = 'DRAFT' and p_status = 'OPEN')
    or (v_program.status = 'OPEN' and p_status in ('CLOSED', 'COMPLETED', 'CANCELLED'))
    or (v_program.status = 'CLOSED' and p_status in ('OPEN', 'COMPLETED', 'CANCELLED'))
  ) then
    raise exception 'INVALID_TRANSITION';
  end if;

  if v_actor_status <> 'ADMIN' and not (
    (v_program.status = 'OPEN' and p_status = 'CLOSED')
    or (v_program.status in ('OPEN', 'CLOSED') and p_status = 'CANCELLED')
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if p_status = 'OPEN' and v_actor_status <> 'ADMIN' then
    raise exception 'FORBIDDEN';
  end if;
  if p_status in ('OPEN', 'CLOSED', 'CANCELLED')
     and not public.program_has_published_version(p_program_id) then
    raise exception 'APPROVAL_REQUIRED';
  end if;

  v_previous_status := v_program.status;

  update public.programs
  set status = p_status,
      updated_at = v_changed_at
  where id = p_program_id
  returning * into v_program;

  v_activity_type := case when p_status = 'COMPLETED'
    then 'COMPLETED'::public.program_activity_type
    else 'UPDATED'::public.program_activity_type
  end;

  insert into public.program_activities (
    program_id, actor_id, type, metadata, dedupe_key
  ) values (
    p_program_id,
    v_actor_id,
    v_activity_type,
    jsonb_build_object(
      'scope', 'STATUS',
      'previousStatus', v_previous_status::text,
      'status', p_status::text
    ),
    'STATUS:' || p_program_id::text || ':' || v_previous_status::text || ':' ||
      p_status::text || ':' || v_changed_at::text
  )
  on conflict do nothing;

  return v_program;
end;
$$;

-- Internal helper used only by the two Record RPCs below. Deleting and
-- rebuilding materials is safe because any validation failure rolls back the
-- entire calling transaction, including the Record text update.
create or replace function private.oa_replace_record_materials(
  p_record_id uuid,
  p_materials jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_material jsonb;
  v_position bigint;
  v_type text;
  v_media_id_text text;
  v_media_id uuid;
  v_url text;
  v_label text;
  v_materials jsonb := coalesce(p_materials, '[]'::jsonb);
begin
  if jsonb_typeof(v_materials) <> 'array'
     or jsonb_array_length(v_materials) > 20 then
    raise exception 'INVALID_RECORD_MATERIALS';
  end if;

  delete from public.record_materials
  where record_id = p_record_id;

  for v_material, v_position in
    select element.value, element.ordinality
    from jsonb_array_elements(v_materials) with ordinality as element(value, ordinality)
  loop
    if jsonb_typeof(v_material) <> 'object' then
      raise exception 'INVALID_RECORD_MATERIAL';
    end if;

    v_type := v_material ->> 'type';
    v_label := nullif(btrim(v_material ->> 'label'), '');

    if v_type = 'PHOTO' then
      v_media_id_text := nullif(btrim(v_material ->> 'mediaId'), '');
      if v_media_id_text is null or v_media_id_text !~* (
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-' ||
        '[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      ) then
        raise exception 'INVALID_RECORD_PHOTO';
      end if;

      v_media_id := v_media_id_text::uuid;
      if not exists (
        select 1 from public.media as asset where asset.id = v_media_id
      ) then
        raise exception 'RECORD_PHOTO_NOT_FOUND';
      end if;

      insert into public.record_materials (
        record_id, type, media_id, url, label, position
      ) values (
        p_record_id, 'PHOTO', v_media_id, null, v_label,
        (v_position - 1)::integer
      );
    elsif v_type in ('LINK', 'REFERENCE') then
      v_url := nullif(btrim(v_material ->> 'url'), '');
      if v_url is null or v_url !~* '^https?://[^[:space:]]+$' then
        raise exception 'INVALID_RECORD_URL';
      end if;

      insert into public.record_materials (
        record_id, type, media_id, url, label, position
      ) values (
        p_record_id,
        v_type::public.record_material_type,
        null,
        v_url,
        v_label,
        (v_position - 1)::integer
      );
    else
      raise exception 'INVALID_RECORD_MATERIAL_TYPE';
    end if;
  end loop;

  return jsonb_array_length(v_materials);
end;
$$;

create or replace function public.create_program_record(
  p_program_id uuid,
  p_what text,
  p_found text default null,
  p_materials jsonb default '[]'::jsonb
)
returns public.records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_status public.user_status;
  v_program public.programs%rowtype;
  v_record public.records%rowtype;
  v_what text := nullif(btrim(p_what), '');
  v_found text := nullif(btrim(p_found), '');
  v_material_count integer;
  v_created_at timestamptz := clock_timestamp();
begin
  if v_actor_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if v_what is null then
    raise exception 'WHAT_REQUIRED';
  end if;

  select member.status
    into v_actor_status
  from public.users as member
  where member.id = v_actor_id;

  if not found or v_actor_status not in ('MEMBER', 'ADMIN') then
    raise exception 'FORBIDDEN';
  end if;

  select program.*
    into v_program
  from public.programs as program
  where program.id = p_program_id
  for update;

  if not found then
    raise exception 'PROGRAM_NOT_FOUND';
  end if;
  if v_program.status <> 'COMPLETED'
     or not (v_actor_status = 'ADMIN' or v_program.host_id = v_actor_id) then
    raise exception 'FORBIDDEN';
  end if;
  if exists (
    select 1 from public.records as record where record.program_id = p_program_id
  ) then
    raise exception 'RECORD_ALREADY_EXISTS';
  end if;

  insert into public.records (
    program_id, author_id, what, found, created_at, updated_at
  ) values (
    p_program_id, v_actor_id, v_what, v_found, v_created_at, v_created_at
  )
  returning * into v_record;

  v_material_count := private.oa_replace_record_materials(
    v_record.id, p_materials
  );

  insert into public.program_activities (
    program_id, actor_id, type, metadata, dedupe_key
  ) values (
    p_program_id,
    v_actor_id,
    'RECORD_CREATED',
    jsonb_build_object(
      'recordId', v_record.id,
      'materialCount', v_material_count
    ),
    'RECORD_CREATED:' || v_record.id::text
  )
  on conflict do nothing;

  return v_record;
end;
$$;

create or replace function public.update_program_record(
  p_program_id uuid,
  p_what text,
  p_found text default null,
  p_materials jsonb default '[]'::jsonb
)
returns public.records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_status public.user_status;
  v_program public.programs%rowtype;
  v_record public.records%rowtype;
  v_what text := nullif(btrim(p_what), '');
  v_found text := nullif(btrim(p_found), '');
  v_material_count integer;
  v_updated_at timestamptz := clock_timestamp();
begin
  if v_actor_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if v_what is null then
    raise exception 'WHAT_REQUIRED';
  end if;

  select member.status
    into v_actor_status
  from public.users as member
  where member.id = v_actor_id;

  if not found or v_actor_status not in ('MEMBER', 'ADMIN') then
    raise exception 'FORBIDDEN';
  end if;

  select program.*
    into v_program
  from public.programs as program
  where program.id = p_program_id
  for update;

  if not found then
    raise exception 'PROGRAM_NOT_FOUND';
  end if;
  if v_program.status <> 'COMPLETED' then
    raise exception 'INVALID_TRANSITION';
  end if;

  select record.*
    into v_record
  from public.records as record
  where record.program_id = p_program_id
  for update;

  if not found then
    raise exception 'RECORD_NOT_FOUND';
  end if;
  if not (
    v_actor_status = 'ADMIN'
    or v_program.host_id = v_actor_id
    or v_record.author_id = v_actor_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  update public.records
  set what = v_what,
      found = v_found,
      updated_at = v_updated_at
  where id = v_record.id
  returning * into v_record;

  v_material_count := private.oa_replace_record_materials(
    v_record.id, p_materials
  );

  insert into public.program_activities (
    program_id, actor_id, type, metadata, dedupe_key
  ) values (
    p_program_id,
    v_actor_id,
    'UPDATED',
    jsonb_build_object(
      'scope', 'RECORD',
      'recordId', v_record.id,
      'materialCount', v_material_count
    ),
    'RECORD_UPDATED:' || v_record.id::text || ':' || v_updated_at::text
  )
  on conflict do nothing;

  return v_record;
end;
$$;

-- The RPC layer is the only authenticated mutation path for these lifecycle
-- tables. RLS still governs all direct reads.
revoke insert, update, delete, truncate on public.programs from anon, authenticated;
revoke insert, update, delete, truncate on public.participations from anon, authenticated;
revoke insert, update, delete, truncate on public.records from anon, authenticated;
revoke insert, update, delete, truncate on public.record_materials from anon, authenticated;

revoke all on function private.oa_replace_record_materials(uuid, jsonb)
  from public, anon, authenticated;

revoke all on function public.join_program(uuid)
  from public, anon, authenticated;
revoke all on function public.cancel_own_participation(uuid)
  from public, anon, authenticated;
revoke all on function public.confirm_participation_payment(uuid)
  from public, anon, authenticated;
revoke all on function public.set_program_status(uuid, public.program_status)
  from public, anon, authenticated;
revoke all on function public.create_program_record(uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.update_program_record(uuid, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.join_program(uuid) to authenticated;
grant execute on function public.cancel_own_participation(uuid) to authenticated;
grant execute on function public.confirm_participation_payment(uuid) to authenticated;
grant execute on function public.set_program_status(uuid, public.program_status)
  to authenticated;
grant execute on function public.create_program_record(uuid, text, text, jsonb)
  to authenticated;
grant execute on function public.update_program_record(uuid, text, text, jsonb)
  to authenticated;
