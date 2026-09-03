# Audit — state of reality

**Mary (Analyst), 2026-09-02.** Ground-truth pass over `HANDOFF.md`,
`docs/roadmap.md`, `docs/store-submission.md` and the actual code at `main`
(`c96b0f4`, working tree clean except untracked `.claude/`, `docs/bmad/` and
`docs/marketing/canned-answers.md`).

**Evidence** = I read it in the repo or ran it. **Inference** = my reading of
what that means. They are labelled separately throughout. Nothing here was
verified against the live site or the live database — see the last section.

---

## 0. How I checked

- Read all 1,404 lines of `HANDOFF.md`, `docs/roadmap.md`,
  `docs/store-submission.md`, `docs/store-listing-description.md`.
- Read the whole of `apps/web` (57 TS/TSX files), the extension source
  (`apps/extension/src`, 3,062 lines), `packages/shared/src/index.ts`, all five
  migrations.
- Unzipped and inspected **both** extension packages: the one the website
  serves (`apps/web/public/jobassistui-extension.zip`) and the one submitted to
  Google (`apps/extension/jobassistui-store.zip`).
- Ran `npm run typecheck --workspaces`. **All five workspaces pass, zero
  errors.**
- Ran `git log --all -- packages/automation/.env` (empty) and
  `git grep` for live-key prefixes across tracked files.

---

## 1. What is genuinely live and working for a real user today

**Evidence.** Every one of these is implemented, wired to the nav, gated
correctly, and typechecks. HANDOFF records each as e2e-verified against
production on 2026-08-06/07 or later.

| Flow | Where | Gate | State |
|---|---|---|---|
| Sign in (typed 6-digit code) | `components/LoginForm.tsx:55-82` | public | Built. Retries `type:"signup"` after `type:"email"` so first-time users aren't stranded (`:63-70`) |
| Session refresh + route guard | `lib/supabase/middleware.ts:61-80` | — | Segment-exact prefix list, `?redirect=` preserved |
| Onboarding (disclaimer) | `lib/auth.ts:45-51` → `/settings?onboarding=1` | `requireOnboarded` | Built |
| Log an activity | `app/(app)/log/new/actions.ts:23-84` | `requireOnboarded` (**free**) | Built. Whitelists method/result, snapshots `reporting_period` |
| Dashboard + weekly badge | `app/(app)/dashboard/page.tsx:35-40` | `requireOnboarded` (**free**) | Built |
| Delete an entry | `components/DeleteEntryForm.tsx` | own-row RLS | Built |
| Evidence screenshot upload | `log/new/actions.ts:46-60` → private `evidence` bucket | per-user storage policy, `0001_init.sql:112-116` | Built — **never tested** (see §6) |
| Signed evidence links | `dashboard/page.tsx:42-54` | 1h signed URLs, batched | Built |
| PDF export | `app/export/pdf/route.ts` | `requireOnboarded` (**free**) | Built. WinAnsi sanitiser, pagination, shortfall callout |
| CSV export | `app/export/csv/route.ts:14` | `requireOnboarded` (**free**) | Built. UTF-8 BOM present as a literal U+FEFF |
| Settings (state, weekly target, period start day) | `settings/actions.ts` | `requireUser` | Built, clamped 0–20 / 0–6 |
| Billing | `billing/page.tsx`, `billing/actions.ts` | `requireOnboarded` | Live Stripe. `startCheckout` hard-returns during the free period (`actions.ts:15`) — no subscription can be created |
| Feedback → table + email | `feedback/actions.ts`, `lib/notify.ts` | `requireUser` | Built; `notifyFeedback` never throws, 5s timeout, row is source of truth |
| Answer template editor | `template/page.tsx` | `requireEntitled` (open until 2027-01-01) | Built |
| Owner dashboard | `app/(app)/admin/page.tsx` | `ADMIN_EMAILS`, `notFound()` | Built — see §4 |

**Evidence.** Pricing copy is consistent everywhere I looked: the banner
(`FreePeriodBanner.tsx:27`), the landing hero, the landing pricing block, the
billing page's `FEATURES` array (`billing/page.tsx:26-30`) and Terms §4
(`terms/page.tsx:56-79`) all say the same thing — **log free permanently,
Guided assist is the one paid feature, $12/mo from 2027-01-01.** The
2026-08-29 split reached the words as well as the gating.

**Inference.** The free tracker — sign up, log, track the week, export — is a
complete, coherent product a stranger could use today. It is not a prototype.

---

## 2. Claimed as built but actually dark, unreachable, or defeated

### 2a. Rules Assistant — deliberately dark. Confirmed.
**Evidence.** `/assistant` calls `requireAdmin()` (`assistant/page.tsx:24`),
which is `notFound()` for non-admins (`lib/admin.ts:20`). The API route repeats
the gate and returns 404, not 403 (`api/assistant/answer/route.ts:50-53`). It
is not in the nav (`(app)/layout.tsx:38-64`) and deliberately not in the
middleware prefix list (`middleware.ts:58-60`). `0005_assistant.sql` is
unapplied, so the log write fails silently by design.
**Inference.** Working as designed. Zero users can reach it, including by URL.
Not a defect; it is also not an asset until it is released.

### 2b. `apps/web/public/jobassistui-extension.zip` is STALE — and this defeats the funnel fix
**This is the most consequential finding in the audit.**

**Evidence.**
- The zip the website serves was last committed in `5e2afe7`, and is 30,179
  bytes, mtime Aug 30 18:55.
- The zip submitted to Google is 31,608 bytes, mtime Aug 30 22:19.
- The extension-detection marker was added in `16195ae` at **21:32**, i.e.
  between the two.
- I unzipped both. `grep -rl "jobassistuiExtension"`:
  **store zip → `web-bridge.js` matches. Website zip → no match, anywhere.**
- The website zip's `manifest.json` still carries the *old* description
  ("Guided autofill for job-application forms…") and is missing the apex
  `https://jobassistui.com/*` host permission that the current manifest has.

**Inference.** Until Google approves the listing, developer-mode sideload of
that zip is the **only** way anyone can install the extension — and that build
never sets `data-jobassistui-extension`. So for every early user:
`useExtensionInstalled()` resolves to `false` forever; `ExtensionMissingNote`
tells them on every visit to `/template` that they haven't installed it;
`NextStepActions` shows "Install the extension →" as the primary button instead
of the Indeed link; `GuidedPitch` keeps pitching the install on the dashboard.
**The three-holes fix is inert for exactly the people who can install today**,
and it actively makes the product look broken to a user who did install.

### 2c. The store listing's central claim is contradicted by the shipped code
**Evidence.** `docs/store-listing-description.md`, the text pasted into the
Store, says verbatim:

> "The extension does not find jobs, does not browse listings, and does not
> choose anything on your behalf — it activates on the application form that is
> already open on your screen, because you opened it."

The shipped bundle does all three:
- `content.ts:298` renders a **"🔎 Find jobs"** button as the panel's primary
  action; `content.ts:1220` wires it to `findJobs()`, which navigates to an
  Indeed search and scrapes the results page (`content.ts:216`).
- `background.ts:77` `pressApplyInPage()`, injected with `world:"MAIN"` at
  `background.ts:238`, presses Indeed's Apply button itself.
- `content.ts:810` `advancePage()` clicks "Continue" and advances form steps;
  `content.ts:1395` is a hop loop that steps past question-less pages.
- I confirmed all of this is **in the uploaded artifact**: the store zip's
  `content.js` contains `Find jobs`, `aaui-find` and `Apply to this job`;
  `background.js` contains `pressApply` and
  `indeed-apply-status-not-applied`.

`docs/store-submission.md` Step 9 concedes the point internally — "This
extension presses Apply and advances pages on its own" — while Step 6b tells
you to paste the description that says it does not.

**Inference.** This is a straight factual mismatch between the submitted
listing and the submitted code, on precisely the axis a reviewer checks. It is
a materially bigger rejection risk than the Indeed-ToS question HANDOFF names,
because it is verifiable from the bundle in thirty seconds without any judgment
call about Indeed's terms.

**Related, lower stakes.** Terms §2 (`terms/page.tsx:38-40`) says "Guided
assist only suggests and pre-fills form values." Pressing Apply and clicking
Continue is more than that. The first half of the sentence ("never … without
you present and directing it") still holds.

### 2d. The submit guard is real. Confirmed fixed.
**Evidence.** `advancePage()` refuses any button whose label matches
`/\b(submit|send)\b/i` and tells the user to press it themselves
(`content.ts:832-839`). The guard is at the click site, with a comment
recording the 2026-08-29 incident. The hop loop applies the same rule
(`content.ts:1399`). A confirm step (`renderStartConfirm`, `content.ts:527`)
sits between picking a job and touching the form.
**Inference.** The worst bug in the file's history is genuinely closed.

### 2e. Dead weight that is gone, contrary to HANDOFF
**Evidence.** `apps/extension/STAGE_B_STATUS.md` — which HANDOFF calls "WRONG
and should be fixed or deleted" — **no longer exists.** Already resolved.

---

## 3. The three Guided funnel holes — all three are FIXED. HANDOFF is wrong.

HANDOFF's top block (written 22:42) lists these as "not yet fixed". Commit
`16195ae` at **21:32 the same evening** fixed all three. The handoff header was
edited an hour after the fix and did not pick it up.

| Hole | Fix | Evidence |
|---|---|---|
| 1. Answer Template page had no link to `/guided`; its primary button sent people to Indeed where nothing fills | `NextStepActions.tsx` branches on detection: no extension → "Install the extension →" to `/guided`; extension → the Indeed link. Plus a standing `ExtensionMissingNote` on every visit, not only `?saved=1` | `template/page.tsx:23`, `NextStepActions.tsx:19-72`, `ExtensionMissingNote.tsx:16-38` |
| 2. Dashboard pitch vanished after the first logged activity | `GuidedPitch` now hides on two real signals: `hasGuidedEntry` (server-side) and extension-installed (client-side). The `entries.length === 0` gate is gone | `dashboard/page.tsx:32,94`, `GuidedPitch.tsx:19-22` |
| 3. Web app could not detect the extension | `web-bridge.ts` sets `document.documentElement.dataset.jobassistuiExtension` — a DOM attribute, not a `window` global, because content scripts run isolated | `web-bridge.ts:92-98` |

The detection hook is carefully done: three states, `null` while detecting, a
`MutationObserver` plus a 1.5s settle, and every caller renders nothing while
`null` so nobody who *has* the extension is shown an install prompt
(`useExtensionInstalled.ts:22-58`).

**Inference.** The engineering is right and complete. It is neutralised in
production by §2b — the served zip does not set the marker. Two lines of the
comment in `web-bridge.ts:90` point at a file called `ExtensionDetect.tsx` that
does not exist (the hook is `useExtensionInstalled.ts`); harmless.

---

## 4. Instrumentation — what the owner can and cannot measure

**Short answer: the roadmap's gating metric exists and is computable. Visitor
data exists but only in a separate dashboard, and there is no event
instrumentation of any kind.**

### What `/admin` reports, and where each number comes from
**Evidence** (`app/(app)/admin/page.tsx`, service-role client, `force-dynamic`):

| Number | Definition | Source |
|---|---|---|
| **Signups** | count of auth users, `+N this week` | `svc.auth.admin.listUsers({page:1, perPage:1000})` — line 71 |
| **Onboarded** | users whose profile has `disclaimer_accepted_at` | `profiles` — lines 73-74, 112-114 |
| **Logged ≥1** | users with ≥1 `activity_log` row | `activity_log` — lines 76-79, 115 |
| **Active (7d)** | users whose newest entry is <7d old | derived, lines 116-119 |
| **Activities** | total rows, with a `N guided` sub-label | line 120 |
| **Signup funnel** | four bars: Signed up → Onboarded → Logged ≥1 → Active 7d | lines 226-229 |
| **Signups per day** | 14 UTC day buckets | lines 122-132 |
| **Users table** | email, joined, last sign-in, entry count, last entry, state, "setup incomplete" badge | lines 134-145 |
| **Feedback inbox** | newest 200, above the charts | lines 80-84, 176-215 |

Caps: 1,000 auth users, 5,000 activity rows, 200 feedback rows. Access fails
closed — with `ADMIN_EMAILS` unset the page 404s for everyone, including the
owner (`lib/admin.ts:9-13`).

**The roadmap gate is executable.** `docs/roadmap.md` says every month is gated
on "the `/admin` gap between *Onboarded* and *Logged ≥1 activity*." Both
numbers are on the page, as tiles and as adjacent funnel bars. It works.

### What is missing
**Evidence.**
- Vercel Web Analytics is wired: `@vercel/analytics` in `apps/web/package.json`
  and `<Analytics />` in `app/layout.tsx:47`. That gives pageviews, referrers
  and paths — in the Vercel dashboard, not in `/admin`.
- **There is not a single custom event anywhere.** `grep` for
  `track(`/`posthog`/`plausible`/`gtag`/`mixpanel` across `apps/web` returns
  nothing but the `<Analytics />` import and one unrelated code comment.
- `/admin` shows nobody who visited and did not sign up.

**Inference.** He can answer "how many signed up" and "how many of them logged
something" precisely, and "how many visited, from where" approximately by
opening a second dashboard and eyeballing it against the first. He **cannot**
answer: how many people reached `/login` and never got a code; how many
requested a code and never typed one (the spam-folder drop-off, which the login
copy itself admits is the expected case); how many started the add-activity
form and abandoned it. Given that the whole channel is Facebook's in-app
browser, "did the email even arrive" is the likeliest silent failure and it is
the one thing nothing measures.

---

## 5. Technical debt: dangerous vs untidy

### Dangerous

1. **Live Browserbase API key on disk. CONFIRMED.**
   **Evidence.** `packages/automation/.env` exists (469 bytes, Jul 5). It
   defines `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`, `TWOCAPTCHA_KEY`,
   `BROWSERBASE_CONTEXT_ID` — all with values. I did not print any value.
   `git log --all -- packages/automation/.env` is **empty**: it was never
   committed, and `.gitignore:14` covers it. `git grep` for live-key prefixes
   across tracked files finds nothing but placeholder docs.
   **Inference.** Exposure is local-disk only, not public. Both keys are
   usage-billed on services nobody is using. They should be revoked — this is
   cheap and removes a standing liability. `docs/services.md:92` and `:101`
   already say so.

2. **The served extension zip is stale (§2b).** Silently defeats a shipped fix
   and makes the product look broken to anyone who installs.

3. **The store description contradicts the submitted bundle (§2c).** A
   rejection restarts the review clock.

4. **`0005_assistant.sql` is unapplied. CONFIRMED.** File present
   (2,819 bytes, Aug 30). Only `/assistant` needs it and `/assistant` is dark,
   so nothing breaks. *Inference: harmless today, becomes a hard blocker the
   moment the admin gate comes off.*

5. **Anti-detection code still in the repo.** `packages/automation/src/human.ts`
   (`humanEmulation()`, comment: "Intentional anti-detection behavior: DO NOT
   REMOVE") and `src/captcha.ts` (2Captcha / Cloudflare Turnstile) are both
   still present. **Good news:** neither reaches the shipped extension — I
   grepped the uploaded bundle for `humanEmulation`, `2captcha`, `turnstile`
   and found nothing, and there is no `eval`, `new Function` or `importScripts`
   in any of the three bundled files, so the "No remote code" answer in the
   Store console is provably correct. *Inference: not shipped, so not a review
   risk; still a bad thing to have in a public GitHub repo attached to a
   consumer product.*

### Untidy, not dangerous
- `packages/db/src/index.ts` exports a `Database` type nothing imports
  (deliberate: it is the readable schema doc).
- `packages/automation` (20 files) is parked. `apps/web` imports nothing from
  it; it is not in the production build.
- Three stale `stage-b/*` branches plus `rules-assistant`, all merged.
- No `/log/[id]/edit` route exists anywhere — an entry can only be created and
  deleted. Fixing a typo means delete and retype.

---

## 6. What would embarrass this product in front of its first ten users

Ordered by how likely a real person hits it.

1. **The dashboard table is clipped on a phone, with no way to scroll.**
   **Evidence.** `dashboard/page.tsx:147` wraps the six-column table in
   `overflow-hidden`. Contrast `/admin` — the owner-only, desktop-only page —
   which correctly uses `overflow-x-auto` (`admin/page.tsx:251`). The app
   shell is `max-w-5xl px-6` (`(app)/layout.tsx:110`), leaving ~342px on a
   390px viewport; Date, Method and Result are all `whitespace-nowrap`.
   **Inference.** On a phone the Evidence column and the Delete button are cut
   off and unreachable. Every visitor from Facebook arrives on a phone. This is
   the main screen of the product. `docs/roadmap.md`'s very first item is "the
   mobile layout has never been tested on a real device" — this is one concrete
   instance of it, findable without a device.

2. **Evidence upload almost certainly fails for a phone photo.**
   **Evidence.** The screenshot is uploaded through a **server action**
   (`log/new/actions.ts:48-60`). `apps/web/next.config.js` sets no
   `experimental.serverActions.bodySizeLimit`; Next 15 (15.5.20 installed)
   defaults to **1 MB** per server-action body. The input accepts
   `image/*,application/pdf` with no client-side size check or compression.
   On failure the action throws, and `app/error.tsx` shows "Something went
   wrong" with no cause — losing the whole form.
   **Inference.** A camera-roll photo is routinely 2–5 MB and a phone
   screenshot 1–3 MB. This is very likely broken for the common case, and
   HANDOFF has listed "evidence screenshot upload" as never tested since
   2026-08-07. The roadmap predicted this exact step would break.

3. **A sideloaded install tells the user forever that they haven't installed
   it** (§2b). Two separate cards nag them on `/template` and `/dashboard`, and
   the template page's primary button stays "Install the extension →".

4. **The sign-in code box shows an eight-digit placeholder for a six-digit
   code.** `LoginForm.tsx:116` — `placeholder="12345678"`; the submit button
   unlocks at length ≥ 6 (`:121`). Small, but it is on the first screen of a
   product whose known weak point is the emailed code.

5. **"Guided Assist" sits in the main nav for every user** on every device
   (`(app)/layout.tsx:48-50`), including phone users for whom it can never
   work. The page itself says so, but only after they've clicked.

6. **Any server-side failure is a blank "Something went wrong".**
   `createEntry` and `saveSettings` both `throw new Error(...)`
   (`log/new/actions.ts:58,80`; `settings/actions.ts:35`), and Next masks
   server-action messages in production. The user gets no cause and no
   recovery path, and the owner gets no report unless the user finds
   `/feedback`.

---

## 7. Where `HANDOFF.md` is now wrong

It is an excellent document and it is stale in four places. Worth correcting,
because a plan written from it will be wrong.

| HANDOFF says | Actually |
|---|---|
| "The three Guided funnel holes … **not yet fixed**" (line ~50) | All three fixed in `16195ae`, one hour before the handoff was last edited |
| "`STAGE_B_STATUS.md` is WRONG and should be fixed or deleted" | The file is gone |
| "the canned-answers file … still not written" | `docs/marketing/canned-answers.md` exists (13 KB, written 2026-09-02, **untracked** — not committed) |
| Nothing anywhere flags the served zip | It is one commit behind the fix that depends on it (§2b) |

Still accurate: `groups.md` is an empty template (headers and blank rows only);
no posts; one DM.

---

## What I could not verify

Everything below needs a credential, a device, or a live service I cannot
reach from here.

1. **Anything about the live site.** I did not open jobassistui.com. Every
   "live" claim in §1 rests on code plus HANDOFF's record of e2e passes, not on
   my own observation.
2. **Whether the deployed build is `c96b0f4`.** HANDOFF says main is pushed and
   Vercel auto-deploys. I did not check Vercel.
3. **The database.** Which migrations are actually applied (0001–0004 are
   claimed applied by hand; 0005 is claimed unapplied — I confirmed the *file*
   state only), whether the `evidence` and `resumes` buckets exist, and the
   real values of every `/admin` number, including whether it is genuinely zero
   users.
4. **Whether Vercel Web Analytics is switched on** in the dashboard, and what
   its plan retention is. The code is wired; the toggle is not visible to me.
5. **Env vars in Vercel** — `ADMIN_EMAILS`, `COMPED_EMAILS`, `RESEND_API_KEY`,
   the Stripe and Supabase keys. If `ADMIN_EMAILS` were ever cleared, `/admin`
   silently 404s for the owner too.
6. **The Chrome Web Store submission itself** — its status, and whether the
   uploaded artifact is byte-identical to the `jobassistui-store.zip` I
   inspected. I verified that file's contents, not that it was the file
   uploaded.
7. **The server-action body limit failure mode.** I confirmed no limit is
   configured and that Next 15's default is 1 MB; I did not upload a 3 MB file
   and watch it fail.
8. **The mobile table clipping.** Derived from the CSS and the shell's
   `max-w-5xl px-6`; not observed on a device or in a browser.
9. **Whether the extension works end to end on a live Indeed page today.**
   HANDOFF records a successful run on 2026-08-29 with five bugs fixed after
   it. I read the fixes in the code. Indeed's markup changes without notice and
   nothing has been run against it since.
10. **Whether the Browserbase and 2Captcha keys are still active.** I confirmed
    they are present on disk and never committed. I did not call either API.
11. **Email deliverability**, the Supabase template contents, and whether the
    subject line matters in practice.
