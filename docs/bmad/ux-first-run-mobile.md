# First-run on a phone, inside Facebook's browser

Sally (UX) — 2026-09-02. Code review only; nothing was run on a device.

## The person

She taps a link in a Facebook comment. Facebook opens it in its own in-app
browser (WKWebView on iPhone, a Custom Tab or WebView on Android). She is
mid-claim, on a ~390px screen, one thumb, probably standing up. She has never
heard of this site. If a screen looks broken she closes it and goes back to the
comment thread, and there is no second chance.

Everything below is judged from inside that browser. Findings are ordered by how
many people hit them, not by how bad they look.

Facebook's browser is not Safari. It has no download manager on iOS. It can be
torn down and reloaded when you leave the app. It has no address bar to type in.
`window.open` and popups are unreliable. Every one of those matters here.

---

# Tier 1 — these lose the user

## 1. The sign-in code screen can vanish while she is reading the email

**File:** `apps/web/components/LoginForm.tsx`
**Who hits it:** everyone. It is the only door.

The flow is: type email → tap "Email me a sign-in code" → the component swaps to
a "Check your email" panel with the code box. That panel exists only in React
state (`status === "sent"`, plus `email` in `useState`). Nothing is persisted.

Now she leaves Facebook to open Mail. When she comes back, one of three things
happened:

- the webview is still alive — fine;
- Facebook reloaded the page under memory pressure — the state is gone;
- she closed the browser sheet to get out of Facebook and re-tapped the link —
  the state is gone.

When it is gone she is on the plain email form again. She has a valid six-digit
code in her hand and **no box to type it into**. Worse, `email` is gone too, so
even if there were a box, `verifyOtp` could not run — it needs the address.

There is no fallback. `docs/email/otp-code.html` deliberately contains no magic
link ("there is nothing you need to click to sign in"), so tapping something in
the email is not a way back in either.

What she actually does: retypes her email, requests a second code, and now has
two codes and no idea which one works. Supabase rate-limits resends, so she may
also get an error for her trouble.

**Smallest fix.** Persist the two values and rehydrate on mount:

- on successful send, `sessionStorage.setItem("jaui.otp", JSON.stringify({email}))`
- in a mount effect, if that key exists, start in `status === "sent"` with the
  email restored
- clear it after a successful `verifyOtp`

Ten lines in `LoginForm.tsx`. Use `localStorage` rather than `sessionStorage` if
you want it to survive Facebook killing the webview outright, and expire it
after an hour to match the code.

**Second, separate fix worth doing at the same time:** put the magic link back in
the email as a secondary option ("or tap here"). `apps/web/app/auth/callback/route.ts`
already handles it correctly. A link opens in the real browser (Safari/Chrome),
which is where you would rather she ended up anyway. Right now the code is the
only path, so when the code path breaks, everything breaks.

## 2. iOS zooms the page in on the very first tap and never zooms back

**Files:** `apps/web/components/LoginForm.tsx` (line 150), and the shared
`inputClass` in `apps/web/app/(app)/log/new/page.tsx` (line 15) and
`apps/web/app/(app)/settings/page.tsx` (every input)
**Who hits it:** every iPhone user. That is most of them.

Every text input is `text-sm` — 14px. iOS Safari and every WKWebView auto-zoom
the page when you focus an input below 16px, and they do not zoom back out when
you blur it. Next.js emits the default `width=device-width, initial-scale=1`
viewport (there is no `viewport` export anywhere in `apps/web`), and no
`maximum-scale` to suppress it — which is correct for accessibility, so the fix
belongs in the CSS.

The first input she ever touches is the email field on `/login`. She taps it,
the page jumps to roughly 130% zoom, and the "Email me a sign-in code" button is
now partly off the right edge. She then has to pinch back out, on a form, before
she has any reason to trust this site.

It then happens again on the employer field, the notes field, and every settings
field.

**Smallest fix.** Make inputs 16px on small screens. Either change `text-sm` to
`text-base sm:text-sm` in the three input class strings, or once globally in
`apps/web/app/globals.css`:

```css
@media (max-width: 640px) {
  input, select, textarea { font-size: 16px; }
}
```

The code box is already `text-lg`, so that one is fine. Nothing else is.

## 3. The activity log is clipped off the right edge, with no way to scroll to it

**File:** `apps/web/app/(app)/dashboard/page.tsx` line 147
**Who hits it:** everyone, from their second visit onward. This is the product's
main screen.

```
<div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
  <table className="w-full text-sm">
```

Six columns — Date, Employer, Method, Result, Evidence, delete — and four of
them are `whitespace-nowrap`. Minimum content width is somewhere around 550px.
Available width inside `main`'s `px-6` on a 390px screen is 342px.

`overflow-hidden` is the problem word. The table cannot shrink below its
minimum, so it overflows the wrapper, and the wrapper **clips** it. There is no
horizontal scroll to recover it. Roughly the last 200px of every row — Evidence
and Delete, and usually most of Result — is drawn and then hidden, permanently.

So on a phone: she cannot see whether her evidence attached, and she cannot
delete a mistake. The "Export PDF / Export CSV" links above the table survive,
but the log itself does not.

**Smallest fix.** One word: `overflow-hidden` → `overflow-x-auto`. That gets the
columns back behind a sideways swipe, which is not good but is not broken.

**The fix that is actually right,** and it is not much more work: render a card
list under `sm:` and the table from `sm:` up. Each card is employer + title on
one line, date + method + result as a small grey line under it, and evidence and
delete as two tappable items on a third line. Same data, no sideways swipe, and
tap targets you can hit.

## 4. Attaching a screenshot fails, and takes the whole form with it

**Files:** `apps/web/next.config.js`, `apps/web/app/(app)/log/new/actions.ts`
**Who hits it:** everyone who does the one step the roadmap already predicted
would break.

The upload goes through a Next.js server action. `next.config.js` sets no
`experimental.serverActions.bodySizeLimit`, so the default applies: **1 MB**.

An iPhone screenshot is commonly 300 KB to 1.5 MB. A photo taken with the camera
— which `accept="image/*"` also offers as "Take Photo" — is 2 to 5 MB. So a real
share of these uploads exceed the limit before they reach any of your code.

What she sees when it fails: `apps/web/app/error.tsx`, the full-page "Something
went wrong". Not a message on the field. And because it is a full page swap,
**every field she typed is gone** — employer, job title, notes, all of it. She
has to start the activity over, and she has no idea the photo was the cause.

The same wipe happens for any thrown error in `createEntry` (line 58 for the
upload, line 80 for the insert).

**Smallest fix,** two parts:

1. Raise the limit in `next.config.js`:
   ```js
   experimental: { serverActions: { bodySizeLimit: "10mb" } }
   ```
2. Tell her before she submits. Add a client-side `onChange` check on the file
   input that reads `file.size` and shows "That image is too large — try a
   screenshot rather than a photo" inline, with the Save button still working
   without the attachment. This costs one small client component and means the
   failure never reaches the server.

Longer term, `createEntry` should return an error object rather than throwing,
so a failure re-renders the form with the values intact. That is the real fix
for losing typed data, but it is a bigger change than the two above.

## 5. "Export PDF" is a dead tap in Facebook's browser

**Files:** `apps/web/app/export/pdf/route.ts` line 210,
`apps/web/app/export/csv/route.ts` line 19
**Who hits it:** everyone who reaches the payoff. This is the thing the landing
page promises.

Both routes send `Content-Disposition: attachment`. Facebook's in-app browser on
iOS is a WKWebView with no download handling — an `attachment` response
typically does nothing at all. No file, no error, no sheet. She taps "Export
PDF" and the screen does not change. On Android the Facebook WebView blocks or
silently drops downloads too, depending on version.

She has done all the work of logging her week and the button that produces the
proof appears to be broken.

**Smallest fix.** For the PDF, switch to `inline`:

```
"Content-Disposition": `inline; filename="job-search-log-${period}.pdf"`
```

An inline PDF renders inside the webview, and from there iOS gives her the share
sheet, and Facebook's `···` menu gives her "Open in Safari". That turns a dead
tap into a visible document.

CSV cannot render inline, so leave it as `attachment` and stop leading with it
on mobile — PDF is what an agency wants anyway.

**Also worth half an hour:** detect the in-app browser (user-agent contains
`FBAN`, `FBAV`, or `Instagram`) and show one line above the export links —
"Downloading works best in Safari/Chrome — tap ··· then Open in browser." That
one sentence probably saves more exports than any code change, and it applies to
the whole site, not just exports.

## 6. Half the first screen is navigation, and the first thing she reads is an ad for a Chrome extension

**Files:** `apps/web/app/(app)/layout.tsx`, `apps/web/components/GuidedPitch.tsx`,
`apps/web/components/BetaBar.tsx`, `apps/web/components/FreePeriodBanner.tsx`
**Who hits it:** everyone, on the screen right after they finish onboarding.

Stack it up at 390px wide:

- `FreePeriodBanner` — centred `text-sm`, wraps to about 3 lines (~60px)
- the header — logo + Beta badge + **seven** nav links + Sign out, all
  `flex-wrap`. They will not fit on one row or two. Expect four wrapped rows,
  around 180px
- `BetaBar` — badge + two sentences + a dismiss ✕, about 3 lines (~66px)

That is roughly 300px of chrome. Facebook's browser leaves about 700px of
viewport on a typical iPhone. So **more than 40% of the screen is used up before
the page begins.**

Then the dashboard starts: h1 + subtitle, the `0/3 this week` badge and the
Add activity button, and then — before the empty state — `GuidedPitch`. On a
phone that card is around 180px tall.

The "No activities logged yet / Log your first activity" box lands somewhere
around 600px down. **It is below the fold on the first screen she ever sees.**
What is above the fold is a pricing banner, a wall of nav links, a beta apology,
and a pitch for a Chrome extension.

**Smallest fixes, in order of payoff:**

1. **Hide `GuidedPitch` on phones.** Add `hidden sm:block` to its wrapper div
   (`GuidedPitch.tsx` line 25). See finding 7 — it is not just misplaced there,
   it is unusable there.
2. **Collapse the nav under `sm:`.** The seven links become the two that matter —
   Activity Log and Add Activity — with the rest behind a menu, or simply
   `hidden sm:flex` on the `<nav>` plus a bottom bar with those two. Cheapest
   version: `hidden sm:inline` on Answer Template, Guided Assist, Billing and
   Feedback, leaving four links that fit on one row.
3. **Shorten the two banners on mobile.** `FreePeriodBanner` can be "Your log is
   free forever — no card." under `sm:`, with the Guided sentence `hidden
   sm:inline`. It stays a disclosure, it just stops eating three lines.

## 7. On a phone, the top card sells something phones cannot run

**File:** `apps/web/components/GuidedPitch.tsx`
**Who hits it:** every mobile user, on every dashboard view, forever.

The card hides when `useExtensionInstalled()` returns `true`. On a phone a Chrome
extension can never be installed, so it returns `false` every time, and the
pitch shows every time. The card even admits it: "Chrome extension, on a
computer."

The comment in the file explains the reasoning well for desktop — do not stop
pitching autofill to the person hand-logging applications — and that reasoning is
right. It just does not survive contact with a device that cannot install it.
Right now the most prominent element on a phone dashboard is an offer she cannot
accept, sitting above the thing she came to do.

**Smallest fix.** `hidden sm:block` on the outer div. It keeps every bit of the
desktop behaviour and costs nothing.

---

# Tier 2 — these cost you some people, or make the product feel unfinished

## 8. `min-h-screen` on the login page can push the button out of sight

**File:** `apps/web/app/login/page.tsx` line 7

`min-h-screen` is `100vh`, which in a mobile browser means the viewport *without*
the browser bars — taller than what she can actually see. The page is
`flex ... justify-center`, so the content is centred in a box bigger than the
screen, and the "Email me a sign-in code" button can start below the fold on a
short phone.

**Fix:** `min-h-[100svh]` (Tailwind 3.4 supports it) on `login/page.tsx` and
`error.tsx`.

## 9. The landing page header is too wide for 390px

**File:** `apps/web/app/page.tsx` lines 15–38

`flex items-center justify-between` with no `flex-wrap`. Logo + Beta badge on the
left, then "How it works", "Pricing", and the Sign in button on the right. Add
it up at 390px and it is over budget by roughly 40–50px, so flex will squeeze the
items and wrap words inside them — "How it works" on two lines, a cramped Sign in
button.

This is the first thing anyone sees, on the page you are pasting into Facebook.

**Fix:** hide the two anchor links under `sm:` — `hidden sm:inline` on "How it
works" and "Pricing". They are jump links to sections she will scroll past
anyway. That leaves logo + Sign in, which fits comfortably.

## 10. The add-activity form shows eight fields when one is required

**File:** `apps/web/app/(app)/log/new/page.tsx`

Actual minimum to log an activity: **employer name.** Date defaults to today,
Method defaults to Online, Result defaults to Applied. So the shortest path is
already good — tap "Add activity", tap employer, type, tap Save. Four taps.

But she does not know that. She sees Date, Method, Employer, Job title, Listing
URL, Result, Notes, Evidence — eight fields, a full screen and a half of
scrolling — and on a phone that reads as a form, which is a thing people put off.
Three are marked "(optional)"; Result and Method are not, and look required.

**Smallest fix.** Put Job title, Listing URL, Notes and Evidence inside a
`<details>` labelled "Add more detail (optional)". The visible form becomes
Date · Method / Employer / Result / Save — four things, one screen, no scroll.
Everything still submits the same way, since `<details>` does not remove the
inputs from the form.

## 11. Onboarding: two squashed columns and a 16px checkbox

**File:** `apps/web/app/(app)/settings/page.tsx` lines 84–148

This is the first screen after sign-in, so it matters more than a settings page
normally would.

- `grid grid-cols-2` puts "Weekly activity requirement" and "Reporting week
  starts on" in ~155px columns. Both labels wrap to two or three lines and the
  two fields no longer line up. **Fix:** `grid-cols-1 sm:grid-cols-2`.
- The disclaimer checkbox is a bare `<input type="checkbox">` — about 16px, well
  under the 44px minimum tap target, and it is `required`, so missing it blocks
  submission with a native tooltip pointing at something she can barely see. The
  whole thing is wrapped in a `<label>`, so tapping the text works — but nothing
  tells her that. **Fix:** add `className="mt-0.5 h-5 w-5 shrink-0"` and put the
  block behind an obvious tap area.
- Onboarding renders inside `(app)/layout.tsx`, so it carries the full seven-link
  nav — the nav for an app she has not started using yet. **Fix:** with finding
  6.2 done, this solves itself.

## 12. No manifest, no home-screen icon

**Files:** none exist. `apps/web/app/icon.svg` is the only icon.

Confirmed: no `manifest.json`, no `manifest` in the metadata export, no
`appleWebApp`, no `themeColor`, no `apple-touch-icon`, no 192/512 PNG anywhere in
`apps/web`.

The roadmap calls add-to-home-screen "the cheapest more-than-a-website that
exists" and it is right. It is also cheaper than the roadmap's half-day estimate.

**Actual cost: about an hour.**

1. `apps/web/app/manifest.ts` — Next.js App Router generates `/manifest.webmanifest`
   from a single exported function. Name, short name `JobAssistUI`,
   `start_url: "/dashboard"`, `display: "standalone"`, `background_color` and
   `theme_color: "#2563eb"`, and the two icon sizes.
2. Two PNGs in `apps/web/public` — 192 and 512 — rendered from the existing
   `icon.svg`. That blue rounded square with a checkmark is already a decent
   mark.
3. `apple-touch-icon.png` at 180×180 in `apps/web/public`. **This is the one that
   actually matters.** iOS ignores the manifest for Add to Home Screen and
   ignores SVG icons. Without this PNG, "Add to Home Screen" gives her a
   screenshot of the page as her icon, which looks broken. With it she gets the
   blue check next to the state's own app, which is exactly the outcome you want.
4. Add `themeColor` to the metadata export in `app/layout.tsx` so the browser
   chrome matches.

One caveat: **Facebook's in-app browser has no Add to Home Screen.** She has to
be in Safari or Chrome first. So the manifest only pays off *after* the "open in
your browser" nudge from finding 5 — do that one first, and consider a small
one-time "Add this to your home screen" hint on the dashboard for users who are
in a real browser.

## 13. The code box says eight digits and the code is six

**File:** `apps/web/components/LoginForm.tsx` line 116

`placeholder="12345678"` — eight characters. `docs/email/README.md` and
`docs/email/otp-code.html` both confirm the code is six digits, and the submit
button correctly unlocks at six. So the placeholder tells her she is two digits
short of a code that is already complete.

Small, but it lands at the single highest-anxiety moment in the whole funnel.

**Fix:** `placeholder="123456"`, and add `maxLength={6}` while you are there.

## 14. Small stuff, once the above is done

- **`apps/web/app/(app)/dashboard/page.tsx` line 26** — Delete is
  `text-xs text-slate-400 hover:text-red-600`. Hover does nothing on a phone, so
  it stays pale grey, and 12px text is a poor tap target. Make it a proper
  bordered button in the mobile card layout.
- **`apps/web/app/(app)/dashboard/page.tsx` lines 133/139** — one `Export PDF`
  and one `Export CSV` link per week, both `text-xs`, sitting side by side about
  12px apart. Two small targets close together is the classic mis-tap. Make PDF
  a real button on mobile and demote CSV.
- **`target="_blank"`** on "View listing" (line 178) and "View" evidence (line
  205). In Facebook's browser this opens a second in-app tab with no obvious way
  back to yours. Not worth changing on its own, but do not add more.
- **No sticky Add-activity affordance.** Once she has three weeks of entries, the
  only "+ Add activity" button is at the very top. A fixed bottom-right button
  under `sm:` is cheap and it is the action you most want repeated.
- **`e.date` is rendered raw** (line 163) as `2026-09-02`. Fine in a table,
  worth formatting as `Sep 2` in the mobile card layout.

---

# What to do, in order

Roughly a day's work for the first four, and they are the ones standing between
this and a first user.

1. `LoginForm.tsx` — persist email + sent state (finding 1). Nothing else matters
   if she cannot get in.
2. Global 16px inputs on mobile (finding 2). One CSS rule.
3. `dashboard/page.tsx` — `overflow-x-auto` now, card layout this week (finding 3).
4. `next.config.js` body limit + a client-side size check (finding 4).
5. PDF `inline` + the "open in your browser" line (finding 5).
6. `hidden sm:block` on `GuidedPitch`, trim the mobile nav and banners (6, 7).
7. Then the manifest and the apple-touch-icon (finding 12).

And the roadmap is right that none of this substitutes for opening the site on a
real phone from a Facebook message. Everything here is read off the code; the
things that only show up on a device — how the date picker feels, whether the
keyboard covers the Save button, how the state dropdown behaves — are still
unknown.
