-- Destructive reset for Encuestas Reinvented.
-- Run this in Supabase SQL editor as a service role (SQL editor has full access).
-- Replace KEEP_ADMIN_EMAIL with the admin account you want to keep.

do $$
declare
  keep_admin_email text := 'norman.martinez@reinventedpuembo.edu.ec';
begin
  if keep_admin_email = 'KEEP_ADMIN_EMAIL' then
    raise exception 'Set keep_admin_email to the admin email you want to keep.';
  end if;

  -- Remove all auth users except the admin you keep.
  delete from auth.users
  where lower(email) <> lower(keep_admin_email);
end $$;

-- Clear remaining app data.
truncate table public.evaluations restart identity cascade;
truncate table public.assignments restart identity cascade;
truncate table public.evaluator_questions restart identity cascade;
truncate table public.questions restart identity cascade;
truncate table public.question_categories restart identity cascade;
truncate table public.question_sections restart identity cascade;
truncate table public.allowed_emails restart identity cascade;
