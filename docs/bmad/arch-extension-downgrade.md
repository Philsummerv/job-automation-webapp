# Architecture — Chrome extension capability downgrade

**Winston (Architect), 2026-09-02. Design only. No code written.**

## ⛔ Do not upload this

A Chrome Web Store review is **open right now** on the package submitted
2026-08-30. Uploading a new package **replaces the pending submission and
restarts the review clock**. This work ships as a later version (1.0.1) and is
held on a branch until the current review resolves one way or the other.

Plan it, build it, test it, commit it. Do not touch the Store console.

---

## The target

A capability ladder agreed with the owner. Keep rungs 1–3, remove 4–6.

| # | Capability | Verdict |
|---|---|---|
| 1 | Fill fields on an application form the user already opened | **KEEP** |
| 2 | Log the application to jobassistui.com after the user submits | **KEEP** |
| 3 | Click "Continue" between pages of a multi-step form | **KEEP** |
| 4 | Extension presses Apply itself | **REMOVE** |
| 5 | Scrape the Indeed search results page | **REMOVE** |
| 6 | Job queue + working down it | **REMOVE** |

The submit guard in `advancePage()` (`apps/extension/src/content.ts:810-843`,
specifically the `/\b(submit|send)\b/i` refusal at `:832-838`) is **untouched**.
So is its twin inside the scan hop-loop (`content.ts:1406-1412`). Both survive
this change verbatim. They are the product's core promise and were added after a
real application was sent by accident on 2026-08-29.

---

## 1. How entangled is it, really?

**Much less than feared, with one sharp exception.**

### The run-loop state machine is completely clean

`apps/extension/src/state/machine.ts` (275 lines) and
`apps/extension/src/state/types.ts` (109 lines) need **zero changes**. Not one
line.

I expected this to be the hard part. It isn't. The reducer's whole vocabulary is
`starting → scanning → filling → review → advancing → done`. It has no concept
of a job queue, a search, a results page, or pressing Apply. Every `Action` and
every `Effect` in `state/types.ts:68-104` belongs to rungs 1–3. The queue and the
search were built *around* the machine, in the content script, and hand off to it
by calling `startRun()` — a single entry point (`content.ts:1246-1270`).

Cut the callers and the machine does not notice.

`background.ts` is nearly as clean: the run controller, the dispatch chain, the
no-form timeout, the webNavigation listeners and the activity-log queue are all
rung 1–3. Only two blocks are rung 4.

### The sharp exception: the start-confirm card

`renderStartConfirm()` (`content.ts:525-551`) is the "Ready when you are /
**Fill this application**" card. It is the control the Store test instructions
tell the reviewer to press (`docs/store-submission.md`, step 7 item 5).

It has exactly **one caller**: `content.ts:1322`, inside the auto-apply hand-off
IIFE that rung 4 lives in. Delete rung 4 and the card becomes unreachable. The
panel would then offer, on an application form, only a greyed "↻ Rescan page"
button.

That is the hole. It is real, it needs new code, and it is specced in §3.

Nothing else is entangled. Everything below is a clean deletion.

---

## 2. Files touched, path by path

### Clean deletions — rung 4 (extension presses Apply)

| File | Lines | What |
|---|---|---|
| `apps/extension/src/background.ts` | `67-120` | `pressApplyInPage()` — the MAIN-world injected function |
| `apps/extension/src/background.ts` | `231-245` | `case "click-apply"` and its `chrome.scripting.executeScript` call |
| `apps/extension/src/messages.ts` | `59-67` | `ClickApplyMsg` interface |
| `apps/extension/src/messages.ts` | `158` | `ClickApplyMsg` from the `WorkerBoundMsg` union |
| `apps/extension/src/messages.ts` | `192-197` | `ClickApplyResponse` interface |
| `apps/extension/src/messages.ts` | `209` | `"click-apply"` from `ResponseMap` |
| `apps/extension/src/content.ts` | `1280-1364` | the whole auto-apply hand-off IIFE (contains the `click-apply` send at `:1349`) |
| `apps/extension/src/content.ts` | `2091-2092` | `AUTO_APPLY_TTL_MS` |
| `apps/extension/src/content.ts` | `2094-2101` | `jobKeyOf()` — only caller was `:1297` |
| `apps/extension/src/content.ts` | `2103-2122` | `realClick()` — only caller was `:1353` |
| `apps/extension/src/content.ts` | `2124-2152` | `findIndeedApplyDom()` — only caller was `:1333` |
| `apps/extension/src/storage.ts` | `103-109`, `121` | the `autoApply` schema key and its default |

Every one of those helpers has exactly one caller, all inside the block being
deleted. Verified by grep. No orphans, no shared use.

Keep `content.ts:2089` (the `─── Advance-button finder ───` header) and
`content.ts:2154-2157` (the "apply deliberately absent" comment) — both still
describe `findAdvanceDom()`, which survives.

### Clean deletions — rungs 5 & 6 (search scrape + queue)

| File | Lines | What |
|---|---|---|
| `apps/extension/src/content.ts` | `15` | `import { buildIndeedSearchUrl, collectIndeedJobs }` |
| `apps/extension/src/content.ts` | `216-227` | the `autoBrowse` self-scrape block on `/jobs` results pages |
| `apps/extension/src/content.ts` | `297-299` | the `🔎 Find jobs` button markup and its wrapper `<div>` |
| `apps/extension/src/content.ts` | `588-759` | contiguous: the `─── Job search ───` header, `findJobs()`, `currentStart()`, `scrapeFilteredJobs()`, `renderJobBrowser()` |
| `apps/extension/src/content.ts` | `1220` | the `#aaui-find` click listener |
| `apps/extension/src/storage.ts` | `50-75` | `QueuedJob` and `JobQueue` interfaces |
| `apps/extension/src/storage.ts` | `99-102`, `119-120` | `jobQueue` / `autoBrowse` schema keys and defaults |
| `packages/automation/src/indeed-search.ts` | whole file | orphaned — the extension was its only consumer |
| `packages/automation/src/index.ts` | `17` | the `indeed-search` re-export |
| `packages/automation/package.json` | `"./indeed-search"` | the export subpath |

`content.ts:23` (`import type { … JobQueue, QueuedJob … }`) is an **edit**, not a
deletion — `AnswerTemplate`, `CustomRule` and `StoredResume` on that line all
survive.

### Surgery (small)

- **`content.ts:1272-1278`** — the `#aaui-start` click handler's refusal message
  says *"use 'Find jobs' here"*. That button will not exist. Reword.
- **`content.ts:1594-1597`** — `TEMPLATE_FIELDS` in the extension's local editor
  still lists `searchQuery`, `searchLocation`, `maxApplications`,
  `exclusionTitleRegex`. Nothing reads them after the downgrade. Remove.
- **`packages/shared/src/index.ts:167-173`** — the same four fields in the shared
  `TEMPLATE_FIELDS` that drives the web app's Answer Template page
  (`apps/web/app/(app)/template/page.tsx`). Remove, plus the "drives the Find
  jobs button" comment above them. **No migration** — see §7.
- **`apps/extension/manifest.json`** — permissions and version. See §4.
- **`apps/extension/src/background.ts:31-33`** — `onInstalled` should also clear
  the three dead storage keys (`jobQueue`, `autoBrowse`, `autoApply`) so an
  upgrading user isn't left with a stale scraped job list on disk. Three lines.

### Untouched — say this out loud, it is most of the value

- `apps/extension/src/state/machine.ts` — **0 lines**
- `apps/extension/src/state/types.ts` — **0 lines**
- `apps/extension/src/web-bridge.ts` — **0 lines** (auth, template sync, activity
  flush: all rung 2)
- `packages/automation/src/forms.ts`, `autofill.ts`, `config.ts`, `types.ts` — **0 lines**
- `content.ts:810-843` `advancePage()` and its submit guard — **0 lines**
- The entire review gate (`855-1059`), template editor (`1065-1151`), log
  confirm (`1153-1214`), fill machinery (`1493-1534`, `1956-2087`), resume
  attach (`1664-1717`), job-meta capture (`1719-1772`), advance-button finder
  (`2166-2203`) — **0 lines**
- `background.ts` dispatch chain, no-form timeout, activity queue, webNavigation
  listeners — **0 lines**

**Roughly 530 lines deleted, ~70 lines added, across 7 files.** ~15% of
`content.ts` and ~20% of `background.ts`.

### Free cleanup while in there

`content.ts:423-427` `scanPage()` is already dead — no callers anywhere. It
predates `scanWhenReady()`. Delete it in the same pass.

---

## 3. What breaks, and the new code it needs

### The hole

Today the panel on a job page leads with a purple **🔎 Find jobs** button. That
is its one obvious action. Remove rungs 5 and 6 and the panel's body is: a
greyed-out "↻ Rescan page", a "Cancel run", and an empty log. On an application
form the rescan button un-greys, but "↻ Rescan page" does not read as *start*.

Worse: `renderStartConfirm()` — the card that names the employer and offers
"**Fill this application**" — has no caller left. The single control the Store
test instructions name would be unreachable.

Without new code the flow is: *user opens an application, panel appears looking
broken, user must guess that "↻ Rescan page" means "fill this in".* That is not
a coherent flow.

### Spec: the idle offer

Replace the deleted auto-apply IIFE (`content.ts:1280-1364`) with an idle
watcher in the same place. Reuse the existing `scanWatch` interval at
`content.ts:1240` rather than adding a second timer.

```
every 1500ms, top frame only:
  run = await getItem("activeRun")
  if run and run.status not in (done, error):        → do nothing, a run owns the panel
  else if isApplyContext() and not offeredFor(location.href):
      markOffered(location.href)
      renderStartConfirm(captureJobMeta())
  else if reviewEl is empty:
      render the idle card
```

- `isApplyContext()` (`content.ts:188-190`) already handles **both** routes
  Indeed uses: navigating to `smartapply.indeed.com`, and dropping a smartapply
  iframe over `/viewjob`. It is the right predicate and needs no change.
- `offeredFor(href)` is a module-level `string | null`, so dismissing the card
  does not make it pop straight back, and a real navigation re-offers. On the
  iframe route the top frame does not reload, so keying on `location.href` alone
  is not enough — also re-offer when `isApplyContext()` flips false→true.
- The idle card copy: *"Open an application on Indeed and I'll offer to fill it
  in from your saved answers."* One sentence. Currently that area is blank.
- Show `showBusy("Reading the application")` while waiting for the first
  application control to render, exactly as `content.ts:1308-1315` does now —
  otherwise the card appears before Indeed has drawn the form and
  `captureJobMeta()` reads an empty page. `showBusy` would otherwise be orphaned
  by the deletion; this keeps it earning its place.

### Spec: two edits to `renderStartConfirm()`

1. **`content.ts:545-549`** — the second button is *"Not this one — go back"* and
   calls `history.back()`. That made sense when the extension had navigated the
   user here. After the downgrade **the user opened this page themselves**, and
   throwing them backwards is hostile. Change to **"Not now"**: hide the card,
   set `offeredFor`, leave the page alone.
2. **`content.ts:529`** — the subtitle *"Nothing has been filled in or clicked
   yet"* is still true and still good. Keep.

### Spec: promote the start button

Relabel `#aaui-start` (`content.ts:301`) from "↻ Rescan page" to **"Fill this
application"** and style it as the panel's primary green action, keeping the
existing grey-out-when-not-in-an-application behaviour and its tooltip
(`content.ts:1233-1241`). It already calls `startRun()`. Two ways in — the
auto-offer card and the always-visible button — one code path.

Reword the refusal at `content.ts:1274` to *"Open a job application first — I
fill the form that's in front of you."*

### What genuinely gets worse for the user

- **The results-list workflow is gone.** Working down 10 listings without
  retyping a search was the extension's speed story, and for someone who must
  log N activities a week that was the point. The tracker still counts; the
  extension just stops helping them find things to count. This is the real cost
  and it should be acknowledged, not spun.
- **Four Answer Template fields become dead** (`searchQuery`, `searchLocation`,
  `maxApplications`, `exclusionTitleRegex`). Users who filled them in lose
  nothing they were getting value from, but the removal is visible on the web
  app's template page.
- **A reload mid-application drops back to idle.** The `autoApply` stamp used to
  carry intent across navigations; without it a reload means pressing "Fill this
  application" again. Minor, and arguably more honest.
- **Nothing about the run itself degrades.** Fill → review → Continue → next page
  → stop at Submit is byte-for-byte the same code.

---

## 4. Permissions after the downgrade

Current: `storage`, `tabs`, `webNavigation`, `scripting`.

| Permission | Verdict | Why |
|---|---|---|
| `storage` | **KEEP** | Template, resume, `activeRun`, `pendingActivities`. Unavoidable. |
| `scripting` | **DROP** | The only `chrome.scripting` call in the entire codebase is `background.ts:237`, and it exists solely to inject `pressApplyInPage()` with `world: "MAIN"`. Rung 4 is its only reason to exist. Content scripts are declared in the manifest, not injected. |
| `tabs` | **DROP** | Grep says the only `chrome.tabs` uses are `sendMessage` (`background.ts:128, 131, 148`) and `onRemoved` (`:313`). Neither needs the `tabs` permission — `tabs.sendMessage` is gated on **host** permission for the target tab, which we have via `https://*.indeed.com/*`, and `onRemoved` yields only a tabId. This one was arguably never needed and can go today. |
| `webNavigation` | **KEEP** | `background.ts:327-328` feeds `nav-completed`, which is what moves a run from `advancing` to scanning the next page (`machine.ts:218-234`). That *is* rung 3. Removing it would break multi-page forms — particularly the SPA `onHistoryStateUpdated` route inside smartapply, which no content-script reload would catch. |

**Result: 4 permissions → 2.** `storage` and `webNavigation`.

Dropping `scripting` is the material win. `world: "MAIN"` injection into a
third-party site is precisely the pattern a Store reviewer stops on, and it is
the code that most plainly reads as "this extension operates the site". Its
justification block in `docs/store-submission.md` step 5 also currently
*misdescribes* it — it says `scripting` reads and fills form fields, which is
false; the content script does that. Deleting the permission deletes the
inaccuracy with it.

Host permissions are unchanged: `https://*.indeed.com/*` (the forms) and
`https://jobassistui.com/*` + `www` (the bridge). Localhost is already stripped
by `build.mjs --store`.

**Do not narrow the indeed.com content-script match pattern.** It is tempting —
the extension no longer needs to run on `/jobs` results pages. But on the iframe
route the top frame is still `/viewjob`, and Indeed rewrites job URLs
`/rc/clk → /viewjob → /?vjk=` as it goes. A narrow pattern would break the panel
on the exact route it needs to work on. Keep the broad match and say why in the
justification.

---

## 5. Does the original store description become true?

The original — `git show d95a000:docs/store-listing-description.md`, the text
actually pasted into the Store console — checked claim by claim against the
downgraded build:

| Claim | After the downgrade |
|---|---|
| "You search for jobs." | ✅ true |
| "You decide which one to open." | ✅ true |
| "You click Apply." | ✅ true — rung 4 gone |
| "does not find jobs" | ✅ true — rung 5 gone |
| "does not browse listings" | ✅ true — rung 6 gone |
| "does not choose anything on your behalf" | ⚠️ context-dependent, see below |
| "it activates on the application form that is already open on your screen, because you opened it" | ✅ true — and the new idle-offer card makes this literally what the code does |
| "It fills the fields it recognises **and then stops.**" | ❌ **still false** |
| "It never presses Submit." | ✅ true — guard intact |
| "There is no queue, no bulk mode" | ✅ true — the `JobQueue` interface that made this literally false is deleted |
| HOW IT WORKS step 2, "Find a job yourself on Indeed and open it. Click Apply." | ✅ true |
| PRIVACY, "reads the application form on the page in front of you in order to fill it" | ✅ true — and the sentence added 2026-09-02 about reading the search results page comes back out |
| `manifest.json` `description` (the one-line summary) | ✅ already accurate, unchanged |

**Eleven of thirteen become true. One is fine in context. One must be edited.**

### The one that must be edited

> "It fills the fields it recognises **and then stops.**"

Rung 3 is kept deliberately: the extension clicks Continue between pages. "Then
stops" reads as "then does nothing more", and a reviewer who watches it advance
a page sees the description contradicted. This sentence was **already wrong when
the package was submitted** — the downgrade does not create the problem, it just
leaves it standing.

Replace with:

> It fills the fields it recognises, and moves between the pages of a multi-step
> form. It never presses Submit.

Apply the same fix to HOW IT WORKS step 3.

### The one that is fine in context

"does not choose anything on your behalf" — strictly the extension still chooses
an *answer* per question from the template, and `findAdvanceDom()`
(`content.ts:2180-2203`) scores candidates to choose which button is Continue.
But the sentence sits inside a paragraph about listings, immediately followed by
"it activates on the application form that is already open on your screen", and
the next paragraph says outright that it fills fields. No reasonable reader takes
it as a claim about answer selection. **Keep the sentence, keep it in that
paragraph.** Do not hoist it into a standalone bullet, where it would over-claim.

### A bonus alignment

`apps/web/app/(app)/guided/page.tsx:121-122` already tells users *"open an Easy
Apply job on Indeed and click Apply. The form comes up already filled."* The live
website has been describing the downgraded behaviour all along. The downgrade
makes the extension match the site, not just the listing.

---

## 6. Order of operations

0. **Confirm the pending review's status.** Nothing ships until it resolves.
1. Land the in-flight `packages/automation` scout cleanup on `main` first, so the
   `indeed-search.ts` removal doesn't conflict with it. (As of this writing
   `scout.ts`, `captcha.ts`, `human.ts`, `indeed.ts` and `drivers/` are already
   gone; `providers/` remains.)
2. Branch `extension-downgrade` off `main`.
3. **Rung 4 first**, as its own commit: `background.ts`, `messages.ts`, the
   content IIFE, the four orphaned helpers, the `autoApply` storage key.
   `npm run typecheck` in `apps/extension`. This commit alone earns the
   `scripting` drop.
4. **Rungs 5 + 6**, as their own commit: search, queue, storage keys,
   `indeed-search.ts` and its two export sites. Typecheck.
5. **New idle-offer code** + the `renderStartConfirm` edits + the start-button
   promotion + copy rewording. Typecheck.
6. `manifest.json`: drop `tabs` and `scripting`, bump `version` to `1.0.1`.
7. `node build.mjs` and **live-test on a real Indeed Easy Apply flow — both
   routes.** Navigate-to-smartapply and iframe-over-viewjob. Confirm: the offer
   card appears unprompted; Continue advances pages; the run stops on the Submit
   page with the "press it yourself" message; the log confirm fires after a real
   submit. This is the expensive step and it cannot be skipped — the entry-point
   detection is the only genuinely new logic in the change.
8. `packages/shared` + `apps/web` template-field cleanup. Deploy is automatic on
   push to `main`, so hold this on the branch too.
9. Docs, last: restore `docs/store-listing-description.md` toward the original
   text with the "and then stops" fix; update `docs/store-submission.md` step 5
   (delete the `tabs` and `scripting` justification blocks) and step 7 (the test
   instructions still work as written — "Fill this application" remains the
   control's name — but re-count the 500 characters if touched).
10. **Hold the branch.** Upload only after the current review resolves.

---

## 7. Data / migration impact

**None. No Supabase migration, by hand or otherwise.**

- The answer template is stored as a JSON blob. Dropping four fields from
  `TEMPLATE_FIELDS` leaves stale keys in existing rows that nothing reads. No
  schema change, no backfill, no data loss for anything still in use.
- `packages/db` is not touched. `0005_assistant.sql` — still unapplied per
  `HANDOFF.md` — is unrelated to this change and unaffected by it either way.
- `chrome.storage.local` has no migrations, which is why `background.ts`
  `onInstalled` should explicitly remove `jobQueue`, `autoBrowse` and
  `autoApply` (§2). Without that, an upgrading user keeps a scraped job list on
  disk that nothing will ever read or clear.
- **No auth-email path is touched.** No Resend call, no Supabase template, no
  new mail of any kind. Sign-in-code deliverability on `jobassistui.com` is not
  at risk from this change.

---

## 8. Hours

One solo developer with an AI assistant. Honest, not optimistic.

| Work | Hours |
|---|---|
| Rung 4 deletion + typecheck | 1.5 |
| Rungs 5 & 6 deletion, incl. `indeed-search.ts` and its export sites | 2.0 |
| New idle-offer watcher, `renderStartConfirm` edits, button promotion, copy | 3.0 |
| Manifest permissions + version bump | 0.25 |
| `packages/shared` + `apps/web` dead template fields | 1.0 |
| Build + **live test on a real Easy Apply flow, both routes** | 4.0 |
| Docs: store description, submission steps, permission justifications | 1.5 |
| **Total** | **13.25** |

**Call it 12–16 hours — two working days.** The deletions are genuinely easy;
grep proves every orphaned helper has exactly one caller and the state machine
does not move. The variance is all in step 7. Testing against Indeed means
finding a live Easy Apply listing, going through a real multi-page flow without
submitting, and doing it twice for the two routes Indeed uses. That has
historically been where this codebase's surprises live — the 2026-08-29 stale
content-script episode cost two debugging rounds on its own.

If the entry-point detection misbehaves on the iframe route, add 3 hours.

---

## 9. Risks

- **The idle-offer card is the only new logic**, and it runs on a timer against a
  third-party SPA. Failure mode is a card that appears twice, or not at all, on
  the iframe route. Mitigated by reusing the already-battle-tested
  `isApplyContext()` and by the `offeredFor` guard. Test it, don't reason about
  it.
- **The Indeed question is reduced, not eliminated.** Rung 3 — clicking Continue
  — remains, and Indeed prohibits automating the apply *process*, not only the
  final submit. This downgrade removes the two most visible offences (pressing
  Apply, scraping results) and cuts the permissions that advertise them. It does
  not make the terms question disappear. The fill-only build from 2026-08-29
  remains in git history if a rejection names Indeed specifically; that decision
  was made deliberately and is not reopened here.
- **Deleting `indeed-search.ts` is one-way in the working tree** but trivially
  recoverable from git. It has no other consumer.
- **Do not do this and the automation cleanup in the same commit.** Two people's
  deletions landing on the same package at once is how a typecheck break gets
  blamed on the wrong change.

---

## 10. Rollback

Every part of this is a deletion plus ~70 lines of new content-script code, on a
branch, in six commits. There is nothing to roll back at the infrastructure
layer.

- **Before merge:** delete the branch.
- **After merge, before a Store upload:** `git revert` the commit range. Nothing
  external has changed — no schema, no Vercel env, no Stripe, no Supabase, no
  Store listing. The web app deploy from step 8 reverts with it and restores the
  four template fields; users' stored values were never deleted, so they
  reappear.
- **After a Store upload (later, deliberately):** the Store keeps prior versions.
  Roll back by re-uploading the 1.0.0 package, `apps/extension/jobassistui-store.zip`,
  which is committed. That is a new review, so it is slow — which is exactly why
  step 7's live test is not optional.
- **Storage keys:** if the `onInstalled` cleanup has already run on a user's
  machine, reverting restores the code that reads `jobQueue`/`autoBrowse`/
  `autoApply`, and `getItem` falls back to the `DEFAULTS` in `storage.ts:112-122`.
  The user's queue is empty rather than stale. No crash, no repair needed.

---

## 11. Open questions for the owner

1. **The four dead template fields** — remove them from the Answer Template page,
   or leave them visible and inert? Removing is cleaner and I've costed it that
   way. Leaving them means the page keeps asking for a search query the product
   no longer uses, which is its own small dishonesty.
2. **Is losing the results list acceptable?** It is the one capability real users
   would notice. The ladder says remove it, so the design removes it — but the
   owner should hear the cost stated once: this makes the extension slower to use
   for the exact person it is aimed at.
3. **Ship 1.0.1 at all, or wait for the 1.0.0 verdict first?** My recommendation:
   build and test it now while the reasoning is fresh, hold the branch, and let
   the review outcome decide whether it ships as a voluntary correction or as the
   response to a rejection.
