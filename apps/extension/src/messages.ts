// Typed message protocol for the extension. Every cross-context message is a
// member of a discriminated union keyed on `type`, replacing the POC's ad-hoc
// `{ type: "hello" }`. Three transports carry these messages:
//
//   • content script ⇄ service worker : chrome.runtime.sendMessage / onMessage
//   • web page       → service worker : chrome.runtime.sendMessage(extId, …)
//                                        via externally_connectable (auth handoff)
//
// This file is transport-agnostic — it only describes shapes plus a tiny typed
// send/response helper. Run-state shapes (RunState, effects, …) live in
// src/state (M-B2), NOT here; keep this to the wire protocol.

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

/** A command the worker can hand back to a content script (M-B2 fills these in). */
export type Command = "idle" | "scan" | "fill" | "advance";

// ── content script → service worker ───────────────────────────────────────────

/** Content script announced itself on (re)load. Replaces `{type:"hello"}`. */
export interface PageReadyMsg {
  type: "page-ready";
  frame: FrameInfo;
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

// ── Unions ─────────────────────────────────────────────────────────────────────

/** Messages the service worker receives. */
export type WorkerBoundMsg = PageReadyMsg | AuthHandoffMsg | PingMsg;

/** Every message shape known to the protocol. */
export type ExtMessage = WorkerBoundMsg;

// ── Request → response typing ──────────────────────────────────────────────────
// A message type maps to the response the worker sends back for it. Keeping this
// map here makes `sendToWorker` fully typed at the call site.

export interface PageReadyResponse {
  /** True if a run is active for this tab; content script may await commands. */
  runActive: boolean;
  /** Next command for this frame, or "idle" when nothing to do yet. */
  command: Command;
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

export interface ResponseMap {
  "page-ready": PageReadyResponse;
  "auth-handoff": AuthHandoffResponse;
  ping: PingResponse;
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
