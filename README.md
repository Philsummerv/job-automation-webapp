# ApplyAssistUI — web app

A job-search **activity documentation tool for unemployment compliance**, with
optional Guided browser assistance. Users log every job-search activity, track
their weekly requirement, and export a DOL-ready PDF/CSV.

This is the hosted web version of the `job-automation` Electron desktop app. See
the approved build plan for the full architecture and roadmap.

## Status — M0 shipped (Self-Directed logging + Activity Log + export)

Implemented:
- Magic-link auth (Supabase Auth)
- Onboarding + settings (state, weekly requirement, reporting-week start day, consent)
- Self-Directed activity entry form with optional evidence-screenshot upload
- Activity Log dashboard grouped by reporting period with an "X/target this week" badge
- PDF (DOL-style) and CSV export per reporting week
- Compliance-first marketing landing page

Deferred to later milestones: M1 billing ($12/mo subscription + 14-day trial),
M2 Guided browser runs, M3 resume management + evidence capture polish.

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
   `packages/db/migrations/0001_init.sql` (or use the Supabase CLI:
   `supabase db push`). This creates `profiles`, `activity_log`, RLS policies,
   the signup trigger, and the private `evidence` / `resumes` storage buckets.

3. **Configure env.** Copy `apps/web/.env.example` to `apps/web/.env.local` and
   fill in your Supabase URL, anon key, and service-role key (Project Settings →
   API). Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` for local dev.

4. **Email redirect.** In Supabase → Authentication → URL Configuration, add
   `http://localhost:3000/auth/callback` to the allowed redirect URLs.

5. **Install & run:**
   ```bash
   npm install
   npm run dev          # http://localhost:3000
   ```

## Scripts (run from repo root)

- `npm run dev` — start the web app
- `npm run build` — production build
- `npm run typecheck` — typecheck all workspaces

## Verified

`npm run typecheck` and `npm run build` both pass (13 routes). The public landing
and login pages serve. Full end-to-end verification (sign in, log an activity,
export) requires a configured Supabase project per the setup steps above.
