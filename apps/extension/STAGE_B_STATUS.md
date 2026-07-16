# Stage B (browser extension) — status & handoff

_Last updated: 2026-07-16. Branch: `stage-b/m-b5-review-gate` (tip commit for
this phase). Verified with a full clean end-to-end run on Indeed smartapply
through to "application submitted"._

The extension (`apps/extension`) turns the ported automation core
(`packages/automation`) into a guided, human-in-the-loop autofill assistant that
runs in the user's own Chrome on real job-site tabs. It is the "hands" of the web
app (`apps/web`), which is the "brain" (account, billing, answer template) — a web
page cannot fill forms on `indeed.com` due to same-origin rules, so the extension
is the delivery mechanism, not a separate product.

---

## History — milestones delivered

Stacked branches off `main` (POC commit `91efb1a`). **Unmerged.** Merge order:
`m-b1` → `m-b2` → `m-b5`.

| Branch | What it added |
|---|---|
| `stage-b/m-b1-foundation` | Manifest host_permissions + `externally_connectable`; typed message protocol (`src/messages.ts`); `chrome.storage.local` wrapper (`src/storage.ts`); `tsc --noEmit` build gate. |
| `stage-b/m-b2-state-machine` | Authoritative run controller in `background.ts` + a **pure** reducer (`src/state/machine.ts` + `types.ts`): lifecycle `starting → scanning → filling → review → advancing → done`, rehydrated from storage every message. webNavigation drives auto-advance. |
| `stage-b/m-b5-review-gate` | The real per-page **review gate** (native controls, edit-to-form), **pause/resume**, and a series of shared-scraper hardening fixes (see below). |

The reducer is verified by a throwaway esbuild+node harness (not committed) —
30+ assertions covering the multi-page loop, pause/resume, staleness guards, and
event cap.

---

## Current architecture

```
apps/extension/src/
  background.ts     service worker = run controller. Serialized dispatch:
                    rehydrate activeRun from storage.local → reduce() →
                    persist → run effects (tabs.sendMessage commands,
                    no-form timeout). Handles webNavigation → nav-completed.
  content.ts        injected panel + executor. Scans/fills/advances on
                    worker command; renders the review gate; guards against
                    "Extension context invalidated" after a reload.
  messages.ts       typed discriminated-union wire protocol + sendToWorker.
  storage.ts        typed chrome.storage.local wrapper (StorageSchema).
  state/
    types.ts        RunState, Action union, Effect descriptors (no chrome import).
    machine.ts      pure reduce(state, action) → { state, effects }.

packages/automation/src/forms.ts
  collectFormQuestions()  the SHARED DOM scraper (also serialized by the
                          Playwright scout). All scraper fixes below live here.
```

**Flow:** user clicks **Start run** → worker broadcasts `scan` to all frames →
the frame with a form replies `scan-result` → worker sends `fill` → content
fills from the (stand-in) template → `fill-result` → worker sends `review` →
content renders the gate → user approves → `advance` (clicks Continue) →
webNavigation fires → next page rescans. No auto-submit; the review gate is
always a stop.

---

## What works (verified end-to-end)

- Scan detects questions in DOM order across text / checkbox / radio / native
  select / ARIA combobox.
- Review gate renders each question in its **native control type**, reflecting
  the real form's state; editing a control writes back to the real Indeed form.
- Page-level **Looks right → Continue**, **Pause (edit here or on the page) →
  Resume**, **Stop**.
- Multi-page advance to "application submitted", clean.
- Idempotent fill (clicking Start run repeatedly does not toggle checkboxes).

### Scraper fixes that landed this phase (all in `forms.ts`, help the scout too)
- **Group question text** resolved from `<legend>` / `role=group` aria-label /
  `aria-labelledby` (was using the first option's label, e.g. "EMC"/"Yes").
- **ARIA combobox detection** (Indeed's `<div role="combobox">` multi-select).
- **DOM-order sort** of collected questions.
- **Option-id signature dedupe** (collapses a group reached via multiple labels).
- **Visibility filter** (`checkVisibility`) to skip genuinely hidden fields.
- **Self-scrape guard** — the panel is marked `data-aaui-ignore` and the scraper
  skips it. _This was the root cause of every "phantom EMC/Multimeter question"
  report: the scraper was re-scanning our own review-gate controls._

---

## Known gaps / TODO (next phase)

Ordered roughly by how visible they are to a user testing the extension:

1. **Combobox auto-fill (education dropdown).** Currently only a "Choose on
   page" button that opens Indeed's own dialog. `fillFieldDom` has no
   `combobox` branch, so the auto-fill attempt falls through to a text setter on
   a `<div>` → harmless-but-logged **"Illegal invocation"**. DOM (confirmed
   live): clicking the `role=combobox` div opens a popup with a search `<input>`
   + one checkbox per option. Auto-fill = open → find option by label (or type
   search) → click → close. **User requirement: dropdowns must be template-fillable.**
2. **M-B4 — real per-user templates.** Fills currently use the hardcoded
   `DEFAULT_CONFIG` (`packages/automation/src/config.ts`). Replace with the
   user's saved answer template fetched from the web app
   (`apps/web/app/api/extension/template/route.ts`, to be built). See
   `src/template.ts` in the original plan.
3. **M-B3 — auth.** Supabase session handoff from the signed-in web tab
   (transport is already stubbed: `auth-handoff` over `externally_connectable`,
   stored in `storage.local`) + entitlement/paywall check reusing web `lib/auth`.
4. **Fill hardening.** `verify-after-settle` (re-read field state after a
   microtask, not same-tick); `<input type=file>` resume via DataTransfer;
   reconcile `forms.ts fillFormField` checkbox path (ignores `__RADIO:`) vs
   `content.ts fillFieldDom`.
5. **Product-vision items** (see memory `project_guided_template_ux`): multi-board
   (Glassdoor / ZipRecruiter / LinkedIn / Handshake) via per-board config;
   "Easy Apply only" vs "also apply-on-site" run filter; possible
   embedded/streamed-browser delivery (Browserbase, M2 Stage A) as an
   alternative to the extension — the scraper/state-machine/review-gate are
   reusable across both.

### Notes / gotchas
- Relocation "Yes/No" on Indeed is a **checkbox pair**, not a radio — templates
  must treat it as single-choice.
- Do NOT dispatch `input`+`change` after a `.click()` on a checkbox/radio — the
  native click already fires React's onChange; re-dispatching double-fires and
  reverts. Fill uses an idempotency guard only.
- After reloading the extension, **also reload the page** — the old content
  script keeps running with a dead runtime (now shows a "reload this page"
  notice instead of throwing).

---

## Build & test

```bash
cd apps/extension
npm run build        # runs `tsc --noEmit` gate, then esbuild → dist/
```

Load `apps/extension/dist` unpacked at `chrome://extensions` (Developer mode).
Open the service-worker console from that page to watch worker logs. The panel
injects on `https://*.indeed.com/*`.

To verify the reducer without a browser: write a small harness that imports
`src/state/machine.ts` (it has only type-only imports, so it bundles to pure
JS), bundle with esbuild `--platform=node`, and run with node.

---

_Fuller running notes live in the auto-memory: `stage_b_extension_build_plan.md`
and the linked `project_guided_template_ux.md` / `project_webapp_saas.md`._
