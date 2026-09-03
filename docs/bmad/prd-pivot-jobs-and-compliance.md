# PRD — Jobs in front of people, and a claim that documents itself

**John (PM), 2026-09-02.** Scoping the pivot the owner described:

> "…just a tool that can help put jobs in front of unemployed people, help alert
> them to fairs and opportunities etc, and make sure they're documenting their
> claim correctly."

Written against the code at `main` (`c96b0f4`), Mary's `audit-state-of-reality.md`
and Sally's `ux-first-run-mobile.md`. I did not redo their work; where I rely on
a finding I cite it.

---

## The thesis, in one sentence

**The job you were shown becomes your compliance record in one tap.**

That sentence is the whole product and the only part of it that nobody else
already does. Indeed, Google Jobs and NY's own JobZone all show jobs. None of
them turns a job you looked at into a dated, exportable work-search record that
satisfies your state. If the build does not nail the one tap between "here is a
job" and "that is now in my log", this is a worse Indeed and should not be
built.

Everything below is sequenced against that sentence.

## Goals

1. A person on a phone, from a Facebook link, sees real jobs near her within
   15 seconds and without signing in.
2. Logging one of those jobs takes one tap plus a sign-in, and never more.
3. The weekly requirement is visible, and the proof of it exports.
4. Fairs, hiring events and the nearest American Job Center are in the same
   place, and each of them is also a loggable activity.

## Non-goals

Applying on her behalf. Filling forms. Anything that touches Indeed. Anything
that needs a desktop.

---

## What this plan assumes (and what happens if the assumption fails)

A parallel agent is validating free government job and event data. I have
assumed it succeeds. Where the plan leans on it:

| Depends on | Used by | If it fails |
|---|---|---|
| A free jobs API (CareerOneStop, NLx) with an obtainable key | Epic 1 stories 1.2–1.4 | Fall back to Story 1.0, the hand-curated list, which is already the first story and needs no API at all |
| A machine-readable NY DOL events/fair feed | Epic 3 | Hand-curated the same way; NY publishes maybe 5–20 events a month statewide, which one person can transcribe in 20 minutes a week |
| A center-locator API or a downloadable AJC list | Epic 4 | The full US list of American Job Centers is a few thousand rows and is published as a file. Ship it as static JSON in the repo. This one is very unlikely to block. |

**None of the first-built work depends on the validation landing.** That is
deliberate. Story 1.0 proves the thesis with a JSON file.

---

# 1. KEEP — carries over unchanged

The audit's finding stands: the free tracker is a complete, coherent product,
not a prototype. The pivot does not invalidate any of it. It re-points it.

**Auth and session.** `apps/web/lib/auth.ts` (`requireUser`, `requireOnboarded`),
`lib/supabase/{server,client,middleware,service}.ts`, `middleware.ts`,
`app/login/page.tsx`, `app/auth/{callback,confirm,signout}`,
`components/LoginForm.tsx`. The `?redirect=` preservation in
`lib/supabase/middleware.ts:61-80` is load-bearing for the new flow — "log this
job" on a public page bounces to sign-in and comes back. It already works.

**The data model.** `packages/db/migrations/0001_init.sql` needs no change for
the core pivot. `profiles` already holds `state`, `weekly_target`,
`reporting_period_start_day`. `activity_log` already holds everything a job
listing is: `employer_name`, `job_title`, `url`, `date`, `method`, `result`,
`notes`, `evidence_path`, `reporting_period`. RLS is per-row and correct. The
`handle_new_user` trigger and the private `evidence` bucket stay as they are.

**Two enum values that make Epics 3 and 4 nearly free.** `ACTIVITY_METHODS` in
`packages/shared/src/index.ts` already contains `job_fair` and `networking`, and
the SQL check constraint already allows them. Logging a career-fair attendance
or a Job Center visit needs **no migration and no new table** — it is an
existing method value with a different button on it.

**Reporting-period math.** `packages/shared/src/index.ts` —
`startOfReportingPeriod`, `endOfReportingPeriod`, `reportingPeriodKey`,
`groupByReportingPeriod`, `formatPeriodRange`. Dependency-free, correct about
local calendar dates, and untouched by the pivot.

**Export.** `app/export/pdf/route.ts` (WinAnsi sanitiser, pagination, shortfall
callout), `app/export/csv/route.ts`, `lib/export.ts`. This is the payoff of the
whole product and it is built. One header change in the PDF (finding: switch
`Content-Disposition` to `inline`, Sally #5) is a fix, not a rebuild.

**Settings and onboarding.** `app/(app)/settings/*`. The disclaimer gate is
still required — the legal posture does not get looser when we start
recommending jobs.

**`/admin`.** `app/(app)/admin/page.tsx` is the measuring instrument for this
entire PRD. Signups → Onboarded → Logged ≥1 → Active 7d, plus the `N guided`
sub-label on the activities tile which becomes `N from listings`. One tile of
work, and the gate condition below becomes readable off a page that exists.

**Feedback.** `app/(app)/feedback/*` and `lib/notify.ts`. At ten users this is
the only qualitative channel there is.

**Billing, dormant.** `lib/billing.ts`, `lib/stripe.ts`,
`app/api/stripe/webhook/route.ts`, `FREE_UNTIL` / `isEntitled` in
`packages/shared/src/index.ts`. Leave every line of it. It costs nothing to
carry and it is the difference between "we have no revenue model" and "we have
an unused one". See §6.

**Promoted, not merely kept: `packages/shared/src/rules/`.** 431 lines of
hand-checked, cited, dated state facts with a type system that makes an uncited
answer a compile error. Today it is reachable only by the owner behind
`requireAdmin()`. Under the new thesis, "make sure they're documenting their
claim correctly" is one of the three legs, and this is the asset that does it.
See Epic 5 — the promotion is the static facts page, **not** the chatbot.

---

# 2. CUT — off the critical path

The rule I applied: **delete only what is a liability. Park what is merely
unused.** Parked code costs nothing and preserves option value; deleting it buys
tidiness, which is not a business outcome.

### Park — the Chrome extension and everything that points at it

| Thing | Size | Disposition |
|---|---|---|
| `apps/extension/src/*` | 3,062 lines | **Park.** Do not delete, do not touch, do not withdraw the Store submission. |
| `app/(app)/guided/page.tsx` | 197 lines | Park — keep the route, remove it from the nav |
| `components/GuidedPitch.tsx` | 47 | Park — remove from the dashboard |
| `components/ExtensionMissingNote.tsx` | 39 | Park |
| `components/useExtensionInstalled.ts` | 59 | Park |
| `template/NextStepActions.tsx` | 73 | Park (its whole job is branching on extension detection) |
| `api/extension/session`, `api/extension/template` | 53 | Park |
| Landing-page "Get the Chrome extension" CTA (`app/page.tsx:146`) | — | Replace with the jobs CTA |

**Cost of parking: about two hours,** and it is entry-point removal only — no
logic changes, no deletions, nothing that can break a build that currently
typechecks clean across all five workspaces.

**What it frees, concretely:**

- **Roughly 40% of the mobile first screen.** Sally #6/#7: the seven-link
  wrapped nav plus `GuidedPitch` push the empty state ~600px down, and on a
  phone the most prominent element on the dashboard is an ad for a Chrome
  extension a phone cannot install. Every visitor from Facebook is on a phone.
- **The nag loop.** Audit §2b: the zip the website serves predates the
  detection marker, so anyone who sideloads it is told forever that they have
  not installed it. Parking the pitch cards makes that defect unreachable
  instead of needing a fix.
- **An unbounded maintenance tax.** The automation depends on Indeed's DOM,
  which changes without notice, and nothing has been run against it since
  2026-08-29 (audit, "what I could not verify" #9). That tax goes to zero the
  moment it is not on the critical path.
- **A copy contradiction.** Audit §2c: the store description says the extension
  does not find jobs; the shipped bundle has a "🔎 Find jobs" button. Off the
  critical path, this stops being a product problem and becomes a review
  outcome to wait on.

**Explicitly NOT cut:** the Chrome Web Store submission. It is in review, it is
free to leave there, and an approval is an asset even if nothing ships on top of
it. Do not withdraw it and do not touch it. If it is rejected, that is
information, not a setback.

**One extension-adjacent thing to keep and reuse:**
`app/api/extension/activity/route.ts` (65 lines). It is already a cookie-authed
JSON POST that inserts an `activity_log` row with the correct
`reporting_period`. That is exactly the endpoint the one-tap-log button needs.
Generalise it; do not write a second one.

### Keep but demote — the answer template

`/template` (`page.tsx`, `TemplateForm.tsx`, `actions.ts`, 222 lines) and
`profiles.answer_template`. Its only consumer was the extension, so it is
demoted out of the nav. Keep the route and the column: "your standard answers,
saved once" is a reasonable thing to have when a job listing links out to an
employer's own form, and the data is already there. **Cost of demoting: 15
minutes.** Cost of deleting: a migration and a lost option. Demote.

### Delete — the only three things that are actually liabilities

1. **`packages/automation/src/human.ts`** (`humanEmulation()`, commented
   "Intentional anti-detection behavior: DO NOT REMOVE") and
   **`packages/automation/src/captcha.ts`** (2Captcha / Turnstile solving). The
   audit confirms neither reaches the shipped bundle, so this is not a review
   risk — it is a reputational one. A public GitHub repo attached to a product
   that now positions itself as a public-benefit tool for unemployed people
   should not contain CAPTCHA-solving code. **15 minutes.**
2. **The live keys in `packages/automation/.env`** — `BROWSERBASE_API_KEY`,
   `TWOCAPTCHA_KEY`. Never committed, local-disk only, usage-billed on services
   nobody is using. Revoke them. This has been on the list since August.
   **10 minutes.** Do this one first; it is the cheapest item in the document.
3. **`apps/web/public/jobassistui-extension.zip`** and the link that serves it.
   It is one commit behind the fix that depends on it and it is the direct cause
   of the nag loop. With the extension parked there is no reason to serve a
   sideload at all. **15 minutes.**

The rest of `packages/automation` (17 files) stays parked. `apps/web` imports
nothing from it and it is not in the production build, so it costs zero.

---

# 3. BUILD

Sizes are hours for one solo developer with an AI assistant, including testing
on a real phone. They are honest, not aspirational: they assume the first
attempt at each screen is wrong once.

---

## Epic 0 — She can get in and read the screen (11h)

**Outcome: a woman who taps a Facebook link on an iPhone can sign in, read the
dashboard, and get her PDF out.**

This is not a nice-to-have that precedes the real work. Sally's Tier 1 is six
findings that each lose the user outright, and every one of them sits between a
Facebook link and any new feature. Building a job feed on top of a shell that
zooms, clips and eats typed forms produces a job feed nobody reaches.

**0.1 The sign-in code screen survives leaving the app (1.5h)**
Persist `{email}` and the sent state to `localStorage` on send; rehydrate on
mount; clear after `verifyOtp`; expire after an hour.
*AC:* Request a code on an iPhone, switch to Mail, come back, and the six-digit
box is still there with the email filled in. Do it again after force-quitting
Facebook.
*Why first:* it is the only door, and Sally #1 shows it can vanish while she is
reading the code. Nothing else in this document matters if this is broken.

**0.2 Inputs stop zooming the page (0.5h)**
16px inputs under `sm:`, once in `globals.css`.
*AC:* Tap the email field on an iPhone. The page does not zoom.

**0.3 The activity log is readable on a phone (3h)**
Replace `overflow-hidden` (`dashboard/page.tsx:147`) with a card list under
`sm:`, table from `sm:` up. Employer + title, then date · method · result, then
evidence and delete as real tap targets.
*AC:* On a 390px screen, every column's content is visible and the delete
control is tappable, with no horizontal scrolling.

**0.4 Attaching a photo cannot destroy the form (2h)**
`bodySizeLimit: "10mb"` in `next.config.js`, plus a client-side `file.size`
check that warns inline and leaves Save working without the attachment.
*AC:* Pick a 4 MB camera photo. You get an inline message, not a full-page
"Something went wrong", and nothing you typed is lost.

**0.5 Export produces a visible document in Facebook's browser (1.5h)**
PDF `Content-Disposition: inline`; one line above the export links when the UA
contains `FBAN`/`FBAV`/`Instagram`: "Downloading works best in Safari — tap ···
then Open in browser."
*AC:* Tap Export PDF inside Facebook's browser. A PDF renders on screen.

**0.6 The first screen is the product, not the chrome (2.5h)**
Nav down to Activity Log / Add Activity / Jobs under `sm:`, rest behind a menu.
Drop `GuidedPitch` and `BetaBar` on mobile. Shorten `FreePeriodBanner` under
`sm:`. This is where the extension entry points get removed (§2), so do both in
one commit.
*AC:* On a 390px screen the first thing below the header is the week badge and
the log — no pricing banner, no beta apology, no extension pitch.

---

## Epic 1 — Jobs, and the one tap (20h)

**Outcome: she opens a link, sees jobs near her without signing in, taps one,
and it is in her log.**

**1.0 A jobs page with no API at all (3h) — BUILD THIS FIRST**
`/jobs` renders from a hand-curated JSON file in the repo: 30 real, currently
open jobs in the owner's county, with employer, title, location, pay if listed,
and a link out. The owner refreshes it weekly, by hand, in 20 minutes.
*AC:* On a phone, `/jobs` loads signed-out in under 2 seconds and shows 30
scrollable job cards with a working outbound link on each.
*Why:* it proves the thesis this week rather than after an integration, it is
the fallback if the data validation fails, and thirty hand-picked local jobs are
genuinely better than a hundred stale API rows for the first ten users. The
public, no-sign-in URL is also the first shareable thing this product has ever
had — "40 jobs hiring near Syracuse right now" survives a Facebook comment in a
way "compliance tracker" does not.

**1.1 One tap logs the job (4h, +1h migration)**
"I applied to this" on each card → sign-in bounce if needed (`?redirect=`
already works) → `activity_log` row prefilled with employer, title, URL, today's
date, `method: online`, `result: applied`, `source: 'listing'`. Then straight
back to the job list with a confirmation, **not** to a form.
Migration `0006`: widen the `source` check constraint to include `'listing'`.
*AC:* Signed out, tap "I applied to this", sign in with a code, and land back on
the job list with "Added to your log — 2 of 3 this week." Total taps from job
card to logged: one, plus sign-in.
*Note:* migrations here are applied by hand in the Supabase SQL editor and
`0005` has been sitting unapplied since August (audit §5.4). This one is on the
critical path — apply it the day it is written, or the button 500s in
production while typechecking clean locally.

**1.2 Real jobs from the government feed (5h)**
A server-side route handler proxies the validated source (key never reaches the
client), normalises to one `JobListing` type, caches per query. Same card UI as
1.0 — the page does not change, only where the rows come from.
*AC:* A search for "warehouse, 13202" returns ≥10 results, each with employer,
title, location and a working link. Reload is served from cache.
*Depends on:* the data validation. If it slips, 1.0 stays in place and this
story waits without blocking anything after it.

**1.3 Search that fits one thumb (4h)**
Two fields — what and where — defaulted from `profiles.state` and a stored ZIP.
Results paginate on scroll. No filter panel, no faceting, no sort control.
*AC:* From the dashboard, three taps to a filtered list of local jobs. One-hand
reachable on a 390px screen.

**1.4 Zero results and errors are honest (2h)**
Distinct copy for no-results-for-that-search, source-is-down, and no-location-
set — each with the next action on it.
*AC:* Search "astronaut" in a rural ZIP and get a useful screen, not an empty
box.

**1.5 `/admin` counts listing-sourced activities (1h)**
Change the activities tile's `N guided` sub-label to `N from listings`, and add
"users with ≥1 listing activity" to the funnel.
*AC:* The gate condition below is readable off `/admin` without a SQL query.

---

## Epic 2 — Fairs and hiring events (10h)

**Outcome: she knows about a hiring event near her before it happens, and
attending it counts.**

**2.1 Events, hand-curated first (2h)** — same pattern as 1.0. NY publishes on
the order of 5–20 statewide events a month; transcribing them is a coffee's
worth of work and it de-risks the feed entirely.
**2.2 `/events` screen (3h)** — date, name, location, who's hiring, link. Sorted
by date, past events hidden.
**2.3 "I'm going" / "I attended" logs it (2h)** — `method: 'job_fair'`, which is
already a valid enum value in both the TypeScript and the SQL. No migration.
*AC:* Tapping "I attended" on a past event puts a `job_fair` row in this week's
log with the event name as the employer and the date of the event.
**2.4 Add to calendar (1.5h)** — an `.ics` link. Works in the in-app browser,
unlike a download.
**2.5 Live events feed (1.5h)** — swap the JSON for the validated source.

---

## Epic 3 — The nearest American Job Center (6h)

**Outcome: she can find, call, and get directions to the office that helps her
in person, and the visit counts.**

**3.1 Center data as static JSON (2h)** — the national AJC list is published as a
file; ship it in the repo. No API, no key, no runtime dependency, and it changes
about annually.
**3.2 `/help-near-me` (3h)** — nearest three by ZIP, each with a `tel:` link, a
maps link, and hours.
**3.3 "I went here" logs it (1h)** — `method: 'in_person'`, existing enum.
*AC:* Enter a ZIP, get three centers, tap the phone number, and the phone
dials.

---

## Epic 4 — What your state actually requires (9h)

**Outcome: she can see, in her state's own words, how many activities she needs
and what counts — with the link and the date it was checked.**

This is the third leg of the thesis and the cheapest differentiator in the
document, because the hard part is already written.

**4.1 `/requirements/[state]` from the FACTS registry (3h)** — public, no
sign-in. Renders `packages/shared/src/rules/` quotes with the source name, the
URL as plain text, and `verified_on`. States without facts get the DIRECTORY
entry: official link and phone, and an honest "we haven't checked this state's
page yet."
*AC:* `/requirements/NY` shows the three checked NY quotes with
dol.ny.gov/services/ui/wsr and 2026-08-29 visible on each. `/requirements/WY`
shows a link and a phone number and does not pretend to know anything.
*Note:* this is **retrieval-only rendering of a typed registry.** No model, no
chat box, no generated text. The chatbot's legal constraints do not apply
because nothing is generated. See the cut list.

**4.2 "Set my weekly target to 3" (1.5h)** — one button, driven by
`suggested_weekly_target` on the fact, writing `profiles.weekly_target`.
*AC:* From `/requirements/NY`, one tap sets the target and the dashboard badge
changes.

**4.3 Fill the DIRECTORY for the 10 largest states, and FACTS for two more
(4.5h)** — research, not code. PA and NJ first: Dana's plan already has the
owner joining those groups because the questions are close enough to New York's.
*AC:* Ten states resolve to a real official URL and phone; three states show
quoted facts.

**4.4 The requirements page is the shareable link (0h — copy)** — it is the
answer to the single most-asked question in every one of those Facebook groups,
it is public, and it cites the state rather than us. Dana should have it.

---

# 4. SEQUENCE

```
Week 0 (2h)   Revoke the keys. Delete human.ts + captcha.ts. Pull the served zip.
              ── these are liabilities, not features, and they are 35 minutes ──

Week 1        Epic 0 (11h)  ← she can get in and read the screen
              Story 1.0 (3h) ← the hand-curated jobs page, public
              Story 1.1 (5h) ← ONE TAP LOGS IT
                                                    ▲
                                            THE GATE ┘
Week 2        Dana's distribution week runs against exactly this build.
              Story 1.5 (1h), then measure.

──────────── gate: do not proceed until the condition below is met ────────────

Week 3+       Epic 1 rest (11h) → Epic 4 (9h) → Epic 2 (10h) → Epic 3 (6h)
```

**Why this order.**

The first thing built is Epic 0 even though it is not new — because it is the
only work that is definitely needed under *both* the pivot and the do-nothing
plan, and because a job feed behind a broken login is a job feed with no users.
It is also the shortest path to a phone she can actually use, which the roadmap
has wanted since August and nobody has done.

The first *new* thing is Stories 1.0 and 1.1, together, and they must ship
together. 1.0 alone is a job board, of which there are thousands. 1.1 alone is
what already exists. **The pair is the entire thesis**, and it can be in front of
a real person eight hours after Epic 0 lands. It is not the easiest thing to
build — the easiest thing is the API integration, because it is a well-specified
technical problem with no product judgment in it. That is exactly why it is not
first.

Epic 4 comes before Epics 2 and 3 because it is the highest-leverage thing per
hour that exists in this document: the data is already written, the page is
public, and it answers the question the target audience is literally posting in
Facebook groups every day. It is a growth asset that happens to be a feature.

Epics 2 and 3 are last among the build because they are the "alert them to
opportunities" leg, and an alert is only worth anything to someone who already
opens the app. That is what the gate measures.

## The gate condition

**Do not build past Story 1.5 until:**

> **10 people who are not the owner have opened `/jobs`, and at least 5 of them
> have logged ≥1 activity with `source = 'listing'` within 7 days of their
> first visit.**

Both numbers are readable off `/admin` once Story 1.5 lands (visits from Vercel
Analytics, the rest from the funnel).

**If it is met:** the thesis holds. Build the rest in the order above.

**If 10 people never reach `/jobs` at all:** the failure is distribution, not
product. Stop building. Go back to `growth-first-ten-users.md` and run it. No
feature in this document fixes an audience of zero.

**If 10 reach it and fewer than 2 log anything:** the thesis is wrong — showing
people jobs does not make them document. That is worth knowing after 19 hours,
which is the entire reason the sequence is arranged this way.

## Success metrics

| Metric | Where | Target at the gate |
|---|---|---|
| **Primary — listing→log conversion.** Users with ≥1 `source='listing'` activity ÷ users who opened `/jobs` | `/admin` + Vercel | ≥ 50% |
| Activities per active user per week ÷ their `weekly_target` | `/admin` | ≥ 1.0 for half of active users |
| Signups → Logged ≥1 (the roadmap's existing gate) | `/admin` funnel | ≥ 60% |
| Exports produced | not instrumented — **add a counter in Story 1.5** | any non-zero number is signal |

---

# 5. CUT LIST — what we are explicitly not doing

I own this list. Each entry is a thing that sounds good.

1. **Reviving the Indeed automation, in any form.** Off the critical path, and
   the honest reason is not that Indeed blocks it — it is that "we apply for
   you" is a promise that fails loudly and in public the first time it
   misfires, and the submit-guard incident of 2026-08-29 is the proof. Parked,
   not deleted. Revisit only if the Store approves *and* the gate above is met
   *and* someone asks for it.
2. **A chatbot for unemployment questions.** `/assistant` stays dark and
   `0005_assistant.sql` stays unapplied. Epic 4's static, cited facts page
   delivers most of the value with none of the exposure. A model that
   confidently gets someone's eligibility wrong costs a stranger money, and
   `project_chatbot_legal_constraints` already lists three places a disclaimer
   would have to go before it could ship at all. Not now.
3. **AI job matching, resume parsing, resume tailoring, cover letters.** Every
   one of these is a month of work, none of them is the one tap, and all of them
   compete with funded companies. At ten users, keyword plus ZIP is enough.
4. **Job alert emails or SMS.** The tempting retention feature, and the one that
   can kill the product. Recurring unrequested mail generates spam complaints on
   `jobassistui.com`, which is the same domain as the sign-in codes. The failure
   mode is "nobody can log in." **Hard prerequisite before any recurring mail:
   a separate sending subdomain with its own reputation.** Until then, no.
5. **Push notifications and a native app.** iOS push needs an installed PWA,
   which Facebook's in-app browser cannot install (Sally #12). The manifest and
   apple-touch-icon are worth an hour *after* the "open in your browser" nudge
   exists; push is not worth a day.
6. **Filling out FACTS for all 51 jurisdictions.** Research is the expensive
   part and demand is unknown. Three states, then let the feedback form and the
   `no_answer` rows say which is fourth.
7. **Employer accounts, applicant tracking, "apply through us", affiliate
   revenue on applications.** All of them turn the user into inventory, all of
   them break the trust posture that makes the Facebook-group channel work at
   all, and the affiliate money at this scale is pennies.
8. **Rebuilding auth, billing, or the export.** They work. Audit §1 is clear on
   this. Touching them is unforced risk.
9. **A settings page for the job feed** — saved searches, alert radii, excluded
   employers. Configuration is what you build when you don't know what to build.
   Two fields, defaulted from the profile.
10. **`groups.md`.** Settled: the owner is not filling in a tracker table. Not
    re-raising it.
11. **Deleting `packages/automation` or `apps/extension`.** Tidiness is not an
    outcome. Parked code costs zero.
12. **Editing an activity in place.** There is genuinely no `/log/[id]/edit`
    route and fixing a typo means delete-and-retype. It is ~2h and it is a real
    papercut — but it does not prove the thesis, so it waits until after the
    gate. First person who complains, build it that day.

---

# 6. THE PRICING PROBLEM — for the owner to decide, not me

**The problem, stated plainly.** Today the log is free permanently and Guided
assist is the only paid feature — $12/mo from 2027-01-01, `FREE_UNTIL` in
`packages/shared/src/index.ts`. If Guided assist leaves the critical path, the
only paid thing leaves with it. There is then no revenue model at all.

**The fact that takes the urgency out of it: nothing needs deciding before
2027-01-01, and probably not then.** `isEntitled()` short-circuits to `true`
during the free period, `startCheckout` hard-returns, and no subscription can be
created today even by someone trying. That is four months, and the plan above
fills about six weeks of it. **This decision is not on the critical path and
should not consume a day of thinking now.** It should be made against real
usage, which is currently zero.

The options, with what each actually costs:

| # | Option | What it means | Tradeoff |
|---|---|---|---|
| **A** | **Leave it exactly as it is.** | Guided stays the named paid feature. The Store review runs. If it approves, there is a paid feature; if not, decide later. | Zero work, zero copy changes, no promise broken. The cost is that the paid feature is one Google reviewer away from not existing, and the extension is parked so it will not improve. **This is the do-nothing option and it is cheaper than it looks.** |
| **B** | **Nothing is paid. Free tool, indefinitely.** | Say so publicly. Vercel/Supabase free tiers and free government data mean marginal cost is near zero at this scale. | Honest, and it removes every friction from the growth plan. It also makes this a project rather than a business, and that should be a decision rather than a drift. Reversing it later on existing users is unpleasant. |
| **C** | **Charge for alerts and personalisation, keep the record free.** | Saved searches, "new jobs since you looked", a weekly digest. Log, export and requirements stay free permanently, as promised. | The only option that fits the new thesis and does not break Terms §4. **But it is gated behind cut-list item 4** — a separate sending domain must exist first, or the sign-in mail dies with it. Real work before a dollar. |
| **D** | **Charge for the proof, not the search.** | An "audit pack": long-term evidence retention, a signed/verifiable export, past-year archives. | Willingness to pay is real — this is the moment someone is scared. But it charges at the worst possible moment, and it comes closest to breaking "the log is free permanently", which is currently on the landing page, the billing page, the banner and Terms §4. Handle with care or not at all. |
| **E** | **Sell to the institution, not the claimant.** | A workforce board, a nonprofit, a union local, a county pays for a co-branded instance for its clients. | The only option with real money in it, and the only one where the customer has a budget line for exactly this. Long sales cycle, needs references, and needs the thing to work first. Worth a conversation in Q1, not now. |

**What I would flag rather than recommend:** A and B are the only options that
cost nothing this month, and the difference between them is a sentence of copy,
not a feature. C is the only one that fits the pivot, and it has a hard
technical prerequisite. Whichever way it goes, **do not touch `FREE_UNTIL`,
`isEntitled`, or any pricing copy while running the growth week** — a pricing
change mid-launch is the one thing guaranteed to confuse the first ten people.

---

# 7. THE HONEST RISK

**The most likely way this fails has nothing to do with the code.**

This product is live, complete, coherent, and has zero users. Not one Facebook
post has been made. `groups.md` is empty. One DM was sent on 2026-08-30 and has
not been answered. Dana's seven-day plan starts tomorrow and needs 25 minutes a
day.

Building is the more comfortable of the two activities. It always is: it has a
clear next step, visible progress, and nobody can reject you. Distribution has
none of that. **The single most likely outcome of this document is that it
consumes September, ships a genuinely better product, and arrives at October
with the same zero users** — because the constraint was never the product.

The evidence points both ways and I will not pretend otherwise. The pivot has a
real argument: a compliance tracker is a chore nobody seeks out, while "jobs
near you, free, no signup" is a thing a person will tap in a Facebook comment.
That is a distribution argument for a product change, and it is a good one. The
public `/jobs` and `/requirements/NY` pages are the first genuinely shareable
things this product would have. But it is still a bet, and it is unproven, and
the version of it that fails is the version where the building replaces the
posting instead of feeding it.

**So the mitigation is structural, not motivational: do both, in parallel,
starting this week.** Dana's plan does not depend on any of this shipping — the
current site works today. Epic 0 makes that site survive a phone, which the
growth week needs anyway. Stories 1.0 and 1.1 give the growth week something new
to post about in week two. If the owner has to choose on any given day, **the
posting wins.** Ten users on a mediocre product teach more than a great product
teaches with none.

The other four ways it fails, in order of likelihood:

1. **The job data is commodity and ours is worse.** Every free government feed
   is the same NLx corpus that Indeed, Google and the state's own site already
   surface, usually with better freshness and dedup. If the first ten listings
   she sees are stale, duplicated, or two counties away, she leaves and does not
   come back. Story 1.0's hand-curated list is a direct hedge against this: at
   ten users, thirty jobs a human picked genuinely beats a hundred an API
   returned. *Mitigation: look at the first page of real results before building
   1.2. If they are bad, stay hand-curated longer than feels dignified.*
2. **The one tap doesn't actually get tapped.** The whole thesis is that
   proximity makes logging happen — she saw the job here, so she logs it here.
   It might just not be true. She might apply on the employer's site three days
   later and never come back. *This is what the gate measures, and it is
   measurable after 19 hours of work rather than 60.*
3. **She never gets past the login screen.** Sally #1: the code panel lives only
   in React state, and leaving Facebook to open Mail can destroy it. Every user
   hits this, it is the only door, and it is invisible from the owner's desktop.
   *Mitigated by Story 0.1, which is why 0.1 is the first thing in the document.*
4. **The pivot half-lands.** The extension gets parked, the job feed gets built,
   and the product ends up being two half-products — a job board that is worse
   than Indeed and a tracker with an unclear relationship to it. *The defence is
   the sentence at the top: if a screen does not serve "the job you were shown
   becomes your record in one tap", it does not get built. Epics 2, 3 and 4 all
   end in a logged activity, deliberately.*

**And the possibility that the pivot is simply the wrong move.** It might be.
The audit's judgment is that the existing free tracker is "a complete, coherent
product a stranger could use today", and that has never been tested against a
stranger. A pivot before first contact with a user is a decision made entirely
from the inside of the building. The reason I am still recommending it is
narrow and specific: **not because the tracker is bad, but because "free jobs
near you" is a link someone will tap in a Facebook comment and "compliance
tracker" is not.** The pivot is a distribution fix wearing a product costume,
and it should be judged on whether it gets people through the door — which is
exactly what the gate condition asks.
