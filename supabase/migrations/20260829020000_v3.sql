-- OMNIVORE ARCHITECT v3 approval/content delta.
-- Apply after the core `users` and `programs` tables exist.

do $$ begin
  create type public.approval_status as enum (
    'NOT_REQUIRED', 'DRAFT', 'PENDING', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.program_approvals (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null unique references public.programs(id) on delete cascade,
  requester_id uuid not null references public.users(id),
  reviewer_id uuid references public.users(id),
  status public.approval_status not null default 'DRAFT',
  requested_at timestamptz,
  reviewed_at timestamptz,
  review_comment text,
  constraint changes_request_requires_comment check (
    status <> 'CHANGES_REQUESTED' or nullif(btrim(review_comment), '') is not null
  )
);

create table if not exists public.page_content (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in (
    'home', 'programs', 'talk', 'reading', 'gathering', 'members', 'about'
  )),
  title text not null default '',
  headline text not null default '',
  description text not null default '',
  empty_state text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);

create or replace function public.is_oa_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and status = 'ADMIN'
  );
$$;

alter table public.program_approvals enable row level security;
alter table public.page_content enable row level security;

drop policy if exists "approval visible to requester host or admin" on public.program_approvals;
create policy "approval visible to requester host or admin"
on public.program_approvals for select
to authenticated
using (
  requester_id = auth.uid()
  or public.is_oa_admin()
  or exists (
    select 1 from public.programs
    where programs.id = program_approvals.program_id
      and programs.host_id = auth.uid()
  )
);

drop policy if exists "member may submit own proposal" on public.program_approvals;
create policy "member may submit own proposal"
on public.program_approvals for insert
to authenticated
with check (
  requester_id = auth.uid()
  and status = 'PENDING'
  and reviewer_id is null
  and exists (
    select 1 from public.programs
    where programs.id = program_approvals.program_id
      and programs.host_id = auth.uid()
      and programs.status = 'DRAFT'
  )
);

drop policy if exists "admin reviews approvals" on public.program_approvals;
create policy "admin reviews approvals"
on public.program_approvals for update
to authenticated
using (public.is_oa_admin())
with check (public.is_oa_admin());

drop policy if exists "page content is public" on public.page_content;
create policy "page content is public"
on public.page_content for select
to anon, authenticated
using (true);

drop policy if exists "admin creates page content" on public.page_content;
create policy "admin creates page content"
on public.page_content for insert
to authenticated
with check (public.is_oa_admin() and updated_by = auth.uid());

drop policy if exists "admin updates page content" on public.page_content;
create policy "admin updates page content"
on public.page_content for update
to authenticated
using (public.is_oa_admin())
with check (public.is_oa_admin() and updated_by = auth.uid());

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
  approval public.program_approvals;
begin
  if not public.is_oa_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_decision not in ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED') then
    raise exception 'INVALID_TRANSITION';
  end if;
  if p_decision = 'CHANGES_REQUESTED' and nullif(btrim(p_comment), '') is null then
    raise exception 'REVIEW_COMMENT_REQUIRED';
  end if;

  select * into approval
  from public.program_approvals
  where program_id = p_program_id
  for update;

  if approval.status <> 'PENDING' then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.program_approvals
  set status = p_decision,
      reviewer_id = auth.uid(),
      reviewed_at = now(),
      review_comment = nullif(btrim(p_comment), '')
  where program_id = p_program_id
  returning * into approval;

  if p_decision = 'APPROVED' then
    update public.programs
    set status = 'OPEN', updated_at = now()
    where id = p_program_id and status = 'DRAFT';
  end if;

  return approval;
end;
$$;

revoke all on function public.review_program_approval(uuid, public.approval_status, text) from public;
grant execute on function public.review_program_approval(uuid, public.approval_status, text) to authenticated;
