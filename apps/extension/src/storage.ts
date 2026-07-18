// Typed wrapper over chrome.storage.local.
//
// The POC used chrome.storage.session, which lives only in the running
// execution context and is WIPED when the MV3 service worker is killed (~30s
// idle) — exactly the run state we must not lose. chrome.storage.local persists
// to disk and survives both worker death and page navigation, so all durable
// extension state lives here.
//
// The schema is intentionally small for M-B1; later milestones extend
// StorageSchema (activeRun gets a real RunState type in M-B2, auth is populated
// in M-B3).

import type { AuthPayload } from "./messages";
import type { RunState } from "./state/types";

/** A user-defined "if the question contains X, answer Y" rule. */
export interface CustomRule {
  /** Case-insensitive substring matched against the question text. */
  match: string;
  /** The answer to apply (plain text, or a Yes/No/option label). */
  answer: string;
}

/**
 * The user's local answer template (Option A — extension-local, pre-web-app).
 * `config` overrides fields on DEFAULT_CONFIG; `rules` are custom question
 * matches that take priority over the built-in ruleset. Same shape the web-app
 * template will later sync into.
 */
export interface AnswerTemplate {
  config: Record<string, string>;
  rules: CustomRule[];
}

/** Cached result of the web-app entitlement probe (M-B3). */
export interface Entitlement {
  signedIn: boolean;
  entitled: boolean;
  email: string | null;
  /** Epoch ms when the web bridge last reported this. */
  checkedAt: number;
}

export interface StorageSchema {
  /** Supabase session handed off from the web app; null when signed out. */
  auth: AuthPayload | null;
  /** The in-flight run for the active tab; null when idle. */
  activeRun: RunState | null;
  /** Per-tab page-load counters, keyed by tab id. Replaces the POC counter. */
  loadCounts: Record<number, number>;
  /** The user's local answer template; null until they save one. */
  template: AnswerTemplate | null;
  /** Last entitlement seen from the signed-in web app; null until first check. */
  entitlement: Entitlement | null;
}

const DEFAULTS: StorageSchema = {
  auth: null,
  activeRun: null,
  loadCounts: {},
  template: null,
  entitlement: null,
};

/** Read a key, falling back to its schema default when unset. */
export async function getItem<K extends keyof StorageSchema>(
  key: K,
): Promise<StorageSchema[K]> {
  const data = await chrome.storage.local.get(key);
  return (key in data ? data[key] : DEFAULTS[key]) as StorageSchema[K];
}

/** Write a key. */
export async function setItem<K extends keyof StorageSchema>(
  key: K,
  value: StorageSchema[K],
): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

/** Delete a key (subsequent reads fall back to the schema default). */
export async function removeItem(key: keyof StorageSchema): Promise<void> {
  await chrome.storage.local.remove(key as string);
}

/**
 * Read-modify-write a key atomically enough for the worker's single-threaded
 * message loop (chrome.storage has no CAS, but handlers don't interleave).
 */
export async function updateItem<K extends keyof StorageSchema>(
  key: K,
  fn: (current: StorageSchema[K]) => StorageSchema[K],
): Promise<StorageSchema[K]> {
  const next = fn(await getItem(key));
  await setItem(key, next);
  return next;
}

/**
 * Subscribe to changes of a single key in the `local` area. Returns an
 * unsubscribe function.
 */
export function onChange<K extends keyof StorageSchema>(
  key: K,
  cb: (value: StorageSchema[K] | undefined) => void,
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === "local" && key in changes) {
      cb(changes[key].newValue as StorageSchema[K] | undefined);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
