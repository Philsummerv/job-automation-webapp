# Chrome Web Store — listing description

Paste the block below into **Store listing → Description**. Plain text; the
Store strips formatting, so it is written to read without any.

**Rewritten 2026-09-02.** The previous version said the extension "does not find
jobs, does not browse listings, and does not choose anything on your behalf."
That was not true of the bundle that was submitted, and a reviewer can see it in
the package in about thirty seconds:

- `content.ts:298` renders a **🔎 Find jobs** button, and `findJobs()` navigates
  to an Indeed search built from the user's saved query and scrapes the results
  into a queue.
- `background.ts:238` runs `pressApplyInPage()` in the main world — the
  extension presses Apply.
- `content.ts:~816` `advancePage()` clicks Continue to move between form pages.

A listing that contradicts its own package is a "misleading listing" rejection
on its own, separately from any Indeed question — and it poisons the one claim
that actually matters, which is the submit guard.

## What is true, and is now what the description leads with

**It never submits.** `advancePage()` refuses to click any button whose label
matches `/\b(submit|send)\b/i`, and the guard sits at the single place a click
happens so no caller can route around it. It logs "read it over and press it
yourself. I don't send applications for you." That guard was added on 2026-08-29
after this function pressed "Submit your application" and sent a real
application to a real employer. It is the strongest and most checkable claim in
the listing, so it is the headline.

## The tradeoff, stated plainly

This version is more likely to draw the Indeed question — automating the apply
*process* is what job sites prohibit, and this now says it advances pages and
presses Apply. It is much less likely to draw a misleading-listing rejection,
and it is honest.

If the rejection names Indeed's terms, the fill-only build from 2026-08-29 is in
git history and that decision is worth reopening. Do not reopen it otherwise.

## Other choices, unchanged and deliberate

- **"Template fill assist"** is the owner's wording, chosen 2026-08-30 over
  "autofill". *Assist* says a person is doing the applying; *template* says the
  answers came from the user. Keep in sync with the Store console.
- **A free account is required** is said in the first section. A reviewer who
  installs it and sees nothing happen files a rejection.
- **The limits come before the feature list**, not after it as a caveat.
- **No pricing.** Pricing changes; a description quoting it goes stale and needs
  resubmitting.

**Note:** this is the long **Description** field only. The one-line summary in
search results comes from `description` in `manifest.json`, which needs a new
package upload to change. The current one — "Template fill assist for
job-application forms. Fills the form you opened, from answers you saved. You
submit." — is accurate enough to leave alone.

---

```text
JobAssistUI fills in job application forms from answers you saved once, and records each application you send to your job-search log.

You save your standard answers on the Answer Template page at jobassistui.com — contact details, work authorisation, the questions that come up on almost every application. The extension types them into Indeed application forms so you are not entering the same details by hand every time. A free JobAssistUI account is required; without one the extension has nothing to fill from.

YOU PRESS SUBMIT. ALWAYS.

This is the part worth being exact about.

The extension will fill an application and move between its pages. It will not send one. When it reaches the final step it stops, tells you it is ready, and waits. You read the completed form, change anything you want, fill in anything it left blank, and press Submit yourself.

That is enforced in the code, not just promised here: the function that clicks buttons refuses to click any button labelled Submit or Send, at the one place in the extension where a click can happen. There is no path around it and no setting that turns it off.

It works on one application at a time — the one in front of you. There is no bulk mode, and nothing continues while you are away from the screen.

WHAT IT ACTUALLY DOES

Being straightforward about this, because it is more than a form-filler.

- You save a job title and location in your answer template. When you press "Find jobs", it opens that search on Indeed and lists what came back in the panel, so you can work down the results without retyping the search.
- You choose a job. It can open the application for you and begin filling it.
- It fills the fields it recognises from your saved answers, and clicks Continue to move to the next page of a multi-step form.
- At the final step it stops. You check it and submit it.
- Once you have submitted, it records the employer, job title and date in your job-search log at jobassistui.com.

You stay at the screen for all of it. It is an assistant working alongside you, not a bot you leave running.

WHO IT IS FOR

People claiming unemployment benefits, who have to document a set number of job-search activities every week and would rather that record built itself as they applied than be reconstructed from memory on the last day of the week.

It is also useful if you are simply applying to a lot of jobs and are tired of typing the same answers.

LIMITS, HONESTLY

- Indeed only, and only applications marked "Easy Apply". Listings that say "Apply on company site" send you to a different website, which this cannot read.
- It fills what it recognises. Forms vary, and anything unusual is left blank for you rather than guessed at.
- It does not answer questions for you. If your template has no answer for something, that field stays empty until you type in it.
- Chrome extensions do not run on phones. The rest of JobAssistUI works on any device, and the job-search log is the part most people use most.
- This is early software. If it gets something wrong there is a feedback link inside the app.

PRIVACY

Your saved answers live in your JobAssistUI account and are used to fill forms in front of you. The extension reads the application form on the page in order to fill it in, and reads the Indeed search results page when you ask it to find jobs. It does not collect browsing history, does not track you across sites, and is not an advertising product. Full policy: https://www.jobassistui.com/privacy

JobAssistUI is an independent tool and is not affiliated with, endorsed by, or connected to Indeed.

It is a documentation tool, not a legal or benefits advisor. It does not guarantee that any record will satisfy any agency's requirements, and it does not guarantee approval or continuation of any benefit. Job-search rules vary by state and change; you are responsible for knowing and meeting yours.
```
