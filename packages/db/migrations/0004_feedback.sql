-- JobAssistUI — beta feedback inbox.
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

-- Bug reports and comments sent from the in-app Feedback form. Deliberately a
-- table rather than an email: no new API key or env var to configure, and the
-- owner already has /admin to read it. Denormalised email/state/page so a row
-- still makes sense after the user deletes their account.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text,
  kind text not null default 'bug'
    check (kind in ('bug','confusing','idea','other')),
  message text not null,
  page text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_idx
  on public.feedback (created_at desc);

alter table public.feedback enable row level security;

-- Users may file feedback and read back only their own. The owner reads every
-- row through the service-role client on /admin, which bypasses RLS — there is
-- deliberately no policy granting anyone a cross-user select.
drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own" on public.feedback
  for insert with check (auth.uid() = user_id);

drop policy if exists "feedback_select_own" on public.feedback;
create policy "feedback_select_own" on public.feedback
  for select using (auth.uid() = user_id);
