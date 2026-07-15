// Service worker. Still deliberately thin at M-B1 — the authoritative run
// controller (state machine, effects, rehydration) arrives in M-B2. What M-B1
// establishes is the durable plumbing every later milestone depends on:
//   • the typed message protocol (src/messages.ts) instead of {type:"hello"}
//   • run state in chrome.storage.LOCAL (survives worker death), not .session
//
// MV3 workers are killed after ~30s idle, so this file holds NO in-memory state:
// every handler reads/writes chrome.storage.local via src/storage.

import type {
  AuthHandoffMsg,
  AuthHandoffResponse,
  PageReadyMsg,
  PageReadyResponse,
  PingResponse,
  WorkerBoundMsg,
} from "./messages";
import { setItem, updateItem } from "./storage";

const VERSION = chrome.runtime.getManifest().version;

chrome.runtime.onInstalled.addListener(() => {
  console.log(`ApplyAssistUI installed (v${VERSION})`);
});

// ── content script ⇄ worker ────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: WorkerBoundMsg, sender, sendResponse) => {
  switch (msg?.type) {
    case "page-ready":
      handlePageReady(msg, sender.tab?.id).then(sendResponse);
      return true; // async response

    case "ping":
      sendResponse({ installed: true, version: VERSION } satisfies PingResponse);
      return false;

    default:
      return false;
  }
});

async function handlePageReady(
  _msg: PageReadyMsg,
  tabId: number | undefined,
): Promise<PageReadyResponse> {
  let loadCount = 0;
  if (tabId != null) {
    const counts = await updateItem("loadCounts", (c) => ({
      ...c,
      [tabId]: (c[tabId] ?? 0) + 1,
    }));
    loadCount = counts[tabId];
  }
  // No run controller yet (M-B2): report idle so content scripts don't wait.
  return { runActive: false, command: "idle", loadCount };
}

// Clean up the per-tab load counter when a tab closes so it can't leak.
chrome.tabs.onRemoved.addListener((tabId) => {
  updateItem("loadCounts", (c) => {
    if (!(tabId in c)) return c;
    const next = { ...c };
    delete next[tabId];
    return next;
  });
});

// ── web page → worker (externally_connectable, M-B3 auth handoff) ───────────────
// Wired now so the transport is proven at M-B1; the entitlement check that
// consumes the stored session lands in M-B3.

chrome.runtime.onMessageExternal.addListener(
  (msg: AuthHandoffMsg | { type: "ping" }, _sender, sendResponse) => {
    switch (msg?.type) {
      case "auth-handoff":
        setItem("auth", msg.auth)
          .then(() => sendResponse({ ok: true } satisfies AuthHandoffResponse))
          .catch(() => sendResponse({ ok: false } satisfies AuthHandoffResponse));
        return true;

      case "ping":
        sendResponse({ installed: true, version: VERSION } satisfies PingResponse);
        return false;

      default:
        return false;
    }
  },
);
