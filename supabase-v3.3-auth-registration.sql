-- OMNIVORE ARCHITECT v3.3 — password registration profile bootstrap
-- Dependency: apply after supabase-v3.3-base.sql.
-- The auth.users insert and these profile/membership inserts share one
-- transaction. Any invalid name or season selection rejects the registration.

begin;

create or replace function private.oa_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_email text;
  v_season_ids uuid[];
  v_requested_count integer;
  v_existing_count integer;
begin
  v_name := nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'name'), '');
  v_email := nullif(pg_catalog.btrim(pg_catalog.coalesce(new.email, '')), '');

  if v_name is null then
    raise exception using
      errcode = '22023',
      message = 'Registration requires a non-blank name.';
  end if;

  if pg_catalog.char_length(v_name) > 100 then
    raise exception using
      errcode = '22023',
      message = 'Registration name must be 100 characters or fewer.';
  end if;

  if v_email is null then
    raise exception using
      errcode = '22023',
      message = 'Registration requires an email address.';
  end if;

  if pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'season_ids') is distinct from 'array' then
    raise exception using
      errcode = '22023',
      message = 'Registration season_ids must be a JSON array.';
  end if;

  if pg_catalog.jsonb_array_length(new.raw_user_meta_data -> 'season_ids') > 32 then
    raise exception using
      errcode = '22023',
      message = 'Registration accepts at most 32 season ids.';
  end if;

  begin
    select
      pg_catalog.coalesce(pg_catalog.array_agg(distinct parsed.season_id), '{}'::uuid[]),
      pg_catalog.count(distinct parsed.season_id)::integer
    into v_season_ids, v_requested_count
    from (
      select item.value::uuid as season_id
      from pg_catalog.jsonb_array_elements_text(
        new.raw_user_meta_data -> 'season_ids'
      ) as item(value)
    ) as parsed;
  exception
    when invalid_text_representation then
      raise exception using
        errcode = '22023',
        message = 'Registration season_ids must contain valid UUID values.';
  end;

  if v_requested_count = 0 then
    raise exception using
      errcode = '22023',
      message = 'Registration requires at least one season.';
  end if;

  select pg_catalog.count(*)::integer
  into v_existing_count
  from public.seasons
  where id = any(v_season_ids);

  if v_existing_count <> v_requested_count then
    raise exception using
      errcode = '22023',
      message = 'Registration contains an unknown season id.';
  end if;

  insert into public.users (id, name, email, status)
  values (new.id, v_name, v_email, 'PENDING');

  insert into public.memberships (user_id, season_id)
  select new.id, selected.season_id
  from pg_catalog.unnest(v_season_ids) as selected(season_id);

  return new;
end;
$$;

revoke all on function private.oa_handle_new_auth_user() from public;
revoke all on function private.oa_handle_new_auth_user() from anon, authenticated;

drop trigger if exists oa_auth_user_created on auth.users;
create trigger oa_auth_user_created
after insert on auth.users
for each row execute function private.oa_handle_new_auth_user();

commit;
