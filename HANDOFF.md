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
- **The Chrome extension was phased out on 2026-08-06** (user decision: "all
  functionality migrated out of a chrome extension and into a web
  interface"). All extension references removed from user-facing copy;
  Guided assist is marketed as "coming soon" only.

  ⚠️ **BUT read `apps/extension/STAGE_B_STATUS.md` before acting on that.**
  The extension is NOT an abandoned POC — Stage B was finished and merged
  on 2026-07-18 and the doc records it verified end-to-end on Indeed
  smartapply: full guided run loop (scan → fill from template → review gate
  → advance → submitted, no auto-submit), review gate rendering each
  question in its native control, answer template synced from the web app
  via `/api/extension/{session,template,activity}`, auth + subscription
  entitlement gating, and completed applications logged to `activity_log`
  with source `guided`. That is the Guided feature, essentially built.
  Under-reinvestigation as of 2026-08-08 (see "Is the extension the
  profitable path?" below).

## Production infrastructure (all live)

| Piece | State |
|---|---|
| Domain | `jobassistui.com` bought via Vercel; apex 308s → **www.jobassistui.com** (canonical) |
| Hosting | Vercel, deploys automatically on push to `main` |
| Email | Resend custom SMTP in Supabase; sender `login@jobassistui.com`. Fully authenticated as of 2026-08-08: SPF (`send.jobassistui.com` → amazonses.com), DKIM (`resend._domainkey`, aligned to the root From: domain), and DMARC (`_dmarc` → `v=DMARC1; p=none; rua=mailto:psommerville3@gmail.com`) all verified live via DNS. First post-DMARC send landed in the Gmail **inbox** |
| Auth | **Typed email code only — no sign-in links anywhere.** Code length 6. Both the "Confirm signup" AND "Magic Link" templates in Supabase hold identical code-only bodies containing `{{ .Token }}` and no `{{ .ConfirmationURL }}` |
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

## 2026-08-08 session: the new-user signup path was broken

Testing with a fresh Yahoo address surfaced two problems that launch-night
testing structurally could not have caught, because every account tested
that night already existed.

**1. Every brand-new signup got a link-only email while the page asked for
a code.** Supabase picks its email template by account state: an email with
no existing user runs the signup path and gets the **"Confirm signup"**
template; only existing users get **"Magic Link"**. Launch night customized
only Magic Link. `{{ .Token }}` has to be added to each template
separately, and the presence of `{{ .ConfirmationURL }}` is what makes
Supabase send a link at all. Both templates now carry identical code-only
bodies — every user, new or returning, gets a typed code and no link.

**2. The DMARC record had never actually been added**, which is why Yahoo
spam-filed the mail. Now live and verified. Reputation builds from send
history from here; revisit moving `p=none` → `p=quarantine` around Sept
2026. Not yet done: Google Postmaster Tools, a mail-tester.com score.

Commits: `e65ec1a` (verifyOtp retries `type:"signup"` after `type:"email"`
so first-time signups aren't stranded), `6ee8006` (login copy).

**Google sign-in was built and then reverted** at the user's request —
abandoned partway through Google Cloud Console setup as too much
configuration. It was never pushed. Don't re-propose it.

**All Supabase users were deleted** for a clean new-user test. The owner
account re-signs-up normally (comped access keys off email, not any row).
Two consequences: the plan to test the lapsed-subscription state around
Aug 20 is dead with that old account, and note that deleting a `profiles`
row alone does NOT remove the auth user — the cascade only runs
auth.users → profiles/activity_log, and `on_auth_user_created` fires only
on INSERT, so a table-only delete strands an auth user with no profile.
Always delete from Authentication → Users.

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

All users were deleted 2026-08-08, so both of these are fresh.

- `psommerville3@gmail.com` — owner, comped via `COMPED_EMAILS` (shows
  "Complimentary access"). Just re-signup; comp is keyed on the email.
- `psommerville3+test@gmail.com` — recreated 2026-08-08, **not comped**, so
  it walks the real paying-customer funnel. A fresh trial will work:
  eligibility keys off `trial_ends_at` on a brand-new profile row, and the
  surviving `used_card_fingerprints` rows are record-only.

## Pick up here

**First, the user wants to explore the site's features and functionality on
their own** — hands-on, unassisted, to form their own view of the product
before deciding what to change. Don't drive the browser or run a scripted
test pass over the top of this; let them look, then work from what they
report back.

**Then a full working-order check.** Not a formal QA pass — the goal is
confidence that everything works "somewhat okay" end to end before real
users arrive. Sweep every feature: onboarding, add/edit/delete activity,
the weekly badge math, settings changes propagating, answer template, CSV
and PDF export, billing/paywall states. Fold in the three surfaces still
never tested: the site on a real phone, evidence screenshot upload, and an
export for a state other than New York.

**LinkedIn is DEFERRED (user decision 2026-08-08) — Indeed is the vector.**
The user wants Guided assist (search + apply + template fill-ins, browser-
navigator style) built out on **Indeed first**; they'll revisit LinkedIn
integration later on their own terms. Reasons this is the right order:
Indeed already has a passing end-to-end go/no-go behind it (2026-07-05)
and its adapter exists in `packages/automation/src/indeed.ts`, whereas
LinkedIn explicitly prohibits automated access in its User Agreement and
routinely restricts accounts for it — which would land on *users*, whose
professional network and job history are on the line, and would sit far
from the carefully-built "user-directed, user confirms every action" legal
posture.

**Carried over unchanged: the residential-proxy economics still apply to
Indeed.** Dropping LinkedIn removes the account-ban exposure, not the cost
problem — the Cloudflare Turnstile loop that motivated proxies happened on
*Indeed*, through Browserbase's datacenter IP. Answer these before writing
worker code: (1) proxy strategy and whether image/font/media blocking gets
per-session bandwidth low enough to survive $10/GB; (2) whether Guided
lives under a fair-use cap on the $12 tier or becomes a higher tier; (3)
persistent Browserbase contexts are per-user (that's what makes login
survive between runs), so factor per-user context cost and storage.

Also worth weighing first: the much cheaper **assist-without-automation**
shape — the user drives Indeed in their own browser and the product
surfaces their template answers and one-click-logs the application. Keeps
the core value (no retyping, no manual logging), skips the cloud browser,
proxy bill, and ban risk entirely. See [[project-guided-template-ux]].

### Is the extension the profitable path? (raised 2026-08-08)

Short answer: yes, decisively, on unit economics — and the build is
already done (see the ⚠️ note at the top).

- **Extension marginal cost per guided run: $0.** It runs in the user's own
  Chrome, on their residential IP, using their bandwidth. Gross margin on
  Guided stays ~100% forever.
- **Cloud-browser marginal cost: real and usage-scaling.** Residential
  proxies ~$10/GB plus browser-minutes, against a flat $12/mo — the worst
  possible cost shape. Needs fair-use caps purely to stay solvent.
- The extension also **deletes infra that otherwise has to be built, paid
  for, and operated**: worker, BullMQ/Redis, WebSockets, live-view UI.
- It **dissolves the login problem entirely** — it's the user's own browser,
  already signed into Indeed. No persistent Browserbase contexts, no
  email-code login inside a live view, no per-user context cost.

Real costs, honestly: Chrome Web Store review latency on every update
(which is exactly what motivated the `problem_reports` telemetry design);
desktop-Chrome-only, so no mobile; and install friction. Friction is the
one that matters — but it lands well here, because Guided is not the
acquisition hook. People sign up for compliance logging and exports; the
install ask only reaches someone already paying who actively wants Guided.

This is not really a reversal of the 2026-08-06 direction. Same-origin
means a web page fundamentally cannot fill forms on indeed.com, so the
extension is the delivery mechanism for one feature, not a competing
product — which is how `STAGE_B_STATUS.md` framed it all along. The web app
stays the brain (account, billing, template, log, exports); the extension
is the hands.

**To actually ship it:** update `apps/extension/manifest.json` (still named
"ApplyAssistUI", host permissions still point at
`job-automation-webapp-web.vercel.app` — needs `https://www.jobassistui.com/*`),
rebuild `dist/`, then Chrome Web Store listing (developer account is a $5
one-time fee, plus screenshots, privacy disclosure, review). Then reinstate
Guided in user-facing copy, which commit `c2c8f1f` stripped. Known gaps
worth closing first are listed in `STAGE_B_STATUS.md`: resume file upload
via DataTransfer, verify-after-settle fill hardening, job-metadata selector
coverage.

Also outstanding from before:

1. Re-run the paid funnel on `psommerville3+test`: onboarding → log a
   couple of activities → paywall → real-card trial → portal cancel. A lot
   has changed since launch night; this re-proves it on current code.
2. Retest deliverability with a fresh Yahoo address now that DMARC is live
   (the Gmail send after propagation landed in the inbox).
3. Then marketing / first users — see Next steps below.
