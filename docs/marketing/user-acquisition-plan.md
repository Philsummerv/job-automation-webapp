# How to get users — research summary (2026-10-12)

Four research agents looked at: our existing marketing docs, how other AI job
tools got their users, where people on unemployment actually are, and the legal
and trust risks. This file is the combined answer. Sources are linked at the
bottom of each section.

## The short version

1. **Nobody is talking to these people.** There are ~184,000 people on
   unemployment in New York alone, every one of them must log 3 job contacts a
   week, and no AI job tool is aimed at them. Competitors all chase tech
   workers and college students.
2. **The winning tools grew by one person being helpful in public**, not by
   ads. Simplify (founder posts), Jobright (Reddit AMA), LoopCV (first 500 users
   from Reddit), AIApply (one person, one TikTok account, 300 videos).
3. **The best channel for us is the public workforce system** — job centers,
   libraries, reentry programs. Claimants are often *required* to go there, so
   one friendly counselor sends you new users every week. Nobody else is doing
   this for unemployment.
4. **The fastest channel is still the Facebook reply play** (already planned).
5. **The one channel that keeps working while you sleep is search pages.** One
   page per state answering "how many job contacts a week do I need?" with a
   free log. The pages ranking now are thin and weak.
6. **Don't lead with "AI".** To this audience, "AI applies for you" sounds
   like a scam or a bot. Lead with the claim and the jobs; *show* Apply for me.

Honest math: by hand, expect about 1–2 signups per hour of your time at first.
100 users ≈ 50–65 hours. A library or job center saying yes is what speeds it
up; search pages are what make it stop depending on your hours.

## Before any marketing: 3 must-dos

**Status 2026-10-14:** #1 shipped 2026-10-12 (owner still to test it on a
phone). #2 built: public search at `/find-jobs`, linked from the homepage.
#3 done: reply brief, canned answer Q12 and the follow-up DM updated;
`video-script.md` marked out of date.

1. **Ship the new version.** Production still runs the old log-only site. Don't
   promote jobs or Apply for me until they're live and you've applied to one
   real job yourself on your phone.
2. **Let people see jobs without signing up.** Right now `/jobs` needs an
   account first. That is the biggest leak: people should see real jobs near
   them, then sign up to apply. (Engineering, ~1–2 days. Also gives you a link
   that's safe to share.)
3. **Fix the old docs that are now wrong.** `reply-brief.md` says the product
   "does not find jobs" and "does not apply for you". Canned answers Q11 and
   Q12 describe the old pricing. `video-script.md` shows logging only. Also:
   the founder story is settled (2026-10-12): a job offer was pulled at the last
   minute in February, claiming since March. `post-drafts.md` now matches the
   homepage. Keep every new draft consistent with it.

## The pitch

Best first:

1. "I'm on unemployment in New York too. I built a free site that shows hourly
   jobs near you, fills in the application for you to check, and keeps your
   work-search log while you do it."
2. "Apply to real jobs — your weekly work-search log fills itself." (flyers,
   homepage)

Avoid: "AI job assistant", "auto-apply", "apply to 1,000 jobs while you sleep",
"get hired faster", any number you haven't measured.

## Channels, ranked

### First 100 users

| # | Channel | Cost | Your time | Speed | Why |
|---|---|---|---|---|---|
| 1 | **Facebook reply play** — answer questions in NY unemployment groups with the canned answers; link only where allowed | $0 | ~45 min/day | Fast (after 1–2 week warm-up) | Exact audience. "New York Unemployment/Updates And Help" gets ~1,600 posts a month and only 29 comments — nobody answers. |
| 2 | **Libraries and job centers** — call, offer a free 5-minute demo or a flyer for their resource sheet | $0 + printing | 2–3 hrs per visit | Slow to start, then steady | People there are often *required* to attend. A live Apply for me demo is your strongest asset. |
| 3 | **Your own Facebook profile** — one honest founder post, ask friends to share | $0 | 15 min, once | Instant | Shares from friends carry trust. |
| 4 | **Group admin DMs** — ask permission to post once | $0 | 10 min each | Instant if yes | One yes beats a week of replies. |
| 5 | **Small Meta ads test** — $200–300, statewide NY, 2–3 messages | $200–300 | 1–2 hrs | Fast | Buys data on which message works. Expect ~$3–10 per signup (untested guess). |
| 6 | **Reddit** — help in r/Unemployment New York threads first, link later | $0 | 20 min/day | Slow (karma first) | 1M members, answers rank on Google. Strict mods. |

### First 1,000 users

1. **Search pages per state** — NY first, then the biggest unemployment states.
   "How many job contacts a week for [state] unemployment" + a free log.
2. **The workforce system at scale** — NY has 33 workforce boards and 18 NYC
   Workforce1 centers. Also reentry programs (Fortune Society, CEO), CUNY
   continuing ed, veterans services.
3. **Copy the Facebook reply play to other states** (NJ, PA, then CA, TX, FL).
4. **Meta ads** — only if the test gets signups under ~$5 each.
5. **Short video** — your own account first ("NY work search rules in 60
   seconds"), then 2–4 small creators at ~$200–500 each once a message works.
6. **Reddit** — steady answering across state subs.

**Skip:** Google Search ads on unemployment terms (Google restricts "help with
government benefits" ads — risk of account suspension), LinkedIn #OpenToWork
(wrong audience), Nextdoor, Discord, Product Hunt / Hacker News.

## Useful contacts (from public pages, check before calling)

- **NY DOL Rapid Response** (the team sent to every big layoff — ask if they'll
  hand out a free one-pager): NYC 718-613-3659 · Long Island 516-934-8580 ·
  Western NY 716-851-2659 · statewide 518-457-1143.
  https://dol.ny.gov/rapid-response
- **NY WARN dashboard** (upcoming layoffs by county — tells you *where* to call,
  never contact workers directly): https://dol.ny.gov/warn-dashboard
- **NYPL Career Services:** careerservices@nypl.org
- **Brooklyn Public Library Business & Career Center** (Central Library, 2nd
  floor, drop-in)
- **Workforce1 centers:** https://www.nyc.gov/workforce1 · **All NY boards:**
  https://dol.ny.gov/workforce-boards

Expect some no's from state staff — they may not name a private product. Ask
for a spot on the printed resource sheet instead.

## First week (after the new version is live)

| Day | Do | Time |
|---|---|---|
| Mon | Walk through the whole site on your phone as a stranger; apply to one real job. Approve the fixed docs. | 1 hr |
| Tue | Founder post on your own profile. Comment in each group to see which ones publish you right away. 3 replies. | 45 min |
| Wed | Join NJ and PA groups. DM 2 admins. 3 replies. | 45 min |
| Thu | Call 2 libraries and your local Career Center to book a demo. 3 replies. | 45 min |
| Fri | Record a 60-second screen video of Apply for me on a real NY job (for DMs and demos). | 45 min |
| Sat | 3 helpful Reddit comments, no links. | 20 min |
| Sun | 6–8 replies (Sunday is certification day — busiest). Check /admin. | 45 min |

About 5½ hours. You post every comment yourself. Never tell someone whether
they're eligible — point them to NY DOL's own rules.

## What to measure (in /admin)

1. **Activation** — new signups who add a resume *and* log 3+ activities in
   their first week. Target 40%+. Under 25% means stop marketing and fix the
   product.
2. **Apply for me success** — applications that reached "submitted" ÷ runs.
   Target 60%+. Also watch cost per active user (you pay for every run until
   2027).
3. **Signups per hour of your time** — target 1+ by week 2, 2+ by week 4. Still
   under 0.5 after week 3 → move hours from groups to library demos.

Rough benchmarks: 2–5% of visitors sign up; 25–40% of signups activate; 2–5% of
free users pay. Referral programs add a little, rarely a lot (only ~2–3% of
users actually refer).

## Rules (legal and trust)

**Do**
- Say "Not a government site. Not affiliated with any state labor department"
  on the homepage, footer and signup.
- Say "No card. The log is free forever." up top.
- Say plainly: we never ask for your SSN or your state unemployment password.
- Use your real name and photo. Explain in plain words what the cloud browser
  sees.
- Make canceling one click, and post the refund policy. Billing traps are the
  #1 complaint about every competitor (AIApply, LazyApply, JobCopilot).
- Require "#ad" from anyone who gets money *or free months* for posting about
  the app (FTC).
- Give every marketing email a postal address and a working unsubscribe
  (CAN-SPAM, up to $53k per email). Keep it off the sign-in email path.

**Don't**
- Say or imply the state "accepts" or "approves" the log. Say "keeps the record
  your state may ask for."
- Make outcome claims ("get hired faster", "% more interviews"). The FTC fined
  DoNotPay for untested AI claims; the CFPB hit a bootcamp for inflated
  placement rates.
- Post, buy, or AI-write reviews (FTC fake-review rule, ~$51k per violation).
- Write ads that point at the reader's hardship ("Lost your job?") — Meta
  rejects these. Lead with the benefit instead.
- Send marketing texts (TCPA: $500–1,500 per text).
- Automate posting, or paste the same link across many groups (account bans —
  and the standing rule: no bots on the owner's Facebook).
- Build "pay when you're hired" — regulators can treat it as a loan.

## Sources

- Funnel and pricing benchmarks: Lenny's Newsletter, Growth Unhinged, RevenueCat
  via Phiture, Userpilot, June — figures are mostly B2B; treat as rough.
- Competitors: consumerstartups.substack.com (Simplify), jobright.ai/blog,
  refreshmiami.com (Teal), indiehackers.com/product/huntr, playkit.substack.com
  (AIApply), arr.club (Final Round), Trustpilot pages, indeed.com/news (Indeed
  "Apply For Me" test).
- NY facts: fred.stlouisfed.org (NYCCLAIMS, NYICLAIMS),
  dol.ny.gov/work-search-frequently-asked-questions, dol.ny.gov/rapid-response,
  dol.ny.gov/warn-dashboard, nyc.gov/workforce1.
- Rules: ftc.gov (fake reviews rule, CAN-SPAM guide, Endorsement Guides),
  transparency.meta.com (personal attributes), support.google.com/adspolicy
  (government services), consumerfinance.gov (BloomTech).
- Paid costs: localiq.com Facebook benchmarks (Career & Employment: $0.73 per
  click, $12.30 per lead), influencermarketinghub.com (micro-creator rates).
- Gaps: Reddit blocked our research tools, so subreddit rules and sizes for
  r/NewYorkUnemployment need a manual check. Search volumes need a free check
  in Google Keyword Planner.
