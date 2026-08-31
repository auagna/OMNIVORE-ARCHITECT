-- OMNIVORE ARCHITECT v3.3 safe read models.
-- Apply after base -> v3 -> v3.1 -> v3.2. Independent of the remaining v3.3 deltas.

begin;

create or replace function private.oa_can_read_public_program(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.programs p
    where p.id = p_program_id
      and (
        (
          p.status in ('OPEN', 'CLOSED', 'COMPLETED', 'CANCELLED')
          and public.program_has_published_version(p.id)
        )
        or private.oa_manages_program(p.id)
      )
  );
$$;

revoke all on function private.oa_can_read_public_program(uuid) from public;

create or replace function public.list_active_members()
returns table (
  id uuid,
  name text,
  image_media_id uuid,
  occupation text,
  bio text,
  interests text[],
  participating_seasons text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    u.name,
    u.image_media_id,
    u.occupation,
    u.bio,
    u.interests,
    coalesce(
      array_agg(s.name order by s.start_at nulls last, s.name)
        filter (where s.id is not null),
      array[]::text[]
    )
  from public.users u
  left join public.memberships m on m.user_id = u.id
  left join public.seasons s on s.id = m.season_id
  where private.oa_is_active_user()
    and u.status in ('MEMBER', 'ADMIN')
  group by u.id, u.name, u.image_media_id, u.occupation, u.bio, u.interests
  order by u.name, u.id;
$$;

create or replace function public.get_program_host_profile(p_program_id uuid)
returns table (
  id uuid,
  name text,
  image_media_id uuid,
  occupation text,
  bio text,
  interests text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.name, u.image_media_id, u.occupation, u.bio, u.interests
  from public.programs p
  join public.users u on u.id = p.host_id
  where p.id = p_program_id
    and private.oa_can_read_public_program(p.id)
    and u.status in ('MEMBER', 'ADMIN');
$$;

create or replace function public.get_program_participant_counts(p_program_id uuid)
returns table (confirmed_count bigint, waitlist_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) filter (where participation.status = 'CONFIRMED'),
    count(*) filter (where participation.status = 'WAITLIST')
  from public.participations participation
  where participation.program_id = p_program_id
    and private.oa_can_read_public_program(p_program_id);
$$;

create or replace function public.list_program_confirmed_people(p_program_id uuid)
returns table (
  id uuid,
  name text,
  image_media_id uuid,
  occupation text,
  bio text,
  interests text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.name, u.image_media_id, u.occupation, u.bio, u.interests
  from public.participations participation
  join public.users u on u.id = participation.user_id
  where participation.program_id = p_program_id
    and participation.status = 'CONFIRMED'
    and private.oa_can_read_public_program(p_program_id)
    and private.oa_is_active_user()
    and u.status in ('MEMBER', 'ADMIN')
  order by participation.joined_at, u.id;
$$;

create or replace function public.list_program_host_participants(p_program_id uuid)
returns table (
  participation_id uuid,
  participation_status public.participation_status,
  payment_status public.payment_status,
  joined_at timestamptz,
  id uuid,
  name text,
  image_media_id uuid,
  occupation text,
  bio text,
  interests text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.oa_manages_program(p_program_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select
    participation.id,
    participation.status,
    participation.payment_status,
    participation.joined_at,
    u.id,
    u.name,
    u.image_media_id,
    u.occupation,
    u.bio,
    u.interests
  from public.participations participation
  join public.users u on u.id = participation.user_id
  where participation.program_id = p_program_id
    and u.status in ('MEMBER', 'ADMIN')
  order by participation.joined_at, participation.id;
end;
$$;

revoke all on function public.list_active_members() from public;
revoke all on function public.get_program_host_profile(uuid) from public;
revoke all on function public.get_program_participant_counts(uuid) from public;
revoke all on function public.list_program_confirmed_people(uuid) from public;
revoke all on function public.list_program_host_participants(uuid) from public;

grant execute on function public.list_active_members() to authenticated;
grant execute on function public.get_program_host_profile(uuid) to anon, authenticated;
grant execute on function public.get_program_participant_counts(uuid) to anon, authenticated;
grant execute on function public.list_program_confirmed_people(uuid) to authenticated;
grant execute on function public.list_program_host_participants(uuid) to authenticated;

commit;
