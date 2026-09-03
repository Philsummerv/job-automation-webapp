# Research: free government job and event data sources

Mary (Analyst) — 2026-09-02

**Question put to me:** can job listings and job-fair/event data come from free
government sources instead of scraping Indeed?

**Short answer:** the events half is a clean yes, available today, no permission
needed. The jobs half is gated behind a governance board that, in writing, does
not currently authorize the use case being proposed. It is not a technical or
cost problem. It is a permission problem, and the owner cannot self-serve past it.

Everything below is separated into **EVIDENCE** (I fetched it, here is what it
said) and **INFERENCE** (my read).

---

## 1. CareerOneStop Jobs API

### EVIDENCE — it is not self-serve

From `careeronestop.org/Developers/WebAPI/whats-available.aspx`, the Jobs entry:

> Retrieves job postings for a specific keyword or an occupation title or code.
> The returned list object contains the job postings available in the area, from
> the National Labor Exchange. **Request access to this API through the NLX data
> request form here** or contact the NASWA research hub...

From `careeronestop.org/Developers/WebAPI/jobs-api-updates.aspx`:

> As of August 27th, 2024, "v2" of the Jobs API is available and **ALL customers
> who would like access will need to request access to the Jobs API. Through
> partnership with the NLx, all new requests for the Jobs API will be reviewed
> and approved by the NLx Research Hub Governance Board**, with some users
> pointed to the offerings provided by the NLx Research Hub.

I confirmed the API rejects unauthenticated calls:

```
$ curl "https://api.careeronestop.org/v2/jobsearch/TESTUSER/nurse/NY/25/0/0/0/25/30"
HTTP 401
{"Message":"Unauthorized","ErrorCode":401}
```

A bogus bearer token gives the same 401. Auth is a **Bearer API token + a
separate userId in the URL path**, both issued at registration.

### EVIDENCE — what the NLx governance body says it will and will not authorize

From `nlxresearchhub.org/request-nlx-data`, verbatim:

> **Authorized Use**
> The NLx Research Hub is authorized to provide access to both real-time and
> historical NLx job posting data to use cases as approved by the NLx Data Trust
> Governance Board.
> **Data is currently authorized for the following use cases ONLY:**
> - State workforce agency LMI efforts
> - Discrete (not ongoing) nonprofit research projects
>
> If you would like to utilize the NLx data for other applications and projects
> such as **product development, platform integration, job matching**, and
> Artificial Intelligence (AI) use cases such as model-training, please submit a
> data request. **This includes job boards that limit access to NLx job postings
> through subscription or other fees.**
>
> As the authorized uses of the NLx data expands, first consideration will be
> provided to those that have submitted a data request.

And the carve-out that matters most to us:

> If you are requesting access to the NLx job feed for the population of a public
> job board, please note that approved users may be directed to a source other
> than the NLx Research Hub for data access depending on the technical
> specifications needed. Please note that **"public job boards" are defined as
> those that provide all information and functionality to job seekers, employers,
> and the public workforce system at no cost.**

Process, verbatim:

> - Complete and submit the appropriate data request form
> - Requests will initially go through a review by NASWA...
> - NASWA will determine if the request qualifies for Expedited Review or must be
>   reviewed by the NLx Data Trust Governance Board.
> - **If review by the governance board is required, please allow 2 - 3 weeks for review.**
> - If the request is approved, Research Hub staff will email a draft **data use
>   agreement**... all authorized users listed on the agreement will be issued
>   credentials.

The request forms are live JotForms (both returned HTTP 200):
- Government users: https://form.jotform.com/241192742410145
- Non-government users: https://form.jotform.com/232134521930042

I read the non-government form's field labels. It is shaped for academic
research, not for a product:

- "Name of PI" (Principal Investigator), "Title (enter 'Student' or 'PhD candidate' if applicable)"
- "PURPOSE OF PROJECT / STATEMENT OF BENEFIT", "PROJECT METHODOLOGY"
- "How long do you require access to the NLx data?"
- "Are you requesting access to any of the following restricted fields?" — **Employer Information**, with a required "Rationale for accessing COMPANY NAME, COMPANY ADDRESS, and/or FEIN"
- "Will the project results (including any reports, publications, visualizations, **job boards and products**) be provided at no cost?"
- "If results have a cost associated, or are otherwise not publicly available, please explain."
- "Is there current or planned funding for this project?"

The page also states NASWA "will review each researcher's credentials... evidenced
by appropriate documentation (i.e., curriculum vitae)" and mentions IRB approval.

### INFERENCE

Three things follow.

1. **The stated "ONLY" list excludes this product as written.** A solo developer
   building an ongoing consumer product is neither a state workforce agency nor a
   discrete nonprofit research project.
2. **But the CareerOneStop Jobs API is a distinct channel from the Research Hub
   feed**, and CareerOneStop describes its Jobs API as "optimized to support job
   search applications" while the Research Hub is "optimized for research."
   The "public job board" paragraph exists precisely to route job-board
   applicants somewhere other than the Research Hub. So there is a real door.
3. **That door is only open if the job listings are free to everyone.** "Public
   job board" is defined as no cost to job seekers, employers, *and* the public
   workforce system. And paywalled boards are explicitly named in the
   not-currently-authorized bucket. Per `MEMORY.md`, the log is free permanently
   and only Guided assist is paid — so the honest application is "the job listings
   and events are free to all users; a separate unrelated feature is paid." That
   is answerable on the form, in the box that asks exactly this. It is a
   discretionary human decision, not a rule that clearly bars us.

**This is the single highest-risk dependency in the whole pivot, and it has a
2-3 week review clock plus a signed data use agreement.** It should be applied
for on day one, not after the product is built.

### EVIDENCE — the CareerOneStop licence, for the non-Jobs APIs

The registration page (`/Developers/WebAPI/registration.aspx`) is itself a click
licence: "DEED CareerOneStop Data ('COS Data') Sharing and Use/Display Click
License Agreement". Verbatim conditions:

> - **Use of Data.** COS Data may be used and displayed only for the specific
>   purpose(s) identified by the licensee above and in the manner described herein;
> - **No Modification of Data.** COS data will not be modified or altered in any manner;
> - **No Spoofing.** ...
> - **No Pornography.** ...
> - **Your Use Must Comply with Law.** ...
> - **You Must Acknowledge Source of Data.** All use and/or display of COS data
>   must include, **on each web page where COS data appears**, appropriate
>   attribution wording giving acknowledgement to both the United States
>   Department of Labor Employment and Training Administration ("DOLETA") and the
>   Minnesota Department of Employment & Economic Development ("DEED");
> - **Use Must Not Infringe.** ...
> - **You Have No Ownership Rights.** ...
> - **No Assignments.** The license... is not assignable or transferable...
> - **Changes to Your Information.** ...
> - **Cost. The license granted by this Agreement is royalty-free;**
> - **Duration. The license granted by this Agreement will expire 36 months from
>   the date you submit your application.**

Plus:

> CareerOneStop Geocoding is provided through a license agreement with Microsoft.
> Your use of the data is subject to the Microsoft Bing Maps Terms of Service...
> **You may use the Geocodes locally in your applications. But, Geocodes cannot be
> stored, copied or shared.**

And:

> Applicant acknowledges that the license contemplated herein **is not granted by
> submission of this application**, but shall be granted subject to the terms
> herein upon notification from licensor (CareerOneStop).

Registration form fields: type of request, organization name, organization URL,
first/last name, full postal address, city, state, ZIP, phone, email, and a free
text box: **"Where and how will data be used or displayed?"**

**Notably absent: any prohibition on commercial use or on charging money.** The
word "royalty-free" describes what DEED charges *us*. Nothing in the licence
forbids a paid product.

### INFERENCE on the licence

Workable, with four concrete engineering constraints:

- Attribution to DOLETA **and** DEED must appear on **every page** that shows the data. Not a footer on one About page.
- Data may not be modified. Reformatting for mobile is fine; rewriting titles, merging, or "cleaning up" employer names is a licence question.
- The free-text purpose box is binding — "may be used and displayed **only** for the specific purpose(s) identified." Write it broadly enough to cover the product as intended.
- Bing geocodes cannot be cached in Supabase. If we ever geocode via CareerOneStop, it has to be request-time only.
- Licence expires at 36 months. Diary it.

No published rate limit or quota. I grepped every developer page I fetched for
"rate limit", "per second", "per minute", "per day", "throttle", "quota" — zero
hits. Only result-set caps: `pageSize` max 250, `startRow` 0–500.

---

## 2. Coverage and quality of the Jobs data

### EVIDENCE — fields per posting

`List Jobs V2` returns, per posting, exactly this:

```json
{
  "JvId": "25206ecfe4954376b3943722f89fd1c08003",
  "JobTitle": "Staff Nurse/Charge Nurse",
  "Company": "The PARC Joliet Nursing",
  "DescriptionSnippet": "ITS AN EXCITING TIME AT PEARL PAVILION!!!! ...",
  "AcquisitionDate": "2024-05-28T06:24:04-04:00",
  "URL": "https://de.jobsyn.org/25206ecfe4954376b3943722f89fd1c08003",
  "Location": "Joliet, IL",
  "Fc": false
}
```

- **No salary field.** None.
- `DescriptionSnippet` is opt-in (`enableJobDescriptionSnippet=true`) and is the **first 250 characters only**.
- `Location` is a "City, ST" string. No lat/long, no ZIP.
- `AcquisitionDate` is when NLx ingested it, not when the employer posted it.

`Get Job By ID` (a second call, per job) returns the **full `Description`** plus
`OnetCodes` — so full text is available, at one extra request per job.

Query surface is good: keyword or O*NET code, location as city/state/ZIP/"US",
radius, `days` back, sort by relevance/jobtitle/company/location/acquisitiondate,
plus `companyName` and `locationFilter` filters. `keyword=0` returns everything
in a location — useful for a browse feed.

### EVIDENCE — the apply URL is real

I followed one live:

```
https://de.jobsyn.org/25206ecfe4954376b3943722f89fd1c08003
  -> HTTP 200
  -> https://jobs.apploi.com/view/6bn1a49299407?utm_source=national-labor-exchange-feed
```

That is a real ATS posting page on a real employer's applicant tracking system.
The redirect works and carries NLx attribution UTMs.

### EVIDENCE — NY volume and provenance

NY DOL's own "Job Bank" link (`dol.ny.gov/job-bank`) **redirects to
`https://myjobsny.usnlx.com/`**. New York's official state job bank *is* the NLx
feed. This is the same data.

Volume figures (from search results, i.e. weaker evidence than the above):
NLx describes "more than 4 million job openings... at any given time", sourced
from "over 25,000 corporate career websites and state job banks". NY DOL
materials describe the NY State Job Bank as "over 130,000 job listings."

### INFERENCE

This is **not stale aggregator noise**. NLx is fed by corporate career sites and
state job banks directly, not by scraping other boards, and the apply link lands
on the employer's own ATS. For a compliance-logging product, that is actually
*better* than Indeed: an employer-direct URL is a cleaner audit artifact than an
aggregator link.

Two real product limits:
- **No salary.** Salary filtering/display cannot be built on this. Users notice this immediately.
- **Two calls per job** to show a full description. With no published rate limit that is probably fine, but plan on caching (allowed — nothing forbids storing postings; only Bing geocodes are cache-barred).

---

## 3. NY DOL job fairs and career centre events — this one just works

### EVIDENCE

The Trumba calendar exposes **all three** machine-readable feeds, no key, no auth,
no registration:

```
200  https://www.trumba.com/calendars/nys-department-of-labor.ics
200  https://www.trumba.com/calendars/nys-department-of-labor.rss
200  https://www.trumba.com/calendars/nys-department-of-labor.json
```

Calendar name: `NYS Department of Labor Career Center Events`.

I fetched and parsed both. Measured:

| | `.ics` | `.json` |
|---|---|---|
| events returned | **410** | **200 (hard cap)** |
| date range | 2026-09-02 → **2027-08-26** | 2026-09-02 → 2026-09-23 |
| size | 1.11 MB | 542 KB |

The JSON cap is real and not adjustable — I tried `?limit=500`, `?count=500`,
`?days=90`, `?startdate=2026-10-01` and every one still returned exactly 200. The
`.ics` returns all 410 with no parameters at all. **Use the .ics.**

JSON event shape (per event): `eventID`, `title`, `description` (HTML),
`locationType`, `location`, `webLink`, `startDateTime`, `endDateTime`,
`dateTimeFormatted`, `allDay`, `canceled`, `repeats`, `seriesID`, `permaLinkUrl`,
`eventActionUrl`, plus a `customFields` array carrying the good stuff:

- **Career Center Location** — e.g. "Plattsburgh OneWorkSource"
- **Held At** — the full street address, e.g. `OneWorkSource<br />194 US Oval<br />Plattsburgh, NY 12903`
- **Event Type** — Workshop / Virtual Workshop / Job Fair / Recruitment / Information Session / Job Club
- **County** (38 distinct), **Region** (all 10 NY economic regions)
- **Language**
- **Registration Information** — free text with the phone number and a mailto link
- **Audience** — and this is the finding: the values include **`UI`**

That is New York State itself tagging which events are for unemployment-insurance
claimants. Measured across the 200-event JSON window:

- Event types: Workshop 62, Virtual Workshop 55, **Job Fair 18**, Information Session+Workshop 18, Recruitment 13, Information Session 9, Job Club 1
- 20 events are job-fair-shaped by title or type
- 137 of 200 carry a full street address
- 137 of 200 carry registration instructions
- 134 of 200 carry a `webLink`
- **13 of 200 are explicitly tagged `Audience: UI`**
- 48 distinct career-centre locations; busiest are Yonkers (62), Peekskill (30), CNY Works (20)

**One data-quality warning:** the top-level `locationType` field said `"In-Person"`
for all 200 events, including the 55 whose Event Type is "Virtual Workshop" and
whose `LOCATION` is literally "This is a virtual workshop, please click the Zoom
link below". **`locationType` is unreliable. Derive virtual-vs-in-person from the
`Event Type` custom field**, not from `locationType`.

### EVIDENCE — other states

Per-state slugs I guessed all 404'd on Trumba: `michigan-works`,
`texas-workforce`, `edd-california`, `pa-careerlink`, `ohio-means-jobs`,
`florida-commerce`, `nj-dol`, `illinois-department-of-employment-security`,
`virginia-works`, `wisconsin-dwd`. A web search for other state workforce
agencies on Trumba surfaced only New York.

### INFERENCE

This is the strongest single finding in this document. It is free, needs no
permission, needs no key, no review board, no agreement, and it is **already
segmented by the exact audience the product serves**. A cron job that pulls one
1.1 MB `.ics` file and writes 410 rows to Supabase is perhaps a day of work, and
it produces something no competitor is showing on a phone.

It is also, per the evidence, **bespoke per state**. New York is done in a day.
State #2 is fresh discovery work with no guarantee of a feed at the end of it.
That is fine — the product is NY-first anyway.

---

## 4. American Job Centers API

### EVIDENCE

`List AJCs by Location` takes location (city/state/ZIP), radius, and filters for
centerType / youthServices / workersServices / businessServices. Returns:

```json
{
  "ID": "11232935",
  "Name": "Anchorage Job Center Midtown",
  "Address1": "3301 Eagle Street", "Address2": "Suite 101",
  "City": "Anchorage", "StateAbbr": "AK", "Zip": "99503",
  "Phone": "907-269-4759", "Fax": "907-269-4825",
  "Distance": "",
  "ProgramType": "Comprehensive Center",
  "OpenHour": "Monday-Friday, 8:00am - 5:00pm",
  "CenterIsOpen": "Y", "WhyClosed": "", "CenterStatus": "",
  "VeteranRep": "Yes", "BusinessRep": "Yes",
  "GeneralEmail": "midtown.jobcenter@alaska.gov",
  "Latitude": 61.190218, "Longitude": -149.873924,
  "WebSiteUrl": "http://jobs.alaska.gov/offices/",
  "WorkersServices": [
    {"ServiceName": "Dealing with a Loss of a Job"},
    {"ServiceName": "Finding Work"},
    {"ServiceName": "Getting Skills and Education"},
    {"ServiceName": "Planning your career"},
    {"ServiceName": "Workshops"}
  ]
}
```

There is also a `Get All AJCs` endpoint returning every record in one call.

Note the sample record's `"LastUpdated": "03/01/2018"`.

### INFERENCE

Yes, this does exactly what was asked: nearest office, address, phone, hours,
email, lat/long, and a services list that includes "Dealing with a Loss of a Job".
`Get All AJCs` means we can pull the whole national set once and store it, so this
costs one call, not one call per user.

Two cautions. The `LastUpdated: 2018` in the docs' own sample suggests records can
go years without refresh — hours and phone numbers may be wrong, and the UI should
say "call ahead". And the lat/long are the Bing-licensed geocodes the licence says
**cannot be stored**. Storing the address and rendering distance is fine; caching
`Latitude`/`Longitude` is the thing the licence names.

This API is gated by the same CareerOneStop registration but **not** by the NLx
governance board. It is far easier to get than Jobs.

---

## 5. Alternatives

### USAJOBS — free, self-serve, permissive, but federal-only

EVIDENCE. Requires a key (`https://data.usajobs.gov/api/search` returned HTTP 401
unauthenticated). Published limits are result-set caps only:

> **Search Jobs API** — Defaults to only "Public" jobs. Maximum of 10,000 rows per
> query. Maximum of 500 rows per page.
> **Code List API** — No limits. **Dynamic Search** — No limits.

The Terms of Use page contains only a boilerplate federal system-use notice
(authorized users, monitoring, no defacement/DoS). **It contains no commercial-use
restriction, no attribution requirement, and no redistribution clause.**

INFERENCE. The most permissive source of the lot, and the least useful — federal
postings only, a small slice of what an unemployed New Yorker needs. Worth adding
as a supplementary source; not a foundation.

### NYC Open Data "Jobs NYC Postings" — free, no key at all, and rich

EVIDENCE. Socrata endpoint, **no authentication whatsoever**:

```
$ curl "https://data.cityofnewyork.us/resource/kpav-sd4t.json?$select=count(*)"
[{"count":"2923"}]
```

Fresh — most recent `posting_date` is `2026-08-31` (yesterday). Fields include
`business_title`, `agency`, `job_category`, `career_level`,
`full_time_part_time_indicator`, **`salary_range_from`, `salary_range_to`,
`salary_frequency`**, `work_location`, **full `job_description`**,
`minimum_qual_requirements`, `preferred_skills`, `residency_requirement`,
`posting_date`, `post_until`, `number_of_positions`.

INFERENCE. 2,923 postings is small, but this is the one source that has
**salary and full descriptions with zero gatekeeping**, it is NYC-focused (the
largest concentration of NY claimants), and city jobs are exactly what a
long-term-unemployed claimant is often steered toward. It is the ideal source to
build and demo the entire jobs UI against **while the NLx request sits in
review**. That de-risks the whole plan.

### O*NET Web Services — occupation data, not jobs

EVIDENCE. Free registration, 5,100+ registered users, covers 900+ occupations,
database updated quarterly. Site content is licensed **Creative Commons
Attribution 4.0 International**. It provides occupational data — skills, tasks,
wages context — **not job openings**.

INFERENCE. Useful for keyword expansion (map a user's job title to an O*NET code,
then query CareerOneStop by code — which its Jobs API explicitly supports). Not a
listings source.

### Does any of this recreate the Indeed problem?

Direct answer: **no, with one exception I want to name.**

The Indeed problem was scraping a site whose ToS forbids automation, then driving
its UI. Every source above is a **published API or feed the publisher offers on
purpose**, with a written licence. That is a categorically different posture: we
would be an invited consumer, not an unwanted one.

The exception: **do not scrape `myjobsny.usnlx.com`.** It is tempting, because it
is NY's public job bank and its `robots.txt` reads:

```
User-agent: *
Disallow: /*feed/
Disallow: /*feeds/
Allow: /
Sitemap: https://myjobsny.usnlx.com/sitemaps/index.xml
```

That looks permissive. It is a trap. The sitemap index points to exactly one child
(`pages.xml`, 8 URLs) — **there is no crawlable index of job postings**, so
harvesting listings would mean systematically walking pages the site does not
offer, to obtain the *same NLx data the governance board controls*. Doing that
after being told the use case needs approval is worse than the Indeed situation,
not better, because here we would be knowingly routing around a named permission
process run by the state agencies we want as allies. The `Disallow: /*feeds/` line
is the operator saying the machine-readable path is not for us.

---

## 6. The killer question — is this fatally flawed?

**No. But it is two projects with two very different risk profiles, and they must
not be scheduled as one.**

Nothing here is a cost problem: every source is free, and the CareerOneStop
licence is explicitly "royalty-free" with no clause against commercial products.
Nothing here is a technical problem: JSON and iCal over HTTPS, trivially served
from Next.js API routes on Vercel with Supabase as the cache, all mobile-friendly
because it is our own UI. Nothing here is the Indeed problem: these are published
APIs with written licences.

The one real risk is **permission, on the jobs half only**:

- The NLx Data Trust Governance Board currently authorizes two use cases, and this product is neither of them.
- Their own text names "product development, platform integration, job matching" and fee-limited job boards as things you must *ask* about.
- Review is 2–3 weeks and ends in a signed data use agreement, or a denial with a stated justification.
- The application form is built for a Principal Investigator with a CV and a methodology, which is an awkward costume for a solo developer.

That risk is **mitigable and should be mitigated in this order**:

1. **Submit the NLx data request now, today, before writing code.** It is free and the clock is 2–3 weeks. Lead with the "public job board" definition — the job listings and events are free to every user at no cost, which is the definition they published. Answer "if results have a cost associated" honestly: a separate, unrelated assist feature is paid; the listings are not.
2. **Register for CareerOneStop separately for the non-Jobs APIs** (American Job Centers, Unemployment, State Resources, LMI). Same click-licence, no governance board. This gets the "your nearest office" feature shipped regardless of the Jobs outcome.
3. **Build and ship the events feature immediately.** It needs nobody's permission and it is the most differentiated thing in the pivot.
4. **Build the jobs UI against NYC Open Data** while the NLx request is in review. Real postings, real salaries, real descriptions, zero gatekeeping. If NLx approves, swap the adapter. If NLx denies, the feature still exists — smaller, but alive.

If the answer must be one sentence: **the events data and the office data are
buildable this week with no permission; the jobs data is buildable only if a
governance board says yes, so ask them before you build anything that assumes it.**

---

## What I could not verify

- **Whether the NLx Governance Board would actually approve this specific product.** The published "ONLY" list excludes it; the "public job board" paragraph appears to admit it. Only submitting the request resolves this. I could not find a public register of past approvals or denials.
- **Whether the CareerOneStop Jobs API can be granted independently of the Research Hub's authorized-use list.** CareerOneStop says the same board reviews Jobs requests, but describes its own API as serving job-search applications and the Hub's as serving research. Whether the board applies the same "ONLY" list to both, I cannot tell from public text.
- **Actual approval turnaround.** "2–3 weeks" is the stated board-review window, not the end-to-end time including NASWA pre-review, clarification rounds, and data-use-agreement signature.
- **Whether requests are being accepted right now.** The page says "When the NLx Research Hub *begins* accepting requests for data, each request will follow the procedures outlined below" — future tense. Both JotForms load and appear functional (HTTP 200), but I could not confirm anyone is processing submissions. (An earlier automated check of mine flagged the forms as possibly closed; that was a false positive matching CSS and a "multiple submissions disabled" setting. The forms look live.)
- **Real NY posting counts in the Jobs API.** The "4 million nationwide" and "over 130,000 NY listings" figures come from web search results and NLx/NY DOL marketing copy, not from an API call. I could not call the API without a key, and the public CareerOneStop Job Finder renders results via JavaScript, so its "250 job postings" string is a download cap, not a total.
- **Whether Jobs API postings are current.** All sample responses in the documentation are dated May–July 2024, which is a docs-staleness artifact and tells us nothing about live freshness. The one live apply URL I followed resolved to an active ATS posting, which is one data point, not a freshness measurement.
- **Any unpublished rate limit.** I found no rate-limit language anywhere on the CareerOneStop developer pages. Absence of a published limit is not evidence of no limit.
- **The "CareerOneStop Web Services Agreement Summary" and the separate "CareerOneStop terms and conditions"**, both referenced by checkbox on the registration page. I captured the click-licence body in full; those two linked documents I did not retrieve. `careeronestop.org/Developers/Data/terms-of-use.aspx` and `/Developers/Data/data-requests.aspx` both 404.
- **Whether other states publish event feeds.** I proved ten guessed Trumba slugs 404 and found no other state agency on Trumba via search. I did not survey the other 49 states for non-Trumba event feeds, so "bespoke per state" is an inference from a negative result, not a completed survey.
- **Trumba's `filterN` query syntax.** `?filter1=_xd_33096` returned a valid but empty array, so filtering is likely supported server-side; I could not determine the correct value format. Not blocking — filter the 410 events locally.
- **Whether the `.ics` 410-event / 12-month horizon is a fixed cap** or simply everything NY DOL has scheduled. If it is a cap, longer-horizon events would be invisible.
- **USAJOBS field schema and real NY volume** — I read the terms and rate-limit pages but could not call the search API without a key, and the getting-started page returned an application error.
- **O*NET's specific rate limits and whether CC-BY 4.0 covers the Web Services *data*** as opposed to the website pages. `services.onetcenter.org/help/limits` 404s; the CC-BY notice I captured was in the site footer.
