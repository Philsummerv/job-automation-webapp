-- AutoApply — M0 schema: profiles + activity_log, RLS, signup trigger, storage.
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

create extension if not exists pgcrypto;

-- ─── profiles ───────────────────────────────────────────────────────────────
-- One row per auth user. Holds compliance settings + Stripe subscription state
-- (subscription fields are written ONLY by the Stripe webhook via service role).
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  state text,
  weekly_target int not null default 3 check (weekly_target between 0 and 20),
  reporting_period_start_day int not null default 0 check (reporting_period_start_day between 0 and 6),
  disclaimer_accepted_at timestamptz,
  -- Subscription (synced from Stripe). Default 'none' until billing ships (M1).
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text not null default 'none'
    check (subscription_status in ('trialing','active','past_due','canceled','incomplete','none')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = user_id);

-- Users may update their own row, but NOT the subscription columns (guarded in
-- the app layer; the webhook uses the service role which bypasses RLS).
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── activity_log ────────────────────────────────────────────────────────────
-- Every job-search activity, whether logged manually (self_directed) or captured
-- from a Guided run. This is the single source of truth for compliance exports.
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  run_id uuid,
  date date not null,
  employer_name text not null,
  job_title text,
  method text not null default 'online'
    check (method in ('online','in_person','phone','email','job_fair','networking')),
  url text,
  result text not null default 'applied'
    check (result in ('applied','interviewed','callback','offered','rejected','no_response','pending')),
  notes text,
  source text not null default 'self_directed' check (source in ('guided','self_directed')),
  evidence_path text,
  reporting_period date,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_user_date_idx
  on public.activity_log (user_id, date desc);

alter table public.activity_log enable row level security;

drop policy if exists "activity_select_own" on public.activity_log;
create policy "activity_select_own" on public.activity_log
  for select using (auth.uid() = user_id);

drop policy if exists "activity_insert_own" on public.activity_log;
create policy "activity_insert_own" on public.activity_log
  for insert with check (auth.uid() = user_id);

drop policy if exists "activity_update_own" on public.activity_log;
create policy "activity_update_own" on public.activity_log
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "activity_delete_own" on public.activity_log;
create policy "activity_delete_own" on public.activity_log
  for delete using (auth.uid() = user_id);

-- ─── Auto-create a profile row on signup ─────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Storage buckets (private) + per-user object policies ─────────────────────
-- Convention: objects are stored under `<user_id>/<filename>` so the first path
-- segment gates ownership.
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false), ('resumes', 'resumes', false)
on conflict (id) do nothing;

drop policy if exists "evidence_rw_own" on storage.objects;
create policy "evidence_rw_own" on storage.objects
  for all to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "resumes_rw_own" on storage.objects;
create policy "resumes_rw_own" on storage.objects
  for all to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
