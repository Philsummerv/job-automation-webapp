-- ApplyAssistUI — M-B4: per-user answer template for the Guided extension.
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

-- The user's saved autofill template: standard field overrides + custom
-- question rules. Stored as JSONB on the profile (one per user). Read by the
-- extension via /api/extension/session's sibling /api/extension/template, and
-- edited in the web app. The existing profiles_update_own RLS policy already
-- lets a user write their own row, so no new policy is needed.
alter table public.profiles
  add column if not exists answer_template jsonb;
