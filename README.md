# JobAssistUI — web app

A job-search **activity documentation tool for unemployment compliance**, with
optional Guided browser assistance. Users log every job-search activity, track
their weekly requirement, and export a clean PDF or CSV record they can print.

> **Never describe the export as "DOL-ready", "DOL-approved", or as something a
> state accepts.** Nobody can warrant that for 50 states, and it is the fastest
> way to deserve a complaint. "A clean record you can print" is the honest
> version. Same rule in `docs/marketing/campaign.md` and in the Terms.

This is the hosted web version of the `job-automation` Electron desktop app.

**Live at https://www.jobassistui.com.** Read `HANDOFF.md` first on resume — it
carries the current state of the world; this file is setup and architecture only.

## Status — launched 2026-08-06/07

Implemented:
- Email sign-in with a typed one-time code (Supabase Auth)
- Onboarding + settings (state, weekly requirement, reporting-week start day, consent)
- Self-Directed activity entry form with optional evidence-screenshot upload
- Activity Log dashboard grouped by reporting period with an "X/target this week" badge
- PDF and CSV export per reporting week
- Compliance-first marketing landing page
- **Billing:** $12/mo Stripe subscription, customer portal, idempotent webhook
  syncing subscription state to `profiles`, record-only card-fingerprint
  tracking against trial abuse

### Pricing model (changed 2026-08-29)

**The tracker is free, permanently.** Logging, the dashboard, weekly tracking
and both exports run on `requireOnboarded` and are never gated. The audience is
people on unemployment; charging them to document a legal requirement is the
wrong business.

**Guided assist is the only paid feature** — `/template` and `/guided` gate on
`requireEntitled`. It is free to everyone until `FREE_UNTIL` (2027-01-01), then
$12/month.

No cutover to run: `isEntitled()` short-circuits to `true` during the free
period and `startCheckout` refuses to run, so no subscription — and no revenue —
can be created before that date. Every gate and every piece of pricing copy
reads `isFreePeriod()` at request time, so the paywall arrives on its own with
no deploy.

### Guided assist — read before touching it

Two parked implementations, one shared answer-template model. **Neither is in
the web build.** See `HANDOFF.md` for the full picture, including:

- **Indeed prohibits automating the apply process** — the *process*, not just
  the submit. The defensible shape is: the user clicks Apply, the tool fills
  fields from saved answers, the user reads and submits.
- `packages/automation/src/captcha.ts` and `human.ts` are ToS liabilities
  (2Captcha solving, anti-detection jitter). Delete them from anything shipped.
- `apps/extension`'s form scan is last-known-broken; the fix in `86ee728` has
  never been run against a live Indeed page.
- Chrome extensions do not run on mobile, so Guided is desktop-only by nature.

Deferred: resume management, evidence-capture polish.

## Stack

- **apps/web** — Next.js (App Router) + Tailwind, deploys to Vercel
- **packages/shared** — enums, types, reporting-period helpers (dependency-free)
- **packages/db** — SQL migrations + `Database` type
- **Supabase** — Postgres + Auth + Storage

> Note: the plan specifies pnpm+turborepo, but pnpm couldn't be enabled here
> (corepack lacks write access to `C:\Program Files\nodejs`). This uses **npm
> workspaces** instead — same monorepo layout. Switch to pnpm later by installing
> it with admin rights and adding `pnpm-workspace.yaml`.

## Setup

1. **Create a Supabase project** at https://supabase.com.

2. **Apply the schema.** In the Supabase SQL editor, paste and run
   `packages/db/migrations/0001_init.sql`, then `0002_billing.sql` (or use the
   Supabase CLI: `supabase db push`). This creates `profiles`, `activity_log`,
   RLS policies, the signup trigger, the private `evidence` / `resumes` storage
   buckets, the subscription-column protection trigger, and the
   `used_card_fingerprints` table.

3. **Configure env.** Copy `apps/web/.env.example` to `apps/web/.env.local` and
   fill in your Supabase URL, anon key, and service-role key (Project Settings →
   API). Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` for local dev.

4. **Email redirect.** In Supabase → Authentication → URL Configuration, add
   `http://localhost:3000/auth/callback` to the allowed redirect URLs.

5. **Stripe (billing).** In the Stripe dashboard (test mode first):
   - Create a product **JobAssistUI** with a recurring **$12/month** price;
     paste the price id into `STRIPE_PRICE_ID`.
   - Copy the secret key into `STRIPE_SECRET_KEY`.
   - Enable the **customer portal** (Settings → Billing → Customer portal) with
     cancel + payment-method update allowed.
   - Webhook: in dev, run
     `stripe listen --forward-to localhost:3000/api/stripe/webhook` and paste
     the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET`. In prod, add a
     webhook endpoint for `https://<site>/api/stripe/webhook` sending
     `checkout.session.completed` and
     `customer.subscription.created/updated/deleted`, and use its signing
     secret.

6. **Install & run:**
   ```bash
   npm install
   npm run dev          # http://localhost:3000
   ```

## Scripts (run from repo root)

- `npm run dev` — start the web app
- `npm run build` — production build
- `npm run typecheck` — typecheck all workspaces

## Verified

`npm run typecheck` and `npm run build` both pass. The full funnel — sign in,
onboard, log an activity, start and cancel a Stripe subscription with a real
card — was verified end-to-end against production on 2026-08-06/07.

**Not verified:** the mobile layout on a real device, and the Guided extension's
form scan against a live Indeed page. Both are open items in `HANDOFF.md`.
