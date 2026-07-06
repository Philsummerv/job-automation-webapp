# ApplyAssistUI extension POC

Answers one question before committing Stage B to the extension architecture:
**can a content script scan and fill Indeed's Easy-Apply form and advance the
multi-page flow using synthetic (`isTrusted: false`) events?**

It reuses the automation cores from `packages/automation` (the code-sharing
proof): `collectFormQuestions` (the same DOM scraper Playwright injects) and
`makeAutoFillAnswer` (the ordered auto-fill rules).

## Build & load

```bash
npm run build -w apps/extension
```

Then: `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
select `apps/extension/dist`. (Rebuild + click the extension's reload icon
after code changes.)

## Test protocol

1. Log into Indeed normally in your own Chrome.
2. Open any **Easily apply** job posting → click **Apply**.
3. The dark ApplyAssistUI panel appears top-right on every indeed.com page.
4. On each form page: **Scan** (detected questions get outlined in blue and
   listed with proposed answers — edit any answer box; `#` picks an option;
   blank = skip) → **Fill** → check the ✓/✗ log → **Continue**.
5. Repeat through the review page. Completing the final submit is optional —
   advancing pages is what's being tested.

## Success criteria

- Text values **stick** after React re-renders (the log calls out "value did
  NOT stick" when React reverts a fill — that's the classic failure)
- Radio/select choices register (Continue doesn't complain about required fields)
- Continue advances the flow despite `isTrusted: false`
- Works in iframed forms (the panel shows `top frame` vs `iframe`)
- No captchas — it's your real, logged-in, residential-IP browser

## Failure branch

If Indeed ignores untrusted events anywhere, the pivot is the
`chrome.debugger` API (trusted CDP input, shows a debug banner) — ideally via
**playwright-crx**, which runs Playwright inside an extension and would let
the Stage A port survive nearly wholesale.
