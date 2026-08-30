# Roadmap — making it deeper, month by month

**Written 2026-08-25.** Companion to `docs/marketing/campaign.md`. That file
says how users arrive; this one says what they find when they come back.

**One thing up front, then I'll stop saying it.** Every feature below is worth
building, and building any of them before people retain on what exists is the
classic way to waste four months. So the whole roadmap is gated on one number —
the `/admin` gap between *Onboarded* and *Logged ≥1 activity*. Under a third,
the answer is never a new feature; it's fixing the one you have. The gates are
written into each month below so this isn't a judgment call at 11pm.

**The deadline that shapes everything:** on **2027-01-01** this becomes $12/mo
for everybody. Every month between now and then should end with the product
being more obviously worth $12 than it was at the start of it. That's the test.

---

## The honest ranking of "deeper than a website"

You already own more depth than you think. In order of value per hour:

| Rank | Thing | State today |
|---|---|---|
| 1 | **Works properly on a phone** | ⚠️ **never tested on a real device** |
| 2 | **Weekly reminders** | ~70% built, needs 4 small pieces |
| 3 | **Per-state requirement data** | not built — the real moat |
| 4 | **Audit-proof evidence** | half built (screenshots exist) |
| 5 | **Guided assist** (apply-with-you) | **built and verified**, parked in the extension |

Guided is the flashiest and it is *already done* — Stage B was verified
end-to-end on Indeed on 2026-07-18. It's #5 not because it's bad but because it
costs the most to un-park, and because none of it matters if the person can't
log an activity from their phone.

---

# NOW — this week, before any new feature (2–4 hours)

## Check the site on an actual phone

`HANDOFF.md` lists the mobile layout as **never tested on a real device** —
landing page, dashboard, and add-activity. There is no manifest and no
install prompt either.

This isn't a roadmap item, it's a bug hunt, and it's urgent for one reason:
**your entire acquisition channel is Facebook, and Facebook is a phone app.**
Every person who clicks your link opens the site inside Facebook's in-app
browser on a phone. If the add-activity form is awkward there, the
Onboarded→Logged gap you're watching isn't a product-confusion problem, it's a
layout problem — and you'd spend weeks misreading it.

Do this today or tomorrow:
1. Open the site on your phone **from a Facebook message to yourself**, so you
   get the in-app browser and not Chrome. That's the real path.
2. Walk the whole funnel: landing → sign in → the emailed code → settings →
   add an activity → attach a screenshot from the camera roll → export a PDF.
3. Write down every place it's awkward. Fix those before anything on this page.

The screenshot-from-camera-roll step is the one I'd bet on breaking, and it's
also the step that makes the evidence feature real.

## Then: the install prompt (half a day, high payoff)

Add a web manifest and an icon so the site can be added to a home screen. This
is the cheapest "more than a website" that exists — it gets an icon on their
phone next to the state's own app, with no app store, no review, no native
build. A tool you tap is a tool you use on Sunday night; a bookmark isn't.

---

# SEPTEMBER — retention

The month's job: someone who signs up in week one is still logging in week four.

## 1. Weekly reminders (the big one)

Already designed in `HANDOFF.md`, ~70% built: `weekly_target` and
`reporting_period_start_day` are on profiles, the period math is in
`packages/shared`, and sending email works (`apps/web/lib/notify.ts`).

Missing, and all small: a Vercel cron (none configured), a user timezone, a
notification-preferences column, and a `last_reminded_period` idempotency guard
so a retried cron can't double-send.

**The risk that must be designed in from day one, not bolted on:** reminder mail
is recurring and unasked, so spam complaints land on `jobassistui.com` — the same
domain that sends the **sign-in codes**. The failure mode isn't "reminders stop
working," it's *nobody can log in*. Therefore:

- **Opt-in only.** Unchecked by default.
- **Never mail anyone with zero logged activities**, ever, for any reason.
- One-click unsubscribe in the header, honored instantly.
- Start with *your own* account for a week before anyone else gets one.

**Gate:** don't build this until at least 5 people have logged ≥1 activity.
Reminding nobody is just a cron job that emails you your own bugs.

## 2. Make the week the front door

Right now the dashboard opens on the whole log. The thing people are anxious
about is *this week*: how many, how many left, when it closes. A period-first
dashboard — big count, days remaining, one button — is a small change that
targets exactly the anxiety in the founder story.

## 3. Edit-in-place results

Someone applies Monday and hears back Thursday. Updating `Result` should be one
tap from the log row, not a trip into a form. Cheap, and it's the thing that
makes people come back mid-week rather than only on certification day.

---

# OCTOBER — the moat

## Per-state requirement data

This is the feature nobody else has and the one that compounds hardest, because
it's simultaneously the product *and* the SEO pages from phase 5 of the campaign
*and* the answers you're already typing into Facebook comments.

Build it as **a data file first** — one entry per state: activities required per
week, what counts as an activity, whether contacts count, what the state says to
retain, and a link to the state's own page. Ship it as:

1. The `/[state]` pages (campaign phase 5).
2. A prompt in Settings: pick your state, and it *suggests* the weekly target
   and shows the state's own rules next to the field, with a link.

**Two hard rules, same as everywhere else:** the app **suggests**, the user
confirms, and every entry links to the state's own page as the authority.
Never present your number as the state's requirement. Rules change, and being
confidently wrong here costs somebody money.

Start with 5 states — whichever ones your Facebook groups actually converted, by
then you'll have that data. This is many hours of careful reading, not code, so
spread it across the month.

## Audit mode (the "they're auditing me" feature)

The single most emotional post in these groups is *"they're auditing my work
search and I don't remember what I did."* You're most of the way there: an
export that covers a date range rather than one week, includes the evidence
screenshots inline rather than as a column, and reads like a document someone
prepared rather than a table dump.

---

# NOVEMBER — depth, and the case for $12

Now the honest question: what makes someone pay in January? Pick **one** of
these based on what people have actually asked you for by then. Not both.

## Option A — Guided assist, un-parked (the flagship)

It's built. `apps/extension/STAGE_B_STATUS.md` records it verified end-to-end on
Indeed smartapply: scan → fill from the template → review gate → advance →
submitted, with **no auto-submit**, and completed applications logged with
source `guided`. The landing page already says "coming soon".

Two ways to ship it, and they are very different bets:

- **Ship the extension** — cheap, it exists, it works. Costs: a Chrome Web Store
  review, an install ask, and it reverses the 2026-08-06 decision to be
  web-only. Reasonable if you only ask people who already want it.
- **Web-native, cloud browser** — no install, matches the current strategy, and
  costs real money per session in bandwidth and compute. `HANDOFF.md` flags
  $10/GB as the constraint to check. Not a free-tier feature. This is a
  post-revenue build, not a November one.

**My read:** if you go for Guided this year, ship the extension to a handful of
people who ask for it by name, and keep the site web-only. Don't put a
cloud-browser bill on a product with no revenue.

## Option B — Make the record unimpeachable

Less flashy, cheaper, and closer to why people are actually here: automatic
capture of the confirmation email. Forward your application confirmations to a
per-user address and it files them against the right activity. No extension, no
browser automation, no per-session cost — and it turns "I attach screenshots
when I remember" into a record that builds itself.

If the feedback inbox is full of "I forget to log things," build this and not
Guided.

---

# DECEMBER — no new features

December is the conversion runway (campaign phase 6). Building in December means
shipping bugs to the exact cohort you're about to ask for money.

The month is: the pricing decision (Dec 1), the 30-day notice (Dec 8), the two
reminders (Dec 22 / Dec 30), and otherwise **fixing whatever the feedback inbox
says is broken**. A stable December is worth more than any feature in this file.

---

# AFTER JANUARY — only if people pay

Sketch, not a plan: web-native Guided if revenue covers the compute; the answer
template getting smarter (the corpus idea in the older notes); resume keyword
matching; the remaining 45 states. All of it depends on a number you don't have
yet.

---

## What NOT to build, and why

Writing these down so they stop being tempting at 1am:

- **A native mobile app.** Two app stores, two review processes, two codebases,
  for something a home-screen icon on the web app already does.
- **A resume builder / AI cover letters.** Enormous, crowded, and not what
  anyone in those groups is asking for. It also drags you into "help me get a
  job," which is a different and much harder product than "help me prove I
  looked."
- **A job board or job matching.** Indeed exists.
- **Anything that files, submits to, or talks to a state agency.** The legal and
  trust exposure is total, and one bad submission ends the product.
- **AI that answers benefit-eligibility questions.** Same reason the Facebook
  bot was declined: confidently wrong about somebody's money.
  - *Still true, and the line has not moved.* Built 2026-08-29 but **not
    released**: a Rules Assistant at `/assistant` that answers questions about
    a state's **work search rules** — how many activities, what counts, how long
    to keep records — by quoting that state's own page with the link and the
    date it was read. It never generates a fact, and eligibility, benefit
    amounts, appeals, overpayments, fraud and determination letters are
    hard-refused to the state's phone number before anything else runs.
    Admin-gated and unlinked from the nav until there are more users. Plan and
    reasoning: `docs/legal/chatbot-disclaimers.md`.
- **Teams / employer / counselor dashboards** until an actual job center asks.

## How to decide, each month

1. Read the feedback inbox and the last month of group comments. What got asked
   more than once?
2. Check the funnel gap. If it's bad, that's the month's work — full stop.
3. Pick **one** thing. Ship it in under two weeks or cut its scope until it
   fits.
4. Tell the users you shipped it — but per the mail rule, only the ones who have
   logged something.
