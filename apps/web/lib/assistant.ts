// Rules Assistant — refusal list, retrieval, and answer composition.
//
// Pure functions only: no network, no Supabase, no model. That's deliberate —
// every safety rule in this feature is unit-testable because none of it depends
// on a service being up or a model behaving.
//
// THE ORDERING IS THE SAFETY DESIGN. The route handler must call these in this
// order, and the order matters more than any individual check:
//
//   1. Auth
//   2. Cap the input at 500 chars
//   3. checkRefusal() on the RAW string — before any model call, any retrieval
//   4. variesShortCircuit() — TX/FL count questions, no model, no cost
//   5. Classify (only if no topic came from a button)
//   6. laneFor(topic) — a table lookup, never a model output
//   7. Retrieve
//   8. Log
//
// Refusal runs at step 3 because a question about someone's eligibility must
// cost zero tokens and touch nothing. It is not a filter on the answer; it is a
// gate before the machinery starts.

import {
  getFact,
  getJurisdiction,
  variesFor,
  isStale,
  topicLabel,
  type Fact,
  type Jurisdiction,
  type Source,
  type TopicKey,
} from "@jobassistui/shared";

// ─── Input caps ─────────────────────────────────────────────────────────────

/** A work-search question is a sentence. Longer is a paste or an attack. */
export const MAX_QUESTION_LEN = 500;

export function capQuestion(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .slice(0, MAX_QUESTION_LEN);
}

// ─── The refusal list ───────────────────────────────────────────────────────
//
// A table of categories rather than one regex blob, so the log records WHAT
// people wanted to ask. Those counts are the most useful product signal in the
// feature: they tell you what the tool doesn't do that people need.
//
// This over-refuses. "Does a letter count as a contact?" trips `determination`.
// That is the correct trade — but every refusal must offer the topic buttons
// again, so over-refusal costs one click rather than dead-ending someone.
//
// It also under-refuses on non-English and oblique phrasings ("my ex-boss says I
// quit"). That's covered downstream, not here: the topic enum has no eligibility
// key, so a missed refusal lands on a wrong-but-safe rules topic rather than on
// a benefits determination.

export type RefusalCategory =
  | "eligibility"
  | "amount"
  | "appeal"
  | "overpayment"
  | "fraud"
  | "determination";

const REFUSAL_PATTERNS: { category: RefusalCategory; patterns: RegExp[] }[] = [
  {
    category: "eligibility",
    patterns: [
      /\b(do|will|am|would) i\b[^?]*\b(qualify|eligible)\b/i,
      /\beligib/i,
      /\bdisqualif/i,
      /\bdenied\b/i,
      /\bturned down\b/i,
      /\bcan i (still )?(get|collect|claim)\b/i,
    ],
  },
  {
    category: "amount",
    patterns: [
      /\bhow much\b/i,
      /\bweekly benefit (amount|rate)\b/i,
      /\bwba\b/i,
      /\bback ?pay\b/i,
      /\bmy payment\b/i,
      /\bhaven'?t been paid\b/i,
    ],
  },
  {
    category: "appeal",
    patterns: [/\bappeal/i, /\bhearing\b/i, /\balj\b/i, /\bjudge\b/i],
  },
  {
    category: "overpayment",
    // `\boverpa` not `\boverpay` — "overpaid" splits as overpai-d, so the
    // narrower pattern silently missed the most common phrasing of this
    // question. Caught by the unit check; don't tighten it back.
    patterns: [/\boverpa/i, /\bwaiver\b/i, /\brepay/i, /\bcollections?\b/i, /\bpay (it )?back\b/i],
  },
  {
    category: "fraud",
    patterns: [/\bfraud\b/i, /\bpenalt/i, /\binvestigat/i, /\baccused\b/i],
  },
  {
    category: "determination",
    patterns: [
      /\bdetermination\b/i,
      /\bmonetary\b/i,
      /\bletter\b/i,
      /\bnotice i (got|received)\b/i,
      /\bthis letter\b/i,
    ],
  },
];

/** Returns the category to refuse under, or null to proceed. */
export function checkRefusal(question: string): RefusalCategory | null {
  for (const { category, patterns } of REFUSAL_PATTERNS) {
    if (patterns.some((p) => p.test(question))) return category;
  }
  return null;
}

/** Exported for the unit test that asserts no topic-button label trips the list. */
export const REFUSAL_CATEGORIES = REFUSAL_PATTERNS.map((r) => r.category);

// ─── Answer shapes ──────────────────────────────────────────────────────────

export type AnswerKind =
  | "checked" // hand-verified fact from the repo
  | "varies" // state has no single statewide number
  | "refusal" // hit the refusal list
  | "no_jurisdiction" // we have no directory row for this state yet
  | "no_answer"; // we have the state, but not this topic

export interface Contact {
  agency: string;
  phone: string;
  url: string;
}

export interface Answer {
  kind: AnswerKind;
  topic: TopicKey | null;
  /** Plain sentence introducing the block. A template string, never generated. */
  lead: string;
  /** The verbatim quote, when there is one. */
  body: string | null;
  source: Source | null;
  /** Renders the amber "I last checked this on X" line. */
  stale: boolean;
  lookup?: { label: string; url: string };
  contact: Contact;
  refusal_reason?: RefusalCategory;
  /** Only set on activity_count for a state with a hand-set number. */
  suggested_weekly_target?: number;
}

function contactOf(j: Jurisdiction): Contact {
  return {
    agency: j.agency_name,
    phone: j.agency_phone,
    url: j.work_search_url ?? j.handbook_url,
  };
}

// ─── User-facing copy ───────────────────────────────────────────────────────
//
// Source of truth is docs/legal/chatbot-disclaimers.md. Keep these in sync with
// that file — it's what a lawyer would be handed to review.

export const DISCLAIMER_BAR =
  "Not legal advice. Not the unemployment office. Always check the source link.";

export const WATERMARK_HEADER = "JobAssistUI — general info, not legal advice";

export function refusalCopy(category: RefusalCategory, c: Contact): string {
  const what: Record<RefusalCategory, string> = {
    eligibility: "whether you qualify",
    amount: "what you're owed",
    appeal: "an appeal",
    overpayment: "an overpayment",
    fraud: "a fraud or penalty question",
    determination: "a letter you were sent",
  };
  return (
    `That one I have to leave alone. Questions about your own claim — including ` +
    `${what[category]} — only the state can answer, and a wrong answer from me ` +
    `could cost you money.\n\n${c.agency}: ${c.phone}\n\n` +
    `I can still help with the general rules if you want to ask something else.`
  );
}

// ─── Composition ────────────────────────────────────────────────────────────

export function refusalAnswer(
  category: RefusalCategory,
  j: Jurisdiction | null,
): Answer {
  const contact = j
    ? contactOf(j)
    : { agency: "your state unemployment office", phone: "", url: "" };
  return {
    kind: "refusal",
    topic: null,
    lead: refusalCopy(category, contact),
    body: null,
    source: null,
    stale: false,
    contact,
    refusal_reason: category,
  };
}

/**
 * States with no single statewide count short-circuit here — before any model
 * call and before any search. Cheaper, and it removes the chance of surfacing
 * one region's number and presenting it as statewide.
 */
export function variesShortCircuit(abbr: string, topic: TopicKey): Answer | null {
  if (topic !== "activity_count") return null;
  const j = getJurisdiction(abbr);
  const v = j ? variesFor(abbr) : null;
  if (!j || !v) return null;

  return {
    kind: "varies",
    topic,
    lead: `${j.name} doesn't set one number for the whole state — it depends on your ${v.by}.`,
    body: null,
    source: {
      name: v.lookup_label,
      url: v.lookup_url,
      display: v.lookup_url.replace(/^https?:\/\//, ""),
      verified_on: j.verified_on,
    },
    stale: false,
    lookup: { label: v.lookup_label, url: v.lookup_url },
    contact: contactOf(j),
  };
}

/** The checked tier: a pure lookup over committed data. */
export function checkedAnswer(abbr: string, topic: TopicKey): Answer | null {
  const j = getJurisdiction(abbr);
  if (!j) return null;
  const fact: Fact | null = getFact(abbr, topic);
  if (!fact) return null;

  const contact = contactOf(j);
  const base = {
    topic,
    stale: isStale(fact.source),
    source: fact.source,
    contact,
  };

  if (fact.kind === "varies") {
    return {
      ...base,
      kind: "varies",
      lead: `${j.name} doesn't set one number for the whole state — it depends on your ${fact.varies_by}.`,
      body: fact.text,
      lookup: fact.lookup,
    };
  }

  return {
    ...base,
    kind: "checked",
    lead: `Here's what ${j.agency_name} says about ${topicLabel(topic).toLowerCase().replace(/\?$/, "")}:`,
    body: fact.text,
    suggested_weekly_target:
      fact.kind === "quote" ? fact.suggested_weekly_target : undefined,
  };
}

/** We have the state's contact details but haven't checked this topic. */
export function noAnswerFor(abbr: string, topic: TopicKey | null): Answer | null {
  const j = getJurisdiction(abbr);
  if (!j) return null;
  const contact = contactOf(j);
  return {
    kind: "no_answer",
    topic,
    lead:
      `I don't have that one. I only answer from pages I've actually checked, ` +
      `and this isn't one of them yet.\n\nYour best bet is ${j.agency_name} ` +
      `directly: ${j.agency_phone}.`,
    body: null,
    source: null,
    stale: false,
    contact,
  };
}

/** No directory row at all. Honest, and never a dead end we invent our way out of. */
export function noJurisdictionAnswer(stateName: string): Answer {
  return {
    kind: "no_jurisdiction",
    topic: null,
    lead:
      `I haven't set up ${stateName} yet, so I don't have their official page ` +
      `or phone number to point you at. I'd rather tell you that than guess.`,
    body: null,
    source: null,
    stale: false,
    contact: { agency: `${stateName} unemployment office`, phone: "", url: "" },
  };
}

/**
 * The whole checked-tier pipeline, in the order the route must run it.
 * Returns an Answer for every input — there is no path that returns nothing.
 */
export function answerFromCheckedData(
  abbr: string,
  stateName: string,
  topic: TopicKey,
  rawQuestion: string,
): Answer {
  const j = getJurisdiction(abbr);

  // 3. Refusal, before anything else.
  const refusal = checkRefusal(rawQuestion);
  if (refusal) return refusalAnswer(refusal, j);

  if (!j) return noJurisdictionAnswer(stateName);

  // 4. varies short-circuit.
  const varies = variesShortCircuit(abbr, topic);
  if (varies) return varies;

  // 7. Retrieve.
  return checkedAnswer(abbr, topic) ?? noAnswerFor(abbr, topic)!;
}
