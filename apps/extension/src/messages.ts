// Typed message protocol for the extension. Every cross-context message is a
// member of a discriminated union keyed on `type`. Two transports carry these:
//
//   • content script ⇄ service worker : chrome.runtime.sendMessage / onMessage
//                                        (content→worker) and tabs.sendMessage
//                                        (worker→a specific frame)
//   • web-app bridge → service worker  : plain runtime messages from the bridge
//                                        content script running on the web origin
//
// Wire messages carry NO timestamps — the controller stamps `at` when it turns a
// message into a reducer Action, so the clock stays out of the protocol.

import type { FormField } from "@applyassistui/automation/types";
import type { ContentCommand, JobMeta, ReviewDecision } from "./state/types";
import type { AnswerTemplate, PendingActivity } from "./storage";

// ── content script → service worker ───────────────────────────────────────────

/** User asked to start a guided run on the sender's tab. */
export interface StartRunMsg {
  type: "start-run";
}

/** User cancelled the active run. */
export interface CancelRunMsg {
  type: "cancel-run";
}

/** A form frame reports the questions it scanned. frameId comes from `sender`. */
export interface ScanResultMsg {
  type: "scan-result";
  runId: string;
  questions: FormField[];
  /** Job identity extracted from this page (null if none found). */
  job: JobMeta | null;
}

/** A form frame reports that its fill pass completed. */
export interface FillResultMsg {
  type: "fill-result";
  runId: string;
}

/** The review gate reports the user's verdict for the current page. */
export interface ReviewDecisionMsg {
  type: "review-decision";
  runId: string;
  decision: ReviewDecision;
}

/** User paused the assist to take manual control. */
export interface PauseRunMsg {
  type: "pause-run";
  runId: string;
}

/** User resumed the assist after manual editing. */
export interface ResumeRunMsg {
  type: "resume-run";
  runId: string;
}

/** A content-side failure the controller should record on the run. */
export interface RunErrorMsg {
  type: "run-error";
  runId: string;
  reason: string;
}

/** User confirmed logging a completed guided application → queue it. */
export interface LogActivityMsg {
  type: "log-activity";
  employer_name: string;
  job_title: string | null;
  url: string | null;
}

/** The web-app bridge asks for the pending activity queue to flush. */
export interface PendingActivitiesMsg {
  type: "pending-activities";
}

/** The web-app bridge reports which pending activities it successfully flushed. */
export interface ActivitiesFlushedMsg {
  type: "activities-flushed";
  ids: string[];
}

/** The web-app bridge reports the current sign-in / entitlement status. */
export interface AuthStatusMsg {
  type: "auth-status";
  signedIn: boolean;
  entitled: boolean;
  email: string | null;
}

/** The web-app bridge relays the user's saved template (null when none/signed out). */
export interface TemplateSyncMsg {
  type: "template-sync";
  template: AnswerTemplate | null;
}

// ── service worker → content script (via tabs.sendMessage) ─────────────────────

/** Flow completed — ask the content script to confirm logging the application. */
export interface ConfirmLogMsg {
  type: "confirm-log";
  job: JobMeta;
}

/** A command directed at a specific content-script frame. */
export interface CommandMsg {
  type: "command";
  runId: string;
  command: ContentCommand;
}

// ── Unions ─────────────────────────────────────────────────────────────────────

/** Messages the service worker receives. */
export type WorkerBoundMsg =
  | StartRunMsg
  | CancelRunMsg
  | ScanResultMsg
  | FillResultMsg
  | ReviewDecisionMsg
  | PauseRunMsg
  | ResumeRunMsg
  | RunErrorMsg
  | LogActivityMsg
  | PendingActivitiesMsg
  | ActivitiesFlushedMsg
  | AuthStatusMsg
  | TemplateSyncMsg;

/** Messages a content script receives from the worker. */
export type ContentBoundMsg = CommandMsg | ConfirmLogMsg;

/** Every message shape known to the protocol. */
export type ExtMessage = WorkerBoundMsg | ContentBoundMsg;

// ── Request → response typing ──────────────────────────────────────────────────
// A message type maps to the response the worker sends back for it, so
// `sendToWorker` is fully typed at the call site. Fire-and-forget messages
// resolve to a simple ack.

export interface Ack {
  ok: boolean;
}

/** start-run may be refused (e.g. not signed in / not entitled). */
export interface StartRunResponse {
  ok: boolean;
  /** Why the run was refused, when ok is false. */
  reason?: "not-signed-in" | "not-entitled" | "no-tab";
}

export interface PendingActivitiesResponse {
  activities: PendingActivity[];
}

export interface ResponseMap {
  "start-run": StartRunResponse;
  "cancel-run": Ack;
  "scan-result": Ack;
  "fill-result": Ack;
  "review-decision": Ack;
  "pause-run": Ack;
  "resume-run": Ack;
  "run-error": Ack;
  "log-activity": Ack;
  "pending-activities": PendingActivitiesResponse;
  "activities-flushed": Ack;
  "auth-status": Ack;
  "template-sync": Ack;
}

// ── Typed helper ────────────────────────────────────────────────────────────────

/**
 * Send a message to the service worker and get a typed response back. The
 * response type is inferred from the message's `type` via ResponseMap, so
 * callers never hand-annotate the callback shape.
 */
export function sendToWorker<M extends WorkerBoundMsg>(
  msg: M,
): Promise<ResponseMap[M["type"]]> {
  return chrome.runtime.sendMessage(msg) as Promise<ResponseMap[M["type"]]>;
}
