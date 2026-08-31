-- OMNIVORE ARCHITECT ProgramMessage moderation visibility.
--
-- This additive migration follows the reaction migration. Hard deletion stays
-- unchanged; is_hidden provides a non-destructive moderation state without
-- adding a new message type or an Admin UI surface.

begin;

do $$
begin
  if to_regclass('public.program_messages') is null
     or to_regclass('public.message_reactions') is null then
    raise exception 'MESSAGE_HIDDEN_STATE_REQUIRES_TALK_AND_REACTIONS';
  end if;

  if to_regprocedure('public.can_read_program_talk(uuid)') is null
     or to_regprocedure('public.can_write_program_talk(uuid)') is null
     or to_regprocedure('public.is_oa_admin()') is null then
    raise exception 'MESSAGE_HIDDEN_STATE_REQUIRES_FINAL_CAPABILITIES';
  end if;
end;
$$;

alter table public.program_messages
  add column if not exists is_hidden boolean not null default false;

create index if not exists program_messages_visible_program_created_idx
  on public.program_messages (program_id, created_at, id)
  where not is_hidden;

-- A moderator can still inspect hidden rows through the Admin repository.
-- Normal TALK reads exclude them at RLS even if a caller omits an app filter.
drop policy if exists "program talk follows capability"
  on public.program_messages;
create policy "program talk follows capability"
on public.program_messages
for select
to authenticated
using (
  public.can_read_program_talk(program_id)
  and (not is_hidden or public.is_oa_admin())
);

-- Mention rows can otherwise disclose that a moderated message existed even
-- after the message itself is hidden. Keep the Inbox owner scope, allow Admin
-- moderation inspection, and require the referenced message to remain visible
-- to the same caller.
drop policy if exists "mentions visible to mentioned user"
  on public.program_message_mentions;
create policy "mentions visible to mentioned user"
on public.program_message_mentions
for select
to authenticated
using (
  (user_id = (select auth.uid()) or private.oa_is_admin())
  and exists (
    select 1
    from public.program_messages as message
    where message.id = program_message_mentions.message_id
      and (not message.is_hidden or private.oa_is_admin())
  )
);

-- Reaction metadata follows message visibility. Admin inspection remains
-- possible, while the member-facing batch below also omits hidden targets.
drop policy if exists "program talk readers view message reactions"
  on public.message_reactions;
create policy "program talk readers view message reactions"
on public.message_reactions
for select
to authenticated
using (
  public.can_read_program_talk(program_id)
  and exists (
    select 1
    from public.program_messages as message
    where message.id = message_reactions.message_id
      and message.program_id = message_reactions.program_id
      and (not message.is_hidden or public.is_oa_admin())
  )
);

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
  join public.program_messages as message
    on message.id = reaction.message_id
   and message.program_id = reaction.program_id
  join public.users as member on member.id = reaction.user_id
  left join lateral (
    select array_agg(season.name order by season.start_at nulls last, season.name) as names
    from public.memberships as membership
    join public.seasons as season on season.id = membership.season_id
    where membership.user_id = reaction.user_id
  ) as season_list on true
  where reaction.program_id = p_program_id
    and (not message.is_hidden or public.is_oa_admin())
    and (
      p_message_ids is null
      or reaction.message_id = any(p_message_ids)
    )
  order by reaction.message_id, reaction.created_at, reaction.id;
end;
$$;

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
  v_is_hidden boolean;
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

  select message.program_id, message.is_hidden
    into v_program_id, v_is_hidden
  from public.program_messages as message
  where message.id = p_message_id
  for key share;

  if not found then
    raise exception using errcode = 'P0002', message = 'MESSAGE_NOT_FOUND';
  end if;

  if v_is_hidden then
    raise exception using errcode = '42501', message = 'MESSAGE_NOT_REACTABLE';
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
    set emoji = p_emoji, updated_at = v_now
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

comment on column public.program_messages.is_hidden is
  'Soft moderation state. Hidden messages remain auditable but are not interactive in member TALK.';

commit;

-- Manual rollback notes:
-- 1. Restore the previous list_program_message_reactions and
--    toggle_message_reaction definitions from 20260831000000.
-- 2. Restore the previous ProgramMessage, ProgramMessageMention, and
--    MessageReaction SELECT policies.
-- 3. DROP INDEX public.program_messages_visible_program_created_idx;
-- 4. ALTER TABLE public.program_messages DROP COLUMN is_hidden;
-- Export moderated rows before removing this audit state.
