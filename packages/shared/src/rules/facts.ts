// Hand-checked facts: what a state's own page literally says, with the URL and
// the date a human read it.
//
// THE INVARIANT: a Fact cannot exist without a Source. That is enforced by the
// type, not by review — `AnswerBubble` takes a non-nullable source prop, so
// rendering an uncited answer is a compile error.
//
// `text` is a VERBATIM quotation. Not a summary, not a tidy-up, not a merge of
// two sentences. If the page says something awkwardly, quote it awkwardly. The
// whole legal posture of this feature is "we are showing you what your state
// published", and that stops being true the moment someone improves the wording.
//
// Keep dependency-free, like the rest of @jobassistui/shared.

import type { TopicKey } from "./topics";

export interface Source {
  /** How the agency names the document. */
  name: string;
  url: string;
  /**
   * Host + path as plain text, for the screenshot watermark. A screenshot keeps
   * words and loses hyperlinks, so this renders as text, never as an <a>.
   */
  display: string;
  /** YYYY-MM-DD. The day a human opened this URL and read this text. */
  verified_on: string;
}

export type Fact =
  | {
      kind: "quote";
      topic: TopicKey;
      /** Verbatim from the source page. Capped at 600 chars — see MAX_QUOTE_LEN. */
      text: string;
      source: Source;
      /**
       * Hand-set by whoever wrote the row, never parsed out of `text`. Drives
       * the "set my weekly target" nudge. Absent when the state has no single
       * number, which is the common case.
       */
      suggested_weekly_target?: number;
    }
  | {
      kind: "varies";
      topic: TopicKey;
      varies_by: string;
      text: string;
      lookup: { label: string; url: string };
      source: Source;
    }
  | {
      kind: "refer";
      topic: TopicKey;
      text: string;
      source: Source;
    };

export interface StateFacts {
  abbr: string;
  facts: Fact[];
}

/**
 * Quotes longer than this make answer bubbles taller than a phone screenshot,
 * which defeats the watermark. Asserted in unit tests, not just documented.
 */
export const MAX_QUOTE_LEN = 600;

/**
 * Past this, an answer still renders but gains an amber "I last checked this on
 * X" line. Degrade honestly rather than going quietly stale — NY shipped three
 * handbook revisions in about seven months.
 */
export const MAX_FACT_AGE_DAYS = 180;

// ─── Helpers ────────────────────────────────────────────────────────────────

export function daysSince(isoDate: string, now: Date = new Date()): number {
  const then = new Date(`${isoDate}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

export function isStale(source: Source, now: Date = new Date()): boolean {
  return daysSince(source.verified_on, now) > MAX_FACT_AGE_DAYS;
}
