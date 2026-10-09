# JobAssistUI — web app

An AI job-search assistant for people on unemployment, built on a free
work-search log. Users upload a resume, get matched jobs from public company
job boards, build an apply kit (tailored resume, cover letter, draft answers)
for one job, and log the application in one click. The log tracks the weekly
requirement and exports a clean PDF or CSV record they can print.

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

**Guided (the AI tools) is the only paid feature.** `/resume` AI parsing,
`/jobs` match scores and `/apply` kits gate on `requireAiAccess()`
(`apps/web/lib/ai/guard.ts`). It is free to everyone until `FREE_UNTIL`
(2027-01-01), then $12/month. The job feed itself is free.

No cutover to run: `isEntitled()` short-circuits to `true` during the free
period and `startCheckout` refuses to run, so no subscription — and no revenue —
can be created before that date. Every gate and every piece of pricing copy
reads `isFreePeriod()` at request time, so the paywall arrives on its own with
no deploy.

### AI assistant — read before touching it

- Jobs come from public Greenhouse, Lever and Ashby boards
  (`apps/web/lib/jobs/companies.ts`), plus USAJOBS and Adzuna only when their
  keys are set. Nothing is scraped from job sites, and nothing is submitted for
  the user. They apply on the company site themselves.
- Tailored text may only reword facts already in the resume. Each kit has a
  "check these" list. Missing keywords are shown as gaps, never added.
- Resume and job text are untrusted data and are wrapped in tags in prompts.
- Pasted job URLs go through `safeFetchJobPage` (SSRF checks).
- 40 AI calls per user per day, counted in `ai_usage`.
- Needs `ANTHROPIC_API_KEY` in `apps/web/.env.local` and migration
  `0006_ai_assistant.sql`. Without either, the pages show a notice instead of
  crashing.

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
   `packages/db/migrations/0001_init.sql`, then each later file in order through
   `0006_ai_assistant.sql` (or use the
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

**Not verified:** the mobile layout on a real device, and any real AI call
(resume parse, match scores, apply kit) on the `ai-revamp` branch.
