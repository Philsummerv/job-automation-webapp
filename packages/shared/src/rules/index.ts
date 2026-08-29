// Rules Assistant data. Assembles the hand-checked facts and re-exports the
// directory, topics, and fact types.
//
// Two registries, deliberately separate:
//   DIRECTORY — contact + domains. Cheap to fill, needed for every jurisdiction.
//   FACTS     — what a state's page literally says. Expensive, so it's partial.
//
// A jurisdiction can be in DIRECTORY and absent from FACTS. That's the normal
// case, and it produces an honest answer (official link + phone) rather than a
// dead end. The reverse must never happen.

import type { StateFacts, Fact } from "./facts";
import type { TopicKey } from "./topics";
import { NY } from "./states/ny";

export * from "./topics";
export * from "./facts";
export * from "./directory";

/** Only jurisdictions a human has actually researched. Partial on purpose. */
export const FACTS: Record<string, StateFacts> = {
  NY,
};

/** True when we have hand-checked facts — a stronger claim than hasDirectoryEntry. */
export function hasFacts(abbr: string | null | undefined): boolean {
  if (!abbr) return false;
  return Boolean(FACTS[abbr.toUpperCase()]);
}

/**
 * Pure lookup. No network, no cache, no model — which is what makes the checked
 * tier unit-testable and impossible to get wrong at runtime.
 */
export function getFact(abbr: string, topic: TopicKey): Fact | null {
  const state = FACTS[abbr.toUpperCase()];
  if (!state) return null;
  return state.facts.find((f) => f.topic === topic) ?? null;
}

/** Topics we can answer from checked facts for this state. Drives the buttons. */
export function checkedTopicsFor(abbr: string): TopicKey[] {
  const state = FACTS[abbr.toUpperCase()];
  if (!state) return [];
  return state.facts.map((f) => f.topic);
}

/** Jurisdictions with hand-checked facts, for the coverage badge. */
export function factCoverage(): string[] {
  return Object.keys(FACTS).sort();
}
