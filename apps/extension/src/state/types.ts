// The run domain model. A "run" is one guided-autofill session over an Indeed
// Easy-Apply flow, which spans multiple pages, with a per-page review gate and
// NO auto-submit. This file defines the state shape, the actions that drive it,
// and the effects the controller executes — nothing here imports `chrome`, so
// the reducer (state/machine.ts) is a pure function testable without a browser.

import type { FormField } from "@applyassistui/automation/types";

// ── Status lifecycle ───────────────────────────────────────────────────────────
// starting → scanning → filling → review → advancing ─┐
//     ▲                                                │ (nav to next page)
//     └────────────────────────────────────────────────┘
// Terminal: done | error. Absence of a run is represented by `null`, not a
// status.
export type RunStatus =
  | "starting" // run created; scan command broadcast, waiting for a form frame
  | "scanning" // waiting on scan-result from the form frame
  | "filling" // scan done; fill command sent, waiting on fill-result
  | "review" // page filled; awaiting the user's review-gate decision
  | "paused" // user took manual control; assist idle until they resume
  | "advancing" // user approved; Continue clicked, waiting for next page nav
  | "done" // flow finished (submitted or no more forms)
  | "error"; // halted; state retained for debugging

/** A user's verdict at the per-page review gate. */
export type ReviewDecision = "approved" | "edited" | "rejected";

/** Job identity captured during a run, for the compliance activity log. */
export interface JobMeta {
  title: string | null;
  company: string | null;
  url: string | null;
}

/** Append-only breadcrumb for debugging a run (capped in the reducer). */
export interface RunEvent {
  /** Millisecond timestamp; supplied by the controller (machine stays pure). */
  at: number;
  status: RunStatus;
  note: string;
}

export interface RunState {
  runId: string;
  tabId: number;
  status: RunStatus;
  /** 0-based index of the current page within the multi-page flow. */
  pageIndex: number;
  /** Frame id of the frame that holds the form (Indeed iframes the flow). */
  formFrameId: number | null;
  /** Questions scanned on the current page. */
  questions: FormField[];
  /** question-key → answer for the current page (populated by the template in M-B4). */
  answers: Record<string, string>;
  /** The user's answer template, snapshotted once per run (typed in M-B4). */
  templateSnapshot: unknown | null;
  /** The review-gate verdict for the current page, or null until decided. */
  reviewDecision: ReviewDecision | null;
  /** Job identity captured during the run (first non-null wins); for the log. */
  job: JobMeta | null;
  events: RunEvent[];
  /** Set when status is "error". */
  error?: string;
}

// ── Actions ─────────────────────────────────────────────────────────────────────
// The reducer consumes Actions. Some map 1:1 to wire messages from the content
// script; others (nav-completed, no-form, tick) are internal signals the
// controller synthesizes from chrome.webNavigation / timers. `at` carries the
// timestamp so the machine never reads the clock.

export type Action =
  | { type: "start-run"; tabId: number; runId: string; at: number }
  | { type: "cancel-run"; at: number }
  | { type: "scan-result"; runId: string; frameId: number; questions: FormField[]; job: JobMeta | null; at: number }
  | { type: "fill-result"; runId: string; at: number }
  | { type: "review-decision"; runId: string; decision: ReviewDecision; at: number }
  | { type: "pause-run"; runId: string; at: number }
  | { type: "resume-run"; runId: string; at: number }
  | { type: "nav-completed"; tabId: number; at: number }
  | { type: "no-form"; runId: string; at: number }
  | { type: "run-error"; runId: string; reason: string; at: number };

// ── Effects ──────────────────────────────────────────────────────────────────────
// The reducer returns effects describing side-effects; the controller performs
// them. Persisting the returned state is implicit (the controller always writes
// it) and is not an effect.

/** A command delivered to a content-script frame via tabs.sendMessage. */
export type ContentCommand = "scan" | "fill" | "review" | "advance";

export type Effect =
  | {
      kind: "send-command";
      tabId: number;
      /** Omit to broadcast to all frames in the tab (used to find the form frame). */
      frameId?: number;
      command: ContentCommand;
      /** The run this command belongs to, so content can ignore stale commands. */
      runId: string;
    }
  | { kind: "clear-run" }
  | { kind: "arm-no-form-timeout"; tabId: number; runId: string }
  /** Flow completed (submitted): ask the content script to confirm logging it. */
  | { kind: "confirm-log"; tabId: number; job: JobMeta };

export interface ReduceResult {
  state: RunState | null;
  effects: Effect[];
}
