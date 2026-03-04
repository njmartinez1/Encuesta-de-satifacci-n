alter table public.profiles
  add column if not exists area text;

alter table public.profiles
  drop constraint if exists profiles_area_check;

alter table public.profiles
  add constraint profiles_area_check
  check (
    area is null
    or lower(trim(area)) in ('academico', 'académico', 'administrativo')
  ) not valid;
