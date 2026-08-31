-- OMNIVORE ARCHITECT / TALK integrity, authorization, and Realtime boundary.
-- Apply after supabase-v3.3-base.sql -> supabase-v3.sql -> supabase-v3.1.sql
-- -> supabase-v3.2.sql -> supabase-v3.3-revision-apply.sql. The final v3.2
-- public capability helpers preserve
-- approval-aware access while a material Program revision is being reviewed.
--
-- Realtime deliberately publishes only ProgramMessage INSERTs at the client
-- boundary. UPDATE and DELETE remain unavailable to member clients; consumers
-- must treat an event as an invalidation signal and refetch through RLS.

do $$
begin
  if to_regclass('public.program_messages') is null then
    raise exception 'TALK_REALTIME_REQUIRES_PROGRAM_MESSAGES';
  end if;
  if to_regclass('public.message_reads') is null then
    raise exception 'TALK_REALTIME_REQUIRES_MESSAGE_READS';
  end if;
  if to_regprocedure('public.can_read_program_talk(uuid)') is null
     or to_regprocedure('public.can_write_program_talk(uuid)') is null
     or to_regprocedure('public.can_write_program_notice(uuid)') is null then
    raise exception 'TALK_REALTIME_REQUIRES_FINAL_CAPABILITY_HELPERS';
  end if;
end;
$$;

-- Keep the migration safe when a bootstrap schema already installed one or
-- more of these invariants under the canonical names.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.program_messages'::regclass
      and conname = 'program_messages_content_not_blank'
  ) then
    alter table public.program_messages
      add constraint program_messages_content_not_blank
      check (length(btrim(content)) > 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.program_messages'::regclass
      and conname = 'program_messages_pinned_notice_only'
  ) then
    alter table public.program_messages
      add constraint program_messages_pinned_notice_only
      check (not is_pinned or type = 'NOTICE') not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.program_messages'::regclass
      and conname = 'program_messages_id_program_id_key'
  ) then
    alter table public.program_messages
      add constraint program_messages_id_program_id_key
      unique (id, program_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.program_messages'::regclass
      and conname = 'program_messages_parent_same_program_fkey'
  ) then
    alter table public.program_messages
      add constraint program_messages_parent_same_program_fkey
      foreign key (parent_id, program_id)
      references public.program_messages (id, program_id)
      on delete cascade;
  end if;
end;
$$;

alter table public.program_messages
  validate constraint program_messages_content_not_blank;
alter table public.program_messages
  validate constraint program_messages_pinned_notice_only;

-- QUESTION owns a single-level reply thread. A reply stays in the same Program
-- (also enforced by the composite FK), cannot target another reply, and cannot
-- itself be a NOTICE.
create or replace function private.oa_enforce_program_message_thread()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_program_id uuid;
  parent_type text;
  parent_parent_id uuid;
begin
  if new.parent_id is null then
    if tg_op = 'UPDATE' then
      if old.parent_id is null
         and old.type::text = 'QUESTION'
         and new.type::text <> 'QUESTION'
         and exists (
           select 1
           from public.program_messages as reply
           where reply.parent_id = old.id
         ) then
        raise exception using
          errcode = '23514',
          message = 'PROGRAM_MESSAGE_QUESTION_WITH_REPLIES_CANNOT_CHANGE_TYPE';
      end if;
    end if;
    return new;
  end if;

  if new.id is not null and new.parent_id = new.id then
    raise exception using
      errcode = '23514',
      message = 'PROGRAM_MESSAGE_CANNOT_REPLY_TO_SELF';
  end if;

  select parent.program_id, parent.type::text, parent.parent_id
    into parent_program_id, parent_type, parent_parent_id
  from public.program_messages as parent
  where parent.id = new.parent_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'PROGRAM_MESSAGE_PARENT_NOT_FOUND';
  end if;

  if parent_program_id <> new.program_id then
    raise exception using
      errcode = '23514',
      message = 'PROGRAM_MESSAGE_PARENT_PROGRAM_MISMATCH';
  end if;

  if parent_type <> 'QUESTION' or parent_parent_id is not null then
    raise exception using
      errcode = '23514',
      message = 'PROGRAM_MESSAGE_PARENT_MUST_BE_ROOT_QUESTION';
  end if;

  if new.type::text = 'NOTICE' then
    raise exception using
      errcode = '23514',
      message = 'PROGRAM_MESSAGE_NOTICE_CANNOT_BE_REPLY';
  end if;

  return new;
end;
$$;

revoke all on function private.oa_enforce_program_message_thread() from public;
revoke all on function private.oa_enforce_program_message_thread() from anon, authenticated;

drop trigger if exists oa_enforce_program_message_thread
  on public.program_messages;
create trigger oa_enforce_program_message_thread
before insert or update of parent_id, program_id, type
on public.program_messages
for each row
execute function private.oa_enforce_program_message_thread();

-- RLS helpers perform the same capability checks as the domain policy:
-- Host/Admin/CONFIRMED may write; only Host/Admin may write NOTICE;
-- CANCELLED participants retain read-only access.
alter table public.program_messages enable row level security;

revoke all on table public.program_messages from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.program_messages from authenticated;
grant select on table public.program_messages to authenticated;
grant insert (program_id, author_id, type, content, parent_id, is_pinned)
  on table public.program_messages to authenticated;

drop policy if exists "program talk follows capability"
  on public.program_messages;
create policy "program talk follows capability"
on public.program_messages
for select
to authenticated
using (public.can_read_program_talk(program_id));

drop policy if exists "program talk writes follow capability"
  on public.program_messages;
create policy "program talk writes follow capability"
on public.program_messages
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and type in ('NOTICE', 'QUESTION', 'CHAT')
  and length(btrim(content)) > 0
  and (not is_pinned or type = 'NOTICE')
  and public.can_write_program_talk(program_id)
  and (type <> 'NOTICE' or public.can_write_program_notice(program_id))
);

-- Read receipts are private to their owner. The nested ProgramMessage lookup
-- is itself RLS-filtered, so a caller cannot mark or inspect an inaccessible
-- Program message by guessing its UUID.
alter table public.message_reads enable row level security;

revoke all on table public.message_reads from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.message_reads from authenticated;
grant select on table public.message_reads to authenticated;
grant insert (message_id, user_id) on table public.message_reads to authenticated;
grant update (read_at) on table public.message_reads to authenticated;

drop policy if exists "member reads own message receipts"
  on public.message_reads;
drop policy if exists "member creates own message receipts"
  on public.message_reads;
drop policy if exists "member updates own message receipts"
  on public.message_reads;
drop policy if exists "message reads belong to reader"
  on public.message_reads;
create policy "message reads belong to reader"
on public.message_reads
for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.program_messages as message
    where message.id = message_reads.message_id
  )
);

drop policy if exists "message reads mark accessible messages"
  on public.message_reads;
create policy "message reads mark accessible messages"
on public.message_reads
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.program_messages as message
    where message.id = message_reads.message_id
  )
);

drop policy if exists "message reads update accessible messages"
  on public.message_reads;
create policy "message reads update accessible messages"
on public.message_reads
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.program_messages as message
    where message.id = message_reads.message_id
  )
);

-- Program-scoped ordering, thread expansion, and user-scoped read receipt
-- lookup are the hot paths added by TALK. The base schema owns Participation
-- indexes used by the capability helpers.
create index if not exists program_messages_program_created_idx
  on public.program_messages (program_id, created_at, id);
create index if not exists program_messages_pinned_notice_idx
  on public.program_messages (program_id, created_at desc, id)
  where type = 'NOTICE' and is_pinned;
create index if not exists program_messages_parent_created_idx
  on public.program_messages (parent_id, created_at, id)
  where parent_id is not null;
create index if not exists message_reads_user_message_idx
  on public.message_reads (user_id, message_id);

-- Mentions are optional in the bootstrap schema. If present, support the
-- user-scoped Inbox lookup without making it a Realtime publication.
do $$
begin
  if to_regclass('public.program_message_mentions') is not null then
    execute 'create index if not exists program_message_mentions_user_message_idx
      on public.program_message_mentions (user_id, message_id)';
  end if;
end;
$$;

-- Supabase creates this publication in hosted projects, but local/fresh
-- environments may not have it. Register ProgramMessage exactly once.
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'program_messages'
  ) then
    alter publication supabase_realtime
      add table public.program_messages;
  end if;
end;
$$;
