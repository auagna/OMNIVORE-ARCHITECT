-- OMNIVORE ARCHITECT v3.2 material revision blueprint.
-- Apply after `supabase-v3.sql` and `supabase-v3.1.sql`.
--
-- IMPORTANT: the current repository does not define the physical columns for
-- every Program/GatheringDetail field. This migration therefore stores the
-- typed application snapshot as JSONB, but deliberately does not guess how
-- DATE/COST/etc. map onto production columns. Approval promotion requires a
-- separately installed, migration-owned function with this exact contract:
--
--   public.apply_program_revision_snapshot(uuid, jsonb)
--
-- That adapter must validate the JSON shape and update Program and
-- GatheringDetail rows. PostgreSQL executes it inside the review function's
-- transaction; if it is absent or raises, approval and revision changes roll
-- back and the currently published Program remains untouched.

alter table public.program_approvals
  add column if not exists published_at timestamptz;

update public.program_approvals
set published_at = coalesce(reviewed_at, requested_at, now())
where published_at is null
  and status in ('APPROVED', 'NOT_REQUIRED');

create index if not exists program_approvals_published_idx
  on public.program_approvals (program_id, published_at)
  where published_at is not null;

create table if not exists public.program_revisions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null unique references public.programs(id) on delete cascade,
  approval_id uuid not null unique references public.program_approvals(id) on delete cascade,
  proposed_by uuid not null references public.users(id),
  proposed_snapshot jsonb not null,
  changed_fields text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_revision_snapshot_is_object
    check (jsonb_typeof(proposed_snapshot) = 'object'),
  constraint program_revision_has_material_changes
    check (
      cardinality(changed_fields) > 0
      and array_position(changed_fields, null) is null
      and changed_fields <@ array[
        'startAt',
        'endAt',
        'location',
        'costType',
        'participationFee',
        'paymentInfo',
        'cancellationPolicy'
      ]::text[]
    )
);

create index if not exists program_revisions_approval_updated_idx
  on public.program_revisions (approval_id, updated_at desc);

alter table public.program_revisions enable row level security;

drop policy if exists "revision visible to requester host or admin" on public.program_revisions;
create policy "revision visible to requester host or admin"
on public.program_revisions for select
to authenticated
using (
  proposed_by = auth.uid()
  or public.is_oa_admin()
  or exists (
    select 1
    from public.programs
    join public.program_approvals
      on program_approvals.program_id = programs.id
    where programs.id = program_revisions.program_id
      and (
        programs.host_id = auth.uid()
        or program_approvals.requester_id = auth.uid()
      )
  )
);

-- Revision writes and approval decisions must use the transaction functions
-- below. Keeping direct table updates disabled prevents an Admin client from
-- marking a revision APPROVED without promoting its snapshot.
drop policy if exists "admin reviews approvals" on public.program_approvals;
revoke update on public.program_approvals from anon, authenticated;
revoke insert, update, delete on public.program_revisions from anon, authenticated;

create or replace function public.program_has_published_version(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (
      select 1
      from public.program_approvals
      where program_id = p_program_id
    )
    or exists (
      select 1
      from public.program_approvals
      where program_id = p_program_id
        and (
          published_at is not null
          or status in ('APPROVED', 'NOT_REQUIRED')
        )
    );
$$;

create or replace function public.submit_program_revision(
  p_program_id uuid,
  p_proposed_snapshot jsonb,
  p_changed_fields text[]
)
returns public.program_revisions
language plpgsql
security definer
set search_path = public
as $$
declare
  approval public.program_approvals%rowtype;
  revision public.program_revisions%rowtype;
  submitted_at timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if p_proposed_snapshot is null
     or jsonb_typeof(p_proposed_snapshot) <> 'object' then
    raise exception 'INVALID_REVISION_SNAPSHOT';
  end if;
  if p_changed_fields is null
     or cardinality(p_changed_fields) = 0
     or array_position(p_changed_fields, null) is not null
     or not (p_changed_fields <@ array[
       'startAt',
       'endAt',
       'location',
       'costType',
       'participationFee',
       'paymentInfo',
       'cancellationPolicy'
     ]::text[]) then
    raise exception 'INVALID_MATERIAL_CHANGE_FIELDS';
  end if;

  perform 1
  from public.programs
  where id = p_program_id
    and status in ('OPEN', 'CLOSED')
    and (
      host_id = auth.uid()
      or public.is_oa_admin()
    )
  for update;

  if not found then
    raise exception 'FORBIDDEN';
  end if;

  select * into approval
  from public.program_approvals
  where program_id = p_program_id
  for update;

  if approval.id is null then
    raise exception 'APPROVAL_NOT_FOUND';
  end if;
  if approval.published_at is null then
    raise exception 'NO_PUBLISHED_VERSION';
  end if;
  if approval.status not in ('APPROVED', 'CHANGES_REQUESTED') then
    raise exception 'INVALID_TRANSITION';
  end if;

  insert into public.program_revisions (
    program_id,
    approval_id,
    proposed_by,
    proposed_snapshot,
    changed_fields,
    created_at,
    updated_at
  ) values (
    p_program_id,
    approval.id,
    auth.uid(),
    p_proposed_snapshot,
    p_changed_fields,
    submitted_at,
    submitted_at
  )
  on conflict (program_id) do update
  set approval_id = excluded.approval_id,
      proposed_by = excluded.proposed_by,
      proposed_snapshot = excluded.proposed_snapshot,
      changed_fields = excluded.changed_fields,
      updated_at = excluded.updated_at
  returning * into revision;

  update public.program_approvals
  set status = 'PENDING',
      requester_id = auth.uid(),
      reviewer_id = null,
      requested_at = submitted_at,
      reviewed_at = null,
      review_comment = null
  where id = approval.id;

  insert into public.program_activities (
    program_id, actor_id, type, metadata, dedupe_key
  ) values (
    p_program_id,
    auth.uid(),
    'UPDATED',
    jsonb_build_object(
      'classification', 'MATERIAL',
      'changedFields', to_jsonb(p_changed_fields),
      'applied', false,
      'revisionId', revision.id
    ),
    'REVISION_UPDATED:' || revision.id::text || ':' || submitted_at::text
  )
  on conflict do nothing;

  insert into public.program_activities (
    program_id, actor_id, type, metadata, dedupe_key
  ) values (
    p_program_id,
    auth.uid(),
    'SUBMITTED',
    jsonb_build_object(
      'reason', 'MATERIAL_CHANGE',
      'changedFields', to_jsonb(p_changed_fields),
      'revisionId', revision.id
    ),
    'REVISION_SUBMITTED:' || revision.id::text || ':' || submitted_at::text
  )
  on conflict do nothing;

  return revision;
end;
$$;

create or replace function public.review_program_revision(
  p_program_id uuid,
  p_decision public.approval_status,
  p_comment text default null
)
returns public.program_approvals
language plpgsql
security definer
set search_path = public
as $$
declare
  approval public.program_approvals%rowtype;
  revision public.program_revisions%rowtype;
  decision_at timestamptz := now();
begin
  if not public.is_oa_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_decision not in ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED') then
    raise exception 'INVALID_TRANSITION';
  end if;
  if p_decision = 'CHANGES_REQUESTED'
     and nullif(btrim(p_comment), '') is null then
    raise exception 'REVIEW_COMMENT_REQUIRED';
  end if;

  select * into approval
  from public.program_approvals
  where program_id = p_program_id
  for update;

  if approval.id is null then
    raise exception 'APPROVAL_NOT_FOUND';
  end if;
  if approval.status <> 'PENDING' or approval.published_at is null then
    raise exception 'INVALID_TRANSITION';
  end if;

  select * into revision
  from public.program_revisions
  where program_id = p_program_id and approval_id = approval.id
  for update;

  if revision.id is null then
    raise exception 'REVISION_NOT_FOUND';
  end if;

  -- Lock the public row even when the decision does not change it. This keeps
  -- review and concurrent operational updates in a deterministic order.
  perform 1 from public.programs where id = p_program_id for update;
  if not found then
    raise exception 'PROGRAM_NOT_FOUND';
  end if;

  if p_decision = 'APPROVED' then
    if to_regprocedure(
      'public.apply_program_revision_snapshot(uuid,jsonb)'
    ) is null then
      raise exception 'REVISION_APPLY_ADAPTER_REQUIRED';
    end if;

    -- Fixed schema/function name; values remain parameterized. The adapter is
    -- invoked inside this transaction, so any validation/update failure rolls
    -- back approval, activity, and revision deletion as one unit.
    execute 'select public.apply_program_revision_snapshot($1, $2)'
      using p_program_id, revision.proposed_snapshot;
  end if;

  update public.program_approvals
  set status = p_decision,
      reviewer_id = auth.uid(),
      reviewed_at = decision_at,
      review_comment = nullif(btrim(p_comment), ''),
      published_at = case
        when p_decision = 'APPROVED' then decision_at
        else published_at
      end
  where id = approval.id
  returning * into approval;

  insert into public.program_activities (
    program_id, actor_id, type, metadata, dedupe_key
  ) values (
    p_program_id,
    auth.uid(),
    p_decision::text::public.program_activity_type,
    jsonb_build_object(
      'approvalId', approval.id,
      'revisionId', revision.id,
      'reviewComment', nullif(btrim(p_comment), '')
    ),
    'REVISION_REVIEW:' || revision.id::text || ':' || p_decision::text
  )
  on conflict do nothing;

  if p_decision = 'APPROVED' then
    delete from public.program_revisions where id = revision.id;
  end if;

  -- CHANGES_REQUESTED and REJECTED intentionally retain the revision and do
  -- not update public.programs. The previously published version stays live.
  return approval;
end;
$$;

-- Keep the v3 initial-proposal review path, but prevent it from bypassing the
-- revision promotion transaction. Initial approval also records published_at.
create or replace function public.review_program_approval(
  p_program_id uuid,
  p_decision public.approval_status,
  p_comment text default null
)
returns public.program_approvals
language plpgsql
security definer
set search_path = public
as $$
declare
  approval public.program_approvals%rowtype;
  decision_at timestamptz := now();
begin
  if not public.is_oa_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_decision not in ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED') then
    raise exception 'INVALID_TRANSITION';
  end if;
  if p_decision = 'CHANGES_REQUESTED'
     and nullif(btrim(p_comment), '') is null then
    raise exception 'REVIEW_COMMENT_REQUIRED';
  end if;

  select * into approval
  from public.program_approvals
  where program_id = p_program_id
  for update;

  if approval.id is null then
    raise exception 'APPROVAL_NOT_FOUND';
  end if;
  if approval.status <> 'PENDING' then
    raise exception 'INVALID_TRANSITION';
  end if;
  if exists (
    select 1 from public.program_revisions
    where program_id = p_program_id and approval_id = approval.id
  ) then
    raise exception 'REVISION_REVIEW_REQUIRED';
  end if;

  update public.program_approvals
  set status = p_decision,
      reviewer_id = auth.uid(),
      reviewed_at = decision_at,
      review_comment = nullif(btrim(p_comment), ''),
      published_at = case
        when p_decision = 'APPROVED' then decision_at
        else published_at
      end
  where id = approval.id
  returning * into approval;

  if p_decision = 'APPROVED' then
    update public.programs
    set status = 'OPEN', updated_at = decision_at
    where id = p_program_id and status = 'DRAFT';
  end if;

  insert into public.program_activities (
    program_id, actor_id, type, metadata, dedupe_key
  ) values (
    p_program_id,
    auth.uid(),
    p_decision::text::public.program_activity_type,
    jsonb_build_object(
      'approvalId', approval.id,
      'reviewComment', nullif(btrim(p_comment), '')
    ),
    'INITIAL_REVIEW:' || approval.id::text || ':' ||
      coalesce(approval.requested_at::text, decision_at::text) || ':' ||
      p_decision::text
  )
  on conflict do nothing;

  return approval;
end;
$$;

-- Ordinary participants can read only a published Program conversation.
-- CANCELLED participants retain read access, while cancelled Programs remain
-- read-only. Host and Admin access continue to follow Program ownership/role.
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
        or (
          programs.status in ('OPEN', 'CLOSED', 'COMPLETED', 'CANCELLED')
          and public.program_has_published_version(p_program_id)
          and exists (
            select 1 from public.participations
            where participations.program_id = p_program_id
              and participations.user_id = auth.uid()
              and participations.status in ('CONFIRMED', 'CANCELLED')
          )
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
        or (
          programs.status in ('OPEN', 'CLOSED', 'COMPLETED')
          and public.program_has_published_version(p_program_id)
          and exists (
            select 1 from public.participations
            where participations.program_id = p_program_id
              and participations.user_id = auth.uid()
              and participations.status = 'CONFIRMED'
          )
        )
      )
  );
$$;

revoke all on function public.program_has_published_version(uuid) from public;
revoke all on function public.submit_program_revision(uuid, jsonb, text[]) from public;
revoke all on function public.review_program_revision(uuid, public.approval_status, text) from public;
revoke all on function public.review_program_approval(uuid, public.approval_status, text) from public;
revoke all on function public.can_read_program_talk(uuid) from public;
revoke all on function public.can_write_program_talk(uuid) from public;

grant execute on function public.program_has_published_version(uuid) to authenticated;
grant execute on function public.submit_program_revision(uuid, jsonb, text[]) to authenticated;
grant execute on function public.review_program_revision(uuid, public.approval_status, text) to authenticated;
grant execute on function public.review_program_approval(uuid, public.approval_status, text) to authenticated;
grant execute on function public.can_read_program_talk(uuid) to authenticated;
grant execute on function public.can_write_program_talk(uuid) to authenticated;
