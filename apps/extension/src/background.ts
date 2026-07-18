// Service worker = the authoritative run controller (M-B2). The run LOGIC lives
// in the pure reducer (src/state/machine.ts); this file is the impure shell that
// drives it:
//
//   1. Rehydrate the active run from chrome.storage.local on EVERY message —
//      MV3 workers are killed after ~30s idle, so we hold no in-memory run
//      state. (Content-script globals are likewise wiped on every Indeed
//      navigation, which is why the run lives here, not there.)
//   2. Turn the message (or a webNavigation / timeout signal) into an Action,
//      run reduce(), persist the next state, and execute the returned effects.
//
// Dispatches are serialized through a promise chain so the read-modify-write
// around storage never interleaves.

import type {
  AuthHandoffMsg,
  AuthHandoffResponse,
  CommandMsg,
  ConfirmLogMsg,
  PageReadyResponse,
  PingResponse,
  WorkerBoundMsg,
} from "./messages";
import { getItem, removeItem, setItem, updateItem } from "./storage";
import type { PendingActivity } from "./storage";
import { reduce } from "./state/machine";
import type { Action, Effect, RunState } from "./state/types";

const VERSION = chrome.runtime.getManifest().version;
const NO_FORM_TIMEOUT_MS = 4000;

chrome.runtime.onInstalled.addListener(() => {
  console.log(`ApplyAssistUI installed (v${VERSION})`);
});

// ── Serialized dispatch ─────────────────────────────────────────────────────────
// Every state transition flows through here. We rehydrate from storage, reduce,
// then persist + run effects. `chain` guarantees one dispatch finishes before
// the next starts (storage has no compare-and-swap).

let chain: Promise<void> = Promise.resolve();
let runSeq = 0;

function dispatch(makeAction: (state: RunState | null) => Action | null): Promise<void> {
  // Each step is wrapped so a failure can't reject `chain` and poison every
  // later dispatch — one bad transition must not wedge the controller.
  chain = chain.then(async () => {
    try {
      const state = await getItem("activeRun");
      const action = makeAction(state);
      if (action == null) return;

      const result = reduce(state, action);

      if (result.state == null) {
        await removeItem("activeRun");
      } else {
        await setItem("activeRun", result.state);
      }
      for (const effect of result.effects) await runEffect(effect);
    } catch (err) {
      console.error("[ApplyAssistUI] dispatch failed", err);
    }
  });
  return chain;
}

async function runEffect(effect: Effect): Promise<void> {
  switch (effect.kind) {
    case "send-command": {
      const msg: CommandMsg = { type: "command", runId: effect.runId, command: effect.command };
      try {
        if (effect.frameId != null) {
          await chrome.tabs.sendMessage(effect.tabId, msg, { frameId: effect.frameId });
        } else {
          // No frameId ⇒ broadcast to all frames (used to find the form frame).
          await chrome.tabs.sendMessage(effect.tabId, msg);
        }
      } catch {
        // No content script in a frame yet, or the tab is gone — non-fatal.
      }
      return;
    }
    case "clear-run":
      await removeItem("activeRun");
      return;
    case "arm-no-form-timeout":
      armNoFormTimeout(effect.tabId, effect.runId);
      return;
    case "confirm-log": {
      // Ask the tab's top frame to show the "log this application?" card.
      const msg: ConfirmLogMsg = { type: "confirm-log", job: effect.job };
      try {
        await chrome.tabs.sendMessage(effect.tabId, msg, { frameId: 0 });
      } catch {
        // Tab gone / no content script — non-fatal.
      }
      return;
    }
  }
}

// ── No-form timeout ──────────────────────────────────────────────────────────────
// If no frame answers a scan within the window, synthesize a no-form action so a
// confirmation/empty page ends the run instead of hanging. (setTimeout dies with
// the worker; acceptable for M-B2 — a late scan-result still resolves the run on
// wake. Hardened later if needed.)

let noFormTimer: ReturnType<typeof setTimeout> | null = null;

function armNoFormTimeout(_tabId: number, forRunId: string): void {
  if (noFormTimer != null) clearTimeout(noFormTimer);
  noFormTimer = setTimeout(() => {
    noFormTimer = null;
    // The reducer ignores this unless the run is still scanning under forRunId.
    dispatch(() => ({ type: "no-form", runId: forRunId, at: Date.now() }));
  }, NO_FORM_TIMEOUT_MS);
}

// ── content script ⇄ worker ────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: WorkerBoundMsg, sender, sendResponse) => {
  switch (msg?.type) {
    case "page-ready":
      handlePageReady(sender.tab?.id).then(sendResponse);
      return true;

    case "ping":
      sendResponse({ installed: true, version: VERSION } satisfies PingResponse);
      return false;

    // Run-control messages → reducer actions. Each stamps `at` and, where the
    // sender identifies the frame, threads sender.frameId through.
    case "start-run": {
      const tabId = sender.tab?.id;
      if (tabId == null) {
        sendResponse({ ok: false, reason: "no-tab" });
        return false;
      }
      // Gate on entitlement cached from the web-app bridge (M-B3).
      (async () => {
        const ent = await getItem("entitlement");
        if (!ent?.signedIn) return sendResponse({ ok: false, reason: "not-signed-in" });
        if (!ent.entitled) return sendResponse({ ok: false, reason: "not-entitled" });
        const id = `run-${tabId}-${Date.now()}-${runSeq++}`;
        await dispatch(() => ({ type: "start-run", tabId, runId: id, at: Date.now() }));
        sendResponse({ ok: true });
      })();
      return true;
    }

    case "auth-status":
      setItem("entitlement", {
        signedIn: msg.signedIn,
        entitled: msg.entitled,
        email: msg.email,
        checkedAt: Date.now(),
      }).then(() => sendResponse({ ok: true }));
      return true;

    case "template-sync":
      setItem("syncedTemplate", msg.template).then(() => sendResponse({ ok: true }));
      return true;

    // The reducer guards each of these on runId + status, so the controller can
    // forward them directly — no stale-run filtering needed here.
    case "cancel-run":
      dispatch(() => ({ type: "cancel-run", at: Date.now() })).then(() => sendResponse({ ok: true }));
      return true;

    case "scan-result": {
      const frameId = sender.frameId ?? 0;
      const questions = msg.questions;
      const job = msg.job;
      dispatch(() => ({ type: "scan-result", runId: msg.runId, frameId, questions, job, at: Date.now() }))
        .then(() => sendResponse({ ok: true }));
      return true;
    }

    case "fill-result":
      dispatch(() => ({ type: "fill-result", runId: msg.runId, at: Date.now() }))
        .then(() => sendResponse({ ok: true }));
      return true;

    case "review-decision":
      dispatch(() => ({ type: "review-decision", runId: msg.runId, decision: msg.decision, at: Date.now() }))
        .then(() => sendResponse({ ok: true }));
      return true;

    case "pause-run":
      dispatch(() => ({ type: "pause-run", runId: msg.runId, at: Date.now() }))
        .then(() => sendResponse({ ok: true }));
      return true;

    case "resume-run":
      dispatch(() => ({ type: "resume-run", runId: msg.runId, at: Date.now() }))
        .then(() => sendResponse({ ok: true }));
      return true;

    case "run-error":
      dispatch(() => ({ type: "run-error", runId: msg.runId, reason: msg.reason, at: Date.now() }))
        .then(() => sendResponse({ ok: true }));
      return true;

    // ── Compliance activity log queue ─────────────────────────────────────────
    case "log-activity": {
      const activity: PendingActivity = {
        id: crypto.randomUUID(),
        employer_name: msg.employer_name,
        job_title: msg.job_title,
        url: msg.url,
        date: todayISO(),
      };
      updateItem("pendingActivities", (q) => [...q, activity]).then(() => sendResponse({ ok: true }));
      return true;
    }

    case "pending-activities":
      getItem("pendingActivities").then((activities) => sendResponse({ activities }));
      return true;

    case "activities-flushed":
      updateItem("pendingActivities", (q) => q.filter((a) => !msg.ids.includes(a.id)))
        .then(() => sendResponse({ ok: true }));
      return true;

    default:
      return false;
  }
});

/** Local calendar date as YYYY-MM-DD (the activity's date). */
function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

async function handlePageReady(tabId: number | undefined): Promise<PageReadyResponse> {
  let loadCount = 0;
  if (tabId != null) {
    const counts = await updateItem("loadCounts", (c) => ({ ...c, [tabId]: (c[tabId] ?? 0) + 1 }));
    loadCount = counts[tabId];
  }
  const run = await getItem("activeRun");
  return { runActive: run != null && run.tabId === tabId, loadCount };
}

// Clean up per-tab state when a tab closes.
chrome.tabs.onRemoved.addListener((tabId) => {
  updateItem("loadCounts", (c) => {
    if (!(tabId in c)) return c;
    const next = { ...c };
    delete next[tabId];
    return next;
  });
  // End the active run only if the closed tab owned it (serialized via dispatch).
  dispatch((state) => (state != null && state.tabId === tabId ? { type: "cancel-run", at: Date.now() } : null));
});

// ── Navigation → nav-completed ────────────────────────────────────────────────
// A completed top-frame navigation (or SPA history update) is how we learn the
// next page has loaded after clicking Continue. The reducer only acts on it when
// status is "advancing", so unrelated navigations are ignored.

function onNav(details: { tabId: number; frameId: number }): void {
  if (details.frameId !== 0) return; // top frame only
  dispatch(() => ({ type: "nav-completed", tabId: details.tabId, at: Date.now() }));
}

chrome.webNavigation.onCompleted.addListener(onNav);
chrome.webNavigation.onHistoryStateUpdated.addListener(onNav);

// ── web page → worker (externally_connectable, M-B3 auth handoff) ───────────────

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
