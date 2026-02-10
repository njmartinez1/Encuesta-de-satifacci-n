-- Supabase schema for Encuestas Reinvented

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text,
  role text,
  access_role text not null default 'educator',
  group_name text,
  campus text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists group_name text;
alter table public.profiles
  add column if not exists campus text;
alter table public.profiles
  add column if not exists access_role text not null default 'educator';

-- allowed_emails table removed (access now based on profiles + auth)

create table if not exists public.evaluation_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  academic_year text not null,
  period_number integer not null,
  starts_at date not null,
  ends_at date not null,
  created_at timestamptz not null default now(),
  constraint evaluation_periods_dates check (starts_at <= ends_at),
  constraint evaluation_periods_number check (period_number >= 1)
);

create unique index if not exists evaluation_periods_unique_year_period
  on public.evaluation_periods (academic_year, period_number);

create table if not exists public.question_categories (
  name text primary key,
  section text not null default 'peer',
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.question_categories
  add column if not exists section text not null default 'peer';
alter table public.question_categories
  add column if not exists description text;
alter table public.question_categories
  add column if not exists sort_order integer not null default 0;

create table if not exists public.question_sections (
  section text primary key,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.question_sections
  add column if not exists sort_order integer not null default 0;

create table if not exists public.questions (
  id bigserial primary key,
  text text not null,
  category text not null references public.question_categories(name) on update cascade,
  section text not null default 'peer',
  question_type text not null default 'scale',
  options jsonb,
  is_required boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

alter table public.questions
  add column if not exists section text not null default 'peer';
alter table public.questions
  add column if not exists question_type text not null default 'scale';
alter table public.questions
  add column if not exists options jsonb;
alter table public.questions
  add column if not exists is_required boolean not null default true;
alter table public.questions
  add column if not exists sort_order integer not null default 0;

create table if not exists public.assignments (
  evaluator_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (evaluator_id, target_id)
);

create table if not exists public.evaluator_questions (
  evaluator_id uuid not null references public.profiles(id) on delete cascade,
  question_id bigint not null references public.questions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (evaluator_id, question_id)
);

create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  evaluator_id uuid not null references public.profiles(id) on delete cascade,
  evaluated_id uuid not null references public.profiles(id) on delete cascade,
  period_id uuid references public.evaluation_periods(id),
  answers jsonb not null,
  comments text,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.evaluations
  add column if not exists period_id uuid references public.evaluation_periods(id);
alter table public.evaluations
  add column if not exists is_anonymous boolean not null default false;

drop index if exists evaluations_unique_evaluator_target;
create unique index if not exists evaluations_unique_evaluator_target
  on public.evaluations (evaluator_id, evaluated_id, period_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (select is_admin from public.profiles where id = (select auth.uid())),
    false
  );
$$;

create or replace function public.is_allowed_email()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
  );
$$;

create or replace function public.current_access_role()
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (select access_role from public.profiles where id = (select auth.uid())),
    'educator'
  );
$$;

create or replace function public.current_user_campus()
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select nullif(trim((select campus from public.profiles where id = (select auth.uid()))), '');
$$;

create or replace function public.profile_campus_for(target_id uuid)
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select nullif(trim(campus), '')
  from public.profiles
  where id = target_id;
$$;

create or replace function public.target_in_current_campus(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    public.current_user_campus() is not null
    and lower(public.profile_campus_for(target_id)) = lower(public.current_user_campus());
$$;

create or replace function public.has_assignment_for_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.assignments a
    where a.target_id = target_profile_id
      and a.evaluator_id = (select auth.uid())
  );
$$;

create or replace function public.current_evaluation_period_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.evaluation_periods
  where current_date between starts_at and ends_at
  order by starts_at desc
  limit 1;
$$;

alter table public.evaluations
  alter column period_id set default public.current_evaluation_period_id();

alter table public.profiles enable row level security;
alter table public.evaluation_periods enable row level security;
alter table public.question_categories enable row level security;
alter table public.question_sections enable row level security;
alter table public.questions enable row level security;
alter table public.assignments enable row level security;
alter table public.evaluator_questions enable row level security;
alter table public.evaluations enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists evaluation_periods_select_authenticated on public.evaluation_periods;
drop policy if exists evaluation_periods_admin_all on public.evaluation_periods;
drop policy if exists categories_select_authenticated on public.question_categories;
drop policy if exists categories_admin_all on public.question_categories;
drop policy if exists sections_select_authenticated on public.question_sections;
drop policy if exists sections_admin_all on public.question_sections;
drop policy if exists questions_select_authenticated on public.questions;
drop policy if exists questions_admin_all on public.questions;
drop policy if exists assignments_select_own_or_admin on public.assignments;
drop policy if exists assignments_admin_all on public.assignments;
drop policy if exists evaluator_questions_select_own_or_admin on public.evaluator_questions;
drop policy if exists evaluator_questions_admin_all on public.evaluator_questions;
drop policy if exists evaluations_select_own_or_admin on public.evaluations;
drop policy if exists evaluations_insert_own on public.evaluations;
drop policy if exists evaluations_update_own on public.evaluations;
drop policy if exists evaluations_admin_update on public.evaluations;
drop policy if exists evaluations_admin_delete on public.evaluations;

create policy "profiles_select_own_or_admin"
on public.profiles
for select
using (
  public.is_allowed_email()
  and (
    id = (select auth.uid())
    or public.is_admin()
    or (
      public.current_access_role() in ('viewer', 'principal', 'reviewer')
      and public.current_user_campus() is not null
      and lower(trim(profiles.campus)) = lower(public.current_user_campus())
    )
    or public.has_assignment_for_profile(profiles.id)
  )
);

create policy "profiles_update_admin"
on public.profiles
for update
using (public.is_allowed_email() and public.is_admin())
with check (public.is_allowed_email() and public.is_admin());

drop table if exists public.allowed_emails cascade;

create policy "evaluation_periods_select_authenticated"
on public.evaluation_periods
for select
using (public.is_allowed_email());

create policy "evaluation_periods_admin_all"
on public.evaluation_periods
for all
using (public.is_allowed_email() and public.is_admin())
with check (public.is_allowed_email() and public.is_admin());

create policy "categories_select_authenticated"
on public.question_categories
for select
using (public.is_allowed_email());

create policy "categories_admin_all"
on public.question_categories
for all
using (public.is_allowed_email() and public.is_admin())
with check (public.is_allowed_email() and public.is_admin());

create policy "sections_select_authenticated"
on public.question_sections
for select
using (public.is_allowed_email());

create policy "sections_admin_all"
on public.question_sections
for all
using (public.is_allowed_email() and public.is_admin())
with check (public.is_allowed_email() and public.is_admin());

create policy "questions_select_authenticated"
on public.questions
for select
using (public.is_allowed_email());

create policy "questions_admin_all"
on public.questions
for all
using (public.is_allowed_email() and public.is_admin())
with check (public.is_allowed_email() and public.is_admin());

create policy "assignments_select_own_or_admin"
on public.assignments
for select
using (
  public.is_allowed_email()
  and (
    public.is_admin()
    or evaluator_id = (select auth.uid())
    or (
      public.current_access_role() in ('viewer', 'principal', 'reviewer')
      and public.target_in_current_campus(assignments.target_id)
    )
  )
);

create policy "assignments_admin_all"
on public.assignments
for all
using (public.is_allowed_email() and public.is_admin())
with check (public.is_allowed_email() and public.is_admin());

create policy "evaluator_questions_select_own_or_admin"
on public.evaluator_questions
for select
using (public.is_allowed_email() and (public.is_admin() or evaluator_id = (select auth.uid())));

create policy "evaluator_questions_admin_all"
on public.evaluator_questions
for all
using (public.is_allowed_email() and public.is_admin())
with check (public.is_allowed_email() and public.is_admin());

create policy "evaluations_select_own_or_admin"
on public.evaluations
for select
using (
  public.is_allowed_email()
  and (
    public.is_admin()
    or evaluator_id = (select auth.uid())
    or (
      public.current_access_role() in ('viewer', 'principal', 'reviewer')
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

create policy "evaluations_insert_own"
on public.evaluations
for insert
with check (
  public.is_allowed_email()
  and evaluator_id = (select auth.uid())
  and public.current_evaluation_period_id() is not null
  and period_id = public.current_evaluation_period_id()
);

create policy "evaluations_update_own"
on public.evaluations
for update
using (
  public.is_allowed_email()
  and evaluator_id = (select auth.uid())
  and period_id = public.current_evaluation_period_id()
)
with check (
  public.is_allowed_email()
  and evaluator_id = (select auth.uid())
  and period_id = public.current_evaluation_period_id()
);

create policy "evaluations_admin_update"
on public.evaluations
for update
using (public.is_allowed_email() and public.is_admin())
with check (public.is_allowed_email() and public.is_admin());

create policy "evaluations_admin_delete"
on public.evaluations
for delete
using (public.is_allowed_email() and public.is_admin());

-- Queue for magic link emails
create table if not exists public.magic_link_queue (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  redirect_to text,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  next_attempt_at timestamptz not null default now()
);

create index if not exists magic_link_queue_status_next_attempt_idx
  on public.magic_link_queue (status, next_attempt_at);

alter table public.magic_link_queue enable row level security;
