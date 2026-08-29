-- JobAssistUI — Rules Assistant log.
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.
--
-- Mirrors 0004_feedback.sql deliberately: same per-user RLS shape, same
-- denormalised email, same "owner reads everything through /admin via the
-- service-role client" model.
--
-- WHY THIS TABLE EARNS ITS KEEP: the rows where we did NOT answer are the
-- product roadmap. `outcome='no_answer'` grouped by (state, topic) is the
-- research queue — it says which state's page to go read next, ranked by how
-- many real people asked. `refusal_reason` counts say what the tool doesn't do
-- that people need. Neither is visible anywhere else.

create table if not exists public.assistant_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  -- Denormalised so a row still explains itself after an account is deleted.
  email text,

  -- What was asked
  state text,
  situation text,
  exemptions text[],
  topic text,
  -- Free text, capped at 500 chars by the API before it ever reaches here.
  question text,
  -- 'button' = user picked a topic; 'classified' = a model mapped free text.
  route text not null default 'button'
    check (route in ('button', 'classified')),

  -- What came back
  outcome text not null
    check (outcome in ('checked','varies','refusal','no_jurisdiction','no_answer','error')),
  refusal_reason text
    check (refusal_reason is null or refusal_reason in
      ('eligibility','amount','appeal','overpayment','fraud','determination')),
  -- Traces a bad answer back to the exact page it came from.
  source_urls text[],
  -- Denormalised: the row still explains itself after the repo file is edited
  -- and the fact's verified_on moves.
  fact_verified_on date,
  stale_served boolean not null default false,

  created_at timestamptz not null default now()
);

create index if not exists assistant_log_created_idx
  on public.assistant_log (created_at desc);
-- Drives the /admin research queue: group by state + topic, filter on outcome.
create index if not exists assistant_log_gap_idx
  on public.assistant_log (state, topic, outcome);

alter table public.assistant_log enable row level security;

-- Same model as feedback: users touch only their own rows; the owner reads
-- everything through the service-role client on /admin, which bypasses RLS.
drop policy if exists "assistant_log_insert_own" on public.assistant_log;
create policy "assistant_log_insert_own" on public.assistant_log
  for insert with check (auth.uid() = user_id);

drop policy if exists "assistant_log_select_own" on public.assistant_log;
create policy "assistant_log_select_own" on public.assistant_log
  for select using (auth.uid() = user_id);
