begin;

-- Idempotent production bootstrap for the agreed OMNIVORE seasons.
-- Dates remain nullable until the operating team confirms the exact terms.
insert into public.seasons (name, is_current)
values
  ('0기', false),
  ('1기', false),
  ('2기', false),
  ('3기', false)
on conflict ((lower(name))) do nothing;

update public.seasons
set is_current = false,
    updated_at = now()
where is_current;

update public.seasons
set is_current = true,
    updated_at = now()
where name = '3기';

commit;
