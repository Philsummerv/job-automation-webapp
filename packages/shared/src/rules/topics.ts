// Topics the Rules Assistant can answer, and — critically — which sources each
// topic is allowed to draw from.
//
// THE SAFETY RULE THIS FILE ENFORCES: the model classifies a question into a
// TopicKey and nothing else. It never picks a source, a domain, or a lane. Code
// looks the lane up here. So the worst a misclassification can do is answer the
// wrong *rules* question from an official source — it can never route a rules
// question to community content.
//
// Keep this file dependency-free, like the rest of @jobassistui/shared.

// ─── Topics ─────────────────────────────────────────────────────────────────

export const TOPICS = [
  // Official-only. These are the ones where a wrong answer costs someone money.
  {
    value: "activity_count",
    label: "How many activities do I need each week?",
    lane: "official",
  },
  {
    value: "what_counts",
    label: "What counts as a work search activity?",
    lane: "official",
  },
  {
    value: "certification_schedule",
    label: "When do I have to certify or claim?",
    lane: "official",
  },
  {
    value: "proof_required",
    label: "What proof do I need to keep?",
    lane: "official",
  },
  {
    value: "records_retention",
    label: "How long do I keep my records?",
    lane: "official",
  },
  {
    value: "exemptions",
    label: "Can the work search requirement be waived?",
    lane: "official",
  },
  {
    value: "registration",
    label: "Do I have to register with the state job service?",
    lane: "official",
  },
  {
    value: "how_to_report",
    label: "How do I report my activities?",
    lane: "official",
  },
  {
    value: "refusing_work",
    label: "What happens if I turn down a job?",
    lane: "official",
  },

  // Community-allowed. No official answer exists for these, and being wrong
  // costs someone time rather than benefits.
  {
    value: "portal_errors",
    label: "The website isn't working — what do people do?",
    lane: "community",
  },
  {
    value: "processing_times",
    label: "How long do things usually take?",
    lane: "community",
  },
  {
    value: "what_to_expect",
    label: "What should I expect from the process?",
    lane: "community",
  },
  {
    value: "staying_organized",
    label: "How do people keep track of all this?",
    lane: "community",
  },
] as const;

export type TopicKey = (typeof TOPICS)[number]["value"];
export type Lane = "official" | "community";

export const TOPIC_KEYS = TOPICS.map((t) => t.value) as readonly TopicKey[];

export function topicLabel(v: TopicKey): string {
  return TOPICS.find((t) => t.value === v)?.label ?? v;
}

// ─── Lane lookup ────────────────────────────────────────────────────────────

/**
 * Topic -> allowed source lane. A plain table, deliberately not a model output.
 * `apps/web/lib/classify.ts` must NOT import this file or the directory — the
 * classifier has no access to any domain string, so it cannot express one even
 * if a future prompt tried to make it.
 */
export const TOPIC_LANE: Record<TopicKey, Lane> = TOPICS.reduce(
  (acc, t) => {
    acc[t.value] = t.lane;
    return acc;
  },
  {} as Record<TopicKey, Lane>,
);

export function laneFor(topic: TopicKey): Lane {
  // No default. An unmapped topic is a build error via TOPIC_LANE's Record type,
  // not a silent fall-through to the permissive lane.
  return TOPIC_LANE[topic];
}

/** Rules topics can never reach community sources. Asserted in unit tests. */
export const OFFICIAL_ONLY_TOPICS: readonly TopicKey[] = TOPICS.filter(
  (t) => t.lane === "official",
).map((t) => t.value);

/**
 * Some practical topics are state-specific ("the NY portal logs me out"), some
 * are not ("how do people stay organized"). Global ones cache under '*', which
 * is why their hit rate is high after the first week.
 */
export const COMMUNITY_SCOPE: Record<string, "state" | "global"> = {
  portal_errors: "state",
  processing_times: "state",
  what_to_expect: "global",
  staying_organized: "global",
};

// ─── Classifier confidence gates ────────────────────────────────────────────
//
// Asymmetric on purpose: the two misclassification directions have very
// different costs. Routing a community question to the official lane produces a
// safe, boring answer. Routing a rules question to community content is the
// failure that ends the product.

/** Below this, don't answer at all — fall through to the state's phone number. */
export const MIN_CONFIDENCE_OFFICIAL = 0.6;

/** Community needs a higher bar. Failing it falls back to OFFICIAL, not to nothing. */
export const MIN_CONFIDENCE_COMMUNITY = 0.8;
