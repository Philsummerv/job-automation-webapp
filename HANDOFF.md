# JobAssistUI — Launch Handoff (updated 2026-08-07)

Reference doc for picking work back up. Written at the end of the launch push.

## Where things stand: LAUNCHED 🚀

**JobAssistUI is live at https://www.jobassistui.com with real Stripe billing.**
The full revenue funnel was verified end-to-end with a real card on launch
night (2026-08-06/07): signup → email-code login → onboarding → paywall →
live Checkout → `trialing` → portal cancel. A follow-up automated browser
test pass (Claude driving Chrome against prod) verified every core flow and
the issues it found were fixed and re-verified the same night.

**The product is ready for customers. The next phase is marketing, not code.**

## What the product is

Job-search activity documentation tool for unemployment compliance (most
states require 3–5 documented activities/week to keep benefits). Users log
activities, track a weekly count against their state requirement, and export
DOL-ready PDF/CSV reports. $12/month, 14-day free trial, card required at
trial start. Full paywall on everything; `COMPED_EMAILS` env var bypasses it
(owner + future beta testers).

**Strategic decisions locked on 2026-08-06:**
- Product renamed **JobAssistUI** (was ApplyAssistUI) to match the domain.
  Internal package names are still `@applyassistui/*` — cosmetic only, not
  worth the churn.
- **The Chrome extension is phased out** (user decision: "all functionality
  migrated out of a chrome extension and into a web interface"). All
  extension references removed from user-facing copy. Guided assist is
  marketed as "coming soon" only. The future web-native Guided = the
  cloud-browser path (Browserbase live-view iframe) already proven in the
  July go/no-go; build it when revenue justifies (economics need residential
  proxies + browser-minutes → fair-use cap or higher tier). `apps/extension`
  stays in-repo but gets no further investment.

## Production infrastructure (all live)

| Piece | State |
|---|---|
| Domain | `jobassistui.com` bought via Vercel; apex 308s → **www.jobassistui.com** (canonical) |
| Hosting | Vercel, deploys automatically on push to `main` |
| Email | Resend custom SMTP in Supabase; sender `login@jobassistui.com`; domain verified. First sends landed in Gmail spam (new domain) — DMARC TXT record (`_dmarc` → `v=DMARC1; p=none;`) was recommended in Vercel DNS; **verify it was actually added** |
| Auth | Supabase magic link **plus typed email code** (OTP). Code length set to 6 in Supabase. Email template customized to include `{{ .Token }}` and a `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` link (works cross-browser) |
| Stripe | LIVE mode: product JobAssistUI $12/mo, webhook `https://www.jobassistui.com/api/stripe/webhook` (4 events: checkout.session.completed + customer.subscription.created/updated/deleted), portal config saved. Secret key is a named key `vercel-production` (the original was expired after a copy mix-up) |
| Vercel env (Production) | `STRIPE_SECRET_KEY` (sk_live), `STRIPE_PRICE_ID` (price_), `STRIPE_WEBHOOK_SECRET` (whsec_), `NEXT_PUBLIC_SITE_URL=https://www.jobassistui.com`, `COMPED_EMAILS=psommerville3@gmail.com`, plus the three Supabase vars |
| Supabase | Site URL + redirect allowlist include the www domain; rate limits raised for email |

## Launch-night gotchas worth remembering

- **Stripe live secret keys are revealable exactly once.** The "API key ID"
  (`mk_...`) shown in the dashboard is NOT the key. If the key is lost,
  create a new named key — don't hunt for the old value.
- **Vercel env vars marked "Sensitive" show stale previews on edit** —
  delete-and-recreate instead of editing when in doubt. (A paste mix-up put
  the sk_live key into `STRIPE_PRICE_ID`; caught via the /billing 500 log:
  `Invalid API Key provided: mk_...`.)
- **Magic links break easily** (Gmail scanner consumes them; PKCE requires
  same-browser). The typed-code path is the robust one; keep it.
- **CSV BOM:** `apps/web/app/export/csv/route.ts` contains a *literal
  invisible U+FEFF* inside the quoted string — deliberate (Excel UTF-8).
  Don't let a formatter or "cleanup" strip it.

## Commit history of the launch push (all on `main`, pushed)

- `e5c8d3f` Launch surface: /terms + /privacy, favicon, OG image + metadata,
  robots/sitemap, branded 404/error pages, login error display
- `c2c8f1f` Removed all extension references from user-facing copy
- `6356c1d` Renamed product to JobAssistUI everywhere user-visible
- `8915282` Login: "check your spam folder" nudge
- `fc56743` Login: accept the emailed OTP code (verifyOtp) as alternative to link
- `5c29971` OTP copy made length-agnostic
- `ec0e595` Polish from live E2E pass (see below)

## The automated E2E pass (2026-08-07) — what was verified on prod

Passed: landing/terms/privacy/404/login-guard; add-activity with special
chars + 120-char employer name; badge math; settings propagation (3→5→3);
entry deletion; CSV export (RFC-4180, chars intact, BOM verified live); PDF
export (read the actual downloaded file — DOL-style layout, claimant/state/
week header, shortfall callout, clean truncation); template page; billing
comped state; all-50-states dropdown.

Found & fixed in `ec0e595` (re-verified live after deploy):
1. Billing + settings showed a stale test-mode subscription ("Active, renews
   Aug 4 2026" — past date) instead of comped status → comped now wins
   everywhere.
2. CSV lacked UTF-8 BOM → Excel mojibake for accents/dashes → fixed.
3. No pending state on save/checkout/portal buttons (~4s silent saves,
   double-submit risk) → `components/SubmitButton.tsx` (useFormStatus).

**Not yet tested:** mobile layout on a real phone (check landing + dashboard
+ add-activity), evidence screenshot upload flow, non-NY state exports.
User's own profile row still carries stale test-mode Stripe columns —
harmless (comped wins), optional SQL cleanup someday.

## Next steps (in rough priority order)

1. **Marketing / first users.** Highest-intent channels: state unemployment
   subreddits + Facebook groups (post genuinely helpful compliance answers),
   and SEO landing pages per state ("[State] work search requirements +
   log template"). Watch trial starts in Stripe; trial→paid conversion is
   the number that decides everything.
2. **2–3 comped beta users** (add emails to `COMPED_EMAILS` in Vercel,
   redeploy) — watch them use it, fix confusion points.
3. **Phone check** of the site (see "Not yet tested").
4. Support email: legal pages currently list `psommerville3@gmail.com` —
   consider `support@jobassistui.com` (Resend inbound or registrar forward),
   then update `SUPPORT_EMAIL` in `apps/web/app/terms/page.tsx` and
   `apps/web/app/privacy/page.tsx`.
5. Later, revenue-permitting: **web-native Guided** (cloud-browser, worker +
   `/run/[runId]`, foundation in `packages/automation` already proven);
   activity-reminder emails (idea logged 2026-07-06 — Vercel Cron + Resend);
   trial-abuse enforcement (card fingerprints currently record-only,
   `lib/billing.ts`).

## Test accounts

- `psommerville3@gmail.com` — owner, comped (shows "Complimentary access")
- `psommerville3+test@gmail.com` — real live-mode account: started a trial
  with a real card, then canceled via portal. Entitled until ~Aug 20, then
  becomes `canceled` (useful for testing the lapsed state after that date).
