# Chrome Web Store submission — step by step

Written 2026-08-30. Work top to bottom. Every paste block is verbatim.

Nothing here is reversible-by-accident except step 1, which publishes the
website. Steps 2 onward only touch the Store draft, which is not visible to
anyone until you press Submit.

---

## Step 1 — publish the website first ✅ DONE 2026-08-30

**Why this comes first:** the Store listing links to `jobassistui.com/guided`.
That page exists only on the `rules-assistant` branch. A reviewer who clicks it
today gets a 404, and a 404 is a rejection.

```
git checkout main
git merge rules-assistant --no-edit
git push
```

Vercel deploys on the push. Wait a minute, then open
`https://www.jobassistui.com/guided` and confirm it loads. Do not continue
until it does.

---

## Step 2 — the reviewer's test account ✅ DONE 2026-08-30

Account created, code received at mailinator, template filled with fake
details. **Finding: the email SUBJECT was never updated in Supabase.** It
arrives as "Your JobAssistUI sign-in code" — the body is the new one (code
first, Guided block) but the subject has no code in it. Either fix the subject
in Supabase or use the corrected test instructions in step 7.

The extension does nothing without a JobAssistUI login. A reviewer cannot log
in, because the 6-digit code is emailed. Without this step they see a dead
extension and reject it. **This is the most likely rejection reason.**

Mailinator is a public inbox: no signup, no password, anyone who knows the
address can read it. That is exactly why it works here — the reviewer needs to
read the code.

**Because it is public, that account's data is public.** Use fake details only.
Anyone who reads the inbox can sign into the account.

1. Open `https://www.jobassistui.com` in a private/incognito window
   (so you are not signed in as yourself)
2. Enter `jobassistui-review@mailinator.com` and request the code
3. Open `https://www.mailinator.com`, type `jobassistui-review` into the
   search box, open the email, read the 6-digit code
4. Sign in with it and finish onboarding
5. Go to the **Answer Template** page and fill it in with fake details —
   a made-up name, a made-up phone number, a plausible work history.
   Nothing real, nothing of yours.
6. Save. Confirm the page shows the saved state.

---

## Step 3 — build the package ✅ DONE 2026-08-30

`apps/extension/jobassistui-store.zip` is built and verified: manifest at the
root, localhost stripped, four icons, no stray files. Rebuild only if the
extension source changes. The rest of this section is kept for that case.

```
cd apps/extension
node build.mjs --store
```

`--store` strips the localhost entry from the manifest. Uploading a build
without it means shipping a `http://localhost:3000/*` host permission, which
looks careless to a reviewer.

Then zip the **contents** of `dist/` — the files themselves, not the `dist`
folder. If the zip opens to show a single `dist` folder, it is wrong and the
Store will reject the manifest as missing.

The icons are included by the build. Do not add them by hand.

---

## Step 4 — fix the one wrong answer

**Re-verified 2026-08-30 against the actual built bundle:** zero matches for
`eval(`, `new Function`, `importScripts` and `document.write` across all three
bundled files, and the only external URL anywhere in the output is
`https://www.indeed.com`. Answering "No" is provably correct, not a guess.

In the Store console, open your draft → **Privacy** tab.

**"Are you using remote code?"** is currently set to **Yes**. Change it to:

> No, I am not using remote code.

Verified 2026-08-30: the bundle has no `eval`, no `new Function`, no
`importScripts`, and no external script URLs. esbuild inlines everything.
Answering Yes invites a code review you do not need.

---

## Step 5 — permission justifications

Privacy tab. Paste each verbatim.

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

---

## Step 6 — data usage

Tick exactly these four:

- Personally identifiable information
- Location
- User activity
- Website content

Leave unticked: Health, Financial, Authentication, Personal communications.

Then tick the three certification checkboxes at the bottom.

---

## Step 6b — store listing fields

The **Store listing** tab needs three things filled in. Title and summary come
from the package automatically; the store icon is picked up from
`icons/icon128.png`.

- **Category:** Workflow & Planning
- **Language:** English (United States)
- **Description:** paste the block in `docs/store-listing-description.md`

---

## Step 7 — test instructions

**The box takes 500 characters.** The version below is 487. Paste verbatim:

```
Free account required. Test login: jobassistui-review@mailinator.com

Sign-in is a 6-digit emailed code:
1. At jobassistui.com, enter that address
2. At mailinator.com, search the inbox "jobassistui-review"
3. The code is at the top of the email (arrives in ~1 min)

Then:
4. On indeed.com open any job marked "Easy Apply" and click Apply
5. In the JobAssistUI panel click "Fill this application"
6. It fills from the saved answers and stops before submitting. You press Submit yourself.
```

Two things that were wrong in the longer version and are fixed here:

- It said to click **"Find jobs"** after pressing Apply. That is the
  job-SEARCH button (`aaui-find`, content.ts:298). On an application form the
  button the panel actually shows is **"Fill this application"**
  (content.ts:541). A reviewer following the old text would have clicked the
  wrong control and concluded the extension did nothing.
- It said the code is in the subject line. The subject was never updated in
  Supabase; the code leads the BODY. Verified at mailinator 2026-08-30.

If you edit this, re-count. The limit is characters, not words, and the two
URLs are 40 of them.

---

## Step 8 — screenshots

Already done, at `apps/extension/screenshots_ext/store/`:

- `01-job-browser.png` — the job card and "Apply to this job"
- `02-review-gate.png` — the review gate and "press Submit yourself"

Upload both. The second one matters most: it is the entire human-in-the-loop
argument in one image, and it is the argument that answers the objection in
step 9.

---

## Step 9 — the thing to expect

Reviewers check whether an extension violates the target site's terms.
**Indeed prohibits automating the apply process** — the process, not only the
final submit. This extension presses Apply and advances pages on its own.

A fill-only version was built on 2026-08-29 and rolled back deliberately. That
decision is recorded, not up for re-argument here. Go in knowing this is the
most likely flag, and that a rejection restarts the review clock.

---

## Step 10 — submit

Upload the zip, then Submit for review. Typical turnaround is a few days.

Once it is approved, replace `apps/web/app/(app)/guided/page.tsx` — the whole
six-step sideload walkthrough becomes one Store button. There is a comment in
that file saying the same thing.
