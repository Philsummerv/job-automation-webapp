# Stage B (browser extension) — status & handoff

_Updated 2026-07-18. All of Stage B is merged to `main` and the web app is
deployed on Vercel (`https://job-automation-webapp-web.vercel.app`)._

The extension (`apps/extension`) is the guided, human-in-the-loop autofill
assistant. It runs in the user's own Chrome on real job-site tabs and is the
"hands" of the web app (`apps/web`) — the "brain" that holds the account,
billing, and answer template. A web page can't fill forms on `indeed.com`
(same-origin), so the extension is the delivery mechanism, not a separate
product. The DOM scraper (`packages/automation/src/forms.ts`) is shared with the
Playwright scout: one implementation, two runtimes.

---

## What ships today (verified end-to-end on Indeed smartapply)

- **Guided run**: Start run → per-page scan → fill from the user's template →
  review gate → advance → repeat, to "application submitted". No auto-submit.
- **Review gate**: each question in its **native control** (text / checkbox /
  radio / native select / ARIA combobox), reflecting the real form; editing a
  control writes back to the real form. Page-level **Looks right → Continue**,
  **Pause → Resume** (edit here or on the page), **Stop**.
- **Answer template**: edited in the web app (`/template`, saved to
  `profiles.answer_template`), synced to the extension via the bridge; the local
  `⚙ Template` editor is an offline fallback. Standard fields + custom
  "if question contains X, answer Y" rules. Intent-aware option matching
  (`scoreOption`) so plain answers like "none" / "prefer not to answer" land on
  the right option.
- **Auth / entitlement gate**: runs are gated on the user's web-app sign-in +
  subscription (or comped), cached from the bridge.
- **Compliance logging**: after a completed application, a user-confirmed
  (editable) card logs it to `activity_log` (source `guided`) — queued in the
  extension, flushed to the web app by the bridge.

---

## Architecture

```
apps/extension/src/
  background.ts   service worker = run controller. Serialized dispatch:
                  rehydrate activeRun from storage.local → reduce() → persist →
                  run effects (tabs.sendMessage commands, no-form timeout,
                  confirm-log). webNavigation → nav-completed. Gates start-run on
                  cached entitlement; owns the pending-activities queue.
  content.ts      the on-page panel + executor. Scan/fill/advance on worker
                  command; renders the review gate, template editor, and the
                  post-submit log-confirmation card. Guards "Extension context
                  invalidated" after a reload.
  web-bridge.ts   content script on the WEB-APP origin. Same-origin fetches to
                  /api/extension/{session,template} (login cookies flow) → relays
                  auth-status + template-sync to the worker; flushes queued
                  activities to /api/extension/activity.
  messages.ts     typed discriminated-union wire protocol + sendToWorker.
  storage.ts      typed chrome.storage.local wrapper (StorageSchema).
  state/
    types.ts      RunState, Action union, Effect descriptors (no chrome import).
    machine.ts    pure reduce(state, action) → { state, effects }.

apps/web/app/api/extension/{session,template,activity}/route.ts
                  cookie-authed endpoints the bridge calls same-origin.
apps/web/app/(app)/template/                the web-app template editor page.
packages/automation/src/forms.ts           the SHARED DOM scraper.
```

The service worker is the single source of truth for run state (MV3 kills it
after ~30s idle, and content-script globals are wiped on every navigation), so
it holds no in-memory state and rehydrates from storage on every message.

---

## Gaps closed 2026-08-08

All four items below were code-complete and type-checked together;
**none has yet been exercised against a live Indeed form** — that run is the
next manual step.

- **Verify-after-settle.** `fillFieldDom` used to read `el.value` on the same
  tick it wrote it, so a React re-render could discard the value while the log
  still said the fill succeeded. Fills now re-read through `stickValue()` after
  two animation frames plus a short delay, re-apply once if the value is gone,
  and only then report. Text, textarea and `<select>` all route through it.
  Radio/checkbox re-read after `settled()` but deliberately never re-click —
  a second click would toggle the answer back off.
- **Resume upload via DataTransfer.** `input.files` is read-only, so the resume
  is attached by building a `DataTransfer`, adding a `File`, assigning its
  `FileList`, then firing `change`. The user picks their resume once via the new
  **📄 Resume** panel button; it's held base64-encoded in `chrome.storage.local`
  (4MB cap, chunked encode — spreading megabytes into `fromCharCode` blows the
  stack). `attachResumeDom` runs as its own pass after the question loop, since
  file inputs aren't scraped as questions, and returns null when the page has no
  eligible input (the normal case, so it stays quiet). Hidden inputs are
  eligible on purpose — sites hide the real input behind a styled label.
- **Checkbox path reconciled.** `forms.ts fillFormField` understood only numeric
  indices for checkboxes, so every templated Yes/No that landed on one of
  Indeed's checkbox *pairs* was silently skipped. It now mirrors the radio
  branch's `__RADIO:` keyword resolution and gained the same
  already-checked guard the extension has (via `isChecked`).
- **Job-metadata selectors widened.** `captureJobMeta` picks up
  `jobsearch-JobInfoHeader-title`, `inlineHeader-companyName`, `[data-company-name]`,
  bare `h1`, and `og:title`, then falls back to parsing `document.title`
  ("&lt;job&gt; - &lt;company&gt; - Indeed.com"), which survives on smartapply pages where
  the header markup is gone.

**Known limitation:** the resume lives in `chrome.storage.local`, so it is
per-browser and does not sync from the web app the way the answer template
does. Deliberate — it avoids building resume storage, an upload UI, and a
bytes-over-the-bridge path. Revisit if users hit it.

## Known gaps / next candidates

- **Product-vision** (see memory `project_guided_template_ux`): multi-board
  (Glassdoor / ZipRecruiter / LinkedIn / Handshake) via per-board config;
  "Easy Apply only" vs "apply-on-site" run filter; possible embedded/streamed
  browser (Browserbase) as an alternate delivery — the scraper / state machine /
  review gate are reusable across both. Note LinkedIn specifically was weighed
  and **deferred** on 2026-08-08: its User Agreement prohibits automated access
  and account restrictions would fall on users.
- **Chrome Web Store listing** — the remaining ship blocker. Screenshots, a
  description, and the privacy disclosure (point it at `/privacy`).

### Gotchas
- Relocation "Yes/No" on Indeed is a **checkbox pair**, not a radio.
- Do NOT dispatch `input`+`change` after a `.click()` on a checkbox/radio — the
  native click already fires React's onChange; re-dispatching double-fires and
  reverts. Fill uses an idempotency guard only.
- After reloading the extension, **also reload the page** — the stale content
  script shows a "reload this page" notice instead of throwing.
- `input.files` cannot be assigned directly; a `DataTransfer`'s `FileList` is
  the only programmatic path, and `change` must be fired manually after.
- Never verify a React-controlled fill on the same tick you wrote it — the
  commit is async, so a same-tick read reports success on values that get
  reverted a frame later.

---

## Build & test

```bash
cd apps/extension && npm run build   # tsc --noEmit gate, then esbuild → dist/
```

Load `apps/extension/dist` unpacked at `chrome://extensions`. Open the
service-worker console to watch logs. The panel injects on `*.indeed.com`; the
bridge on the web-app origin.

Reducer without a browser: bundle a harness importing `src/state/machine.ts`
(type-only imports → pure JS) with esbuild `--platform=node` and run with node.

---

_Living notes: auto-memory `stage_b_extension_build_plan.md` and the linked
`project_guided_template_ux.md` / `project_webapp_saas.md`._
