-- OMNIVORE ARCHITECT ProgramMessage moderation and reaction authorization
-- hardening. Apply after the hidden-message and release seed migrations.
--
-- This migration adds no moderation UI. It exposes one Admin-only, atomic RPC
-- that preserves the ProgramMessage row as the moderation audit source, and it
-- closes the reaction capability check/write TOCTOU window with row locks.

begin;

do $$
begin
  if to_regclass('public.program_messages') is null
     or to_regclass('public.message_reactions') is null
     or to_regclass('public.users') is null
     or to_regclass('public.programs') is null
     or to_regclass('public.participations') is null then
    raise exception 'REACTION_SECURITY_HARDENING_REQUIRES_TALK_SCHEMA';
  end if;

  if to_regprocedure('private.oa_is_admin()') is null
     or to_regprocedure('public.can_write_program_talk(uuid)') is null
     or to_regprocedure('public.toggle_message_reaction(uuid,text)') is null then
    raise exception 'REACTION_SECURITY_HARDENING_REQUIRES_FINAL_CAPABILITIES';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = 'public.program_messages'::regclass
      and attribute.attname = 'is_hidden'
      and not attribute.attisdropped
  ) then
    raise exception 'REACTION_SECURITY_HARDENING_REQUIRES_HIDDEN_STATE';
  end if;
end;
$$;

-- Admin-only soft moderation. The message row and its children are retained;
-- calling the RPC repeatedly with the same desired state returns the same row
-- identity and state instead of creating a second audit artifact.
create or replace function public.set_program_message_hidden(
  p_message_id uuid,
  p_hidden boolean
)
returns table (
  message_id uuid,
  program_id uuid,
  is_hidden boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_message_id uuid;
  v_program_id uuid;
  v_is_hidden boolean;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;

  if p_message_id is null or p_hidden is null then
    raise exception using errcode = '22023', message = 'INVALID_MODERATION_INPUT';
  end if;

  -- Lock the role source before evaluating the private Admin capability so a
  -- concurrent demotion cannot leave this transaction with stale authority.
  perform 1
  from public.users as actor
  where actor.id = v_actor_id
  for share;

  if not found or not private.oa_is_admin() then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select message.id, message.program_id, message.is_hidden
    into v_message_id, v_program_id, v_is_hidden
  from public.program_messages as message
  where message.id = p_message_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'MESSAGE_NOT_FOUND';
  end if;

  if v_is_hidden is distinct from p_hidden then
    update public.program_messages as message
    set is_hidden = p_hidden
    where message.id = v_message_id
    returning message.program_id, message.is_hidden
      into v_program_id, v_is_hidden;
  end if;

  return query
  select v_message_id, v_program_id, v_is_hidden;
end;
$$;

revoke all on function public.set_program_message_hidden(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_program_message_hidden(uuid, boolean)
  to authenticated;

comment on function public.set_program_message_hidden(uuid, boolean) is
  'Admin-only atomic soft moderation. Retains and returns the ProgramMessage audit row identity.';

-- Lock every mutable row that contributes to TALK write capability before
-- evaluating can_write_program_talk and before reaction DML. FOR SHARE blocks
-- status, host, cancellation, and participation mutations until this toggle
-- commits while still allowing concurrent readers.
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

  -- A shared message lock serializes against Admin hide/unhide and hard
  -- deletion before any permission-bearing row is inspected.
  select message.program_id, message.is_hidden
    into v_program_id, v_is_hidden
  from public.program_messages as message
  where message.id = p_message_id
  for share;

  if not found then
    raise exception using errcode = 'P0002', message = 'MESSAGE_NOT_FOUND';
  end if;

  -- User status, Program status/host, and the actor's Participation status are
  -- exactly the mutable inputs read by can_write_program_talk. Holding these
  -- locks through reaction DML closes the stale-permission TOCTOU window.
  perform 1
  from public.users as actor
  where actor.id = v_user_id
  for share;

  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform 1
  from public.programs as program
  where program.id = v_program_id
  for share;

  if not found then
    raise exception using errcode = 'P0002', message = 'PROGRAM_NOT_FOUND';
  end if;

  perform 1
  from public.participations as participation
  where participation.program_id = v_program_id
    and participation.user_id = v_user_id
  for share;

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

revoke all on function public.toggle_message_reaction(uuid, text)
  from public, anon, authenticated;
grant execute on function public.toggle_message_reaction(uuid, text)
  to authenticated;

comment on function public.toggle_message_reaction(uuid, text) is
  'Atomically toggles one allowlisted reaction under locked TALK capability inputs.';

commit;

-- Manual rollback notes:
-- 1. Restore toggle_message_reaction from
--    20260831010000_add_program_message_hidden_state.sql.
-- 2. DROP FUNCTION public.set_program_message_hidden(uuid, boolean);
-- Message rows and reaction data are unchanged by this rollback.
