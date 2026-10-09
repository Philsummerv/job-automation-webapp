-- JobAssistUI — AI job-search assistant: parsed resumes + AI usage counter.
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.
-- Safe to run twice.

-- ─── resume_profiles ────────────────────────────────────────────────────────
-- One row per user: the resume text they gave us and the structured profile
-- the AI built from it (shape: ResumeProfile in packages/shared/src/ai.ts).
create table if not exists public.resume_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  raw_text text,
  profile jsonb,
  file_name text,
  updated_at timestamptz not null default now()
);

alter table public.resume_profiles enable row level security;

drop policy if exists "resume_profiles_select_own" on public.resume_profiles;
create policy "resume_profiles_select_own" on public.resume_profiles
  for select using (auth.uid() = user_id);

drop policy if exists "resume_profiles_insert_own" on public.resume_profiles;
create policy "resume_profiles_insert_own" on public.resume_profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "resume_profiles_update_own" on public.resume_profiles;
create policy "resume_profiles_update_own" on public.resume_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "resume_profiles_delete_own" on public.resume_profiles;
create policy "resume_profiles_delete_own" on public.resume_profiles
  for delete using (auth.uid() = user_id);

-- ─── ai_usage ───────────────────────────────────────────────────────────────
-- One row per AI call. ai_take_slot (below) counts today's rows before each call to enforce
-- the daily cap (AI_DAILY_LIMIT in packages/shared/src/ai.ts).
--
-- Users can insert and read their own rows but not update or delete them, so
-- the counter can't be reset from the browser.
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_created_idx
  on public.ai_usage (user_id, created_at);

alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own" on public.ai_usage
  for select using (auth.uid() = user_id);

drop policy if exists "ai_usage_insert_own" on public.ai_usage;
create policy "ai_usage_insert_own" on public.ai_usage
  for insert with check (auth.uid() = user_id);

-- ─── ai_take_slot ───────────────────────────────────────────────────────────
-- Checks the daily cap and records one call in a single step. A per-user
-- advisory lock makes parallel requests wait their turn, so a burst of
-- requests can't all read the same count and all get through.
-- Returns how many calls are left today after this one, or -1 if the user is
-- already at the cap (nothing is recorded then). Days are UTC.
create or replace function public.ai_take_slot(p_kind text, p_cap int)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  used int;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if p_kind is null or length(p_kind) = 0 or length(p_kind) > 40 then
    raise exception 'bad kind';
  end if;

  perform pg_advisory_xact_lock(hashtext('ai_usage:' || uid::text));

  select count(*) into used
  from public.ai_usage
  where user_id = uid
    and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');

  if used >= p_cap then
    return -1;
  end if;

  insert into public.ai_usage (user_id, kind) values (uid, p_kind);
  return greatest(0, p_cap - used - 1);
end;
$$;

revoke all on function public.ai_take_slot(text, int) from public;
grant execute on function public.ai_take_slot(text, int) to authenticated;
