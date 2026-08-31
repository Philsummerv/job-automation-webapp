# Chrome Web Store — listing description

Paste the block below into **Store listing → Description**. Plain text; the
Store strips formatting, so it is written to read without any.

## Why it is written this way

A reviewer reads this before they read anything else, and the single most
likely rejection for this extension is "automates a job site in a way the site
prohibits". So the human-in-the-loop limits are not buried at the bottom as a
caveat — they are the third paragraph, in plain words, before any feature list.
It matches `02-review-gate.png`, which is the screenshot that shows the same
thing.

It also says a JobAssistUI account is required in the first section. A reviewer
who installs it and sees nothing happen files a rejection; telling them up front
that it needs a sign-in, and pairing that with the test account in Test
Instructions, is what prevents it.

No marketing adjectives, no pricing. Pricing changes; a description that quotes
it goes stale and has to be resubmitted.

---

```text
JobAssistUI fills in job applications on Indeed using answers you have saved once, so you are not retyping your name, address and work history into every form.

It works with the JobAssistUI job-search log at jobassistui.com, where you save your answers and where your applications are recorded. A free account is required.

WHAT IT DOES NOT DO

You press Apply. You press Submit. The extension fills fields and stops — it never submits an application for you and never applies to anything on its own. Every page is shown to you before it moves on, and anything it could not answer is left blank for you to fill in yourself. You can stop it at any point.

HOW IT WORKS

1. Save your answers once on the Answer Template page at jobassistui.com — contact details, work authorisation, the questions that come up on nearly every application.
2. Open a job on Indeed marked "Easy Apply" and click Apply.
3. The JobAssistUI panel appears and fills the form from your saved answers.
4. You read the page, correct anything you want to change, and press Submit.
5. Once you have submitted it, the application is recorded in your job-search log with the employer, job title and date.

WHO IT IS FOR

People claiming unemployment benefits, who have to document a set number of job-search activities every week and would rather that record built itself as they applied than be reconstructed from memory on the last day.

It is also just useful if you are applying to a lot of jobs and are tired of typing the same answers.

LIMITS, HONESTLY

- Indeed only, and only jobs marked "Easy Apply". Jobs that say "Apply on company site" hand off to a different website that this cannot read.
- It fills what it recognises. Application forms vary, and unusual questions are left blank rather than guessed at.
- Chrome extensions do not run on phones. The rest of JobAssistUI works on any device.
- This is early software. If it gets something wrong, there is a feedback link inside the app.

PRIVACY

Your saved answers are stored in your JobAssistUI account and used to fill forms you have opened yourself. The extension reads the application form on the page in front of you in order to fill it. It does not collect browsing history and is not an advertising or tracking product. Full policy: https://www.jobassistui.com/privacy

JobAssistUI is not affiliated with, endorsed by, or connected to Indeed.

It is a documentation tool, not a legal or benefits advisor. It does not guarantee that any record will satisfy any agency's requirements, and it does not guarantee approval or continuation of any benefit. Job-search rules vary by state and change; you are responsible for knowing and meeting yours.
```
