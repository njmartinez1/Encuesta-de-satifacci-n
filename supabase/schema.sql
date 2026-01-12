-- Supabase schema for Encuestas Reinvented

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text,
  role text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.allowed_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.question_categories (
  name text primary key,
  section text not null default 'peer',
  created_at timestamptz not null default now()
);

alter table public.question_categories
  add column if not exists section text not null default 'peer';

create table if not exists public.questions (
  id bigserial primary key,
  text text not null,
  category text not null references public.question_categories(name) on update cascade,
  section text not null default 'peer',
  question_type text not null default 'scale',
  options jsonb,
  is_active boolean not null default true
);

alter table public.questions
  add column if not exists section text not null default 'peer';
alter table public.questions
  add column if not exists question_type text not null default 'scale';
alter table public.questions
  add column if not exists options jsonb;

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
  answers jsonb not null,
  comments text,
  created_at timestamptz not null default now()
);

create unique index if not exists evaluations_unique_evaluator_target
  on public.evaluations (evaluator_id, evaluated_id);

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
  select case
    when (select count(*) from public.allowed_emails) = 0 then true
    else exists (
      select 1
      from public.allowed_emails
      where lower(email) = lower((select auth.jwt() ->> 'email'))
    )
  end;
$$;

alter table public.profiles enable row level security;
alter table public.allowed_emails enable row level security;
alter table public.question_categories enable row level security;
alter table public.questions enable row level security;
alter table public.assignments enable row level security;
alter table public.evaluator_questions enable row level security;
alter table public.evaluations enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists allowed_emails_select_self on public.allowed_emails;
drop policy if exists allowed_emails_admin_all on public.allowed_emails;
drop policy if exists categories_select_authenticated on public.question_categories;
drop policy if exists categories_admin_all on public.question_categories;
drop policy if exists questions_select_authenticated on public.questions;
drop policy if exists questions_admin_all on public.questions;
drop policy if exists assignments_select_own_or_admin on public.assignments;
drop policy if exists assignments_admin_all on public.assignments;
drop policy if exists evaluator_questions_select_own_or_admin on public.evaluator_questions;
drop policy if exists evaluator_questions_admin_all on public.evaluator_questions;
drop policy if exists evaluations_select_own_or_admin on public.evaluations;
drop policy if exists evaluations_insert_own on public.evaluations;
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
    or exists (
      select 1
      from public.assignments a
      where a.target_id = profiles.id
        and a.evaluator_id = (select auth.uid())
    )
  )
);

create policy "profiles_update_admin"
on public.profiles
for update
using (public.is_allowed_email() and public.is_admin())
with check (public.is_allowed_email() and public.is_admin());

create policy "allowed_emails_select_self"
on public.allowed_emails
for select
using (lower(email) = lower((select auth.jwt() ->> 'email')));

create policy "allowed_emails_admin_all"
on public.allowed_emails
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
using (public.is_allowed_email() and (public.is_admin() or evaluator_id = (select auth.uid())));

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
using (public.is_allowed_email() and (public.is_admin() or evaluator_id = (select auth.uid())));

create policy "evaluations_insert_own"
on public.evaluations
for insert
with check (public.is_allowed_email() and evaluator_id = (select auth.uid()));

create policy "evaluations_admin_update"
on public.evaluations
for update
using (public.is_allowed_email() and public.is_admin())
with check (public.is_allowed_email() and public.is_admin());

create policy "evaluations_admin_delete"
on public.evaluations
for delete
using (public.is_allowed_email() and public.is_admin());

