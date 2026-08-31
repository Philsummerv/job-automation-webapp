# Chrome Web Store — listing description

Paste the block below into **Store listing → Description**. Plain text; the
Store strips formatting, so it is written to read without any.

## Why it is written this way

A reviewer reads this before anything else, and the most likely rejection for
this extension is "automates a job site in a way the site prohibits". So the
description is written to make the actual shape of the tool obvious in the
first sentence: **it is a form-filler for a form you already opened.**

Specific choices, all deliberate:

- **It is described as template fill assist, not as applying to jobs.**
  "Fills in job applications on Indeed" reads as an apply bot. "Fills in the
  form you have already opened, from your template" reads as what it is. Same
  behaviour, accurate either way, but only one of them invites the question.
  The owner's wording, chosen 2026-08-30 over "autofill": *assist* says a
  person is doing the applying, and *template* says the answers came from the
  user rather than being generated. "Autofill" is a browser-automation word and
  carries the wrong association for a reviewer scanning for that exact thing.
  **Keep this phrase in sync with what is live in the Store console.**
- **The user's actions are named as the user's** — you search, you choose, you
  open, you click Apply, you submit. Every verb that touches the job site
  belongs to a person.
- **It never claims to find, search, browse or apply.** It does not do those
  things, and words implying it would be the ones a reviewer catches on.
- **"One application at a time, the one on your screen"** is stated outright.
  Bulk or unattended applying is the thing job sites actually prohibit, and
  saying plainly that it does not do that answers the objection before it is
  raised.
- **The limits come before the feature list**, not after it as a caveat.

It also says a JobAssistUI account is required in the first section. A reviewer
who installs it and sees nothing happen files a rejection; saying so up front,
paired with the test account in Test Instructions, is what prevents that.

No pricing. Pricing changes, and a description quoting it goes stale and needs
resubmitting.

---

```text
JobAssistUI is a template fill assist tool for job application forms. You save your standard answers once — contact details, work authorisation, the questions that come up on almost every application — and it types them into the form you are filling in, so you are not entering the same details by hand every time.

It works alongside the JobAssistUI job-search log at jobassistui.com, where you save those answers and where your applications are recorded. A free account is required; without one the extension has nothing to fill from.

YOU ARE THE ONE APPLYING

This is worth being exact about.

You search for jobs. You decide which one to open. You click Apply. The extension does not find jobs, does not browse listings, and does not choose anything on your behalf — it activates on the application form that is already open on your screen, because you opened it.

It fills the fields it recognises and then stops. It never presses Submit. You read the completed form, change anything you want to change, fill in anything it left blank, and submit it yourself. Nothing is ever sent without you.

It works on one application at a time — the one in front of you. There is no queue, no bulk mode, and nothing that continues while you are away from the screen.

HOW IT WORKS

1. Save your answers once on the Answer Template page at jobassistui.com.
2. Find a job yourself on Indeed and open it. Click Apply.
3. The JobAssistUI panel appears on the application form. It fills the fields it can match to your saved answers.
4. You check the form, edit anything you want, and press Submit.
5. After you have submitted it, the application is recorded in your job-search log with the employer, job title and date.

WHO IT IS FOR

People claiming unemployment benefits, who have to document a set number of job-search activities every week and would rather that record built itself as they applied than be reconstructed from memory on the last day.

It is also useful if you are simply applying to a lot of jobs and are tired of typing the same answers.

LIMITS, HONESTLY

- Application forms on Indeed, and only the ones marked "Easy Apply". Listings that say "Apply on company site" send you to a different website, which this cannot read.
- It fills what it recognises. Forms vary, and anything unusual is left blank for you rather than guessed at.
- Chrome extensions do not run on phones. The rest of JobAssistUI works on any device.
- This is early software. If it gets something wrong, there is a feedback link inside the app.

PRIVACY

Your saved answers live in your JobAssistUI account and are used to fill forms you have opened yourself. The extension reads the application form on the page in front of you in order to fill it in. It does not collect browsing history, does not track you across sites, and is not an advertising product. Full policy: https://www.jobassistui.com/privacy

JobAssistUI is an independent tool and is not affiliated with, endorsed by, or connected to Indeed.

It is a documentation tool, not a legal or benefits advisor. It does not guarantee that any record will satisfy any agency's requirements, and it does not guarantee approval or continuation of any benefit. Job-search rules vary by state and change; you are responsible for knowing and meeting yours.
```
