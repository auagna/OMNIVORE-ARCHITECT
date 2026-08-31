-- OMNIVORE ARCHITECT v3.1 lifecycle delta.
-- Apply after the core `users`, `programs`, `participations`, `program_messages`,
-- and `media` tables exist, and after `supabase-v3.sql` defines is_oa_admin().
-- ProgramActivity is an internal audit source. It is not a member-facing feed.

do $$ begin
  create type public.program_activity_type as enum (
    'CREATED',
    'SUBMITTED',
    'APPROVED',
    'CHANGES_REQUESTED',
    'REJECTED',
    'UPDATED',
    'JOINED',
    'LEFT',
    'WAITLISTED',
    'PAYMENT_CONFIRMED',
    'NOTICE_POSTED',
    'COMPLETED',
    'RECORD_CREATED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.record_material_type as enum ('PHOTO', 'LINK', 'REFERENCE');
exception when duplicate_object then null;
end $$;

create table if not exists public.program_activities (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  type public.program_activity_type not null,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now(),
  constraint program_activity_metadata_is_object
    check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists program_activities_dedupe_key_unique
  on public.program_activities (dedupe_key)
  where dedupe_key is not null;

create index if not exists program_activities_program_created_idx
  on public.program_activities (program_id, created_at desc);

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null unique references public.programs(id) on delete cascade,
  author_id uuid not null references public.users(id),
  what text not null check (nullif(btrim(what), '') is not null),
  found text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint record_found_not_blank
    check (found is null or nullif(btrim(found), '') is not null)
);

-- Upgrade a v3 summary/body Record table in place when it already exists.
alter table public.records add column if not exists what text;
alter table public.records add column if not exists found text;
alter table public.records add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'records' and column_name = 'summary'
  ) then
    execute 'update public.records set what = summary where what is null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'records' and column_name = 'body'
  ) then
    execute 'update public.records set found = body where found is null and nullif(btrim(body), '''') is not null';
  end if;
end $$;

alter table public.records alter column what set not null;

create table if not exists public.record_materials (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records(id) on delete cascade,
  type public.record_material_type not null,
  media_id uuid references public.media(id) on delete set null,
  url text,
  label text,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  constraint record_material_payload_required check (
    (type = 'PHOTO' and media_id is not null)
    or (type in ('LINK', 'REFERENCE') and nullif(btrim(url), '') is not null)
  )
);

create index if not exists record_materials_record_position_idx
  on public.record_materials (record_id, position, created_at);

alter table public.program_activities enable row level security;
alter table public.records enable row level security;
alter table public.record_materials enable row level security;

drop policy if exists "activity visible to host actor or admin" on public.program_activities;
create policy "activity visible to host actor or admin"
on public.program_activities for select
to authenticated
using (
  actor_id = auth.uid()
  or public.is_oa_admin()
  or exists (
    select 1 from public.programs
    where programs.id = program_activities.program_id
      and programs.host_id = auth.uid()
  )
);

-- Activities are appended by trusted route handlers/service-role code. Members
-- cannot manufacture audit history through the client API.
revoke insert, update, delete on public.program_activities from anon, authenticated;

drop policy if exists "records follow program visibility" on public.records;
create policy "records follow program visibility"
on public.records for select
to anon, authenticated
using (
  exists (
    select 1 from public.programs
    where programs.id = records.program_id
      and (
        programs.status in ('OPEN', 'CLOSED', 'COMPLETED', 'CANCELLED')
        or programs.host_id = auth.uid()
        or public.is_oa_admin()
      )
  )
);

drop policy if exists "host creates completed program record" on public.records;
create policy "host creates completed program record"
on public.records for insert
to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.programs
    where programs.id = records.program_id
      and programs.status = 'COMPLETED'
      and (programs.host_id = auth.uid() or public.is_oa_admin())
  )
);

drop policy if exists "record author or admin edits record" on public.records;
drop policy if exists "record manager edits record" on public.records;
create policy "record manager edits record"
on public.records for update
to authenticated
using (
  author_id = auth.uid()
  or public.is_oa_admin()
  or exists (
    select 1 from public.programs
    where programs.id = records.program_id and programs.host_id = auth.uid()
  )
)
with check (
  author_id = auth.uid()
  or public.is_oa_admin()
  or exists (
    select 1 from public.programs
    where programs.id = records.program_id and programs.host_id = auth.uid()
  )
);

drop policy if exists "materials follow record visibility" on public.record_materials;
create policy "materials follow record visibility"
on public.record_materials for select
to anon, authenticated
using (
  exists (
    select 1 from public.records
    join public.programs on programs.id = records.program_id
    where records.id = record_materials.record_id
      and (
        programs.status in ('OPEN', 'CLOSED', 'COMPLETED', 'CANCELLED')
        or programs.host_id = auth.uid()
        or public.is_oa_admin()
      )
  )
);

drop policy if exists "record author or admin creates material" on public.record_materials;
drop policy if exists "record manager creates material" on public.record_materials;
create policy "record manager creates material"
on public.record_materials for insert
to authenticated
with check (
  exists (
    select 1 from public.records
    join public.programs on programs.id = records.program_id
    where records.id = record_materials.record_id
      and (
        records.author_id = auth.uid()
        or public.is_oa_admin()
        or programs.host_id = auth.uid()
      )
  )
);

drop policy if exists "record author or admin updates material" on public.record_materials;
drop policy if exists "record manager updates material" on public.record_materials;
create policy "record manager updates material"
on public.record_materials for update
to authenticated
using (
  exists (
    select 1 from public.records
    join public.programs on programs.id = records.program_id
    where records.id = record_materials.record_id
      and (
        records.author_id = auth.uid()
        or public.is_oa_admin()
        or programs.host_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1 from public.records
    join public.programs on programs.id = records.program_id
    where records.id = record_materials.record_id
      and (
        records.author_id = auth.uid()
        or public.is_oa_admin()
        or programs.host_id = auth.uid()
      )
  )
);

drop policy if exists "record author or admin deletes material" on public.record_materials;
drop policy if exists "record manager deletes material" on public.record_materials;
create policy "record manager deletes material"
on public.record_materials for delete
to authenticated
using (
  exists (
    select 1 from public.records
    join public.programs on programs.id = records.program_id
    where records.id = record_materials.record_id
      and (
        records.author_id = auth.uid()
        or public.is_oa_admin()
        or programs.host_id = auth.uid()
      )
  )
);

create or replace function public.can_read_program_talk(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    join public.programs on programs.id = p_program_id
    where users.id = auth.uid()
      and users.status in ('MEMBER', 'ADMIN')
      and (
        users.status = 'ADMIN'
        or programs.host_id = auth.uid()
        or exists (
          select 1 from public.participations
          where participations.program_id = p_program_id
            and participations.user_id = auth.uid()
            and participations.status in ('CONFIRMED', 'CANCELLED')
        )
      )
  );
$$;

create or replace function public.can_write_program_talk(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    join public.programs on programs.id = p_program_id
    where users.id = auth.uid()
      and users.status in ('MEMBER', 'ADMIN')
      and programs.status <> 'CANCELLED'
      and (
        users.status = 'ADMIN'
        or programs.host_id = auth.uid()
        or exists (
          select 1 from public.participations
          where participations.program_id = p_program_id
            and participations.user_id = auth.uid()
            and participations.status = 'CONFIRMED'
        )
      )
  );
$$;

create or replace function public.can_write_program_notice(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_write_program_talk(p_program_id)
    and (
      public.is_oa_admin()
      or exists (
        select 1 from public.programs
        where programs.id = p_program_id and programs.host_id = auth.uid()
      )
    );
$$;

alter table public.program_messages enable row level security;

drop policy if exists "program talk follows capability" on public.program_messages;
create policy "program talk follows capability"
on public.program_messages for select
to authenticated
using (public.can_read_program_talk(program_id));

drop policy if exists "program talk writes follow capability" on public.program_messages;
create policy "program talk writes follow capability"
on public.program_messages for insert
to authenticated
with check (
  author_id = auth.uid()
  and type in ('NOTICE', 'QUESTION', 'CHAT')
  and public.can_write_program_talk(program_id)
  and (type <> 'NOTICE' or public.can_write_program_notice(program_id))
);

revoke update, delete on public.program_messages from anon, authenticated;

create or replace function public.cancel_own_participation(p_program_id uuid)
returns public.participations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_participation public.participations;
  current_program public.programs;
begin
  select * into current_participation
  from public.participations
  where program_id = p_program_id and user_id = auth.uid()
  for update;

  if current_participation.id is null then
    raise exception 'NOT_FOUND';
  end if;
  if current_participation.status = 'CANCELLED' then
    return current_participation;
  end if;

  select * into current_program from public.programs where id = p_program_id;
  if current_program.status in ('COMPLETED', 'CANCELLED')
     or current_program.start_at <= now() then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.participations
  set status = 'CANCELLED'
  where id = current_participation.id
  returning * into current_participation;

  insert into public.program_activities (
    program_id, actor_id, type, metadata, dedupe_key
  )
  select
    p_program_id,
    auth.uid(),
    'LEFT',
    jsonb_build_object('participationId', current_participation.id),
    'LEFT:' || current_participation.id::text
  where not exists (
    select 1 from public.program_activities
    where dedupe_key = 'LEFT:' || current_participation.id::text
  );

  return current_participation;
end;
$$;

revoke all on function public.can_read_program_talk(uuid) from public;
revoke all on function public.can_write_program_talk(uuid) from public;
revoke all on function public.can_write_program_notice(uuid) from public;
revoke all on function public.cancel_own_participation(uuid) from public;
grant execute on function public.can_read_program_talk(uuid) to authenticated;
grant execute on function public.can_write_program_talk(uuid) to authenticated;
grant execute on function public.can_write_program_notice(uuid) to authenticated;
grant execute on function public.cancel_own_participation(uuid) to authenticated;
