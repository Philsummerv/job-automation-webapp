// New York — hand-checked facts.
//
// Every `text` below was read off https://dol.ny.gov/services/ui/wsr on
// 2026-08-29 and copied character-for-character. Do not tidy the wording.
//
// NOTE ON RE-VERIFICATION: NY's handbook filename carries its revision date
// (ui-claimant-handbook_1-26.pdf) and changed three times in roughly seven
// months. When re-checking, open the URL, confirm the sentence still reads the
// same, and bump `verified_on`. If the sentence changed, replace the quote —
// don't patch it.
//
// DELIBERATELY ABSENT: a "must be on different days" fact. Secondary sources say
// NY requires activities on separate days; that sentence does not appear on the
// work-search requirements page, so it is not recorded here. If it turns up in
// the handbook PDF, add it with that PDF as its source.

import type { StateFacts, Source } from "../facts";

const WSR_PAGE: Source = {
  name: "NYS DOL — Work Search Requirements and Recordkeeping",
  url: "https://dol.ny.gov/services/ui/wsr",
  display: "dol.ny.gov/services/ui/wsr",
  verified_on: "2026-08-29",
};

export const NY: StateFacts = {
  abbr: "NY",
  facts: [
    {
      kind: "quote",
      topic: "activity_count",
      text:
        "You must complete and record at least THREE work search activities each week to be eligible for benefits.",
      source: WSR_PAGE,
      // Hand-set from the quote above by a human, not parsed from the string.
      suggested_weekly_target: 3,
    },
    {
      kind: "quote",
      topic: "what_counts",
      text:
        "Use employment resources available at a local Career Center or through a virtual Career Center platform provided by the Department of Labor.",
      source: WSR_PAGE,
    },
    {
      kind: "quote",
      topic: "records_retention",
      text:
        "If you choose to keep a paper Work Search Record, you must keep copies for one year.",
      source: WSR_PAGE,
    },
  ],
};
