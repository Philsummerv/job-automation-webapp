# ⏯️ RESUME HERE

**Updated 2026-08-30 evening. Everything below TASK 1 is the older 03:00 block;
read this header first, it supersedes the parts it names.**

Git: on `main`, **working tree clean, everything pushed** through `0f0a17c`.
Production is live and current.

## Done today

- **Deployed.** `rules-assistant` merged to `main` and pushed. `/guided`, the
  free-tracker pricing split, the homepage rewrite and the Rules Assistant are
  all live. `jobassistui.com/guided` confirmed loading.
- **The DM to Sydnee Gerstel was sent.** No reply yet. It quotes the OLD
  pricing; a correction is drafted in `docs/marketing/admin-dm-drafts.md` under
  "Follow-up owed" — send it after she reads the first one, not alongside.
- **Pricing copy fixed everywhere** (`8fcdd14`, `1520c0f`, `d11e60d`). The
  2026-08-29 split had reached the gating but not the words. Terms §4 said the
  whole Service becomes paid in January; the billing page told every user that
  "keeping your account active" costs $12; the checkout box sold the four free
  features and never mentioned Guided; and every post-January branch would have
  flipped the site back to "14-day free trial, card required" on 2027-01-01
  with no deploy. All now say: **log free permanently, Guided assist is the one
  paid feature, $12/month from 2027-01-01.**
- **Store package built and verified** (`0f0a17c`). Also fixed a build bug:
  `dist/` was never cleaned, so a stray `icon128 - Copy.png` deleted from
  `icons/` was still being packaged into the Store zip.

## Next: the Chrome Web Store

**Work `docs/store-submission.md`.** Steps 1 and 3 are done. What is left:

1. **Step 2 — the reviewer's test account.** Sign up at jobassistui.com as
   `jobassistui-review@mailinator.com` (public inbox, no password), fill its
   Answer Template with FAKE details only. **This is the most likely rejection
   reason if skipped** — the extension does nothing without a login and the
   reviewer cannot get a code otherwise.
2. **Supabase email subject — SETTLED, leave it alone.** The body was updated
   (code first, Guided block); the SUBJECT was not, and still reads "Your
   JobAssistUI sign-in code" with no digits in it. Owner decided 2026-08-30 not
   to change it: the body is enough to find the code, and the reviewer
   instructions say "at the top of the email" rather than naming the subject.
   Nothing in the submission depends on it. Do not re-raise it as a task.
3. **Steps 4–7** — flip "remote code" to No (currently Yes, and No is
   verifiably correct), paste the permission justifications, tick the four data
   categories, paste the test instructions.
4. **Step 8** — upload the two screenshots, then submit.

Expect the Indeed-ToS flag (step 9). That decision is recorded, not reopened.

## Still not done

- **Revoke the Browserbase API key** in `packages/automation/.env`. Live,
  usage-billed, sitting on disk.
- `packages/db/migrations/0005_assistant.sql` not applied to Supabase. Only the
  Rules Assistant needs it and that is admin-gated and dark.
- The three Guided funnel holes found 2026-08-30 and **not yet fixed**: the
  Answer Template page has no link to `/guided` at all (its primary button
  sends people to Indeed, where nothing fills); the dashboard pitch disappears
  after the first logged activity; and the web app cannot detect whether the
  extension is installed (`web-bridge.ts` runs on the origin but leaves no
  marker). Worth doing once the extension is in the Store.
- Marketing: still no posts, `groups.md` still empty. One DM sent.

---

## TASK 1 — Supabase email templates (5 minutes, unblocks nothing else but is quick)

The live sign-in email is still the old one. The file is right; only you can
update Supabase.

1. Open `docs/email/otp-code.html`, select all, copy
2. Supabase → project → **Authentication** → **Emails**
3. Open **Magic link or OTP**
4. Set the **subject** to exactly:
   `{{ .Token }} is your JobAssistUI sign-in code`
5. Replace the body with the file contents. Save.
6. Open **Confirm sign up**. Same subject, same body. Save.
7. Both. Supabase picks by account state; doing one strands half your users.

The code now leads the subject and the body so it shows on an iPhone lock
screen without opening Mail.

---

## TASK 2 — Deploy the web app (blocks Task 3)

The Chrome listing points at `jobassistui.com/guided`. **That page only exists
on this branch.** A reviewer clicking it today gets a 404.

1. `git checkout main`
2. `git merge rules-assistant`
3. `git push`
4. Vercel deploys automatically. Confirm `https://jobassistui.com/guided` loads.

What goes live with it: the free-tracker pricing split, `/guided`, the homepage
rewrite, the nav link, the login redirect fix, the Notes column on Guided logs.

---

## TASK 3 — Chrome Web Store submission

**Where you got to:** the Privacy tab, partway down.

### 3a. Fix this — it is currently wrong

**"Are you using remote code?" is set to YES. Change it to
"No, I am not using remote code."** Verified 2026-08-30: the bundle has no
`eval`, no `new Function`, no `importScripts`, and no external script URLs.
esbuild inlines everything. Answering Yes invites scrutiny you don't need.

### 3b. Permission justifications — paste each verbatim

**storage**
```
Stores the user's saved answer template locally so application fields can be filled without a network request for every field.
```

**tabs**
```
Detects when the user has opened a job application page so the extension panel can offer to fill that form.
```

**webNavigation**
```
Job applications are multi-step forms. This detects when a new step has finished rendering so the correct fields are read before filling.
```

**scripting**
```
Reads the fields of the job application form and fills them with the user's saved answers. Required because the form is hosted on indeed.com, not on a page we control.
```

**Host permission**
```
indeed.com is where the job application forms are; the extension reads those form fields and fills them with the user's saved answers. jobassistui.com is our own site, where the extension reads the signed-in user's saved answer template and records each submitted application to their activity log.
```

**Single purpose**
```
Fill job application forms with the user's saved answers and record submitted applications to the user's job-search log.
```

**Privacy policy URL**
```
https://www.jobassistui.com/privacy
```

### 3c. Data usage — tick exactly these four

Personally identifiable information · Location · User activity · Website content

Leave unticked: Health, Financial, Authentication, Personal communications.
Then tick the three certification checkboxes at the bottom.

### 3d. Screenshots — already done

Two, at 1280×800, at
`apps/extension/screenshots_ext/store/`:
- `01-job-browser.png` — the job card and "Apply to this job"
- `02-review-gate.png` — the review gate and "press Submit yourself". **This is
  the important one** — it is the whole human-in-the-loop argument in one image.

Twelve other screenshots were deleted: error states from bugs since fixed, or
they showed your name, your address, or your bookmark bar.

### 3e. Reviewer access — THE MOST LIKELY REJECTION, not yet solved

A Google reviewer installs the extension and tries it. **It does nothing
without a JobAssistUI login, and they cannot log in** — the 6-digit code is
emailed to you, not them. They will see a dead extension and reject it.

Fix, before submitting:

1. Sign up at jobassistui.com with `jobassistui-review@mailinator.com`
   (mailinator inboxes need no password — anyone with the address can read them)
2. Fill that account's Answer Template with fake details
3. Paste this into **Test instructions**:

```
This extension requires a free JobAssistUI account.

Test account: jobassistui-review@mailinator.com

Sign-in uses a 6-digit code sent by email. To get the code:
1. Go to https://jobassistui.com and enter jobassistui-review@mailinator.com
2. Open https://www.mailinator.com and search the inbox "jobassistui-review"
3. The email arrives within a minute; the code is in the subject line

Then:
4. Open the Answer Template page (answers are already saved on this account)
5. Go to indeed.com and open any job marked "Easy Apply"
6. Click Apply, then click "Find jobs" in the JobAssistUI panel
7. The panel fills the form. It stops at the submit step — you press Submit yourself.
```

### 3f. Package to upload

`apps/extension/jobassistui-store.zip` — gitignored, so **regenerate it** rather
than looking for it in a fresh clone:

```
cd apps/extension
node build.mjs --store      # strips localhost from the manifest
# then zip the CONTENTS of dist/ (not the folder itself)
```

Includes the icons. `node build.mjs` without `--store` keeps localhost for
local development — don't upload that one.

### 3g. Listing fields already filled

Title and summary come from the package. Description, category
(Workflow & Planning) and language were set. Store icon was picked up from
`icons/icon128.png` automatically.

### 3h. The decision you are holding

Reviewers check whether an extension violates the target site's terms. **Indeed
prohibits automating the apply process** — the *process*, not just the submit.
The extension presses Apply and advances pages on its own.

A fill-only version was built on 2026-08-29 (user clicks Apply, extension fills
only, user advances) and **you rolled it back deliberately.** That is recorded,
not re-argued. Know that it is the most likely flag, and a rejection restarts
the review clock.

---

## What is NOT done and is not blocking the above

- The `notes` default on Guided logs is committed but unverified — no Guided
  application has successfully logged yet end to end. Worth checking after
  Task 2 deploys.
- `packages/db/migrations/0005_assistant.sql` is not applied to Supabase. Only
  the Rules Assistant needs it, and that is admin-gated and dark.
- **Revoke the Browserbase API key** in `packages/automation/.env`. It is live,
  usage-billed, and sitting on disk. See `docs/services.md`.
- Marketing: **the DM to Sydnee Gerstel was sent 2026-08-30.** No reply yet.
  Still no posts and `groups.md` is still empty. Drafts are in
  `docs/marketing/admin-dm-drafts.md` and `post-drafts.md`.
  ⚠️ **The sent DM quotes the old pricing** ("free until January 1st, then $12
  a month"). The tracker went free-forever on 2026-08-29, so that is now wrong
  in her favour — a short correction is drafted under "Follow-up owed" in
  `admin-dm-drafts.md`. Send it after she reads the first one, not alongside.
  All other copy that says "free until January" needs the same fix before it
  goes anywhere: you can now truthfully say **"the tracker is free, forever, no
  card"**.

---

# (2026-08-30) — Guided assist WORKS; it is the paid feature now

**Read this block, then the 2026-08-29 one below for the Indeed-ToS findings,
then 2026-08-20 for the rest.**

## The headline: the extension works

Verified live on Indeed the night of 2026-08-29. It scans the form, fills it,
advances through the steps, and completes an application. The `86ee728` fix that
sat untested for three weeks holds. **This is no longer an unknown.**

Five real bugs were found and fixed in that session:

1. **It submitted a real application to a real employer without asking.** The
   submit guard lived only in the review gate's auto-advance timer; two other
   paths (`advancePage()` and the question-less-page hop loop) clicked around
   it, and Indeed's final review page is exactly the question-less-page-with-a-
   Submit-button shape the hop loop exists to skip. **The guard now lives at the
   click site in both paths**, so no future caller can bypass it. This
   contradicted Terms §2, the landing copy and the store listing until it was
   fixed — treat it as the most important thing in this file.
2. **`hadControls` counted Indeed's own header search box.** A bare
   `document.querySelector` for `input[type=text]` meant the commute-check step
   ("this job looks a little far from you") looked like "has controls, no
   questions", which the hop loop refuses to click through. Now filtered by
   `isApplicationControl()` — excludes our own panel, header/nav/search
   landmarks, and search-named inputs.
3. **`findAdvanceDom` only matched `button` and `[role=button]`.** Indeed
   renders "Continue applying" as an `<a>`. Anchors are now candidates;
   POSITIVE_RE/NEGATIVE_RE still gate them, so "Return to job search" is never
   picked.
4. **`advancePage` looked for the button once.** The next step renders
   asynchronously, so it reported "no visible Continue/Submit button found"
   with a large blue Submit on screen. Now waits up to 6s, like
   `scanWhenReady` already did.
5. **Indeed's marketing checkboxes were scanned as application questions.** The
   review gate opened on the submit page asking about a newsletter. Filtered by
   `isRealApplicationQuestion()`. Never auto-answered either way — opting
   someone into marketing is not ours to do.

Also added: a **confirm step** before filling (picking a job and starting to
fill it are two decisions; it used to make the second one itself), **pacing**
(`PACE_MS = 1500` — filling and clicking in the same instant got "Something went
wrong" from Indeed at 100%), and panel **minimize + drag**.

### The build stamp — read this before debugging anything

The panel header shows the build time it is running, e.g. `top · 00:13:31`.
**Reloading the extension does NOT re-inject content scripts into already-open
tabs.** That cost two debugging rounds before anyone noticed the tab was stale.
If the stamp doesn't match your last build: reload the extension, **close the
tab**, and open a fresh one. Nothing you observe on a stale tab is real.

## Pricing changed: the tracker is free forever, Guided is the paid feature

Owner's decision. Logging, dashboard, weekly tracking and both exports moved to
`requireOnboarded` — free permanently. `/template` and `/guided` keep
`requireEntitled`. No cutover to run: `isEntitled()` returns true until
`FREE_UNTIL` (2027-01-01) and the gate closes by itself.

You can now truthfully say **"the tracker is free, forever, no card"** in a
Facebook group. That is a materially better sentence than "free until January".

**Recorded risk:** this stakes all revenue on the least certain feature —
ToS-sensitive, desktop-only, not yet in the Chrome Web Store. `docs/roadmap.md`
floats per-state requirement data and audit mode as alternative paid tiers that
work on a phone.

## What is built and NOT yet live

- `/guided` install page, extension zip, nav link, dashboard card, template
  next-step card, homepage rewritten to "early access"
- Chrome Web Store package: `apps/extension/jobassistui-store.zip` (icons
  included, localhost stripped via `node build.mjs --store`). **Not submitted.**
  Listing copy, permission justifications and test instructions are drafted —
  search this conversation or rewrite from `docs/services.md`.
- **Blocked on screenshots**, which need the extension running — now possible.
- `docs/email/otp-code.html` rewritten: code first so it shows in an iPhone
  lock-screen notification, Guided link under "You will also need this".
  **NOT pasted into Supabase yet — that is a manual step and the live email is
  still the old one.** Subject must become
  `{{ .Token }} is your JobAssistUI sign-in code` in BOTH templates.
- `docs/services.md` — every third-party account, what it does, what it costs.
  Includes two ⚠️: a live Browserbase API key sitting in
  `packages/automation/.env`, and the 2Captcha account that should be closed.

## Everything from 2026-08-29/30 is UNCOMMITTED

Branch `rules-assistant` holds one commit (the Rules Assistant). Everything
else — the paywall split, `/guided`, the extension fixes, the email template,
`docs/services.md` — is loose in the working tree. **Nothing is deployed.**

## The thing that still has not moved

One DM sent to Sydnee Gerstel (2026-08-30). No posts. No users.
`docs/marketing/groups.md` still empty. Every hour of 2026-08-29 went into product, and none of it into
distribution. The product is not the bottleneck.

---

# (2026-08-29) — the marketing has not actually started yet

**Read this block, then the 2026-08-20 block below it for the rest of the state.**

## Where things really are, Saturday 2026-08-29

Nine days after joining the groups, **`docs/marketing/groups.md` is still
completely empty** — no group names, no admin names, nothing in the post log.
No posts have gone out. The Aug 24–28 posting week in `campaign.md` did not
happen. That is the honest baseline; the dates in the table further down are the
plan, not the record.

**The owner has decided not to fill in the group tracker.** His words: *"I am
not going to fill in the table i am just going to keep commenting or posting."*
That is fine and does not need re-arguing. The one thing that still has to
happen per-group is checking that group's Rules tab **before posting a link**,
because a link in a group that bans them is a removal and cannot be undone.

### THE IMMEDIATE NEXT ACTION: send the message to Sydnee

First group researched today (2026-08-29), live from the browser:

| | |
|---|---|
| Group | **New York Unemployment/Updates And Help** |
| URL | `facebook.com/groups/2722401454671089` |
| Members | 4,693 (+13 last week) |
| Admin | **Sydnee Gerstel — the only one** |
| Promo? | **`no`** — Rule 4: *"Self-promotion, spam and irrelevant links aren't allowed."* |
| Owner's status | Joined. **2 comments sitting in "Pending admin approval."** |

Three things that follow from that:

- **This group pre-moderates.** The owner's warm-up comments are invisible until
  Sydnee approves them. She is the bottleneck for everything here, which makes
  messaging her the highest-value move rather than an optional one.
- **Never post a link here without her yes.** Rule 4 is explicit.
- **Almost nobody comments.** ~1,600 posts last month against 29 comments. 42
  posts today, 2 comments. Someone who actually answers questions will stand out
  immediately — the reply play is unusually strong in this group.

**✅ SUPERSEDED — the DM was saved to `docs/marketing/admin-dm-drafts.md` and
SENT by the owner on 2026-08-30.** The paragraphs below describe its shape and
are kept only as a template for the next group. Its shape, if it needs
rewriting: name Rule 4 in the first two lines (that is the whole trick — it
proves he read the rules and chose to ask), lead with being on unemployment
himself rather than with the product, say plainly that it is free with no card
and no income until January, include **no link**, and end by making "no" easy
and promising to keep helping in the comments either way.

### Broken, needs one command to fix

`docs/marketing/facebook-playbook.md` — the admin DM template (6 lines, around
line 108) was accidentally overwritten in the editor and now reads just `5.`.
The original is intact in git: `git diff docs/marketing/facebook-playbook.md`
shows it, `git checkout -- docs/marketing/facebook-playbook.md` restores it —
**but that would also discard any other edits to that file**, so check the diff
first.

### THE BIG FINDING 2026-08-29: Guided assist cannot be what we thought

Three things came out of a full investigation of `packages/automation` and
`apps/extension`, and together they reset what Guided can be.

**1. Indeed prohibits it.** From Indeed's own partner docs: *"Indeed prohibits
the use of any automation, scripting, or bots to automate the Indeed Apply
process outside of Indeed's official vendors and tooling."* Their job-seeker
guidelines separately tell applicants not to use third-party bots to apply.
Note the wording is the **process**, not just the submit — so auto-pressing
Apply and auto-advancing pages are inside what they prohibit, even with a
review gate on the end.

**The defensible line:** the user clicks Apply, the tool fills fields from
saved answers, the user reads and submits. That is autofill, like a password
manager. Navigating and submitting on their behalf is a bot.

**Two files are liabilities and should be deleted from any shipped version:**
`packages/automation/src/captcha.ts` (2Captcha integration solving Cloudflare
Turnstile — circumventing a security measure) and
`packages/automation/src/human.ts` (`humanEmulation()`, commented *"Intentional
anti-detection behavior: DO NOT REMOVE"* — evading bot detection, in writing).

**2. Both implementations work, neither works on a phone.**
- **Cloud browser (Stage A, `packages/automation`)**: genuinely passed. Commit
  `97fbf51`, 2026-07-05: real Indeed Easy-Apply completed end-to-end through
  Browserbase in 8m45s, screenshot artifact on disk. Parked because Cloudflare
  blocks the datacenter IP and the fix is ~$10/GB residential proxies — roughly
  $1-3 per supervised session, which inverts the margin on a $12/mo plan. Also
  it is **not** hands-off: it prompts a human for login, captcha, and every
  ambiguous field.
- **Extension (Stage B, `apps/extension`)**: 3,135 lines, typechecks, builds.
  **Its core form scan is last-known-broken** — `scanned: 0 question(s)` then an
  infinite spinner. Fix `86ee728` (2026-08-09) re-arms a 4s timeout that was
  killing runs mid-scan; **it has never been run against a live Indeed page.**
  Chrome extensions do not exist on mobile Chrome, so this can never serve phone
  users.

**3. `apps/extension/STAGE_B_STATUS.md` is WRONG and should be fixed or
deleted.** It claims Guided is "verified end-to-end on Indeed." It is dated
2026-07-18, six weeks stale, and contradicted by this file. That doc is why the
owner believed the feature already worked.

**Everything about Guided is blocked on one hour of work:** load the unpacked
extension, open a real Easy Apply job, see whether the scan returns questions.
It was loaded into Chrome on 2026-08-29 and the test still was not run.

### PRICING CHANGED 2026-08-29: the tracker is free forever, Guided is paid

Owner's decision. Logging, dashboard, weekly tracking and both exports moved
from `requireEntitled` to `requireOnboarded` — free permanently. `/template`
and `/guided` keep `requireEntitled`.

No cutover to run: `isEntitled()` already returns true until `FREE_UNTIL`
(2027-01-01), so everyone sees everything today and the gate closes by itself.

**Why:** the audience is on unemployment; charging them to document a legal
requirement is a weak business and a bad thing to say in a Facebook group.
*"The tracker is free, forever, no card"* is now true and is a materially
better sentence than "free until January." It also removes the Jan 1 cliff
where every acquired user got billed on the same day.

**The risk, recorded because it is real:** this stakes all revenue on the least
certain feature — unverified, ToS-sensitive, desktop-only, pending a Chrome Web
Store review that has not been submitted. The roadmap floats per-state
requirement data and audit mode as alternative paid tiers that work on a phone
and do not depend on Indeed's tolerance.

### Built 2026-08-29, uncommitted: the Guided install path

- `apps/web/app/(app)/guided/page.tsx` — install page. Six numbered steps for
  developer-mode install, "what it does and doesn't do" block, entitlement-gated
  download with a subscribe card for non-payers.
- `apps/web/public/jobassistui-extension.zip` — the built extension, 25KB.
  **Regenerate this whenever the extension changes**: `npm run build -w
  apps/extension`, then zip the contents of `apps/extension/dist`.
- Nav link, dashboard card (empty-log only), template next-step card with an
  Indeed button built from the user's own saved `searchQuery`/`searchLocation`.
- Landing page: "coming soon" → "early access"; Guided described concretely as
  a Chrome extension for Indeed that needs a computer; pricing block rewritten
  to "The tracker is free. Always."
- `docs/email/otp-code.html` — support gmail removed, Guided link added under
  "You'll also want this." **Must be pasted into BOTH Supabase templates**
  (Confirm signup + Magic Link) — not yet done.

**There is no Chrome Web Store listing.** Never submitted. Until there is,
developer-mode install is the only way anyone can run it. Submission needs a $5
developer account; a Google account hold blocked the attempt on 2026-08-29.

### Built earlier 2026-08-29, deliberately NOT live: the Rules Assistant

A guided chatbot answering state work-search questions. **Everything below is
uncommitted in the working tree and nothing is deployed.**

- Route `/assistant`, gated with `requireAdmin()` (returns a plain 404 to
  everyone else), **not linked from the nav**. The API route
  `/api/assistant/answer` carries the same gate. Safe to deploy alongside
  unrelated changes without shipping the feature.
- Funnel: gate → state → situation → exemption check → topic → answer.
- **New York has three real quotes** read off `dol.ny.gov/services/ui/wsr` on
  2026-08-29, each with source URL and date. Texas and Florida are `varies`
  rows — the type has no number field, so a fake statewide count is
  unrepresentable.
- **Eligibility, benefit amounts, appeals, overpayments, fraud and
  determination letters are hard-refused** to the state's phone number, before
  any retrieval and before any model call.
- Disclaimer in three places; the in-bubble watermark is built to survive a
  screenshot (plain-text URL, no hover, no truncation). Copy lives in
  **`docs/legal/chatbot-disclaimers.md`**, which also holds the Terms §3 insert.
- `npm run build` passes. `npx esbuild scripts/check-assistant.mts --bundle
  --platform=node --format=cjs --outfile=_t.cjs && node _t.cjs` → 52 checks pass.
- **`packages/db/migrations/0005_assistant.sql` has NOT been applied** to
  Supabase. Not needed to try the page: the log insert fails silently by design.
- **Terms and privacy were deliberately NOT updated**, because the feature is
  not live and Terms must not describe a page nobody can reach. Do that in the
  same change that removes the admin gate.
- `docs/roadmap.md`'s "AI that answers benefit-eligibility questions" bullet now
  carries a sub-note recording what was built and that the line has not moved.

**To go live later:** swap `requireAdmin()` → `requireUser()` in
`app/(app)/assistant/page.tsx`, delete the `isAdminEmail` block in the API
route, add the nav link, paste Terms §3, apply migration 0005. Costs money to
run — see below.

**Cost, if it ever goes live:** ~$0.12 per fresh web-search answer, $0 for
cached ones and $0 for button paths. ~$10–30/month at expected volume, with a
hard ceiling around **$71 to fill every state × topic cell once, ever**. **Plus
Vercel Pro at $20/mo, which is a hard blocker** — search answers take 15–40s and
the Hobby plan cuts functions off around 10s, so it works in dev and 504s in
production. The full plan is at
`C:\Users\tsupa\.claude\plans\wait-why-are-you-dynamic-valley.md`.

**The owner's standing decision on all of this:** *"build it but lets not go
live with it we should work on getting more users first for sure."*

### Still not written, still a good idea

The **canned-answers file** in `docs/marketing/`. It is now more valuable than
before, because the owner is going to be commenting rather than tracking, and
because three New York facts are verified with sources and quotable directly
into a comment:

- *"You must complete and record at least THREE work search activities each week to be eligible for benefits."*
- The Career Center line + the nine accepted activity categories
- *"If you choose to keep a paper Work Search Record, you must keep copies for one year."*

All three: `dol.ny.gov/services/ui/wsr`, read 2026-08-29. **Note that the
commonly repeated "activities must be on different days" claim does NOT appear
on that page** — it was in a research summary, was checked, and was left out.

---

# (2026-08-20) — shipping is done; the job is now POSTING

**The product is finished for this stage. Nothing is left to build or configure
before users.** The only thing standing between JobAssistUI and its first users
is the owner spending 15 minutes a day in Facebook groups. Everything below is
context for when that produces feedback.

## The one live workstream: Facebook groups

Read **`docs/marketing/campaign.md`** first — it is the whole 19-week campaign
across every channel, dated, from today to the Jan 1 paywall. Then
**`docs/marketing/facebook-playbook.md`** — it is the whole channel plan,
operationally. Track the groups in **`docs/marketing/groups.md`**.

For what gets built after the marketing push starts, read **`docs/roadmap.md`**
(month-by-month to the Jan 1 paywall, every item gated on the funnel number).
Its first item is not a feature: **the mobile layout has never been tested on a
real phone**, and every visitor from Facebook arrives in a phone browser.

Where the owner actually is, as of **Thursday 2026-08-20**:

| When | What |
|---|---|
| Thu Aug 20 | **DONE** — joined the groups |
| Fri 21 – Sun 23 | Be a member. 15 min/day, comment on 2–3 posts, **zero mentions of the site**. NY certifies Sundays, so the groups spike then. |
| Sun Aug 23 | DM the admins asking permission to post (highest-leverage move in the plan) |
| Mon Aug 24 | First post. One group per day, weekday 9–11am, plain text, stay on it for the first hour. |

**The number to watch** is not signups. It is the `/admin` funnel gap between
*Onboarded* and *Logged ≥1 activity*. If ten people sign up and one logs
anything, stop posting and fix the product — more traffic does not fix that, it
burns the audience.

**A hard rule that came up and will come up again:** no bot, no automation, no
scheduled commenting on the personal Facebook profile. It violates Meta's terms
and the penalty is losing the profile, which is the entire trust asset the plan
rests on — and generated answers about somebody's benefit eligibility can be
confidently wrong in a way that costs a stranger money. The legitimate version
is automating the *drafting* (paste a post, get a draft, post it yourself).
**Not yet written but agreed as a good idea: a canned-answers file** in
`docs/marketing/` covering the ~12 questions that recur in these groups, in the
owner's voice, with New York specifics. Build it from real saved posts, not
from guesses.

## What shipped 2026-08-20

- **Feedback now emails the owner** the moment it arrives, and this is
  **verified working end-to-end on production** — the row lands on `/admin`
  *and* an email arrives at `prs.educ01@gmail.com`. `apps/web/lib/notify.ts`
  POSTs to the Resend REST API (raw `fetch`, no new dependency; the domain was
  already verified there for the Supabase sign-in mail). `reply_to` is the
  reporting user, so Reply answers them directly.
  **The table stays the source of truth**: `notifyFeedback` never throws, aborts
  after 5s, and runs *after* the insert commits, so any mail failure costs an
  alert and never a report. Unset `RESEND_API_KEY` = a `console.warn` in the
  Vercel logs and nothing else. It is `await`ed, not fired-and-forgotten,
  because serverless freezes the function on return. Needs `RESEND_API_KEY` in
  Vercel — **already set**.
- **The landing "why is this free" block is the owner's own story now.** He
  dictated it: New York, claiming since March 2026, never missed a week, wanted
  to be 100% sure he hadn't. The previous version was a placeholder that
  invented a spreadsheet he never kept. One thing from the dictation was
  deliberately NOT used — he said he wanted the export format to be "state
  compliant", which as public copy promises that a state accepts the document.
  Nobody can warrant that; it became "print a clean copy of what you did if you
  ever need one". **Do not reintroduce that claim anywhere.**
- **`@applyassistui/*` → `@jobassistui/*` across the whole repo.** Every
  workspace package, every import, the root package name, both READMEs, the
  automation console banner and two migration header comments. All five
  workspaces typecheck and both the web and extension builds pass. The lock
  file was regenerated. **Two files deliberately still say `ApplyAssistUI`** —
  `HANDOFF.md` and `docs/email/README.md` — because they record the *history*
  of the SMTP sender-name bug ("the sender name was ApplyAssistUI until
  2026-08-19"). Rewriting those would destroy the record of a real bug. That is
  intentional, not a missed rename.

## Dead-code sweep 2026-08-20 — findings

The repo is small and clean. `apps/web` has **no unused components, no unused
lib files, no TODO/FIXME markers, and every npm dependency is imported** — with
one exception:

- **`packages/db/src/index.ts` exports a `Database` type that nothing imports.**
  The Supabase client is untyped on purpose (a long-standing decision), so the
  hand-written type has no consumer. `apps/web` still declares `@jobassistui/db`
  as a dependency and lists it in `transpilePackages`. **Left in place
  deliberately** — it is the readable schema documentation, it costs nothing at
  runtime, and it is what you would type the client against if you ever do.
  Delete it only if you decide the schema doc is not worth keeping.
- `packages/db/migrations/` is of course essential — the package stays
  regardless.
- **`packages/automation` (20 files) and `apps/extension` (13 files) are PARKED,
  not dead.** `apps/web` imports nothing from either, so neither is in the
  production build. The extension was un-phased-out on 2026-08-09 and the
  automation package holds the ported Indeed scout logic for a future Guided
  feature. **Do not delete them** without an explicit decision.
- `indeed_html/` (1.4MB scraped fixture) is **gitignored and not in the repo** —
  a local scratch file. Safe to delete off disk, irrelevant to the codebase.

## Designed but NOT built: weekly activity reminders

The owner's idea on 2026-08-20, and it is a good one — opt-in email reminders
telling you how many searches you have left this period. ~70% of it already
exists: `weekly_target` and `reporting_period_start_day` are already on
`profiles`, the period math (`startOfReportingPeriod`, `endOfReportingPeriod`,
`reportingPeriodKey`) is already in `packages/shared`, the "X of Y" count is
already computed at `dashboard/page.tsx:29-35`, and sending email now works.

Missing: a Vercel cron (none configured anywhere), a user timezone (not
stored), and a notification-preference column.

**The risk that must be designed in from the start:** reminder mail is
recurring and unasked, which is what people mark as spam. Those complaints land
on `jobassistui.com` — the same domain and shared IP that delivers the
**sign-in codes**. The failure mode is not "reminders stop working", it is
"nobody can log in", on a domain with almost no reputation to absorb it.
Mitigations agreed: opt-in with a visible checkbox at onboarding; **never mail
anyone who has logged zero activities ever**; one-click unsubscribe honored
without login; and a `last_reminded_period` column so a buggy hourly cron
cannot send the same person eleven emails.

Recommended send: the day before the period closes, ~9am local, with different
copy for "0 logged" than for partial progress. Timezone should be captured from
the browser at onboarding (`Intl`, no extra question) defaulting to
`America/New_York`.

---

## What changed 2026-08-19

The site now says **Beta** and there is finally a way for a user to report a
bug. Built because the marketing push was about to send people to a product
with no feedback channel at all (the only contact was a personal Gmail buried
in /terms).

- **`packages/db/migrations/0004_feedback.sql` — APPLIED to Supabase by hand
  2026-08-20.** (It had to be pasted into the SQL editor; nothing applies
  migrations automatically. If the Feedback form ever errors and tells the user
  to email instead, this table is why.)
- New `/feedback` page + server action under `(app)`. Gated on `requireUser`,
  **not** `requireEntitled` — someone locked out by the paywall or by a bug
  still needs to be able to report it.
- **(2026-08-20) Feedback is now emailed to `SUPPORT_EMAIL` as it arrives**, not
  just parked in the table. `apps/web/lib/notify.ts` POSTs to the Resend REST
  API (raw `fetch`, no new dependency) and sets `reply_to` to the reporting
  user, so hitting Reply answers them directly. Needs `RESEND_API_KEY` in
  Vercel. **The table stays the source of truth**: `notifyFeedback` never
  throws, times out after 5s, and runs *after* the insert commits, so a mail
  outage costs an alert and never a report. Unset key = a `console.warn` in the
  Vercel logs and no email; nothing user-visible breaks. It is `await`ed rather
  than fired-and-forgotten because serverless freezes the function on return.
- `components/BetaBar.tsx`: dismissible (localStorage `jaui.betaBarDismissed`)
  sky-blue bar in the authenticated shell with a report-a-bug link carrying
  `?from=<pathname>`. Distinct from `FreePeriodBanner`, which is a pricing
  disclosure and is deliberately NOT dismissible.
- `/admin` grew a **Feedback** inbox section above the charts (service-role
  read; there is no cross-user select policy on the table by design).
- Landing page: Beta badges, a first-person "why is this free / it's early"
  block before pricing, and a `mailto:` "Report a bug" link in the footer for
  people who cannot sign in.
- **(2026-08-20) The landing "why is this free" block is now the owner's own
  words** (New York, claiming since March 2026, never missed a week, wanted to
  be 100% sure). Claude's placeholder invented a spreadsheet he never kept. One
  thing from his dictation was deliberately NOT used: he said he wanted the
  format to be "state compliant" — as public copy that promises a state accepts
  the export, which is the exact claim softened out of the hero the day before.
  It became "print a clean copy of what you did if you ever need one". Source
  dictation is `Answered_four_questions.txt` (untracked, in the repo root).
- **Copy claim softened**: the hero said "Export a report your state accepts"
  — that warrants something no one can warrant for 50 states, and it
  contradicted the footer disclaimer. Now "ready for your claim". Same fix in
  the root layout's meta description ("DOL-ready" → "a clean report").
- **The project email is now `prs.educ01@gmail.com`**, not the owner's personal
  `psommerville3@gmail.com`. It is the value for `ADMIN_EMAILS`, and it is the
  public contact address — now defined ONCE as `SUPPORT_EMAIL` in
  `apps/web/lib/site.ts` (it used to be copy-pasted into /terms and /privacy)
  and consumed by /terms, /privacy, the landing footer and the feedback form.
  `COMPED_EMAILS` should gain it too, so the admin account isn't paywalled on
  2027-01-01. `psommerville3@gmail.com` stays in the historical records below
  (DMARC `rua`, the original comped/test accounts) — those are still accurate.
- **Email deliverability, revisited.** A sign-in email to a brand-new Gmail
  address (`prs.educ01@gmail.com`) landed in spam. Diagnosed rather than
  guessed — Gmail headers and mail-tester both show **SPF, DKIM and DMARC all
  PASS** (DNS re-verified live), and SpamAssassin scores **-1.1** against a -5
  spam threshold. So the August authentication work is intact and was not the
  cause. Three real problems found, two fixed:
  - **The SMTP sender name was still `ApplyAssistUI`** — the pre-rename product
    name, matching neither the sending domain nor the site. A display name that
    disagrees with the domain is a phishing signal AND confuses real users.
    Now `JobAssistUI`.
  - **The body was 335 bytes** (a heading, a label, six digits). Thin
    transactional mail from a domain with no history is filter bait, and it told
    the reader nothing. Replaced with a ~1.5KB version that says who we are, why
    they got it, and what to do if it wasn't them. Subject went from the generic
    `Confirm your email address` to `Your JobAssistUI sign-in code`. Pasted into
    **both** Confirm signup and Magic Link — see `docs/email/README.md`, which is
    now the versioned copy of what lives in the Supabase dashboard.
  - **The SES shared IP is listed on SpamCop** (Yellow on Hostkarma). That is
    Resend's shared infrastructure, **not delistable by us**, and a dedicated IP
    is a paid upgrade not worth it at this volume. Accepted, not fixed.
  - Remaining cause is plain reputation: a weeks-old domain with almost no send
    history, delivering to an address with no history either. Only real
    recipients fix that.
  - **The retest is confounded** — the address had been marked Not Spam, which
    trains Gmail per-mailbox. `+alias` and dotted Gmail variants share that
    training, so they cannot serve as clean tests. The honest measurement is
    asking the first few real users whether it landed in spam.
  - Login page now names the sender and treats spam placement as expected,
    pointing out the typed code works fine from the spam folder (there is no
    link to click, so a filtered email is an annoyance, not a dead end).
  - **Google Postmaster Tools: deliberately deferred.** It needs ~100+ msgs/day
    to Gmail before it renders anything; at current volume it would be empty
    charts. Revisit once there are real users.
- **Vercel Web Analytics** added (`@vercel/analytics` → `<Analytics />` in the
  root layout). Cookieless, no banner needed. **Enabled in the Vercel dashboard
  2026-08-20** (project → **Analytics** tab → Enable) — it collects nothing
  until that switch is on, so it was dead code until that date.

**Marketing plan agreed 2026-08-19** (channels, in priority order): Facebook
state unemployment groups first, then Reddit state subs (r/Unemployment, r/EDD
et al — help for a week before posting anything), then American Job Centers /
WorkSource offices with a printed flyer, then per-state SEO pages. Explicitly
**not** Product Hunt / HN / Twitter: that audience is employed developers.
The pitch is the true one — "I'm job searching too, I built the thing I
wanted, it's free until Jan 2027 because I can't take income before then,
tell me what breaks."

---

# (2026-08-18) the product is FREE until 2027-01-01

**Everything below this section is older history (extension work, then launch
history). Read this part first.**

Two things shipped this session, both live on https://www.jobassistui.com and
both pushed to `main`. Working tree is clean; nothing is half-finished in code.

---

## ✅ (DONE 2026-08-20) `ADMIN_EMAILS` — what made `/admin` work in production

The admin dashboard **fails closed** without this env var: with it unset,
`/admin` returns 404 in production, including for the owner. It was set on
2026-08-20. Kept here because a new Vercel environment needs it again.

1. vercel.com → project `job-automation-webapp` → **Settings** → **Environment Variables**
2. Key `ADMIN_EMAILS`, value `prs.educ01@gmail.com`
3. Tick **Production**, Save
4. **Deployments** → newest → ⋯ → **Redeploy**

Then sign in and the nav shows an **Admin** link.

## ⚠️ ALSO: an editor tab may still hold an emptied file

At the end of this session `packages/db/migrations/0002_billing.sql` was found
**emptied to 0 bytes** in the working tree (not by any command run here — it was
open in the IDE). It was restored from git (`git checkout --`) and the tree is
clean. **If that tab is still open in the editor holding the blank version,
close it WITHOUT saving** or it will wipe the file again. Production is
unaffected — that migration was applied to Supabase long ago.

---

## 1. FREE FOR EVERYONE UNTIL 2027-01-01 (commit `4ca0221`)

**Why:** the owner is collecting unemployment and cannot take income before
2027-01-01, but wants to market now and gather user feedback. The constraint is
**zero revenue**, not generosity — anything that could create a Stripe
subscription early defeats the whole point.

**Decisions the user made explicitly:**
- Free to everyone, **no credit card collected**. (They first asked to still
  require a card, then reversed: "nevermind we will wait until january 1 2027
  for the card entry". Final answer = no card.)
- **Everyone pays on 2027-01-01. No grandfathering, no permanently-free cohort.**
- Price confirmed **$12/month** — not $12.99, which they had misremembered.

**How it works.** Everything keys off `FREE_UNTIL` in
`packages/shared/src/index.ts` (alongside new `FREE_UNTIL_LABEL`,
`MONTHLY_PRICE`, `isFreePeriod()`):

- `isEntitled()` short-circuits to `true` during the period. That one function
  is the chokepoint that **both** the web paywall (`lib/auth.ts`
  `requireEntitled`) and the extension's `/api/extension/session` already went
  through, so the whole product opened with no Stripe, schema, or route changes.
- `startCheckout` (`app/(app)/billing/actions.ts`) hard-returns during the
  period. **This is the actual guarantee**: no Stripe subscription can be
  created, so no money can arrive, however the action is invoked.
- New `apps/web/components/FreePeriodBanner.tsx`, mounted in the **root**
  layout — the only shell shared by the landing page, `/login`, the legal pages
  and the authenticated app. Not dismissible: it is the disclosure that the
  product becomes paid.
- All pricing copy **branches** on `isFreePeriod()` rather than being replaced,
  so the paid story returns by itself: `app/page.tsx`, `(app)/billing/page.tsx`,
  `(app)/settings/page.tsx`, `opengraph-image.tsx`. `/terms` §4 gained a
  permanent clause covering the free period.

**Gotcha worth remembering:** `/`, `/login`, `/terms`, `/privacy` are statically
prerendered, so the build **baked `isFreePeriod()` in at build time** — the site
would have kept saying "free until Jan 1, 2027" after the date. Fixed with
`export const revalidate = 3600` in the root layout, inherited by every child
segment. **Nothing needs deploying on 2027-01-01**: the paywall, the banner and
the marketing copy all flip on their own.

**What happens on 2027-01-01:** `isFreePeriod()` goes false, banner vanishes,
paid copy returns, `isEntitled` enforces again, and free-period users get
bounced to `/billing`. Their `trial_ends_at` is still `null`, so they are
`trialEligible` and get the normal 14-day trial — i.e. they would actually be
charged ~Jan 15. If you would rather they pay immediately, make `trialEligible`
unconditional in `billing/actions.ts` at that time. Not needed now.

**To change it:** move `FREE_UNTIL` to end early. To go back to paid entirely,
delete the short-circuit in `isEntitled` and the guard in `startCheckout`.

**Verified:** build + typecheck pass; banner renders on all four public pages on
prod; OG social image regenerated ("Free until January 1, 2027 · no credit
card"); and a **rebuild with `FREE_UNTIL` set to a past date brought back the
full paywall, the `$12/month` block and the 14-day-trial copy** — the revert
path genuinely works.

## 2. OWNER-ONLY `/admin` DASHBOARD (commit `132de0a`)

User asked for "a tool that tells me how many emails I have signed up and the
activity of the users, more user friendly than Supabase". Built **into the app**
rather than adding another service — consistent with their strong preference for
minimal third-party setup.

- `apps/web/app/(app)/admin/page.tsx` + `apps/web/lib/admin.ts`.
- Shows: signups total and last 7d, onboarded, activated (≥1 activity), active
  last 7d, total activities; a signup funnel; signups-per-day bars for 14 days;
  and a per-user table (email, joined, last sign-in, entry count, last entry,
  state, "setup incomplete" flag).
- **The number that matters** is the funnel gap between *Onboarded* and *Logged
  ≥1 activity* — people who made an account and got nothing out of it. That is
  the feedback list.
- Reads via `createServiceClient()` (bypasses RLS) plus
  `svc.auth.admin.listUsers()` for the emails.
- **Access = new `ADMIN_EMAILS` env var**, deliberately SEPARATE from
  `COMPED_EMAILS`: comped beta testers get a free account, **not** every other
  user's email address. Unset means `/admin` 404s for everyone. Non-admins get
  `notFound()` rather than a redirect, so the page's existence is not leaked.
  `/admin` added to the middleware auth prefixes and to robots.txt disallow.

**Verified:** build passes; unauthenticated `/admin` 307s to `/login`;
robots.txt disallows it.
**NOT verified:** the signed-in render against real data — it needs an emailed
login code. A script written to check the queries directly was blocked by a
permission rule for reading `.env.local` secrets. **First time you load
`/admin`, sanity-check the numbers.**

---

## Pick up here (next session)

1. **Do the `ADMIN_EMAILS` Vercel step above**, load `/admin`, confirm the
   numbers look right.
2. **MARKETING — this is the actual priority.** The product is live, free, and
   says so; there is now a dashboard to measure whether anyone shows up. No
   marketing work has been done at all yet.
3. **Offered but not yet built: Vercel Web Analytics.** `/admin` shows people
   who signed up, but nothing about people who visited and did not. Vercel Web
   Analytics covers visitors / referrers / drop-off, is a toggle in a console
   the user already uses, plus a one-line code change. **The user was asked and
   had not answered when the session ended** — ask again.
4. Optional follow-on idea, not requested: a "new signup" email alert via the
   existing Resend setup, so they do not have to poll `/admin`.

## Explicitly NOT done (and why)

- **No Stripe changes at all** — no long `trial_end`, no 100%-off coupon, no new
  price. Creating subscriptions now is the one class of change that could
  produce income before the date.
- **No database migration** — `subscription_status` stays `none` for free-period
  users; entitlement is computed per-request, exactly like the existing
  `COMPED_EMAILS` bypass.
- `COMPED_EMAILS` untouched; still works and stays useful after Jan 1.
- The Chrome extension was **not** touched this session. It remains parked
  mid-build with one unverified fix — see the parked section below.

## Commits this session (both pushed to `main`)

- `4ca0221` Free for everyone until 2027-01-01, announced site-wide
- `132de0a` Owner-only /admin dashboard: signups and whether people use it

(The push also carried up two older unpushed extension commits, `86ee728` and
`5efecad`.)

---

# (previously) The Chrome extension is mid-build — PARKED

**This extension section is parked. See the START HERE section above it for current state.**

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
  Internal package names are still `@jobassistui/*` — cosmetic only, not
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
| Vercel env (Production) | `STRIPE_SECRET_KEY` (sk_live), `STRIPE_PRICE_ID` (price_), `STRIPE_WEBHOOK_SECRET` (whsec_), `NEXT_PUBLIC_SITE_URL=https://www.jobassistui.com`, `COMPED_EMAILS=psommerville3@gmail.com,prs.educ01@gmail.com`, `ADMIN_EMAILS=prs.educ01@gmail.com`, `RESEND_API_KEY` (re_, feedback email alerts — optional, feedback still saves without it), plus the three Supabase vars |
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
4. Support email: RESOLVED 2026-08-19 — the public contact address is `prs.educ01@gmail.com`, defined once as `SUPPORT_EMAIL` in `apps/web/lib/site.ts` and used by /terms, /privacy, the landing footer and the feedback form.
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
