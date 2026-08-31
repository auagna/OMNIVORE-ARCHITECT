-- OMNIVORE ARCHITECT v3.4 Admin operations and delta-table privileges.
-- Apply after every v3.3 migration, including TALK Realtime.
--
-- Member approval is intentionally RPC-only: the authenticated browser never
-- receives direct UPDATE privilege on public.users.status. Admin inventory
-- reads remain protected twice, by explicit RPC checks and the existing RLS.

begin;

do $$
begin
  if to_regprocedure('private.oa_is_admin()') is null then
    raise exception 'ADMIN_OPERATIONS_REQUIRE_PRIVATE_ADMIN_HELPER';
  end if;
  if to_regclass('public.users') is null
     or to_regclass('public.memberships') is null
     or to_regclass('public.seasons') is null then
    raise exception 'ADMIN_OPERATIONS_REQUIRE_MEMBER_SCHEMA';
  end if;
end;
$$;

-- Legacy v3.1/v3.2 policies still call this public compatibility helper.
-- Keep its elevated execution surface deterministic and delegate the actual
-- role check to the current private helper.
create or replace function public.is_oa_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.oa_is_admin();
$$;

revoke all on function public.is_oa_admin()
  from public, anon, authenticated;
grant execute on function public.is_oa_admin()
  to anon, authenticated;

-- Delta tables were introduced after the v3.3 base migration's blanket
-- privilege reset. Make their browser-facing privileges deterministic here.
-- Mutation tables stay RPC-only; PageContent is the one deliberate direct,
-- column-limited update because its adapter already relies on RLS for Admin.
alter table public.program_approvals enable row level security;
alter table public.page_content enable row level security;
alter table public.program_activities enable row level security;
alter table public.records enable row level security;
alter table public.record_materials enable row level security;
alter table public.program_revisions enable row level security;

revoke all privileges on table
  public.program_approvals,
  public.page_content,
  public.program_activities,
  public.records,
  public.record_materials,
  public.program_revisions
from public, anon, authenticated;

grant select on table public.program_approvals to authenticated;
grant select on table public.program_activities to authenticated;
grant select on table public.program_revisions to authenticated;
grant select on table public.page_content to anon, authenticated;
grant update (title, headline, description, empty_state, updated_by)
  on table public.page_content to authenticated;
grant select on table public.records, public.record_materials
  to anon, authenticated;

create or replace function public.list_admin_member_registrations()
returns table (
  id uuid,
  name text,
  email text,
  image_media_id uuid,
  occupation text,
  bio text,
  interests text[],
  status public.user_status,
  created_at timestamptz,
  updated_at timestamptz,
  participating_seasons text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;
  if not private.oa_is_admin() then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return query
  select
    u.id,
    u.name,
    u.email,
    u.image_media_id,
    u.occupation,
    u.bio,
    u.interests,
    u.status,
    u.created_at,
    u.updated_at,
    coalesce(
      array_agg(s.name order by s.start_at nulls last, s.name)
        filter (where s.id is not null),
      array[]::text[]
    ) as participating_seasons
  from public.users as u
  left join public.memberships as m on m.user_id = u.id
  left join public.seasons as s on s.id = m.season_id
  group by
    u.id,
    u.name,
    u.email,
    u.image_media_id,
    u.occupation,
    u.bio,
    u.interests,
    u.status,
    u.created_at,
    u.updated_at
  order by
    case u.status
      when 'PENDING'::public.user_status then 0
      when 'MEMBER'::public.user_status then 1
      else 2
    end,
    u.created_at,
    u.id;
end;
$$;

create or replace function public.approve_pending_member(p_user_id uuid)
returns table (
  id uuid,
  name text,
  email text,
  image_media_id uuid,
  occupation text,
  bio text,
  interests text[],
  status public.user_status,
  created_at timestamptz,
  updated_at timestamptz,
  participating_seasons text[]
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_status public.user_status;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;
  if not private.oa_is_admin() then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select u.status
    into current_status
  from public.users as u
  where u.id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'MEMBER_NOT_FOUND';
  end if;
  if current_status <> 'PENDING'::public.user_status then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  -- Keep at least one selected Season attached throughout the approval
  -- transaction; FOR KEY SHARE prevents the qualifying row being deleted
  -- between validation and the status transition.
  perform 1
  from public.memberships as m
  where m.user_id = p_user_id
  for key share;

  if not found then
    raise exception using errcode = '23514', message = 'MEMBERSHIP_REQUIRED';
  end if;

  update public.users as u
  set
    status = 'MEMBER'::public.user_status,
    updated_at = clock_timestamp()
  where u.id = p_user_id;

  return query
  select
    u.id,
    u.name,
    u.email,
    u.image_media_id,
    u.occupation,
    u.bio,
    u.interests,
    u.status,
    u.created_at,
    u.updated_at,
    coalesce(
      array_agg(s.name order by s.start_at nulls last, s.name)
        filter (where s.id is not null),
      array[]::text[]
    ) as participating_seasons
  from public.users as u
  left join public.memberships as m on m.user_id = u.id
  left join public.seasons as s on s.id = m.season_id
  where u.id = p_user_id
  group by
    u.id,
    u.name,
    u.email,
    u.image_media_id,
    u.occupation,
    u.bio,
    u.interests,
    u.status,
    u.created_at,
    u.updated_at;
end;
$$;

revoke all on function public.list_admin_member_registrations()
  from public, anon, authenticated;
revoke all on function public.approve_pending_member(uuid)
  from public, anon, authenticated;
grant execute on function public.list_admin_member_registrations()
  to authenticated;
grant execute on function public.approve_pending_member(uuid)
  to authenticated;

comment on function public.list_admin_member_registrations() is
  'Admin-only member registration inventory with participating Season names.';
comment on function public.approve_pending_member(uuid) is
  'Atomically approves exactly one PENDING member with at least one Membership under row locks.';
comment on function public.is_oa_admin() is
  'Compatibility wrapper for legacy policies; evaluates the current authenticated role.';

commit;
