-- Restrict visibility by area for principal and manager roles.

alter table public.profiles
  drop constraint if exists profiles_area_check;

alter table public.profiles
  add constraint profiles_area_check
  check (
    area is null
    or nullif(
      replace(
        replace(
          replace(
            replace(
              replace(lower(trim(area)), 'á', 'a'),
              'é', 'e'
            ),
            'í', 'i'
          ),
          'ó', 'o'
        ),
        'ú', 'u'
      ),
      ''
    ) in ('academico', 'administrativo')
  ) not valid;

create or replace function public.normalize_area(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    replace(
      replace(
        replace(
          replace(
            replace(lower(trim(coalesce(value, ''))), 'á', 'a'),
            'é', 'e'
          ),
          'í', 'i'
        ),
        'ó', 'o'
      ),
      'ú', 'u'
    ),
    ''
  );
$$;

create or replace function public.current_user_area()
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.normalize_area((select area from public.profiles where id = (select auth.uid())));
$$;

create or replace function public.profile_area_for(target_id uuid)
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.normalize_area(area)
  from public.profiles
  where id = target_id;
$$;

create or replace function public.target_in_area(target_id uuid, expected_area text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_id
      and public.normalize_area(p.area) = public.normalize_area(expected_area)
  );
$$;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
using (
  public.is_allowed_email()
  and (
    id = (select auth.uid())
    or public.is_admin()
    or (
      public.current_access_role() = 'manager'
      and public.normalize_area(profiles.area) = 'administrativo'
    )
    or (
      public.current_access_role() = 'principal'
      and public.current_user_campus() is not null
      and lower(trim(profiles.campus)) = lower(public.current_user_campus())
      and public.normalize_area(profiles.area) = 'academico'
    )
    or (
      public.current_access_role() in ('viewer', 'reviewer')
      and public.current_user_campus() is not null
      and lower(trim(profiles.campus)) = lower(public.current_user_campus())
    )
    or (
      public.current_access_role() = 'educator'
      and public.has_assignment_for_profile(profiles.id)
    )
  )
);

drop policy if exists "assignments_select_own_or_admin" on public.assignments;
create policy "assignments_select_own_or_admin"
on public.assignments
for select
using (
  public.is_allowed_email()
  and (
    public.is_admin()
    or evaluator_id = (select auth.uid())
    or (
      public.current_access_role() = 'manager'
      and public.target_in_area(assignments.target_id, 'administrativo')
    )
    or (
      public.current_access_role() = 'principal'
      and public.target_in_current_campus(assignments.target_id)
      and public.target_in_area(assignments.target_id, 'academico')
    )
    or (
      public.current_access_role() in ('viewer', 'reviewer')
      and public.target_in_current_campus(assignments.target_id)
    )
  )
);

drop policy if exists "evaluations_select_own_or_admin" on public.evaluations;
create policy "evaluations_select_own_or_admin"
on public.evaluations
for select
using (
  public.is_allowed_email()
  and (
    public.is_admin()
    or evaluator_id = (select auth.uid())
    or (
      public.current_access_role() = 'manager'
      and exists (
        select 1
        from public.profiles p
        where p.id = evaluations.evaluated_id
          and public.normalize_area(p.area) = 'administrativo'
      )
    )
    or (
      public.current_access_role() = 'principal'
      and public.current_user_campus() is not null
      and exists (
        select 1
        from public.profiles p
        where p.id = evaluations.evaluated_id
          and lower(trim(p.campus)) = lower(public.current_user_campus())
          and public.normalize_area(p.area) = 'academico'
      )
    )
    or (
      public.current_access_role() in ('viewer', 'reviewer')
      and public.current_user_campus() is not null
      and exists (
        select 1
        from public.profiles p
        where p.id = evaluations.evaluated_id
          and lower(trim(p.campus)) = lower(public.current_user_campus())
      )
    )
  )
);
