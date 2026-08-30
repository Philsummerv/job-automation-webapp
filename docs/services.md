# Service accounts this project depends on

Written 2026-08-30 by reading the repo, not from memory: every entry below is
backed by an env var, a dependency, or a config file that actually exists here.

**You are NOT using Neon.** Searched the whole repo — no reference anywhere.
If there's a Neon account, it belongs to a different project. Your database is
Postgres, but it's the one inside Supabase.

Quick answer to "how many things am I paying for": **one, today** — the Chrome
Web Store's $5, already paid, one-time. Everything else is on a free tier.
Stripe takes a cut only when someone pays you, which nobody has yet.

---

## Live — the site breaks without these

### 1. Supabase — database, login, file storage
- **What it does:** Postgres database (`profiles`, `activity_log`, `feedback`,
  `assistant_log`), email sign-in codes, and the private `evidence` / `resumes`
  storage buckets.
- **Env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`
- **Where you go:** supabase.com → project `job-automation-webapp-dev`
- **Costs:** free tier
- **You have to touch it by hand for:** the sign-in email templates
  (Authentication → Emails), and applying SQL migrations from
  `packages/db/migrations/`. Neither is in the code deploy.
- **If it goes down:** nobody can sign in and nothing loads.

### 2. Vercel — hosting
- **What it does:** builds and serves the Next.js site, holds the production
  env vars, owns the `jobassistui.com` domain routing.
- **Where you go:** vercel.com
- **Costs:** free (Hobby)
- **Known constraint:** Hobby caps serverless functions at ~10 seconds. Any
  future feature needing longer (the cloud-browser Guided path, a web-search
  chatbot) requires Pro at $20/mo. Nothing today needs it.
- **Deploys:** automatically, on push to `main`.

### 3. Resend — outbound email
- **What it does:** two separate jobs, easy to confuse:
  1. **SMTP for Supabase** — actually delivers the sign-in code emails. The
     domain `jobassistui.com` is verified here; sender is
     `login@jobassistui.com`.
  2. **Direct API** — `apps/web/lib/notify.ts` POSTs to Resend's REST API to
     email you when someone leaves feedback.
- **Env vars:** `RESEND_API_KEY`, `FEEDBACK_FROM_EMAIL`
- **Where you go:** resend.com
- **Costs:** free tier
- **This is the "email delivery service" you were trying to remember.**
- **If it goes down:** nobody can sign in, because they never get the code.

### 4. Stripe — billing
- **What it does:** the $12/month subscription, the customer portal, and a
  webhook that syncs subscription state into `profiles`.
- **Env vars:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`
- **Where you go:** dashboard.stripe.com — **LIVE mode**, verified end-to-end
  with a real card on 2026-08-06/07
- **Costs:** per-transaction only, so nothing until someone subscribes
- **Dormant until 2027-01-01:** `startCheckout` refuses to run during the free
  period, so no subscription can be created before then.

### 5. GitHub — code
- **Repo:** `Philsummerv/job-automation-webapp`
- **Costs:** free
- **Worth confirming:** whether this repo is public or private. If it's public,
  check that nothing personal has ever been committed. `.gitignore` covers the
  env files and personal claim documents, but it's worth a look.

### 6. Chrome Web Store — extension distribution
- **What it does:** where Guided assist will be published so people can install
  it in one click instead of developer mode.
- **Where you go:** chrome.google.com/webstore/devconsole
- **Costs:** $5 one-time developer fee — **already paid**
- **Status:** you have one published extension (SoundCloud Segment Looper).
  JobAssistUI has not been submitted. Package is built and waiting at
  `apps/extension/jobassistui-store.zip`.

---

## Parked — accounts you have but nothing currently uses

Both belong to `packages/automation`, the cloud-browser Guided path that was
built, proved to work on 2026-07-05, and shelved on cost. **Neither is in the
web build.** Nothing on jobassistui.com touches them.

### 7. Browserbase — cloud browser
- **What it did:** ran a real Chrome on a server that the automation drove.
- **Env vars:** `BROWSERBASE_API_KEY`, `BROWSERBASE_CONTEXT_ID`
- **Costs:** usage-based — browser-minutes
- **⚠️ There is a live API key sitting in `packages/automation/.env` on your
  disk.** It's gitignored, so it isn't published, but it still works. If you're
  not going back to the cloud-browser path, **revoke it** — a leaked key on a
  usage-billed service is somebody else's free compute on your card.

### 8. 2Captcha — CAPTCHA solving
- **What it did:** solved Cloudflare challenges during automated runs.
- **Env var:** `TWOCAPTCHA_KEY`
- **Costs:** prepaid balance
- **⚠️ This one should go regardless.** `packages/automation/src/captcha.ts` is
  a ToS liability — circumventing a security measure — and it must not ship in
  anything published to the Chrome Web Store. Check whether that account has a
  balance on it and empty or close it.

---

## Not a service, but on the list of things you own

- **Domain `jobassistui.com`** — registered through Vercel. Renews annually.
- **`prs.educ01@gmail.com`** — the project's support address, hardcoded as
  `SUPPORT_EMAIL` in `apps/web/lib/site.ts`. Appears on the Terms and Privacy
  pages. Not your personal address, deliberately.
- **Vercel Analytics** — `@vercel/analytics` is in the web app, mounted in the
  root layout. Free, no separate account, part of Vercel.

---

## Things you might reasonably think you're using and are not

- **Neon** — not used. No reference in the repo.
- **Notion** — the old Electron app synced to a Notion database. That was
  dropped in the port to the web app (see the note in
  `packages/automation/src/config.ts`). Your Work Search Log table in Notion is
  yours, but nothing in this codebase writes to it.
- **Anthropic / any AI API** — no key, no dependency, no calls. The Rules
  Assistant on the `rules-assistant` branch would need one, but it isn't live
  and the branch runs fine without it.
- **Upstash / Redis / any cache** — none.
- **Any error-tracking or logging service** — none. Errors go to the Vercel
  function logs.

---

## If you ever need to rebuild this from scratch

Order matters, because each step needs the one before it:

1. Supabase project → run the migrations in `packages/db/migrations/` in order
2. Resend → verify the domain → point Supabase's SMTP at it → paste the email
   templates from `docs/email/`
3. Vercel → connect the GitHub repo → set every env var from
   `apps/web/.env.example`
4. Stripe → create the $12/mo product → set the webhook to
   `https://<site>/api/stripe/webhook`
5. Point the domain at Vercel

`apps/web/.env.example` documents every variable and where to find its value.
