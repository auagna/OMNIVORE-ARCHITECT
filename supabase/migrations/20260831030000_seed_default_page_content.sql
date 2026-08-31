begin;

-- Idempotent production bootstrap for the seven editable public page surfaces.
-- Existing rows are intentionally preserved so this migration never overwrites
-- content that an Admin has already reviewed or edited.
insert into public.page_content (
  key,
  title,
  headline,
  description,
  empty_state,
  updated_by
)
values
  (
    'home',
    'HOME',
    '지금 OMNIVORE에서 일어나는 일',
    '가장 가까운 일정과 참여 가능한 Program을 확인합니다.',
    '예정된 Program이 없습니다.',
    null
  ),
  (
    'programs',
    'PROGRAMS',
    'PROGRAMS',
    'Talk, Reading, Gathering을 날짜 순서로 살펴봅니다.',
    '조건에 맞는 Program이 없습니다.',
    null
  ),
  (
    'talk',
    'TALK',
    '강연',
    'OMNIVORE와 외부에서 열리는 Talk입니다.',
    '등록된 Talk가 없습니다.',
    null
  ),
  (
    'reading',
    'READING',
    '함께 읽기',
    '하나의 텍스트를 중심으로 모이는 Program입니다.',
    '등록된 Reading이 없습니다.',
    null
  ),
  (
    'gathering',
    '번개',
    'GATHERING',
    '멤버가 제안하고 운영진이 승인한 모임입니다.',
    '참여 가능한 Gathering이 없습니다.',
    null
  ),
  (
    'members',
    'MEMBERS',
    'OMNIVORE MEMBERS',
    '함께 활동하는 멤버를 확인합니다.',
    '표시할 Member가 없습니다.',
    null
  ),
  (
    'about',
    'ABOUT',
    'OMNIVORE ARCHITECT',
    '활동을 만들고, 사람이 모이고, 대화하고, 기록이 남는 시스템.',
    '',
    null
  )
on conflict (key) do nothing;

-- `updated_at` is server-owned. `clock_timestamp()` reflects the real update
-- instant even when several PageContent writes occur in one transaction.
create or replace function public.set_page_content_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists set_page_content_updated_at on public.page_content;
create trigger set_page_content_updated_at
before update on public.page_content
for each row
execute function public.set_page_content_updated_at();

revoke all on function public.set_page_content_updated_at()
  from public, anon, authenticated;

-- Manual rollback notes:
-- 1. Drop `set_page_content_updated_at` and then its function.
-- 2. Do not delete seeded rows automatically: they may contain Admin edits.
--    If rollback requires row removal, first verify `updated_by is null` for
--    every target and delete only the seven known keys explicitly.

commit;
