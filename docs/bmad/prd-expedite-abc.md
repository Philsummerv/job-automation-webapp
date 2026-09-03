# PRD — Three ways to keep "you answered this once" without an extension

**John (PM), 2026-09-02.** Companion to `prd-pivot-jobs-and-compliance.md`. That
document stands; this one adds three epics to it and re-sequences the whole
thing under a new constraint (marketing is paused).

Written against `main` (`c96b0f4`), Mary's `research-job-data-sources.md`,
Sally's `ux-first-run-mobile.md`, and `docs/legal/chatbot-disclaimers.md`. I did
not redo their work.

The owner's question was: the extension's philosophy is *"you answered this
once, you shouldn't have to do it again"* — how do we keep that on a phone,
with no browser extension? Three answers came out of it. All three are specced
below. They are not equally good and I say which one I would cut.

---

## The line all three are judged against

The parent PRD's thesis sentence is still the test:

> **The job you were shown becomes your compliance record in one tap.**

A screen that does not end in a logged activity does not get built. Two of the
three epics below end in a logged activity. One does not, and that is the main
reason it is the one I would cut.

---

# EPIC A — "What counts" and closing your week

**Outcome: on a Thursday, she opens the app and knows she is two activities
short, what New York's own page says counts, and what she could do about it —
without reading a rulebook and without us telling her whether she qualifies for
anything.**

## What already exists (this is why A is cheap)

`packages/shared/src/rules/` is 431 lines of hand-checked, cited, dated state
facts, and `packages/shared/src/index.ts:329` already does `export * from
"./rules"` — so `getFact`, `hasFacts`, `checkedTopicsFor`, `DIRECTORY`,
`isStale` and `MAX_FACT_AGE_DAYS` are already importable from
`@jobassistui/shared` in the web app. Nothing needs plumbing.

NY has exactly three checked facts today (`states/ny.ts`): `activity_count`
(with `suggested_weekly_target: 3`), `what_counts`, `records_retention`. All
three are verbatim quotes from `dol.ny.gov/services/ui/wsr`, verified
2026-08-29. That is precisely the set this epic needs.

The period math exists: `startOfReportingPeriod`, `endOfReportingPeriod`,
`formatPeriodRange`, `reportingPeriodKey` (`packages/shared/src/index.ts:226+`).
The dashboard already computes `currentCount` and `target`
(`dashboard/page.tsx:34-40`).

The only thing standing between this data and the user is `requireAdmin()` on
`app/(app)/assistant/page.tsx`.

## The safety principle that makes this shippable

`docs/legal/chatbot-disclaimers.md` applies, and I want to be exact about *how*,
because A is not a chatbot and copying the chatbot rules blindly would produce
the wrong thing.

**The distinction that makes A safe: the product does arithmetic on the user's
own numbers, and quotes the state on everything else. It never joins the two
into a ruling.**

- ✅ "You have 1 of 3 this week." — arithmetic on her rows against the target
  *she* set in settings. Not a legal claim.
- ✅ "New York State DOL says: *'You must complete and record at least THREE work
  search activities each week to be eligible for benefits.'*" — a verbatim
  quote with its source and date, rendered from a typed registry.
- ✅ "If you log this, your log will show 3 of 3." — a statement about the log.
- ❌ "This job fair counts." — a ruling on her eligibility. **Never render this
  sentence or any paraphrase of it, anywhere in the product.**
- ❌ "You have met your requirement." — same. The badge says *3 of 3*, and the
  word "requirement" only ever appears inside a quotation.

From `chatbot-disclaimers.md`, what carries over and what does not:

| Section | Applies to A? |
|---|---|
| §1 the session gate | **No.** There is no chat to gate. Replaced by the always-visible bar. |
| §2 the bar | **Yes**, on every surface that renders a fact. Not dismissible. |
| §3 the watermark | **Yes, and it is the important one.** Source name + `display` string as plain text + `verified_on`, *inside the card*, because people screenshot these into Facebook groups. Fill from the `Source` object; never hardcode a date. |
| §4 no-answer copy | **Yes**, for any state not in `FACTS` — see A.3. |
| §5 refuse list | **N/A by construction.** There is no free-text input to refuse. That is the whole point of doing it this way. |
| §6 Terms section | **Yes, adapted** — see A.6. It must ship *with* the feature, not after. |
| §7 landing line | **Yes** if `/requirements/[state]` is linked publicly. |

No model. No network call. No generation. `getFact()` is a pure lookup with a
non-nullable `Source` on every branch — rendering an uncited fact is a compile
error, and that property is doing real work here.

## Dependency

**A depends on Epic 4.1 of the parent PRD** (`/requirements/[state]`, 3h),
because 4.1 builds the `FactCard` component — quote, source name, plain-text
URL, `verified_on`, and the amber stale line when `isStale()` is true. A reuses
it four times. Do not build A first and reinvent that card.

Note the stale line is not hypothetical: `MAX_FACT_AGE_DAYS` is 180 and NY was
verified 2026-08-29, so the amber line switches itself on around 2027-02-25.
Build it now; it will fire on its own.

## Stories

**A.1 — The week badge tells her the gap and the deadline (1.5h)**
Today the dashboard shows `1/3 this week`. Change it to state the gap and the
date the period closes, using `endOfReportingPeriod` and `formatPeriodRange`.
*AC:* With 1 activity, a target of 3 and a Sunday start, the badge reads "1 of 3
this week — 2 more by Saturday, Sep 5." With 3 of 3, it reads "3 of 3 this week"
and a green check. It never uses the word "compliant", "met", or "eligible".

**A.2 — "What New York says counts" on the dashboard (2.5h)**
A panel under the week badge rendering `getFact(state, "what_counts")` and
`getFact(state, "activity_count")` through 4.1's `FactCard`. Collapsed to one
line under `sm:` with a "What counts?" summary; open on desktop. The §2 bar sits
above it and does not dismiss.
*AC:* On a 390px screen, tap "What counts?" and you see the two NY quotes, each
with "NYS DOL — Work Search Requirements and Recordkeeping",
`dol.ny.gov/services/ui/wsr` **as plain text**, and "checked Aug 29, 2026". Take
a screenshot of just that card — the source and date are inside the image.

**A.3 — A state we have not checked gets an honest panel, not an empty one (1h)**
`hasFacts(profile.state)` is false for 50 of 51 jurisdictions today. Fall back to
the `DIRECTORY` row: agency name, `agency_phone` as a `tel:` link,
`work_search_url` if present. Copy adapted from `chatbot-disclaimers.md` §4 —
"We haven't checked New Jersey's page yet. NJ Department of Labor and Workforce
Development: [number]." If the state is in neither registry, show only the "set
your weekly target in Settings" line. **Never guess a number.**
*AC:* Set your profile state to NJ. You get a phone number that dials, and no
invented rule. Set it to WY (in neither registry) and nothing breaks.

**A.4 — Ways to close the gap, drawn from things already on this site (2h)**
When `currentCount < target`, show up to three concrete next actions that each
end in a logged row: a job from `/jobs`, an event happening before the period
closes from `/events`, and "log something you already did" → `/log/new`.
Each is a link. **No item claims to count.** The framing is "if you log this,
your log shows N of 3."
*AC:* With 1 of 3 and a job fair on Thursday in the events data, the panel offers
that event with its date, and the copy nowhere says the event satisfies anything.
*Degrades:* with Epics 1 and 2 unbuilt, this renders only the manual-log link
and is still correct.

**A.5 — Period close: the retention quote and the export (1h)**
When the period ends within 2 days, one line under the badge: the
`records_retention` quote (NY: "you must keep copies for one year"), with the
same watermark, and a direct link to Export PDF.
*AC:* On the Friday of a Sunday-start week, the retention quote and an Export PDF
button appear. On a Tuesday they do not.

**A.6 — The legal surface ships in the same commit (1.5h)**
Adapt `chatbot-disclaimers.md` §6 into `apps/web/app/terms/page.tsx` as a new
section 3, retitled from "The question helper" to **"State requirement
information"** — the paragraphs about general information, sourced-and-dated
answers, no guarantee of currency, and the bold **not affiliated with any state
agency** statement all apply verbatim to a static facts page. Drop §6's third
paragraph (about refusing individual-claim questions); there is nothing to
refuse. Bump `updated=` on `LegalPage`.
*AC:* `/terms` has a section 3 that describes what actually shipped, and the
"not affiliated" sentence is on the page in bold.

**Inherited, not re-priced:** Epic 4.2 of the parent PRD, the one-tap "Set my
weekly target to 3" driven by `suggested_weekly_target` (1.5h). A.1's badge is
meaningless if the target is wrong, so 4.2 ships with A, not after it.

## Hours

**9.5h net new**, on top of Epic 4.1 + 4.2 (4.5h) which the parent PRD already
prices. **14h if 4.1 has not been built.**

## What A is NOT

1. **Not a chatbot.** No text box, no model, no `/api/assistant/answer`.
   `0005_assistant.sql` stays unapplied.
2. **Not an eligibility ruling, ever.** No screen says a specific activity counts,
   or that she has met her requirement.
3. **Not multi-state.** NY has facts; everyone else gets A.3's honest fallback.
   Filling `FACTS` for more states is research, not code — parent PRD Epic 4.3.
4. **Not a rules search.** Seven of the thirteen `TOPICS` have no NY fact and are
   not rendered. The `community` lane is not used at all.
5. **Not a notification.** No email, no push. Cut-list item 4 of the parent PRD
   stands: recurring mail on `jobassistui.com` risks the sign-in domain.

---

# EPIC B — Paste a link, get a logged activity

**Outcome: she applies on any site in the world, copies the address, pastes it
into one box, and confirms a filled-in activity in under twenty seconds —
and when the fetch fails, which it often will, she still ends up with a logged
activity.**

This is the web-native replacement for extension logging, and it is the only one
of the three epics that works on day one with no content, no API key and no
governance board.

## Stories

**B.1 — One paste box, reachable in one tap (1.5h)**
A client component on the dashboard (above the log) and at the top of
`/log/new`: a single full-width field, `type="url"`, `inputMode="url"`,
`autoComplete="off"`, `autoCapitalize="off"`, placeholder "Paste a job link",
and a Go button that is disabled until the value parses as a URL.
**Mobile paste UX:** the field must work with a plain long-press → Paste and with
the iOS keyboard's paste bar. Do **not** build the flow around a "Paste from
clipboard" button — `navigator.clipboard.readText()` is permission-prompted on
Chrome, unavailable in several in-app webviews, and is the *worse*-supported half
of the Clipboard API. Add such a button only as a progressive enhancement, only
if C.2's probe says `readText` exists, and never as the only way in.
*AC:* On an iPhone inside Facebook's browser, long-press the field, tap Paste,
tap Go. Two gestures. The page did not zoom (depends on Epic 0.2's 16px inputs).

**B.2 — The fetch route, and it cannot be turned into a proxy (3h)**
`POST /api/link/preview`, `export const runtime = "nodejs"` (it needs `dns`),
cookie-authed via `requireUser()`. Returns `{ employer, title, url, ok, reason }`
and **never the page body**.

SSRF rules, all of them required:

1. Parse with `new URL()`. Reject anything whose protocol is not `https:`. No
   `http:`, no retry-on-http, no `data:`, no `file:`.
2. Reject if the hostname is an IP literal (v4 or v6), is `localhost`, is a
   single-label host, or ends in `.local`, `.internal`, `.localhost`, `.home`.
3. `dns.promises.lookup(host, { all: true })` and reject if **any** returned
   address is in: `10/8`, `172.16/12`, `192.168/16`, `127/8`, `0/8`,
   `169.254/16` (**this is the cloud metadata range — 169.254.169.254**),
   `100.64/10`, `192.0.0/24`, `198.18/15`, `224/4`, `::1`, `fc00::/7`,
   `fe80::/10`, and IPv4-mapped IPv6 forms of all of the above.
4. `redirect: "manual"`. **Re-run rules 1–3 on every `Location` header.** Maximum
   3 hops. Following redirects automatically is the standard way this class of
   guard gets bypassed, and NLx apply URLs redirect (Mary measured
   `de.jobsyn.org/...` → `jobs.apploi.com/...`), so redirects must be *handled*,
   not merely allowed.
5. `signal: AbortSignal.timeout(5000)`. One attempt. No retry.
6. Reject unless the response `content-type` starts with `text/html`.
7. Stream the body and abort past **512 KB**. An unbounded read of a hostile
   response OOMs the function.
8. Send no cookies, no `Authorization`, no user headers. Set a plain
   `User-Agent` identifying the product.

**Residual risk, stated rather than hidden:** rules 3 and 4 do not close DNS
rebinding, because the address is resolved once and connected to separately.
Closing it properly means pinning the resolved IP and connecting to it with an
explicit `Host` header via a custom agent — roughly another 2h and more moving
parts than this is worth at ten users. It is mitigated by: auth required, no
response body ever returned to the caller, and a 5s timeout. Revisit if the
route is ever opened to anonymous users.

*AC:* `POST` with `http://169.254.169.254/latest/meta-data/` → 400, no outbound
request made. `POST` with an `https://` host that resolves to `127.0.0.1` → 400.
`POST` with a real NLx apply URL → follows the redirect and returns the employer.

**B.3 — Getting employer and title out of the page (2h)**
In priority order:
1. A `<script type="application/ld+json">` block whose `@type` is `JobPosting` —
   take `hiringOrganization.name` and `title`. This is exact when present, and
   Greenhouse, Lever and Workday all emit it.
2. `og:site_name` → employer; `og:title` → title.
3. `<title>`, split on ` - `, ` | `, ` at `, ` hiring `. Handle the two common
   shapes: "Job Title - Employer" and "Employer hiring Job Title in City".
Regex over the first 128 KB of the response; no DOM parser dependency. Trim to
120 chars. If the employer looks like a job board rather than an employer
(`indeed`, `linkedin`, `ziprecruiter`, `glassdoor`, `usnlx`), drop it and leave
employer blank rather than logging "LinkedIn" as an employer — a work-search
record naming the job board instead of the company is worse than a blank field
she fills in herself.
*AC:* Paste a Greenhouse job URL and get the real company name. Paste a LinkedIn
job URL and get a blank employer with the title filled, not "LinkedIn".

**B.4 — Every failure lands on a filled-in form, never a dead end (2h)**
This is the acceptance-critical story of the epic. LinkedIn and Workday will
return 403 to a server fetch routinely, so **failure is the common path, not the
edge case**, and it must feel like a normal step rather than an error.

| Case | What she sees |
|---|---|
| Not a URL | Inline under the field: "That doesn't look like a web address." Field keeps focus. No navigation. |
| Blocked by rules 1–4 | Straight to `/log/new` with the URL prefilled: "We couldn't open that link — the address is saved. Who was the employer?" |
| Timeout, 403, 429, 5xx | Same screen, same copy. This is the LinkedIn case. |
| Fetched, no employer found | `/log/new` with URL + title prefilled, employer empty and focused. |
| Fetched, all found | B.5's confirm screen. |

There is no error page and no spinner without an end. A `<= 5s` timeout plus a
visible progress state means the worst case is five seconds to a prefilled form.
*AC:* Force the route to return 403 for every URL. Paste a link, and you still
have a saved activity in under twenty seconds.

**B.5 — Confirm and save, one screen (2h)**
The result is `/log/new` with `employer_name`, `job_title`, `url` and today's
date prefilled, method `online`, result `applied`, and `source: 'link'`.
She reads it, fixes what is wrong, taps Save, and lands back where she started
with "Added — 2 of 3 this week."
Generalise `app/api/extension/activity/route.ts` (65 lines, already cookie-authed
and already computes `reporting_period` correctly) rather than writing a second
insert path. Parent PRD §2 already says this.
**Migration `0006`** widens the `source` check constraint to include **both**
`'listing'` (parent PRD 1.1) and `'link'` (this story). One migration, two
values, so the two epics do not each need a hand-applied schema change.
*AC:* End to end on a phone: paste → confirm → the row is in the log with the
right week. Read the row back in Supabase and `source = 'link'`.
*Note:* `0005_assistant.sql` has been sitting unapplied since August. `0006` is
on the critical path — apply it in the SQL editor the day it is written, or the
Save button 500s in production while typechecking clean locally.

**B.6 — A budget on the fetch (1h, deferrable)**
The route is auth-gated and returns two strings, so its value as an open proxy is
close to zero. Still: a `link_fetch_log` table with a per-user hourly count, cap
20/hour, 429 past it. Ship without this if it delays B; re-add before the route
is ever exposed to anonymous users.

**B.7 — Measure whether the box gets used (0.5h)**
`/admin` splits the activities tile three ways: `N from listings` / `N from
links` / `N by hand`. Without this you cannot tell whether the paste box or the
jobs feed is doing the work, and that is the decision this whole sequence exists
to inform.

## Hours

**12h**, plus the shared 1h for migration `0006`.

## Dependencies

Epic 0.2 (16px inputs — a paste field that zooms the page is worse than no paste
field). Epic 0.4's `bodySizeLimit` is unrelated. Migration `0006`, shared with
parent Story 1.1. C.2's probe is a nice-to-have input to B.1, not a blocker.

## What B is NOT

1. **Not a share target.** Android's Web Share Target needs an installed PWA and
   Facebook's in-app browser cannot install one (Sally #12). Revisit only after
   the manifest and the "open in your browser" nudge both exist.
2. **Not clipboard-read-driven.** See B.1.
3. **Not a description or salary scraper.** Two fields out, nothing else stored.
4. **Not a crawler.** One page, one paste, one user gesture. Never a queue, never
   a background job, never a second page from the same host. Explicitly not
   `myjobsny.usnlx.com` — Mary §5 is clear that walking that site is worse than
   the Indeed situation, not better.
5. **Not a verifier.** It does not and cannot check that she actually applied.
   The activity is her assertion; the URL is her evidence.
6. **Not a bookmarklet.** Same install friction as an extension, on a platform
   where it does not work at all.

**A note on why "edit an activity in place" stays cut:** B.5 confirms before it
saves, so a bad parse is fixed before a row exists. That is the specific reason
the missing `/log/[id]/edit` route does not get promoted by this epic.

---

# EPIC C — Tap-to-copy answer card

**Outcome: while filling out an employer's own application form on her phone,
she can put any answer she has already saved onto the clipboard in one tap,
instead of retyping it.**

This is the most literal answer to the owner's question, and it is the one I
would cut. The spec is complete and honest; the ranking section says why.

## The risk, up front

`navigator.clipboard.writeText()` requires a secure context (we have HTTPS) and a
user gesture (a tap handler qualifies). In Facebook's iOS in-app browser —
WKWebView with a restricted permissions policy — **`navigator.clipboard` may be
`undefined` entirely, and this is unverified.** Every visitor from the intended
channel is in that browser. If the API is missing there, the headline feature of
this epic does not work for the only audience it has.

So the epic leads with a measurement, not a build.

## Stories

**C.2 — Find out what the clipboard actually does, before building on it (1.5h, of which 0.5h is the owner on a phone)**
**Build this first, and build it during Epic 0 regardless of whether the rest of
C ever ships**, because Epic B wants the same answer and the finding takes days
to be useful if it arrives late.

An unlisted, unauthenticated `/debug/clipboard` page that prints, as large plain
text a phone screenshot can read:

- `window.isSecureContext`
- `typeof navigator.clipboard`
- `typeof navigator.clipboard?.writeText` and `?.readText`
- `document.queryCommandSupported?.("copy")`
- `navigator.userAgent`

and three buttons, each attempting exactly one tier and printing the caught error
verbatim: (1) `clipboard.writeText`, (2) hidden-textarea +
`document.execCommand("copy")`, (3) `clipboard.readText`.

**Test protocol — 30 minutes, and it converts the biggest unknown in this
document into a fact:** DM the URL to himself in Messenger and open it *from
inside the Facebook app* on iOS; then from an Instagram DM; then in Safari; then
in Chrome on Android; then from the Facebook app on Android. Record the five
readings. Then, in whichever contexts reported success, paste into a real form
(a blank Google Form works) to confirm the value actually landed — a `writeText`
that resolves without writing is a real failure mode.
*AC:* Five rows of results written into this file, and a yes/no on whether tier 1
works inside Facebook's iOS browser.

**C.5 — Fix `/template` before building anything on top of it (1.5h)**
`app/(app)/template/page.tsx:12` calls **`requireEntitled()`**. `isEntitled()`
short-circuits to `true` during the free period, so this is invisible today —
and on 2027-01-01 the answer template silently becomes a paid feature. With
Guided assist leaving the critical path that is plainly wrong. Change it and
`/answers` to `requireOnboarded()`.
Also: the page copy says the answers "drive Guided autofill when you're applying
online", which will not be true. Rewrite to "Your standard answers, saved once,
so you can copy them into any application." Remove `ExtensionMissingNote` and the
`NextStep` block with its Indeed link (parent PRD §2 parks both).
*AC:* Set `FREE_UNTIL` to a past date locally. `/template` still loads.

**C.1 — `/answers`, a read-only card of chips (2h)**
Renders `profiles.answer_template.config` using `TEMPLATE_FIELDS`
(`packages/shared/src/index.ts:118+`) for labels and ordering. Non-empty fields
only. Four groups: About you · Work eligibility · Experience · Other. Each chip
is a full-width tap target ≥44px showing the label small and the value large.
`type: "list"` fields (`referralCompanies`, `relativeCompanies`) render one chip
per line. **Exclude** `searchQuery`, `searchLocation`, `maxApplications`,
`exclusionTitleRegex` — those are extension search config, not answers, and
would be noise on this screen.
*AC:* With eight fields filled, `/answers` on a 390px screen shows eight chips,
no horizontal scroll, every one tappable with a thumb.

**C.3 — Three-tier copy, with feedback that does not lie (2.5h)**
1. `await navigator.clipboard.writeText(v)` inside the tap handler, in
   `try/catch`.
2. On throw or on `navigator.clipboard` being undefined: an off-screen
   `<textarea>` (positioned off-screen, **not** `display:none` — hidden elements
   cannot be selected), value set, `.focus()`, `.setSelectionRange(0, 999999)`,
   then `document.execCommand("copy")`. On iOS this needs the element to be
   non-`readonly` and `contentEditable`; use the standard iOS recipe rather than
   the desktop one.
3. If `execCommand` returns false: reveal a **visible, read-only, already
   select-all'ed** text input directly under the chip, with "Long-press and tap
   Copy" above it. This tier cannot fail — she can always long-press text.

**Only show "Copied" when tier 1 or 2 reported success.** A false "Copied" is
worse than tier 3's extra gesture, because she pastes nothing into a form and
does not find out until she has moved on.
*AC:* Tap a chip in Safari — "Copied", and it pastes. Then in the browser that
C.2 identified as the worst case — either "Copied" and it pastes, or the tier-3
field appears. Never "Copied" with an empty clipboard.

**C.4 — Reachable in one tap (1h)** — `/answers` joins the mobile nav. Nothing
cleverer; tab-flicking is the user's job and no amount of UI fixes it.

**C.6 — An empty template makes this screen worthless (1h)**
First visit to `/answers` with an empty `answer_template`: six inline fields —
first name, last name, phone, ZIP, city, authorized to work — saved in place, no
trip to `/template`.
*AC:* A brand-new account can get from `/answers` to six working chips without
leaving the page.

## Hours

**9.5h.** Of which **3h (C.2 + C.5) I would keep even if the epic is cut.**

## What C is NOT

Not autofill. Not injection into another site's page. Not a bookmarklet, keyboard
extension, or native app. Not per-employer answer memory. No new template fields.
It does not end in a logged activity, and it never claims to.

---

# THE COMBINED SEQUENCE

One order across A, B, C and the parent PRD's epics. Hours are for one solo
developer with an AI assistant, including testing on a real phone.

```
Week 0    LIABILITIES + THE CLOCK                                   2h
          Revoke BROWSERBASE_API_KEY and TWOCAPTCHA_KEY.
          Delete packages/automation/src/{human,captcha}.ts.
          Pull apps/web/public/jobassistui-extension.zip.
          Submit the NLx data request. FREE, AND THE CLOCK IS 2-3 WEEKS.
          Register for CareerOneStop (non-Jobs APIs, no board).

Week 1    Epic 0 — she can get in and read the screen              11h
          C.2  — the clipboard probe, run on 5 real browsers      1.5h
                 (do it while Epic 0 is in flight; it unblocks B.1)

Week 2    Story 1.0 — hand-curated /jobs, public, no API            3h
          Story 1.1 — ONE TAP LOGS IT  + migration 0006             6h
          ── the thesis is now testable ──

Week 3    EPIC B — paste a link, get a logged activity             12h
                 built here on purpose: same confirm-and-save
                 screen and same source tagging as 1.1

Week 4    Story 4.1 + 4.2 — public /requirements/NY, set target   4.5h
          EPIC A — what counts, and closing your week             9.5h
          C.5  — un-gate and re-word /template                    1.5h
          ═══════════ RESTART MARKETING HERE. 49h. ═══════════

Week 5+   Epic 2 — events from the NY DOL .ics                     10h
          Stories 1.2-1.4 — real jobs (NLx, or NYC Open Data)      11h
          Epic 3 — American Job Centers                             6h
          Epic C rest — the answer card                           9.5h  ← cut
```

**Total to the marketing restart: 49 hours.** At a realistic 10–15h/week that is
about four weeks. Everything after it can run alongside posting.

## Why this order

**C.2 jumps the queue** because it is 90 minutes, it answers a question two
epics depend on, and the answer is only useful early.

**B sits immediately after Story 1.1** because they are the same screen. 1.1
builds confirm-and-save for a job that came from our list; B feeds the identical
screen from a pasted URL. Built adjacently they share the route, the form, the
`source` constraint and one migration. Built a month apart they share nothing.

**A sits after 4.1** because 4.1 builds the `FactCard` that A renders four times.
A before 4.1 means building that card twice.

**Epic 2 (events) drops below A** even though its data source is the strongest
verified finding in Mary's research — 410 events, free, no key, no review board,
already tagged `Audience: UI`. It drops because an event listing is only worth
anything to someone who opens the app, and A.4 is what gives events a place to
appear. Build the reason before the content.

**Jobs 1.2–1.4 sit late** because they are the only work gated on somebody else's
decision. Submitting the NLx request in Week 0 and building it in Week 5 means
the 2–3 week review runs entirely inside time that is already spent. If NLx
denies, build 1.2 against NYC Open Data (Mary §5: 2,923 postings, salary
included, full descriptions, no key at all) and the feature still exists.

## What pausing marketing costs

The parent PRD's gate — *ten strangers open `/jobs`, five log a listing
activity* — cannot be evaluated while nobody is being told the site exists, so
these 49 hours are a product judgment with no user evidence behind it. That makes
the risk named in §7 of the parent PRD the base case rather than a risk: a
genuinely better product arriving in October with the same zero users.

The owner has made the call, so the only thing I will do about it is take the
receding horizon away: **the restart line is the end of Week 4, at 49 hours, not
"when it feels ready."** Ship what is done at that point and start posting, even
if Epic 2 is untouched.

---

# RANKING — and the one I would cut

| | Epic | Hours | Ends in a logged activity? | Works with zero content? | Platform risk |
|---|---|---|---|---|---|
| **1st** | **B — paste a link** | 12h | Yes, always | Yes | Low (fetch failures are designed for) |
| **2nd** | **A — what counts** | 9.5h (+4.5h dep) | Yes, via A.4 | Yes (NY facts exist) | None |
| **3rd** | **C — answer card** | 9.5h | **No** | No (needs a filled template) | **High and unverified** |

**B is first** because it is the only one of the three that is directly on the
thesis line, it is the actual replacement for what the extension did, and it
works for a job on any site in the world on the day it ships — no data source, no
API key, no governance board, no content to curate. It is also the one whose
value does not depend on the user having done anything first.

**A is second** because it is the cheapest differentiator per hour in either
document — the hard part, the hand-checked cited facts, is already written and
sitting behind an admin gate — and because "make sure they're documenting their
claim correctly" is a third of the owner's own sentence for the product. Its
public half, `/requirements/NY`, is also the single most shareable page this
product would have, which matters more than usual now that posting has to work
without a growing feature set behind it.

**If only two can ship: build B and A. Cut C.**

Four reasons, in the order I weight them:

1. **C does not end in a logged activity.** The parent PRD's own screen test is
   "if it does not serve the one tap, it does not get built." C serves a
   different, smaller promise, and it is the only one of the three that fails
   that test.
2. **Its core mechanism is unverified on the only platform that matters.** Every
   visitor arrives in Facebook's in-app browser, and whether `navigator.clipboard`
   exists there is unknown. C.3 specifies a fallback that cannot fail, but the
   fallback — long-press the pre-selected field — is roughly the same number of
   gestures as long-pressing the value on `/template` today. If tier 1 does not
   work in that browser, C is 9.5 hours for a nicer-looking version of what
   already exists.
3. **It saves typing, and typing is not what stops people.** The extension's
   philosophy was worth defending when it removed twenty fields per application.
   Removing one field per tap, with a tab switch between each, is a convenience.
   Someone who has typed her phone number into three applications will type it
   into a fourth; someone who has not logged her week loses her benefits.
4. **The tab-flick is genuinely awkward and might just not survive contact.**
   Switching tabs inside Facebook's browser, twelve times, per application, is a
   thing that reads fine in a spec and may well not be done twice by a real
   person. Nothing in this plan tests that assumption before spending the 9.5
   hours.

**Keep 3 of C's 9.5 hours regardless of the cut:**

- **C.2, the clipboard probe (1.5h).** Epic B wants the same answer, it is 90
  minutes, and it turns the biggest unknown in this document into a fact. If it
  comes back green in Facebook's iOS browser, C's ranking improves and the case
  for building it later gets stronger.
- **C.5, un-gating `/template` (1.5h).** `requireEntitled()` on that route is a
  live latent defect: the answer template silently becomes a paid feature on
  2027-01-01, for a paid tier that no longer exists. Fix it whether or not
  `/answers` is ever built.

---

# CUT LIST — additions to the parent PRD's

The parent PRD's twelve items all stand. These are new:

13. **Epic C's card, `/answers` (C.1, C.3, C.4, C.6).** See the ranking. Revisit
    only if C.2 comes back green *and* a real user asks for it.
14. **Any free-text question box, in any form.** A's whole legal posture is that
    nothing is generated. A text input on that page destroys it and pulls in
    every section of `chatbot-disclaimers.md`, including the gate and the refuse
    list.
15. **Any sentence stating that an activity counts, or that the requirement is
    met.** Not a UI decision — a hard rule for every screen in the product.
16. **Web Share Target for Epic B.** Needs an installed PWA; Facebook's browser
    cannot install one.
17. **Clipboard *read* as a required path in B.** Probe it, enhance with it, never
    depend on it.
18. **Storing fetched page bodies, HTML, or descriptions.** Two strings out of
    B.2, nothing else persisted. Storage of a third party's page content is a
    licensing question we have no reason to open.
19. **Crawling anything.** One user gesture, one URL, one page, never a second
    page from the same host, never a queue.
20. **Filling `FACTS` for more states as part of A.** It is research, it is the
    expensive part, and demand is unknown. NY plus A.3's honest fallback. Parent
    PRD 4.3 already holds the two-more-states story.
21. **A per-event "does this count?" checker.** The most requested-sounding
    feature here and the one that would end the product. It is an eligibility
    ruling with a friendly name.

---

# SUCCESS METRICS

Marketing is paused, so none of these are readable until it restarts. That is the
point of the restart line.

| Metric | Where | What it would tell you |
|---|---|---|
| `source='link'` rows ÷ `source='listing'` rows | `/admin`, after B.7 | Whether people log jobs we showed them or jobs they found — the single most decision-relevant number in this document |
| Users with ≥1 `source='link'` activity | `/admin` | Whether the paste box is used at all |
| `/requirements/NY` visits from outside the app | Vercel Analytics | Whether A's public half is worth sharing |
| Fetch success rate on `/api/link/preview` | route log counter (B.7) | If it is under ~40%, B.4's degrade path *is* the product and should get the polish |
| Clipboard tier reached, by browser | C.2's probe | Ships before anything depends on it |
