-- OMNIVORE ARCHITECT message reactions.
--
-- Apply after `supabase-v3.4-admin-operations.sql`. This migration keeps
-- reactions as lightweight Program TALK metadata: it does not create a new
-- message type, inbox event, activity feed item, or DirectMessage surface.
--
-- Realtime deliberately uses a private Broadcast topic instead of adding
-- message_reactions to the `supabase_realtime` Postgres Changes publication.
-- Supabase Realtime Settings must have public channel access disabled, and
-- clients must authenticate before joining `oa-program-talk:<program_id>`.

begin;

do $$
begin
  if to_regclass('public.program_messages') is null
     or to_regclass('public.users') is null
     or to_regclass('public.memberships') is null
     or to_regclass('public.seasons') is null then
    raise exception 'MESSAGE_REACTIONS_REQUIRE_TALK_AND_MEMBER_SCHEMA';
  end if;

  if to_regprocedure('public.can_read_program_talk(uuid)') is null
     or to_regprocedure('public.can_write_program_talk(uuid)') is null then
    raise exception 'MESSAGE_REACTIONS_REQUIRE_FINAL_TALK_CAPABILITIES';
  end if;

  if to_regclass('realtime.messages') is null then
    raise exception 'MESSAGE_REACTIONS_REQUIRE_REALTIME_MESSAGES';
  end if;
end;
$$;

create table public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  program_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_reactions_message_user_key unique (message_id, user_id),
  constraint message_reactions_message_program_fkey
    foreign key (message_id, program_id)
    references public.program_messages(id, program_id)
    on delete cascade,
  constraint message_reactions_emoji_allowlist check (
    emoji in ('👍', '❤️', '😂', '😮', '👏', '✅')
  ),
  constraint message_reactions_update_time_order check
    (updated_at >= created_at)
);

create index message_reactions_program_message_idx
  on public.message_reactions (program_id, message_id, emoji, created_at, id);

alter table public.message_reactions enable row level security;

revoke all on table public.message_reactions from public, anon, authenticated;
grant select on table public.message_reactions to authenticated;

create policy "program talk readers view message reactions"
on public.message_reactions
for select
to authenticated
using (public.can_read_program_talk(program_id));

-- Returns every reaction needed by the message list and Reaction Users Sheet
-- in one authorized batch. The optional filter reduces payload without ever
-- allowing a caller to cross the Program boundary.
create or replace function public.list_program_message_reactions(
  p_program_id uuid,
  p_message_ids uuid[] default null
)
returns table (
  id uuid,
  program_id uuid,
  message_id uuid,
  user_id uuid,
  emoji text,
  created_at timestamptz,
  updated_at timestamptz,
  user_name text,
  image_media_id uuid,
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

  if not public.can_read_program_talk(p_program_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return query
  select
    reaction.id,
    reaction.program_id,
    reaction.message_id,
    reaction.user_id,
    reaction.emoji,
    reaction.created_at,
    reaction.updated_at,
    member.name as user_name,
    member.image_media_id,
    coalesce(season_list.names, array[]::text[]) as participating_seasons
  from public.message_reactions as reaction
  join public.users as member on member.id = reaction.user_id
  left join lateral (
    select array_agg(season.name order by season.start_at nulls last, season.name) as names
    from public.memberships as membership
    join public.seasons as season on season.id = membership.season_id
    where membership.user_id = reaction.user_id
  ) as season_list on true
  where reaction.program_id = p_program_id
    and (
      p_message_ids is null
      or reaction.message_id = any(p_message_ids)
    )
  order by reaction.message_id, reaction.created_at, reaction.id;
end;
$$;

-- Serializing on the authenticated user/message pair makes rapid repeat taps
-- deterministic. It also prevents a concurrent first reaction from surfacing
-- a unique-constraint error that belongs to another domain operation.
create or replace function public.toggle_message_reaction(
  p_message_id uuid,
  p_emoji text
)
returns setof public.message_reactions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_program_id uuid;
  v_existing public.message_reactions%rowtype;
  v_result public.message_reactions%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;

  if p_emoji is null
     or p_emoji not in ('👍', '❤️', '😂', '😮', '👏', '✅') then
    raise exception using errcode = '22023', message = 'INVALID_REACTION_EMOJI';
  end if;

  select message.program_id
    into v_program_id
  from public.program_messages as message
  where message.id = p_message_id
  for key share;

  if not found then
    raise exception using errcode = 'P0002', message = 'MESSAGE_NOT_FOUND';
  end if;

  if not public.can_write_program_talk(v_program_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_message_id::text || ':' || v_user_id::text,
      0
    )
  );

  select reaction.*
    into v_existing
  from public.message_reactions as reaction
  where reaction.message_id = p_message_id
    and reaction.user_id = v_user_id
  for update;

  if found and v_existing.emoji = p_emoji then
    delete from public.message_reactions as reaction
    where reaction.id = v_existing.id;
    return;
  end if;

  if found then
    update public.message_reactions as reaction
    set
      emoji = p_emoji,
      updated_at = v_now
    where reaction.id = v_existing.id
    returning reaction.* into v_result;
  else
    insert into public.message_reactions (
      message_id,
      program_id,
      user_id,
      emoji,
      created_at,
      updated_at
    ) values (
      p_message_id,
      v_program_id,
      v_user_id,
      p_emoji,
      v_now,
      v_now
    )
    returning * into v_result;
  end if;

  return next v_result;
  return;
end;
$$;

revoke all on function public.list_program_message_reactions(uuid, uuid[])
  from public, anon, authenticated;
revoke all on function public.toggle_message_reaction(uuid, text)
  from public, anon, authenticated;
grant execute on function public.list_program_message_reactions(uuid, uuid[])
  to authenticated;
grant execute on function public.toggle_message_reaction(uuid, text)
  to authenticated;

comment on table public.message_reactions is
  'One current emoji reaction per ProgramMessage and member; TALK metadata, not a message.';
comment on function public.list_program_message_reactions(uuid, uuid[]) is
  'TALK-authorized batch reaction rows enriched for counts and the Reaction Users Sheet.';
comment on function public.toggle_message_reaction(uuid, text) is
  'Atomically adds, changes, or removes the authenticated member reaction.';

-- The same Program TALK topic already scopes ProgramMessage invalidations.
-- Reaction broadcasts carry INSERT/UPDATE/DELETE solely as refetch signals;
-- clients must refetch through the authorized batch RPC.
create or replace function private.oa_broadcast_message_reaction_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program_id uuid := coalesce(new.program_id, old.program_id);
begin
  perform realtime.broadcast_changes(
    'oa-program-talk:' || v_program_id::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

revoke all on function private.oa_broadcast_message_reaction_change()
  from public, anon, authenticated;

create trigger oa_broadcast_message_reaction_change
after insert or update or delete
on public.message_reactions
for each row
execute function private.oa_broadcast_message_reaction_change();

drop policy if exists "program talk readers receive reaction broadcasts"
  on realtime.messages;
create policy "program talk readers receive reaction broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1
    from public.programs as program
    where (select realtime.topic()) =
      'oa-program-talk:' || program.id::text
      and public.can_read_program_talk(program.id)
  )
);

-- Participant identities are Program TALK data. Public Program visibility by
-- itself is insufficient; only Host/Admin/CONFIRMED and read-only CANCELLED
-- participants may resolve the confirmed People list.
create or replace function public.list_program_confirmed_people(p_program_id uuid)
returns table (
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
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;

  if not public.can_read_program_talk(p_program_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return query
  select
    member.id,
    member.name,
    member.image_media_id,
    member.occupation,
    member.bio,
    member.interests
  from public.participations as participation
  join public.users as member on member.id = participation.user_id
  where participation.program_id = p_program_id
    and participation.status = 'CONFIRMED'
    and member.status in ('MEMBER', 'ADMIN')
  order by participation.joined_at, member.id;
end;
$$;

revoke all on function public.list_program_confirmed_people(uuid)
  from public, anon, authenticated;
grant execute on function public.list_program_confirmed_people(uuid)
  to authenticated;

commit;

-- Manual rollback notes (destructive; preserve exported reaction data first):
-- 1. DROP TRIGGER oa_broadcast_message_reaction_change
--      ON public.message_reactions;
-- 2. DROP FUNCTION private.oa_broadcast_message_reaction_change();
-- 3. DROP POLICY "program talk readers receive reaction broadcasts"
--      ON realtime.messages;
-- 4. DROP FUNCTION public.toggle_message_reaction(uuid, text);
-- 5. DROP FUNCTION public.list_program_message_reactions(uuid, uuid[]);
-- 6. DROP TABLE public.message_reactions;
-- Keep the TALK-gated list_program_confirmed_people definition. Restoring its
-- former public-Program gate would reintroduce participant identity exposure.
