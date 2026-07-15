// The run reducer: a PURE function `reduce(state, action) → { state, effects }`.
// No `chrome`, no timers, no I/O — the controller (background.ts) owns all of
// that. This is what makes the run logic testable without a browser: feed it a
// state and an action, assert on the next state and the emitted effects.

import type {
  Action,
  Effect,
  ReduceResult,
  RunEvent,
  RunState,
  RunStatus,
} from "./types";

const MAX_EVENTS = 50;

/** A stale message — its runId doesn't match the active run — is ignored. */
function isForActiveRun(state: RunState | null, runId: string): state is RunState {
  return state != null && state.runId === runId;
}

function withStatus(state: RunState, status: RunStatus, note: string, at: number, patch: Partial<RunState> = {}): RunState {
  const event: RunEvent = { at, status, note };
  return {
    ...state,
    ...patch,
    status,
    events: [...state.events, event].slice(-MAX_EVENTS),
  };
}

function noChange(state: RunState | null): ReduceResult {
  return { state, effects: [] };
}

export function reduce(state: RunState | null, action: Action): ReduceResult {
  switch (action.type) {
    // ── Start a run ──────────────────────────────────────────────────────────
    // Replaces any existing run (single active run at a time). Broadcast a scan
    // to every frame; the frame that owns the form answers with scan-result and
    // thereby reveals its frameId.
    case "start-run": {
      const fresh: RunState = {
        runId: action.runId,
        tabId: action.tabId,
        status: "starting",
        pageIndex: 0,
        formFrameId: null,
        questions: [],
        answers: {},
        templateSnapshot: null,
        reviewDecision: null,
        events: [{ at: action.at, status: "starting", note: "run created" }],
      };
      const scanning = withStatus(fresh, "scanning", "broadcast scan", action.at);
      const effects: Effect[] = [
        { kind: "send-command", tabId: action.tabId, command: "scan", runId: action.runId },
        { kind: "arm-no-form-timeout", tabId: action.tabId, runId: action.runId },
      ];
      return { state: scanning, effects };
    }

    // ── Cancel ───────────────────────────────────────────────────────────────
    case "cancel-run": {
      if (state == null) return noChange(state);
      return { state: null, effects: [{ kind: "clear-run" }] };
    }

    // ── Scan result ──────────────────────────────────────────────────────────
    // Only meaningful while scanning. Empty result = no form on this page →
    // the flow is done (e.g. the post-submit confirmation page).
    case "scan-result": {
      if (!isForActiveRun(state, action.runId)) return noChange(state);
      if (state.status !== "scanning") return noChange(state);

      if (action.questions.length === 0) {
        const done = withStatus(state, "done", "no questions — flow complete", action.at);
        return { state: done, effects: [{ kind: "clear-run" }] };
      }

      const filling = withStatus(
        state,
        "filling",
        `scanned ${action.questions.length} question(s)`,
        action.at,
        { formFrameId: action.frameId, questions: action.questions },
      );
      // NOTE(M-B4): answers are empty until template mapping lands; the fill
      // command still fires to exercise the channel end-to-end.
      return {
        state: filling,
        effects: [
          { kind: "send-command", tabId: state.tabId, frameId: action.frameId, command: "fill", runId: state.runId },
        ],
      };
    }

    // ── Fill result ──────────────────────────────────────────────────────────
    // Fill done → open the review gate (M-B5 renders the actual UI). NEVER
    // auto-advances; we wait for a review-decision.
    case "fill-result": {
      if (!isForActiveRun(state, action.runId)) return noChange(state);
      if (state.status !== "filling") return noChange(state);
      const review = withStatus(state, "review", "awaiting review", action.at, {
        reviewDecision: null,
      });
      const effects: Effect[] =
        state.formFrameId != null
          ? [{ kind: "send-command", tabId: state.tabId, frameId: state.formFrameId, command: "review", runId: state.runId }]
          : [];
      return { state: review, effects };
    }

    // ── Review decision ──────────────────────────────────────────────────────
    case "review-decision": {
      if (!isForActiveRun(state, action.runId)) return noChange(state);
      if (state.status !== "review") return noChange(state);

      if (action.decision === "rejected") {
        const done = withStatus(state, "done", "user rejected — run ended", action.at, {
          reviewDecision: "rejected",
        });
        return { state: done, effects: [{ kind: "clear-run" }] };
      }

      // approved | edited → click Continue and wait for the next page to load.
      const advancing = withStatus(state, "advancing", `review ${action.decision} — advancing`, action.at, {
        reviewDecision: action.decision,
      });
      const effects: Effect[] =
        state.formFrameId != null
          ? [{ kind: "send-command", tabId: state.tabId, frameId: state.formFrameId, command: "advance", runId: state.runId }]
          : [];
      return { state: advancing, effects };
    }

    // ── Navigation completed (from chrome.webNavigation, top frame) ───────────
    // Only advances the run when we were expecting it (status advancing). A nav
    // in any other status (user clicked around) is ignored so we don't rescan
    // spuriously.
    case "nav-completed": {
      if (state == null || state.tabId !== action.tabId) return noChange(state);
      if (state.status !== "advancing") return noChange(state);
      const nextPage = withStatus(state, "scanning", "next page loaded — rescanning", action.at, {
        pageIndex: state.pageIndex + 1,
        formFrameId: null,
        questions: [],
        answers: {},
        reviewDecision: null,
      });
      return {
        state: nextPage,
        effects: [
          { kind: "send-command", tabId: state.tabId, command: "scan", runId: state.runId },
          { kind: "arm-no-form-timeout", tabId: state.tabId, runId: state.runId },
        ],
      };
    }

    // ── No form found within the scan window ──────────────────────────────────
    // The controller's timeout fired without a scan-result. If we were still
    // scanning, treat the flow as complete (nothing left to fill).
    case "no-form": {
      if (!isForActiveRun(state, action.runId)) return noChange(state);
      if (state.status !== "scanning") return noChange(state);
      const done = withStatus(state, "done", "no form frame responded — flow complete", action.at);
      return { state: done, effects: [{ kind: "clear-run" }] };
    }

    // ── Error ─────────────────────────────────────────────────────────────────
    case "run-error": {
      if (!isForActiveRun(state, action.runId)) return noChange(state);
      const errored = withStatus(state, "error", action.reason, action.at, { error: action.reason });
      // Retain the run in storage for debugging; no clear-run.
      return { state: errored, effects: [] };
    }

    default: {
      // Exhaustiveness guard: a new Action member without a case fails tsc here.
      const _never: never = action;
      return noChange(state as RunState | null);
    }
  }
}
