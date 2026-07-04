-- 0002_billing.sql — M1 billing hardening.
-- Apply after 0001_init.sql (Supabase SQL editor or CLI).

-- ---------------------------------------------------------------------------
-- 1. Lock the Stripe-synced profile columns against end-user writes.
--
-- RLS (profiles_update_own) lets a user update their own row, but nothing in
-- 0001 stops them from setting subscription_status='active' with the anon key.
-- This trigger blocks changes to billing columns unless the request runs as
-- the service role (the Stripe webhook / server actions use service.ts).
-- NOT security definer: current_user must reflect the request role.
-- IS DISTINCT FROM means updates that merely echo existing values still pass,
-- so saveSettings keeps working unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.protect_subscription_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.stripe_customer_id     is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.subscription_status    is distinct from old.subscription_status
    or new.trial_ends_at          is distinct from old.trial_ends_at
    or new.current_period_end     is distinct from old.current_period_end
  ) then
    raise exception 'Subscription fields are managed by billing and cannot be edited';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_subscription_columns on public.profiles;
create trigger protect_subscription_columns
  before update on public.profiles
  for each row execute function public.protect_subscription_columns();

-- ---------------------------------------------------------------------------
-- 2. Card fingerprints seen at trial start (anti-trial-abuse, record-only in
-- M1). One row per unique card; user_id is the FIRST account that trialed
-- with it. Deliberately NO foreign key to auth.users: the record must survive
-- account deletion, which is exactly the abuse vector.
-- RLS enabled with zero policies = service-role access only.
-- ---------------------------------------------------------------------------
create table if not exists public.used_card_fingerprints (
  fingerprint text primary key,
  user_id uuid not null,
  stripe_payment_method_id text,
  created_at timestamptz not null default now()
);

alter table public.used_card_fingerprints enable row level security;
