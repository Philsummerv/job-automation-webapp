// Typed message protocol for the extension. Every cross-context message is a
// member of a discriminated union keyed on `type`, replacing the POC's ad-hoc
// `{ type: "hello" }`. Three transports carry these messages:
//
//   • content script ⇄ service worker : chrome.runtime.sendMessage / onMessage
//                                        (content→worker) and tabs.sendMessage
//                                        (worker→a specific frame)
//   • web page       → service worker : chrome.runtime.sendMessage(extId, …)
//                                        via externally_connectable (auth handoff)
//
// This file is transport-agnostic — it only describes wire shapes plus typed
// send helpers. Run-state shapes and the reducer live in src/state; this file
// borrows only the small ContentCommand / ReviewDecision unions from there.
// Wire messages carry NO timestamps — the controller stamps `at` when it turns
// a message into a reducer Action, so the clock stays out of the protocol.

import type { FormField } from "@applyassistui/automation/types";
import type { ContentCommand, ReviewDecision } from "./state/types";

// ── Shared value shapes ───────────────────────────────────────────────────────

/** Where a content script instance is running. */
export interface FrameInfo {
  url: string;
  isTopFrame: boolean;
  /** The frame actually contains a form/fieldset (Indeed iframes the flow). */
  hasForm: boolean;
}

/** Supabase session handed off from a signed-in web tab (M-B3). */
export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds at which `accessToken` expires. */
  expiresAt: number;
}

// ── content script → service worker ───────────────────────────────────────────

/** Content script announced itself on (re)load. Replaces `{type:"hello"}`. */
export interface PageReadyMsg {
  type: "page-ready";
  frame: FrameInfo;
}

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

/** The web-app bridge reports the current sign-in / entitlement status. */
export interface AuthStatusMsg {
  type: "auth-status";
  signedIn: boolean;
  entitled: boolean;
  email: string | null;
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

// ── web page → service worker (externally_connectable) ─────────────────────────

/** Signed-in web tab hands its Supabase session to the extension. */
export interface AuthHandoffMsg {
  type: "auth-handoff";
  auth: AuthPayload;
}

/** Web page probes whether the extension is installed (feature detection). */
export interface PingMsg {
  type: "ping";
}

// ── service worker → content script (via tabs.sendMessage) ─────────────────────

/** A command directed at a specific content-script frame. */
export interface CommandMsg {
  type: "command";
  runId: string;
  command: ContentCommand;
}

// ── Unions ─────────────────────────────────────────────────────────────────────

/** Messages the service worker receives (runtime + external transports). */
export type WorkerBoundMsg =
  | PageReadyMsg
  | StartRunMsg
  | CancelRunMsg
  | ScanResultMsg
  | FillResultMsg
  | ReviewDecisionMsg
  | PauseRunMsg
  | ResumeRunMsg
  | RunErrorMsg
  | AuthStatusMsg
  | AuthHandoffMsg
  | PingMsg;

/** Messages a content script receives from the worker. */
export type ContentBoundMsg = CommandMsg;

/** Every message shape known to the protocol. */
export type ExtMessage = WorkerBoundMsg | ContentBoundMsg;

// ── Request → response typing ──────────────────────────────────────────────────
// A message type maps to the response the worker sends back for it. Keeping this
// map here makes `sendToWorker` fully typed at the call site. Fire-and-forget
// messages resolve to a simple ack.

export interface PageReadyResponse {
  /** True if a run is active for this tab; content script may await commands. */
  runActive: boolean;
  /** Monotonic page-load count for this tab (persisted; survives worker death). */
  loadCount: number;
}

export interface AuthHandoffResponse {
  ok: boolean;
}

export interface PingResponse {
  installed: true;
  version: string;
}

export interface Ack {
  ok: boolean;
}

/** start-run may be refused (e.g. not signed in / not entitled). */
export interface StartRunResponse {
  ok: boolean;
  /** Why the run was refused, when ok is false. */
  reason?: "not-signed-in" | "not-entitled" | "no-tab";
}

export interface ResponseMap {
  "page-ready": PageReadyResponse;
  "start-run": StartRunResponse;
  "cancel-run": Ack;
  "scan-result": Ack;
  "fill-result": Ack;
  "review-decision": Ack;
  "pause-run": Ack;
  "resume-run": Ack;
  "run-error": Ack;
  "auth-status": Ack;
  "auth-handoff": AuthHandoffResponse;
  ping: PingResponse;
}

// ── Typed helpers ────────────────────────────────────────────────────────────────

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
