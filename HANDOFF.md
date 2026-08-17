# 👉 START HERE (2026-08-09) — the Chrome extension is mid-build

**Everything below this section is older launch history. Read this part first.**

## Where the extension stands

The whole Indeed loop works EXCEPT the final step. Verified live today:
search → job list → pick a job → it presses "Apply with Indeed" by itself →
the application form opens. That last bit took most of the session and is
finally fixed (`b27ed47`).

**The one broken thing: the scan finds nothing on the questions page.**
Panel shows `run started` → `scanned: 0 question(s)` and then sits on
"Reading the application…" forever, on a page visibly showing five radio
groups ("Do you have experience with Laboratory experience?" etc).
`18bfba8` added a wait for form controls to render and did NOT fix it.

### UPDATE 2026-08-09 (latest) — root cause found in the code, fix built, NEEDS A LIVE TEST

**The controller was killing the run while the scan was still working.**
`NO_FORM_TIMEOUT_MS` was 4000ms, armed the moment the scan is broadcast. The
`18d17ec` hop loop spends ~2.2s per question-less page, so by the time it
reached the real questions page the window had closed: the reducer had already
taken the run to `done` and cleared it, so the `scan-result` that followed hit
`isForActiveRun() === false` and was dropped on the floor. Panel keeps the last
log line it wrote (`scanned: 0 question(s)`) and spins forever. That matches
every symptom exactly.

What changed (all in this commit):
- Frames send a new `scan-progress` message before each hop; the reducer
  re-arms the no-form window. The window itself is now 12s — a backstop, not a
  race.
- Scans WAIT for the step to render: `scanWhenReady()` polls for a form control
  (2.5s) and then re-scans until questions parse (6s). Scanning the instant a
  page appears was reading Indeed's empty shell.
- **Never hop past a page that HAS controls.** Hopping only happens on a page
  with no controls at all. Clicking Continue on a page whose questions we
  failed to read would submit the user's application with them blank.
- A page with controls but 0 parsed questions now ends the run loudly
  (`unreadable form (...)`) with a DOM summary in the log —
  `labels:.. radios:.. fieldsets:..` — so the next test says instantly whether
  this is still a timing bug or a `collectFormQuestions` parser bug.
- Frames that aren't the application itself (the `/viewjob` page behind an
  overlay) no longer answer a scan. Its header search box is a text input the
  scraper reads as a question — that frame could pre-empt the real form frame.
- The spinner is cleared by an `activeRun` watcher, so ANY ending (timeout,
  error, completion) replaces it with a reason. It was only ever cleared by the
  review gate.
- Panel buttons reworked as requested: 🔎 Find jobs is the primary action;
  Scan is demoted to a small "↻ Rescan page" recovery button next to Cancel.

**Still unverified on a live page.** If the next run logs
`unreadable form (labels:N radios:N …)` with non-zero counts, the remaining bug
is in `collectFormQuestions` (`packages/automation/src/forms.ts`) and lead 2
below is the one to chase — with the counts telling you what it saw.

### UPDATE 2026-08-09 (earlier) — narrowed, still open

Two things were proven by inspecting a LIVE application:
- The flow opens on `smartapply.../form/commute-check`: 0 labels, 0 radios,
  one button "Continue applying". An empty scan is the run's "flow
  complete" signal, so the run died on page 1. Fixed in `18d17ec` (scan
  now hops past question-less pages).
- Iframes are NOT the problem on the navigated route: that page had only a
  reCAPTCHA iframe and an empty one.

**Still stuck after that fix**, now on the questions page (33%), panel
showing only "scanned: 0 question(s)" and a frozen "Reading the
application…". Best remaining theory, UNVERIFIED:

> The apply form sometimes arrives as an OVERLAY IFRAME on
> indeed.com/viewjob rather than by navigation (both routes are real —
> confirmed earlier). The content script runs in every frame and **each
> frame builds its own panel**. The panel the user sees belongs to the TOP
> frame, which genuinely has no questions — so it logs "scanned: 0" — while
> the form iframe scans, fills, and renders its review gate into ITS OWN
> panel, hidden behind the overlay. That would explain a stuck spinner with
> a correct-but-useless top-frame log.

Check this first: on a stuck page, open devtools, switch the console's
frame selector to the smartapply iframe, and see whether that frame's
panel exists and what its log says. If confirmed, the fix is for child
frames to render no panel and instead relay their state to the top frame's
panel (one visible UI per tab).

### ALSO REQUESTED (user, 2026-08-09): rework the panel's buttons — DONE

"Find jobs" is now the primary action; Scan is a small "↻ Rescan page"
recovery button beside Cancel.

### Debug that first — leads, in order

1. **The form is very likely in an IFRAME.** The panel says "top frame" and
   reports 0, which means the frame that owns the form either never
   answered the scan or has no content script in it. Check whether the
   questions live in an iframe (`document.querySelectorAll('iframe')` on the
   apply page) — the manifest has `all_frames: true`, so a frame on a
   non-`*.indeed.com` host would get no content script at all.
2. **Or `collectFormQuestions` doesn't match this markup.** It's in
   `packages/automation/src/forms.ts` and is shared with the Playwright
   scout. These radio groups may not be inside a `<fieldset>`, which that
   scraper leans on.
3. Use the Claude-in-Chrome browser tools to open a live Indeed apply page
   and run `collectFormQuestions` against it directly. That worked well
   twice today (it's how the apply-button and job-scrape bugs were found) —
   inspect the live page rather than reasoning from the code.
4. ~~The busy spinner never clears when a run ends with nothing.~~ FIXED —
   an `activeRun` watcher now clears it with a reason on any ending.

## Then: resume keyword matching (user asked for this, decided 2026-08-09)

Per-job questions like "experience with Compounding medications?" can never
be covered by a fixed template, so infer them from the user's resume.
**User chose plain KEYWORD MATCHING for now, not an LLM.**

- The resume is already stored (base64 in `chrome.storage`, picked via the
  panel's 📄 Resume button) but its TEXT is never extracted — that's the
  missing piece.
- `makeSuggestFromResume` already exists in
  `packages/automation/src/autofill.ts` and greps resume text for skills,
  years and education. It is currently unused by the extension.
- Shape: extract text once at upload, store it beside the file, and for a
  "do you have experience with X?" question answer Yes when X appears in
  the resume. **No match must leave it UNANSWERED for the review gate to
  ask** — never guess a No, and never claim experience on a weak match.
  This is a claim made to an employer in the user's name; stay conservative.
- Nice follow-on: when the user answers one by hand, offer to save it as a
  custom rule so it fills itself next time.

## How to test the extension (needed every time)

1. `npm run build:ext` (from the repo root)
2. `chrome://extensions` → refresh icon on the JobAssistUI card.
   **If the manifest changed, Remove and Load unpacked `apps/extension/dist`
   instead** — a refresh may not grant new permissions.
3. Removing the extension WIPES `chrome.storage`, so the account template is
   gone until a jobassistui.com tab is reloaded (the bridge re-syncs it).
4. Read the log at the BOTTOM of the dark panel — that's the only debug
   surface. Green ✓ worked, red ✗ failed.

## Hard-won gotchas from 2026-08-09 (don't re-learn these)

- **A content script cannot press "Apply with Indeed".** It runs in an
  isolated world; Indeed's handler is an `onclick` property that reads as
  null from there, and dispatched events are ignored. It's pressed via
  `chrome.scripting` with `world:"MAIN"` from the worker
  (`pressApplyInPage` in `background.ts`). This is why the Electron app
  "just works" — Playwright produces genuinely trusted input.
- The apply button's handler is on a WRAPPER span
  (`indeed-apply-status-not-applied`, `data-click-handler="attached"`), and
  the wrapper ALSO has a tracking `onclick`. Call the BUTTON's handler, not
  the first one found, and always `.click()` as well.
- Every job page carries a hidden `<iframe src=".../preloadresumeapply">`.
  Do not count it as "the application is open" — that bug made a successful
  press look already-finished.
- Indeed rewrites its own URLs (`/rc/clk` → `/viewjob` → `/?vjk=`), so match
  a job by its key appearing ANYWHERE in the URL, not by one query param.
- **Never bail silently.** Three separate bugs today presented as a blank
  panel or a stuck spinner because a guard returned without logging.
- `chrome.storage` has no migrations. Validate the shape of anything read
  back; a queue written by an older build crashed on a field it lacked.
- Indeed's markup has no stable ids or classes (`css-1neivp9`, hashed ids).
  Match on text, `aria-label`, or semantic `data-*` hooks only.

## Not the extension? Then the web app is live and healthy

Product is launched and taking real money. Login is code-only and email is
fully authenticated (SPF+DKIM+DMARC, inbox-verified). See the launch
sections below.

---

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

**⚠️ FREE UNTIL 2027-01-01 (set 2026-08-17).** The paywall above is currently
switched off: the product is free to everyone with **no card collected** until
`FREE_UNTIL` in `packages/shared/src/index.ts`. Reason — the owner is
collecting unemployment and cannot take income before then, but wants to market
now and gather user feedback. Mechanics:
- `isEntitled()` returns `true` while `isFreePeriod()`, which opens both the web
  paywall (`lib/auth.ts` `requireEntitled`) and the extension's
  `/api/extension/session` in one place.
- `startCheckout` (`app/(app)/billing/actions.ts`) hard-returns during the free
  period, so no Stripe subscription can be created and no money can arrive.
- All pricing copy (landing, billing, settings, OG image) branches on
  `isFreePeriod()`, and the root layout has `revalidate = 3600` so the
  statically-prerendered marketing pages expire the free-period copy on their
  own. **Nothing needs to be deployed on 2027-01-01** — the site re-paywalls
  itself and existing free users get bounced to `/billing`.
- Decision: **no grandfathering.** Everyone pays from 2027-01-01. Because their
  `trial_ends_at` is still `null` they'll be `trialEligible` and get the normal
  14-day trial at that point; make `trialEligible` unconditional then if you'd
  rather they pay immediately.
- To end the free period early, move `FREE_UNTIL`. To go back to paid entirely,
  delete the short-circuit in `isEntitled` and the guard in `startCheckout`.

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
