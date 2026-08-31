-- OMNIVORE ARCHITECT / empty-project base schema
-- Apply before: supabase-v3.sql -> supabase-v3.1.sql -> supabase-v3.2.sql.
-- Approval/revision, Record/Activity, and PageContent remain owned by those
-- existing deltas. Derived UI states are deliberately not persisted here.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

do $$ begin
  create type public.user_status as enum ('PENDING', 'MEMBER', 'ADMIN');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.program_type as enum ('TALK', 'READING', 'GATHERING');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.program_status as enum
    ('DRAFT', 'OPEN', 'CLOSED', 'COMPLETED', 'CANCELLED');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.gathering_category as enum
    ('CASUAL', 'WORKSHOP', 'FIELD_TRIP', 'EXHIBITION', 'STUDY', 'DINING', 'OTHER');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.gathering_cost_type as enum
    ('FREE', 'INDIVIDUAL_PURCHASE', 'HOST_COLLECT');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.talk_origin as enum ('OMNIVORE', 'EXTERNAL');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.talk_registration_type as enum ('NONE', 'EXTERNAL', 'OMNIVORE');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.participation_status as enum
    ('APPLIED', 'CONFIRMED', 'WAITLIST', 'CANCELLED');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_status as enum ('NOT_REQUIRED', 'PENDING', 'PAID');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.message_type as enum ('NOTICE', 'QUESTION', 'CHAT');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.media_tone_preset as enum ('OA_NEUTRAL', 'MONOCHROME', 'ORIGINAL');
exception when duplicate_object then null; end $$;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  occupation text,
  bio text,
  interests text[] not null default '{}',
  status public.user_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_name_not_blank check (nullif(btrim(name), '') is not null),
  constraint users_email_not_blank check (nullif(btrim(email), '') is not null),
  constraint users_interests_have_no_null check (array_position(interests, null) is null)
);
create unique index users_email_lower_key on public.users (lower(email));
create index users_status_name_idx on public.users (status, name);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_at timestamptz,
  end_at timestamptz,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasons_name_not_blank check (nullif(btrim(name), '') is not null),
  constraint seasons_time_order check
    (start_at is null or end_at is null or end_at > start_at)
);
create unique index seasons_name_lower_key on public.seasons (lower(name));
create unique index seasons_one_current_idx on public.seasons ((true)) where is_current;

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  -- Descriptive only. Authorization comes from users.status; Host is programs.host_id.
  role text,
  created_at timestamptz not null default now(),
  constraint memberships_user_season_key unique (user_id, season_id),
  constraint memberships_role_not_blank check
    (role is null or nullif(btrim(role), '') is not null)
);
create index memberships_season_user_idx on public.memberships (season_id, user_id);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type public.program_type not null,
  title text not null,
  description text not null default '',
  host_id uuid not null references public.users(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz,
  location text not null,
  map_url text,
  capacity integer,
  status public.program_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programs_id_type_key unique (id, type),
  constraint programs_code_shape check (code ~ '^OA / [TRG][0-9]{3,}$'),
  constraint programs_code_matches_type check (
    (type = 'TALK' and code ~ '^OA / T') or
    (type = 'READING' and code ~ '^OA / R') or
    (type = 'GATHERING' and code ~ '^OA / G')
  ),
  constraint programs_title_not_blank check (nullif(btrim(title), '') is not null),
  constraint programs_location_not_blank check (nullif(btrim(location), '') is not null),
  constraint programs_gathering_description_required check
    (type <> 'GATHERING' or nullif(btrim(description), '') is not null),
  constraint programs_time_order check (end_at is null or end_at > start_at),
  constraint programs_capacity_positive check (capacity is null or capacity > 0),
  constraint programs_gathering_capacity_required check
    (type <> 'GATHERING' or capacity is not null),
  constraint programs_map_url_http check (map_url is null or map_url ~* '^https?://')
);
create index programs_status_start_idx on public.programs (status, start_at);
create index programs_type_status_start_idx on public.programs (type, status, start_at);
create index programs_host_updated_idx on public.programs (host_id, updated_at desc);

create table public.gathering_details (
  program_id uuid primary key,
  detail_type public.program_type generated always as ('GATHERING'::public.program_type) stored,
  category public.gathering_category not null,
  meeting_point text,
  recruitment_deadline timestamptz,
  waitlist_enabled boolean not null default true,
  cost_type public.gathering_cost_type not null default 'FREE',
  estimated_price bigint,
  purchase_url text,
  purchase_note text,
  participation_fee bigint,
  fee_includes text,
  payment_deadline timestamptz,
  cancellation_policy text,
  bring_items text,
  notice text,
  constraint gathering_details_program_type_fkey
    foreign key (program_id, detail_type)
    references public.programs(id, type) on delete cascade,
  constraint gathering_details_estimated_price_nonnegative check
    (estimated_price is null or estimated_price >= 0),
  constraint gathering_details_participation_fee_positive check
    (participation_fee is null or participation_fee > 0),
  constraint gathering_details_purchase_url_http check
    (purchase_url is null or purchase_url ~* '^https?://'),
  constraint gathering_details_cost_payload check (
    (cost_type = 'FREE' and estimated_price is null and purchase_url is null
      and purchase_note is null and participation_fee is null and fee_includes is null
      and payment_deadline is null and cancellation_policy is null)
    or
    (cost_type = 'INDIVIDUAL_PURCHASE' and participation_fee is null
      and fee_includes is null and payment_deadline is null and cancellation_policy is null)
    or
    (cost_type = 'HOST_COLLECT' and participation_fee is not null
      and estimated_price is null and purchase_url is null and purchase_note is null)
  )
);
create index gathering_details_category_idx on public.gathering_details (category);
create index gathering_details_recruitment_idx
  on public.gathering_details (recruitment_deadline)
  where recruitment_deadline is not null;

-- RLS is row-based, so bank/account text cannot safely share the public detail row.
create table public.gathering_payment_instructions (
  program_id uuid primary key references public.gathering_details(program_id) on delete cascade,
  payment_info text not null,
  updated_at timestamptz not null default now(),
  constraint gathering_payment_info_not_blank check
    (nullif(btrim(payment_info), '') is not null)
);

create table public.talk_details (
  program_id uuid primary key,
  detail_type public.program_type generated always as ('TALK'::public.program_type) stored,
  origin public.talk_origin not null,
  subtitle text,
  speaker_name text not null,
  speaker_affiliation text,
  speaker_bio text,
  organizer text,
  address text,
  source_url text,
  registration_type public.talk_registration_type not null default 'NONE',
  registration_url text,
  constraint talk_details_program_type_fkey foreign key (program_id, detail_type)
    references public.programs(id, type) on delete cascade,
  constraint talk_details_speaker_not_blank check
    (nullif(btrim(speaker_name), '') is not null),
  constraint talk_details_source_url_http check
    (source_url is null or source_url ~* '^https?://'),
  constraint talk_details_registration_url_http check
    (registration_url is null or registration_url ~* '^https?://')
);

create table public.reading_details (
  program_id uuid primary key,
  detail_type public.program_type generated always as ('READING'::public.program_type) stored,
  resource_title text,
  constraint reading_details_program_type_fkey foreign key (program_id, detail_type)
    references public.programs(id, type) on delete cascade,
  constraint reading_details_resource_not_blank check
    (resource_title is null or nullif(btrim(resource_title), '') is not null)
);

create table public.participations (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status public.participation_status not null,
  payment_status public.payment_status not null default 'NOT_REQUIRED',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participations_program_user_key unique (program_id, user_id),
  constraint participations_waitlist_not_payable check
    (status <> 'WAITLIST' or payment_status = 'NOT_REQUIRED')
);
create index participations_program_status_idx on public.participations (program_id, status);
create index participations_user_status_idx
  on public.participations (user_id, status, joined_at desc);
create index participations_pending_payment_idx
  on public.participations (program_id, payment_status)
  where status = 'CONFIRMED' and payment_status = 'PENDING';

-- Only processed derivative metadata is public. Sources are separately restricted.
create table public.media (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references public.users(id) on delete restrict,
  storage_bucket text not null default 'oa-media',
  storage_path text not null unique,
  focal_x double precision not null default 0.5 check (focal_x between 0 and 1),
  focal_y double precision not null default 0.5 check (focal_y between 0 and 1),
  tone_preset public.media_tone_preset not null default 'OA_NEUTRAL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_bucket_not_blank check (nullif(btrim(storage_bucket), '') is not null),
  constraint media_path_not_blank check (nullif(btrim(storage_path), '') is not null)
);
create index media_uploaded_created_idx on public.media (uploaded_by, created_at desc);

create table public.media_sources (
  media_id uuid primary key references public.media(id) on delete cascade,
  original_url text,
  source_bucket text,
  source_path text,
  created_at timestamptz not null default now(),
  constraint media_sources_payload check (
    nullif(btrim(original_url), '') is not null or
    (nullif(btrim(source_bucket), '') is not null and nullif(btrim(source_path), '') is not null)
  ),
  constraint media_sources_original_url_http check
    (original_url is null or original_url ~* '^https?://')
);

alter table public.users
  add column image_media_id uuid references public.media(id) on delete set null;
alter table public.programs
  add column cover_image_id uuid references public.media(id) on delete set null;
create index users_image_media_idx on public.users (image_media_id)
  where image_media_id is not null;
create index programs_cover_media_idx on public.programs (cover_image_id)
  where cover_image_id is not null;

create table public.program_messages (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete restrict,
  type public.message_type not null default 'CHAT',
  content text not null,
  parent_id uuid,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint program_messages_id_program_id_key unique (id, program_id),
  constraint program_messages_parent_same_program_fkey
    foreign key (parent_id, program_id)
    references public.program_messages(id, program_id) on delete cascade,
  constraint program_messages_content_not_blank check
    (nullif(btrim(content), '') is not null),
  constraint program_messages_pinned_notice_only check
    (not is_pinned or type = 'NOTICE'),
  constraint program_messages_edit_time_order check
    (edited_at is null or edited_at >= created_at)
);
create index program_messages_program_created_idx
  on public.program_messages (program_id, created_at);
create index program_messages_parent_created_idx
  on public.program_messages (parent_id, created_at) where parent_id is not null;
create index program_messages_pinned_notice_idx
  on public.program_messages (program_id, created_at desc)
  where type = 'NOTICE' and is_pinned;

create table public.message_reads (
  message_id uuid not null references public.program_messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index message_reads_user_read_idx on public.message_reads (user_id, read_at desc);

-- Existing @Member behavior support; this is not DM or a standalone feed.
create table public.program_message_mentions (
  message_id uuid not null references public.program_messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index program_message_mentions_user_created_idx
  on public.program_message_mentions (user_id, created_at desc);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint tags_name_not_blank check (nullif(btrim(name), '') is not null)
);
create unique index tags_name_lower_key on public.tags (lower(name));

create table public.program_tags (
  program_id uuid not null references public.programs(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (program_id, tag_id)
);
create index program_tags_tag_program_idx on public.program_tags (tag_id, program_id);

create or replace function private.oa_handle_new_auth_user()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  insert into public.users (id, name, email, status)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'OA MEMBER'),
    new.email,
    'PENDING'
  ) on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists oa_auth_user_created on auth.users;
create trigger oa_auth_user_created after insert on auth.users
for each row execute function private.oa_handle_new_auth_user();

create or replace function private.oa_current_user_status()
returns public.user_status language sql stable security definer
set search_path = pg_catalog, public as $$
  select status from public.users where id = auth.uid();
$$;

create or replace function private.oa_is_pending_user()
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select coalesce(private.oa_current_user_status() = 'PENDING', false);
$$;

create or replace function private.oa_is_active_user()
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select coalesce(private.oa_current_user_status() in ('MEMBER', 'ADMIN'), false);
$$;

create or replace function private.oa_is_admin()
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select coalesce(private.oa_current_user_status() = 'ADMIN', false);
$$;

create or replace function private.oa_can_view_program(p_program_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.programs p
    where p.id = p_program_id and (
      p.status <> 'DRAFT' or
      (private.oa_is_active_user() and
        (private.oa_is_admin() or p.host_id = auth.uid()))
    )
  );
$$;

create or replace function private.oa_manages_program(p_program_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select private.oa_is_active_user() and exists (
    select 1 from public.programs p where p.id = p_program_id
      and (private.oa_is_admin() or p.host_id = auth.uid())
  );
$$;

create or replace function private.oa_can_read_payment_info(p_program_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select private.oa_is_active_user() and (
    private.oa_manages_program(p_program_id) or exists (
      select 1 from public.participations x
      where x.program_id = p_program_id and x.user_id = auth.uid()
        and x.status = 'CONFIRMED'
    )
  );
$$;

create or replace function private.oa_can_read_program_talk(p_program_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select private.oa_is_active_user() and exists (
    select 1 from public.programs p where p.id = p_program_id and (
      private.oa_is_admin() or p.host_id = auth.uid() or (
        p.status in ('OPEN', 'CLOSED', 'COMPLETED', 'CANCELLED') and exists (
          select 1 from public.participations x
          where x.program_id = p_program_id and x.user_id = auth.uid()
            and x.status in ('CONFIRMED', 'CANCELLED')
        )
      )
    )
  );
$$;

create or replace function private.oa_can_write_program_talk(p_program_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select private.oa_is_active_user() and exists (
    select 1 from public.programs p where p.id = p_program_id
      and p.status <> 'CANCELLED' and (
        private.oa_is_admin() or p.host_id = auth.uid() or (
          p.status in ('OPEN', 'CLOSED', 'COMPLETED') and exists (
            select 1 from public.participations x
            where x.program_id = p_program_id and x.user_id = auth.uid()
              and x.status = 'CONFIRMED'
          )
        )
      )
  );
$$;

create or replace function private.oa_can_write_program_notice(p_program_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select private.oa_can_write_program_talk(p_program_id)
    and private.oa_manages_program(p_program_id);
$$;

revoke execute on all functions in schema private from public;
grant execute on function private.oa_current_user_status() to authenticated;
grant execute on function private.oa_is_pending_user() to authenticated;
grant execute on function private.oa_is_active_user() to authenticated;
grant execute on function private.oa_is_admin() to authenticated;
grant execute on function private.oa_can_view_program(uuid) to anon, authenticated;
grant execute on function private.oa_manages_program(uuid) to authenticated;
grant execute on function private.oa_can_read_payment_info(uuid) to authenticated;
grant execute on function private.oa_can_read_program_talk(uuid) to authenticated;
grant execute on function private.oa_can_write_program_talk(uuid) to authenticated;
grant execute on function private.oa_can_write_program_notice(uuid) to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'users','seasons','memberships','programs','gathering_details',
    'gathering_payment_instructions','talk_details','reading_details',
    'participations','media','media_sources','program_messages','message_reads',
    'program_message_mentions','tags','program_tags'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end $$;

grant select on public.users to authenticated;
grant update (name, image_media_id, occupation, bio, interests) on public.users to authenticated;
grant select on public.seasons to anon, authenticated;
grant select, insert, delete on public.memberships to authenticated;
grant select on public.programs, public.gathering_details,
  public.talk_details, public.reading_details to anon, authenticated;
grant select on public.gathering_payment_instructions, public.participations to authenticated;
grant select on public.media to anon, authenticated;
grant insert (uploaded_by, storage_bucket, storage_path, focal_x, focal_y, tone_preset)
  on public.media to authenticated;
grant select, insert, update, delete on public.media_sources to authenticated;
grant select on public.program_messages to authenticated;
grant insert (program_id, author_id, type, content, parent_id, is_pinned)
  on public.program_messages to authenticated;
grant select, insert, update on public.message_reads to authenticated;
grant select on public.program_message_mentions to authenticated;
grant select on public.tags, public.program_tags to anon, authenticated;

create policy "users read own row or admin reads all" on public.users
for select to authenticated using (id = auth.uid() or private.oa_is_admin());
create policy "users update own safe profile or admin" on public.users
for update to authenticated using (id = auth.uid() or private.oa_is_admin())
with check (id = auth.uid() or private.oa_is_admin());

create policy "seasons are readable" on public.seasons
for select to anon, authenticated using (true);
create policy "memberships visible to owner or admin" on public.memberships
for select to authenticated using (user_id = auth.uid() or private.oa_is_admin());
create policy "pending users choose own seasons" on public.memberships
for insert to authenticated with check
  ((user_id = auth.uid() and private.oa_is_pending_user()) or private.oa_is_admin());
create policy "pending users remove own seasons" on public.memberships
for delete to authenticated using
  ((user_id = auth.uid() and private.oa_is_pending_user()) or private.oa_is_admin());

create policy "program visibility follows lifecycle" on public.programs
for select to anon, authenticated using (private.oa_can_view_program(id));
create policy "gathering detail follows program visibility" on public.gathering_details
for select to anon, authenticated using (private.oa_can_view_program(program_id));
create policy "talk detail follows program visibility" on public.talk_details
for select to anon, authenticated using (private.oa_can_view_program(program_id));
create policy "reading detail follows program visibility" on public.reading_details
for select to anon, authenticated using (private.oa_can_view_program(program_id));
create policy "payment instructions follow payment capability"
on public.gathering_payment_instructions for select to authenticated
using (private.oa_can_read_payment_info(program_id));
create policy "participation visible to owner or manager" on public.participations
for select to authenticated using
  (user_id = auth.uid() or private.oa_manages_program(program_id));

create policy "processed media metadata is public" on public.media
for select to anon, authenticated using (true);
create policy "active users register own processed media" on public.media
for insert to authenticated with check
  (uploaded_by = auth.uid() and private.oa_is_active_user());
create policy "media source visible to uploader or admin" on public.media_sources
for select to authenticated using (private.oa_is_admin() or exists (
  select 1 from public.media m where m.id = media_id and m.uploaded_by = auth.uid()
));
create policy "media source created by uploader or admin" on public.media_sources
for insert to authenticated with check (private.oa_is_admin() or exists (
  select 1 from public.media m where m.id = media_id and m.uploaded_by = auth.uid()
));
create policy "media source updated by uploader or admin" on public.media_sources
for update to authenticated using (private.oa_is_admin() or exists (
  select 1 from public.media m where m.id = media_id and m.uploaded_by = auth.uid()
)) with check (private.oa_is_admin() or exists (
  select 1 from public.media m where m.id = media_id and m.uploaded_by = auth.uid()
));
create policy "media source deleted by uploader or admin" on public.media_sources
for delete to authenticated using (private.oa_is_admin() or exists (
  select 1 from public.media m where m.id = media_id and m.uploaded_by = auth.uid()
));

-- v3.1 deliberately drops/replaces these two names with approval-aware helpers.
create policy "program talk follows capability" on public.program_messages
for select to authenticated using (private.oa_can_read_program_talk(program_id));
create policy "program talk writes follow capability" on public.program_messages
for insert to authenticated with check (
  author_id = auth.uid() and private.oa_can_write_program_talk(program_id)
  and (type <> 'NOTICE' or private.oa_can_write_program_notice(program_id))
);
create policy "message reads belong to reader" on public.message_reads
for select to authenticated using (user_id = auth.uid());
create policy "message reads mark accessible messages" on public.message_reads
for insert to authenticated with check (user_id = auth.uid() and exists (
  select 1 from public.program_messages m where m.id = message_id
    and private.oa_can_read_program_talk(m.program_id)
));
create policy "message reads update accessible messages" on public.message_reads
for update to authenticated using (user_id = auth.uid())
with check (user_id = auth.uid() and exists (
  select 1 from public.program_messages m where m.id = message_id
    and private.oa_can_read_program_talk(m.program_id)
));
create policy "mentions visible to mentioned user" on public.program_message_mentions
for select to authenticated using (user_id = auth.uid());

create policy "tags are readable" on public.tags
for select to anon, authenticated using (true);
create policy "program tags follow program visibility" on public.program_tags
for select to anon, authenticated using (private.oa_can_view_program(program_id));

comment on table public.gathering_payment_instructions is
  'Restricted HOST_COLLECT instructions; never expose through a public Program DTO.';
comment on table public.program_message_mentions is
  'Program-scoped @mention support for Messages; not a DirectMessage model.';
